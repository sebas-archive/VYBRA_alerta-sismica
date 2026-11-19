# Entrega — Alerta Sísmica / VYBRA

Esta carpeta reúne los **entregables académicos** del proyecto y sus evidencias. El código del
sistema vive en las carpetas de primer nivel del repositorio (`firmware/`, `web/`); aquí están el
documento técnico, los diagramas, las evidencias, los registros de pruebas, el manual, el manual
final de instalación en Markdown, el presupuesto, el material del video, los anexos y los informes
de validación.

| Dato | Valor |
|---|---|
| Proyecto | Alerta Sísmica / VYBRA — clúster de 3 ESP32 con consenso Raft propio, agregador Node.js, panel ADMIN, vista CLIENTE y 3 servidores de datos con PostgreSQL |
| Commit del repositorio | `0ee5ed4a626c28904db55ab6e436e040c03f046c` (`0ee5ed4`), 2026-11-18 10:58:38 -05:00 |
| Versión declarada | `v1.0.0-rc1` (candidata). El tag `v1.0.0-rc1` apunta a `f567487`, **49 commits por detrás** de `HEAD`; `0ee5ed4` no tiene tag exacto. La `v1.0.0` definitiva se etiqueta tras la campaña física |
| Fecha de esta entrega | 2026-11-18 (America/Bogota) |
| Licencia | MIT, © 2026 Sebastián Revelo (`../LICENSE`) |
| Terceros | `../THIRD-PARTY.md` |
| Estado | Software validado y documentado; **campaña física en curso** (P0 completada, T1 no aprobada, T2 en adelante pendientes); grabación del video pendiente |

> **El evento sísmico es simulado con un pulsador.** No hay instrumentación sísmica ni medición de
> aceleración: el sistema demuestra consenso distribuido, replicación y agregación. La escala de
> nivel/PGA es de simulación.

---

## 1. Estado de la entrega de un vistazo

| # | Entregable | Ubicación | Estado |
|---|---|---|---|
| 1 | Documento técnico | `01-documento/` | **Entregado** (19 apartados en Markdown); portada pendiente de los datos del usuario |
| 2 | Aplicación funcional | `../firmware/`, `../web/` | **Parcial**: funcional y validada en software; campaña física pendiente (T1 no aprobada, T2+ pendientes) |
| 3 | Código fuente | `02-codigo/` y repositorio | **Entregado** (el repositorio en el commit `0ee5ed4`; sin ZIP) |
| 4 | Diagramas | `03-diagramas/` | **Entregados** (14 diagramas PlantUML; 14 SVG; 14 PNG) |
| 5 | Evidencias de pruebas | `04-evidencias/`, `05-pruebas/` | **Parciales**: completas las de software; faltan capturas y métricas de la campaña física (detalle por ID en el inventario) |
| 6 | Manual de instalación y ejecución | `06-manual/` | **Entregado** (manual general + conexión de las ESP32) |
| 7 | Video de sustentación | [`08-video/README.md`](08-video/README.md) | **Publicado:** https://youtu.be/YlzKwWkXzaw |
| 8 | Presupuesto | `07-presupuesto/` | **Entregado** (MD + CSV + verificación de sumas; comprobante Electronilab Pedido 60869 como fuente primaria y 3 fotos de recepción de los componentes; total **256.214 COP ≈ 77,42 USD**: compra real de la factura Electronilab, 189.214 COP ≈ 57,17 USD, más plan de datos Claro, 67.000 COP ≈ 20,24 USD) |
| 9 | Manual de instalación y ejecución (edición final) | [`12-manual-instalacion/`](12-manual-instalacion/) | **Entregado** (solo Markdown y figuras; 10 capítulos, 17 figuras y 45 tablas; se lee desde [`README.md`](12-manual-instalacion/README.md)) |

El detalle de qué falta exactamente está en [`00-CHECKLIST-ENTREGA.md`](00-CHECKLIST-ENTREGA.md).

---

## 2. Mapa real de la carpeta

Recuento al cierre del 2026-11-18. Los archivos y carpetas que no se mencionan no forman parte de la
entrega.

| Ruta | Contenido | Estado |
|---|---|---|
| `00-LEEME.md` | Este mapa: qué hay, cómo se cita y qué es evidencia válida | Completo |
| `00-CHECKLIST-ENTREGA.md` | Checklist de los 9 entregables con estado real y qué falta | Completo |
| `01-documento/` | `documento-tecnico.md` (19 apartados), `README.md` y `figuras/` con 25 figuras: 14 diagramas, 10 capturas reales y 1 figura compuesta con dos fotos del montaje | Completo; portada con 7 marcadores `[PENDIENTE: dato del usuario]` |
| `02-codigo/` | `README.md` con el mapa del código y las instrucciones de verificación; el código vive en `../firmware/` y `../web/` | Completo; sin ZIP |
| `03-diagramas/` | `fuente/` con 14 `.puml`, `exportado/` con 14 `.svg` y 14 `.png`, y `README.md` con el índice y la trazabilidad de cada diagrama | Completo |
| `04-evidencias/` | Evidencias reales por categoría A–I (ver sección 3) | Software refrescado; física histórica conservada; algunas capturas pendientes |
| `05-pruebas/` | `datos/` (JSON y CSV de la campaña, inventario y nota de saneado), `logs/` (ejecuciones de pruebas e infraestructura) y `scripts/` (campaña física) | Completo para lo ejecutado |
| `06-manual/` | `manual-instalacion-y-ejecucion.md` (autónomo) y `conexion-esp32.md` (parte física) | Completo |
| `07-presupuesto/` | `presupuesto.md`, `presupuesto.csv` y `verificacion-sumas.txt`; el comprobante real `comprobante-electronilab-pedido-60869.jpg` (fuente primaria de montos) y las 3 fotos de recepción `fotos-componentes-recibidos-1.png`, `fotos-componentes-recibidos-2.png` y `fotos-componentes-recibidos-3.png` | Completo |
| `08-video/` | `README.md` con el enlace al video publicado | Completo; guiones internos retirados |
| `09-anexos/` | Glosario, referencias y bibliografía, matriz de trazabilidad, nota de saneado y aviso de material histórico retirado | Completo |
| `10-informes-fase3/` | Informes de fase 3 y 4, pendientes, diagnóstico del pulsador, identificación de nodos, plan de normalización de Git y datos para diagramas | Completo |
| [`11-documento-final/`](11-documento-final/) | **Fuente y figuras del documento técnico final** (no es un entregable numerado): `fuente.md`, `manifiesto-figuras.json`, `README.md` y `figuras/` (151 archivos) | Completo; sin Word, PDF ni constructor |
| [`12-manual-instalacion/`](12-manual-instalacion/) | Manual final de instalación y ejecución: `README.md`, `fuente-manual.md`, `secciones/` (10 MD), `figuras/` (17 PNG + fuentes SVG/PY/PUML), manifiesto e inventario | Completo; 10 capítulos, 17 figuras y 45 tablas; comprobaciones en `VERIFICACION.md` |

`11-documento-final/` es la fuente extensa del documento técnico final, no un entregable nuevo: el
entregable 1 sigue siendo `01-documento/` y esta carpeta aporta el Markdown completo y sus figuras.

No existen en esta entrega las carpetas `mockup/`, `preview/`, `new interfaz/` ni `docs/superpowers/`:
fueron retiradas del repositorio (véase `09-anexos/aviso-material-historico-retirado.md`).

---

## 3. Categorías de evidencia A–I

Cada categoría tiene su carpeta en `04-evidencias/`; los archivos individuales se describen en
[`05-pruebas/datos/inventario-evidencias.csv`](05-pruebas/datos/inventario-evidencias.csv).

| Cat. | Nombre | Carpeta | Contenido | Estado |
|---|---|---|---|---|
| **A** | Código | `04-evidencias/A-codigo/` | Bloques de código citados por el documento, extraídos del commit `0ee5ed4` (COD-01 a COD-30) | Obtenida (30/30) |
| **B** | Interfaz | `04-evidencias/B-interfaz/` | Capturas de ADMIN, CLIENTE y móvil del stack Docker real (OP-01 a OP-10, OP-18, OP-19, CLI-01 a CLI-12; `NOTA-capturas-REF.md`) | Obtenida (24/24) |
| **C** | Backend | `04-evidencias/C-backend/` | API del panel y salida del agregador (BE-01 a BE-10) | Obtenida (10/10) |
| **D** | Nodos ESP32 | `04-evidencias/D-nodos/` | Flasheo, arranque, red, estado, sucesos, log y estabilidad de las tres placas | Real e irremplazable (2026-11-17) |
| **E** | Pruebas automatizadas | `04-evidencias/E-pruebas/` | Logs de C++, JavaScript, árbol de pruebas, versiones y arnés A′ histórico (TST-01 a TST-11) | Obtenida; TST-11 es histórica del 2026-11-17 |
| **F** | Pruebas físicas | `04-evidencias/F-fisicas/` | 8 archivos: 4 capturas de P0 y T1 con las placas reales, 3 fotos del montaje (FIS-03) y la `NOTA-F-fisicas.md` | Real e irremplazable: capturas del 2026-11-17 (T1 no aprobada) y fotos del montaje recibidas el 2026-11-18 |
| **G** | Arquitectura | `04-evidencias/G-arquitectura/` | Exportaciones SVG/PNG de los diagramas de despliegue, componentes y estados (ARQ-01…05, ARQ-11) y `NOTA-G-arquitectura.md` | Obtenida |
| **H** | Infraestructura | `04-evidencias/H-infraestructura/` | 11 contenedores, tres sistemas operativos, logs y consumo (INF-01…07, INF-09) | Obtenida; INF-08 pendiente (requiere las placas) |
| **I** | Resultados | `04-evidencias/I-resultados/` | Tablas de firmware y pruebas, latencia y consumo del software, y log de SSE (RES-02, RES-04, RES-05, RES-06, RES-10) | Obtenida; métricas físicas RES-01/03/07/08/09 pendientes |

Resumen del inventario (2026-11-18): **159 filas** (133 obtenidas, 23 pendientes y 3 históricas;
además de las categorías A–I incluye `DAT` para datos y notas). Las evidencias de software están
**obtenidas y refrescadas** ese día; la evidencia física (capturas del 2026-11-17, fotos del montaje
recibidas el 2026-11-18 y arnés A′ histórico) se conserva **real y sin alterar**, y las 23 piezas
**PENDIENTE** dependen **solo de hardware**: `NOD-01/03/06/07/08`, `FIS-04` a `FIS-15` (12 piezas),
`INF-08` y `RES-01/03/07/08/09`. Un identificador `PENDIENTE` no se usa como resultado en ningún
documento.

---

## 4. Cómo se citan las evidencias

1. **Siempre por identificador** del inventario, no solo por nombre de archivo: `TST-01`, `COD-13`,
   `OP-05`, `CLI-01`, `BE-03`, `NOD-10`, `FIS-01`, `INF-04`, `RES-05`, `ARQ-01`, `DAT-01`…
   El inventario (`05-pruebas/datos/inventario-evidencias.csv`) indica categoría, carpeta, archivo,
   contenido y estado de cada pieza.
2. **Las capturas `cap-REF-*`** (categorías B y C) son del **stack Docker real** del 2026-11-18: 11
   servicios con el **núcleo Raft real** del firmware, 3 PostgreSQL y 3 servidores de datos. Sus
   eventos y alertas son **datos de demostración generados por el software**, no mediciones sísmicas
   ni la campaña física. Se explican en `04-evidencias/B-interfaz/NOTA-capturas-REF.md`.
3. **La evidencia física** (`D-nodos/`, `F-fisicas/` y `05-pruebas/datos|logs/FIS-*`) es real del
   2026-11-17, no se puede regenerar sin hardware y **se conserva sin alterar**. Las capturas y logs
   `FIS-*` no son mockups.
4. **La evidencia histórica no reproducible** se rotula como tal: el arnés A′ (`TST-11`) es del
   2026-11-17 y no se re-ejecutó porque el arnés ya no existe en el repositorio.
5. **Un requisito sin evidencia no se declara cumplido**: en la matriz de trazabilidad
   (`09-anexos/matriz-trazabilidad.md`) figura como pendiente.

---

## 5. Regla de oro

**Ninguna evidencia de `04-evidencias/` puede ser un mockup, una maqueta ni una captura de material
de diseño histórico.** Ese material fue retirado del repositorio y no forma parte de la aplicación
entregada:

- `docs/superpowers/` (planes y prompts internos), `mockup/` (maquetas) y `preview/`
  (previsualizaciones) fueron borrados en el commit `0ee5ed4`.
- La UI vigente **no** es `web/public/operador.html` (queda como fallback): el ADMIN actual es la SPA
  de `web/public/admin/` y el CLIENTE se sirve desde `web/public/cliente/`.
- **Mapa de las interfaces:** el ADMIN usa el mapa SVG propio (proyección calculada en el navegador,
  sin teselas); el CLIENTE (`/publico` → `/cliente/`) usa Leaflet vendorizado en
  `web/public/cliente/vendor/leaflet/` y teselas de OpenStreetMap
  (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`, `web/public/cliente/js/cliente-app.js:688`).
  `README.md` §7 está desactualizado en ese punto; no se edita en esta entrega.
- Las capturas de interfaz de esta entrega se tomaron contra el stack real; si en algún documento se
  menciona material histórico, debe rotularse como registro histórico y no como aplicación
  entregada.
- Las evidencias físicas reales no se retocan: se conservan íntegras y rotuladas.

---

## 6. Versión, commit y fecha (declaración precisa)

- La **versión declarada** en `../README.md` y `../VERSION` es `v1.0.0-rc1` (candidata).
- El **tag** `v1.0.0-rc1` apunta al commit `f567487` del 2026-11-17; es **ancestro** del commit
  entregado, que está **49 commits por delante** (`git rev-list --count v1.0.0-rc1..HEAD` = 49).
- El **commit entregado** es `0ee5ed4a626c28904db55ab6e436e040c03f046c` (2026-11-18 10:58:38 -05:00)
  y **no tiene tag exacto**. El snapshot de `02-codigo/` corresponde a ese commit.
- `VERSION` y el tag `v1.0.0-rc1` **conservan cifras de la Fase 3** (por ejemplo, «Pruebas
  JavaScript 41/41» y «Docker Compose 4 servicios»). Son artefactos históricos de la versión
  declarada y **no se corrigieron** en esta entrega; las cifras vigentes son las de `README.md` y de
  la ficha canónica: 78/78 C++, 75 JavaScript (60 pasan + 15 omitidas), 11 servicios Docker.
- La etiqueta definitiva `v1.0.0` se creará después de completar la campaña física (repetición de T1
  y T2 en adelante).

---

## 7. Pendientes que dependen del usuario

| Pendiente | Dependencia |
|---|---|
| Datos personales de la portada del documento (institución, programa, asignatura, docente, integrantes, fecha y título oficial) | Datos del usuario; hoy hay 7 marcadores `[PENDIENTE: dato del usuario]` |
| Video de sustentación | Publicado en https://youtu.be/YlzKwWkXzaw |
| Repetición de T1 y ejecución de T2+ de la campaña física | Revisión del contactor del pulsador, hardware disponible y autorización |
| Visibilidad o archivo del repositorio remoto | `origin` **ya existe y está publicado como privado** (`https://github.com/sebas-archive/alerta-sismica-raft-esp32.git`, `origin/main` = `0ee5ed4`); lo abierto es mantenerlo privado, publicarlo o archivarlo, no el push |
| Tag de `HEAD` | El usuario decide si se deja el tag histórico `v1.0.0-rc1` (49 commits atrás), se crea uno nuevo en `0ee5ed4` o se mueve; no se movió ni recreó |
| Clave antigua del portal | **No está en el historial alcanzable del repositorio** (fue sustituida por `[REDACTADO]`); el riesgo residual son los *bundles* externos en `/home/t1an/respaldos/`, que el usuario debe retirar o regrabar antes de compartir |

El detalle está en [`10-informes-fase3/pendientes.md`](10-informes-fase3/pendientes.md). Las
limitaciones técnicas aceptadas (log en RAM, sin snapshots, sin seguridad de transporte, etc.) están
en `../README.md` §16 y `10-informes-fase3/informe-fase4.md`.

---

## 8. Cómo verificar la entrega en dos minutos

```bash
cd entrega

# Código entregable: integridad y contenido
git log -1 --format='%H %ad %s' --date=iso

# Documento técnico
head -20 01-documento/documento-tecnico.md

# Manual final
head -20 12-manual-instalacion/README.md

# Diagramas: 14 fuentes y 14 exportaciones de cada tipo
ls 03-diagramas/fuente/*.puml | wc -l
ls 03-diagramas/exportado/*.svg | wc -l
ls 03-diagramas/exportado/*.png | wc -l

# Inventario de evidencias y su coherencia
python3 -c "import csv;print(sum(1 for _ in csv.DictReader(open('05-pruebas/datos/inventario-evidencias.csv'))),'filas')"

# Reproducir las pruebas (requiere el repositorio y sus dependencias; ver 06-manual)
(cd ../web && npm test && npm run test:db && npm run test:infra)
```

Los resultados esperados y los comandos completos de instalación, compilación y pruebas están en
[`06-manual/manual-instalacion-y-ejecucion.md`](06-manual/manual-instalacion-y-ejecucion.md).
