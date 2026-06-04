FROM node:20-slim

# npx necesita acceso a npm global para lanzar @structured-world/gitlab-mcp como proceso hijo
RUN npm install -g @structured-world/gitlab-mcp

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias de producción
RUN npm ci --only=production

# Copiar el resto del código
COPY . .

# Cloud Run usa la variable PORT
ENV PORT=8080
EXPOSE 8080

# Comando de inicio
CMD ["node", "server.js"]
