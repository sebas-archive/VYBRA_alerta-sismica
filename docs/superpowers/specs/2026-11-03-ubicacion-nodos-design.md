# Ubicación real de los nodos y del público, en un mapa liso

Fecha: 2026-11-03 · Estado: borrador para aprobación

## Intención

Que el mapa muestre solo cosas reales:
- dónde están los 3 prototipos;
- en qué estado está cada uno;
- dónde está la persona que mira;
- dónde cayó el sismo.

Los ESP32 no tienen GPS ni hay un servicio de geolocalización por WiFi con cobertura en la zona (beaconDB respondió "no se puede estimar"). Por eso la ubicación de cada nodo se toma del GPS de un celular parado junto a la placa. Si alguien mueve un nodo, el nodo lo detecta por WiFi y el mapa lo marca hasta que lo vuelvan a ubicar.

## Lo que ya existe

- Clúster Raft en los 3 ESP32 (`firmware/`), funcionando en hardware con IP fijas `.201`–`.203`. OTA con `firmware/cargar.sh N --wifi`.
- Servidor Node en el PC (`web/server.js`, `web/poller.js`). Sirve el panel (`/`) y la vista pública (`/publico`) por **HTTP**. El puerto por defecto 8080 choca con otro proyecto del usuario (nginx en Docker), así que hoy se usa `PUERTO=8090`. `ufw` permite el 8090 desde `192.168.80.0/24`.
- La vista pública (`web/public/cliente.html`) usa Leaflet con calles de OpenStreetMap. Su configuración tiene coordenadas de ejemplo de Pasto, lugares con nombre ("el volcán Galeras"…) y un historial de sismos inventados.
- Nodo 3: la hora NTP tarda unos segundos más que en los otros.

## Objetivos

1. **HTTPS para los celulares.** El navegador solo da la ubicación en páginas seguras.
2. **El celular se ubica a sí mismo** (con permiso) y aparece como "estás aquí".
3. **Ubicar cada nodo con el celular:** el botón "Ubicar nodo N aquí" guarda el GPS del celular como la posición del nodo.
4. **Detectar por WiFi que un nodo se movió** y marcarlo en el mapa hasta que lo vuelvan a ubicar.
5. **Mapa liso** (sin calles ni internet) con solo:
   - los nodos, con su color de estado;
   - la persona;
   - la zona del sismo.
6. **Color de cada nodo**, en el mapa y en el panel:
   - verde = al día;
   - azul = sincronizando;
   - rojo = caído.

## No objetivos

- Ubicar los nodos automáticamente, sin el celular.
- Mover el punto solo cuando mueven un nodo: queda marcado "se movió" hasta que lo vuelvan a ubicar.
- Precisión mejor que la del GPS del celular.
- Un certificado de una autoridad real. El certificado es propio y cada celular acepta el aviso una vez.

## Anti-objetivos

- Que el mapa muestre lugares, calles o sismos que no salieron del sistema.
- Que un nodo aparezca en verde estando caído o atrasado.
- Que el escaneo WiFi del ESP32 interrumpa los latidos de Raft y provoque elecciones falsas.

## Decisiones

### HTTPS y puertos
- `server.js` escucha en dos puertos con el mismo manejador de peticiones:
  - **HTTP en 8090** (nuevo valor por defecto de `PUERTO`), para el panel en `localhost`;
  - **HTTPS en 8091** (`PUERTO_HTTPS`), para los celulares.
- Certificado propio: si no existen `web/certs/cert.pem` y `key.pem`, el servidor los genera al arrancar con `openssl` (RSA 2048, 825 días). El SAN incluye `localhost`, `127.0.0.1` y **todas** las IPv4 que no son de loopback. Si cambia alguna IP, el certificado se regenera. `web/certs/` va en `.gitignore`.
- Los **dos puertos sirven las mismas páginas**: el panel también se abre por `https://<ip>:8091/` desde el celular, que es donde se usa "Ubicar nodo N aquí".
- Al arrancar, el servidor imprime las 3 URLs (panel, pública HTTP y pública HTTPS). También avisa que el puerto 8091 debe estar abierto en `ufw` con:
  ```bash
  sudo ufw allow from 192.168.80.0/24 to any port 8091 proto tcp
  ```
- La vista pública muestra un aviso cuando se abre por HTTP desde otro equipo: "Para ver tu ubicación abre `https://<ip>:8091/publico`".

### Ubicación del celular
- Se pide solo cuando la persona toca "Usar mi ubicación" (ya existe el botón), nunca al cargar la página. Se usa `watchPosition` con alta precisión mientras la página está abierta.
- La ubicación del celular **no se envía al servidor**: se usa solo en ese celular, para el punto "estás aquí" y para las distancias.

### Ubicar un nodo
- **En el panel de operación**, cada tarjeta de la pestaña Detectores tiene el botón **"Ubicar nodo N aquí"**.
- **Qué hace el botón:**
  - Pide el GPS del celular y espera a tener precisión ≤ 50 m, o 15 s; después usa la mejor lectura que tenga.
  - Envía `POST /api/nodos/:n/ubicacion {lat, lon, precision}` al servidor del PC.
- **Qué hace el servidor:**
  - Guarda en `web/datos/ubicaciones.json` (fuera de git): `{ "1": {lat, lon, precision, t}, … }`.
  - Le pide al nodo `POST /huella`. El nodo responde enseguida `202` y toma la huella de referencia en cuanto pueda, respetando las reglas de escaneo (ver abajo). Mientras tanto `/estado` trae `con_huella:false`, y el panel muestra "Tomando huella WiFi…".
  - Si un nodo ubicado aparece con `con_huella:false` (por ejemplo, tras borrar su memoria), el servidor vuelve a pedirle `POST /huella`, como máximo una vez por minuto.
  - Sin autenticación, igual que `/control` y `/pulsar`: cualquiera en el WiFi podría reubicar nodos. Queda como riesgo conocido de la red cerrada de la demostración.
- `GET /api/estado` y el SSE incluyen `ubicaciones` dentro de la foto.
- El botón no aparece en la vista pública.

### Detectar que un nodo se movió (firmware)
- **Huella:** lista de hasta 8 BSSID con su RSSI. Se toma con escaneo **activo y asíncrono** (`WiFi.scanNetworks(true, false, false, 60)` con `WiFi.setScanActiveMinTime(30)`: entre 30 y 60 ms por canal, a lo sumo ~0,85 s en total). Un escaneo pasivo de 40 ms por canal solo veía ~40 % de las redes (los beacons salen cada ~102 ms) y daba falsos "movido".
- **Frecuencia:** tras arrancar, el primero a los **15 s** y el segundo a los **30 s**; después cada **120 s**. Nunca mientras el nodo es líder con entradas pendientes de replicar, nunca mientras otro escaneo corre, y nunca dos escaneos con menos de 15 s entre ellos. El escaneo dura menos que el tiempo mínimo de elección (1,5 s), así que no debe provocar elecciones.
- **Comparación con la huella de referencia** (la tomada al ubicar):
  - *parecido* = proporción de BSSID de referencia que siguen visibles con una diferencia de RSSI ≤ 12 dB;
  - cada evaluación compara la referencia contra la **unión de los 2 últimos escaneos** (por BSSID, con el RSSI más fuerte), porque un escaneo suelto puede perder AP;
  - si *parecido* < 0,5 en **2 evaluaciones seguidas**, el nodo queda `movido: true`. Si lo mueven andando, el escaneo de antes sigue en la unión una evaluación más: se detecta en a lo sumo 3 evaluaciones.
- La huella de referencia es **propia de cada placa**: no se replica por Raft, porque describe el lugar físico de esa placa. Se guarda en NVS (namespace `ubic`) y sobrevive a reinicios y a cargas de firmware por USB u OTA, que no borran NVS. Sin referencia, `movido` es `false`.
- `/estado` agrega `"movido"` y `"con_huella"`, y aun así debe seguir pesando menos de 1 KB. Nuevo endpoint `POST /huella`.
- Se registra el suceso "Servidor N detectó que lo movieron".
- La lógica de comparación va en C++ puro (`src/nucleo/huella.h/.cpp`) con pruebas en el PC. El escaneo en sí va en `detector.ino`.

### Mapa liso (ambas vistas)
- Se quita Leaflet. El mapa se dibuja en **SVG** desde `web/public/mapa.js`, un módulo compartido por las dos vistas.
- **Proyección:** plano local equirrectangular alrededor del centro de los puntos (metros). Se ajusta para que entren todos los puntos con margen. Lleva una barra de escala en m o km y una indicación de norte.
- **Elementos:**
  - **Nodos:** círculo con "N", la etiqueta "Detector N" y un halo con su radio de precisión.
    - Si nunca se ubicó: aparece en una lista "Sin ubicar: nodo 3" bajo el mapa, no en el mapa.
    - Si se movió: borde punteado y el texto "se movió".
  - **Persona:** punto azul con halo de precisión, "Estás aquí".
  - **Sismo:** círculo translúcido del color de la severidad, centrado en el **centroide ponderado por nivel** de los nodos que coincidieron, que estén ubicados y que **no** estén marcados "se movió". El radio es la distancia máxima del centroide a esos nodos, con un mínimo de 30 m.
  - Con un solo nodo válido, el círculo se centra en él, con 30 m de radio.
  - Con ninguno, no se dibuja círculo y el texto dice "ubicación desconocida".
- **Sin ningún nodo ubicado:** mensaje "Todavía no hay nodos ubicados. Ubícalos desde el panel con un celular."
- **Textos de lugar:** "cerca del detector N" (el nodo ubicado más cercano al centro del sismo) y "a X m de ti" si hay ubicación de la persona.
- Se borran de `cliente.html`: `CONFIG.center`, `CONFIG.stations`, `PLACES`, las zonas manuales de Ajustes y cualquier sismo de ejemplo.

### Color de estado de cada nodo
Se calcula de la foto, con la misma función en el mapa y en el diagrama del clúster:

| Color | Condición |
|---|---|
| **Rojo** | `alcanzable: false` o `estado.caido: true` |
| **Azul** (sincronizando) | Responde, pero: no hay líder, **o** es candidato, **o** su `log_len` o su `commit_index` están por debajo de los de la **fuente** de la foto (`foto.fuente`, definida en `poller.js`: el líder si responde, si no el nodo con el `commit_index` más alto) |
| **Verde** | Responde, reconoce al líder, y su `log_len` y `commit_index` son iguales a los de la fuente |

- El panel de operación también agrega un mapa pequeño en Panorama, con el mismo componente.
- El color siempre va acompañado de texto (Caído / Sincronizando / Al día), no solo de color.

### Pruebas
- **Firmware:** `huella.cpp` con pruebas en el PC (`make -C firmware/test test`).
- **Web:** se actualizan las pruebas existentes de `node:test` (`cd web && npm test`), y se agregan pruebas para:
  - `POST /api/nodos/:n/ubicacion` (validación de lat, lon y precisión; persistencia);
  - `ubicaciones` en la foto;
  - HTTPS en 8091;
  - la función de color de estado y la del centroide, en `mapa.js` y `datos.js`, con un módulo importable desde Node.

## Decisiones del diseñador (para revisar)

Las tomé yo tras la revisión:
- **Certificado:** con todas las IP del PC.
- **Panel también por HTTPS 8091,** para ubicar los nodos desde el celular.
- **`POST /huella` responde 202** y toma la huella en segundo plano. El servidor la vuelve a pedir si falta.
- **La huella vive en cada placa** y no pasa por Raft.
- **Sin autenticación** para ubicar nodos (riesgo conocido, igual que el resto de la API).
- **Zona del sismo:** excluye nodos sin ubicar o "se movió". Con un nodo válido, 30 m alrededor de él; con ninguno, "ubicación desconocida".
- **Referencia para azul/verde:** la fuente de la foto.

## Lo que se deja al constructor
- El diseño visual exacto de los marcadores, respetando `tokens.css` y los modos claro y oscuro.
- Cómo se organiza `mapa.js`, siempre que sea un único módulo usado por las dos vistas.
- Mensajes del monitor serie del ESP32.

## Riesgos conocidos
- Si el GPS del celular está en interiores, la precisión puede ser de 20–50 m, y los 3 nodos en la misma habitación pueden verse superpuestos. El halo de precisión lo deja a la vista.
- El escaneo WiFi del ESP32 podría retrasar latidos. Se mide en la prueba con las placas: en 10 minutos con escaneos no debe haber elecciones nuevas.
- Hay que volver a cargar el firmware en las 3 placas. Se puede hacer por WiFi (OTA).
