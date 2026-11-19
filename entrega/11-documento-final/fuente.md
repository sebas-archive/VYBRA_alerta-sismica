# Resumen

VYBRA es un prototipo académico de detección sísmica simulada. Lo componen tres nodos ESP32 con consenso Raft propio sobre WiFi, un agregador en Node.js que sondea el estado y sirve dos interfaces, tres servidores de datos con PostgreSQL para el histórico y un controlador que apaga y enciende servicios desde el panel. Los eventos se generan con un pulsador: la duración del pulso se convierte en un nivel de intensidad entre 1 y 10 y en un valor de PGA según una escala de simulación declarada. No hay acelerómetro ni medición del terreno.

El problema es la confiabilidad de una red de alerta temprana. Varios puntos de observación deben coincidir para no producir falsas alarmas, y el sistema tiene que seguir decidiendo cuando uno falla. La solución replica un log mediante consenso, confirma una entrada solo cuando dos de los tres nodos la almacenan y aplica una máquina de estados determinista que alerta cuando dos detectores distintos registran eventos en diez segundos. El histórico se conserva en tres bases PostgreSQL independientes.

La validación del 2026-11-18 sobre el commit `0ee5ed4` obtuvo 78 casos C++ aprobados, 75 casos JavaScript, 70 contra tres bases reales, 5 pruebas de integración Docker y la compilación del firmware para los tres nodos. La campaña física sigue en curso: P0 se completó y T1 no se aprobó porque una pulsación produjo dos eventos cortos, aunque el clúster los replicó y confirmó correctamente.

**Palabras clave:** sistemas distribuidos, consenso Raft, ESP32, tolerancia a fallos, PostgreSQL, detección sísmica simulada, Server-Sent Events, Docker.

# 1. Introducción

Una red de alerta temprana ante sismos se apoya en la observación distribuida. Varias estaciones registran el movimiento del terreno, un servicio de agregación decide si la señal es consistente entre estaciones y, cuando lo es, emite una notificación. El punto crítico es la decisión de alertar. Una falsa alarma repetida destruye la confianza del usuario y una omisión puede tener consecuencias graves. Desde la ingeniería de software, el problema se reduce a construir un servicio tolerante a fallos que mantenga una decisión común entre procesos que se comunican por una red no confiable.

Los sistemas de consenso resuelven esa clase de problema. Varios procesos proponen valores, los replican en un registro ordenado y solo los consideran decididos cuando una mayoría los ha aceptado (Ongaro y Ousterhout, 2014). Raft organiza el consenso alrededor de un líder elegido por votación y de un log replicado, con reglas explícitas de seguridad y de vivacidad. Su claridad lo convirtió en el algoritmo de referencia para sistemas replicados y en una alternativa docente frente a Paxos, cuyo tratamiento completo suele exigir más formalismo del que cabe en un curso y en un prototipo.

VYBRA lleva esa idea a un escenario de laboratorio con restricciones deliberadas: tres placas ESP32 de bajo costo, una red WiFi doméstica, un equipo de escritorio que actúa como agregador y tres bases PostgreSQL para el histórico. Las placas no tienen sistema operativo de propósito general ni base de datos local. El log de Raft vive en memoria y solo el término y el voto se persisten en la memoria no volátil del microcontrolador (Espressif Systems, 2026). Esa restricción obliga a cuidar el tamaño de las estructuras, el número de mensajes y la forma de recuperar un nodo después de un reinicio, y hace visible la distancia entre un algoritmo correcto en papel y una implementación que opera con memoria limitada.

El alcance del proyecto es académico y demostrativo. Los eventos que alimentan el consenso son simulados mediante un pulsador conectado a un pin de cada placa. La duración de la pulsación se convierte en un nivel de intensidad entre 1 y 10 y en un valor de PGA calculado con una fórmula lineal. El sistema no mide aceleración ni pretende sustituir a una estación sismológica, y así se declara en el firmware, en las interfaces y en este documento. Lo que se demuestra es el procesamiento distribuido: un evento originado en un nodo se propone al clúster, se replica, se confirma por mayoría, se aplica de forma determinista en los tres nodos y produce, cuando corresponde, una alerta que el panel de operación y la vista pública muestran en tiempo real.

El documento se organiza en dieciocho apartados. Los primeros fijan el problema, la justificación y los objetivos. El marco conceptual y el análisis de requisitos conectan la teoría con las decisiones de diseño. Los apartados de arquitectura, componentes, implementación, tolerancia a fallos y seguridad describen el sistema construido y presentan fragmentos del código real. Después vienen las pruebas, el despliegue, los resultados, el presupuesto y las conclusiones. Los anexos reúnen el glosario, la matriz de trazabilidad, la galería de evidencias visuales, los pasos de reproducción y los enlaces al repositorio, al manual y al material del video.

# 2. Planteamiento del problema

## 2.1 Contexto y necesidad

Una red de alerta temprana necesita distinguir entre un evento real y una perturbación local. La estrategia habitual consiste en exigir coincidencia entre varios puntos de observación: un único detector que registra actividad no basta para alertar, porque puede tratarse de ruido, de un fallo local o de una manipulación. Al mismo tiempo, la red no puede depender de un servidor central, porque la caída de ese servidor deja al sistema sin capacidad de decisión justo cuando más se necesita.

En el laboratorio, la necesidad se traduce en un prototipo que demuestre tres propiedades. Primera, que varios nodos acuerdan un orden único de eventos aunque la red pierda paquetes y aunque un nodo se reinicie. Segunda, que la decisión de alertar depende de una regla explícita y reproducible, no de la intuición de un operador. Tercera, que la caída de un nodo no detiene el servicio y que el nodo que vuelve se reincorpora sin corromper el registro.

La dificultad está en sostener la regla de alerta sobre hardware restringido y una red no confiable; escribirla cabe en una función corta. Un ESP32 dispone de unos pocos cientos de kilobytes de RAM compartidos con la pila WiFi, atiende un cliente HTTP por vez, bloquea el bucle mientras escribe flash y pierde su log cuando se reinicia. Cualquier decisión de diseño que ignore esas condiciones produce una demostración que funciona en el escritorio y falla en la placa.

## 2.2 Problemas específicos

1. Consenso en hardware restringido. El algoritmo debe caber en el presupuesto de memoria del microcontrolador, no bloquear el bucle y tolerar pérdidas de paquetes.
2. Persistencia mínima. No hay sistema de archivos ni base de datos local: solo el término y el voto se guardan en memoria no volátil, y el log es volátil.
3. Descubrimiento y direccionamiento. Las placas obtienen su dirección por DHCP y la red puede reasignarla; el sistema necesita un descubrimiento que no dependa de direcciones fijas.
4. Entrada de eventos simulada. No hay instrumentación sísmica: el evento se genera con un pulsador y la escala de intensidad es una simulación declarada.
5. Alertas sin falsos positivos por un solo detector. La regla debe exigir coincidencia entre detectores distintos, con ventana temporal acotada y sin reutilizar eventos.
6. Histórico consultable y operación del panel. El histórico no puede depender de la memoria del agregador ni de la RAM de las placas, y debe poder apagarse y encenderse un servidor de datos sin exponer Docker al navegador.
7. Evidencia verificable. Cada afirmación sobre el funcionamiento tiene que apoyarse en una ejecución fechada, un comando reproducible y un registro que cualquiera pueda revisar.

## 2.3 Consecuencias de no resolverlo

Si el consenso se sustituye por un servidor central, la caída de ese servidor interrumpe la capacidad de decidir. Si la confirmación no exige mayoría, dos nodos pueden aceptar entradas distintas en el mismo índice y el histórico se vuelve inconsistente. Si la alerta depende de un solo detector, el sistema se llena de falsos positivos o, en el extremo opuesto, silencia eventos legítimos. Si no hay evidencia fechada, el informe se apoya en afirmaciones que no se pueden auditar. El proyecto ataca las cuatro consecuencias con el mismo artefacto: un clúster de tres nodos con consenso propio, una regla de coincidencia, tres bases independientes y un protocolo de evidencia.

## 2.4 Alcance del problema

El problema se limita a la capa de decisión y agregación. No incluye la física del sensor, la calibración de umbrales sísmicos ni la evaluación de daños. El evento es un pulso cuya duración se convierte en intensidad, y la alerta se deriva de la coincidencia temporal entre detectores. Tampoco se aborda el escalamiento a más de tres nodos ni el cambio de membresía. El prototipo fija tres nodos y una mayoría de dos, que es el mínimo que permite tolerar una caída.

# 3. Justificación

## 3.1 Justificación académica

El proyecto integra sistemas distribuidos, sistemas embebidos, bases de datos e ingeniería web en un artefacto verificable. Implementar el consenso, en lugar de usar una biblioteca, obliga a razonar sobre términos, votos, índices y quórums, y a enfrentar las consecuencias cuando la memoria es escasa y la red pierde paquetes. La suite en C++ ejecuta el mismo código que corre en las placas, con red simulada y reloj controlado, y permite discutir la diferencia entre corrección del algoritmo y corrección de la implementación. Esa discusión es el aporte formativo central: un ingeniero debe saber qué garantiza el algoritmo, qué garantiza el código y qué no garantiza ninguno de los dos.

## 3.2 Justificación técnica

La separación en capas permite probar cada una por separado y sustituir una por otra. El núcleo Raft no depende de Arduino y se compila para el ESP32 y para Linux. El segundo binario se usa en el despliegue Docker y en las pruebas de integración. Esa decisión reduce el riesgo de que la demostración sin hardware se aleje del comportamiento real, porque el contenedor ejecuta el mismo algoritmo. Además, el agregador no tiene dependencias externas y arranca sin instalar paquetes, lo que simplifica la reproducción y elimina una fuente de fallos.

La arquitectura distribuida ofrece ventajas concretas frente a una solución centralizada. La decisión sobrevive a la caída de un nodo; el histórico sobrevive a la caída del panel, porque cada servidor de datos recolecta por su cuenta; y la interfaz pública puede seguir mostrando el último estado conocido aunque el panel se reinicie. Ninguna de esas ventajas convierte al prototipo en un sistema de producción, pero todas se pueden observar y medir en el laboratorio.

## 3.3 Justificación social y formativa

Una red de alerta temprana es un sistema de interés público y su diseño exige transparencia sobre lo que el sistema puede y no puede hacer. Este proyecto hace explícita la diferencia entre simulación e instrumentación: el pulsador genera eventos, la escala de intensidad es declarada y la campaña física se documenta como en curso. Esa honestidad es parte del aporte. Un informe que oculta los pendientes no sirve para decidir si el sistema se puede desplegar.

La construcción con tres placas ESP32, componentes de protoboard y software libre mantiene el costo de replicar el entorno en un valor bajo. No se requieren nubes, licencias ni infraestructura especializada: el agregador y las bases caben en un equipo de escritorio y el código queda disponible bajo licencia MIT (Open Source Initiative, 2026). El presupuesto del apartado 15 muestra que la compra de hardware se resolvió con 189.214 pesos colombianos y que el software tiene costo cero.

## 3.4 Justificación de la simulación

La simulación responde a una decisión de alcance: concentrar el esfuerzo en el consenso, que es el objeto de la asignatura. Un sensor sísmico real habría añadido muestreo continuo, calibración, ruido y tratamiento de señales, y habría consumido el tiempo disponible en un problema distinto. El pulsador produce eventos discretos con duración medible, suficientes para disparar la replicación y la regla de coincidencia. La contrapartida es que ninguna conclusión del documento se refiere a detección sísmica real, y el texto lo repite donde corresponde.

# 4. Objetivos

## 4.1 Objetivo general

Diseñar, implementar y validar un prototipo de sistema distribuido de detección sísmica simulada sobre tres nodos ESP32 con consenso Raft propio, agregación en Node.js, persistencia en PostgreSQL y dos interfaces web, que demuestre la replicación y confirmación por mayoría de eventos, la tolerancia a la caída de un nodo y la emisión determinista de alertas por coincidencia entre detectores.

## 4.2 Objetivos específicos

1. Diseñar e implementar un núcleo de consenso Raft portable, con elección de líder, replicación del log, confirmación por mayoría, reenvío de propuestas y recuperación de nodos, y probarlo con una red simulada y reloj controlado.
2. Construir el firmware del ESP32 que integra el núcleo con el pulsador, la red WiFi, la memoria no volátil, el servidor HTTP, el descubrimiento por broadcast y la actualización OTA.
3. Definir y probar una máquina de estados sísmica determinista que convierta duraciones de pulso en niveles y PGA, y que emita alertas solo cuando dos detectores distintos coincidan en una ventana de diez segundos.
4. Construir el agregador en Node.js que sondee los tres nodos, componga una fotografía del clúster, infiera líder y quórum y publique el estado por Server-Sent Events.
5. Desarrollar el panel de operación ADMIN y la vista pública CLIENTE, con actualización en tiempo real, histórico consultable y protocolo de actuación.
6. Implementar tres servidores de datos con PostgreSQL, con esquema idempotente, escritura sin duplicados, consultas paginadas y filtradas y una política de retención desactivada por defecto.
7. Desplegar el sistema completo con Docker Compose, incluido el nodo simulado que ejecuta el núcleo Raft real, el controlador aislado con acceso a Docker y el perfil HTTPS opcional.
8. Evaluar el sistema con pruebas funcionales, de integración, de concurrencia, de rendimiento y de tolerancia a fallos, y registrar cada resultado con su comando y su evidencia.
9. Documentar la campaña física con las tres placas, declarar con precisión los resultados obtenidos y los pendientes, y publicar el repositorio, el manual y el material de sustentación.

# 5. Marco conceptual

Este apartado fija el vocabulario mínimo que un lector necesita para interpretar las decisiones de los apartados siguientes; la revisión exhaustiva de la literatura queda fuera de su alcance.

## 5.1 Sistemas distribuidos

Un sistema distribuido es un conjunto de procesos que cooperan mediante el intercambio de mensajes a través de una red. Su dificultad esencial es que los procesos no comparten reloj ni memoria y que los fallos son parciales: un nodo puede dejar de responder mientras los demás siguen operando, y el observador no puede distinguir a primera vista entre un nodo lento, un nodo caído y un mensaje perdido (Lamport, 1978). El modelo teórico habitual para este tipo de sistema es el asíncrono, en el que no existe una cota conocida para la latencia ni para el orden de entrega de los mensajes.

Frente a esa incertidumbre, los sistemas distribuidos se diseñan con dos propiedades en mente. La seguridad exige que nada malo ocurra, por ejemplo que dos nodos no confirmen entradas distintas en el mismo índice. La vivacidad exige que algo bueno ocurra eventualmente, que el sistema elija un líder y siga aceptando propuestas. En el modelo asíncrono puro el consenso determinista con fallos bizantinos es imposible; con fallos de detención es posible siempre que la mayoría esté disponible (Ongaro y Ousterhout, 2014). El prototipo vive en ese segundo caso: los nodos se caen o se desconectan, pero no mienten.

## 5.2 Arquitectura cliente-servidor

La arquitectura cliente-servidor organiza el sistema en dos roles: un proceso que solicita un recurso y otro que lo provee. La variante REST lleva esa separación al protocolo HTTP y usa representaciones de recursos identificadas por URL, con una interfaz uniforme y sin estado en el servidor entre peticiones (Fielding, 2000). En VYBRA el patrón aparece en varios niveles: el navegador es cliente del agregador, el agregador es cliente de los nodos, cada servidor de datos es cliente de su ESP32 y Cliente de su base PostgreSQL. Ninguna de esas relaciones es simétrica, y esa asimetría simplifica el razonamiento sobre quién inicia la comunicación y quién puede reintentar.

La arquitectura también impone límites. Un cliente que sondea a un servidor cada segundo consume recursos del servidor aunque nada haya cambiado, y un servidor que atiende una petición por vez limita el número de clientes simultáneos. El diseño del agregador y del firmware trata esos límites de forma explícita: el primero concentra el sondeo en un solo proceso y el segundo responde con un servidor HTTP ligero que no pretende atender una carga alta.

## 5.3 Microservicios

Los microservicios descomponen una aplicación en servicios pequeños, desplegables de forma independiente y comunicados por la red. El patrón suele venir acompañado de contenedores, orquestación y un contrato por servicio (Docker Inc., 2026). VYBRA no es una arquitectura de microservicios en sentido estricto: no hay orquestador, ni servicio de descubrimiento, ni API gateway, ni despliegue independiente de cada pieza. Lo que sí comparte con ese enfoque es la separación por responsabilidades y el contrato explícito entre procesos.

La distinción importa para no atribuir al proyecto propiedades que no tiene. Los tres servidores de datos son procesos independientes con su propia base y su propia distribución Linux, y el controlador es un servicio aislado con una superficie mínima. Esa separación demuestra el despliegue de servicios heterogéneos sobre la misma red. No demuestra escalado horizontal ni tolerancia a la falla de un orquestador, porque esos problemas no forman parte del alcance.

## 5.4 Comunicación entre procesos

La comunicación entre procesos puede ser síncrona o asíncrona, orientada a petición-respuesta o a eventos. VYBRA usa tres mecanismos. El primero es HTTP con representaciones JSON (Internet Engineering Task Force, 2017) para la API de los nodos, la del agregador y la de los servidores de datos. El segundo es UDP para el consenso y el descubrimiento: los mensajes Raft viajan en datagramas que pueden perderse, duplicarse o llegar fuera de orden, y el algoritmo está diseñado para tolerarlo. El tercero es Server-Sent Events, un canal unidireccional sobre HTTP en el que el servidor escribe bloques de texto y el navegador los recibe mediante EventSource, con reconexión automática (WHATWG, 2026; MDN Web Docs, 2026).

La elección de cada mecanismo responde a una necesidad concreta. Raft necesita baja latencia y no puede esperar el establecimiento de una conexión por mensaje, de ahí UDP. Las interfaces necesitan recibir actualizaciones sin preguntar cada segundo, de ahí SSE. Las consultas al histórico necesitan paginación, filtros y errores tipados, de ahí HTTP con JSON. El correo electrónico y los sistemas de mensajería con broker quedan fuera porque introducirían infraestructura que el prototipo no necesita.

## 5.5 Concurrencia y sincronización

La concurrencia aparece cuando varios procesos acceden a un estado compartido o ejecutan operaciones que dependen del orden. En un sistema distribuido no hay memoria compartida ni un reloj global, de modo que el orden debe construirse. Lamport (1978) mostró que los relojes lógicos permiten establecer un orden causal entre eventos sin sincronizar los relojes físicos. El consenso lleva la idea al extremo: no basta con ordenar, hay que acordar el orden.

La máquina de estados replicada es el puente entre el consenso y la aplicación. Todos los nodos parten del mismo estado inicial, reciben la misma secuencia de operaciones deterministas y llegan al mismo estado (Schneider, 1990). Para que la secuencia sea idéntica, las operaciones se escriben en un registro ordenado que se replica antes de aplicarse; el consenso es el acuerdo sobre qué operación ocupa cada posición. En el proyecto, la máquina sísmica solo consume entradas confirmadas y en orden de índice creciente, de modo que los tres nodos producen las mismas alertas a partir del mismo log.

## 5.6 Tolerancia a fallos

La tolerancia a fallos es la capacidad de un sistema de seguir prestando el servicio correcto cuando uno o varios componentes fallan. En los sistemas replicados se apoya en la redundancia y en el quórum. Un quórum es el número mínimo de nodos que debe coincidir para tomar una decisión; con tres nodos, el quórum es dos. La propiedad clave es que dos mayorías de tres siempre se solapan en al menos un nodo, y esa intersección impide que dos decisiones incompatibles se confirmen a la vez (Ongaro y Ousterhout, 2014).

El precio del quórum es que el sistema deja de aceptar decisiones cuando no hay mayoría disponible. Con un solo nodo vivo, el clúster puede seguir recibiendo propuestas pero no puede confirmarlas. Esa degradación es preferible a confirmar en minoría y arriesgar dos historias incompatibles. El proyecto documenta esa situación, la muestra en el panel y la prueba en la suite de integración.

## 5.7 Computación en la nube

La computación en la nube se define por el acceso bajo demanda a recursos configurables, la elasticidad y el pago por uso (Mell y Grance, 2011). El modelo incluye infraestructura, plataforma y software como servicio. VYBRA no usa nube: el sistema corre en un equipo de escritorio con contenedores locales. La referencia sirve para contrastar. Una versión en producción de esta arquitectura podría desplegar el agregador y los servidores en máquinas virtuales o en un servicio de contenedores, sustituir PostgreSQL local por una instancia gestionada y usar un balanceador con TLS. Ninguna de esas piezas cambia el algoritmo; cambian el costo, la disponibilidad y el modelo operativo.

El presupuesto del apartado 15 declara explícitamente que no hay costos de nube. El software es open source y las imágenes base se descargan de registros públicos. Esa decisión reduce el costo y también reduce la superficie de fallos externos, aunque traslada al operador la responsabilidad de los respaldos y de la disponibilidad.

## 5.8 Seguridad en sistemas distribuidos

La seguridad en un sistema distribuido cubre autenticación, autorización, confidencialidad, integridad y disponibilidad. Cada interfaz expuesta es una superficie de ataque, y cada mensaje que viaja por la red puede ser leído, alterado o reproducido si no se protege. Las prácticas habituales incluyen validar toda entrada, no confiar en el cliente, usar TLS para el tráfico expuesto, almacenar secretos fuera del código y aplicar el principio de menor privilegio (OWASP Foundation, 2026). Caddy (2026) automatiza el aprovisionamiento y la rotación de certificados cuando el servicio se expone con un nombre propio.

VYBRA aplica un subconjunto de esas prácticas y declara las que faltan. El controlador de infraestructura exige un token y no publica puertos; los secretos no se versionan; las consultas SQL usan parámetros; el panel valida el tipo de contenido y el origen de las órdenes de apagado. En cambio, la API de los nodos y el panel no tienen autenticación, y el protocolo Raft no cifra ni firma sus mensajes. Esas ausencias se analizan en el apartado 11 y se listan como limitaciones, porque un informe que solo enumera lo implementado oculta el riesgo.

## 5.9 Persistencia relacional

PostgreSQL es un sistema gestor de bases de datos relacional de código abierto con transacciones ACID, tipos ricos y extensiones (PostgreSQL Global Development Group, 2026). El proyecto aprovecha el tipo `timestamptz` para marcas de tiempo con zona, el tipo `jsonb` para conservar el documento original de cada registro, los índices parciales y funcionales para las consultas del histórico, las claves primarias de texto para aplicar idempotencia con `ON CONFLICT` y la función `pg_total_relation_size` para informar del tamaño de cada tabla. La paginación se resuelve con `LIMIT` y `OFFSET` acompañados de un `count(*)`, de modo que el histórico nunca se carga completo en memoria.

# 6. Análisis de requisitos

Los requisitos se derivan de los problemas del apartado 2 y se usan como contrato de validación. Cada uno tiene un identificador estable y un criterio de aceptación verificable. La matriz del Anexo B enlaza cada requisito con la evidencia que lo respalda y con el objetivo específico que atiende.

## 6.1 Requisitos funcionales

La {{TABLA:T-REQ-FUNC}} reúne las operaciones que el sistema debe realizar. Los criterios están redactados para que una prueba automatizada o una observación del panel puedan confirmarlos o refutarlos.

[[TABLA:T-REQ-FUNC|Requisitos funcionales del sistema.]]

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| RF-01 | Formar un clúster de tres nodos con un único líder por término | Exactamente un nodo con rol líder y el mismo término y líder conocido en los tres |
| RF-02 | Replicar los eventos en un log ordenado | Entradas con índice y término consistentes en los tres nodos |
| RF-03 | Confirmar un evento solo con mayoría de dos de tres | El índice de confirmación avanza únicamente cuando dos nodos coinciden |
| RF-04 | Reenviar al líder los eventos propuestos en un seguidor | El evento aparece en el log del líder con identificador único y sin duplicados |
| RF-05 | Recuperar un nodo que vuelve tras una caída | El nodo converge al log del líder desde el índice 1 |
| RF-06 | Emitir alerta con dos detectores distintos en una ventana de 10 s | Alerta con promedio de niveles y nivel cualitativo; sin alerta con un solo detector o fuera de ventana |
| RF-07 | Consultar estado, log, sucesos y alertas por HTTP y mostrarlos en dos interfaces | Panel ADMIN y vista CLIENTE con actualización en tiempo real |
| RF-08 | Guardar el histórico en PostgreSQL y consultarlo paginado y filtrado | Consultas con filtros y paginación resueltas en la base |
| RF-09 | Apagar y encender servidores de datos desde el panel | Apagado real de contenedores con confirmación y registro de la orden |
| RF-10 | Simular caída y recuperación de un nodo | Cambio de rol, elección de nuevo líder y reincorporación verificables |

## 6.2 Requisitos no funcionales

Los requisitos no funcionales fijan las condiciones de operación. La {{TABLA:T-REQ-NFUNC}} los resume con el criterio que se usó para evaluarlos en el apartado 12.

[[TABLA:T-REQ-NFUNC|Requisitos no funcionales del sistema.]]

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| RNF-01 | Operar con la pérdida de un nodo | El quórum se mantiene con dos de tres nodos y el clúster sigue confirmando |
| RNF-02 | Respetar el presupuesto de memoria del firmware | Compilación sin desbordamiento; uso de RAM y flash informado por nodo |
| RNF-03 | Actualizar en tiempo real sin sondeo del navegador | Estado transmitido por SSE con latido periódico |
| RNF-04 | Ser reproducible sin hardware | Despliegue Docker con el mismo núcleo Raft y pruebas automatizadas |
| RNF-05 | Ofrecer seguridad mínima de operación | Secretos fuera del repositorio; controlador aislado con token y sin puerto público |
| RNF-06 | Trazar la evidencia | Cada resultado enlaza con un registro fechado y un comando reproducible |
| RNF-07 | Responder con latencia baja en el panel | Latencia p95 de `/api/estado` por debajo de 2 ms en el stack local |
| RNF-08 | Soportar el crecimiento del histórico | Paginación en la base y política de retención configurable sin cargar todo en memoria |

## 6.3 Requisitos técnicos

La {{TABLA:T-REQ-TEC}} especifica lenguajes, herramientas e infraestructura. Las versiones son las verificadas en la ejecución del 2026-11-18 y no una lista de deseos.

[[TABLA:T-REQ-TEC|Requisitos técnicos y versiones verificadas.]]

| Área | Tecnología o herramienta | Versión o referencia | Uso en el proyecto |
|---|---|---|---|
| Hardware | ESP32 DevKit V1 de 30 pines con CP2102 | 3 placas | Nodos del clúster físico |
| Firmware | C++ con core Arduino para ESP32 | Estándar gnu++2a, core 3.3.12, ESP-IDF 5.5.5 | Núcleo Raft y pegamento con el hardware |
| Compilador de firmware | arduino-cli | 1.5.1 | Compilación de los tres nodos |
| Librería JSON | ArduinoJson | 7.4.3 | Códec de mensajes, API y pruebas |
| Consenso | Raft propio, sin dependencias | Núcleo portable | Elección, replicación y confirmación |
| Transporte Raft | UDP unicast con JSON compacto | Puerto 4210 | Comunicación entre nodos |
| Descubrimiento | UDP broadcast `SISMO-HOLA` | Puerto 4211 | Aprendizaje de direcciones IP |
| API de los nodos | HTTP sobre Arduino WebServer | Puerto 80 | Estado, log, sucesos, alertas y control |
| Agregador | Node.js ESM sin framework | Runtime local v26.13.0; imagen node:22-alpine | Sondeo, foto agregada y SSE |
| Persistencia | PostgreSQL | 16.15, imagen postgres:16-alpine | Histórico por nodo |
| Servidores de datos | Node.js sobre Fedora 42, openSUSE Leap 15.6 y Ubuntu 24.04 | Node del sistema o nodejs22 | Recolección y consulta del histórico |
| Controlador | Node.js con API de Docker Engine | node:22-alpine | Apagado y encendido de servicios |
| Contenedores | Docker Engine y Docker Compose | Docker 29.9.3 | Orquestación local de once servicios |
| TLS opcional | Caddy con CA local | caddy:2-alpine | Perfil HTTPS en el puerto 8443 |
| Interfaces | React 19, TypeScript y Vite 8 para ADMIN; HTML, CSS y JavaScript nativo con Leaflet 1.9.4 para CLIENTE | Build versionado | Panel de operación y vista pública |
| Pruebas | node:test y arnés C++ propio | 75 casos Node; 78 casos C++ | Validación automatizada |

# 7. Diseño de la arquitectura distribuida

## 7.1 Vista de contexto

El sistema se organiza en cinco capas. La capa de adquisición y consenso es la formada por los tres nodos ESP32, o los contenedores que ejecutan el mismo núcleo para Linux, que generan eventos simulados, mantienen el log y aplican la máquina sísmica. La capa de agregación es el proceso Node.js que sondea a los nodos y sirve las interfaces. La capa de persistencia es la formada por tres servidores de datos con su base PostgreSQL. La capa de presentación es la formada por las aplicaciones ADMIN y CLIENTE. La capa de infraestructura es el controlador que apaga y enciende servidores a petición del panel.

La {{FIG:FIG-ARQ-01}} muestra la arquitectura física completa. El clúster intercambia mensajes Raft por UDP en el puerto 4210 y se descubre por broadcast en el 4211. El agregador sondea a cada nodo por HTTP a un hercio y publica el estado a los navegadores por SSE. Cada servidor de datos sondea a su propio nodo y escribe en su PostgreSQL, sin pasar por el panel. El controlador recibe órdenes del panel con un token y habla con Docker; es el único proceso con acceso al socket.

[[FIG:FIG-ARQ-01|Arquitectura física del sistema: clúster de tres ESP32, agregador con panel, servidores de datos con PostgreSQL, vistas ADMIN y CLIENTE y perfil HTTPS opcional. Fuente: diagrama D-01 del proyecto, elaborado a partir del código y del README.md.]]

## 7.2 Estructura de despliegue

El despliegue por defecto usa once servicios. Tres contenedores ejecutan el nodo simulado con el núcleo Raft compilado para Linux, tres contenedores ejecutan PostgreSQL 16, tres contenedores ejecutan los servidores de datos sobre distribuciones distintas, uno ejecuta el panel y uno el controlador. El perfil `https` añade un servicio opcional con Caddy. La {{FIG:FIG-ARQ-02}} muestra las dependencias, los volúmenes y los puertos publicados.

[[FIG:FIG-ARQ-02|Despliegue Docker: once servicios por defecto, volúmenes de PostgreSQL y perfil opcional https con Caddy. Fuente: diagrama D-02 del proyecto.]]

Las distribuciones diferentes de los servidores de datos responden a una prueba de portabilidad. El mismo servicio Node.js y el mismo contrato HTTP corren sobre Fedora 42, openSUSE Leap 15.6 y Ubuntu 24.04. Si el código dependiera de una distribución, la demostración lo revelaría. La contrapartida es que las versiones de Node no están unificadas: openSUSE fija `nodejs22`, mientras Fedora y Ubuntu usan el Node de la distribución. Esa diferencia se documenta como riesgo de portabilidad y no se corrigió en esta entrega.

## 7.3 Decisiones de diseño

El clúster no tiene base de datos. El log de Raft vive en la RAM de cada placa y solo el término y el voto se persisten en NVS. La persistencia del histórico es responsabilidad de los servidores de datos, fuera del consenso. Esta separación evita que el rendimiento del consenso dependa del disco y mantiene el firmware dentro de su presupuesto de memoria, a costa de la durabilidad que se discute en el apartado 10.

Un servidor de datos por nodo. Cada ESP32 tiene asignado un servidor con su propia base y el mismo número. El servidor consulta a su nodo y guarda; no participa en el consenso ni puede alterar el log. La asignación distribuye la carga de escritura y demuestra el despliegue de un servicio Node.js sobre tres sistemas operativos distintos sin cambiar el código.

El agregador no inventa estado. La fotografía del clúster se compone de las respuestas de los nodos. El líder y el quórum se infieren de los roles y términos informados. Esa inferencia es útil como indicador operativo y no equivale a una validación de consenso, como se explica en el apartado 10.

El despliegue sin hardware usa el mismo núcleo. Los contenedores de nodo compilan `firmware/detector/src/nucleo` para Linux y hablan el mismo protocolo UDP y el mismo contrato HTTP. La demostración en Docker ejecuta el algoritmo real en otro entorno. Esa decisión permite probar la integración completa en un equipo de escritorio y reduce la dependencia de las placas para la evaluación.

## 7.4 Atributos de calidad

La arquitectura prioriza la consistencia sobre la disponibilidad cuando no hay mayoría. Es una elección deliberada: el sistema prefiere no confirmar antes que confirmar en minoría. En los términos del teorema CAP, el prototipo se comporta como un sistema CP durante la partición, porque sacrifica la capacidad de confirmar para preservar una única historia. La lectura del panel no es lineal y puede mostrar estado atrasado de un seguidor, de modo que la consistencia fuerte se limita al log confirmado.

La modificabilidad se apoya en la separación entre núcleo y adaptador. Cambiar la placa, el sensor o la red no exige tocar el algoritmo. La observabilidad es parcial: hay sucesos, logs y una tabla de acciones, pero no métricas ni trazas distribuidas. La seguridad es mínima en el modo por defecto y se refuerza solo en el despliegue de producción y en el perfil HTTPS. Estas cuatro propiedades se retoman en los resultados y en las limitaciones.

# 8. Diseño de componentes y comunicación

## 8.1 Componentes y responsabilidades

La {{TABLA:T-COMPONENTES}} inventaría los procesos del sistema, su tecnología y la responsabilidad de cada uno. La {{FIG:FIG-ARQ-03}} muestra las dependencias entre el firmware portable, el backend y las interfaces.

[[TABLA:T-COMPONENTES|Componentes del sistema y responsabilidades.]]

| Componente | Tecnología | Responsabilidad | Ubicación en el repositorio |
|---|---|---|---|
| Firmware del nodo | C++ con core Arduino para ESP32 | Pulsador, WiFi, NVS, HTTP, UDP, OTA, NTP y LED | `firmware/detector/` |
| Núcleo Raft | C++ portable sin Arduino | Elección, replicación, confirmación, reenvío, recuperación y regla de alerta | `firmware/detector/src/nucleo/` |
| Nodo simulado | C++ compilado para Linux | Ejecuta el mismo núcleo y el mismo contrato HTTP en Docker | `web/nodo-sim/` |
| Agregador y panel | Node.js ESM sin framework | Sondeo a 1 Hz, fotografía del clúster, SSE, proxy de control e histórico | `web/server.js` y `web/poller.js` |
| Servidor de datos por nodo | Node.js con `pg` | Recolección a 1 Hz, escritura idempotente, consultas y retención | `web/servidor/` |
| Base de datos por nodo | PostgreSQL 16 | Histórico de muestras, log, eventos, alertas, sucesos y acciones | `db1`, `db2` y `db3` en Compose |
| Controlador de infraestructura | Node.js con API de Docker | Apagar y encender nodos y servidores de datos | `web/controlador/` |
| Panel ADMIN | React 19 con TypeScript y Vite | Operación del clúster, histórico y control de servidores | `web/admin-src/` y `web/public/admin/` |
| Vista CLIENTE | HTML, CSS y JavaScript con Leaflet | Estado público, alertas, mapa y protocolo de actuación | `web/public/cliente/` |

[[FIG:FIG-ARQ-03|Componentes y dependencias del firmware portable, el backend, el controlador y las interfaces. Fuente: diagrama D-03 del proyecto.]]

## 8.2 Mecanismos de comunicación

Raft usa seis mensajes: `VoteReq`, `VoteResp`, `Append`, `AppendResp`, `Forward` y `ForwardAck`. Se codifican como JSON compacto con claves de una o dos letras y viajan en datagramas UDP al puerto 4210. El descubrimiento es un broadcast de texto con el formato `SISMO-HOLA:N` cada dos segundos, que permite a cada nodo aprender la dirección de los otros sin configuración manual. El canal es deliberadamente simple: un datagrama perdido se recupera en el siguiente latido o en el siguiente reintento, y un datagrama duplicado se descarta por índice y término.

El agregador expone HTTP para las interfaces y SSE para el estado en vivo. El flujo SSE responde con `text/event-stream`, envía una fotografía inicial y otra cada vez que el poller detecta un cambio, y cada cinco segundos envía un evento `vivo`. Si el cliente deja de leer y el búfer supera un megabyte, la conexión se destruye y se liberan el temporizador y el manejador. Las órdenes viajan en peticiones HTTP independientes, porque SSE es unidireccional (MDN Web Docs, 2026). La {{FIG:FIG-ARQ-12}} reúne el sondeo de los nodos, la fotografía agregada y la publicación por SSE hacia ADMIN y CLIENTE.

La comunicación entre el panel y los servidores de datos también es HTTP. El panel consulta el histórico con filtros y paginación y mezcla los resultados de las tres bases cuando el operador elige el modo `todos`. Los servidores no dependen del panel para recolectar: cada uno sondea a su nodo por su cuenta. Esa independencia hace que una caída del panel no detenga la persistencia y que una caída de una base no detenga a las otras dos.

[[FIG:FIG-ARQ-12|Secuencia de agregación y SSE desde el sondeo de los nodos hasta las vistas ADMIN y CLIENTE. Fuente: diagrama D-12 del proyecto.]]

## 8.3 Puertos y canales

La {{TABLA:T-PUERTOS}} reúne los puertos reales del sistema. Los valores se verificaron en el código, en el archivo de composición y en las pruebas del 2026-11-18. La distinción entre puerto de contenedor y puerto de host importa: en producción los servidores y las bases no publican puertos y solo el panel queda accesible.

[[TABLA:T-PUERTOS|Puertos y canales de comunicación del sistema.]]

| Componente | Puerto o interfaz | Notas |
|---|---|---|
| ESP32 real | HTTP 80; Raft UDP 4210; descubrimiento UDP 4211; OTA UDP 3232 | El PC recibe la actualización OTA en TCP 32323 |
| Nodo simulado en Docker | HTTP 8080 en el contenedor, publicado en 9001, 9002 y 9003 | Raft UDP 4210 en la red interna |
| Panel y agregador | Contenedor 8090, publicado en el host en 8095 | `web/server.js` |
| Servidores de datos | Contenedor 8100, publicados en 8101, 8102 y 8103 | Uno por ESP32 |
| PostgreSQL | 5432 solo en la red interna, sin puerto publicado | `postgres:16-alpine` |
| Controlador de infraestructura | 8200 solo en la red interna, sin puerto publicado | Único con socket de Docker |
| Caddy en perfil https | 8443 en el host | Opcional, no arranca por defecto |
| Rutas del panel | `/` redirige a `/admin/`; `/publico` redirige a `/cliente/` | Comprobado con `curl` |

## 8.4 Flujo de un evento

El recorrido de un evento sintético es el siguiente. Una pulsación en el GPIO4 se mide y se convierte en un objeto de evento con identificador único, nodo de origen, nivel, PGA, duración y hora. Si la placa es el líder, agrega la entrada a su log; si es seguidora, se la envía al líder con un mensaje `Forward` y la mantiene pendiente. El líder replica con `Append` y avanza su índice de confirmación cuando dos de los tres nodos la tienen. Entonces cada nodo aplica la entrada confirmada a la máquina sísmica y, si hay coincidencia con otro detector en la ventana de diez segundos, crea una alerta. El agregador publica la fotografía actualizada por SSE y las interfaces la muestran. En paralelo, el servidor de datos de cada nodo guarda las entradas en PostgreSQL.

La {{FIG:FIG-ARQ-09}} muestra la secuencia completa, desde la pulsación hasta la alerta emitida y publicada.

[[FIG:FIG-ARQ-09|Secuencia de un evento generado con el pulsador hasta la confirmación y la alerta, con dos detectores. Fuente: diagrama D-09 del proyecto.]]

La {{FIG:FIG-ARQ-13}} recorre el camino del histórico, desde el nodo hasta la consulta del panel.

[[FIG:FIG-ARQ-13|Flujo de los servidores de datos: nodo, recolector, PostgreSQL y panel. Fuente: diagrama D-13 del proyecto.]]

La {{FIG:FIG-ARQ-14}} muestra el modelo relacional que sostiene ese flujo. Hay seis tablas activas y seis de archivo con la misma estructura. `muestras` guarda el estado del nodo con su JSON, `log_entradas` las entradas del log con su clave y confirmación, `eventos` cada evento, `alertas` el promedio, nivel y eventos, `sucesos` las elecciones y caídas, y `acciones` las pruebas y órdenes con su referencia idempotente. No hay claves foráneas declaradas; la integridad se mantiene con claves únicas y escrituras idempotentes.

[[FIG:FIG-ARQ-14|Modelo entidad-relación de PostgreSQL, con tablas activas y tablas de archivo. Fuente: diagrama D-14 del proyecto.]]

## 8.5 Contratos y límites

El contrato entre procesos está definido por las rutas HTTP y por el formato de los mensajes Raft. El nodo expone una API mínima en el puerto 80 con ocho rutas: la página de estado, `/estado` con dieciocho claves, `/log` paginado de cincuenta en cincuenta, `/sucesos`, `/alertas`, y las órdenes `POST /control`, `POST /pulsar` y `POST /huella`. Todas las respuestas llevan `Cache-Control: no-store` y permiten el origen cruzado. El agregador expone doce rutas que cubren estado, stream, infraestructura, servidores, histórico, registro, retención y el histórico público, además de los proxies de control y de pulsación.

El límite del diseño está en la confianza. Ninguno de esos contratos autentica al cliente. La API del nodo acepta una orden de caída o una pulsación simulada de cualquiera que esté en la red. El panel acepta una orden de apagado de cualquiera que pueda alcanzarlo. El apartado 11 explica qué mitiga esa exposición y qué no, y el apartado 14 la recoge como limitación. La decisión es consciente para un prototipo de laboratorio, pero condiciona cualquier despliegue fuera de la red local.

# 9. Desarrollo e implementación

## 9.1 Organización del código

El firmware se divide en dos partes. `detector.ino` contiene solo el pegamento con el hardware: inicialización, WiFi, UDP, HTTP, NVS, puerto serie, botón, LED, NTP, OTA y escaneo de huella. El núcleo portable en `firmware/detector/src/nucleo/` no depende de Arduino: `raft.cpp` implementa el consenso, `sismo.cpp` la máquina de estados, `mensajes.cpp` el códec JSON, `api.cpp` el contrato HTTP, `huella.cpp` la comparación de redes y `tipos.h` los tipos. Esa separación permite compilar el mismo código para el ESP32 y para Linux, y es la razón por la que la demostración en Docker ejecuta el algoritmo y no una imitación.

El Código 9.1 reproduce las definiciones de rol, evento y entrada. La distinción entre inicio de término y evento tiene efectos prácticos: al ganar una elección, el líder agrega una entrada que no representa un sismo pero que permite confirmar por arrastre las entradas heredadas de términos anteriores. La máquina sísmica ignora esas entradas.

**Código 9.1.** Tipos compartidos del núcleo (`firmware/detector/src/nucleo/tipos.h`).

```cpp
enum class Rol { Seguidor, Candidato, Lider };

// Un sismo detectado por un nodo.
struct Evento {
  std::string id;
  int nodo = 0;
  int nivel = 0;
  float pga = 0;
  uint32_t duracion_ms = 0;
  uint64_t t = 0;          // hora del nodo que lo detectó (ms epoch)
  uint64_t t_lider = 0;    // hora del líder al aceptarlo
  int recibido_por = 0;
};

enum class Clase { InicioTermino, Evento };

// Entrada del log replicado.
struct Entrada {
  uint32_t indice = 0;
  uint32_t termino = 0;
  Clase clase = Clase::Evento;
  int lider = 0;
  Evento ev;
};
```

La {{FIG:FIG-ARQ-04}} muestra las clases y estructuras que comparten el firmware y las pruebas. La {{TABLA:T-FIRMWARE}} resume el tamaño de cada archivo del firmware y el número de líneas incluye comentarios.

[[FIG:FIG-ARQ-04|Clases y estructuras del núcleo Raft: Raft, Propuesta, Entrada, Evento, Sismo y Persistencia. Fuente: diagrama D-04 del proyecto.]]

Los módulos del núcleo son la mayor parte del código y también la mayor parte de las pruebas: 78 casos cubren el consenso, la máquina sísmica, el códec, la API y la huella.

[[TABLA:T-FIRMWARE|Archivos del firmware y longitud.]]

| Archivo | Líneas | Responsabilidad |
|---|---:|---|
| `detector.ino` | 758 | Pegamento con el hardware y bucle principal |
| `src/nucleo/raft.h` | 168 | Interfaz del núcleo de consenso |
| `src/nucleo/raft.cpp` | 501 | Elección, replicación, confirmación, reenvío y recuperación |
| `src/nucleo/api.h` y `api.cpp` | 34 + 123 | Contrato HTTP en JSON |
| `src/nucleo/mensajes.h` y `mensajes.cpp` | 13 + 127 | Códec de los seis mensajes Raft |
| `src/nucleo/sismo.h` y `sismo.cpp` | 38 + 82 | Máquina de estados sísmica |
| `src/nucleo/huella.h` y `huella.cpp` | 41 + 64 | Detección de movimiento por huella WiFi |
| `src/nucleo/tipos.h` | 66 | Tipos compartidos |
| `config.h` | 31 | Tiempos, puertos y configuración de red |
| `pagina.h` y `portal.h` | 91 + 33 | Página de estado y portal de configuración |

## 9.2 Inicialización y bucle principal

El `setup()` abre la consola serie, configura los pines, abre la persistencia, carga la huella, conecta el WiFi, pide la hora por NTP (Internet Engineering Task Force, 2010), crea el núcleo Raft con una semilla aleatoria, abre los sockets UDP de consenso y descubrimiento, registra las rutas HTTP y arranca OTA. El `loop()` ejecuta en cada vuelta, en este orden: vigilancia del WiFi, descubrimiento de nodos, recepción de datagramas Raft, avance del temporizador del núcleo, lectura del botón, atención de una petición HTTP, envío de las salidas pendientes, atención de OTA, vigilancia de la huella, petición periódica de hora, impresión de sucesos y actualización del LED.

El bucle procura no bloquearse, pero algunas llamadas retienen el procesador varios segundos: `handleClient()` atiende un cliente por vez, OTA escribe flash, `Preferences` bloquea al guardar y el escaneo WiFi activo ocupa la radio alrededor de 0,85 segundos. Con una elección entre cinco y nueve segundos hay margen, pero un cliente lento o una actualización OTA pueden provocar una elección espuria. Ese comportamiento se documenta como limitación del entorno y no como error del algoritmo.

Las placas se conectan por DHCP y se anuncian con el nombre `sismo-nodo-N`, que se publica por mDNS. Como la resolución mDNS tarda segundos y el sondeo del agregador es de un segundo, el agregador resuelve los nombres por separado cada cinco segundos y usa la dirección resultante. Entre placas, el descubrimiento no usa mDNS: cada nodo envía por broadcast UDP al puerto 4211 el texto `SISMO-HOLA:N` cada dos segundos y, al recibirlo, guarda la dirección del emisor en una tabla indexada por número de nodo. Si el DHCP asigna una dirección nueva, el siguiente anuncio corrige la tabla sin intervención.

## 9.3 Pulsador, nivel y PGA

El pulsador se conecta entre el GPIO4 y tierra con la resistencia de pull-up interna, de modo que el pin lee alto en reposo y bajo al presionar. El firmware aplica un antirrebote de 20 milisegundos y mide la duración entre flancos; las pulsaciones de menos de 80 milisegundos se ignoran. La duración se convierte en nivel con `nivel = min(10, 1 + ms/450)` y en PGA con `pga = 0.028 · nivel + 0.015`. El identificador tiene la forma `nodo-N-<arranque>-<contador>`, con un arranque aleatorio por reinicio para que los identificadores no se repitan entre sesiones.

**Código 9.2.** Medición del pulsador y generación del evento (`firmware/detector/detector.ino`).

```cpp
void leerBoton(uint64_t ahora) {
  bool crudo = digitalRead(PIN_BOTON) == LOW;
  if (crudo != crudoAnterior) { crudoAnterior = crudo; cambioCrudo = ahora; }
  if (ahora - cambioCrudo < ANTIRREBOTE_MS || crudo == pulsando) return;
  if (crudo) { pulsando = true; tPulso = cambioCrudo; return; }
  pulsando = false;
  uint32_t ms = (uint32_t)(cambioCrudo - tPulso);
  if (ms < PULSO_MIN_MS) return;
  std::string id; int nivel;
  proponerPulso(ms, id, nivel);
}
```

El pulsador es un generador de eventos simulados. No mide aceleración, no contiene un acelerómetro y no representa un sismo real. La fórmula de nivel y PGA es una escala de simulación declarada, y el firmware lo indica en su cabecera. La interfaz muestra la etiqueta de simulacro en las alertas para que no haya ambigüedad. La persistencia usa tres espacios de la memoria no volátil: uno para el término y el voto, otro para las credenciales WiFi y la marca de doble reinicio, y un tercero para la huella de redes y las marcas de placa movida.

## 9.4 Elección de líder y replicación

El candidato incrementa el término, se vota a sí mismo, persiste el voto antes de pedir votos a los demás y reinicia su temporizador. La comprobación de log al día implementa la regla de seguridad de Raft: un voto solo se concede si el log del candidato está al menos tan actualizado como el del votante; se compara primero el término de la última entrada y después su índice. El temporizador se reinicia con cada mensaje válido del líder y con cada voto concedido, y el plazo se sortea de forma uniforme para que dos nodos no se postulen a la vez.

El líder envía un latido cada 500 milisegundos. Cada `Append` lleva el índice y el término de la entrada anterior, el índice de confirmación del líder y hasta ocho entradas nuevas. El seguidor comprueba la coincidencia en esos dos valores; si falla, responde con una pista que permite retroceder en un paso en lugar de probar índice por índice. Para que el tráfico no se multiplique cuando se pierden paquetes, el líder mantiene un tope de cuatro lotes sin respuesta por seguidor y, al recibir una respuesta correcta, vuelve a llenar la ventana sin esperar al latido.

La confirmación se calcula solo sobre entradas del término actual. El Código 9.3 reproduce esa regla: se recorre el log hacia atrás desde el último índice y se confirma el mayor índice que tenga una mayoría de coincidencias, deteniéndose en cuanto se encuentra una entrada de un término anterior.

**Código 9.3.** Confirmación por mayoría (`firmware/detector/src/nucleo/raft.cpp`).

```cpp
// Avanza commitIndex_ al mayor N del término actual que tenga una mayoría.
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
```

El reenvío completa el ciclo. Un seguidor que recibe un evento no espera a convertirse en líder: lo coloca en una cola de pendientes y lo envía al líder con un mensaje `Forward`; si no conoce al líder, lo reintenta cada 500 milisegundos. El líder comprueba que el identificador no esté ya en su log y, si es nuevo, lo agrega como una entrada más. Cuando el líder ha aceptado la propuesta, responde `ForwardAck` y el seguidor la retira de su cola. La deduplicación se hace por identificador en ambos lados, de modo que un reintento no crea una entrada duplicada. La cola tiene un tope de cien eventos; al llenarse, la propuesta se rechaza con el resultado de cola llena y el firmware responde con el código HTTP 507.

## 9.5 La máquina sísmica

La máquina sísmica es determinista y consume únicamente entradas confirmadas. Su regla es la siguiente: al aplicar un evento, se busca para cada uno de los otros dos detectores el evento más cercano en el tiempo que esté libre, es decir, no consumido por una alerta anterior, y cuya diferencia con el evento disparador no supere los diez segundos. Si se encuentran al menos dos eventos, el disparador y al menos uno de otro detector, se forma un grupo; se recorta el grupo al intervalo de diez segundos desde el evento más temprano y, si aún quedan dos o más, se emite una alerta con el promedio de niveles. Los eventos usados se marcan como no libres y no pueden reutilizarse.

El nivel de alerta se deriva del promedio: alta si es mayor o igual a 7,5; media si es mayor o igual a 4,5; baja en el resto. El Código 9.4 reproduce la función de aplicación y la clasificación del nivel. Dos detalles sostienen la reproducibilidad: solo se aplican entradas confirmadas y en orden de índice creciente, con una variable que evita aplicar dos veces la misma entrada; y la hora del evento se toma del nodo que lo detectó o, si falta, del líder al aceptarlo, de modo que un evento sin hora no puede formar parte de una alerta. Esa dependencia de la hora, sincronizada por NTP, implica que un nodo sin hora funciona para el consenso pero no produce alertas.

**Código 9.4.** Aplicación determinista de eventos y nivel de alerta (`firmware/detector/src/nucleo/sismo.cpp`).

```cpp
const char* Sismo::nivelAlerta(float promedio) {
  if (promedio >= 7.5f) return "alta";
  if (promedio >= 4.5f) return "media";
  return "baja";
}

void Sismo::aplicar(const Entrada& e) {
  if (e.clase != Clase::Evento) return;  // InicioTermino no cambia el estado sísmico
  eventos_.push_back(e.ev);
  regs_.push_back({e.indice, true});
  if (eventos_.size() > kTope) { eventos_.pop_front(); regs_.pop_front(); }
  const uint64_t hE = horaDe(e.ev);
  if (hE == 0) return;
  const size_t pos = eventos_.size() - 1;
  std::vector<size_t> grupo{pos};        // el evento disparador primero
  for (int d = 1; d <= 3; d++) {         // busca el evento libre más cercano de cada otro detector
    if (d == e.ev.nodo) continue;
    // ... se compara la distancia temporal con kVentana = 10000 ms
  }
  if (grupo.size() < 2) return;          // un solo detector no produce alerta
  // promedio de niveles, marca de no reutilizables y emisión de la alerta
}
```

La {{FIG:FIG-ARQ-11}} resume los estados de la máquina sísmica y las transiciones que llevan a una alerta.

[[FIG:FIG-ARQ-11|Máquina de estados sísmica y emisión de alertas con niveles alta, media y baja. Fuente: diagrama D-11 del proyecto.]]

## 9.6 El agregador

`web/server.js` es un servidor HTTP sobre `node:http` (OpenJS Foundation, 2026), sin dependencias externas. Sirve los archivos estáticos, expone la fotografía del clúster, mantiene el flujo SSE, reenvía las órdenes a los nodos, consulta el histórico a los servidores de datos y coordina el apagado y encendido con el controlador. `web/poller.js` sondea los tres nodos a un hercio con un tiempo límite de tres segundos. Un nodo se considera inalcanzable tras tres fallos consecutivos para que la fotografía no cambie por una pérdida puntual. Además de `/estado`, trae los sucesos nuevos y, solo de la fuente elegida, el log y las alertas; la fuente es el líder o, sin líder, el nodo disponible con mayor índice de confirmación.

El Código 9.5 reproduce el cálculo del líder y del quórum. La comprobación es una inferencia: dos nodos disponibles que reconocen al mismo líder producen quórum verdadero. No pregunta a Raft si existe mayoría, porque los nodos no exponen esa consulta. La diferencia entre inferencia y garantía se discute en el apartado 10.

**Código 9.5.** Inferencia de líder y quórum (`web/poller.js`).

```js
function calcularLiderYFuente() {
  const lideres = info.filter((x) => disponible(x) && x.estado.rol === 'lider');
  lideres.sort((a, b) => (b.estado.termino - a.estado.termino) || (a.n - b.n));
  const lider = lideres[0]?.n ?? null;

  // Quórum: al menos 2 nodos disponibles que reconocen al mismo líder.
  const votos = new Map();
  for (const x of info) {
    if (!disponible(x)) continue;
    const l = x.estado.lider_conocido;
    if (l) votos.set(l, (votos.get(l) ?? 0) + 1);
  }
  const quorum = Math.max(0, ...votos.values()) >= 2;

  let fuente = lider;
  if (fuente === null) {
    const candidatos = info.filter(disponible);
    candidatos.sort((a, b) => (b.estado.commit_index - a.estado.commit_index) || (a.n - b.n));
    fuente = candidatos[0]?.n ?? null;
  }
  return { lider, quorum, fuente };
}
```

El Código 9.6 muestra el flujo SSE. El servidor responde con el tipo `text/event-stream`, envía una fotografía inicial y otra cada vez que el poller emite un cambio, y programa un latido cada cinco segundos. La función de limpieza se registra en el cierre de la petición y en el error de la respuesta para no dejar temporizadores ni manejadores colgados.

**Código 9.6.** Flujo SSE (`web/server.js`).

```js
function stream(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const escribir = (texto) => { if (res.writableLength > maxPendienteSse) return res.destroy(); res.write(texto); };
  const enviar = (foto) => escribir(`event: estado\ndata: ${JSON.stringify(conUbicaciones(foto))}\n\n`);
  const ping = setInterval(() => escribir(`event: vivo\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`), vivoMs);
  poller.on('cambio', enviar);
  const limpiar = () => { clearInterval(ping); poller.off('cambio', enviar); };
  req.on('close', limpiar); res.on('close', limpiar); res.on('error', limpiar);
  enviar(poller.foto());
}
```

El servidor valida el cuerpo de las peticiones con un tope de 4 kilobytes, exige el tipo `application/json` en las peticiones de control y comprueba que el encabezado de origen, si existe, coincida con el host del panel. Esas medidas no sustituyen a la autenticación, pero impiden que una página de otro sitio ordene un apagado mediante un formulario simple. La protección contra recorrido de rutas se aplica antes de normalizar la URL, porque el objeto `URL` elimina los segmentos de punto en silencio.

## 9.7 Panel ADMIN y vista CLIENTE

El panel administrativo es una aplicación React construida desde `web/admin-src/` y servida como archivos estáticos desde `web/public/admin/`. Se accede por `/admin/` y la raíz redirige allí. Sus nueve secciones son Panorama, Sismógrafos, Alertas, Histórico, Clúster Raft, Servidores, Detectores, Registros y Configuración. Panorama concentra la salud del sistema y la actividad sísmica; Clúster Raft presenta el líder, el término y la línea de tiempo; Servidores muestra las tarjetas con sus botones de apagado y encendido. La {{FIG:FIG-UI-ADM-01}} muestra la sección Panorama con el clúster real.

[[FIG:FIG-UI-ADM-01|Panel ADMIN, sección Panorama: salud del sistema, quórum, líder y actividad sísmica. Fuente: captura del stack real en http://127.0.0.1:8095/admin/.]]

La vista pública se sirve en `/publico`, que redirige a `/cliente/`. Está orientada a una persona sin conocimientos técnicos: muestra el estado del servicio, el último sismo, el historial público de alertas y lecturas confirmadas, un mapa con la zona del evento, el protocolo de actuación y los ajustes de accesibilidad, idioma y rango. No expone direcciones IP, estado WiFi, términos de Raft, líder, órdenes ni muestras internas. La {{FIG:FIG-UI-CLI-01}} muestra la vista de inicio con el estado de la red.

[[FIG:FIG-UI-CLI-01|Vista CLIENTE: estado del servicio, última alerta e indicaciones de actuación. Fuente: captura del stack real en http://127.0.0.1:8095/publico.]]

Ambas interfaces consumen el mismo flujo SSE, pero no comparten el mapa. El ADMIN dibuja un mapa vectorial propio: la proyección se calcula en el navegador, sin teselas externas ni bibliotecas de mapas. El CLIENTE usa Leaflet vendorizado en `web/public/cliente/vendor/leaflet/` (Leaflet, 2026) y teselas de OpenStreetMap. Sin acceso a las teselas el mapa base no se dibuja; el resto de la interfaz sigue funcionando. Las dependencias externas son, por tanto, esas teselas y la tipografía, y la documentación del repositorio registra la diferencia para que no se lea como una promesa incumplida.

## 9.8 Servidores de datos

Cada ESP32 tiene asignado un servidor de datos con el mismo número. Los ESP32 toman los datos y los transportan mediante el consenso, pero no los guardan; el servidor los consulta por HTTP y los escribe en su PostgreSQL. Como el log de Raft está replicado, los eventos, las alertas y las entradas de log existen en las tres bases; las muestras de estado, los sucesos y las acciones son propios de cada nodo. El recolector consulta a su nodo a un hercio con un tiempo límite de tres segundos. Si el nodo no responde, registra una muestra como no alcanzable; si responde, guarda una muestra cuando cambia algún campo relevante o cuando han pasado 30 segundos, sincroniza los sucesos nuevos, trae las entradas de log que falten y refresca las alertas cuando cambia el par longitud-confirmación.

El Código 9.7 reproduce un fragmento del esquema tal como se crea al arrancar el servidor. Las claves naturales son la base de la idempotencia: identificador único de evento, combinación de índice, término, clase e identificador para el log, identificador y lista ordenada de eventos para las alertas, y combinación de nodo, secuencia y hora para los sucesos. Las acciones usan una referencia única para que un reintento no duplique el registro.

**Código 9.7.** Fragmento del esquema (`web/servidor/bd.js`).

```sql
CREATE TABLE IF NOT EXISTS muestras (
  id bigserial PRIMARY KEY, t timestamptz NOT NULL DEFAULT now(), nodo int NOT NULL, alcanzable boolean NOT NULL,
  rol text, termino int, log_len int, commit_index int, pendientes int, rssi int, uptime_ms bigint, situacion text, estado jsonb);
CREATE INDEX IF NOT EXISTS muestras_t ON muestras (t DESC);
CREATE TABLE IF NOT EXISTS log_entradas (
  clave text PRIMARY KEY, indice int NOT NULL, termino int NOT NULL, clase text NOT NULL, datos jsonb NOT NULL,
  confirmada boolean NOT NULL DEFAULT false, guardado timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS log_indice ON log_entradas (indice);
CREATE TABLE IF NOT EXISTS eventos (
  id text PRIMARY KEY, nodo int, nivel int, pga double precision, duracion_ms int, t_ms bigint, t_lider_ms bigint,
  recibido_por int, indice int, termino int, confirmado boolean NOT NULL DEFAULT false, datos jsonb NOT NULL,
  guardado timestamptz NOT NULL DEFAULT now());
```

El servidor de datos expone `/info`, `/salud`, `/api/historial`, `/api/registro`, `/api/publico`, `/retencion` y `POST /acciones`. El panel consulta el histórico mediante `/api/historial`, que acepta los tipos eventos, alertas, muestras, sucesos, log y acciones, con filtros por servidor, nodo, categoría, estado, rango de fechas, búsqueda de texto y orden, y paginación con límite máximo de 200 registros. La paginación y los filtros se resuelven en PostgreSQL con `LIMIT`, `OFFSET` y `count(*)`, de modo que el histórico nunca se carga completo. Los valores viajan como parámetros, lo que evita la inyección SQL, y el comodín de la búsqueda se trata como texto.

El modo `todos` pide a cada base solo los primeros registros necesarios y mezcla los resultados. Para los tipos replicados, el agregador deduplica por clave y muestra cada registro una vez con la lista de servidores donde aparece. El modo tiene un tope de mil registros fusionados; si una base no responde, las demás siguen y la respuesta indica el error, con un reintento ante fallos de red o de servidor.

## 9.9 Controlador de infraestructura

El controlador es el único servicio con acceso al socket de Docker. Su superficie de ataque se reduce por diseño: solo entiende tres rutas, `GET /estado`, `GET /salud` y `POST /servidores/{1|2|3}/{apagar|encender}`, y de la petición solo extrae un número entre 1 y 3 y una de dos palabras. No acepta nombres, identificadores ni comandos, y solo actúa sobre contenedores de su propio proyecto de composición con los servicios de nodo y de servidor. Las bases nunca se paran ni se arrancan: solo se consultan para informar de su estado. El Código 9.8 reproduce el enrutado y la comprobación del token.

**Código 9.8.** Superficie del controlador (`web/controlador/controlador.js`).

```js
const RUTA = /^\/servidores\/([1-3])\/(apagar|encender)$/;
const igual = (a, b) => { /* comparación en tiempo constante */ };

export function crearManejador({ controlador, token = '' }) {
  return async (req, res) => {
    req.resume();
    const ruta = (req.url || '').split('?')[0];
    if (req.method === 'GET' && ruta === '/salud') return responder(res, 200, { ok: true });
    if (token && !igual((req.headers.authorization || '').replace(/^Bearer /, ''), token))
      return responder(res, 401, { error: 'no autorizado' });
    if (req.method === 'GET' && ruta === '/estado') return responder(res, 200, await controlador.estado());
    const m = RUTA.exec(ruta);
    if (req.method === 'POST' && m) {
      const n = Number(m[1]);
      return responder(res, 200, await (m[2] === 'apagar' ? controlador.apagar(n) : controlador.encender(n)));
    }
    return responder(res, 404, { error: 'no existe' });
  };
}
```

El contenedor corre con el sistema de archivos de solo lectura, sin capacidades y con la opción que impide ganar privilegios, no publica puertos y compara el token en tiempo constante. El apagado tiene un cerrojo por servidor y espera la confirmación de Docker; detiene primero el nodo y después el servidor, para que el servidor registre que su nodo dejó de responder. El encendido arranca el nodo y luego el servidor, y exige que la base esté encendida porque el controlador nunca la arranca.

## 9.10 Artefactos de compilación

La {{TABLA:T-FIRMWARE-ART}} resume los artefactos del firmware para los tres nodos y el binario del nodo simulado. Los valores provienen de la recompilación del 2026-11-18 con arduino-cli 1.5.1 (Arduino, 2026) y el core 3.3.12. El uso de flash de la aplicación es del 84 por ciento de la partición y el de RAM estática de 54.264 bytes, un 16 por ciento.

[[TABLA:T-FIRMWARE-ART|Artefactos de compilación del firmware y del nodo simulado (2026-11-18).]]

| Artefacto | Nodo 1 | Nodo 2 | Nodo 3 |
|---|---:|---:|---:|
| `detector.ino.bin` | 1.105.728 B | 1.105.728 B | 1.105.712 B |
| `detector.ino.bootloader.bin` | 24.992 B | 24.992 B | 24.992 B |
| `detector.ino.partitions.bin` | 3.072 B | 3.072 B | 3.072 B |
| `boot_app0.bin` | 8.192 B | 8.192 B | 8.192 B |
| `detector.ino.merged.bin` | 4.194.304 B | 4.194.304 B | 4.194.304 B |
| Uso de flash de la aplicación | 84 % | 84 % | 84 % |
| Uso de RAM estática | 54.264 B (16 %) | 54.264 B (16 %) | 54.264 B (16 %) |

El nodo simulado se compila para Linux con `web/nodo-sim/compilar.sh` y ArduinoJson 7.4.3 (Blanchon, 2026), y produce un binario de 275.392 bytes que responde al mismo contrato HTTP. Su latido y su tiempo de elección son más cortos que los del firmware (300 milisegundos y 1500 a 3000 milisegundos frente a 500 y 5000 a 9000), una decisión de demostración que afecta la lectura de los tiempos en los diagramas y que el material del repositorio declara.

# 10. Tolerancia a fallos y recuperación

## 10.1 Modelo de fallos

El sistema asume fallos de detención: un nodo deja de responder, se reinicia o queda aislado, pero no envía mensajes falsos. No se modelan fallos bizantinos ni ataques internos. La red puede perder, duplicar y reordenar datagramas UDP; las peticiones HTTP pueden agotar su tiempo de espera. Los discos de las bases pueden llenarse y los contenedores pueden detenerse. El apartado 11 trata la seguridad y el 14 las limitaciones que quedan fuera de ese modelo.

Con tres nodos, el sistema tolera la caída de uno y pierde la capacidad de confirmar con dos caídos. Con tres nodos la mayoría es de dos, que es el mínimo que permite tolerar una caída y el máximo que cabe en el presupuesto de hardware del proyecto. Con un solo nodo no hay tolerancia; con cinco, la mayoría sigue siendo tres pero el costo y la complejidad de coordinación crecen.

## 10.2 Elección de líder y failover

La {{FIG:FIG-ARQ-05}} muestra los estados del nodo y sus transiciones. Un seguidor se convierte en candidato cuando vence su plazo de elección, sorteado entre cinco y nueve segundos. Un candidato se convierte en líder si obtiene dos de tres votos y vuelve a seguidor si recibe un mensaje de un líder con término igual o mayor. El líder vuelve a seguidor ante un término mayor. La caída simulada se superpone a esos estados y se activa con una orden de control.

[[FIG:FIG-ARQ-05|Estados del nodo Raft: seguidor, candidato, líder y caída simulada. Fuente: diagrama D-05 del proyecto.]]

La {{TABLA:T-CONSENSO}} resume las transiciones y sus disparadores. La columna de verificación indica con qué se comprobó cada una: la suite C++, la prueba de integración o la observación del panel.

[[TABLA:T-CONSENSO|Roles y transiciones del consenso Raft.]]

| Estado | Transición | Disparador | Verificación |
|---|---|---|---|
| Seguidor | Candidato | Vence el plazo de elección, sorteado entre 5000 y 9000 ms | `test_raft`, elección en el panel |
| Candidato | Líder | Obtiene dos de tres votos | `test_raft`, `test:infra` |
| Candidato | Seguidor | Recibe un `Append` del líder o un término mayor | `test_raft` |
| Líder | Seguidor | Recibe un término mayor | `test_raft` |
| Cualquiera | Caído | Orden `POST /control` con la acción caer | `test:infra`, panel |
| Caído | Seguidor | Orden `POST /control` con la acción recuperar | `test:infra`, panel |

El failover completo se probó en la suite de integración, que apaga el nodo líder y comprueba que los dos restantes eligen uno nuevo y que el término avanza. El criterio de la campaña física fija doce segundos como máximo para la reelección, que corresponden a nueve segundos de plazo máximo más latencia de red. La medición con reloj virtual del arnés histórico dio 5.500 milisegundos, pero esa cifra no es física y se cita como referencia, no como resultado del hardware.

La {{FIG:FIG-ARQ-06}} detalla el intercambio de votos y la entrada de inicio de término que el líder agrega al ganar.

[[FIG:FIG-ARQ-06|Secuencia de elección de líder con plazo aleatorio de 5000 a 9000 ms y mayoría de dos de tres. Fuente: diagrama D-06 del proyecto.]]

La {{FIG:FIG-ARQ-08}} muestra la caída del líder, la elección del siguiente y la puesta al día del nodo que vuelve.

[[FIG:FIG-ARQ-08|Secuencia de failover y recuperación: caída del líder, elección y puesta al día del nodo que vuelve. Fuente: diagrama D-08 del proyecto.]]

## 10.3 Replicación y recuperación de un nodo

El líder envía un latido cada 500 milisegundos y replica en lotes de hasta ocho entradas, con un máximo de cuatro lotes en vuelo por seguidor. Si un `Append` falla por inconsistencia, el seguidor responde con una pista y el líder retrocede un paso. Cuando un nodo vuelve tras una caída, arranca como seguidor con su log vacío, porque el log vive en RAM, y espera instrucciones del líder. El líder conserva el índice de coincidencia en cero para ese seguidor y le envía lotes desde el índice 1; el nodo los acepta a medida que su log crece y converge.

La {{FIG:FIG-ARQ-07}} muestra el latido, el lote de hasta ocho entradas y la respuesta que permite al líder confirmar.

[[FIG:FIG-ARQ-07|Secuencia de latido y replicación con Append: lote de hasta ocho entradas y confirmación por mayoría. Fuente: diagrama D-07 del proyecto.]]

El sistema de archivos no existe y el log no es durable. La consecuencia es que un reinicio pierde las entradas que el nodo tenía en memoria, incluidas las confirmadas. El líder las reenvía y el nodo converge al estado del clúster, siempre que el líder las conserve. Si el líder también se reinicia y la mayoría se reinicia en frío, el clúster puede olvidar entradas que un superviviente recuerda. Ese caso se resuelve con una desviación deliberada que se explica en el apartado 10.5.

## 10.4 Comportamiento sin quórum

Cuando solo queda un nodo disponible, el clúster no puede confirmar. Si el nodo superviviente es el líder, sigue enviando latidos y aceptando propuestas en su log, pero el índice de confirmación no avanza porque no hay segunda coincidencia. Si es un seguidor, las propuestas se acumulan en la cola de pendientes hasta el tope de cien y se reintentan cada 500 milisegundos. El agregador refleja la situación con el quórum en falso y el panel lo muestra. Al recuperar un nodo, la confirmación avanza y los pendientes se confirman.

La {{FIG:FIG-ARQ-10}} muestra la degradación controlada: el índice de confirmación se detiene y los eventos quedan pendientes.

[[FIG:FIG-ARQ-10|Secuencia sin quórum: el índice de confirmación no avanza y los eventos quedan pendientes en la cola. Fuente: diagrama D-10 del proyecto.]]

La {{FIG:FIG-UI-ADM-05}} muestra la sección Clúster Raft del panel con el estado de los tres nodos. La {{FIG:FIG-UI-ADM-06}} muestra la sección Servidores, desde donde se apaga y enciende un servidor de datos con confirmación previa. Esas dos vistas son la cara operativa de la tolerancia a fallos: el operador ve el rol, el término y la disponibilidad, y puede provocar una caída controlada sin tocar Docker.

[[FIG:FIG-UI-ADM-05|Panel ADMIN, sección Clúster Raft: líder, término, estado de los tres nodos y línea de tiempo. Fuente: captura del stack real.]]

[[FIG:FIG-UI-ADM-06|Panel ADMIN, sección Servidores: estado de nodo, servidor y base, con el botón de apagado y la distinción entre servidor simulado y físico. Fuente: captura del stack real.]]

El panel no habla con Docker. Al confirmar un apagado o un encendido, lee el estado del controlador para saber si el servidor es simulado o físico, registra la orden en la base del servidor afectado, llama al controlador y devuelve un mensaje con las consecuencias. Si el servidor es físico, el apagado detiene el servidor de datos y ordena al ESP32 la caída lógica; la placa sigue alimentada pero Raft la considera caída. El encendido arranca el servidor y ordena la recuperación. Esa distinción evita que el operador confunda una placa apagada con una desconectada.

## 10.5 Resincronización de emergencia

Existe un caso que el algoritmo clásico no necesita resolver porque asume un log durable (Ongaro, 2014). Si una mayoría se reinicia en frío, puede olvidar entradas confirmadas y elegir como líder a un nodo con un log más corto que el de un superviviente. Cuando el nuevo líder choca con una entrada que el superviviente considera confirmada, no puede retroceder sin violar la seguridad. La implementación toma una decisión deliberada: el superviviente borra su log y lo copia del líder. Es una desviación de Raft que mantiene la convergencia a costa de la durabilidad de esas entradas.

La desviación se documenta en el código y en el informe. No se presenta como una solución: es un parche para un prototipo sin log persistente. En un sistema de producción, la respuesta correcta es persistir el log y usar instantáneas, de modo que un nodo reiniciado no pueda olvidar lo confirmado. El trabajo futuro del apartado 14 incluye esa ruta.

## 10.6 Timeouts, reintentos y protección de la cola

Los tiempos de espera son el mecanismo que convierte una red sin garantías en un sistema que progresa. El sondeo del agregador usa tres segundos de tiempo límite; el del servidor de datos, también tres. Un nodo se marca inalcanzable tras tres fallos consecutivos, para no reaccionar a una pérdida aislada. El reenvío de propuestas reintenta cada 500 milisegundos y la cola de pendientes tiene un tope de cien eventos. Al llenarse, la propuesta se rechaza con un código HTTP 507 en lugar de acumular memoria sin límite.

No hay un circuit breaker en el sentido clásico. La protección es más simple: topes, reintentos y estados de disponibilidad. Esa simplicidad es adecuada para el tamaño del sistema y también una limitación: no hay retroceso exponencial ni enfriamiento, de modo que un nodo caído recibe el mismo ritmo de sondeo que uno sano. Para tres nodos en una red local el tráfico es despreciable; para un despliegue mayor habría que añadir esas políticas.

## 10.7 Fallos de los servicios de datos

El histórico tiene su propia tolerancia. Cada servidor de datos sondea a su nodo por su cuenta, así que la caída del panel no detiene la recolección y la caída de una base no detiene a los otros dos servidores. Si una base no responde, el panel sigue consultando las demás y la respuesta indica cuál falló. Si un servidor de datos cae, el histórico de ese nodo deja de escribirse, pero el nodo sigue participando en el consenso. Esa separación entre disponibilidad del consenso y disponibilidad del histórico es una de las decisiones de diseño más útiles del sistema.

La recuperación del servidor es automática por la política de reinicio del compose, y el recolector reconstruye su estado a partir del nodo. No hay respaldo de las bases ni migraciones versionadas; el volumen de Docker es la única copia. El apartado 14 lo declara como limitación operativa.

# 11. Seguridad del sistema

## 11.1 Modelo de confianza y superficie expuesta

El modelo de confianza del prototipo es una red local cerrada. El panel se publica en el puerto 8095, los nodos simulados en 9001, 9002 y 9003 y los servidores de datos en 8101, 8102 y 8103. Las bases y el controlador no publican puertos. Cualquiera que alcance el panel puede leer el estado, consultar el histórico, pulsar detectores y apagar servidores. Cualquiera que alcance un nodo puede ordenar una caída o una pulsación. Esa exposición es aceptable para una demostración en laboratorio y no lo es para una red compartida.

La superficie se reduce donde el costo de hacerlo es bajo. El controlador es el único servicio con socket de Docker y solo acepta tres rutas. Las bases no se publican. El perfil HTTPS es opcional y no arranca por defecto. El panel exige el tipo de contenido JSON, un cuerpo pequeño y, en las órdenes de infraestructura, un encabezado de origen propio y una confirmación explícita.

## 11.2 Autenticación y autorización

El controlador exige un token Bearer en todas las rutas salvo la de salud. En desarrollo el token es un valor conocido y declarado como tal; en producción llega como secreto de archivo y el servidor rechaza la contraseña de desarrollo o vacía. La comparación se hace en tiempo constante para no filtrar información por el tiempo de respuesta. El panel no tiene autenticación: no hay usuarios, sesiones ni roles. La autorización se reduce a que el controlador no acepte más órdenes que apagar y encender nodos y servidores de su propio proyecto.

La distinción entre ADMIN y CLIENTE es de presentación, no de seguridad. La vista pública oculta datos internos porque su código no los pide, no porque el servidor los proteja. Un cliente HTTP directo puede consultar las rutas internas del panel. El documento lo dice sin rodeos: ocultar un dato en la interfaz no es una medida de control de acceso.

## 11.3 Validación de entradas y saneado

El agregador valida el cuerpo de las peticiones con un tope de 4 kilobytes, exige `application/json` en las peticiones de control y comprueba el origen cuando el navegador lo envía. La comprobación de origen se aplica solo a las órdenes de infraestructura y se omite si el encabezado no llega, lo que limita su utilidad frente a clientes que no son navegadores. Los parámetros del histórico se validan y se envían como valores al motor SQL; la búsqueda de texto escapa el comodín. La protección contra recorrido de rutas se aplica antes de normalizar la dirección.

El firmware también valida. La orden de pulsación acepta una duración entre 80 y 60.000 milisegundos. La orden de control acepta dos acciones. El cuerpo de la petición tiene un tope y las respuestas no se cachean. El servidor HTTP del ESP32 atiende un cliente por vez, lo que reduce la superficie pero también lo hace vulnerable a un cliente lento: una conexión que no termina retrasa el bucle y puede disparar una elección espuria. Esa debilidad se conoce y se documenta.

## 11.4 Gestión de secretos

Las credenciales del firmware, la contraseña WiFi, la clave OTA y la clave del portal viven en `secretos.h`, excluido del repositorio, con una plantilla versionada. El despliegue lee `.env`, también excluido. En producción, la contraseña de PostgreSQL y el token del controlador llegan como secretos de archivo y el servidor rechaza la contraseña de desarrollo o vacía. Las evidencias de la entrega incluyen identificadores de red saneados: direcciones MAC, direcciones IP y nombres de red se sustituyen por marcadores sin alterar los resultados.

El riesgo residual está en los valores por defecto. La contraseña de desarrollo y el token de desarrollo son conocidos y están escritos en el compose. El servidor advierte al arrancar y el despliegue de producción los rechaza, pero un operador que arranque el perfil de desarrollo en una red abierta queda expuesto. La recomendación es cambiar ambos valores antes de cualquier demostración fuera del equipo.

## 11.5 HTTPS con Caddy

El perfil `https` añade Caddy con TLS interno en el puerto 8443, proxy inverso al panel y entrega de su autoridad de certificación en `/ca.crt`. El certificado es local, de modo que el navegador advierte hasta que se instala la autoridad. El proxy desactiva el almacenamiento en búfer para que SSE funcione. El perfil no forma parte de los once servicios por defecto y no se arrancó como evidencia en esta entrega; su configuración se verificó por código y por la validación del archivo de composición.

La decisión de usar una CA local en lugar de un certificado público es coherente con el alcance: no hay dominio ni exposición a Internet. En un despliegue real, Caddy (2026) obtendría un certificado automático para un nombre público. El cambio sería de configuración, no de arquitectura.

## 11.6 Integridad del protocolo de consenso

Los mensajes Raft no se autentican ni se cifran. Un atacante en la red local podría inyectar o forjar mensajes, alterar la tabla de direcciones de los nodos o responder en lugar de otro. El firmware actualiza la dirección de un nodo cuando recibe un mensaje que decodifica y trae un número de origen válido, sin comprobar la identidad del emisor. Esa debilidad se documenta como riesgo y su corrección exige firmar o cifrar los mensajes, lo que a su vez consume memoria y ciclos en el microcontrolador.

La integridad del log confirmado no depende de la confidencialidad del canal. Aunque un atacante lea los mensajes, no puede cambiar una entrada confirmada sin romper las comprobaciones de índice y término entre nodos. Lo que sí puede hacer es denegar el servicio o provocar elecciones. La distinción importa: el sistema no es confidencial ni auténtico, pero su lógica de acuerdo resiste alteraciones pasivas.

## 11.7 Riesgos residuales

La {{TABLA:T-SEGURIDAD}} ordena los riesgos vigentes y su tratamiento. No hay una fila que diga "mitigado" cuando la mitigación es parcial; el estado refleja lo que el código hace hoy.

[[TABLA:T-SEGURIDAD|Riesgos de seguridad y tratamiento vigente.]]

| Riesgo | Consecuencia | Tratamiento actual |
|---|---|---|
| Panel sin autenticación | Cualquiera en la red puede operar el clúster | Aceptado en laboratorio; recomendación de proxy con autenticación |
| API de los nodos abierta | Órdenes de caída y pulsaciones no autorizadas | Aceptado; el firmware valida formato pero no identidad |
| Raft sin cifrado ni firma | Inyección, suplantación o denegación en la red local | Documentado; requiere HMAC o TLS en el futuro |
| Contraseña y token de desarrollo | Acceso si se arranca el perfil de desarrollo en red abierta | Aviso al arrancar y rechazo en producción |
| Controlador como root en el contenedor | Mayor impacto si se explota el proceso | Sin capacidades, solo lectura y sin puertos publicados |
| OTA solo con contraseña | Actualización no firmada | Documentado; requiere firma y arranque seguro |
| Sin copias de seguridad de PostgreSQL | Pérdida del histórico ante fallo del volumen | Volumen de Docker como única copia; pendiente de respaldo |

# 12. Pruebas y evaluación

## 12.1 Estrategia de validación

La validación se organiza en seis niveles. Cuatro son automatizados y reproducibles sin hardware, el quinto es la compilación del firmware y el sexto es la campaña física. Cada nivel responde una pregunta distinta. El primero comprueba la lógica del consenso con red y reloj simulados. El segundo comprueba el agregador, las interfaces y el controlador con dobles de prueba. El tercero comprueba la persistencia contra tres PostgreSQL reales. El cuarto comprueba la integración completa apagando y encendiendo contenedores reales. El quinto comprueba que el firmware compila y cabe en la placa. El sexto comprueba el comportamiento con las placas físicas.

Los cuatro primeros niveles se ejecutaron el 2026-11-18 sobre Linux 7.3.3 (CachyOS) x86_64, con g++ 16.2.1, GNU Make 4.4.1, ArduinoJson 7.4.3, Node.js v26.13.0, arduino-cli 1.5.1, core esp32:esp32 3.3.12 y Docker 29.9.3. Todas las ejecuciones terminaron con código de salida cero y sus registros quedaron en la carpeta de evidencias con fecha, comando y resultado. La {{TABLA:T-PRUEBAS}} resume las suites y sus resultados.

[[TABLA:T-PRUEBAS|Suites de prueba y resultados de la re-ejecución del 2026-11-18.]]

| Validación | Comando | Casos y resultado | Evidencia |
|---|---|---|---|
| Núcleo C++ y red Raft simulada | `make JSON_DIR=... test` | 78 correctos, 0 fallos | `log-TST-01-cpp.txt` |
| JavaScript sin servicios externos | `cd web && npm test` | 75 casos: 60 aprobados, 15 omitidos, 0 fallos, 16.598 ms | `log-TST-03-js.txt` |
| JavaScript con tres PostgreSQL | `cd web && npm run test:db` | 75 casos: 70 aprobados, 5 omitidos, 0 fallos, 13.779 ms | `log-TST-04-test-db.txt` |
| Integración Docker aislada | `cd web && npm run test:infra` | 5 de 5, 0 fallos, 79,2 s | `log-TST-05-test-infra.txt` |
| Firmware, nodos 1 y 2 | `arduino-cli compile` con `-DNODO=1` y `-DNODO=2` | Compilación correcta; aplicación de 1.105.728 B | `tabla-RES-05-firmware.txt` |
| Firmware, nodo 3 | Igual con `-DNODO=3` | Compilación correcta; aplicación de 1.105.712 B | `tabla-RES-05-firmware.txt` |
| Nodo simulado | `web/nodo-sim/compilar.sh` | Compilación correcta; binario de 275.392 B | `tabla-RES-05-firmware.txt` |
| Stack Docker en ejecución | `docker compose ps` | 11 contenedores arriba, 10 con healthcheck sano y el panel sin healthcheck | `log-INF-02-03-contenedores.txt` |

## 12.2 Suite C++

La suite C++ se ejecuta en el equipo de desarrollo sobre una copia de `firmware/test` y `firmware/detector/src`. Compila cinco binarios, `test_api`, `test_huella`, `test_mensajes`, `test_raft` y `test_sismo`, con `make` y ArduinoJson 7.4.3, sobre una red simulada con reloj virtual. Esa red entrega los mensajes de forma controlada y permite reproducir pérdidas, lotes adelantados, reinicios y falta de quórum sin depender de la WiFi real. La suite suma 78 casos: 32 de Raft, 17 de huella, 11 de la máquina sísmica, 9 de la API y 9 del códec de mensajes.

Los casos de Raft cubren la elección con voto único persistido, el rechazo de candidatos con log desactualizado, la replicación por lotes, la confirmación por mayoría, el reenvío desde un seguidor con deduplicación, la recuperación de un nodo reiniciado y la resincronización de emergencia. Los de la máquina sísmica cubren los umbrales de nivel, la ventana de diez segundos, la no reutilización de eventos y la ausencia de alerta con un solo detector. La {{FIG:FIG-TST-01}} muestra la salida real de la ejecución.

[[FIG:FIG-TST-01|Resultado real de la suite C++: 78 casos aprobados y 0 fallos. Fuente: registro de la re-ejecución del 2026-11-18.]]

## 12.3 Suite JavaScript y de integración

La suite JavaScript usa `node:test` con siete archivos. El agregador se prueba con un servidor HTTP real y dobles de la función de consulta; el controlador se prueba contra un Docker simulado por socket Unix que registra cada petición; y el Raft nativo se prueba con tres procesos del nodo simulado que se hablan por UDP. Sin servicios externos ejecuta 60 casos y omite 15: 5 de Docker y 10 de PostgreSQL. Con tres bases reales ejecuta 70 y omite 5, que corresponden a la prueba de integración.

`npm run test:db` levanta tres PostgreSQL efímeros, uno por servidor, y ejecuta la suite con la variable que obliga a usar base real: si falta una base, las pruebas fallan en lugar de omitirse. Los casos cubren el esquema, la escritura idempotente, las consultas, los filtros, la paginación, la retención y la vista pública. `npm run test:infra` levanta un proyecto de composición aislado, con puertos y volúmenes propios, comprueba el apagado y encendido de cada servidor, la persistencia, el cambio de líder, la pérdida de quórum y la recuperación, y destruye el proyecto al terminar sin tocar el stack normal. La prueba tarda 79,2 segundos y aprueba los cinco casos.

## 12.4 Pruebas de concurrencia

La concurrencia se prueba en dos frentes. En el núcleo, la red simulada entrega mensajes con retrasos y reordenamientos controlados, y los casos verifican que dos candidatos simultáneos no producen dos líderes en el mismo término, que un `Append` duplicado no duplica la entrada y que dos propuestas con el mismo identificador se deduplican en el líder. Esos escenarios son la forma controlada de reproducir lo que en una red real ocurre por azar.

En el agregador y en los servidores de datos, las pruebas levantan un servidor HTTP real y tres procesos de nodo que se comunican por UDP. La suite comprueba que el poller tolera respuestas lentas, que el flujo SSE envía el estado inicial y los latidos, y que el cierre de la conexión libera temporizadores. No se ejecutaron pruebas de carga con herramientas como k6 o Apache Bench, ni se midió el comportamiento con decenas de clientes simultáneos. Esa ausencia se declara: el sistema está dimensionado para un operador y una vista pública en una red local, no para una audiencia masiva.

## 12.5 Rendimiento

El rendimiento del panel se midió con cien peticiones secuenciales a `/api/estado`, después de cinco peticiones de calentamiento, sobre el stack real de once servicios. La {{TABLA:T-LATENCIA}} resume las estadísticas. La latencia es del panel en el equipo local, no de los nodos ESP32: la medición física de la API de las placas es una evidencia pendiente y no se presenta como resultado.

[[TABLA:T-LATENCIA|Latencia de GET /api/estado del panel (100 muestras, 2026-11-18).]]

| Estadística | Valor |
|---|---:|
| Mínimo | 0,407 ms |
| Mediana | 0,613 ms |
| Media | 0,672 ms |
| Percentil 95 | 1,097 ms |
| Percentil 99 | 1,184 ms |
| Máximo | 1,338 ms |
| Muestras | 100 |

El consumo de recursos se midió con `docker stats` en streaming durante 21 segundos, con 39 o 40 muestras por contenedor. La {{TABLA:T-CONSUMO}} resume la memoria media y la CPU media de los once servicios. El panel es el proceso que más memoria usa, con 92,4 mebibytes; los servidores de datos rondan los 99 a 100 mebibytes y las bases entre 27 y 33. Los nodos simulados son los más livianos, con 1,2 a 4,1 mebibytes, porque solo ejecutan el núcleo y el servidor HTTP.

[[TABLA:T-CONSUMO|Consumo medio de los contenedores (docker stats, 39-40 muestras por contenedor).]]

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

Las Figuras 20 y 21 muestran las dos mediciones. La primera es la distribución de latencias y la segunda el consumo por contenedor. Ambas se generaron a partir de los datos crudos que acompañan la evidencia.

[[FIG:FIG-RES-01|Distribución de latencia de GET /api/estado del panel sobre 100 muestras. Fuente: evidencia RES-02 del 2026-11-18.]]

[[FIG:FIG-RES-02|Consumo de CPU y memoria de los once contenedores del stack. Fuente: evidencia RES-10 del 2026-11-18.]]

## 12.6 Pruebas de tolerancia a fallos

La tolerancia a fallos se probó en tres escenarios. El primero apaga el nodo líder y comprueba que los dos restantes eligen un nuevo líder y que el término avanza. El segundo apaga un nodo no líder y verifica que el quórum se mantiene y que el sistema sigue confirmando. El tercero apaga dos nodos, comprueba que no hay confirmación, y luego enciende uno para verificar que el pendiente se confirma. Los tres escenarios forman parte de la suite de integración y se ejecutaron contra contenedores reales.

La suite C++ añade escenarios que la integración no puede reproducir con facilidad: pérdida de paquetes, mensajes fuera de orden, reinicio de un nodo con log vacío y colisión de elecciones. La combinación de ambos niveles cubre el espacio de fallos que el modelo permite. Lo que no se probó es el comportamiento ante fallos bizantinos ni ante un ataque, porque están fuera del modelo de fallos declarado.

## 12.7 Campaña física

La campaña física se diseña en fases. La fase de preparación P0 verifica que las placas resuelven por mDNS, responden a la identificación y a la API y toma instantáneas previas. Se completó el 2026-11-17 a las 17:25 con evidencias. La prueba T1 ejecuta una pulsación controlada de unos 900 milisegundos y comprueba que se produce un único evento, que el clúster lo replica y confirma y que el nivel y el PGA coinciden con la fórmula.

T1 no se aprobó. Una pulsación produjo dos eventos cortos de 301 y 174 milisegundos, separados por 3,2 segundos, en lugar de uno de alrededor de 900. Los dos eventos tienen identificadores distintos e idénticos en los tres nodos, el log pasó de longitud 1 a 3 y el índice de confirmación acompañó el cambio. No se creó alerta, correctamente, porque intervino un solo detector. El nivel y el PGA coinciden con la fórmula para las duraciones medidas: el cálculo y el consenso funcionaron y la anomalía está en la entrada física.

El diagnóstico descarta el firmware. Un contacto mantenido habría producido un solo evento y un rebote habría producido fragmentos separados por milisegundos, no por tres segundos. Las causas probables son el cableado, la colocación de las patas del pulsador o el desgaste del contacto. La repetición queda pendiente de revisar el contactor y la autorización de las fases siguientes. T2 en adelante cubre la coincidencia de dos detectores, la ausencia de alerta fuera de ventana, el failover, la recuperación, la pérdida de quórum, el reinicio del router y la caída de un seguidor.

## 12.8 Evaluación frente a los requisitos

El contraste con los requisitos del apartado 6 da un resultado desigual. Los requisitos funcionales RF-01 a RF-10 tienen evidencia de software: suites, integración o capturas. Los no funcionales RNF-01 a RNF-08 también, con la salvedad de que la latencia medida es la del panel y no la del nodo físico. La campaña física es la única parte que no cierra: T1 no se aprobó y T2 en adelante no se ejecutaron. Por eso el proyecto no declara el sistema validado con hardware, sino validado en software y con la campaña en curso.

La matriz del Anexo B detalla cada requisito con su objetivo y su evidencia. El documento no otorga un cumplimiento global porque la rúbrica pide comparar resultados con requisitos, y esa comparación debe incluir lo que falta. Un informe que declare todo cumplido con la mitad de la campaña sin ejecutar no sería verificable.

# 13. Despliegue y ejecución

## 13.1 Requisitos

Para reproducir el sistema sin hardware se necesita un equipo con Linux, macOS o Windows con Docker, al menos 6 gigabytes de memoria libre y conexión a Internet durante la primera construcción, porque se descargan las imágenes base y ArduinoJson. Para compilar el firmware se necesita arduino-cli 1.5.1, el core esp32 3.3.12, el compilador xtensa y un cable USB de datos. Para ejecutar las pruebas locales hacen falta Node.js 22 o superior, g++, make y curl. Para la campaña física se necesitan tres placas ESP32 DevKit V1, tres cables micro-USB de datos, tres pulsadores, tres protoboards y una red WiFi de 2,4 gigahercios con DHCP y broadcast habilitado.

El puerto 8095 debe estar libre para el panel, y los puertos 9001 a 9003 y 8101 a 8103 para los nodos y servidores simulados. El perfil HTTPS usa el 8443. En un equipo con firewall, esos puertos deben permitirse solo desde la red local. La {{TABLA:T-ENV}} resume las variables de configuración del despliegue; los valores por defecto son de desarrollo y así se declaran en el archivo de ejemplo.

[[TABLA:T-ENV|Variables de entorno del despliegue.]]

| Variable | Valor por defecto | Para qué |
|---|---|---|
| `NODO1_URL`, `NODO2_URL`, `NODO3_URL` | vacío (nodos simulados) | Dirección de cada ESP32 real, sin barra final |
| `NODOS` | derivado de las anteriores | Lista que usa el panel; solo para sobrescribir |
| `PUERTO_PANEL` | 8095 | Puerto del panel en el host |
| `PUERTO_NODO1` a `PUERTO_NODO3` | 9001, 9002, 9003 | Puertos de los nodos simulados en el host |
| `PUERTO_SERVIDOR1` a `PUERTO_SERVIDOR3` | 8101, 8102, 8103 | Puertos de los servidores de datos en el host |
| `PUERTO_HTTPS` | 8443 | Puerto del perfil HTTPS |
| `HOST_PUBLICO` | valor de ejemplo | Dirección con la que se entra al panel HTTPS |
| `DB_PASSWORD` | `vybra` | Contraseña de las bases; solo desarrollo |
| `CONTROL_TOKEN` | `vybra-control-dev` | Token entre panel y controlador; solo desarrollo |
| `RETENCION_ACTIVA` y `RETENCION_*` | desactivado | Política de retención y archivado |
| `PREFIJO` | `sismo` | Prefijo de los nombres de contenedor |

## 13.2 Servicios del despliegue

La {{TABLA:T-SERVICIOS}} reúne los once servicios por defecto y el servicio opcional del perfil HTTPS. Los servicios con ancla común tienen healthcheck y reinicio automático: los nodos usan su propia comprobación de salud, los servidores consultan `/salud` y las bases usan `pg_isready`. El panel depende de que nodos y servidores estén sanos y no tiene healthcheck propio.

[[TABLA:T-SERVICIOS|Servicios de docker-compose.yml.]]

| # | Servicio | Imagen o construcción | Contenedor | Puerto host | Perfil |
|---|---|---|---|---|---|
| 1 | nodo1 | Construcción con `Dockerfile.nodo-sim` sobre Debian 12 | `sismo-nodo-1` | 9001 a 8080 | Por defecto |
| 2 | nodo2 | Igual | `sismo-nodo-2` | 9002 a 8080 | Por defecto |
| 3 | nodo3 | Igual | `sismo-nodo-3` | 9003 a 8080 | Por defecto |
| 4 | db1 | `postgres:16-alpine` | `sismo-db-1` | Sin publicar | Por defecto |
| 5 | db2 | `postgres:16-alpine` | `sismo-db-2` | Sin publicar | Por defecto |
| 6 | db3 | `postgres:16-alpine` | `sismo-db-3` | Sin publicar | Por defecto |
| 7 | servidor1 | Construcción con `Dockerfile.fedora` sobre Fedora 42 | `sismo-servidor-1` | 8101 a 8100 | Por defecto |
| 8 | servidor2 | Construcción con `Dockerfile.suse` sobre openSUSE Leap 15.6 | `sismo-servidor-2` | 8102 a 8100 | Por defecto |
| 9 | servidor3 | Construcción con `Dockerfile.ubuntu` sobre Ubuntu 24.04 | `sismo-servidor-3` | 8103 a 8100 | Por defecto |
| 10 | controlador | Construcción con `Dockerfile.controlador` sobre Alpine | `sismo-controlador` | Sin publicar | Por defecto |
| 11 | panel | Construcción de `web` sobre `node:22-alpine` | `sismo-panel` | 8095 a 8090 | Por defecto |
| 12 | https | `caddy:2-alpine` | `sismo-https` | 8443 | HTTPS (opcional) |

La {{FIG:FIG-INF-01}} muestra la salida real de `docker compose ps` con los once contenedores en ejecución. Diez aparecen sanos y el panel aparece arriba sin healthcheck, que es el comportamiento esperado del archivo de composición.

[[FIG:FIG-INF-01|Salida real de docker compose ps: once contenedores en ejecución y estado de salud. Fuente: evidencia de infraestructura del 2026-11-18.]]

## 13.3 Preparación y arranque

El arranque tiene cinco pasos. Primero se copia la plantilla de variables y se editan los valores que dependan del entorno, sobre todo si se conectan placas reales. Segundo, si se va a compilar firmware, se copia la plantilla de secretos y se completan la contraseña WiFi, la clave OTA y la clave del portal. Tercero se construye y se levanta el stack. Cuarto se comprueba el estado de los contenedores y se espera a que los nodos elijan líder. Quinto se abren el panel y la vista pública.

**Código 13.1.** Secuencia de arranque en desarrollo.

```bash
cp ejemplo.env .env                     # editar valores del entorno
docker compose config --services        # debe listar 11 servicios
docker compose up -d --build            # primera vez: descarga imágenes y ArduinoJson
docker compose ps                       # 11 arriba; 10 sanos; panel arriba
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8095/admin/
```

El panel queda en `http://127.0.0.1:8095/`, que redirige a `/admin/`. La vista pública queda en `http://127.0.0.1:8095/publico`, que redirige a `/cliente/`. La comprobación rápida esperada es un código 200 en `/admin/` y un JSON con `quorum`, `lider` y los tres nodos en `/api/estado`. Para detener el stack se usa `docker compose down`, que conserva los volúmenes de PostgreSQL, o `docker compose down -v`, que también borra el histórico.

## 13.4 Despliegue de producción

El archivo `docker-compose.prod.yml` se aplica sobre el compose base y endurece el despliegue. Los nodos simulados pasan a un perfil que no se arranca; los servidores dejan de publicar puertos; la contraseña de PostgreSQL y el token del controlador llegan como secretos de archivo; y la variable de entorno de producción hace que los servidores rechacen la contraseña de desarrollo o vacía. En producción se conectan ESP32 reales mediante las tres variables de dirección de nodo.

El arranque combina los dos archivos y exige crear los archivos de secreto antes de levantar el stack. Si no se definen las direcciones de los nodos, el panel apunta a nodos simulados que no existen en ese perfil. Esa dependencia se documenta en el manual y se recoge como paso obligatorio, no como detalle opcional.

**Código 13.2.** Despliegue de producción con secretos de archivo.

```bash
mkdir -p secretos
printf '%s' 'CLAVE_FUERTE' > secretos/db_password.txt
printf '%s' 'TOKEN_FUERTE' > secretos/control_token.txt
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## 13.5 Perfil HTTPS

El perfil `https` se arranca con `docker compose --profile https up -d`. Caddy escucha en el puerto 8443, usa TLS interno con su propia autoridad de certificación y hace de proxy hacia el panel. La autoridad se descarga en `/ca.crt` y se instala en el navegador para que el certificado sea de confianza. La configuración desactiva el almacenamiento en búfer para que el flujo SSE llegue sin retrasos.

El perfil se implementó y se validó por configuración, pero no se arrancó como evidencia en esta entrega. La captura del panel en 8443 está pendiente y así se declara en la matriz de trazabilidad. La distinción entre "implementado y documentado" y "evidenciado" se mantiene en todo el documento.

## 13.6 Despliegue con placas reales

Con placas reales, el procedimiento cambia en tres puntos. El firmware se compila con la macro que identifica el nodo y se flashea por USB o por WiFi con el script de carga, que identifica la placa por su dirección MAC. El panel se apunta a las direcciones de las placas mediante las variables de entorno. Y los servidores de datos se configuran con la dirección de su nodo asignado. Los contenedores de nodo simulado pueden quedarse apagados; el resto del sistema sigue funcionando.

La conexión de las placas exige que la red permita broadcast y no aísle clientes. Si el enrutador tiene aislamiento de clientes activado, los nodos no se descubren y el clúster no se forma. El manual dedica una sección a ese problema y a la verificación con `getent hosts` y con una captura de tráfico. La placa también necesita hora: sin NTP, el consenso funciona pero no se generan alertas, porque los eventos sin hora no se agrupan.

# 14. Resultados y análisis

## 14.1 Resultados de software

La re-ejecución del 2026-11-18 confirma el estado del software. El núcleo C++ aprueba 78 casos. La suite JavaScript ejecuta 75 casos, de los cuales 60 pasan sin servicios externos y 70 pasan con tres bases reales; las omisiones corresponden a pruebas que requieren Docker o PostgreSQL. La integración Docker aprueba 5 de 5 en 79,2 segundos. El firmware compila para los tres nodos con un binario de aplicación de 1.105.728 bytes en los nodos 1 y 2 y de 1.105.712 en el nodo 3, y el nodo simulado produce un binario de 275.392 bytes.

El estado corresponde a la versión declarada `v1.0.0-rc1` y al commit `0ee5ed4`; el tag de esa versión apunta a un commit anterior y la versión definitiva se etiqueta al cerrar la campaña. El stack completo arranca once servicios y se mantiene estable. En la verificación en vivo, los tres nodos estuvieron disponibles, el líder fue el nodo 1, el término llegó a 3 y el clúster tenía cinco entradas de log. Las tres bases contenían datos reales de la sesión: 116 a 118 muestras por base y los cuatro eventos y dos alertas de la demostración, generados con pulsaciones sobre los nodos simulados entre las 11:14 y las 11:17. Esos datos son de demostración, no mediciones sísmicas, y así se rotulan en las capturas.

## 14.2 Alertas y comportamiento observado

Las dos alertas de la demostración se formaron por consenso con un promedio de nivel de 5,5, que corresponde a la categoría media. El flujo completo funcionó: la pulsación se convirtió en evento, el evento se replicó, la mayoría lo confirmó, la máquina sísmica encontró coincidencia entre dos detectores y el panel y la vista pública mostraron la alerta. La {{FIG:FIG-UI-CLI-02}} muestra la vista pública en el momento de la alerta, con la indicación de simulacro y el protocolo de actuación.

[[FIG:FIG-UI-CLI-02|Vista CLIENTE: alerta activa con indicación de simulacro, nivel y protocolo de actuación. Fuente: captura del stack real del 2026-11-18.]]

La observación en vivo también mostró el límite del agregador. El quórum que publica es una inferencia y puede quedar desactualizado entre dos sondeos. En la práctica, el panel mostró el clúster sano mientras los contenedores estaban sanos y marcó el quórum en falso cuando se apagaron dos nodos durante la prueba de integración. Esa correspondencia es la que se esperaba, pero no constituye una prueba formal de consenso: entre la respuesta de un nodo y la publicación de la fotografía, el líder puede haber caído.

## 14.3 Dificultades encontradas

La primera dificultad fue el presupuesto de memoria. El log de Raft vive en RAM y el firmware comparte esa memoria con la pila WiFi y el servidor HTTP. Ajustar los topes, los lotes y la cola de pendientes exigió medir y recortar. La segunda fue el descubrimiento. Las direcciones cambian por DHCP y el mDNS tarda, de modo que el broadcast propio resolvió el problema entre placas y el agregador resolvió los nombres por separado. La tercera fue la documentación desactualizada: el README y el archivo de versión conservaban cifras de una fase anterior, y varias afirmaciones sobre las interfaces ya no coincidían con el código. El documento se apoya en el código y en las ejecuciones, no en esas afirmaciones.

La cuarta dificultad fue la entrada física. La prueba T1 reveló un comportamiento del pulsador que el firmware no podía corregir sin cambiar el hardware o el antirrebote. El diagnóstico descartó el consenso y el cálculo, y dejó la repetición pendiente de revisar el contactor. La quinta fue la integración de tres distribuciones distintas en los servidores de datos: el mismo código funciona, pero las versiones de Node no son homogéneas y eso complica la reproducibilidad.

## 14.4 Limitaciones

La {{TABLA:T-LIMITACIONES}} recoge las limitaciones vigentes, verificadas en el código y en el README. No se presentan como deuda futura: son condiciones del prototipo actual y explican por qué no se puede desplegar como sistema de alerta real.

[[TABLA:T-LIMITACIONES|Limitaciones vigentes del sistema.]]

| # | Limitación | Consecuencia |
|---|---|---|
| 1 | El evento es simulado con un pulsador; no hay medición sísmica | No se puede evaluar detección real ni calibración |
| 2 | El log de Raft no es durable (RAM) | Un corte puede perder entradas aceptadas y no confirmadas |
| 3 | Resincronización de emergencia | Un nodo puede descartar su log y copiarlo del líder |
| 4 | Sin snapshots ni compactación | Tope de 1000 entradas; al llenarse se rechazan eventos nuevos |
| 5 | Sin seguridad de transporte | HTTP y UDP sin autenticación ni cifrado; CORS abierto |
| 6 | Sin pre-voto ni comprobación de quórum | Un líder aislado sigue creyéndose líder |
| 7 | Acuse de reenvío al aceptar, no al confirmar | Un evento puede perderse si el líder muere justo después |
| 8 | El quórum del agregador es una inferencia | La interfaz no garantiza consenso en el instante mostrado |
| 9 | Panel sin autenticación | Cualquiera en la red puede ordenar apagados o pulsaciones |
| 10 | Sin copias de seguridad de PostgreSQL | El volumen es la única copia del histórico |
| 11 | Sin límites de recursos ni rotación de logs | Un contenedor puede consumir más de lo previsto |
| 12 | Membresía fija de tres nodos | Escalar exige recompilar y cambiar el quórum |

## 14.5 Análisis de la campaña física

La campaña física es la parte del proyecto que no cierra. P0 se completó con evidencias y T1 no se aprobó. El resultado de T1 no invalida el consenso: los dos eventos cortos se replicaron, se confirmaron y se aplicaron igual en los tres nodos, y el nivel calculado coincide con la fórmula. Lo que falla es la fuente del evento. Esa distinción es la conclusión técnica más importante de la campaña y también la más incómoda, porque impide declarar el sistema validado con hardware.

El plan de corrección es concreto: revisar el cableado y la continuidad, verificar que las patas del pulsador estén en diagonal, reasentar o sustituir los cables, añadir un filtro de 100 nanofaradios entre el pin y tierra y repetir una pulsación controlada con captura pasiva. Solo si persiste la anomalía se evaluaría subir el antirrebote por firmware, lo que exige reflashear y autorización. T2 en adelante espera esa repetición.

## 14.6 Trabajo futuro

El trabajo futuro se ordena en tres frentes. La durabilidad exige persistir el log, implementar instantáneas y compactación y recuperar sin descartar lo confirmado. La seguridad exige autenticar los mensajes Raft, cifrar el transporte, añadir control de acceso al panel y firmar las actualizaciones OTA. La observabilidad exige métricas de latencia de confirmación, elección y recuperación, avisos cuando el log se llena o se pierde el quórum, y respaldos programados de las bases. Se suman el cambio de membresía, la comprobación de quórum con pre-voto y, en el plano académico, la sustitución del pulsador por un acelerómetro.

# 15. Presupuesto

## 15.1 Resumen

El presupuesto usa los valores reales de la compra registrada en el comprobante de Electronilab, Pedido 60869, y añade una mensualidad de referencia del plan de datos. El software es open source y su costo de licencia es cero. La {{TABLA:T-PRESUPUESTO-RESUMEN}} resume el total en pesos colombianos y su equivalente referencial en dólares, calculado con la tasa representativa del mercado de 3.309,55 pesos por dólar del 2026-11-18 (Superintendencia Financiera de Colombia, 2026).

[[TABLA:T-PRESUPUESTO-RESUMEN|Resumen del presupuesto del proyecto.]]

| Concepto | COP | USD referencial (TRM 3.309,55) |
|---|---:|---:|
| Compra real de hardware y materiales (Electronilab, Pedido 60869) | 189.214 | 57,17 |
| Plan de datos Claro (una mensualidad de referencia) | 67.000 | 20,24 |
| Software y licencias (open source) | 0 | 0,00 |
| Total general del proyecto | 256.214 | 77,42 |

La compra real se descompone en 179.414 pesos de ítems y 9.800 pesos de envío, que es exactamente el total de la orden impreso en el comprobante. El total general suma la mensualidad del plan de datos. La demo con Docker no requiere compra de hardware: usa los once servicios con nodos simulados y Raft real. El presupuesto documenta el costo de los tres prototipos físicos y de la conectividad.

## 15.2 Detalle de la compra

La {{TABLA:T-PRESUPUESTO-DETALLE}} reproduce las líneas del comprobante. En los cinco ítems la división del valor de línea entre la cantidad es exacta, sin residuo, de modo que el valor unitario se puede derivar sin ambigüedad. El cotejo interno con el montaje del repositorio da las mismas cinco líneas y el mismo subtotal.

[[TABLA:T-PRESUPUESTO-DETALLE|Detalle de la compra real en pesos colombianos (Pedido 60869).]]

| ID | Ítem | Cantidad | Valor | Unitario | Subtotal |
|---|---|---:|---:|---:|---:|
| H-01 | Board de desarrollo ESP32 WiFi Bluetooth BLE CP2102 de 30 pines | 3 | 113.190 | 37.730 | 113.190 |
| H-02 | Protoboard adhesiva MB102 de 830 puntos | 3 | 41.700 | 13.900 | 41.700 |
| H-03 | Paquete de 40 cables jumper Dupont macho-macho de 20 cm | 1 | 9.900 | 9.900 | 9.900 |
| H-04 | Cable micro-USB de 30 cm blindado | 3 | 12.900 | 4.300 | 12.900 |
| H-05 | Pulsador B3F-4055 de 4 pines, 12 por 12 por 7,3 mm | 4 | 1.724 | 431 | 1.724 |
| H-06 | Envío Bogotá Domicilio | 1 | 9.800 | 9.800 | 9.800 |
| | Subtotal de ítems | | | | 179.414 |
| | Total de la compra | | | | 189.214 |

La {{FIG:FIG-PRE-01}} muestra el comprobante que respalda los montos. El archivo se conserva sin editar y su integridad se verificó con una suma SHA-256. Tres fotografías de la recepción de los componentes acompañan la evidencia y documentan que el pedido llegó; no intervienen en el cálculo.

[[FIG:FIG-PRE-01|Comprobante de compra de Electronilab, Pedido 60869: fuente primaria de los montos del presupuesto. Fuente: archivo del proyecto, conservado sin editar.]]

El plan de datos Claro se registra como una mensualidad de referencia y no como un requisito técnico de los nodos durante la demo local. El monto lo aportó el usuario el 2026-11-18 y no proviene de un comprobante adjunto; el documento lo declara. No se multiplica por los meses de la campaña, porque el presupuesto registra una unidad de referencia y no una proyección.

## 15.3 Conversión y verificación

La conversión usa una sola tasa y una sola fecha. El total en dólares se calcula sobre el total en pesos y se redondea una vez, de modo que la suma de las líneas ya redondeadas difiere en un centavo del total. Esa diferencia es de redondeo y se explicita para que no parezca un error de suma. Las sumas se verificaron con aritmética decimal y el registro quedó en el archivo de verificación del presupuesto.

## 15.4 Exclusiones

No se presupuestan las horas de trabajo de los estudiantes, ni el hosting en la nube, ni la instrumentación sísmica, ni el equipo de desarrollo, ni el enrutador WiFi, porque ya existen o no se usan. Tampoco se incluyen herramientas de taller ni adaptadores de pared: la alimentación se hace con los cables micro-USB de datos conectados a los puertos del equipo. La campaña física pendiente no genera costo nuevo de material, porque usa el hardware comprado.

La comparación con el presupuesto estimado anterior explica la diferencia. La estimación de precios de lista era de 242.320 pesos e incluía tres adaptadores de pared que no se compraron, tres pulsadores sin repuesto y no incluía envío ni conectividad. El presupuesto vigente se apoya en la compra real, añade el envío y el plan de datos, y por eso el total general sube aunque el hardware baje.

# 16. Conclusiones

Se construyó un sistema distribuido académico de detección sísmica simulada sobre tres ESP32 con consenso Raft propio, agregación en Node.js, tres bases PostgreSQL, panel ADMIN, vista CLIENTE y controlador de infraestructura. Implementa elección de líder, replicación de un log, confirmación por mayoría, reenvío de propuestas, recuperación de nodos y una máquina de estados determinista que emite alertas cuando dos detectores coinciden en diez segundos. El objetivo general se cumple en el plano del software y queda condicionado en el plano del hardware por la campaña física.

La validación del 2026-11-18 lo confirma. El núcleo C++ aprueba 78 casos, la suite JavaScript ejecuta 75 con 60 aprobados sin servicios externos y 70 con bases reales, la integración Docker aprueba 5 de 5 y el firmware compila para los tres nodos. El despliegue de once servicios se mantiene estable y ejecuta el mismo núcleo Raft compilado para Linux, lo que permite demostrar el sistema sin las placas. Esa continuidad entre el firmware y el contenedor es el logro técnico más sólido del proyecto: el algoritmo que se prueba es el mismo que corre en el hardware.

Los objetivos específicos se cumplen con distinto grado. Los siete primeros tienen artefacto y evidencia de software. El octavo se cumple para las pruebas funcionales, de integración, de concurrencia y de tolerancia a fallos, y queda parcial para el rendimiento físico, porque la latencia medida es la del panel y no la de las placas. El noveno se cumple en documentación y en repositorio, y queda abierto en la campaña: P0 se completó, T1 no se aprobó y T2 en adelante esperan autorización.

La campaña física deja una lección que el informe no oculta. T1 produjo dos eventos cortos en lugar de uno, pero el clúster los replicó, los confirmó y calculó el nivel y el PGA conforme a la fórmula. La anomalía está en la entrada física y no en el consenso. Esa separación entre el fallo del sensor y el funcionamiento del algoritmo es exactamente el tipo de evidencia que un informe técnico debe producir, y también el motivo por el que no se declara una versión definitiva.

El aporte del proyecto es una implementación verificable y reproducible de los mecanismos centrales de un sistema distribuido sobre hardware de bajo costo. Hay un contrato HTTP y UDP explícito, una suite que prueba el mismo código que corre en las placas, un despliegue que demuestra el algoritmo sin hardware y una discusión honesta de las limitaciones que separan el prototipo de un sistema de alerta temprana en producción. Persistir el log, cifrar y autenticar el transporte, añadir control de acceso y completar la campaña física son los pasos que faltan. Ninguno de ellos cambia la arquitectura; todos cambian su grado de garantía.

# 17. Referencias bibliográficas

Arduino. (2026). *Arduino CLI documentation*. https://arduino.github.io/arduino-cli/

Blanchon, B. (2026). *ArduinoJson 7 documentation*. https://arduinojson.org/

Caddy. (2026). *Automatic HTTPS*. https://caddyserver.com/docs/automatic-https

Docker Inc. (2026). *Docker Compose documentation*. https://docs.docker.com/compose/

Espressif Systems. (2026). *ESP32 Technical Reference Manual*. https://www.espressif.com/documentation/esp32_technical_reference_manual_en.pdf

Fielding, R. T. (2000). *Architectural styles and the design of network-based software architectures* [Tesis doctoral, University of California, Irvine]. https://ics.uci.edu/~fielding/pubs/dissertation/fielding_dissertation.pdf

Internet Engineering Task Force. (2010). *RFC 5905: Network Time Protocol Version 4: Protocol and algorithms specification*. https://www.rfc-editor.org/rfc/rfc5905

Internet Engineering Task Force. (2017). *RFC 8259: The JavaScript Object Notation (JSON) data interchange format*. https://www.rfc-editor.org/rfc/rfc8259

Lamport, L. (1978). Time, clocks, and the ordering of events in a distributed system. *Communications of the ACM, 21*(7), 558–565. https://doi.org/10.1145/359545.359563

Leaflet. (2026). *Leaflet 1.9.4 documentation*. https://leafletjs.com/

MDN Web Docs. (2026). *Server-sent events*. https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events

Mell, P., y Grance, T. (2011). *The NIST definition of cloud computing* (NIST Special Publication 800-145). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-145

Ongaro, D. (2014). *Consensus: Bridging theory and practice* [Tesis doctoral, Stanford University]. https://raft.github.io/

Ongaro, D., y Ousterhout, J. (2014). In search of an understandable consensus algorithm. En *Proceedings of the 2014 USENIX Annual Technical Conference* (pp. 305–319). USENIX Association. https://www.usenix.org/conference/atc14/technical-sessions/presentation/ongaro

Open Source Initiative. (2026). *The MIT License*. https://opensource.org/license/mit

OpenJS Foundation. (2026). *Node.js documentation* (versión 22 LTS). https://nodejs.org/docs/latest-v22.x/api/

OWASP Foundation. (2026). *OWASP Top 10*. https://owasp.org/www-project-top-ten/

PostgreSQL Global Development Group. (2026). *PostgreSQL 16 documentation*. https://www.postgresql.org/docs/16/

Schneider, F. B. (1990). Implementing fault-tolerant services using the state machine approach: A tutorial. *ACM Computing Surveys, 22*(4), 299–319. https://doi.org/10.1145/78945.78946

Superintendencia Financiera de Colombia. (2026). *Tasa representativa del mercado (TRM)* [Conjunto de datos]. https://www.datos.gov.co/resource/32sa-8pi3.json

WHATWG. (2026). *HTML Living Standard: Server-sent events*. https://html.spec.whatwg.org/multipage/server-sent-events.html

# 18. Anexos

## Anexo A. Glosario

La {{TABLA:T-GLOSARIO}} reúne las siglas que aparecen en el documento y en el código. La {{TABLA:T-GLOSARIO-TERMINOS}} define los términos propios del proyecto. Las definiciones corresponden al uso real en el repositorio y no a una definición genérica de diccionario.

[[TABLA:T-GLOSARIO|Glosario de siglas.]]

| Sigla | Significado | Uso en el proyecto |
|---|---|---|
| ADMIN | Interfaz de administración y operación | Aplicación servida en `/admin/` |
| AP | Access point | Red de configuración `SISMO-D<N>-config` del firmware |
| API | Application Programming Interface | API HTTP de los nodos y del agregador |
| CLIENTE | Vista pública para la comunidad | Aplicación servida en `/cliente/` |
| CORS | Cross-Origin Resource Sharing | El agregador responde con origen abierto |
| CSV | Comma-Separated Values | Exportación de registros y matrices de pruebas |
| DHCP | Dynamic Host Configuration Protocol | Direcciones dinámicas de las placas |
| ESM | ECMAScript Modules | Módulos nativos de Node.js en `web/` |
| GPIO | General Purpose Input/Output | Pulsador en GPIO4 y LED en GPIO2 |
| HTML | HyperText Markup Language | Interfaces y portal de configuración |
| HTTP y HTTPS | HyperText Transfer Protocol y su variante segura | API de nodos, panel y perfil TLS |
| JSON | JavaScript Object Notation | Mensajes Raft, API y configuración |
| KPI | Key Performance Indicator | Indicadores del Panorama de ADMIN |
| LED | Light-Emitting Diode | Indicador azul integrado del nodo |
| MAC | Media Access Control | Identificador de fábrica de cada placa |
| mDNS | Multicast DNS | Resolución de `sismo-nodo-N.local` |
| MIT | Licencia del Instituto Tecnológico de Massachusetts | Licencia del código y la documentación |
| NTP | Network Time Protocol | Sincronización horaria de los nodos |
| NVS | Non-Volatile Storage | Persistencia de término, voto, WiFi y huella |
| OTA | Over-The-Air | Actualización del firmware por WiFi |
| PGA | Peak Ground Acceleration | Aceleración máxima simulada |
| RAM | Random Access Memory | Memoria donde vive el log de Raft |
| RSSI | Received Signal Strength Indicator | Intensidad de la señal WiFi |
| SPA | Single Page Application | ADMIN y CLIENTE son aplicaciones de una página |
| SSE | Server-Sent Events | Canal `/api/stream` del estado en vivo |
| SSID | Service Set Identifier | Nombre de la red WiFi de 2,4 GHz |
| TCP y UDP | Transmission Control Protocol y User Datagram Protocol | HTTP y OTA sobre TCP; Raft y descubrimiento sobre UDP |
| TLS | Transport Layer Security | HTTPS opcional con Caddy |
| TRM | Tasa representativa del mercado | Conversión referencial a dólares |
| UI | User Interface | Interfaz de usuario |
| UTC | Coordinated Universal Time | Zona del proyecto, UTC−5 |
| VYBRA | Nombre del proyecto | Alerta sísmica simulada |
| WPA2 | Wi-Fi Protected Access 2 | Seguridad del punto de acceso del portal |

[[TABLA:T-GLOSARIO-TERMINOS|Términos del proyecto.]]

| Término | Definición en este proyecto |
|---|---|
| Agregador | Proceso Node.js que sondea los nodos a 1 Hz, mantiene la foto agregada y sirve ADMIN, CLIENTE y SSE |
| Alerta | Emisión de la máquina sísmica cuando dos detectores distintos tienen eventos dentro de una ventana de 10 s |
| Candidato | Estado de un nodo que inicia una elección tras vencer su plazo |
| Commit | Confirmación de una entrada del log cuando la acepta una mayoría |
| Controlador | Servicio aislado con el único acceso al socket de Docker; apaga y enciende nodos y servidores |
| Descubrimiento | Anuncio por broadcast UDP 4211 con el que los nodos aprenden las direcciones de los demás |
| Detector | Cada ESP32 o su nodo simulado, que genera eventos y participa en el consenso |
| Evento | Lectura simulada producida por una pulsación: identificador, nodo, nivel, PGA, duración y hora |
| Firmware | Código del ESP32 y núcleo portable del consenso |
| Forward | Envío de un evento desde un seguidor al líder con deduplicación por identificador |
| Huella WiFi | Referencia de redes cercanas que permite detectar si movieron la placa |
| Líder | Nodo que coordina la replicación; se elige por mayoría |
| Log de consenso | Secuencia de entradas replicadas; vive en RAM y su tope es de 1000 entradas |
| Nivel | Intensidad simulada de 1 a 10 calculada con la duración del pulso |
| Nodo simulado | Contenedor que ejecuta el mismo núcleo Raft compilado para Linux |
| Pendiente | Evento aceptado por un nodo pero aún no confirmado por la mayoría |
| Quórum | Mayoría de dos de tres; en el agregador es una inferencia |
| Raft | Algoritmo de consenso con elección de líder, replicación y seguridad |
| Retención | Política opcional de archivado o eliminación del histórico |
| Saneado | Sustitución de identificadores de red por marcadores sin alterar resultados |
| Snapshot | Mecanismo de compactación del log no implementado en este prototipo |
| Suceso | Cambio relevante del clúster: elección, caída o recuperación |
| Término | Número monotónico de época de Raft; un término tiene como máximo un líder |
| Ventana de coincidencia | Intervalo de 10 s para buscar eventos de otros detectores |

## Anexo B. Matriz de trazabilidad

La {{TABLA:T-MATRIZ}} enlaza cada objetivo específico del apartado 4 con los requisitos que lo concretan y con la evidencia principal que lo respalda. La columna de estado distingue la evidencia refrescada el 2026-11-18, la evidencia histórica del 2026-11-17 y lo que sigue pendiente. Un requisito sin evidencia no se declara cumplido.

[[TABLA:T-MATRIZ|Matriz de trazabilidad: objetivo, requisitos y evidencia.]]

| Objetivo | Requisitos | Evidencia principal | Estado |
|---|---|---|---|
| OE-1 Núcleo Raft portable | RF-01 a RF-05, RF-10, RNF-01 | 32 casos de `test_raft`; prueba de integración de failover y quórum | Refrescada 2026-11-18 |
| OE-2 Firmware del ESP32 | RF-01, RF-04, RF-05, RF-07 | Compilación de los tres nodos; logs de flasheo y arranque | Software refrescado; hardware histórico 2026-11-17 |
| OE-3 Máquina sísmica | RF-06 | 11 casos de `test_sismo`; alertas de la demostración | Refrescada 2026-11-18 |
| OE-4 Agregador y SSE | RF-07, RNF-03, RNF-07 | Pruebas del poller y del panel; 100 mediciones de latencia | Refrescada 2026-11-18 |
| OE-5 Panel ADMIN y vista CLIENTE | RF-07 | Capturas de las nueve secciones y de las catorce vistas públicas | Refrescada 2026-11-18 |
| OE-6 Servidores de datos y PostgreSQL | RF-08, RNF-08 | `test:db` con tres bases reales; consultas y retención | Refrescada 2026-11-18 |
| OE-7 Despliegue, controlador y HTTPS | RF-09, RNF-04, RNF-05 | `test:infra` 5 de 5; once contenedores; perfil HTTPS validado por configuración | Refrescada 2026-11-18; HTTPS sin captura |
| OE-8 Evaluación | RF-01 a RF-10, RNF-01 a RNF-08 | Suites, integración, rendimiento y tolerancia a fallos | Refrescada 2026-11-18; latencia física pendiente |
| OE-9 Documentación y campaña física | RNF-06 | Documento, manual, repositorio, P0 y T1 | P0 completada; T1 no aprobada; T2 pendiente |

Las brechas conocidas se concentran en la campaña física. T1 no se aprobó por el doble evento del pulsador y T2 en adelante no se ejecutaron. El perfil HTTPS está implementado y documentado, pero no se arrancó para capturar el panel en 8443. El arranque de producción se verificó por configuración y por código, no con un despliegue completo. La evidencia de hardware de los nodos es real del 2026-11-17 y se conserva sin alterar.

## Anexo C. Galería de evidencias visuales

Las galerías de este anexo reúnen las capturas del stack real y de la campaña física. Cada imagen conserva su pie y su fuente. Las capturas de interfaz se tomaron en tema claro de escritorio; las variantes oscuras y móviles se incluyen cuando aportan información sobre la adaptación de la interfaz. Los datos que aparecen en las capturas son de demostración, generados por el software, y no mediciones sísmicas.

[[GALERIA:UI-ADM]]

[[GALERIA:UI-CLI]]

[[GALERIA:SRV]]

[[GALERIA:NOD]]

[[GALERIA:INF]]

[[GALERIA:TST]]

[[GALERIA:FIS]]

[[GALERIA:PRE]]

[[GALERIA:RES]]

## Anexo D. Reproducción

Los comandos siguientes reproducen el despliegue y las pruebas desde la raíz del repositorio. La ejecución de las pruebas de integración requiere Docker en funcionamiento y crea un proyecto aislado que se destruye al terminar.

**Código D.1.** Reproducción completa.

```bash
  # Despliegue de los once servicios
docker compose up -d --build            # panel: http://127.0.0.1:8095/

  # Pruebas del núcleo C++
mkdir -p /tmp/vybra && cp -a firmware/test /tmp/vybra/test
mkdir -p /tmp/vybra/detector && cp -a firmware/detector/src /tmp/vybra/detector/src
cd /tmp/vybra/test && make JSON_DIR="$HOME/Arduino/libraries/ArduinoJson/src" test

  # Pruebas JavaScript y de integración
cd web && npm test
cd web && npm run test:db
cd web && npm run test:infra

  # Compilación del firmware del nodo 1
arduino-cli compile --fqbn esp32:esp32:esp32 \
  --build-property "compiler.cpp.extra_flags=-DNODO=1" \
  --build-path /tmp/fw1 firmware/detector
```

La comprobación del estado del stack se hace con `docker compose ps` y con `curl` a `/api/estado`. Los resultados esperados y los mensajes de error más frecuentes están en el manual de instalación y ejecución. La reproducción de las pruebas no requiere las placas; la campaña física sí las requiere y no se puede reproducir sin hardware.

## Anexo E. Enlaces al repositorio, manual y video

El repositorio del proyecto está publicado como privado en `https://github.com/sebas-archive/alerta-sismica-raft-esp32` y su rama principal apunta al commit `0ee5ed4`. La entrega incluye un snapshot del código fuente con suma de verificación, el manual de instalación y ejecución y el material de sustentación.

El manual de instalación y ejecución está en `entrega/06-manual/manual-instalacion-y-ejecucion.md` y cubre requisitos, configuración, despliegue, pruebas, flasheo y solución de problemas. El manual de conexión de las placas está en `entrega/06-manual/conexion-esp32.md`.

El video de sustentación está publicado en https://youtu.be/YlzKwWkXzaw. El material interno de grabación no forma parte del repositorio.
