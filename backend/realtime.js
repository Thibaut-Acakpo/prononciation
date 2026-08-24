/**
 * Mode Match — défi de prononciation en temps réel entre plusieurs
 * utilisateurs connectés ensemble.
 *
 * Limite assumée à ce stade : les salons vivent en mémoire (Map), pas en
 * base de données. Ça veut dire :
 * - Un redémarrage du serveur efface les parties en cours (mais pas
 *   l'historique déjà terminé, qui lui est bien sauvegardé en MySQL).
 * - Cette approche ne fonctionne que sur UN SEUL serveur Node. Si un jour
 *   l'app tourne sur plusieurs serveurs en parallèle (scaling horizontal),
 *   il faudra migrer cet état vers Redis. Largement suffisant pour l'instant.
 */

const { Server } = require("socket.io");
const { verifyToken } = require("./auth");
const { saveFinishedMatch, getUserPracticeStats } = require("./db");
const { isValidWord } = require("./wordList");

// Anti-spam : un utilisateur ne peut pas créer un nouveau salon plus d'une
// fois toutes les quelques secondes — évite qu'un client mal intentionné ou
// buggé ne remplisse la mémoire du serveur de salons vides en boucle.
const ROOM_CREATION_COOLDOWN_MS = 5000;
const lastRoomCreationByUser = new Map(); // userId -> timestamp

// Nombre minimum de tentatives d'entraînement avant de pouvoir créer ou
// rejoindre un Match. Choix volontaire : un minimum de PRATIQUE plutôt qu'un
// minimum de SCORE — exiger un bon score serait injuste envers quelqu'un qui
// apprend sincèrement mais galère encore. Exiger un minimum d'entraînement
// reste équitable pour tous, tout en filtrant les comptes qui n'ont jamais
// utilisé l'app avant de foncer sur un mode social/compétitif.
const MATCH_MIN_ATTEMPTS = 10;

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O/1/I pour éviter la confusion
const MAX_PARTICIPANTS = 6;
const TURN_TIMEOUT_MS = 60_000; // 60s pour enregistrer et soumettre son tour, sinon on passe au suivant

/** @type {Map<string, RoomState>} */
const rooms = new Map();

function sanitizeDisplayName(name) {
  if (typeof name !== "string") return "Joueur";
  const trimmed = name.trim().slice(0, 60); // même limite que le profil (auth.routes.js)
  return trimmed || "Joueur";
}

function generateRoomCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function publicRoomState(room) {
  return {
    code: room.code,
    hostUserId: room.hostUserId,
    word: room.word,
    phase: room.phase, // "lobby" | "playing" | "finished"
    participants: room.participants.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      accepted: p.accepted,
      submitted: p.submitted,
      connected: p.connected,
    })),
    currentTurnUserId: room.phase === "playing" ? room.participants[room.turnIndex]?.userId : null,
    results: room.phase === "finished" ? room.results : null,
  };
}

function broadcastRoom(io, room) {
  io.to(room.code).emit("match:state", publicRoomState(room));
}

function clearTurnTimer(room) {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
}

function finishMatch(io, room) {
  clearTurnTimer(room);
  room.phase = "finished";

  // Classement : PER croissant (moins d'erreur = mieux), les non-soumis
  // (déconnectés/timeout) sont classés derniers, sans médaille.
  const ranked = [...room.participants].sort((a, b) => {
    if (a.per == null && b.per == null) return 0;
    if (a.per == null) return 1;
    if (b.per == null) return -1;
    return a.per - b.per;
  });

  room.results = ranked.map((p, i) => ({
    userId: p.userId,
    displayName: p.displayName,
    per: p.per,
    recognizedText: p.recognizedText,
    verdict: p.verdict,
    alignment: p.alignment || [],
    placement: p.per != null && i < 3 ? i + 1 : null,
  }));

  saveFinishedMatch({
    roomCode: room.code,
    word: room.word,
    createdBy: room.hostUserId,
    participants: ranked.map((p) => ({
      userId: p.userId, per: p.per, recognizedText: p.recognizedText, verdict: p.verdict,
    })),
  }).catch((err) => console.error("[Match] Échec de sauvegarde du match :", err.message));

  broadcastRoom(io, room);

  // Le salon reste consultable un moment (écran de résultats), puis est nettoyé.
  setTimeout(() => rooms.delete(room.code), 5 * 60_000);
}

function advanceTurn(io, room) {
  clearTurnTimer(room);
  room.turnIndex += 1;

  if (room.turnIndex >= room.participants.length) {
    finishMatch(io, room);
    return;
  }

  startTurnTimer(io, room);
  broadcastRoom(io, room);
}

function startTurnTimer(io, room) {
  clearTurnTimer(room);
  room.turnTimer = setTimeout(() => {
    // Le joueur dont c'est le tour n'a rien soumis à temps : on passe au
    // suivant plutôt que de bloquer toute la partie indéfiniment.
    const current = room.participants[room.turnIndex];
    if (current) current.submitted = true; // marqué "passé", pas de score
    advanceTurn(io, room);
  }, TURN_TIMEOUT_MS);
}

function setupMatchNamespace(httpServer, corsOrigin) {
  const io = new Server(httpServer, {
    // Sécurité (audit) : plus de repli sur "*" (accepte n'importe quel site
    // web tiers). Mêmes origines autorisées que pour l'API REST classique.
    cors: {
      origin: corsOrigin
        ? corsOrigin.split(",").map((o) => o.trim())
        // Correction : même souci que pour l'API REST — Vite change parfois
        // de port automatiquement, une liste figée cassait la connexion.
        : (origin, callback) => {
            if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
              return callback(null, true);
            }
            callback(new Error("Origine non autorisée par la politique CORS."));
          },
    },
  });

  // Authentification par le même token JWT que le reste de l'app.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Authentification requise pour le mode Match."));
      const payload = verifyToken(token);
      socket.userId = payload.sub;
      socket.displayName = payload.email; // affiné à la connexion via match:create/join
      next();
    } catch {
      next(new Error("Session invalide."));
    }
  });

  io.on("connection", (socket) => {
    // Vérification côté serveur, jamais seulement côté frontend — un
    // utilisateur qui bricolerait la requête directement (devtools, script)
    // ne doit pas pouvoir contourner la condition de déblocage.
    async function checkEligible(socket) {
      try {
        const stats = await getUserPracticeStats(socket.userId);
        if (stats.count < MATCH_MIN_ATTEMPTS) {
          socket.emit("match:error",
            `Il te faut au moins ${MATCH_MIN_ATTEMPTS} tentatives d'entraînement avant de jouer un Match ` +
            `(tu en as ${stats.count} pour l'instant). Entraîne-toi encore un peu !`
          );
          return false;
        }
        return true;
      } catch (err) {
        console.error("[Match] Erreur vérification d'éligibilité :", err.message);
        socket.emit("match:error", "Impossible de vérifier ton accès au mode Match pour l'instant.");
        return false;
      }
    }

    socket.on("match:create", async ({ displayName }) => {
      if (!(await checkEligible(socket))) return;

      const lastCreation = lastRoomCreationByUser.get(socket.userId) || 0;
      if (Date.now() - lastCreation < ROOM_CREATION_COOLDOWN_MS) {
        return socket.emit("match:error", "Attends quelques secondes avant de créer un autre salon.");
      }
      lastRoomCreationByUser.set(socket.userId, Date.now());

      const code = generateRoomCode();
      const room = {
        code,
        hostUserId: socket.userId,
        word: null,
        phase: "lobby",
        participants: [{
          userId: socket.userId,
          displayName: sanitizeDisplayName(displayName),
          socketId: socket.id,
          accepted: false,
          submitted: false,
          connected: true,
          per: null,
          recognizedText: null,
          verdict: null,
        }],
        turnIndex: 0,
        turnTimer: null,
        results: null,
      };
      rooms.set(code, room);
      socket.join(code);
      socket.roomCode = code;
      broadcastRoom(io, room);
    });

    socket.on("match:join", async ({ code, displayName }) => {
      if (!(await checkEligible(socket))) return;

      const room = rooms.get(code);
      if (!room) return socket.emit("match:error", "Ce salon n'existe pas ou a expiré.");
      if (room.phase !== "lobby") return socket.emit("match:error", "Cette partie a déjà commencé.");
      if (room.participants.length >= MAX_PARTICIPANTS) return socket.emit("match:error", "Ce salon est complet.");

      const existing = room.participants.find((p) => p.userId === socket.userId);
      if (existing) {
        existing.connected = true;
        existing.socketId = socket.id;
      } else {
        room.participants.push({
          userId: socket.userId,
          displayName: sanitizeDisplayName(displayName),
          socketId: socket.id,
          accepted: false,
          submitted: false,
          connected: true,
          per: null,
          recognizedText: null,
          verdict: null,
        });
      }
      socket.join(code);
      socket.roomCode = code;
      broadcastRoom(io, room);
    });

    socket.on("match:proposeWord", ({ word }) => {
      const room = rooms.get(socket.roomCode);
      if (!room || room.phase !== "lobby") return;
      if (room.hostUserId !== socket.userId) return socket.emit("match:error", "Seul l'hôte peut choisir le mot.");

      // Sécurité (audit) : sans ça, l'hôte pouvait proposer n'importe quel
      // texte — diffusé tel quel aux autres participants, puis potentiellement
      // transmis à /api/analyze et stocké en base (risque d'injection de
      // formule CSV à l'export, voir wordList.js pour le détail).
      if (!isValidWord(word)) {
        return socket.emit("match:error", "Mot invalide — choisis un mot dans la liste proposée.");
      }

      room.word = word.toLowerCase().trim();
      room.participants.forEach((p) => { p.accepted = p.userId === socket.userId; });
      broadcastRoom(io, room);
    });

    socket.on("match:acceptWord", () => {
      const room = rooms.get(socket.roomCode);
      if (!room || room.phase !== "lobby" || !room.word) return;

      const participant = room.participants.find((p) => p.userId === socket.userId);
      if (participant) participant.accepted = true;

      const allAccepted = room.participants.length >= 2 && room.participants.every((p) => p.accepted);
      if (allAccepted) {
        room.phase = "playing";
        room.turnIndex = 0;
        startTurnTimer(io, room);
      }
      broadcastRoom(io, room);
    });

    socket.on("match:submitTurn", ({ per, recognizedText, verdict, alignment }) => {
      const room = rooms.get(socket.roomCode);
      if (!room || room.phase !== "playing") return;

      const current = room.participants[room.turnIndex];
      if (!current || current.userId !== socket.userId) return; // pas ton tour

      current.per = per;
      current.recognizedText = recognizedText;
      current.verdict = verdict;
      current.alignment = alignment || [];
      current.submitted = true;

      advanceTurn(io, room);
    });

    socket.on("match:leave", () => leaveRoom(socket));
    socket.on("disconnect", () => leaveRoom(socket));

    function leaveRoom(socket) {
      const room = rooms.get(socket.roomCode);
      if (!room) return;

      const participant = room.participants.find((p) => p.userId === socket.userId);
      if (participant) participant.connected = false;

      // Salon vide (tout le monde déconnecté) → nettoyage immédiat.
      if (room.participants.every((p) => !p.connected)) {
        clearTurnTimer(room);
        rooms.delete(room.code);
        return;
      }

      broadcastRoom(io, room);
    }
  });

  return io;
}

module.exports = { setupMatchNamespace, MATCH_MIN_ATTEMPTS };
