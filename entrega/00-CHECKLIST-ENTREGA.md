# Checklist de los 9 entregables

**Estado real al 2026-11-18 (America/Bogota).** Commit del repositorio:
`0ee5ed4a626c28904db55ab6e436e040c03f046c` (`0ee5ed4`, 2026-11-18 10:58:38 -05:00). Versión
declarada: `v1.0.0-rc1` (el tag `v1.0.0-rc1` apunta a `f567487`, 49 commits por detrás de `HEAD`).
Licencia MIT. El evento sísmico es simulado con un pulsador.

Estados: **ENTREGADO** (listo, salvo datos del usuario), **PARCIAL** (hay material entregado, falta una
parte que depende de hardware o de terceros), **GUION+PPT ENTREGADOS / grabación pendiente** y
**PENDIENTE** (no existe todavía).

| # | Entregable | Ubicación | Estado | Qué falta exactamente |
|---|---|---|---|---|
| 1 | **Documento técnico** | `01-documento/` | **ENTREGADO** (portada pendiente de datos del usuario) | Sustituir los 7 marcadores `[PENDIENTE: dato del usuario]` de la portada (institución, programa, asignatura, docente, integrantes, fecha y título oficial) y ajustar al formato/rúbrica institucional. El contenido técnico está cerrado |
| 2 | **Aplicación funcional** | `../firmware/`, `../web/` | **PARCIAL** (software completo; campaña física pendiente) | Repetir T1 (el pulsador produjo dos eventos cortos el 2026-11-17) y ejecutar T2 en adelante: reelección real, sin quórum física, reinicio del router, latencias y capturas con las placas. No es un defecto del software: es validación de hardware pendiente |
| 3 | **Código fuente** | `02-codigo/` y repositorio | **ENTREGADO** | Decisión del usuario sobre el tag de `HEAD` (el tag `v1.0.0-rc1` está 49 commits atrás y `0ee5ed4` no tiene tag) y sobre la visibilidad o archivo del repositorio remoto. El remoto `origin` ya existe (privado) y `origin/main` apunta a `0ee5ed4`: el push está hecho. El snapshot y su verificación están listos |
| 4 | **Diagramas** | `03-diagramas/` | **ENTREGADOS** | Nada: 14 fuentes PlantUML, 14 SVG, 14 PNG, índice con trazabilidad a código y copias de arquitectura/estados en `04-evidencias/G-arquitectura/` |
| 5 | **Evidencias de pruebas** | `04-evidencias/`, `05-pruebas/` | **PARCIALES** (campaña física pendiente) | 23 piezas del inventario siguen pendientes y **todas dependen de hardware**: `NOD-01/03/06/07/08` (5), `FIS-04` a `FIS-15` (12), `INF-08` (1) y `RES-01/03/07/08/09` (5). Detalle por ID en la sección 2 |
| 6 | **Manual de instalación y ejecución** | `06-manual/` | **ENTREGADO** | Nada: `manual-instalacion-y-ejecucion.md` autónomo y `conexion-esp32.md` actualizado con las evidencias reales del 2026-11-17 |
| 7 | **Video de sustentación** | [`08-video/README.md`](08-video/README.md) | **PUBLICADO** | Nada: video en https://youtu.be/YlzKwWkXzaw. Los guiones y el storyboard se retiraron por ser material interno |
| 8 | **Presupuesto** | `07-presupuesto/` | **ENTREGADO** | Nada: `presupuesto.md`, `presupuesto.csv` y `verificacion-sumas.txt`, con el comprobante real como fuente primaria y 3 fotos de recepción de los componentes; total **256.214 COP** (≈ **77,42 USD** con TRM 3.309,55 del 2026-11-18): compra Electronilab 189.214 COP ≈ 57,17 USD + plan de datos Claro 67.000 COP ≈ 20,24 USD; sumas verificadas en `verificacion-sumas.txt` |
| 9 | **Manual de instalación y ejecución (edición final)** | `12-manual-instalacion/` | **ENTREGADO** | Nada: manual completo en **Markdown** ([`README.md`](12-manual-instalacion/README.md) + `fuente-manual.md` + 10 secciones), con **17 figuras** (PNG y fuente SVG/PY/PUML) y **45 tablas**. Inventario en [`12-manual-instalacion/INVENTARIO-ENTREGABLES.md`](12-manual-instalacion/INVENTARIO-ENTREGABLES.md) |
| Soporte | **Fuente y figuras del documento técnico final** (no numerado) | `11-documento-final/` | **SOPORTE** | Nada: `fuente.md` (133.929 B), `manifiesto-figuras.json`, `README.md` y `figuras/` (151 archivos). **No es un entregable numerado**: el entregable 1 sigue siendo `01-documento/` |

La fila **Soporte** no cuenta como entregable: `11-documento-final/` conserva la fuente extensa del
documento técnico final y sus figuras, no un décimo entregable.

---

## 1. Detalle por entregable

### 1.1 Documento técnico (`01-documento/`)

- `documento-tecnico.md` (≈ 92,8 KB), listo para leer en el repositorio. El PDF y el HTML se
  retiraron; su contenido es el mismo Markdown.
- **19 apartados numerados** (Portada, Resumen, Introducción, Planteamiento, Objetivos, Justificación,
  Marco teórico, Arquitectura, Diseño del consenso y máquina sísmica, Firmware, Agregador e
  interfaces, Servidores de datos y persistencia, Infraestructura/despliegue/seguridad, Metodología
  de pruebas, Resultados, Discusión, Limitaciones y trabajo futuro, Conclusiones, Bibliografía y
  anexos).
- 25 figuras en `figuras/`: 14 diagramas del sistema, 10 capturas reales y 1 figura compuesta con dos
  fotos del montaje (FIS-03).
- Verificado: los tres formatos abren; las figuras referenciadas existen; las cifras coinciden con
  `/tmp/entrega-facts.md` y con `README.md`; la campaña física se declara en curso y T1 no aprobada;
  no se cita material retirado.
- **Pendiente (usuario):** los 7 datos personales de la portada y el formato institucional.

### 1.2 Aplicación funcional (`../firmware/`, `../web/`)

- Clúster operativo de 3 nodos; demo Docker con 11 servicios y **Raft real**; ADMIN en `/admin/` y
  CLIENTE en `/publico` (redirige a `/cliente/`); histórico en 3 PostgreSQL; apagado/encendido real
  con controlador aislado; perfil HTTPS opcional.
- Pruebas re-ejecutadas el 2026-11-18: C++ 78/78, JavaScript 75 (60 pasan + 15 omitidas), `test:db`
  70 pasan + 5 omitidas, `test:infra` 5/5, firmware compilado para los 3 nodos.
- **Pendiente (hardware/autorización):** campaña física T1 repetida y T2 en adelante; etiqueta
  `v1.0.0` definitiva tras esa campaña.

### 1.3 Código fuente (`02-codigo/`)

- El código está en el repositorio, en `../firmware/` y `../web/`, en el commit `0ee5ed4`.
- `README.md` documenta la estructura, cómo verificar el commit y cómo obtener una copia inmutable
  con `git archive`. No hay ZIP ni snapshot duplicado.
- Sin `.env`, `secretos.h`, certificados, `node_modules` ni volcados: las reglas de `.gitignore`
  los mantienen fuera.
- Comandos de compilación y ejecución en `../12-manual-instalacion/secciones/07-instalacion-ejecucion.md`.
  ejecución, pruebas, licencia MIT, terceros y verificación.
- **Pendiente (usuario):** decisión sobre el tag de `HEAD` y sobre la visibilidad o archivo del
  repositorio remoto. El remoto `origin` ya existe (privado) y `origin/main` = `0ee5ed4`.
- Nota: `VERSION` y el tag `v1.0.0-rc1` conservan cifras de la Fase 3 («41/41» pruebas JavaScript,
  «4 servicios» Docker) y el tag está 49 commits por detrás de `HEAD`; se documenta el estado y no se
  corrigen, porque son artefactos históricos de la versión declarada. Las cifras vigentes son 78/78
  C++, 75 JavaScript y 11 servicios Docker.

### 1.4 Diagramas (`03-diagramas/`)

- `fuente/`: 14 archivos `.puml` (D-01 a D-14).
- `exportado/`: 14 `.svg` + 14 `.png`, validados y abiertos.
- `README.md`: índice con tipo, contenido y fuente de verdad (archivo:líneas) de cada diagrama.
- `04-evidencias/G-arquitectura/` contiene las exportaciones de arquitectura, despliegue, componentes
  y estados, con `NOTA-G-arquitectura.md` (autoría y comando de generación).
- **Pendiente:** ninguno.

### 1.5 Evidencias de pruebas (`04-evidencias/`, `05-pruebas/`)

Ver el detalle en la sección 2. Resumen:

- **Obtenidas y refrescadas el 2026-11-18:** código (A, COD-01…COD-30), capturas del stack real
  (B: OP-01…OP-10, OP-18 y OP-19; C: BE-01…BE-10), pruebas (E: TST-01 a TST-10), interfaz CLIENTE
  (CLI-01…CLI-12), infraestructura (H: INF-01…INF-07 e INF-09), resultados de software (I: RES-02,
  RES-04, RES-05, RES-06 y RES-10) y arquitectura (G: ARQ-01…ARQ-05, ARQ-11 y nota).
- **Histórica real, conservada sin alterar (2026-11-17):** nodos físicos (`D-nodos/`, NOD-02, 04, 05,
  09–18), pruebas físicas (F: FIS-00, FIS-01, FIS-02), arnés A′ (TST-11) y las fotos reales del
  montaje (FIS-03, recibidas el 2026-11-18), que documentan el montaje pero no acreditan operación ni estados
  del LED. No se re-ejecuta porque requiere el hardware o el arnés ya no existe.
- **Pendiente:** ver la sección 2.

### 1.6 Manual de instalación y ejecución (`06-manual/`)

- `manual-instalacion-y-ejecucion.md`: requisitos de hardware/software, obtención del código,
  `.env` y secretos, `docker compose` de desarrollo y producción, perfil HTTPS con Caddy, panel
  8095, ADMIN/CLIENTE, histórico PostgreSQL, apagado/encendido de servidores, pruebas
  (`npm test`, `test:db`, `test:infra`, C++, firmware), flasheo y uso con ESP32 reales, y solución de
  problemas con los mensajes reales del repositorio.
- `conexion-esp32.md`: identificación de placas, flasheo USB/OTA, portal AP, NTP y evidencias reales
  del 2026-11-17 (P0 completada, T1 no aprobada).
- **Pendiente:** ninguno. No se entrega DOCX/PDF del manual porque no se solicitó.

### 1.7 Video de sustentación (`08-video/`)

- `README.md` con el enlace al video publicado: https://youtu.be/YlzKwWkXzaw.
- Los guiones, el storyboard, el checklist de grabación y la presentación de apoyo se retiraron
  del repositorio por ser material interno de trabajo.
- **Pendiente:** ninguno.

### 1.8 Presupuesto (`07-presupuesto/`)

- `presupuesto.md`, `presupuesto.csv` y `verificacion-sumas.txt` (sumas recalculadas y verificadas en
  `verificacion-sumas.txt`).
- `comprobante-electronilab-pedido-60869.jpg`: comprobante real del **Pedido 60869**, **fuente primaria
  de los montos** de la compra.
- `fotos-componentes-recibidos-1.png`, `fotos-componentes-recibidos-2.png` y
  `fotos-componentes-recibidos-3.png`: fotografías de la **recepción de los componentes** del pedido,
  aportadas por el usuario; documentan que la compra llegó y **no alteran ninguna cifra**.
- Hardware comprado (factura Electronilab Pedido 60869, 2026-11-18): 3 ESP32 DevKit V1 de 30 pines,
  3 protoboard MB102, 1 juego de 40 cables jumper Dupont macho-macho, 3 cables micro-USB de 30 cm y
  4 pulsadores B3F-4055. La alimentación es por los cables micro-USB desde el PC: no se compraron
  adaptadores de pared. Conectividad: 1 mensualidad del plan de datos Claro como servicio de
  referencia. Software: todo open source, coste 0, con licencias detalladas.
- Total: **256.214 COP** ≈ **77,42 USD** (TRM 3.309,55 del 2026-11-18) = compra real
  189.214 COP ≈ 57,17 USD + plan Claro 67.000 COP ≈ 20,24 USD; sumas recalculadas y verificadas.
  Sustituye a la estimación de lista anterior (menos ESP32, con adaptadores que no se compraron,
  sin envío ni plan de datos).
- **Pendiente:** ninguno; los supuestos y exclusiones están declarados (sin mano de obra, sin nube,
  sin instrumentación sísmica porque el evento es simulado).

### 1.9 Manual de instalación y ejecución, edición final (`12-manual-instalacion/`)

- [`README.md`](12-manual-instalacion/README.md) es la portada del manual e incluye el índice con
  enlaces a los diez capítulos, las figuras y los datos que no se negocian.
- `fuente-manual.md` (4.014 líneas) es la unión de las diez secciones de `secciones/`, que se conservan
  como fuente de verdad; `manifiesto-figuras-manual.json` describe las **17 figuras** de `figuras/`.
  El manual tiene **45 tablas** y cada figura conserva su fuente editable (SVG, PY o PUML).
- Los capítulos están en [`secciones/`](12-manual-instalacion/secciones/): resumen, introducción,
  requisitos, montaje, arquitectura (criterio 4), evidencias (criterio 5), firmware, instalación,
  operación y anexos.
- Inventario y estado de cada archivo en
  [`12-manual-instalacion/INVENTARIO-ENTREGABLES.md`](12-manual-instalacion/INVENTARIO-ENTREGABLES.md).
- No sustituye al manual `06-manual/`: lo amplía y queda como edición final en Markdown.
- **Pendiente:** ninguno. No hay Word, PDF ni archivos binarios que generar.

---

## 2. Evidencias: qué falta exactamente

Según `05-pruebas/datos/inventario-evidencias.csv` (**159 filas: 133 obtenidas, 23 pendientes y 3
históricas** al 2026-11-18). Las 23 pendientes son **solo de hardware**:

- Nodos: `NOD-01`, `NOD-03`, `NOD-06`, `NOD-07`, `NOD-08` (5 piezas).
- Campaña física: `FIS-04` a `FIS-15` (12 piezas); `FIS-03` ya está **OBTENIDA** con tres fotos del
  montaje.
- Infraestructura con placas: `INF-08`.
- Resultados físicos: `RES-01`, `RES-03`, `RES-07`, `RES-08`, `RES-09` (5 piezas).

No queda ninguna pieza de software pendiente ni carencia estructural abierta: `TST-02`, `TST-09`,
`TST-10`, `INF-07`, `RES-02` y `RES-10` se obtuvieron el 2026-11-18. La evidencia física real del
2026-11-17 y las fotos del montaje se conservan y no se sustituyen por capturas del stack simulado.

---

## 3. Criterios de coherencia entre entregables

- **Versión:** todos citan `v1.0.0-rc1` y el commit `0ee5ed4`, con la precisión de que el tag
  `v1.0.0-rc1` apunta a `f567487` (49 commits atrás) y `HEAD` no tiene tag. La `v1.0.0` definitiva
  queda para después de la campaña física.
- **Evento simulado:** el pulsador se describe siempre como generador de eventos simulados, nunca
  como sensor sísmico; nivel y PGA son una escala de simulación.
- **Capturas `cap-REF-*`:** son del **stack Docker real** (11 servicios, Raft real) y sus eventos son
  datos de demostración, no la campaña física ni mockups. Están documentadas en
  `04-evidencias/B-interfaz/NOTA-capturas-REF.md`.
- **Evidencia física:** `D-nodos`, `F-fisicas` y `FIS-*` son reales del 2026-11-17 y se conservan sin
  alterar.
- **Limitaciones:** las de `README.md` §16 se repiten en el documento técnico, en los informes y en el
  manual (log en RAM, sin snapshots, sin seguridad de transporte, sin pre-vote/check-quorum,
  `ForwardAck` al aceptar, quórum inferido).
- **Material retirado:** no se cita `docs/superpowers/`, `mockup/`, `preview/` ni `new interfaz/`; la
  UI vigente no es `web/public/operador.html`.
- **Cifras vigentes:** 11 servicios Docker, 78/78 C++, 75 JavaScript, 5/5 `test:infra`, 3/3 nodos de
  firmware; no se usan las cifras antiguas (4 servicios, 41 pruebas, 133 ítems, término 1 fijo).
  `VERSION` y el tag `v1.0.0-rc1` todavía muestran cifras de la Fase 3: se declaran como artefactos
  históricos de la versión y se remiten a `README.md`; no se modificaron.

---

## 4. Pendientes que dependen del usuario

| Pendiente | Dependencia |
|---|---|
| Datos personales de la portada del documento y formato institucional | Usuario |
| Grabación y entrega del video | Usuario |
| Repetición de T1 y autorización de T2+ | Contactor revisado, hardware y autorización |
| Visibilidad o archivo del repositorio remoto | `origin` ya existe y es privado (`https://github.com/sebas-archive/alerta-sismica-raft-esp32.git`, `origin/main` = `0ee5ed4`); decidir si se mantiene privado, se publica o se archiva |
| Tag de `HEAD` | Decidir si se deja el tag histórico `v1.0.0-rc1` (49 commits atrás), se crea uno nuevo en `0ee5ed4` o se mueve |
| Clave antigua del portal | No está en el historial alcanzable del repositorio (sustituida por `[REDACTADO]`); retirar o regrabar los *bundles* externos de `/home/t1an/respaldos/` antes de compartir |

El detalle está en `10-informes-fase3/pendientes.md`.

---

## 5. Verificación final realizada

- [x] Estructura de la entrega revisada: `00-LEEME.md`, `00-CHECKLIST-ENTREGA.md` y las carpetas
      `01` a `12` existen y no hay carpetas vacías injustificadas.
- [x] Documento técnico: 19 apartados en Markdown, figuras existentes.
- [x] Código: el repositorio en el commit `0ee5ed4`, sin ZIP, sin secretos ni `.env`.
- [x] Diagramas: 14 `.puml`, 14 `.svg` y 14 `.png`.
- [x] Inventario de evidencias actualizado y coherente con los archivos reales.
- [x] Presupuesto: sumas cuadran (256.214 COP; 77,42 USD; factura Electronilab + plan Claro).
- [x] Video: publicado en https://youtu.be/YlzKwWkXzaw; guiones internos retirados.
- [x] Fechas y versión consistentes: 2026-11-18, commit `0ee5ed4`, `v1.0.0-rc1`, licencia MIT.
- [x] Manual final: `12-manual-instalacion/` con README, diez capítulos Markdown, 17 figuras con
      fuente y 45 tablas; inventario documentado.
- [x] Sin referencias a material retirado ni a rutas inexistentes en los documentos de la entrega.
