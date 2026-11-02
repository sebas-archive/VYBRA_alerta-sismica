# Clúster Raft en los 3 ESP32 + interfaz web de control

Fecha: 2026-11-02 · Estado: borrador para aprobación

## Intención

Demostrar en una habitación un detector de sismos distribuido y tolerante a fallos. Los 3 prototipos físicos (ESP32 + pulsador, cada uno conectado a un enchufe) son a la vez **detectores** y **servidores**: entre ellos eligen un líder con Raft, replican cada evento y solo confirman una alerta cuando la mayoría (2 de 3) la tiene. Un 4.º computador muestra todo en vivo en una interfaz web y permite provocar fallos.

Lo que el público tiene que poder ver:
- Presiono el botón de un prototipo → el evento llega al líder, se replica y queda confirmado.
- Dos prototipos distintos presionados con menos de 10 s de diferencia → alerta confirmada, visible en el panel y en la vista pública.
- Desenchufo (o "tumbo" desde el panel) el líder → los otros dos eligen uno nuevo en pocos segundos y el sistema sigue.
- Tumbo dos nodos → "sin quórum": los reportes quedan pendientes y no se emiten alertas.

## Lo que ya existe

- 3 ESP32 DevKit V1 (CP2102) montados: pulsador entre D4 y GND, LED azul integrado en GPIO 2. Firmware actual: `firmware/detector/detector.ino` (reporta por HTTP POST a servidores externos que no existen; se reemplaza).
- `firmware/cargar.sh <1|2|3>`: compila con `-DNODO=n` y carga por USB. `firmware/detector/config.h`: WiFi `Apt_105` y clave.
- Mockups funcionales con datos simulados: `mockup/operador.html` (top bar + 6 pestañas: Panorama, Sismógrafos, Clúster Raft, Detectores, Alertas, Registros), `mockup/cliente.html` (vista pública: Ahora, Sismos recientes, Qué hacer, Ajustes) y `mockup/tokens.css`.
- Red: `Apt_105`, `192.168.80.0/24`, puerta de enlace `.1`. El 4.º PC es `192.168.80.227` (Linux, Node 22 instalado). Las IP `.201`, `.202`, `.203` respondieron libres al ping. La red tiene salida a internet (comprobado), así que NTP está disponible.

## Objetivos

1. **Raft en el firmware de los ESP32**: elección de líder, latidos, replicación de log y confirmación por mayoría entre los 3 nodos, sin depender del PC.
2. **Máquina de estados replicada**: cada nodo aplica las entradas confirmadas en orden y calcula lo mismo (eventos y alertas).
3. **Interfaz web real** en el 4.º PC: el panel de operación y la vista pública muestran el estado real de los nodos, en vivo.
4. **Control desde el panel**: "Simular caída" / "Recuperar" por nodo y un botón virtual por detector.
5. **Actualizar firmware por WiFi (OTA)** después de la primera carga por USB, para no tener que desconectar los prototipos de la pared.
6. **Pruebas**: la lógica de Raft se prueba en el PC sin hardware; luego una prueba guiada con los 3 prototipos.

## No objetivos

- Compactación del log / snapshots: el log vive en RAM con un tope de 1000 entradas (suficiente para una demostración; ver "Log lleno").
- Cambiar el número de nodos en caliente: el clúster es fijo de 3.
- Autenticación y cifrado: red cerrada de la demostración. Queda anotado como riesgo, no se implementa.
- Sensor real de vibración: el "sismo" sigue siendo el tiempo de pulsación.
- Que el PC participe en Raft o guarde datos propios.

## Anti-objetivos (aunque funcione, sería un fracaso)

- Que el panel muestre algo que no viene de los nodos (roles, términos o alertas inventados por el PC).
- Que se emita una alerta sin mayoría confirmada.
- Que un mismo evento quede dos veces en el log.
- Que el panel se congele o mienta cuando un nodo deja de responder: debe marcarlo como caído.

## Decisiones tomadas

### Topología y direcciones
- IP fijas configuradas en el firmware: nodo-1 `192.168.80.201`, nodo-2 `.202`, nodo-3 `.203` (puerta de enlace `.1`, máscara `/24`, DNS `.1`). Van en `config.h` junto al WiFi.
- Cada nodo sabe las IP de los otros dos desde `config.h`.

### Comunicación entre nodos: UDP
- Mensajes Raft por **UDP, puerto 4210**, en JSON compacto. UDP no bloquea el loop (HTTP bloquearía hasta segundos con un nodo caído) y Raft ya tolera mensajes perdidos con reintentos.
- Mensajes: `vote_req`, `vote_resp`, `append` (latido = `append` sin entradas), `append_resp`, `forward` (un seguidor le pasa un evento al líder) y `forward_ack`.
- Tamaño: como máximo 8 entradas por `append` para no pasar de ~1400 bytes por paquete.

### Parámetros de Raft
- Latido del líder cada **300 ms** (es lo que dice la interfaz).
- Tiempo de elección aleatorio entre **1500 y 3000 ms**.
- `currentTerm` y `votedFor` se guardan en flash (NVS, librería `Preferences`) cada vez que cambian, como pide Raft. El log se guarda solo en RAM: un nodo que se reinicia vuelve con log vacío y el líder se lo reenvía completo. Para ponerse al día rápido, el líder manda el siguiente lote apenas recibe el `append_resp` del anterior, sin esperar al próximo latido.
- **Log lleno:** tope de 1000 entradas (~100 KB de RAM). Al llegar a 900 el panel muestra un aviso; en 1000 el líder rechaza eventos nuevos (quedan "rechazados: log lleno" en el panel) y nunca sobrescribe entradas. Para seguir, se reinician los 3 nodos (se pierde el historial). En una demostración no debería pasar.

### Entradas del log
- `term_start`: la agrega el líder al ganar ("Inicio de término, Servidor N asume como líder").
- `event`: `{id, nodo, nivel, pga, duracion_ms, t, recibido_por}`. El `id` es `nodo-N-<aleatorio de arranque>-<contador>`. El líder no agrega un `id` que ya está en su log, así el reenvío de un reporte nunca lo duplica.

### Flujo de un evento
1. Se suelta el botón del nodo X (o llega `POST /pulsar` desde el panel). El nivel es `min(10, 1 + ms/450)`; los toques de menos de 80 ms se ignoran.
2. Si X es líder, lo agrega a su log. Si no, lo envía con `forward` al líder conocido y lo guarda en una cola de pendientes. Lo reintenta cada 500 ms hasta recibir `forward_ack` o verlo en su propio log confirmado.
3. Sin líder (elección en curso o sin quórum), queda en la cola de pendientes y se ve así en el panel.
4. El líder replica. Cuando 2 de 3 nodos tienen la entrada, avanza `commitIndex` y todos la aplican.

### Máquina de estados y alertas
- Al aplicar un `event`, cada nodo lo agrega a su lista de eventos (máx. 100, los más viejos salen).
- **Regla de alerta** (determinística, se calcula al aplicar, así los 3 nodos llegan a lo mismo): si el evento aplicado y otro evento ya aplicado de **otro detector**, que todavía no forme parte de una alerta, están a ≤ 10 s según su campo `t`, se crea una alerta con esos eventos (más un tercero si también cae en la ventana). La alerta guarda: `id` (índice del log del evento que la completó), promedio de niveles, eventos, término y líder.
- **Desempates:** se toma, de cada otro detector, el evento sin alerta más cercano en tiempo al recién aplicado. La ventana de 10 s se mide desde el evento más antiguo del grupo, así que un tercero entra solo si cae dentro de esos mismos 10 s. Un segundo evento del mismo detector no reemplaza al primero: queda libre para una alerta futura.
- **Hora:** `t` es la hora NTP del nodo que recibió el botón. Si ese nodo aún no tiene hora (`t` = 0), el líder escribe su propia hora NTP en `t_lider` al agregarlo y se usa esa. Si ninguno de los dos tiene hora, el evento se guarda pero no cuenta para alertas, y el panel lo marca "sin hora". Los nodos piden la hora al arrancar y cada 10 minutos.
- Niveles de alerta, igual que los mockups: promedio redondeado 1–4 → baja, 5–7 → media, 8–10 → alta.

### Caída simulada
- `POST /control {"accion":"caer"}`: el nodo deja de enviar y responder mensajes Raft y descarta lo que le llega por UDP, como si estuviera apagado. El HTTP sigue respondiendo (para poder recuperarlo) y `/estado` reporta `"caido": true`.
- `{"accion":"recuperar"}`: vuelve como seguidor con su término guardado y se pone al día con el líder.
- Mientras está "caído", el nodo hace como si estuviera apagado: ignora su botón y responde `409` a `/pulsar`. El LED queda apagado.
- Desenchufar una placa de verdad también funciona: el PC lo ve porque `/estado` deja de responder.

### HTTP de cada nodo (puerto 80, librería `WebServer` incluida en el core ESP32)
- `GET /estado` → JSON **liviano (< 1 KB)**, se consulta seguido: `nodo`, `rol` (lider / seguidor / candidato), `caido`, `termino`, `votado_por`, `lider_conocido`, `log_len`, `commit_index`, `pendientes` (cuántos), `sucesos_seq` (contador de sucesos), `con_hora`, `ip`, `rssi` y `uptime_ms`.
- `GET /log?desde=N` → entradas desde el índice N, de a máximo 50, cada una con su estado (confirmada o no) y, si es evento, si forma parte de una alerta. Los eventos y las alertas se reconstruyen en el PC aplicando estas entradas con la misma regla. El nodo también expone `GET /alertas` para que el PC compruebe que coinciden.
- `GET /sucesos?desde=S` → sucesos Raft del nodo con número y hora (se postuló, votó por X, ganó, perdió el líder, cayó, se recuperó). Guarda los últimos 50.
- `POST /control` → caer / recuperar.
- `POST /pulsar {"ms": 2200}` → mismo efecto que mantener el botón ese tiempo.
- CORS abierto para que el panel pueda llamar si hiciera falta (el PC hace de intermediario igual).

### Servidor de la interfaz en el 4.º PC
- **Node.js 22 sin dependencias externas** (`http`, `fetch` y `fs` nativos). Escucha en `0.0.0.0:8080`, así lo pueden abrir este PC y cualquier celular conectado al WiFi.
- Le pide `/estado` a cada nodo cada 300 ms (timeout de 250 ms). Si un nodo no responde 3 veces seguidas, lo marca `inalcanzable`.
- Solo cuando cambian `log_len` o `sucesos_seq` pide de forma incremental `/log?desde=` (al líder, o al nodo con el `commit_index` más alto) y `/sucesos?desde=` (a cada nodo). Así ningún nodo arma respuestas grandes cada 300 ms y los latidos de Raft no se atrasan.
- Junta los tres estados y los envía al navegador por **Server-Sent Events** (`GET /api/stream`). También expone `GET /api/estado` (foto actual), `POST /api/nodos/:n/control` y `POST /api/nodos/:n/pulsar`, que reenvía al nodo.
- Sirve los archivos estáticos: `/` = panel de operación, `/publico` = vista pública.
- No guarda estado propio aparte del último `/estado` de cada nodo y un historial en memoria de sucesos para la línea de tiempo.

### Interfaz web
- Se parte de los mockups: misma estructura, estilos y pestañas. Se reemplaza la simulación interna por los datos del stream.
- La "verdad" de eventos, log y alertas sale del **líder actual**; si no hay líder, del nodo con `commit_index` más alto. Rol, término y log de cada servidor salen de su propio `/estado`.
- **Sin cifras inventadas:** se quitan del mockup los números que no salen de los nodos. Los KPI de la última hora se calculan con los eventos reales. Las "copias idénticas" se calculan comparando el `log_len` y el `commit_index` de cada nodo.
- **Sismógrafos:** las trazas se siguen dibujando de forma sintética a partir de los eventos reales (no hay sensor). Se dice en la propia pantalla con una nota corta.
- **Vista pública:** solo recibe alertas confirmadas. Como los detectores son pulsadores, todo se muestra con la franja "SIMULACRO". Se quitan los "Controles de demo" del mockup.
- **Coordenadas de los detectores para el mapa:** se mantienen las de ejemplo de los mockups (Pasto) en un archivo de configuración del servidor.

### OTA
- `ArduinoOTA` en el firmware, con contraseña en `config.h` y nombre de host `sismo-nodo-N`.
- `cargar.sh N` acepta `--wifi` para cargar a `192.168.80.20N` por red en vez de USB.

### Pruebas
- **Raft en el PC:** la lógica de Raft va en un módulo C++ (`raft.h` / `raft.cpp`) sin código de Arduino. Recibe el tiempo y los mensajes como entradas y devuelve los mensajes a enviar. Se compila con `g++` contra una red simulada (3 nodos en memoria, con pérdidas, retrasos y particiones) para probar:
  - elige un único líder;
  - reelige al caer el líder;
  - sin quórum no confirma;
  - no duplica eventos reenviados;
  - los 3 nodos convergen al mismo log y a las mismas alertas;
  - un nodo que vuelve se pone al día.
- **Servidor web:** pruebas con `node:test` contra nodos falsos (servidores HTTP que imitan `/estado`).
- **Prueba guiada en hardware:** checklist con los 3 prototipos (botón en cada nodo, alerta por coincidencia, tumbar líder, sin quórum, desenchufar y volver a enchufar).

## Lo que se deja al constructor

- Estructura de archivos dentro de `firmware/`, salvo que la lógica de Raft quede separada y compilable en el PC.
- Formato exacto de los mensajes UDP, respetando los nombres y el tope de tamaño de arriba.
- Cómo se adapta el JavaScript de los mockups al stream, conservando el diseño visual.
- Mensajes del monitor serie y patrones del LED: fijo = conectado y con líder, parpadeo lento = sin líder, parpadeo rápido = pulsando.

## Decisiones del diseñador (para revisar)

Las tomé yo tras la revisión, no las habló el equipo:

- `/estado` liviano más `/log` y `/sucesos` incrementales, para que los latidos no se atrasen.
- Tope de log de 1000 entradas: rechaza eventos nuevos, nunca sobrescribe.
- Desempate de alertas: el evento más cercano de cada otro detector, con la ventana medida desde el primero del grupo.
- Un nodo "caído" ignora su botón.
- Eventos sin hora no cuentan para alertas.
- Se borran los números del mockup que no vienen de los nodos.
- Puesta al día por lotes seguidos, sin esperar el latido.

## Riesgos conocidos

- Sin autenticación: cualquiera en el WiFi puede llamar `/pulsar` o `/control`.
- Si el router ya entrega `.201`–`.203` a otro equipo, habrá conflicto de IP. Hoy respondieron libres al ping, pero no está confirmado en el router.
- Los 3 prototipos tienen que volver a cargarse una vez por USB para tener OTA.
