# Aviso de material histórico retirado

La entrega corresponde al estado actual del repositorio (commit `0ee5ed4`, 2026-11-18). El material
de diseño y planificación de versiones anteriores fue **retirado** del repositorio y **no forma parte
de la aplicación entregada**. Por tanto, no se cita ni se usa como evidencia.

## 1. Material retirado

| Elemento retirado | Qué era | Por qué no se cita |
|---|---|---|
| `docs/superpowers/` | Planes, prompts y notas internas de trabajo de versiones anteriores | No es documentación del sistema entregado; se eliminó del repositorio |
| `mockup/` | Maquetas de la interfaz | No es la aplicación real; la Regla de oro prohíbe usarlo como evidencia |
| `preview/` | Previsualizaciones del diseño | Enlaces rotos y nombre antiguo; se eliminó del repositorio |
| `new interfaz/` | Carpeta de diseño intermedia | No existe; su contenido nunca formó parte de la versión estable |
| `figma/`, `capturas/` | Exportaciones y capturas locales de trabajo | Material de trabajo, no evidencias del sistema; están ignorados por Git |
| Empaquetado antiguo de la UI de operador | Página `web/public/operador.html` | Queda solo como **fallback** si no existe la SPA; la UI vigente es `web/public/admin/` |

El retiro se hizo en el commit `0ee5ed4` («chore: retira material de diseño histórico, prompts y
planes internos»), que es el commit entregado.

## 2. Consecuencias

- **Ninguna evidencia de `entrega/04-evidencias/` es un mockup, una maqueta ni una captura de
  material de diseño histórico.** Las capturas de interfaz son del stack real actual.
- Las capturas cuyo nombre empieza por `cap-REF-` corresponden al **stack Docker real** (los 11
  servicios con Raft real), no al clúster físico ni a maquetas. Los datos de demostración que
  muestran están identificados en
  [`entrega/04-evidencias/B-interfaz/NOTA-capturas-REF.md`](../04-evidencias/B-interfaz/NOTA-capturas-REF.md).
- Si algún documento menciona material histórico, debe rotularlo expresamente como registro
  histórico y **no** como aplicación entregada. En esta entrega no se hace esa cita.
- El material de diseño histórico era material propio del proyecto, pero ya no forma parte del
  repositorio (véase también `THIRD-PARTY.md`).

## 3. Qué sí es la aplicación entregada

- **ADMIN:** SPA construida desde `web/admin-src/` y servida en `/admin/` (la raíz `/` redirige a
  `/admin/`).
- **CLIENTE:** SPA servida en `/cliente/` (la ruta `/publico` redirige a `/cliente/`).
- **Nodos:** firmware de `firmware/detector/` para las ESP32 reales y `web/nodo-sim/` para el nodo
  simulado con el mismo núcleo Raft.
- **Backend:** `web/server.js`, `web/poller.js`, `web/servidor/` y `web/controlador/`.

El código entregado es el del repositorio en el commit `0ee5ed4`; la guía de verificación está en
`entrega/02-codigo/README.md`.
