# Imagen del panel: sirve server.js y los estáticos de public/. Los ESP32 simulados usan docker/Dockerfile.nodo-sim.
# El panel no tiene dependencias: no hace falta npm install. (El servidor de datos usa pg: ver docker/Dockerfile.*)
FROM node:22.22-alpine
WORKDIR /app
COPY package.json ./
COPY *.js ./
COPY public ./public
COPY fake ./fake
USER node
CMD ["node", "server.js"]
