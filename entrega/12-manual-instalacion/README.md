# Manual de instalación y ejecución de VYBRA

Manual completo del prototipo VYBRA: clúster de tres ESP32 con consenso Raft propio, agregador
Node.js, panel ADMIN, vista CLIENTE, tres servidores de datos con PostgreSQL y controlador de
infraestructura. El evento sísmico es **simulado con un pulsador**: no hay acelerómetro ni medición
real del terreno.

Este manual es la edición final de la entrega. Se lee directamente en Markdown, sin Word, PDF ni
conversión. Las figuras están en PNG y cada una conserva su fuente editable (SVG, Python o PUML).

| Dato | Valor |
|---|---|
| Proyecto | VYBRA, clúster de detección sísmica simulada sobre ESP32 |
| Versión documentada | `v1.0.0-rc1` |
| Commit | `0ee5ed4` |
| Fecha de la validación | 2026-11-18, America/Bogota |
| Licencia | MIT |
| Autores | Jose Camilo Pérez Daza, Sebastián Fernando Revelo Meneses, Tomas Alejandro Santiago Reyes |
| Programa | Ingeniería de software, Universidad Manuela Beltrán, Sistemas distribuidos |
| Alcance | Montaje físico, firmware, arquitectura, instalación, operación y evidencias de pruebas |

## Cómo leerlo

1. Si va a montar el hardware, lea los capítulos 2 y 3.
2. Si va a compilar el firmware, lea el capítulo 6 con el montaje al lado.
3. Si va a levantar el sistema en el PC, lea los capítulos 7 y 8.
4. Para evaluar el diseño y las pruebas, lea los capítulos 4 y 5.
5. Los comandos y el pinout están en el capítulo 9.

## Índice

| Capítulo | Archivo | Qué responde |
|---|---|---|
| Resumen, ficha y criterios | [00-resumen.md](secciones/00-resumen.md) | Qué es el sistema, qué se entrega y cómo se relaciona con los criterios 4 y 5 |
| 1. Introducción y alcance | [01-introduccion.md](secciones/01-introduccion.md) | Propósito, público, límites de la simulación y convenciones |
| 2. Requisitos, materiales y herramientas | [02-requisitos.md](secciones/02-requisitos.md) | PC, software, red, puertos, energía y lista previa |
| 3. Montaje físico de los tres detectores | [03-montaje.md](secciones/03-montaje.md) | Piezas, plano de la protoboard, pines, pasos, verificación y errores |
| 4. Diagrama de arquitectura y mecanismos de comunicación | [04-arquitectura.md](secciones/04-arquitectura.md) | **Criterio 4**: componentes, protocolos, puertos, topología y flujo del evento |
| 5. Evidencias de pruebas | [05-evidencias.md](secciones/05-evidencias.md) | **Criterio 5**: funcionales, integración, rendimiento, tolerancia a fallos y campaña física |
| 6. Firmware de las ESP32, parte por parte | [06-firmware.md](secciones/06-firmware.md) | Cada archivo y cada bloque del firmware real, con archivo:línea |
| 7. Instalación y ejecución del software | [07-instalacion-ejecucion.md](secciones/07-instalacion-ejecucion.md) | `.env`, Docker, paneles, modos, producción, HTTPS y mapa del código |
| 8. Operación, verificación y solución de problemas | [08-operacion-soporte.md](secciones/08-operacion-soporte.md) | Arranque, comprobaciones, evento con pulsador, failover y problemas |
| 9. Anexos | [09-anexos.md](secciones/09-anexos.md) | Comandos, pinout, glosario, inventario de evidencias y checklist final |

El archivo [fuente-manual.md](fuente-manual.md) es la concatenación exacta de las diez secciones.
No se edita a mano: se regenera con el orden de la tabla anterior.

## Figuras

Todas las figuras están en `figuras/`. Los PNG se generaron desde su fuente; la fuente queda junto
al PNG para poder corregirla.

| Figura | Qué muestra | PNG | Fuente |
|---|---|---|---|
| FIG-MON-01 | Plano del ESP32 y el pulsador en la protoboard MB102 | [PNG](figuras/montaje/FIG-MON-01-plano-protoboard.png) | [SVG](figuras/montaje/FIG-MON-01-plano-protoboard.svg) |
| FIG-MON-02 | Orientación y diagonal del pulsador B3F | [PNG](figuras/montaje/FIG-MON-02-pulsador.png) | [SVG](figuras/montaje/FIG-MON-02-pulsador.svg) |
| FIG-MON-03 | Las tres protoboards etiquetadas SIS-D1, SIS-D2 y SIS-D3 | [PNG](figuras/montaje/FIG-MON-03-tres-protoboards.png) | [SVG](figuras/montaje/FIG-MON-03-tres-protoboards.svg) |
| FIG-MON-04 | Fotografía del prototipo real | [PNG](figuras/montaje/FIG-MON-04-prototipo-real.png) | evidencia FIS-03a |
| FIG-ARQ-M01 | Arquitectura y mecanismos de comunicación | [PNG](figuras/arq/FIG-ARQ-M01-arquitectura-mecanismos.png) | [SVG](figuras/arq/FIG-ARQ-M01-arquitectura-mecanismos.svg) + [PY](figuras/arq/FIG-ARQ-M01-arquitectura-mecanismos.py) |
| FIG-ARQ-M02 | Despliegue Docker de once servicios | [PNG](figuras/arq/FIG-ARQ-M02-despliegue-docker.png) | [`../03-diagramas/fuente/D-02-despliegue-docker.puml`](../03-diagramas/fuente/D-02-despliegue-docker.puml) |
| FIG-ARQ-M03 | Secuencia de un evento hasta la alerta | [PNG](figuras/arq/FIG-ARQ-M03-secuencia-evento-alerta.png) | [`../03-diagramas/fuente/D-09-secuencia-evento-alerta.puml`](../03-diagramas/fuente/D-09-secuencia-evento-alerta.puml) |
| FIG-FW-01 | Flujo del `loop()` y ciclo del evento | [PNG](figuras/firmware/FIG-FW-01-flujo-loop-evento.png) | [PUML](figuras/firmware/FIG-FW-01-flujo-loop-evento.puml) |
| FIG-EV-01 a FIG-EV-09 | Capturas reales de suites, latencia, panel y prototipo | [carpeta](figuras/pruebas/) | capturas de evidencia |

El manifiesto [manifiesto-figuras-manual.json](manifiesto-figuras-manual.json) conserva el pie de
cada figura y su ruta. El [capítulo 3](secciones/03-montaje.md) usa además la geometría de
[`../../montaje/montaje_detectores.html`](../../montaje/montaje_detectores.html), que sigue en el
repositorio como herramienta de montaje.

## Datos que no se negocian

- Pulsador entre GPIO4 (D4) y GND, `INPUT_PULLUP`, activo en bajo; antirrebote de 20 ms; pulsos
  menores de 80 ms se ignoran. LED azul integrado en GPIO2.
- Raft: latido de 500 ms, elección entre 5000 y 9000 ms, mensajes por UDP 4210 y descubrimiento
  por broadcast UDP 4211 cada 2000 ms. API HTTP en el puerto 80.
- Panel en 8095; nodos simulados en 9001 a 9003; servidores de datos en 8101 a 8103; PostgreSQL
  sin puerto publicado; Caddy en 8443 solo en el perfil HTTPS.
- Software verificado: C++ 78/78, integración Docker 5/5 en 79,2 s, latencia p95 de `/api/estado`
  de 1,097 ms y once contenedores sanos.
- Campaña física: P0 completada; T1 **no aprobada** (dos eventos de 301 ms y 174 ms separados
  3,2 s en vez de uno de unos 900 ms, sin alerta porque hubo un solo detector); T2 en adelante
  pendientes. No se presenta como validación física terminada.

## Estado y límites

- El log de Raft vive en RAM; solo el término y el voto se guardan en NVS. No hay snapshots ni
  persistencia durable del log.
- La API de los nodos no tiene autenticación ni cifrado, y Raft no usa TLS.
- La campaña física no cierra: T1 no se aprobó y las pruebas con dos detectores están pendientes.
- El respaldo de PostgreSQL no se validó; el perfil HTTPS está implementado y documentado, no
  arrancado como evidencia.

## Estructura de la carpeta

```text
entrega/12-manual-instalacion/
├── README.md                        este archivo
├── fuente-manual.md                 concatenación de las diez secciones
├── manifiesto-figuras-manual.json   pies y rutas de las 17 figuras
├── INVENTARIO-ENTREGABLES.md        inventario y estado de cada archivo
├── VERIFICACION.md                  comprobaciones hechas sobre el manual
├── secciones/                       fuentes de verdad, una por capítulo
├── figuras/                         PNG + fuente de cada figura
│   ├── montaje/                     FIG-MON-01 a FIG-MON-04
│   ├── arq/                         FIG-ARQ-M01 a FIG-ARQ-M03
│   ├── firmware/                    FIG-FW-01
│   └── pruebas/                     FIG-EV-01 a FIG-EV-09
```

Los manuales anteriores (`entrega/06-manual/`) se conservan como material histórico. Este manual
no los borra ni los sustituye: los amplía y queda como edición final.
