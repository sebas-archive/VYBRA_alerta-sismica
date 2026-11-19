# 7. Instalación y ejecución del software

Este capítulo instala la parte de software del sistema: obtiene el código, configura el entorno, levanta el stack con Docker, abre las dos interfaces, explica los modos de operación y las pruebas rápidas. El montaje físico y el flasheo del firmware no se repiten aquí; están en la sección 3 y en la sección 6. Todos los comandos se ejecutan desde la raíz del repositorio salvo que se indique otra ruta.

## 7.1 Obtener el código

El código se obtiene del repositorio Git, en el commit `0ee5ed4`. No hay ZIP ni snapshot duplicado: el código versionado es la fuente de verdad.

```bash
git clone <url-del-repositorio>
cd "detector de sismos en red distribuida"
git log -1 --format='%H%n%ad%n%s'
```

Salida esperada para esta entrega:

```text
0ee5ed4a626c28904db55ab6e436e040c03f046c
Wed Nov 18 10:58:38 2026 -0500
chore: retira material de diseño histórico, prompts y planes internos
```

> El tag `v1.0.0-rc1` apunta al commit `f567487`, 49 commits por detrás de `0ee5ed4`. No hagas `git checkout v1.0.0-rc1` si quieres el código de esta entrega; usa el commit `0ee5ed4`.

El snapshot no incluye `firmware/detector/secretos.h`, ningún archivo `.env`, `node_modules/` ni los directorios locales `web/certs/` y `web/datos/`. Todo eso se crea o se instala en los pasos siguientes. Si se parte del snapshot, la raíz del proyecto es `alerta-sismica-0ee5ed4/`; de aquí en adelante se escribe "raíz del repositorio" para cualquiera de las dos rutas.

## 7.2 El archivo `.env`

Docker Compose lee automáticamente un archivo `.env` en la raíz del proyecto. La plantilla versionada es `ejemplo.env`; cópiala y edítala:

```bash
cp ejemplo.env .env
```

`.env` está en `.gitignore` y no se versiona. El archivo del equipo de validación solo contiene las tres direcciones de las placas reales (`NODO1_URL`, `NODO2_URL` y `NODO3_URL`); no contiene contraseñas. La {{TABLA:T-ENV}} reúne las variables que acepta el despliegue.

[[TABLA:T-ENV|Variables de entorno del despliegue, con su valor por defecto y su uso.]]
| Variable | Por defecto | Uso |
|---|---|---|
| `NODO1_URL`, `NODO2_URL`, `NODO3_URL` | sin definir (se usan los nodos simulados) | dirección de cada ESP32 real, sin barra final; por ejemplo `http://192.168.1.50` |
| `NODOS` | derivado de `NODO1_URL` a `NODO3_URL` | lista que usa el panel (`http://n1,http://n2,http://n3`); solo se define para sobrescribirla |
| `PUERTO_PANEL` | 8095 | puerto del panel en el host |
| `PUERTO_NODO1`, `PUERTO_NODO2`, `PUERTO_NODO3` | 9001, 9002, 9003 | puertos de los nodos simulados en el host |
| `PUERTO_SERVIDOR1`, `PUERTO_SERVIDOR2`, `PUERTO_SERVIDOR3` | 8101, 8102, 8103 | puertos de los servidores de datos en el host |
| `PUERTO_HTTPS` | 8443 | puerto del perfil HTTPS |
| `HOST_PUBLICO` | `192.168.80.227` (valor de ejemplo de Compose) | IP o nombre con el que se entra al panel HTTPS |
| `DB_PASSWORD` | `vybra` | clave de las bases; solo desarrollo, nunca en producción |
| `CONTROL_TOKEN` | `vybra-control-dev` | token entre panel y controlador; solo desarrollo |
| `RETENCION_ACTIVA` y el resto de `RETENCION_*` | todo desactivado | retención y archivado del histórico |
| `PREFIJO` | `sismo` | prefijo de los nombres de contenedor |
| `SERVIDORES`, `CONTROLADOR_URL`, `PUERTO` | los fija `docker-compose.yml` | no se definen en `.env` |

> En producción no definas `DB_PASSWORD` ni `CONTROL_TOKEN` en `.env`: la superposición `docker-compose.prod.yml` las anula y usa secretos de archivo (sección 7.7).

## 7.3 Arranque con Docker

El perfil por defecto levanta 11 servicios. Primero se valida la composición y después se construye y se arranca:

```bash
docker compose config --services | sort
```

Salida esperada:

```text
controlador
db1
db2
db3
nodo1
nodo2
nodo3
panel
servidor1
servidor2
servidor3
```

```bash
docker compose up -d --build
docker compose ps
```

La primera construcción necesita red: la imagen del nodo simulado descarga ArduinoJson 7.4.3 desde GitHub y las imágenes base se descargan de sus registros. Es normal que tarde varios minutos. La {{TABLA:T-SERV}} describe cada servicio, su contenedor y su puerto.

[[TABLA:T-SERV|Servicios del despliegue por defecto y del perfil HTTPS.]]
| # | Servicio | Contenedor | Imagen o construcción | Puerto en el host |
|---|---|---|---|---|
| 1 | `nodo1` | `sismo-nodo-1` | `Dockerfile.nodo-sim` sobre Debian 12 | 9001 |
| 2 | `nodo2` | `sismo-nodo-2` | `Dockerfile.nodo-sim` sobre Debian 12 | 9002 |
| 3 | `nodo3` | `sismo-nodo-3` | `Dockerfile.nodo-sim` sobre Debian 12 | 9003 |
| 4 | `db1` | `sismo-db-1` | `postgres:16-alpine` | sin publicar |
| 5 | `db2` | `sismo-db-2` | `postgres:16-alpine` | sin publicar |
| 6 | `db3` | `sismo-db-3` | `postgres:16-alpine` | sin publicar |
| 7 | `servidor1` | `sismo-servidor-1` | `Dockerfile.fedora` sobre Fedora 42 | 8101 |
| 8 | `servidor2` | `sismo-servidor-2` | `Dockerfile.suse` sobre openSUSE Leap 15.6 | 8102 |
| 9 | `servidor3` | `sismo-servidor-3` | `Dockerfile.ubuntu` sobre Ubuntu 24.04 | 8103 |
| 10 | `controlador` | `sismo-controlador` | `Dockerfile.controlador` sobre `node:22.22-alpine` | sin publicar |
| 11 | `panel` | `sismo-panel` | `web/Dockerfile` sobre `node:22.22-alpine` | 8095 |
| 12 | `https` | `sismo-https` | `caddy:2-alpine` | 8443, solo con `--profile https` |

Los nombres de contenedor llevan el prefijo `PREFIJO`, que por defecto es `sismo`. Esperado tras `docker compose ps`: 11 contenedores arriba, 10 con estado `healthy` y el panel en `Up` sin healthcheck propio. Los healthchecks están definidos en `docker-compose.yml:19-24`, `25-32`, `52-56` y `159-163`; el panel no tiene ninguno.

El registro del panel confirma que arrancó:

```bash
docker compose logs -f panel
```

Salida esperada (la segunda línea incluye la IP interna del contenedor):

```text
Servidores de datos: S1 http://servidor1:8100 · S2 http://servidor2:8100 · S3 http://servidor3:8100
Panel: http://172.20.0.5:8090  Vista pública: http://172.20.0.5:8090/publico
Si el firewall bloquea el celular: sudo ufw allow from <tu subred>/24 to any port 8095 proto tcp
```

`Ctrl+C` cierra el seguimiento de logs sin detener nada.

## 7.4 Abrir ADMIN y CLIENTE

La {{TABLA:T-INST-VISTAS}} resume las dos interfaces y lo que muestra cada una.

[[TABLA:T-INST-VISTAS|Vistas del panel: URL, redirección y contenido.]]
| Vista | URL | Contenido |
|---|---|---|
| ADMIN | `http://127.0.0.1:8095/`, que redirige a `/admin/` | Panorama, Sismógrafos, Alertas, Histórico, Clúster Raft, Servidores, Detectores, Registros y Configuración |
| CLIENTE | `http://127.0.0.1:8095/publico`, que redirige a `/cliente/` | estado del servicio, último sismo y alertas, mapa, protocolo de actuación y ajustes |

Comprobación de los códigos de respuesta:

```bash
curl -s -o /dev/null -w '/ -> %{http_code} %{redirect_url}\n' http://127.0.0.1:8095/
curl -s -o /dev/null -w '/admin/ -> %{http_code}\n' http://127.0.0.1:8095/admin/
curl -s -o /dev/null -w '/publico -> %{http_code} %{redirect_url}\n' http://127.0.0.1:8095/publico
```

Esperado: `/` responde 302 hacia `/admin/`, `/admin/` responde 200 y `/publico` responde 302 hacia `/cliente/`. El estado llega por SSE desde `/api/stream`, con un latido cada 5 segundos. El panel no tiene login; para abrirlo desde el móvil se usa `http://<IP-del-PC>:8095/` y se permite el puerto en el firewall (sección 2.3).

## 7.5 Modos simulado, real y mixto

El modo depende solo de las variables de dirección de los nodos. No se cambia código.

- **Simulado (por defecto).** Sin `NODO1_URL`, `NODO2_URL` ni `NODO3_URL`, el panel apunta a `http://nodo1:8080`, `http://nodo2:8080` y `http://nodo3:8080` dentro de Compose. Los tres contenedores `nodoN` ejecutan el mismo núcleo Raft del firmware compilado para Linux y se hablan por UDP 4210. Es el modo de la demo de 11 servicios.
- **Real.** Se definen las tres variables con las placas y se arranca sin los nodos simulados. El número de cada variable debe coincidir con el `nodo` que responde esa placa; `verificar-esp32.js` avisa si un nodo está en la posición equivocada.
- **Mixto.** Se definen solo algunas de las tres variables. Las que faltan vuelven a `http://nodoN:8080`, así que el panel puede leer placas reales y nodos simulados a la vez. En ese caso se arranca con `docker compose up -d --build` para que existan los nodos simulados que falten. Es un modo de laboratorio; la campaña física no lo usó.

Secuencia para el modo real, con las tres placas encendidas y en la misma red:

```bash
cp ejemplo.env .env
# editar NODO1_URL, NODO2_URL y NODO3_URL con las IP reales
node web/scripts/verificar-esp32.js
docker compose stop nodo1 nodo2 nodo3
docker compose up -d --build --no-deps panel servidor1 servidor2 servidor3 \
  db1 db2 db3 controlador
```

El controlador se mantiene para apagar y encender los servidores de datos. Si el stack ya estaba apagado, el paso `docker compose stop` no es necesario.

> Con ESP32 reales no existe el contenedor `nodoN`. La orden "apagar servidor" del panel detiene el servidor de datos y hace una desconexión lógica de la placa (`POST /control {"accion":"caer"}`); la placa sigue con corriente. "Encender" arranca el servidor y la reincorpora a Raft. El detalle está en `docs/servidores-de-datos.md` y en la sección 8.5.

## 7.6 Servidores de datos y PostgreSQL

Cada ESP32 tiene asignado un servidor de datos con el mismo número y su propia base: `nodo1` con `servidor1` y `db1`, `nodo2` con `servidor2` y `db2`, y `nodo3` con `servidor3` y `db3`. Las placas no guardan datos; el histórico vive en PostgreSQL. Los servidores de datos son los únicos que hablan con la base; el panel les pide el histórico por HTTP.

Las tablas que crea cada servidor son `muestras`, `log_entradas`, `eventos`, `alertas`, `sucesos`, `acciones` y las `archivo_*` de la retención. Como el log Raft está replicado en los tres nodos, eventos, alertas y log de consenso existen en las tres bases; muestras, sucesos y acciones son propios de cada nodo. El esquema y las consultas están en `web/servidor/bd.js` y `web/servidor/consulta.js`.

El histórico se consulta desde ADMIN, desde CLIENTE y por API:

```bash
curl -s 'http://127.0.0.1:8095/api/historial?tipo=eventos&servidor=todos&pagina=1&limite=10' \
  | python3 -m json.tool | head -40
curl -s 'http://127.0.0.1:8095/api/servidores' | python3 -m json.tool | head -30
```

Parámetros de `/api/historial`: `tipo` (`eventos`, `alertas`, `muestras`, `sucesos`, `log` o `acciones`), `servidor` (`1`, `2`, `3` o `todos`), `pagina`, `limite` (de 1 a 200, 50 por defecto), `nodo`, `categoria`, `estado`, `desde`, `hasta`, `q`, `orden` y `fuente` (`activo` o `archivo`). El detalle de cada parámetro y del formato de la respuesta está en `docs/servidores-de-datos.md`.

Como las bases no publican puerto, se entra por el contenedor:

```bash
docker compose exec -T db1 psql -U vybra -d vybra -c '\dt'
docker compose exec -T db1 psql -U vybra -d vybra -c 'SELECT count(*) FROM eventos;'
docker compose exec -T db1 psql -U vybra -d vybra \
  -c 'SELECT id, nodo, nivel, duracion_ms FROM eventos ORDER BY id DESC LIMIT 10;'
```

Los nombres de columna pueden variar; `\d eventos` muestra el esquema vigente. La retención y el archivado están desactivados por defecto y se configuran con las variables `RETENCION_*`; el detalle y las recomendaciones de tamaño están en `docs/servidores-de-datos.md` y en la sección 8.7.

## 7.7 Producción

La superposición `docker-compose.prod.yml` se aplica sobre `docker-compose.yml` y cambia el modelo de secretos y de puertos. Primero se generan los secretos fuera del repositorio; la carpeta `secretos/` está en `.gitignore`:

```bash
mkdir -p secretos
(umask 077; openssl rand -base64 32 > secretos/db_password.txt)
(umask 077; openssl rand -base64 32 > secretos/control_token.txt)
```

Después se definen en `.env` las direcciones de las tres placas reales, se valida la composición y se arranca:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml config --services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

La composición de producción activa 8 servicios: `controlador`, `db1`, `db2`, `db3`, `panel`, `servidor1`, `servidor2` y `servidor3`. Los nodos simulados `nodo1` a `nodo3` quedan en el perfil `simulados` y no se arrancan. El comando `config` no abre los archivos de secreto; hay que crearlos antes de `up` o el arranque falla.

Qué garantiza la superposición:

- La clave de PostgreSQL llega como secreto de archivo (`POSTGRES_PASSWORD_FILE` y `DB_PASSWORD_FILE`), no como variable de entorno.
- Cada servidor de datos arranca con `VYBRA_ENTORNO=produccion` y rechaza una clave vacía o la de desarrollo (`vybra`).
- No se publica ningún puerto de las bases ni de los servidores de datos: solo el panel.
- El controlador y el panel usan `CONTROL_TOKEN_FILE` en vez de `CONTROL_TOKEN`.
- `DB_PASSWORD` y `CONTROL_TOKEN` se anulan con `!reset null`; no las definas en `.env`.

## 7.8 Perfil HTTPS con Caddy

El perfil `https` añade un servicio Caddy delante del panel con TLS interno y su propia autoridad de certificación. No forma parte de los 11 servicios por defecto.

1. En `.env`, define la IP o el nombre con el que se entrará (`HOST_PUBLICO`) y, si hace falta, el puerto (`PUERTO_HTTPS`, 8443 por defecto). El valor de ejemplo de Compose hay que cambiarlo por el propio.
2. Arranca el perfil con `docker compose --profile https up -d --build` y comprueba con `docker compose ps`. Con el perfil activo la composición pasa a 12 servicios y aparece `sismo-https`.
3. Entra a `https://<HOST_PUBLICO>:8443/admin/` o a `https://<HOST_PUBLICO>:8443/cliente/`.
4. La primera vez el navegador avisará de que la CA no es de confianza. Descarga `https://<HOST_PUBLICO>:8443/ca.crt` e instálala como autoridad de confianza en cada dispositivo.
5. Para detener solo este perfil: `docker compose --profile https stop https`.

El Caddyfile (`docker/Caddyfile`) usa `tls internal`, hace `reverse_proxy` a `panel:8090` con `flush_interval -1` para que el SSE llegue sin búfer y entrega la CA en `/ca.crt`. También define un `default_sni` porque los navegadores no envían SNI cuando se entra por IP literal (RFC 6066); sin él, el handshake falla con "alert internal error". El perfil está implementado y validado por configuración, pero en esta entrega no se arrancó como evidencia; la captura del panel en 8443 queda pendiente.

## 7.9 Ejecución sin Docker

El panel no tiene dependencias: solo usa módulos nativos de Node.js. Se arranca desde `web/`:

```bash
cd web
npm start
# Panel:        http://localhost:8090/
# Vista pública: http://<IP-del-PC>:8090/publico
```

Si los nodos no resuelven por mDNS o son ESP32 reales, se indican sus URL:

```bash
NODOS="http://IP1,http://IP2,http://IP3" npm start
```

Sin `SERVIDORES` no hay histórico, y sin `CONTROLADOR_URL` la función de apagar y encender queda desactivada. Para el histórico en local se puede arrancar un servidor de datos a mano, siempre que exista un PostgreSQL accesible; la demo Docker ya lo resuelve sin configuración:

```bash
cd web
npm install     # instala pg, la dependencia del servidor de datos
N=1 NODO_URL=http://127.0.0.1:9001 PUERTO=8100 \
  DATABASE_URL=postgres://vybra:vybra@127.0.0.1:5432/vybra \
  node servidor/servidor.js
```

La demo sin Raft sirve para ver la interfaz sin hardware:

```bash
cd web
npm run fake     # tres nodos falsos en 9001-9003, sin Raft
# en otra terminal:
NODOS="http://127.0.0.1:9001,http://127.0.0.1:9002,http://127.0.0.1:9003" npm start
```

El nodo simulado nativo, con el núcleo Raft real, se compila con:

```bash
JSON_DIR="$HOME/Arduino/libraries/ArduinoJson/src" bash web/nodo-sim/compilar.sh
# salida: web/nodo-sim/nodo-sim (275 392 B verificados)
```

El binario se ejecuta con las variables `N` (1 a 3), `PUERTO_HTTP` (8080), `PUERTO_RAFT` (4210) y `PEER_1` a `PEER_3` (host:puerto de cada nodo). Los detalles están en la cabecera de `web/nodo-sim/nodo_sim.cpp`; para el día a día conviene la demo Docker, que ya configura esos valores.

## 7.10 Actualizar, apagar y borrar

Actualizar el código:

```bash
# snapshot nuevo: descomprimir sobre una carpeta nueva y copiar .env y secretos.h
# o repositorio Git: git pull
docker compose config --services
docker compose up -d --build
docker compose ps
```

`up -d --build` reconstruye las imágenes afectadas y recrea los contenedores cuyo código o configuración cambió; los volúmenes de PostgreSQL no se tocan. El panel lee `NODOS` al arrancar: si se cambia `.env`, el panel se recrea con el mismo comando.

Apagar y borrar:

```bash
docker compose stop                # detiene sin eliminar contenedores ni volúmenes
docker compose down                # elimina contenedores y redes; conserva los volúmenes de PostgreSQL
docker compose down -v             # además borra los volúmenes: se pierde el histórico de las bases
docker compose down -v --remove-orphans   # limpia también contenedores de otros perfiles
```

Los volúmenes declarados se consultan con:

```bash
docker compose config --volumes | sort
# sismo-db1
# sismo-db2
# sismo-db3
```

> `docker compose down -v` borra el histórico guardado en las tres bases. No lo uses si quieres conservar los datos. El proyecto de pruebas `vybraint` se limpia con `docker compose -p vybraint down -v --remove-orphans`.

## 7.11 Mapa del código del servidor

La {{TABLA:T-WEB-ARCH}} resume qué hace cada pieza de `web/`. La columna "referencia" apunta al archivo y a las líneas que definen su comportamiento principal.

[[TABLA:T-WEB-ARCH|Archivos del servidor Node.js y su responsabilidad.]]
| Ruta | Responsabilidad | Referencia |
|---|---|---|
| `web/server.js` | HTTP del panel: estáticos de ADMIN y CLIENTE, API, SSE y proxy de control e infraestructura | `server.js:338-412` |
| `web/poller.js` | sondeo de los nodos, foto agregada, líder y quórum; emite cambios por SSE | `poller.js:25`, `poller.js:147`, `poller.js:173` |
| `web/config.js` | `NODOS`, `PUERTO` 8090, `SERVIDORES`, `CONTROLADOR` y posiciones fijas del mapa | `config.js:18-39` |
| `web/servidor/servidor.js` | API del servidor de datos: `/info`, `/salud`, `/api/historial`, `/api/registro`, `/api/publico`, `/retencion` y `POST /acciones` | `servidor/servidor.js:31-65` |
| `web/servidor/bd.js` | esquema PostgreSQL y escritura sin duplicados de muestras, log, eventos, alertas, sucesos y acciones | `bd.js:8` |
| `web/servidor/consulta.js` | consultas paginadas y filtradas en la base, sin SQL construido con texto del usuario | `consulta.js:1-7` |
| `web/servidor/recolector.js` | consulta al ESP32 asignado y guardado en la base; una muestra cada 30 s | `recolector.js:3-6` |
| `web/servidor/retencion.js` | política de retención y archivado, desactivada por defecto | `retencion.js:1-10` |
| `web/controlador/controlador.js` | único servicio con el socket de Docker: `GET /estado`, `GET /salud` y `POST /servidores/N/apagar` o `/encender` | `controlador.js:1-12` |
| `web/nodo-sim/` | ESP32 simulado con el núcleo Raft real compilado para Linux (`nodo_sim.cpp`, `compilar.sh`) | `nodo_sim.cpp:1-5` |
| `web/fake/` | tres nodos falsos en 9001 a 9003, sin Raft, para demos | `cluster-falso.js:1-9` |
| `web/admin-src/` | fuente de la SPA ADMIN (React 19, Vite y Tailwind); se compila a `public/admin/` | `admin-src/package.json` |
| `web/public/admin/` | SPA ADMIN construida, servida en `/admin/` | `server.js:400` |
| `web/public/cliente/` | vista CLIENTE, servida en `/cliente/`; el mapa usa Leaflet vendorizado y teselas de OpenStreetMap | `server.js:401` |
| `web/scripts/verificar-esp32.js` | comprueba el contrato HTTP de los nodos reales; no escribe nada en las placas | `verificar-esp32.js:1-4` |
| `web/scripts/test-db.sh` y `test-infra.sh` | pruebas con tres PostgreSQL reales y con un proyecto Compose aislado | `scripts/test-db.sh`, `scripts/test-infra.sh` |
| `web/package.json` | guiones `start`, `fake`, `test`, `test:db` y `test:infra`; dependencia `pg` 8.23.1 | `package.json:6-13` |
| `web/Dockerfile` y `web/docker/` | imágenes del panel, nodos simulados, servidores de datos y controlador | `Dockerfile`, `docker/Dockerfile.*` |

API del panel:

- `GET /api/estado` entrega la foto agregada (`quorum`, `lider`, `fuente`, `nodos`, `log`, `alertas` y `sucesos`).
- `GET /api/stream` entrega el estado por SSE, con latido cada 5 s.
- `GET /api/infra` informa del controlador y de los servidores que puede apagar.
- `GET /api/servidores`, `GET /api/historial`, `GET /api/registro` y `GET /api/retencion` leen el histórico.
- `POST /api/nodos/{1|2|3}/control` y `POST /api/nodos/{1|2|3}/pulsar` envían órdenes a un nodo.
- `POST /api/infra/servidores/{1|2|3}/{apagar|encender}` apaga o enciende un servidor, con confirmación.

Los `POST` exigen `Content-Type: application/json`; los de infraestructura exigen además `{"confirmar":true}` y un `Origin` propio si el navegador lo envía. Las respuestas de error verificadas son 415 sin JSON, 413 con cuerpo de más de 4 KB y 404 para un nodo fuera de 1 a 3.

## 7.12 Pruebas rápidas de humo

Terminada la instalación, estas comprobaciones confirman que el stack responde antes de operar:

```bash
docker compose ps
curl -s -o /dev/null -w '/admin/ -> %{http_code}\n' http://127.0.0.1:8095/admin/
curl -s http://127.0.0.1:8095/api/estado | head -c 400; echo
docker compose exec -T nodo1 nodo-sim --salud; echo "salud=$?"
docker compose exec -T db1 psql -U vybra -d vybra -c 'SELECT 1;'
```

Esperado: 11 contenedores arriba, `/admin/` responde 200, `/api/estado` devuelve un JSON con `quorum`, `lider` y tres nodos, `nodo-sim --salud` termina con código 0 y PostgreSQL devuelve una fila con el valor 1.

Pruebas automatizadas rápidas:

```bash
cd web
npm install
npm test                 # 75 casos: 60 pasan, 15 omitidas, 0 fallan (16,6 s)
npm run test:db          # 75 casos: 70 pasan, 5 omitidas, 0 fallan (13,8 s)
npm run test:infra       # 5/5, 0 fallan (79,2 s); proyecto aislado vybraint
```

`npm test` omite solo las pruebas que necesitan PostgreSQL o Docker. `test:db` levanta tres PostgreSQL efímeros en `127.0.0.1:54431-54433` y `test:infra` usa un proyecto Compose aislado con puertos 18xxx y 19xxx, sin tocar el stack normal. La verificación funcional de punta a punta, con un evento del pulsador y la alerta resultante, está en la sección 8.2; el detalle de las suites y sus evidencias, en la sección 5.
