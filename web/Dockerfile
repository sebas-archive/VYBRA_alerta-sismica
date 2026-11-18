# Imagen única: sirve para el panel (server.js) y para los nodos simulados (fake/nodo-solo.js).
# El panel no tiene dependencias: no hace falta npm install. (El servidor de datos usa pg: ver docker/Dockerfile.*)
FROM node:22.22-alpine
WORKDIR /app
COPY package.json ./
COPY *.js ./
COPY public ./public
COPY fake ./fake
USER node
CMD ["node", "server.js"]
