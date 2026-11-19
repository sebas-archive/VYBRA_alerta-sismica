# Glosario de siglas y términos

Definiciones empleadas en la documentación de Alerta Sísmica / VYBRA. Las siglas corresponden a los
términos que aparecen en el código, en el README y en los entregables.

## Siglas

| Sigla | Significado | Contexto en el proyecto |
|---|---|---|
| **ADMIN** | Interfaz de administración y operación | SPA servida en `/admin/` (panel de operación) |
| **AP** | Access Point (punto de acceso WiFi) | AP de configuración `SISMO-D<N>-config` que crea el firmware |
| **API** | Application Programming Interface | API HTTP de los nodos ESP32 y del agregador |
| **CLIENTE** | Vista pública para la comunidad | SPA servida en `/cliente/`, accesible por `/publico` |
| **CORS** | Cross-Origin Resource Sharing | El agregador responde con CORS `*` (limitación documentada) |
| **CSV** | Comma-Separated Values | Exportación de registros desde ADMIN y matrices de pruebas |
| **DHCP** | Dynamic Host Configuration Protocol | Los ESP32 reciben IP dinámica del router |
| **ESM** | ECMAScript Modules | `web/` usa módulos ESM (`"type": "module"`) |
| **GPIO** | General Purpose Input/Output | Pulsador en GPIO4 (D4) y LED en GPIO2 |
| **HTML** | HyperText Markup Language | Interfaces y portal cautivo del firmware |
| **HTTP / HTTPS** | HyperText Transfer Protocol / seguro | API del nodo (80), panel (8090) y perfil Caddy (8443) |
| **JSON** | JavaScript Object Notation | Formato de los mensajes Raft, de la API y de la configuración |
| **KPI** | Key Performance Indicator | Indicadores del Panorama de ADMIN |
| **LED** | Light-Emitting Diode | LED azul integrado (GPIO2) que indica el estado del nodo |
| **MAC** | Media Access Control | Dirección de fábrica con la que `quien.sh` identifica cada placa |
| **mDNS** | Multicast DNS | Resolución de `sismo-nodo-N.local` en la red local |
| **MIT** | Licencia del Instituto Tecnológico de Massachusetts | Licencia del código y la documentación originales |
| **NTP** | Network Time Protocol | Sincronización horaria de los nodos (cada 10 min, UTC−5) |
| **NVS** | Non-Volatile Storage | Persistencia de término/voto, credenciales WiFi y huella |
| **OTA** | Over-The-Air | Actualización del firmware por WiFi (ArduinoOTA) |
| **PGA** | Peak Ground Acceleration | Aceleración máxima simulada: `pga = 0.028·nivel + 0.015` |
| **RAM** | Random Access Memory | Memoria donde vive el log de Raft (no durable) |
| **RSSI** | Received Signal Strength Indicator | Intensidad de la señal WiFi reportada por cada nodo |
| **SPA** | Single Page Application | ADMIN y CLIENTE son aplicaciones de una sola página |
| **SSE** | Server-Sent Events | Canal `/api/stream` para el estado en tiempo real |
| **SSID** | Service Set Identifier | Nombre de la red WiFi 2,4 GHz |
| **TCP / UDP** | Transmission Control Protocol / User Datagram Protocol | HTTP/OTA sobre TCP; Raft y descubrimiento sobre UDP |
| **TLS** | Transport Layer Security | HTTPS opcional con Caddy (`tls internal`) |
| **UI** | User Interface | Interfaz de usuario |
| **UTC** | Coordinated Universal Time | Zona del proyecto: UTC−5 (America/Bogota) |
| **VYBRA** | Nombre del proyecto | Alerta Sísmica / VYBRA |
| **WPA2** | Wi-Fi Protected Access 2 | Seguridad del AP del portal |

## Términos

| Término | Definición en este proyecto |
|---|---|
| **Agregador** | Proceso Node.js (`web/server.js` + `web/poller.js`) que sondea los nodos a 1 Hz, mantiene una foto agregada en memoria y sirve ADMIN, CLIENTE y SSE |
| **Alerta** | Emisión de la máquina sísmica cuando **dos detectores distintos** tienen eventos dentro de una ventana de 10 s; la severidad es alta (promedio ≥ 7,5), media (≥ 4,5) o baja (el resto) |
| **Candidato** | Estado de un nodo que inicia una elección tras vencer su timeout (5000–9000 ms) |
| **Commit** | Confirmación de una entrada del log cuando la acepta una mayoría (2 de 3); solo lo confirmado se aplica a la máquina sísmica |
| **Controlador de infraestructura** | Servicio aislado (`web/controlador/`) con el único acceso al socket de Docker; apaga/enciende `nodoN` y `servidorN` |
| **Descubrimiento** | Anuncio por broadcast UDP 4211 (`SISMO-HOLA:N` cada 2 s) con el que los nodos aprenden las IP de los demás |
| **Detector** | Cada ESP32 (o su nodo simulado) que genera eventos con su pulsador y participa en el consenso |
| **Evento** | Lectura simulada producida por una pulsación: id, nodo, nivel, PGA, duración y hora |
| **Firmware** | Código Arduino/ESP32 de `firmware/detector/` y núcleo portable de `firmware/detector/src/nucleo/` |
| **Forward** | Envío de un evento desde un seguidor al líder (`Forward`/`ForwardAck`) con deduplicación por id |
| **Heartbeat / latido** | `AppendEntries` vacío o con entradas que el líder envía cada 500 ms |
| **Huella WiFi** | Referencia de redes WiFi cercanas que permite detectar si movieron la placa |
| **Líder** | Nodo que coordina la replicación; se elige por mayoría y se identifica con `lider_conocido` |
| **Log de consenso** | Secuencia de entradas replicadas en los nodos; vive en RAM y su tope es de 1000 entradas |
| **Nivel** | Intensidad simulada 1–10 calculada con la duración del pulso: `min(10, 1 + ms/450)` |
| **Nodo simulado** | Contenedor que ejecuta el **mismo núcleo Raft** del firmware compilado para Linux (`web/nodo-sim/`) |
| **Pendiente** | Evento aceptado por un nodo pero aún no confirmado por la mayoría |
| **Quórum** | Mayoría 2 de 3. En el agregador es una inferencia: ≥ 2 nodos disponibles que reconocen al mismo líder |
| **Raft** | Algoritmo de consenso replicado: elección de líder, replicación del log y seguridad |
| **Retención** | Política opcional de archivado/eliminación del histórico; desactivada por defecto |
| **Seguidor** | Nodo que replica el log del líder y reenvía al líder los eventos que genera |
| **Servidor de datos** | Proceso Node.js (`web/servidor/`) asignado a un ESP32 que persiste su histórico en PostgreSQL |
| **Saneado** | Sustitución de identificadores de red (MAC, IP, SSID) por marcadores en las evidencias, sin alterar resultados |
| **Snapshot (del log)** | Mecanismo de compactación del log de Raft; **no implementado** (limitación) |
| **Suceso** | Cambio relevante del clúster (elección, caída, recuperación) expuesto en `/sucesos` |
| **Término** | Número monotónico de época de Raft; un término tiene como máximo un líder |
| **Ventana de coincidencia** | Intervalo de 10 s en el que se buscan eventos de otros detectores para formar una alerta |
