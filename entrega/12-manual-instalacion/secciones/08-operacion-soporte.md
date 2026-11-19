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
