# Documento técnico final: fuente y figuras

Carpeta de la versión más extensa del documento técnico. Conserva la fuente Markdown única, el
manifiesto de figuras y las figuras. No contiene Word, PDF, constructor ni render: el documento se
lee directamente en Markdown.

| Archivo | Qué es |
|---|---|
| [`fuente.md`](fuente.md) | Fuente única del documento técnico: 18 apartados, 20 tablas, 122 figuras referenciadas y 21 referencias APA 7 |
| [`manifiesto-figuras.json`](manifiesto-figuras.json) | Pie, ruta, grupo y SHA-256 de cada figura |
| [`figuras/`](figuras/) | Figuras del documento: diagramas PlantUML exportados, capturas reales y fotos del montaje |

## Cómo leerlo

Abra [`fuente.md`](fuente.md). Las figuras se referencian con identificadores `FIG-*` y viven en
[`figuras/`](figuras/); los diagramas conservan su fuente `.puml` en
[`../03-diagramas/fuente/`](../03-diagramas/fuente/).

La versión resumida en 19 apartados está en
[`../01-documento/documento-tecnico.md`](../01-documento/documento-tecnico.md).

## Qué se retiró

Se retiraron `VYBRA_documento_final.docx` (15,8 MB), su PDF de 158 páginas, la carpeta `build/`
(constructor y plantilla Word) y `verificacion/` (auditoría del docx). El texto completo sigue en
`fuente.md` y las figuras en `figuras/`; no se perdió contenido, solo el formato de impresión.

El manual de instalación y ejecución es independiente y está en
[`../12-manual-instalacion/README.md`](../12-manual-instalacion/README.md).
