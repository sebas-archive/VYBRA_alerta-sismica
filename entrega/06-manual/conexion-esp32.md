# Conexión y configuración de las tres ESP32 — instrucciones paso a paso

Este documento es el complemento del [manual de instalación y ejecución](manual-instalacion-y-ejecucion.md)
para la parte física: preparar el PC, identificar las placas, flashear el firmware, configurar la red
y comprobar que el clúster se forma. Todo lo que sigue se deriva del código real
(`firmware/detector/config.h`, `detector.ino`, `cargar.sh`, `quien.sh`, `web/scripts/verificar-esp32.js`);
no hay valores inventados.

| Dato | Valor |
|---|---|
| Versión del firmware | `v1.0.0-rc1` (commit `0ee5ed4`, 2026-11-18) |
| Core de ESP32 | `esp32:esp32` 3.3.12 |
| ArduinoJson | 7.4.3 |
| Fecha de la última campaña física | 2026-11-17 (P0 completada; T1 no aprobada) |
| Evidencias físicas | `entrega/04-evidencias/D-nodos/`, `entrega/04-evidencias/F-fisicas/`, `entrega/05-pruebas/logs/FIS-*` |

---

## 0. Qué necesitas tener a mano

| Elemento | Cantidad | Detalle |
|---|---|---|
| ESP32 DevKit V1 (30 pines) | 3 | Chip USB-serial **CP2102** (si tu placa trae CH340, ver §2) |
| Cable USB **de datos** | 3 | Micro-USB o USB-C según la placa. Un cable de solo carga **no** sirve |
| Pulsador | 3 | Una pata a **GPIO4 (D4)**, la otra a **GND** (`INPUT_PULLUP`, activo en bajo) |
| Protoboard y cables dupont | 1 + 6 | Para el pulsador de cada placa |
| Alimentación | 3 | USB del PC para flashear; luego cargador USB o el mismo PC |
| Red WiFi 2,4 GHz | 1 | Con **DHCP**, broadcast permitido y **sin aislamiento de clientes** |
| PC Linux | 1 | Con `arduino-cli`, core `esp32:esp32` 3.3.12 y ArduinoJson 7.x |

> El LED azul integrado (GPIO2) no necesita cableado: indica el estado del nodo.

---

## 1. Requisitos del equipo (una sola vez)

```bash
# 1) Grupo de acceso al puerto serie
sudo usermod -aG dialout "$USER"
# (cierra sesión y vuelve a entrar para que aplique)

# 2) Verificar herramientas
arduino-cli version            # debe ser 1.x (verificado con 1.5.1)
g++ --version                  # para la suite C++
node --version                 # >= 22
arduino-cli core list          # debe aparecer: esp32:esp32  3.3.12
ls "$HOME/Arduino/libraries/ArduinoJson/library.properties"   # ArduinoJson 7.x
```

Si falta el core de ESP32 o ArduinoJson:

```bash
arduino-cli core update-index
arduino-cli core install esp32:esp32@3.3.12
arduino-cli lib install ArduinoJson@7.4.3
```

---

## 2. Reconocer la placa al conectarla

Conecta **una sola placa** y comprueba:

```bash
lsusb | grep -iE "cp210|ch34|silicon|qinheng"     # debe aparecer el adaptador USB-serial
ls -l /dev/ttyUSB* /dev/ttyACM*                    # normalmente /dev/ttyUSB0
dmesg | tail -5                                    # "cp210x converter now attached to ttyUSB0"
sudo setfacl -m u:"$USER":rw /dev/ttyUSB0          # permiso inmediato si no hay sesión nueva
arduino-cli board list                             # debe listar la placa y su puerto
```

**Controladores:**

| Chip | Driver Linux | Nota |
|---|---|---|
| CP2102 (habitual en DevKit V1) | `cp210x` (incluido en el kernel) | No requiere instalación |
| CH340/CH341 (algunas clones) | `ch341` (incluido en el kernel) | Si no aparece, revisa `dmesg` |

Si no aparece ningún `/dev/ttyUSB*`: cambia el cable (debe ser de datos), prueba otro puerto USB y
comprueba `dmesg` justo después de conectar.

---

## 3. Identificar qué placa es cuál (por MAC)

Las tres placas usan el mismo chip USB-serial, así que se distinguen por su **MAC de fábrica**:

```bash
cd firmware
./quien.sh                 # "Detector N (SIS-DN) conectado en /dev/ttyUSB0 · MAC ..."
./quien.sh --vigilar       # avisa cada vez que conectas/desconectas una placa
./quien.sh --nodo -p /dev/ttyUSB0   # imprime solo el número de detector
```

La relación MAC → número de detector se guarda en `firmware/placas.conf`. Etiqueta físicamente cada
placa como **SIS-D1**, **SIS-D2** y **SIS-D3**.

> Si una placa está registrada como otro detector, `cargar.sh` se negará a cargarla: es una
> protección. Usa `--forzar` solo si realmente quieres renumerarla.

---

## 4. Red: qué necesita el firmware (valores reales del código)

| Parámetro | Valor real | Dónde está |
|---|---|---|
| SSID | `WIFI_SSID` (red 2,4 GHz) | `firmware/detector/config.h:6` |
| Contraseña WiFi | `WIFI_PASS` | `firmware/detector/secretos.h` (**no versionado**) |
| Clave OTA | `OTA_CLAVE` | `firmware/detector/secretos.h` |
| Clave del portal AP | `PORTAL_CLAVE` (mínimo 8 caracteres) | `firmware/detector/secretos.h` |
| Dirección IP | **DHCP** (no fija) | `detector.ino:289` (hostname mDNS `sismo-nodo-N`) |
| Descubrimiento | Broadcast UDP **4211**, texto `SISMO-HOLA:N`, cada **2000 ms** | `config.h:10-11`, `detector.ino:351-365` |
| Mensajes Raft | UDP unicast **4210** | `config.h:21` |
| Latido de Raft | **500 ms** | `config.h:16` |
| Timeout de elección | **5000–9000 ms** | `config.h:17-18` |
| API HTTP | TCP **80** (`WebServer servidor(80)`) | `detector.ino:92`, rutas en `detector.ino:670-673` |
| OTA | UDP **3232** en la placa; el PC recibe **32323/tcp** | `detector.ino:734-736` |
| Hora | NTP, UTC−5, cada **10 min** | `config.h:24`, `detector.ino:58` y `detector.ino:134` |
| Portal | AP `SISMO-D<N>-config`, DNS 53/udp y HTTP 80 sobre el AP | `config.h:29-31`, `detector.ino:161-250` |

### Antes de flashear, confirma `secretos.h` y el SSID

```bash
cd firmware/detector
ls secretos.h            # debe existir
grep -oE "#define [A-Z_]+" secretos.h    # debe listar WIFI_PASS, OTA_CLAVE y PORTAL_CLAVE
grep -n "WIFI_SSID" config.h            # ajusta el SSID a tu red 2,4 GHz
```

Si falta `secretos.h`, créalo desde la plantilla y edítalo (**no lo subas a git**):

```bash
cp secretos.ejemplo.h secretos.h
# edita WIFI_PASS, OTA_CLAVE y PORTAL_CLAVE (mínimo 8 caracteres)
```

> **Precedencia:** `WIFI_SSID`/`WIFI_PASS` compilados son solo el valor por defecto; si la placa ya
> guardó credenciales por el portal (NVS, namespace `wifi`, `detector.ino:138-148`), **mandan esas**.
> Para pasarla a `Apt_105` hay que reconfigurarla por el portal (§6) o borrar la NVS: reflashear no basta.

### Condiciones del router

- **DHCP activo** en la red 2,4 GHz.
- **Broadcast permitido** y **AP isolation desactivado** (si está activo, los nodos no se ven y no
  habrá líder).
- Internet recomendable para NTP; sin internet los nodos funcionan pero `con_hora:false` y **no se
  forman alertas**.
- El PC debe estar en la misma red que las placas.

---

## 5. Flashear las tres placas (una a la vez)

Con **solo esa placa conectada**:

```bash
cd firmware
./cargar.sh 1          # primera vez: compila con -DNODO=1, flashea y registra la MAC
# esperar a que termine, anotar la salida
```

Repite con `./cargar.sh 2` y `./cargar.sh 3` conectando una placa distinta cada vez. En cargas
posteriores, con una sola placa conectada, `./cargar.sh` sin número detecta el detector por la MAC.

Si el puerto no es el esperado, indícalo: `./cargar.sh 1 /dev/ttyUSB0`.

**Qué deberías ver en la consola serie** (115200):

```bash
arduino-cli monitor -p /dev/ttyUSB0 -c baudrate=115200
```

```
Detector nodo-1 (Raft)
término guardado 0, voto 0
conectado a <SSID>, IP 192.168.x.x
```

Anota por placa: **número, MAC, puerto, IP, hora y resultado**. El log de `cargar.sh` es la
evidencia de qué firmware quedó cargado (el contrato `/estado` no incluye un campo de versión).

### Carga por WiFi (OTA)

```bash
cd firmware
./cargar.sh 1 --wifi                    # busca sismo-nodo-1.local
IP=192.168.1.50 ./cargar.sh 1 --wifi    # o da la IP
```

El PC debe aceptar conexiones entrantes en **TCP 32323** desde la red de las placas:

```bash
sudo ufw allow from <tu-subred>/24 to any port 32323 proto tcp
```

La clave OTA (`OTA_CLAVE`) se configura en `secretos.h`. Tras reiniciar, el nodo vuelve al clúster
y se pone al día desde el líder.

---

## 6. Portal de configuración WiFi (si hace falta cambiar de red)

- Apaga la placa y enciéndela **manteniendo el pulsador ≥ 3 s**, o pulsa EN dos veces en menos de
  3 s (`config.h:29-30`).
- Conéctate al AP `SISMO-D<N>-config` con la clave `PORTAL_CLAVE` (mínimo 8 caracteres; no se
  imprime por el puerto serie).
- Abre la IP del AP (por defecto `192.168.4.1`; el monitor serie imprime la real).
- Elige la red, escribe la contraseña y guarda: se almacena en NVS y la placa reinicia.
- Si no se configura en 5 min, reinicia y vuelve a la red anterior (`config.h:31`).
- **No cambies de red durante la campaña**: reinicia la placa y puede dejar el clúster incomunicado.

---

## 7. El clúster se forma

Con las tres encendidas, espera entre 8 y 20 s (DHCP + elección de 5–9 s).

```bash
# IPs por mDNS (si la red y el PC lo soportan)
getent hosts sismo-nodo-1.local sismo-nodo-2.local sismo-nodo-3.local

# o una por una con las IPs que anotaste
for i in 1 2 3; do echo "--- nodo $i"; curl -s -m 2 "http://IP$i/estado"; echo; done
```

**Criterio de éxito:** exactamente **un** nodo con `"rol":"lider"`, y los tres con el mismo
`lider_conocido` y el mismo `termino`. El LED azul queda **fijo** en las tres (parpadeo a 1 Hz =
sin líder).

Prueba de descubrimiento (opcional, requiere `tcpdump`):

```bash
sudo tcpdump -ni any -tttt 'udp port 4210 or udp port 4211'
# esperado: SISMO-HOLA:N cada ~2 s y Append del líder a cada seguidor cada ~500 ms
```

La página de estado de cada placa (`http://IP_DEL_NODO/`) confirma "Detector N" y "Funcionando".
El `WebServer` del ESP32 atiende un cliente por vez: ábrela de a una y ciérrala.

---

## 8. Conectar el agregador a las placas reales

```bash
cp ejemplo.env .env
# edita .env:
#   NODO1_URL=http://IP1
#   NODO2_URL=http://IP2
#   NODO3_URL=http://IP3

# comprueba el contrato antes de conectar
node web/scripts/verificar-esp32.js

# arranca solo el panel, los servidores de datos, las bases y el controlador
docker compose up -d --build --no-deps panel servidor1 servidor2 servidor3 db1 db2 db3 controlador
```

Si antes estaban arriba los nodos simulados, deténlos antes: `docker compose stop nodo1 nodo2 nodo3`.
El orden importa: `NODOn_URL` debe ser el ESP32 cuyo `/estado` responde `"nodo": n`.
Después abre `http://127.0.0.1:8095/` (ADMIN) y `http://127.0.0.1:8095/publico` (CLIENTE).
Sin Docker: `cd web && NODOS="http://IP1,http://IP2,http://IP3" npm start` (panel en el 8090).

Con placas reales, «Apagar servidor» en ADMIN detiene el servidor de datos y hace una desconexión
lógica de la placa; «Encender» arranca el servidor y la reincorpora a Raft. La placa sigue con
corriente.

---

## 9. Verificación mínima antes de la campaña

| Comprobación | Comando | Resultado esperado |
|---|---|---|
| Las 3 responden HTTP | `curl -s -m 2 http://IP/estado` | 200 y 18 claves |
| Contrato completo | `node web/scripts/verificar-esp32.js` | "Todos los nodos cumplen el contrato" |
| Hay un solo líder | los 3 `/estado` | 1 con `rol:lider`, mismo `termino` |
| Hora sincronizada | `/estado` | `"con_hora":true` en los 3 |
| Descubrimiento | `sudo tcpdump -ni any 'udp port 4211'` | `SISMO-HOLA:N` cada 2 s |
| Panel | abrir `:8095/` (Docker) o `:8090/` (Node) | 3/3 activos, líder y término visibles |

Las 18 claves de `/estado` son: `nodo`, `rol`, `caido`, `termino`, `votado_por`, `lider_conocido`,
`log_len`, `commit_index`, `pendientes`, `log_lleno`, `sucesos_seq`, `con_hora`, `ip`, `rssi`,
`uptime_ms`, `movido`, `con_huella` y `situacion`.

---

## 10. Evidencias reales de la campaña del 2026-11-17

La campaña física se ejecutó con las tres placas reales y dejó evidencia que **no se puede
regenerar sin hardware**. Se conserva sin alterar y está rotulada como tal:

| Etapa | Estado real | Evidencia |
|---|---|---|
| **P0 — preparación** (inicio 2026-11-17 17:25 -05:00, commit `3a274da`) | **Completada** | Las 3 placas resolvieron por mDNS, respondieron identidad y HTTP, y se tomaron snapshots pre/post: `entrega/05-pruebas/logs/FIS-00-p0.txt`, `entrega/05-pruebas/datos/FIS-00-*`, `entrega/04-evidencias/F-fisicas/cap-FIS-00-*` |
| **T1 — evento con pulsador** | **No aprobada** | Una pulsación produjo **dos eventos cortos** (301 ms y 174 ms, separados 3,2 s) en lugar de uno de ~900 ms. El sistema replicó y confirmó correctamente (ids distintos e idénticos en los 3 nodos; `log_len`/`commit_index` 1→3) y no creó alerta (correcto: un solo detector). `nivel`/`pga` coinciden con la fórmula para las duraciones medidas: la anomalía es la entrada física. Evidencia: `entrega/05-pruebas/logs/FIS-01-*`, `entrega/04-evidencias/F-fisicas/cap-FIS-01-*`; diagnóstico en `entrega/10-informes-fase3/diagnostico-pulsador.md` |
| **T2 en adelante** | **Pendientes** de autorización | — |

Las placas quedaron flasheadas e identificadas; los registros de flasheo, arranque, red, estado y
sucesos están en `entrega/04-evidencias/D-nodos/` (`log-NOD-*`).

Pruebas con hardware que **no** se han realizado: reelección real, ausencia de quórum física,
reinicio del router, latencias de los nodos (RES-01/03/07/08/09) y capturas del panel de operación
con las placas (las capturas `cap-REF-*` son del stack Docker simulado real, no del clúster físico).

---

## 11. Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `No boards found` | Cable de solo carga / puerto distinto | Cambia el cable; revisa `dmesg` |
| `Permission denied: /dev/ttyUSB0` | Falta grupo `dialout` | `sudo setfacl -m u:"$USER":rw /dev/ttyUSB*` |
| `Falta firmware/detector/secretos.h con las claves (copia secretos.ejemplo.h)` | No existe `secretos.h` | `cp secretos.ejemplo.h secretos.h` y edítalo |
| `No hay ningún ESP32 conectado (no aparece /dev/ttyUSB*)` | Sin placa o cable de datos defectuoso | Revisa cable y `dmesg`; o usa `--wifi` |
| Ningún líder, LED parpadeando | Broadcast bloqueado o AP isolation | Desactiva el aislamiento; usa un router normal (no hotspot de celular con aislamiento) |
| Los nodos se ven pero no hay commit | Sin quórum (solo 2 de 3 arriba o uno caído) | Enciende las tres |
| `con_hora:false` | Sin NTP (sin internet) | Da internet al router; sin hora no hay alertas |
| `mDNS` no resuelve en el PC | Falta `avahi`/`nss-mdns` | Usa IPs explícitas en `NODOS` o `NODO*_URL` |
| OTA: `No encuentro sismo-nodo-N.local` | mDNS no resuelve | Usa `IP=x.x.x.x ./cargar.sh N --wifi` y abre TCP 32323 |
| Panel muestra nodos inalcanzables | IPs cambiadas por DHCP | Reserva las IPs en el router y actualiza `.env`; recrea el panel con `docker compose up -d panel` |
| Eventos dobles con una pulsación | Contactor del pulsador | Revisa el pulsador/contactor; ver `entrega/10-informes-fase3/diagnostico-pulsador.md` |

---

## 12. Criterios para dar por concluida la preparación

1. Las tres placas están flasheadas y se anotó número, MAC, puerto e IP de cada una.
2. `node web/scripts/verificar-esp32.js` informa que los tres nodos cumplen el contrato, hay **un
   solo líder**, mismo término y `con_hora:true`.
3. El panel (Docker o Node) muestra las tres como activas.

Con eso se puede continuar con los casos 1–10 de `docs/prueba-hardware.md`: eventos con pulsador,
replicación, alerta por coincidencia de dos detectores, caída del líder, failover, recuperación,
ausencia de quórum y métricas.
