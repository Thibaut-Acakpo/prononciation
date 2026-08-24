/**
 * Détecte, à partir de l'historique des alignements phonémiques d'un
 * utilisateur (voir compute_phoneme_alignment côté Python), le problème de
 * prononciation le plus fréquent — pas juste un score global, un vrai point
 * concret à travailler ("tu remplaces souvent le son 'r' par 'w'").
 */
function analyzeWeakPoints(alignmentsHistory) {
  const substitutionCounts = new Map(); // "ref->ext" -> count
  const deletionCounts = new Map(); // "ref" -> count
  let totalOps = 0;

  for (const alignment of alignmentsHistory) {
    if (!Array.isArray(alignment)) continue;
    for (const op of alignment) {
      totalOps++;
      if (op.type === "substitution") {
        const key = `${op.ref}->${op.ext}`;
        substitutionCounts.set(key, (substitutionCounts.get(key) || 0) + 1);
      } else if (op.type === "deletion") {
        deletionCounts.set(op.ref, (deletionCounts.get(op.ref) || 0) + 1);
      }
    }
  }

  if (totalOps === 0) return null;

  const topSubstitution = [...substitutionCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const topDeletion = [...deletionCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  // On ne remonte un point faible que s'il apparaît assez souvent pour être
  // un vrai schéma récurrent, pas un simple accident isolé sur 1-2 essais.
  const MIN_OCCURRENCES = 3;

  const insights = [];

  if (topSubstitution && topSubstitution[1] >= MIN_OCCURRENCES) {
    const [ref, ext] = topSubstitution[0].split("->");
    insights.push({
      type: "substitution",
      ref,
      ext,
      count: topSubstitution[1],
      message: `Tu remplaces souvent le son "${ref}" par "${ext}" — essaie de bien insister sur ce son précis.`,
    });
  }

  if (topDeletion && topDeletion[1] >= MIN_OCCURRENCES) {
    insights.push({
      type: "deletion",
      ref: topDeletion[0],
      count: topDeletion[1],
      message: `Le son "${topDeletion[0]}" est souvent oublié en fin ou milieu de mot — pense à bien le prononcer jusqu'au bout.`,
    });
  }

  return insights.length > 0 ? insights : null;
}

/**
 * Version étendue de analyzeWeakPoints(), réservée au rapport de progression
 * avancé Premium : au lieu du seul point faible n°1, remonte le top 5 des
 * substitutions et le top 5 des sons oubliés, pour une vue d'ensemble plus
 * complète des schémas d'erreur récurrents.
 */
function analyzeWeakPointsDetailed(alignmentsHistory, topN = 5) {
  const substitutionCounts = new Map();
  const deletionCounts = new Map();
  let totalOps = 0;

  for (const alignment of alignmentsHistory) {
    if (!Array.isArray(alignment)) continue;
    for (const op of alignment) {
      totalOps++;
      if (op.type === "substitution") {
        const key = `${op.ref}->${op.ext}`;
        substitutionCounts.set(key, (substitutionCounts.get(key) || 0) + 1);
      } else if (op.type === "deletion") {
        deletionCounts.set(op.ref, (deletionCounts.get(op.ref) || 0) + 1);
      }
    }
  }

  if (totalOps === 0) return { substitutions: [], deletions: [] };

  const substitutions = [...substitutionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([key, count]) => {
      const [ref, ext] = key.split("->");
      return { ref, ext, count };
    });

  const deletions = [...deletionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([ref, count]) => ({ ref, count }));

  return { substitutions, deletions };
}

module.exports = { analyzeWeakPoints, analyzeWeakPointsDetailed };
