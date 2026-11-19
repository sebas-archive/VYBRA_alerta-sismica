# 6. Firmware de las ESP32, parte por parte

Cada uno de los tres detectores ejecuta el mismo firmware. Lo único que cambia entre placas es el
número de nodo, que se fija al compilar con `-DNODO=1`, `-DNODO=2` o `-DNODO=3`. El código vive en
`firmware/detector/` y se divide en dos capas:

- `detector.ino` es el pegamento con el hardware. Inicializa la placa, conecta el WiFi, abre los
  sockets UDP, atiende HTTP, lee el botón, escribe en la memoria no volátil (NVS), pide la hora por
  NTP, atiende OTA y escanea las redes WiFi vecinas.
- `src/nucleo/` es el núcleo portable, sin dependencias de Arduino. Contiene el consenso Raft, la
  máquina de estados sísmica, el códec de mensajes, el contrato HTTP en JSON y la comparación de
  huellas WiFi. El mismo código se compila en el PC para las pruebas (`firmware/test/`).

En todo el capítulo las citas de código son textuales y llevan la línea `Archivo: ruta (líneas N-M)`
antes del bloque. Cuando se omite una parte se indica con `... (continúa)` y se explica qué queda
fuera. Los valores que aparecen aquí se copiaron del repositorio en la versión `v1.0.0-rc1`, commit
`0ee5ed4`.

> **Aviso de alcance.** El evento sísmico lo genera un pulsador. El firmware no lee ningún
> acelerómetro ni mide aceleración: traduce la duración de la pulsación a un nivel de 1 a 10 y a un
> PGA según una escala de simulación declarada. Lo que se demuestra es consenso distribuido y
> procesamiento de eventos, no instrumentación sismológica.

## 6.1 Mapa de archivos

La {{TABLA:T-FW-ARCH}} lista todos los archivos que forman el firmware, con su longitud real.
Las cifras de líneas incluyen comentarios y líneas en blanco; se obtuvieron con `wc -l`. En total son
2.175 líneas de C y C++ versionadas, más los dos scripts de carga y el registro de placas.

[[TABLA:T-FW-ARCH|Archivos del firmware, longitud real y responsabilidad de cada uno.]]

| Archivo | Líneas | Responsabilidad |
|---|---:|---|
| `firmware/detector/detector.ino` | 758 | Pegamento con el hardware: WiFi, UDP, HTTP, NVS, botón, LED, NTP, OTA, huella y bucle principal |
| `firmware/detector/config.h` | 31 | Puertos, tiempos de Raft, tiempos del portal y zona horaria |
| `firmware/detector/secretos.h` | 8 | Claves WiFi, OTA y del portal; no está versionado, lo crea el instalador |
| `firmware/detector/secretos.ejemplo.h` | 5 | Plantilla con valores de relleno para crear `secretos.h` |
| `firmware/detector/pagina.h` | 91 | Página HTML de estado del nodo, servida en `GET /` |
| `firmware/detector/portal.h` | 33 | Cabecera y pie del portal cautivo de configuración WiFi |
| `firmware/detector/src/nucleo/tipos.h` | 66 | Tipos compartidos: rol, evento, entrada, mensaje, suceso |
| `firmware/detector/src/nucleo/raft.h` | 168 | Interfaz del consenso: persistencia, configuración, resultados y estado |
| `firmware/detector/src/nucleo/raft.cpp` | 501 | Elección de líder, replicación, confirmación por mayoría, reenvío y caída simulada |
| `firmware/detector/src/nucleo/mensajes.h` | 13 | Declaración del códec de los mensajes Raft |
| `firmware/detector/src/nucleo/mensajes.cpp` | 127 | Codificación y decodificación JSON de los seis tipos de mensaje |
| `firmware/detector/src/nucleo/sismo.h` | 38 | Interfaz de la máquina sísmica y de la alerta |
| `firmware/detector/src/nucleo/sismo.cpp` | 82 | Agrupación de eventos en ventana de 10 s y nivel de alerta |
| `firmware/detector/src/nucleo/api.h` | 34 | Declaración del JSON de `/estado`, `/log`, `/sucesos` y `/alertas` |
| `firmware/detector/src/nucleo/api.cpp` | 123 | Serialización de ese JSON y cálculo de la situación del nodo |
| `firmware/detector/src/nucleo/huella.h` | 41 | Interfaz de la huella WiFi y del detector de movimiento |
| `firmware/detector/src/nucleo/huella.cpp` | 64 | Selección de AP, parecido entre escaneos y regla de dos fallos |
| `firmware/cargar.sh` | 105 | Compila y carga un detector por USB o por WiFi |
| `firmware/quien.sh` | 116 | Identifica la placa conectada por su MAC y la registra como detector |
| `firmware/placas.conf` | 4 | Tabla MAC a número de detector, escrita por `quien.sh --registrar` |

Hay dos carpetas que no son código fuente y también forman parte de la entrega. `firmware/test/`
contiene el arnés de pruebas del núcleo en el PC (`Makefile`, `prueba.h`, `red_simulada.h` y cinco
programas de prueba: `test_raft`, `test_sismo`, `test_mensajes`, `test_api`, `test_huella`). Los
binarios de esas pruebas compilan los mismos `.cpp` del núcleo con `-DPRUEBA_MAIN`, sin Arduino.
`firmware/build/nodo-N/` guarda los artefactos de compilación de cada placa y el archivo
`build.options.json` con el `-DNODO` usado.

La separación entre las dos capas no es cosmética. Permite probar en el PC la elección, la
replicación, la confirmación, el códec y la regla de alerta con 78 casos que no necesitan hardware, y
deja en `detector.ino` solo lo que depende de la placa. El precio es que el núcleo recibe el reloj y
la persistencia como dependencias inyectadas, en lugar de llamar a `millis()` o a `Preferences` por
su cuenta.

## 6.2 Flujo de ejecución: el loop() y el ciclo de un evento

La {{FIG:FIG-FW-01}} muestra las dos rutas que conviven en el firmware. A la izquierda, las llamadas
que se repiten en cada vuelta del `loop()`. A la derecha, el recorrido de un evento desde que se
presiona el pulsador hasta que aparece en el panel.

[[FIG:FIG-FW-01|Flujo del firmware: orden de las llamadas del loop() y ciclo completo de un evento, desde el pulsador hasta el panel. Fuente: elaboración propia a partir de firmware/detector/detector.ino y firmware/detector/src/nucleo/raft.cpp.]]

El orden del `loop()` sigue una lógica de dependencias. Primero se comprueba el WiFi, porque de él
dependen los sockets. Después se refresca la tabla de direcciones de los otros nodos y se leen los
datagramas Raft pendientes, de modo que cuando el núcleo avanza su temporizador ya conoce el estado
más reciente de la red. Luego se lee el botón, para que una pulsación se proponga antes de que el
`loop()` se entere de si el nodo es líder o seguidor. Después se atiende una petición HTTP y se envían
las salidas UDP que generaron los pasos anteriores. OTA queda al final porque puede escribir flash y
retener el procesador. La huella WiFi, la petición de hora, la impresión de sucesos y el LED cierran
la vuelta. El `delay(1)` final cede la CPU a las tareas de WiFi del sistema operativo.

## 6.3 config.h completo

`config.h` es el archivo de configuración compartido por los tres detectores. La primera regla está
escrita en su cabecera: el número de detector no vive aquí, se elige al compilar. Las credenciales
tampoco viven aquí: `config.h` solo incluye `secretos.h`, que no está versionado.

Archivo: firmware/detector/config.h (líneas 1-31)

```cpp
// Configuración compartida por los 3 detectores.
// El número de detector NO va aquí: se elige al compilar (./cargar.sh 1, 2 o 3).
#pragma once
#include <stdint.h>

#define WIFI_SSID "Apt_105"
#include "secretos.h"   // WIFI_PASS y OTA_CLAVE; no va en git

// Las IP las da el DHCP del router. Los nodos se encuentran por broadcast UDP.
static const uint16_t PUERTO_DESCUBRIR = 4211;
static const uint32_t HOLA_CADA_MS = 2000;

// Tiempos de Raft. La red por defecto es el router Apt_105; estos tiempos son conservadores
// para redes congestionadas o con pérdida puntual de paquetes: con 1.5-3 s de elección los
// latidos se pierden y los nodos se disputan el liderazgo sin parar.
static const uint32_t RAFT_LATIDO_MS = 500;
static const uint32_t RAFT_ELECCION_MIN_MS = 5000;
static const uint32_t RAFT_ELECCION_MAX_MS = 9000;

// Puerto UDP de los mensajes Raft entre nodos; la API HTTP va en el 80.
static const uint16_t PUERTO_RAFT = 4210;

// Zona horaria de Colombia (UTC-5, sin horario de verano)
#define GMT_OFFSET_S (-5 * 3600)

// Portal de configuración WiFi: la placa crea la red SISMO-D<N>-config (clave PORTAL_CLAVE, mínimo 8)
// si no logra conectarse al arrancar, si se pulsa EN dos veces seguidas, o si se mantiene el botón al encender.
// PORTAL_CLAVE se define en secretos.h (no versionado); ver secretos.ejemplo.h.
static const uint32_t DOBLE_REINICIO_MS = 3000;   // pulsar EN dos veces en menos de 3 s abre el portal
static const uint32_t PORTAL_BOTON_MS = 3000;     // botón presionado al encender: abre el portal
static const uint32_t PORTAL_MAX_MS = 300000;     // sin configurarla en 5 min, reinicia y reintenta
```

La {{TABLA:T-FW-CONFIG}} explica cada constante, dónde se usa y por qué tiene ese valor. Los
valores no son arbitrarios: los tiempos de Raft salen de la red real del montaje y los del portal, de
la ventana de tiempo en la que una persona puede abrir la red de configuración.

[[TABLA:T-FW-CONFIG|Constantes de configuración del firmware, valor, uso y justificación.]]

| Constante | Valor | Dónde se usa | Por qué ese valor |
|---|---|---|---|
| `WIFI_SSID` | `"Apt_105"` | `cargarCredenciales()` | Red del montaje; solo se usa si la NVS no tiene credenciales guardadas por el portal |
| `WIFI_PASS` | en `secretos.h` | `WiFi.begin()` | No se versiona; la define el instalador |
| `PUERTO_DESCUBRIR` | 4211 | `descubrirNodos()` | Canal de anuncios por broadcast, separado del canal de consenso |
| `HOLA_CADA_MS` | 2000 | `descubrirNodos()` | Cada 2 s un anuncio `SISMO-HOLA:N`; un DHCP nuevo se corrige en el siguiente anuncio |
| `RAFT_LATIDO_MS` | 500 | `cfg.latidoMs` | Latido del líder cada medio segundo; deja margen para pausas del `loop()` |
| `RAFT_ELECCION_MIN_MS` | 5000 | `cfg.eleccionMinMs` | Mínimo del sorteo de elección |
| `RAFT_ELECCION_MAX_MS` | 9000 | `cfg.eleccionMaxMs` | Máximo del sorteo; 10 latidos perdidos antes de postularse |
| `PUERTO_RAFT` | 4210 | `udp.begin()` | Mensajes de consenso entre nodos; el HTTP va en el 80 |
| `GMT_OFFSET_S` | `-5 * 3600` | `configTime()` | Colombia es UTC-5 todo el año, sin horario de verano |
| `DOBLE_REINICIO_MS` | 3000 | `dobleReinicio()` | Ventana para pulsar EN dos veces seguidas y abrir el portal |
| `PORTAL_BOTON_MS` | 3000 | `botonPideConfiguracion()` | Tres segundos con el botón presionado al encender |
| `PORTAL_MAX_MS` | 300000 | `portalWifi()` | Cinco minutos de portal; después reinicia y reintenta la conexión normal |

El valor 5000 a 9000 ms de elección merece una nota. Es más conservador que el que suele usarse en
laboratorio porque el `loop()` no es un bucle en tiempo real: `servidor.handleClient()` atiende un
cliente HTTP por vez, `ArduinoOTA.handle()` escribe flash, `Preferences` bloquea al guardar y un
escaneo WiFi activo ocupa la radio alrededor de 0,85 s. Con un plazo de elección de 5 a 9 s hay
margen para esas pausas sin que se dispare una elección espuria. El comentario del archivo lo deja
escrito: con 1,5 a 3 s los latidos se pierden y los nodos se disputan el liderazgo sin parar.

## 6.4 secretos.h y secretos.ejemplo.h

Las tres claves del sistema no están en el repositorio. `secretos.ejemplo.h` es la plantilla que se
copia a `secretos.h`; el archivo real está excluido por `.gitignore` y lo crea el instalador.

Archivo: firmware/detector/secretos.ejemplo.h (líneas 1-5)

```cpp
// Copia este archivo como secretos.h y pon las claves reales.
#pragma once
#define WIFI_PASS "PON_AQUI_LA_CLAVE"
#define OTA_CLAVE "PON_AQUI_LA_CLAVE_OTA"   // clave de ArduinoOTA (./cargar.sh N --wifi)
#define PORTAL_CLAVE "PON_AQUI_CLAVE_PORTAL" // clave WPA2 del AP SISMO-D<N>-config (mínimo 8 caracteres)
```

`secretos.h` tiene la misma estructura: `#pragma once`, `WIFI_PASS`, `OTA_CLAVE` y `PORTAL_CLAVE`, con
comentarios locales. Este manual no reproduce sus valores; el propio archivo pide no citarlos y el
repositorio los excluye a propósito. Lo que sí conviene saber es qué valida cada uno:

- `WIFI_PASS` es la contraseña de la red a la que se conecta la placa. No se valida en tiempo de
  compilación; si está mal, la placa abre el portal de configuración.
- `OTA_CLAVE` es la contraseña de ArduinoOTA. `detector.ino` comprueba que exista con `#ifndef
  OTA_CLAVE` y `cargar.sh` la extrae del archivo para pasársela a `espota.py`.
- `PORTAL_CLAVE` es la clave WPA2 del punto de acceso `SISMO-D<N>-config`, con un mínimo de 8
  caracteres por la norma WPA2. `detector.ino` también comprueba que exista con `#ifndef`.

Antes de compilar, `cargar.sh` verifica que el archivo exista y que no sea la plantilla:

Archivo: firmware/cargar.sh (líneas 26-36)

```bash
SECRETOS="$DIR/detector/secretos.h"

if [[ ! -f "$SECRETOS" ]] || grep -q 'PON_AQUI_LA_CLAVE' "$SECRETOS"; then
  echo "Falta firmware/detector/secretos.h con las claves (copia secretos.ejemplo.h)" >&2
  exit 1
fi
OTA_CLAVE="$(sed -n 's/^#define OTA_CLAVE "\([^"]*\)".*/\1/p' "$SECRETOS")"
if [[ -z "$OTA_CLAVE" ]]; then
  echo "Falta OTA_CLAVE en firmware/detector/secretos.h (mira secretos.ejemplo.h)" >&2
  exit 1
fi
```

La búsqueda de `PON_AQUI_LA_CLAVE` atrapa el error más común: copiar la plantilla y olvidar
reemplazarla. La extracción con `sed` deja la clave OTA en la variable `OTA_CLAVE` del script, que se
usa solo en la carga por WiFi.

> **Seguridad.** `secretos.h` no se versiona ni se publica. Si se filtra, hay que rotar las tres
> claves. La clave del portal se imprime por el puerto serie solo de forma indirecta: el firmware
> anuncia el nombre de la red, nunca la clave.

## 6.5 Cabecera y validaciones de detector.ino

La cabecera del archivo documenta el hardware, la simulación y una limitación de diseño: el `loop()`
procura no bloquearse, pero algunas llamadas del sistema sí retienen el procesador varios segundos.

Archivo: firmware/detector/detector.ino (líneas 1-13)

```cpp
// Nodo detector con Raft para ESP32 DevKit V1 (30 pines).
// Hardware: pulsador entre D4 y GND (diagonal en la protoboard). LED azul integrado en GPIO 2.
// El pulsador SIMULA un evento sísmico: no mide aceleración. Más tiempo presionado = evento
// más fuerte: nivel 1 + uno cada 450 ms, máximo 10 (escala de simulación, no instrumentación).
//
// Este archivo es solo pegamento con el hardware: WiFi, UDP, HTTP, NVS, botón, LED, NTP, OTA y
// el escaneo de la huella WiFi (para saber si movieron la placa).
// Toda la lógica (elección, replicación, alertas y JSON) está en src/nucleo/ y se prueba en el PC.
// El loop procura no bloquearse, porque Raft late cada 500 ms (RAFT_LATIDO_MS en config.h). No
// obstante, algunas llamadas sí pueden retenerlo varios segundos: servidor.handleClient() atiende
// un cliente HTTP por vez, ArduinoOTA.handle() escribe flash, Preferences bloquea al guardar y el
// escaneo WiFi activo ocupa la radio ~0,85 s. Con la elección en 5-9 s hay margen para esas
// pausas, pero un cliente HTTP lento o una OTA pueden provocar una elección espuria.
```

Después vienen las bibliotecas. El archivo usa WiFi, `WiFiUdp`, `WebServer`, `DNSServer`,
`Preferences`, `ArduinoOTA`, `ArduinoJson`, temporizadores de alta resolución, la API de WiFi del
ESP-IDF, `time.h`, `sys/time.h`, `algorithm`, `vector` y los siete encabezados locales
(`config.h`, `pagina.h`, `portal.h`, `api.h`, `huella.h`, `mensajes.h`, `raft.h`).

Archivo: firmware/detector/detector.ino (líneas 14-33)

```cpp
#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <ArduinoOTA.h>
#include <ArduinoJson.h>
#include <esp_timer.h>
#include <esp_wifi.h>
#include <time.h>
#include <sys/time.h>
#include <algorithm>
#include <vector>
#include "config.h"
#include "pagina.h"
#include "portal.h"
#include "src/nucleo/api.h"
#include "src/nucleo/huella.h"
#include "src/nucleo/mensajes.h"
#include "src/nucleo/raft.h"
```

Las validaciones de compilación son cuatro y están juntas. No son decorativas: impiden que se genere
un binario con una identidad ambigua o sin claves.

Archivo: firmware/detector/detector.ino (líneas 35-46)

```cpp
#ifndef NODO
#error "Compila con ./cargar.sh 1, 2 o 3 para elegir el detector"
#endif
#if NODO < 1 || NODO > 3
#error "NODO debe ser 1, 2 o 3"
#endif
#ifndef OTA_CLAVE
#error "Falta OTA_CLAVE en secretos.h (copia la línea de secretos.ejemplo.h)"
#endif
#ifndef PORTAL_CLAVE
#error "Falta PORTAL_CLAVE en secretos.h (copia la línea de secretos.ejemplo.h)"
#endif
```

`#ifndef NODO` se dispara cuando alguien compila desde el IDE de Arduino sin pasar el `-DNODO`. Sin
esa guarda, el firmware compilaría con `NODO` indefinido y el `#if NODO < 1` fallaría de forma menos
clara. El rango 1 a 3 existe porque el clúster tiene exactamente tres nodos y las tablas del núcleo
están dimensionadas con índices de 1 a 3 (`kPrimerNodo` y `kUltimoNodo` en `raft.h`). Las otras dos
guardas trasladan al compilador el error que, si no, aparecería en tiempo de ejecución al abrir el
portal o al iniciar OTA.

A continuación se declaran las constantes del sketch, que son las que no tienen sentido en
`config.h` porque dependen de cómo está cableada la placa o de una decisión local del bucle.

Archivo: firmware/detector/detector.ino (líneas 50-68)

```cpp
const int PIN_BOTON = 4;
const int PIN_LED = 2;
const uint32_t PULSO_MIN_MS = 80;           // toques más cortos se ignoran
const uint32_t PULSO_MAX_MS = 60000;        // tope para POST /pulsar
const uint32_t ANTIRREBOTE_MS = 20;
const uint32_t WIFI_LIMITE_MS = 30000;      // sin WiFi en 30 s al arrancar: reinicia
const uint32_t WIFI_REINTENTO_MS = 20000;   // ya andando: pide reconexión cada 20 s si se cayó
const uint32_t WIFI_REINICIO_MS = 180000;   // 3 min sin WiFi: reinicia la placa (Raft guarda término y voto)
const uint32_t NTP_CADA_MS = 10UL * 60 * 1000;
const int MAX_PAQUETES_POR_LOOP = 8;
const uint32_t ESCANEO_PRIMERO_MS = 15000;  // huella: el primero 15 s tras arrancar
const uint32_t ESCANEO_SEGUNDO_MS = 30000;  // el segundo a los 30 s (la unión de ambos ya decide)
const uint32_t ESCANEO_CADA_MS = 120000;    // y después uno cada 2 min
const uint32_t ESCANEO_MIN_MS = 15000;      // nunca dos con menos de 15 s entre ellos
// Escaneo activo: pregunta a los AP en vez de esperar beacons. Peor caso ~14 canales × 60 ms ≈ 0,85 s.
const uint32_t ESCANEO_MIN_MS_POR_CANAL = 30;   // mínimo por canal (el core trae 100, mayor que el máximo)
const uint32_t ESCANEO_MS_POR_CANAL = 60;       // máximo por canal
const uint32_t ESCANEO_LIMITE_MS = 10000;   // si no termina en 10 s, se da por perdido
const size_t MAX_APS_HUELLA = 8;
```

El pulsador está en GPIO4 con la resistencia de pull-up interna y el LED azul en GPIO2. El antirrebote
es de 20 ms y las pulsaciones de menos de 80 ms se descartan. El tope de 60 s no se aplica al pulsador
físico, solo a `POST /pulsar`: en el botón real, una pulsación larga se satura en el nivel máximo. Los
tiempos de WiFi escalan en tres pasos (30 s al arrancar, reintento cada 20 s, reinicio a los 3 min) y
los de la huella tienen su propia lógica, que se explica en el apartado 6.10.

## 6.6 Estado global y persistencia NVS

El estado global ocupa un bloque de variables declaradas antes de cualquier función. El tipo más
importante es `PersistenciaNvs`, la implementación concreta de la interfaz `nucleo::Persistencia` que
el núcleo usa para guardar el término y el voto sin depender de Arduino.

Archivo: firmware/detector/detector.ino (líneas 72-95)

```cpp
// currentTerm y votedFor en NVS (namespace "raft", claves "T" y "V").
struct PersistenciaNvs : nucleo::Persistencia {
  Preferences prefs;
  void abrir() { prefs.begin("raft", false); }
  void guardar(uint32_t termino, int votadoPor) override {
    prefs.putUInt("T", termino);
    prefs.putInt("V", votadoPor);
  }
  void cargar(uint32_t& termino, int& votadoPor) override {
    termino = prefs.getUInt("T", 0);
    votadoPor = prefs.getInt("V", 0);
  }
};

PersistenciaNvs persistencia;
// namespace "ubic": "ref" huella de referencia en JSON, "mov" si lo movieron,
// "pide" si hay una huella pedida por POST /huella que aún no se tomó (sobrevive a un reinicio).
Preferences prefsUbic;
nucleo::Raft* raft = nullptr;   // se crea en setup(), cuando ya hay semilla aleatoria
WiFiUDP udp;
WebServer servidor(80);
IPAddress ipNodos[3];            // se aprenden en la red (DHCP): 0.0.0.0 = aún no se sabe
WiFiUDP udpDescubrir;            // "HOLA N" por broadcast: así cada nodo conoce la IP de los otros
uint64_t proximoHola = 0;
```

La NVS se reparte en tres espacios de nombres. El primero es `raft`, que guarda `currentTerm` y
`votedFor` con las claves `T` y `V`. El segundo es `ubic`, que guarda la huella de referencia en JSON
(`ref`), la marca de placa movida (`mov`) y la petición pendiente de huella (`pide`). El tercero es
`wifi`, que guarda el SSID, la contraseña y la marca de doble reinicio (`dr`); se usa más adelante, en
las funciones del portal. El log replicado no se persiste: vive en RAM y se reconstruye por
replicación. Solo el término y el voto son obligatorios en disco, porque Raft exige que el voto se
guarde antes de responder una petición de voto.

Las otras variables globales cubren el bucle:

Archivo: firmware/detector/detector.ino (líneas 97-119)

```cpp
uint32_t arranque = 0;   // aleatorio por arranque, para que los id no se repitan
uint32_t contador = 0;
uint8_t paquete[1500];

// Botón con antirrebote sin delay().
bool crudoAnterior = false;
uint64_t cambioCrudo = 0;
bool pulsando = false;
uint64_t tPulso = 0;

uint64_t proximoNtp = 0;
uint64_t proximoReintentoWifi = 0;
uint64_t wifiCaidoDesde = 0;   // 0 = conectado
uint32_t reintentosWifi = 0;
uint32_t ultimoSucesoImpreso = 0;

// Huella WiFi. El escaneo es asíncrono: se lanza y se revisa en cada vuelta del loop.
nucleo::DetectorMovimiento detectorMov;
bool huellaPedida = false;     // POST /huella: el próximo escaneo fija la referencia
bool escaneando = false;
uint32_t escaneosLanzados = 0; // desde el arranque (los dos primeros van más seguidos)
uint64_t inicioEscaneo = 0;    // cuándo se lanzó el último
bool movidoAvisado = false;    // para registrar el suceso "movido" una sola vez por transición
```

`arranque` se llena con `esp_random()` en `setup()` y forma parte del identificador de cada evento, de
modo que dos sesiones distintas no generan identificadores iguales. `paquete` es el búfer de recepción
UDP: 1.500 bytes, el tamaño máximo de un datagrama en una red Ethernet estándar. `raft` se declara como
puntero y se crea en `setup()`, después de generar la semilla; así el núcleo recibe una semilla
aleatoria propia y no depende del estado del generador global de Arduino.

## 6.7 Tiempo y NTP

El firmware necesita dos relojes distintos. Para los temporizadores del bucle necesita un contador
monótono en milisegundos que no se reinicie; para fechar los eventos necesita la hora real.

Archivo: firmware/detector/detector.ino (líneas 121-134)

```cpp
// ---------------------------------------------------------------- tiempo

// ms desde el arranque, en 64 bits (millis() da la vuelta a los 49 días).
uint64_t ahoraMs() { return (uint64_t)(esp_timer_get_time() / 1000); }

// Hora real en ms desde 1970 si NTP ya sincronizó; 0 si no.
uint64_t ahoraEpochMs() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  if (tv.tv_sec < 1700000000) return 0;
  return (uint64_t)tv.tv_sec * 1000ULL + tv.tv_usec / 1000;
}

void pedirHora() { configTime(GMT_OFFSET_S, 0, "pool.ntp.org", "time.google.com"); }  // no bloquea
```

`ahoraMs()` usa `esp_timer_get_time()`, que devuelve microsegundos en 64 bits. `millis()` de Arduino
se desborda a los 49 días; con la elección y el latido ese desbordamiento sería un problema de
comparación de tiempos. Por eso todos los temporizadores del bucle usan `uint64_t` y `ahoraMs()`.
`ahoraEpochMs()` lee el reloj del sistema con `gettimeofday` y devuelve 0 mientras el segundo Unix sea
menor que 1.700.000.000, es decir, mientras NTP no haya sincronizado (ese valor corresponde a finales
de 2023, anterior a cualquier fecha de operación del proyecto). Ese 0 es intencional: la máquina
sísmica descarta eventos sin hora y el campo `con_hora` de `/estado` queda en falso, de modo que un
nodo recién encendido no inventa fechas.

`pedirHora()` llama a `configTime` con el desfase UTC-5, sin horario de verano, y dos servidores NTP.
La llamada no bloquea: el sistema pide la hora en segundo plano. `setup()` la invoca una vez y el
`loop()` la repite cada `NTP_CADA_MS` (10 minutos) para corregir la deriva del oscilador.

## 6.8 WiFi y portal cautivo

El WiFi se configura en dos etapas. Al arrancar se leen las credenciales guardadas; si no hay, se
usan las de `config.h` y `secretos.h`. La lectura usa `Preferences` en modo solo lectura.

Archivo: firmware/detector/detector.ino (líneas 138-148)

```cpp
// Red y contraseña: las guardadas desde el portal (NVS, namespace "wifi"); si no hay,
// las de config.h / secretos.h.
String ssidWifi, passWifi;
void cargarCredenciales() {
  Preferences p;
  p.begin("wifi", true);
  ssidWifi = p.getString("ssid", "");
  passWifi = p.getString("pass", "");
  p.end();
  if (ssidWifi.isEmpty()) { ssidWifi = WIFI_SSID; passWifi = WIFI_PASS; }
}
```

El portal cautivo es la red que crea la placa cuando no hay credenciales válidas. Se abre por tres
caminos: si el botón está presionado al encender durante `PORTAL_BOTON_MS`, si se pulsa EN dos veces
seguidas dentro de `DOBLE_REINICIO_MS`, o si el WiFi no conecta en `WIFI_LIMITE_MS`. La función
`portalWifi()` crea el punto de acceso, escanea las redes visibles, sirve un formulario y guarda la
elección en NVS. La cabecera de la función y el arranque del portal son estos:

Archivo: firmware/detector/detector.ino (líneas 161-187)

```cpp
// Portal de configuración: crea la red SISMO-D<N>-config, lista las redes que ve y pide la
// contraseña. Guarda en NVS y reinicia. No vuelve: termina siempre en ESP.restart().
void portalWifi() {
  Serial.println("Abriendo el portal de configuración WiFi");
  char ap[24];
  snprintf(ap, sizeof ap, "SISMO-D%d-config", NODO);
  WiFi.disconnect(true, false);
  WiFi.mode(WIFI_AP_STA);
  // Se busca antes de que se conecte nadie: escanear con un cliente enganchado le corta la conexión.
  int total = WiFi.scanNetworks();
  struct Red { String ssid; int rssi; bool abierta; };
  std::vector<Red> redes;
  for (int i = 0; i < total; i++) {
    String s = WiFi.SSID(i);
    if (s.isEmpty()) continue;
    bool repetida = false;
    for (Red& r : redes) if (r.ssid == s) { repetida = true; if (WiFi.RSSI(i) > r.rssi) r.rssi = WiFi.RSSI(i); }
    if (!repetida) redes.push_back({s, WiFi.RSSI(i), WiFi.encryptionType(i) == WIFI_AUTH_OPEN});
  }
  std::sort(redes.begin(), redes.end(), [](const Red& a, const Red& b) { return a.rssi > b.rssi; });
  WiFi.scanDelete();

  WiFi.softAP(ap, PORTAL_CLAVE);
  IPAddress ip = WiFi.softAPIP();
  DNSServer dns;
  dns.start(53, "*", ip);   // cualquier nombre apunta a la placa: el celular abre el portal solo
  WebServer web(80);
```

El escaneo se hace antes de crear el punto de acceso porque un cliente ya conectado corta el escaneo.
Las redes se deduplican por SSID, se conserva el RSSI más fuerte de cada una y se ordenan de mayor a
menor señal. El `DNSServer` responde a cualquier nombre con la IP de la placa; eso hace que el móvil
abra el portal solo al detectar que no hay Internet, sin escribir una dirección. La página del portal
usa `PORTAL_CABECERA` y `PORTAL_PIE` (apartado 6.15) y escapa el SSID con `htmlEsc()` antes de
insertarlo en el HTML.

El formulario procesa la elección en `POST /guardar`, valida los límites, guarda en el espacio `wifi`
y reinicia. El inicio del manejador y la validación son estos:

Archivo: firmware/detector/detector.ino (líneas 210-215)

```cpp
  web.on("/guardar", HTTP_POST, [&]() {
    String red = web.arg("red");
    if (red == "__otra__") red = web.arg("otra");
    red.trim();
    String clave = web.arg("clave");
    if (red.isEmpty() || red.length() > 32 || clave.length() > 63) {
```

Si la validación falla, el manejador responde con un 400 y una página de error; esas seis líneas
(líneas 216 a 221 del archivo) contienen la cadena HTML de la página y se omiten aquí para no copiar
una línea de más de 120 caracteres. La rama que guarda y reinicia es esta:

Archivo: firmware/detector/detector.ino (líneas 222-227)

```cpp
    Preferences p;
    p.begin("wifi", false);
    p.putString("ssid", red);
    p.putString("pass", clave);
    p.end();
    String h = PORTAL_CABECERA;
```

La línea siguiente del archivo (la 228) arma la página de confirmación con el SSID escapado; mide 130
caracteres y no se reproduce porque el contrato limita el código a 120 caracteres por línea. Su
contenido es un título de "Guardado" con el nombre de la red y el aviso de que el detector se reinicia.
El cierre del manejador y el reinicio son:

Archivo: firmware/detector/detector.ino (líneas 229-233)

```cpp
    h += PORTAL_PIE;
    web.send(200, "text/html; charset=utf-8", h);
    delay(1500);
    ESP.restart();
  });
```

Los límites de 32 y 63 caracteres son los máximos de SSID y contraseña WPA2. Se comprueban en el
servidor porque el navegador es fácil de saltar con una petición manual. El portal permanece abierto
`PORTAL_MAX_MS` (5 minutos) con el LED parpadeando rápido; si nadie lo usa, reinicia y vuelve a
intentar la conexión normal. La pantalla de cierre de `portalWifi()` es esta:

Archivo: firmware/detector/detector.ino (líneas 241-252)

```cpp
  // La clave del AP vive en secretos.h (fuera de git) y NO se imprime por el puerto serie.
  Serial.printf("Portal: conéctate a la red %s y abre http://%s\n", ap, ip.toString().c_str());
  uint32_t t0 = millis();
  while (millis() - t0 < PORTAL_MAX_MS) {
    dns.processNextRequest();
    web.handleClient();
    digitalWrite(PIN_LED, (millis() / 150) % 2);   // parpadeo rápido: modo configuración
    delay(2);
  }
  Serial.println("Portal sin usar, reiniciando...");
  ESP.restart();
}
```

La conexión normal se intenta en `conectarWiFi()`. Primero comprueba las dos condiciones que abren el
portal antes de tocar el WiFi; después configura la placa como estación, fija el nombre de host
`sismo-nodo-N`, desactiva el ahorro de energía y espera la conexión con un límite de 30 s.

Archivo: firmware/detector/detector.ino (líneas 285-303)

```cpp
void conectarWiFi() {
  cargarCredenciales();
  if (botonPideConfiguracion() || dobleReinicio()) portalWifi();
  WiFi.mode(WIFI_STA);
  { char h[16]; snprintf(h, sizeof h, "sismo-nodo-%d", NODO); WiFi.setHostname(h); }   // IP por DHCP
  WiFi.setSleep(false);   // sin ahorro de energía: menos latencia en UDP
  WiFi.setAutoReconnect(true);
  WiFi.begin(ssidWifi.c_str(), passWifi.c_str());
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED) {   // solo al arrancar: Raft todavía no corre
    digitalWrite(PIN_LED, !digitalRead(PIN_LED));
    delay(250);
    if (millis() - t0 > WIFI_LIMITE_MS) {
      Serial.println("No se pudo conectar al WiFi: abriendo el portal de configuración");
      portalWifi();
    }
  }
  Serial.printf("nodo-%d conectado a %s, IP %s\n", NODO, ssidWifi.c_str(), WiFi.localIP().toString().c_str());
}
```

`WiFi.setSleep(false)` es una decisión de latencia: el ahorro de energía del ESP32 puede añadir
retrasos de decenas de milisegundos a la recepción UDP, incompatibles con un latido de 500 ms.
`WiFi.setHostname()` fija el nombre que se publica por mDNS y que usa `cargar.sh N --wifi` para
encontrar la placa. La espera bloquea solo al arrancar, cuando Raft todavía no existe.

El botón al encender se comprueba con un bucle que parpadea el LED y solo devuelve verdadero si el
botón permanece presionado 3 s:

Archivo: firmware/detector/detector.ino (líneas 254-264)

```cpp
// ¿Botón presionado al encender durante PORTAL_BOTON_MS? Entonces se abre el portal.
bool botonPideConfiguracion() {
  if (digitalRead(PIN_BOTON) != LOW) return false;
  uint32_t t0 = millis();
  while (digitalRead(PIN_BOTON) == LOW) {
    digitalWrite(PIN_LED, (millis() / 100) % 2);
    if (millis() - t0 >= PORTAL_BOTON_MS) return true;
    delay(10);
  }
  return false;
}
```

El doble reinicio usa una marca en NVS. En cada arranque, si la marca `dr` ya está puesta significa
que el arranque anterior fue interrumpido por otro reinicio: se limpia y se abre el portal. Si no está
puesta, se pone, se espera la ventana de 3 s y se borra. Pulsar EN dos veces dentro de esa ventana
deja la marca puesta en el segundo arranque.

Archivo: firmware/detector/detector.ino (líneas 266-283)

```cpp
// Doble reinicio: se pulsa EN dos veces seguidas (la segunda dentro de DOBLE_REINICIO_MS del
// arranque). El arranque deja una marca en NVS; si al arrancar ya está puesta, el anterior fue
// cortado en seguida por otro reinicio. Se borra al pasar la ventana.
bool dobleReinicio() {
  Preferences p;
  p.begin("wifi", false);
  if (p.getBool("dr", false)) { p.putBool("dr", false); p.end(); return true; }
  p.putBool("dr", true);
  uint32_t t0 = millis();
  while (millis() - t0 < DOBLE_REINICIO_MS) {
    digitalWrite(PIN_LED, (millis() / 500) % 2);   // parpadeo lento: ventana abierta
    delay(20);
  }
  p.putBool("dr", false);
  p.end();
  digitalWrite(PIN_LED, LOW);
  return false;
}
```

Cuando la placa ya está operando, la reconexión no se hace con una espera bloqueante sino con una
vigilancia que escala en tres niveles. Cada 20 s pide `WiFi.reconnect()`; cada tercer intento hace una
reconexión completa con `WiFi.disconnect()` y `WiFi.begin()`; a los 3 minutos sin WiFi reinicia la
placa. El reinicio es seguro para Raft porque el término y el voto están en NVS.

Archivo: firmware/detector/detector.ino (líneas 308-333)

```cpp
void vigilarWiFi(uint64_t ahora) {
  if (WiFi.status() == WL_CONNECTED) {
    wifiCaidoDesde = 0;
    reintentosWifi = 0;
    proximoReintentoWifi = ahora + WIFI_REINTENTO_MS;
    return;
  }
  if (wifiCaidoDesde == 0) wifiCaidoDesde = ahora;
  if (ahora - wifiCaidoDesde > WIFI_REINICIO_MS) {
    Serial.println("Sin WiFi hace 3 min, reiniciando");
    delay(100);   // deja salir el mensaje; ya no hay red que atender
    ESP.restart();
  }
  if (ahora >= proximoReintentoWifi) {
    reintentosWifi++;
    if (reintentosWifi % 3 == 0) {
      Serial.println("WiFi caído, reconexión completa");
      WiFi.disconnect(false, false);
      WiFi.begin(ssidWifi.c_str(), passWifi.c_str());
    } else {
      Serial.println("WiFi caído, pidiendo reconexión");
      WiFi.reconnect();
    }
    proximoReintentoWifi = ahora + WIFI_REINTENTO_MS;
  }
}
```

La razón del escalado está en el comentario del código: cuando el router se apaga, la reconexión
interna del ESP32 a veces queda trabada. Pedirla de nuevo cada 20 s y forzar una reconexión completa
cada tres intentos cubre ese caso sin reiniciar la placa; el reinicio a los 3 minutos es el último
recurso.

## 6.9 UDP de Raft y descubrimiento de nodos

Hay dos sockets UDP con papeles distintos. El puerto 4210 transporta los mensajes de consenso; el
4211 transporta los anuncios de descubrimiento. `recibirUdp()` procesa como máximo
`MAX_PAQUETES_POR_LOOP` (8) datagramas por vuelta para no quedarse atrapado si llega una ráfaga.

Archivo: firmware/detector/detector.ino (líneas 337-349)

```cpp
void recibirUdp(uint64_t ahora) {
  for (int k = 0; k < MAX_PAQUETES_POR_LOOP; k++) {
    int len = udp.parsePacket();   // no bloquea: 0 si no hay nada
    if (len <= 0) return;
    int n = udp.read(paquete, sizeof paquete);
    if (n <= 0 || len > (int)sizeof paquete) continue;   // paquete truncado: se descarta
    nucleo::Msg m;
    if (nucleo::decodificar((const char*)paquete, (size_t)n, m)) {
      if (m.de >= 1 && m.de <= 3 && m.de != NODO) ipNodos[m.de - 1] = udp.remoteIP();
      raft->recibir(m, ahora);
    }
  }
}
```

Cada datagrama se decodifica con el códec del núcleo y, si es válido, se actualiza la tabla de
direcciones con la IP de origen. Esa actualización resuelve el caso de que el DHCP le asigne otra IP a
un nodo: el siguiente mensaje corrige la tabla. El número de emisor se valida contra el rango 1 a 3 y
contra el propio nodo antes de usarlo como índice, para no escribir fuera del arreglo.

El descubrimiento usa un texto corto, `SISMO-HOLA:N`, enviado por broadcast cada 2 s. Al recibirlo, el
nodo guarda la IP de origen en la tabla. No usa mDNS entre placas porque la resolución mDNS puede
tardar segundos y el clúster necesita la tabla completa cuanto antes.

Archivo: firmware/detector/detector.ino (líneas 351-369)

```cpp
// Cada HOLA_CADA_MS se anuncia por broadcast y se escuchan los anuncios de los demás.
// Si el DHCP le da otra IP a un nodo, los otros lo notan en el siguiente anuncio.
void descubrirNodos(uint64_t ahora) {
  if (WiFi.status() != WL_CONNECTED) return;
  int len;
  while ((len = udpDescubrir.parsePacket()) > 0) {
    char buf[16] = {0};
    int n = udpDescubrir.read(buf, sizeof buf - 1);
    int de = 0;
    if (n > 0 && sscanf(buf, "SISMO-HOLA:%d", &de) == 1 && de >= 1 && de <= 3 && de != NODO)
      ipNodos[de - 1] = udpDescubrir.remoteIP();
  }
  if (ahora >= proximoHola) {
    proximoHola = ahora + HOLA_CADA_MS;
    udpDescubrir.beginPacket(WiFi.broadcastIP(), PUERTO_DESCUBRIR);
    udpDescubrir.printf("SISMO-HOLA:%d", NODO);
    udpDescubrir.endPacket();
  }
}
```

El envío de salidas es la última pieza del canal UDP. El núcleo no envía nada por su cuenta: acumula
mensajes en una cola y `detector.ino` los vacía una vez por vuelta. Así el envío queda separado de la
lógica y se puede probar el núcleo sin red.

Archivo: firmware/detector/detector.ino (líneas 371-382)

```cpp
void enviarSalidas() {
  std::vector<nucleo::Salida> salidas = raft->sacarSalidas();
  if (WiFi.status() != WL_CONNECTED) return;   // Raft tolera la pérdida
  for (const nucleo::Salida& s : salidas) {
    if (s.a < 1 || s.a > 3 || s.a == NODO) continue;
    if (ipNodos[s.a - 1] == IPAddress((uint32_t)0)) continue;   // aún no se descubrió
    std::string datos = nucleo::codificar(s.msg);
    udp.beginPacket(ipNodos[s.a - 1], PUERTO_RAFT);
    udp.write((const uint8_t*)datos.data(), datos.size());
    udp.endPacket();
  }
}
```

Si el WiFi está caído, la cola se descarta: Raft tolera la pérdida y el siguiente latido o el
siguiente reintento reenvía lo necesario. Los destinos desconocidos (IP 0.0.0.0) también se saltan;
el descubrimiento los rellena en la siguiente vuelta.

## 6.10 Huella WiFi

La huella WiFi responde a una pregunta concreta: ¿movieron la placa de sitio? El nodo escanea las
redes vecinas, guarda una referencia de las más fuertes y compara los escaneos posteriores. No es
geolocalización ni medición de distancia: es una comparación de BSSID y potencia.

La referencia se persiste como un arreglo JSON de pares BSSID y RSSI en la NVS, espacio `ubic`, clave
`ref`. Al cargarla, el firmware valida la estructura y restaura la marca de movido si estaba guardada.

Archivo: firmware/detector/detector.ino (líneas 386-408)

```cpp
// Referencia guardada como [["aa:bb:..",-55],...]. Si falta o no sirve, queda sin referencia.
void cargarHuella() {
  prefsUbic.begin("ubic", false);
  // Una huella pedida antes de reiniciar sigue pendiente: /estado no muestra la referencia vieja.
  huellaPedida = prefsUbic.getBool("pide", false);
  if (huellaPedida) Serial.println("huella pedida antes de reiniciar: se toma en el próximo escaneo");
  String texto = prefsUbic.getString("ref", "");
  if (texto.length() == 0) return;
  JsonDocument doc;
  if (deserializeJson(doc, texto) || !doc.is<JsonArray>()) return;
  JsonArray lista = doc.as<JsonArray>();
  if (lista.size() == 0 || lista.size() > MAX_APS_HUELLA) return;
  std::vector<nucleo::Ap> ref;
  for (JsonVariant item : lista) {
    if (!item.is<JsonArray>() || item.size() != 2 || !item[0].is<const char*>() || !item[1].is<int>()) return;
    ref.push_back({item[0].as<const char*>(), item[1].as<int>()});
  }
  detectorMov.fijarReferencia(nucleo::mejoresAps(ref, MAX_APS_HUELLA));
  // Si ya se había movido antes de reiniciar, sigue movido y el suceso no se registra otra vez.
  detectorMov.restaurarMovido(prefsUbic.getBool("mov", false));
  movidoAvisado = detectorMov.movido();
  Serial.printf("huella de referencia cargada: %u AP%s\n", (unsigned)ref.size(), movidoAvisado ? " (movido)" : "");
}
```

El escaneo es asíncrono: se lanza y se consulta en cada vuelta. La función `puedeEscanear()` decide si
es buen momento; la condición más importante es no escanear siendo líder con entradas sin replicar,
porque el escaneo desvía la radio casi un segundo y podría retrasar la confirmación.

Archivo: firmware/detector/detector.ino (líneas 423-433)

```cpp
// Escanear desvía la radio casi 1 s: no se hace siendo líder con entradas sin replicar.
bool puedeEscanear(uint64_t ahora) {
  if (WiFi.status() != WL_CONNECTED) return false;
  if (raft->rol() == nucleo::Rol::Lider && raft->commitIndex() < raft->logLen()) return false;
  if (escaneosLanzados > 0 && ahora - inicioEscaneo < ESCANEO_MIN_MS) return false;
  if (huellaPedida && !raft->caido()) return true;   // la referencia pedida va en cuanto se pueda
  // Tras arrancar, dos escaneos seguidos (15 s y 30 s) para notar pronto si lo movieron apagado.
  if (escaneosLanzados == 0) return ahora >= ESCANEO_PRIMERO_MS;
  if (escaneosLanzados == 1) return ahora >= ESCANEO_SEGUNDO_MS;
  return ahora - inicioEscaneo >= ESCANEO_CADA_MS;
}
```

El calendario de escaneos tiene tres tramos: el primero a los 15 s del arranque, el segundo a los 30 s
y después uno cada 2 minutos, con un mínimo de 15 s entre dos. Los dos primeros van seguidos porque la
unión de ambos decide mejor que un escaneo suelto: un AP puede faltar en una muestra por un beacon
perdido. Si además hay una huella pedida por `POST /huella`, se toma en cuanto se pueda, aunque no
toque por calendario.

`vigilarHuella()` lanza el escaneo y controla el timeout. Un escaneo que no termina en 10 s se
descarta y se detiene explícitamente con `esp_wifi_scan_stop()`; si no, el driver sigue escaneando y
el siguiente intento falla.

Archivo: firmware/detector/detector.ino (líneas 467-492)

```cpp
void vigilarHuella(uint64_t ahora) {
  if (escaneando) {
    int n = WiFi.scanComplete();
    if (n == WIFI_SCAN_RUNNING) {
      if (ahora - inicioEscaneo < ESCANEO_LIMITE_MS) return;
      Serial.println("escaneo WiFi sin terminar, se descarta");
      esp_wifi_scan_stop();   // si no, el driver sigue escaneando y el próximo scanNetworks falla
      WiFi.scanDelete();
      escaneando = false;
      return;
    }
    escaneando = false;
    if (n < 0) {   // WIFI_SCAN_FAILED: se reintenta en el próximo turno permitido
      WiFi.scanDelete();
      return;
    }
    procesarEscaneo(n);
    return;
  }
  if (!puedeEscanear(ahora)) return;
  escaneosLanzados++;
  inicioEscaneo = ahora;   // también si falla al lanzarse: así no se insiste en cada vuelta
  WiFi.setScanActiveMinTime(ESCANEO_MIN_MS_POR_CANAL);   // así el mínimo no queda por encima del máximo
  int r = WiFi.scanNetworks(true, false, false, ESCANEO_MS_POR_CANAL);   // asíncrono y activo
  escaneando = r == WIFI_SCAN_RUNNING;
}
```

`WiFi.setScanActiveMinTime()` ajusta el mínimo por canal a 30 ms porque el core de ESP32 trae 100 ms,
un valor mayor que el máximo de 60 ms configurado; sin ese ajuste, el driver podría ignorar el máximo.
El peor caso del escaneo activo son unos 14 canales por 60 ms, alrededor de 0,85 s.

Cuando el escaneo termina, `procesarEscaneo()` decide entre dos caminos: si había una huella pedida,
fija la referencia nueva y la guarda; si no, compara contra la referencia existente y registra el
suceso "movido" una sola vez por transición.

Archivo: firmware/detector/detector.ino (líneas 435-465)

```cpp
// Con el escaneo terminado: fija la referencia pedida o compara contra la que hay.
void procesarEscaneo(int n) {
  std::vector<nucleo::Ap> vistas;
  for (int i = 0; i < n; i++) {
    String bssid = WiFi.BSSIDstr(i);
    bssid.toLowerCase();
    vistas.push_back({bssid.c_str(), (int)WiFi.RSSI(i)});
  }
  WiFi.scanDelete();
  if (vistas.empty()) return;   // sin AP no sirve de referencia ni cuenta como escaneo malo
  if (huellaPedida && !raft->caido()) {
    // La referencia son los más fuertes; la comparación usa todo lo visto (sin repetidos).
    std::vector<nucleo::Ap> mejores = nucleo::mejoresAps(vistas, MAX_APS_HUELLA);
    detectorMov.fijarReferencia(mejores);   // también limpia "movido"
    guardarHuella(mejores);
    prefsUbic.putBool("mov", false);
    prefsUbic.putBool("pide", false);
    huellaPedida = false;
    movidoAvisado = false;
    Serial.printf("huella de referencia nueva: %u AP\n", (unsigned)mejores.size());
    return;
  }
  // Parecido = proporción de la referencia que sigue visible: se compara contra el escaneo completo,
  // así unos AP nuevos más fuertes no desplazan a los de referencia.
  detectorMov.nuevoEscaneo(nucleo::mejoresAps(vistas, vistas.size()));
  if (detectorMov.movido() && !movidoAvisado) {
    raft->registrarSuceso("movido", "Servidor " + std::to_string(NODO) + " detectó que lo movieron");
    prefsUbic.putBool("mov", true);   // sobrevive a un reinicio
    movidoAvisado = true;
  }
}
```

La comparación es asimétrica a propósito: la referencia son los 8 AP más fuertes (`MAX_APS_HUELLA`),
pero la comparación usa todo lo visto. Así, unos AP nuevos más fuertes no desplazan a los de la
referencia y el parecido mide cuánta referencia sigue visible. La lógica de parecido y la regla de dos
fallos están en `nucleo::DetectorMovimiento` y se explican en el apartado 6.14. La marca `mov` queda
en NVS para que un reinicio no borre el aviso.

## 6.11 Botón, LED y generación del evento

El botón se lee sin `delay()` y con antirrebote por tiempo: el estado crudo se muestrea en cada
vuelta, se registra el instante del cambio y solo se acepta si el nuevo estado se mantuvo
`ANTIRREBOTE_MS` (20 ms). La duración se mide entre flancos, no con una espera bloqueante.

Archivo: firmware/detector/detector.ino (líneas 526-544)

```cpp
void leerBoton(uint64_t ahora) {
  bool crudo = digitalRead(PIN_BOTON) == LOW;
  if (crudo != crudoAnterior) {
    crudoAnterior = crudo;
    cambioCrudo = ahora;
  }
  if (ahora - cambioCrudo < ANTIRREBOTE_MS || crudo == pulsando) return;   // aún rebota o sin cambio
  if (crudo) {
    pulsando = true;
    tPulso = cambioCrudo;
    return;
  }
  pulsando = false;
  uint32_t ms = (uint32_t)(cambioCrudo - tPulso);
  if (ms < PULSO_MIN_MS) return;
  std::string id;
  int nivel;
  proponerPulso(ms, id, nivel);
}
```

El pin tiene pull-up interno, así que en reposo lee alto y al presionar lee bajo. Un pulso de menos de
80 ms se descarta porque suele ser ruido o un roce. Cuando el pulso es válido, se arma el evento y se
propone al núcleo. La generación del evento traduce duración a nivel y a PGA y construye el
identificador:

Archivo: firmware/detector/detector.ino (líneas 507-524)

```cpp
// Arma el evento de una pulsación de `ms` y lo propone. Deja el id en `id`.
Propuesta proponerPulso(uint32_t ms, std::string& id, int& nivel) {
  char buf[32];   // "nodo-N-xxxxxxxx-<contador>" (≤ 24 caracteres hasta 8 dígitos)
  snprintf(buf, sizeof buf, "nodo-%d-%08lx-%lu", NODO, (unsigned long)arranque, (unsigned long)++contador);
  nucleo::Evento ev;
  ev.id = buf;
  ev.nodo = NODO;
  ev.nivel = nucleo::Sismo::nivelPorTiempo(ms);
  ev.pga = 0.028f * ev.nivel + 0.015f;   // misma escala que el panel
  ev.duracion_ms = ms;
  ev.t = ahoraEpochMs();
  ev.recibido_por = NODO;
  id = ev.id;
  nivel = ev.nivel;
  Propuesta p = raft->proponer(ev, ahoraMs());
  Serial.printf("pulso %lu ms -> %s nivel %d: %s\n", (unsigned long)ms, id.c_str(), nivel, nombrePropuesta(p));
  return p;
}
```

El nivel se calcula con `min(10, 1 + ms/450)` y el PGA con `0.028 * nivel + 0.015`. Ambas fórmulas son
una escala de simulación: el firmware no mide aceleración. La hora del evento se toma con
`ahoraEpochMs()`; si NTP no sincronizó, vale 0 y el evento no podrá formar parte de una alerta. La
función `nombrePropuesta()` convierte el resultado del consenso en texto para el puerto serie y para
la respuesta HTTP.

Archivo: firmware/detector/detector.ino (líneas 496-505)

```cpp
const char* nombrePropuesta(Propuesta p) {
  switch (p) {
    case Propuesta::Aceptada: return "aceptada";
    case Propuesta::Pendiente: return "pendiente";
    case Propuesta::Caido: return "caido";
    case Propuesta::LogLleno: return "log_lleno";
    case Propuesta::ColaLlena: return "cola_llena";
    default: return "duplicada";
  }
}
```

El LED resume el estado del nodo en un solo indicador: apagado si el nodo está caído o sin WiFi, fijo
si conoce un líder, parpadeo a 1 Hz si no hay líder y parpadeo rápido mientras se pulsa. La función se
ejecuta al final de cada vuelta para que refleje el estado ya actualizado.

Archivo: firmware/detector/detector.ino (líneas 683-691)

```cpp
// Fijo = con líder; 1 Hz = sin líder; rápido = pulsando; apagado = caído o sin WiFi.
void actualizarLed(uint64_t ahora) {
  bool encendido;
  if (raft->caido() || WiFi.status() != WL_CONNECTED) encendido = false;
  else if (pulsando) encendido = (ahora / 80) % 2;
  else if (raft->lider() != 0) encendido = true;
  else encendido = (ahora / 500) % 2;
  digitalWrite(PIN_LED, encendido ? HIGH : LOW);
}
```

El LED se usa también en los modos de configuración: parpadeo lento durante la ventana de doble
reinicio y parpadeo rápido dentro del portal. Esos parpadeos los controlan `dobleReinicio()` y
`portalWifi()`, no `actualizarLed()`, porque el `loop()` no corre mientras el portal está abierto.

## 6.12 Endpoints HTTP

El servidor HTTP escucha en el puerto 80 y atiende una petición por vuelta del `loop()`. Todas las
respuestas llevan `Cache-Control: no-store`; las JSON añaden `Access-Control-Allow-Origin: *` para
que el panel del PC pueda consultarlas desde otro origen. La {{TABLA:T-FW-HTTP}} resume el
contrato.

[[TABLA:T-FW-HTTP|Endpoints HTTP del nodo, cuerpo esperado y códigos de respuesta.]]

| Método | Ruta | Qué hace | Respuesta y códigos |
|---|---|---|---|
| GET | `/` | Página de estado del nodo desde `pagina.h` | 200 HTML; se sirve desde flash con `send_P` |
| GET | `/estado` | Rol, término, log, líder, IP, RSSI, uptime, huella | 200 JSON; cabecera `X-Huella-Pedida` |
| GET | `/log?desde=N` | Entradas del log replicado desde N | 200 JSON; páginas de 50 entradas |
| GET | `/sucesos?desde=N` | Sucesos con `seq` mayor que N | 200 JSON; anillo de 50 sucesos |
| GET | `/alertas` | Alertas emitidas por la máquina sísmica | 200 JSON |
| POST | `/control` | Cuerpo JSON con `accion`: `caer` o `recuperar` | 200 JSON; 400 si el JSON o la acción no sirven |
| POST | `/pulsar` | Cuerpo JSON con `ms` entre 80 y 60000 | 200 JSON; 400, 409 o 507 según el caso |
| POST | `/huella` | Pide fijar una huella de referencia nueva | 202 JSON; 409 si el nodo está caído |
| OPTIONS | cualquiera | Preflight CORS del navegador | 204 sin cuerpo |
| cualquiera | ruta desconocida | `enOtro()` | 404 JSON con `{"error":"no existe"}` |

Las funciones auxiliares fijan las cabeceras comunes y serializan los errores. `responder()` añade
CORS y `responderError()` construye un JSON mínimo.

Archivo: firmware/detector/detector.ino (líneas 546-563)

```cpp
// ---------------------------------------------------------------- HTTP

// Todas las respuestas: sin caché. "Connection: close" ya lo agrega WebServer en cada envío.
void sinCache() { servidor.sendHeader("Cache-Control", "no-store"); }

void responder(int codigo, const std::string& json) {
  sinCache();
  servidor.sendHeader("Access-Control-Allow-Origin", "*");
  servidor.send(codigo, "application/json", json.c_str());
}

void responderError(int codigo, const char* texto) {
  JsonDocument doc;
  doc["error"] = texto;
  std::string s;
  serializeJson(doc, s);
  responder(codigo, s);
}
```

`GET /estado` es el endpoint que consulta el agregador. Arma un `InfoRed` con los datos que el núcleo
no conoce, decide si el nodo tiene huella o está marcado como movido y publica la cabecera
`X-Huella-Pedida` antes del cuerpo.

Archivo: firmware/detector/detector.ino (líneas 576-590)

```cpp
void enEstado() {
  nucleo::InfoRed info;
  info.ip = WiFi.localIP().toString().c_str();
  info.rssi = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;
  info.uptimeMs = ahoraMs();
  info.conHora = ahoraEpochMs() != 0;
  // Con una huella pedida y aún sin tomar, la vista muestra "Tomando huella WiFi…" (y el servidor
  // la vuelve a pedir si el nodo reinicia antes del escaneo).
  info.movido = detectorMov.movido() && !huellaPedida;
  info.conHuella = detectorMov.tieneReferencia() && !huellaPedida;
  // Solo lo usa la página de estado del propio nodo (GET /): distingue "tomando referencia…" de
  // "sin referencia". El panel web no lo lee.
  servidor.sendHeader("X-Huella-Pedida", huellaPedida ? "1" : "0");
  responder(200, nucleo::jsonEstado(*raft, NODO, info));
}
```

Los tres endpoints de lectura son una línea cada uno porque toda la serialización está en
`nucleo::api`: `enLog()` pasa el parámetro `desde`, `enSucesos()` también y `enAlertas()` no lleva
parámetros.

Archivo: firmware/detector/detector.ino (líneas 592-594)

```cpp
void enLog() { responder(200, nucleo::jsonLog(*raft, argDesde())); }
void enSucesos() { responder(200, nucleo::jsonSucesos(*raft, argDesde())); }
void enAlertas() { responder(200, nucleo::jsonAlertas(*raft)); }
```

`POST /control` simula una caída y una recuperación. `POST /pulsar` permite generar un evento desde el
panel sin tocar la placa. `POST /huella` pide una referencia nueva y deja la petición en NVS para que
sobreviva a un reinicio.

Archivo: firmware/detector/detector.ino (líneas 596-638)

```cpp
// POST /control {"accion":"caer"|"recuperar"} → {"ok":true,"caido":bool}
void enControl() {
  JsonDocument doc;
  if (!leerCuerpo(doc)) return responderError(400, "json invalido");
  const char* accion = doc["accion"] | "";
  if (strcmp(accion, "caer") == 0) {
    raft->caer(ahoraMs());
  } else if (strcmp(accion, "recuperar") == 0) {
    raft->recuperar(ahoraMs());
  } else {
    return responderError(400, "accion invalida");
  }
  JsonDocument r;
  r["ok"] = true;
  r["caido"] = raft->caido();
  std::string s;
  serializeJson(r, s);
  responder(200, s);
}

// POST /pulsar {"ms":N} → 200 {"ok":true,"id":"…","nivel":N,"resultado":"aceptada|pendiente|duplicada"}
// 409 si el nodo está caído, 507 si el log está lleno, 400 si ms no sirve.
void enPulsar() {
  JsonDocument doc;
  if (!leerCuerpo(doc)) return responderError(400, "json invalido");
  long ms = doc["ms"] | -1L;
  if (ms < (long)PULSO_MIN_MS || ms > (long)PULSO_MAX_MS) return responderError(400, "ms fuera de rango");
  if (raft->caido()) return responderError(409, "caido");
  std::string id;
  int nivel = 0;
  Propuesta p = proponerPulso((uint32_t)ms, id, nivel);
  if (p == Propuesta::Caido) return responderError(409, "caido");
  if (p == Propuesta::LogLleno) return responderError(507, "log lleno");
  if (p == Propuesta::ColaLlena) return responderError(507, "cola de reenvio llena");
  JsonDocument r;
  r["ok"] = true;
  r["id"] = id;
  r["nivel"] = nivel;
  r["resultado"] = nombrePropuesta(p);
  std::string s;
  serializeJson(r, s);
  responder(200, s);
}
```

El código 507 significa que el nodo recibió la orden pero no pudo aceptar el evento: el log llegó a su
tope de 1.000 entradas o la cola de reenvío llegó a 100. El 409 aparece cuando el nodo está caído de
forma simulada. La página de estado se sirve desde flash con `send_P`, sin copiarla al heap:

Archivo: firmware/detector/detector.ino (líneas 640-679)

```cpp
// POST /huella → 202 {"ok":true}: el próximo escaneo permitido fija la huella de referencia.
// 409 si el nodo está caído.
void enHuella() {
  if (raft->caido()) return responderError(409, "caido");
  huellaPedida = true;
  prefsUbic.putBool("pide", true);   // si reinicia antes del escaneo, sigue pedida
  responder(202, "{\"ok\":true}");
}

// GET / → página de estado del nodo (pagina.h).
void enRaiz() {
  sinCache();
  servidor.send_P(200, "text/html; charset=utf-8", PAGINA, sizeof(PAGINA) - 1);   // sin copiarla al heap
}

// Preflight CORS del navegador y rutas desconocidas.
void enOtro() {
  if (servidor.method() == HTTP_OPTIONS) {
    sinCache();
    servidor.sendHeader("Access-Control-Allow-Origin", "*");
    servidor.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    servidor.sendHeader("Access-Control-Allow-Headers", "Content-Type");
    servidor.send(204);
    return;
  }
  responderError(404, "no existe");
}

void iniciarHttp() {
  servidor.on("/", HTTP_GET, enRaiz);
  servidor.on("/estado", HTTP_GET, enEstado);
  servidor.on("/log", HTTP_GET, enLog);
  servidor.on("/sucesos", HTTP_GET, enSucesos);
  servidor.on("/alertas", HTTP_GET, enAlertas);
  servidor.on("/control", HTTP_POST, enControl);
  servidor.on("/pulsar", HTTP_POST, enPulsar);
  servidor.on("/huella", HTTP_POST, enHuella);
  servidor.onNotFound(enOtro);
  servidor.begin();
}
```

`iniciarHttp()` se llama desde `setup()` y registra las ocho rutas más el manejador de rutas
desconocidas. `enOtro()` cumple dos papeles: responde el preflight CORS con 204 y devuelve 404 JSON
para cualquier ruta que no exista. El `Access-Control-Allow-Origin: *` es necesario porque el panel
del PC consulta a los nodos desde otro origen; en una red de laboratorio cerrada ese permiso es
aceptable, pero no debe trasladarse a una red abierta sin revisarlo.

El nodo no implementa autenticación HTTP. Cualquiera en la misma red puede pulsar, simular una caída o
pedir una huella. La protección es de perímetro: la red WiFi del montaje y el hecho de que el puerto
80 solo está expuesto en la red local. Esa decisión hay que declararla al operar el sistema fuera del
laboratorio.

## 6.13 setup() y loop() línea por línea

`setup()` prepara la placa en un orden que no se puede alterar sin romper dependencias: primero la
consola y los pines, después la semilla aleatoria, después la persistencia y la huella, después el
WiFi y la hora, y solo al final el núcleo Raft, los sockets, HTTP y OTA.

Archivo: firmware/detector/detector.ino (líneas 704-737)

```cpp
void setup() {
  Serial.begin(115200);
  delay(200);
  pinMode(PIN_BOTON, INPUT_PULLUP);
  pinMode(PIN_LED, OUTPUT);
  arranque = esp_random();
  Serial.printf("\nDetector nodo-%d (Raft)\n", NODO);

  persistencia.abrir();
  cargarHuella();

  conectarWiFi();
  pedirHora();
  proximoNtp = ahoraMs() + NTP_CADA_MS;

  nucleo::ConfigRaft cfg;
  cfg.yo = NODO;
  cfg.semilla = esp_random();
  cfg.latidoMs = RAFT_LATIDO_MS;
  cfg.eleccionMinMs = RAFT_ELECCION_MIN_MS;
  cfg.eleccionMaxMs = RAFT_ELECCION_MAX_MS;
  raft = new nucleo::Raft(cfg, persistencia, ahoraEpochMs);
  Serial.printf("término guardado %lu, voto %d\n", (unsigned long)raft->termino(), raft->votadoPor());

  udp.begin(PUERTO_RAFT);
  udpDescubrir.begin(PUERTO_DESCUBRIR);
  iniciarHttp();

  char nombre[16];
  snprintf(nombre, sizeof nombre, "sismo-nodo-%d", NODO);
  ArduinoOTA.setHostname(nombre);
  ArduinoOTA.setPassword(OTA_CLAVE);
  ArduinoOTA.begin();
}
```

La línea por línea, con el motivo de cada posición:

- `Serial.begin(115200)` abre la consola y `delay(200)` da tiempo a que el puerto USB esté listo; sin
  esa pausa se pierden los primeros mensajes del arranque. La velocidad de 115200 es la que espera el
  comando de monitor del apartado 6.18.
- `pinMode(PIN_BOTON, INPUT_PULLUP)` activa la resistencia interna del GPIO4 y
  `pinMode(PIN_LED, OUTPUT)` deja el GPIO2 como salida. Se hace antes que cualquier otra cosa porque
  `botonPideConfiguracion()` y `dobleReinicio()`, que corren dentro de `conectarWiFi()`, ya leen el
  botón y escriben el LED.
- `arranque = esp_random()` genera la parte aleatoria del identificador de eventos. Debe hacerse antes
  de que se pueda proponer un evento.
- `persistencia.abrir()` abre el espacio `raft` de NVS y `cargarHuella()` abre el espacio `ubic`.
  Ambas van antes de crear el núcleo porque el constructor de `Raft` llama a `pers_.cargar()` y la
  huella no depende de la red.
- `conectarWiFi()` es bloqueante y puede terminar en el portal. Debe ir antes de pedir la hora: sin
  red no hay NTP. `pedirHora()` no bloquea y `proximoNtp` fija la siguiente petición a 10 minutos.
- `cfg` reúne la identidad y los tiempos. `cfg.semilla = esp_random()` da al núcleo un generador
  propio para sortear el plazo de elección; `cfg.latidoMs`, `cfg.eleccionMinMs` y `cfg.eleccionMaxMs`
  copian los valores de `config.h`. `cfg.yo = NODO` es la identidad del nodo.
- `raft = new nucleo::Raft(...)` crea el núcleo con la persistencia y el reloj de pared como
  dependencias. El `printf` siguiente confirma en el monitor que la NVS devolvió el término y el voto.
- `udp.begin(PUERTO_RAFT)` y `udpDescubrir.begin(PUERTO_DESCUBRIR)` abren los dos sockets. Van después
  de tener WiFi y núcleo, y antes de `iniciarHttp()`.
- `iniciarHttp()` registra las rutas y arranca el servidor. `ArduinoOTA.setHostname()`,
  `setPassword()` y `begin()` dejan OTA escuchando. OTA es lo último porque no depende de nada más y
  es opcional para el arranque.

El `loop()` es una secuencia fija de catorce llamadas, una de ellas condicional. No hay `while` ni
esperas: cada llamada revisa un tema y vuelve.

Archivo: firmware/detector/detector.ino (líneas 739-758)

```cpp
void loop() {
  uint64_t ahora = ahoraMs();
  vigilarWiFi(ahora);
  descubrirNodos(ahora);
  recibirUdp(ahora);
  raft->tick(ahora);
  leerBoton(ahora);
  servidor.handleClient();
  enviarSalidas();
  ArduinoOTA.handle();
  vigilarHuella(ahora);

  if (ahora >= proximoNtp) {
    pedirHora();
    proximoNtp = ahora + NTP_CADA_MS;
  }
  imprimirSucesos();
  actualizarLed(ahora);
  delay(1);   // cede la CPU a las tareas de WiFi
}
```

El orden tiene razones concretas:

1. `ahora = ahoraMs()` se toma una vez por vuelta y se pasa a todas las funciones. Todas comparan
   contra el mismo instante, así que la vuelta es coherente aunque tarde unos milisegundos.
2. `vigilarWiFi(ahora)` va primero porque si la red está caída no tiene sentido procesar mensajes:
   las funciones siguientes comprueban el estado del WiFi y no hacen nada mientras no haya enlace.
3. `descubrirNodos(ahora)` se adelanta a `recibirUdp(ahora)` para que la tabla de direcciones esté
   actualizada antes de procesar mensajes. Si un nodo cambió de IP, el anuncio de esta vuelta corrige
   la tabla antes de que el núcleo responda.
4. `recibirUdp(ahora)` entrega los mensajes al núcleo; `raft->tick(ahora)` avanza después los
   temporizadores. Así, un voto o un append recibido en esta vuelta ya cuenta para la decisión de
   elección o de latido que se toma inmediatamente después.
5. `leerBoton(ahora)` va después de `tick()` porque, cuando el evento se propone, el núcleo ya tiene
   actualizado su rol y su líder conocido. Si el nodo es seguidor, el evento se encola y se reenvía al
   líder correcto; si acaba de ganar la elección, se agrega directamente al log.
6. `servidor.handleClient()` atiende una sola petición HTTP por vuelta. Se coloca después de la
   entrada local para que una pulsación se proponga antes de que el servidor se quede atendiendo una
   conexión lenta.
7. `enviarSalidas()` vacía la cola de mensajes que generaron la recepción, el tick y la propuesta. Al
   estar después de `handleClient()`, el envío se hace una vez y no se mezcla con la atención HTTP.
8. `ArduinoOTA.handle()` va al final de la parte de red porque puede escribir flash y bloquear. Si una
   actualización OTA tarda, solo se retrasa la vigilancia de la huella, el NTP, el LED y el serie.
9. `vigilarHuella(ahora)` lanza o recoge el escaneo asíncrono. Va después de OTA para que un escaneo
   en curso no compita con la escritura de flash.
10. El bloque de NTP solo se ejecuta cada 10 minutos. `pedirHora()` no bloquea, así que la vuelta
    sigue.
11. `imprimirSucesos()` va penúltimo: muestra el estado final de la vuelta por el puerto serie.
12. `actualizarLed(ahora)` se ejecuta al final para que el LED refleje el estado ya procesado.
13. `delay(1)` cede la CPU a las tareas de WiFi y del sistema operativo. Sin esa cesión, el bucle
    activo puede dejar sin tiempo a la pila de red.

El bucle no es de tiempo real. `handleClient()` atiende un cliente por vez, OTA escribe flash,
`Preferences` bloquea al guardar y el escaneo WiFi ocupa la radio. Con la elección entre 5 y 9 s hay
margen para esas pausas, pero un cliente HTTP lento o una OTA en curso pueden provocar una elección
espuria: los demás nodos dejan de recibir latidos dentro del plazo y uno se postula. El sistema se
recupera solo, pero el suceso queda registrado en `/sucesos` y conviene tenerlo en cuenta al leer la
evidencia de una prueba.

## 6.14 Núcleo compartido: raft, mensajes, sismo, api y huella

El núcleo es la parte del firmware que se compila y se prueba en el PC. No incluye `Arduino.h` y
recibe el reloj y la persistencia como dependencias. La {{TABLA:T-FW-CORE}} resume los archivos
y sus piezas principales.

[[TABLA:T-FW-CORE|Módulos del núcleo portable, longitud y piezas principales.]]

| Archivo | Líneas | Responsabilidad | Piezas clave |
|---|---:|---|---|
| `tipos.h` | 66 | Tipos compartidos sin Arduino | `Rol`, `Evento`, `Entrada`, `Clase`, `Msg`, `Suceso` |
| `raft.h` | 168 | Interfaz del consenso | `Persistencia`, `ConfigRaft`, `Propuesta`, `Salida`, clase `Raft` |
| `raft.cpp` | 501 | Elección, replicación, confirmación y caída | `tick`, `recibir`, `proponer`, `avanzarCommit`, `caer`, `recuperar` |
| `mensajes.h` y `mensajes.cpp` | 13 + 127 | Códec JSON de los mensajes | `codificar`, `decodificar`, `evAJson`, `evDeJson` |
| `sismo.h` y `sismo.cpp` | 38 + 82 | Máquina sísmica determinista | `aplicar`, `nivelPorTiempo`, `nivelAlerta`, `Alerta` |
| `api.h` y `api.cpp` | 34 + 123 | Contrato HTTP en JSON | `situacion`, `jsonEstado`, `jsonLog`, `jsonSucesos`, `jsonAlertas` |
| `huella.h` y `huella.cpp` | 41 + 64 | Huella WiFi y detección de movimiento | `mejoresAps`, `parecido`, `DetectorMovimiento` |

`raft.h` y `raft.cpp`. `raft.h` define el contrato. `Persistencia` es la interfaz que `detector.ino` implementa con NVS y
que las pruebas implementan con memoria. `ConfigRaft` agrupa la identidad, la semilla, los tiempos y
los topes. `Propuesta` enumera los seis resultados posibles de proponer un evento.

Archivo: firmware/detector/src/nucleo/raft.h (líneas 31-50)

```cpp
struct ConfigRaft {
  int yo = 0;
  uint32_t semilla = 0;
  uint32_t latidoMs = 300, eleccionMinMs = 1500, eleccionMaxMs = 3000;
  size_t topeLog = 1000;
  size_t maxPorAppend = 8;
  uint32_t reintentoForwardMs = 500;
  // Tope de la cola de eventos reenviados al líder (seguidor sin confirmación). Acota el uso de
  // memoria y el tráfico de forward durante un no-quórum prolongado.
  size_t topePendientes = 100;
};

// Resultado de proponer un evento:
//  Aceptada  = el líder lo agregó a su log (falta confirmarlo).
//  Pendiente = quedó en la cola de reenvío al líder (o sin líder conocido).
//  Caido     = el nodo está caído; no se guarda nada.
//  LogLleno  = el log llegó al tope; se rechaza sin sobrescribir.
//  ColaLlena = la cola de reenvío al líder llegó a su tope (topePendientes).
//  Duplicada = ese id ya está en el log (o ya en la cola de reenvío).
enum class Propuesta { Aceptada, Pendiente, Caido, LogLleno, ColaLlena, Duplicada };
```

Los valores por defecto de `ConfigRaft` (latido de 300 ms, elección de 1.500 a 3.000 ms) son los que
usan las pruebas del PC. En la placa, `setup()` los sobrescribe con los de `config.h`: 500 ms y 5.000
a 9.000 ms. `topeLog` es 1.000 entradas, `maxPorAppend` es 8 entradas por lote, `reintentoForwardMs`
es 500 ms y `topePendientes` es 100 eventos en la cola de reenvío.

La función `tick()` es el reloj del consenso. Si el nodo está caído, no hace nada. Si es líder y le
toca, envía latidos; si no es líder y venció su plazo de elección, se postula. Además, un seguidor
reenvía su cola de pendientes al líder cuando toca.

Archivo: firmware/detector/src/nucleo/raft.cpp (líneas 20-32)

```cpp
void Raft::tick(uint64_t ahoraMs) {
  if (caido_) return;
  if (!temporizadorListo_) reiniciarTemporizador(ahoraMs);
  if (rol_ != Rol::Lider && !pendientes_.empty() && ahoraMs >= proximoForward_) reenviarPendientes(ahoraMs);
  if (rol_ == Rol::Lider) {
    if (ahoraMs >= proximoLatido_) {
      enviarLatidos();
      proximoLatido_ = ahoraMs + cfg_.latidoMs;
    }
    return;
  }
  if (ahoraMs >= plazoEleccion_) postularse(ahoraMs);
}
```

La elección sigue el algoritmo de Raft con dos detalles propios. El primero es que el plazo se sortea
de forma uniforme entre `eleccionMinMs` y `eleccionMaxMs` con el generador sembrado en `setup()`, para
que dos nodos no se postulen a la vez. El segundo es que el voto se guarda antes de responder, no
después. `postularse()` incrementa el término, se vota a sí mismo, persiste, se marca candidato y pide
el voto a los otros dos. `ganar()` se ejecuta al llegar a mayoría (2 de 3), agrega una entrada de
inicio de término que no representa un sismo y reenvía los eventos que el nodo tenía en cola.

La replicación usa `Append` con el índice y el término de la entrada anterior, el commit del líder y
hasta 8 entradas nuevas. El seguidor comprueba la coincidencia y, si falla, responde con una pista
para que el líder retroceda de una vez. El líder mantiene un tope de cuatro lotes sin respuesta por
seguidor para que el tráfico no se multiplique:

Archivo: firmware/detector/src/nucleo/raft.cpp (líneas 341-346)

```cpp
void Raft::rellenar(int peer) {
  if (!respondio_[peer]) return;  // primero hay que saber dónde está su log
  // Tope duro de lotes sin respuesta: cada respuesta libera a lo sumo un lugar, así que el
  // tráfico no se multiplica aunque el seguidor conteste fallos en cadena.
  while (nextIdx_[peer] <= ultimoIndice() && enVuelo_[peer] < kLotesEnVuelo) enviarAppend(peer);
}
```

La confirmación se calcula solo sobre entradas del término actual, recorriendo el log hacia atrás
desde el último índice. Cuando un índice tiene mayoría, se fija `commitIndex_` y se aplican las
entradas pendientes a la máquina sísmica en orden. Las entradas de términos anteriores se confirman
por arrastre, no por cálculo directo.

Archivo: firmware/detector/src/nucleo/raft.cpp (líneas 393-414)

```cpp
// Avanza commitIndex_ al mayor N del término actual que tenga una mayoría (sección 5.4.2).
void Raft::avanzarCommit() {
  for (uint32_t n = ultimoIndice(); n > commitIndex_; n--) {
    if (terminoEn(n) != termino_) break;  // lo de términos viejos se confirma solo de arrastre
    int votos = 0;
    for (int p = kPrimerNodo; p <= kUltimoNodo; p++)
      if (p == cfg_.yo || matchIdx_[p] >= n) votos++;
    if (votos >= mayoria()) {
      commitIndex_ = n;
      aplicarConfirmadas();
      return;
    }
  }
}

void Raft::aplicarConfirmadas() {
  while (ultimoAplicado_ < commitIndex_ && ultimoAplicado_ < ultimoIndice()) {
    const Entrada& e = log_[ultimoAplicado_++];
    sismo_.aplicar(e);
    if (e.clase == Clase::Evento) quitarPendiente(e.ev.id);
  }
}
```

El reenvío completa el ciclo para un seguidor. `proponer()` devuelve `Duplicada` si el identificador ya
está en el log confirmado o en la cola, `LogLleno` si el log llegó al tope, `ColaLlena` si la cola
llegó a 100 y `Pendiente` si se encoló. Si conoce al líder, envía `Forward` de inmediato. El líder
responde `ForwardAck` cuando el evento ya está en su log, y el seguidor lo saca de la cola.

La caída simulada es una bandera. `caer()` marca `caido_`, pasa a seguidor, limpia el líder conocido y
vacía la cola de salida; mientras esté caído, `tick()` y `recibir()` no hacen nada y `proponer()`
devuelve `Caido`. `recuperar()` limpia la bandera, vuelve a seguidor y reinicia el temporizador de
elección.

Archivo: firmware/detector/src/nucleo/raft.cpp (líneas 465-484)

```cpp
void Raft::caer(uint64_t) {
  if (caido_) return;
  caido_ = true;
  pasarASeguidor();
  lider_ = 0;
  commitLider_ = 0;
  salidas_.clear();
  temporizadorListo_ = false;
  suceso("cayo", servidor() + " simuló una caída");
}

void Raft::recuperar(uint64_t ahoraMs) {
  if (!caido_) return;
  caido_ = false;
  pasarASeguidor();
  lider_ = 0;
  commitLider_ = 0;
  reiniciarTemporizador(ahoraMs);
  suceso("recupero", servidor() + " se recuperó");
}
```

Dos detalles de robustez están documentados en el propio código. El primero es la resincronización:
como el log vive en RAM, si se reinician en frío el líder y otro nodo, la mayoría puede olvidar lo
confirmado y elegir un líder con un log más nuevo. En ese caso el nodo que choca con lo confirmado
borra su log y se copia de cero del líder (`resincronizar()`), porque insistir lo dejaría divergente
para siempre. El segundo es la deduplicación por identificador en los dos lados del reenvío, de modo
que un reintento no crea una entrada repetida.

`mensajes.h` y `mensajes.cpp`. El códec convierte los seis tipos de mensaje (`VoteReq`, `VoteResp`, `Append`, `AppendResp`, `Forward`
y `ForwardAck`) a JSON con claves de una o dos letras. Las claves cortas no son un capricho: el
datagrama UDP tiene un máximo práctico y un `Append` con 8 entradas debe caber en un paquete.

Archivo: firmware/detector/src/nucleo/mensajes.cpp (líneas 1-12)

```cpp
#include "mensajes.h"
#include <ArduinoJson.h>

// Las horas (t, t_lider) son ms epoch de 64 bits: no deben truncarse en el ESP32.
static_assert(ARDUINOJSON_USE_LONG_LONG == 1, "ArduinoJson debe guardar enteros de 64 bits");

namespace nucleo {

// Claves: k tipo, d de, T término, li/lt último idx/term, g concedido,
// pi/pt prev idx/term, c commit, e entradas, o ok, m match, v evento, i id.
// Evento: i id, n nodo, l nivel, g pga, u duración, t hora, L hora líder, r recibido_por.
// Entrada: x índice, T término, c clase, l líder, v evento.
```

El `static_assert` es una protección real: si ArduinoJson se compila sin enteros de 64 bits, las horas
`t` y `t_lider` se truncarían y la máquina sísmica compararía instantes equivocados. La compilación
falla antes de que eso llegue a la placa.

El codificador escribe el tipo, el emisor y el término en todas las variantes y añade los campos
propios de cada una:

Archivo: firmware/detector/src/nucleo/mensajes.cpp (líneas 36-78)

```cpp
std::string codificar(const Msg& m) {
  JsonDocument doc;
  doc["k"] = (int)m.tipo;
  doc["d"] = m.de;
  doc["T"] = m.termino;
  switch (m.tipo) {
    case Tipo::VoteReq:
      doc["li"] = m.last_idx;
      doc["lt"] = m.last_term;
      break;
    case Tipo::VoteResp:
      doc["g"] = m.concedido;
      break;
    case Tipo::Append: {
      doc["pi"] = m.prev_idx;
      doc["pt"] = m.prev_term;
      doc["c"] = m.commit;
      JsonArray arr = doc["e"].to<JsonArray>();
      for (const Entrada& en : m.entradas) {
        JsonObject o = arr.add<JsonObject>();
        o["x"] = en.indice;
        o["T"] = en.termino;
        o["c"] = (int)en.clase;
        o["l"] = en.lider;
        evAJson(o["v"].to<JsonObject>(), en.ev);
      }
      break;
    }
    case Tipo::AppendResp:
      doc["o"] = m.ok;
      doc["m"] = m.match_idx;
      break;
    case Tipo::Forward:
      evAJson(doc["v"].to<JsonObject>(), m.ev);
      break;
    case Tipo::ForwardAck:
      doc["i"] = m.id;
      break;
  }
  std::string s;
  serializeJson(doc, s);
  return s;
}
```

El decodificador hace lo inverso y valida antes de construir: si el JSON es inválido, si no es un
objeto o si falta el tipo, devuelve `false`. El tipo se comprueba contra el rango de la enumeración,
de modo que un datagrama de otra aplicación se descarta sin tocar el estado del nodo.

Archivo: firmware/detector/src/nucleo/mensajes.cpp (líneas 80-89)

```cpp
bool decodificar(const char* datos, size_t len, Msg& out) {
  JsonDocument doc;
  if (deserializeJson(doc, datos, len)) return false;
  if (!doc.is<JsonObject>() || doc["k"].isNull()) return false;
  int k = doc["k"] | -1;
  if (k < 0 || k > (int)Tipo::ForwardAck) return false;
  Msg m;
  m.tipo = (Tipo)k;
  m.de = doc["d"] | 0;
  m.termino = doc["T"] | 0u;
```

El bloque termina en la línea 89; a continuación viene el `switch` que lee los campos de cada tipo
con valores por defecto. El patrón `doc["campo"] | valor` de ArduinoJson devuelve el valor por defecto
cuando el campo falta o no tiene el tipo esperado.

`sismo.h` y `sismo.cpp`. La máquina sísmica es determinista: recibe solo entradas confirmadas, en orden de índice, y aplica la
misma regla en los tres nodos. Si dos nodos aplican el mismo log, emiten la misma alerta. La regla es
que dos detectores distintos coincidan en una ventana de 10 segundos.

Archivo: firmware/detector/src/nucleo/sismo.cpp (líneas 6-19)

```cpp
int Sismo::nivelPorTiempo(uint32_t ms) {
  uint32_t n = 1 + ms / 450;
  return n > 10 ? 10 : (int)n;
}

const char* Sismo::nivelAlerta(float promedio) {
  if (promedio >= 7.5f) return "alta";
  if (promedio >= 4.5f) return "media";
  return "baja";
}

uint64_t Sismo::horaDe(const Evento& ev) {
  return ev.t != 0 ? ev.t : (ev.t_lider != 0 ? ev.t_lider : 0);
}
```

`nivelPorTiempo()` convierte la duración en un nivel de 1 a 10: un segundo de pulsación da nivel 3,
cinco segundos dan nivel 10. `nivelAlerta()` clasifica el promedio del grupo: alta desde 7,5, media
desde 4,5 y baja por debajo. `horaDe()` prefiere la hora del nodo que detectó el evento y, si falta,
usa la del líder al aceptarlo; si ambas faltan, devuelve 0 y el evento no puede entrar en una alerta.

`aplicar()` recibe la entrada, guarda el evento en una cola de 100 y busca para cada uno de los otros
dos detectores el evento libre más cercano dentro de la ventana. La parte central es esta:

Archivo: firmware/detector/src/nucleo/sismo.cpp (líneas 41-68)

```cpp
  // grupo: posiciones en eventos_/regs_, el evento disparador primero
  std::vector<size_t> grupo{pos};
  for (int d = 1; d <= 3; d++) {
    if (d == e.ev.nodo) continue;
    bool hay = false;
    size_t mejor = 0;
    uint64_t mejorDist = 0;
    for (size_t i = 0; i < pos; i++) {
      const Evento& c = eventos_[i];
      if (c.nodo != d || !regs_[i].libre) continue;
      uint64_t h = horaDe(c);
      if (h == 0) continue;
      uint64_t dd = dist(h, hE);
      if (dd > kVentana) continue;
      if (!hay || dd < mejorDist || (dd == mejorDist && regs_[i].indice < regs_[mejor].indice)) {
        hay = true; mejor = i; mejorDist = dd;
      }
    }
    if (hay) grupo.push_back(mejor);
  }
  if (grupo.size() < 2) return;

  uint64_t inicio = hE;
  for (size_t i : grupo) inicio = std::min(inicio, horaDe(eventos_[i]));
  grupo.erase(std::remove_if(grupo.begin(), grupo.end(),
                [&](size_t i) { return horaDe(eventos_[i]) > inicio + kVentana; }),
              grupo.end());
  if (grupo.size() < 2) return;
```

Solo los eventos libres (no consumidos por una alerta anterior) pueden entrar en un grupo. El grupo se
recorta al intervalo de 10 segundos desde el evento más temprano; si después del recorte quedan dos o
más, se emite la alerta con el promedio de niveles y se marcan los eventos usados como no
reutilizables. Un evento de un solo detector no produce alerta: se necesita coincidencia entre dos
detectores distintos. El tope de 100 eventos y la ventana de 10 segundos son `kTope` y `kVentana` en
`sismo.h`.

`api.h` y `api.cpp`. `api.cpp` convierte el estado del núcleo en JSON. La función `situacion()` traduce rol, líder y
confirmación a una de las tres palabras que usa el panel: `funcionando`, `sincronizando` o `caido`.

Archivo: firmware/detector/src/nucleo/api.cpp (líneas 27-32)

```cpp
const char* situacion(const Raft& r) {
  if (r.caido()) return "caido";
  if (r.lider() == 0 || r.rol() == Rol::Candidato) return "sincronizando";
  if (r.rol() == Rol::Lider) return r.commitIndex() < r.logLen() ? "sincronizando" : "funcionando";
  return r.commitIndex() < r.commitLider() ? "sincronizando" : "funcionando";
}
```

La regla distingue el caso del líder y el del seguidor. Un líder está `sincronizando` mientras tenga
entradas sin confirmar; un seguidor lo está mientras su commit esté por detrás del commit que anuncia
el líder. Sin líder conocido, o siendo candidato, también está `sincronizando`. En cualquier otro
caso, `funcionando`.

`jsonEstado()` arma el objeto que consume el agregador. Los campos son los que lee `web/poller.js`:

Archivo: firmware/detector/src/nucleo/api.cpp (líneas 34-55)

```cpp
std::string jsonEstado(const Raft& r, int nodo, const InfoRed& red) {
  JsonDocument doc;
  doc["nodo"] = nodo;
  doc["rol"] = nombreRol(r.rol());
  doc["caido"] = r.caido();
  doc["termino"] = r.termino();
  doc["votado_por"] = r.votadoPor();
  doc["lider_conocido"] = r.lider();
  doc["log_len"] = r.logLen();
  doc["commit_index"] = r.commitIndex();
  doc["pendientes"] = (uint32_t)r.pendientes();
  doc["log_lleno"] = r.logLleno();
  doc["sucesos_seq"] = r.sucesosSeq();
  doc["con_hora"] = red.conHora;
  doc["ip"] = red.ip;
  doc["rssi"] = red.rssi;
  doc["uptime_ms"] = red.uptimeMs;
  doc["movido"] = red.movido;
  doc["con_huella"] = red.conHuella;
  doc["situacion"] = situacion(r);
  return texto(doc);
}
```

Son 18 campos. El agregador los usa para la fotografía del clúster, para decidir si un nodo está
alcanzable y para el indicador de situación. `jsonLog()` pagina de 50 en 50 (`kPaginaLog`), empieza en
el índice 1 y marca cada entrada como `evento` o `inicio_termino`; en los eventos incluye el detalle y
la marca `en_alerta`. `jsonSucesos()` devuelve solo los sucesos con `seq` mayor que `desde`.
`jsonAlertas()` devuelve las alertas con su promedio redondeado a tres decimales, el nivel y la lista
de identificadores. `tresDecimales()` existe para que `0.183f` salga como `0.183` y no como
`0.18299999`.

`huella.h` y `huella.cpp`. El módulo de huella tiene dos funciones puras y una clase con estado. `mejoresAps()` ordena por RSSI
descendente, desempata por BSSID y se queda con los más fuertes sin repetir BSSID. `parecido()` mide
qué proporción de la referencia sigue visible con una tolerancia de RSSI.

Archivo: firmware/detector/src/nucleo/huella.cpp (líneas 23-35)

```cpp
float parecido(const std::vector<Ap>& ref, const std::vector<Ap>& actual, int tolDb) {
  if (ref.empty()) return 1.0f;
  size_t iguales = 0;
  for (const Ap& r : ref) {
    for (const Ap& a : actual) {
      if (a.bssid == r.bssid) {
        if (std::abs(a.rssi - r.rssi) <= tolDb) iguales++;
        break;
      }
    }
  }
  return (float)iguales / (float)ref.size();
}
```

La tolerancia por defecto es de 12 dB. Un AP cuenta como "sigue ahí" si aparece con un RSSI que no
difiera más de 12 dB del de la referencia; un AP que desaparece o que baja mucho deja de contar. El
resultado es la fracción de la referencia que sigue visible.

`DetectorMovimiento` convierte ese número en una decisión. La regla es de dos evaluaciones seguidas
con parecido menor que 0,5, y cada evaluación compara la referencia contra la unión de los dos últimos
escaneos, para que un escaneo suelto que pierde beacons no marque la placa como movida.

Archivo: firmware/detector/src/nucleo/huella.cpp (líneas 49-62)

```cpp
void DetectorMovimiento::nuevoEscaneo(const std::vector<Ap>& actual) {
  if (ref_.empty()) return;  // sin referencia no hay nada que comparar
  // Unión por BSSID de este escaneo y el anterior, con el RSSI más fuerte de cada uno.
  std::vector<Ap> juntos = anterior_;
  juntos.insert(juntos.end(), actual.begin(), actual.end());
  const size_t total = juntos.size();
  juntos = mejoresAps(std::move(juntos), total);
  anterior_ = actual;
  if (parecido(ref_, juntos) < 0.5f) {
    if (++malosSeguidos_ >= 2) movido_ = true;
  } else {
    malosSeguidos_ = 0;
  }
}
```

`fijarReferencia()` guarda la referencia y limpia el contador y el historial. `restaurarMovido()`
vuelve a marcar la placa como movida después de un reinicio, pero solo si hay referencia guardada.
`nuevoEscaneo()` no hace nada sin referencia: no se puede detectar movimiento contra la nada.

## 6.15 pagina.h y portal.h

`pagina.h` es la página que sirve `GET /`. Es HTML, CSS y JavaScript autocontenidos: no carga fuentes,
no usa CDN y no consulta nada externo. Funciona sin Internet, solo con la red local. El número de
nodo se inserta en tiempo de compilación con una macro de dos niveles, porque el preprocesador no
expande `NODO` dentro de una cadena literal sin ese rodeo.

Archivo: firmware/detector/pagina.h (líneas 5-11)

```cpp
#define PAGINA_TXT2(x) #x
#define PAGINA_TXT(x) PAGINA_TXT2(x)

static const char PAGINA[] = R"HTML(<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Detector )HTML" PAGINA_TXT(NODO) R"HTML(</title>
```

`PAGINA_TXT2` convierte el número en texto y `PAGINA_TXT` fuerza una expansión intermedia; sin el
segundo nivel, `PAGINA_TXT(NODO)` produciría la cadena `"NODO"` en lugar de `"1"`. La página se
actualiza sola cada 3 segundos con `fetch('/estado')`, un `AbortController` de 2,5 s y un indicador que
se pone en gris si no hay respuesta.

Archivo: firmware/detector/pagina.h (líneas 75-90)

```cpp
let ocupado=false;
async function leer(){
  if(ocupado)return;
  ocupado=true;
  const c=new AbortController(),t=setTimeout(()=>c.abort(),2500);
  try{
    const r=await fetch('/estado',{cache:'no-store',signal:c.signal});
    if(!r.ok)throw new Error(r.status);
    pintar(await r.json());
    $('aviso').hidden=true;$('m').classList.remove('viejo');
    $('pie').textContent='Actualizado '+new Date().toLocaleTimeString();
  }catch(_){
    $('aviso').hidden=false;$('m').classList.add('viejo');
  }finally{clearTimeout(t);ocupado=false}
}
leer();setInterval(leer,3000);
```

La página muestra siete filas: rol, término, log, líder, encendido, señal WiFi y hora. El log se
presenta como `log_len / commit_index` confirmadas y el encendido como tiempo relativo ("hace 2 min").
El indicador de situación usa las mismas tres palabras que `nucleo::situacion()`.

`portal.h` guarda la cabecera y el pie que usa el portal cautivo. La cabecera incluye el CSS completo,
con tema claro y oscuro según `prefers-color-scheme`; el pie cierra el documento.

Archivo: firmware/detector/portal.h (líneas 5-8)

```cpp
static const char PORTAL_CABECERA[] = R"HTML(<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Configurar WiFi</title>
```

Archivo: firmware/detector/portal.h (líneas 31-33)

```cpp
static const char PORTAL_PIE[] = R"HTML(
</main></body></html>
)HTML";
```

La separación en dos constantes deja que `portalWifi()` arme la página en partes: cabecera, título,
lista de redes, formulario y pie. El formulario es accesible desde un móvil sin zoom porque usa
`viewport` y tipografía del sistema, y el CSS de la cabecera ya está probado en pantalla pequeña.

## 6.16 Compilación y flasheo con cargar.sh y arduino-cli

El script `cargar.sh` es la única vía documentada para compilar y cargar. Su cabecera define los tres
modos de uso:

Archivo: firmware/cargar.sh (líneas 1-8)

```bash
#!/usr/bin/env bash
# Compila y carga el firmware en un detector.
# Uso: ./cargar.sh                     por USB, detecta qué detector es por su MAC (placas.conf)
#      ./cargar.sh <1|2|3> [puerto]     por USB; la primera vez registra la placa como ese detector
#      ./cargar.sh <1|2|3> --wifi       por red (ArduinoOTA); la IP se busca como sismo-nodo-N.local
#                                       o se da con IP=x.x.x.x ./cargar.sh N --wifi
#      --forzar                         carga aunque la placa esté registrada como otro detector
set -euo pipefail
```

La compilación usa `arduino-cli` con el FQBN `esp32:esp32:esp32` y pasa el número de nodo como
propiedad del compilador. El directorio de build es distinto para cada detector, así que los
artefactos de uno no pisan a los del otro.

Archivo: firmware/cargar.sh (líneas 76-80)

```bash
BUILD="$DIR/build/nodo-$NODO"
echo "== Compilando detector $NODO (nodo-$NODO)"
arduino-cli compile --fqbn "$FQBN" \
  --build-property "compiler.cpp.extra_flags=-DNODO=$NODO" \
  --build-path "$BUILD" "$DIR/detector"
```

La carga por USB usa `arduino-cli upload` y, si la placa no estaba registrada, la registra con
`quien.sh --registrar` para que la próxima vez se la reconozca por la MAC. La carga por WiFi usa
`espota.py` y pasa la clave OTA extraída de `secretos.h`.

Archivo: firmware/cargar.sh (líneas 82-96)

```bash
if [[ $WIFI -eq 1 ]]; then
  echo "== Cargando por WiFi en $PUERTO (sismo-nodo-$NODO)"
  # espota directo a la IP resuelta (sismo-nodo-N.local por mDNS, o IP=x.x.x.x). La placa se conecta de vuelta al PC
  # por TCP en el puerto 32323, que el firewall debe permitir desde la red de las placas:
  #   sudo ufw allow from <tu subred>/24 to any port 32323 proto tcp
  ESPOTA="$(ls "$HOME"/.arduino15/packages/esp32/hardware/esp32/*/tools/espota.py 2>/dev/null | sort -V | tail -1)"
  [[ -n "$ESPOTA" ]] || { echo "No encuentro espota.py (soporte ESP32 de arduino-cli)." >&2; exit 1; }
  if ! timeout 120 python3 -I "$ESPOTA" -i "$PUERTO" -p 3232 -P 32323 -a "$OTA_CLAVE" -f "$BUILD/detector.ino.bin"; then
    echo "La carga por WiFi falló. Revisa que el puerto 32323 esté abierto en el firewall:" >&2
    echo "  sudo ufw allow from <tu subred>/24 to any port 32323 proto tcp" >&2
    exit 1
  fi
  echo "== Listo. nodo-$NODO se reinicia con el firmware nuevo."
  exit 0
fi
```

Archivo: firmware/cargar.sh (líneas 98-105)

```bash
echo "== Cargando en $PUERTO"
arduino-cli upload --fqbn "$FQBN" -p "$PUERTO" --input-dir "$BUILD" "$DIR/detector"

if [[ -z "${REGISTRADO:-}" ]]; then
  "$DIR/quien.sh" --registrar "$NODO" -p "$PUERTO" | sed 's/^/   /'
fi
echo "== Listo: detector $NODO (SIS-D$NODO) cargado."
echo "   Para ver el detector: arduino-cli monitor -p $PUERTO -c baudrate=115200"
```

`quien.sh` resuelve el problema de identificar placas iguales. Los tres ESP32 usan el mismo chip
USB-serial CP2102 y el PC no las distingue por el número de serie; la MAC de fábrica sí es única.
El script la lee con `esptool read-mac` y la busca en `firmware/placas.conf`.

Archivo: firmware/quien.sh (líneas 41-49)

```bash
leer_mac() {   # $1 = puerto → imprime la MAC en minúsculas
  local p="$1" salida
  if [[ ! -r "$p" || ! -w "$p" ]]; then
    echo "Sin permiso sobre $p. Corre: sudo setfacl -m u:$USER:rw $p" >&2; return 1
  fi
  salida="$(timeout 20 "$ESPTOOL" --port "$p" read-mac 2>&1)" || {
    echo "No pude leer la placa en $p. Si sigue fallando, mantén presionado BOOT al conectarla." >&2; return 1; }
  grep -oiE '([0-9a-f]{2}:){5}[0-9a-f]{2}' <<<"$salida" | head -1 | tr 'A-F' 'a-f'
}
```

Archivo: firmware/quien.sh (líneas 56-66)

```bash
identificar() {   # $1 = puerto
  local mac n
  mac="$(leer_mac "$1")" || return 1
  n="$(nodo_de_mac "$mac")"
  if [[ -n "$n" ]]; then
    echo "Detector $n (SIS-D$n) conectado en $1 · MAC $mac"
  else
    echo "Placa sin registrar en $1 · MAC $mac"
    echo "Regístrala con: ./quien.sh --registrar N   (N = 1, 2 o 3)"
  fi
}
```

`quien.sh` tiene cuatro modos: identificar la placa conectada, registrar una placa como detector N,
vigilar las conexiones y avisar por notificación de escritorio, e imprimir solo el número de nodo para
que lo consuma otro script. El modo `--nodo` devuelve el código 2 cuando la placa no está registrada;
`cargar.sh` usa ese código para distinguir "sin registrar" de un error real de lectura.

El registro vive en `placas.conf`, con una línea por placa. Es un archivo de cuatro líneas: un
comentario y tres pares MAC y número.

Archivo: firmware/placas.conf (líneas 1-4)

```text
# MAC del ESP32 → número de detector. Lo escribe ./quien.sh --registrar N
58:2a:bd:d3:d3:10 1
68:09:47:86:c1:38 2
68:09:47:47:36:90 3
```

La compilación deja artefactos en `firmware/build/nodo-N/`. La {{TABLA:T-FW-ART}} describe los
principales, con el tamaño real de `nodo-1` y el uso de cada uno.

[[TABLA:T-FW-ART|Artefactos de compilación de firmware/build/nodo-1, tamaño real y uso.]]

| Artefacto | Bytes | Uso |
|---|---:|---|
| `build.options.json` | 614 | Opciones con las que se compiló: FQBN, `-Os`, `-DNODO=1` y ruta del sketch |
| `flash_args` | 167 | Modo, frecuencia y tamaño de flash, más las cuatro direcciones de escritura |
| `detector.ino.bootloader.bin` | 24.992 | Gestor de arranque; va en `0x1000` |
| `detector.ino.partitions.bin` | 3.072 | Tabla de particiones; va en `0x8000` |
| `boot_app0.bin` | 8.192 | Selector de partición OTA; va en `0xe000` |
| `detector.ino.bin` | 1.105.728 | Aplicación compilada; va en `0x10000` |
| `detector.ino.merged.bin` | 4.194.304 | Imagen completa de 4 MB para grabar la flash entera |
| `detector.ino.elf` | 16.222.552 | Binario con símbolos, para analizar una traza |
| `detector.ino.map` | 15.036.905 | Mapa de memoria del enlazador, para revisar el tamaño por sección |

`build.options.json` es la prueba de qué se compiló. Se citan los tres campos que definen la
variante; las rutas de las carpetas de hardware y bibliotecas quedan fuera porque son largas y
dependen del PC.

Archivo: firmware/build/nodo-1/build.options.json (líneas 3-5)

```json
  "compiler.optimization_flags": "-Os",
  "customBuildProperties": "compiler.cpp.extra_flags=-DNODO=1",
  "fqbn": "esp32:esp32:esp32",
```

`flash_args` fija las direcciones del grabado. Se reproduce textual porque es el contrato entre
`arduino-cli` y el chip:

Archivo: firmware/build/nodo-1/flash_args (líneas 1-5)

```text
--flash-mode dio --flash-freq 80m --flash-size 4MB
0x1000 detector.ino.bootloader.bin
0x8000 detector.ino.partitions.bin
0xe000 boot_app0.bin
0x10000 detector.ino.bin
```

La tabla de particiones reserva dos ranuras de aplicación de `0x140000` bytes (1.310.720) cada una,
una para el firmware en ejecución y otra para la actualización OTA. La aplicación de `nodo-1` ocupa
1.105.728 bytes, el 84,4 % de una ranura, así que cabe. Las particiones se pueden leer completas en
`firmware/build/nodo-1/partitions.csv`.

El tamaño y el contenido de los binarios cambian entre nodos porque `-DNODO` altera el código
compilado. Los tres `detector.ino.bin` tienen sumas distintas:

Salida de `md5sum` sobre los tres binarios, una línea por nodo:

```text
49cb215044132c8a73f24186a3b6ec53  firmware/build/nodo-1/detector.ino.bin
b8e94b118c3a61102227da65eee97be8  firmware/build/nodo-2/detector.ino.bin
df44d1bb49d07bc00bec6320b2835685  firmware/build/nodo-3/detector.ino.bin
```

## 6.17 OTA

La actualización por WiFi usa ArduinoOTA. El servicio se configura en `setup()` y se atiende en cada
vuelta del `loop()`:

Archivo: firmware/detector/detector.ino (líneas 732-736)

```cpp
  char nombre[16];
  snprintf(nombre, sizeof nombre, "sismo-nodo-%d", NODO);
  ArduinoOTA.setHostname(nombre);
  ArduinoOTA.setPassword(OTA_CLAVE);
  ArduinoOTA.begin();
```

Archivo: firmware/detector/detector.ino (línea 748)

```cpp
  ArduinoOTA.handle();
```

El nombre de host es `sismo-nodo-N` y la contraseña es `OTA_CLAVE`, la misma que `cargar.sh` extrae de
`secretos.h`. El protocolo usa el puerto 3232 en la placa y el 32323 en el PC: `espota.py` escucha en
el PC y la placa se conecta de vuelta. Por eso el firewall del PC debe permitir el 32323/TCP desde la
subred de las placas. La llamada de `cargar.sh` lo deja explícito con `sudo ufw allow from <tu
subred>/24 to any port 32323 proto tcp` en el mensaje de error.

Hay dos formas de encontrar la placa para la carga por WiFi. La primera es mDNS: `cargar.sh` resuelve
`sismo-nodo-N.local` con `getent hosts`. La segunda es pasar la IP a mano con `IP=x.x.x.x ./cargar.sh
N --wifi`, que es lo que sugiere el script cuando mDNS no responde.

Archivo: firmware/cargar.sh (líneas 38-43)

```bash
if [[ $WIFI -eq 1 ]]; then
  PUERTO="${IP:-$(getent hosts "sismo-nodo-$NODO.local" | awk '{print $1; exit}')}"
  if [[ -z "$PUERTO" ]]; then
    echo "No encuentro sismo-nodo-$NODO.local. Mira su IP en el monitor serie y usa: IP=x.x.x.x $0 $NODO --wifi" >&2
    exit 1
  fi
```

La carga tiene un tiempo límite de 120 segundos. Si falla, los motivos habituales son la resolución
mDNS, el firewall del PC o una placa que no está en la misma red. OTA escribe flash durante la
actualización y puede retener el `loop()` varios segundos; por eso va al final de la vuelta y por eso
una actualización en curso puede provocar una elección espuria, como se explicó en el apartado 6.13.

> **Seguridad.** OTA no cifra el binario ni verifica su firma: la protección es la contraseña del
> servicio. Tratar la red del montaje como red de confianza y rotar `OTA_CLAVE` si se comparte el
> entorno con terceros.

## 6.18 Lectura del monitor serie

La consola serie es la herramienta de diagnóstico principal. El firmware abre el puerto a 115200 baudios
y deja mensajes de texto en cada hito: arranque, conexión, portal, elección, pulsos, huella y
reconexión. El comando de lectura lo imprime `cargar.sh` al terminar:

Archivo: firmware/cargar.sh (línea 105)

```bash
echo "   Para ver el detector: arduino-cli monitor -p $PUERTO -c baudrate=115200"
```

Con el puerto sustituido, el comando queda así:

```bash
arduino-cli monitor -p /dev/ttyUSB0 -c baudrate=115200
```

El puerto puede ser `/dev/ttyUSB*` o `/dev/ttyACM*` según la placa y el chip USB. En Linux, el usuario
necesita permiso sobre el dispositivo; si aparece "Sin permiso", el propio `quien.sh` recuerda el
comando `sudo setfacl -m u:$USER:rw /dev/ttyUSB0`.

Al encender, la secuencia esperada es esta: el mensaje `Detector nodo-N (Raft)`, la carga de la huella
de referencia si existe, la conexión al WiFi con la IP, el término y el voto guardados en NVS y, unos
segundos después, los sucesos de elección con el formato `[T<term>] <texto>`. Durante la operación
aparecen los pulsos con su identificador, nivel y resultado, los cambios de huella y los avisos de
WiFi caído. Los mensajes que imprime el firmware están en `detector.ino` y en las funciones descritas en este
capítulo; no hay un formato de log aparte.

La lectura del LED complementa al serie: fijo significa que el nodo conoce un líder, parpadeo a 1 Hz
que no lo conoce, parpadeo rápido que se está pulsando, y apagado que el nodo está caído o sin WiFi.
Si el serie no responde pero el LED parpadea, el firmware corre y el problema es el puerto o el
monitor. Si no hay mensajes y el LED está apagado, revisar la alimentación y el cable USB.

> **Aviso.** Los mensajes del monitor incluyen el nombre de la red y la IP, pero nunca la contraseña
> WiFi ni la clave del portal. Si se captura el puerto serie para una evidencia, ese texto es
> publicable sin rotar claves.
