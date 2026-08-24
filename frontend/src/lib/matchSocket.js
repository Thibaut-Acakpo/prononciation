import { io } from "socket.io-client";

let socket = null;

/**
 * Connexion Socket.io unique, réutilisée partout dans l'app (évite d'ouvrir
 * une nouvelle connexion à chaque écran). Se connecte au même serveur que
 * l'API REST (même origine), authentifiée avec le token JWT existant —
 * pas de système d'authentification séparé à gérer.
 */
export function getMatchSocket(token) {
  if (socket) return socket;

  socket = io("/", {
    auth: { token },
    autoConnect: true,
    reconnection: true,
  });

  return socket;
}

export function disconnectMatchSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
