const express = require("express");
const { requireAuth, requireAdmin } = require("../auth");
const {
  getAllUsersForAdmin, getUserDetailForAdmin, adminUpdateUser,
  getGlobalStats, deleteUser, getUserById, getInstallStats,
  getAdminTimeSeries, getPremiumPayments, adminSetPremium,
} = require("../db");

const router = express.Router();

// ── Hiérarchie entre administrateurs ────────────────────────────────────────
// Un seul "super-administrateur" (identifié par email, configurable via
// l'environnement) a autorité sur les AUTRES comptes admin. Un admin
// classique garde toutes ses capacités normales sur les comptes
// utilisateurs standards (promouvoir, Premium manuel, suppression...), mais
// PAS sur un autre compte admin ni sur lui-même pour les actions les plus
// sensibles (changer un rôle, supprimer un admin) — ça évite qu'un admin
// puisse retirer les droits d'un autre admin, ou pire, du super-admin.
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || "acakpothibaut2@gmail.com").toLowerCase();

function isSuperAdmin(user) {
  return Boolean(user?.email && user.email.toLowerCase() === SUPER_ADMIN_EMAIL);
}

// Toutes les routes ci-dessous exigent d'être connecté ET administrateur.
router.use(requireAuth, requireAdmin);

router.get("/stats", async (req, res) => {
  try {
    const [stats, installStats] = await Promise.all([getGlobalStats(), getInstallStats()]);
    res.json({ stats: { ...stats, installs: installStats } });
  } catch (err) {
    console.error("[Admin] Erreur stats globales :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.get("/stats/timeseries", async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 14, 90);
    const series = await getAdminTimeSeries(days);
    res.json({ series });
  } catch (err) {
    console.error("[Admin] Erreur série temporelle :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.get("/payments", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const payments = await getPremiumPayments({ limit });
    res.json({ payments });
  } catch (err) {
    console.error("[Admin] Erreur liste paiements :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.get("/users", async (req, res) => {
  try {
    const search = (req.query.search || "").toString();
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 300);
    const users = await getAllUsersForAdmin({ search, limit });
    res.json({ users });
  } catch (err) {
    console.error("[Admin] Erreur liste utilisateurs :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.get("/users/:id", async (req, res) => {
  try {
    const detail = await getUserDetailForAdmin(req.params.id);
    if (!detail) return res.status(404).json({ error: "Utilisateur introuvable." });
    res.json(detail);
  } catch (err) {
    console.error("[Admin] Erreur détail utilisateur :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.patch("/users/:id", async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const { displayName, role } = req.body || {};
    const requester = req.adminUser;

    if (role !== undefined && !["user", "admin"].includes(role)) {
      return res.status(400).json({ error: "Rôle invalide." });
    }

    const target = await getUserById(targetId);
    if (!target) return res.status(404).json({ error: "Utilisateur introuvable." });

    // Le rôle (promouvoir/rétrograder) est une action sensible réservée au
    // super-administrateur, quel que soit le compte concerné — un admin
    // classique ne peut jamais accorder ni retirer des droits admin, y
    // compris les siens.
    if (role !== undefined && !isSuperAdmin(requester)) {
      return res.status(403).json({ error: "Seul le super-administrateur peut modifier les droits administrateur." });
    }
    if (role !== undefined && target.email.toLowerCase() === SUPER_ADMIN_EMAIL) {
      return res.status(403).json({ error: "Le rôle du super-administrateur ne peut pas être modifié." });
    }
    // Sécurité : un administrateur ne peut pas se retirer lui-même ses
    // propres droits — ça éviterait qu'un compte se retrouve accidentellement
    // sans aucun administrateur restant pour corriger la situation.
    if (role === "user" && targetId === req.userId) {
      return res.status(400).json({ error: "Tu ne peux pas retirer tes propres droits administrateur." });
    }

    // Modifier le PROFIL (nom affiché) d'un autre administrateur est
    // également réservé au super-administrateur — un admin classique ne
    // gère que son propre profil et ceux des utilisateurs standards.
    if (displayName !== undefined && target.role === "admin" && targetId !== req.userId && !isSuperAdmin(requester)) {
      return res.status(403).json({ error: "Tu ne peux pas modifier le profil d'un autre administrateur." });
    }

    const user = await adminUpdateUser(targetId, { displayName, role });
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });
    res.json({ user });
  } catch (err) {
    console.error("[Admin] Erreur modification utilisateur :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.post("/users/:id/premium", async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const { isPremium } = req.body || {};
    const requester = req.adminUser;
    if (typeof isPremium !== "boolean") {
      return res.status(400).json({ error: "Valeur isPremium manquante ou invalide." });
    }
    const target = await getUserById(targetId);
    if (!target) return res.status(404).json({ error: "Utilisateur introuvable." });

    // Accorder/retirer Premium à un AUTRE administrateur est réservé au
    // super-administrateur — un admin classique garde cette capacité sur
    // les comptes utilisateurs standards (utile pour un paiement reçu par
    // un autre canal que FedaPay), mais pas entre administrateurs.
    if (target.role === "admin" && targetId !== req.userId && !isSuperAdmin(requester)) {
      return res.status(403).json({ error: "Tu ne peux pas modifier le statut Premium d'un autre administrateur." });
    }

    // N'affecte jamais l'historique des transactions FedaPay
    // (premium_transactions) : c'est un statut indépendant.
    const user = await adminSetPremium(targetId, isPremium);
    res.json({ user });
  } catch (err) {
    console.error("[Admin] Erreur changement statut Premium :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const requester = req.adminUser;

    if (targetId === req.userId) {
      return res.status(400).json({ error: "Tu ne peux pas supprimer ton propre compte depuis cet écran." });
    }

    const target = await getUserById(targetId);
    if (!target) return res.status(404).json({ error: "Utilisateur introuvable." });

    // Le super-administrateur ne peut jamais être supprimé, par personne —
    // ça garantit qu'il reste toujours au moins un compte capable de tout
    // gérer, y compris en cas d'erreur de manipulation.
    if (target.email.toLowerCase() === SUPER_ADMIN_EMAIL) {
      return res.status(403).json({ error: "Le compte du super-administrateur ne peut pas être supprimé." });
    }
    // Supprimer un AUTRE compte administrateur est réservé au
    // super-administrateur — un admin classique garde cette capacité sur
    // les comptes utilisateurs standards, mais pas entre administrateurs.
    if (target.role === "admin" && !isSuperAdmin(requester)) {
      return res.status(403).json({ error: "Seul le super-administrateur peut supprimer un compte administrateur." });
    }

    await deleteUser(targetId);
    res.json({ success: true });
  } catch (err) {
    console.error("[Admin] Erreur suppression utilisateur :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

module.exports = router;
