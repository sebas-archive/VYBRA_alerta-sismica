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
