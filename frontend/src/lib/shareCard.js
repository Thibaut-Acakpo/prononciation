/**
 * Génère une image "carte de résultat" (canvas HTML, 100% local, aucun appel
 * réseau ni service tiers) pour la partager sur les réseaux sociaux — bon
 * levier de croissance gratuite pour l'app.
 *
 * Utilise l'API Web Share si le navigateur/l'appareil la supporte (partage
 * natif vers Instagram/WhatsApp/etc.), sinon propose un téléchargement
 * simple de l'image.
 */
export async function shareResultCard({ word, per, verdict, appName = "PrononciA+" }) {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 800;
  const ctx = canvas.getContext("2d");

  // Fond dégradé
  const gradient = ctx.createLinearGradient(0, 0, 800, 800);
  gradient.addColorStop(0, "#1e3a8a");
  gradient.addColorStop(1, "#0f172a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 800, 800);

  // Logo/nom de l'app
  ctx.fillStyle = "#60a5fa";
  ctx.font = "bold 36px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(appName, 400, 100);

  // Mot travaillé
  ctx.fillStyle = "#94a3b8";
  ctx.font = "24px sans-serif";
  ctx.fillText("J'ai travaillé la prononciation de :", 400, 260);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 64px sans-serif";
  ctx.fillText(word, 400, 340);

  // Score
  const perColor = per <= 20 ? "#4ade80" : per <= 50 ? "#fbbf24" : "#f87171";
  ctx.fillStyle = perColor;
  ctx.font = "bold 96px sans-serif";
  ctx.fillText(`${Math.round(100 - per)}%`, 400, 500);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "22px sans-serif";
  ctx.fillText("de réussite", 400, 540);

  // Verdict
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "bold 32px sans-serif";
  ctx.fillText(verdict, 400, 640);

  // Cadre décoratif
  ctx.strokeStyle = "rgba(96, 165, 250, 0.3)";
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, 760, 760);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const file = new File([blob], `prononciation-${word}.png`, { type: "image/png" });

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: `Ma prononciation de "${word}"`,
        text: `J'ai obtenu ${Math.round(100 - per)}% sur "${word}" avec ${appName} !`,
      });
      return "shared";
    } catch (err) {
      if (err.name === "AbortError") return "cancelled"; // l'utilisateur a fermé la fenêtre de partage
      // sinon, on tente le repli téléchargement ci-dessous
    }
  }

  // Repli : téléchargement direct de l'image (navigateur desktop, ou Web
  // Share API absente/refusée).
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `prononciation-${word}.png`;
  a.click();
  URL.revokeObjectURL(url);
  return "downloaded";
}
