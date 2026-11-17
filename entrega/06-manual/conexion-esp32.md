# Conexión y configuración de las tres ESP32 — instrucciones paso a paso

Este documento prepara la **campaña física**. Todo lo que sigue se deriva del código real
(`firmware/detector/config.h`, `detector.ino`, `cargar.sh`, `quien.sh`); no hay valores inventados.

---

## 0. Qué necesitas tener a mano

| Elemento | Cantidad | Detalle |
|---|---|---|
| ESP32 DevKit V1 (30 pines) | 3 | Chip USB-serial **CP2102** (si tu placa trae CH340, ver §2) |
| Cable USB **de datos** | 3 | Micro-USB o USB-C según la placa. Un cable de solo carga **no** sirve |
| Pulsador | 3 | Una pata a **GPIO4 (D4)**, la otra a **GND** (INPUT_PULLUP, activo en bajo) |
| Protoboard y cables dupont | 1 + 6 | Para el pulsador de cada placa |
| Alimentación | 3 | USB del PC para flashear; luego cargador USB o el mismo PC |
| Red WiFi 2.4 GHz | 1 | Con **DHCP**, broadcast permitido y **sin aislamiento de clientes** |

> El LED azul integrado (GPIO2) no necesita cableado: indica el estado del nodo.

---

## 1. Requisitos del equipo (una sola vez)

```bash
# 1) Grupo de acceso al puerto serie
sudo usermod -aG dialout "$USER"
# (cierra sesión y vuelve a entrar para que aplique)

# 2) Verificar herramientas
arduino-cli version            # debe ser 1.x
g++ --version                  # para la suite C++
node --version                 # >= 22
arduino-cli core list          # debe aparecer: esp32:esp32  3.3.12
ls "$HOME/Arduino/libraries/ArduinoJson/library.properties"   # ArduinoJson 7.x
```

Si falta el core de ESP32:

```bash
arduino-cli core update-index
arduino-cli core install esp32:esp32@3.3.12
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
```

La relación MAC → número de detector se guarda en `firmware/placas.conf`. Etiqueta físicamente cada
placa como **SIS-D1**, **SIS-D2** y **SIS-D3**.

> Si una placa está registrada como otro detector, `cargar.sh` se negará a cargarla: es una
> protección. Usa `--forzar` solo si realmente quieres renumerarla.

---

## 4. Red: qué necesita el firmware (valores reales del código)

| Parámetro | Valor real | Dónde está |
|---|---|---|
| SSID | `WIFI_SSID` (valor actual en el código) | `firmware/detector/config.h:6` |
| Contraseña WiFi | `WIFI_PASS` | `firmware/detector/secretos.h` (**no versionado**) |
| Clave OTA | `OTA_CLAVE` | `firmware/detector/secretos.h` |
| Clave del portal AP | `PORTAL_CLAVE` (16 caracteres, rotada en Fase 3) | `firmware/detector/secretos.h` |
| Dirección IP | **DHCP** (no fija) | `config.h:9` |
| Hostname | `sismo-nodo-N` (mDNS) | `detector.ino:280` |
| Descubrimiento | Broadcast UDP **4211**, texto `SISMO-HOLA:N`, cada **2000 ms** | `config.h:10-11` |
| Mensajes Raft | UDP unicast **4210** | `config.h:21` |
| API HTTP | TCP **80** | `detector.ino:84` |
| OTA | UDP **3232** en la placa; el PC recibe **32323/tcp** | `detector.ino:721-725` |
| Hora | NTP, UTC−5, cada 10 min | `config.h:24`, `detector.ino:126` |

### Antes de flashear, confirma `secretos.h`

```bash
cd firmware/detector
ls secretos.h            # debe existir
grep -oE "#define [A-Z_]+" secretos.h    # debe listar WIFI_PASS, OTA_CLAVE y PORTAL_CLAVE
```

Si falta, créalo desde la plantilla y edítalo (**no lo subas a git**):

```bash
cp secretos.ejemplo.h secretos.h
# edita WIFI_PASS, OTA_CLAVE y PORTAL_CLAVE (mínimo 8 caracteres)
```

### Condiciones del router

- **DHCP activo** en la red 2.4 GHz.
- **Broadcast permitido** y **AP isolation desactivado** (si está activo, los nodos no se ven y no
  habrá líder).
- Internet recomendable para NTP; sin internet los nodos funcionan pero `con_hora=false` y **no se
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

Repite con `./cargar.sh 2` y `./cargar.sh 3` conectando una placa distinta cada vez.

**Qué debes ver en la consola serie** (115200):

```bash
arduino-cli monitor -p /dev/ttyUSB0 -c baudrate=115200
```

```
Detector nodo-1 (Raft)
término guardado 0, voto 0
conectado a <SSID>, IP 192.168.x.x
```

Anota por placa: **número, MAC, puerto, IP, hora y resultado**.

---

## 6. Verificar que el clúster se forma

Con las tres encendidas y alimentadas, espera **8–20 s**:

```bash
# IPs por mDNS
getent hosts sismo-nodo-1.local sismo-nodo-2.local sismo-nodo-3.local

# o una por una con las IPs que anotaste
curl -s -m 2 http://IP_DEL_NODO_1/estado
```

**Criterio de éxito:** exactamente **un** nodo con `"rol":"lider"`, y los tres con el mismo
`lider_conocido` y el mismo `termino`. El LED azul queda **fijo** en las tres.

Prueba de descubrimiento (opcional, requiere `tcpdump`):

```bash
sudo tcpdump -ni any -tttt 'udp port 4210 or udp port 4211'
# esperado: SISMO-HOLA:N cada ~2 s y Append del líder a cada seguidor cada ~500 ms
```

Levanta el panel apuntando a las IPs reales:

```bash
cd web
NODOS="http://IP1,http://IP2,http://IP3" npm start
# Panel: http://localhost:8090/     Vista pública: http://<IP-PC>:8090/publico
```

---

## 7. Verificación mínima antes de la campaña

| Comprobación | Comando | Resultado esperado |
|---|---|---|
| Las 3 responden HTTP | `curl -s -m 2 http://IP/estado` | 200 y 18 claves |
| Hay un solo líder | los 3 `/estado` | 1 con `rol:lider`, mismo `termino` |
| Hora sincronizada | `/estado` | `"con_hora":true` en los 3 |
| Descubrimiento | `tcpdump udp port 4211` | `SISMO-HOLA:N` cada 2 s |
| Pulso de prueba | mantener pulsador ~900 ms | entrada en `/log` con `nivel 3`, `pga ≈ 0.099` |
| Panel | abrir `:8090/` | 3/3 activos, líder y término visibles |

---

## 8. Cuándo detenerse y avisar

Detente y avísame cuando se cumpla **todo** esto:

1. Las tres placas están flasheadas y **anotaste** número, MAC, puerto e IP de cada una.
2. Los tres `/estado` muestran **un solo líder**, mismo término y `con_hora:true`.
3. El panel en `:8090` muestra las tres como activas.

Con eso empiezo la **campaña física** (casos 1–10 de `docs/prueba-hardware.md`): eventos con
pulsador, replicación, alerta por coincidencia, caída del líder, failover ≤ 12 s, recuperación,
ausencia de quórum y métricas. Varios casos necesitan que **tú** pulses o desenchufes; yo mido,
registro y capturo.

---

## 9. Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `No boards found` | Cable de solo carga / puerto distinto | Cambia el cable; revisa `dmesg` |
| `Permission denied: /dev/ttyUSB0` | Falta grupo `dialout` | `sudo setfacl -m u:"$USER":rw /dev/ttyUSB*` |
| Ningún líder, LED parpadeando | Broadcast bloqueado o AP isolation | Desactiva aislamiento; usa un router normal (no hotspot de celular con aislamiento) |
| Los nodos se ven pero no hay commit | Sin quórum (solo 2 de 3 arriba o uno caído) | Enciende las tres |
| `con_hora:false` | Sin NTP (sin internet) | Da internet al router; sin hora no hay alertas |
| `mDNS` no resuelve en el PC | Falta `avahi`/`nss-mdns` | Usa IPs explícitas en `NODOS` |
| Panel dice "Sin conexión" | Rutas/puerto o IPs cambiadas por DHCP | Revisa `getent hosts` y `NODOS` |
