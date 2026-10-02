import { createContext, useContext, useState, useCallback, useEffect } from "react";

const AuthContext = createContext(null);
const TOKEN_KEY = "parollle_token";
const PREVIEW_KEY = "parollle_admin_preview"; // "standard" | "premium" | null (= admin par défaut)

// ✅ Fonction utilitaire qui parse la réponse de manière sécurisée
async function parseResponse(res) {
  const contentType = res.headers.get("content-type") || "";
  let data = null;

  // On essaie de lire le JSON uniquement si le serveur annonce du JSON
  if (contentType.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    // Sinon (HTML d'erreur, réponse vide...), on lit le texte brut
    const text = await res.text();
    data = text ? { error: text } : null;
  }

  if (!res.ok) {
    // Priorité : message clair renvoyé par le backend
    const message =
      (data && data.error) ||
      (data && data.message) ||
      `Erreur ${res.status}`;
    throw new Error(message);
  }

  return data;
}

async function apiCall(method, path, body, token, previewAs) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(previewAs ? { "X-Preview-As": previewAs } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (networkErr) {
    // Serveur éteint, mauvaise URL, pas de connexion Internet...
    throw new Error("Impossible de contacter le serveur. Vérifie ta connexion internet.");
  }

  return parseResponse(res);
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [adminPreview, setAdminPreviewState] = useState(() => localStorage.getItem(PREVIEW_KEY) || null);

  const setAdminPreview = useCallback((mode) => {
    if (mode) localStorage.setItem(PREVIEW_KEY, mode);
    else localStorage.removeItem(PREVIEW_KEY);
    setAdminPreviewState(mode);
  }, []);

  const previewHeader = user?.role === "admin" ? adminPreview : null;

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
    let res;
    try {
      res = await fetch("/api/auth/me/avatar/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, ...(previewHeader ? { "X-Preview-As": previewHeader } : {}) },
        body: formData,
      });
    } catch {
      throw new Error("Impossible de contacter le serveur. Vérifie ta connexion internet.");
    }
    const data = await parseResponse(res);
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

  const refreshUser = useCallback(async () => {
    if (!token) return null;
    const data = await apiCall("GET", "/api/auth/me", null, token, previewHeader);
    setUser(data.user);
    return data.user;
  }, [token, previewHeader]);

  const startPremiumCheckout = useCallback(async () => {
    const data = await apiCall("POST", "/api/premium/checkout", null, token, previewHeader);
    return data;
  }, [token, previewHeader]);

  const verifyPremiumPayment = useCallback(async (transactionId) => {
    const data = await apiCall("GET", `/api/premium/verify/${transactionId}`, null, token, previewHeader);
    if (data.user) setUser(data.user);
    return data;
  }, [token, previewHeader]);

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