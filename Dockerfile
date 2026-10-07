# Étape 1 : Compiler le frontend
FROM node:18 AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Étape 2 : Construire le backend et copier le frontend
FROM node:18-bookworm-slim

# Installer Python et les outils audio requis par le mode léger
ENV NODE_ENV=production \
	PYTHON_PATH=python3 \
	LITE_MODE=true \
	DISABLE_BACKUP=true \
	PYTHONUNBUFFERED=1

RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 python3-pip python-is-python3 espeak-ng ffmpeg \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/python/requirements-lite.txt ./python/requirements-lite.txt
RUN pip3 install --no-cache-dir --break-system-packages -r python/requirements-lite.txt

# Installer les dépendances Node
COPY backend/package*.json ./
RUN npm install --omit=dev

# Copier le code du backend
COPY backend/ ./

# Copier le frontend COMPILÉ depuis l'étape 1
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Exposer le port et lancer le serveur
EXPOSE 10000
CMD ["node", "server.js"]