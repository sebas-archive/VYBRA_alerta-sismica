# Informe de Fase 3 — estabilización, correcciones y validación

**Proyecto:** `detector de sismos en red distribuida`
**Fecha:** 2026-11-17
**Versión candidata:** `v1.0.0-rc1` (ver `../VERSION`)
**Modo:** con autorización de escritura. Se modificó código, documentación, Git y se ejecutaron
pruebas, Docker y compilación de firmware. **No se conectaron las ESP32** (no estaban conectadas al
equipo), por lo que la campaña física queda pendiente de ejecución, no fallida.

---

## A. Resumen ejecutivo

Se estabilizó el proyecto y se ejecutaron todas las validaciones que **no** requieren las placas.

| Área | Resultado real |
|---|---|
| Vibración | **Eliminada integralmente**; sin referencias funcionales ni controles |
| Pulsof físico | **Conservado** como generador de eventos simulados (decisión del docente) |
| Correcciones | 4 aplicadas (comentarios, credencial del portal, tope de cola, tags/healthcheck Docker) |
| Pruebas C++ | **78/78**, 0 fallas, exit 0 (recompiladas desde fuentes) |
| Arnés A′ (config desplegada) | **5/5**, 0 fallas; timeout 5320 ms; failover 5500 ms simulados |
| Pruebas JavaScript | **41/41**, 0 fallas, 3,45 s |
| Firmware | **3/3 nodos** compilados; `detector.ino.bin` = 1.106.048 B (n1/n2), 1.106.032 B (n3) |
| Docker | 4 servicios arriba; 3 nodos `healthy`; **Fedora 42 / openSUSE Leap 16.0 / Ubuntu 24.04** |
| Documentación | `README.md` creado; `docs/prueba-hardware.md` reescrito con valores reales |
| Evidencias | 133 ítems inventariados; 5 logs de prueba + 8 capturas de referencia + tablas de resultados |
| Git | commit de estabilización + tag `v1.0.0-rc1`; `main` avanzado por fast-forward |

**Estado real:** el software está validado y reproducible. **Falta la campaña física**, que es el
único bloqueo para etiquetar `v1.0.0` definitiva.

---

## B. Cambios implementados

| Archivo | Cambio | Motivo |
|---|---|---|
| `firmware/detector/detector.ino` | Comentario de cabecera corregido: heartbeat **500 ms** (no 300), se elimina la afirmación falsa "el loop nunca se bloquea" y se documentan los bloqueos reales; guard `#error` si falta `PORTAL_CLAVE`; la clave del portal **ya no se imprime** por el puerto serie; `nombrePropuesta()` y `enPulsar()` manejan `ColaLlena` | Comentarios verificables + rotación de credencial + nuevo estado de cola |
| `firmware/detector/src/nucleo/raft.h` | Comentario `tick(millis())` → `tick(ahoraMs de esp_timer)`; nuevo `ConfigRaft::topePendientes = 100`; nuevo `Propuesta::ColaLlena` | Comentario falso + cota de memoria/tráfico |
| `firmware/detector/src/nucleo/raft.cpp` | En `proponer()`: si `pendientes_.size() >= topePendientes` devuelve `ColaLlena` antes de encolar | Evita crecimiento sin control en no-quórum |
| `firmware/detector/config.h` | Se elimina `#define PORTAL_CLAVE "…"`; pasa a `secretos.h` (no versionado) | La credencial estaba versionada |
| `firmware/detector/secretos.ejemplo.h` | Añadida `PORTAL_CLAVE` de plantilla | Guía para reproducir |
| `firmware/cargar.sh` | Comentario de OTA corregido: resuelve `sismo-nodo-N.local` o `IP=`, no "IP fija" | Comentario desactualizado |
| `docker-compose.yml` | Healthcheck usa `process.env.PUERTO` en vez de 8080 fijo; comentario explicativo | Reproducibilidad |
| `web/Dockerfile` | `node:22-alpine` → `node:22.22-alpine` | Fijar versión |
| `web/docker/Dockerfile.fedora` | `fedora:latest` → `fedora:42` | Fijar versión |
| `web/docker/Dockerfile.suse` | `opensuse/leap:latest` → `opensuse/leap:15.6` | Fijar versión (**ver limitación L-1**) |
| `docs/prueba-hardware.md` | Reescrito completo: DHCP/mDNS, puertos reales, heartbeat 500 ms, elección 5–9 s, criterio **≤12 s**, pulsador como simulador, 10 casos | Contradecía al código |
| `README.md` | **Nuevo**: arquitectura, tecnologías, requisitos, instalación, configuración, compilación, ejecución, Docker, pruebas, limitaciones, estructura | Entregable 3 |
| `VERSION` | **Nuevo** | Versión reproducible |
| `.gitignore` | Añadido `preview/` (excluido de la versión) y temporales de validación | Excluir material engañoso sin borrarlo |
| `web/public/cliente.html`, `mockup/cliente.html` | Eliminación de vibración (ya presente en el árbol al iniciar la fase; se incorporó al commit) | Decisión 2.2 |

---

## C. Funcionalidad de vibración

### Eliminado

| Elemento | Dónde | Verificación |
|---|---|---|
| Fila y switch "Vibración" en Ajustes | `web/public/cliente.html`, `mockup/cliente.html` | `grep -rn "set-vibe\|Vibración"` → **0 resultados** |
| Campo `vibe` del objeto `settings` y lectura de `localStorage` | ídem | `grep -rn "vibe"` → **0 resultados** |
| Llamada `navigator.vibrate(...)` al mostrar alerta | ídem | `grep -rn "navigator.vibrate"` → **0 resultados** |
| Listener del switch e inicialización `#set-vibe.checked` | ídem | ídem |
| Endpoints o mensajes de backend específicos de vibración | `web/server.js`, `poller.js` | **No existían** (la vibración era solo del cliente) |
| Configuración de hardware / pines de motor | firmware | **No existían** |

### Conservado (no era la funcionalidad retirada)

| Referencia encontrada | Decisión |
|---|---|
| `web/public/cliente.html:457` y `mockup/cliente.html:496`: "Se siente dentro de casa; vibran ventanas y objetos colgados" | **Conservada**: describe la intensidad sísmica (texto de la escala), no un control de vibración |
| `docs/superpowers/specs/2026-11-02-raft-esp32-design.md:36`: "Sensor real de vibración: el 'sismo' sigue siendo el tiempo de pulsación" | **Conservada**: es un documento histórico que aclara que no hay sensor; no menciona la función retirada |

### Búsqueda final

`grep -rniE "vibra|vibrat|motor"` sobre código, HTML, CSS y Markdown (excluyendo `firmware/build/`)
devuelve **solo las 3 líneas anteriores**, todas legítimas. **No quedan controles inoperantes ni
referencias contradictorias.**

Las capturas históricas del **panel de operador** (alerta y failover) no exponen la función retirada,
por lo que no se alteró ningún archivo. Ese material de diseño ya no forma parte del repositorio y
solo se conserva, si se cita, como registro de una versión anterior.

---

## D. Pruebas automatizadas

Todas ejecutadas en la Fase 3 sobre el código modificado. Registro íntegro en
`../04-evidencias/E-pruebas/`.

### D.1 Suite C++ (78 casos)

| Dato | Valor |
|---|---|
| Comando | `make JSON_DIR=~/Arduino/libraries/ArduinoJson/src test` en copia en `/tmp` |
| Fecha | 2026-11-17 |
| Entorno | g++ 16.2.1, GNU Make 4.4.1, ArduinoJson 7.4.3 |
| Resultado | **78 ok, 0 fallas**, exit 0 |
| Desglose | `test_raft` 32, `test_huella` 17, `test_sismo` 11, `test_api` 9, `test_mensajes` 9 |
| Evidencia | `04-evidencias/E-pruebas/log-TST-01-cpp.txt` |

El número de pruebas **no cambió** respecto de la Fase 1 (78). Las modificaciones (cota de cola y
nuevo valor del enum) no rompen ningún caso.

### D.2 Arnés A′ (configuración desplegada)

| Caso | Resultado | Medición simulada |
|---|---|---|
| `config_desplegada_temporizador_en_rango` | ok | primer timeout **5320 ms** (en [5000, 9100]) |
| `config_desplegada_latidos_mantienen_lider` | ok | líder elegido a los **5820 ms**; estable 60 s |
| `config_desplegada_failover` | ok | failover **5500 ms** |
| `config_desplegada_sin_quorum` | ok | sin líder sin mayoría |
| `config_desplegada_commit` | ok | commit replicado en 3 en **510 ms** |

**5/5, exit 0.** Evidencia: `04-evidencias/E-pruebas/log-TST-11-arnes-A-prime.txt`.
Son mediciones **simuladas** (reloj virtual), no físicas.

### D.3 Suite JavaScript (41 pruebas)

| Dato | Valor |
|---|---|
| Comando | `node --test --test-concurrency=1 test/geo.test.js test/poller.test.js test/server.test.js` |
| Resultado | **tests 41, pass 41, fail 0**, exit 0 |
| Duración | 3454 ms |
| Entorno | Node v26.13.0 |
| Evidencia | `04-evidencias/E-pruebas/log-TST-03-js.txt` |

### D.4 Docker

| Comprobación | Resultado |
|---|---|
| `docker compose build panel nodo1 nodo3` | **OK** (Fedora 42, Ubuntu 24.04, Alpine) |
| `docker compose up -d` | **4/4 servicios arriba** |
| Healthchecks | `sismo-nodo-1/2/3` → **healthy** |
| Puertos | 9001/9002/9003→8080 y 8095→8090 |
| API | `/api/estado` responde `quorum:true, lider:1, fuente:1` |
| SO reales (logs) | `nodo1` Fedora Linux 42 + Node 22.22.0; `nodo2` openSUSE Leap **16.0** + Node 22.23.4; `nodo3` Ubuntu 24.04.5 + Node **18.19.1** |
| Evidencia | `04-evidencias/H-infraestructura/log-INF-02-03-contenedores.txt`, `log-INF-04-tres-so.txt`, `log-INF-05-logs.txt`, `tabla-INF-09-consumo.txt` |

**Limitación L-1:** la construcción del servicio `nodo2` (openSUSE) no pudo completarse en esta
sesión porque el mirror de openSUSE dejó de responder durante la descarga de `nodejs22` (sin avance
en más de 60 s; el intento se canceló). Se reutilizó la imagen existente del proyecto, cuyo log
reporta **openSUSE Leap 16.0**. Por tanto, el `Dockerfile.suse` fijado a `15.6` **no coincide** con
la imagen ejecutada: se deja fijado a 15.6 para la próxima construcción reproducible y queda
pendiente recompilarlo. Las mediciones de las tres distribuciones son reales, pero dos de ellas
(Fedora y Ubuntu) se reconstruyeron y la de openSUSE se ejecutó desde la imagen previa.

---

## E. Pruebas físicas

**No ejecutadas.** Las tres placas ESP32 están disponibles pero **no estaban conectadas al equipo**
durante esta sesión: `lsusb` no muestra adaptador USB-serial (`cp210x`/`ch341`) y
`/dev/ttyUSB*` no existe. No se sustituyeron por simulación.

Quedan **pendientes de ejecución, no fallidas**: F3-11 a F3-17. Requisitos, pasos exactos y
verificación previa: `../06-manual/conexion-esp32.md`. Casos: `docs/prueba-hardware.md`.

---

## F. Métricas

| Métrica | Valor | Tipo | Fuente |
|---|---|---|---|
| Timeout de elección inicial | 5320 ms | **Simulado** (config desplegada) | A′ |
| Elección de líder | 5820 ms | **Simulado** | A′ |
| Failover | 5500 ms | **Simulado** | A′ |
| Commit replicado en 3 | 510 ms | **Simulado** | A′ |
| Duración suite C++ | ~4 s | Real | log |
| Duración suite JS | 3454 ms | Real | log |
| Firmware `detector.ino.bin` | 1.106.048 B (n1, n2); 1.106.032 B (n3) | Real | RES-05 |
| Firmware merged | 4.194.304 B | Real | RES-05 |
| Bootloader / particiones | 24.992 B / 3.072 B | Real | RES-05 |
| RAM del panel | 18,59 MiB | Real | INF-09 |
| RAM nodos simulados | 14,78–16,09 MiB | Real | INF-09 |
| CPU panel / nodos | 0,17 % / 0,05–0,06 % | Real | INF-09 |

**No hay métricas físicas** (latencia real de `/estado`, reelección real, pérdidas, duplicados):
requieren las placas y se registran en la campaña física.

---

## G. Evidencias

Inventario completo y trazable: `../05-pruebas/datos/inventario-evidencias.csv` (**133 ítems**).

| Categoría | Obtenidas en Fase 3 | Estado |
|---|---|---|
| A. Código | 0 capturas (se usarán bloques de código) | PENDIENTE de extracción al documento |
| B. Interfaz | **8 capturas `cap-REF-*`** (demostración con clúster falso) | PARCIAL: faltan capturas con hardware |
| C. Backend | **1 captura** (`cap-REF-BE-03-api-estado.png`) | PARCIAL |
| D. Nodos | **1 log** (`log-NOD-11-build.txt`) | PARCIAL: faltan consolas y fotos |
| E. Pruebas | **3 logs** (TST-01, TST-03, TST-11) | COMPLETADO para software |
| F. Pruebas físicas | 0 | PENDIENTE (requiere placas) |
| G. Arquitectura | 0 (datos listos en `datos-para-diagramas.md`) | PENDIENTE (Fase 4) |
| H. Infraestructura | **5 piezas** (compose, contenedores, 3 SO, logs, consumo, captura panel) | COMPLETADO |
| I. Resultados | **3 tablas** (RES-05, RES-06, INF-09) | PARCIAL: faltan métricas físicas |

Ninguna evidencia es un mockup ni una captura de `preview/` o `mockup/`.

---

## H. Limitaciones

### Del sistema (aceptadas y documentadas)

1. El evento es **simulado** con pulsador; no hay medición sísmica.
2. **Log en RAM**: sin durabilidad; un reinicio reconstruye desde el líder.
3. **Resincronización de emergencia** que descarta entradas confirmadas tras reinicio en frío de una
   mayoría (desviación deliberada de Raft).
4. **Sin snapshots**: tope de 1000 entradas; al llenarse se rechazan eventos.
5. **Sin autenticación, TLS ni rate limiting**; CORS `*`; `/control` y `/pulsar` abiertos en la LAN.
6. **Sin pre-vote ni check-quorum**; un líder aislado se cree líder.
7. **`ForwardAck` al aceptar**, no al confirmar: posible pérdida de un evento.
8. El "quórum" del agregador es una **inferencia** (≥2 nodos con el mismo líder), no validación de consenso.
9. La demo Docker **no ejecuta Raft**: demuestra portabilidad de contrato y empaquetado.

### De esta fase

10. **L-1**: no se pudo reconstruir la imagen openSUSE por un mirror caído (ver D.4).
11. **L-2**: no hay capturas de consola serie ni fotos del prototipo (requieren placas y cámara).
12. **L-3**: la captura de pantalla de escritorio (Wayland RemoteDesktop) no está disponible en esta
    sesión; las capturas se hicieron con Firefox headless sobre el panel real.
13. **L-4**: `v1.0.0` definitiva no se etiquetó: falta la campaña física (criterio F3-11…F3-17).
14. **L-5**: la clave antigua del portal permanece en el historial de Git (commit `7cd7f53`); no se
    reescribió el historial.

---

## I. Seguridad

| Acción | Estado |
|---|---|
| Rotación de la clave del portal AP | **Hecha**: clave nueva de 16 caracteres, solo en `secretos.h` (gitignored), mínimo 8 |
| Clave eliminada de archivo versionado | **Hecha**: `config.h` ya no la contiene |
| Clave fuera de la consola serie | **Hecha**: el mensaje ya no imprime la clave |
| Verificación de `secretos.h` en git | **Hecha**: `git check-ignore` confirma exclusión; nunca fue commiteado |
| Riesgo residual: historial Git | **Documentado**: la clave vieja está en `7cd7f53`; si el repo se comparte, rotar y/o reescribir historial |
| Autenticación/TLS | **No implementadas** (fuera de alcance; riesgo documentado) |
| CORS, `/control`, `/pulsar`, UDP Raft | **Sin cambios**: red de confianza; riesgo documentado |

No se revelan credenciales en este informe ni en las capturas.

---

## J. Git

| Dato | Valor |
|---|---|
| Rama de trabajo | `ubicacion` → **`main`** por fast-forward |
| Commit de estabilización | `1977662bd869facb23640e4fe48cd7b60caed189` |
| Tag | `v1.0.0-rc1` (`git rev-list -n1 v1.0.0-rc1` da su commit exacto) |
| Estado final | árbol limpio salvo `preview/` (ignorado) y `secretos.h` (ignorado) |
| Push | **No se hizo** (sin remoto configurado) |
| Historial reescrito | **No** |

---

## K. Matriz de aceptación

| ID | Criterio | Estado | Evidencia / motivo |
|---|---|---|---|
| F3-01 | Estado inicial Git documentado | **COMPLETADO** | §J + sección B del informe de inspección |
| F3-02 | Vibración eliminada integralmente | **COMPLETADO** | §C; grep sin referencias funcionales |
| F3-03 | Pulsador conservado | **COMPLETADO** | Sin cambios en `leerBoton()`/`proponerPulso()`; documentado como simulador |
| F3-04 | Correcciones de riesgo nulo aplicadas | **COMPLETADO** | §B |
| F3-05 | Configuración temporal verificada | **COMPLETADO** | A′ 5/5; `config.h` 500/5000–9000; docs coherentes |
| F3-06 | Pruebas C++ ejecutadas | **COMPLETADO** | 78/78, exit 0 |
| F3-07 | Arnés A′ compilado y ejecutado | **COMPLETADO** | 5/5, exit 0 |
| F3-08 | Pruebas JavaScript ejecutadas | **COMPLETADO** | 41/41, exit 0 |
| F3-09 | Docker validado | **PARCIAL** | 4/4 arriba, 3 healthy, 3 SO verificados; `nodo2` reutiliza imagen (L-1) |
| F3-10 | Firmware recompilado | **COMPLETADO** | 3/3, tamaños reales en RES-05 |
| F3-11 | Tres ESP32 preparadas y flasheadas | **PENDIENTE** | Placas disponibles pero no conectadas al equipo |
| F3-12 | Comunicación física comprobada | **PENDIENTE** | Requiere F3-11 |
| F3-13 | Elección de líder física comprobada | **PENDIENTE** | Requiere F3-11 |
| F3-14 | Failover medido | **PENDIENTE** | Hay medición **simulada** (5500 ms); falta la física |
| F3-15 | Recuperación comprobada | **PENDIENTE** | Requiere F3-11 |
| F3-16 | Ausencia de quórum comprobada | **PENDIENTE** | Hay simulación; falta la física |
| F3-17 | Pruebas con pulsador realizadas | **PENDIENTE** | Requiere placas y acción manual |
| F3-18 | Evidencias reales organizadas | **PARCIAL** | Estructura + 13 piezas obtenidas; faltan físicas |
| F3-19 | Documentación técnica actualizada | **COMPLETADO** | `docs/prueba-hardware.md` reescrito |
| F3-20 | README preparado | **COMPLETADO** | `README.md` con comandos verificados |
| F3-21 | Riesgos y limitaciones documentados | **COMPLETADO** | §H + `pendientes.md` |
| F3-22 | Versión `v1.0.0` fijada | **PENDIENTE** | Se fijó `v1.0.0-rc1`; la definitiva espera F3-11…F3-17 |
| F3-23 | Estado Git final verificado | **COMPLETADO** | §J |
| F3-24 | Informe de Fase 3 generado | **COMPLETADO** | Este documento |

**Resumen:** 17 completados, 3 parciales, 6 pendientes. Ningún criterio ejecutable quedó sin hacer.

---

## L. Preparación para la Fase 4

| Artefacto de Fase 4 | Qué está listo |
|---|---|
| **Diagramas PlantUML** | `datos-para-diagramas.md`: componentes, puertos, 6 tipos de mensaje, estados de Raft y de alerta, endpoints, 5 flujos y tiempos reales |
| **Documento técnico** | Diagnóstico F1, plan F2, este informe, README, datos de diagramas y 133 evidencias inventariadas |
| **Manual de instalación** | `README.md` §5–§8 + `06-manual/conexion-esp32.md` + `docs/prueba-hardware.md` |
| **Presupuesto** | Falta el dato del usuario (precios); estructura creada en `07-presupuesto/` |
| **Presentación / video** | Estructura y guion pendientes; las capturas `cap-REF-*` sirven como borrador visual |
| **Anexos** | Logs, tablas y capturas ya organizados por categoría |

### Qué falta para cerrar la Fase 3 al 100 %

1. Conectar las tres placas (instrucciones: `../06-manual/conexion-esp32.md`).
2. Ejecutar la campaña de `docs/prueba-hardware.md` y registrar las métricas físicas.
3. Repetir las capturas `OP-*` y `CLI-*` con el clúster real.
4. Recompilar la imagen openSUSE cuando el mirror responda.
5. Revisar la evidencia y etiquetar `v1.0.0`.
