import { createContext, useContext, useState, useCallback, useEffect } from "react";

const AuthContext = createContext(null);
const TOKEN_KEY = "parollle_token";
const PREVIEW_KEY = "parollle_admin_preview"; // "standard" | "premium" | null (= admin par défaut)

async function apiCall(method, path, body, token, previewAs) {
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(previewAs ? { "X-Preview-As": previewAs } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");
  return data;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  // Mode "aperçu" — admin uniquement (voir premiumAccess.js côté backend et
  // le sélecteur dans ProfileScreen). Persisté pour survivre à un rechargement
  // de page pendant qu'un admin teste l'expérience gratuite/Premium.
  const [adminPreview, setAdminPreviewState] = useState(() => localStorage.getItem(PREVIEW_KEY) || null);

  const setAdminPreview = useCallback((mode) => {
    if (mode) localStorage.setItem(PREVIEW_KEY, mode);
    else localStorage.removeItem(PREVIEW_KEY);
    setAdminPreviewState(mode);
  }, []);

  // N'a d'effet réel que pour un compte admin (le backend l'ignore pour
  // tout le monde d'autre, voir premiumAccess.js) — mais on ne l'envoie
  // même pas dans ce cas pour ne rien laisser traîner inutilement.
  const previewHeader = user?.role === "admin" ? adminPreview : null;

  // Au chargement, si un token existe déjà (session précédente), on vérifie
  // qu'il est toujours valide auprès du backend plutôt que de faire confiance
  // aveuglément à ce qui est dans le localStorage (le token a pu expirer).
  useEffect(() => {
    if (!token) { setChecking(false); return; }

    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setUser(data.user))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setChecking(false));
  }, [token]);

  const login = useCallback(async (email, password) => {
    const data = await apiCall("POST", "/api/auth/login", { email, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const register = useCallback(async (email, password, displayName) => {
    const data = await apiCall("POST", "/api/auth/register", { email, password, displayName });
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const updateDisplayName = useCallback(async (displayName) => {
    const data = await apiCall("PATCH", "/api/auth/me", { displayName }, token, previewHeader);
    setUser(data.user);
    return data.user;
  }, [token, previewHeader]);

  const uploadAvatar = useCallback(async (file) => {
    const formData = new FormData();
    formData.append("avatar", file);
    const res = await fetch("/api/auth/me/avatar/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, ...(previewHeader ? { "X-Preview-As": previewHeader } : {}) },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Impossible d'envoyer cette photo.");
    setUser(data.user);
    return data.user;
  }, [token, previewHeader]);

  const setAvatarPreset = useCallback(async (style, seed) => {
    const data = await apiCall("POST", "/api/auth/me/avatar/preset", { style, seed }, token, previewHeader);
    setUser(data.user);
    return data.user;
  }, [token, previewHeader]);

  const setOfflineAvatar = useCallback(async (seed) => {
    const data = await apiCall("POST", "/api/auth/me/avatar/offline", { seed }, token, previewHeader);
    setUser(data.user);
    return data.user;
  }, [token, previewHeader]);

  const removeAvatar = useCallback(async () => {
    const data = await apiCall("DELETE", "/api/auth/me/avatar", null, token, previewHeader);
    setUser(data.user);
    return data.user;
  }, [token, previewHeader]);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    await apiCall("POST", "/api/auth/change-password", { currentPassword, newPassword }, token, previewHeader);
  }, [token, previewHeader]);

  const resendVerificationEmail = useCallback(async () => {
    const data = await apiCall("POST", "/api/auth/resend-verification", null, token, previewHeader);
    return data;
  }, [token, previewHeader]);

  // Rafraîchit l'utilisateur depuis le serveur — utilisé après confirmation
  // d'email (VerifyEmailScreen) pour que le bandeau "email non confirmé"
  // disparaisse immédiatement sans attendre une reconnexion.
  const refreshUser = useCallback(async () => {
    if (!token) return null;
    const data = await apiCall("GET", "/api/auth/me", null, token, previewHeader);
    setUser(data.user);
    return data.user;
  }, [token, previewHeader]);

  const startPremiumCheckout = useCallback(async () => {
    const data = await apiCall("POST", "/api/premium/checkout", null, token, previewHeader);
    return data; // { paymentUrl, transactionId }
  }, [token, previewHeader]);

  const verifyPremiumPayment = useCallback(async (transactionId) => {
    const data = await apiCall("GET", `/api/premium/verify/${transactionId}`, null, token, previewHeader);
    if (data.user) setUser(data.user);
    return data; // { status, user? }
  }, [token, previewHeader]);

  // Un administrateur a accès à toutes les fonctionnalités, y compris celles
  // réservées aux comptes Premium — pas besoin qu'il paie pour tester ou
  // gérer l'app. Utiliser CETTE valeur (jamais `user.is_premium` seul) pour
  // décider d'afficher/débloquer une fonctionnalité Premium dans l'UI.
  //
  // Exception : un admin en mode "aperçu utilisateur standard" (voir
  // ProfileScreen) doit voir l'app comme un compte gratuit normal, pour
  // pouvoir réellement tester/valider cette expérience.
  const isPremiumEffective = Boolean(user) && (
    user.role === "admin" ? adminPreview !== "standard" : Boolean(user.is_premium)
  );

  const deleteAccount = useCallback(async () => {
    await apiCall("DELETE", "/api/auth/me", null, token, previewHeader);
    logout();
  }, [token, logout]);

  return (
    <AuthContext.Provider value={{
      token, user, checking, login, register, logout,
      updateDisplayName, uploadAvatar, setAvatarPreset, setOfflineAvatar, removeAvatar,
      changePassword, deleteAccount, resendVerificationEmail, refreshUser,
      startPremiumCheckout, verifyPremiumPayment, isPremiumEffective,
      adminPreview, setAdminPreview, previewHeader,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé à l'intérieur de <AuthProvider>.");
  return ctx;
}
