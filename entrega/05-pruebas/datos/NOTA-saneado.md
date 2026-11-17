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
