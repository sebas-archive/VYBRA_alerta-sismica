# Pendientes del usuario y decisiones abiertas

Actualizado al cierre de la Fase 3. **Nada de esta lista se ha inventado.**

## 1. Bloqueante para la campaña física (Etapa D/E)

| # | Pendiente | Por qué |
|---|---|---|
| P-1 | **Conectar las tres ESP32 al equipo**, una a la vez para el primer flasheo | Sin puerto serie no se puede flashear ni leer consola. Ver `06-manual/conexion-esp32.md` |
| P-2 | Confirmar el **SSID y la contraseña** de la red WiFi 2.4 GHz donde estarán las placas | El SSID está en `config.h`; la contraseña en `secretos.h` (no versionado) |
| P-3 | Confirmar que el router **no aísla clientes** (AP isolation desactivado) y permite broadcast | El descubrimiento entre nodos usa broadcast UDP 4211 |
| P-4 | Ejecutar los casos que requieren **acción física** (pulsar, desenchufar, reiniciar el router) | No son automatizables desde software |

## 2. Datos académicos (bloquean el documento final, no la fase técnica)

| # | Dato | Uso |
|---|---|---|
| A-1 | Institución, programa y asignatura | Portada (§1) |
| A-2 | Nombre del docente | Portada (§1) |
| A-3 | Integrantes (nombres completos) | Portada (§1) |
| A-4 | Fecha de entrega | Portada (§1) |
| A-5 | Título oficial del proyecto | Portada (§1) y video |
| A-6 | Rúbrica/plantilla institucional, extensión y formato de citas | Forma del documento |

## 3. Decisiones abiertas

| # | Decisión | Opciones | Estado |
|---|---|---|---|
| D-1 | **Licencia y titularidad** | (a) Sin licencia explícita (todos los derechos reservados); (b) MIT; (c) GPL-3.0; (d) CC BY-NC-SA para el documento | **Pendiente**. No se creó `LICENSE` para no inventar titularidad |
| D-2 | Repositorio remoto (GitHub/GitLab) | Publicar o entregar solo local | **Pendiente**. No se hizo `git push` |
| D-3 | `preview/`, `mockup/`, `new interfaz/` | Excluir de la versión o conservar como anexo de diseño rotulado | **Resuelta el 2026-11-18**: excluido de la entrega; el material de diseño histórico se retiró del repositorio |
| D-4 | Corregir la semántica de "quórum" del agregador | Renombrar en la UI ("nodos con líder común") o recalcular mayoría real | **Pendiente**; documentado como limitación |
| D-5 | Clave del portal rotada | Ya rotada en `secretos.h` (16 caracteres, fuera de git). La clave antigua sigue en el historial de git desde el commit `7cd7f53` | **Documentado**. Si el repositorio se comparte, considerar reescritura de historial |

## 4. Limitaciones técnicas aceptadas (no se corrigen en esta fase)

Se documentan en `../README.md` §10 y en `informe-fase3.md` §H:
log en RAM, resincronización de emergencia, tope de 1000 entradas, sin autenticación/TLS, sin
pre-vote ni check-quorum, `ForwardAck` al aceptar, demo Docker que no ejecuta Raft.
