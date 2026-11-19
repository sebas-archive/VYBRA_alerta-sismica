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
