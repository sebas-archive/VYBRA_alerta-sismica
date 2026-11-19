# Capturas `cap-REF-*` de `B-interfaz` y `C-backend`

**Fecha de captura:** 2026-11-18, America/Bogota, en **dos tandas**: **11:15–11:19** (primera pasada) y **11:33–11:39** (segunda pasada: vista CLIENTE y estados de ADMIN; véase más abajo).
**Origen:** stack Docker real en ejecución en `http://127.0.0.1:8095` (11 servicios de
`docker-compose.yml`): 3 ESP32 simulados con el **núcleo Raft real** del firmware, 3 PostgreSQL 16,
3 servidores de datos (Fedora 42, openSUSE Leap 15.6, Ubuntu 24.04), panel y controlador.
**Navegador:** Chromium 1248 (Playwright) en modo headless, ventana 1400×900 (móvil 390×844, escala 2)
y zona horaria America/Bogota. **Herramienta:** `playwright-core` sobre el Chromium cacheado; sin
edición posterior de las imágenes.
**Commit del código capturado:** `0ee5ed4` (`0ee5ed4a626c28904db55ab6e436e040c03f046c`), 2026-11-18.

## Qué muestra cada archivo

| Archivo | Vista y contenido |
|---|---|
| `cap-REF-OP-01-panorama.png` | ADMIN → Panorama: aviso real de alerta media confirmada, quórum 3/3, líder S1, índice de confirmación 3, eventos recientes, última alerta y trazas ilustrativas de los eventos reales. |
| `cap-REF-OP-02-sismografos.png` | ADMIN → Sismógrafos con ventana de **5 min**: 4 eventos reales (niveles 6, 5, 7 y 4), etiquetas por detector y franjas de coincidencia de 10 s. |
| `cap-REF-OP-03-alertas.png` | ADMIN → Alertas: bandeja con la alerta y panel de detalle (coincidencia de detectores, promedio 5.5/10, término Raft 3, entrada del log 3, recortes de onda y regla de correlación). |
| `cap-REF-OP-04-historico.png` | ADMIN → Histórico: eventos leídos de las **bases PostgreSQL reales** (servidor / nodo / nivel / PGA / estado), paginación y exportación CSV. |
| `cap-REF-OP-05-raft.png` | ADMIN → Clúster Raft: líder S1, 3 tarjetas con término, log/confirmadas y pendientes, y línea de tiempo del consenso (postulo, voto, gano). |
| `cap-REF-OP-06-servidores.png` | ADMIN → Servidores (1400×1200 para mostrar la tarjeta completa): estado real de cada contenedor de nodo, servidor y base, SO, PostgreSQL, conteos y botones **Apagar servidor**. |
| `cap-REF-OP-07-detectores.png` | ADMIN → Detectores: 3 detectores conectados, última lectura real (0.183 g y 0.155 g), botones de intensidad simulada y actividad reciente. |
| `cap-REF-OP-08-registros.png` | ADMIN → Registros: log de consenso confirmado por mayoría (entradas 1–3 del término 3), con marca de alerta y botón Exportar CSV. |
| `cap-REF-OP-09-configuracion.png` | ADMIN → Configuración: tema, tamaño de letra, animaciones, idioma, formato de hora, escala de intensidad, PGA, ventana y escala de las gráficas. |
| `cap-REF-OP-18-movil.png` | ADMIN → Panorama en móvil 390×844: top bar compacta, KPIs, mapa del clúster y barra de navegación inferior. |
| `cap-REF-CLI-01-publico.png` | CLIENTE (`/publico`, que redirige a `/cliente/`): estado de la red, alerta confirmada con hora e insignias CONFIRMADO/SIMULACRO, sismógrafos en reposo y protección. |
| `C-backend/cap-REF-BE-03-api-estado.png` | `GET /api/estado` del panel en el navegador: quórum, líder, foto de los 3 nodos, log, alertas, sucesos y ubicaciones. |

## Origen de los datos que aparecen

- **Nodos y clúster:** los 3 ESP32 **simulados** en contenedores, cada uno con el **mismo núcleo Raft**
  del firmware compilado para Linux. No son las placas físicas.
- **Eventos y alertas de estas capturas:** se generaron el **2026-11-18** entre las 11:14:57 y las
  11:17:53 mediante `POST /api/nodos/N/pulsar` (el mismo endpoint que usan los botones de intensidad de
  la pestaña Detectores). Se produjeron 4 eventos (niveles 6, 5, 7 y 4) en los nodos simulados 1 y 2,
  que formaron **2 alertas reales** de nivel medio (promedio 5.5/10) por consenso Raft. Los eventos y
  alertas quedaron persistidos en las 3 bases PostgreSQL y son los registros que muestra el Histórico.
  **Son datos de demostración generados por el software, no mediciones sísmicas ni la campaña física.**
- **Datos históricos del 2026-11-17:** corresponden a la campaña física y **no** aparecen en estas
  capturas; se conservan en `04-evidencias/D-nodos/`, `04-evidencias/F-fisicas/` y
  `05-pruebas/datos/FIS-*` (P0 completada y T1 ejecutada pero no aprobada por doble evento del pulsador).

## Archivos antiguos reemplazados

Las capturas de la Fase 3 (`cap-REF-OP-03-sismografos`, `-05-raft`, `-08-detectores`, `-11-alertas`,
`-12-registros`, `-18-movil` y `cap-REF-CLI-01-publico`) se sustituyeron por capturas equivalentes
tomadas contra el stack actual (2026-11-18). **No se conservó la numeración**: el inventario final se
renumeró para que los identificadores sigan el orden de las pestañas y del recorrido de la interfaz.
Mapeo exacto de los archivos renumerados:

| Archivo de la Fase 3 | Archivo actual |
|---|---|
| `cap-REF-OP-03-sismografos.png` | `cap-REF-OP-02-sismografos.png` |
| `cap-REF-OP-11-alertas.png` | `cap-REF-OP-03-alertas.png` |
| `cap-REF-OP-12-registros.png` | `cap-REF-OP-08-registros.png` |
| `cap-REF-OP-08-detectores.png` | `cap-REF-OP-07-detectores.png` |

Los demás archivos (`cap-REF-OP-05-raft.png`, `cap-REF-OP-18-movil.png` y
`cap-REF-CLI-01-publico.png`) conservan su número, con contenido nuevo.

---

## Segunda pasada (2026-11-18, 11:33–11:39): vista CLIENTE y estados de ADMIN

Se añadieron capturas para cerrar las piezas de software que el inventario dejó pendientes:

| Archivo | Vista y contenido | Cómo se obtuvo |
|---|---|---|
| `cap-REF-CLI-02-alerta-fullscreen.png` | CLIENTE: pantalla de alerta a pantalla completa con franja **SIMULACRO**, "Agáchate · Cúbrete · Sujétate", intensidad VI, S1 y S2, cuenta atrás y "Estoy a salvo". | Alerta real generada con dos `POST /api/nodos/N/pulsar` (2475 y 2025 ms) sobre los nodos simulados del stack real; la SPA abre la alerta al recibirla por SSE. |
| `cap-REF-CLI-03-prueba-alerta.png` | CLIENTE: misma pantalla de alerta abierta **manualmente** desde el botón "Ver la alerta" del estado de alerta. | Equivalente actual de "Probar la pantalla de alerta" (`data-action="open-alarm"`). La UI vigente **no tiene franja "PRUEBA"**: la alerta se rotula siempre SIMULACRO. |
| `cap-REF-CLI-04-post-alerta.png` | CLIENTE: estado **posterior** a la alerta (hero "Dos sismógrafos coincidieron", alerta confirmada, cápsula, sismógrafos y protección). | Tras pulsar "Estoy a salvo" en la pantalla de alerta. |
| `cap-REF-CLI-05-historial-lista.png` | CLIENTE → Avisos → Historial: pestañas Alertas confirmadas / Lecturas, periodos 24 h–todo y lista con hora, insignias CONFIRMADO y SIMULACRO. | Datos reales persistidos en las 3 bases PostgreSQL (alertas de demostración de hoy). |
| `cap-REF-CLI-06-mapa.png` | CLIENTE → Mapa (Leaflet + OpenStreetMap): sismógrafos, registro seleccionado y "Ver detalles". | Vista real del stack. |
| `cap-REF-CLI-07-detalle.png` | CLIENTE → Ver detalles: intensidad VI, magnitud Richter 4.8, sismógrafos S1 y S2, fuente, confirmación, ubicación y cómo se confirmó. | Navegación a `#detalle/a-<id>` de la alerta real. |
| `cap-REF-CLI-08-que-hacer.png` | CLIENTE → Prevención (Qué hacer): pestañas Antes / Durante / Después, tres pasos Agáchate/Cúbrete/Sujétate y situaciones. | Navegación desde "Qué hacer si tiembla". |
| `cap-REF-CLI-09-ajustes.png` | CLIENTE → Configuración: idioma, tema, tamaño, escalas y umbrales. | Navegación directa. |
| `cap-REF-CLI-10-movil-inicio.png` | CLIENTE móvil 390×844: Inicio con último registro, mapa y barra inferior. | Viewport móvil (escala 2). |
| `cap-REF-CLI-11-movil-alerta.png` | CLIENTE móvil: pantalla de alerta a pantalla completa. | Nueva alerta real por dos pulsaciones con la página móvil abierta. |
| `cap-REF-CLI-12-tema-oscuro.png` | CLIENTE en tema oscuro (Inicio). | Botón de tema de la barra superior. |
| `cap-REF-OP-19-tema-oscuro.png` | ADMIN → Panorama en tema oscuro. | Botón "Apariencia oscura". |
| `cap-REF-OP-19-sin-conexion.png` | ADMIN sin conexión: banner "Sin conexión con el servidor del PC / Reconectando…", toolbar "Sin conexión", detectores sin conexión. | Corte del flujo SSE bloqueando `/api/stream` en el navegador (fallo de red simulado en el cliente, no del servidor). |
| `cap-REF-OP-10-detectores-sin-quorum.png` | ADMIN → Detectores con **2 de 3 servidores apagados**: 1/3 conectados, "Pendiente / Sin líder", botones de intensidad deshabilitados, "Conexión no disponible", "Sin quórum". | Stack **aislado** `vybraint` (panel 18095) apagando los servidores 2 y 3 con el controlador real; el stack `sismo` de 8095 no se tocó. Ver `log-REF-OP-10-apagado-dos-servidores.txt`. |

Notas de fidelidad:

- Todos los eventos/alertas de estas capturas son **datos de demostración** generados el 2026-11-18
  mediante `POST /api/nodos/N/pulsar` sobre los ESP32 **simulados** (Raft real) y persistidos en
  PostgreSQL. No son la campaña física.
- **La SPA CLIENTE vigente no tiene diálogo "Ayuda y atajos" ni franja "PRUEBA"**: esos elementos del
  inventario original ya no existen. Se capturó el equivalente real (alerta manual y tema/sin conexión)
  y se anota la diferencia en lugar de inventar una captura.
- El mapa del CLIENTE usa **Leaflet con teselas de OpenStreetMap**, no el mapa SVG propio; el mapa SVG
  propio sigue en ADMIN. Esto contradice la frase de `README.md` §7 sobre "mapa SVG propio (sin Leaflet
  ni teselas externas)" y se reporta como discrepancia documental.
