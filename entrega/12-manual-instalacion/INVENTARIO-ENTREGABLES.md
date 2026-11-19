# Inventario de entregables del manual

Estado al 2026-11-18. El manual se entrega **solo en Markdown y figuras**: no hay Word, PDF,
PowerPoint, Excel, video ni archivos comprimidos. Todo lo que se lee está en `.md`; todo lo que se
mira está en PNG con su fuente editable al lado.

## Archivos principales

| Archivo | Formato | Contenido | Se commitea |
|---|---|---|---|
| `README.md` | Markdown | Portada, índice de capítulos, figuras, datos clave y límites | Sí |
| `fuente-manual.md` | Markdown | Unión exacta de las diez secciones (4.014 líneas) | Sí |
| `secciones/00-resumen.md` a `09-anexos.md` | Markdown | Fuente de verdad de cada capítulo | Sí |
| `manifiesto-figuras-manual.json` | JSON | 17 figuras con ruta y pie | Sí |
| `figuras/**/*.png` | PNG | Figuras del manual | Sí |
| `figuras/**/*.svg`, `*.py`, `*.puml` | Fuente | Código editable de las figuras | Sí |
| `VERIFICACION.md` | Markdown | Comprobaciones de estructura, figuras y datos | Sí |

## Figuras

| ID | PNG | Fuente | Peso aproximado |
|---|---|---|---|
| FIG-MON-01 | `figuras/montaje/FIG-MON-01-plano-protoboard.png` | `.svg` | 450 KB |
| FIG-MON-02 | `figuras/montaje/FIG-MON-02-pulsador.png` | `.svg` | 280 KB |
| FIG-MON-03 | `figuras/montaje/FIG-MON-03-tres-protoboards.png` | `.svg` | 330 KB |
| FIG-MON-04 | `figuras/montaje/FIG-MON-04-prototipo-real.png` | evidencia FIS-03a | 1,5 MB |
| FIG-ARQ-M01 | `figuras/arq/FIG-ARQ-M01-arquitectura-mecanismos.png` | `.svg` + `.py` | 400 KB |
| FIG-ARQ-M02 | `figuras/arq/FIG-ARQ-M02-despliegue-docker.png` | `../03-diagramas/fuente/D-02-despliegue-docker.puml` | 180 KB |
| FIG-ARQ-M03 | `figuras/arq/FIG-ARQ-M03-secuencia-evento-alerta.png` | `../03-diagramas/fuente/D-09-secuencia-evento-alerta.puml` | 180 KB |
| FIG-FW-01 | `figuras/firmware/FIG-FW-01-flujo-loop-evento.png` | `.puml` | 450 KB |
| FIG-EV-01 a 09 | `figuras/pruebas/*.png` | capturas reales de `04-evidencias/` | 2,5 MB en total |

## Secciones y tamaño

| Sección | Líneas | Tema |
|---|---:|---|
| `00-resumen.md` | 44 | Resumen, ficha y correspondencia con los criterios |
| `01-introduccion.md` | 73 | Propósito, público y límites |
| `02-requisitos.md` | 181 | PC, software, red, puertos y checklist |
| `03-montaje.md` | 330 | Protoboard, pines, pasos y verificación |
| `04-arquitectura.md` | 157 | Criterio 4: componentes y comunicación |
| `05-evidencias.md` | 319 | Criterio 5: pruebas y campaña física |
| `06-firmware.md` | 2.143 | Firmware real explicado bloque por bloque |
| `07-instalacion-ejecucion.md` | 379 | Docker, `.env`, paneles y modos |
| `08-operacion-soporte.md` | 231 | Operación, failover y problemas |
| `09-anexos.md` | 176 | Comandos, pinout, glosario y evidencias |

## Qué no se incluye

| Formato retirado | Motivo | Dónde está el contenido |
|---|---|---|
| `.docx` del manual | El usuario pidió solo Markdown | `fuente-manual.md` y `secciones/` |
| `.pdf` del manual | Era el render del Word | `README.md` y capítulos |
| `.pptx` de sustentación | Formato Office no permitido | `../08-video/README.md` con el video publicado |
| `.xlsx` y `.pdf` del presupuesto | Formato binario no permitido | `../07-presupuesto/presupuesto.md` y `presupuesto.csv` |
| Video `.mp4` | No forma parte del repositorio | https://youtu.be/YlzKwWkXzaw |
| ZIP del código | El código ya está en el repositorio | `../02-codigo/README.md` |

## Cómo leer y mantener

- Para leer el manual, abra `README.md` y siga los enlaces del índice.
- Para corregir un capítulo, edite el archivo de `secciones/` y vuelva a unir con el orden del
  índice: `cat secciones/00-resumen.md secciones/01-introduccion.md ...` produce de nuevo
  `fuente-manual.md`.
- Para corregir una figura, edite su fuente (`.svg`, `.py` o `.puml`) y regenere el PNG.
- No hay que compilar nada para entregar: el repositorio se lee tal cual.
