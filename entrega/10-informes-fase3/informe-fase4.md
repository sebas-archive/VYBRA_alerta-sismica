# Informe de Fase 4 — consolidación del sistema (estado del 2026-11-18)

| Dato | Valor |
|---|---|
| Proyecto | `detector de sismos en red distribuida` (Alerta Sísmica / VYBRA) |
| Fase | 4 — consolidación: servidores de datos, PostgreSQL, ADMIN nuevo, controlador de infraestructura y demo con Raft real |
| Fecha del informe | **2026-11-18** (America/Bogota) |
| Commit | `0ee5ed4a626c28904db55ab6e436e040c03f046c` (`0ee5ed4`), 2026-11-18 10:58:38 -05:00 |
| Versión declarada | `v1.0.0-rc1` (`README.md:12`, `VERSION:3`). El tag `v1.0.0-rc1` apunta a `f567487`, **49 commits por detrás de `HEAD`** |
| Fuentes de cifras | `/tmp/entrega-facts.md` (ficha canónica v2 FINAL del 2026-11-18 11:23) y re-ejecución de pruebas del verificador |
| Informe anterior | [`informe-fase3.md`](informe-fase3.md) (estabilización, 2026-11-17) |

**Alcance.** Este informe documenta lo construido entre el cierre de la Fase 3 (2026-11-17) y el
estado actual: persistencia histórica en tres PostgreSQL, interfaces ADMIN/CLIENTE nuevas, vista
Histórico, apagado y encendido real de servidores con un controlador aislado, nodo simulado con el
núcleo Raft real, HTTPS opcional y la re-ejecución completa de validaciones. No se ha inventado
ninguna cifra: las que aparecen están en la ficha canónica o en los logs de evidencia citados.

**Rutas:** las citas de archivo y línea son relativas a la raíz del repositorio salvo que se indique otra cosa; los enlaces entre informes son relativos a esta carpeta.


---

## 1. Resumen de la consolidación

| Área | Resultado |
|---|---|
| Persistencia | **3 servidores de datos**, uno por ESP32, cada uno con su **PostgreSQL 16**: histórico de muestras, log de Raft, eventos, alertas, sucesos y acciones |
| Vista Histórico | En **ADMIN** (paginada, filtros, detalle) y en **CLIENTE** (solo alertas y lecturas confirmadas) |
| ADMIN nuevo | SPA React con 9 pestañas; `/` redirige a `/admin/` |
| CLIENTE | SPA en `/publico` → `/cliente/` |
| Apagado/encendido | Real desde ADMIN, a través de un **controlador aislado** con el único socket de Docker del sistema |
| Nodo simulado | `web/nodo-sim/` compila el **mismo núcleo Raft del firmware** para Linux |
| HTTPS | **Caddy** opcional en perfil `https`, TLS interno en `:8443` |
| Docker | **11 servicios** por defecto, los 11 en ejecución |
| Pruebas | C++ **78/78**, JS **75** (60 pasan + 15 omitidas), `test:db` **70+5**, `test:infra` **5/5**, firmware **3/3**, nodo simulado **275 392 B** |
| Campaña física | P0 completada; **T1 no aprobada**; T2 en adelante pendientes |

La demo de la Fase 3 (nodos de demostración sin Raft) fue sustituida: **la demo Docker actual ejecuta
Raft real**. La única simulación sin Raft que queda es `npm run fake` (`README.md:180`).

---

## 2. Cronología de lo incorporado el 2026-11-18

Commits verificados en el historial actual (`git log --since='2026-11-18 00:00'`). Todos pertenecen
a la línea de `HEAD` (el último es `HEAD`); la hora es la del commit.

| Hora | Commit | Contenido |
|---|---|---|
| 02:17 | `381bdc8` | rutas `/admin/` y `/cliente/`, audio mp3 con Range y pruebas |
| 02:17 | `b1d131d` | integración del frontend CLIENTE con datos reales del clúster |
| 02:17 | `f51d701` | integración del frontend ADMIN nuevo con datos y acciones reales |
| 02:58 | `b7c999c` | pestaña Servidores con sistema, detector, sincronización, rol y enlaces |
| 03:09 | `b3ad249` | histórico en disco de eventos, alertas y sucesos; `/api/historial` |
| 03:19 | `d1ed4b4` | cada ESP32 con su servidor y su PostgreSQL |
| 03:29 | `94e7489` | histórico paginado con filtros, detalle, retención configurable y pruebas con 3 PostgreSQL reales |
| 03:38 | `dc5fee3` | vista Histórico en ADMIN y Historial público en CLIENTE; documentación de retención y seguridad |
| 03:38 | `6acd57d` | Caddy con certificado local delante del panel (`:8443`) |
| 04:27 | `2a054a1` | **nodo simulado** con el núcleo Raft real del firmware compilado para Linux |
| 04:27 | `53d1f82` | **controlador** de infraestructura aislado con acceso a Docker |
| 04:27 | `9ece5fb` | compose con ESP32 simulados, controlador y parámetros para pruebas |
| 04:27 | `64e350a` | apagar/encender servidor desde su tarjeta y detener el ensayo de sonido |
| 04:27 | `b320c56` | prueba de integración real con Docker en el proyecto aislado `vybraint` |
| 04:36 | `f40527f` | documentación de cifras reales de pruebas y servicios |
| 04:40 | `b8a3e44` | Caddy en perfil opcional y nombre de contenedor parametrizable |
| 10:58 | `0ee5ed4` | retirada del material de diseño histórico, prompts y planes internos |

---

## 3. Arquitectura y puertos reales

Clúster de 3 nodos ESP32 con Raft propio (elección, replicación, commit, forward) + agregador Node.js
+ 3 servidores de datos con PostgreSQL + panel ADMIN + vista CLIENTE + controlador de
infraestructura + Caddy opcional. Fuente: `/tmp/entrega-facts.md` §2; `docker-compose.yml`;
`firmware/detector/config.h:10-21`.

| Componente | Puerto / interfaz | Notas |
|---|---|---|
| ESP32 real (cada nodo) | HTTP **80**; Raft **UDP 4210**; descubrimiento **UDP 4211**; OTA **UDP 3232** (el PC recibe en **TCP 32323**) | `firmware/detector/detector.ino`; `firmware/detector/config.h:10-21` |
| Nodo simulado | HTTP **8080** en el contenedor, publicado en host **9001/9002/9003**; Raft **UDP 4210** dentro de la red de compose | `docker-compose.yml:60-89` |
| Panel / agregador | Contenedor **8090**, publicado en host **8095** | `docker-compose.yml:165-180` |
| Servidores de datos | Contenedor **8100**, publicados en host **8101/8102/8103** | `docker-compose.yml:106-144` |
| PostgreSQL | **5432** solo en la red interna; **sin puerto publicado** | `docker-compose.yml:45-56` |
| Controlador de infraestructura | **8200** solo en la red interna; **sin puerto publicado** | `docker-compose.yml:146-163` |
| Caddy (perfil `https`) | **8443** host | `docker-compose.yml:189-203`; `docker/Caddyfile` |
| Rutas del panel | `/` → **302 `/admin/`**; `/publico` → **302 `/cliente/`** | `web/server.js:400-402`; comprobado con `curl` el 2026-11-18 |

Mensajes Raft (6 tipos): `VoteReq`, `VoteResp`, `Append`, `AppendResp`, `Forward`, `ForwardAck`
(`README.md:162`). El firmware y su contrato HTTP no cambiaron para conectar ESP32 reales: el panel
los toma por `NODO1_URL..NODO3_URL` (`docs/servidores-de-datos.md:77-83`).

---

## 4. Servidores de datos y PostgreSQL

**Diseño.** Cada ESP32 tiene asignado un servidor de datos con su propia base PostgreSQL
(`docs/servidores-de-datos.md:1-13`). Los ESP32 no guardan datos: transportan y consensúan. El
histórico vive en PostgreSQL, que es la única fuente de verdad (`docs/servidores-de-datos.md:5`).

| Tabla | Contenido |
|---|---|
| `muestras` | estado del nodo (rol, término, log, confirmadas, pendientes, WiFi, alcanzable) |
| `log_entradas` | cada entrada del log Raft y si está confirmada por la mayoría |
| `eventos` | pulsaciones/lecturas con nivel, PGA, duración, hora y estado de confirmación |
| `alertas` | alertas emitidas con promedio, nivel, eventos, término y líder |
| `sucesos` | elecciones, caídas y recuperaciones |
| `acciones` | pruebas y órdenes enviadas al nodo (pulsaciones y caídas simuladas) |
| `archivo_*` | copia de lo que archiva la retención (una por tabla; vacías si no se activa) |

Fuente y esquema: `web/servidor/bd.js:12-51`; contenido funcional: `docs/servidores-de-datos.md:15-28`.
Las tres bases comparten los datos replicados (eventos, alertas, log); muestras, sucesos y acciones
son propios de cada nodo.

**Escritura sin duplicados.** Cada registro tiene clave natural (id del evento, `índice|término|clase`
del log, `nodo|seq|hora` del suceso): se escribe una vez y se marca confirmado cuando la mayoría lo
acepta. Las órdenes llevan un `ref` único, de modo que un reintento no crea otro registro
(`docs/servidores-de-datos.md:26`).

**Retención.** Desactivada por defecto (`RETENCION_ACTIVA=no` en `docker-compose.yml:35`). Los eventos
críticos y las alertas están protegidos; el resto se puede archivar o eliminar con confirmación
explícita (`docs/servidores-de-datos.md:57-75`). El crecimiento estimado es de 1,7 MB/día por servidor
dominado por las muestras (documentado en la misma sección).

**API.** El panel expone `GET /api/servidores`, `GET /api/historial`, `GET /api/registro`,
`GET /api/publico/historial` y `GET /api/retencion` (`web/server.js:353-395`;
`docs/servidores-de-datos.md:31-51`). Cada servidor de datos expone `/info`, `/salud`,
`/api/historial`, `/api/registro`, `/api/publico`, `/retencion` y `POST /acciones`
(`docs/servidores-de-datos.md:51`).

**Producción.** `docker-compose.prod.yml` usa secretos (`POSTGRES_PASSWORD_FILE`,
`DB_PASSWORD_FILE`, `CONTROL_TOKEN_FILE`), no publica el puerto de las bases ni de los servidores de
datos y rechaza arrancar con la clave de desarrollo (`docs/servidores-de-datos.md:85-93`).

---

## 5. Vista Histórico en ADMIN y CLIENTE

**ADMIN → Histórico.** Lee las bases PostgreSQL de los tres servidores: pestañas por tipo
(eventos, alertas, muestras, actividad Raft, log de consenso, pruebas y órdenes), filtros por
servidor, nodo, categoría, estado y rango de fechas, búsqueda, paginación (25–200) y detalle con el
JSON guardado (`docs/servidores-de-datos.md:53-55`; `web/server.js:362-382`). La paginación y los
filtros se ejecutan en PostgreSQL con `LIMIT/OFFSET` y `count(*)`, sin cargar el histórico completo
(`docs/servidores-de-datos.md:47`).

**CLIENTE → Avisos → Historial.** Muestra solo alertas confirmadas y lecturas confirmadas de la
instalación local, con filtro por periodo, paginación y detalle plegable; no expone IP, WiFi,
términos Raft, líder, órdenes ni muestras (`docs/servidores-de-datos.md:55`).

**Modo «todos» y tolerancia a fallos.** Con `servidor=todos` el panel pide a cada base solo los
primeros `pagina×limite` registros y los mezcla (máximo 1000); los datos replicados se muestran una
vez con la lista de servidores que los contienen. Si una base no responde, el resto sigue y la
respuesta indica `ok:false` para esa base; con `servidor=N` caído responde 502
(`docs/servidores-de-datos.md:48-49`).

---

## 6. ADMIN nuevo y vista CLIENTE

**ADMIN** en `/admin/` (SPA React compilada desde `web/admin-src/`, servida desde
`web/public/admin/`). Pestañas verificadas en `web/admin-src/src/App.tsx:25,104-120`:

| Pestaña | Contenido (rótulo de la interfaz) |
|---|---|
| Panorama | Salud del sistema y actividad sísmica |
| Sismógrafos | Espacio de trabajo de señales sincronizadas |
| Alertas | Alertas emitidas |
| Histórico | Registros guardados en las bases de datos de los servidores |
| Clúster Raft | Infraestructura de consenso y replicación |
| Servidores | Infraestructura: nodos ESP32, sistema, estado y sincronización |
| Detectores | Gestión de detectores ESP32 |
| Registros | Historial de eventos replicado |
| Configuración | Preferencias de la interfaz de ADMIN |

`/` redirige a `/admin/`; `web/public/operador.html` queda como respaldo estático y **no** es la UI
vigente (`web/server.js:400-402`; `/tmp/entrega-facts.md` §6).

**CLIENTE** en `/publico` → `/cliente/`: estado del servicio, sismo/alertas, mapa con Leaflet
vendorizado en `web/public/cliente/vendor/leaflet/` y teselas de OpenStreetMap
(`https://tile.openstreetmap.org/{z}/{x}/{y}.png`, `web/public/cliente/js/cliente-app.js:688`),
protocolo de actuación, historial y ajustes (`web/server.js:401`). El mapa SVG propio es el del
ADMIN, no el del CLIENTE. La afirmación de `README.md:194-198` («mapa SVG propio, sin Leaflet ni
teselas externas») es válida para el ADMIN pero está desactualizada para el CLIENTE; se detalla en
la sección 18 de discrepancias.

---

## 7. Apagado y encendido real de servidores

Desde las tarjetas de **ADMIN → Servidores** se apaga y enciende de verdad, con confirmación previa y
consecuencias del clúster calculadas (`README.md:302-319`; `docs/servidores-de-datos.md:99-119`).

| Acción | Efecto real |
|---|---|
| Apagar servidor N | Detiene el contenedor `nodoN` (ESP32 simulado con Raft real) y `servidorN` |
| Lo que permanece | `dbN` y su volumen (los datos se conservan), los otros dos servidores y nodos, el panel y el controlador |
| Encender servidor N | Arranca `nodoN` y `servidorN`; la base no se toca. El nodo vuelve como seguidor y Raft le reenvía lo pendiente |
| Con ESP32 físicos | «Apagar» solo detiene el servidor de datos y hace desconexión lógica (`POST /control {"accion":"caer"}`); la placa sigue con corriente |

**Controlador aislado.** `web/controlador/controlador.js` es el único servicio con el socket de
Docker. Solo acepta `GET /estado`, `GET /salud` y `POST /servidores/{1|2|3}/{apagar|encender}`
(`web/controlador/controlador.js:4,138,150-153`); de la petición solo salen un número y una de dos palabras; hace
`stop`/`start` de `nodoN` y `servidorN` de su propio proyecto y **nunca** de `dbN`. No publica puertos,
corre con `read_only`, `cap_drop: ALL` y `no-new-privileges`, y exige token
(`docker-compose.yml:146-163`).

**Protección del panel.** Exige `application/json`, `{"confirmar":true}` y `Origin` propio
(anti-CSRF); no tiene login, por lo que en una red no confiable debe ir detrás de un proxy con
autenticación (`README.md:314-315`).

**Registro.** Cada orden se guarda en la tabla `acciones` del servidor afectado antes de apagar y, al
encender, cuando vuelve a responder (`docs/servidores-de-datos.md:117`).

**Verificación automatizada.** `npm run test:infra` levanta el proyecto aislado `vybraint`
(puertos 18xxx/19xxx y volúmenes propios), apaga y enciende cada servidor y comprueba contenedores,
volúmenes, cambio de líder, quórum, pérdida de quórum y recuperación: **5/5, 0 fallan**, 79,2 s
(`/tmp/entrega-facts.md` §4).

---

## 8. Nodo simulado con Raft real

`web/nodo-sim/nodo_sim.cpp` compila `firmware/detector/src/nucleo/*` para Linux: el ESP32 simulado
usa el mismo núcleo Raft, el mismo protocolo UDP 4210 y el mismo contrato HTTP
(`README.md:178,297-300`; `docs/servidores-de-datos.md:106`). Por eso los tres contenedores `nodoN`
eligen líder, replican y confirman de verdad entre ellos.

Consecuencias verificadas:

1. Al apagar un contenedor, los otros dos dejan de recibir sus latidos y lo detectan solos; si era el
   líder, eligen otro (término +1).
2. Con 2 de 3 se sigue confirmando por mayoría; con 1 de 3 no hay quórum y los eventos quedan
   aceptados pero sin confirmar (`log_len > commit_index`) hasta que vuelva la mayoría.
3. El binario del nodo simulado pesa **275 392 B** (`/tmp/entrega-facts.md` §4).

`npm run fake` sigue existiendo solo para demos sin Raft y el compose no lo usa
(`README.md:282-288`; `/tmp/entrega-facts.md` §6).

---

## 9. HTTPS opcional con Caddy

Perfil `https` del compose, arrancado con `docker compose --profile https up -d`; **no forma parte de
los 11 servicios por defecto** (`docker-compose.yml:189-203`).

| Aspecto | Implementación |
|---|---|
| Puerto | **8443** host → 8443 contenedor (`docker-compose.yml:199`) |
| Certificado | `tls internal` (CA local de Caddy); se entrega en `/ca.crt` para instalarla como autoridad de confianza (`docker/Caddyfile`) |
| Proxy | `panel:8090` con `flush_interval -1` (SSE sin buffering) |
| Persistencia | Volumen `sismo-caddy` para los datos de la CA |

---

## 10. Los 11 servicios de la demo Docker

`docker compose config --services` devuelve 11 servicios; `docker compose config --profiles`
devuelve `https`. Fuente: `/tmp/entrega-facts.md` §3 y `docker-compose.yml`.

| # | Servicio | Imagen / build | Contenedor | Puertos host | Perfil |
|---|---|---|---|---|---|
| 1 | `nodo1` | build `web/docker/Dockerfile.nodo-sim` (Debian 12 + binario `nodo-sim`) | `sismo-nodo-1` | 9001→8080 | por defecto |
| 2 | `nodo2` | ídem | `sismo-nodo-2` | 9002→8080 | por defecto |
| 3 | `nodo3` | ídem | `sismo-nodo-3` | 9003→8080 | por defecto |
| 4 | `db1` | `postgres:16-alpine` | `sismo-db-1` | sin publicar | por defecto |
| 5 | `db2` | `postgres:16-alpine` | `sismo-db-2` | sin publicar | por defecto |
| 6 | `db3` | `postgres:16-alpine` | `sismo-db-3` | sin publicar | por defecto |
| 7 | `servidor1` | build `web/docker/Dockerfile.fedora` (Fedora 42) | `sismo-servidor-1` | 8101→8100 | por defecto |
| 8 | `servidor2` | build `web/docker/Dockerfile.suse` (openSUSE Leap 15.6) | `sismo-servidor-2` | 8102→8100 | por defecto |
| 9 | `servidor3` | build `web/docker/Dockerfile.ubuntu` (Ubuntu 24.04) | `sismo-servidor-3` | 8103→8100 | por defecto |
| 10 | `controlador` | build `web/docker/Dockerfile.controlador` (Alpine) | `sismo-controlador` | sin publicar | por defecto |
| 11 | `panel` | build `web` (Alpine, Node 22) | `sismo-panel` | 8095→8090 | por defecto |
| (12) | `https` | `caddy:2-alpine` | `sismo-https` | 8443→8443 | **`https`** (opcional) |

Variables de desarrollo documentadas: `PUERTO_PANEL=8095`, `PUERTO_NODO1..3=9001..9003`,
`PUERTO_SERVIDOR1..3=8101..8103`, `PUERTO_HTTPS=8443`, `PREFIJO=sismo`; `DB_PASSWORD` y
`CONTROL_TOKEN` tienen valores por defecto **solo de desarrollo** y en producción se pasan como
secretos (`docker-compose.yml:50,153,179`; `docker-compose.prod.yml`).

---

## 11. Estado de ejecución verificado

`docker compose ps` el 2026-11-18 muestra **11 contenedores en ejecución**, 10 de ellos `healthy`
(el panel no declara healthcheck). Fuente: `/tmp/entrega-facts.md` §5 y la comprobación directa del
2026-11-18.

| Contenedor | SO real | Estado |
|---|---|---|
| `sismo-servidor-1` | Fedora Linux 42 (Container Image) | Up healthy |
| `sismo-servidor-2` | openSUSE Leap 15.6 | Up healthy |
| `sismo-servidor-3` | Ubuntu 24.04.5 LTS | Up healthy |
| `sismo-panel` | Alpine Linux v3.24 (Node 22) | Up (sin healthcheck) |
| `sismo-nodo-1/2/3` | Debian GNU/Linux 12 (bookworm) | Up healthy |
| `sismo-db-1/2/3` | Alpine Linux v3.24.2 (postgres:16-alpine, PostgreSQL 16.15) | Up healthy |
| `sismo-controlador` | Alpine Linux v3.24.1 | Up healthy |

Raft en vivo al cierre de la verificación (2026-11-18 11:20 -05:00, `/tmp/entrega-facts.md` §5):
**3/3 nodos disponibles**, líder = Nodo 1, término 3, **5 entradas de log** y **2 alertas**. PostgreSQL
con **116–118 muestras por base** y los **4 eventos + 2 alertas de la demostración**, generados el
2026-11-18 entre 11:14:57 y 11:17:53 con `POST /api/nodos/N/pulsar` sobre los nodos **simulados**
(`/tmp/entrega-facts.md` §7). No son mediciones sísmicas ni campaña física.

---

## 12. Pruebas re-ejecutadas el 2026-11-18

Entorno: Linux 7.3.3-1-cachyos x86_64; g++ (GCC) 16.2.1; GNU Make 4.4.1; ArduinoJson 7.4.3;
Node.js v26.13.0; arduino-cli 1.5.1; core `esp32:esp32` 3.3.12; Docker 29.9.3
(`/tmp/entrega-facts.md` §4).

| Validación | Comando | Resultado | Evidencia |
|---|---|---|---|
| C++ (núcleo + red Raft simulada) | copia a `/tmp/vybra-cpp`; `make JSON_DIR=$HOME/Arduino/libraries/ArduinoJson/src test` | **78 ok, 0 fallas**, exit 0 — `test_api` 9, `test_huella` 17, `test_mensajes` 9, `test_raft` 32, `test_sismo` 11 | `entrega/04-evidencias/E-pruebas/log-TST-01-cpp.txt`; `entrega/05-pruebas/logs/TST-01-cpp.log` |
| JavaScript sin servicios externos | `cd web && npm test` | **75 tests: 60 pass, 15 skipped, 0 fail**, 16 598 ms, exit 0 | `entrega/04-evidencias/E-pruebas/log-TST-03-js.txt`; `entrega/05-pruebas/logs/TST-03-js.log` |
| JavaScript con 3 PostgreSQL reales | `cd web && npm run test:db` (`REQUIRE_DB=1`) | **75 tests: 70 pass, 5 skipped, 0 fail**, 13 779 ms, exit 0 | `entrega/04-evidencias/I-resultados/log-TST-04-test-db.txt`; `entrega/05-pruebas/logs/TST-04-test-db.log` |
| Integración Docker aislada | `cd web && npm run test:infra` (proyecto `vybraint`) | **5/5 pass, 0 fail**, 79,2 s, exit 0 | `entrega/04-evidencias/I-resultados/log-TST-05-test-infra.txt`; `entrega/05-pruebas/logs/TST-05-test-infra.log` |
| Firmware nodo 1 | `arduino-cli compile --fqbn esp32:esp32:esp32 --build-property "compiler.cpp.extra_flags=-DNODO=1"` | exit 0; `detector.ino.bin` = **1 105 728 B** (84 % flash); RAM 54 264 B (16 %) | `entrega/04-evidencias/I-resultados/tabla-RES-05-firmware.txt`; `entrega/05-pruebas/logs/NOD-11-compilacion.log` |
| Firmware nodo 2 | ídem `-DNODO=2` | exit 0; **1 105 728 B** | ídem |
| Firmware nodo 3 | ídem `-DNODO=3` | exit 0; **1 105 712 B** | ídem |
| Artefactos comunes | salida de `arduino-cli` | `bootloader` 24 992 B; `partitions` 3 072 B; `boot_app0` 8 192 B; `merged` 4 194 304 B | ídem |
| Nodo simulado | `JSON_DIR=$HOME/Arduino/libraries/ArduinoJson/src bash web/nodo-sim/compilar.sh` | exit 0; binario **275 392 B** | `entrega/04-evidencias/I-resultados/tabla-RES-05-firmware.txt`; `entrega/05-pruebas/logs/NOD-19-compilacion-nodo-sim.log` |
| Docker real en ejecución | `docker compose ps`, `docker stats`, `docker exec … /etc/os-release` | **11 contenedores Up (10 healthy; panel sin healthcheck)** | `entrega/04-evidencias/H-infraestructura/log-INF-02-03-contenedores.txt`; `entrega/04-evidencias/H-infraestructura/log-INF-04-tres-so.txt`; `entrega/04-evidencias/H-infraestructura/tabla-INF-09-consumo.txt` |

**Histórico que no se re-ejecuta:** el arnés A′ de configuración desplegada ya no existe en el
repositorio. Su log `entrega/04-evidencias/E-pruebas/log-TST-11-arnes-A-prime.txt` es evidencia real
del **2026-11-17** (5 ok, 0 fallas; elección 5820 ms, failover 5500 ms, commit 510 ms) y se conserva
anotado como histórico no reproducible (`/tmp/entrega-facts.md` §4).

---

## 13. Resultados y métricas

| Métrica | Valor | Fuente |
|---|---|---|
| Servicios Docker por defecto | **11** (+1 opcional `https`) | `docker-compose.yml`; `/tmp/entrega-facts.md` §3 |
| Servidores de datos / PostgreSQL | **3 + 3** | `docker-compose.yml` |
| Pruebas C++ | **78/78** (5 binarios) | §12 |
| JavaScript | **75 casos**: 60 pasan + 15 omitidas (`npm test`); 70+5 con `test:db`; 0 fallos | §12 |
| `test:infra` | **5/5** | §12 |
| Firmware | **3/3** nodos compilan; binario de aplicación de ~**1,105 MB**; 84 % de la partición | §12 |
| Nodo simulado | **275 392 B** | §12 |
| Contenedores | **11 Up**, 10 `healthy` | §11 |
| Raft en vivo | 3/3, líder Nodo 1, término 3, 5 entradas de log, 2 alertas | §11 |
| Datos de demostración | 4 eventos y 2 alertas persistidos en las 3 bases; 116–118 muestras por base | §11; `/tmp/entrega-facts.md` §7 |

---

## 14. Limitaciones vigentes

Las nueve limitaciones del `README.md:411-426`, verificadas en el código
(`/tmp/entrega-facts.md` §8):

1. **El evento es simulado** con un pulsador; no hay medición sísmica.
2. **El log de Raft no es durable** (RAM): un corte puede perder entradas aceptadas y no confirmadas.
3. **Resincronización de emergencia**: un nodo puede descartar su log y copiarlo del líder; es
   deliberado, pero no garantiza durabilidad.
4. **Sin snapshots**: tope de 1000 entradas; al llenarse se rechazan eventos nuevos.
5. **Sin seguridad de transporte**: API HTTP y UDP Raft sin autenticación ni cifrado; CORS `*`.
6. **Sin pre-vote ni check-quorum**: un líder aislado sigue creyéndose líder.
7. **`ForwardAck` al aceptar**, no al confirmar: un evento puede perderse si el líder muere justo
   después.
8. El «quórum» del agregador es una **inferencia** (≥ 2 nodos disponibles que reconocen al mismo
   líder), no validación de consenso.
9. La demo Docker **sí ejecuta el Raft real**; el único simulador sin Raft es `npm run fake`.

**Limitaciones de alcance del informe:** la cifra de latencia física real, la reelección física y las
pérdidas en la red WiFi no se han medido; dependen de la campaña física, que sigue abierta. No se han
inventado resultados para completarlas.

---

## 15. Campaña física y pendientes

| Bloque | Estado | Evidencia |
|---|---|---|
| P0 — preparación | **Completada** el 2026-11-17 17:25 -05:00 | `entrega/05-pruebas/logs/FIS-00-p0.txt` |
| T1 — evento con pulsador | **No aprobada**: una pulsación produjo dos eventos cortos (301 ms y 174 ms, separados 3,2 s); replicación y commit correctos; sin alerta (correcto con un solo detector) | `entrega/05-pruebas/logs/FIS-01-verificacion.txt`; `entrega/05-pruebas/datos/FIS-01-post-nodo*-log.json`; [`diagnostico-pulsador.md`](diagnostico-pulsador.md) |
| T2 en adelante | **Pendientes de autorización** | `README.md:398` |

El detalle de lo que falta, incluidos los datos académicos de portada y las decisiones abiertas,
está en [`pendientes.md`](pendientes.md).

---

## 16. Trazabilidad de evidencias

| Afirmación | Archivo de evidencia |
|---|---|
| Servidores de datos y tablas | `web/servidor/bd.js`, `web/servidor/consulta.js`, `docs/servidores-de-datos.md` |
| Vista Histórico ADMIN/CLIENTE | `web/server.js:353-395`, `web/admin-src/src/App.tsx:1382+`, `docs/servidores-de-datos.md:53-55` |
| ADMIN nuevo | `web/admin-src/src/App.tsx`, capturas `entrega/04-evidencias/B-interfaz/` |
| Apagado/encendido real | `web/controlador/controlador.js`, `docker-compose.yml:146-163`, `entrega/04-evidencias/I-resultados/log-TST-05-test-infra.txt` |
| Nodo simulado con Raft real | `web/nodo-sim/`, `docker-compose.yml:60-89`, `entrega/04-evidencias/I-resultados/log-TST-05-test-infra.txt` |
| Caddy opcional | `docker-compose.yml:189-203`, `docker/Caddyfile` |
| 11 servicios y estado | `docker-compose.yml`, `entrega/04-evidencias/H-infraestructura/log-INF-02-03-contenedores.txt`, `entrega/04-evidencias/H-infraestructura/log-INF-04-tres-so.txt`, `entrega/04-evidencias/H-infraestructura/tabla-INF-09-consumo.txt` |
| Pruebas re-ejecutadas | `entrega/04-evidencias/E-pruebas/log-TST-01-cpp.txt`, `entrega/04-evidencias/E-pruebas/log-TST-03-js.txt`, `entrega/04-evidencias/I-resultados/log-TST-04-test-db.txt`, `entrega/04-evidencias/I-resultados/log-TST-05-test-infra.txt`, `entrega/04-evidencias/I-resultados/tabla-RES-05-firmware.txt`, `entrega/05-pruebas/logs/NOD-11-compilacion.log`, `entrega/05-pruebas/logs/NOD-19-compilacion-nodo-sim.log`, `entrega/04-evidencias/E-pruebas/log-TST-06-arbol-tests.txt`, `entrega/04-evidencias/E-pruebas/log-TST-07-versiones.txt` y `entrega/04-evidencias/E-pruebas/log-TST-08-git.txt` |
| Campaña física | `entrega/05-pruebas/logs/FIS-00-p0.txt`, `entrega/05-pruebas/logs/FIS-01-verificacion.txt`, `entrega/04-evidencias/F-fisicas/`, `entrega/04-evidencias/D-nodos/` |

Los logs del 2026-11-18 los publica el verificador en `entrega/05-pruebas/logs/` y
`entrega/04-evidencias/`; la ficha canónica `/tmp/entrega-facts.md` §4 documenta comando, entorno y
resultado de cada re-ejecución.

---

## 17. Conclusión

La Fase 4 convierte el software validado de la Fase 3 en un sistema completo de demostración y
operación: tres servidores de datos con PostgreSQL, vista Histórico en ADMIN y CLIENTE, ADMIN nuevo
con apagado/encendido real a través de un controlador aislado, nodo simulado con Raft real, HTTPS
opcional y 11 servicios de compose. Las validaciones re-ejecutadas el 2026-11-18 dan C++ 78/78,
JavaScript 75 casos sin fallos, `test:db` 70+5, `test:infra` 5/5, firmware 3/3 y nodo simulado
compilado.

Lo que separa al proyecto de `v1.0.0` definitiva no es software: es la **campaña física**. P0 está
completada; T1 no se aprobó por la anomalía del pulsador, cuyo diagnóstico y plan de corrección están
documentados; T2 en adelante esperan autorización. Las limitaciones estructurales del sistema
(log no durable, sin snapshots, sin seguridad de transporte, sin pre-vote ni check-quorum, `ForwardAck`
al aceptar y quórum inferido) siguen vigentes y declaradas.

---

## 18. Discrepancias detectadas (no corregidas en este informe)

| # | Archivo y líneas | Afirmación vigente | Hecho verificado | Tratamiento |
|---|---|---|---|---|
| 1 | `README.md:194-198` (apartado 7) | «Las vistas usan **SSE** … y un **mapa SVG propio** (sin Leaflet ni teselas externas). La única dependencia externa de la interfaz es la tipografía Inter» | El **ADMIN** sí usa mapa SVG propio, pero el **CLIENTE** (`/publico` → `/cliente/`) carga Leaflet vendorizado en `web/public/cliente/vendor/leaflet/` y teselas de OpenStreetMap (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`, `web/public/cliente/js/cliente-app.js:688`) | Corregido en este informe (§6) y en el documento técnico §11.5; `README.md` §7 queda desactualizado y no se edita en esta entrega por estar fuera de su alcance |

Es la única discrepancia documental detectada en la revisión del 2026-11-18; el resto de cifras del
`README.md` coincide con la ficha canónica y con el código.
