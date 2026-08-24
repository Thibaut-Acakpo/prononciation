import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // "prompt" : on gère nous-mêmes le bandeau d'installation (comme la
      // capture d'écran de référence), plutôt que de laisser le comportement
      // par défaut du navigateur.
      registerType: "prompt",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "PrononciA+",
        short_name: "PrononciA+",
        description:
          "Corrige ta prononciation anglaise en temps réel : pointe un objet, prononce son nom, reçois un feedback immédiat.",
        theme_color: "#2563eb",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        scope: "/",
        lang: "fr",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Cache les fichiers de build (JS/CSS/HTML/icônes) pour un chargement
        // hors-ligne de la coquille de l'app. Les appels /api/* NE SONT PAS
        // mis en cache par défaut ici : une analyse de prononciation ou une
        // connexion doit toujours passer par le réseau, sauf configuration
        // explicite plus tard pour un vrai mode hors-ligne (voir README).
        globPatterns: ["**/*.{js,css,html,png,svg,ico,mp3}"],
        navigateFallback: "/index.html",
        // Le chunk TensorFlow.js (mode caméra, chargé à la demande via
        // React.lazy) dépasse la limite par défaut de 2 Mo. On l'autorise
        // explicitement à être précaché pour que le mode caméra reste
        // utilisable hors-ligne après une première visite.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            // Photos des 80 objets (frontend/public/images/objects/, ~11 Mo
            // au total) : on ne les précharge PAS toutes au premier
            // chargement de la page (ça alourdirait inutilement la première
            // visite) — chacune est mise en cache la première fois qu'elle
            // est réellement affichée, puis reste disponible hors-ligne.
            urlPattern: ({ url }) => url.pathname.startsWith("/images/objects/"),
            handler: "CacheFirst",
            options: {
              cacheName: "object-images-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Avatars générés par DiceBear (voir AvatarPicker.jsx) : une
            // fois qu'un avatar a été affiché une première fois (avec
            // connexion), il reste disponible hors-ligne indéfiniment — le
            // SVG généré pour un couple (style, graine) donné ne change
            // jamais. Ça ne rend pas le mode hors-ligne "sans contrainte"
            // pour un avatar jamais vu avant (impossible sans connexion, il
            // faut bien le générer une fois quelque part) — c'est pour ça que
            // l'app propose aussi des avatars 100% locaux (voir
            // OfflineAvatar.jsx), générés sans aucun appel réseau.
            urlPattern: ({ url }) => url.hostname === "api.dicebear.com",
            handler: "CacheFirst",
            options: {
              cacheName: "avatar-cache",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Poids des modèles TensorFlow.js (détection d'objet + main),
            // hébergés sur le CDN de Google. C'est LA SEULE dépendance
            // réseau qui subsiste dans toute l'application, et uniquement
            // au tout premier usage du mode caméra : impossible à éviter
            // techniquement pour un modèle IA pré-entraîné (il faut bien le
            // télécharger une fois depuis quelque part). CacheFirst : une
            // fois téléchargés, les poids ne changent plus jamais pour une
            // version de modèle donnée, donc on les sert depuis le cache
            // indéfiniment ensuite — le mode caméra devient alors 100%
            // hors-ligne, comme tout le reste de l'application.
            urlPattern: ({ url }) =>
              url.hostname === "storage.googleapis.com" || url.hostname === "tfhub.dev",
            handler: "CacheFirst",
            options: {
              cacheName: "tfjs-models-cache",
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: true, // permet de tester le service worker en `npm run dev`
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:4000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
  esbuild: {
    charset: "utf8",
  },
});
