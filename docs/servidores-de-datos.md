# Servidores de datos (uno por ESP32, cada uno con su PostgreSQL)

Los **ESP32** son los nodos: toman los datos y los transportan (Raft entre ellos), pero **no los guardan**.
Quien los guarda son los **servidores**: cada ESP32 tiene asignado uno (mismo número) con su **propia base de datos PostgreSQL**.
**PostgreSQL es la única fuente de verdad del histórico** (no hay archivos de respaldo paralelos).

```
nodo-1 (ESP32) ←→ nodo-2 ←→ nodo-3        consenso Raft entre los ESP32
   │                │          │
servidor1 + db1  servidor2 + db2  servidor3 + db3   Fedora · openSUSE · Ubuntu (cada uno con su PostgreSQL)
   └────────────────┴──────────┘
                 panel (ADMIN / CLIENTE)           lee el estado de los nodos y el histórico de las bases
```

## Qué guarda cada servidor (de su ESP32)
| Tabla | Contenido |
|---|---|
| `muestras` | estado del nodo (rol, término, log, confirmadas, pendientes, WiFi, alcanzable) al cambiar o cada 30 s |
| `log_entradas` | cada entrada del log Raft, con si está confirmada por la mayoría |
| `eventos` | lecturas/pulsaciones (nivel, PGA, duración, hora, recibido por), con su estado de confirmación |
| `alertas` | alertas emitidas (promedio, nivel, eventos, término, líder y la hora del último evento) |
| `sucesos` | elecciones, caídas, recuperaciones… |
| `acciones` | pruebas y órdenes enviadas al nodo (pulsaciones simuladas, caídas simuladas) |
| `archivo_*` | lo que la retención archiva (una por tabla; vacías si no se activa) |

Sin duplicados: cada registro tiene una clave (`id` del evento, `índice|término|clase` del log, `nodo|seq|hora` del suceso…) y se escribe una vez; lo pendiente se marca confirmado cuando la mayoría lo acepta. Las órdenes llevan un `ref` único: un reintento no crea otro registro. Las muestras no tienen clave natural (son lecturas periódicas): el recolector no repite una muestra si el estado no cambió.

Como el log Raft está replicado en los tres ESP32, **eventos, alertas y log existen en las tres bases**. Muestras, sucesos y acciones son propios de cada nodo.

## API
**Panel** (lo usan ADMIN y CLIENTE):
| Ruta | Para qué |
|---|---|
| `GET /api/servidores` | estado de los 3 servidores de datos: sistema operativo, ESP32 asignado, base (versión, conteos, tamaño, última escritura) |
| `GET /api/historial` | histórico paginado y filtrado (ver abajo) |
| `GET /api/registro?servidor=N&tipo=…&id=…` | un registro completo, con su JSON en bruto (`datos`, `estado`, `resultado`…) |
| `GET /api/publico/historial?tipo=alertas\|eventos` | vista del CLIENTE: solo alertas confirmadas y lecturas confirmadas, sin datos internos |
| `GET /api/retencion` | política de retención de cada servidor y qué afectaría ahora (solo lectura) |

`/api/historial` — parámetros (todos validados; error 400 con el motivo):
`tipo` = `eventos` · `alertas` · `muestras` · `sucesos` (actividad Raft) · `log` · `acciones` (pruebas y órdenes);
`servidor` = `1` · `2` · `3` · `todos`; `pagina` (≥1) y `limite` (1–200, por defecto 50); `nodo` (1–3);
`categoria` (eventos: leve/moderado/fuerte/severo · alertas: baja/media/alta · muestras: lider/seguidor/candidato/sin_respuesta · sucesos/log/acciones: el tipo o la clase);
`estado` (confirmado/pendiente, eventos y log); `desde`/`hasta` (fecha ISO o ms); `q` (búsqueda de texto, ≤80 caracteres); `orden` (asc/desc); `fuente` (`activo` o `archivo`).
Respuesta: `{ tipo, pagina, limite, total, paginas, servidores:[{n, ok, total, error}], registros:[…] }`.

- La paginación y los filtros se ejecutan **en PostgreSQL** (`LIMIT/OFFSET` con `count(*)`): nunca se carga todo el histórico. Los valores van como parámetros (sin inyección SQL); el comodín `%` de `q` se trata como texto.
- Con `servidor=N` se lee solo la base de ese servidor. Con `todos`, el panel pide a cada base solo los primeros `pagina×limite` registros y los mezcla (máximo 1000: pasado eso hay que elegir un servidor o afinar filtros). Eventos, alertas y log, replicados en las tres bases, se muestran **una vez**, con la lista de servidores donde están (`servidores:[1,2,3]`).
- Si una base no responde, el resto sigue: la respuesta indica `ok:false` y el error de esa base; con `servidor=N` caído responde 502. El panel reintenta una vez ante fallos de red o 5xx (no ante 4xx).

**Cada servidor de datos** (puertos 8101–8103 en desarrollo): `/info`, `/salud`, `/api/historial`, `/api/registro`, `/api/publico`, `/retencion`, `POST /acciones`.

## Histórico en ADMIN y CLIENTE
- **ADMIN → Histórico**: pestañas (eventos, alertas, muestras, actividad Raft, log de consenso, pruebas y órdenes), filtros por servidor, nodo, categoría, estado y rango de fechas, búsqueda, paginación (25–200), detalle de cada registro (panel lateral con el JSON guardado), carga con indicador, estados vacíos, errores con «Reintentar» (2 reintentos automáticos) y aviso tipo cápsula si una base no responde. Solo muestra lo que está en las bases; en modo demostración indica que necesita el servidor del PC.
- **CLIENTE → Avisos → Historial**: alertas confirmadas y lecturas confirmadas de **esta instalación** (la red local; no hay cuentas de usuario, por lo que no existen datos de otros usuarios). Filtro por periodo, paginación y detalle plegable. No expone IP, WiFi, términos Raft, líder, órdenes ni muestras.

## Retención y archivado (desactivado por defecto)
Por defecto **no se archiva ni se elimina nada**. Se configura con variables de entorno en cada servidor (`RETENCION_*`, en `docker-compose.yml`/`.env`):

| Categoría | Qué hace la retención | Variable (días; 0 = para siempre) |
|---|---|---|
| Eventos sísmicos **críticos** (nivel ≥ `RETENCION_CRITICO_NIVEL`, 6 por defecto, o que forman parte de una alerta) | **Nunca se tocan** | — |
| Alertas | **Nunca se eliminan automáticamente**; solo se pueden archivar | `RETENCION_ALERTAS_DIAS` |
| Eventos no críticos (y sus entradas de log) | archivar o eliminar | `RETENCION_EVENTOS_DIAS` |
| Registros técnicos: muestras | archivar o eliminar | `RETENCION_MUESTRAS_DIAS` |
| Registros técnicos: sucesos Raft | archivar o eliminar | `RETENCION_SUCESOS_DIAS` |
| Registros técnicos: entradas de log que no son eventos | archivar o eliminar | `RETENCION_LOG_DIAS` |
| Pruebas y órdenes | archivar o eliminar | `RETENCION_ACCIONES_DIAS` |

- `RETENCION_ACTIVA=si` activa la política (se aplica a los 60 s de arrancar y cada `RETENCION_CADA_HORAS`, 24 por defecto).
- `RETENCION_MODO=archivar` (por defecto) mueve los registros a las tablas `archivo_*` de la misma base (siguen consultables con `fuente=archivo`). `eliminar` los borra de verdad y **exige** `RETENCION_CONFIRMAR_ELIMINAR=si`; sin ella la retención queda desactivada y el servidor lo registra.
- `GET /api/retencion` muestra, sin modificar nada, cuántos registros afectaría cada regla ahora mismo.

**Crecimiento medido** (PostgreSQL 16, con índices; 5000 filas por tabla): muestra ≈ 590 B · evento ≈ 430 B (+ ≈ 540 B de su entrada de log) · suceso ≈ 250 B.
Una muestra cada 30 s como mucho ⇒ ≤ 2 880 al día ≈ **1,7 MB/día ≈ 0,6 GB/año por servidor** (es lo que domina). Mil eventos al día ≈ 1 MB/día. Recomendación inicial: `RETENCION_MUESTRAS_DIAS=30` y `RETENCION_SUCESOS_DIAS=365` en modo `archivar`; dejar eventos y alertas sin retención. El tamaño real de cada base se ve en `/info` (`tamanoBytes`) y en ADMIN → Servidores.

## Cómo usar ESP32 reales (sin tocar código)
Variables reales del proyecto: **`NODO1_URL`, `NODO2_URL`, `NODO3_URL`** (docker-compose; cada servidor y el panel las toman) y **`NODOS`** (lista del panel, solo si quieres sobrescribirlas). Los scripts de pruebas físicas usan `IP1..3` (`entrega/05-pruebas/datos/ips.env`).
1. `cp ejemplo.env .env` y descomenta/ajusta `NODO1_URL=http://IP1`, `NODO2_URL=http://IP2`, `NODO3_URL=http://IP3` (o `http://sismo-nodo-N.local`; dentro de un contenedor suele hacer falta la IP, que da el DHCP: conviene reservarla en el router).
2. Comprueba el contrato antes de conectar: `node web/scripts/verificar-esp32.js` (lee `/estado`, `/log`, `/sucesos`, `/alertas`; avisa si un nodo está en la posición equivocada).
3. Arranca **sin los simulados**: `docker compose up -d --build --no-deps panel servidor1 servidor2 servidor3 db1 db2 db3`.
4. El orden importa: `NODOn_URL` debe ser el ESP32 cuyo `/estado` dice `"nodo": n`.
El firmware y su contrato HTTP no se modifican. Verificado con las capturas reales de `entrega/05-pruebas/datos/` y leyendo en solo lectura los tres ESP32 físicos.

## Seguridad
- Las claves **no están en el código ni en el repositorio**. En desarrollo, `DB_PASSWORD` (por defecto `vybra`, **solo desarrollo**; el servidor avisa al arrancar con ella).
- Producción: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
  1. `mkdir -p secretos && (umask 077; openssl rand -base64 32 > secretos/db_password.txt)` (`secretos/` está en `.gitignore`).
  2. La clave llega a PostgreSQL con `POSTGRES_PASSWORD_FILE` y a los servidores con `DB_PASSWORD_FILE` (Docker secrets), no por variables.
  3. `VYBRA_ENTORNO=produccion` hace que el servidor **rechace arrancar** con la clave de desarrollo o vacía.
  4. No se publica ningún puerto de las bases ni de los servidores de datos (solo el panel) y no arrancan los ESP32 simulados.
- En desarrollo las bases tampoco publican puerto; los servidores de datos publican 8101–8103 solo por comodidad (enlaces de ADMIN).
- Variables de los servidores: `N`, `NODO_URL`, `DATABASE_URL` o `DB_HOST`+`DB_NAME`+`DB_USER`+`DB_PASSWORD_FILE`, `VYBRA_ENTORNO`, `PUERTO`, `INTERVALO_MS`, `TIMEOUT_NODO_MS`, `RETENCION_*`. Del panel: `NODOS`, `SERVIDORES`, `PUERTO`.

## Pruebas
- `npm run test:db` (en `web/`): levanta **tres PostgreSQL reales** efímeros (uno por servidor) y ejecuta todo con `REQUIRE_DB=1`: si falta una base las pruebas **fallan**, no se omiten. Cubre lectura de las tres bases, filtrado por servidor, correspondencia nodo↔base, paginación, filtros y detalle, persistencia tras reiniciar, ausencia de duplicados, caída de una base, vista pública, retención (críticos intactos, alertas solo archivadas, eliminar con confirmación), compatibilidad con las capturas del firmware real y la configuración de ESP32 reales/secretos.
- `npm test` sin bases omite solo las pruebas que las necesitan (o con `TEST_DATABASE_URL_1..3` propias).
