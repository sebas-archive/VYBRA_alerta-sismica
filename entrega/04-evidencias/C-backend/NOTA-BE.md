# NOTA — Evidencia de backend (BE-01…BE-10)

Fecha de la evidencia: **2026-11-18, 11:33–11:42 America/Bogota**, commit `0ee5ed4`.

| Archivo | Qué demuestra | Entorno usado |
|---|---|---|
| `log-BE-01-cluster-falso.txt` | `npm run fake` arranca 3 nodos falsos y responde `/estado` (sin Raft: término y líder fijos) | Namespace de red propio (`unshare -rn`) porque los puertos 9001–9003 del host los publica el stack real |
| `log-BE-02-arranque-panel.txt` | Arranque de `node server.js` y sus líneas "Panel: … / Vista pública: …" y la indicación de firewall | Panel del repositorio en el puerto 8090 (sin Docker). IP del PC saneada como `[IP-PC]` |
| `cap-REF-BE-03-api-estado.png` | JSON de `GET /api/estado` en el navegador | Stack real `sismo` en 8095 |
| `log-BE-04-sse.txt` | Flujo SSE de `/api/stream` con marcas de tiempo: eventos `estado` y latido `vivo` cada 5 s | Stack real en 8095 |
| `cap-REF-BE-05-panel-terminal.png` | **Composición rotulada**: captura real del panel + salida real de `docker compose ps`, `curl /api/estado` y `docker compose logs panel` | Stack real en 8095 |
| `log-BE-06-control-caer.txt` | `POST /control {"accion":"caer"}` → `{"ok":true,"caido":true}`, verificación directa del nodo y `recuperar` → `{"ok":true,"caido":false}` | Stack aislado `vybraint` (panel 18095), para no alterar el stack `sismo` |
| `log-BE-07-pulsar.txt` | `POST /pulsar` al líder → `resultado:"aceptada"`; a un seguidor → `"pendiente"`; log 3/3 y alerta 5.5 | Stack aislado `vybraint` |
| `log-BE-08-errores-api.txt` | Respuestas 415 (sin JSON), 413 (>4 KB) y 404 (nodo fuera de 1-3) del panel | Stack real en 8095 (peticiones rechazadas, sin cambios de estado) |
| `log-BE-09-sse-dom.txt` | Correlación entre el evento `estado` de SSE y el texto del DOM: líder S1, término 3, log 9 de 9 | Stack real en 8095 |
| `log-BE-10-servidor.txt` | Log de arranque del contenedor `sismo-panel` | Stack real en 8095 |

Aclaraciones:

- BE-06 y BE-07 se ejecutaron sobre el proyecto compose **aislado `vybraint`** (panel 18095, efímero,
  destruido después) siguiendo la indicación de no modificar el stack `sismo`. Los logs lo indican.
- Todos los datos de clúster son reales del software; los eventos/alertas añadidos son de demostración.
- `cap-REF-BE-05-panel-terminal.png` es una composición de dos evidencias reales y está rotulada como tal
  en la propia imagen (no es una captura única de pantalla).
