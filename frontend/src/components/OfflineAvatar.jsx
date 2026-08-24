import { useMemo } from "react";

// Palette de fonds — choisie pour bien faire ressortir le personnage blanc
// par-dessus, dans les deux thèmes clair/sombre.
const BACKGROUNDS = [
  ["#2563eb", "#22d3ee"], ["#7c3aed", "#ec4899"], ["#059669", "#84cc16"],
  ["#ea580c", "#facc15"], ["#dc2626", "#f97316"], ["#0891b2", "#22d3ee"],
  ["#4338ca", "#a855f7"], ["#16a34a", "#22d3ee"], ["#be185d", "#f472b6"],
];

// Quelques variantes de coiffure (juste la silhouette du haut de la tête),
// pour varier un peu l'allure des personnages sans complexifier le rendu.
const HAIR_VARIANTS = [
  null, // pas de cheveux dessinés (tête nue/chauve)
  (cx, topY, r) => `<path d="M ${cx - r} ${topY + r * 0.35} A ${r} ${r} 0 0 1 ${cx + r} ${topY + r * 0.35} L ${cx + r} ${topY} A ${r} ${r} 0 0 0 ${cx - r} ${topY} Z" fill="white" fill-opacity="0.9"/>`,
  (cx, topY, r) => `<rect x="${cx - r}" y="${topY}" width="${r * 2}" height="${r * 0.6}" rx="${r * 0.3}" fill="white" fill-opacity="0.9"/>`,
];

function hashSeed(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/**
 * Génère un avatar en forme de VRAI personnage (tête + épaules/buste),
 * façon icône/sticker de profil — dessiné localement en SVG à partir d'une
 * graine, sans AUCUNE image ni police externe, donc utilisable à 100%
 * hors-ligne dès la première fois (contrairement aux avatars DiceBear, qui
 * doivent être générés en ligne au moins une fois avant d'être mis en cache
 * — voir AvatarPicker.jsx).
 */
export function offlineAvatarDataUrl(seed, size = 128) {
  const hash = hashSeed(seed);
  const [c1, c2] = BACKGROUNDS[hash % BACKGROUNDS.length];
  const hairVariant = HAIR_VARIANTS[Math.floor(hash / 7) % HAIR_VARIANTS.length];

  const cx = size / 2;
  const headR = size * 0.19;
  const headCy = size * 0.38;
  const bodyR = size * 0.34; // rayon du "cercle" d'épaules, dont le haut est masqué par la tête

  const uid = `g${hash}`; // id unique pour éviter les collisions si plusieurs avatars sont affichés sur la même page

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <linearGradient id="${uid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
      <clipPath id="clip-${uid}"><circle cx="${cx}" cy="${cx}" r="${cx}"/></clipPath>
    </defs>
    <rect width="${size}" height="${size}" fill="url(#${uid})"/>
    <g clip-path="url(#clip-${uid})">
      <!-- Épaules / buste -->
      <circle cx="${cx}" cy="${size * 1.05}" r="${bodyR * 1.7}" fill="white" fill-opacity="0.92"/>
      <!-- Tête -->
      <circle cx="${cx}" cy="${headCy}" r="${headR}" fill="white" fill-opacity="0.92"/>
      ${hairVariant ? hairVariant(cx, headCy - headR, headR) : ""}
    </g>
  </svg>`;

  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

/**
 * Avatar-personnage généré localement, sans AUCUN appel réseau —
 * contrairement aux styles DiceBear (voir AvatarPicker.jsx) qui nécessitent
 * une connexion au moins la première fois. Utilisable "sans contrainte"
 * hors-ligne, comme demandé : le rendu est 100% déterministe à partir de la
 * graine fournie (même graine → toujours le même personnage).
 */
export default function OfflineAvatar({ seed, size = 64, className = "" }) {
  const dataUrl = useMemo(() => offlineAvatarDataUrl(seed, size), [seed, size]);
  return <img src={dataUrl} alt="" className={className} width={size} height={size} />;
}
