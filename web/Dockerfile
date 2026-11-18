# Imagen única: sirve para el panel (server.js) y para los nodos simulados (fake/nodo-solo.js).
# El panel no tiene dependencias: no hace falta npm install.
FROM node:22.22-alpine
WORKDIR /app
COPY package.json ./
COPY *.js ./
COPY public ./public
COPY fake ./fake
# Carpeta del histórico (en compose es un volumen con nombre).
RUN mkdir -p /app/datos && chown node:node /app/datos
USER node
CMD ["node", "server.js"]
