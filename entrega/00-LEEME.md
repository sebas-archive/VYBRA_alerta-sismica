# Entrega — proyecto "Alerta Sísmica"

Esta carpeta reúne los **entregables académicos** del proyecto. El código del sistema vive en las
carpetas de primer nivel del repositorio (`firmware/`, `web/`); aquí están el documento, los
diagramas, las evidencias, los registros de pruebas y los informes de validación.

- **Versión de código:** ver `../VERSION` y `00-CHECKLIST-ENTREGA.md`.
- **Estado de la validación:** `10-informes-fase3/informe-fase3.md`.
- **Qué falta y por qué:** `10-informes-fase3/pendientes.md`.
- **Cómo se citan las evidencias:** por identificador (`OP-01`, `COD-13`, `RES-03`…), definido en
  `05-pruebas/datos/inventario-evidencias.csv`.

## Mapa de carpetas

| Carpeta | Contenido |
|---|---|
| `01-documento/` | Documento técnico (19 apartados) y figuras |
| `02-codigo/` | Instrucciones del código fuente entregable y snapshot |
| `03-diagramas/` | Fuente PlantUML (`fuente/`) y exportaciones (`exportado/`) |
| `04-evidencias/` | Evidencias reales por categoría A–I |
| `05-pruebas/` | Logs, datos crudos, scripts y hojas de campaña |
| `06-manual/` | Manual de instalación y ejecución |
| `07-presupuesto/` | Presupuesto |
| `08-video/` | Guion y grabación de la sustentación |
| `09-anexos/` | Material complementario |
| `10-informes-fase3/` | Informe de validación, limitaciones y datos para diagramas |

## Categorías de evidencia

| Cat. | Significado | Carpeta |
|---|---|---|
| A | Código fuente (bloques en el informe + CODs) | `04-evidencias/A-codigo/` |
| B | Interfaz de usuario (panel y vista pública) | `04-evidencias/B-interfaz/` |
| C | Ejecución del agregador Node.js | `04-evidencias/C-backend/` |
| D | Nodos ESP32 reales | `04-evidencias/D-nodos/` |
| E | Pruebas automatizadas | `04-evidencias/E-pruebas/` |
| F | Pruebas físicas | `04-evidencias/F-fisicas/` |
| G | Arquitectura y diagramas | `04-evidencias/G-arquitectura/` |
| H | Infraestructura y despliegue | `04-evidencias/H-infraestructura/` |
| I | Resultados y métricas | `04-evidencias/I-resultados/` |

## Regla de oro

Ninguna evidencia de `04-evidencias/` puede ser un mockup, una maqueta ni una captura de material
de diseño histórico. Ese material ya no forma parte del repositorio; si se cita en algún documento,
debe rotularse como registro histórico y no como aplicación entregada.
