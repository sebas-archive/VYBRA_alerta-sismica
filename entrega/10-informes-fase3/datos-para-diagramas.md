# Datos verificados para los diagramas de la Fase 4

Todo lo de este documento está tomado del código actual (commit de la versión estable). Es la fuente
de verdad para los diagramas PlantUML: si un diagrama contradice esto, gana este documento.

## 1. Nodos y puertos reales

| Elemento | Valor | Evidencia |
|---|---|---|
| Nodos ESP32 | 3, fijos (`kPrimerNodo=1`, `kUltimoNodo=3`) | `raft.h:50` |
| HTTP del nodo | **80/tcp** (`WebServer` síncrono) | `detector.ino:84` |
| Raft | **4210/udp**, unicast entre nodos | `config.h:21` |
| Descubrimiento | **4211/udp** broadcast, `"SISMO-HOLA:N"` cada **2000 ms** | `config.h:10-11`, `detector.ino:344-360` |
| OTA | **3232/udp** en la placa; callback al PC **32323/tcp** | `detector.ino:721-725`, `cargar.sh` |
| Portal AP | SSID `SISMO-D<N>-config`, DNS **53/udp**, HTTP **80** sobre el AP | `detector.ino:155-243` |
| Panel del PC | **8090/tcp** (`PUERTO`) | `web/config.js:19` |
| Demo Docker | nodos **9001/9002/9003→8080**, panel **8095→8090** | `docker-compose.yml:24,30,36,46` |

## 2. Componentes y responsabilidades (para el diagrama de componentes)

| Componente | Responsabilidad | Depende de |
|---|---|---|
| `detector.ino` | Orquestador del nodo: WiFi/DHCP, UDP, HTTP, NVS, pulsador/LED, NTP, OTA, huella | `Raft`, `api`, `huella`, `mensajes`, `config.h` |
| `Raft` (`raft.cpp`) | Elección, términos, votos, `Append`, commit por mayoría, forward, resincronización | `mensajes`, `Sismo`, `Persistencia` |
| `mensajes` (`mensajes.cpp`) | Códec JSON de los 6 tipos de mensaje | `tipos.h`, ArduinoJson |
| `Sismo` (`sismo.cpp`) | Máquina de estados determinista: eventos → alertas (ventana 10 s) | `tipos.h` |
| `api` (`api.cpp`) | Serializa `/estado`, `/log`, `/sucesos`, `/alertas` | `Raft` |
| `huella` (`huella.cpp`) | Escaneo WiFi activo → detecta si movieron la placa | — |
| `poller` (`poller.js`) | Sondeo 1 Hz, foto agregada, líder y quórum | HTTP de los nodos |
| `server` (`server.js`) | Estáticos, `/api/estado`, SSE, proxy de control | `poller`, `config` |
| `operador.html` | Panel de operador (6 pestañas) | `/api/stream`, `/api/estado` |
| `cliente.html` | Vista pública de alertas | `/api/stream` |
| `mapa.js` / `geo.js` | Mapa SVG y proyección local | `config.UBICACIONES` |

## 3. Mensajes Raft (para el diagrama de comunicación)

Tipo codificado como entero `k` (`tipos.h:34`, `mensajes.cpp:38`):

| `k` | Mensaje | Claves JSON | Semántica |
|---|---|---|---|
| 0 | `VoteReq` | `k,d,T,li,lt` | Candidato pide voto; `li/lt` = último índice/término |
| 1 | `VoteResp` | `k,d,T,g` | Voto concedido o denegado |
| 2 | `Append` | `k,d,T,pi,pt,c,e[]` | Heartbeat y replicación; `e` ≤ 8 entradas |
| 3 | `AppendResp` | `k,d,T,o,m` | `o=true` → `m` = último índice coincidente; `o=false` → pista de retroceso |
| 4 | `Forward` | `k,d,T,v` | Seguidor envía evento al líder |
| 5 | `ForwardAck` | `k,d,T,i` | ACK al aceptar (no al confirmar) |

Entrada del log (`e[]`): `x` índice, `T` término, `c` clase (`0=InicioTermino`, `1=Evento`),
`l` líder, `v` evento. Evento (`v`): `i` id, `n` nodo, `l` nivel, `g` pga, `u` duración,
`t` hora local, `L` hora del líder, `r` recibido por.

## 4. Máquina de estados del nodo (para el diagrama de estados)

`Rol { Seguidor, Candidato, Lider }` (`tipos.h:9`) + caída simulada (`caido_`):

| Transición | Disparador | Evidencia |
|---|---|---|
| Seguidor → Candidato | vence el timeout de elección (5000–9000 ms) | `raft.cpp:31,52-70` |
| Candidato → Líder | recibe mayoría (2 de 3) de `VoteResp` | `raft.cpp:154-158` |
| Candidato → Seguidor | recibe `Append` del líder o término mayor | `raft.cpp:114-128,169` |
| Líder → Seguidor | recibe término mayor | `raft.cpp:119-128` |
| Cualquiera → caído | `POST /control {"accion":"caer"}` | `raft.cpp:462-471` |
| caído → Seguidor | `POST /control {"accion":"recuperar"}` | `raft.cpp:473-481` |

## 5. Máquina de estados sísmica (para el diagrama de alertas)

| Estado | Entrada | Salida | Evidencia |
|---|---|---|---|
| Sin eventos | — | — | `sismo.h:28-35` |
| Evento registrado | entrada confirmada en el log | agrupa por detector | `sismo.cpp:30-50` |
| Candidato a alerta | ≥ 2 detectores distintos con `|t| ≤ 10000 ms` | crea `Alerta` | `sismo.cpp:42-68` |
| Alerta emitida | promedio de niveles ≥ 7.5 → `alta`; ≥ 4.5 → `media`; resto `baja` | alerta consultable | `sismo.cpp:11-15,70-79` |

Tope de eventos en memoria: 100 (`sismo.h:31`).

## 6. Endpoints (para el diagrama de componentes/API)

### Nodo (HTTP 80)

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/` | Página de estado embebida (4.451 B, `send_P`) |
| GET | `/estado` | 18 claves: `nodo, rol, caido, termino, votado_por, lider_conocido, log_len, commit_index, pendientes, log_lleno, sucesos_seq, con_hora, ip, rssi, uptime_ms, movido, con_huella, situacion` |
| GET | `/log?desde=N` | Entradas paginadas de 50 |
| GET | `/sucesos?desde=S` | Últimos 50 sucesos |
| GET | `/alertas` | Alertas derivadas |
| POST | `/control` | `{"accion":"caer"\|"recuperar"}` |
| POST | `/pulsar` | `{"ms":N}` (80–60000) |
| POST | `/huella` | Re-fija la referencia de huella |

### Agregador (HTTP 8090)

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/` | Panel de operador |
| GET | `/publico` | Vista pública |
| GET | `/api/estado` | Foto: `{t, quorum, lider, fuente, nodos[], log[], alertas[], sucesos[], ubicaciones{}}` |
| GET | `/api/stream` | SSE: `event: estado` (snapshot) y `event: vivo` cada 5 s |
| POST | `/api/nodos/:n/control` | Proxy a `/control` del nodo |
| POST | `/api/nodos/:n/pulsar` | Proxy a `/pulsar` del nodo |

## 7. Flujos que deben aparecer en los diagramas de secuencia

1. **Generación de evento**: pulsador GPIO4 → `Evento` (`nivel`, `pga`, `t`) → `proponer()` →
   (líder: `Append`; seguidor: `Forward`) → `AppendResp` → `avanzarCommit` (2 de 3) →
   `aplicarConfirmadas` → `Sismo` → `/alertas` → poller → SSE → UI.
2. **Elección**: timeout 5–9 s → `VoteReq` → `VoteResp` → mayoría → `ganar()` → `InicioTermino` →
   heartbeats de 500 ms.
3. **Failover**: líder cae → seguidores agotan timeout → nuevo término → nueva elección → el nodo
   caído vuelve como seguidor y recibe `Append` desde el índice 1 (catch-up).
4. **Sin quórum**: 1 nodo vivo → no hay mayoría → `commitIndex` no avanza; el evento del seguidor
   queda `pendiente` en la cola (tope 100) y se reintenta cada 500 ms.
5. **Petición de control**: navegador → `POST /api/nodos/:n/control` → `server.js` valida
   (`application/json`, ≤4 KB) → proxy → nodo → respuesta.

## 8. Tiempos y umbrales reales (para anotar en los diagramas)

| Parámetro | Valor |
|---|---|
| Heartbeat | 500 ms |
| Timeout de elección | 5000–9000 ms (aleatorio uniforme) |
| Criterio de reelección de campaña | ≤ 12 s |
| Reintento de forward | 500 ms |
| Anuncio HOLA | 2000 ms |
| Ventana de coincidencia de alerta | 10 000 ms |
| Tope de log / de eventos | 1000 / 100 |
| Tope de la cola de pendientes | 100 (añadido en Fase 3) |
| Sondeo del agregador | 1000 ms; timeout 3000 ms; 3 fallos → inalcanzable |
| SSE heartbeat | 5000 ms |
| NTP | cada 10 min |
| Escaneo de huella | 15 s, 30 s y luego cada 120 s |
