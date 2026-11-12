# Imagen única: sirve para el panel (server.js) y para los nodos simulados (fake/nodo-solo.js).
# El panel no tiene dependencias: no hace falta npm install.
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY *.js ./
COPY public ./public
COPY fake ./fake
USER node
CMD ["node", "server.js"]
