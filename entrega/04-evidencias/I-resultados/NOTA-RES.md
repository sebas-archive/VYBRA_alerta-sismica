# NOTA — Resultados RES-02, RES-04, RES-05, RES-06, RES-10

Fecha: **2026-11-18, 11:39–11:42 America/Bogota**, commit `0ee5ed4`, stack real de 11 servicios en
`http://127.0.0.1:8095`.

| Evidencia | Método | Resultado |
|---|---|---|
| `tabla-RES-02-latencia-api.txt` + `05-pruebas/datos/RES-02-latencia-api.csv` + `cap-RES-02-grafica-latencia.png` | 5 peticiones de calentamiento + **100 mediciones** de `GET /api/estado` con `time.perf_counter()` | min 0,407 ms · mediana 0,613 ms · media 0,672 ms · p95 1,097 ms · máx 1,338 ms |
| `log-RES-04-sse.txt` | Lectura de `/api/stream` durante 12 s | evento `estado` inicial + latidos `vivo` cada 5 s |
| `tabla-RES-05-firmware.txt` | Recompilación con `arduino-cli` 1.5.1 / core 3.3.12 | app 1.105.728 / 1.105.728 / 1.105.712 B; 84 % de la partición |
| `tabla-RES-06-pruebas.txt` | Resumen de la re-ejecución | C++ 78/78 · JS 60/75 · test:db 70/75 · test:infra 5/5 · firmware 3/3 |
| `tabla-RES-10-consumo.txt` + `05-pruebas/datos/RES-10-consumo-docker.csv` + `cap-RES-10-grafica-consumo.png` | `docker stats` en streaming durante 21 s, ~40 muestras por contenedor | RAM media: panel 92,4 MiB, servidores ~99–100 MiB, bases 27–33 MiB, nodos 1,2–4,1 MiB, controlador 18,8 MiB; CPU media 0,38–5,09 % |

Notas:

- RES-02 y RES-10 son **software**: no dependen de las placas físicas.
- RES-05 y RES-06 son recompilaciones/re-ejecuciones del 2026-11-18, no los números de la Fase 3.
- Siguen pendientes de hardware RES-01 (latencia de `/estado` de los ESP32), RES-03 (reelección real),
  RES-07 (pulsaciones físicas), RES-08 (gráfica que combina RES-01+RES-02) y RES-09 (gráfica de
  reelección). La gráfica de RES-02 se entrega igualmente como `cap-RES-02-grafica-latencia.png`.
