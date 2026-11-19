<div align="center">

<img src="docs/img/banner.png" alt="VYBRA — Alerta Sísmica" width="720">

<h1 align="center">VYBRA · Alerta Sísmica</h1>

<p><em>Clúster de tres nodos ESP32 con un núcleo de consenso Raft escrito a mano, un agregador Node.js y dos interfaces web: una consola de operación y una vista pública de alertas.</em></p>

<p>
  <img alt="Versión" src="https://img.shields.io/badge/versi%C3%B3n-v1.0.0--rc1-blue?style=flat-square">
  <img alt="Licencia: MIT" src="https://img.shields.io/badge/licencia-MIT-green?style=flat-square">
  <img alt="Estado: release candidate" src="https://img.shields.io/badge/estado-release%20candidate-orange?style=flat-square">
  <img alt="Node.js 22 o superior" src="https://img.shields.io/badge/Node.js-%E2%89%A522-339933?logo=nodedotjs&logoColor=white&style=flat-square">
  <img alt="ESP32" src="https://img.shields.io/badge/ESP32-3%20nodos-E7352C?style=flat-square">
  <img alt="Docker Compose" src="https://img.shields.io/badge/Docker%20Compose-11%20servicios-2496ED?logo=docker&logoColor=white&style=flat-square">
  <img alt="Pruebas" src="https://img.shields.io/badge/pruebas-78%20C%2B%2B%20%2F%2075%20JS-brightgreen?style=flat-square">
</p>

<p>
  <a href="#descripción-general">Descripción general</a> ·
  <a href="#características">Características</a> ·
  <a href="#capturas-de-pantalla">Capturas</a> ·
  <a href="#arquitectura">Arquitectura</a> ·
  <a href="#consenso-y-regla-de-alerta">Consenso</a> ·
  <a href="#inicio-rápido">Inicio rápido</a> ·
  <a href="#configuración">Configuración</a> ·
  <a href="#api">API</a> ·
  <a href="#pruebas">Pruebas</a> ·
  <a href="#documentación">Documentación</a>
</p>

<p>
  <a href="https://github.com/sebas-archive/alerta-sismica-raft-esp32"><b>Repositorio</b></a> ·
  <a href="https://youtu.be/YlzKwWkXzaw">Video</a> ·
  <a href="#licencia">Licencia</a>
</p>

</div>

> [!WARNING]
> **Los eventos sísmicos de este proyecto se simulan con un pulsador.** Cada placa detectora lee un
> pulsador físico en GPIO4; no hay acelerómetro, geófono ni ADC, y en ningún punto del sistema se mide
> movimiento del terreno. La duración de la pulsación se traduce en un nivel de intensidad (1–10) y en
> un PGA de simulación. Lo que el proyecto demuestra en realidad es **procesamiento distribuido,
> consenso entre nodos replicados, tolerancia a fallos y comunicación entre capas** — no sismología.

## Descripción general

Una red de alerta temprana solo es útil si varios puntos de observación independientes coinciden antes
de dar la alarma: un falso positivo erosiona la confianza pública, y un sensor que falla —o un único
servidor central— no debe silenciar el aviso. VYBRA construye el núcleo de ese problema sobre un
clúster de tres placas ESP32.

Los eventos se proponen a un log replicado y solo se confirman cuando los aceptan **dos de los tres
nodos**. Un evento confirmado alimenta una máquina de estados determinista que genera una alerta
cuando **dos detectores distintos** registran un evento dentro de una **ventana de 10 segundos**. El
clúster elige su propio líder, mantiene el log replicado, tolera la caída o el reinicio de un nodo y
lo hace todo sin servidor central ni servicio en la nube.

El agregador Node.js sondea el clúster, transmite el estado agregado al navegador y sirve dos
interfaces: una **consola de operación (ADMIN)** para monitorización y control de la infraestructura,
y una **vista pública de alertas (CLIENTE)** para móviles y escritorio. Un servidor de datos
independiente por detector guarda el histórico en PostgreSQL.

| Componente | Qué es |
|---|---|
| Clúster | 3 × ESP32 DevKit V1, un líder electo, Raft escrito a mano sobre UDP |
| Eventos | Pulsador por placa → nivel de intensidad 1–10 y un PGA simulado |
| Decisión | 2 detectores distintos en 10 s; severidad a partir del nivel promedio |
| Agregador | Un proceso Node.js 22, sin framework y sin dependencias en tiempo de ejecución |
| Interfaces | Consola de operación (ADMIN) y vista pública de alertas (CLIENTE) |
| Histórico | 3 servidores de datos, cada uno con su base PostgreSQL 16 |
| Demostración | `docker compose up --build` → un despliegue de 11 servicios con el núcleo Raft real |

Lo que VYBRA **no** es: no es un sismógrafo, su log Raft no es duradero (vive en RAM) y el modo por
defecto no tiene autenticación ni cifrado. Esos límites son deliberados, están documentados y
aparecen en [Limitaciones conocidas](#limitaciones-conocidas).

## Características

- **Consenso escrito desde cero y probado en el escritorio.** El núcleo Raft es C++ portable en
  `firmware/detector/src/nucleo/`; el mismo código se ejecuta en la ESP32, en la suite de pruebas C++
  y como proceso Linux dentro de Docker. Están implementados la elección de líder, los términos, el
  voto persistido, la comprobación del log, el commit por mayoría, el reenvío desde seguidores y la
  puesta al día de un nodo reiniciado.
- **Confirmación por mayoría.** Los eventos llegan a la máquina de estados solo después de que los
  aceptan dos de los tres nodos; tras un fallo se puede volver a elegir líder sin perder la coherencia
  del log.
- **Tolerancia a fallos visible desde la consola.** Un nodo se puede tumbar y recuperar con
  `POST /control`, un servidor de datos se puede apagar y encender desde ADMIN, y el clúster sigue
  informando de líder, término, log y quórum mientras ocurre.
- **Una regla de alerta determinista.** Una alerta necesita dos detectores distintos en 10 s; la
  severidad sale del nivel de intensidad promedio (≥ 7,5 alta, ≥ 4,5 media, si no baja), y cada
  evento puede pertenecer a una sola alerta.
- **Dos interfaces para dos audiencias.** ADMIN tiene nueve paneles para monitorización,
  infraestructura, registros y configuración; CLIENTE ofrece estado, alertas, histórico, mapa y guía
  de protección en escritorio y móvil.
- **Estado en tiempo real sin sondeo del navegador.** El agregador envía los cambios de estado por
  SSE (`/api/stream`) y mantiene viva la conexión con un latido cada 5 s.
- **Histórico guardado una sola vez.** Cada detector tiene su servidor de datos y su base PostgreSQL;
  los registros llevan claves naturales y se escriben una vez, y el panel fusiona las tres bases para
  las vistas de histórico.
- **Control de infraestructura acotado.** Apagar un servidor desde ADMIN detiene su ESP32 simulado y
  su servidor de datos mediante un controlador que es el único proceso con acceso al socket de Docker
  y que solo entiende `apagar`/`encender` para los servidores 1–3, nunca nombres ni comandos libres.
- **Desarrollo sin hardware.** `npm run fake` sirve tres nodos falsos para trabajar en la interfaz, y
  la demo con Docker ejecuta el núcleo Raft real, así que la lógica distribuida se puede probar sin
  una placa.
- **Honestidad sobre lo que es.** Todas las interfaces indican que los eventos se simulan; este
  README, las pruebas y los manuales lo repiten.

## Capturas de pantalla

Las capturas proceden del software real ejecutándose en el despliegue de Docker Compose —tres nodos ESP32
simulados con el **núcleo Raft real compilado para Linux**, los tres servidores de datos y sus bases
PostgreSQL—, con datos de demostración generados por el propio sistema (pulsaciones, actividad de
Raft y acciones del operador). Las capturas de escritorio miden 1400 px de ancho (1400×900, salvo el
panel de servidores, 1400×1200); las de móvil son 390×844, o 780×1688 a 2×. La interfaz se entrega en
español por defecto e incluye un selector español/inglés, así que los rótulos en pantalla se citan en
español. Esta es la demo del software, no la campaña física.

### Vista general

<p align="center">
  <img src="docs/img/overview-panel.jpg" alt="Vista general de la consola de operación (ADMIN)" width="100%">
  <br>
  <sub><b>Consola de operación (ADMIN)</b> — vista general: hoja de contactos con las nueve vistas de escritorio y sus diseños móviles.</sub>
</p>

<p align="center">
  <img src="docs/img/overview-public.jpg" alt="Vista general de la vista pública de alertas (CLIENTE)" width="100%">
  <br>
  <sub><b>Vista pública de alertas (CLIENTE)</b> — vista general: hoja de contactos con sus vistas de escritorio y móviles.</sub>
</p>

### Consola de operación (ADMIN)

<table>
  <tr>
    <td align="center" width="33%">
      <img src="docs/img/panel-panorama.png" alt="Panel Panorama de ADMIN" width="420">
      <br>
      <sub><b>Panorama</b> — quórum, líder, término, índice de confirmación, topología del clúster y los últimos eventos confirmados.</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/img/panel-seismographs.png" alt="Panel Sismógrafos de ADMIN" width="420">
      <br>
      <sub><b>Sismógrafos</b> — trazas sincronizadas construidas con la hora y el nivel de cada evento; los detectores no tienen sensor, así que las formas de onda son ilustrativas.</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/img/panel-alerts.png" alt="Panel Alertas de ADMIN" width="420">
      <br>
      <sub><b>Alertas</b> — alertas confirmadas con severidad, intensidad promedio, detectores que participaron e identificadores de los eventos.</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <img src="docs/img/panel-raft.png" alt="Panel Clúster Raft de ADMIN" width="420">
      <br>
      <sub><b>Clúster Raft</b> — líder, término, log replicado, índice de confirmación y salud de cada nodo.</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/img/panel-servers.png" alt="Panel Servidores de ADMIN" width="315">
      <br>
      <sub><b>Servidores</b> — los tres servidores de datos con su sistema operativo, métricas de PostgreSQL y controles de apagado/encendido.</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/img/panel-detectors.png" alt="Panel Detectores de ADMIN" width="420">
      <br>
      <sub><b>Detectores</b> — conexión y última lectura de cada placa, con pulsaciones simuladas en cuatro niveles de intensidad.</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <img src="docs/img/panel-history.png" alt="Panel Histórico de ADMIN" width="420">
      <br>
      <sub><b>Histórico</b> — histórico paginado fusionado de las tres bases, con filtros y vista de detalle.</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/img/panel-logs.png" alt="Panel Registros de ADMIN" width="420">
      <br>
      <sub><b>Registros</b> — registro de auditoría del operador y sucesos de los nodos, con inspección del JSON y exportación a CSV.</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/img/panel-settings.png" alt="Panel Configuración de ADMIN" width="420">
      <br>
      <sub><b>Configuración</b> — apariencia (tema, tamaño de letra, animaciones), idioma y formato de hora, escala de intensidad, unidad de PGA, ventana y escala vertical por defecto de las gráficas, y prueba del sonido de alerta con botón de detener.</sub>
    </td>
  </tr>
</table>

### Vista pública de alertas (CLIENTE)

<table>
  <tr>
    <td align="center" width="50%">
      <img src="docs/img/public-home.png" alt="Vista Inicio de CLIENTE" width="420">
      <br>
      <sub><b>Inicio</b> — estado de la red, estado de alerta actual, última alerta confirmada y resumen de los detectores.</sub>
    </td>
    <td align="center" width="50%">
      <img src="docs/img/public-alert.png" alt="Aviso a pantalla completa de CLIENTE" width="420">
      <br>
      <sub><b>Avisos</b> — aviso a pantalla completa de alerta confirmada (SIMULACRO) con el nivel de intensidad, los detectores que la registraron (S1 y S2) y la actuación recomendada.</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="docs/img/public-history.png" alt="Vista Historial de CLIENTE" width="420">
      <br>
      <sub><b>Historial</b> — alertas confirmadas y lecturas con filtros, paginación y navegación al detalle.</sub>
    </td>
    <td align="center" width="50%">
      <img src="docs/img/public-detail.png" alt="Detalle de un registro de CLIENTE" width="420">
      <br>
      <sub><b>Detalle</b> — una alerta confirmada completa: hora, intensidad, magnitud equivalente simulada, los detectores que la registraron (S1 y S2), la fuente de datos, cómo se confirmó y el apartado de ubicación.</sub>
    </td>
  </tr>
  <tr>
    <td align="center" colspan="2">
      <img src="docs/img/public-map.png" alt="Vista Mapa de CLIENTE" width="820">
      <br>
      <sub><b>Mapa</b> — la red de detectores sobre un mapa de OpenStreetMap renderizado con Leaflet, con los últimos eventos.</sub>
    </td>
  </tr>
</table>

### Móvil

<table>
  <tr>
    <td align="center" width="33%">
      <img src="docs/img/panel-mobile.png" alt="ADMIN en un móvil" width="180">
      <br>
      <sub><b>ADMIN</b> — la consola de operación en su diseño móvil, con el mismo estado en vivo.</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/img/public-mobile-home.png" alt="Inicio de CLIENTE en un móvil" width="180">
      <br>
      <sub><b>CLIENTE · Inicio</b> — vista pública de estado en un móvil.</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/img/public-mobile-alert.png" alt="Aviso de CLIENTE en un móvil" width="180">
      <br>
      <sub><b>CLIENTE · Avisos</b> — aviso a pantalla completa en un móvil.</sub>
    </td>
  </tr>
</table>

### Tema oscuro

<table>
  <tr>
    <td align="center" width="50%">
      <img src="docs/img/panel-dark.png" alt="Tema oscuro de ADMIN" width="420">
      <br>
      <sub><b>ADMIN</b> — tema oscuro, seleccionable en Configuración.</sub>
    </td>
    <td align="center" width="50%">
      <img src="docs/img/public-dark.png" alt="Tema oscuro de CLIENTE" width="420">
      <br>
      <sub><b>CLIENTE</b> — tema oscuro, que sigue la preferencia del sistema o la elección del usuario.</sub>
    </td>
  </tr>
</table>

Las dos imágenes de vista general son hojas de contacto que combinan varias de las vistas individuales
de esta sección; las capturas de escritorio y de móvil se tomaron del mismo despliegue en ejecución durante
una sesión de demostración.

## Arquitectura

El sistema no tiene nube ni microservicios: es firmware embebido, un agregador monolítico, un servidor
de datos dedicado por detector y un navegador.

```mermaid
flowchart LR
    subgraph CLUSTER["Clúster Raft · Wi-Fi 2,4 GHz · DHCP"]
        N1["ESP32 · Nodo 1<br/>HTTP :80 · UDP 4210/4211"]
        N2["ESP32 · Nodo 2<br/>HTTP :80 · UDP 4210/4211"]
        N3["ESP32 · Nodo 3<br/>HTTP :80 · UDP 4210/4211"]
    end

    N1 <-->|"UDP 4210 · Raft"| N2
    N2 <-->|"UDP 4210 · Raft"| N3
    N1 <-->|"UDP 4210 · Raft"| N3
    N1 -.->|"UDP 4211 · anuncio de descubrimiento"| N2
    N2 -.->|"UDP 4211 · anuncio de descubrimiento"| N3

    PC["Agregador Node.js<br/>HTTP + SSE · :8090"]

    PC -->|"HTTP GET · 1 Hz"| N1
    PC -->|"HTTP GET · 1 Hz"| N2
    PC -->|"HTTP GET · 1 Hz"| N3

    S1["Servidor de datos 1<br/>:8100 · PostgreSQL"]
    S2["Servidor de datos 2<br/>:8100 · PostgreSQL"]
    S3["Servidor de datos 3<br/>:8100 · PostgreSQL"]

    S1 -->|"HTTP GET · 1 Hz"| N1
    S2 -->|"HTTP GET · 1 Hz"| N2
    S3 -->|"HTTP GET · 1 Hz"| N3
    PC -->|"GET /api/historial"| S1
    PC -->|"GET /api/historial"| S2
    PC -->|"GET /api/historial"| S3

    OP["Consola de operación<br/>ADMIN · navegador"]
    PUB["Vista pública de alertas<br/>CLIENTE · navegador / móvil"]

    PC -->|"SSE /api/stream"| OP
    PC -->|"SSE /api/stream"| PUB
    OP -->|"POST /api/nodos/:n/control<br/>POST /api/nodos/:n/pulsar"| PC
```

El recorrido de los datos tiene dos vías independientes:

1. **Tiempo real:** cada nodo → el agregador lo sondea por HTTP → foto agregada en memoria →
   **SSE** → navegador.
2. **Histórico:** cada nodo → **su propio** servidor de datos lo sondea → `INSERT` en PostgreSQL → el
   agregador lee `/api/historial` de los tres servidores → navegador.

El agregador nunca escribe en las bases y no es un punto único de fallo para el histórico: si se cae,
los servidores de datos siguen recolectando. **No hay base de datos en el clúster**; el log Raft vive
en la RAM de cada nodo y solo `currentTerm` y `votedFor` se persisten en NVS.

### Canales y puertos

| Canal | Protocolo | Puerto | Extremos |
|---|---|---|---|
| Consenso Raft | UDP unicast, JSON compacto | **4210** | nodo ↔ nodo |
| Descubrimiento | UDP broadcast `SISMO-HOLA:N` cada 2 s | **4211** | nodo ↔ nodo |
| API del nodo | HTTP | **80** | agregador y servidores de datos → nodo |
| OTA | UDP 3232 + TCP 32323 (espota) | — | PC → nodo |
| Portal cautivo | DNS + HTTP sobre el AP del nodo | 53/udp, 80/tcp | móvil → nodo |
| Consola de operación, local | HTTP + SSE | **8090** | navegador ↔ agregador |
| Consola de operación, Docker | HTTP + SSE | **8095** → 8090 | navegador ↔ contenedor del panel |
| Servidores de datos | HTTP | **8100** (equipo de desarrollo 8101–8103) | agregador → servidor de datos |
| Controlador de infraestructura | HTTP + token Bearer | **8200** (sin publicar) | agregador → controlador |
| PostgreSQL | TCP | 5432 (sin publicar) | servidor de datos → base de datos |
| HTTPS, perfil opcional | TLS con Caddy | **8443** | navegador → Caddy |

Raft usa seis tipos de mensaje: `VoteReq`, `VoteResp`, `Append`, `AppendResp`, `Forward` y
`ForwardAck`.

### Los tres nodos detectores

Cada placa ejecuta el mismo firmware, compilado con un número de nodo distinto (`-DNODO=1|2|3`) que
define su identidad.

| Elemento | Implementación |
|---|---|
| Hardware | ESP32 DevKit V1 (30 pines, CP2102) |
| Entrada de eventos | Pulsador en **GPIO4 (D4)** a GND, `INPUT_PULLUP`, antirrebote de 20 ms, pulsación mínima de 80 ms |
| Indicador | LED azul en **GPIO2** (fijo = conoce al líder; 1 Hz = sin líder; parpadeo rápido = pulsando; apagado = caído o sin Wi-Fi) |
| Identidad | `NODO` en tiempo de compilación → nombre de host `sismo-nodo-N`, AP `SISMO-D<N>-config`, id `nodo-N-…` |
| API | HTTP 80: `/`, `/estado`, `/log`, `/sucesos`, `/alertas`, `POST /control`, `POST /pulsar`, `POST /huella` |
| Persistencia | NVS (`Preferences`): término y voto (`raft`), credenciales Wi-Fi (`wifi`), huella Wi-Fi (`ubic`) |
| Aprovisionamiento Wi-Fi | Portal cautivo integrado cuando la placa no puede unirse a la red configurada |
| Actualizaciones | OTA con ArduinoOTA (UDP 3232) |
| Compilación | `arduino-cli`, core `esp32:esp32` 3.3.12, ArduinoJson 7.4.3 |

### Componentes web

| Ruta | Responsabilidad |
|---|---|
| `server.js` | Servidor HTTP del panel: estáticos, API REST, SSE, proxy de control e infraestructura |
| `poller.js` | Sondeo de los nodos a 1 Hz, foto agregada, inferencia de líder y quórum |
| `config.js` | `NODOS`, puerto 8090, `SERVIDORES`, `CONTROLADOR`, posiciones fijas del mapa |
| `servidor/` | Servidor de datos por detector: histórico en PostgreSQL, retención y API de lectura |
| `controlador/` | Controlador de infraestructura: `stop`/`start` de `nodoN` y `servidorN` mediante el socket de Docker |
| `nodo-sim/` | ESP32 simulado con el **núcleo Raft real** compilado para Linux |
| `admin-src/` | Código fuente de la consola de operación: React 19 + TypeScript + Vite + Tailwind CSS |
| `public/` | Aplicación ADMIN compilada y vista pública CLIENTE |
| `fake/` | Nodos falsos para demos sin hardware (sin Raft) |
| `docker/` | Dockerfiles de nodos simulados, servidores de datos y controlador |
| `scripts/` | `test-db.sh`, `test-infra.sh`, `verificar-esp32.js` |
| `test/` | Suite de pruebas Node.js (75 casos) |

## Consenso y regla de alerta

El núcleo Raft está en `firmware/detector/src/nucleo/`, aislado de Arduino para poder compilarlo y
probarlo en un PC. El mismo código se compila para Linux en los nodos simulados de Docker.

| Componente | Estado |
|---|---|
| Elección de líder, términos y un único voto persistido en NVS | Implementado |
| Regla del log al día y comprobación de consistencia (`prev_idx`/`prev_term`) | Implementado |
| `AppendEntries`/latido (500 ms), replicación por lotes (≤ 8 entradas, ≤ 4 en vuelo) | Implementado |
| `commitIndex` con el voto de 2 de 3 nodos, solo entradas del término actual | Implementado |
| Reenvío de eventos de seguidores al líder, con deduplicación por `id` | Implementado |
| Puesta al día de un nodo reiniciado, desde el índice 1 | Implementado |
| Reintentos, timeouts, caída simulada y recuperación | Implementado |
| Log duradero, instantáneas y cambios de membresía | **No implementado** (limitación) |
| Pre-vote, check-quorum, autenticación o cifrado de mensajes | **No implementado** (limitación) |
| Capacidad del log | 1000 entradas en RAM; al llenarse se rechazan eventos nuevos |

La máquina de estados de la alerta es determinista y se ejecuta en todos los nodos sobre el log
confirmado. Una alerta necesita un evento disparador y el evento **libre** más cercano de los otros
detectores dentro de 10 s; el promedio de los niveles del grupo decide la severidad, y los eventos
consumidos por una alerta no se reutilizan.

| Nivel promedio | Severidad |
|---|---|
| ≥ 7,5 | alta |
| ≥ 4,5 y < 7,5 | media |
| < 4,5 | baja |

```mermaid
stateDiagram-v2
    [*] --> Seguidor
    Seguidor --> Candidato: vence el tiempo de espera de elección (5–9 s)
    Candidato --> Líder: 2 de 3 votos
    Candidato --> Seguidor: AppendEntries o término mayor
    Líder --> Seguidor: observa un término mayor
    Seguidor --> Caído: POST /control (caer)
    Líder --> Caído: POST /control (caer)
    Caído --> Seguidor: POST /control (recuperar)
```

El ciclo de vida de un evento simulado, desde el pulsador hasta la interfaz:

```mermaid
sequenceDiagram
    autonumber
    participant B as Pulsador (GPIO4)
    participant N as Nodo detector
    participant L as Líder Raft
    participant F as Seguidores
    participant A as Agregador
    participant U as Navegador

    B->>N: pulsación y liberación (antirrebote de 20 ms, mínimo 80 ms)
    N->>N: nivel = min(10, 1 + ms / 450)
    N->>N: PGA = 0.028 * nivel + 0.015
    alt este nodo es el líder
        N->>N: añade la entrada a su log local
    else este nodo es seguidor
        N->>L: Forward(evento), reintento cada 500 ms
    end
    L->>F: AppendEntries (máximo 8 entradas por lote)
    F-->>L: AppendResp(ok, match_idx)
    L->>L: commitIndex avanza con el voto de 2 de 3 nodos
    L->>F: Append con el índice de confirmación actualizado
    N->>N: aplica solo las entradas confirmadas
    Note over N: dos detectores distintos en 10 s generan una alerta
    A->>N: GET /estado, /log, /sucesos, /alertas (1 Hz)
    A->>U: SSE /api/stream (foto más latido cada 5 s)
```

## Inicio rápido

### Requisitos

- Un PC con Linux, **Node.js 22 o superior** y `npm`; `g++` y `make` para las pruebas C++.
- **Docker con Compose** para la demo en contenedores (opcional, pero el camino más rápido).
- **arduino-cli 1.5.1**, el core `esp32:esp32` 3.3.12 y ArduinoJson 7.4.3 para el firmware y las
  pruebas C++.
- Para la campaña física: 3 × ESP32 DevKit V1, 3 cables USB de datos, 3 pulsadores, una protoboard,
  una red Wi-Fi de 2,4 GHz con DHCP y broadcast habilitados, aislamiento de clientes desactivado y
  acceso a internet para NTP (sin hora los nodos funcionan, pero no pueden generar alertas).

Clona el repositorio (remoto canónico, rama por defecto `main`) y entra en el directorio del proyecto:

```bash
git clone https://github.com/sebas-archive/alerta-sismica-raft-esp32.git
cd alerta-sismica-raft-esp32
```

### 1. Demo completa con Docker (Raft real, PostgreSQL real)

```bash
docker compose up --build
# Consola de operación (ADMIN):  http://localhost:8095/
# Vista pública de alertas:      http://localhost:8095/publico
docker compose down
```

El despliegue por defecto levanta **11 servicios**: `nodo1..3` (ESP32 simulados que ejecutan el núcleo Raft
real sobre Debian), `db1..3` (PostgreSQL 16), `servidor1..3` (servidores de datos sobre Fedora 42,
openSUSE Leap 15.6 y Ubuntu 24.04), `panel` y `controlador`. La primera compilación compila el nodo
simulado en C++ y descarga ArduinoJson 7.4.3, así que necesita acceso a la red.

### 2. Ejecución local contra tus propios nodos

```bash
cd web
npm start
# ADMIN:          http://localhost:8090/
# Vista pública:  http://<IP-del-PC>:8090/publico

# Si mDNS no resuelve las placas:
NODOS="http://IP1,http://IP2,http://IP3" npm start
```

El panel no tiene dependencias en tiempo de ejecución, así que no hay que instalar nada para
arrancarlo. `npm install` solo hace falta para el servidor de datos (el cliente `pg`) y para las
pruebas de base de datos e infraestructura.

### 3. Demo sin hardware

```bash
cd web
npm run fake     # tres nodos falsos en los puertos 9001–9003
NODOS="http://127.0.0.1:9001,http://127.0.0.1:9002,http://127.0.0.1:9003" npm start
```

Los nodos falsos no implementan Raft; solo ofrecen un estado realista para trabajar en la interfaz. Usa
el despliegue de Docker cuando necesites el núcleo de consenso real.

### 4. Compilar y flashear el firmware

```bash
cd firmware/detector
cp secretos.ejemplo.h secretos.h
# edita WIFI_PASS, OTA_CLAVE y PORTAL_CLAVE en secretos.h (mínimo 8 caracteres)
# define el SSID en config.h (misma carpeta)

cd ..
./cargar.sh 1      # compila con -DNODO=1 y flashea por USB
./cargar.sh 2
./cargar.sh 3
```

`./cargar.sh N --wifi` flashea por aire cuando la placa ya está en la red. Para compilar sin
flashear, desde la raíz del repositorio:

```bash
arduino-cli compile --fqbn esp32:esp32:esp32 \
  --build-property "compiler.cpp.extra_flags=-DNODO=1" \
  --build-path /tmp/fw1 firmware/detector
```

### 5. Producción y HTTPS (opcional)

```bash
# Capa de producción: sin nodos simulados, secretos de Docker, solo el panel publicado
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Perfil HTTPS opcional (Caddy con una CA local) en el puerto 8443
docker compose --profile https up -d
```

La capa de producción espera la contraseña de la base y el token del controlador en
`secretos/db_password.txt` y `secretos/control_token.txt`, y `NODO1_URL..NODO3_URL` apuntando a placas
reales. El procedimiento completo está en
[`docs/servidores-de-datos.md`](docs/servidores-de-datos.md).

## Configuración

### Panel (agregador)

| Variable | Por defecto | Descripción |
|---|---|---|
| `PUERTO` | `8090` | Puerto HTTP (en Docker el contenedor mantiene 8090 y Compose publica 8095) |
| `NODOS` | `http://sismo-nodo-1.local, …` | URLs base de los tres detectores, separadas por comas |
| `SERVIDORES` | vacío | URLs de los servidores de datos, separadas por comas; sin esto no hay histórico |
| `CONTROLADOR_URL` | vacío | URL del controlador de infraestructura; sin esto se desactiva apagar/encender |
| `CONTROL_TOKEN` | vacío | Token Bearer para el controlador (desarrollo) |
| `CONTROL_TOKEN_FILE` | sin definir | Archivo con el token; tiene prioridad sobre `CONTROL_TOKEN` |
| `INTERVALO_MS` | `1000` | Intervalo de sondeo de los nodos |
| `TIMEOUT_NODO_MS` | `3000` | Tiempo de espera por petición a un nodo |

`web/config.js` fija además las posiciones de los tres detectores en el mapa.

### Servidores de datos y controlador

| Servicio | Variables |
|---|---|
| Servidor de datos (×3) | `N`, `NODO_URL`, `DATABASE_URL` (o `DB_HOST`/`DB_NAME`/`DB_USER`/`DB_PASSWORD_FILE`), `PUERTO` (8100), `INTERVALO_MS`, `TIMEOUT_NODO_MS`, `RETENCION_*` |
| Controlador | `PUERTO` (8200), `CONTROL_TOKEN` o `CONTROL_TOKEN_FILE`, `COMPOSE_PROJECT`, `DOCKER_SOCKET` |
| Sobrescrituras de Compose | `PREFIJO`, `PUERTO_PANEL`, `PUERTO_NODO1..3`, `PUERTO_SERVIDOR1..3`, `NODO1_URL..NODO3_URL`, `NODOS`, `DB_PASSWORD` |

Copia [`ejemplo.env`](ejemplo.env) a `.env` para cambiar los puertos del equipo, apuntar el agregador a
placas físicas o habilitar las políticas de retención opcionales.

### Archivos y secretos

| Archivo | Contiene | Notas |
|---|---|---|
| `firmware/detector/config.h` | `WIFI_SSID` y tiempos de Raft | Se compila dentro del firmware |
| `firmware/detector/secretos.h` | Contraseña Wi-Fi, clave OTA, clave del AP de aprovisionamiento | Ignorado por git; parte de `secretos.ejemplo.h` |
| `firmware/placas.conf` | Dirección MAC → número de detector | Mantiene operativos los scripts de flasheo |
| `.env` | Sobrescrituras locales de Compose | Ignorado por git |
| `secretos/` | Contraseña de la base de producción y token del controlador | Secretos de Docker, ignorados por git |

La retención está desactivada por defecto: no se archiva ni se elimina nada salvo que se active
`RETENCION_ACTIVA`. El control de apagar/encender del panel exige `Content-Type: application/json`,
`{"confirmar":true}` y una petición del mismo origen; no tiene login, así que en una red no confiable
debe ir detrás de un proxy con autenticación.

## API

### Agregador (panel)

| Método y ruta | Función |
|---|---|
| `GET /api/estado` | Foto agregada del clúster construida con el estado de los nodos |
| `GET /api/stream` | Flujo SSE: fotos de estado y un latido `vivo` cada 5 s |
| `GET /api/infra` | Estado de la infraestructura leído a través del controlador |
| `GET /api/servidores` | Estado de los tres servidores de datos |
| `GET /api/historial` | Histórico paginado y filtrado, fusionado de las tres bases |
| `GET /api/publico/historial` | Histórico público: solo alertas y lecturas confirmadas |
| `GET /api/registro` | Un registro completo con su JSON en bruto |
| `GET /api/retencion` | Política y plan de retención (solo lectura) |
| `POST /api/nodos/:n/control` | Proxy al nodo; exige cuerpo JSON |
| `POST /api/nodos/:n/pulsar` | Proxy de una pulsación simulada al nodo; exige cuerpo JSON |
| `POST /api/infra/servidores/:n/apagar` | Apaga el nodo *n* y su servidor de datos; JSON + `{"confirmar":true}` |
| `POST /api/infra/servidores/:n/encender` | Enciende el nodo *n* y su servidor de datos; JSON + `{"confirmar":true}` |

### Nodo (firmware ESP32)

| Método y ruta | Respuesta |
|---|---|
| `GET /` | Página HTML de estado de la propia placa |
| `GET /estado` | Estado JSON de 18 claves (rol, término, longitud del log, índice de confirmación, pendientes, reloj, Wi-Fi…) |
| `GET /log?desde=N` | Entradas del log, 50 por página, con clase, término, índice y pertenencia a alerta |
| `GET /sucesos?desde=N` | Sucesos del nodo (elecciones, caídas, recuperaciones) con números de secuencia |
| `GET /alertas` | Alertas confirmadas con promedio, severidad, identificadores de eventos, término y líder |
| `POST /control` | `{"accion":"caer"}` o `{"accion":"recuperar"}` |
| `POST /pulsar` | `{"ms":80..60000}` para simular una pulsación |
| `POST /huella` | Solicita un nuevo escaneo de huella Wi-Fi |

En el modo por defecto no hay autenticación y CORS es `*`; mantén la API de los nodos y el panel en
una LAN de confianza. El perfil HTTPS opcional solo protege el tramo navegador-panel.

## Pruebas

| Suite | Casos | Comando | Notas |
|---|---|---|---|
| Núcleo C++ | **78** (32 Raft, 17 huella, 11 máquina de estados de alerta, 9 API, 9 mensajes) | `make test` en una copia de `firmware/test` | Red Raft simulada, sin hardware; 78/78 pasan |
| Node.js | **75** | `cd web && npm test` | 60 pasan, 15 se omiten sin Docker/PostgreSQL |
| Base de datos | incluidas en Node con `REQUIRE_DB=1` | `cd web && npm run test:db` | Tres PostgreSQL efímeros en contenedores |
| Infraestructura | incluidas en Node con `REQUIRE_INFRA=1` | `cd web && npm run test:infra` | Proyecto Compose aislado `vybraint` |

Un arnés de configuración desplegada más antiguo (**A′**) registró 5/5 (elección 5820 ms, conmutación
por fallo 5500 ms, commit 510 ms) en la campaña del **2026-11-17**. Se conserva solo como **evidencia
histórica**: el arnés ya no forma parte del repositorio, no se volvió a ejecutar para esta revisión y
no cuenta como suite actual. Consulta
[`entrega/04-evidencias/E-pruebas/NOTA-TST-11.md`](entrega/04-evidencias/E-pruebas/NOTA-TST-11.md).

```bash
# Núcleo C++: 78 casos, red Raft simulada, sin hardware
cp -a firmware /tmp/vybra-fw
cd /tmp/vybra-fw/test
make JSON_DIR="$HOME/Arduino/libraries/ArduinoJson/src" test
cd -                 # vuelve a la raíz del repositorio

# JavaScript: 75 casos (60 pasan, 15 se omiten sin Docker/PostgreSQL)
cd web
npm install          # solo pg, lo usa el servidor de datos
npm test

# PostgreSQL real y apagado/encendido real con Docker
npm run test:db
npm run test:infra
```

`npm test` incluye el controlador contra un socket de Docker simulado y el núcleo Raft real con tres
procesos nativos (`web/test/raft-nativo.test.js`). Las pruebas de PostgreSQL y de Docker se omiten
cuando esos servicios no están disponibles. `npm run test:infra` levanta un proyecto Compose
**aislado** (`vybraint`, con sus propios nombres, puertos y volúmenes, nunca el despliegue normal) y
comprueba contenedores, volúmenes, cambio de líder, quórum y recuperación mientras apaga y enciende
cada servidor.

No hay pipeline de CI y `detector.ino` (Wi-Fi, portal, HTTP, NVS, OTA) no tiene pruebas automatizadas;
lo cubre la lista de comprobación de la campaña física en
[`docs/prueba-hardware.md`](docs/prueba-hardware.md).

## Estructura del repositorio

```
.
├── firmware/                  Firmware de la ESP32 y núcleo C++ portable
│   ├── detector/              Programa de Arduino + src/nucleo/ (Raft, máquina de alerta, API, mensajes, huella)
│   ├── test/                  Suite C++ con red Raft simulada (78 casos)
│   ├── cargar.sh              Compila y flashea por USB u OTA
│   ├── quien.sh               Identifica placas por su dirección MAC
│   └── placas.conf            Registro MAC → número de detector
├── web/                       Servidor Node.js y las dos interfaces web
│   ├── server.js              Servidor HTTP del panel: estáticos, API REST, SSE
│   ├── poller.js              Sondea los nodos y construye la foto agregada
│   ├── config.js              URLs de nodos, puerto, servidores de datos, controlador, posiciones del mapa
│   ├── servidor/              Servidor de datos por detector (histórico en PostgreSQL y retención)
│   ├── controlador/           Controlador de infraestructura (único proceso con el socket de Docker)
│   ├── nodo-sim/              ESP32 simulado: el núcleo Raft real compilado para Linux
│   ├── admin-src/             Código fuente de la consola de operación (React + TypeScript + Vite)
│   ├── public/                Aplicación ADMIN compilada y vista pública CLIENTE
│   ├── fake/                  Nodos falsos para demos sin hardware (sin Raft)
│   ├── docker/                Dockerfiles de nodos simulados, servidores de datos y controlador
│   ├── scripts/               test-db.sh, test-infra.sh, verificar-esp32.js
│   └── test/                  Suite de pruebas Node.js (75 casos)
├── docs/                      Documentación de operación y arquitectura
│   ├── img/                   Imagen de cabecera del README y capturas de las interfaces
│   ├── prueba-hardware.md     Campaña física guiada con las tres placas
│   ├── servidores-de-datos.md Servidores de datos, PostgreSQL, retención y apagado/encendido
│   └── ARQUITECTURA-ACTUAL.md Inventario técnico verificado del sistema
├── entrega/                   Entregables académicos y evidencias
│   ├── 04-evidencias/         Capturas, registros y tablas por categoría (saneadas)
│   ├── 05-pruebas/            Datos, registros y scripts de campaña
│   ├── 06-manual/             Guía de conexión de placas e instalación
│   ├── 10-informes-fase3/     Informes técnicos, incluido el diagnóstico del pulsador de T1
│   ├── 11-documento-final/    Fuente y figuras del documento técnico final
│   └── 12-manual-instalacion/ Manual final de instalación y operación (Markdown)
├── docker-compose.yml         Demo completa: 11 servicios con el núcleo Raft real, PostgreSQL y controlador
├── docker-compose.prod.yml    Capa de producción: secretos de Docker, sin nodos simulados
├── ejemplo.env                Plantilla para sobrescrituras locales de Compose
├── THIRD-PARTY.md             Licencias de terceros
├── VERSION                    Versión y notas de publicación
├── LICENSE                    MIT
└── README.md
```

La documentación y las evidencias se entregan **solo en Markdown y figuras**: no hay Word, PDF,
PowerPoint, Excel ni ZIP. El código, los datos de evidencia y las fuentes de los diagramas se
conservan en sus carpetas.

## Estado del proyecto

| Área | Estado |
|---|---|
| Clúster de tres nodos | **Operativo**: 3/3 placas en red, un único líder, término y log coherentes, quórum completo |
| Firmware `v1.0.0-rc1` | Flasheado en las tres placas; identidades 1, 2 y 3 verificadas |
| Pruebas automáticas | 78/78 C++ · 75 JavaScript (60 pasan, 15 se omiten sin Docker/PostgreSQL) |
| Evidencia histórica de campaña | Arnés A′ 5/5 el 2026-11-17; el arnés **no se distribuye** en el repositorio actual y no se volvió a ejecutar |
| Demo con Docker | 11 servicios: 3 nodos simulados con el **núcleo Raft real** (Debian), 3 PostgreSQL, 3 servidores de datos (Fedora 42, openSUSE Leap, Ubuntu 24.04), panel y controlador |
| P0 (preparación de la campaña) | **Completa**, con evidencias |
| **T1 (evento con pulsador)** | **No aprobada.** Consulta la incidencia siguiente |
| T2 en adelante | Pendientes de autorización |

`v1.0.0-rc1` es la candidata a versión que ya superó todas las validaciones de software; la etiqueta
final `v1.0.0` se creará solo después de la campaña física con las tres placas, que es un criterio de
aceptación del proyecto.

### Incidencia T1 abierta: el pulsador

- Una sola pulsación de unos 900 ms se registró como **dos eventos cortos** (301 ms y 174 ms,
  separados 3,2 s) en lugar de uno.
- Los dos eventos tienen identificadores distintos y contenido idéntico en los tres nodos; `log_len`
  y `commit_index` pasaron de 1 a 3, y no se creó ninguna alerta —correcto, porque solo participó un
  detector.
- El nivel y el PGA calculados por el firmware coinciden con la fórmula para las duraciones medidas,
  así que el cálculo es correcto y la anomalía está en la **entrada física**.
- La repetición está pendiente de una revisión del hardware del pulsador. El diagnóstico completo y
  el plan correctivo están en
  [`entrega/10-informes-fase3/diagnostico-pulsador.md`](entrega/10-informes-fase3/diagnostico-pulsador.md).

## Limitaciones conocidas

1. **El evento se simula** con un pulsador; no hay medición sísmica.
2. **El log Raft no es duradero:** vive en RAM. Un reinicio lo reconstruye desde el líder, y un corte
   de energía puede perder eventos aceptados pero aún no confirmados.
3. **Resincronización de emergencia:** si una mayoría se reinicia en frío, un nodo puede descartar su
   log y copiarlo del líder. Es deliberado (para no quedar divergente), pero no es durabilidad.
4. **Sin instantáneas:** el log está limitado a 1000 entradas; al llenarse se rechazan eventos nuevos.
5. **Sin seguridad de transporte:** la API HTTP de los nodos y el tráfico Raft por UDP no tienen
   autenticación ni cifrado, y CORS es `*`.
6. **Sin pre-vote ni check-quorum:** un líder aislado sigue creyendo que es el líder.
7. **`ForwardAck` confirma la aceptación, no el commit:** un evento puede perderse si el líder muere
   justo después de reenviarlo.
8. **El quórum del agregador es una inferencia** (al menos dos nodos alcanzables que informan del
   mismo líder), no una validación del consenso.
9. **La demo de Docker sí ejecuta el Raft real:** el nodo simulado compila el mismo núcleo del firmware
   para Linux; el único simulador sin Raft que queda es `npm run fake`.

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/prueba-hardware.md`](docs/prueba-hardware.md) | Campaña física guiada con las tres placas: requisitos, asignación de pines, flasheo, lista de comprobación de T1 y evidencias |
| [`docs/servidores-de-datos.md`](docs/servidores-de-datos.md) | Servidores de datos, esquema de PostgreSQL, retención, apagado/encendido y modelo de seguridad |
| [`docs/ARQUITECTURA-ACTUAL.md`](docs/ARQUITECTURA-ACTUAL.md) | Inventario técnico verificado del sistema tal como está en el repositorio |
| [`entrega/12-manual-instalacion/README.md`](entrega/12-manual-instalacion/README.md) | Manual final de instalación y operación: diez capítulos en Markdown, figuras y tablas |
| [`entrega/06-manual/conexion-esp32.md`](entrega/06-manual/conexion-esp32.md) | Conexión, identificación y flasheo de las placas |
| [`entrega/04-evidencias/`](entrega/04-evidencias/) | Capturas, registros y tablas de resultados por categoría (saneadas) |
| [`entrega/05-pruebas/scripts/`](entrega/05-pruebas/scripts/) | Scripts de campaña: instantáneas validadas, sondeo con tiempos, capturas verificadas y captura pasiva del serial |
| [Video de sustentación](https://youtu.be/YlzKwWkXzaw) | Video de defensa del proyecto (en español) |

## Privacidad y datos

- **Los secretos no se versionan:** `firmware/detector/secretos.h` (contraseña Wi-Fi, clave OTA y
  clave del portal de aprovisionamiento) está ignorado por git y nunca se ha publicado.
- **Los identificadores de las evidencias están saneados:** las capturas y los registros de `entrega/`
  sustituyen los identificadores de red por marcadores como `[MAC-N1]`, `[IP-N2]` y `[SSID]`; los
  resultados de las pruebas no se alteraron. Consulta
  [`entrega/05-pruebas/datos/NOTA-saneado.md`](entrega/05-pruebas/datos/NOTA-saneado.md).
- **Excluidos del repositorio:** volcados crudos de USB (`*.raw`), archivos PID y archivos `.env`
  locales.
- **Se conservan los archivos funcionales** (`config.h` con el SSID, `placas.conf` con las MAC) para
  no romper el firmware ni los scripts; el repositorio está previsto como privado.
- **La vista pública solo expone campos para el usuario:** los identificadores internos y los detalles
  de las bases se filtran, y el comportamiento está cubierto por pruebas.

## Pila tecnológica

| Capa | Tecnología |
|---|---|
| Hardware | ESP32 DevKit V1 (30 pines, CP2102), pulsador en GPIO4, LED de estado en GPIO2 |
| Lenguaje del firmware | C++ (núcleo compatible con C++17, gnu++2a en la placa a través del core de ESP32) |
| Cadena de herramientas del firmware | arduino-cli 1.5.1, core `esp32:esp32` 3.3.12, ESP-IDF 5.5.5 |
| Librerías del firmware | ArduinoJson 7.4.3 (la única dependencia del firmware) |
| Consenso | Raft escrito a mano: elección, replicación, commit por mayoría, reenvío, puesta al día |
| Transporte entre nodos | UDP unicast 4210 y descubrimiento por UDP broadcast 4211, JSON compacto |
| API de los nodos | HTTP con el WebServer de Arduino en el puerto 80 |
| Almacenamiento en el nodo | NVS (`Preferences`): término y voto, credenciales Wi-Fi, huella Wi-Fi |
| Agregador | Node.js 22, ESM, sin framework y sin dependencias en tiempo de ejecución |
| Transporte en tiempo real | Server-Sent Events (SSE) sobre HTTP |
| Servidores de datos | Node.js + `pg` 8.23.1 sobre Fedora 42, openSUSE Leap 15.6 y Ubuntu 24.04 |
| Base de datos | PostgreSQL 16 (`postgres:16-alpine`), una instancia por detector |
| Controlador de infraestructura | Node.js 22 + API de Docker Engine por el socket Unix |
| Interfaz ADMIN | React 19, TypeScript, Vite 8, Tailwind CSS 4 (recursos precompilados en el repositorio) |
| Interfaz CLIENTE | HTML/CSS/JS nativo + Leaflet 1.9.4 (vendorizado) con teselas de OpenStreetMap; ipwho.is como alternativa de ubicación por IP |
| ESP32 simulado | El mismo núcleo Raft compilado para Linux en contenedores Debian bookworm |
| Contenedores | Docker Compose, 11 servicios por defecto |
| Pruebas | Arnés C++ propio (78 casos) + `node:test` de Node (75 casos) |
| TLS opcional | Caddy 2 con una CA local, perfil `https` en el puerto 8443 |

**Construido con:** ESP32 · C++ · Raft · Node.js · PostgreSQL · Docker Compose · React · Leaflet.

## Licencia

Código y documentación bajo licencia MIT — © 2026 Sebastián Revelo. Consulta [`LICENSE`](LICENSE).

Las dependencias de terceros conservan sus propias licencias y **no** se distribuyen con este
repositorio: consulta [`THIRD-PARTY.md`](THIRD-PARTY.md). Las teselas del mapa las sirve OpenStreetMap;
los datos del mapa son © colaboradores de OpenStreetMap.

## Agradecimientos

Proyecto final del programa de Ingeniería de Software (Sistemas Distribuidos) de la Universidad
Manuela Beltrán, desarrollado por Jose Camilo Pérez Daza, Sebastián Fernando Revelo Meneses y Tomas
Alejandro Santiago Reyes.
