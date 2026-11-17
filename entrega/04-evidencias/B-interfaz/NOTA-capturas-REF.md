# Aviso sobre las capturas `cap-REF-*`

Las imágenes `cap-REF-*.png` de esta carpeta fueron tomadas en la **Fase 3** con el panel real
(`web/server.js`) servido desde los contenedores Docker, es decir **con los nodos simulados**
(`web/fake/nodo-solo.js`), no con las placas ESP32.

| Archivo | Qué muestra | Condición |
|---|---|---|
| `cap-REF-OP-05-raft.png` | Pestaña Clúster Raft: líder S1, término 1, 3/3, timeline | Nodos **simulados** |
| `cap-REF-OP-08-detectores.png` | Pestaña Detectores con mapa y tarjetas | Nodos **simulados** |
| `cap-REF-OP-11-alertas.png` | Alertas con la alerta precargada por el clúster falso | Alerta **precargada**, no formada por consenso |
| `cap-REF-OP-12-registros.png` | Registros / log de consenso | Nodos **simulados** |
| `cap-REF-OP-03-sismografos.png` | Pestaña Sismógrafos | Trazas sintéticas declaradas por la propia UI |
| `cap-REF-CLI-01-publico.png` | Vista pública | Sismo **precargado** con etiqueta SIMULACRO |
| `cap-REF-OP-18-movil.png` | Panel en 390×844 | Nodos **simulados** |
| `cap-REF-BE-03-api-estado.png` | JSON de `/api/estado` | Nodos **simulados** |

**Uso permitido:** evidencia de que la interfaz y el agregador existen y funcionan (UI real, datos
reales del agregador, servidos por el código real).

**Uso prohibido:** presentarlas como capturas del clúster físico, de reelección o de una alerta
formada por consenso real. Esas capturas son las `OP-01…OP-19` y `CLI-01…CLI-12` del inventario y
se obtendrán en la campaña física con las tres ESP32 conectadas.
