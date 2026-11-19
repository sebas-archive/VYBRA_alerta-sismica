# Matriz de trazabilidad: objetivos y requisitos → evidencias

La columna «Evidencia» usa los identificadores del inventario
`entrega/05-pruebas/datos/inventario-evidencias.csv`, que es la fuente autoritativa para localizar
cada pieza. Las evidencias se citan siempre por su identificador, no solo por el nombre del archivo.

Estados usados en la columna «Estado»:

- **Refrescada 2026-11-18:** evidencia de software reproducible, re-ejecutada el día de la entrega.
- **Histórica 2026-11-17:** evidencia real del trabajo de campo de ese día; no se re-ejecutó.
- **Pendiente:** requiere hardware, autorización o datos que aún no se tienen.
- **Pendiente de usuario:** depende de un dato o decisión del usuario.

---

## 1. Objetivos del proyecto

| ID | Objetivo | Requisitos asociados |
|---|---|---|
| **O-1** | Construir un clúster de tres nodos ESP32 que mantenga un log replicado mediante consenso Raft propio, tolerando la caída de un nodo | REQ-01, REQ-02, REQ-03, REQ-04 |
| **O-2** | Convertir eventos simulados con pulsador en alertas solo cuando dos detectores distintos coincidan en una ventana de 10 s | REQ-05 |
| **O-3** | Exponer el estado del clúster y las alertas en una interfaz de operación (ADMIN) y una vista pública (CLIENTE) en tiempo real | REQ-10, REQ-11, REQ-12 |
| **O-4** | Persistir el histórico en servidores de datos con PostgreSQL, uno por ESP32, y consultarlo con filtros y paginación | REQ-13, REQ-14 |
| **O-5** | Desplegar todo el sistema (sin hardware) con Docker, incluido el apagado/encendido real de servidores de forma aislada | REQ-15, REQ-16 |
| **O-6** | Preparar el despliegue de producción con secretos fuera del repositorio, HTTPS opcional y licencia clara | REQ-17, REQ-18, REQ-20 |
| **O-7** | Documentar, evidenciar y validar el sistema con pruebas automatizadas y una campaña física | REQ-19, REQ-20, REQ-21 |

---

## 2. Requisitos y evidencias

| ID | Requisito verificable | Cómo se comprueba | Evidencia | Estado |
|---|---|---|---|---|
| **REQ-01** | Tres nodos con Raft propio: elección de líder, términos y voto único persistido en NVS | `test_raft` (32 casos) y `/estado` de los tres nodos | TST-01, TST-02, NOD-04, NOD-05, COD-01 a COD-04 | Refrescada 2026-11-18; NOD-04/05 histórica 2026-11-17 |
| **REQ-02** | Replicación `AppendEntries` (latido 500 ms, lotes ≤ 8) y `commitIndex` por mayoría 2/3 | `test_raft`, `test_mensajes` y observación del log en el panel | TST-01, NOD-14, OP-05, COD-05, COD-06 y COD-07 | Refrescada 2026-11-18 |
| **REQ-03** | Reenvío de eventos de seguidores al líder con deduplicación por id | `test_raft` (`forward`), pruebas de integración y log de los nodos | TST-01, TST-05, NOD-14, COD-07 y COD-08 | Refrescada 2026-11-18 |
| **REQ-04** | Recuperación/catch-up de un nodo reiniciado desde el índice 1 | `test_raft` (`reinicio…`, `resincroniza…`) y `test:infra` | TST-01, TST-05, RES-06; NOD-02 (histórica) | Refrescada 2026-11-18 |
| **REQ-05** | Máquina sísmica determinista: nivel/PGA por duración y alerta con dos detectores en ≤ 10 s; severidad alta/media/baja | `test_sismo` (11 casos), pruebas de integración y eventos reales del stack | TST-01, OP-03, CLI-01, COD-11 y COD-12; FIS-01 (histórica) | Refrescada 2026-11-18; FIS-01 histórica 2026-11-17 |
| **REQ-06** | Contrato HTTP del nodo: `GET /`, `/estado`, `/log`, `/sucesos`, `/alertas`; `POST /control`, `/pulsar`, `/huella` | `test_api` (9 casos) y `node web/scripts/verificar-esp32.js` | TST-01, NOD-04, COD-13, COD-14 y COD-15 | Refrescada 2026-11-18 |
| **REQ-07** | Direccionamiento por DHCP + descubrimiento por broadcast UDP 4211 y mDNS `sismo-nodo-N.local` | `test_mensajes`, captura `tcpdump` y `getent hosts` | TST-01, NOD-05, NOD-17 | Histórica 2026-11-17 |
| **REQ-08** | Portal cautivo propio (`SISMO-D<N>-config`) con persistencia en NVS | Revisión del firmware y prueba en el hardware | COD-18, COD-19, NOD-12; NOD-08 (captura pendiente) | Código y log verificados; captura pendiente (hardware) |
| **REQ-09** | Actualización OTA del firmware (ArduinoOTA, UDP 3232 / TCP 32323) | `cargar.sh N --wifi` con las placas reales | NOD-10 (flasheo USB), COD-16; NOD-06 (captura OTA pendiente) | Código y flasheo USB verificados; captura OTA pendiente |
| **REQ-10** | Agregador Node.js sin dependencias externas: sondeo 1 Hz, foto agregada, líder y quórum inferido, SSE | `npm test` (poller, SSE, panel) y `/api/estado` | TST-03, BE-03, BE-04, BE-09, COD-22 a COD-26 | Refrescada 2026-11-18 |
| **REQ-11** | ADMIN con nueve pestañas: Panorama, Sismógrafos, Alertas, Histórico, Clúster Raft, Servidores, Detectores, Registros y Configuración | `npm test` de la interfaz y capturas del stack real | OP-01 a OP-10, OP-18 y OP-19 | Refrescada 2026-11-18 |
| **REQ-12** | CLIENTE público: estado del servicio, último sismo, historial, protocolo de actuación, ajustes y aviso de simulacro | Pruebas de la vista pública y capturas | CLI-01 a CLI-12 | Refrescada 2026-11-18: CLIENTE funcional con capturas completas |
| **REQ-13** | Un servidor de datos y un PostgreSQL por ESP32; histórico con paginación, filtros y detalle; sin duplicados | `npm run test:db` (3 PostgreSQL reales) y `/api/historial` | TST-04, BE-03, RES-06, OP-04, COD-30 | Refrescada 2026-11-18 |
| **REQ-14** | Vista pública del histórico sin datos internos (IP, WiFi, términos, líder, órdenes) | Pruebas de `test:db` y revisión de la API pública | TST-04, CLI-01, CLI-05, CLI-07 | Refrescada 2026-11-18: funcionalidad y capturas verificadas |
| **REQ-15** | Apagado/encendido real desde ADMIN: solo `nodoN`/`servidorN`, sin tocar bases; controlador aislado con token y sin puerto publicado | `npm run test:infra` (5/5) y pruebas del controlador contra Docker simulado | TST-05, INF-02/03, OP-06 | Refrescada 2026-11-18 |
| **REQ-16** | Despliegue Docker de 11 servicios con sistemas operativos distintos (Debian, Fedora, openSUSE, Ubuntu, Alpine) y Raft real | `docker compose ps`, `/etc/os-release` de los contenedores y `test:infra` | INF-01, INF-02/03, INF-04, INF-05, INF-06, INF-09 | Refrescada 2026-11-18 |
| **REQ-17** | Producción con secretos de archivo, sin puertos de bases ni servidores de datos, y rechazo de la clave de desarrollo | Revisión de `docker-compose.prod.yml` y del código del servidor | `docker-compose.prod.yml` y `web/servidor/config.js` (código); manual §9; sin pieza de evidencia dedicada | Verificado en código; no se ejecutó un arranque de producción como evidencia |
| **REQ-18** | HTTPS opcional con Caddy en perfil `https`, con CA local y entrega de `/ca.crt` | Arranque del perfil y captura del panel en 8443 | `docker/Caddyfile` (código), manual §10; INF-07 (perfil `https` en `docker-compose.yml`) | Implementado y documentado; no se arrancó el perfil como evidencia (no hay captura del panel en 8443) |
| **REQ-19** | Pruebas automatizadas: C++ 78/78, JavaScript 75 (60+15 omitidas), `test:db` 70+5, `test:infra` 5/5, firmware 3/3 | Re-ejecución del 2026-11-18 | TST-01, TST-02, TST-03, TST-04, TST-05, TST-09, TST-10, RES-05, RES-06 | Refrescada 2026-11-18 |
| **REQ-20** | Licencia MIT, avisos de terceros, secretos fuera de Git y evidencias saneadas | Revisión de `LICENSE`, `THIRD-PARTY.md`, `.gitignore` y nota de saneado | `LICENSE` y `THIRD-PARTY.md`, DAT-01 (nota de saneado), TST-08 (estado de Git) | Refrescada 2026-11-18 |
| **REQ-21** | Documentación e informe de validación con resultados reales y campaña física declarada en curso | Revisión de `entrega/01-documento/`, `entrega/10-informes-fase3/` y este manual | Documento técnico, informes de fase, FIS-00, FIS-01 | Documento y manual entregados; campaña física T1 no aprobada |

---

## 3. Cobertura por categoría de evidencia

| Categoría | Qué cubre | Ejemplos de identificadores | Estado general |
|---|---|---|---|
| **A — Código** | Bloques del núcleo Raft, firmware, backend, controlador y persistencia | COD-01 a COD-30 (30/30 obtenidas) | Refrescada 2026-11-18 |
| **B — Interfaz** | ADMIN y CLIENTE (escritorio y móvil) | OP-01 a OP-10, OP-18 y OP-19; CLI-01 a CLI-12; BE-03 a BE-10 | Obtenida y refrescada 2026-11-18 |
| **C — Backend** | Arranque del agregador, API y SSE | BE-01 a BE-10 | Refrescada 2026-11-18 |
| **D — Nodos reales** | Flasheo, arranque, red, estado, sucesos y log de las tres placas | NOD-02, NOD-04, NOD-09, NOD-10, NOD-13, NOD-14, NOD-15, NOD-16, NOD-17, NOD-18 | Real e irremplazable; histórica 2026-11-17 (no se re-ejecuta) |
| **E — Pruebas** | C++ y JavaScript re-ejecutados; arnés A′ histórico | TST-01, TST-02, TST-03, TST-04, TST-05, TST-06, TST-07, TST-08, TST-09, TST-10, TST-11 | Refrescadas 2026-11-18; TST-11 histórica 2026-11-17 |
| **F — Pruebas físicas** | P0 (preparación), T1 (evento con pulsador) y montaje del prototipo | FIS-00 y FIS-01 (capturas `cap-FIS-*`) y FIS-03 (3 fotos del montaje) | Histórica 2026-11-17 (FIS-00/01, T1 no aprobada); FIS-03 obtenida el 2026-11-18 |
| **G — Arquitectura** | Diagramas de despliegue, componentes y estados (exportaciones) | ARQ-01 a ARQ-05, ARQ-11, ARQ-NOTA | Refrescada 2026-11-18; los demás diagramas están en `03-diagramas/` |
| **H — Infraestructura** | 11 contenedores, tres sistemas operativos, logs y consumo | INF-01, INF-02/03, INF-04, INF-05, INF-06, INF-07, INF-09 | Refrescada 2026-11-18; solo INF-08 pendiente (hardware) |
| **I — Resultados** | Firmware (tamaños), resumen de pruebas y SSE | RES-02, RES-04, RES-05, RES-06, RES-10 | Refrescada 2026-11-18; métricas físicas RES-01/03/07/08/09 pendientes (hardware) |

---

## 4. Brechas conocidas y su tratamiento

| Brecha | Requisitos afectados | Tratamiento |
|---|---|---|
| La campaña física T1 no se aprobó por un doble evento del pulsador | REQ-05, REQ-08, REQ-09 | Se documenta como incidencia real y diagnóstico en `entrega/10-informes-fase3/diagnostico-pulsador.md`; la repetición queda pendiente de revisar el contactor |
| T2 en adelante no ejecutadas (reelección real, sin quórum física, reinicio de router, latencias) | REQ-01, REQ-04, REQ-05, REQ-07 | Marcadas como pendientes; no se declaran como resultados |
| Arranque del perfil HTTPS no usado como evidencia | REQ-18 | El perfil está implementado y documentado; no se arrancó para capturar el panel en 8443 y no hay pieza del inventario asociada a esa captura |
| Arranque de producción no ejecutado como evidencia | REQ-17 | Se verifica la configuración y el rechazo de la clave de desarrollo por código y pruebas |
| No hay cobertura de código, ASan/UBSan ni CI en el repositorio | REQ-19 | Carencia estructural documentada como evidencia obtenida en `TST-10` (`log-TST-10-carencia.txt` y `NOTA-TST-10-carencia.md`); no es una pieza pendiente |
| Datos de portada del documento técnico y grabación del video | REQ-21 | Dependen del usuario; se entregan con marcadores `[PENDIENTE: dato del usuario]` |

---

## 5. Regla de citación

1. Toda evidencia se cita por su identificador del inventario (`TST-01`, `FIS-01`, `OP-05`, …).
2. Las capturas `cap-REF-*` son del **stack Docker real actual** (11 servicios, Raft real) y sus datos
   de demostración se identifican como tales; **no** son del clúster físico ni mockups.
3. La evidencia física (`D-nodos`, `F-fisicas`, `FIS-*`) es real del 2026-11-17 y se conserva sin
   alteraciones; no se regenera.
4. Un requisito sin evidencia no se declara cumplido: se marca como pendiente.
