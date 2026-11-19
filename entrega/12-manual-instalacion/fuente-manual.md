# Resumen

VYBRA es un prototipo académico de detección sísmica simulada. Lo componen tres nodos ESP32 con un consenso Raft propio sobre WiFi, un agregador en Node.js que sondea el estado y sirve dos interfaces, tres servidores de datos con PostgreSQL para el histórico y un controlador que enciende y apaga servicios desde el panel. Los eventos se generan con un pulsador: la duración del pulso se traduce en un nivel de intensidad de 1 a 10 y en un PGA de simulación declarada. No hay acelerómetro ni medición del terreno.

El sistema demuestra consenso distribuido, replicación y tolerancia a fallos. Un evento originado en una placa se propone al log de Raft, se confirma cuando dos de los tres nodos lo almacenan y se aplica con una regla determinista que alerta cuando dos detectores distintos registran eventos en diez segundos. La validación del 2026-11-18 sobre el commit `0ee5ed4` obtuvo 78 de 78 casos C++ aprobados y 5 de 5 pruebas de integración Docker en 79,2 s.

La campaña física sigue en curso: P0 se completó y T1 no se aprobó porque una pulsación produjo dos eventos de 301 ms y 174 ms separados 3,2 s en lugar de uno de unos 900 ms; el clúster replicó ambos sin generar alerta, como corresponde con un solo detector. Este manual describe el montaje, el firmware, la instalación, la operación y las evidencias del prototipo.

[[TABLA:T-FICHA|Ficha del documento: proyecto, versión, commit, fecha, licencia, autores y alcance.]]
| Campo | Valor |
|---|---|
| Proyecto | VYBRA, clúster de detección sísmica sobre ESP32 con consenso Raft y evento simulado con pulsador |
| Versión documentada | `v1.0.0-rc1` |
| Commit | `0ee5ed4` |
| Fecha de la validación | 2026-11-18 |
| Licencia | MIT |
| Autores | Jose Camilo Pérez Daza, Sebastián Fernando Revelo Meneses, Tomas Alejandro Santiago Reyes |
| Alcance | Manual de instalación y ejecución del prototipo: montaje físico, firmware, software, operación y evidencias de la validación |

[[TABLA:T-RUBRICA|Correspondencia entre los criterios de evaluación y las secciones que los responden.]]
| Criterio de evaluación | Dónde se responde |
|---|---|
| Criterio 4. Diagrama de arquitectura | Sección 4, Diagrama de arquitectura y mecanismos de comunicación: vista de contexto, componentes, comunicación, puertos, despliegue, flujo de un evento y límites del diagrama |
| Criterio 5. Evidencias de pruebas | Sección 5, Evidencias de pruebas: suites funcionales, integración y concurrencia, rendimiento, tolerancia a fallos, campaña física y matriz requisito a evidencia |
| Instalación y ejecución | Secciones 6 y 7, Firmware de las ESP32 e Instalación y ejecución del software: compilación y flasheo, requisitos, arranque con Docker, paneles y pruebas de humo |

# 1. Introducción y alcance

Este manual describe cómo montar los tres detectores de VYBRA, compilar y cargar su firmware, instalar el software del agregador y operar el sistema hasta obtener un clúster de tres nodos con el panel funcionando. Se escribió para que otra persona pueda repetir la instalación sin consultar a los autores y para que cada afirmación de funcionamiento se pueda comprobar con un comando, un archivo o una evidencia. Complementa al documento técnico del proyecto con el procedimiento detallado y con las verificaciones de la validación del 2026-11-18 sobre el commit `0ee5ed4`.

## 1.1 Propósito del manual

El propósito es entregar un procedimiento completo y reproducible. Cada capítulo cubre una etapa del montaje o de la operación, indica qué debe existir antes de empezar, muestra los comandos con su salida esperada y define el criterio para dar un paso por terminado. Los valores de pines, puertos, tiempos y versiones provienen del código y de los registros del repositorio; cuando un dato no se pudo verificar, se indica en lugar de completarlo por suposición.

El manual es autónomo. No supone que el lector haya leído el documento final ni los manuales anteriores, y no repite la justificación teórica del diseño. Su material propio es el montaje físico, el desglose del firmware, la instalación con Docker, la operación del panel y la reproducción de las pruebas. El alcance termina en un prototipo de laboratorio que funciona en una red local; la instalación se verificó en Linux CachyOS x86_64 con tres ESP32 DevKit V1, Docker Engine y un navegador actualizado, y otros sistemas operativos no se probaron.

## 1.2 A quién sirve

El manual sirve a cuatro perfiles, que pueden leer el documento completo aunque tengan un recorrido principal.

- **Montaje físico.** Arma las tres protoboards, conecta el pulsador y verifica el cableado en la sección 3.
- **Firmware.** Compila y flashea las ESP32, ajusta la red y revisa el monitor serie en las secciones 3 y 6.
- **Software.** Prepara el equipo, configura `.env`, arranca el stack y ejecuta las pruebas en las secciones 2, 7 y 8.
- **Evaluación y operación.** Revisa los criterios 4 y 5 en las secciones 4 y 5, y atiende el sistema con las secciones 6 a 8.

Se espera que el lector sepa usar una terminal en Linux, instalar paquetes y ejecutar comandos con `sudo`. También ayuda conocer Docker a nivel de contenedores y volúmenes, y leer C++ y JavaScript sin necesidad de escribirlos. Los conceptos de consenso, quórum y replicación se explican en la sección 4.

## 1.3 Qué se puede y qué no se puede esperar

Después de completar el manual se puede esperar un clúster de tres nodos que elige un líder, replica un log de eventos y aplica una regla de alerta determinista. También se puede esperar el panel de administración en el puerto 8095, la vista pública, el histórico en tres bases PostgreSQL y la reproducción de las suites de la sección 5. En el terreno físico, una pulsación genera un evento en la placa, llega al agregador y el panel lo muestra con su intensidad y su hora.

No se puede esperar detección sísmica real. La entrada del sistema es un pulsador conectado a GPIO4; no hay acelerómetro, geófono ni instrumento de medición del terreno. La duración del pulso se convierte en un nivel de intensidad de 1 a 10 y en un valor de PGA mediante una escala de simulación declarada, que no corresponde a una escala sismológica oficial. El sistema tampoco emite alertas tempranas a población ni sustituye a una red de monitoreo.

> El evento sísmico es simulado y esta condición se repite en el firmware, en las interfaces y en cada capítulo del manual. Lo que se demuestra es el procesamiento distribuido: propuesta, replicación, confirmación por mayoría, aplicación determinista y alerta.

La campaña física está incompleta y el manual no la presenta como terminada. P0 se completó; T1 no se aprobó porque una pulsación produjo dos eventos de 301 ms y 174 ms separados 3,2 s, en lugar del evento único de unos 900 ms esperado, y de T2 en adelante no hay resultados. El clúster replicó y confirmó los eventos de T1 sin generar alerta, que es el comportamiento correcto con un solo detector. Esos resultados se documentan en la sección 5 y no se corrigen ni se omiten.

## 1.4 Cómo leer el manual

Para una instalación desde cero conviene seguir el orden numérico. La sección 2 reúne requisitos, materiales y herramientas. La sección 3 monta los detectores. La sección 6 compila y carga el firmware. La sección 7 instala y arranca el software. La sección 8 verifica el conjunto y resuelve los problemas más frecuentes. La sección 9 concentra comandos, pinout, glosario, inventario de evidencias y enlaces.

Para una evaluación por criterios se puede ir directo a la sección 4, con el diagrama de arquitectura y los mecanismos de comunicación, y a la sección 5, con las evidencias de pruebas; esa correspondencia se resume en la {{TABLA:T-RUBRICA}}. Cada apartado empieza con lo que cubre y con lo que el lector debe tener listo, y los pasos numerados traen su criterio de hecho. Las tablas y figuras se referencian por su número, y los fragmentos de código se citan con la ruta y el rango de líneas del repositorio.

> Los avisos con este formato advierten de un riesgo para el hardware, de una condición que invalida una prueba o de una limitación del prototipo. Conviene leerlos antes del paso que los precede.

## 1.5 Convenciones

Las rutas se escriben relativas a la raíz del repositorio y con barras inclinadas, por ejemplo `firmware/detector/detector.ino`. Los comandos se presentan en bloques `bash` y se ejecutan desde esa raíz, salvo que el bloque indique otro directorio; en los ejemplos no se incluye el símbolo del sistema y las líneas que empiezan con `#` son comentarios que no se copian. Las salidas de terminal se copian de ejecuciones reales y, cuando se abrevia un listado, la omisión se marca con `... (continúa)`.

La palabra `NODO` representa el nombre de la placa del paso: `SIS-D1`, `SIS-D2` o `SIS-D3`. La palabra `IP_PLACA` representa la dirección que la placa obtiene por DHCP; los ejemplos usan direcciones del rango de documentación y deben sustituirse por las reales. Los puertos se citan con su protocolo, por ejemplo `UDP 4210` o `TCP 32323`, y su inventario está en las secciones 2.3 y 4.4. Las citas de código usan el formato `Archivo: ruta (líneas N-M)`.

[[TABLA:T-INT-CONV|Convenciones de escritura que se usan en todo el manual.]]
| Convención | Uso en este manual |
|---|---|
| Rutas | relativas a la raíz del repositorio, con barras inclinadas; las absolutas solo cuando un comando las exige |
| Comandos | bloques `bash` ejecutados desde la raíz; `#` inicia comentario y no se copia |
| `NODO` | nombre de la placa del paso: `SIS-D1`, `SIS-D2` o `SIS-D3` |
| `IP_PLACA` | dirección de la placa obtenida por DHCP; los ejemplos usan rangos de documentación |
| Puertos | siempre con protocolo, por ejemplo `UDP 4210` o `TCP 32323`; inventario en 2.3 y 4.4 |
| Citas de código | formato `Archivo: ruta (líneas N-M)`; fragmento textual y omisiones con `... (continúa)` |
| Figuras y tablas | se referencian por "Figura N" y "Tabla N"; las tablas de identificación conservan su ID en la redacción |

Un ejemplo de esas convenciones aparece a continuación. La primera línea sitúa el directorio de trabajo y la segunda define el nombre del nodo que usarían los comandos siguientes.

```bash
NODO=SIS-D1
curl -s "http://192.0.2.10/api/estado"   # IP de ejemplo, sustituir por la real
```

En el texto, "detector" es la placa con su pulsador y su firmware, "nodo" es esa placa como miembro del clúster, "agregador" es el proceso Node.js que sirve las interfaces y "panel" es la interfaz de administración.

# 2. Requisitos, materiales y herramientas

Este capítulo reúne lo que debe existir antes de instalar VYBRA: el equipo que ejecuta el agregador, el software con el que se compila y se opera, la red que permite el consenso, los puertos que se abren, el material físico de los tres detectores y una lista de comprobación con tiempos de referencia. Los valores marcados como verificados se comprobaron en Linux CachyOS x86_64 el 2026-11-18 sobre el commit `0ee5ed4`. Los comandos que necesitan hardware se remiten a la sección que los ejecuta; no se presentan como ejecutados aquí.

> El evento sísmico es simulado: la entrada es un pulsador conectado a GPIO4. El sistema demuestra consenso distribuido, replicación y agregación de eventos; no mide aceleración ni sustituye instrumentación sismológica.

## 2.1 Equipo host

El sistema completo se instala en un PC con Linux x86_64 que hace de agregador. Ese PC ejecuta el panel, los servidores de datos, las bases PostgreSQL y, en la demo sin hardware, los tres nodos simulados. El mismo PC se usa para compilar y flashear el firmware de las placas. La {{TABLA:T-REQ-HOST}} resume los requisitos del equipo y lo comprobado en la validación.

[[TABLA:T-REQ-HOST|Equipo host: requisitos y valores comprobados en la validación.]]
| Aspecto | Requisito | Comprobado en la validación |
|---|---|---|
| Arquitectura | x86_64 | Linux 7.3.3-1-cachyos x86_64 |
| Memoria | 6 GB libres recomendados para la primera construcción | el stack en marcha consumió ≈ 0,5 GB de RAM (INF-09); la recomendación de 6 GB procede del documento técnico |
| Disco | 10 GB libres recomendados por este manual | imágenes Docker ≈ 2,2 GB, snapshot del código 8,6 MiB y crecimiento de PostgreSQL de hasta 0,6 GB por año y servidor |
| Puertos USB | un puerto libre; las placas se cargan de una en una | tres ESP32 DevKit V1 con USB-serial CP2102 |
| Red del PC | misma red que las placas, con Ethernet o WiFi | PC y placas en la misma LAN en la validación |
| Administración | usuario con `sudo` para instalar Docker, abrir el firewall y gestionar permisos serie | el usuario del equipo de validación no está en el grupo `dialout` |
| Navegador | Chromium o Firefox actualizados | no se registró la versión del navegador |
| Audio | altavoces o auriculares para la alarma del panel | el navegador bloquea el sonido hasta la primera interacción |

El procedimiento se verificó únicamente en Linux. En macOS o Windows cambian los permisos del puerto serie, el firewall y algunas rutas; esos pasos no están cubiertos por este manual.

## 2.2 Software del equipo host

La {{TABLA:T-REQ-SW}} reúne las herramientas, la versión mínima y la versión que se usó en la validación. Las versiones de la columna "verificada" salen de ejecutar cada herramienta en el equipo de trabajo, no de la documentación de los fabricantes. Docker se usa siempre con la interfaz v2 del plugin (`docker compose`), no con el antiguo binario `docker-compose`.

[[TABLA:T-REQ-SW|Software necesario en el equipo host, con la versión mínima y la verificada el 2026-11-18.]]
| # | Herramienta | Mínimo | Verificada | Uso |
|---|---|---|---|---|
| 1 | Linux x86_64 | distribución actual con kernel reciente | CachyOS, kernel 7.3.3-1 | sistema del agregador, pruebas y compilación |
| 2 | `g++` | soporte de C++17 | GCC 16.2.1 | suite C++ y compilación del nodo simulado nativo |
| 3 | GNU Make | 4.x | 4.4.1 | suite C++ |
| 4 | Node.js | 22 | v26.13.0 | panel, servidores de datos y pruebas JavaScript |
| 5 | `npm` | incluido con Node.js | 12.2.2 | instalar `pg` y ejecutar los guiones del proyecto |
| 6 | `arduino-cli` | 1.x | 1.5.1 | compilar y flashear el firmware |
| 7 | core `esp32:esp32` | 3.3.12 | 3.3.12 | compilación del firmware |
| 8 | ArduinoJson | 7.x | 7.4.3 | firmware, nodo simulado y pruebas C++ |
| 9 | Docker Engine | con el plugin `docker compose` | 29.9.3 | demo de 11 servicios, `test:db` y `test:infra` |
| 10 | plugin `docker compose` | interfaz v2 o posterior | Docker Compose 5.7.0 | ciclo de vida del stack |
| 11 | `pg` (paquete npm) | 8.23.1 | 8.23.1 | cliente PostgreSQL del servidor de datos |
| 12 | `curl` | cualquiera reciente | incluido en el sistema | comprobaciones HTTP |
| 13 | `python3` | 3.x | 3.14.9 | revisar JSON con `json.tool` y ejecutar `espota.py` en la carga OTA |

También se usan `git` (2.56.0 en la validación) para clonar el repositorio, `openssl` (4.1.0) para generar los secretos de producción y, de forma opcional, `tcpdump` para observar el descubrimiento UDP y `getent` para resolver los nombres mDNS de las placas.

Docker es necesario para la demo de 11 servicios y para las pruebas `test:db` y `test:infra`; si solo se ejecuta el panel con Node.js (sección 7.9), no hace falta. `arduino-cli` y el core solo se usan para compilar y flashear el firmware (sección 6).

Instalación de las herramientas que no vienen con la distribución:

```bash
# g++, make, curl, git y openssl: usa el gestor de paquetes de tu distribución.
# Node.js 22 o superior: paquete de la distribución o instalador oficial de Node.js.
# Docker Engine y el plugin compose: guía oficial de Docker para tu distribución.
arduino-cli core update-index
arduino-cli core install esp32:esp32@3.3.12
arduino-cli lib install ArduinoJson@7.4.3
```

Comprobación de versiones en el equipo de validación:

```bash
node -v                        # v26.13.0
g++ --version | head -1        # g++ (GCC) 16.2.1 20260810
make --version | head -1       # GNU Make 4.4.1
arduino-cli version            # arduino-cli Version: 1.5.1
arduino-cli core list          # esp32:esp32   3.3.12
docker --version               # Docker version 29.9.3
docker compose version         # Docker Compose version 5.7.0
```

El firmware y la suite C++ buscan ArduinoJson en `$HOME/Arduino/libraries/ArduinoJson/src`. Si la biblioteca está en otra ruta, pásala con `JSON_DIR=/ruta/a/ArduinoJson/src` en los comandos de compilación.

## 2.3 Red, puertos y firewall

La red es un requisito de funcionamiento, no un detalle de instalación. Las tres placas se descubren por broadcast, se hablan por UDP y su reloj depende de NTP. Si falta alguno de estos elementos, el clúster puede formarse y aun así no emitir alertas. La {{TABLA:T-REQ-RED}} resume las condiciones de la red.

[[TABLA:T-REQ-RED|Requisitos de red para el descubrimiento, el consenso y la hora.]]
| Requisito | Valor | Por qué |
|---|---|---|
| Banda | WiFi 2,4 GHz | el ESP32 del prototipo se conecta en 2,4 GHz |
| Direccionamiento | DHCP | no hay IP fija en el firmware; conviene reservar la IP de cada placa en el router |
| Broadcast | permitido en la LAN | descubrimiento `SISMO-HOLA:N` por UDP 4211 cada 2000 ms |
| Aislamiento de clientes | desactivado (sin AP isolation) | con aislamiento las placas no se ven y no hay líder |
| Subred | una sola para PC y placas | el agregador consulta la API HTTP de cada nodo |
| Internet | recomendable | NTP en UTC-5 cada 10 minutos; sin hora (`con_hora:false`) no se forman alertas |
| mDNS | opcional | nombre `sismo-nodo-N.local` por comodidad en el PC; dentro de un contenedor suele hacer falta la IP |

La {{TABLA:T-REQ-PUERTOS}} ordena los puertos del sistema por componente y distingue los que se publican en el host de los que solo viven en la red interna de Compose.

[[TABLA:T-REQ-PUERTOS|Puertos y canales del sistema, con su ámbito y si se publican en el host.]]
| Componente | Puerto y protocolo | Ámbito | Publicado en el host | Para qué |
|---|---|---|---|---|
| ESP32 (cada placa) | TCP 80 | LAN | no | API `/estado`, `/log`, `/sucesos`, `/alertas`, `/control`, `/pulsar` |
| ESP32, consenso Raft | UDP 4210 | LAN | no | votos, `Append`, `Forward` entre nodos |
| ESP32, descubrimiento | UDP 4211 | broadcast de la LAN | no | anuncio `SISMO-HOLA:N` cada 2000 ms |
| ESP32, hora (SNTP) | UDP 123 | salida a Internet | no | sincronización cada 10 minutos; sin hora no se forman alertas |
| ESP32, OTA | UDP 3232 en la placa y TCP 32323 en el PC | LAN | no | carga por WiFi; el PC escucha en 32323 |
| ESP32, portal | UDP 53 y TCP 80 sobre el AP | red `SISMO-D<N>-config` | no | configuración de la red WiFi |
| `nodo1` a `nodo3` (simulados) | TCP 8080 en el contenedor | red de Compose | 9001, 9002 y 9003 | nodo simulado con el núcleo Raft real |
| `panel` | TCP 8090 en el contenedor | red de Compose | 8095 (`PUERTO_PANEL`) | ADMIN y CLIENTE |
| `servidor1` a `servidor3` | TCP 8100 en el contenedor | red de Compose | 8101, 8102 y 8103 en desarrollo | servidores de datos; en producción no se publican |
| `db1` a `db3` | TCP 5432 | red de Compose | nunca | PostgreSQL interno |
| `controlador` | TCP 8200 | red de Compose | nunca | única pieza con acceso al socket de Docker |
| `https` (Caddy) | TCP 8443 | LAN | 8443, solo con el perfil `https` | TLS interno delante del panel |
| `npm run test:db` | TCP 54431 a 54433 | solo `127.0.0.1` | solo loopback | tres PostgreSQL efímeros de prueba |
| `npm run test:infra` | 18095, 19001 a 19003 y 18101 a 18103 | proyecto `vybraint` | los mismos, efímeros | stack aislado de integración |

Docker publica los puertos con enlace a `0.0.0.0`, como muestra la evidencia de infraestructura (`0.0.0.0:8095->8090/tcp`). Por eso el firewall del PC es la única barrera para el panel. En una red compartida se abre solo el panel y, si se usa, el perfil HTTPS:

```bash
sudo ufw allow from <tu-subred>/24 to any port 8095 proto tcp
sudo ufw allow from <tu-subred>/24 to any port 8443 proto tcp
# solo si se va a cargar firmware por WiFi desde la LAN de las placas:
sudo ufw allow from <tu-subred>/24 to any port 32323 proto tcp
```

> **El panel no tiene login.** Cualquiera que alcance el puerto 8095 puede pulsar detectores, simular caídas y apagar servidores. En una red no confiable, colócalo detrás de un proxy con autenticación o limita el firewall a la subred de operación.

## 2.4 Espacio, energía y cableado

El disco debe alojar las imágenes Docker, el código y el histórico. La suma de las imágenes del perfil por defecto medida con `docker images --format '{{.Repository}}:{{.Tag}} {{.Size}}'` es de aproximadamente 2,2 GB: 3 × 116 MB de nodos, 245 MB del panel, 228 MB del controlador, 364 MB del servidor Fedora, 324 MB del servidor openSUSE, 249 MB del servidor Ubuntu y 420 MB de `postgres:16-alpine`, una sola imagen compartida por las tres bases. El perfil HTTPS añade 93,5 MB de Caddy y el proyecto de pruebas `vybraint` duplica las imágenes propias mientras no se limpie.

El consumo de PostgreSQL crece con el histórico. Las mediciones de `docs/servidores-de-datos.md` dan una muestra de ≈ 590 B, un evento de ≈ 430 B más ≈ 540 B de su entrada de log y un suceso de ≈ 250 B. Con una muestra cada 30 segundos como máximo, cada servidor acumula ≈ 1,7 MB por día y ≈ 0,6 GB por año. La retención está desactivada por defecto; cuando se active conviene revisar los valores en `docs/servidores-de-datos.md` y el tamaño real en `/info` (`tamanoBytes`).

Energía y cableado:

- Cada placa necesita alimentación USB de 5 V. Durante el flasheo se alimenta del PC; en operación puede quedar con el mismo cable o con un cargador USB.
- Los tres cables USB deben ser **de datos**. Un cable de solo carga no permite que el PC vea `/dev/ttyUSB*` ni `/dev/ttyACM*`.
- Los pulsadores, la protoboard y los cables dupont son material del montaje. La lista de piezas, el plano y la conexión en diagonal del pulsador están en la sección 3.
- El consumo eléctrico de las placas y del PC no se midió en esta entrega. La evidencia de consumo disponible es de CPU y memoria de los contenedores (INF-09).

## 2.5 Lista de verificación previa

La {{TABLA:T-REQ-CHECK}} se recorre antes de instalar. Cada fila deja un criterio objetivo para continuar; si una comprobación falla, se corrige antes de pasar a la siguiente.

[[TABLA:T-REQ-CHECK|Lista de verificación previa con el comando y el criterio para continuar.]]
| # | Comprobación | Comando | Criterio para continuar |
|---|---|---|---|
| 1 | Sistema operativo | `uname -srm` | Linux x86_64 |
| 2 | Docker y Compose | `docker compose version` | responde con una versión y no "command not found" |
| 3 | Node.js | `node -v` | v22 o superior |
| 4 | Compilador C++ | `g++ --version` | compilador con soporte de C++17 |
| 5 | Make | `make --version` | GNU Make instalado |
| 6 | Arduino CLI | `arduino-cli version` | 1.x (solo si se compila firmware) |
| 7 | Core ESP32 | `arduino-cli core list` | incluye `esp32:esp32` 3.3.12 |
| 8 | ArduinoJson | `ls "$HOME/Arduino/libraries/ArduinoJson/src/ArduinoJson.h"` | imprime la ruta del archivo |
| 9 | Puertos libres | `ss -ltn` | no aparece ninguno de 8095, 9001 a 9003 ni 8101 a 8103 |
| 10 | Disco | `df -h .` | 10 GB disponibles o más |
| 11 | Permiso serie | `id -nG "$USER"` | incluye `dialout`, o se aplica `sudo setfacl -m u:"$USER":rw /dev/ttyUSB*` antes de cargar |
| 12 | Secretos del firmware | `grep -c PON_AQUI_LA_CLAVE firmware/detector/secretos.h` | 0 (archivo creado y editado); solo si se flashea |
| 13 | Archivo de entorno | `test -f .env && echo ".env listo"` | imprime `.env listo` |
| 14 | Commit del repositorio | `git log -1 --format=%H` | `0ee5ed4a626c28904db55ab6e436e040c03f046c` |
| 15 | Router | revisar la configuración del router | DHCP activo, broadcast permitido y AP isolation desactivado |
| 16 | mDNS con las placas encendidas | `getent hosts sismo-nodo-1.local` | devuelve una IP de la LAN; si no, se usan IPs explícitas |

El detalle de cómo obtener el SHA-256 esperado y el procedimiento de creación de `secretos.h` están en la sección 7.1 y en la sección 6, respectivamente. Para flashear por USB hace falta permiso sobre el puerto serie: `sudo usermod -aG dialout "$USER"` una vez y con sesión nueva, o `sudo setfacl -m u:"$USER":rw /dev/ttyUSB*` tras cada reconexión. El procedimiento completo está en la sección 6.

## 2.6 Tiempos estimados

Los tiempos de la {{TABLA:T-REQ-TIEMPO}} sirven para planear la instalación. La columna "tipo" distingue lo medido en la validación de lo que es una estimación de trabajo; las cifras medidas salen de los registros de `entrega/05-pruebas/logs/`.

[[TABLA:T-REQ-TIEMPO|Tiempos de referencia de la instalación y la operación.]]
| Tarea | Tiempo | Tipo |
|---|---|---|
| Descomprimir el snapshot y verificar el SHA-256 | menos de 1 minuto | estimado |
| Copiar `ejemplo.env` a `.env` y ajustar las direcciones | 2 a 5 minutos | estimado |
| Crear y editar `firmware/detector/secretos.h` | 2 a 5 minutos | estimado |
| Primera construcción de las imágenes Docker (con red) | 5 a 20 minutos | estimado; el manual de base habla de "varios minutos" |
| Arranque del stack con las imágenes ya construidas | alrededor de 30 segundos | estimado |
| Formación del clúster y elección de líder | 8 a 20 segundos | criterio de la campaña física |
| Compilación del firmware de los tres nodos | ≈ 1,5 minutos | medido; NOD-11 va de las 11:11:34 a las 11:13 |
| Flasheo de una placa por USB (compilación incluida) | 1 a 2 minutos por placa | estimado |
| `npm test` en `web/` | 16,6 segundos | medido; TST-03 |
| `npm run test:db` | 13,8 segundos, más el arranque de las tres bases | medido; TST-04 |
| `npm run test:infra` | 79,2 segundos, con construcción incluida | medido; TST-05 |
| `node web/scripts/verificar-esp32.js` con las placas encendidas | unos segundos; hasta 48 s si cada petición agota su timeout de 4 s | estimado |
| Verificación de punta a punta de la sección 8.2 | 10 a 15 minutos | estimado |

La primera construcción es el paso más lento porque descarga las imágenes base y la cabecera ArduinoJson 7.4.3 desde GitHub. Las siguientes construcciones reutilizan la caché de Docker y bajan a menos de un minuto si no cambió el código.

# 3. Montaje físico de los tres detectores

Los tres detectores se arman igual y se prueban de a uno. Cada detector es un ESP32 DevKit V1 de 30 pines sobre una protoboard MB102, un pulsador B3F-4055 entre GPIO4 (D4) y GND, dos cables Dupont y un cable micro-USB de datos. El firmware usa D4 como entrada, GND como referencia y el LED azul integrado en GPIO2; no hay más cableado (`firmware/detector/detector.ino:1-2,50-51,707-708`).

El evento sísmico es simulado: el pulsador cierra el circuito de D4 a GND y el firmware calcula la duración. No hay acelerómetro ni medición real de movimiento (`firmware/detector/detector.ino:1-5`). La geometría de filas y columnas de este capítulo toma la hoja `montaje/montaje_detectores.html`; los pines, los tiempos y el comportamiento salen del firmware real; el código de ejemplo de esa hoja no se usa.

> **Aviso.** El sistema no detecta sismos reales. Toda la campaña física se hace con pulsaciones y el panel rotula el resultado como simulacro.

## 3.1 Piezas y cantidades

La compra real es el Pedido 60869 de Electronilab (Bogotá), documentado en `entrega/07-presupuesto/presupuesto.csv` y `entrega/07-presupuesto/presupuesto.md`. Los precios de la {{TABLA:T-MON-PIEZAS}} son valores de factura. El valor unitario se deriva del valor de línea dividido entre la cantidad, y en los cinco ítems la división es exacta (`entrega/07-presupuesto/presupuesto.md:103-117`).

[[TABLA:T-MON-PIEZAS|Piezas, cantidades y costo real de la compra del Pedido 60869. Fuente: entrega/07-presupuesto/presupuesto.csv, filas H-01 a H-06.]]
| Ítem | Especificación | Compra | Usa | Sobra | Costo real (COP) |
|---|---|---:|---:|---:|---:|
| ESP32 DevKit V1 | WiFi y Bluetooth, CP2102, 30 pines, micro-USB | 3 | 3 | 0 | 113.190 |
| Protoboard MB102 | Adhesiva, 830 puntos, 16,5 x 5,5 cm | 3 | 3 | 0 | 41.700 |
| Jumpers Dupont | Macho-macho, 20 cm, paquete de 40 | 1 | 6 | 34 | 9.900 |
| Cable micro-USB | 30 cm, blindado, de datos | 3 | 3 | 0 | 12.900 |
| Pulsador B3F-4055 | 4 patas, 12 x 12 x 7,3 mm, negro | 4 | 3 | 1 | 1.724 |
| Subtotal de ítems | Suma de hardware | | | | 179.414 |
| Envío | Bogotá Domicilio | 1 | 0 | 0 | 9.800 |
| Total de la orden | Pedido 60869, ítems más envío | | | | 189.214 |

El cuarto pulsador es repuesto: uno por placa y uno de reserva. De los 40 jumpers se instalan 6, dos por detector, y sobran 34 (`entrega/07-presupuesto/presupuesto.csv`, filas H-03 y H-05). No se compraron adaptadores de pared: la alimentación de las tres placas sale de los puertos USB del PC o de un cargador USB de 5 V que ya se tenga (`entrega/07-presupuesto/presupuesto.md:94-96`).

El cable USB debe ser de datos, no de solo carga. Con un cable de carga la placa enciende, pero el PC no crea el puerto serie y la carga del firmware falla (`docs/prueba-hardware.md:31-39`, `entrega/06-manual/conexion-esp32.md:64-80`).

## 3.2 Herramientas

La {{TABLA:T-MON-HERR}} lista lo que se usa. Las herramientas de taller no están en el presupuesto: el presupuesto excluye cautín, estaño, multímetro y destornilladores porque no se compraron para el proyecto (`entrega/07-presupuesto/presupuesto.md:232`).

[[TABLA:T-MON-HERR|Herramientas necesarias y opcionales para el montaje. Fuente: docs/prueba-hardware.md y entrega/06-manual/manual-instalacion-y-ejecucion.md:91-92.]]
| Herramienta | Uso en el montaje | Necesidad |
|---|---|---|
| PC con puerto USB | Alimentar, cargar el firmware y leer el monitor serie | Obligatoria |
| `arduino-cli` 1.5.1 y core `esp32:esp32` 3.3.12 | Compilar y cargar el firmware | Obligatoria |
| Cable micro-USB de datos | Alimentación y flasheo de cada placa | Obligatoria |
| Multímetro con continuidad | Comprobar D4 contra GND y descartar cortos | Recomendada |
| Pinzas o alicate de punta fina | Enderezar una pata doblada sin forzar el módulo | Opcional |
| Rotulador permanente o etiquetas | Marcar SIS-D1, SIS-D2 y SIS-D3 | Obligatoria |
| Cinta de doble faz | Fijar la protoboard a una base | Opcional |

No se necesita cautín, estaño ni resistencias. El firmware activa el pull-up interno del ESP32 y el antirrebote se hace por software (`firmware/detector/detector.ino:54,707`). Versiones verificadas de las herramientas en `entrega/06-manual/manual-instalacion-y-ejecucion.md:91-92`: `arduino-cli` 1.5.1 y core `esp32:esp32` 3.3.12.

## 3.3 Plano de la protoboard

La MB102 de 830 puntos tiene 63 columnas y 10 filas (a-j), más cuatro regletas de alimentación de 50 agujeros cada una: 63 x 10 = 630, más 4 x 50 = 200, total 830. Dentro de una mitad, los cinco agujeros de una misma columna están unidos; el canal central separa la mitad a-e de la mitad f-j. La {{FIG:FIG-MON-01}} muestra el plano visto desde arriba.

[[FIG:FIG-MON-01|Vista superior de la protoboard MB102 con el ESP32 en las columnas 1 a 15, el pulsador en d24, d26, g24 y g26, el jumper azul j5 a j26 y el jumper negro j2 a a24. Fuente: elaboración propia con la geometría de montaje/montaje_detectores.html y los pines de firmware/detector/detector.ino:50-51,707-708.]]

La figura muestra las columnas 1 a 30; las columnas 31 a 63 quedan libres. El dibujo no está a escala: la posición de cada agujero es exacta y el tamaño de las piezas es ilustrativo. Las regletas de alimentación no se usan en este montaje y aparecen solo como referencia de la placa.

El ESP32 se inserta con el conector USB hacia la columna 1, de modo que el cable sale por el borde izquierdo sin tapar la protoboard. Sus dos hileras de 15 pines caen en la fila a y en la fila i, en las columnas 1 a 15. El cuerpo del módulo queda sobre las filas b a h y deja libre la fila j, que se usa para pasar los cables.

El pulsador va en las columnas 24 y 26, con dos patas en la fila d y dos en la fila g. El cuerpo cruza el canal central. Las columnas 16 a 30 quedan libres para el cableado.

Los dos cables de cada detector:

- Jumper azul: de j5 a j26. La columna 5 une i5 (D4) con j5 en la mitad inferior, y la columna 26 une j26 con g26 en la misma mitad. El cable conecta D4 con la pata g26 del pulsador.
- Jumper negro: de j2 a a24. La columna 2 une i2 (GND) con j2 en la mitad inferior, y la columna 24 une a24 con d24 en la mitad superior. El cable conecta GND con la pata d24 y rodea el pulsador por la derecha.

Los ocho agujeros con conexión eléctrica del montaje son i2, i5, j2, j5, a24, d24, g26 y j26. La {{FIG:FIG-MON-01}} los marca en amarillo. Los 30 agujeros de las filas a e i, columnas 1 a 15, llevan los pines del módulo y no se cablean. Los agujeros de las filas b a h quedan debajo del cuerpo del ESP32 y no se usan. El resto de la placa queda libre.

> **Aviso de seguridad.** Antes de conectar el USB, revisa que no haya ningún cable entre i1 (3V3) y i2 (GND), ni entre a1 (VIN) y a2 (GND). Un corto entre alimentación y GND puede dañar la placa o el puerto USB del PC.

## 3.4 Posición de cada pieza y mapa de pines

La {{TABLA:T-MON-PIEZAS2}} fija la posición de cada pieza. La {{TABLA:T-MON-PINES}} recorre las 30 posiciones del zócalo del módulo. La serigrafía impresa en la placa es la referencia final: si una etiqueta no coincide, manda la placa.

[[TABLA:T-MON-PIEZAS2|Posición de cada pieza dentro de la protoboard, por detector. Fuente: montaje/montaje_detectores.html:114-140 y firmware/detector/detector.ino:50-51,707-708.]]
| Pieza | Posición | Cantidad por detector | Función en el circuito |
|---|---|---|---|
| ESP32 DevKit V1 | Filas a e i, columnas 1 a 15; USB hacia la columna 1 | 1 | Controlador, WiFi, LED azul en GPIO2 |
| Pulsador B3F-4055 | d24, d26, g24 y g26; cuerpo sobre el canal | 1 | Cierra GPIO4 contra GND al presionar |
| Jumper azul | j5 a j26 | 1 | Une D4 (i5) con la pata g26 |
| Jumper negro | j2 a a24 | 1 | Une GND (i2) con la pata d24 |
| Cable micro-USB | Conector USB del módulo | 1 | Alimentación y datos |
| Etiqueta SIS-D1, SIS-D2 o SIS-D3 | Borde de la protoboard, junto al USB | 1 | Identificación del nodo |

[[TABLA:T-MON-PINES|Mapa de las 30 posiciones del zócalo del ESP32 DevKit V1 y uso de cada pin en este montaje. Fuente: serigrafía del módulo y firmware/detector/detector.ino:50-51,707-708.]]
| Posición | Serigrafía | Uso en este montaje |
|---|---|---|
| a1 | VIN | No se conecta |
| a2 | GND | No se conecta |
| a3 | D13 | No se conecta |
| a4 | D12 | No se conecta |
| a5 | D14 | No se conecta |
| a6 | D27 | No se conecta |
| a7 | D26 | No se conecta |
| a8 | D25 | No se conecta |
| a9 | D33 | No se conecta |
| a10 | D32 | No se conecta |
| a11 | D35 | No se conecta |
| a12 | D34 | No se conecta |
| a13 | VN | No se conecta |
| a14 | VP | No se conecta |
| a15 | EN | No se conecta |
| i1 | 3V3 | No se conecta |
| i2 | GND | GND del pulsador, por el jumper negro j2 a a24 |
| i3 | D15 | No se conecta |
| i4 | D2 | GPIO2, LED azul integrado; no se cablea |
| i5 | D4 | GPIO4, entrada del pulsador, por el jumper azul j5 a j26 |
| i6 | RX2 | No se conecta |
| i7 | TX2 | No se conecta |
| i8 | D5 | No se conecta |
| i9 | D18 | No se conecta |
| i10 | D19 | No se conecta |
| i11 | D21 | No se conecta |
| i12 | RX0 | No se conecta |
| i13 | TX0 | No se conecta |
| i14 | D22 | No se conecta |
| i15 | D23 | No se conecta |

Solo se usan tres pines: GND en i2, el LED interno en GPIO2 y la entrada del pulsador en GPIO4. El resto del zócalo queda libre y no se cablea. El pinout completo de las 30 posiciones está en el anexo B.

El firmware fija los pines y los tiempos del pulsador en las primeras líneas de `detector.ino`:

```cpp
const int PIN_BOTON = 4;
const int PIN_LED = 2;
const uint32_t PULSO_MIN_MS = 80;           // toques más cortos se ignoran
const uint32_t PULSO_MAX_MS = 60000;        // tope para POST /pulsar
const uint32_t ANTIRREBOTE_MS = 20;
```

Archivo: `firmware/detector/detector.ino` (líneas 50-54).

En `setup()` se declara la entrada con pull-up interno y la salida del LED:

```cpp
pinMode(PIN_BOTON, INPUT_PULLUP);
pinMode(PIN_LED, OUTPUT);
```

Archivo: `firmware/detector/detector.ino` (líneas 707-708).

El pull-up interno mantiene D4 en HIGH mientras el pulsador está suelto. Al presionar, D4 se une a GND y el firmware mide el tiempo de la pulsación al soltar. El tope de 60 s solo aplica al endpoint `POST /pulsar`; el botón físico no tiene tope (`firmware/detector/detector.ino:53,526-541,622`).

## 3.5 El pulsador y la conexión en diagonal

El B3F-4055 tiene cuatro patas, cuerpo de 12 x 12 mm y 7,3 mm de alto (`entrega/07-presupuesto/presupuesto.csv`, fila H-05). Dos patas están en un lado del cuerpo y dos en el lado opuesto. Por dentro, las patas de un mismo lado comparten contacto; al presionar se unen los dos lados. La {{FIG:FIG-MON-02}} muestra la posición y las tres orientaciones posibles.

[[FIG:FIG-MON-02|Pulsador B3F-4055 sobre el canal: patas en d24, d26, g24 y g26, conexión en diagonal entre d24 y g26 y las orientaciones que funcionan. Fuente: elaboración propia con montaje/montaje_detectores.html:143-177 y firmware/detector/detector.ino:50,54,707.]]

La conexión se hace en diagonal: un cable llega a d24 y el otro a g26. Así cada cable toca un lado distinto del pulsador y el contacto abre y cierra el circuito sin importar cuál par de patas viene unido por dentro. La regla de la hoja de montaje coincide: la diagonal funciona en las dos formas en que el botón encaja cruzando el canal (`montaje/montaje_detectores.html:140,173,177`).

La {{TABLA:T-MON-ORIENT}} resume las orientaciones. El cuerpo del pulsador debe quedar sobre el canal central, con las patas hacia las filas d y g y los lados lisos hacia las columnas.

[[TABLA:T-MON-ORIENT|Orientaciones del pulsador sobre la protoboard y resultado eléctrico. Fuente: montaje/montaje_detectores.html:143-177.]]
| Orientación | ¿Encaja? | Resultado |
|---|---|---|
| Como se dibuja, patas en d y g | Sí | Funciona: D4 en g26 y GND en d24 |
| Girado 180 grados | Sí | Funciona: la diagonal sigue siendo d24 y g26 |
| Girado 90 grados | No | Las patas no cruzan el canal y el cuerpo no apoya |

No lleva resistencia. El pull-up está dentro del ESP32 y se activa con `INPUT_PULLUP` (`firmware/detector/detector.ino:707`). El firmware filtra el rebote con 20 ms de antirrebote y descarta los pulsos de menos de 80 ms (`firmware/detector/detector.ino:52-54,526-541`).

Una pulsación de 900 ms produce un evento de nivel 3: el firmware calcula `nivel = min(10, 1 + ms / 450)` y `pga = 0,028 x nivel + 0,015` (`firmware/detector/src/nucleo/sismo.cpp:6-9`, `firmware/detector/detector.ino:514-515`). El monitor serie imprime la línea `pulso 900 ms -> ... nivel 3: ...` (`firmware/detector/detector.ino:522`).

Si se cablean dos patas del mismo lado, D4 queda unido a GND de forma permanente. El firmware lee LOW al arrancar, abre el portal de configuración a los 3 s y el LED parpadea rápido sin parar, sin generar eventos (`firmware/detector/detector.ino:255-266,526-535,684-691`). Es un error fácil de confundir con una placa dañada.

> **Aviso.** Mantén la pulsación al menos 80 ms. Los toques más cortos se descartan a propósito y no producen evento.

La campaña del 2026-11-17 registró dos eventos de 301 ms y 174 ms en lugar de uno de unos 900 ms. El diagnóstico atribuye el patrón al contacto del pulsador, recomienda revisar el cableado diagonal, reasentar o sustituir los jumpers y, si persiste, sustituir el pulsador (`entrega/10-informes-fase3/diagnostico-pulsador.md`, secciones 5 y 6). El resultado de la campaña y su estado se documentan en la sección 5.7.

## 3.6 Secuencia de montaje paso a paso

La secuencia se repite para cada detector. No se pasa al siguiente paso sin cumplir el criterio "Hecho cuando".

1. **Cuenta e inspecciona las piezas.** Sobre la mesa deben estar 3 placas ESP32, 3 protoboards, 4 pulsadores, el paquete de jumpers y 3 cables USB de datos. Hecho cuando: el inventario coincide con la {{TABLA:T-MON-PIEZAS}} y ninguna pata del módulo ni del pulsador está doblada.
2. **Orienta la protoboard.** Coloca el canal central en horizontal, la fila a arriba y la columna 1 a la izquierda. Hecho cuando: lees las filas a-e en la mitad superior, f-j en la inferior y los números 1 a 63 en el borde.
3. **Inserta el ESP32.** Con el conector micro-USB hacia la columna 1, introduce las dos hileras de 15 pines en a1-a15 e i1-i15. Presiona con los dos pulgares, repartiendo la fuerza. Hecho cuando: el USB sobresale por el borde izquierdo, no queda ninguna pata fuera de su agujero y el módulo no se balancea.
4. **Comprueba la fila de pines.** Verifica en la serigrafía que i1 es 3V3, i2 es GND, i5 es D4 y a15 es EN. Hecho cuando: las etiquetas coinciden con la {{TABLA:T-MON-PINES}} y el módulo está plano sobre la protoboard.
5. **Coloca el pulsador.** Introduce las cuatro patas en d24, d26, g24 y g26, con el cuerpo sobre el canal y los lados lisos hacia las columnas. Hecho cuando: las cuatro patas entran firmes, el cuerpo cruza el canal y el pulsador no gira con el dedo.
6. **Monta el jumper azul.** Conecta un extremo en j5 y el otro en j26. Hecho cuando: los dos extremos están dentro del agujero y el cable pasa por la fila j sin tocar las patas del pulsador, salvo la columna 26.
7. **Monta el jumper negro.** Conecta un extremo en j2 y el otro en a24, rodeando el pulsador por la derecha. Hecho cuando: los dos extremos están firmes, el cable no tapa el pulsador y no se cruza con el jumper azul.
8. **Revisa la continuidad.** Con el multímetro en continuidad, mide entre i2 (GND) e i5 (D4). Sin pulsar debe haber circuito abierto; con el pulsador apretado, continuidad. Hecho cuando: la medida cambia al presionar y no hay continuidad permanente.
9. **Descarta cortos.** Mide entre i1 (3V3) e i2 (GND) y entre a1 (VIN) y a2 (GND). Hecho cuando: no hay continuidad en ninguna de las dos parejas.
10. **Conecta el USB.** Conecta el cable de datos al ESP32 y al PC. Hecho cuando: se enciende el LED de alimentación de la placa y el sistema crea `/dev/ttyUSB0` (`lsusb`, `dmesg`).
11. **Da permisos al puerto.** Si el puerto no es accesible, aplica `sudo setfacl -m u:"$USER":rw /dev/ttyUSB0`. Hecho cuando: `arduino-cli board list` lista la placa y el puerto.
12. **Carga el firmware del detector N.** Ejecuta `./cargar.sh N` desde `firmware/` (compilación y flasheo en la sección 6.16). Hecho cuando: la salida termina con `== Listo: detector N (SIS-DN) cargado.` (`firmware/cargar.sh:104`).
13. **Lee el arranque.** Abre el monitor serie a 115200. Hecho cuando: aparecen `Detector nodo-N (Raft)`, la línea `nodo-N conectado a la red, IP x.x.x.x` y `término guardado T, voto V` (`firmware/detector/detector.ino:302,710,726`).
14. **Etiqueta la protoboard.** Escribe SIS-DN en el borde, junto al USB, y anota MAC, puerto e IP. Hecho cuando: la etiqueta es visible y la placa quedó registrada en `firmware/placas.conf` (`docs/prueba-hardware.md:47-52`).
15. **Prueba la pulsación.** Mantén el pulsador unos 900 ms y suéltalo. Hecho cuando: el LED parpadea rápido mientras pulsas y el monitor imprime `pulso` con nivel 3; si no aparece nada, revisa el paso 8.
16. **Repite con las otras dos placas.** Desconecta la primera, monta la segunda y cambia N en `./cargar.sh N`. Hecho cuando: las tres protoboards están montadas, etiquetadas y probadas, cada una con su número.

## 3.7 Las tres protoboards y su etiqueta

Las tres protoboards son idénticas en piezas y posiciones. La diferencia se graba al compilar: `./cargar.sh N` compila con `-DNODO=N` (`firmware/cargar.sh:79`) y el arranque imprime `Detector nodo-N (Raft)` (`firmware/detector/detector.ino:710`). La {{FIG:FIG-MON-03}} muestra las tres con su etiqueta.

[[FIG:FIG-MON-03|Las tres protoboards idénticas etiquetadas SIS-D1, SIS-D2 y SIS-D3, con su nodo y su servidor de datos preferido. Fuente: elaboración propia con firmware/cargar.sh:79, detector.ino:710 y web/config.js:28.]]

La {{TABLA:T-MON-TRES}} resume la correspondencia entre etiqueta, nodo, firmware y servidor de datos preferido.

[[TABLA:T-MON-TRES|Correspondencia entre etiqueta, nodo, firmware y servidor de datos preferido. Fuente: firmware/cargar.sh:79, detector.ino:710, web/config.js:28-31 y docker-compose.yml:115,128,141.]]
| Etiqueta | Nodo | Compilación | Banner del monitor | Servidor de datos preferido | Registro |
|---|---|---|---|---|---|
| SIS-D1 | nodo-1 | `./cargar.sh 1` con `-DNODO=1` | `Detector nodo-1 (Raft)` | Servidor 1 | `firmware/placas.conf` |
| SIS-D2 | nodo-2 | `./cargar.sh 2` con `-DNODO=2` | `Detector nodo-2 (Raft)` | Servidor 2 | `firmware/placas.conf` |
| SIS-D3 | nodo-3 | `./cargar.sh 3` con `-DNODO=3` | `Detector nodo-3 (Raft)` | Servidor 3 | `firmware/placas.conf` |

La etiqueta física se escribe en el borde de la protoboard, junto al conector USB. La relación placa, MAC y número de nodo se registra con `./quien.sh --registrar N -p /dev/ttyUSBx` al flashear, y queda en `firmware/placas.conf` (`docs/prueba-hardware.md:45-52`, `firmware/cargar.sh:102-104`). Los registros de la campaña muestran el mensaje final del flasheo en `entrega/04-evidencias/D-nodos/log-NOD-10-flasheo-nodo1.txt:148` y en los archivos equivalentes de los nodos 2 y 3.

La columna "servidor de datos preferido" es una asignación de despliegue, no una constante del firmware. Cada servidor de datos consulta al ESP32 del mismo número a 1 Hz (`web/servidor/recolector.js:1-5`); en Docker, el servidor N apunta a `NODO_URL` del nodo N (`docker-compose.yml:115,128,141`) y `web/config.js:26-31` lo deja escrito. El nodo no envía eventos a un servidor: replica por Raft con los otros nodos en UDP 4210 (`firmware/detector/config.h:21`) y responde por HTTP en el puerto 80.

El cuarto pulsador no se instala: queda de repuesto para sustituir uno desgastado. Las tres protoboards se pueden fijar con cinta de doble faz a una base cuando el montaje ya funcione; la MB102 es adhesiva (`entrega/07-presupuesto/presupuesto.csv`, fila H-02).

## 3.8 Alimentación y primera conexión USB

Cada placa se alimenta por su conector micro-USB con 5 V. La compra incluye tres cables micro-USB de 30 cm blindados y de datos (`entrega/07-presupuesto/presupuesto.csv`, fila H-04), y no incluye adaptadores de pared (`entrega/07-presupuesto/presupuesto.md:94-96`). Durante el montaje y el flasheo, el cable va al PC; después del flasheo la placa puede quedar en el mismo PC o pasar a un cargador USB de 5 V.

El LED de alimentación de la placa se enciende al conectar el USB. El LED azul es distinto: está en GPIO2 y lo controla el firmware, así que su comportamiento es una comprobación del arranque y no de la alimentación.

La conexión se comprueba en este orden:

```bash
lsusb | grep -iE "cp210|ch34|silicon|qinheng"
ls -l /dev/ttyUSB* /dev/ttyACM*
dmesg | tail -5
sudo usermod -aG dialout "$USER"            # una vez; cerrar sesión y volver a entrar
sudo setfacl -m u:"$USER":rw /dev/ttyUSB0   # permiso inmediato, repetir tras reconectar
arduino-cli board list
```

Fuente: `docs/prueba-hardware.md:31-39` y `entrega/06-manual/conexion-esp32.md:62-80`. En Linux el chip CP2102 usa el driver `cp210x` incluido en el kernel y no requiere instalación; si la placa trae CH340, el driver es `ch341` (`entrega/06-manual/conexion-esp32.md:73-80`).

> **Aviso de seguridad.** No inyectes tensión por los pines 3V3 ni VIN de la placa con el cable USB conectado. La alimentación del montaje entra por el conector micro-USB.

No conectes las tres placas al mismo puerto USB a la vez para flashear: el script detecta varias y se detiene (`firmware/cargar.sh:50-53`). Flashea y prueba una placa por vez; después, las tres pueden quedar encendidas a la vez para formar el clúster.

## 3.9 Verificación del montaje

La {{TABLA:T-MON-VERIF}} se completa en el orden indicado antes de pasar al siguiente detector. Al terminar las tres, el montaje está verificado.

[[TABLA:T-MON-VERIF|Comprobaciones del montaje, resultado esperado y acción si falla. Fuente: docs/prueba-hardware.md:31-39,157 y firmware/detector/detector.ino:302,522,684-691,710,726.]]
| Comprobación | Cómo se comprueba | Resultado esperado | Si falla |
|---|---|---|---|
| Alimentación | Conectar el USB | LED de alimentación encendido | Cambiar cable o puerto |
| Puerto serie | `lsusb`, `dmesg`, `/dev/ttyUSB*` | CP2102 detectado y puerto creado | Usar cable de datos, revisar driver |
| Permisos | `ls -l /dev/ttyUSB0` | El usuario puede leer y escribir | `dialout` o `setfacl` |
| Carga del firmware | `./cargar.sh N` | `== Listo: detector N (SIS-DN) cargado.` | Revisar `secretos.h` y puerto |
| Banner de arranque | Monitor serie 115200 | `Detector nodo-N (Raft)` | Reiniciar la placa |
| Red WiFi | Monitor serie | `nodo-N conectado a la red, IP x.x.x.x` | Revisar SSID, clave y portal |
| Persistencia Raft | Monitor serie | `término guardado T, voto V` | Revisar NVS o reflashear |
| Pulsación corta | Pulsar menos de 80 ms | No aparece ninguna línea `pulso` | Correcto, se descarta |
| Pulsación de 900 ms | Mantener y soltar | `pulso` con nivel 3 y LED rápido al pulsar | Revisar cableado diagonal |
| Sin cortos | Multímetro entre i1 e i2 | Sin continuidad | Retirar el puente y revisar |
| LED con líder | Esperar 8 a 20 s con las tres encendidas | LED azul fijo en las tres | Revisar red, ver 3.10 |

El LED azul tiene un comportamiento definido por el firmware. La {{TABLA:T-MON-LED}} lo resume y la función que lo controla se copia a continuación.

[[TABLA:T-MON-LED|Comportamiento del LED azul de GPIO2 y su causa en el firmware. Fuente: firmware/detector/detector.ino:247,259,276,294-296,684-691.]]
| Estado | Comportamiento del LED | Causa en el firmware |
|---|---|---|
| Sin alimentación | Apagado | Placa sin 5 V |
| Conectando WiFi al arrancar | Alterna cada 250 ms | Espera de conexión |
| Ventana de doble reinicio | Parpadeo lento, 500 ms | Comprobación de reinicio doble |
| Botón mantenido al encender | Parpadeo rápido, 100 ms | Espera para abrir el portal |
| Portal de configuración abierto | Parpadeo rápido, 150 ms | Modo portal |
| Pulsando | Parpadeo rápido, 80 ms | El firmware cree que el botón está pulsado |
| Con líder conocido | Fijo encendido | `raft->lider() != 0` |
| Sin líder | Parpadeo a 1 Hz, 500 ms | Nodo sin líder |
| Caído o sin WiFi | Apagado | `raft->caido()` o WiFi desconectado |

```cpp
void actualizarLed(uint64_t ahora) {
  bool encendido;
  if (raft->caido() || WiFi.status() != WL_CONNECTED) encendido = false;
  else if (pulsando) encendido = (ahora / 80) % 2;
  else if (raft->lider() != 0) encendido = true;
  else encendido = (ahora / 500) % 2;
  digitalWrite(PIN_LED, encendido ? HIGH : LOW);
}
```

Archivo: `firmware/detector/detector.ino` (líneas 684-691).

La verificación de la red y del clúster tiene su propio detalle en la sección 8. En este capítulo basta con que cada placa arranque, se conecte y responda a la pulsación. El criterio de éxito del clúster completo es exactamente un nodo con rol de líder y los tres con el mismo término (`docs/prueba-hardware.md:157`, `entrega/06-manual/conexion-esp32.md:222-232`).

> **Aviso.** El LED fijo no significa "detector listo para alertar". Significa que el nodo conoce un líder. Sin hora NTP los nodos funcionan pero no forman alertas (`config.h:24`, `detector.ino:58,134`).

## 3.10 Errores de montaje y cómo corregirlos

La {{TABLA:T-MON-ERRORES}} reúne los fallos que aparecen al armar los tres detectores. La columna de comprobación indica qué mirar antes de desarmar nada.

[[TABLA:T-MON-ERRORES|Errores frecuentes de montaje, comprobación y corrección. Fuente: docs/prueba-hardware.md:31-39, entrega/06-manual/conexion-esp32.md:305-320 y entrega/10-informes-fase3/diagnostico-pulsador.md, sección 6.]]
| Síntoma | Causa probable | Comprobación | Corrección |
|---|---|---|---|
| El LED de alimentación no enciende | Cable o puerto USB defectuoso | Probar otro cable de datos y otro puerto | Sustituir el cable |
| No aparece `/dev/ttyUSB*` | Cable de solo carga o driver ausente | `lsusb`, `dmesg`, `arduino-cli board list` | Usar cable de datos; revisar driver |
| `Permission denied` al abrir el puerto | Falta el grupo `dialout` | `ls -l /dev/ttyUSB0` | `usermod -aG dialout` o `setfacl` |
| LED azul parpadeando rápido sin parar y sin eventos | D4 unido a GND de forma permanente | Continuidad entre i2 e i5 sin pulsar | Recablear en diagonal: D4 a g26 y GND a d24 |
| Al encender se abre el portal `SISMO-DN-config` | El pulsador estaba apretado al arrancar o D4 está en LOW | Mirar si el pulsador está atascado o mal cableado | Soltar el pulsador; corregir el cableado |
| Pines doblados o módulo inclinado | El módulo se insertó torcido o girado | Revisar USB hacia la columna 1 y la fila de pines | Sacar, enderezar y volver a insertar |
| Basura en el monitor serie | Velocidad distinta de 115200 | Configuración del monitor | Ajustar a 115200 |
| Las tres placas parpadean a 1 Hz y no hay líder | Red con aislamiento de clientes, broadcast bloqueado o solo dos placas | Revisar el router y cuántas placas están encendidas | Router normal con DHCP y las tres encendidas |
| Dos eventos con una sola pulsación | Contacto intermitente del pulsador o jumpers flojos | El LED deja de parpadear rápido durante la pulsación | Reasentar jumpers, revisar diagonal, sustituir el pulsador |
| El nodo no responde por HTTP | La IP cambió por DHCP | `getent hosts sismo-nodo-N.local` | Reservar IP o actualizar `.env` |
| La placa se reinicia al abrir el monitor | El adaptador CP2102 afirma RTS, que va a EN | Se observa un reinicio al abrir el puerto | No es un fallo de montaje; abrir el monitor con la placa ya encendida |

Dos errores que aparecen seguido son el cableado en el mismo lado del pulsador y el cable USB de solo carga. El primero se detecta con el multímetro y con el LED; el segundo, cambiando el cable (`entrega/06-manual/conexion-esp32.md:73-80,310-311`).

Si una placa se reinicia o el monitor no responde, revisa también que el firmware se haya compilado con el número correcto. Un `-DNODO` equivocado no rompe el montaje, pero deja dos nodos con la misma identidad lógica y el clúster no forma quórum estable.

## 3.11 Fotografía del prototipo real

La {{FIG:FIG-MON-04}} es la fotografía del prototipo montado durante la campaña física. Se copia sin recortes ni retoques desde `entrega/04-evidencias/F-fisicas/fot-FIS-03-prototipo-montado-a.png`, con el mismo SHA-256.

[[FIG:FIG-MON-04|Prototipo real montado: ESP32 DevKit V1 sobre la protoboard, pulsador en la mitad superior y dos cables de conexión. Fuente: entrega/04-evidencias/F-fisicas/fot-FIS-03-prototipo-montado-a.png.]]

La foto se tomó el día del armado y muestra lo que acredita: la placa montada sobre la protoboard, el pulsador y los dos cables (`entrega/04-evidencias/F-fisicas/NOTA-F-fisicas.md`). En la foto los cables son blanco y negro; en el plano de la {{FIG:FIG-MON-01}} se usa azul para D4 y negro para GND por claridad. El color de los cables puede variar; la posición sí importa: D4 a una pata y GND a la pata diagonal.

La foto no sirve como plano de posiciones ni como prueba del firmware. El pulsador se sostiene con la mano, los cables pasan por encima de la placa y la imagen no muestra la etiqueta SIS-DN ni los estados del LED. Para reproducir el montaje, usa la {{FIG:FIG-MON-01}} y la {{TABLA:T-MON-PINES}}.

Las otras dos fotos del mismo montaje están en `entrega/04-evidencias/F-fisicas/fot-FIS-03-prototipo-montado-b.png` (detalle del ESP32) y `fot-FIS-03-prototipo-montado-c.png` (detalle del pulsador). No se copian aquí para no duplicar la evidencia. El alcance de FIS-03 está acotado: acredita el montaje físico, mientras que las capturas de los tres prototipos encendidos (FIS-04) y de los estados del LED (FIS-05) siguen pendientes (`entrega/04-evidencias/F-fisicas/NOTA-F-fisicas.md`).

# 4. Diagrama de arquitectura y mecanismos de comunicación

Este capítulo describe los componentes del sistema y la forma en que se comunican. Los valores de puertos, tiempos y protocolos se verificaron en `docker-compose.yml`, `docker-compose.prod.yml`, `web/` y `firmware/detector/` para la versión `v1.0.0-rc1`, commit `0ee5ed4`, con fecha 2026-11-18. El evento que circula por el sistema es simulado: lo genera un pulsador en GPIO4. No hay acelerómetro ni medición sísmica real, y el capítulo lo mantiene explícito en cada mecanismo.

## 4.1 Vista de contexto

El sistema se organiza en cinco grupos de componentes. El primero es el campo, formado por tres placas ESP32 que ejecutan el mismo firmware con un número distinto (`-DNODO=1|2|3`) y que se coordinan con una implementación propia de consenso Raft. El segundo es el agregador, un proceso Node.js sin framework que sondea a los nodos, arma una fotografía del clúster y sirve el panel ADMIN y la vista CLIENTE. El tercero es la capa de datos: tres servidores Node.js, cada uno con su propia base PostgreSQL, que recolectan el histórico de su nodo asignado. El cuarto es el controlador de infraestructura, el único proceso con acceso al socket de Docker. El quinto es la presentación: dos navegadores, ADMIN para operación y CLIENTE para alerta pública, más un perfil HTTPS opcional con Caddy.

La {{FIG:FIG-ARQ-M01}} reúne los componentes y los mecanismos en una sola vista. El clúster intercambia mensajes Raft por UDP en el puerto 4210 y se descubre por broadcast en el 4211. Cada nodo expone su API HTTP en el puerto 80. El agregador sondea a los tres nodos a un hercio y publica el estado por SSE en el puerto 8095 del host. Cada servidor de datos sondea a su propio nodo, también a un hercio, y escribe en su PostgreSQL por el puerto 5432 de la red interna. El controlador recibe órdenes del panel por el puerto 8200 interno con un token Bearer. La placa mantiene la hora por NTP y se actualiza por OTA en TCP 32323 o UDP 3232.

El diagrama es nuevo y se elaboró para este manual a partir de las fuentes citadas. No es una captura de las figuras anteriores. Las figuras {{FIG:FIG-ARQ-M02}} y {{FIG:FIG-ARQ-M03}} sí se reutilizan de los diagramas D-02 y D-09 del proyecto, porque muestran el despliegue y la secuencia con el mismo nivel de detalle que necesita este capítulo.

[[FIG:FIG-ARQ-M01|Vista de contexto del sistema: tres nodos ESP32 con Raft, agregador y panel, servidores de datos con PostgreSQL, controlador, navegadores, Caddy opcional y NTP, con los puertos y mecanismos de comunicación. Fuente: elaboración propia a partir de docker-compose.yml, web/ y firmware/detector/config.h.]]

La lectura de la figura sigue el recorrido de un dato. En el campo, cada placa toma el evento del pulsador y lo propone al log de Raft. En el centro, el agregador convierte las respuestas HTTP de los nodos en una fotografía que se publica a los navegadores. Abajo, los servidores de datos escriben el histórico sin depender del agregador. A la derecha, el controlador queda aislado del resto: solo el panel lo alcanza y solo puede detener o arrancar contenedores `nodoN` y `servidorN`.

## 4.2 Componentes y responsabilidades

La {{TABLA:T-ARQ-COMP}} inventaría los procesos y servicios que aparecen en el diagrama. La columna de artefacto y puerto indica dónde vive cada componente y qué interfaz expone. Los nodos simulados de Docker se incluyen porque el despliegue por defecto los usa, y ejecutan el mismo núcleo Raft que el firmware.

[[TABLA:T-ARQ-COMP|Componentes del sistema, responsabilidad y puerto de cada uno.]]
| Componente | Tecnología | Responsabilidad | Artefacto y puerto |
|---|---|---|---|
| Nodo detector ESP32 | ESP32 DevKit V1 de 30 pines, C++20 (`gnu++2a`), core Arduino-ESP32 3.3.12 | Leer el pulsador, ejecutar Raft, aplicar la regla de alerta, exponer la API, guardar término y voto en NVS, sincronizar la hora y aceptar OTA | `firmware/detector/`; HTTP 80, UDP 4210 y 4211, UDP 3232 |
| Núcleo Raft | C++ portable sin dependencia de Arduino | Elección de líder, replicación, commit por mayoría, reenvío de eventos y regla de alerta | `firmware/detector/src/nucleo/`; se compila en la placa y en el nodo simulado |
| Nodo simulado | C++ sobre Debian 12, mismo núcleo del firmware | Sustituir a la placa en la demo con el mismo protocolo UDP y el mismo contrato HTTP | `web/nodo-sim/`; HTTP 8080 en el contenedor, publicado en 9001, 9002 y 9003 |
| Agregador y panel | Node.js 22 ESM sin framework | Sondear los nodos a 1 Hz, mantener la fotografía del clúster, inferir líder y quórum, publicar SSE y hacer de proxy de control e histórico | `web/server.js` y `web/poller.js`; HTTP 8090 en el contenedor y 8095 en el host |
| Servidor de datos, tres instancias | Node.js 22 con `pg` 8.23.1; Fedora 42, openSUSE Leap 15.6 y Ubuntu 24.04 | Recolectar el estado de su nodo, escribir el histórico en PostgreSQL, servir consultas y aplicar la retención | `web/servidor/`; HTTP 8100 en el contenedor y 8101, 8102 y 8103 en el host de desarrollo |
| PostgreSQL, tres instancias | `postgres:16-alpine` | Guardar muestras, entradas de log, eventos, alertas, sucesos y acciones; única fuente de verdad del histórico | `db1`, `db2` y `db3`; TCP 5432 en la red interna, sin puerto publicado |
| Controlador de infraestructura | Node.js con la API de Docker Engine | Detener y arrancar `nodoN` y `servidorN`; nunca toca las bases ni acepta nombres ni comandos | `web/controlador/`; HTTP 8200 en la red interna, sin puerto publicado |
| Panel ADMIN | React 19, TypeScript, Vite 8 y Tailwind 4 | Operación del clúster, histórico, control de servidores y pruebas | `web/public/admin/`; servido por el panel en 8095 |
| Vista CLIENTE | HTML, CSS y JavaScript nativo con Leaflet 1.9.4 | Estado público, alertas, mapa y protocolo de actuación | `web/public/cliente/`; servido por el panel en 8095 |
| Caddy | `caddy:2-alpine` | Terminar TLS local y hacer de proxy al panel para el perfil `https` | `docker/Caddyfile`; 8443 en el host, perfil opcional |
| NTP externo | SNTP | Entregar la hora UTC-5 que usan los eventos y la ventana de coincidencia | `pool.ntp.org` y `time.google.com`; puerto estándar 123/udp |
| Docker Engine | API `/v1.43` sobre socket Unix | Ejecutar los contenedores del proyecto; solo el controlador lo alcanza | `/var/run/docker.sock`; sin puerto de red |

La separación principal es entre consenso y datos. El log de Raft vive en la RAM de cada placa y solo el término y el voto se guardan en NVS (`firmware/detector/detector.ino:80-91`). El histórico completo vive en PostgreSQL y lo escribe cada servidor de datos. Esa división permite que el histórico sobreviva a un reinicio del clúster, aunque el consenso no sea durable.

## 4.3 Mecanismos de comunicación

La {{TABLA:T-ARQ-COM}} reúne los mecanismos que aparecen en el diagrama. Cada fila indica quién emite, quién recibe, el protocolo con su puerto y su dirección, el patrón de intercambio, la temporización o el reintento, y el comportamiento cuando el mecanismo falla. Las direcciones se obtienen por DHCP y se aprenden por el broadcast del puerto 4211; el panel, además, resuelve los nombres `sismo-nodo-N.local` por mDNS cada 5 segundos (`web/server.js:431-447`).

[[TABLA:T-ARQ-COM|Mecanismos de comunicación: emisor, receptor, protocolo, puerto, dirección, patrón, reintento y comportamiento ante fallo.]]
| Mecanismo | Emisor → receptor | Protocolo, puerto y dirección | Patrón | Reintento y temporización | Si falla |
|---|---|---|---|---|---|
| Consenso Raft | nodo ↔ nodo | UDP unicast, puerto 4210; JSON con claves cortas; IP aprendida por 4211 | Petición y respuesta asíncrona, con latido periódico; seis mensajes `VoteReq`, `VoteResp`, `Append`, `AppendResp`, `Forward` y `ForwardAck` | Latido cada 500 ms; elección entre 5000 y 9000 ms; reenvío `Forward` cada 500 ms; lotes de hasta 8 entradas y 4 en vuelo | Sin mayoría de 2 de 3 el commit no avanza. Un líder aislado sigue creyéndose líder porque no hay comprobación de quórum |
| Descubrimiento | nodo ↔ nodo | UDP broadcast, puerto 4211; texto `SISMO-HOLA:N`; dirección de broadcast de la LAN | Anuncio periódico y escucha continua | Cada 2000 ms (`config.h:10-11`) | Sin anuncio no se aprende la IP del otro y no se le envía Raft hasta el siguiente |
| API de estado del nodo | panel → nodo | HTTP/1.1 `GET /estado`, `/log`, `/sucesos` y `/alertas`; puerto 80; IP de DHCP o nombre `.local` | Sondeo a 1 Hz; las rutas pesadas solo cuando cambia el estado | timeout de 3000 ms; tres fallos consecutivos marcan el nodo como caído (`poller.js:25,53-67`) | El nodo queda inalcanzable en la fotografía y se reintenta en el siguiente ciclo |
| Órdenes al nodo | panel → nodo | HTTP `POST /control` y `/pulsar`; puerto 80; cuerpo JSON | Petición y respuesta a través del proxy del panel | timeout de 3000 ms; sin reintento automático | Respuesta 502 con `nodo inalcanzable`; la orden queda registrada en la tabla `acciones` |
| Estado en vivo | panel → navegador | HTTP con `text/event-stream`; puerto 8095 en el host (8090 en el contenedor) | Publicación por evento: fotografía al conectar y en cada cambio, más un latido | Evento `vivo` cada 5000 ms; reconexión nativa de `EventSource` | La vista conserva el último estado recibido o entra en modo demostración si el servidor no responde |
| Histórico | panel → servidor de datos | HTTP `GET /api/historial`, `/api/registro`, `/api/publico` y `/api/retencion`; puerto 8100 interno (8101 a 8103 en el host de desarrollo) | Consulta bajo demanda con paginación y filtros ejecutados en SQL | un reintento a los 250 ms solo ante error de red o respuesta 5xx (`server.js:194-210`) | 502 si no responde ningún servidor; el panel mezcla los disponibles y marca `ok:false` en los demás |
| Recolección | servidor de datos → nodo | HTTP `GET /estado`, `/sucesos`, `/log` y `/alertas`; puerto 80 | Sondeo propio e independiente del panel, a 1 Hz | timeout de 3000 ms; una muestra de estado cada 30 s aunque nada cambie (`recolector.js:3-5`) | Guarda una muestra con `alcanzable:false` y reintenta en el siguiente ciclo |
| Persistencia | servidor de datos → PostgreSQL | TCP 5432 en la red interna de compose; cadena `DATABASE_URL` o variables `DB_*` | Consultas parametrizadas y escrituras idempotentes por clave | pool de 5 conexiones y `connectionTimeout` de 4000 ms (`bd.js:60`) | `/salud` falla, el servidor responde error y el panel sigue con los otros dos |
| Infraestructura | panel → controlador | HTTP 8200 en la red interna; cabecera `Authorization: Bearer`; JSON | Petición y respuesta; solo `stop` y `start` de `nodoN` y `servidorN` | timeout de 4 s en las lecturas y de 30 s en las órdenes (`server.js:263,323`) | 502 y la operación no se aplica; el controlador nunca toca las bases |
| Docker | controlador → Docker Engine | API `/v1.43` por socket Unix `/var/run/docker.sock`; etiquetas de compose | Petición y respuesta con filtros por proyecto y servicio | timeout de 15 s; espera de 3 s al detener y de 15 s al arrancar (`controlador.js:20-25,46`) | 409 o 502; el panel informa el fallo y el estado del contenedor |
| Actualización OTA | PC de desarrollo → nodo | ArduinoOTA en UDP 3232; carga por `espota` en TCP 32323; contraseña en `secretos.h` | Transferencia de firmware por WiFi, manual | Sin reintento automático; la placa se reinicia al terminar | La placa conserva el firmware anterior y responde con la versión que tenía |
| Hora | nodo → servidores NTP | SNTP sobre UDP 123 (puerto estándar del protocolo); `pool.ntp.org` y `time.google.com`; zona UTC-5 fija | Sincronización periódica sin bloqueo | Cada 10 minutos (`detector.ino:58,716-717,751-753`) | La placa queda con `con_hora:false`; los eventos sin hora no participan en la regla de alerta |
| Portal cautivo | móvil → nodo | AP `SISMO-D<N>-config`; DNS 53/udp y HTTP 80/tcp sobre ese AP | Página HTML de configuración de la red | Se abre si no conecta, con doble pulsación de EN en 3 s o con el botón al encender; a los 5 minutos sin configurar reinicia | La placa reintenta la conexión WiFi y vuelve a ofrecer el portal |
| Resolución mDNS | panel → nodo | DNS `.local` para `sismo-nodo-N.local` | Resolución periódica en segundo plano | Cada 5000 ms; si falla conserva la última IP | El sondeo continúa contra la IP anterior hasta que la resolución vuelva |

El canal Raft es deliberadamente simple. Un datagrama perdido se recupera en el siguiente latido o en el siguiente reenvío, y un duplicado se descarta por índice y término. La entrega no está garantizada; la corrección se apoya en la mayoría y en la regla de log al día. La API HTTP de los nodos no tiene autenticación ni cifrado y permite el origen cruzado, una condición que se retoma en el apartado 4.8 y en la sección 11 del documento final.

## 4.4 Puertos y canales

La {{TABLA:T-ARQ-PUERTOS}} distingue el puerto interno del componente y el puerto publicado en el host. Esa diferencia importa para el cortafuegos: en desarrollo se publican los nodos simulados y los servidores de datos, mientras que en producción solo queda accesible el panel. Los valores salen de `docker-compose.yml` y de `docker-compose.prod.yml`.

[[TABLA:T-ARQ-PUERTOS|Puertos y canales, con puerto del componente, puerto del host y alcance.]]
| Canal | Protocolo | Puerto en el componente | Puerto en el host | Alcance y notas |
|---|---|---|---|---|
| Consenso Raft | UDP unicast | 4210 | No se publica | Nodo a nodo en la LAN; IP obtenida por DHCP |
| Descubrimiento | UDP broadcast | 4211 | No se publica | Nodo a nodo; la red debe permitir broadcast |
| API del nodo | HTTP | 80 | No se publica en las placas físicas | Agregador y servidores de datos hacia el nodo |
| Nodo simulado | HTTP | 8080 | 9001, 9002 y 9003 | Solo en el perfil por defecto de desarrollo |
| Panel y SSE | HTTP y `text/event-stream` | 8090 | 8095 | Único puerto publicado en producción junto con HTTPS |
| Servidores de datos | HTTP | 8100 | 8101, 8102 y 8103 en desarrollo; sin publicar en producción | Panel hacia servidores; también sirve `/salud` |
| PostgreSQL | TCP | 5432 | No se publica | Red interna de compose; una base por servidor |
| Controlador | HTTP | 8200 | No se publica | Solo el panel lo alcanza por la red interna |
| HTTPS opcional | TLS | 8443 en Caddy | 8443 | Perfil `https`; Caddy hace proxy al panel |
| Actualización OTA | ArduinoOTA y `espota` | 3232/udp y 32323/tcp | No aplica | PC de desarrollo hacia la placa |
| Portal cautivo | DNS y HTTP sobre el AP | 53/udp y 80/tcp | No aplica | Móvil conectado al AP de la placa |
| Hora | SNTP | 123/udp | No aplica | Puerto estándar del protocolo; salida a Internet |

Para una instalación en una red local, el cortafuegos del equipo solo necesita permitir el 8095 desde la LAN. Los puertos 80, 4210 y 4211 viven entre placas y no se exponen al exterior. En producción, el 8443 se suma al 8095 si se activa el perfil HTTPS. Los puertos 8100 y 5432 no se publican y no deben abrirse: el panel llega a los servidores de datos por la red interna de compose.

## 4.5 Despliegue y topología

La {{FIG:FIG-ARQ-M02}} muestra el despliegue Docker. El perfil por defecto levanta once servicios: `nodo1` a `nodo3`, `db1` a `db3`, `servidor1` a `servidor3`, `panel` y `controlador` (`docker-compose.yml:58-187`). Los tres nodos simulados ejecutan el núcleo Raft compilado para Linux y hablan el mismo protocolo UDP que la placa. Los tres servidores de datos se construyen sobre Fedora 42, openSUSE Leap 15.6 y Ubuntu 24.04 para demostrar portabilidad del mismo servicio Node.js. Las tres bases usan la imagen oficial `postgres:16-alpine` y guardan sus datos en los volúmenes `sismo-db1`, `sismo-db2` y `sismo-db3`.

[[FIG:FIG-ARQ-M02|Despliegue Docker: once servicios por defecto, puertos publicados, volúmenes, dependencias y healthchecks, con el perfil opcional https y el overlay de producción. Fuente: diagrama D-02 del proyecto, elaborado a partir de docker-compose.yml y docker-compose.prod.yml.]]

La topología es una sola red bridge de compose en un único equipo anfitrión. No hay segmentación entre servicios y no hay límites de CPU ni de memoria. El panel depende de que los seis servicios de datos estén sanos; los servidores dependen de su base con `condition: service_healthy`; el controlador no depende de nadie y publica un healthcheck propio (`docker-compose.yml:146-163`). Las placas reales no están en Docker: se conectan por WiFi a la misma LAN y el panel las alcanza por su dirección o por su nombre `.local`.

El overlay `docker-compose.prod.yml` retira los nodos simulados a un perfil que no se arranca, deja de publicar los puertos de los servidores de datos y mueve la contraseña de PostgreSQL y el token del controlador a Docker secrets (`docker-compose.prod.yml:1-59`). El resultado son ocho servicios por defecto más el perfil HTTPS opcional. En producción, el panel debe apuntar a los tres ESP32 reales con `NODO1_URL`, `NODO2_URL` y `NODO3_URL`; si no se definen, el panel busca nodos simulados que en ese perfil no existen. La variable `VYBRA_ENTORNO=produccion` hace que los servidores rechacen la clave de desarrollo `vybra`.

La topología admite tres modos. En modo simulado se levantan los once servicios y no hay hardware. En modo real se arrancan las placas y se dejan fuera los contenedores `nodoN`; el controlador detecta que no existe el contenedor y el panel completa la operación con una desconexión lógica del nodo mediante `POST /control` (`server.js:321,326`). En modo mixto conviven placas y nodos simulados, siempre que el panel tenga la lista correcta en `NODOS`.

## 4.6 Flujo completo de un evento

La {{FIG:FIG-ARQ-M03}} muestra la secuencia desde la pulsación hasta la alerta publicada. El recorrido concreto es el siguiente.

1. En reposo, cada nodo mantiene el latido de Raft cada 500 ms y el LED azul fijo cuando conoce un líder. El evento que se describe es simulado: la fuente es el pulsador entre GPIO4 y GND, configurado con `INPUT_PULLUP` y activo en bajo (`detector.ino:50-54,707`).
2. Una pulsación se filtra con un antirrebote de 20 ms. Los pulsos menores de 80 ms se ignoran y el tope de duración es de 60 s. Mientras el botón está presionado, el LED parpadea rápido.
3. Al soltar, el firmware calcula `nivel = min(10, 1 + ms/450)` y `pga = 0.028 · nivel + 0.015`, y construye un evento con identificador único, nodo de origen, duración y hora. El PGA es una magnitud de simulación, no una aceleración medida.
4. Si el nodo es el líder, agrega la entrada a su log. Si es seguidor, la envía al líder con un mensaje `Forward`, reintenta cada 500 ms y la mantiene en una cola de pendientes de hasta 100 eventos.
5. El líder replica con mensajes `Append` de hasta 8 entradas y hasta 4 lotes en vuelo. Cada seguidor responde `AppendResp` con su índice de coincidencia.
6. El índice de confirmación avanza cuando dos de los tres nodos tienen la entrada. El líder comunica el nuevo `commit_index` en el siguiente `Append`. Solo las entradas del término actual pueden confirmarse.
7. Cada nodo aplica a la máquina sísmica las entradas confirmadas. Si el evento no tiene hora (`t` y `t_lider` a cero), no participa en la regla de alerta.
8. La regla de alerta toma el evento disparador y el evento libre más cercano de cada otro detector con diferencia menor o igual a 10.000 ms. Exige al menos dos detectores distintos y no reutiliza eventos ya usados en otra alerta. La severidad sale del promedio de niveles: alta desde 7,5, media desde 4,5, baja por debajo.
9. El agregador sondea `/estado` a 1 Hz y pide `/log`, `/sucesos` y `/alertas` cuando cambian. Con esas respuestas arma la fotografía, infiere el líder y el quórum, y la publica por SSE a ADMIN y CLIENTE. El latido `vivo` sale cada 5 s.
10. En paralelo, el servidor de datos asignado a cada nodo sondea a ese nodo a 1 Hz y escribe muestras, entradas de log, eventos, alertas y sucesos en su PostgreSQL. El nodo no se entera: responde las mismas rutas HTTP que ya usa el panel.
11. Si no hay dos detectores en la ventana de 10 s, o si falta la hora por NTP, no se emite alerta y el evento queda registrado como evento sin alerta. El sistema no convierte una pulsación única en alerta.

[[FIG:FIG-ARQ-M03|Secuencia de un evento simulado: pulsador, propuesta al log de Raft, replicación y commit por mayoría, aplicación de la regla de alerta con dos detectores y publicación por SSE. Fuente: diagrama D-09 del proyecto.]]

## 4.7 Consistencia, quórum y fallos

El sistema prefiere la consistencia sobre la disponibilidad cuando falta mayoría. En términos de CAP se comporta como un sistema CP durante la partición: no confirma en minoría para conservar una única historia del log. La lectura del panel, en cambio, no es lineal. El agregador no habla con Raft, infiere el líder y el quórum a partir de las respuestas de `/estado`. El líder es el nodo disponible con el término más alto; hay quórum cuando al menos dos nodos disponibles reconocen al mismo `lider_conocido`; si no hay líder, la fuente del log es el nodo disponible con mayor `commit_index` (`poller.js:85-106`). Esa inferencia es un indicador operativo y puede quedar atrasada entre dos sondeos.

La implementación tiene límites que condicionan la consistencia. El log vive en RAM (`raft.h:147`); solo el término y el voto se persisten en NVS. Un reinicio en frío pierde el log y un nodo reiniciado puede votar con log vacío. `resincronizar()` descarta el log ya confirmado cuando el nodo choca con un líder legítimo (`raft.cpp:235-253`). El `ForwardAck` se envía al aceptar, no al confirmar (`raft.cpp:301-309`), de modo que un evento puede perderse si el líder cae justo después. No hay snapshots: al llegar a 1000 entradas se rechazan eventos nuevos. Tampoco hay pre-voto ni comprobación de quórum, así que un líder aislado sigue creyéndose líder. La durabilidad del histórico la aporta PostgreSQL, no el consenso.

La {{TABLA:T-ARQ-FALLOS}} resume el comportamiento esperado ante fallos verificados en el código y en la prueba de integración. La columna de consenso describe el efecto sobre el log; la de panel, lo que muestra la fotografía; la de histórico, lo que queda en PostgreSQL.

[[TABLA:T-ARQ-FALLOS|Comportamiento ante fallos de nodos, panel, servidores, bases y controlador.]]
| Escenario | Efecto en el consenso | Efecto en el panel | Efecto en el histórico | Límite que se observa |
|---|---|---|---|---|
| Cae un seguidor | Hay quórum de 2 de 3 y el commit sigue avanzando | Marca el nodo como caído tras tres fallos de `/estado` | Su servidor deja de escribir en su base; las otras dos siguen | El log se conserva en los otros dos nodos |
| Cae el líder | Se elige otro en 5000 a 9000 ms con término más uno | Cambia el líder y el quórum en el siguiente sondeo | Los servidores de los nodos vivos siguen recolectando | Durante la elección no se confirman eventos |
| Caen dos nodos | No hay quórum y el commit no avanza | Publica `quorum:false` | Solo escribe el servidor del nodo que sigue vivo | Los eventos quedan aceptados sin confirmar (`log_len` mayor que `commit_index`) |
| Un nodo aislado se cree líder | Sigue enviando `Append` sin mayoría y no confirma | Puede mostrar dos líderes entre sondeos | No cambia nada | No hay pre-voto ni comprobación de quórum |
| Cae el panel | El clúster sigue operando | No hay fotografía ni SSE | Los tres servidores siguen recolectando | El estado del panel es solo memoria |
| Cae un servidor de datos | El consenso no se entera | La fotografía del clúster sigue; el servidor aparece con error | Ese nodo no escribe en su base | El nodo sigue participando en Raft |
| Cae una base | El consenso no se entera | El servidor responde error y se marca `ok:false` | Las otras dos bases siguen disponibles | No hay copia de seguridad; el volumen es la única copia |
| El log llega a 1000 entradas | Se rechazan eventos nuevos | Deja de recibir entradas nuevas | Lo ya escrito se conserva | No hay snapshots ni compactación |
| Reinicio en frío de la mayoría | El log en RAM se pierde | La fotografía se reconstruye y puede mostrar otro líder | PostgreSQL conserva lo recolectado | El histórico sobrevive; el consenso no |

El quórum mínimo es dos de tres en todas las capas. El quórum que publica el panel es una inferencia, no una validación formada por los nodos. Para saber si una entrada está confirmada de verdad hay que mirar `commit_index` contra `log_len` en la respuesta del nodo, o esperar a que el servidor de datos la marque como confirmada al avanzar el commit. La prueba de integración Docker valida cinco escenarios de apagado y recuperación en 79,2 s; la evidencia del capítulo 5 los detalla.

## 4.8 Qué demuestra el diagrama y qué no

El diagrama demuestra que el sistema es una red distribuida real, con procesos heterogéneos y mecanismos de comunicación verificables. Los puntos que sostiene la evidencia son los siguientes.

- Un consenso replicado entre tres nodos con elección de líder, log replicado, confirmación por mayoría de 2 de 3 y recuperación tras la caída de un nodo.
- Comunicación entre capas distintas: C++ embebido, UDP, HTTP, Node.js, PostgreSQL y navegador, con puertos y protocolos concretos en cada salto.
- Una regla de decisión distribuida que solo emite alerta cuando dos detectores distintos coinciden en una ventana de 10 s.
- Independencia entre la vía de tiempo real y la vía de histórico: si cae el panel, los servidores siguen recolectando; si cae una base, las otras dos siguen.
- Un despliegue reproducible de once servicios y un overlay de producción con secretos y sin puertos publicados de datos.

El diagrama no demuestra lo siguiente, y el manual no debe leerse como si lo hiciera.

- No hay medición sísmica real. La entrada es un pulsador en GPIO4 y el PGA es una magnitud de simulación; no existe acelerómetro, geófono ni ADC.
- El consenso no es durable. El log vive en RAM, no hay snapshots y un reinicio en frío puede perder entradas confirmadas.
- No hay seguridad en el modo por defecto. La API de los nodos y el panel no autentican ni cifran; CORS es abierto y el TLS solo existe en el perfil opcional con Caddy.
- El quórum del panel es una inferencia. La interfaz puede mostrar un clúster sano entre dos sondeos o un líder que ya cayó.
- La topología no demuestra escalado ni alta disponibilidad del panel. La membresía es fija de tres nodos, el panel es un proceso único con estado en memoria y no hay métricas ni trazas distribuidas.
- El diagrama no describe el interior de los contenedores ni el detalle del código. Para el firmware, véase la sección 6; para la instalación y la operación, las secciones 7 y 8; para las pruebas, la sección 5.

La conclusión de arquitectura es acotada: el sistema demuestra el consenso y la comunicación entre capas con valores verificables, y al mismo tiempo declara sus límites. Esa combinación es la que permite evaluar el criterio 4 sin confundir el prototipo con un sistema de alerta sísmica real.

# 5. Evidencias de pruebas

Este capítulo reúne la evidencia que respalda el criterio 5 de la rúbrica: resultados funcionales, de integración, de concurrencia, de rendimiento y de tolerancia a fallos, con tablas de datos reales, figuras y comandos reproducibles. Toda cifra de este capítulo se contrastó con los registros de `entrega/04-evidencias/`, `entrega/05-pruebas/` y con los datos crudos de `entrega/05-pruebas/datos/`.

La campaña física se presenta con su estado real: P0 completada, T1 no aprobada y T2 en adelante sin ejecutar. El evento sísmico es simulado con un pulsador; no hay acelerómetro ni medición sísmica real.

## 5.1 Estrategia y entorno

La validación se organizó en seis niveles. Cuatro son automatizados y no requieren hardware: la red Raft simulada con reloj virtual, la suite JavaScript con dobles de prueba, la persistencia contra tres PostgreSQL reales y la integración con contenedores reales. El quinto es la compilación del firmware y del nodo simulado. El sexto es la campaña física. Cada nivel responde una pregunta distinta y deja un registro fechado con el comando ejecutado.

Las suites de software se re-ejecutaron el 2026-11-18 sobre el commit `0ee5ed4`, versión declarada `v1.0.0-rc1`. El entorno verificado fue el siguiente:

- Sistema operativo Linux 7.3.3-1-cachyos x86_64.
- Compilador g++ (GCC) 16.2.1 y GNU Make 4.4.1.
- ArduinoJson 7.4.3, compilado contra las pruebas y el firmware.
- Node.js v26.13.0 para las suites JavaScript y el agregador.
- arduino-cli 1.5.1 y core `esp32:esp32` 3.3.12 para el firmware.
- Docker 29.9.3 y Docker Compose 5.7.0 para el despliegue.
- Google Chrome 157.0.8103.38 para las capturas de interfaz.

El hardware del clúster son tres placas ESP32 DevKit V1 de 30 pines con USB-serial CP2102, un pulsador por placa entre GPIO4 y GND y el LED azul integrado en GPIO2. La campaña física se ejecutó el 2026-11-17: P0 a las 17:25 y T1 a las 17:31, hora de Colombia (UTC-5). Sus registros conservan el commit `3a274da` que figuraba en la cabecera de los logs de esa jornada; ese hash ya no existe en el historial actual tras la normalización de Git y por eso se cita como histórico, sin alterarlo.

Las evidencias conservan registros fechados con comando y salida. El inventario que asigna identificador a cada pieza está en `entrega/05-pruebas/datos/inventario-evidencias.csv` y se resume en el Anexo D. Los identificadores de red de las evidencias están saneados con marcadores `[IP-N1]`, `[MAC-N1]` y similares; el saneado no alteró índices, términos, duraciones, niveles, códigos HTTP ni resultados.

## 5.2 Resumen de suites

La {{TABLA:T-EV-SUITES}} resume las suites ejecutadas, su comando, el número de casos y el resultado registrado. La suma del núcleo C++ es 78 casos: 32 de Raft, 17 de huella, 11 de la máquina sísmica, 9 de la API y 9 del códec de mensajes. La suite JavaScript ejecuta 60 casos y omite 15 cuando no hay Docker ni PostgreSQL; con tres bases reales ejecuta 70 y omite solo los 5 de integración.

[[TABLA:T-EV-SUITES|Suites de prueba, comandos, casos y resultado registrado el 2026-11-18.]]
| Validación | Comando | Casos | Resultado | Duración | Evidencia |
|---|---|---|---:|---|---|
| Núcleo C++ y red Raft simulada | `make test` en copia a `/tmp/vybra` | 78 en 5 binarios | 78 correctos, 0 fallos, exit 0 | no registrada | `log-TST-01-cpp.txt` |
| Estabilidad C++ en tres corridas | `make test` tres veces seguidas | 234 (78 por corrida) | 0 fallos en cada corrida, exit 0 | no registrada | `log-TST-09-tres-corridas.txt` |
| JavaScript sin servicios externos | `cd web && npm test` | 75 | 60 pasan, 15 omitidas, 0 fallan | 16.598,2 ms | `log-TST-03-js.txt` |
| JavaScript con tres PostgreSQL | `cd web && npm run test:db` | 75 | 70 pasan, 5 omitidas, 0 fallan | 13.778,6 ms | `log-TST-04-test-db.txt` |
| Integración Docker aislada | `cd web && npm run test:infra` | 5 | 5 de 5, 0 fallan | 79,2 s | `log-TST-05-test-infra.txt` |
| Firmware de los tres nodos | `arduino-cli compile` con `-DNODO=1`, `2` y `3` | 3 | 3 de 3 compilan; app de 1.105.728 B y 1.105.712 B | no registrada | `tabla-RES-05-firmware.txt` |
| Nodo simulado | `JSON_DIR=... bash web/nodo-sim/compilar.sh` | 1 | compila; binario de 275.392 B | no registrada | `tabla-RES-05-firmware.txt` |
| Arnés A' de configuración desplegada | no re-ejecutado; registro del 2026-11-17 | 5 | 5 de 5, 0 fallos; mediciones simuladas | no registrada | `log-TST-11-arnes-A-prime.txt` |

La {{FIG:FIG-EV-01}} muestra la salida completa de la suite C++ con los 78 casos aprobados y el pie `[exit=0]`. La salida de los cinco binarios coincide con el conteo de casos declarado en `log-TST-06-arbol-tests.txt`: 9, 17, 9, 32 y 11.

[[FIG:FIG-EV-01|Salida real de la suite C++ con 78 casos aprobados y 0 fallos. Fuente: log-TST-01-cpp.txt, 2026-11-18.]]

El arnés A' de configuración desplegada es histórico. Se ejecutó el 2026-11-17 con 5 casos y 0 fallos, y midió de forma simulada un primer timeout de elección de 5320 ms, un líder elegido a los 5820 ms, un failover de 5500 ms y un commit replicado en los tres nodos en 510 ms. Esos valores no se re-ejecutaron porque el arnés ya no forma parte del repositorio, y no se presentan como mediciones físicas. La carencia de cobertura, de ASan/UBSan y de integración continua está documentada en `log-TST-10-carencia.txt` y se declara en el apartado 5.10.

## 5.3 Pruebas funcionales

Las pruebas funcionales comprueban que cada mecanismo hace lo que declara. La {{TABLA:T-EV-FUNC}} reúne la función, la comprobación concreta y su resultado. Las cifras de cada fila provienen de la salida de los binarios C++ y de los registros de las suites JavaScript.

[[TABLA:T-EV-FUNC|Comprobaciones funcionales por mecanismo y su resultado.]]
| Función | Comprobación | Resultado | Evidencia |
|---|---|---|---|
| Elección de líder | `elige_un_unico_lider`, `un_voto_por_termino`, `cae_el_lider_y_se_reelige` | 3 casos correctos dentro de 32 de Raft | `log-TST-01-cpp.txt` |
| Replicación por lotes | `append_respeta_8_entradas`, `append_ida_y_vuelta` | lote máximo de 8 entradas y códec estable | `log-TST-01-cpp.txt` |
| Confirmación por mayoría | `sin_quorum_queda_pendiente_y_luego_confirma`, `commit_lider_es_el_del_ultimo_append` | no confirma sin mayoría y confirma al recuperarla | `log-TST-01-cpp.txt` |
| Reenvío y deduplicación | `evento_en_seguidor_llega_por_forward`, `lider_rechaza_id_duplicado` | un evento por id, sin duplicados | `log-TST-01-cpp.txt` |
| Recuperación de un nodo | `nodo_reiniciado_se_pone_al_dia_en_menos_de_1s`, `reinicio_de_lider_y_seguidor_resincroniza_al_sobreviviente` | converge desde el índice 1 | `log-TST-01-cpp.txt` |
| Máquina sísmica | `test_sismo`: 11 casos de nivel, PGA, ventana de 10 s y tope de eventos | 11 de 11 correctos | `log-TST-01-cpp.txt` |
| API HTTP del nodo | `test_api`: 9 casos de estado, log, sucesos y alertas | 9 de 9 correctos | `log-TST-01-cpp.txt` |
| Códec de mensajes | `test_mensajes`: 9 casos de ida y vuelta y rechazo de basura | 9 de 9 correctos | `log-TST-01-cpp.txt` |
| Huella WiFi | `test_huella`: 17 casos de comparación, unión y movimiento | 17 de 17 correctos | `log-TST-01-cpp.txt` |
| Agregador, poller y SSE | `npm test`: foto agregada, log incremental, SSE, control y estáticos | 60 casos ejecutados, 0 fallos | `log-TST-03-js.txt` |
| Persistencia PostgreSQL | `npm run test:db`: esquema, escritura idempotente, filtros, paginación y retención | 70 casos ejecutados, 0 fallos | `log-TST-04-test-db.txt` |
| Contrato de `/estado` | `nodo falso: /estado trae situacion como el firmware (18 claves)` | 18 claves, incluida `situacion` | `log-TST-03-js.txt` |
| Stack de once servicios | `docker compose ps` y healthchecks | 11 arriba, 10 sanos y panel sin healthcheck | `log-INF-02-03-contenedores.txt` |
| Firmware compilable | Tres nodos con firmware de aplicación de ~1,105 MB al 84 % de la partición | 3 de 3, exit 0 | `tabla-RES-05-firmware.txt` |

La {{FIG:FIG-EV-04}} muestra la salida de los 32 casos de Raft, el bloque funcional de mayor peso del núcleo. Los nombres de los casos corresponden a los escenarios de elección, latido, replicación, reenvío, reinicio y quórum que se describen en el capítulo 4.

[[FIG:FIG-EV-04|Salida real de los 32 casos de la suite Raft con 0 fallos. Fuente: log-TST-02-raft.txt y log-TST-01-cpp.txt, 2026-11-18.]]

La persistencia se probó contra tres PostgreSQL efímeros, uno por servidor de datos, con la variable que obliga a usar base real: si falta una base, la prueba falla en lugar de omitirse. La {{FIG:FIG-EV-02}} muestra el resumen con 70 casos aprobados, 5 omitidos y 0 fallos. En el stack de demostración, los cuatro eventos y las dos alertas generados el 2026-11-18 entre 11:14:57 y 11:17:53 quedaron persistidos en las tres bases, con 116 a 118 muestras por base.

[[FIG:FIG-EV-02|Salida real de la suite con tres PostgreSQL: 70 casos aprobados, 5 omitidos y 0 fallos. Fuente: log-TST-04-test-db.txt, 2026-11-18.]]

## 5.4 Integración y concurrencia

La integración se ejecutó contra contenedores reales en un proyecto de composición aislado, `vybraint`, con puertos y volúmenes propios que se destruyen al terminar. Los cinco casos comprueban el arranque del stack con Raft real y sin exponer el socket de Docker, el apagado y encendido de cada servidor, el cambio de líder, la pérdida de quórum y la recuperación. La {{TABLA:T-EV-INT}} resume los escenarios.

[[TABLA:T-EV-INT|Escenarios de integración y concurrencia y resultado observado.]]
| Escenario | Prueba | Resultado observado | Evidencia |
|---|---|---|---|
| Elección y failover con Raft real | `Raft real: elección, caída del líder, reelección, reincorporación sincronizada y pérdida de quórum` | correcto en 16.527,8 ms | `log-TST-03-js.txt` |
| Apagado del servidor 1 con Docker real | caso 1 de `test:infra` | solo cae su nodo y su servidor; Raft lo detecta y se reincorpora sincronizado en 15,9 s | `log-TST-05-test-infra.txt` |
| Apagado del servidor 2 con Docker real | caso 2 de `test:infra` | mismo comportamiento en 15,7 s | `log-TST-05-test-infra.txt` |
| Apagado del servidor 3 con Docker real | caso 3 de `test:infra` | mismo comportamiento en 14,9 s | `log-TST-05-test-infra.txt` |
| Pérdida de quórum y recuperación | caso 4 de `test:infra` | con 1 de 3 no se confirma nada; al volver la mayoría se confirma todo, en 32,1 s | `log-TST-05-test-infra.txt` |
| Escritura sin duplicados | `una orden con el mismo ref no se duplica` | una sola fila por orden y en el servidor de su nodo | `log-TST-04-test-db.txt` |
| Base caída | `si una base cae, el resto sigue y el panel lo dice` | el resto responde y el panel informa la base caída | `log-TST-04-test-db.txt` |
| Concurrencia de sondeo | `poller: nunca dos pedidos simultáneos al mismo nodo` | sin peticiones solapadas al mismo nodo | `log-TST-03-js.txt` |
| Nodo colgado | `poller: nodo colgado no frena a los demás` y `control: nodo colgado da 502 por tiempo` | el sondeo continúa; el control responde 502 por tiempo | `log-TST-03-js.txt` |
| Flujo SSE de 12 s | `timeout 12 curl -sN http://127.0.0.1:8095/api/stream` | evento `estado` inicial y latido `vivo` cada 5 s | `log-RES-04-sse.txt` |

La concurrencia se prueba en dos frentes. En el núcleo, la red simulada entrega mensajes con retrasos y reordenamientos controlados, y los casos verifican que dos candidatos simultáneos no producen dos líderes en el mismo término, que un `Append` duplicado no duplica la entrada y que dos propuestas con el mismo identificador se deduplican en el líder.

En el agregador y en los servidores de datos, las pruebas levantan un servidor HTTP real y tres procesos de nodo que se comunican por UDP, y comprueban que el poller tolera respuestas lentas, que el flujo SSE envía el estado inicial y los latidos y que el cierre de la conexión libera temporizadores.

El flujo SSE se midió durante 12 segundos y quedó registrado en `log-RES-04-sse.txt`. El evento `estado` inicial llegó con las marcas `t=1795018833643` y los dos latidos con `t=1795018838645` y `t=1795018843648`, separados 5 s entre sí, lo que coincide con la constante `VIVO_MS = 5000` de `web/server.js`. La foto mostraba los tres nodos alcanzables, quórum verdadero, líder 1, término 3, cinco entradas de log y dos alertas. La {{FIG:FIG-EV-03}} muestra el resumen de los cinco casos de integración.

[[FIG:FIG-EV-03|Salida real de la integración Docker: 5 casos aprobados, 0 fallos, 79,2 s. Fuente: log-TST-05-test-infra.txt, 2026-11-18.]]

## 5.5 Rendimiento

El rendimiento del panel se midió con cinco peticiones de calentamiento y 100 mediciones secuenciales de `GET /api/estado` sobre el stack real de once servicios, descargando el cuerpo completo. La latencia es la del panel en el equipo local, no la de los nodos ESP32; la medición física de la API de las placas es una evidencia pendiente y no se presenta como resultado. La {{TABLA:T-EV-LAT}} resume las estadísticas.

[[TABLA:T-EV-LAT|Latencia de GET /api/estado del panel sobre 100 muestras.]]
| Estadística | Valor |
|---|---:|
| Mínimo | 0,407 ms |
| Mediana | 0,613 ms |
| Media | 0,672 ms |
| Percentil 95 | 1,097 ms |
| Percentil 99 | 1,184 ms |
| Máximo | 1,338 ms |
| Muestras | 100 |

El percentil 95 de 1,097 ms cumple el criterio del requisito RNF-07, que exige menos de 2 ms en el stack local. La {{FIG:FIG-EV-05}} representa la serie completa de las 100 muestras con la mediana y el percentil 95 marcados.

[[FIG:FIG-EV-05|Distribución de las 100 latencias de GET /api/estado del panel con mediana y percentil 95. Fuente: evidencia RES-02 del 2026-11-18.]]

El consumo se midió con `docker stats` en streaming durante 21 segundos, con 39 o 40 muestras por contenedor. La {{TABLA:T-EV-CPU}} resume la CPU y la memoria medias y máximas de los once servicios.

[[TABLA:T-EV-CPU|Consumo medio y máximo de los once contenedores (docker stats, 39 a 40 muestras).]]
| Contenedor | CPU media (%) | CPU máxima (%) | RAM media (MiB) | RAM máxima (MiB) |
|---|---:|---:|---:|---:|
| `sismo-controlador` | 2,13 | 10,57 | 18,75 | 19,59 |
| `sismo-db-1` | 0,98 | 4,71 | 33,48 | 33,98 |
| `sismo-db-2` | 0,92 | 3,65 | 31,67 | 31,86 |
| `sismo-db-3` | 1,02 | 4,46 | 26,69 | 27,08 |
| `sismo-nodo-1` | 0,83 | 3,31 | 4,10 | 4,79 |
| `sismo-nodo-2` | 0,82 | 3,46 | 1,24 | 2,41 |
| `sismo-nodo-3` | 0,80 | 2,99 | 1,68 | 7,28 |
| `sismo-panel` | 0,38 | 2,77 | 92,41 | 93,10 |
| `sismo-servidor-1` | 3,90 | 18,97 | 99,04 | 109,00 |
| `sismo-servidor-2` | 2,25 | 10,10 | 100,47 | 100,90 |
| `sismo-servidor-3` | 5,09 | 25,88 | 99,54 | 111,50 |

Los servidores de datos son los procesos con más memoria, con 99,04 a 100,47 MiB de media; el panel usa 92,41 MiB y las bases entre 26,69 y 33,48 MiB. Los nodos simulados son los más livianos, con 1,24 a 4,10 MiB, porque solo ejecutan el núcleo y el servidor HTTP. La {{FIG:FIG-EV-06}} representa ambas magnitudes por contenedor.

[[FIG:FIG-EV-06|Consumo medio de RAM y CPU de los once contenedores del stack. Fuente: evidencia RES-10 del 2026-11-18.]]

Estas cifras no describen el consumo de las placas ESP32. El firmware informa su propio uso de memoria en la compilación: 54.264 B de RAM, un 16 % de la disponible, y una aplicación de 1.105.728 B, un 84 % de la partición de 1.310.720 B. El consumo medido con `docker stats` corresponde al nodo simulado y a los servicios del despliegue.

## 5.6 Tolerancia a fallos

La tolerancia a fallos se probó con fallos controlados en el núcleo, en el agregador y en los contenedores. La {{TABLA:T-EV-FALLO}} reúne el escenario, la acción ejecutada, el resultado observado y la evidencia. Los escenarios del núcleo usan la red simulada, que permite reproducir pérdidas y reinicios sin depender de la WiFi real.

[[TABLA:T-EV-FALLO|Escenarios de fallo, acción y resultado observado.]]
| Fallo o escenario | Acción | Resultado observado | Evidencia |
|---|---|---|---|
| Caída del líder | `cae_el_lider_y_se_reelige` | se elige un nuevo líder y el término avanza | `log-TST-01-cpp.txt` |
| Sin quórum | `sin_quorum_no_hay_lider` y `particion_minoritaria_no_confirma` | no hay líder en la minoría ni confirmación | `log-TST-01-cpp.txt` |
| Nodo reiniciado | `nodo_reiniciado_se_pone_al_dia_en_menos_de_1s` | se pone al día en menos de 1 s | `log-TST-01-cpp.txt` |
| Pérdida del 20 % de paquetes | `con_perdida_20_por_ciento_igual_elige` | el clúster elige líder igual | `log-TST-01-cpp.txt` |
| Log lleno | `log_lleno_rechaza` | rechaza entradas nuevas sin corromper el log | `log-TST-01-cpp.txt` |
| Servidor apagado con Docker real | casos 1 a 3 de `test:infra` | solo cae lo suyo y se reincorpora sincronizado | `log-TST-05-test-infra.txt` |
| Dos de tres servicios apagados | caso 4 de `test:infra` | no se confirma nada; al recuperar la mayoría se confirma todo | `log-TST-05-test-infra.txt` |
| Base PostgreSQL caída | prueba de base caída en `test:db` | el resto sigue y el panel lo informa | `log-TST-04-test-db.txt` |
| Nodo inalcanzable o colgado | pruebas del poller y del control | el sondeo no se detiene; el control responde 502 por tiempo | `log-TST-03-js.txt` |
| Resincronización de emergencia | `reinicio_de_lider_y_seguidor_resincroniza_al_sobreviviente` | el nodo sobreviviente recompone el estado | `log-TST-01-cpp.txt` |

Los escenarios de la suite C++ cubren además el rechazo de candidatos con log desactualizado, la pérdida de mensajes por filtro, el tope de sucesos y el reinicio del temporizador cuando el líder baja. Lo que no se probó es el comportamiento ante fallos bizantinos ni ante un ataque, porque están fuera del modelo de fallos declarado. Tampoco se mide aquí la pérdida de paquetes de una red WiFi real; los valores de latencia, reelección y pérdidas físicas figuran como pendientes en el inventario (`RES-01`, `RES-03`, `RES-07`, `RES-08` y `RES-09`).

## 5.7 Campaña física

La campaña física se diseñó por fases. La fase de preparación P0 verifica que las placas resuelven por mDNS, responden a la identificación y a la API y toma instantáneas previas y posteriores. La prueba T1 ejecuta una pulsación controlada de unos 900 milisegundos y comprueba que se produce un único evento, que el clúster lo replica y confirma y que el nivel y el PGA coinciden con la fórmula. La {{TABLA:T-EV-FIS}} reúne el estado real de cada bloque.

[[TABLA:T-EV-FIS|Campaña física: bloques, comprobaciones y resultado real.]]
| Bloque | Fecha | Comprobación | Resultado | Evidencia |
|---|---|---|---|---|
| P0 preparación | 2026-11-17 17:25 | 12 consultas de `/estado`, `/log`, `/sucesos` y `/alertas` antes y 12 después | 12 de 12 y 12 de 12 correctas | `FIS-00-p0.txt` |
| P0 identidad y línea base | 2026-11-17 17:25 | Tres nodos responden y reportan su identidad; término 739, `log_len` 1 y commit 1; líder el Nodo 2 con hora NTP | correcto; 10 de 10 validaciones de `/api/estado` | `FIS-00-p0.txt` |
| P0 capturas | 2026-11-17 17:26 | Captura del panel y de la vista pública | 2 de 2 PNG de 1400x900 válidos; el panel muestra líder S2, término 739 y 3 de 3 activos | `cap-FIS-00-panel.png` |
| Captura pasiva del puerto serie | 2026-11-17 | Prueba de 8 s por usbmon, sin abrir el puerto ni pulsar | 42.773 B crudos del bus, 0 datos de los CP2102; `uptime_ms` creciente; término, log y commit 739, 3 y 3 sin cambios | `FIS-02-serial-dryrun.txt` |
| T1 pulsación | 2026-11-17 17:31 | Una pulsación de ~900 ms debe producir un evento de nivel 3 y PGA 0,099 | no aprobada: dos eventos de 301 ms y 174 ms separados 3,2 s, con nivel 1 y PGA 0,043 en ambos | `FIS-01-verificacion.txt` |
| T1 replicación y confirmación | 2026-11-17 17:31 | Mismo id en los tres nodos, log y commit avanzan, sin pendientes | ids `nodo-2-f7eee098-1` y `nodo-2-f7eee098-2` idénticos en los tres; log de 1 a 3 y commit de 1 a 3; pendientes 0 | `FIS-01-verificacion.txt` |
| T1 alerta | 2026-11-17 17:31 | Sin alerta cuando interviene un solo detector | 0 alertas y `en_alerta=false` en los tres nodos; comportamiento correcto | `FIS-01-verificacion.txt` |
| FIS-03 fotografías | recibidas 2026-11-18 | Montaje real de una ESP32 DevKit V1, protoboard y pulsador B3F-4055 | 3 fotografías; acreditan el montaje, no la operación ni los estados del LED | `fot-FIS-03-prototipo-montado-*.png` |
| T2 en adelante | no ejecutado | Coincidencia de dos detectores, fuera de ventana, failover, recuperación, quórum físico, router y seguidor | pendiente de autorización | `FIS-04` a `FIS-15` |

La {{TABLA:T-EV-FIS}} deja el resultado de T1 sin ambigüedad: la prueba no se aprobó. Una pulsación produjo dos eventos cortos de 301 y 174 milisegundos, separados 3,2 segundos, en lugar de uno de alrededor de 900. La reconstrucción temporal del diagnóstico da un hueco de 3,223 s entre la liberación del primer evento y la del segundo. Los dos eventos tienen identificadores distintos e idénticos en los tres nodos, y el log pasó de longitud 1 a 3 con el índice de confirmación acompañando el cambio.

La verificación automática marcó tres fallos, uno por nodo, porque esperaba una sola entrada nueva (log 2 y commit 2) y encontró dos.

El nivel y el PGA coinciden con la fórmula para las duraciones medidas: `min(10, 1 + 301/450) = 1` y `0,028 * 1 + 0,015 = 0,043`. El cálculo y el consenso funcionaron; la anomalía está en la entrada física. No se creó alerta y eso es correcto, porque intervino un solo detector.

El diagnóstico descarta el firmware. Un contacto mantenido habría producido un solo evento y un rebote habría producido fragmentos separados por milisegundos, no por tres segundos. Las causas probables son el cableado, la colocación de las patas del pulsador o el desgaste del contacto. El plan de corrección incluye reasentar o sustituir los cables dupont, verificar el cableado en diagonal, añadir un condensador de 100 nF entre D4 y GND y repetir una pulsación con la captura pasiva. La repetición de T1 queda pendiente como `FIS-15`, y T2 en adelante no se ejecutaron.

La {{FIG:FIG-EV-07}} muestra la pestaña Clúster Raft del panel ADMIN sobre el stack Docker real; sirve para ilustrar cómo el panel representa líder, seguidores y replicación, no como evidencia de la campaña física. La {{FIG:FIG-EV-08}} es la captura real del panel durante P0, con el líder S2, el término 739 y los tres detectores activos. La {{FIG:FIG-EV-09}} es la fotografía del prototipo montado: la ESP32 DevKit V1 insertada en la protoboard y los dos cables que salen hacia el pulsador.

[[FIG:FIG-EV-07|Pestaña Clúster Raft de ADMIN con el líder S1, dos seguidores y la línea de tiempo del consenso. Fuente: captura del stack Docker real, 2026-11-18.]]

[[FIG:FIG-EV-08|Captura real del panel durante P0: líder S2, término 739, 3 de 3 detectores activos y conexión establecida. Fuente: cap-FIS-00-panel.png, 2026-11-17.]]

[[FIG:FIG-EV-09|Detalle del prototipo montado: ESP32 DevKit V1 en la protoboard y cables hacia el pulsador. Fuente: fot-FIS-03-prototipo-montado-b.png, recibida el 2026-11-18.]]

## 5.8 Matriz requisito, evidencia y resultado

La {{TABLA:T-EV-MATRIZ}} contrasta los requisitos del capítulo 6 con la evidencia disponible y con su estado real. La columna de resultado distingue lo cumplido con evidencia de software o de Docker, lo cumplido con verificación por código y lo que depende de la campaña física.

[[TABLA:T-EV-MATRIZ|Requisito, evidencia principal y resultado real.]]
| Requisito | Evidencia | Resultado |
|---|---|---|
| RF-01 Clúster con un líder por término | `test_raft` (`TST-01`), `test:infra` (`TST-05`) | cumple con evidencia de software y Docker; la elección física no se midió |
| RF-02 Replicación de un log ordenado | `test_raft`, `log-RES-04-sse.txt` | cumple |
| RF-03 Confirmación con mayoría de dos de tres | `test_raft` y `test:infra` | cumple |
| RF-04 Reenvío al líder y deduplicación | `test_raft` | cumple |
| RF-05 Recuperación de un nodo tras caída | `test_raft` y `test:infra` | cumple en software y Docker; la recuperación física queda en `FIS-10` |
| RF-06 Alerta con dos detectores en 10 s | `test_sismo` y alertas de la demostración | cumple con evidencia de software; la prueba física con dos detectores es `FIS-07` y está pendiente |
| RF-07 Estado y alertas por HTTP en dos interfaces | `npm test`, capturas `OP-01` a `OP-10` y `CLI-01` a `CLI-12`, `RES-04` | cumple |
| RF-08 Histórico en PostgreSQL con filtros y paginación | `npm run test:db` (`TST-04`) y los 4 eventos y 2 alertas persistidos | cumple |
| RF-09 Apagar y encender servidores desde el panel | `test:infra` (`TST-05`) y `INF-02/03` | cumple con Docker; con ESP32 físicos solo se probó el flujo por código |
| RF-10 Simular caída y recuperación de un nodo | `test_raft` y `test:infra` | cumple en software y Docker; la prueba física es `FIS-09` y `FIS-10` |
| RNF-01 Operar con la pérdida de un nodo | `test_raft` y `test:infra` | cumple |
| RNF-02 Respetar el presupuesto de memoria del firmware | `RES-05` y el log de compilación `NOD-11`: 54.264 B de RAM (16 %) y 84 % de flash | cumple |
| RNF-03 Tiempo real por SSE con latido | `log-RES-04-sse.txt` y `npm test` | cumple; latido cada 5 s |
| RNF-04 Reproducible sin hardware | `TST-01`, `TST-03`, `TST-04`, `TST-05` y 11 contenedores | cumple |
| RNF-05 Seguridad mínima de operación | Controlador aislado, token y secretos fuera del repositorio (`TST-05`) | cumple con verificación por código y pruebas; no se arrancó producción como evidencia |
| RNF-06 Trazabilidad de la evidencia | Inventario con identificadores y logs fechados | cumple |
| RNF-07 Latencia del panel por debajo de 2 ms | `RES-02`: percentil 95 de 1,097 ms | cumple para el panel; la latencia física es `RES-01` y está pendiente |
| RNF-08 Crecimiento del histórico con paginación y retención | `test:db` | cumple |

El contraste es desigual y se declara así. Los requisitos funcionales RF-01 a RF-10 tienen evidencia de software, de Docker o de ambas. Los no funcionales RNF-01 a RNF-08 también, con la salvedad de que la latencia medida es la del panel y no la del nodo físico. La campaña física es la única parte que no cierra: T1 no se aprobó y T2 en adelante no se ejecutaron. Por eso el sistema se declara validado en software y con la campaña física en curso, no validado con hardware.

## 5.9 Comandos para reproducir cada evidencia

Los comandos siguientes se ejecutan desde la raíz del repositorio salvo que se indique otra cosa. Reproducen las suites, el despliegue, las mediciones y la campaña física. La compilación del firmware requiere arduino-cli y el core de ESP32; la campaña física requiere las tres placas conectadas.

Las suites del núcleo C++ se compilan y ejecutan sobre una copia temporal para no escribir en el repositorio:

```bash
mkdir -p /tmp/vybra && cp -a firmware/test /tmp/vybra/test
mkdir -p /tmp/vybra/detector && cp -a firmware/detector/src /tmp/vybra/detector/src
cd /tmp/vybra/test && make JSON_DIR="$HOME/Arduino/libraries/ArduinoJson/src" test
```

Las suites JavaScript y las dos ejecuciones con dependencias reales:

```bash
cd web
npm test            # 75 casos: 60 pasan, 15 omitidas
npm run test:db     # 75 casos: 70 pasan, 5 omitidas, con 3 PostgreSQL efímeros
npm run test:infra  # 5 casos con Docker real en el proyecto aislado vybraint
```

El firmware de cada nodo y el nodo simulado:

```bash
arduino-cli compile --fqbn esp32:esp32:esp32 \
  --build-property "compiler.cpp.extra_flags=-DNODO=1" \
  --build-path /tmp/fw1 firmware/detector
JSON_DIR=$HOME/Arduino/libraries/ArduinoJson/src bash web/nodo-sim/compilar.sh
```

El despliegue, el estado del panel y el flujo SSE:

```bash
docker compose up -d --build
docker compose ps
curl -s http://127.0.0.1:8095/api/estado
timeout 12 curl -sN http://127.0.0.1:8095/api/stream
```

El consumo se mide con el mismo formato que usó la evidencia RES-10:

```bash
docker stats --format "{{.Name}};{{.CPUPerc}};{{.MemUsage}};{{.MemPerc}}"
```

La medición RES-02 no dejó un script en el repositorio: su método está en la cabecera de `tabla-RES-02-latencia-api.txt` y los datos crudos en `RES-02-latencia-api.csv`. Una forma equivalente con `curl` es ejecutar 100 peticiones y anotar el tiempo total de cada una:

```bash
for i in $(seq 1 100); do
  curl -o /dev/null -s -w '%{time_total}\n' http://127.0.0.1:8095/api/estado
done
```

El apagado y el encendido de un servidor se pueden reproducir contra la API del panel, con la confirmación obligatoria y el tipo de contenido JSON:

```bash
curl -s -X POST http://127.0.0.1:8095/api/infra/servidores/2/apagar \
  -H 'Content-Type: application/json' -d '{"confirmar":true}'
```

La campaña física usa los comandos del capítulo 3 y los scripts de la campaña. P0 se repite con las placas conectadas y las IP anotadas en `entrega/05-pruebas/datos/ips.env`. El script de verificación de T1 se ejecuta después de la pulsación:

```bash
bash entrega/05-pruebas/scripts/fis-p0.sh
getent hosts sismo-nodo-1.local sismo-nodo-2.local sismo-nodo-3.local
curl -s -m 2 http://IP_DEL_NODO/estado
bash entrega/05-pruebas/scripts/fis-t1-verificar.sh
```

Para observar el descubrimiento y los latidos en la red, y para identificar o flashear una placa:

```bash
sudo tcpdump -ni any -tttt 'udp port 4210 or udp port 4211'
cd firmware
./quien.sh
./cargar.sh 1
```

Para borrar la NVS y dejar una placa como nueva, el comando de la campaña es:

```bash
esptool.py --chip esp32 erase_region 0x9000 0x5000
```

## 5.10 Límites de la evidencia

La evidencia tiene límites que conviene declarar antes de leer los resultados como una validación completa del sistema.

1. No hay medición de cobertura de código, ni compilación con AddressSanitizer o UndefinedBehaviorSanitizer, ni integración continua. El repositorio no contiene esa configuración y la carencia está documentada en `log-TST-10-carencia.txt`. Las pruebas son funcionales y no se presenta una cobertura que no existe.
2. No se ejecutaron pruebas de carga con herramientas como k6 o Apache Bench, ni se midió el comportamiento con decenas de clientes simultáneos. El sistema está dimensionado para un operador y una vista pública en una red local, no para una audiencia masiva.
3. La latencia de 1,097 ms de percentil 95 es la del panel en el equipo local, no la de las placas. La medición de los ESP32 (`RES-01`) y la gráfica combinada (`RES-08`) están pendientes de hardware.
4. El consumo se midió durante 21 segundos con 39 o 40 muestras por contenedor. No es un perfil de largo plazo ni incluye el consumo de las placas reales.
5. La campaña física está incompleta: P0 se completó, T1 no se aprobó y T2 en adelante no se ejecutaron. Las piezas `FIS-04` a `FIS-15` siguen pendientes, incluidas las pruebas que acreditarían los estados del LED, la alerta con dos detectores, la reelección física, el quórum físico y el reinicio del router.
6. Las tres fotografías de FIS-03 acreditan el montaje, no la operación del firmware ni la identidad `SIS-Dn`. Por eso no sustituyen a FIS-04 ni a FIS-05.
7. Las mediciones físicas de reelección (`RES-03`), número de eventos y alertas (`RES-07`) y la gráfica de reelección (`RES-09`) no existen. No se inventan resultados para completarlas.
8. El arnés A' de configuración desplegada es un registro histórico del 2026-11-17 que no se puede re-ejecutar porque ya no está en el repositorio. Sus cifras son simuladas, no físicas.
9. El perfil HTTPS con Caddy está implementado y documentado, pero no se arrancó para capturar el panel en 8443. El arranque de producción se verificó por configuración y por código, no con un despliegue completo.
10. El evento es simulado con un pulsador; no hay acelerómetro ni medición sísmica real. El nivel y el PGA se calculan con la duración del pulso según la escala de simulación.
11. Los logs físicos conservan el commit `3a274da` de su fecha, que ya no existe tras la normalización del historial. Se identifican como históricos y no se alteraron. Los identificadores de red están saneados y los resultados no.
12. El quórum que muestra el agregador es una inferencia (dos o más nodos disponibles que reconocen al mismo líder), no una validación de consenso, y el `ForwardAck` se emite al aceptar y no al confirmar. Ambas limitaciones del sistema están documentadas en el capítulo 10.

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

# 7. Instalación y ejecución del software

Este capítulo instala la parte de software del sistema: obtiene el código, configura el entorno, levanta el stack con Docker, abre las dos interfaces, explica los modos de operación y las pruebas rápidas. El montaje físico y el flasheo del firmware no se repiten aquí; están en la sección 3 y en la sección 6. Todos los comandos se ejecutan desde la raíz del repositorio salvo que se indique otra ruta.

## 7.1 Obtener el código

El código se obtiene del repositorio Git, en el commit `0ee5ed4`. No hay ZIP ni snapshot duplicado: el código versionado es la fuente de verdad.

```bash
git clone <url-del-repositorio>
cd "detector de sismos en red distribuida"
git log -1 --format='%H%n%ad%n%s'
```

Salida esperada para esta entrega:

```text
0ee5ed4a626c28904db55ab6e436e040c03f046c
Wed Nov 18 10:58:38 2026 -0500
chore: retira material de diseño histórico, prompts y planes internos
```

> El tag `v1.0.0-rc1` apunta al commit `f567487`, 49 commits por detrás de `0ee5ed4`. No hagas `git checkout v1.0.0-rc1` si quieres el código de esta entrega; usa el commit `0ee5ed4`.

El snapshot no incluye `firmware/detector/secretos.h`, ningún archivo `.env`, `node_modules/` ni los directorios locales `web/certs/` y `web/datos/`. Todo eso se crea o se instala en los pasos siguientes. Si se parte del snapshot, la raíz del proyecto es `alerta-sismica-0ee5ed4/`; de aquí en adelante se escribe "raíz del repositorio" para cualquiera de las dos rutas.

## 7.2 El archivo `.env`

Docker Compose lee automáticamente un archivo `.env` en la raíz del proyecto. La plantilla versionada es `ejemplo.env`; cópiala y edítala:

```bash
cp ejemplo.env .env
```

`.env` está en `.gitignore` y no se versiona. El archivo del equipo de validación solo contiene las tres direcciones de las placas reales (`NODO1_URL`, `NODO2_URL` y `NODO3_URL`); no contiene contraseñas. La {{TABLA:T-ENV}} reúne las variables que acepta el despliegue.

[[TABLA:T-ENV|Variables de entorno del despliegue, con su valor por defecto y su uso.]]
| Variable | Por defecto | Uso |
|---|---|---|
| `NODO1_URL`, `NODO2_URL`, `NODO3_URL` | sin definir (se usan los nodos simulados) | dirección de cada ESP32 real, sin barra final; por ejemplo `http://192.168.1.50` |
| `NODOS` | derivado de `NODO1_URL` a `NODO3_URL` | lista que usa el panel (`http://n1,http://n2,http://n3`); solo se define para sobrescribirla |
| `PUERTO_PANEL` | 8095 | puerto del panel en el host |
| `PUERTO_NODO1`, `PUERTO_NODO2`, `PUERTO_NODO3` | 9001, 9002, 9003 | puertos de los nodos simulados en el host |
| `PUERTO_SERVIDOR1`, `PUERTO_SERVIDOR2`, `PUERTO_SERVIDOR3` | 8101, 8102, 8103 | puertos de los servidores de datos en el host |
| `PUERTO_HTTPS` | 8443 | puerto del perfil HTTPS |
| `HOST_PUBLICO` | `192.168.80.227` (valor de ejemplo de Compose) | IP o nombre con el que se entra al panel HTTPS |
| `DB_PASSWORD` | `vybra` | clave de las bases; solo desarrollo, nunca en producción |
| `CONTROL_TOKEN` | `vybra-control-dev` | token entre panel y controlador; solo desarrollo |
| `RETENCION_ACTIVA` y el resto de `RETENCION_*` | todo desactivado | retención y archivado del histórico |
| `PREFIJO` | `sismo` | prefijo de los nombres de contenedor |
| `SERVIDORES`, `CONTROLADOR_URL`, `PUERTO` | los fija `docker-compose.yml` | no se definen en `.env` |

> En producción no definas `DB_PASSWORD` ni `CONTROL_TOKEN` en `.env`: la superposición `docker-compose.prod.yml` las anula y usa secretos de archivo (sección 7.7).

## 7.3 Arranque con Docker

El perfil por defecto levanta 11 servicios. Primero se valida la composición y después se construye y se arranca:

```bash
docker compose config --services | sort
```

Salida esperada:

```text
controlador
db1
db2
db3
nodo1
nodo2
nodo3
panel
servidor1
servidor2
servidor3
```

```bash
docker compose up -d --build
docker compose ps
```

La primera construcción necesita red: la imagen del nodo simulado descarga ArduinoJson 7.4.3 desde GitHub y las imágenes base se descargan de sus registros. Es normal que tarde varios minutos. La {{TABLA:T-SERV}} describe cada servicio, su contenedor y su puerto.

[[TABLA:T-SERV|Servicios del despliegue por defecto y del perfil HTTPS.]]
| # | Servicio | Contenedor | Imagen o construcción | Puerto en el host |
|---|---|---|---|---|
| 1 | `nodo1` | `sismo-nodo-1` | `Dockerfile.nodo-sim` sobre Debian 12 | 9001 |
| 2 | `nodo2` | `sismo-nodo-2` | `Dockerfile.nodo-sim` sobre Debian 12 | 9002 |
| 3 | `nodo3` | `sismo-nodo-3` | `Dockerfile.nodo-sim` sobre Debian 12 | 9003 |
| 4 | `db1` | `sismo-db-1` | `postgres:16-alpine` | sin publicar |
| 5 | `db2` | `sismo-db-2` | `postgres:16-alpine` | sin publicar |
| 6 | `db3` | `sismo-db-3` | `postgres:16-alpine` | sin publicar |
| 7 | `servidor1` | `sismo-servidor-1` | `Dockerfile.fedora` sobre Fedora 42 | 8101 |
| 8 | `servidor2` | `sismo-servidor-2` | `Dockerfile.suse` sobre openSUSE Leap 15.6 | 8102 |
| 9 | `servidor3` | `sismo-servidor-3` | `Dockerfile.ubuntu` sobre Ubuntu 24.04 | 8103 |
| 10 | `controlador` | `sismo-controlador` | `Dockerfile.controlador` sobre `node:22.22-alpine` | sin publicar |
| 11 | `panel` | `sismo-panel` | `web/Dockerfile` sobre `node:22.22-alpine` | 8095 |
| 12 | `https` | `sismo-https` | `caddy:2-alpine` | 8443, solo con `--profile https` |

Los nombres de contenedor llevan el prefijo `PREFIJO`, que por defecto es `sismo`. Esperado tras `docker compose ps`: 11 contenedores arriba, 10 con estado `healthy` y el panel en `Up` sin healthcheck propio. Los healthchecks están definidos en `docker-compose.yml:19-24`, `25-32`, `52-56` y `159-163`; el panel no tiene ninguno.

El registro del panel confirma que arrancó:

```bash
docker compose logs -f panel
```

Salida esperada (la segunda línea incluye la IP interna del contenedor):

```text
Servidores de datos: S1 http://servidor1:8100 · S2 http://servidor2:8100 · S3 http://servidor3:8100
Panel: http://172.20.0.5:8090  Vista pública: http://172.20.0.5:8090/publico
Si el firewall bloquea el celular: sudo ufw allow from <tu subred>/24 to any port 8095 proto tcp
```

`Ctrl+C` cierra el seguimiento de logs sin detener nada.

## 7.4 Abrir ADMIN y CLIENTE

La {{TABLA:T-INST-VISTAS}} resume las dos interfaces y lo que muestra cada una.

[[TABLA:T-INST-VISTAS|Vistas del panel: URL, redirección y contenido.]]
| Vista | URL | Contenido |
|---|---|---|
| ADMIN | `http://127.0.0.1:8095/`, que redirige a `/admin/` | Panorama, Sismógrafos, Alertas, Histórico, Clúster Raft, Servidores, Detectores, Registros y Configuración |
| CLIENTE | `http://127.0.0.1:8095/publico`, que redirige a `/cliente/` | estado del servicio, último sismo y alertas, mapa, protocolo de actuación y ajustes |

Comprobación de los códigos de respuesta:

```bash
curl -s -o /dev/null -w '/ -> %{http_code} %{redirect_url}\n' http://127.0.0.1:8095/
curl -s -o /dev/null -w '/admin/ -> %{http_code}\n' http://127.0.0.1:8095/admin/
curl -s -o /dev/null -w '/publico -> %{http_code} %{redirect_url}\n' http://127.0.0.1:8095/publico
```

Esperado: `/` responde 302 hacia `/admin/`, `/admin/` responde 200 y `/publico` responde 302 hacia `/cliente/`. El estado llega por SSE desde `/api/stream`, con un latido cada 5 segundos. El panel no tiene login; para abrirlo desde el móvil se usa `http://<IP-del-PC>:8095/` y se permite el puerto en el firewall (sección 2.3).

## 7.5 Modos simulado, real y mixto

El modo depende solo de las variables de dirección de los nodos. No se cambia código.

- **Simulado (por defecto).** Sin `NODO1_URL`, `NODO2_URL` ni `NODO3_URL`, el panel apunta a `http://nodo1:8080`, `http://nodo2:8080` y `http://nodo3:8080` dentro de Compose. Los tres contenedores `nodoN` ejecutan el mismo núcleo Raft del firmware compilado para Linux y se hablan por UDP 4210. Es el modo de la demo de 11 servicios.
- **Real.** Se definen las tres variables con las placas y se arranca sin los nodos simulados. El número de cada variable debe coincidir con el `nodo` que responde esa placa; `verificar-esp32.js` avisa si un nodo está en la posición equivocada.
- **Mixto.** Se definen solo algunas de las tres variables. Las que faltan vuelven a `http://nodoN:8080`, así que el panel puede leer placas reales y nodos simulados a la vez. En ese caso se arranca con `docker compose up -d --build` para que existan los nodos simulados que falten. Es un modo de laboratorio; la campaña física no lo usó.

Secuencia para el modo real, con las tres placas encendidas y en la misma red:

```bash
cp ejemplo.env .env
# editar NODO1_URL, NODO2_URL y NODO3_URL con las IP reales
node web/scripts/verificar-esp32.js
docker compose stop nodo1 nodo2 nodo3
docker compose up -d --build --no-deps panel servidor1 servidor2 servidor3 \
  db1 db2 db3 controlador
```

El controlador se mantiene para apagar y encender los servidores de datos. Si el stack ya estaba apagado, el paso `docker compose stop` no es necesario.

> Con ESP32 reales no existe el contenedor `nodoN`. La orden "apagar servidor" del panel detiene el servidor de datos y hace una desconexión lógica de la placa (`POST /control {"accion":"caer"}`); la placa sigue con corriente. "Encender" arranca el servidor y la reincorpora a Raft. El detalle está en `docs/servidores-de-datos.md` y en la sección 8.5.

## 7.6 Servidores de datos y PostgreSQL

Cada ESP32 tiene asignado un servidor de datos con el mismo número y su propia base: `nodo1` con `servidor1` y `db1`, `nodo2` con `servidor2` y `db2`, y `nodo3` con `servidor3` y `db3`. Las placas no guardan datos; el histórico vive en PostgreSQL. Los servidores de datos son los únicos que hablan con la base; el panel les pide el histórico por HTTP.

Las tablas que crea cada servidor son `muestras`, `log_entradas`, `eventos`, `alertas`, `sucesos`, `acciones` y las `archivo_*` de la retención. Como el log Raft está replicado en los tres nodos, eventos, alertas y log de consenso existen en las tres bases; muestras, sucesos y acciones son propios de cada nodo. El esquema y las consultas están en `web/servidor/bd.js` y `web/servidor/consulta.js`.

El histórico se consulta desde ADMIN, desde CLIENTE y por API:

```bash
curl -s 'http://127.0.0.1:8095/api/historial?tipo=eventos&servidor=todos&pagina=1&limite=10' \
  | python3 -m json.tool | head -40
curl -s 'http://127.0.0.1:8095/api/servidores' | python3 -m json.tool | head -30
```

Parámetros de `/api/historial`: `tipo` (`eventos`, `alertas`, `muestras`, `sucesos`, `log` o `acciones`), `servidor` (`1`, `2`, `3` o `todos`), `pagina`, `limite` (de 1 a 200, 50 por defecto), `nodo`, `categoria`, `estado`, `desde`, `hasta`, `q`, `orden` y `fuente` (`activo` o `archivo`). El detalle de cada parámetro y del formato de la respuesta está en `docs/servidores-de-datos.md`.

Como las bases no publican puerto, se entra por el contenedor:

```bash
docker compose exec -T db1 psql -U vybra -d vybra -c '\dt'
docker compose exec -T db1 psql -U vybra -d vybra -c 'SELECT count(*) FROM eventos;'
docker compose exec -T db1 psql -U vybra -d vybra \
  -c 'SELECT id, nodo, nivel, duracion_ms FROM eventos ORDER BY id DESC LIMIT 10;'
```

Los nombres de columna pueden variar; `\d eventos` muestra el esquema vigente. La retención y el archivado están desactivados por defecto y se configuran con las variables `RETENCION_*`; el detalle y las recomendaciones de tamaño están en `docs/servidores-de-datos.md` y en la sección 8.7.

## 7.7 Producción

La superposición `docker-compose.prod.yml` se aplica sobre `docker-compose.yml` y cambia el modelo de secretos y de puertos. Primero se generan los secretos fuera del repositorio; la carpeta `secretos/` está en `.gitignore`:

```bash
mkdir -p secretos
(umask 077; openssl rand -base64 32 > secretos/db_password.txt)
(umask 077; openssl rand -base64 32 > secretos/control_token.txt)
```

Después se definen en `.env` las direcciones de las tres placas reales, se valida la composición y se arranca:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml config --services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

La composición de producción activa 8 servicios: `controlador`, `db1`, `db2`, `db3`, `panel`, `servidor1`, `servidor2` y `servidor3`. Los nodos simulados `nodo1` a `nodo3` quedan en el perfil `simulados` y no se arrancan. El comando `config` no abre los archivos de secreto; hay que crearlos antes de `up` o el arranque falla.

Qué garantiza la superposición:

- La clave de PostgreSQL llega como secreto de archivo (`POSTGRES_PASSWORD_FILE` y `DB_PASSWORD_FILE`), no como variable de entorno.
- Cada servidor de datos arranca con `VYBRA_ENTORNO=produccion` y rechaza una clave vacía o la de desarrollo (`vybra`).
- No se publica ningún puerto de las bases ni de los servidores de datos: solo el panel.
- El controlador y el panel usan `CONTROL_TOKEN_FILE` en vez de `CONTROL_TOKEN`.
- `DB_PASSWORD` y `CONTROL_TOKEN` se anulan con `!reset null`; no las definas en `.env`.

## 7.8 Perfil HTTPS con Caddy

El perfil `https` añade un servicio Caddy delante del panel con TLS interno y su propia autoridad de certificación. No forma parte de los 11 servicios por defecto.

1. En `.env`, define la IP o el nombre con el que se entrará (`HOST_PUBLICO`) y, si hace falta, el puerto (`PUERTO_HTTPS`, 8443 por defecto). El valor de ejemplo de Compose hay que cambiarlo por el propio.
2. Arranca el perfil con `docker compose --profile https up -d --build` y comprueba con `docker compose ps`. Con el perfil activo la composición pasa a 12 servicios y aparece `sismo-https`.
3. Entra a `https://<HOST_PUBLICO>:8443/admin/` o a `https://<HOST_PUBLICO>:8443/cliente/`.
4. La primera vez el navegador avisará de que la CA no es de confianza. Descarga `https://<HOST_PUBLICO>:8443/ca.crt` e instálala como autoridad de confianza en cada dispositivo.
5. Para detener solo este perfil: `docker compose --profile https stop https`.

El Caddyfile (`docker/Caddyfile`) usa `tls internal`, hace `reverse_proxy` a `panel:8090` con `flush_interval -1` para que el SSE llegue sin búfer y entrega la CA en `/ca.crt`. También define un `default_sni` porque los navegadores no envían SNI cuando se entra por IP literal (RFC 6066); sin él, el handshake falla con "alert internal error". El perfil está implementado y validado por configuración, pero en esta entrega no se arrancó como evidencia; la captura del panel en 8443 queda pendiente.

## 7.9 Ejecución sin Docker

El panel no tiene dependencias: solo usa módulos nativos de Node.js. Se arranca desde `web/`:

```bash
cd web
npm start
# Panel:        http://localhost:8090/
# Vista pública: http://<IP-del-PC>:8090/publico
```

Si los nodos no resuelven por mDNS o son ESP32 reales, se indican sus URL:

```bash
NODOS="http://IP1,http://IP2,http://IP3" npm start
```

Sin `SERVIDORES` no hay histórico, y sin `CONTROLADOR_URL` la función de apagar y encender queda desactivada. Para el histórico en local se puede arrancar un servidor de datos a mano, siempre que exista un PostgreSQL accesible; la demo Docker ya lo resuelve sin configuración:

```bash
cd web
npm install     # instala pg, la dependencia del servidor de datos
N=1 NODO_URL=http://127.0.0.1:9001 PUERTO=8100 \
  DATABASE_URL=postgres://vybra:vybra@127.0.0.1:5432/vybra \
  node servidor/servidor.js
```

La demo sin Raft sirve para ver la interfaz sin hardware:

```bash
cd web
npm run fake     # tres nodos falsos en 9001-9003, sin Raft
# en otra terminal:
NODOS="http://127.0.0.1:9001,http://127.0.0.1:9002,http://127.0.0.1:9003" npm start
```

El nodo simulado nativo, con el núcleo Raft real, se compila con:

```bash
JSON_DIR="$HOME/Arduino/libraries/ArduinoJson/src" bash web/nodo-sim/compilar.sh
# salida: web/nodo-sim/nodo-sim (275 392 B verificados)
```

El binario se ejecuta con las variables `N` (1 a 3), `PUERTO_HTTP` (8080), `PUERTO_RAFT` (4210) y `PEER_1` a `PEER_3` (host:puerto de cada nodo). Los detalles están en la cabecera de `web/nodo-sim/nodo_sim.cpp`; para el día a día conviene la demo Docker, que ya configura esos valores.

## 7.10 Actualizar, apagar y borrar

Actualizar el código:

```bash
# snapshot nuevo: descomprimir sobre una carpeta nueva y copiar .env y secretos.h
# o repositorio Git: git pull
docker compose config --services
docker compose up -d --build
docker compose ps
```

`up -d --build` reconstruye las imágenes afectadas y recrea los contenedores cuyo código o configuración cambió; los volúmenes de PostgreSQL no se tocan. El panel lee `NODOS` al arrancar: si se cambia `.env`, el panel se recrea con el mismo comando.

Apagar y borrar:

```bash
docker compose stop                # detiene sin eliminar contenedores ni volúmenes
docker compose down                # elimina contenedores y redes; conserva los volúmenes de PostgreSQL
docker compose down -v             # además borra los volúmenes: se pierde el histórico de las bases
docker compose down -v --remove-orphans   # limpia también contenedores de otros perfiles
```

Los volúmenes declarados se consultan con:

```bash
docker compose config --volumes | sort
# sismo-db1
# sismo-db2
# sismo-db3
```

> `docker compose down -v` borra el histórico guardado en las tres bases. No lo uses si quieres conservar los datos. El proyecto de pruebas `vybraint` se limpia con `docker compose -p vybraint down -v --remove-orphans`.

## 7.11 Mapa del código del servidor

La {{TABLA:T-WEB-ARCH}} resume qué hace cada pieza de `web/`. La columna "referencia" apunta al archivo y a las líneas que definen su comportamiento principal.

[[TABLA:T-WEB-ARCH|Archivos del servidor Node.js y su responsabilidad.]]
| Ruta | Responsabilidad | Referencia |
|---|---|---|
| `web/server.js` | HTTP del panel: estáticos de ADMIN y CLIENTE, API, SSE y proxy de control e infraestructura | `server.js:338-412` |
| `web/poller.js` | sondeo de los nodos, foto agregada, líder y quórum; emite cambios por SSE | `poller.js:25`, `poller.js:147`, `poller.js:173` |
| `web/config.js` | `NODOS`, `PUERTO` 8090, `SERVIDORES`, `CONTROLADOR` y posiciones fijas del mapa | `config.js:18-39` |
| `web/servidor/servidor.js` | API del servidor de datos: `/info`, `/salud`, `/api/historial`, `/api/registro`, `/api/publico`, `/retencion` y `POST /acciones` | `servidor/servidor.js:31-65` |
| `web/servidor/bd.js` | esquema PostgreSQL y escritura sin duplicados de muestras, log, eventos, alertas, sucesos y acciones | `bd.js:8` |
| `web/servidor/consulta.js` | consultas paginadas y filtradas en la base, sin SQL construido con texto del usuario | `consulta.js:1-7` |
| `web/servidor/recolector.js` | consulta al ESP32 asignado y guardado en la base; una muestra cada 30 s | `recolector.js:3-6` |
| `web/servidor/retencion.js` | política de retención y archivado, desactivada por defecto | `retencion.js:1-10` |
| `web/controlador/controlador.js` | único servicio con el socket de Docker: `GET /estado`, `GET /salud` y `POST /servidores/N/apagar` o `/encender` | `controlador.js:1-12` |
| `web/nodo-sim/` | ESP32 simulado con el núcleo Raft real compilado para Linux (`nodo_sim.cpp`, `compilar.sh`) | `nodo_sim.cpp:1-5` |
| `web/fake/` | tres nodos falsos en 9001 a 9003, sin Raft, para demos | `cluster-falso.js:1-9` |
| `web/admin-src/` | fuente de la SPA ADMIN (React 19, Vite y Tailwind); se compila a `public/admin/` | `admin-src/package.json` |
| `web/public/admin/` | SPA ADMIN construida, servida en `/admin/` | `server.js:400` |
| `web/public/cliente/` | vista CLIENTE, servida en `/cliente/`; el mapa usa Leaflet vendorizado y teselas de OpenStreetMap | `server.js:401` |
| `web/scripts/verificar-esp32.js` | comprueba el contrato HTTP de los nodos reales; no escribe nada en las placas | `verificar-esp32.js:1-4` |
| `web/scripts/test-db.sh` y `test-infra.sh` | pruebas con tres PostgreSQL reales y con un proyecto Compose aislado | `scripts/test-db.sh`, `scripts/test-infra.sh` |
| `web/package.json` | guiones `start`, `fake`, `test`, `test:db` y `test:infra`; dependencia `pg` 8.23.1 | `package.json:6-13` |
| `web/Dockerfile` y `web/docker/` | imágenes del panel, nodos simulados, servidores de datos y controlador | `Dockerfile`, `docker/Dockerfile.*` |

API del panel:

- `GET /api/estado` entrega la foto agregada (`quorum`, `lider`, `fuente`, `nodos`, `log`, `alertas` y `sucesos`).
- `GET /api/stream` entrega el estado por SSE, con latido cada 5 s.
- `GET /api/infra` informa del controlador y de los servidores que puede apagar.
- `GET /api/servidores`, `GET /api/historial`, `GET /api/registro` y `GET /api/retencion` leen el histórico.
- `POST /api/nodos/{1|2|3}/control` y `POST /api/nodos/{1|2|3}/pulsar` envían órdenes a un nodo.
- `POST /api/infra/servidores/{1|2|3}/{apagar|encender}` apaga o enciende un servidor, con confirmación.

Los `POST` exigen `Content-Type: application/json`; los de infraestructura exigen además `{"confirmar":true}` y un `Origin` propio si el navegador lo envía. Las respuestas de error verificadas son 415 sin JSON, 413 con cuerpo de más de 4 KB y 404 para un nodo fuera de 1 a 3.

## 7.12 Pruebas rápidas de humo

Terminada la instalación, estas comprobaciones confirman que el stack responde antes de operar:

```bash
docker compose ps
curl -s -o /dev/null -w '/admin/ -> %{http_code}\n' http://127.0.0.1:8095/admin/
curl -s http://127.0.0.1:8095/api/estado | head -c 400; echo
docker compose exec -T nodo1 nodo-sim --salud; echo "salud=$?"
docker compose exec -T db1 psql -U vybra -d vybra -c 'SELECT 1;'
```

Esperado: 11 contenedores arriba, `/admin/` responde 200, `/api/estado` devuelve un JSON con `quorum`, `lider` y tres nodos, `nodo-sim --salud` termina con código 0 y PostgreSQL devuelve una fila con el valor 1.

Pruebas automatizadas rápidas:

```bash
cd web
npm install
npm test                 # 75 casos: 60 pasan, 15 omitidas, 0 fallan (16,6 s)
npm run test:db          # 75 casos: 70 pasan, 5 omitidas, 0 fallan (13,8 s)
npm run test:infra       # 5/5, 0 fallan (79,2 s); proyecto aislado vybraint
```

`npm test` omite solo las pruebas que necesitan PostgreSQL o Docker. `test:db` levanta tres PostgreSQL efímeros en `127.0.0.1:54431-54433` y `test:infra` usa un proyecto Compose aislado con puertos 18xxx y 19xxx, sin tocar el stack normal. La verificación funcional de punta a punta, con un evento del pulsador y la alerta resultante, está en la sección 8.2; el detalle de las suites y sus evidencias, en la sección 5.

# 8. Operación, verificación y solución de problemas

Este capítulo describe cómo se arranca el sistema en orden, cómo se comprueba de punta a punta, cómo se opera el panel, cómo se genera un evento con el pulsador, cómo se comporta el clúster ante fallos y qué hacer cuando algo no funciona. Presupone la instalación de la sección 7 y el firmware cargado de la sección 6.

> El evento sísmico es simulado: la entrada es un pulsador en GPIO4. Las alertas que se ven en el panel y en la vista pública son ejercicios de consenso y agregación, no detecciones sísmicas.

## 8.1 Orden de arranque

El orden importa porque el panel depende de que las bases, los servidores de datos y los nodos estén sanos. Docker Compose lo respeta con `depends_on` y healthchecks, pero conviene entenderlo para diagnosticar arranques parciales.

1. Arranca el demonio de Docker y comprueba que responde: `docker compose version` y `docker ps`.
2. Revisa `.env`. En modo real, las tres variables `NODO*_URL` deben apuntar a las placas; en producción, los secretos de archivo deben existir.
3. Enciende y alimenta las tres ESP32 antes de levantar el panel. Necesitan 8 a 20 segundos para obtener IP por DHCP y elegir líder (timeout de elección de 5000 a 9000 ms).
4. Levanta el stack: `docker compose up -d --build`. Las bases arrancan primero, los servidores de datos esperan a que su base esté sana y el panel espera a los tres nodos y a los tres servidores.
5. Espera a tener 11 contenedores arriba y 10 sanos. El panel queda en `Up` sin healthcheck.
6. Abre ADMIN y CLIENTE y comprueba que hay un único líder y quórum.
7. Antes de generar eventos, confirma que los nodos tienen hora (`"con_hora":true`). Sin NTP no se forman alertas.

Para apagar, `docker compose down` detiene en orden inverso y elimina contenedores y redes, pero conserva los volúmenes de PostgreSQL. Si vas a sustituir hardware, apaga las placas después de detener el stack para que el panel no quede con nodos inalcanzables. Para un mantenimiento corto, `docker compose stop` conserva los contenedores y permite volver con `docker compose start`.

## 8.2 Verificación de punta a punta

La {{TABLA:T-VERIF}} recorre la cadena completa: contenedores, panel, nodos, servidores de datos, PostgreSQL, un evento del pulsador, su replicación, la alerta y el flujo SSE. Los comandos se ejecutan en la raíz del repositorio; las salidas son las observadas en la validación del 2026-11-18.

[[TABLA:T-VERIF|Verificación de punta a punta con el comando y la salida esperada.]]
| # | Verificación | Comando | Salida esperada |
|---|---|---|---|
| 1 | Servicios arriba | `docker compose ps` | 11 contenedores `Up`, 10 con `(healthy)` y `sismo-panel` sin healthcheck |
| 2 | Panel | `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8095/admin/` | 200 |
| 3 | Redirección de la raíz | `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://127.0.0.1:8095/` | 302 hacia `/admin/` |
| 4 | Estado agregado | `curl -s http://127.0.0.1:8095/api/estado` | JSON con `quorum`, `lider` y tres entradas en `nodos` |
| 5 | Un solo líder | `curl -s http://127.0.0.1:8095/api/estado` y revisar `rol` | exactamente un nodo con `"rol":"lider"` y el mismo `termino` en los tres |
| 6 | Salud de un nodo simulado | `docker compose exec -T nodo1 nodo-sim --salud; echo $?` | 0 |
| 7 | API de un nodo | `curl -s http://127.0.0.1:9001/estado` | JSON con `nodo`, `rol`, `caido`, `termino`, `log_len`, `commit_index`, `con_hora` y demás claves |
| 8 | Salud de un servidor de datos | `curl -s http://127.0.0.1:8101/salud` | `{"ok":true}` |
| 9 | PostgreSQL | `docker compose exec -T db1 psql -U vybra -d vybra -c 'SELECT 1;'` | una fila con el valor 1 |
| 10 | Evento por el panel | `curl -s -X POST http://127.0.0.1:8095/api/nodos/1/pulsar -H 'Content-Type: application/json' -d '{"ms":900}'` | `{"ok":true,...,"nivel":3,"resultado":"aceptada"}`; en un seguidor, `"resultado":"pendiente"` |
| 11 | Replicación y commit | `curl -s http://127.0.0.1:8095/api/estado` | `log_len` y `commit_index` suben en los tres nodos; el líder coincide |
| 12 | Alerta | `curl -s -X POST http://127.0.0.1:8095/api/nodos/1/pulsar -H 'Content-Type: application/json' -d '{"ms":2475}'` y lo mismo en `/api/nodos/2/pulsar` con `{"ms":2025}`, con menos de 10 s | `alertas` del estado con `promedio` 5,5, `nivel` media y los ids de los dos eventos |
| 13 | Flujo SSE | `curl -sN --max-time 12 http://127.0.0.1:8095/api/stream` | un evento `estado` y un latido `vivo` cada 5 segundos |
| 14 | Vista pública | `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://127.0.0.1:8095/publico` | 302 hacia `/cliente/` |
| 15 | Contrato de placas reales | `node web/scripts/verificar-esp32.js` | `Todos los nodos cumplen el contrato.` o el detalle del nodo que falla |

Para la alerta de la fila 12 se usaron dos pulsaciones de 2475 ms y 2025 ms en nodos distintos: producen nivel 6 y nivel 5, promedio 5,5 y alerta de nivel medio (BE-07). La alerta aparece en ADMIN y en CLIENTE con la franja de simulación; el detalle de la regla está en la sección 8.4.

Los comandos de la tabla tienen evidencia de ejecución contra el stack real y contra el proyecto aislado `vybraint`; el detalle y las capturas están en la sección 5 y en `entrega/04-evidencias/`.

## 8.3 Operar el panel

El panel de administración se abre en `http://127.0.0.1:8095/` y se organiza en nueve vistas:

- **Panorama**: estado global, líder, quórum, último evento y accesos rápidos.
- **Sismógrafos**: series y lecturas recientes de los tres detectores.
- **Alertas**: alertas emitidas, con sus eventos y su nivel.
- **Histórico**: eventos, alertas, muestras, actividad Raft, log de consenso y pruebas u órdenes, con filtros por servidor, nodo, categoría, estado y fechas, búsqueda y paginación.
- **Clúster Raft**: rol, término, log, commit, líder conocido y sucesos del consenso.
- **Servidores**: estado de los tres servidores de datos, su sistema operativo y su base; cada tarjeta tiene **Apagar servidor** y **Encender servidor**.
- **Detectores**: estado de cada detector, **Pulsación** con selector de intensidad y **Simular caída** o **Recuperar**.
- **Registros**: trazas y registro de acciones, con exportación CSV.
- **Configuración**: ajustes del panel, prueba de sonido y botón **Detener sonido** mientras suena.

La vista pública se abre en `http://127.0.0.1:8095/publico` y muestra el estado del servicio, el último sismo, el historial de avisos confirmados, el mapa, el protocolo de actuación y los ajustes de la propia vista. Cuando llega una alerta, se abre una pantalla completa con la franja "SIMULACRO", la instrucción "Agáchate, cúbrete, sujétate", la intensidad, los detectores que coincidieron, una cuenta atrás y el botón "Estoy a salvo".

Operación habitual:

- El estado se actualiza por SSE, sin recargar. Si el panel muestra `sin conexión` en los tres nodos, revisa la red y la sección 8.6.
- La alarma sonora necesita una interacción previa del usuario en la página; el navegador bloquea el audio hasta entonces. En **Configuración** hay una prueba de sonido con botón **Detener sonido** mientras suena.
- El botón **Apagar servidor** pide confirmación y avisa de las consecuencias: si el nodo era líder, se elegirá otro, y si se apagan dos, se pierde el quórum. La operación es real: detiene el contenedor del nodo y el del servidor de datos, no la base.
- **Simular caída** desconecta un nodo de Raft sin apagar el contenedor; **Recuperar** lo devuelve al clúster.
- El panel no tiene login. Cualquiera que lo alcance en la red puede pulsar detectores y apagar servidores.

## 8.4 Generar un evento y entender la alerta

El evento se genera de dos formas y las dos son simulaciones.

Con el pulsador físico. Cada placa tiene un pulsador entre GPIO4 (D4) y GND, con `INPUT_PULLUP` y activo en bajo. El firmware aplica un antirrebote de 20 ms, ignora pulsos menores de 80 ms y corta a 60 s. Mientras se pulsa, el LED azul parpadea rápido; cuando el nodo conoce al líder, queda fijo. La duración se traduce en:

```text
nivel = min(10, 1 + duracion_ms / 450)
pga   = 0.028 * nivel + 0.015
```

La escala es de simulación. Una pulsación de 900 ms produce nivel 3, como en la comprobación de la sección 8.2.

Desde el panel. La vista `Detectores > Pulsación` envía `POST /api/nodos/N/pulsar` con una duración calculada para el nivel elegido: `(nivel - 1) * 450 + 225` ms (`web/admin-src/src/live.ts:249`). La respuesta del nodo trae `id`, `nivel` y `resultado`; el panel muestra el texto que devuelve el nodo.

Qué ocurre con el evento:

1. Si el detector que lo recibe es el líder, agrega la entrada a su log. Si es seguidor, la reenvía al líder y reintenta cada 500 ms.
2. El líder replica la entrada a los demás con `Append`, en lotes de hasta 8 entradas.
3. La entrada se considera confirmada cuando la mayoría (2 de 3) la tiene: `commitIndex` avanza y solo entonces la máquina sísmica la aplica.
4. El agregador sondea a 1 Hz y publica el estado por SSE.

La regla de alerta está en `firmware/detector/src/nucleo/sismo.h` y `sismo.cpp`:

- Un evento disparador busca el evento más cercano y libre de cada otro detector dentro de una ventana de 10 000 ms (`sismo.h:32`).
- Se necesitan al menos dos detectores distintos. Un solo detector no genera alerta, aunque el evento se confirme.
- El promedio de los niveles del grupo decide la severidad: `alta` desde 7,5, `media` desde 4,5 y `baja` por debajo (`sismo.cpp:11-14`).
- Los eventos usados en una alerta no se reutilizan en otra.
- Sin hora (`"con_hora":false`) no se forman alertas. Los eventos sin hora no se agrupan; por eso el NTP es un requisito de operación.

El caso T1 de la campaña física ilustra el límite: el pulsador produjo dos eventos de 301 ms y 174 ms separados 3,2 s; ambos se replicaron y confirmaron, y no se creó alerta porque los dos venían del mismo detector. El diagnóstico apunta al contactor del pulsador y está en `entrega/10-informes-fase3/diagnostico-pulsador.md`.

## 8.5 Failover y recuperación

El clúster tolera la caída de un nodo de tres. Al apagar el líder, los seguidores dejan de recibir latidos, vence su timeout de elección y eligen uno nuevo con término incrementado. El criterio de la campaña física es de 12 segundos como máximo (9 s de timeout más latencia de red); el timeout de elección configurado va de 5000 a 9000 ms (`firmware/detector/config.h:16-18`).

Simulación de una caída desde la API del panel:

```bash
curl -s -X POST http://127.0.0.1:8095/api/nodos/1/control \
  -H 'Content-Type: application/json' -d '{"accion":"caer"}'
# {"ok":true,"caido":true}

curl -s -X POST http://127.0.0.1:8095/api/nodos/1/control \
  -H 'Content-Type: application/json' -d '{"accion":"recuperar"}'
# {"ok":true,"caido":false}
```

Con contenedores también se puede parar y arrancar el nodo simulado:

```bash
docker compose stop nodo1
docker compose ps
docker compose start nodo1
```

Qué esperar durante y después de la caída:

- **Con 2 de 3 nodos disponibles** el clúster mantiene el quórum, elige líder si hizo falta y sigue confirmando eventos. El panel marca el nodo caído como inalcanzable y, si cambió el líder, lo refleja en unos segundos.
- **Con 1 de 3 nodos disponibles** no hay quórum. Los eventos que llegan al nodo vivo quedan aceptados pero sin confirmar (`log_len` mayor que `commit_index`), no se genera alerta y el panel avisa de la pérdida de quórum.
- **Al volver el nodo** se reinicia como seguidor. El líder le reenvía lo que le falta y converge cuando `log_len` y `commit_index` igualan a los del líder. El término y el voto sobreviven en NVS; el log vive en RAM y se reconstruye desde el líder.
- **Si vuelve un líder antiguo** puede llegar con entradas sin confirmar; al recibir un término mayor pasa a seguidor y descarta lo no confirmado.

La caída y el encendido desde ADMIN detienen y arrancan el nodo y su servidor de datos, pero nunca la base `dbN`: los datos del histórico se conservan. Con ESP32 físicos no hay contenedor que apagar; la orden hace una desconexión lógica de la placa, que sigue alimentada y vuelve a Raft con `recuperar`.

Medición del failover, útil para dejar evidencia:

```bash
date -Ins
curl -s http://127.0.0.1:8095/api/estado | python3 -m json.tool | head -30
```

Anota la hora antes de parar el líder y la hora del primer estado con un líder distinto; la diferencia es el tiempo de failover. Repite la lectura hasta que los tres nodos coincidan en `lider` y `termino`.

Límites que conviene tener presentes durante la operación:

- El log de Raft vive en RAM: un corte de energía puede perder entradas aceptadas pero no confirmadas.
- Sin snapshots, el log tiene un tope de 1000 entradas; al llenarse, el nodo rechaza eventos nuevos con `507 log lleno`.
- Si una mayoría se reinicia en frío, un nodo puede descartar su log y copiarlo del líder (resincronización de emergencia).
- No hay pre-vote ni check-quorum: un líder aislado sigue creyéndose líder.
- El `ForwardAck` se envía al aceptar, no al confirmar: un evento puede perderse si el líder muere justo después de aceptarlo.
- El quórum que muestra el agregador es una inferencia (al menos 2 nodos disponibles que reconocen al mismo líder), no una validación del consenso.

## 8.6 Solución de problemas

La {{TABLA:T-TROUBLE}} reúne los síntomas observados o documentados, su causa probable y la solución. Los mensajes entre comillas están copiados del código o de los registros.

[[TABLA:T-TROUBLE|Síntomas de operación, causa probable y solución.]]
| # | Síntoma | Causa probable | Solución |
|---|---|---|---|
| 1 | `Cannot connect to the Docker daemon` | Docker no está arrancado o el usuario no tiene permiso | `sudo systemctl start docker` y comprobar `docker info` |
| 2 | `docker compose up` falla al construir `nodo1` a `nodo3` | La primera construcción no tiene red para descargar ArduinoJson 7.4.3 | Revisar la conexión y repetir `docker compose up -d --build` |
| 3 | `El puerto 8095 está ocupado. Cierra el otro programa o usa otro con la variable PUERTO.` | Otro proceso usa el puerto del panel | Cambiar `PUERTO_PANEL` en `.env` y recrear: `docker compose up -d panel` |
| 4 | Un contenedor queda `unhealthy` | El nodo o el servidor no responde dentro del healthcheck | `docker compose logs <servicio>` y `docker compose exec -T nodo1 nodo-sim --salud` |
| 5 | `panel` no aparece como `healthy` | El panel no tiene healthcheck | Es normal; comprobar que está `Up` y que `/api/estado` responde |
| 6 | El panel arranca pero todo sale `sin conexión` | Los nodos no resuelven por mDNS o están en otra red | Usar `NODOS="http://IP1,http://IP2,http://IP3"` o `NODO*_URL` en `.env` |
| 7 | No aparece ningún líder | Broadcast bloqueado, AP isolation o placas en redes distintas | Desactivar el aislamiento de clientes y usar una sola red 2,4 GHz |
| 8 | Los nodos se ven pero no hay commit | Sin quórum: menos de 2 de 3 nodos disponibles | Encender las tres placas o revisar los contenedores apagados |
| 9 | `"con_hora":false` | Los nodos no tienen NTP | Dar internet al router; sin hora no se forman alertas |
| 10 | El histórico sale vacío | Los servidores no ven a su nodo, la base no responde o aún no hay datos | Revisar `/info` del servidor, `docker compose ps dbN` y el estado del nodo |
| 11 | ADMIN muestra una base caída y las demás responden | Una base no responde | `docker compose ps db1` y `docker compose logs db1`; el panel indica `ok:false` para esa base |
| 12 | Producción no arranca y registra una clave vacía o de desarrollo | Falta `secretos/db_password.txt` o se usó `vybra` | Generar los secretos y arrancar con `-f docker-compose.prod.yml` |
| 13 | `Falta DATABASE_URL o DB_HOST (+ DB_NAME, DB_USER, DB_PASSWORD_FILE)` | Entorno del servidor de datos incompleto | Revisar las variables del servicio; en Compose las pone `docker-compose.yml` |
| 14 | `Falta NODO_URL (el ESP32 asignado a este servidor)` | Servidor de datos sin nodo asignado | Definir `NODO1_URL`, `NODO2_URL` y `NODO3_URL`, o `NODO_URL` en ejecución manual |
| 15 | No funciona apagar o encender servidores | `CONTROLADOR_URL` vacío, controlador caído o token distinto | Revisar `docker compose ps controlador` y el token del panel |
| 16 | El controlador responde 401 `no autorizado` | Token distinto entre panel y controlador | Usar el mismo `CONTROL_TOKEN`, o el mismo `CONTROL_TOKEN_FILE` |
| 17 | El panel dice `El controlador de infraestructura no responde.` | El controlador no está arriba | `docker compose up -d controlador` y revisar sus logs |
| 18 | No suena la alarma | El navegador bloquea el audio hasta una interacción | Pulsar en la página antes de probar; usar `Configuración > Probar sonido` |
| 19 | `npm run test:db` falla al arrancar | Docker no disponible o puertos 54431 a 54433 ocupados | Arrancar Docker, liberar esos puertos; el script borra sus contenedores `vybra-test-pgN` |
| 20 | `npm run test:infra` falla al arrancar | Proyecto `vybraint` residual o puertos 18xxx o 19xxx ocupados | `docker compose -p vybraint down -v --remove-orphans` y reintentar |
| 21 | Las pruebas C++ no encuentran ArduinoJson | `JSON_DIR` incorrecto | Instalar ArduinoJson 7.x o pasar `JSON_DIR=/ruta/a/ArduinoJson/src` |
| 22 | `make` no encuentra `../detector/src` | Se ejecutó dentro del repositorio | Copiar `firmware/test` y `firmware/detector/src` a un directorio común; ver sección 5 |
| 23 | Tras `docker compose down -v` desapareció el histórico | `-v` borra los volúmenes de PostgreSQL | No usar `-v` si se quieren conservar los datos |
| 24 | Una pulsación produce dos eventos cortos | Contactor del pulsador (incidencia real de T1) | Revisar el pulsador; el firmware calcula bien el nivel; ver informe de diagnóstico |
| 25 | La carga por WiFi no encuentra la placa | mDNS no resuelve `sismo-nodo-N.local` | `IP=x.x.x.x ./cargar.sh N --wifi` y abrir TCP 32323 en el firewall |
| 26 | `Permission denied` al abrir `/dev/ttyUSB*` | Falta el grupo `dialout` | `sudo usermod -aG dialout "$USER"` y abrir sesión, o `setfacl` sobre el puerto |
| 27 | `verificar-esp32.js` avisa de una posición incorrecta | `NODO1_URL` no es el ESP32 que responde `nodo:1` | Corregir el orden de las tres URL |

Los problemas de firmware, portal cautivo y OTA están detallados en la sección 6. Los de las pruebas automatizadas, en la sección 5.

## 8.7 Mantenimiento y respaldo

Comprobaciones periódicas. Con el stack en marcha:

```bash
docker compose ps
docker stats --no-stream
docker compose logs --tail=100 panel
curl -s http://127.0.0.1:8095/api/retencion | python3 -m json.tool | head -40
curl -s 'http://127.0.0.1:8095/api/servidores' | python3 -m json.tool | head -40
```

Esperado: los 11 contenedores arriba, consumo estable (en la validación, entre 1 y 100 MiB por contenedor), sin errores repetidos en el log del panel y tres servidores de datos con su base `ok`. El tamaño real de cada base está en `/info` (`tamanoBytes`) y en ADMIN > Servidores. `df -h .` vigila el disco: las imágenes ocupan unos 2,2 GB y el histórico crece según lo descrito en la sección 2.4.

Retención del histórico. Está desactivada por defecto. Para activarla, define en `.env` las variables `RETENCION_*` y recrea los servidores de datos:

```bash
# en .env, por ejemplo:
# RETENCION_ACTIVA=si
# RETENCION_MODO=archivar
# RETENCION_MUESTRAS_DIAS=30
# RETENCION_SUCESOS_DIAS=365
docker compose up -d servidor1 servidor2 servidor3
```

`RETENCION_MODO=eliminar` exige además `RETENCION_CONFIRMAR_ELIMINAR=si`; sin esa confirmación la retención queda desactivada y el servidor lo registra. Las alertas y los eventos críticos no se eliminan nunca de forma automática. Antes de cambiar de modo, consulta `/api/retencion`, que informa de cuántos registros afectaría la política sin modificar nada.

Actualización del software. Sigue el procedimiento de la sección 7.10: sustituir el código o hacer `git pull`, revisar `docker compose config --services` y ejecutar `docker compose up -d --build`. Los volúmenes de PostgreSQL se conservan. Antes de actualizar en producción, asegúrate de tener una copia del histórico; el respaldo no está automatizado (véase más abajo).

Respaldo. El repositorio no incluye un procedimiento de respaldo automatizado. El histórico vive solo en los volúmenes `sismo-db1`, `sismo-db2` y `sismo-db3`, que se conservan con `docker compose down` y se borran con `docker compose down -v`. Una copia lógica con `pg_dump` dentro de cada contenedor es la vía estándar de PostgreSQL, pero no se validó en esta entrega y queda pendiente de evidencia. Mientras no exista ese procedimiento, no uses `down -v` en un entorno con datos que quieras conservar.

Limpieza. Las pruebas dejan residuos si se interrumpen. El proyecto aislado se limpia con `docker compose -p vybraint down -v --remove-orphans`; los contenedores de `test:db` se borran solos al terminar el script. Los secretos (`firmware/detector/secretos.h`, `.env`, `secretos/`) no se versionan y no deben copiarse a repositorios ni a capturas.

Rotación de secretos. Si se regenera `secretos/db_password.txt`, hay que cambiar también la clave dentro de PostgreSQL y recrear los servicios que la usan; el repositorio no trae un procedimiento automatizado para esa rotación y no se probó en esta entrega. Para el token del controlador basta con regenerar `secretos/control_token.txt` y recrear los dos servicios con la superposición de producción:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d controlador panel
```

Mantenimiento físico. Revisar los cables USB de datos y las conexiones del pulsador antes de cada campaña, y mantener las etiquetas SIS-D1, SIS-D2 y SIS-D3. El montaje y sus comprobaciones están en la sección 3; la compilación y el flasheo, en la sección 6.

# 9. Anexos

Este capítulo reúne el material de consulta del manual: comandos, pinout, glosario, inventario de evidencias, enlaces y la lista de verificación final. Los comandos son los mismos que usan el despliegue, las pruebas y la campaña física; las rutas son relativas a la raíz del repositorio salvo que la tabla indique otra cosa.

## 9.1 Anexo A. Comandos útiles

La {{TABLA:T-ANX-CMD}} reúne los comandos que aparecen en el manual. Se agrupan por uso: despliegue, panel, pruebas, firmware y campaña física. Los comandos de prueba con PostgreSQL y Docker tardan minutos y crean recursos temporales que se destruyen al terminar.

[[TABLA:T-ANX-CMD|Comandos de instalación, operación, pruebas y campaña física.]]
| Uso | Comando | Dónde se ejecuta |
|---|---|---|
| Desplegar el stack | `docker compose up -d --build` | Raíz del repositorio |
| Listar los servicios | `docker compose config --services` | Raíz del repositorio |
| Ver estado y salud | `docker compose ps` | Raíz del repositorio |
| Ver las últimas líneas de registro | `docker compose logs --tail=100` | Raíz del repositorio |
| Ver consumo en vivo | `docker stats` | Raíz del repositorio |
| Consultar el estado agregado | `curl -s http://127.0.0.1:8095/api/estado` | PC con el panel arriba |
| Abrir el flujo SSE | `timeout 12 curl -sN http://127.0.0.1:8095/api/stream` | PC con el panel arriba |
| Apagar el servidor 2 desde la API | `curl -s -X POST http://127.0.0.1:8095/api/infra/servidores/2/apagar -H 'Content-Type: application/json' -d '{"confirmar":true}'` | PC con el panel arriba |
| Encender el servidor 2 desde la API | `curl -s -X POST http://127.0.0.1:8095/api/infra/servidores/2/encender -H 'Content-Type: application/json' -d '{"confirmar":true}'` | PC con el panel arriba |
| Ejecutar las suites C++ | `cd /tmp/vybra/test && make JSON_DIR="$HOME/Arduino/libraries/ArduinoJson/src" test` | Copia temporal preparada como en 5.9 |
| Ejecutar la suite JavaScript | `cd web && npm test` | Carpeta `web/` |
| Ejecutar JavaScript con PostgreSQL | `cd web && npm run test:db` | Carpeta `web/` |
| Ejecutar la integración Docker | `cd web && npm run test:infra` | Carpeta `web/` |
| Compilar el firmware de un nodo | `arduino-cli compile --fqbn esp32:esp32:esp32 --build-property "compiler.cpp.extra_flags=-DNODO=1" --build-path /tmp/fw1 firmware/detector` | Raíz del repositorio |
| Compilar el nodo simulado | `JSON_DIR=$HOME/Arduino/libraries/ArduinoJson/src bash web/nodo-sim/compilar.sh` | Raíz del repositorio |
| Identificar la placa conectada | `cd firmware && ./quien.sh` | Carpeta `firmware/` |
| Flashear una placa por USB | `cd firmware && ./cargar.sh 1` | Carpeta `firmware/` |
| Flashear una placa por WiFi | `cd firmware && ./cargar.sh 1 --wifi` | Carpeta `firmware/` |
| Resolver los nombres mDNS | `getent hosts sismo-nodo-1.local sismo-nodo-2.local sismo-nodo-3.local` | PC en la misma red |
| Consultar el estado de un nodo | `curl -s -m 2 http://IP_DEL_NODO/estado` | PC en la misma red |
| Escuchar Raft y descubrimiento | `sudo tcpdump -ni any -tttt 'udp port 4210 or udp port 4211'` | PC en la misma red |
| Borrar la NVS de una placa | `esptool.py --chip esp32 erase_region 0x9000 0x5000` | PC con la placa por USB |
| Repetir la preparación P0 | `bash entrega/05-pruebas/scripts/fis-p0.sh` | Raíz del repositorio con las placas |
| Verificar la prueba T1 | `bash entrega/05-pruebas/scripts/fis-t1-verificar.sh` | Raíz del repositorio con las placas |

Los dos comandos de la campaña física leen las direcciones de `entrega/05-pruebas/datos/ips.env` y escriben sus resultados en `entrega/05-pruebas/logs/` y `entrega/04-evidencias/F-fisicas/`. Si mDNS no resuelve, el panel puede arrancar con direcciones explícitas mediante la variable `NODOS`.

## 9.2 Anexo B. Pinout completo

La {{TABLA:T-ANX-PIN}} reúne los únicos pines que usa el montaje y su función real en el firmware. La placa es una ESP32 DevKit V1 de 30 pines con USB-serial CP2102. No se usa ningún otro pin: el sistema no tiene acelerómetro ni sensor de vibración, y el evento se genera con el pulsador.

[[TABLA:T-ANX-PIN|Pines usados por el montaje y su función en el firmware.]]
| Pin | Marca en la placa | Función | Conexión | Nota |
|---|---|---|---|---|
| GPIO4 | D4 | Entrada del pulsador | Una pata del pulsador; la otra a GND | `INPUT_PULLUP`, activo en bajo, antirrebote de 20 ms y pulsos de menos de 80 ms ignorados |
| GND | GND | Referencia de tierra | Segunda pata del pulsador | Tierra común de la protoboard |
| GPIO2 | D2 | LED azul integrado | Sin cableado | En alto enciende; fijo con líder, parpadeo a 1 Hz sin líder y parpadeo rápido al pulsar |
| USB micro-B | Puerto USB | Alimentación y consola serie | Cable USB de datos al PC | CP2102; se usa para flashear y para el monitor serie a 115200 baudios |
| EN | EN | Reinicio de la placa | Botón integrado; pulsarlo dos veces en menos de 3 s | Abre el portal de configuración; también se abre si se mantiene el pulsador 3 s al encender |
| BOOT | BOOT | Modo de descarga | Botón integrado, se mantiene al energizar | Se usa si la placa no entra sola en modo de flasheo |

El pulsador es un B3F-4055 de cuatro patas. Internamente las patas forman dos pares unidos, de modo que el cableado debe hacerse en diagonal: una pata de un par a GPIO4 y una pata del otro par a GND. Usar dos patas de la misma pareja es una de las causas probables del comportamiento anómalo que se observó en T1, y el diagnóstico del pulsador lo recoge como error de cableado. El LED azul no necesita cableado porque está integrado en la placa.

## 9.3 Anexo C. Glosario

La {{TABLA:T-ANX-GLOS}} define las siglas y los términos propios del proyecto con el sentido que tienen en el código y en este manual. No son definiciones genéricas de diccionario.

[[TABLA:T-ANX-GLOS|Siglas y términos usados en el manual.]]
| Término | Definición en este proyecto |
|---|---|
| ADMIN | Interfaz de administración y operación servida en `/admin/` |
| Agregador | Proceso Node.js que sondea los nodos a 1 Hz, mantiene la foto agregada y sirve ADMIN, CLIENTE y SSE |
| Alerta | Emisión de la máquina sísmica cuando dos detectores distintos tienen eventos dentro de una ventana de 10 s |
| AP | Punto de acceso WiFi de configuración `SISMO-D<N>-config` que crea el firmware |
| API | Interfaz HTTP de los nodos y del agregador |
| Candidato | Nodo que inicia una elección tras vencer su plazo de 5000 a 9000 ms |
| CLIENTE | Vista pública para la comunidad servida en `/cliente/`, accesible por `/publico` |
| Commit | Confirmación de una entrada del log cuando la acepta una mayoría de dos de tres |
| Controlador | Servicio aislado con el único acceso al socket de Docker; apaga y enciende nodos y servidores |
| CORS | Política de origen cruzado; el agregador responde con origen abierto |
| Descubrimiento | Anuncio por broadcast UDP 4211 con el que los nodos aprenden las direcciones de los demás |
| Detector | Cada ESP32 o su nodo simulado, que genera eventos y participa en el consenso |
| DHCP | Protocolo con el que el router asigna direcciones dinámicas a las placas |
| Evento | Lectura simulada producida por una pulsación: identificador, nodo, nivel, PGA, duración y hora |
| Firmware | Código del ESP32 y núcleo portable del consenso |
| Forward | Envío de un evento desde un seguidor al líder con deduplicación por identificador |
| GPIO | Pin de entrada o salida de propósito general; el pulsador usa GPIO4 y el LED GPIO2 |
| Huella WiFi | Referencia de redes cercanas que permite detectar si movieron la placa |
| Líder | Nodo que coordina la replicación; se elige por mayoría |
| Log de consenso | Secuencia de entradas replicadas; vive en RAM y su tope es de 1000 entradas |
| MAC | Identificador de fábrica de cada placa, usado por `quien.sh` |
| mDNS | Resolución de nombres locales como `sismo-nodo-N.local` |
| Nivel | Intensidad simulada de 1 a 10 calculada con la duración del pulso: `min(10, 1 + ms/450)` |
| Nodo simulado | Contenedor que ejecuta el mismo núcleo Raft compilado para Linux |
| NTP | Sincronización horaria de los nodos, en UTC-5 y cada 10 minutos |
| NVS | Almacenamiento no volátil donde se guardan término, voto, credenciales WiFi y huella |
| OTA | Actualización del firmware por WiFi con ArduinoOTA |
| Pendiente | Evento aceptado por un nodo pero aún no confirmado por la mayoría |
| PGA | Aceleración máxima simulada: `pga = 0,028 * nivel + 0,015` |
| Quórum | Mayoría de dos de tres; en el agregador es una inferencia, no una validación de consenso |
| Raft | Algoritmo de consenso con elección de líder, replicación y seguridad |
| Retención | Política opcional de archivado o eliminación del histórico, desactivada por defecto |
| RSSI | Intensidad de la señal WiFi que reporta cada nodo |
| Saneado | Sustitución de identificadores de red por marcadores sin alterar resultados |
| Seguidor | Nodo que replica el log del líder y le reenvía los eventos que genera |
| Servidor de datos | Proceso Node.js asignado a un ESP32 que persiste su histórico en PostgreSQL |
| Snapshot | Mecanismo de compactación del log; no está implementado en este prototipo |
| SSE | Canal `/api/stream` con el estado en vivo y un latido cada 5 s |
| Suceso | Cambio relevante del clúster: elección, caída o recuperación |
| Término | Número monotónico de época de Raft; un término tiene como máximo un líder |
| UTC | Tiempo universal coordinado; el proyecto usa UTC-5 |
| Ventana de coincidencia | Intervalo de 10 s en el que se buscan eventos de otros detectores para formar una alerta |
| VYBRA | Nombre del proyecto de alerta sísmica simulada |

## 9.4 Anexo D. Inventario de evidencias

La {{TABLA:T-ANX-EVID}} resume el inventario de `entrega/05-pruebas/datos/inventario-evidencias.csv`, que asigna un identificador a cada pieza de evidencia. El inventario tiene 159 entradas: 133 obtenidas, 23 pendientes y 3 históricas. Los identificadores se citan en el texto y en la matriz del apartado 5.8. Una evidencia pendiente no se declara cumplida.

[[TABLA:T-ANX-EVID|Inventario de evidencias por categoría y estado.]]
| Categoría | Identificadores | Contenido | Estado |
|---|---|---|---|
| A. Código | `COD-01` a `COD-30` | Bloques del núcleo Raft, firmware, backend, controlador y persistencia | 30 de 30 obtenidas |
| B. Interfaz ADMIN | `OP-01` a `OP-10`, `OP-18`, `OP-19` | Capturas de las pestañas del ADMIN en escritorio y móvil | 12 de 12 obtenidas |
| B. Interfaz CLIENTE | `CLI-01` a `CLI-12` | Capturas de la vista pública en escritorio y móvil | 12 de 12 obtenidas |
| C. Backend | `BE-01` a `BE-10` | Arranque del agregador, API, SSE y control | 10 de 10 obtenidas |
| D. Nodos reales | `NOD-01` a `NOD-18` | Flasheo, arranque, red, estado, sucesos y log de las tres placas | 13 obtenidas y 5 pendientes |
| E. Pruebas | `TST-01` a `TST-11` | Suites C++, JavaScript, integración, versiones y carencias | 10 obtenidas y 1 histórica |
| F. Pruebas físicas | `FIS-00` a `FIS-15` | P0, T1, captura pasiva, fotografías y casos pendientes | 6 obtenidas y 12 pendientes |
| G. Arquitectura | `ARQ-01` a `ARQ-14`, `ARQ-NOTA` | Diagramas de despliegue, componentes, secuencias y estados | 15 de 15 obtenidas |
| H. Infraestructura | `INF-01` a `INF-09` | Compose, contenedores, sistemas operativos y consumo | 7 obtenidas y 1 pendiente |
| I. Resultados | `RES-01` a `RES-10` | Firmware, resumen de pruebas, latencia, SSE y consumo | 5 obtenidas y 5 pendientes |
| J. Datos y documentos | `DAT-01` a `DAT-15` | Datos crudos, notas de saneado, checklists y documentos de entrega | 13 obtenidas y 2 históricas |

Las piezas pendientes se concentran en la campaña física: las pruebas de dos detectores, la ausencia de alerta fuera de ventana, el failover y la recuperación reales, la pérdida de quórum con las placas, el reinicio del router y los estados del LED (`FIS-04` a `FIS-15`), además de las métricas físicas de latencia y reelección (`RES-01`, `RES-03`, `RES-07`, `RES-08` y `RES-09`). La evidencia física existente es real del 2026-11-17 y no se regenera sin hardware.

## 9.5 Anexo E. Enlaces del repositorio

El repositorio del proyecto está publicado como privado en `https://github.com/sebas-archive/alerta-sismica-raft-esp32` y la rama `main` apunta al commit `0ee5ed4`. El código entregado es el del repositorio en el commit `0ee5ed4`; la guía de verificación está en `entrega/02-codigo/README.md`.

Documentación del proyecto:

- `README.md`: descripción, arquitectura, puertos, instalación, pruebas y limitaciones.
- `VERSION`, `LICENSE` y `THIRD-PARTY.md`: versión declarada, licencia MIT y avisos de terceros.
- `docs/prueba-hardware.md`: campaña física, checklist y mediciones a registrar.
- `docs/servidores-de-datos.md`: servidores de datos, PostgreSQL, retención y apagado.
- `entrega/01-documento/documento-tecnico.md`: documento técnico completo.
- `entrega/10-informes-fase3/informe-fase3.md` e `informe-fase4.md`: informes de fase y diagnóstico del pulsador.
- `entrega/09-anexos/`: glosario, matriz de trazabilidad, referencias y nota de saneado.
- `entrega/11-documento-final/`: documento final y sus figuras.
- `entrega/12-manual-instalacion/`: este manual en Markdown y Word.

Código y evidencias:

- `firmware/detector/`: firmware del ESP32 y núcleo portable.
- `firmware/test/`: arnés C++ de la red Raft simulada.
- `firmware/quien.sh` y `firmware/cargar.sh`: identificación y flasheo de placas.
- `web/`: agregador, panel, servidor de datos y controlador.
- `web/nodo-sim/`: nodo simulado con el núcleo Raft real.
- `web/admin-src/`: fuente de la interfaz ADMIN.
- `entrega/04-evidencias/`: capturas, logs y tablas por categoría.
- `entrega/05-pruebas/`: datos crudos, logs y scripts de la campaña.
- Video de sustentación: https://youtu.be/YlzKwWkXzaw.

## 9.6 Anexo F. Lista de verificación final de instalación

La lista se marca en orden. Cada punto incluye el criterio que permite darlo por hecho. Si un punto no se cumple, no se continúa al siguiente.

1. Equipo host con Docker, al menos 6 GiB de memoria libre y los puertos 8095, 9001 a 9003 y 8101 a 8103 libres, más el 8443 si se usará HTTPS. Criterio: el comando `docker compose config --services` responde sin errores y `docker --version` informa la versión instalada.
2. Copia de `ejemplo.env` a `.env` y revisión de las variables del entorno. Criterio: `.env` existe en la raíz, no está versionado y los valores de `PUERTO_PANEL`, `PUERTO_NODO1` a `PUERTO_NODO3` y `PUERTO_SERVIDOR1` a `PUERTO_SERVIDOR3` son los esperados.
3. Secretos completados para el firmware, con la contraseña WiFi, la clave OTA y la clave del portal en `firmware/detector/secretos.h`. Criterio: el archivo existe, no está versionado y el firmware compila sin el error de secreto faltante.
4. Construcción y arranque del stack con `docker compose up -d --build`. Criterio: el comando termina sin error de construcción.
5. Estado de los contenedores con `docker compose ps`. Criterio: 11 contenedores arriba, 10 con healthcheck sano y el panel arriba sin healthcheck.
6. Panel disponible en `http://127.0.0.1:8095/`. Criterio: la raíz redirige a `/admin/` y `GET /api/estado` responde con tres nodos alcanzables y quórum verdadero.
7. Vista pública disponible en `/publico`. Criterio: redirige a `/cliente/` y muestra el estado del servicio y el mapa.
8. Flujo de tiempo real con `timeout 12 curl -sN http://127.0.0.1:8095/api/stream`. Criterio: llega un evento `estado` inicial y al menos dos latidos `vivo` separados 5 s.
9. Suites de software ejecutadas si se valida el sistema. Criterio: C++ 78 de 78, JavaScript 60 de 75 sin servicios externos, `test:db` 70 de 75 con tres PostgreSQL y `test:infra` 5 de 5, todas con 0 fallos.
10. Firmware compilado para los tres nodos. Criterio: `arduino-cli compile` termina con exit 0 en `-DNODO=1`, `-DNODO=2` y `-DNODO=3`, con aplicación de aproximadamente 1,105 MB.
11. Tres placas identificadas por su MAC y flasheadas. Criterio: `./quien.sh` informa el detector correcto y `./cargar.sh N` termina sin error; la MAC queda registrada en `firmware/placas.conf`.
12. Nodos en la red. Criterio: `getent hosts sismo-nodo-1.local sismo-nodo-2.local sismo-nodo-3.local` resuelve las tres direcciones y `curl -m 2 http://IP_DEL_NODO/estado` responde 200 con 18 claves.
13. Clúster formado. Criterio: exactamente un nodo con rol líder, el mismo `lider_conocido` y el mismo término en los tres, y LED azul fijo en las tres placas.
14. Portal de configuración operativo. Criterio: al pulsar EN dos veces en menos de 3 s aparece el AP `SISMO-D<N>-config`, guarda la red elegida y la placa vuelve a conectarse.
15. Prueba de humo con el pulsador. Criterio: una pulsación de un nodo produce un evento con identificador único que aparece en el log de los tres y se confirma; con un solo detector no se crea alerta.
16. Apagado y encendido desde ADMIN. Criterio: apagar un servidor detiene solo su nodo y su servidor de datos, las bases conservan los datos y el clúster sigue con quórum; encender lo reincorpora.
17. Respaldo inicial. Criterio: están copiados `.env`, `firmware/detector/secretos.h` y el volumen de datos de PostgreSQL fuera del repositorio.
18. Limitaciones comunicadas al operador. Criterio: se informa que el evento es simulado con un pulsador, que el log de Raft no es durable, que no hay snapshots, que el transporte no está cifrado por defecto y que la campaña física T1 no se aprobó y T2 en adelante siguen pendientes.
