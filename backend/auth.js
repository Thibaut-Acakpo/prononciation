/**
 * Authentification par JWT.
 *
 * IMPORTANT : JWT_SECRET doit venir d'une variable d'environnement en production
 * (fichier .env, jamais committé). La valeur par défaut ci-dessous ne sert
 * qu'au développement local et affiche un avertissement si elle est utilisée.
 */

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = "30d";

if (!JWT_SECRET) {
  console.warn(
    "[Auth] ⚠️  JWT_SECRET n'est pas défini dans l'environnement. " +
    "Génère une valeur aléatoire et mets-la dans backend/.env avant tout déploiement réel : " +
    'exemple → node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  );
}

const EFFECTIVE_SECRET = JWT_SECRET || "dev-only-insecure-secret-do-not-ship";

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, EFFECTIVE_SECRET, { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
  return jwt.verify(token, EFFECTIVE_SECRET);
}

// Middleware Express : exige un Authorization: Bearer <token> valide.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Authentification requise." });
  }

  try {
    const payload = verifyToken(token);
    req.userId = payload.sub;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session invalide ou expirée. Reconnecte-toi." });
  }
}

// Middleware Express : exige que l'utilisateur connecté soit administrateur.
// À chaîner APRÈS requireAuth (a besoin de req.userId déjà défini).
//
// Choix volontaire : on revérifie le rôle directement en base à chaque
// requête sensible, plutôt que de faire confiance à un rôle stocké dans le
// JWT (valable 30 jours) — si un admin est un jour rétrogradé, l'effet est
// immédiat, pas seulement à la prochaine connexion.
function requireAdmin(req, res, next) {
  const { getUserById } = require("./db"); // import différé : évite une dépendance circulaire au chargement du module
  getUserById(req.userId)
    .then((user) => {
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "Accès réservé aux administrateurs." });
      }
      // Attaché pour éviter à chaque route admin de refaire le même appel
      // BDD juste pour connaître l'identité du demandeur (utile notamment
      // pour distinguer le super-administrateur des admins classiques —
      // voir routes/admin.routes.js).
      req.adminUser = user;
      next();
    })
    .catch(() => res.status(500).json({ error: "Erreur serveur." }));
}

module.exports = { signToken, verifyToken, requireAuth, requireAdmin };
