/**
 * Calcul des badges côté client, à partir de l'historique déjà chargé.
 * Volontairement simple et transparent (pas de logique cachée côté serveur)
 * pour l'instant — si la gamification devient un axe fort du produit, ce
 * calcul devra migrer côté backend pour éviter qu'un utilisateur ne
 * "débloque" un badge en falsifiant les données côté client.
 */

function countDistinctDays(history) {
  const days = new Set(history.map((h) => h.created_at.slice(0, 10)));
  return days.size;
}

function longestDayStreak(history) {
  const days = [...new Set(history.map((h) => h.created_at.slice(0, 10)))].sort();
  if (days.length === 0) return 0;

  let longest = 1;
  let current = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1] + "T00:00:00Z");
    const curr = new Date(days[i] + "T00:00:00Z");
    const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
    current = diffDays === 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

export function getCurrentStreak(history) {
  if (!history || history.length === 0) return 0;

  const days = new Set(history.map((h) => h.created_at.slice(0, 10)));
  const todayStr = new Date().toISOString().slice(0, 10);
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  // Le streak actuel n'est "vivant" que si l'utilisateur s'est entraîné
  // aujourd'hui OU hier (sinon la chaîne est déjà rompue, même si l'historique
  // contient une longue série passée).
  let cursor;
  if (days.has(todayStr)) cursor = new Date(todayStr + "T00:00:00Z");
  else if (days.has(yesterdayStr)) cursor = new Date(yesterdayStr + "T00:00:00Z");
  else return 0;

  let streak = 0;
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export function computeBadges(history) {
  if (!history || history.length === 0) return [];

  const attempts = history.length;
  const excellentCount = history.filter((h) => Number(h.per) <= 10).length;
  const streak = longestDayStreak(history);
  const distinctWords = new Set(history.map((h) => h.expected_word)).size;

  const badges = [];

  if (attempts >= 1) badges.push({ id: "first-attempt", label: "🎤 Première tentative", earned: true });
  if (attempts >= 10) badges.push({ id: "ten-attempts", label: "🔟 10 tentatives", earned: true });
  if (attempts >= 50) badges.push({ id: "fifty-attempts", label: "💯 50 tentatives", earned: true });
  if (excellentCount >= 5) badges.push({ id: "five-excellent", label: "⭐ 5 prononciations excellentes", earned: true });
  if (streak >= 3) badges.push({ id: "streak-3", label: "🔥 3 jours d'affilée", earned: true });
  if (streak >= 7) badges.push({ id: "streak-7", label: "🔥🔥 7 jours d'affilée", earned: true });
  if (distinctWords >= 10) badges.push({ id: "ten-words", label: "📚 10 mots différents essayés", earned: true });
  if (distinctWords >= 40) badges.push({ id: "forty-words", label: "🏆 40 mots différents essayés", earned: true });

  return badges;
}
