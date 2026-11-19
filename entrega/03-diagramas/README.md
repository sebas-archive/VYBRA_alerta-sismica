# Diagramas del sistema — Alerta Sísmica / VYBRA

Carpeta de diagramas de la entrega. Contiene **14 diagramas PlantUML originales del proyecto**
(numerados `D-01` a `D-14`), su exportación a **SVG** y **PNG**, y este índice con la trazabilidad
de cada figura a la fuente de verdad en el código.

- **Proyecto:** Alerta Sísmica / VYBRA — clúster de 3 ESP32 con consenso Raft propio, agregador
  Node.js, panel ADMIN + vista CLIENTE, servidores de datos con PostgreSQL y controlador Docker.
- **Versión:** `v1.0.0-rc1` · **Commit de referencia:** `0ee5ed4` · **Fecha de generación:** 2026-11-18.
- **Autoría:** diagramas elaborados para este proyecto por el equipo de documentación (rol
  «diagramador»), a partir del código y de la documentación vigentes. No son mockups: no se usó
  material de diseño retirado (`docs/superpowers/`, `mockup/`, `preview/`).

## Estructura

```
03-diagramas/
├── fuente/      14 archivos .puml (fuente editable)
├── exportado/   14 .svg + 14 .png (mismo nombre base que el .puml)
└── README.md    este índice
```

Los cuatro diagramas de arquitectura, despliegue, componentes y estados también se copian, como
evidencia, a `entrega/04-evidencias/G-arquitectura/` (SVG y PNG) con su propia nota de autoría.

## Índice de diagramas

| ID | Archivo fuente | Tipo | Qué muestra | Fuente de verdad (archivo:líneas) |
|---|---|---|---|---|
| D-01 | `fuente/D-01-arquitectura-fisica.puml` | Despliegue (arquitectura física) | 3 ESP32 (HTTP 80, UDP 4210/4211, NVS), PC con agregador y panel, servidores de datos y PostgreSQL, navegadores ADMIN/CLIENTE, Caddy opcional, NTP, flujos HTTP/SSE/OTA | `README.md:31-65`, `firmware/detector/config.h:10-21`, `firmware/detector/detector.ino:92,163-252,668-679,732-736`, `web/config.js:18-39`, `docker-compose.yml:165-203`, `docs/servidores-de-datos.md:7-13` |
| D-02 | `fuente/D-02-despliegue-docker.puml` | Despliegue (Docker) | 11 servicios del perfil por defecto (`nodo1..3`, `db1..3`, `servidor1..3`, `panel`, `controlador`), puertos publicados, volúmenes, dependencias y healthchecks; perfil `https` (Caddy :8443) y overlay de producción | `docker-compose.yml:17-209`, `docker-compose.prod.yml:1-59`, `docker/Caddyfile:8-23`, `web/docker/Dockerfile.*`, `README.md:290-300` |
| D-03 | `fuente/D-03-componentes-dependencias.puml` | Componentes | Firmware portable (`detector.ino`, `raft`, `sismo`, `mensajes`, `api`, `huella`, `PersistenciaNvs`), backend (panel, servidor de datos, controlador, nodo simulado, interfaces) y dependencias externas | `firmware/detector/detector.ino:27-33`, `firmware/detector/src/nucleo/raft.h:19-166`, `web/server.js:1-10`, `web/poller.js:25`, `web/servidor/servidor.js:1-13`, `web/controlador/controlador.js:1-18`, `web/nodo-sim/nodo_sim.cpp:1-31` |
| D-04 | `fuente/D-04-clases-nucleo-raft.puml` | Clases / estructuras | `Raft`, `ConfigRaft`, `Propuesta`, `Persistencia`, `Salida`, `Msg`, `Entrada`, `Evento`, `Sismo`, `Alerta`, `Suceso`, enums `Rol`/`Clase`/`Tipo`, `InfoRed`, `DetectorMovimiento` | `firmware/detector/src/nucleo/tipos.h:9-64`, `.../raft.h:19-166`, `.../sismo.h:11-36`, `.../api.h:10-17`, `.../huella.h:10-39` |
| D-05 | `fuente/D-05-estados-nodo-raft.puml` | Estados | Seguidor, Candidato, Líder y caída simulada; transiciones con timeout 5000-9000 ms, mayoría 2 de 3 y `POST /control`; situación publicada en `/estado` | `firmware/detector/src/nucleo/raft.cpp:20-32,52-70,72-103,114-137,465-484`, `.../raft.h:138-140`, `.../api.cpp:27-32`, `firmware/detector/config.h:16-18` |
| D-06 | `fuente/D-06-secuencia-eleccion.puml` | Secuencia | Elección: plazo aleatorio, `VoteReq`/`VoteResp`, voto persistido en NVS antes de responder, mayoría 2 de 3, entrada `InicioTermino` y primer latido | `.../raft.cpp:14-18,52-70,105-110,139-158`, `.../raft.h:54,95`, `firmware/detector/config.h:16-18` |
| D-07 | `fuente/D-07-secuencia-latido-append.puml` | Secuencia | Latido cada 500 ms, `Append` con `pi/pt/c/e` (≤ 8 entradas), `AppendResp(ok, m)`, commit por mayoría, retroceso por pista y ≤ 4 lotes en vuelo | `.../raft.cpp:313-346,160-233,276-299,394-414`, `.../raft.h:34-40,57`, `firmware/detector/config.h:16` |
| D-08 | `fuente/D-08-secuencia-failover-recuperacion.puml` | Secuencia | Caída del líder, nueva elección (término +1), reincorporación del nodo con log vacío y *catch-up* desde el índice 1; caso de resincronización de emergencia | `.../raft.cpp:176-198,241-253,276-299,465-484`, `.../raft.h:35,54`, `docs/servidores-de-datos.md:99-107` |
| D-09 | `fuente/D-09-secuencia-evento-alerta.puml` | Secuencia | Pulsador → nivel/PGA → `proponer` → líder agrega o seguidor hace `Forward` (reintento 500 ms) → `ForwardAck` al aceptar → `Append`/commit 2 de 3 → `Sismo::aplicar` → alerta con dos detectores en 10 s → SSE | `firmware/detector/detector.ino:50-54,508-544,597-638,668-679`, `.../raft.cpp:301-311,350-414`, `.../sismo.cpp:6-15,30-80`, `web/poller.js:147-162`, `web/server.js:117-144` |
| D-10 | `fuente/D-10-secuencia-sin-quorum.puml` | Secuencia | Pérdida de quórum: `commitIndex` no avanza, evento aceptado pero sin confirmar, cola de pendientes con tope 100 y reintento de 500 ms; recuperación al volver la mayoría | `.../raft.cpp:350-370,394-414,432-437`, `.../raft.h:38-40`, `web/poller.js:85-106`, `firmware/detector/detector.ino:618-638`, `docs/servidores-de-datos.md:106` |
| D-11 | `fuente/D-11-estados-maquina-sismica.puml` | Estados | Máquina sísmica determinista: reposo, acumulación (tope 100), evaluación de coincidencia (ventana 10 000 ms) y alerta con niveles `alta`/`media`/`baja`; sin reutilizar eventos | `.../sismo.h:11-36`, `.../sismo.cpp:6-19,30-80`, `.../api.cpp:107-121` |
| D-12 | `fuente/D-12-secuencia-agregacion-sse.puml` | Secuencia | Sondeo 1 Hz de los nodos, foto agregada con líder y quórum inferido, SSE `estado` + latido `vivo` cada 5 s hacia ADMIN/CLIENTE, proxy de control/pulsar, histórico e infraestructura | `web/server.js:14,117-176,220-257,272-336,338-415,459-460`, `web/poller.js:25,53-106,122-182`, `web/config.js:18-39` |
| D-13 | `fuente/D-13-flujo-servidores-datos.puml` | Actividad | Flujo ESP32 → servidor de datos (recolector 1 Hz) → PostgreSQL (muestras, log_entradas, eventos, alertas, sucesos, acciones) → panel ADMIN/CLIENTE; retención/archivado opcional | `web/servidor/recolector.js:3-86`, `web/servidor/bd.js:9-52,85-153`, `web/servidor/servidor.js:30-74`, `web/servidor/consulta.js:14-30`, `web/servidor/retencion.js:11-97`, `web/server.js:352-403` |
| D-14 | `fuente/D-14-modelo-er-postgresql.puml` | Entidad-relación | Tablas activas y de archivo, claves primarias/únicas y relaciones lógicas; sin claves foráneas declaradas | `web/servidor/bd.js:9-52`, `web/servidor/consulta.js:14-30`, `web/servidor/retencion.js:39-53` |

## Regeneración de las exportaciones

Requisitos: Java (probado con OpenJDK 27), PlantUML `1.2025.10` y Graphviz (`dot`; se usa para
clases, estados, componentes y actividad). Desde la raíz del repositorio:

```bash
cd entrega/03-diagramas/fuente

# SVG
java -Djava.awt.headless=true -jar /home/t1an/Descargas/plantuml-1.2025.10.jar \
  -tsvg -o ../exportado *.puml

# PNG
java -Djava.awt.headless=true -jar /home/t1an/Descargas/plantuml-1.2025.10.jar \
  -tpng -o ../exportado *.puml
```

Comprobación rápida (opcional):

```bash
cd entrega/03-diagramas/fuente
java -Djava.awt.headless=true -jar /home/t1an/Descargas/plantuml-1.2025.10.jar -checkonly *.puml
ls ../exportado/*.svg | wc -l   # debe dar 14
ls ../exportado/*.png | wc -l   # debe dar 14
```

## Validación realizada

- Los **14 `.puml` compilan sin errores** con `-checkonly` y con la exportación real a SVG/PNG.
- Se generaron **14 SVG y 14 PNG**; los SVG se validaron como XML bien formado y sin marcadores de
  error de PlantUML.
- Los diagramas se revisaron visualmente: no hay contenido omitido por ancho; cuando una figura es
  ancha se usa `scale max … width` de PlantUML, sin recortar información.
- Las cifras, puertos, mensajes y estados provienen del código o del `README.md`. Cuando un valor
  difiere entre el firmware real y el nodo simulado (por ejemplo, timeout de elección
  `5000-9000 ms` frente a `1500-3000 ms`), se indica expresamente en el propio diagrama.

## Convenciones

- Etiquetas en **español técnico**; los nombres de archivos, clases y claves JSON se conservan tal
  como están en el código (`VoteReq`, `last_idx`, `commit_index`, `ForwardAck`, etc.).
- Se distingue siempre **evento simulado** (pulsador en GPIO4) de medición sísmica real; el sistema
  no mide aceleración.
- Las fechas, el commit y la versión citados corresponden al estado del repositorio en el momento
  de generar los diagramas: `0ee5ed4`, `v1.0.0-rc1`, 2026-11-18.

## Nota sobre discrepancias

Las diferencias detectadas entre código, `README.md` y otros documentos (por ejemplo, `VERSION`
con cifras antiguas o el tag `v1.0.0-rc1` retrasado respecto de `HEAD`) están anotadas en
`entrega/10-informes-fase3/datos-para-diagramas.md`, sección «Discrepancias detectadas». Esa nota
no modifica el código: solo deja constancia para el informe.
