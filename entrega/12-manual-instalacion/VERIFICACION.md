# Verificación del manual en Markdown

Comprobaciones ejecutadas el 2026-11-18 sobre la carpeta `entrega/12-manual-instalacion/`. No hay
Word ni PDF: el manual se valida como Markdown y como conjunto de figuras.

| Comprobación | Resultado |
|---|---|
| `fuente-manual.md` es la concatenación exacta de las 10 secciones | Correcto: 3.995 líneas |
| Directivas de figura `[[FIG:...]]` | 17, todas con entrada en el manifiesto |
| Referencias `{{FIG:...}}` | 17, todas resuelven a una figura existente |
| Figuras del manifiesto | 17 de 17; ningún archivo faltante |
| Directivas de tabla `[[TABLA:...]]` | 45, sin IDs duplicados |
| Referencias `{{TABLA:...}}` | 43; las 2 tablas sin referencia son de apoyo, no un error |
| Enlaces relativos del README | Resuelven a archivos existentes |
| Rayas largas en la prosa | 0 |
| Menciones a Word o PDF | 0, salvo las notas que explican qué se retiró |
| Figuras con fuente editable | 17 de 17: SVG, PY, PUML o PUML en `03-diagramas/fuente/` |
| Cifras clave | GPIO4/GND, LED GPIO2, latido 500 ms, elección 5000-9000 ms, UDP 4210/4211, HTTP 80, panel 8095, 11 servicios |
| Resultados de prueba | 78/78 C++, 5/5 integración en 79,2 s, p95 1,097 ms |
| Campaña física | P0 completada, T1 no aprobada, T2+ pendientes |
| Secretos | No hay `.env`, `secretos.h`, llaves ni certificados en la carpeta |

## Cómo repetir la verificación

```bash
cd entrega/12-manual-instalacion
# 1. La fuente es la unión de las secciones
cat secciones/00-resumen.md secciones/01-introduccion.md secciones/02-requisitos.md \
    secciones/03-montaje.md secciones/04-arquitectura.md secciones/05-evidencias.md \
    secciones/06-firmware.md secciones/07-instalacion-ejecucion.md \
    secciones/08-operacion-soporte.md secciones/09-anexos.md > /tmp/manual.md
diff <(sed -e '$a\' /tmp/manual.md) <(sed -e '$a\' fuente-manual.md)

# 2. Figuras y tablas declaradas
grep -o '\[\[FIG:[^|]*' fuente-manual.md | sort -u
grep -o '\[\[TABLA:[^|]*' fuente-manual.md | sort -u

# 3. Todas las figuras tienen archivo
python3 -c "import json;print([x['archivo'] for x in json.load(open('manifiesto-figuras-manual.json'))])"
```

## Veredicto

Apto para entrega en Markdown. El contenido técnico, las figuras y las fuentes están completos; los
formatos Word y PDF se retiraron por decisión del usuario.
