# Checklist de los 8 entregables

Estado al cierre de la Fase 3 (versión candidata `v1.0.0-rc1`).

| N.º | Entregable | Ubicación | Estado | Qué falta |
|---|---|---|---|---|
| 1 | **Documento técnico** | `01-documento/` | **PENDIENTE** | Redactar los 19 apartados. Insumos listos: diagnóstico F1, plan F2, informe F3, `datos-para-diagramas.md` |
| 2 | **Aplicación funcional** | `../firmware`, `../web` | **PARCIAL** | Funciona y está validada en software; falta demostración con las 3 ESP32 |
| 3 | **Código fuente** | `../` (repo) | **COMPLETADO** | `README.md`, `VERSION`, `.gitignore`, tag `v1.0.0-rc1`; falta decisión de licencia y remoto |
| 4 | **Diagrama de arquitectura** | `03-diagramas/` | **PENDIENTE** | Generar 14 PlantUML en Fase 4 con `datos-para-diagramas.md` |
| 5 | **Evidencias de pruebas** | `04-evidencias/` | **PARCIAL** | 13 piezas obtenidas (software/infra); faltan consolas, fotos y métricas físicas |
| 6 | **Manual de instalación y ejecución** | `06-manual/`, `../README.md`, `../docs/prueba-hardware.md` | **COMPLETADO** (borrador sólido) | Convertir a documento final (DOCX/PDF) |
| 7 | **Video de sustentación** | `08-video/` | **PENDIENTE** | Guion y grabación |
| 8 | **Presupuesto** | `07-presupuesto/` | **PENDIENTE** | Requiere precios reales del usuario |

## Criterios de coherencia entre entregables

- Versión citada en todos: `v1.0.0-rc1` → `v1.0.0` tras la campaña física.
- El pulsador se describe siempre como **simulador de eventos**, nunca como sensor.
- Las capturas `cap-REF-*` llevan rótulo de "clúster simulado"; no se usan como prueba física.
- Las limitaciones de `README.md` §10 y del informe F3 §H deben repetirse en el documento técnico.
