# Documento técnico (Markdown)

Documento técnico completo del proyecto en Markdown, sin Word ni PDF. Contiene los 19 apartados de
la rúbrica: introducción, problema, justificación, objetivos, marco conceptual, requisitos,
arquitectura, componentes, implementación, tolerancia a fallos, seguridad, pruebas, despliegue,
resultados, presupuesto, conclusiones, referencias y anexos.

| Archivo | Qué es |
|---|---|
| `documento-tecnico.md` | Documento completo, listo para leer en el repositorio |
| `figuras/` | Figuras del documento: diagramas PlantUML exportados y capturas reales |

## Cómo leerlo

Abra [`documento-tecnico.md`](documento-tecnico.md). Las figuras están referenciadas desde el
texto y viven en [`figuras/`](figuras/). Los diagramas conservan su fuente `.puml` en
[`../03-diagramas/fuente/`](../03-diagramas/fuente/).

## Qué se retiró

Se retiraron `documento-tecnico.pdf` y `documento-tecnico.html`, que eran renders del mismo
contenido. El texto íntegro sigue en el `.md`. La versión más extensa y con control de fuentes
está en [`../11-documento-final/fuente.md`](../11-documento-final/fuente.md).

El manual de instalación es independiente: [`../12-manual-instalacion/README.md`](../12-manual-instalacion/README.md).
