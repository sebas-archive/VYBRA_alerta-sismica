# Prueba guiada con los 3 prototipos (campaña física)

Checklist para cargar el firmware Raft en las tres ESP32 y comprobar el sistema completo.
Marca cada casilla al terminar y anota la evidencia en `entrega/04-evidencias/F-fisicas/`.

> **Valores verificados en el código** (no supuestos): heartbeat **500 ms**
> (`config.h:16`), timeout de elección **5000–9000 ms** (`config.h:17-18`), reintento de
> *forward* 500 ms, anuncio `SISMO-HOLA` cada **2000 ms**, NTP cada 10 min.
> **Criterio de reelección de esta campaña: ≤ 12 s** (9 s de timeout máximo + latencia de red).
> El criterio antiguo de "< 5 s" era incompatible con el firmware y queda descartado.

> **El pulsador SIMULA un evento sísmico**; no mide aceleración. Duración de la pulsación →
> `nivel = min(10, 1 + ms/450)` y `pga = 0.028·nivel + 0.015` (escala de simulación).

---

## 0. Requisitos de hardware y red

| Elemento | Requisito real |
|---|---|
| Placas | 3 × ESP32 DevKit V1 (30 pines, USB-serial CP2102) |
| Cable | 3 × USB **de datos** (no solo carga). Micro-USB o USB-C según la placa |
| Pulsador | 1 por placa, entre **GPIO4 (D4)** y **GND** (INPUT_PULLUP, activo en bajo) |
| LED | Azul integrado en **GPIO2** |
| Alimentación | USB del PC para flashear; después, cargador USB o el mismo PC |
| Red | Una sola red WiFi **2.4 GHz** con **DHCP**; el PC en la misma red |
| Internet | Recomendable (NTP). Sin internet los nodos funcionan, pero `con_hora=false` y no hay alertas |
| Router | Debe permitir **broadcast** y no aislar clientes (AP isolation desactivado) |

### Permisos del puerto serie (Linux)

```bash
# El usuario debe estar en el grupo dialout (una vez, y volver a iniciar sesión):
sudo usermod -aG dialout "$USER"

# Alternativa inmediata, sin reiniciar sesión (repetir tras cada reconexión):
sudo setfacl -m u:"$USER":rw /dev/ttyUSB0

# Comprobar:
ls -l /dev/ttyUSB0
```

### Identificar qué placa está conectada

```bash
cd firmware
./quien.sh               # lee la MAC de fábrica y dice qué detector es (usa placas.conf)
./quien.sh --vigilar     # avisa cada vez que se conecta una placa
```

Las tres placas comparten el mismo chip USB-serial, así que se distinguen por su **MAC**, que
`quien.sh` registra en `firmware/placas.conf` (identificadores, no secretos).

---

## 1. Red: cómo se comunican realmente los nodos

No hay IPs fijas. Lo que hace el firmware (`config.h:9-11`, `detector.ino:326-360`):

| Aspecto | Implementación real |
|---|---|
| Dirección | **DHCP** del router. El nodo se anuncia como `sismo-nodo-N` (hostname mDNS) |
| Descubrimiento entre nodos | **Broadcast UDP 4211** cada 2 s con el texto `SISMO-HOLA:N`; al recibirlo guardan la IP del emisor |
| Mensajes Raft | **UDP unicast 4210**, JSON compacto |
| API de cada nodo | **HTTP 80** |
| OTA | ArduinoOTA: **3232/udp** en la placa y **32323/tcp** hacia el PC (firewall) |
| Portal de configuración | AP `SISMO-D<N>-config` (WPA2), DNS 53/udp y HTTP 80 sobre el AP |
| Hora | **NTP** (UTC−5), cada 10 min |

### Obtener las IPs DHCP de las tres placas (no inventarlas)

```bash
# Opción A: mDNS (lo inicia ArduinoOTA)
getent hosts sismo-nodo-1.local sismo-nodo-2.local sismo-nodo-3.local

# Opción B: monitor serie al arrancar (imprime "conectado a <red>, IP <ip>")
arduino-cli monitor -p /dev/ttyUSB0 -c baudrate=115200

# Opción C: lista de clientes DHCP del router
```

Anota las IPs en la hoja de campaña. Si mDNS no resuelve, arranca el panel con IPs explícitas:

```bash
cd web
NODOS="http://IP1,http://IP2,http://IP3" npm start
```

### SSID y contraseña

- El **SSID** se define en `firmware/detector/config.h:6` (`WIFI_SSID`).
- La **contraseña WiFi**, la **clave OTA** y la **clave del portal AP** viven en
  `firmware/detector/secretos.h`, que **no está versionado**. Plantilla: `secretos.ejemplo.h`.
- Si la red cambia, no hace falta recompilar: abre el portal (sección 3) y guarda la nueva red.

> **Importante: lo compilado es solo el valor por defecto.** Si la placa ya se configuró alguna vez
> por el portal, sus credenciales quedaron en NVS (namespace `wifi`, `detector.ino:138-148`) y **mandan
> sobre** `config.h`/`secretos.h`. Para pasar una placa a la red `Apt_105` hay que reconfigurarla por
> el portal (sección 3) o borrar la NVS (`esptool.py --chip esp32 erase_region 0x9000 0x5000`, regla 4
> de la sección 6); **reflashear no basta**.

---

## 2. Carga del firmware (USB, una placa a la vez)

Para cada placa N = 1, 2, 3:

- [ ] Conecta **solo esa placa** y da permisos al puerto (ver sección 0).
- [ ] Identifícala: `./quien.sh` → debe decir "Detector N (SIS-DN) conectado en /dev/ttyUSBx".
- [ ] Primera vez: `./cargar.sh N` (compila con `-DNODO=N` y registra la MAC en `placas.conf`).
- [ ] Siguientes veces: `./cargar.sh` (detecta solo qué detector es por la MAC).
- [ ] Monitor serie 115200: debe aparecer `Detector nodo-N`, `conectado a <red>, IP <ip>` y
      `término guardado T, voto V`.
- [ ] Desconéctala, márcala **SIS-DN** y aliméntala con su cargador o USB.
- [ ] Anota: placa, MAC, puerto, IP, resultado y hora.

> Si `cargar.sh` se niega porque la placa está registrada como otro detector, usa
> `--forzar` **solo** si realmente quieres renumerarla.

### Verificación de que la placa quedó cargada

```bash
curl -s -m 2 http://IP_DEL_NODO/estado
```

Debe responder 200 con 18 claves: `nodo`, `rol`, `caido`, `termino`, `votado_por`,
`lider_conocido`, `log_len`, `commit_index`, `pendientes`, `log_lleno`, `sucesos_seq`,
`con_hora`, `ip`, `rssi`, `uptime_ms`, `movido`, `con_huella`, `situacion`.

> No hay campo de versión en `/estado`. La evidencia de "firmware actual" es el **log de
> `cargar.sh`** (guárdalo) más `uptime_ms` bajo tras el flasheo.

---

## 3. Portal de configuración WiFi (si hace falta cambiar de red)

- [ ] Apaga la placa; enciéndela **manteniendo el pulsador ≥ 3 s**, o pulsa EN dos veces en
      menos de 3 s.
- [ ] Conéctate al AP `SISMO-D<N>-config` con la clave de `secretos.h` (16 caracteres; no se
      imprime por el puerto serie).
- [ ] Abre la IP del AP (por defecto `192.168.4.1`; el monitor serie imprime la real).
- [ ] Elige la red, escribe la contraseña y "Guardar y conectar": guarda en NVS y reinicia.
- [ ] Si no se configura en 5 min, reinicia y vuelve a la red anterior.
- [ ] **No cambies de red durante la campaña**: reinicia la placa y puede dejar el clúster incomunicado.

---

## 4. El clúster se forma

- [ ] Con las 3 encendidas, espera entre 8 y 20 s (DHCP + elección 5–9 s).
- [ ] Comprueba:
  ```bash
  for i in 1 2 3; do echo "--- nodo $i"; curl -s -m 2 http://IP$i/estado; echo; done
  ```
  Esperado: **exactamente un** `"rol":"lider"`, el mismo `lider_conocido` y el mismo `termino`
  en los tres.
- [ ] LED azul **fijo** en las tres (hay líder). Parpadeo 1 Hz = sin líder.
- [ ] Descubrimiento (opcional, requiere `tcpdump`):
  ```bash
  sudo tcpdump -ni any -tttt 'udp port 4210 or udp port 4211'
  ```
  Esperado: `SISMO-HOLA:N` cada ~2 s y `Append` del líder a cada seguidor cada ~500 ms.
- [ ] Página de estado de cada placa, **de a una** y cerrándola:
      `http://IP_DEL_NODO/` → "Detector N", "Funcionando" en verde, mismo "Líder".
      (El `WebServer` del ESP32 atiende un cliente por vez: no la dejes abierta en la demo.)

---

## 5. Carga por WiFi (OTA)

- [ ] Permite la vuelta de la placa al PC:
  ```bash
  sudo ufw allow from <TU_SUBRED>/24 to any port 32323 proto tcp
  ```
- [ ] `./cargar.sh N --wifi` (resuelve `sismo-nodo-N.local` o usa `IP=x.x.x.x ./cargar.sh N --wifi`).
- [ ] Tras reiniciar, el nodo vuelve al clúster y se pone al día.

---

## 6. Casos de la campaña

Criterios con los valores reales. Registra OK/FALLO, hora, término y evidencia por caso.

| # | Acción | Resultado esperado | Evidencia | ✓ |
|---|---|---|---|---|
| 1 | Pulsador ~900 ms en un nodo | Entrada confirmada por mayoría; `nivel 3`, `pga ≈ 0.099`, id `nodo-N-<hex>-<cont>`. En un seguidor, `resultado:"pendiente"` y luego confirmada | `/log`, serial, panel | [ ] |
| 2 | Pulsadores de **dos** nodos con < 10 s | Alerta (`nivel medio`, promedio de niveles) en panel y `/publico` con franja **SIMULACRO** | `/alertas`, capturas | [ ] |
| 3 | Pulsadores con > 10 s | **Sin** alerta (dos eventos separados) | `/log`, captura | [ ] |
| 4 | Desenchufar el **líder** | Nuevo líder en **≤ 12 s**; `termino` incrementado; el panel marca el viejo como inalcanzable | timestamps, `/sucesos`, panel | [ ] |
| 5 | Volver a enchufar el líder caído | Regresa como **seguidor** y converge (`log_len` y `commit_index` iguales) | `/estado`, panel | [ ] |
| 6 | "Simular caída" en 2 nodos (o 2 pulsadores de 3 s) | Sin quórum: **no hay commit**; banner "Sin quórum"; el evento del vivo queda pendiente | `/estado`, panel | [ ] |
| 7 | Recuperar uno | El pendiente se confirma en ≤ 3 s | `/log`, panel | [ ] |
| 8 | `Ctrl+C` al panel del PC | Los nodos siguen operando; al reabrir, el panel reconstruye el estado | capturas | [ ] |
| 9 | Reiniciar el router | Cada placa vuelve con **una IP nueva o la misma** (DHCP), sin configuración manual | `getent`, serial | [ ] |
| 10 | Apagar y encender un seguidor | Conserva `termino` y `votado_por` (NVS); **pierde el log** (RAM) y se reconstruye desde el líder | serial, `/estado` | [ ] |

### Reglas de seguridad de la campaña

1. **Una sola placa apagada por vez** (salvo el caso 6). Apagar dos simultáneamente puede dejar a
   la mayoría sin log (vive en RAM) y disparar la resincronización de emergencia.
2. Espera convergencia (`log_len` y `commit_index` iguales en los tres) antes del caso siguiente.
3. No cambies la red WiFi durante la campaña.
4. Reflashear **no** borra la NVS; para partir de cero usa
   `esptool.py --chip esp32 erase_region 0x9000 0x5000` (borra también credenciales WiFi y huella).
5. No publiques en capturas la clave del portal, la clave OTA ni la contraseña WiFi.

---

## 7. Mediciones a registrar

| Métrica | Cómo obtenerla | Criterio |
|---|---|---|
| Tiempo de respuesta de `/estado` | `curl -o /dev/null -s -w '%{time_total}\n' http://IP/estado` (×100) | mediana y p95 < 0,25 s |
| Tiempo de elección inicial | desde el encendido hasta el primer `rol:"lider"` | ≤ 12 s |
| Tiempo de failover | `date -Ins` antes de apagar el líder y en el primer `/estado` con nuevo líder | ≤ 12 s |
| Tiempo de puesta al día | desde que el nodo vuelve hasta `log_len` igual al líder | ≤ 3 s esperado |
| Latencia de commit | `t` del evento vs. primera vez visto confirmado en `/log` | registrar valor |
| Eventos enviados / confirmados | contar entradas en `/log` antes y después | sin duplicados por id |
| Consumo del panel | `docker stats --no-stream` (si se usa Docker) | informativo |

Anota también `termino`, `lider_conocido` y hora en cada caso: sin eso la evidencia no es
reproducible.

---

## 8. Anexos de la campaña

- Hoja de registro: `entrega/05-pruebas/datos/matriz-fisica.csv`
- Capturas: `entrega/04-evidencias/F-fisicas/` y `D-nodos/`
- Informe de resultados: `entrega/10-informes-fase3/informe-fase3.md`
