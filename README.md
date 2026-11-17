# Alerta Sísmica — red de detectores con consenso Raft sobre ESP32

Sistema distribuido de tres nodos detectores (ESP32) que forman un clúster **Raft** por WiFi, más un
panel web que agrega su estado y una vista pública de alertas.

> **Naturaleza del proyecto.** El sistema demuestra **procesamiento distribuido, comunicación entre
> procesos y consenso** ante eventos sísmicos **simulados**. La entrada de eventos es un **pulsador
> físico** en cada placa: no hay instrumentación sísmica ni medición de aceleración. La duración de
> la pulsación define un nivel de intensidad (1–10) y un PGA según una escala de simulación. Los
> resultados deben interpretarse como comportamiento de la arquitectura distribuida, no como
> medición sismológica.

---

## 1. Problema y objetivo

Una red de alerta temprana necesita varios puntos de observación que coincidan para no dar falsas
alarmas, y debe seguir funcionando si uno de esos puntos falla. Una solución centralizada depende de
un único servidor: si cae, no hay alerta ni registro.

Este proyecto implementa el núcleo de ese problema con **consenso replicado**: los eventos se
proponen a un clúster de tres nodos, se replican a un log común y solo se consideran confirmados
cuando una **mayoría (2 de 3)** los acepta. Un evento confirmado alimenta una máquina de estados
determinista que emite una alerta cuando **dos detectores distintos** coinciden en una ventana de
**10 segundos**.

---

## 2. Arquitectura general

```
┌──────────────┐  UDP 4210 (Raft)   ┌──────────────┐  UDP 4210   ┌──────────────┐
│ ESP32 nodo 1 │◄──────────────────►│ ESP32 nodo 2 │◄───────────►│ ESP32 nodo 3 │
│ HTTP 80      │                    │ HTTP 80      │             │ HTTP 80      │
└──────┬───────┘                    └──────┬───────┘             └──────┬───────┘
       │  broadcast UDP 4211 "SISMO-HOLA:N" cada 2 s (descubrimiento DHCP)
       └───────────────┬──────────────────┬────────────────────────────┘
                       │ HTTP GET /estado,/log,/sucesos,/alertas (sondeo 1 Hz)
                       ▼
        ┌────────────────────────────────────────┐
        │ Agregador Node.js (PC)  0.0.0.0:8090   │
        │ poller.js → foto en RAM                │
        │ server.js → estáticos + REST + SSE     │
        └───────┬───────────────────────┬────────┘
                │ SSE /api/stream        │ POST /api/nodos/:n/{control,pulsar}
                ▼                        ▼
        ┌───────────────┐        ┌───────────────┐
        │ Panel operador│        │ Vista pública │
        └───────────────┘        └───────────────┘
```

- **No hay base de datos.** El log de Raft vive en RAM de cada nodo; solo `currentTerm` y `votedFor`
  se persisten en NVS. El agregador mantiene la foto agregada en memoria.
- **No hay microservicios ni nube**: firmware embebido + un agregador monolítico + navegador.

---

## 3. Tecnologías

| Capa | Tecnología |
|---|---|
| Nodos | ESP32 DevKit V1, C++17, Arduino core ESP32 3.3.12 |
| Consenso | Raft propio: elección, términos, `AppendEntries`, commit por mayoría, forward |
| Transporte entre nodos | UDP 4210 (JSON compacto), broadcast 4211 para descubrimiento |
| API de nodo | HTTP 80 (`WebServer` síncrono), ArduinoJson |
| Persistencia | NVS (`Preferences`): término, voto, credenciales WiFi, huella |
| Agregador | Node.js ≥ 22, ESM, **sin dependencias**, SSE |
| Interfaz | HTML/CSS/JS nativo, mapa SVG propio (sin Leaflet, sin CDN) |
| Contenedores | Docker Compose con Fedora, openSUSE Leap, Ubuntu y Alpine |

---

## 4. Componentes

### Firmware (`firmware/detector/`)

| Archivo | Responsabilidad |
|---|---|
| `detector.ino` | Pegamento Arduino: WiFi/DHCP, UDP, HTTP, NVS, pulsador/LED, NTP, OTA, portal |
| `config.h` | Puertos, tiempos de Raft/WiFi/portal, SSID |
| `secretos.h` | Contraseña WiFi, clave OTA y clave del portal (**no versionado**) |
| `pagina.h` | Página de estado embebida del nodo |
| `portal.h` | Portal cautivo de configuración WiFi |
| `src/nucleo/raft.cpp` | Consenso: elección, replicación, commit, forward, resincronización |
| `src/nucleo/mensajes.cpp` | Códec JSON de los 6 tipos de mensaje |
| `src/nucleo/sismo.cpp` | Máquina de estados determinista: eventos → alertas |
| `src/nucleo/api.cpp` | JSON de `/estado`, `/log`, `/sucesos`, `/alertas` |
| `src/nucleo/huella.cpp` | Escaneo WiFi activo para detectar si movieron la placa |

### Agregador y web (`web/`)

| Archivo | Responsabilidad |
|---|---|
| `server.js` | HTTP: estáticos, `/api/estado`, SSE `/api/stream`, proxy de control |
| `poller.js` | Sondeo 1 Hz de los nodos, foto agregada, líder y quórum |
| `config.js` | `NODOS`, `PUERTO` (8090), posiciones fijas de los detectores |
| `public/operador.html` | Panel de operador (6 pestañas) |
| `public/cliente.html` | Vista pública de alertas |
| `public/mapa.js`, `geo.js` | Mapa SVG local y proyección |
| `fake/` | Nodos simulados para demo sin hardware (**no implementan Raft**) |

### Pruebas

| Ruta | Contenido |
|---|---|
| `firmware/test/` | Suite C++ en el PC con red Raft simulada (78 casos) |
| `web/test/` | Suite Node (`node:test`, 41 pruebas) |

---

## 5. Requisitos

- **Hardware**: 3 × ESP32 DevKit V1, 3 cables USB de datos, 3 pulsadores, protoboard y cables.
- **Red**: una WiFi 2.4 GHz con DHCP y broadcast habilitado (sin aislamiento de clientes).
- **Software (PC)**: Linux recomendado; `g++` ≥ C++17, `make`, `node` ≥ 22, `arduino-cli` con el
  core `esp32:esp32` 3.3.12, y ArduinoJson 7.x en `~/Arduino/libraries/ArduinoJson`.
- **Opcional**: Docker con Compose para la demo sin hardware; `tcpdump` para observar el tráfico.

---

## 6. Configuración

### Secretos del firmware

```bash
cd firmware/detector
cp secretos.ejemplo.h secretos.h
# Edita secretos.h y define: WIFI_PASS, OTA_CLAVE y PORTAL_CLAVE (mínimo 8 caracteres)
```

`secretos.h` está en `.gitignore` y no debe versionarse. La clave del portal **no** se imprime por
el puerto serie.

### Red

- `WIFI_SSID` se define en `firmware/detector/config.h`.
- Las IPs **no** son fijas: las asigna el DHCP. Los nodos se anuncian como `sismo-nodo-N` y se
  descubren por broadcast UDP 4211.
- Si la red cambia, usa el portal de configuración (sección 8) en vez de recompilar.

### Agregador

| Variable | Default | Uso |
|---|---|---|
| `NODOS` | `http://sismo-nodo-1.local,…,-2,…,-3.local` | Lista separada por comas |
| `PUERTO` | `8090` | Puerto del panel |
| `TIMEOUT_NODO_MS` | `3000` | Timeout por petición a un nodo |
| `INTERVALO_MS` | `1000` | Periodo de sondeo |

---

## 7. Compilación y ejecución

### 7.1 Compilar el firmware

Cada placa necesita el firmware compilado con su número de nodo:

```bash
cd firmware
./cargar.sh 1        # compila con -DNODO=1 y flashea por USB
./cargar.sh 2
./cargar.sh 3
```

Equivalente manual (sin flashear):

```bash
arduino-cli compile --fqbn esp32:esp32:esp32 \
  --build-property "compiler.cpp.extra_flags=-DNODO=1" \
  --build-path /tmp/fw1 firmware/detector
```

Resultado de referencia (Fase 3, core 3.3.12): `detector.ino.bin` ≈ **1.106.048 B**,
`detector.ino.merged.bin` = **4.194.304 B**, bootloader 24.992 B, particiones 3.072 B.

### 7.2 Ejecutar el agregador

```bash
cd web
npm start
# Panel:        http://localhost:8090/
# Vista pública: http://<IP-del-PC>:8090/publico
```

Sin `npm install`: el proyecto no tiene dependencias.

Si mDNS no resuelve las placas:

```bash
NODOS="http://192.168.1.50,http://192.168.1.51,http://192.168.1.52" npm start
```

### 7.3 Demo sin hardware (nodos simulados)

```bash
cd web
npm run fake          # 3 nodos falsos en 9001–9003
# en otra terminal:
NODOS="http://127.0.0.1:9001,http://127.0.0.1:9002,http://127.0.0.1:9003" npm start
```

> Los nodos falsos imitan el contrato HTTP, pero **no ejecutan Raft**: no re-eligen líder y su
> `/pulsar` no escribe en el log. No sirven para demostrar consenso ni alertas nuevas.

### 7.4 Docker

```bash
docker compose up --build       # 3 nodos (Fedora, openSUSE Leap, Ubuntu) + panel
# Panel: http://localhost:8095/
docker compose down
```

El panel del contenedor puede apuntar a las placas reales:

```bash
NODOS="http://IP1,http://IP2,http://IP3" docker compose up panel
```

---

## 8. Conexión de los nodos

1. Flashea cada placa (sección 7.1) y aliméntala.
2. Espera 8–20 s: DHCP, anuncio `SISMO-HOLA` y elección de líder (timeout 5–9 s).
3. Verifica:
   ```bash
   getent hosts sismo-nodo-1.local
   curl -s http://IP/estado
   ```
   Exactamente un nodo debe reportar `"rol":"lider"` y los tres deben coincidir en
   `lider_conocido` y `termino`.
4. Portal de configuración WiFi: enciende la placa **con el pulsador presionado ≥ 3 s** (o pulsa EN
   dos veces en menos de 3 s); conéctate al AP `SISMO-D<N>-config` y guarda la red.

Campaña física detallada: [`docs/prueba-hardware.md`](docs/prueba-hardware.md).

---

## 9. Pruebas

### Suite C++ (sin hardware)

```bash
cp -a firmware/test /tmp/val-test
cp -a firmware/detector/src /tmp/val-src
cd /tmp/val-test
make JSON_DIR="$HOME/Arduino/libraries/ArduinoJson/src" test
```

5 binarios, **78 casos**, exit 0. Compila el núcleo contra una red Raft simulada en memoria
(`red_simulada.h`): elección, quórum, particiones, pérdida de paquetes, replicación, commit,
forward, resincronización y log lleno.

### Suite JavaScript (sin hardware, solo loopback)

```bash
cd web
node --test --test-concurrency=1 test/*.test.js
```

**41 pruebas** (`node:test`): SSE, API, proxy, endurecimiento de estáticos, poller/líder/quórum y
geometría del mapa.

---

## 10. Limitaciones conocidas

Estas limitaciones están verificadas en el código y se declaran explícitamente:

1. **El evento es simulado**: la entrada es un pulsador; no hay sensor sísmico ni medición real.
2. **El log no es durable**: vive en RAM. Un reinicio de un nodo pierde su log y lo reconstruye
   desde el líder; un corte de energía puede perder eventos aceptados pero no confirmados.
3. **Resincronización de emergencia**: si una mayoría reinicia en frío, un nodo puede descartar su
   log y copiarlo del líder (`raft.cpp`). Es una desviación deliberada de Raft para no quedar
   divergente; **no** se garantiza durabilidad.
4. **Sin snapshots**: el log tiene un tope de 1000 entradas; al llenarse se rechazan eventos nuevos.
5. **Sin seguridad de transporte**: el API HTTP del nodo y el UDP de Raft no tienen autenticación ni
   cifrado, y CORS permite cualquier origen. Debe desplegarse en una red de confianza.
6. **Sin pre-vote ni check-quorum**: un líder aislado sigue creyéndose líder (el panel sí muestra el
   quórum real).
7. **El "quórum" del agregador es una inferencia**: se calcula como "≥ 2 nodos disponibles que
   reconocen al mismo líder"; no valida el consenso por sí mismo.
8. **`ForwardAck` se envía al aceptar, no al confirmar**: un evento puede perderse si el líder muere
   justo después de aceptarlo.
9. **Demo Docker ≠ Raft**: los contenedores demuestran portabilidad del contrato y del empaquetado
   sobre tres sistemas operativos, no consenso entre sistemas operativos.

---

## 11. Estructura del repositorio

```
.
├── firmware/
│   ├── detector/           Firmware del nodo (núcleo portable en src/nucleo/)
│   ├── test/               Suite C++ en el PC con red simulada
│   ├── cargar.sh           Compila y flashea (USB u OTA)
│   ├── quien.sh            Identifica la placa por MAC
│   └── placas.conf         Registro MAC → número de detector
├── web/
│   ├── server.js           Agregador y API
│   ├── poller.js           Sondeo y foto agregada
│   ├── public/             Panel de operador y vista pública
│   ├── fake/               Nodos simulados para demo
│   └── test/               Suite Node
├── docs/
│   ├── prueba-hardware.md  Campaña física con las 3 placas
│   └── superpowers/        Diseño y planes históricos (no vigentes)
├── entrega/                Entregables académicos (documento, diagramas, evidencias)
├── docker-compose.yml      Demo con 3 sistemas operativos
├── mockup/, preview/, new interfaz/, interfaz_*.png
│                           Material de diseño histórico: NO es la aplicación
└── README.md
```

---

## 12. Estado de la versión

- Software validado: 78/78 pruebas C++, 5/5 casos del arnés de configuración desplegada,
  41/41 pruebas JavaScript, compilación del firmware para los tres nodos y despliegue Docker.
- Validación física con las tres placas: ver `docs/prueba-hardware.md` y
  `entrega/10-informes-fase3/`.
- Licencia: **pendiente de decisión** (no se ha elegido titularidad ni licencia; ver
  `entrega/10-informes-fase3/pendientes.md`).
