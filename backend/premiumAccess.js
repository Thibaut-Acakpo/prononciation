/**
 * Détermine si un utilisateur a un accès "effectif" Premium — centralisé ici
 * pour que TOUTES les routes qui gatent une fonctionnalité Premium (analyse
 * illimitée, styles d'avatar exclusifs, listes de mots, rapport avancé...)
 * appliquent exactement la même règle.
 *
 * Règle normale : Premium si `user.is_premium`, ou automatiquement si admin.
 *
 * Mode "aperçu" (admin uniquement) : un administrateur peut prévisualiser
 * l'app comme un utilisateur standard ou Premium (voir le sélecteur dans
 * ProfileScreen côté frontend), via l'en-tête `X-Preview-As: standard|premium`
 * envoyé automatiquement par le frontend tant que ce mode est actif. Cet
 * en-tête n'a AUCUN effet pour un compte non-admin — un utilisateur normal
 * ne peut donc jamais s'en servir pour obtenir un accès Premium gratuit.
 */
function resolveEffectivePremium(user, req) {
  if (!user) return false;

  if (user.role === "admin") {
    const preview = req?.headers?.["x-preview-as"];
    if (preview === "standard") return false;
    return true; // "premium", en-tête absent, ou valeur inconnue → accès admin normal
  }

  return Boolean(user.is_premium);
}

module.exports = { resolveEffectivePremium };
