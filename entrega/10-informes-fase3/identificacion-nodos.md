# Identificación inequívoca de las tres ESP32 (sin flashear)

| Dato | Valor |
|---|---|
| Fecha de la identificación | **2026-11-17** (16:33 -05:00) |
| Revisión del documento | **2026-11-18** (commit `0ee5ed4`); se actualizan referencias y estado, **no se ejecutaron pruebas nuevas de identificación** |
| Método | Solo lectura: `esptool read-mac` (no escribe flash) y lectura del puerto serie, reiniciando por software con RTS/DTR (sin pulsar botones, sin modificar el firmware) |
| Resultado | Las tres placas quedaron identificadas por **dos métodos independientes y coincidentes**. **`ttyUSB0` no es el nodo 1** |

No se ha inventado ninguna prueba: el método y los resultados son los documentados y evidenciados el
2026-11-17; lo único que cambia en esta revisión es la actualización de rutas, líneas y estado.

**Rutas:** las citas de archivo y línea son relativas a la raíz del repositorio salvo que se indique otra cosa; los enlaces entre informes son relativos a esta carpeta.


---

## 1. Cómo se identifica un nodo en el firmware

La identidad **no está grabada en la placa**: es una propiedad del **firmware compilado**.

| Mecanismo | Dónde está (verificado en el código actual) |
|---|---|
| Macro de compilación `NODO` (1, 2 o 3) | `firmware/cargar.sh:79` compila con `--build-property compiler.cpp.extra_flags=-DNODO=$NODO` |
| Guardas de compilación | `#error` si falta `NODO` o está fuera de 1–3: `firmware/detector/detector.ino:35-40` |
| Banner de arranque | `Serial.printf("\nDetector nodo-%d (Raft)\n", NODO)`: `firmware/detector/detector.ino:710` |
| Hostname mDNS / DHCP | `sismo-nodo-%d`: `firmware/detector/detector.ino:289` y `firmware/detector/detector.ino:733` |
| Id de evento | `nodo-%d-%08lx-%lu`: `firmware/detector/detector.ino:510` |
| AP del portal | `SISMO-D%d-config`: `firmware/detector/detector.ino:166` |
| Campo de la API | `"nodo": N` en `/estado`: `firmware/detector/src/nucleo/api.cpp:36` |
| Descubrimiento | `SISMO-HOLA:N`: `firmware/detector/detector.ino:360,366` |

Por tanto, no se puede leer el número de nodo de un registro de la placa: hay que **ver el firmware en
ejecución** o **cotejar la MAC** con el registro de flasheo.

---

## 2. Registro MAC → nodo

`firmware/placas.conf` guarda la relación creada al flashear cada placa (`./quien.sh --registrar N`;
el script está en `firmware/quien.sh:80-92`). En este documento las MAC se sustituyen por marcadores,
igual que en las evidencias saneadas:

| MAC | Nodo |
|---|---|
| `[MAC-N1]` | 1 |
| `[MAC-N2]` | 2 |
| `[MAC-N3]` | 3 |

Fuente: `firmware/placas.conf` y `entrega/04-evidencias/D-nodos/log-NOD-09-quien.txt`.

---

## 3. Resultado (dos métodos independientes, coincidentes)

Evidencia: `entrega/04-evidencias/D-nodos/log-NOD-09-quien.txt` (MAC por `esptool`),
`entrega/04-evidencias/D-nodos/log-NOD-02-arranque-ttyUSB0.txt`, `entrega/04-evidencias/D-nodos/log-NOD-02-arranque-ttyUSB1.txt` y `entrega/04-evidencias/D-nodos/log-NOD-02-arranque-ttyUSB2.txt` (banner de arranque), del 2026-11-17 16:33.

| Puerto | MAC de fábrica | `firmware/placas.conf` | Banner de arranque | **Nodo** |
|---|---|---|---|---|
| `/dev/ttyUSB0` | `[MAC-N2]` | 2 | `Detector nodo-2 (Raft)` | **2** |
| `/dev/ttyUSB1` | `[MAC-N1]` | 1 | `Detector nodo-1 (Raft)` | **1** |
| `/dev/ttyUSB2` | `[MAC-N3]` | 3 | `Detector nodo-3 (Raft)` | **3** |

**Confirmado: `ttyUSB0` no es el nodo 1.** El orden de enumeración USB no coincide con la numeración
lógica.

Nota sobre hashes: los encabezados de algunas evidencias físicas de esa fecha citan commits
anteriores a la normalización del historial Git (por ejemplo `ac1f6f3` o `3a274da`); esos hashes ya no
existen en el repositorio actual. Se conservan tal como se registraron y se identifican como
históricos.

---

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

Si se prefiere el monitor oficial, pulsar **EN** en la placa justo después de abrirlo:

```bash
arduino-cli monitor -p /dev/ttyUSB0 -c baudrate=115200 --timestamp
# (pulsa EN/RST en esa placa)  -> debe imprimir "Detector nodo-2 (Raft)"
```

### 4.3 Usar el script del proyecto con un solo puerto

`firmware/quien.sh` se niega cuando hay varias placas conectadas (por diseño). Con las tres conectadas hay que
indicar el puerto:

```bash
cd firmware
./quien.sh -p /dev/ttyUSB0     # -> "Detector 2 (SIS-D2) conectado en /dev/ttyUSB0"
./quien.sh -p /dev/ttyUSB1     # -> "Detector 1 (SIS-D1) ..."
./quien.sh -p /dev/ttyUSB2     # -> "Detector 3 (SIS-D3) ..."
```

---

## 5. Lo que **no** sirve para identificar

| Vía | Por qué no |
|---|---|
| `/dev/serial/by-id/` | Los tres CP2102 tienen el mismo número de serie (`0001`); udev crea un solo enlace |
| Orden de `/dev/ttyUSB*` | Depende de la enumeración USB; no coincide con la numeración lógica |
| `arduino-cli board list` | Identifica el puerto, pero como «Unknown»: el ESP32 no se anuncia por USB |
| `lsusb` | Los tres son idénticos: «Silicon Labs CP2102 USB to UART Bridge» |

---

## 6. Estado de red observado durante la identificación (histórico)

En el momento de la identificación (2026-11-17 16:33), al reiniciar, las tres placas **no lograban
conectarse a la WiFi configurada** y abrían el portal:

```
Detector nodo-2 (Raft)
No se pudo conectar al WiFi: abriendo el portal de configuración
Abriendo el portal de configuración WiFi
```

Causas y consecuencias registradas entonces:

1. La red configurada en el firmware no estaba disponible con las credenciales de ese momento, o no
   era 2,4 GHz, o el router la rechazaba.
2. Mientras no hubiera WiFi no había clúster: sin red no hay descubrimiento ni Raft.
3. Cada placa quedaba en modo portal ~5 min y luego reiniciaba; el AP se llama
   `SISMO-D1-config`, `SISMO-D2-config` y `SISMO-D3-config` (tercera forma de confirmar identidad).
4. La clave del portal en el firmware flasheado entonces era la clave antigua; tras reflashear el
   firmware estabilizado pasó a la nueva de `firmware/detector/secretos.h` (no se reproduce ninguna clave).
5. Estado de huella persistido: `huella de referencia cargada: 8 AP (movido)` — las placas creían
   que habían sido movidas (NVS). No impedía operar; se puede refijar con `POST /huella`.

**Resuelto después, la misma jornada:** se flasheó `v1.0.0-rc1` en las tres placas
(`entrega/04-evidencias/D-nodos/log-NOD-10-flasheo-nodo1.txt`, `-nodo2.txt` y `-nodo3.txt` (misma carpeta), 16:40 -05:00), se configuró la WiFi por
el portal y se verificó el clúster:

| Comprobación | Resultado | Evidencia |
|---|---|---|
| WiFi y portal | Nodo 2 conectado; AP `SISMO-D2-config` ausente; el AP aceptó la clave nueva de `firmware/detector/secretos.h` | `entrega/04-evidencias/D-nodos/log-NOD-13-verificacion-nodo2.txt` |
| Red de los tres | mDNS resuelto, misma subred, ICMP 3/3 sin pérdida, ARP con las MAC de `firmware/placas.conf` | `entrega/04-evidencias/D-nodos/log-NOD-05-red-3-nodos.txt` |
| Puertos de los portales | Ningún AP `SISMO-D*-config` visible al final | `entrega/04-evidencias/D-nodos/log-NOD-05-red-3-nodos.txt` |
| Clúster | Identidades 1/2/3 conformes, término 739 en los tres, líder único (Nodo 2), log y `commit_index` coherentes, quórum 3/3 | `entrega/04-evidencias/D-nodos/log-NOD-16-verificacion-integral.txt` |
| Descubrimiento UDP | 13 anuncios `SISMO-HOLA:1/2/3` en 12 s | `entrega/04-evidencias/D-nodos/log-NOD-05-red-3-nodos.txt`; `entrega/04-evidencias/D-nodos/log-NOD-17-descubrimiento-udp.txt` |

---

## 7. Siguiente paso (estado actual)

La identificación ya está establecida y no hay que repetirla mientras no se cambie de placa o de
firmware. Lo que queda es de la campaña física:

- **Repetir T1** después de revisar el contactor del pulsador del Nodo 2 (ver
  [`diagnostico-pulsador.md`](diagnostico-pulsador.md)).
- **T2 en adelante**: pendientes de autorización.
- Si en el futuro se reflashea una placa, repetir la identificación con el mismo procedimiento: la
  numeración no cambia si se usa `./cargar.sh N` sobre la placa registrada.

El 2026-11-18 no se conectaron las placas ni se repitieron estas pruebas; el procedimiento y los
resultados de esta página son los del 2026-11-17.
