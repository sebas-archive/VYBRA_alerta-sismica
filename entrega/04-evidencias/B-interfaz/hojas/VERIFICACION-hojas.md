# VERIFICACIÓN independiente — hojas de evidencia visual (B-interfaz)

**Verificador:** agente `verificador` (independiente: no participó en la captura ni en la composición).
**Fecha de verificación:** 2026-11-18, ≈12:33–12:45 America/Bogota (posterior a la composición de 12:31).
**Objeto:** las 2 láminas finales, `manifest-hojas.json`, `NOTA-hojas.md` y las capturas fuente.
**Alcance:** auditoría de solo lectura; no se modificó ninguna hoja, captura, manifiesto ni nota. El único
archivo escrito por el verificador es este informe.

**Dictamen: PASS (8/8 puntos del checklist).**
Sin defectos críticos. Se listan observaciones menores al final (ninguna bloqueante).

## Artefactos verificados y hashes

| archivo | dimensiones | bytes | sha256 |
| --- | --- | --- | --- |
| `hoja-01-ADMIN-escritorio-y-movil.png` | 5844×4952 | 2 870 751 | `9caa5b7a3005091df9ab36d029f688b05b382d9b967f279780ad983c89a904fb` |
| `hoja-02-CLIENTE-escritorio-y-movil.png` | 6990×5923 | 4 420 044 | `79e759859e6027e403b62675592a2cfeb5830f88485e4d5bb3e83576152c8763` |
| `manifest-hojas.json` | — | 45 687 | `cc64df90f7309cc89ef5dade5a90adda00b649bb205c5057100d6d4fda2634c0` |

Fuentes: `/tmp/hojas-ui/capturas/admin/` (18 PNG), `/tmp/hojas-ui/capturas/cliente/` (28 PNG),
manifiestos `admin.json` / `cliente.json`, `manifest-hojas.json` y `NOTA-hojas.md`.

## Método

- **Pillow 12.3.0** (Python del harness) para abrir las láminas, calcular geometría, hacer recortes y
  comparar píxeles; **Tesseract 5.5.4** (`eng`) para OCR de cabeceras, pies de foto y pie de página, y
  para el barrido de riesgo sobre las 46 capturas fuente; **`read_image`** para inspección visual a 1:1
  de cabeceras, pie de página, 8 recuadros completos (4 ADMIN + 4 CLIENTE, 2 móviles), pies de foto y
  vistas generales de ambas láminas.
- **Recorte del recuadro:** a partir de `caja` e `imagen_mostrada` del manifiesto, la imagen se localiza
  en `x = caja.x0 + 16 + ((ancho_tarjeta − 32 − ancho_mostrado) // 2)`, `y = caja.y0 + 16`
  (constantes `RELLENO_TARJETA`/`RELLENO_MOVIL = 16` y centrado del script de composición).
- **Comparación de contenido:** fuente abierta y reescalada a `imagen_mostrada` con LANCZOS (el mismo
  algoritmo del compositor), diferencia píxel a píxel con margen interior de 4 px para excluir el marco
  dibujado. Se midió **diferencia media absoluta, diferencia máxima y fracción de píxeles con diff > 2**
  en **los 46 recuadros**, no solo en la muestra mínima de 8.
- **Recuento/coherencia:** validación del manifiesto contra sí mismo, contra `admin.json`/`cliente.json`,
  contra los 46 archivos actuales (sha256 recalculado) y contra el inventario real de vistas de la SPA
  (`web/admin-src/src/App.tsx`, `web/public/cliente/js/cliente-app.js`).
- **Límite del alcance:** no se re-ejecutó el stack Docker. La fidelidad "captura fuente ↔ interfaz real"
  se apoya en (a) los manifiestos con URL/versión/ventana/hora y sus sha256, y (b) la comprobación de que
  los textos y estados visibles (quórum/líder/log, SIMULACRO, "Estoy a salvo", etc.) existen en el código
  de la SPA del repositorio y coinciden con lo declarado.

## Checklist

### 1. Existencia, apertura, formato y peso — PASS

- En `entrega/04-evidencias/B-interfaz/hojas/` hay **exactamente los 2 PNG finales**
  (más `generar-hojas.py`, `manifest-hojas.json`, `NOTA-hojas.md`); no hay PNG sobrantes.
- Ambos abren con Pillow 12.3.0 y cargan completos en modo RGB.
- ADMIN 5844×4952 (ratio 1.1801) y CLIENTE 6990×5923 (ratio 1.1801): **apaisadas**.
- Ancho **≥ 3600 px** en ambas (5844 y 6990). Peso **< 10 MB**: 2,74 MiB y 4,22 MiB.
- No vacías: desviación típica en resolución completa **22,20** (ADMIN) y **38,56** (CLIENTE),
  muy por encima del umbral 5; fracción casi-blanca global 0,891 / 0,840 (el resto es contenido).

### 2. Recuento exacto de recuadros y dispositivos — PASS

- **ADMIN: 18 recuadros = 9 vistas × 2** (9 escritorio + 9 móvil), órdenes 1–9 en ambos dispositivos.
- **CLIENTE: 28 recuadros = 14 vistas × 2** (14 escritorio + 14 móvil), órdenes 1–14 en ambos.
- Cada vista aparece **exactamente 2 veces** (una escritorio y una móvil); **cero** duplicados
  vista+dispositivo y **cero** dispositivos repetidos o faltantes.
- Coincidencia exacta con los manifiestos fuente: los 46 pares (vista, archivo) de `manifest-hojas.json`
  son idénticos a los de `admin.json`/`cliente.json`. Los 46 archivos fuente son distintos entre sí
  (46 sha256 únicos).
- **Ninguna vista falta** contrastado con la SPA real:
  - ADMIN: `Page = "Panorama" | "Sismógrafos" | "Alertas" | "Histórico" | "Clúster Raft" | "Servidores"
    | "Detectores" | "Registros" | "Configuración"` → 9/9 cubiertas y en el mismo orden de navegación.
  - CLIENTE: `VIEWS = [ahora, mapa, detalle, avisos, proteccion, sismografos, prevencion, ajustes,
    historial]` → 9/9 cubiertas, más los 2 estados (alerta a pantalla completa y post-alerta) y las
    subpestañas reales de Historial (alertas/lecturas) y Prevención (Antes/Durante/Después), que dan las
    14 vistas de pantalla de la lámina.
  - Las ausencias conocidas (franja "PRUEBA", diálogo "Ayuda y atajos") están documentadas en
    `NOTA-hojas.md` como elementos que **no existen** en la SPA vigente; no son vistas omitidas.

### 3. Contenido correcto de los recuadros — PASS

- **Los 46 recuadros** (18 ADMIN + 28 CLIENTE) se compararon contra su archivo fuente con el método de
  recorte + reescalado: **diferencia media absoluta = 0,00000, diferencia máxima = 0 y fracción de
  píxeles con diff > 2 = 0,000000 en los 46**. Es decir, cada recuadro es **píxel-idéntico** a su fuente
  (solo el marco de 2 px que dibuja el compositor difiere, y queda fuera del recorte de comparación).
  Con el marco incluido, la diferencia media es ≤ 1,13/255 (≈0,4 %), atribuible al borde que dibuja el
  compositor; nunca a contenido distinto.
- Muestra mínima exigida (8 recuadros; la comparación real fue de 46):

| hoja | recuadro | fuente | mostrada | sha256 (16) | comprobación |
| --- | --- | --- | --- | --- | --- |
| ADMIN | 01 · Panorama — escritorio | `ADM-01-panorama-escritorio.png` | 1400×900 | `d218143acede91a7` | diff 0; quórum/líder/índice y alerta visibles |
| ADMIN | 05 · Clúster Raft — escritorio | `ADM-05-cluster-raft-escritorio.png` | 1400×900 | `507dcf331661960d` | diff 0; "El servidor 1 lidera", términos, log/confirmadas |
| ADMIN | 08 · Registros — móvil | `ADM-08-registros-movil.png` | 462×1000 | `b5492e2294a31f8d` | diff 0; log de consenso en móvil, barra inferior real |
| ADMIN | 09 · Configuración — móvil | `ADM-09-configuracion-movil.png` | 462×1000 | `be5743023530750d` | diff 0; última tarjeta de la tira completa (sin corte) |
| CLIENTE | 02 · Alerta a pantalla completa — escritorio | `CLI-02-alerta-pantalla-completa-escritorio.png` | 1400×900 | `36834836e6048cec` | diff 0; "SIMULACRO", "ALERTA SÍSMICA", pasos 1-2-3 |
| CLIENTE | 03 · Estado posterior a "Estoy a salvo" — escritorio | `CLI-03-estado-post-alerta-escritorio.png` | 1400×900 | `6dec6e73523bddff` | diff 0; "Dos sismógrafos coincidieron", CONFIRMADO/SIMULACRO |
| CLIENTE | 02 · Alerta a pantalla completa — móvil | `CLI-02-alerta-pantalla-completa-movil.png` | 428×926 | `1adbc906a24d1c83` | diff 0; pantalla de alerta móvil completa |
| CLIENTE | 07 · Mapa — móvil | `CLI-07-mapa-movil.png` | 428×926 | `3ddc8b86772508f7` | diff 0; mapa, sismógrafos S1-S2-S3, "Ver detalles" |

- **Inspección visual (`read_image`)** de las 2 vistas generales, 2 cabeceras, 2 pies de página,
  8 recuadros completos (los de la tabla) y 4 pies de foto a 1:1: la escena de cada recuadro coincide con
  la fuente, sin recuadros cruzados ni imágenes de otra vista. Además, la escena es coherente con el rol
  (ADMIN: quórum/líder/log; CLIENTE: estado de red, alerta, mapa, prevención, ajustes).

### 4. Textos, pies de foto y legibilidad — PASS

- **Cabecera** (OCR y visual): hoja 1 "VYBRA · INTERFAZ ADMIN — evidencia visual · escritorio y móvil",
  "9 vistas · 18 capturas", "2 dispositivos · 3 columnas en escritorio", "todas las vistas · escritorio y
  móvil", chip "ROL · ADMIN". Hoja 2: "INTERFAZ CLIENTE — evidencia visual · escritorio y móvil",
  "14 vistas · 28 capturas", "2 dispositivos · 4 columnas en escritorio", "todas las vistas · escritorio y
  móvil", chip "ROL · CLIENTE". El recuento de la cabecera es el recuento real.
- **Pies de foto:** los 46 textos OCR coinciden con las etiquetas del manifiesto
  `NN · vista — escritorio/móvil` + resolución: escritorio "1400×900" (Servidores "1400×1200", ver
  observación O2); móvil "móvil 390×844 · PNG 780×1688". Etiquetas exactas verificadas también de forma
  programática (46/46 sin discrepancias). Legibilidad comprobada a escala 1:1.
- **Sin solapes:** 0 solapes entre recuadros; huecos mínimos reales 26 px horizontal y 44 px vertical.
  **Sin recuadros cortados:** contenido dentro de los márgenes (≥100 px laterales; última tarjeta móvil
  de ADMIN a 384 px del borde derecho, completa). **Sin recuadros vacíos:** desviación típica mínima de
  la zona de imagen 19,63 (ADMIN) / 21,39 (CLIENTE). Los pies de foto quedan dentro de su tarjeta (ningún
  texto a <6 px del borde ni desbordando por abajo) y separados de la imagen.
- Las láminas usan la misma retícula alineada al margen; la fila incompleta final del CLIENTE (13–14) va
  centrada, como describe la nota de método.

### 5. Pie de página (trazabilidad y aviso de demostración) — PASS

OCR y lectura visual del pie de ambas láminas, texto completo:

> Stack Docker real · http://127.0.0.1:8095 · capturas 2026-11-18 (America/Bogota) · commit 0ee5ed4 ·
> eventos y alertas de demostración generados por el software; no son la campaña física.

Y a la derecha: "VYBRA · hoja 01 / 02 · ADMIN · panel de operación" (hoja 1) y
"VYBRA · hoja 02 / 02 · CLIENTE · vista pública" (hoja 2). El commit `0ee5ed4` coincide con el HEAD del
repositorio (`0ee5ed4a626c28904db55ab6e436e040c03f046c`, 2026-11-18 10:58 -05).

### 6. Coherencia del manifiesto y sha256 — PASS

- `manifest-hojas.json` declara **46 recuadros** (18 + 28) y `discrepancias: []` (0). Sus campos
  `vistas`/`capturas`/`recuadros`/`dimensiones` coinciden con las láminas reales.
- **Recalculados los 46 sha256** de los archivos fuente actuales: **46/46 coinciden** con el manifiesto.
  Además, los campos `vista`, `archivo`, `orden` y `capturado_en` coinciden con `admin.json`/`cliente.json`.
- Los 28 sha256 de `cliente.json` también coinciden con sus 28 archivos actuales (comprobación extra).
- No hay recuadros repetidos ni archivos fuente repetidos (46 archivos, 46 sha256 únicos).

### 7. Frescura y estados reales clave — PASS

- **Fechas de captura hoy 2026-11-18, hora de Bogotá:** ADMIN `12:28:56 → 12:29:37`;
  CLIENTE `12:16:57 → 12:19:23`, justo en las ventanas exigidas (12:28–12:29 y 12:16–12:19). Los mtime de
  los 46 PNG fuente caen en esas mismas ventanas (mín. 12:16:57, máx. 12:29:37) y el manifiesto se generó
  a las 12:31:37. Las horas visibles dentro de las capturas son coherentes (p. ej. "Conectado, 12:28:55"
  en Panorama, "Conectado, 12:29:04" en Clúster Raft, "12:16" en el estado post-alerta del CLIENTE).
- **ADMIN — estados reales presentes:** quórum "Disponible / 3/3 conectados", líder "Servidor 1 / Término
  3" e índice de confirmación 17 (Panorama); "El servidor 1 lidera", término 3, línea temporal del
  consenso y "Replicación del log 17/17 · Log/confirmadas 17/17" en las tres tarjetas (Clúster Raft);
  "Integridad del log verificada", "Log de consenso" con entradas 17…3 y "Confirmada por mayoría"
  (Registros). Todo ello legible en las láminas.
- **CLIENTE — alerta y post-alerta:** alerta a pantalla completa con rótulo **SIMULACRO**, "ALERTA
  SÍSMICA", "Agáchate, cúbrete y sujétate", "Intensidad VI", "Estoy a salvo", en escritorio y en móvil;
  estado posterior a "Estoy a salvo" con "Dos sismógrafos coincidieron", "CONFIRMADO / SIMULACRO", VI y
  "Ver la alerta" (escritorio y móvil).

### 8. Riesgo de entrega (PII, rutas internas, depuración, marcadores) — PASS

- OCR de las 46 capturas fuente (contenido idéntico al de las láminas) más cabeceras/pies de las hojas:
  **0 correos**, **0 rutas absolutas internas** (`/tmp`, `/home`, etc.), **0 rastros de depuración**
  (TODO/FIXME/stack trace/undefined/NaN/console), **0 marcadores tipo lorem/dummy/preview**. Las únicas
  coincidencias de "todo"/"prueba" son texto legítimo de la UI ("Todos los sistemas operativos",
  "Pruebas y órdenes", "Pruebas" como categoría real de datos).
- No se ven nombres de personas, teléfonos ni datos personales. La URL `127.0.0.1:8095` de cabecera y pie
  es intencional (trazabilidad exigida). El mapa del CLIENTE muestra etiquetas públicas de
  OpenStreetMap (discrepancia ya documentada en `NOTA-hojas.md`), no datos personales.

## Observaciones menores (no bloqueantes)

1. **O1 — `origen` del CLIENTE vacío en el manifiesto:** la entrada CLIENTE tiene `origen: null`, mientras
   que ADMIN incluye una cadena descriptiva. La trazabilidad equivalente sí está en `notas` y en
   `NOTA-hojas.md`; no afecta a contenido ni a recuentos.
2. **O2 — resolución del pie de "Servidores" (ADMIN):** el pie dice "escritorio 1400×1200", que es la
   resolución nativa/lógica de esa captura, pero la imagen se muestra a 1050×900 (altura común de fila,
   sin recortar). Está explicado en `NOTA-hojas.md`; no es un error, pero el pie no indica el tamaño
   mostrado.
3. **O3 — formato del pie móvil:** en móvil el dispositivo y la resolución van en una segunda línea
   ("móvil 390×844 · PNG 780×1688") en vez de "— móvil" en línea; semánticamente completo y legible.
4. **O4 — tamaño tipográfico relativo:** cabecera y pie usan 21–25 px sobre láminas de ~5900–7000 px de
   ancho; a 1:1 son nítidos y legibles, pero pequeños en miniaturas. Aceptable para una lámina de alta
   resolución.
5. **O5 — mapa del CLIENTE con Leaflet/OpenStreetMap:** se ve "Leaflet | © OpenStreetMap"; es una
   discrepancia documentada frente a `README.md` §7, no un defecto de las láminas.

## Veredicto

**PASS.** Los 8 puntos del checklist se cumplen: existen exactamente 2 PNG apaisados, pesados y no
vacíos; los recuentos son exactos (ADMIN 9×2 = 18, CLIENTE 14×2 = 28, sin faltas ni duplicados); los 46
recuadros coinciden **píxel a píxel** con sus fuentes actuales; cabeceras, pies de foto y pie de página
son correctos y legibles sin solapes ni cortes; el manifiesto declara 46 recuadros con 0 discrepancias y
sus 46 sha256 se recalculan y coinciden; las capturas son frescas de hoy en las ventanas indicadas e
incluyen los estados reales pedidos; y no hay PII, rutas internas, depuración ni marcadores de prueba.
No se ha corregido nada: no hay defectos que corregir.
