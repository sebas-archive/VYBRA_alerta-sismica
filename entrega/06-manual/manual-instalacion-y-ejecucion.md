# Manual de instalación y ejecución — Alerta Sísmica (VYBRA)

Documento autónomo para instalar, arrancar, operar y probar el sistema. Cada comando se verificó
contra el repositorio y contra el despliegue real del 2026-11-18; no hay valores inventados.

| Dato | Valor |
|---|---|
| Proyecto | Alerta Sísmica / VYBRA — clúster de 3 ESP32 con consenso Raft propio, agregador Node.js, panel ADMIN, vista CLIENTE y 3 servidores de datos con PostgreSQL |
| Versión declarada | `v1.0.0-rc1` (candidata; la definitiva se etiqueta tras la campaña física) |
| Commit entregado | `0ee5ed4a626c28904db55ab6e436e040c03f046c` (`0ee5ed4`, 2026-11-18 10:58:38 -05:00) |
| Tag `v1.0.0-rc1` | `f567487cc3488f4bcc0d570dc88858a0bccff562` (2026-11-17 16:33:15 -05:00); es **ancestro** de `0ee5ed4`, que está **49 commits por delante** y no tiene tag exacto |
| Licencia | MIT, © 2026 Sebastián Revelo (`LICENSE`) |
| Terceros | `THIRD-PARTY.md` |
| Fecha de verificación de este manual | 2026-11-18 (America/Bogota) |
| Alcance | Instalación en Linux del PC agregador; demo con Docker; uso con las 3 ESP32 reales |

> **El evento sísmico es simulado.** La entrada es un pulsador en GPIO4; no hay acelerómetro ni
> medición sismológica. El sistema demuestra consenso distribuido, replicación y agregación, no
> instrumentación sísmica.

---

## Índice

1. [Estado del sistema y qué se puede esperar](#1-estado-del-sistema-y-qué-se-puede-esperar)
2. [Requisitos](#2-requisitos)
3. [Obtener el código](#3-obtener-el-código)
4. [Configuración: `.env` y secretos](#4-configuración-env-y-secretos)
5. [Arranque con Docker (desarrollo)](#5-arranque-con-docker-desarrollo)
6. [ADMIN y CLIENTE](#6-admin-y-cliente)
7. [Servidores de datos y PostgreSQL](#7-servidores-de-datos-y-postgresql)
8. [Apagar y encender servidores desde ADMIN](#8-apagar-y-encender-servidores-desde-admin)
9. [Despliegue de producción](#9-despliegue-de-producción)
10. [Perfil HTTPS con Caddy](#10-perfil-https-con-caddy)
11. [Ejecución sin Docker](#11-ejecución-sin-docker)
12. [Pruebas](#12-pruebas)
13. [Firmware: compilación y flasheo](#13-firmware-compilación-y-flasheo)
14. [Uso con las ESP32 reales](#14-uso-con-las-esp32-reales)
15. [Solución de problemas](#15-solución-de-problemas)
16. [Apéndices](#16-apéndices)

---

## 1. Estado del sistema y qué se puede esperar

- **Software validado.** Pruebas del núcleo C++: 78/78; JavaScript: 75 casos (60 pasan y 15 se omiten
  sin Docker/PostgreSQL; con `test:db` pasan 70 y se omiten 5 de Docker); integración Docker: 5/5.
  La compilación del firmware termina sin errores para los tres nodos.
- **Campaña física en curso.** La preparación (P0) está completada con evidencias del 2026-11-17.
  La prueba T1 (evento con pulsador) **no se aprobó**: una pulsación produjo dos eventos cortos
  (301 ms y 174 ms) en lugar de uno de ~900 ms; el sistema replicó y confirmó correctamente y no
  creó alerta (correcto con un solo detector). La repetición depende de revisar el contactor.
  T2 en adelante están pendientes de autorización.
- **Demo Docker con Raft real.** Los tres contenedores `nodoN` compilan el **mismo núcleo Raft del
  firmware** para Linux y se hablan por UDP 4210; el líder se elige de verdad. El único simulador
  sin Raft que queda es `npm run fake`.
- **Limitaciones vigentes** (README §16): log de Raft en RAM (no durable), resincronización de
  emergencia, sin snapshots (tope 1000 entradas), sin autenticación ni cifrado de transporte en la
  API y en Raft, sin pre-vote ni check-quorum, `ForwardAck` al aceptar y no al confirmar, y el
  «quórum» del agregador es una inferencia (≥ 2 nodos disponibles que reconocen al mismo líder).

---

## 2. Requisitos

### 2.1 Hardware

| Elemento | Requisito real |
|---|---|
| Placas | 3 × ESP32 DevKit V1 (30 pines, USB-serial CP2102) |
| Cables USB | 3 × USB **de datos** (no solo carga); micro-USB o USB-C según la placa |
| Pulsadores | 3 (uno por placa), entre **GPIO4 (D4)** y **GND** (`INPUT_PULLUP`, activo en bajo) |
| LED | Azul integrado en **GPIO2** (sin cableado) |
| Protoboard y dupont | 1 protoboard y cables para los pulsadores |
| Alimentación | USB del PC para flashear; después cargador USB o el mismo PC |
| Red | Una sola red WiFi **2,4 GHz** con **DHCP**, broadcast permitido y **sin aislamiento de clientes** |
| Internet | Recomendable para NTP; sin hora (`con_hora:false`) no se forman alertas |
| PC | Linux x86_64 con puertos USB; el mismo PC ejecuta el agregador |
| Router | Sin AP isolation; el PC en la misma red que las placas |

No se necesita instrumentación sísmica: los eventos se generan con el pulsador.

### 2.2 Software del PC

| Herramienta | Versión mínima | Versión con la que se verificó (2026-11-18) | Uso |
|---|---|---|---|
| Linux | cualquiera moderno | Linux 7.3.3-1-cachyos x86_64 | sistema del agregador |
| `g++` | C++17 | GCC 16.2.1 | pruebas C++ y nodo simulado |
| `make` | GNU Make | 4.4.1 | pruebas C++ |
| Node.js | ≥ 22 | v26.13.0 | agregador, servidores de datos y pruebas |
| `arduino-cli` | 1.x | 1.5.1 | compilar y flashear el firmware |
| Core `esp32:esp32` | 3.3.12 | 3.3.12 | compilación del firmware |
| ArduinoJson | 7.x | 7.4.3 | firmware, pruebas y nodo simulado |
| Docker Engine + Compose v2 | — | Docker 29.9.3 | demo de 11 servicios y pruebas `test:db` / `test:infra` |
| `curl` | — | incluido en el sistema | comprobaciones HTTP |
| Navegador | Chromium/Firefox actuales | — | ADMIN y CLIENTE |
| `openssl` | — | incluido en el sistema | generar secretos de producción |
| `tcpdump`, `getent` | opcionales | — | comprobar descubrimiento y mDNS |

Instalación de lo que no venga en la distribución (Debian/Ubuntu y derivadas; el mecanismo exacto
depende de la distribución):

```bash
# Node.js ≥ 22, g++, make, curl: usa el gestor de paquetes de tu distribución o el instalador oficial de Node.js.
# arduino-cli: sigue la guía oficial de instalación de Arduino CLI.

arduino-cli core update-index
arduino-cli core install esp32:esp32@3.3.12
arduino-cli lib install ArduinoJson@7.4.3   # o copia ArduinoJson en ~/Arduino/libraries/ArduinoJson
```

El firmware y las pruebas C++ buscan ArduinoJson en `~/Arduino/libraries/ArduinoJson/src` por
defecto; si está en otra ruta, pásala con `JSON_DIR=...`.

### 2.3 Puertos

| Componente | Puerto / interfaz | Notas |
|---|---|---|
| ESP32 real (cada nodo) | HTTP **80**; Raft **UDP 4210**; descubrimiento **UDP 4211**; OTA **UDP 3232**; el PC recibe OTA en **TCP 32323** | firmware Arduino/ESP32 |
| Nodo simulado (Docker) | **8080** dentro del contenedor, publicado en el host en **9001/9002/9003**; Raft **UDP 4210** dentro de la red de Compose | compila el mismo núcleo Raft para Linux |
| Panel / agregador | **8090** dentro del contenedor; publicado en el host en **8095** por defecto (`PUERTO_PANEL`) | `web/server.js` |
| Servidores de datos | **8100** dentro de cada contenedor; publicados en **8101/8102/8103** | uno por ESP32 |
| PostgreSQL | **5432** solo en la red interna de Compose; **sin puerto publicado** | `postgres:16-alpine` |
| Controlador de infraestructura | **8200** solo en la red interna; **sin puerto publicado**; único con el socket de Docker | `web/controlador/` |
| Caddy (perfil `https`) | **8443** en el host | opcional, no arranca por defecto |

En una red compartida, abre solo el puerto del panel (8095 o el que elijas) y, si usas el perfil
HTTPS, el 8443. El panel **no tiene login**.

---

## 3. Obtener el código

### 3.1 Desde el snapshot entregado

El código fuente es el del repositorio, en el commit `0ee5ed4`. La guía de verificación está en
`entrega/02-codigo/README.md`; no hay ZIP ni snapshot duplicado.

```bash
cd alerta-sismica-0ee5ed4
git log -1 --format=%H    # debe ser 0ee5ed4a626c28904db55ab6e436e040c03f046c
```

El snapshot **no incluye** `firmware/detector/secretos.h` ni ningún `.env`: son secretos locales y
están en `.gitignore`. Debes crearlos siguiendo la sección 4. Tampoco incluye `node_modules/`
(se instala con `npm install`) ni los `web/certs/` y `web/datos/` locales.

### 3.2 Desde el repositorio Git

```bash
git clone <url-del-repositorio>
cd "detector de sismos en red distribuida"
git log -1 --format='%H%n%ad%n%s'
# Esperado para esta entrega:
#   0ee5ed4a626c28904db55ab6e436e040c03f046c
#   Fri Nov 18 10:58:38 2026 -0500
#   chore: retira material de diseño histórico, prompts y planes internos
```

> El tag `v1.0.0-rc1` apunta a `f567487`, **49 commits por detrás** de `HEAD` (`0ee5ed4`). No hagas
> `git checkout v1.0.0-rc1` si quieres el código de esta entrega; usa el commit `0ee5ed4`.
> La versión declarada en `README.md` y `VERSION` es `v1.0.0-rc1` porque la etiqueta definitiva
> `v1.0.0` se creará tras la campaña física.

### 3.3 Estructura del repositorio

```
.
├── firmware/                  firmware de los nodos
│   ├── detector/              código Arduino + núcleo portable en detector/src/nucleo/
│   ├── test/                  suite C++ con red Raft simulada
│   ├── cargar.sh              compilación y flasheo (USB / OTA)
│   ├── quien.sh               identificación de placas por MAC
│   └── placas.conf            registro MAC → número de detector
├── web/                       backend Node.js y interfaces
│   ├── server.js, poller.js, config.js
│   ├── servidor/              servidor de datos de cada ESP32 (PostgreSQL)
│   ├── controlador/           controlador de infraestructura (socket de Docker)
│   ├── nodo-sim/              ESP32 simulado con el núcleo Raft real (C++ para Linux)
│   ├── docker/                Dockerfiles de nodos, servidores y controlador
│   ├── admin-src/             fuente de la SPA ADMIN (build en admin-src/)
│   ├── public/                ADMIN construido, CLIENTE y recursos servidos
│   ├── fake/                  nodos simulados sin Raft (solo demo)
│   ├── scripts/               test-db.sh, test-infra.sh, verificar-esp32.js
│   └── test/                  suite Node
├── docs/
│   ├── prueba-hardware.md     campaña física con las tres placas
│   └── servidores-de-datos.md servidores de datos, PostgreSQL y apagar/encender
├── docker/Caddyfile           configuración del perfil HTTPS
├── docker-compose.yml         demo de 11 servicios (Raft real, PostgreSQL, controlador)
├── docker-compose.prod.yml    superposición de producción (secretos, sin puertos de datos)
├── entrega/                   entregables académicos y evidencias
├── README.md, VERSION, LICENSE, THIRD-PARTY.md, ejemplo.env
```

---

## 4. Configuración: `.env` y secretos

### 4.1 Variables de entorno del despliegue Docker

Docker Compose lee automáticamente un archivo `.env` en la raíz del proyecto. Parte de la plantilla
versionada:

```bash
cp ejemplo.env .env
# editar .env (está en .gitignore; no se versiona)
```

| Variable | Por defecto | Para qué |
|---|---|---|
| `NODO1_URL`, `NODO2_URL`, `NODO3_URL` | vacío (simulados) | URL de cada ESP32 real, sin barra final (p. ej. `http://192.168.1.50`) |
| `NODOS` | derivado de `NODO1_URL`... | lista que usa el panel (`http://n1,http://n2,http://n3`); solo para sobrescribir |
| `PUERTO_PANEL` | `8095` | puerto del panel en el host |
| `PUERTO_NODO1`, `PUERTO_NODO2`, `PUERTO_NODO3` | `9001`, `9002`, `9003` | puertos de los nodos simulados en el host |
| `PUERTO_SERVIDOR1`, `PUERTO_SERVIDOR2`, `PUERTO_SERVIDOR3` | `8101`, `8102`, `8103` | puertos de los servidores de datos en el host |
| `PUERTO_HTTPS` | `8443` | puerto del perfil HTTPS |
| `HOST_PUBLICO` | `192.168.80.227` (valor de ejemplo en Compose) | IP o nombre con el que entras al panel HTTPS |
| `DB_PASSWORD` | `vybra` | **solo desarrollo**; clave de las bases |
| `CONTROL_TOKEN` | `vybra-control-dev` | **solo desarrollo**; token entre panel y controlador |
| `RETENCION_*` | todo desactivado | retención y archivado del histórico (sección 7.4) |
| `PREFIJO` | `sismo` | prefijo de los nombres de contenedor |

`SERVIDORES`, `CONTROLADOR_URL` y `PUERTO` los fija `docker-compose.yml`; no hace falta
definirlos en `.env`.

### 4.2 Secretos del firmware

El firmware **no compila** sin `firmware/detector/secretos.h` (es un archivo local, ignorado por
Git: `WIFI_PASS`, `OTA_CLAVE` y `PORTAL_CLAVE`):

```bash
cd firmware/detector
cp secretos.ejemplo.h secretos.h
# editar secretos.h:
#   WIFI_PASS     contraseña de la red WiFi 2.4 GHz
#   OTA_CLAVE     clave de ArduinoOTA (la usa ./cargar.sh N --wifi)
#   PORTAL_CLAVE  clave WPA2 del AP de configuración (mínimo 8 caracteres)
```

El **SSID** no está en `secretos.h`: se define en `firmware/detector/config.h:6` (`WIFI_SSID`).
El valor versionado corresponde a la red de desarrollo; ajústalo a tu red antes de compilar.

Nunca subas `secretos.h`, `.env` ni `secretos/` a Git.

---

## 5. Arranque con Docker (desarrollo)

### 5.1 Arrancar el stack

Desde la raíz del repositorio:

```bash
docker compose config --services   # 11 servicios: nodo1-3, db1-3, servidor1-3, controlador y panel
docker compose up -d --build
```

La primera construcción necesita **red**: la imagen del nodo simulado descarga ArduinoJson 7.4.3
desde GitHub y las imágenes base se descargan de sus registros. Es normal que tarde varios minutos.

| Servicio | Contenedor | Imagen / construcción | Puerto en el host |
|---|---|---|---|
| `nodo1` | `sismo-nodo-1` | Debian 12 + binario `nodo-sim` (Raft real) | 9001 |
| `nodo2` | `sismo-nodo-2` | ídem | 9002 |
| `nodo3` | `sismo-nodo-3` | ídem | 9003 |
| `db1`, `db2`, `db3` | `sismo-db-1..3` | `postgres:16-alpine` | sin publicar |
| `servidor1` | `sismo-servidor-1` | Fedora Linux 42 | 8101 |
| `servidor2` | `sismo-servidor-2` | openSUSE Leap 15.6 | 8102 |
| `servidor3` | `sismo-servidor-3` | Ubuntu 24.04 | 8103 |
| `controlador` | `sismo-controlador` | Alpine + Node 22 | sin publicar |
| `panel` | `sismo-panel` | Alpine + Node 22 | 8095 |
| `https` (perfil) | `sismo-https` | `caddy:2-alpine` | 8443 (solo con `--profile https`) |

### 5.2 Comprobar que arrancó

```bash
docker compose ps
docker compose logs -f panel     # Ctrl+C para salir sin detener nada
```

Esperado: **11 contenedores arriba**; 10 con estado `healthy` y `panel` sin healthcheck (su estado
es `Up`). Los tres nodos forman clúster y eligen líder en unos segundos.

Comprobaciones rápidas:

```bash
curl -s -o /dev/null -w '/ -> %{http_code} %{redirect_url}\n' http://127.0.0.1:8095/
curl -s -o /dev/null -w '/admin/ -> %{http_code}\n' http://127.0.0.1:8095/admin/
curl -s http://127.0.0.1:8095/api/estado | head -c 400
docker compose exec -T nodo1 nodo-sim --salud
```

Resultados esperados: `/` responde 302 hacia `/admin/`; `/admin/` responde 200; `/api/estado`
devuelve un JSON con `quorum`, `lider` y tres nodos; `nodo-sim --salud` responde con éxito.

### 5.3 Detener

```bash
docker compose down        # detiene y elimina los contenedores; conserva los volúmenes de PostgreSQL
docker compose down -v     # además borra los volúmenes: se pierde el histórico de las bases
```

---

## 6. ADMIN y CLIENTE

| Vista | URL | Contenido |
|---|---|---|
| ADMIN | `http://127.0.0.1:8095/` → redirige a `/admin/` | Panorama, Sismógrafos, Alertas, Histórico, Clúster Raft, Servidores, Detectores, Registros y Configuración |
| CLIENTE | `http://127.0.0.1:8095/publico` → redirige a `/cliente/` | estado del servicio, último sismo y alertas, mapa, protocolo de actuación y ajustes |

- La SPA ADMIN se construye desde `web/admin-src/` y se sirve desde `web/public/admin/`; la vista
  CLIENTE se sirve desde `web/public/cliente/`.
- El estado llega por **SSE** (`/api/stream`); el latido de la conexión es de 5 s.
- La vista pública no muestra IP, WiFi, términos Raft, líder, órdenes ni muestras.
- El panel **no tiene login**: cualquiera que lo alcance en la red puede pulsar detectores o apagar
  servidores. En una red no confiable, ponlo detrás de un proxy con autenticación.
- Para abrirlo desde el móvil: `http://<IP-del-PC>:8095/` y permite el puerto en el firewall
  (`sudo ufw allow from <tu subred>/24 to any port 8095 proto tcp`).

---

## 7. Servidores de datos y PostgreSQL

### 7.1 Arquitectura

Cada ESP32 tiene asignado un servidor de datos con el **mismo número** y su propia base PostgreSQL:
`nodo1` → `servidor1` + `db1`; `nodo2` → `servidor2` + `db2`; `nodo3` → `servidor3` + `db3`.
Los ESP32 no guardan datos; el histórico vive en PostgreSQL. Detalle completo en
`docs/servidores-de-datos.md`.

### 7.2 Tablas

| Tabla | Contenido |
|---|---|
| `muestras` | estado del nodo (rol, término, log, confirmadas, pendientes, WiFi, alcanzable) al cambiar o cada 30 s |
| `log_entradas` | cada entrada del log Raft, con su estado de confirmación |
| `eventos` | lecturas/pulsaciones (nivel, PGA, duración, hora, recibido por) con su estado |
| `alertas` | alertas emitidas (promedio, nivel, eventos, término, líder, hora del último evento) |
| `sucesos` | elecciones, caídas, recuperaciones y demás eventos de Raft |
| `acciones` | pruebas y órdenes enviadas al nodo (pulsaciones, caídas, infraestructura) |
| `archivo_*` | copia de lo que archiva la retención (vacías mientras la retención esté desactivada) |

Como el log Raft está replicado en los tres ESP32, eventos, alertas y log de consenso existen en las
tres bases; muestras, sucesos y acciones son propios de cada nodo.

### 7.3 Consultar el histórico

Desde las interfaces:

- **ADMIN → Histórico**: eventos, alertas, muestras, actividad Raft, log de consenso y pruebas y
  órdenes, con filtros por servidor, nodo, categoría, estado y fechas, búsqueda y paginación.
- **CLIENTE → Avisos → Historial**: solo alertas y lecturas confirmadas, sin datos internos.

Por API (el panel lee de las tres bases):

```bash
curl -s 'http://127.0.0.1:8095/api/historial?tipo=eventos&servidor=todos&pagina=1&limite=10' \
  | python3 -m json.tool | head -40
curl -s 'http://127.0.0.1:8095/api/servidores' | python3 -m json.tool | head -30
```

Parámetros de `/api/historial`: `tipo` (`eventos`, `alertas`, `muestras`, `sucesos`, `log`,
`acciones`), `servidor` (`1`, `2`, `3`, `todos`), `pagina`, `limite` (1–200, 50 por defecto), `nodo`,
`categoria`, `estado`, `desde`, `hasta`, `q`, `orden` y `fuente` (`activo` o `archivo`).

En la base (no publica puerto; se entra por el contenedor):

```bash
docker compose exec -T db1 psql -U vybra -d vybra -c '\dt'
docker compose exec -T db1 psql -U vybra -d vybra -c 'SELECT count(*) FROM eventos;'
docker compose exec -T db1 psql -U vybra -d vybra -c 'SELECT id, nodo, nivel, duracion_ms FROM eventos ORDER BY id DESC LIMIT 10;'
```

Los nombres de columna pueden variar; `\d eventos` muestra el esquema vigente.

### 7.4 Retención y archivado

Por defecto **no se archiva ni se elimina nada**. Se configura con variables `RETENCION_*` en `.env`
o en el entorno (por ejemplo `RETENCION_ACTIVA=si`, `RETENCION_MODO=archivar`,
`RETENCION_MUESTRAS_DIAS=30`, `RETENCION_SUCESOS_DIAS=365`). `RETENCION_MODO=eliminar` exige
además `RETENCION_CONFIRMAR_ELIMINAR=si`. Las alertas y los eventos críticos (nivel ≥
`RETENCION_CRITICO_NIVEL`, 6 por defecto, o que forman parte de una alerta) no se eliminan nunca
automáticamente. `GET /api/retencion` informa qué afectaría la política sin modificar nada. Detalle
en `docs/servidores-de-datos.md`.

---

## 8. Apagar y encender servidores desde ADMIN

En **ADMIN → Servidores**, cada tarjeta tiene **Apagar servidor** y **Encender servidor**. Es un
apagado real de contenedores, con confirmación previa y aviso de las consecuencias para el clúster.

- **Apagar** detiene `nodoN` (ESP32 simulado) y `servidorN`; **no** toca `dbN` ni su volumen.
  **Encender** arranca `nodoN` y `servidorN`; la base sigue con los datos.
- El **controlador** es el único servicio con acceso al socket de Docker. Solo acepta
  `GET /estado`, `GET /salud` y `POST /servidores/{1|2|3}/{apagar|encender}`; hace `stop`/`start`
  únicamente de `nodoN`/`servidorN` de su propio proyecto de Compose. No publica puertos, corre con
  el sistema de archivos de solo lectura, sin capacidades y con `no-new-privileges`, y exige un token.
- El panel exige `Content-Type: application/json`, `{"confirmar":true}` y un `Origin` propio si el
  navegador lo envía (anti-CSRF).
- Con **ESP32 físicos** no existe el contenedor `nodoN`: «apagar» solo detiene el servidor de datos
  y hace una **desconexión lógica** de la placa (`POST /control {"accion":"caer"}`); la placa sigue
  con corriente. «Encender» arranca el servidor y hace `recuperar`.
- Cada orden queda registrada en la tabla `acciones` de la base del servidor afectado.

Referencia de la ruta del panel (normalmente se usa la interfaz, no `curl`):

```bash
curl -s -X POST http://127.0.0.1:8095/api/infra/servidores/2/apagar \
  -H 'Content-Type: application/json' -d '{"confirmar":true}'
```

---

## 9. Despliegue de producción

La superposición `docker-compose.prod.yml` se aplica **sobre** `docker-compose.yml` y cambia el
modelo de secretos y de puertos:

1. Genera los secretos fuera del repositorio (la carpeta `secretos/` está en `.gitignore`):

   ```bash
   mkdir -p secretos
   (umask 077; openssl rand -base64 32 > secretos/db_password.txt)
   (umask 077; openssl rand -base64 32 > secretos/control_token.txt)
   ```

2. Configura en `.env` los ESP32 reales (`NODO1_URL`, `NODO2_URL`, `NODO3_URL`). En producción no se
   arrancan los nodos simulados (`nodo1..3` quedan en el perfil `simulados`).

3. Valida y arranca:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml config --services
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
   ```

Qué garantiza la superposición:

- La clave de PostgreSQL llega como **secreto de archivo** (`POSTGRES_PASSWORD_FILE` y
  `DB_PASSWORD_FILE`), no como variable de entorno.
- Cada servidor de datos arranca con `VYBRA_ENTORNO=produccion` y **rechaza** una clave vacía o la
  de desarrollo (`vybra`).
- No se publica ningún puerto de las bases ni de los servidores de datos: solo el panel.
- El controlador y el panel usan `CONTROL_TOKEN_FILE` en vez de `CONTROL_TOKEN`.

Las variables `DB_PASSWORD` y `CONTROL_TOKEN` se anulan en la superposición (`!reset null`); no las
definas en `.env` para producción.

---

## 10. Perfil HTTPS con Caddy

El perfil `https` añade un servicio Caddy delante del panel con TLS interno (CA propia). No forma
parte de los 11 servicios por defecto.

1. Define en `.env` la IP o el nombre con el que entrarás (`HOST_PUBLICO`) y, si quieres, el puerto
   (`PUERTO_HTTPS`, por defecto 8443). El valor por defecto de `HOST_PUBLICO` en Compose es un
   ejemplo: cámbialo por el tuyo.
2. Arranca el perfil:

   ```bash
   docker compose --profile https up -d --build
   docker compose ps                      # debe aparecer también sismo-https
   ```

3. Entra a `https://<HOST_PUBLICO>:8443/admin/` o `https://<HOST_PUBLICO>:8443/cliente/`.
4. La primera vez el navegador avisará de que la CA no es de confianza. Descarga la CA en
   `https://<HOST_PUBLICO>:8443/ca.crt` e instálala como autoridad de confianza en cada dispositivo.
   Después deja de avisar.
5. Para detener solo este perfil: `docker compose --profile https stop https`.

El Caddyfile está en `docker/Caddyfile` (`tls internal`, proxy a `panel:8090`, `flush_interval -1`
para SSE y entrega de `/ca.crt`).

---

## 11. Ejecución sin Docker

### 11.1 Panel con Node.js

El panel no tiene dependencias (solo módulos nativos de Node):

```bash
cd web
npm start
# Panel:        http://localhost:8090/
# Vista pública: http://<IP-del-PC>:8090/publico
```

Si los nodos no resuelven por mDNS (o son ESP32 reales), indica sus URLs:

```bash
NODOS="http://IP1,http://IP2,http://IP3" npm start
```

Sin `SERVIDORES` no hay histórico; sin `CONTROLADOR_URL` la función de apagar/encender queda
desactivada. Para el histórico en local se puede arrancar un servidor de datos a mano, siempre que
exista un PostgreSQL accesible (por ejemplo uno instalado en el propio PC; la demo Docker ya lo
resuelve sin configuración):

```bash
cd web
npm install     # instala pg (dependencia del servidor de datos)
N=1 NODO_URL=http://127.0.0.1:9001 PUERTO=8100 \
  DATABASE_URL=postgres://vybra:vybra@127.0.0.1:5432/vybra \
  node servidor/servidor.js
```

### 11.2 Demo sin Raft (`npm run fake`)

```bash
cd web
npm run fake     # tres nodos falsos en 9001-9003, sin Raft
# en otra terminal:
NODOS="http://127.0.0.1:9001,http://127.0.0.1:9002,http://127.0.0.1:9003" npm start
```

Esta demo **no ejecuta Raft**: sirve para ver la interfaz sin hardware. Para la demo con Raft real,
usa Docker (sección 5).

### 11.3 Compilar el nodo simulado en el PC

```bash
JSON_DIR="$HOME/Arduino/libraries/ArduinoJson/src" bash web/nodo-sim/compilar.sh
# salida: web/nodo-sim/nodo-sim
```

El binario se ejecuta con las variables `N` (1–3), `PUERTO_HTTP` (8080), `PUERTO_RAFT` (4210) y
`PEER_1..PEER_3` (host:puerto de cada nodo); los detalles están en la cabecera de
`web/nodo-sim/nodo_sim.cpp`. Para el día a día conviene la demo Docker, que ya configura esos
valores.

---

## 12. Pruebas

Todas las cifras siguientes se re-ejecutaron el 2026-11-18 y están en
`entrega/05-pruebas/` y `entrega/04-evidencias/`.

### 12.1 Núcleo C++ (sin hardware)

El `Makefile` espera `../detector/src` respecto a la carpeta `test/`, así que copia ambos a un
directorio de trabajo (por ejemplo `/tmp`):

```bash
mkdir -p /tmp/vybra-cpp/detector
cp -a firmware/test /tmp/vybra-cpp/test
cp -a firmware/detector/src /tmp/vybra-cpp/detector/src
cd /tmp/vybra-cpp/test
make JSON_DIR="$HOME/Arduino/libraries/ArduinoJson/src" test
```

Resultado esperado: **78 ok, 0 fallas**, repartidos en `test_api` (9), `test_huella` (17),
`test_mensajes` (9), `test_raft` (32) y `test_sismo` (11). Para limpiar: `make limpiar`.

### 12.2 Node.js

```bash
cd web
npm install        # instala pg, necesario para el servidor de datos y sus pruebas
npm test           # 75 casos: 60 pasan, 15 omitidas, 0 fallos (16,6 s)
```

`npm test` incluye el controlador contra un Docker simulado por socket Unix y el Raft real con tres
procesos nativos. Las pruebas que necesitan PostgreSQL o Docker se **omiten** si no están
disponibles. Para exigirlas:

```bash
npm run test:db     # levanta 3 PostgreSQL efímeros (127.0.0.1:54431-54433)
                    # 75 casos: 70 pasan, 5 omitidas (solo infra), 0 fallos (13,8 s)

npm run test:infra  # proyecto Compose aislado "vybraint" (puertos 18xxx/19xxx)
                    # 5/5, 0 fallos (79,2 s): apagado/encendido, pérdida de quórum y recuperación
```

`test:db` requiere Docker y no publica las bases fuera de `127.0.0.1`; `test:infra` **no toca** el
stack normal y limpia su proyecto al terminar.

### 12.3 Compilación del firmware

Antes de compilar debe existir `firmware/detector/secretos.h` (sección 4.2).

```bash
arduino-cli compile --fqbn esp32:esp32:esp32 \
  --build-property "compiler.cpp.extra_flags=-DNODO=1" \
  --build-path /tmp/fw1 firmware/detector
```

Repite con `-DNODO=2` y `-DNODO=3`. Resultado medido el 2026-11-18:

| Nodo | `detector.ino.bin` | Flash | RAM |
|---|---|---|---|
| 1 | 1 105 728 B | 84 % | 54 264 B (16 %) |
| 2 | 1 105 728 B | 84 % | 54 264 B (16 %) |
| 3 | 1 105 712 B | 84 % | 54 264 B (16 %) |

Artefactos comunes de la salida: `bootloader` 24 992 B, `partitions` 3 072 B, `boot_app0` 8 192 B y
`merged` 4 194 304 B. (El README cita ≈ 1.106.048 B como referencia histórica; el valor vigente es
el de esta tabla.)

### 12.4 Verificar el contrato HTTP de los nodos

```bash
node web/scripts/verificar-esp32.js                                   # lee NODO1_URL..NODO3_URL
node web/scripts/verificar-esp32.js http://IP1 http://IP2 http://IP3  # o por argumentos
```

Comprueba `/estado`, `/log?desde=1`, `/sucesos?desde=0` y `/alertas` de cada nodo, avisa si un nodo
está en la posición equivocada y no escribe nada en las placas.

---

## 13. Firmware: compilación y flasheo

### 13.1 Preparación

1. Grupo de acceso al puerto serie (una vez; requiere cerrar y abrir sesión):

   ```bash
   sudo usermod -aG dialout "$USER"
   # alternativa inmediata, tras cada reconexión:
   sudo setfacl -m u:"$USER":rw /dev/ttyUSB*
   ```

2. Crea `firmware/detector/secretos.h` (sección 4.2) y ajusta `WIFI_SSID` en
   `firmware/detector/config.h:6`.
3. Conecta **una sola placa** y compruébala:

   ```bash
   lsusb | grep -iE "cp210|ch34|silicon|qinheng"
   ls -l /dev/ttyUSB* /dev/ttyACM*
   arduino-cli board list
   ```

### 13.2 Compilar y flashear por USB

El script `firmware/cargar.sh` compila con `-DNODO=N`, flashea por USB y registra la MAC en
`firmware/placas.conf` la primera vez:

```bash
cd firmware
./cargar.sh 1     # primera vez: registra la placa conectada como detector 1
./cargar.sh 2
./cargar.sh 3
```

En cargas posteriores, con una sola placa conectada, `./cargar.sh` sin número detecta el detector
por la MAC. `./cargar.sh <1|2|3> --forzar` permite renumerar una placa ya registrada como otro
detector; úsalo solo si es lo que quieres.

Si la placa está conectada pero el puerto no es el esperado, indícalo:
`./cargar.sh 1 /dev/ttyUSB0`.

Consola serie (115200):

```bash
arduino-cli monitor -p /dev/ttyUSB0 -c baudrate=115200
# esperado al arrancar:
#   Detector nodo-1 (Raft)
#   término guardado 0, voto 0
#   conectado a <SSID>, IP 192.168.x.x
```

### 13.3 Carga por WiFi (OTA)

```bash
cd firmware
./cargar.sh 1 --wifi               # busca sismo-nodo-1.local por mDNS
IP=192.168.1.50 ./cargar.sh 1 --wifi   # o da la IP
```

El PC debe aceptar conexiones entrantes en **TCP 32323** desde la red de las placas:

```bash
sudo ufw allow from <tu-subred>/24 to any port 32323 proto tcp
```

La contraseña OTA (`OTA_CLAVE`) se configura en `secretos.h`. Tras reiniciar, el nodo vuelve al
clúster y se pone al día desde el líder.

### 13.4 Portal de configuración WiFi

El firmware crea el AP `SISMO-D<N>-config` si no logra conectarse al arrancar, si se pulsa EN dos
veces en menos de 3 s o si se mantiene el pulsador ≥ 3 s al encender. Conéctate con la clave
`PORTAL_CLAVE` (mínimo 8 caracteres; no se imprime por el puerto serie), abre la IP del portal
(192.168.4.1 por defecto; el monitor serie imprime la real), elige la red, escribe la contraseña y
guarda. Si no se configura en 5 minutos, la placa reinicia y reintenta. **No cambies de red durante
la campaña**: puede dejar el clúster incomunicado.

### 13.5 Hora (NTP)

El firmware sincroniza por NTP cada 10 minutos en la zona UTC−5. Sin internet los nodos funcionan,
pero `con_hora` es `false` y **no se forman alertas**. Comprueba `"con_hora":true` en `/estado`
antes de la campaña.

---

## 14. Uso con las ESP32 reales

### 14.1 Flashear y encender

1. Flashea las tres placas una a la vez (sección 13) y etiquétalas **SIS-D1**, **SIS-D2** y
   **SIS-D3**.
2. Aliméntalas y espera 8–20 s (DHCP + elección de líder de 5–9 s).
3. Comprueba que hay **exactamente un** nodo con `"rol":"lider"` y que los tres tienen el mismo
   `termino` y `lider_conocido`:

   ```bash
   getent hosts sismo-nodo-1.local sismo-nodo-2.local sismo-nodo-3.local
   for i in 1 2 3; do curl -s -m 2 "http://IP$i/estado"; echo; done
   ```

   El LED azul queda fijo cuando el nodo conoce al líder; parpadea a 1 Hz sin líder.
   El `WebServer` del ESP32 atiende un cliente por vez: no dejes abiertas las páginas de estado de
   las placas durante la demo.

### 14.2 Conectar el agregador a las placas

1. Copia la plantilla y apunta a las IPs reales:

   ```bash
   cp ejemplo.env .env
   # descomenta y ajusta:
   #   NODO1_URL=http://IP1
   #   NODO2_URL=http://IP2
   #   NODO3_URL=http://IP3
   ```

   El número de la variable debe coincidir con el `nodo` que responde cada placa. Si mDNS funciona
   también sirven `http://sismo-nodo-N.local`; dentro de un contenedor suele hacer falta la IP
   (conviene reservarla en el router).

2. Verifica el contrato antes de conectar:

   ```bash
   node web/scripts/verificar-esp32.js
   ```

3. Arranca **sin los nodos simulados** (el controlador sigue disponible para apagar/encender los
   servidores de datos):

   ```bash
   docker compose up -d --build --no-deps panel servidor1 servidor2 servidor3 db1 db2 db3 controlador
   ```

   Si antes estaban arriba los simulados, deténlos: `docker compose stop nodo1 nodo2 nodo3`. Si
   cambiaste `.env`, `up -d` recrea los contenedores afectados.

4. Abre `http://127.0.0.1:8095/` (ADMIN) y `http://127.0.0.1:8095/publico` (CLIENTE).

En este modo, «apagar servidor» desde ADMIN detiene el servidor de datos y hace una desconexión
lógica de la placa (la placa sigue con corriente); «encender» arranca el servidor y la reincorpora a
Raft. Ver `docs/servidores-de-datos.md`.

La campaña física completa (casos 1–10: eventos con pulsador, replicación, alerta por coincidencia,
caída del líder, failover, recuperación, sin quórum y métricas) está en `docs/prueba-hardware.md`;
el procedimiento resumido de conexión está en `conexion-esp32.md`, en esta misma carpeta.

---

## 15. Solución de problemas

### 15.1 Docker y contenedores

| Síntoma | Causa probable | Solución |
|---|---|---|
| `Cannot connect to the Docker daemon` | Docker no está arrancado o el usuario no tiene permiso | Arranca Docker (`sudo systemctl start docker`) y comprueba `docker info` |
| `docker compose up` falla al construir `nodo1..3` | Sin red en la primera construcción: descarga ArduinoJson 7.4.3 | Comprueba la conexión y reintenta `docker compose up -d --build` |
| `El puerto 8095 está ocupado. Cierra el otro programa o usa otro con la variable PUERTO.` | Otro proceso usa el puerto del panel | Cambia `PUERTO_PANEL` en `.env` y recrea: `docker compose up -d panel` |
| Un contenedor queda `unhealthy` | El nodo no responde dentro del healthcheck | `docker compose logs <servicio>` y `docker compose exec -T nodo1 nodo-sim --salud` |
| `panel` no aparece como `healthy` | El panel no tiene healthcheck | Es normal: comprueba con `docker compose ps` (debe estar `Up`) y `curl http://127.0.0.1:8095/api/estado` |
| Quiero ver el panel desde el móvil y no carga | Firewall del PC | `sudo ufw allow from <tu subred>/24 to any port 8095 proto tcp` |
| Tras `docker compose down -v` desapareció el histórico | `-v` borra los volúmenes de PostgreSQL | No uses `-v` si quieres conservar los datos |

### 15.2 Servidores de datos y producción

| Síntoma | Causa probable | Solución |
|---|---|---|
| El servidor no arranca y registra `En producción la base de datos no puede usar una clave vacía ni la de desarrollo ("vybra"). Usa DB_PASSWORD_FILE.` | Producción con clave vacía o de desarrollo | Genera `secretos/db_password.txt` y usa la superposición `docker-compose.prod.yml` |
| `Falta DATABASE_URL o DB_HOST (+ DB_NAME, DB_USER, DB_PASSWORD_FILE)` | Entorno del servidor incompleto | Revisa las variables del servicio; en Compose las pone `docker-compose.yml` |
| `Falta NODO_URL (el ESP32 asignado a este servidor)` | Servidor sin nodo asignado | Define `NODO1_URL`, `NODO2_URL` y `NODO3_URL` (o `NODO_URL` en ejecución manual) |
| ADMIN muestra una base caída pero las demás responden | Una base no responde | El panel indica `ok:false` para esa base; revisa `docker compose ps dbN` y `docker compose logs dbN` |
| El histórico sale vacío | Retención no es la causa (está desactivada); los servidores no ven al nodo o no hay datos aún | Comprueba `/info` de `servidorN` y que el nodo asignado responda |

### 15.3 Panel y operación

| Síntoma | Causa probable | Solución |
|---|---|---|
| El panel arranca pero todo sale «sin conexión» | Los nodos no resuelven por mDNS o están en otra red | Usa `NODOS="http://IP1,http://IP2,http://IP3"` o `NODO*_URL` en `.env` |
| No funciona apagar/encender | `CONTROLADOR_URL` vacío, controlador caído o token distinto | Comprueba `docker compose ps controlador` y que el panel tenga `CONTROLADOR_URL` y el mismo token |
| El controlador responde 401 `no autorizado` | Token distinto entre panel y controlador | Usa el mismo `CONTROL_TOKEN` (o el mismo `CONTROL_TOKEN_FILE`) en ambos |
| El panel dice «El controlador de infraestructura no responde» | El controlador no está arriba o falta en el proyecto | `docker compose up -d controlador` y revisa `docker compose logs controlador` |
| No suena la alarma | El navegador bloquea el audio hasta una interacción del usuario | Pulsa en la página antes de probar el sonido; el botón de Configuración se convierte en «Detener sonido» mientras suena |

### 15.4 Pruebas

| Síntoma | Causa probable | Solución |
|---|---|---|
| `npm run test:db` falla al arrancar | Docker no disponible o puertos 54431–54433 ocupados | Arranca Docker; detén el proceso que use esos puertos; el script limpia sus contenedores `vybra-test-pgN` |
| `npm run test:infra` falla al arrancar | Proyecto `vybraint` residual o puertos 18xxx/19xxx ocupados | `docker compose -p vybraint down -v --remove-orphans` y reintenta |
| Las pruebas C++ no encuentran ArduinoJson | `JSON_DIR` incorrecto | Instala ArduinoJson 7.x o pasa `JSON_DIR=/ruta/a/ArduinoJson/src` |
| `make` no encuentra `../detector/src` | Se ejecutó dentro del repositorio | Copia `firmware/test` y `firmware/detector/src` a un directorio común como en la sección 12.1 |

### 15.5 Firmware y placas

| Síntoma | Mensaje real / causa | Solución |
|---|---|---|
| Compilación o carga sin secretos | `Falta firmware/detector/secretos.h con las claves (copia secretos.ejemplo.h)` | `cp secretos.ejemplo.h secretos.h` y edítalo |
| No aparece ninguna placa | `No hay ningún ESP32 conectado (no aparece /dev/ttyUSB*). Revisa el cable USB o usa --wifi.` | Cable de datos, otro puerto USB, revisa `dmesg` |
| Hay más de una placa conectada | `Hay varias placas conectadas: ... Conecta solo una o indica el puerto.` | Deja una sola placa o indica el puerto (`/dev/ttyUSB0`) |
| `Permission denied` al puerto | Falta el grupo `dialout` | `sudo usermod -aG dialout "$USER"` (nueva sesión) o `sudo setfacl -m u:"$USER":rw /dev/ttyUSB*` |
| OTA no encuentra la placa | `No encuentro sismo-nodo-N.local. Mira su IP en el monitor serie y usa: IP=x.x.x.x ./cargar.sh N --wifi` | Usa la IP explícita y abre TCP 32323 en el firewall |
| No hay líder y el LED parpadea a 1 Hz | Broadcast bloqueado o AP isolation | Desactiva el aislamiento de clientes; usa un router normal (no un hotspot con aislamiento) |
| Los nodos se ven pero no hay commit | Sin quórum (menos de 2 de 3 nodos disponibles) | Enciende las tres placas |
| `"con_hora":false` | Sin NTP (sin internet) | Da internet al router; sin hora no se forman alertas |
| El panel no ve las placas por mDNS | Falta `avahi`/`nss-mdns` o la red no lo permite | Usa IPs explícitas en `NODOS` |
| `verificar-esp32.js` avisa de posición incorrecta | `NODO1_URL` no es el ESP32 que responde `nodo:1` | Corrige el orden de las URLs |
| Los eventos del pulsador son dobles | Contactor del pulsador (incidencia real de T1) | Revisa el pulsador/contactor; no es un fallo del firmware (ver `entrega/10-informes-fase3/diagnostico-pulsador.md`) |

---

## 16. Apéndices

### 16.1 Rutas y archivos de referencia

| Tema | Archivo |
|---|---|
| Descripción general y limitaciones | `README.md` (§14 estructura, §15 estado, §16 limitaciones) |
| Campaña física con las placas | `docs/prueba-hardware.md` |
| Servidores de datos, PostgreSQL y apagar/encender | `docs/servidores-de-datos.md` |
| Conexión resumida de las ESP32 | `entrega/06-manual/conexion-esp32.md` |
| Código entregable y repositorio | `entrega/02-codigo/README.md` |
| Evidencias y su citación | `entrega/04-evidencias/`, `entrega/05-pruebas/datos/inventario-evidencias.csv` |
| Glosario, bibliografía y trazabilidad | `entrega/09-anexos/` |
| Licencia y terceros | `LICENSE`, `THIRD-PARTY.md` |

### 16.2 Licencia

Código y documentación originales bajo licencia **MIT**, © 2026 Sebastián Revelo. Las dependencias
de terceros (ArduinoJson, core ESP32, Node.js, imágenes base, tipografía Inter) conservan sus
licencias y no se distribuyen con el repositorio; véase `THIRD-PARTY.md`.

### 16.3 Advertencia sobre el alcance

El sistema **no mide sismos**: el evento se simula con un pulsador y la escala de nivel/PGA es de
simulación (`nivel = min(10, 1 + ms/450)`, `pga = 0.028·nivel + 0.015`). No debe usarse para
alertas sísmicas reales.
