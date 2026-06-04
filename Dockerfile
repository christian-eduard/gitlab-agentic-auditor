FROM node:20-slim

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias de producción
RUN npm ci --only=production

# Copiar el resto del código
COPY . .

# Exponer el puerto (Cloud Run usa PORT env var)
EXPOSE 3095

# Comando de inicio
CMD ["node", "server.js"]
