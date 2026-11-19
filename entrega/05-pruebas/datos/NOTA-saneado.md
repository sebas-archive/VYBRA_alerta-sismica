# Nota de saneado de identificadores

Las evidencias de `entrega/` incluidas en este repositorio tienen sustituidos los identificadores
de red. Los resultados de las pruebas (índices de log, términos, duraciones, niveles, identificadores
de evento, códigos HTTP, tiempos) **no se han alterado**.

| Dato original | Marcador en el repositorio |
|---|---|
| MAC de la placa del Nodo 1 / 2 / 3 | `[MAC-N1]` / `[MAC-N2]` / `[MAC-N3]` |
| MAC de otro dispositivo | `[MAC]` |
| IP del Nodo 1 / 2 / 3 | `[IP-N1]` / `[IP-N2]` / `[IP-N3]` |
| IP del PC agregador | `[IP-PC]` |
| IPs de la LAN | `192.168.x.x` |
| SSID de la red 2,4 GHz / de 5 GHz | `[SSID]` / `[SSID-5G]` |
| BSSID de los AP de configuración | `[BSSID]` |

Los originales sin sanear se conservan **fuera del repositorio**, en el respaldo local
`/home/t1an/respaldos/evidencias-originales-*`.

Los archivos funcionales del proyecto (`firmware/detector/config.h` con su SSID y
`firmware/placas.conf` con las MAC) **no se han modificado**, para no romper el firmware ni
`quien.sh`. El repositorio está destinado a publicarse como **privado**.

## Revisión de saneado del 2026-11-18

Se revisaron los archivos de `entrega/04-evidencias/` y `entrega/05-pruebas/` con un escáner de
patrones (MAC, IPv4 privadas, SSID, claves de `secretos.h`, tokens de desarrollo y placeholders):

- Se sustituyeron las MAC reales que aún quedaban en los dos logs de arranque por puerto serie
  (`log-NOD-02-arranque-nodo2-flasheado.txt` → `[MAC-N2]` y
  `log-NOD-02-arranque-nodo3-flasheado.txt` → `[MAC-N3]`). Los resultados y el resto del contenido
  no se alteraron.
- La dirección `192.168.4.1` de los logs del portal es la **IP fija del AP propio del ESP32**
  (`SISMO-D<N>-config`), no una IP de la LAN de la campaña: se conserva porque forma parte del
  comportamiento documentado del portal.
- No se encontraron claves de `secretos.h`, tokens de control ni SSID reales en `entrega/`.
- Las IPs internas de Docker (`172.20.0.x`) son las de la red de compose y se consideran aceptables.

## Coherencia con los archivos excluidos

Los originales sin sanear y los artefactos de ejecución se conservan **fuera del repositorio** (respaldo
local indicado arriba). En particular:

- el volcado crudo del bus USB de la prueba FIS-02 (`FIS-02-serial-dryrun.txt.raw`) y
- el archivo de PID del agregador (`FIS-00-agregador.pid`)

**no forman parte de la entrega**, coherentemente con `.gitignore` (`*.raw`, `*.pid`), `README.md` §17 y
`09-anexos/nota-saneado-datos.md`. En `entrega/05-pruebas` solo se incluye la captura saneada y legible
`FIS-02-serial-dryrun.txt`; el inventario ya no referencia ninguno de los dos artefactos.
