# Datos verificados para los diagramas

Documento de trabajo del rol «diagramador». Todo lo que aparece aquí está tomado del código actual
del repositorio (commit `0ee5ed4`, versión `v1.0.0-rc1`, 2026-11-18) y de `README.md`, y es la
**fuente de verdad para los 14 diagramas PlantUML** de `entrega/03-diagramas/`. Si un diagrama
contradice este documento, gana este documento; si este documento contradice el código, gana el
código (y la discrepancia se anota en la sección 11).

Rutas relativas a la raíz del repositorio. «Líneas» son las vigentes en este commit.

---

## 1. Nodos y puertos reales

| Elemento | Valor | Evidencia |
|---|---|---|
| Nodos ESP32 | 3, fijos (`kPrimerNodo=1`, `kUltimoNodo=3`) | `firmware/detector/src/nucleo/raft.h:54` |
| HTTP del nodo | **80/tcp** (`WebServer` síncrono, un cliente por vez) | `firmware/detector/detector.ino:92,668-679` |
| Raft | **4210/udp**, unicast entre nodos | `firmware/detector/config.h:21`, `detector.ino:377-381` |
| Descubrimiento | **4211/udp** broadcast, `"SISMO-HOLA:N"` cada **2000 ms** | `config.h:10-11`, `detector.ino:353-369` |
| OTA | **3232/udp** en la placa; el PC recibe la conexión en **32323/tcp** | `detector.ino:732-736`, `README.md:83,159` |
| Portal AP | SSID `SISMO-D<N>-config`, DNS **53/udp**, HTTP **80** sobre el AP | `detector.ino:163-252` (SSID en 166, DNS en 186, HTTP en 187) |
| NTP | `pool.ntp.org` y `time.google.com`, cada **10 min** | `detector.ino:58,134,751-754` |
| Panel del PC | **8090/tcp** (`PUERTO` en `config.js`) | `web/config.js:19`, `web/server.js:457` |
| Demo Docker: nodos | host **9001/9002/9003** → contenedor **8080** | `docker-compose.yml:69,79,89` |
| Demo Docker: panel | host **8095** → contenedor **8090** | `docker-compose.yml:180` |
| Servidores de datos (demo) | host **8101/8102/8103** → contenedor **8100** | `docker-compose.yml:117,130,143` |
| Controlador de infraestructura | **8200** interno, **sin puerto publicado** | `docker-compose.yml:151-159` |
| Caddy (perfil `https`) | host **8443** → contenedor **8443**, `tls internal` | `docker-compose.yml:189-203`, `docker/Caddyfile:8-23` |
| Bases PostgreSQL | **5432** interno, **sin puerto publicado**, una por servidor | `docker-compose.yml:45-56,92-103` |

No hay base de datos en el clúster: el log de Raft vive en RAM de cada nodo y solo `currentTerm` y
`votedFor` se persisten en NVS (`README.md:61-64`).

---

## 2. Componentes y responsabilidades

### Firmware (ESP32, Arduino)

| Componente | Responsabilidad | Depende de |
|---|---|---|
| `detector.ino` | Orquestador del nodo: WiFi/DHCP, UDP, HTTP, NVS, pulsador/LED, NTP, OTA y escaneo de huella | `Raft`, `api`, `huella`, `mensajes`, `config.h` |
| `Raft` (`raft.cpp`/`raft.h`) | Elección, términos, votos, `Append`, commit por mayoría, forward, resincronización y caída simulada | `mensajes`, `Sismo`, `Persistencia` |
| `mensajes` (`mensajes.cpp`) | Códec JSON de los 6 tipos de mensaje | `tipos.h`, ArduinoJson |
| `Sismo` (`sismo.cpp`) | Máquina de estados determinista: eventos confirmados → alertas (ventana de 10 s) | `tipos.h` |
| `api` (`api.cpp`) | Serializa `/estado`, `/log`, `/sucesos`, `/alertas` y deriva `situacion` | `Raft` |
| `huella` (`huella.cpp`) | Escaneo WiFi pasivo/activo: AP vecinos, parecido y detección de movimiento | — |
| `PersistenciaNvs` (en `detector.ino`) | Implementa `Persistencia`: término y voto en NVS (`raft/T`, `raft/V`) | `Preferences` |

### Backend (Node.js, ESM, Node ≥ 22)

| Componente | Responsabilidad | Depende de |
|---|---|---|
| `web/server.js` | HTTP del panel: estáticos, `/api/estado`, SSE `/api/stream`, proxy de control/pulsar, histórico, infraestructura | `poller`, `config` |
| `web/poller.js` | Sondeo 1 Hz de los nodos, foto agregada, líder y quórum inferido | HTTP de los nodos |
| `web/config.js` | `NODOS`, `PUERTO` (8090), `UBICACIONES`, `SERVIDORES`, `CONTROLADOR` | variables de entorno |
| `web/servidor/servidor.js` | Servidor de datos de cada ESP32: `/info`, `/salud`, histórico, vista pública, retención y `POST /acciones` | `config`, `recolector`, `bd`, `consulta`, `retencion` |
| `web/servidor/recolector.js` | Consulta su ESP32 a 1 Hz y guarda muestras, sucesos, log, eventos y alertas | `bd` |
| `web/servidor/bd.js` | Almacén PostgreSQL (`pg`): esquema, upserts y `archivo_*` | PostgreSQL |
| `web/servidor/consulta.js` | Filtros validados y paginación real (`LIMIT/OFFSET`) | `bd` |
| `web/servidor/retencion.js` | Política de retención/archivado (desactivada por defecto) | `bd` |
| `web/controlador/controlador.js` | Único con socket de Docker; `stop`/`start` de `nodoN` y `servidorN` | Docker Engine API |
| `web/nodo-sim/nodo_sim.cpp` | ESP32 simulado con el **mismo núcleo Raft** compilado para Linux | `src/nucleo` |
| `web/public/admin/` | Panel ADMIN (9 secciones: Panorama, Sismógrafos, Alertas, Histórico, Clúster Raft, Servidores, Detectores, Registros, Configuración) | `/api/estado`, `/api/stream`, `/api/historial`, `/api/infra` |
| `web/public/cliente/` | Vista CLIENTE (estado, último sismo, historial, guía de actuación) | `/api/stream`, `/api/publico/historial` |
| `web/fake/` | Nodos falsos para demos sin hardware (**no** implementan Raft) | — |

`public/operador.html` y `public/cliente.html` siguen en el repositorio como **respaldo**: el panel
solo los sirve si no existe `admin/index.html` o `cliente/index.html` (`web/server.js:400-401`).

---

## 3. Mensajes Raft

Tipo codificado como entero `k` (`tipos.h:34`, `mensajes.cpp:36-78`):

| `k` | Mensaje | Claves JSON | Semántica |
|---|---|---|---|
| 0 | `VoteReq` | `k,d,T,li,lt` | Candidato pide voto; `li/lt` = último índice/término |
| 1 | `VoteResp` | `k,d,T,g` | Voto concedido (`g=true`) o denegado |
| 2 | `Append` | `k,d,T,pi,pt,c,e[]` | Latido y replicación; `e` ≤ 8 entradas |
| 3 | `AppendResp` | `k,d,T,o,m` | `o=true` → `m` = último índice coincidente; `o=false` → pista de retroceso |
| 4 | `Forward` | `k,d,T,v` | Seguidor envía evento al líder |
| 5 | `ForwardAck` | `k,d,T,i` | ACK al **aceptar** en el log, no al confirmar |
| — | Entrada (`e[]`) | `x,T,c,l,v` | `x` índice, `T` término, `c` clase (`0=InicioTermino`, `1=Evento`), `l` líder, `v` evento |
| — | Evento (`v`) | `i,n,l,g,u,t,L,r` | id, nodo, nivel, pga, duración, hora, hora del líder, recibido por |

Claves cortas: `k` tipo, `d` de, `T` término, `li/lt` último índice/término, `g` concedido, `pi/pt`
previo índice/término, `c` commit, `e` entradas, `o` ok, `m` match, `v` evento, `i` id
(`mensajes.cpp:9-12,36-78`).

---

## 4. Máquina de estados del nodo Raft

`Rol { Seguidor, Candidato, Lider }` (`tipos.h:9`) más la caída simulada (`caido_ = true`,
`raft.h:138-140`):

| Transición | Disparador | Evidencia |
|---|---|---|
| Seguidor → Candidato | vence el timeout de elección aleatorio 5000-9000 ms | `raft.cpp:14-18,31,52-70` |
| Candidato → Líder | recibe mayoría (2 de 3) de `VoteResp` | `raft.cpp:72-103,154-158` |
| Candidato → Seguidor | recibe `Append` de un líder legítimo o término mayor | `raft.cpp:114-137,160-169` |
| Líder → Seguidor | recibe un mensaje con término mayor | `raft.cpp:119-128` |
| Cualquiera → caído | `POST /control` con `{"accion":"caer"}` | `raft.cpp:465-474`, `detector.ino:597-614` |
| caído → Seguidor | `POST /control` con `{"accion":"recuperar"}` | `raft.cpp:476-484` |
| Cualquiera → (reinicio) Seguidor | arranque: carga término y voto de NVS; el log se pierde | `raft.cpp:7-10`, `detector.ino:72-84,712-726` |

Al ganar, el líder agrega una entrada `InicioTermino` del término nuevo (permite confirmar lo
heredado) y arranca sus latidos (`raft.cpp:84-103`). No hay pre-vote ni check-quorum: un líder
aislado sigue creyéndose líder (`README.md:420`).

Situación publicada en `/estado` (`api.cpp:27-32`): `caido`, `sincronizando` o `funcionando`.
`sincronizando` = sin líder conocido, candidato, seguidor detrás del `commit` del líder, o líder con
entradas sin confirmar.

---

## 5. Máquina de estados sísmica

Solo se aplican entradas **confirmadas** (`commitIndex`) y de clase `Evento`; las `InicioTermino`
se ignoran (`sismo.cpp:30-31`). Para cada evento confirmado, en orden de índice:

1. Se agrega a la deque `eventos_` (tope **100**; al llenarse se descarta el más antiguo) con un
   registro `Reg{indice, libre}` paralelo (`sismo.h:30-34`, `sismo.cpp:33-35`).
2. El evento recién llegado es el disparador. Para cada **otro** detector `d` se busca su evento
   **libre** más cercano en tiempo dentro de `|Δt| ≤ 10 000 ms` (`sismo.cpp:41-60`).
3. Si el grupo tiene menos de 2 detectores, no hay alerta. Si tiene 2 o más, se recorta el grupo a
   la ventana que empieza en el evento más antiguo (`sismo.cpp:61-68`).
4. Se calcula el promedio de niveles, se marcan los eventos del grupo como **no libres** (no se
   reutilizan) y se crea la `Alerta` (`sismo.cpp:70-80`).

| Nivel de alerta | Condición | Evidencia |
|---|---|---|
| `alta` | promedio ≥ 7,5 | `sismo.cpp:11-15` |
| `media` | promedio ≥ 4,5 y < 7,5 | `sismo.cpp:11-15` |
| `baja` | promedio < 4,5 | `sismo.cpp:11-15` |

La alerta guarda `id` = índice de log del evento que la disparó, `promedio`, ids de los eventos,
`termino` y `lider` (`sismo.h:11-17`). Tope de eventos en memoria: 100 (`sismo.h:31`); ventana:
10 000 ms (`sismo.h:32`).

Hora usada para agrupar: `t` del evento; si es 0, `t_lider`; si ambas son 0, el evento no se agrupa
(`sismo.h:27`, `sismo.cpp:17-19`). **Sin NTP no se forman alertas.**

Nivel de simulación por duración del pulso: `nivel = min(10, 1 + ms/450)` y
`pga = 0.028 * nivel + 0.015` (`sismo.cpp:6-9`, `detector.ino:514-515`). No hay medición sísmica.

---

## 6. Endpoints

### Nodo ESP32 (HTTP 80)

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/` | Página de estado embebida (4.451 B, `send_P`) |
| GET | `/estado` | 18 claves: `nodo, rol, caido, termino, votado_por, lider_conocido, log_len, commit_index, pendientes, log_lleno, sucesos_seq, con_hora, ip, rssi, uptime_ms, movido, con_huella, situacion` (`api.cpp:34-55`) |
| GET | `/log?desde=N` | Entradas paginadas de **50**, 1-based (`api.h:20`, `api.cpp:57-89`) |
| GET | `/sucesos?desde=S` | Sucesos con `seq > S`; la deque en memoria guarda los últimos **50** (`raft.h:55`, `api.cpp:91-105`) |
| GET | `/alertas` | Alertas derivadas (`api.cpp:107-121`) |
| POST | `/control` | `{"accion":"caer"\|"recuperar"}` → `{"ok":true,"caido":bool}` |
| POST | `/pulsar` | `{"ms":N}` (80-60000) → `aceptada`/`pendiente`/`duplicada`; 409 caído, 507 log/cola llenos |
| POST | `/huella` | 202 `{"ok":true}`: el próximo escaneo fija la referencia |

Implementación de rutas: `detector.ino:668-679`; control 597-614; pulsar 618-638; huella 642-647.

### Panel / agregador (HTTP 8090)

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/` | Redirige a `/admin/` (si existe `admin/index.html`) |
| GET | `/admin/` | Panel ADMIN (build en `public/admin/assets`) |
| GET | `/publico` | Redirige a `/cliente/` |
| GET | `/api/estado` | Foto: `{t, quorum, lider, fuente, nodos[], log[], alertas[], sucesos[], ubicaciones{}}` |
| GET | `/api/stream` | SSE: `event: estado` (foto) y `event: vivo` cada **5000 ms** |
| GET | `/api/infra` | Estado del controlador (o `disponible:false` con motivo) |
| GET | `/api/servidores` | Estado de los 3 servidores de datos (`/info`) |
| GET | `/api/historial` | Histórico paginado y filtrado; `tipo` = eventos/alertas/muestras/sucesos/log/acciones |
| GET | `/api/publico/historial` | Vista CLIENTE: solo alertas y lecturas confirmadas |
| GET | `/api/registro` | Un registro completo de una base |
| GET | `/api/retencion` | Política de retención y plan (solo lectura) |
| POST | `/api/nodos/:n/control` | Proxy a `/control` del nodo; exige `application/json`, ≤ 4 KB |
| POST | `/api/nodos/:n/pulsar` | Proxy a `/pulsar` del nodo |
| POST | `/api/infra/servidores/:n/:apagar\|encender` | Apagado/encendido real; exige `application/json`, `{"confirmar":true}` y `Origin` propio |

Rutas y validaciones en `web/server.js:338-415` (proxy 146-176, SSE 117-144, infra 272-336,
histórico 220-257, retención 395-399). Parámetros del histórico documentados en
`docs/servidores-de-datos.md:40-49`.

### Servidor de datos (HTTP 8100)

`GET /salud`, `GET /info`, `GET /api/historial`, `GET /api/registro`, `GET /api/publico`,
`GET /retencion`, `POST /acciones` (`web/servidor/servidor.js:30-74`).

### Controlador de infraestructura (HTTP 8200, red interna)

`GET /salud` (sin token), `GET /estado` y `POST /servidores/{1|2|3}/{apagar|encender}` (token
`Bearer`); cualquier otra ruta responde 404 (`web/controlador/controlador.js:141-164`).

---

## 7. Flujos que aparecen en los diagramas de secuencia

1. **Generación de evento** (`D-09`): pulsador GPIO4 → antirrebote 20 ms → `Evento` (`nivel`, `pga`,
   `t`) → `proponer()` → líder: `Append`; seguidor: cola + `Forward` (reintento 500 ms) →
   `ForwardAck` al aceptar → `AppendResp` → `avanzarCommit` (2 de 3) → `aplicarConfirmadas` →
   `Sismo` → `/alertas` → poller → SSE → UI.
2. **Elección** (`D-06`): timeout 5000-9000 ms → `VoteReq` → `VoteResp` → mayoría 2 de 3 →
   `ganar()` → `InicioTermino` → heartbeats de 500 ms.
3. **Latido/Append** (`D-07`): latidos cada 500 ms; `Append` con `pi/pt/c` y ≤ 8 entradas;
   `AppendResp`; commit por mayoría; retroceso con pista; ≤ 4 lotes en vuelo.
4. **Failover** (`D-08`): líder cae → seguidores agotan timeout → término +1 → nueva elección → el
   nodo caído vuelve como seguidor y recibe `Append` desde el índice 1 (*catch-up*). Si su log
   choca con lo confirmado, `resincronizar()` lo descarta y lo copia del líder.
5. **Sin quórum** (`D-10`): 1 nodo vivo → no hay mayoría → `commitIndex` no avanza; el evento del
   seguidor queda en la cola de pendientes (tope **100**), con reintento cada 500 ms. Al recuperar
   la mayoría, el commit avanza y los eventos confirmados se aplican en orden.
6. **Agregación y SSE** (`D-12`): poller 1 Hz → foto → SSE `estado`/`vivo` → ADMIN/CLIENTE; proxy
   de control/pulsar; histórico bajo demanda.
7. **Servidores de datos** (`D-13`): cada servidor consulta a su ESP32 a 1 Hz y guarda en su
   PostgreSQL; el panel lee el histórico paginado por la API del servidor.
8. **Control de infraestructura**: navegador → `POST /api/infra/servidores/:n/:acción` →
   `server.js` valida JSON, `confirmar:true` y `Origin` → controlador (token) → Docker Engine →
   `stop`/`start` de `nodoN` y `servidorN` (nunca de `dbN`).

---

## 8. Tiempos y umbrales reales

| Parámetro | Valor | Evidencia |
|---|---|---|
| Heartbeat (firmware real) | **500 ms** | `config.h:16`, `detector.ino:722` |
| Heartbeat (nodo-sim sin variables) | **300 ms** | `nodo_sim.cpp:205` (valor por defecto del simulador) |
| Timeout de elección (firmware real) | **5000-9000 ms** aleatorio uniforme | `config.h:17-18`, `raft.cpp:14-18` |
| Timeout de elección (nodo-sim sin variables) | **1500-3000 ms** | `nodo_sim.cpp:206-207` |
| Criterio de reelección de campaña | ≤ 12 s | `docs/prueba-hardware.md:9,208-209` |
| Reintento de forward | 500 ms | `raft.cpp:23,362,416-424`, `raft.h:37` |
| Anuncio `SISMO-HOLA` | 2000 ms | `config.h:11`, `detector.ino:353-369` |
| Ventana de coincidencia de alerta | 10 000 ms | `sismo.h:32` |
| Tope de log / de eventos | 1000 / 100 | `raft.h:35`, `sismo.h:31` |
| Tope de la cola de pendientes | 100 | `raft.h:38-40` |
| Entradas por `Append` / lotes en vuelo | 8 / 4 | `raft.h:36,57` |
| Tope de sucesos en memoria | 50 | `raft.h:55` |
| Página de `/log` | 50 | `api.h:20` |
| Sondeo del agregador | 1000 ms; timeout 3000 ms; 3 fallos → inalcanzable | `server.js:459-460`, `poller.js:25,62-63` |
| SSE heartbeat | 5000 ms | `server.js:14,131` |
| Tope de datos SSE pendientes | 1 MB (se corta el cliente) | `server.js:15,125` |
| NTP | cada 10 min | `detector.ino:58,751-754` |
| Escaneo de huella | 15 s, 30 s y luego cada 120 s; mínimo 15 s entre escaneos | `detector.ino:60-63,424-433` |
| Recolector del servidor de datos | 1000 ms; timeout 3000 ms; muestra cada 30 s o al cambiar | `web/servidor/config.js:51-53`, `recolector.js:3,37-43` |
| Página de histórico | `limite` 1-200 (por defecto 50); salto máximo 100 000 | `consulta.js:5,7,56,81` |
| Antirrebote / pulso mínimo / máximo | 20 ms / 80 ms / 60 000 ms | `detector.ino:52-54` |
| Nivel / PGA simulados | `min(10, 1+ms/450)` / `0.028*nivel+0.015` | `sismo.cpp:6-9`, `detector.ino:514-515` |

**Nota:** el compose **no** define `LATIDO_MS`, `ELECCION_MIN_MS` ni `ELECCION_MAX_MS` para los
nodos simulados; por eso la demo Docker usa los valores por defecto de `nodo_sim.cpp` (300 ms y
1500-3000 ms), más rápidos que el firmware real (500 ms y 5000-9000 ms). Los diagramas lo indican
de forma expresa.

---

## 9. Despliegue Docker

`docker-compose.yml` define **11 servicios** en el perfil por defecto y un servicio opcional para el
perfil `https`:

| Servicio | Imagen/SO | Puerto(s) | Función |
|---|---|---|---|
| `nodo1`,`nodo2`,`nodo3` | Debian 12 (build con `Dockerfile.nodo-sim`) | host 9001/9002/9003 → 8080 | ESP32 simulado con el núcleo Raft real |
| `db1`,`db2`,`db3` | `postgres:16-alpine` | sin publicar | Base de datos de cada servidor |
| `servidor1` | Fedora 42 | host 8101 → 8100 | Servidor de datos 1 |
| `servidor2` | openSUSE Leap 15.6 | host 8102 → 8100 | Servidor de datos 2 |
| `servidor3` | Ubuntu 24.04 | host 8103 → 8100 | Servidor de datos 3 |
| `panel` | `node:22-alpine` | host 8095 → 8090 | ADMIN/CLIENTE, SSE y proxy |
| `controlador` | `node:22-alpine` | sin publicar | Apagar/encender; único con `docker.sock` |
| `https` (perfil) | `caddy:2-alpine` | host 8443 → 8443 | HTTPS local con `tls internal` |

Detalles verificados:

- Volúmenes: `sismo-db1`, `sismo-db2`, `sismo-db3`, `sismo-caddy` (`docker-compose.yml:205-209`).
- Healthchecks: nodo `nodo-sim --salud`; servidor `GET /salud`; base `pg_isready`
  (`docker-compose.yml:17-32,52-56`).
- `depends_on` con `condition: service_healthy`: servidores → su base; panel → nodos y servidores
  (`docker-compose.yml:118-144,181-187`).
- El controlador monta `/var/run/docker.sock`, corre con `read_only: true`, `cap_drop: [ALL]` y
  `no-new-privileges:true`; no publica puertos (`docker-compose.yml:146-163`).
- El perfil `https` no altera el stack por defecto y se arranca con
  `docker compose --profile https up -d` (`docker-compose.yml:189-203`, `README.md:297-300`).
- `docker-compose.prod.yml` es un **overlay** (no un perfil): pone `nodo1..3` en el perfil
  `simulados`, usa secretos para la clave de las bases y el token, elimina los puertos publicados de
  los servidores y define `VYBRA_ENTORNO=produccion` (`docker-compose.prod.yml:1-59`).

Comprobación de conteo: `docker compose config --services | wc -l` = **11**;
`docker compose --profile https config --services | wc -l` = **12**.

---

## 10. Esquema PostgreSQL (resumen para el diagrama ER)

`web/servidor/bd.js` crea las tablas con `CREATE TABLE IF NOT EXISTS` (`bd.js:11-52`):

| Tabla | Clave | Columnas principales |
|---|---|---|
| `muestras` | `id` bigserial | `t`, `nodo`, `alcanzable`, `rol`, `termino`, `log_len`, `commit_index`, `pendientes`, `rssi`, `uptime_ms`, `situacion`, `estado` jsonb |
| `log_entradas` | `clave` text | `indice`, `termino`, `clase`, `datos` jsonb, `confirmada`, `guardado` |
| `eventos` | `id` text | `nodo`, `nivel`, `pga`, `duracion_ms`, `t_ms`, `t_lider_ms`, `recibido_por`, `indice`, `termino`, `confirmado`, `datos` jsonb, `guardado` |
| `alertas` | `clave` text | `alerta_id`, `promedio`, `nivel`, `eventos` text[], `termino`, `lider`, `datos` jsonb, `guardado`, `t_ms` |
| `sucesos` | `clave` text | `nodo`, `seq`, `t_ms`, `tipo`, `texto`, `termino`, `guardado` |
| `acciones` | `id` bigserial | `t`, `tipo`, `nodo`, `parametros` jsonb, `estado_http`, `resultado` jsonb, `origen`, `ref` (único parcial) |
| `archivo_*` | — | Copia de cada tabla con `LIKE ... INCLUDING DEFAULTS INCLUDING CONSTRAINTS` (6 tablas) |

- Claves únicas: `log_entradas.clave = indice|termino|clase|id_evento`; `eventos.id`;
  `alertas.clave = alerta_id|ids de eventos ordenados`; `sucesos.clave = nodo|seq|t`;
  `acciones.ref` único donde no es nulo (`bd.js:85-138`).
- **No hay claves foráneas declaradas**; la integridad se mantiene con claves únicas y UPSERT. El
  diagrama ER representa relaciones lógicas, no constraints.
- `alertas.t_ms` se calcula con una subconsulta: hora del último de sus eventos
  (`bd.js:106-117`).
- Retención: por defecto **no archiva ni elimina nada**; `archivo_*` solo se llena si
  `RETENCION_ACTIVA=si`. Los eventos críticos (nivel ≥ 6 o incluidos en una alerta) nunca se tocan y
  las alertas nunca se eliminan automáticamente (`retencion.js:39-53,86-97`).

---

## 11. Discrepancias detectadas (sin modificar el código)

Se anotan aquí para que el informe las trate; **no se ha cambiado ningún archivo de código,
`README.md` ni `VERSION`**.

1. **`VERSION` desactualizado.** El archivo `VERSION` declara «Pruebas JavaScript 41/41» y «Docker
   Compose 4 servicios, 3 nodos healthy» (`VERSION:19-21`), mientras que el `README.md` vigente
   declara 75 pruebas JavaScript (60 pasan, 15 se omiten) y 11 servicios
   (`README.md:297-300,394`). Las cifras vigentes son las del README y las del código.
2. **El tag `v1.0.0-rc1` está 49 commits por detrás de `HEAD`.** `git rev-list -n1 v1.0.0-rc1` da
   `f567487` y `git rev-list --count v1.0.0-rc1..HEAD` da 49; `HEAD` es `0ee5ed4`. `VERSION`
   afirma que el commit de la versión «es el del tag». El proyecto se sigue presentando como
   `v1.0.0-rc1`; conviene decidir si se reetiqueta o se documenta como versión de trabajo.
3. **El panel ya no es `operador.html`.** La versión anterior de este documento citaba
   `operador.html` como «panel de operador (6 pestañas)». La interfaz vigente es el build de
   `public/admin/` (ADMIN, 9 secciones) y `public/cliente/` (CLIENTE); `operador.html` y
   `cliente.html` solo se sirven como respaldo si faltan los `index.html` nuevos
   (`server.js:400-401`).
4. **`/publico` redirige a `/cliente/`.** El README y los textos del proyecto usan `/publico`
   (`README.md:195`), pero el servidor responde 302 a `/cliente/` (`server.js:401`). Ambas URL
   funcionan; los diagramas usan `/publico` y anotan la redirección.
5. **Valores del nodo simulado frente al firmware real.** El firmware usa 500 ms de latido y
   5000-9000 ms de elección (`config.h:16-18`); `nodo-sim` usa por defecto 300 ms y 1500-3000 ms
   (`nodo_sim.cpp:205-207`) y el compose no los sobrescribe. No es un fallo: es una decisión de
   demo, pero afecta a cómo se leen los tiempos de los diagramas y conviene citarlo.
6. **`config.h:13-15`** conserva un comentario que recomienda «latido 300 y elección 1500-3000» en
   un router normal, mientras que las constantes del mismo archivo son 500 y 5000-9000. Es un
   comentario explicativo de una decisión anterior, no un valor efectivo.
7. **`README.md` §2** dibuja solo el clúster + agregador y no incluye los servidores de datos ni el
   controlador; `docs/servidores-de-datos.md:7-13` y el `README.md` §12 completan la arquitectura.
   No es una contradicción, pero los diagramas D-01/D-02/D-03 la reflejan completa.

---

## 12. Mapa de este documento a los diagramas

| Diagrama | Secciones de este documento |
|---|---|
| D-01 arquitectura física | 1, 2, 8 |
| D-02 despliegue Docker | 1, 2, 9 |
| D-03 componentes | 2 |
| D-04 clases del núcleo | 3, 4, 5 |
| D-05 estados del nodo Raft | 4 |
| D-06 elección | 4, 8 |
| D-07 latido/Append | 3, 8 |
| D-08 failover/recuperación | 4, 8 |
| D-09 evento → commit → alerta | 3, 5, 7, 8 |
| D-10 sin quórum | 4, 5, 7, 8 |
| D-11 máquina sísmica | 5, 8 |
| D-12 agregación y SSE | 1, 6, 7, 8 |
| D-13 flujo de servidores de datos | 1, 6, 8, 10 |
| D-14 modelo ER | 10 |
