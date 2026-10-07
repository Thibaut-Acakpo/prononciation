# ============================================================
# PrononciA+ — image Docker pour Render (offre gratuite, 512 Mo)
#
# Contient : le serveur Node, le frontend compilé, et un Python LÉGER
# (espeak-ng + ffmpeg, SANS torch ni Whisper). L'analyse tourne en
# "mode allégé" : la transcription est faite par l'API Groq.
# ============================================================

# ── Étape 1 : compilation du frontend ───────────────────────
FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install --include=dev
COPY frontend/ ./
RUN npm run build

# ── Étape 2 : serveur final (Node + Python léger) ───────────
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PYTHON_PATH=python3 \
    LITE_MODE=true \
    DISABLE_BACKUP=true \
    PYTHONUNBUFFERED=1

# espeak-ng : phonèmes de référence ; ffmpeg : conversion audio (pydub)
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip espeak-ng ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY backend/python/requirements-lite.txt ./python/requirements-lite.txt
RUN pip3 install --no-cache-dir --break-system-packages -r python/requirements-lite.txt

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Render fournit la variable PORT (10000 par défaut) : server.js la lit déjà.
EXPOSE 10000
CMD ["node", "server.js"]
