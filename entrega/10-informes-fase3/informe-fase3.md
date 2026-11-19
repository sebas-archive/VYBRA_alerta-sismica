# Informe de Fase 3 — estabilización, correcciones y validación (histórico del 2026-11-17)

| Dato | Valor |
|---|---|
| Proyecto | `detector de sismos en red distribuida` (Alerta Sísmica / VYBRA) |
| Fase | 3 — estabilización del software y validaciones sin hardware |
| Fecha de ejecución | **2026-11-17** (los resultados de esta fase son de esa fecha) |
| Versión candidata | `v1.0.0-rc1` (`README.md:12`, `VERSION:3`) |
| Modo de la fase | Con autorización de escritura: se modificó código, documentación, Git y se ejecutaron pruebas, Docker y compilación de firmware. **No se conectaron las ESP32** |
| Fecha de esta regeneración | **2026-11-18** (commit `0ee5ed4`), con verificación del estado vigente |

**Nota de reconstrucción.** Este informe se regeneró el 2026-11-18. Se eliminaron las referencias
al material de diseño y a los planes internos que se retiraron del repositorio ese mismo día, y se
separó explícitamente **lo ejecutado el 2026-11-17** (histórico) de **lo verificado después**
(vigente). Las cifras de la fase que quedaron obsoletas al crecer el sistema no se presentan como
actuales: el estado de hoy está en [`informe-fase4.md`](informe-fase4.md). Las afirmaciones se apoyan
en archivos presentes en el repositorio, en el historial Git y en las evidencias de
`entrega/04-evidencias/` y `entrega/05-pruebas/`. La ficha canónica de cifras usada para el estado
vigente es `/tmp/entrega-facts.md` (v2 FINAL del 2026-11-18 11:23).

**Rutas:** las citas de archivo y línea son relativas a la raíz del repositorio salvo que se indique otra cosa; los enlaces entre informes son relativos a esta carpeta.


---

## A. Resumen ejecutivo

| Área | Resultado real de la fase (2026-11-17) | Estado vigente (2026-11-18) |
|---|---|---|
| Vibración | **Eliminada** de la página pública vigente entonces; sin llamada a `navigator.vibrate` ni switch | Sin controles de vibración; quedan textos de escala y una línea de migración (§C) |
| Pulsador | **Conservado** como generador de eventos simulados (decisión del docente) | Igual: `README.md:7-10` |
| Correcciones | 4 aplicadas: comentarios, credencial del portal, tope de cola, etiquetas y healthcheck de Docker | Las tres primeras siguen presentes; el healthcheck de Docker cambió con la demo nueva (§B) |
| Pruebas C++ | **78/78**, 0 fallas, exit 0 | **78/78** re-ejecutadas el 2026-11-18 (`/tmp/entrega-facts.md` §4) |
| Arnés A′ (configuración desplegada) | **5/5**, 0 fallas; mediciones simuladas | **Histórico**: el arnés ya no existe en el repositorio; el log se conserva (§D.2) |
| Suite JavaScript | Ejecutada sobre el repertorio de entonces, exit 0 | **75 casos** hoy: 60 pasan y 15 se omiten sin Docker/PostgreSQL (§D.3) |
| Firmware | **3/3 nodos** compilados; `detector.ino.bin` 1 106 048 B (n1/n2) y 1 106 032 B (n3) | **3/3** recompilados hoy: 1 105 728 B (n1/n2) y 1 105 712 B (n3) (§F) |
| Docker | La demo de entonces usaba nodos de demostración sin Raft; los contenedores y sistemas operativos se verificaron | **11 servicios** con Raft real, PostgreSQL y controlador (`informe-fase4.md` §11) |
| Documentación | `README.md` creado; `docs/prueba-hardware.md` reescrito | `README.md` y `docs/servidores-de-datos.md` actualizados |
| Evidencias | Organizadas por categorías y con capturas de referencia del panel | Inventario regenerado el 2026-11-18 por el verificador (§G) |
| Git | Commit de estabilización y tag `v1.0.0-rc1`; `main` avanzado por fast-forward | El historial se normalizó y luego creció; hoy `HEAD` = `0ee5ed4`, **49 commits por delante del tag** (§J) |
| Campaña física | No ejecutada en la fase: las placas no estaban conectadas | P0 completada; **T1 no aprobada**; T2 en adelante pendientes (§E) |

**Estado de la fase:** el software quedó validado y reproducible. La campaña física —el único
bloqueo para etiquetar `v1.0.0` definitiva— se ejecutó parcialmente después, la misma jornada.

---

## B. Cambios implementados en la Fase 3

El commit de estabilización de esa fase es `2306a9d` («estabiliza v1.0.0-rc1: vibración eliminada,
correcciones y validación», 2026-11-17 16:26:48 -05:00), presente en el historial actual. Los cambios
y su verificación vigente:

| Archivo | Cambio | Motivo | Verificación en el árbol actual (2026-11-18) |
|---|---|---|---|
| `firmware/detector/detector.ino` | Comentario de cabecera corregido: latido **500 ms** (no 300); se elimina la afirmación «el loop nunca se bloquea» y se documentan los bloqueos reales; guard `#error` si falta `PORTAL_CLAVE`; la clave del portal ya no se imprime por el puerto serie; `nombrePropuesta()` y `enPulsar()` manejan `ColaLlena` | Comentarios verificables y rotación de credencial | `firmware/detector/detector.ino:42-45` (guards), `firmware/detector/detector.ino:496-505` (`nombrePropuesta`), `firmware/detector/detector.ino:618-638` (`enPulsar`); `firmware/detector/config.h:16` fija el latido en 500 ms |
| `firmware/detector/src/nucleo/raft.h` | Comentario `tick(millis())` → `tick(ahoraMs de esp_timer)`; nuevo `ConfigRaft::topePendientes = 100`; nuevo valor `Propuesta::ColaLlena` | Comentario falso y cota de memoria/tráfico | `firmware/detector/src/nucleo/raft.h:40`, `firmware/detector/src/nucleo/raft.h:50` |
| `firmware/detector/src/nucleo/raft.cpp` | En `proponer()`, si la cola de pendientes alcanza el tope devuelve `ColaLlena` antes de encolar | Evita crecimiento sin control en no-quórum | Implementado; la prueba `test_raft` incluye el caso (78/78, §D.1) |
| `firmware/detector/config.h` | Se retira `PORTAL_CLAVE` del archivo versionado; pasa a `firmware/detector/secretos.h` (no versionado) | La credencial estaba versionada | `firmware/detector/config.h:28` remite a `firmware/detector/secretos.h`; `firmware/detector/secretos.ejemplo.h:5` deja la plantilla |
| `firmware/detector/secretos.ejemplo.h` | Añadida `PORTAL_CLAVE` de plantilla | Guía para reproducir | Línea 5 |
| `firmware/cargar.sh` | Comentario de OTA corregido: resuelve `sismo-nodo-N.local` o `IP=`, no «IP fija» | Comentario desactualizado | `firmware/cargar.sh:79` compila con `-DNODO=$NODO`; el comentario de uso se conserva |
| `docker-compose.yml` | Entonces: el healthcheck leía `process.env.PUERTO` en vez del 8080 fijo; comentario explicativo | Reproducibilidad | **Cambiado después**: hoy el healthcheck de los nodos es `nodo-sim --salud` (`docker-compose.yml:20`); la corrección histórica se comprueba en `git show 2306a9d:docker-compose.yml` |
| `web/Dockerfile` | `node:22-alpine` → `node:22.22-alpine` | Fijar versión | Vigente en `web/Dockerfile` |
| `web/docker/Dockerfile.fedora` | `fedora:latest` → `fedora:42` | Fijar versión | Vigente |
| `web/docker/Dockerfile.suse` | `opensuse/leap:latest` → `opensuse/leap:15.6` | Fijar versión (limitación L-1) | Vigente; el contenedor actual corre openSUSE Leap 15.6 (`/tmp/entrega-facts.md` §5) |
| `docs/prueba-hardware.md` | Reescrito: DHCP/mDNS, puertos reales, latido 500 ms, elección 5–9 s, criterio ≤ 12 s, pulsador como simulador, 10 casos | Contradecía al código | Presente y coherente con `firmware/detector/config.h:16-18` |
| `README.md` | **Nuevo** | Entregable 3 | Presente y actualizado; es la referencia viva hoy |
| `VERSION` | **Nuevo** | Versión reproducible | Presente; conserva cifras de la fase que hoy están desactualizadas (`VERSION` vs `README.md:394`; §J) |
| `.gitignore` | Se añadieron exclusiones de material de trabajo y temporales de validación | Evitar publicar artefactos | Hoy incluye además `*.raw`, `*.pid`, `.env`, `.env.*`, `secretos/` (`.gitignore:23-39`) |

**Cambio posterior relevante:** el 2026-11-18 se retiró del repositorio el material de diseño
histórico y los planes internos (commit `0ee5ed4`). Para entonces la interfaz ya no era la de la
Fase 3: la página pública se sirve como SPA en `/cliente/` y el panel en `/admin/`
(`web/server.js:400-402`); `web/public/cliente.html` y `web/public/operador.html` quedan solo como
respaldo estático. Este informe no cita el material retirado.

---

## C. Funcionalidad de vibración

### C.1 Eliminación (2026-11-17)

| Elemento | Dónde se eliminó | Verificación en la fase |
|---|---|---|
| Fila y switch «Vibración» en Ajustes | `web/public/cliente.html` (página pública vigente entonces) y el material de diseño de la época | El control ya no existe |
| Campo `vibe` del objeto `settings` y su lectura de `localStorage` | Ídem | El control ya no existe |
| Llamada `navigator.vibrate(...)` al mostrar alerta | Ídem | Sin ocurrencias en el árbol |
| Listener del switch e inicialización `#set-vibe.checked` | Ídem | Sin ocurrencias |
| Endpoints o mensajes de backend específicos | `web/server.js`, `web/poller.js` | No existían: la vibración era solo del cliente |
| Configuración de hardware / pines de motor | firmware | No existían |

### C.2 Verificación vigente (2026-11-18)

Búsqueda en el árbol actual: `grep -rniE "vibra|vibrat|motor"` sobre `*.ino`, `*.h`, `*.cpp`,
`*.js`, `*.html`, `*.css`, `*.md` y `*.json`, excluyendo `node_modules/`, `firmware/build/` y este
mismo directorio de informes. Resultado: **6 coincidencias, ninguna es un control de vibración**.

| Archivo:línea | Texto o uso | Interpretación |
|---|---|---|
| `web/public/cliente.html:457` | «Se siente dentro de casa; vibran ventanas y objetos colgados» | Descripción de la escala de intensidad |
| `web/public/cliente/js/i18n.js:217` | «…El silencio o la vibración del teléfono se cambian fuera del navegador» | Texto de ayuda: no hay control |
| `web/public/cliente/js/cliente-app.js:73` | `delete saved.vibrateEnabled;` | **Migración**: descarta la preferencia antigua si existe en `localStorage` |
| `web/public/cliente/js/cliente-app.js:106` | «La vajilla y las puertas vibran un poco» | Texto de efectos por intensidad |
| `web/public/cliente/js/cliente-app.js:119` | «Vibración leve de prueba» | Nombre de un sismo de demostración |
| `web/public/cliente/js/cliente-app.js:186` | «…La vajilla y las puertas vibran un poco» | Texto de efectos por intensidad |

No hay `navigator.vibrate` ni interruptor asociado en `web/`. La afirmación «vibración eliminada
integralmente» se mantiene en cuanto a **funcionalidad**; la única referencia técnica que queda es la
limpieza de una preferencia antigua.

---

## D. Pruebas automatizadas

### D.1 Suite C++ (78 casos)

| Dato | Valor |
|---|---|
| Comando | copia de `firmware/test` y `firmware/detector/src` a `/tmp/`; `make JSON_DIR=$HOME/Arduino/libraries/ArduinoJson/src test` |
| Fecha de la fase | 2026-11-17 |
| Resultado de la fase | **78 ok, 0 fallas**, exit 0 |
| Re-ejecución | **2026-11-18: 78 ok, 0 fallas**, exit 0 (5 binarios) |
| Desglose | `test_raft` 32, `test_huella` 17, `test_sismo` 11, `test_api` 9, `test_mensajes` 9 |
| Entorno | Linux 7.3.3-1-cachyos x86_64; g++ 16.2.1; GNU Make 4.4.1; ArduinoJson 7.4.3 |
| Evidencia | Histórica: versión del 2026-11-17 en el historial Git (`git show 2306a9d:entrega/04-evidencias/E-pruebas/log-TST-01-cpp.txt`). Re-ejecución: `entrega/04-evidencias/E-pruebas/log-TST-01-cpp.txt` y `entrega/05-pruebas/logs/TST-01-cpp.log`, ambos del 2026-11-18 |

El número de casos no cambió con las modificaciones de la fase (cota de cola y nuevo valor del
enum), como confirma la re-ejecución.

### D.2 Arnés A′ de configuración desplegada (histórico)

| Caso | Resultado (2026-11-17) | Medición simulada |
|---|---|---|
| `config_desplegada_temporizador_en_rango` | ok | primer timeout **5320 ms** (en [5000, 9100]) |
| `config_desplegada_latidos_mantienen_lider` | ok | líder elegido a los **5820 ms**; estable 60 s |
| `config_desplegada_failover` | ok | failover **5500 ms** |
| `config_desplegada_sin_quorum` | ok | sin líder sin mayoría |
| `config_desplegada_commit` | ok | commit replicado en 3 en **510 ms** |

**5/5, exit 0.** Evidencia: `entrega/04-evidencias/E-pruebas/log-TST-11-arnes-A-prime.txt`. Son
mediciones **simuladas** (reloj virtual), no físicas.

**No re-ejecutado hoy:** el arnés A′ ya no forma parte del repositorio. El log es evidencia real del
2026-11-17 y se conserva tal cual, rotulado como histórico no reproducible
(`/tmp/entrega-facts.md` §4). No se ha fabricado un resultado nuevo para reemplazarlo.

### D.3 Suite JavaScript

| Dato | Fase 3 (2026-11-17) | Estado vigente (2026-11-18) |
|---|---|---|
| Comando | `node --test --test-concurrency=1 test/geo.test.js test/poller.test.js test/server.test.js` | `cd web && npm test` |
| Repertorio | El existente en esa fecha | **75 casos** (16 598 ms, exit 0) |
| Resultado | exit 0, 0 fallas | **60 pasan, 15 se omiten, 0 fallan** (se omiten 5 de infraestructura Docker y 10 de PostgreSQL) |
| Evidencia | Versión del 2026-11-17 en el historial Git (`git show 2306a9d:entrega/04-evidencias/E-pruebas/log-TST-03-js.txt`); el archivo del árbol fue reemplazado por la re-ejecución del 2026-11-18 | `entrega/04-evidencias/E-pruebas/log-TST-03-js.txt`, `entrega/05-pruebas/logs/TST-03-js.log` y `/tmp/entrega-facts.md` §4, todos del 2026-11-18 |

La cifra de casos de la fase **no describe** el sistema actual y no se usa aquí como cifra vigente.
Hoy hay además dos ejecuciones con dependencias reales:

| Validación | Comando | Resultado (2026-11-18) | Evidencia |
|---|---|---|---|
| JavaScript con 3 PostgreSQL reales | `cd web && npm run test:db` (`REQUIRE_DB=1`, bases efímeras) | **70 pasan, 5 se omiten (solo infraestructura), 0 fallan**, 13 779 ms | `entrega/05-pruebas/logs/TST-04-test-db.log` |
| Integración Docker aislada | `cd web && npm run test:infra` (proyecto `vybraint`) | **5/5, 0 fallan**, 79,2 s | `entrega/05-pruebas/logs/TST-05-test-infra.log` |

### D.4 Docker de la fase

En la Fase 3 la demo se construyó con los servicios que existían entonces: nodos simulados de
demostración (sin Raft), panel, y las comprobaciones de arranque, healthchecks, puertos y API. Se
verificaron tres sistemas operativos en contenedores. La **limitación L-1** de la fase (no se pudo
reconstruir la imagen de openSUSE por un mirror caído) quedó registrada y se resolvió después: hoy
`sismo-servidor-2` corre openSUSE Leap 15.6 y está `healthy` (`/tmp/entrega-facts.md` §5).

Esa demo fue **sustituida** el 2026-11-18 por el nodo simulado con el núcleo Raft real, los tres
servidores de datos con PostgreSQL y el controlador de infraestructura; la composición y el estado
vigentes se describen en [`informe-fase4.md`](informe-fase4.md) §§3-11. En la Fase 3, por tanto,
**la demo Docker aún no ejecutaba Raft**: era una limitación real de entonces, no del sistema
actual.

---

## E. Pruebas físicas

**No ejecutadas durante la Fase 3.** Las tres placas estaban disponibles pero no conectadas al
equipo durante esa sesión; no se sustituyeron por simulación. Quedaron pendientes de ejecución, no
fallidas, los criterios F3-11 a F3-17.

La campaña se inició después, la misma jornada del 2026-11-17:

| Bloque | Fecha y hora | Resultado | Evidencia |
|---|---|---|---|
| P0 — preparación de campaña | 2026-11-17 17:25 -05:00 | **Completada**: 12/12 snapshots, 10/10 validaciones de `/api/estado`, 3/3 nodos validados, 2/2 capturas verificadas | `entrega/05-pruebas/logs/FIS-00-p0.txt`; `entrega/04-evidencias/F-fisicas/cap-FIS-00-*` |
| T1 — evento con pulsador | 2026-11-17 17:31 | **No aprobada**: una pulsación produjo dos eventos cortos; replicación y commit correctos; sin alerta (correcto con un solo detector) | `entrega/05-pruebas/logs/FIS-01-verificacion.txt`; `entrega/05-pruebas/datos/FIS-01-post-nodo*-log.json`; diagnóstico en [`diagnostico-pulsador.md`](diagnostico-pulsador.md) |
| T2 en adelante | — | **Pendientes de autorización** | `README.md:398` |

---

## F. Métricas de la fase

| Métrica | Valor | Tipo | Fuente |
|---|---|---|---|
| Timeout de elección inicial | 5320 ms | **Simulado** (configuración desplegada) | `entrega/04-evidencias/E-pruebas/log-TST-11-arnes-A-prime.txt` |
| Elección de líder | 5820 ms | **Simulado** | Ídem |
| Failover | 5500 ms | **Simulado** | Ídem |
| Commit replicado en 3 | 510 ms | **Simulado** | Ídem |
| Duración suite JS de la fase | 3454 ms | Real | Versión histórica de `entrega/04-evidencias/E-pruebas/log-TST-03-js.txt` en el historial Git (`git show 2306a9d:entrega/04-evidencias/E-pruebas/log-TST-03-js.txt`) |
| Firmware `detector.ino.bin` (2026-11-17) | 1 106 048 B (n1, n2); 1 106 032 B (n3) | Real | Versión histórica de `entrega/04-evidencias/I-resultados/tabla-RES-05-firmware.txt` en el historial Git (`git show 2306a9d:entrega/04-evidencias/I-resultados/tabla-RES-05-firmware.txt`) |
| Firmware `detector.ino.bin` (recompilado el 2026-11-18) | 1 105 728 B (n1, n2); 1 105 712 B (n3) | Real | `/tmp/entrega-facts.md` §4 |
| Firmware merged / bootloader / particiones | 4 194 304 B / 24 992 B / 3 072 B | Real | `entrega/04-evidencias/I-resultados/tabla-RES-05-firmware.txt` (2026-11-18) y `entrega/05-pruebas/logs/NOD-11-compilacion.log`; mismos valores que el 2026-11-17 |
| Nodo simulado (2026-11-18) | binario de 275 392 B | Real | `/tmp/entrega-facts.md` §4 |

La diferencia de tamaño del firmware entre el 2026-11-17 y el 2026-11-18 corresponde a cambios de
código posteriores (por ejemplo, la retirada de la fila de ubicación en la página del nodo, commits
`29f38db` y `61d5df3`); no se atribuye a otra causa.

**No hay métricas físicas de esta fase** (latencia real de `/estado`, reelección real, pérdidas,
duplicados): requieren las placas y corresponden a la campaña física, aún abierta.

---

## G. Evidencias

Inventario completo y trazable: `entrega/05-pruebas/datos/inventario-evidencias.csv`, regenerado por
el verificador el 2026-11-18 para describir los archivos reales (el inventario de la Fase 3 ya no es
el vigente y no se cita como cifra actual).

| Categoría | Contenido de la Fase 3 (2026-11-17) | Estado vigente |
|---|---|---|
| A. Código | 0 capturas; se usan bloques de código | Regenerado el 2026-11-18 con bloques del código actual |
| B. Interfaz | Capturas de referencia `cap-REF-*` de la interfaz de entonces | Reemplazadas por capturas del ADMIN/CLIENTE actuales el 2026-11-18 |
| C. Backend | Captura del `/api/estado` de entonces | Regenerada el 2026-11-18 |
| D. Nodos | 1 log de compilación | Ampliado después con la campaña física (flasheo, arranque, red, estado, sucesos) |
| E. Pruebas | Logs TST-01, TST-03 y TST-11 | TST-01 y TST-03 re-ejecutados; TST-11 se conserva histórico |
| F. Pruebas físicas | 0 (placas no conectadas) | P0 y T1 reales del 2026-11-17 en `F-fisicas/` y `05-pruebas/logs/FIS-*` |
| G. Arquitectura | Datos preparados en `datos-para-diagramas.md` | Diagramas de la Fase 4 (los produce el diagramador) |
| H. Infraestructura | Compose, contenedores, sistemas operativos, consumo | Regenerada el 2026-11-18 sobre el stack de 11 servicios |
| I. Resultados | Tablas RES-05 y RES-06 de la fase (versión histórica en el historial Git, commit `2306a9d`) | RES-05 y RES-06 regeneradas con las cifras del 2026-11-18 |

La evidencia física real del 2026-11-17 (`04-evidencias/D-nodos/`, `04-evidencias/F-fisicas/`,
`05-pruebas/datos/FIS-*` y `05-pruebas/logs/FIS-*`) se conserva intacta y rotulada; no se puede
regenerar sin hardware.

---

## H. Limitaciones

### H.1 Del sistema (vigentes; `README.md:411-426`, `/tmp/entrega-facts.md` §8)

1. El evento es **simulado** con un pulsador; no hay medición sísmica.
2. El log de Raft **no es durable** (RAM): un corte puede perder entradas aceptadas y no confirmadas.
3. **Resincronización de emergencia:** un nodo puede descartar su log y copiarlo del líder.
4. **Sin snapshots:** tope de 1000 entradas; al llenarse se rechazan eventos nuevos.
5. **Sin seguridad de transporte:** HTTP/UDP sin autenticación ni cifrado; CORS `*`.
6. **Sin pre-vote ni check-quorum:** un líder aislado sigue creyéndose líder.
7. **`ForwardAck` al aceptar**, no al confirmar: un evento puede perderse si el líder muere justo
   después.
8. El «quórum» del agregador es una **inferencia** (≥ 2 nodos disponibles que reconocen al mismo
   líder), no validación de consenso.
9. **Corregida respecto de la fase:** la demo Docker actual **sí ejecuta el Raft real** (el nodo
   simulado compila el mismo núcleo del firmware para Linux). En la Fase 3 la demo no ejecutaba
   Raft; el único simulador sin Raft que queda es `npm run fake`.

### H.2 De la fase (con su estado posterior)

| # | Limitación de la Fase 3 | Estado el 2026-11-18 |
|---|---|---|
| L-1 | No se pudo reconstruir la imagen openSUSE por un mirror caído | **Resuelta**: `sismo-servidor-2` corre openSUSE Leap 15.6, `healthy` |
| L-2 | Sin capturas de consola serie ni fotos del prototipo | **Resuelta en parte**: la campaña física generó capturas del panel, evidencias de serial en `D-nodos/` y tres fotografías del montaje (FIS-03: `entrega/04-evidencias/F-fisicas/fot-FIS-03-prototipo-montado-a/b/c.png`). Las fotos documentan el montaje (ESP32 DevKit V1 y pulsador B3F-4055 sobre protoboard) pero no acreditan su operación ni los estados del LED; FIS-04 y FIS-05 siguen pendientes |
| L-3 | Captura de escritorio no disponible; se usó navegador headless | Superada: las capturas del 2026-11-18 se hicieron con Chrome headless/Playwright contra el stack real |
| L-4 | `v1.0.0` definitiva no etiquetada: faltaba la campaña física | Sigue pendiente: T1 no aprobada y T2+ sin autorización |
| L-5 | La clave antigua del portal permanecía en el historial de Git | **Resuelta en el repositorio**: el historial vigente la sustituyó por `[REDACTADO]`; queda riesgo residual en los respaldos externos previos a la reescritura (`plan-normalizacion-git.md` §6) |

---

## I. Seguridad

| Acción | Estado verificado el 2026-11-18 |
|---|---|
| Rotación de la clave del portal AP | **Hecha**: la clave vive solo en `firmware/detector/secretos.h` (no versionado), mínimo 8 caracteres (`README.md:236-242`) |
| Clave eliminada de archivo versionado | **Hecha**: `firmware/detector/config.h:28` remite a `firmware/detector/secretos.h`; `firmware/detector/secretos.ejemplo.h:5` solo tiene plantilla |
| Clave fuera de la consola serie | **Hecha**: el mensaje de arranque del portal no imprime la clave |
| Verificación de `firmware/detector/secretos.h` en Git | **Hecha**: `git check-ignore -v firmware/detector/secretos.h` → `.gitignore:2`; nunca fue rastreado |
| Riesgo residual: historial de Git | **Mitigado en el repositorio**: las apariciones fueron sustituidas por `[REDACTADO]`; los bundles de respaldo previos a la reescritura, fuera del repositorio, conservan la historia antigua (ver `plan-normalizacion-git.md`) |
| Autenticación/TLS del panel | **No implementada** (fuera de alcance; Caddy opcional da HTTPS en el perfil `https`) |
| CORS, `/control`, `/pulsar`, UDP Raft | Sin cambios: red de confianza; riesgo documentado |

No se revelan credenciales en este informe ni en las capturas.

---

## J. Git

**Al cierre de la Fase 3 (2026-11-17):** commit de estabilización `2306a9d`, tag `v1.0.0-rc1` y
`main` avanzado por fast-forward; no había remoto configurado y no se hizo `push`.

**Estado vigente (2026-11-18 11:15 -05:00), verificado con Git:**

| Dato | Valor |
|---|---|
| `HEAD` | `0ee5ed4a626c28904db55ab6e436e040c03f046c` (`0ee5ed4`), 2026-11-18 10:58:38 -05:00 |
| Asunto | `chore: retira material de diseño histórico, prompts y planes internos` |
| Commits | **102** (99 en primera línea; 3 merges) |
| Ramas | Solo `main`; `origin/HEAD` y `origin/main` apuntan a `0ee5ed4` |
| Tag `v1.0.0-rc1` | Objeto anotado `fc439b3` → commit `f567487` (2026-11-17 16:33:15 -05:00) |
| Relación tag ↔ `HEAD` | El tag es ancestro de `HEAD`; **`HEAD` está 49 commits por delante** (`git rev-list --count v1.0.0-rc1..HEAD` = 49) |
| Remoto | `origin` = `https://github.com/sebas-archive/alerta-sismica-raft-esp32.git`, privado; `ls-remote` confirma `main` = `0ee5ed4` |
| Autores | Los 102 commits: `sebas-archive <sebastianmeneses2456@gmail.com>` (autor y committer) |
| Trailers de IA | **0** `Co-Authored-By` en todo el historial |
| Licencia / terceros | `LICENSE` MIT (© 2026 Sebastián Revelo) y `THIRD-PARTY.md` presentes |

**Discrepancias detectadas y no corregidas aquí (no es competencia de este informe editar el
repositorio):**

1. Los hashes citados en el informe original de la Fase 3 (`1977662`, `3a274da`, `43aa2d5`,
   `7cd7f53`, `16fc9b0`) **ya no existen**: el historial se normalizó y volvió a crecer. Las
   evidencias físicas conservan esos hashes en sus encabezados porque son registros de la fecha; se
   identifican como históricos.
2. El mensaje del tag `v1.0.0-rc1` enumera resultados de la fase (pruebas A′ y JavaScript,
   firmware y sistemas operativos de Docker) que hoy no describen el sistema; además el tag está
   49 commits por detrás de `HEAD`. No se re-etiquetó.
3. `VERSION` conserva las cifras de la fase (número de pruebas JavaScript y de servicios
   Docker de entonces); `README.md` sí está actualizado. No se editó `VERSION` en esta
   regeneración.

---

## K. Matriz de aceptación (estado actualizado el 2026-11-18)

| ID | Criterio | Estado | Evidencia o motivo |
|---|---|---|---|
| F3-01 | Estado inicial de Git documentado | COMPLETADO | §J y `plan-normalizacion-git.md` |
| F3-02 | Vibración eliminada integralmente | COMPLETADO | §C; solo quedan textos de escala y una migración |
| F3-03 | Pulsador conservado | COMPLETADO | `firmware/detector/detector.ino:526-544`; `README.md:7-10` |
| F3-04 | Correcciones de riesgo nulo aplicadas | COMPLETADO | §B |
| F3-05 | Configuración temporal verificada | COMPLETADO | A′ 5/5 (histórico) y `firmware/detector/config.h:16-18`; `docs/prueba-hardware.md` |
| F3-06 | Pruebas C++ ejecutadas | COMPLETADO | 78/78; re-ejecutadas el 2026-11-18 |
| F3-07 | Arnés A′ compilado y ejecutado | COMPLETADO (en su fecha) | 5/5; log histórico conservado; no reproducible hoy |
| F3-08 | Pruebas JavaScript ejecutadas | COMPLETADO | Suite de la fase exit 0; hoy 75 casos con `npm test` |
| F3-09 | Docker validado | COMPLETADO | Tres sistemas operativos verificados; L-1 resuelta después |
| F3-10 | Firmware recompilado | COMPLETADO | 3/3 nodos; RES-05; recompilado el 2026-11-18 |
| F3-11 | Tres ESP32 preparadas y flasheadas | COMPLETADO (posterior) | `entrega/04-evidencias/D-nodos/log-NOD-10-flasheo-nodo*.txt`; `entrega/04-evidencias/D-nodos/log-NOD-16-verificacion-integral.txt` |
| F3-12 | Comunicación física comprobada | COMPLETADO (posterior) | `entrega/04-evidencias/D-nodos/log-NOD-16-verificacion-integral.txt` §2-3 |
| F3-13 | Elección de líder física comprobada | PARCIAL (posterior) | Líder único y término coherente observados (`entrega/04-evidencias/D-nodos/log-NOD-16-verificacion-integral.txt` §2); no se midió una elección en vivo |
| F3-14 | Failover medido | PARCIAL | Simulación de la fase; el failover físico no se midió; T1 no aprobada |
| F3-15 | Recuperación comprobada | PENDIENTE (física) | Comprobada en la demo Docker (`npm run test:infra`, 2026-11-18); falta la física |
| F3-16 | Ausencia de quórum comprobada | PENDIENTE (física) | Simulación y prueba de integración Docker; falta la física |
| F3-17 | Pruebas con pulsador realizadas | PARCIAL | T1 ejecutada y **no aprobada**; repetición y T2+ pendientes |
| F3-18 | Evidencias reales organizadas | COMPLETADO | `04-evidencias/` y `05-pruebas/`; inventario regenerado el 2026-11-18 |
| F3-19 | Documentación técnica actualizada | COMPLETADO | `docs/prueba-hardware.md` y `docs/servidores-de-datos.md` |
| F3-20 | README preparado | COMPLETADO | `README.md` actualizado |
| F3-21 | Riesgos y limitaciones documentados | COMPLETADO | §H y `pendientes.md` |
| F3-22 | Versión `v1.0.0` fijada | PENDIENTE | `v1.0.0-rc1`; la definitiva espera la campaña física |
| F3-23 | Estado Git final verificado | COMPLETADO | §J |
| F3-24 | Informe de Fase 3 generado | COMPLETADO | Este documento, regenerado el 2026-11-18 |

**Resumen:** 18 completados (dos de ellos en la campaña posterior a la fase), 3 parciales y 3
pendientes. Ningún criterio ejecutable de la fase quedó sin hacer.

---

## L. Artefactos preparados para la Fase 4

| Artefacto | Qué dejó listo la Fase 3 |
|---|---|
| Datos para diagramas | `datos-para-diagramas.md`: componentes, puertos, 6 tipos de mensaje, estados de Raft y de alerta, endpoints y flujos |
| Documento técnico | Diagnóstico, este informe, `README.md`, datos de diagramas e inventario de evidencias |
| Manual de instalación | `README.md` §§9-13, `entrega/06-manual/conexion-esp32.md` y `docs/prueba-hardware.md` |
| Presupuesto | Estructura creada; los precios dependen de consulta de mercado (los entrega el responsable de presupuesto) |
| Video | Pendiente de guion y grabación |
| Anexos | Logs, tablas y capturas organizados por categoría |

Las brechas de la Fase 3 que la Fase 4 debía cerrar (servidores de datos con PostgreSQL, histórico,
ADMIN nuevo, apagado/encendido real, nodo simulado con Raft real, HTTPS opcional y re-ejecución de
pruebas) están cubiertas en [`informe-fase4.md`](informe-fase4.md).
