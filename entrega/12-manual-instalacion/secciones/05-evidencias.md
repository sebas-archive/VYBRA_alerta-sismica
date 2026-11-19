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
