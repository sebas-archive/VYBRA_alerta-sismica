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
