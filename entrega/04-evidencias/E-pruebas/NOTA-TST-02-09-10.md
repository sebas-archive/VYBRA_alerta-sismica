# NOTA — TST-02, TST-09, TST-10

Fecha: **2026-11-18**, commit `0ee5ed4`, entorno g++ 16.2.1 / ArduinoJson 7.4.3.

- `log-TST-02-raft.txt`: salida completa de `bin/test_raft` con los **32 casos `[ok]`** y el resumen
  `32 ok, 0 fallas`.
- `log-TST-09-tres-corridas.txt`: **tres ejecuciones consecutivas** de `make test` (5 binarios) con
  **0 fallas** en cada una y exit 0; evidencia de estabilidad, complementaria a TST-01.
- `log-TST-10-carencia.txt` + `NOTA-TST-10-carencia.md`: comprobación de que **no existe** cobertura,
  ASan/UBSan ni CI en el repositorio. Se documenta la carencia; no se simula cobertura.

Los binarios se compilaron en `/tmp/vybra-cpp/test` a partir de `firmware/test` y
`firmware/detector/src` del commit actual (la copia en /tmp evita escribir en el repositorio).
