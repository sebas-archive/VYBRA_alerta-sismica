# Identificación inequívoca de las tres ESP32 (sin flashear)

Fecha: 2026-11-17. Método: solo lectura — `esptool read-mac` (no escribe flash) y lectura del puerto
serie, reiniciando por software con RTS/DTR (sin pulsar botones, sin modificar el firmware).

## 1. Cómo se identifica un nodo en el firmware

La identidad **no está grabada en la placa**: es una propiedad del **firmware compilado**.

| Mecanismo | Dónde está | Evidencia |
|---|---|---|
| Macro de compilación `NODO` (1, 2 o 3) | `cargar.sh` compila con `--build-property compiler.cpp.extra_flags=-DNODO=N` | `firmware/cargar.sh:78-80` |
| Guardas de compilación | `#error` si falta `NODO` o está fuera de 1–3 | `detector.ino:35-40` |
| Banner de arranque | `Serial.printf("\nDetector nodo-%d (Raft)\n", NODO)` | `detector.ino:710` |
| Hostname mDNS / DHCP | `sismo-nodo-%d` | `detector.ino:289,733` |
| Id de evento | `nodo-%d-%08lx-%lu` | `detector.ino:510` |
| AP del portal | `SISMO-D%d-config` | `detector.ino:166` |
| Campo de la API | `"nodo": N` en `/estado` | `api.cpp:34-55` |
| Descubrimiento | `SISMO-HOLA:N` | `detector.ino:366` |

Por tanto, no se puede leer el número de nodo de un registro de la placa: hay que **ver el firmware
en ejecución** o **cotejar la MAC** con el registro de flasheo.

## 2. Registro MAC → nodo

`firmware/placas.conf` guarda la relación creada cuando se flasheó cada placa (`quien.sh --registrar N`):

| MAC | Nodo |
|---|---|
| `58:2a:bd:d3:d3:10` | 1 |
| `68:09:47:86:c1:38` | 2 |
| `68:09:47:47:36:90` | 3 |

## 3. Resultado (dos métodos independientes, coincidentes)

| Puerto | MAC de fábrica | `placas.conf` | Banner de arranque | **Nodo** |
|---|---|---|---|---|
| `/dev/ttyUSB0` | `68:09:47:86:c1:38` | 2 | `Detector nodo-2 (Raft)` | **2** |
| `/dev/ttyUSB1` | `58:2a:bd:d3:d3:10` | 1 | `Detector nodo-1 (Raft)` | **1** |
| `/dev/ttyUSB2` | `68:09:47:47:36:90` | 3 | `Detector nodo-3 (Raft)` | **3** |

**Confirmado: `ttyUSB0` no es el nodo 1.** El orden de enumeración USB no coincide con la numeración
lógica.

Evidencias: `04-evidencias/D-nodos/log-NOD-02-arranque-ttyUSB0.txt`, `…-ttyUSB1.txt`,
`…-ttyUSB2.txt` y `log-NOD-09-quien.txt`.

## 4. Comandos exactos

### 4.1 Identificar por MAC (rápido, sin leer consola)

```bash
cd "/home/t1an/detector de sismos en red distribuida"
ESP="$HOME/.arduino15/packages/esp32/tools/esptool_py/5.3.1/esptool"

for P in /dev/ttyUSB0 /dev/ttyUSB1 /dev/ttyUSB2; do
  MAC=$(timeout 25 "$ESP" --port "$P" --baud 115200 read-mac 2>/dev/null \
        | grep -m1 -oE '([0-9a-f]{2}:){5}[0-9a-f]{2}')
  N=$(awk -v m="$MAC" '!/^#/ && tolower($1)==m {print $2; exit}' firmware/placas.conf)
  printf "%-14s MAC=%s  ->  Nodo %s\n" "$P" "$MAC" "${N:-DESCONOCIDO}"
done
```

`read-mac` **no escribe flash**: entra al bootloader, lee la MAC y reinicia. Si una placa no
responde: cambia el cable (debe ser de datos) y prueba otro puerto.

### 4.2 Identificar por el mensaje de arranque (confirmación definitiva)

```bash
# Reinicia por software (EN=RTS, IO0=DTR) y captura 8 s de consola a 115200
python3 entrega/05-pruebas/scripts/identificar-arranque.py /dev/ttyUSB0 8 | grep -a "Detector nodo-"
python3 entrega/05-pruebas/scripts/identificar-arranque.py /dev/ttyUSB1 8 | grep -a "Detector nodo-"
python3 entrega/05-pruebas/scripts/identificar-arranque.py /dev/ttyUSB2 8 | grep -a "Detector nodo-"
```

Salida esperada (una línea por placa): `Detector nodo-2 (Raft)`, `Detector nodo-1 (Raft)`,
`Detector nodo-3 (Raft)`.

Si prefieres hacerlo con el monitor oficial, pulsa **EN** en la placa justo después de abrirlo:

```bash
arduino-cli monitor -p /dev/ttyUSB0 -c baudrate=115200 --timestamp
# (pulsa EN/RST en esa placa)  → debe imprimir "Detector nodo-2 (Raft)"
```

### 4.3 Usar el script del proyecto con un solo puerto

`quien.sh` se niega cuando hay varias placas conectadas (por diseño). Con las tres conectadas hay
que indicar el puerto:

```bash
cd firmware
./quien.sh -p /dev/ttyUSB0     # → "Detector 2 (SIS-D2) conectado en /dev/ttyUSB0"
./quien.sh -p /dev/ttyUSB1     # → "Detector 1 (SIS-D1) ..."
./quien.sh -p /dev/ttyUSB2     # → "Detector 3 (SIS-D3) ..."
```

## 5. Lo que **no** sirve para identificar

| Vía | Por qué no |
|---|---|
| `/dev/serial/by-id/` | Los tres CP2102 tienen el mismo número de serie (`0001`); udev crea un solo enlace |
| Orden de `/dev/ttyUSB*` | Depende de la enumeración USB; no coincide con la numeración lógica |
| `arduino-cli board list` | Identifica el puerto, pero como "Unknown": el ESP32 no se anuncia por USB |
| `lsusb` | Los tres son idénticos: "Silicon Labs CP2102 USB to UART Bridge" |

## 6. Estado de red observado (importante para continuar)

Al reiniciar, las tres placas **no logran conectarse a la WiFi configurada** y abren el portal:

```
Detector nodo-2 (Raft)
No se pudo conectar al WiFi: abriendo el portal de configuración
Abriendo el portal de configuración WiFi
```

Consecuencias:

1. La red configurada en el firmware (`WIFI_SSID` en `config.h`) no está disponible con las
   credenciales actuales, o no es 2.4 GHz, o el router la rechaza.
2. Mientras no haya WiFi, **no hay clúster**: sin red no hay descubrimiento ni Raft.
3. Cada placa queda en modo portal ~5 min y luego reinicia; el AP se llama
   `SISMO-D1-config`, `SISMO-D2-config`, `SISMO-D3-config` (tercera forma de confirmar identidad).
4. La clave del portal **en el firmware actualmente flasheado** es la que estaba en `config.h` al
   compilarse (la clave antigua). Tras reflashear el firmware estabilizado, la clave pasa a ser la
   nueva de `secretos.h`. No se reproduce aquí ninguna clave.
5. Estado de huella persistido: `huella de referencia cargada: 8 AP (movido)` — las placas creen que
   fueron movidas (NVS). No impide operar; se puede refijar con `POST /huella` cuando estén en red.

## 7. Siguiente paso

Dos caminos, ambos sin tocar la identificación ya establecida:

- **A (sin flashear):** configurar la WiFi por el portal de cada placa (AP `SISMO-D<N>-config`), con
  la clave del firmware actual. No requiere recompilar ni flashear.
- **B (recomendado para la versión estable):** recompilar y flashear el firmware `v1.0.0-rc1` ya
  estabilizado (incluye la rotación de la clave del portal) con el SSID/contraseña correctos.
  Después de flashear, **repetir esta identificación**: la numeración no cambia si se usa
  `cargar.sh N` sobre la placa registrada.
