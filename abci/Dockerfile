# Étape 1 : build de l'application NestJS
FROM node:20-alpine AS builder

# Création du dossier de travail
WORKDIR /app

# Copie des fichiers nécessaires
COPY package*.json ./

# Installation des dépendances
RUN npm install --force

# Copie du reste des fichiers de l'application
COPY . .

# Build de l'application
RUN npm run build

# Étape 2 : image finale pour l'exécution
FROM node:20-alpine AS runner

# Répertoire de travail
WORKDIR /app

# Copie uniquement les fichiers nécessaires à l'exécution
COPY package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Port exposé (ajuste si nécessaire)
EXPOSE 3000

# Commande de lancement
CMD ["node", "dist/src/main.js"]
