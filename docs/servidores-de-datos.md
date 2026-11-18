# Servidores de datos (uno por ESP32, cada uno con su PostgreSQL)

Los **ESP32** son los nodos: toman los datos y los transportan (Raft entre ellos), pero **no los guardan**.
Quien los guarda son los **servidores**: cada ESP32 tiene asignado uno (mismo número) con su **propia base de datos PostgreSQL**.

```
nodo-1 (ESP32) ←→ nodo-2 ←→ nodo-3        consenso Raft entre los ESP32
   │                │          │
servidor1 + db1  servidor2 + db2  servidor3 + db3   Fedora · openSUSE · Ubuntu (cada uno con su PostgreSQL)
   └────────────────┴──────────┘
                 panel (ADMIN / CLIENTE)           lee el estado de los nodos y el histórico de los servidores
```

## Qué guarda cada servidor (de su ESP32)
| Tabla | Contenido |
|---|---|
| `muestras` | estado del nodo (rol, término, log, confirmadas, pendientes, WiFi, alcanzable) al cambiar o cada 30 s |
| `log_entradas` | cada entrada del log Raft, con si está confirmada por la mayoría |
| `eventos` | pulsaciones/lecturas (nivel, PGA, duración, hora, recibido por), con su estado de confirmación |
| `alertas` | alertas emitidas (promedio, nivel, eventos, término, líder) |
| `sucesos` | elecciones, caídas, recuperaciones… |
| `acciones` | pruebas y órdenes enviadas al nodo (pulsaciones simuladas, caídas simuladas) |

Sin duplicados: reiniciar un servidor no repite registros; lo pendiente se marca confirmado cuando la mayoría lo acepta.

## Cómo se usa
- Docker: `docker compose up --build` levanta `nodo1-3` (ESP32 simulados), `db1-3`, `servidor1-3` y el `panel`. Cada base tiene su volumen (`sismo-db1..3`) y sobrevive a reinicios. Contraseña: variable `DB_PASSWORD` (por defecto `vybra`, solo desarrollo; las bases no publican puerto).
- ESP32 reales: `NODO1_URL=http://IP1 NODO2_URL=... NODO3_URL=...` (y `NODOS=` para el panel).
- API de cada servidor (puertos 8101–8103): `/info`, `/salud`, `/api/historial?tipo=muestras|log|eventos|alertas|sucesos|acciones&limite=200`.
- API del panel: `/api/servidores` (estado de los 3) y `/api/historial?tipo=…&servidor=N` (une los 3 si no se indica servidor).
- Los ESP32 no cambian: el firmware y su contrato HTTP (`/estado`, `/log`, `/sucesos`, `/alertas`) siguen igual.

## Pruebas
`TEST_DATABASE_URL=postgres://… node --test web/test/servidor.test.js` (sin la variable, esas pruebas se saltan).
