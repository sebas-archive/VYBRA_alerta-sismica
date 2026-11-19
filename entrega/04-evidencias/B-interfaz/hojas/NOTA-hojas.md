# NOTA — Hojas de evidencia visual (B-interfaz)

Láminas PNG de alta resolución con **todas las vistas de cada rol**, en escritorio y
en móvil, con cabecera, pie de foto por captura y pie de trazabilidad.

## Archivos de esta carpeta

| archivo | contenido |
| --- | --- |
| `hoja-01-ADMIN-escritorio-y-movil.png` | ADMIN · 9 vistas · 18 capturas · 5844×4952 px |
| `hoja-02-CLIENTE-escritorio-y-movil.png` | CLIENTE · 14 vistas · 28 capturas · 6990×5923 px |
| `generar-hojas.py` | script reproducible de composición (Pillow) |
| `manifest-hojas.json` | mapeo recuadro → archivo fuente + sha256 |

## Contexto y trazabilidad

- Stack Docker real en ejecución en `http://127.0.0.1:8095` (ADMIN en `/admin/`, CLIENTE en
  `/cliente/`; la ruta `/publico` redirige a `/cliente/`).
- Commit de la evidencia: `0ee5ed4`. Zona horaria: America/Bogota.
- Fecha de composición de las láminas: 2026-11-18 12:31 -05.
- **ADMIN**: 9 vistas / 18 capturas · capturas 2026-11-18 12:28:56 → 2026-11-18 12:29:37. Fecha del manifiesto: 2026-11-18T12:29:37-05:00.
- **CLIENTE**: 14 vistas / 28 capturas · capturas 2026-11-18 12:16:57 → 2026-11-18 12:19:23. Fecha del manifiesto: 18/11/2026 12:19:18.

Alertas de demostración generadas por el software durante la sesión de capturas:
alerta id 11 (18/11/2026 12:16:57) y alerta id 13 (18/11/2026 12:17:43). Proceden de pulsaciones reales `POST /api/nodos/N/pulsar` sobre el
stack y no son la campaña física; el pie de página de cada lámina lo advierte.

Origen declarado por los capturadores:

- Stack Docker real en ejecución en http://127.0.0.1:8095 (11 servicios); datos reales del clúster Raft y de las 3 bases PostgreSQL (alertas de demostración del 2026-11-18). Sin recarga posterior ni edición de las imágenes.

## Método de composición

- Pillow 12.3.0 sobre el Python del harness:
  `/home/t1an/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/bin/python3`.
- Fuentes del sistema: DejaVu Sans (regular/bold).
- Paleta tomada de `web/public/tokens.css`: lienzo `#f6f6f3`, superficie `#ffffff`,
  borde `#dbe2e6`, textos `#17212a` / `#4d5b66` / `#6b7883`, marca `#0e6a76`.
- Hojas apaisadas, ancho ≥ 3600 px, con bandas (cabecera, secciones, rejilla, pie)
  alineadas al mismo margen; la fila incompleta final se centra.
- Las capturas se escalan **sólo hacia abajo** (nunca por encima de su tamaño
  nativo) y de forma proporcional. En escritorio se usa una altura común de imagen
  (sin recortar; las de otra proporción quedan enmarcadas) y en móvil se parte del
  tamaño lógico CSS, indicando el tamaño del PNG cuando el original está a DPR 2.
- Pie de foto: número de orden · nombre de vista · dispositivo · resolución.
- Se verifica al guardar que el PNG abre, que sus dimensiones son las calculadas
  y que cada recuadro se dibujó a partir de un archivo real (sha256 en el manifiesto).

## Recuento

| hoja | rol | vistas | capturas | recuadros | dimensiones | apaisada |
| --- | --- | --- | --- | --- | --- | --- |
| `hoja-01-ADMIN-escritorio-y-movil.png` | ADMIN | 9 | 18 | 18 | 5844×4952 | sí |
| `hoja-02-CLIENTE-escritorio-y-movil.png` | CLIENTE | 14 | 28 | 28 | 6990×5923 | sí |

## Discrepancias y avisos automáticos

- Ninguna automática: los manifiestos, los archivos y las dimensiones coinciden;
  todas las vistas tienen captura de escritorio y de móvil.

## Discrepancias documentadas por los capturadores

Anotadas en los manifiestos y heredadas de `NOTA-capturas-REF.md`; no se inventó
ninguna captura para cubrirlas:

- **SIMULACRO sin franja "PRUEBA"**: la pantalla de alerta del CLIENTE rotula siempre
  SIMULACRO; la SPA vigente no incluye franja PRUEBA.
- **Sin diálogo "Ayuda y atajos"**: el inventario original lo menciona, pero la SPA
  vigente no lo tiene; por eso no aparece en las láminas.
- **Leaflet + teselas de OpenStreetMap**: el mapa del CLIENTE usa Leaflet/OSM, mientras
  `README.md` §7 afirma "mapa SVG propio (sin Leaflet ni teselas externas)".
- **"Ver telemetría" oculto en móvil**: el botón de escritorio no está en móvil; se
  llegó a Sismógrafos desde el enlace real "Ver todo" (misma acción `open-sensors`).
- **ADMIN móvil**: la barra inferior real tiene 8 secciones (sin Configuración);
  Configuración se abre con el engranaje real de la barra superior.
- **ADMIN sin rutas por URL**: la SPA cambia de vista por estado React; todas las
  capturas quedan en `/admin/` y la vista se identifica por el campo "vista".
- **Servidores (ADMIN)**: única captura de escritorio a 1400×1200, para mostrar las tres
  tarjetas completas; en la lámina se muestra a 1050×900 (altura común de fila), sin
  recortar contenido.

## Reproducción

```bash
python3 generar-hojas.py \
    --manifiesto-dir /tmp/hojas-ui/capturas \
    --capturas-dir  /tmp/hojas-ui/capturas \
    --salida        .
```

El script aborta si falta una vista, un dispositivo o un archivo: no inventa recuadros.
