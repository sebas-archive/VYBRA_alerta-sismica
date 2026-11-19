# Nota de saneado de datos

Las evidencias de `entrega/` incluidas en el repositorio se publican con los identificadores de red
sustituidos por marcadores. El saneado **no altera resultados**: los índices de log, términos,
duraciones, niveles, identificadores de evento, códigos HTTP, tiempos y conteos son los valores
reales registrados en las pruebas.

La nota canónica y detallada está en
[`entrega/05-pruebas/datos/NOTA-saneado.md`](../05-pruebas/datos/NOTA-saneado.md); este anexo resume
los criterios aplicados.

## 1. Marcadores empleados

| Dato original | Marcador en las evidencias |
|---|---|
| MAC de la placa del Nodo 1 / 2 / 3 | `[MAC-N1]` / `[MAC-N2]` / `[MAC-N3]` |
| MAC de otro dispositivo | `[MAC]` |
| IP del Nodo 1 / 2 / 3 | `[IP-N1]` / `[IP-N2]` / `[IP-N3]` |
| IP del PC agregador | `[IP-PC]` |
| IPs de la LAN | `192.168.x.x` |
| SSID de la red 2,4 GHz / de 5 GHz | `[SSID]` / `[SSID-5G]` |
| BSSID de los AP de configuración | `[BSSID]` |

## 2. Qué se excluye del repositorio

- `firmware/detector/secretos.h`: contraseña WiFi, clave OTA y clave del portal AP.
- Archivos `.env` y `.env.*` (configuración local del despliegue).
- `secretos/` (claves de producción de las bases y token del controlador).
- `web/certs/` y `web/datos/` (certificados y datos locales del servidor).
- Volcados crudos del bus USB (`*.raw`), que pueden contener tráfico de otros dispositivos.
- Archivos de ejecución locales (`*.pid`, `entrega/05-pruebas/datos/ips.env`).
- `node_modules/` y los binarios de compilación.

Todos esos elementos están cubiertos por `.gitignore` y se comprobaron antes de cerrar la entrega:
en el repositorio no hay secretos, claves privadas, certificados ni bases de datos.

## 3. Archivos funcionales que se conservan sin sanear

Por decisión de diseño, **no** se sanearon los archivos que el firmware y los scripts necesitan para
funcionar:

- `firmware/detector/config.h`: contiene el `WIFI_SSID` de la red de desarrollo.
- `firmware/placas.conf`: contiene la relación MAC → número de detector que usa `quien.sh`.

Se conservan para no romper la compilación ni la identificación de placas. No son secretos en el
sentido criptográfico, pero son identificadores de la red local: el repositorio está previsto para
publicarse como **privado**. Si se distribuye el código fuera de ese ámbito, deben revisarse antes
de publicarlo.

Los originales sin sanear de las evidencias se conservan **fuera del repositorio**, en el respaldo
local `/home/t1an/respaldos/evidencias-originales-*`.

## 4. Evidencia física

La evidencia real de la campaña física del 2026-11-17 (`entrega/04-evidencias/D-nodos/`,
`entrega/04-evidencias/F-fisicas/`, `entrega/05-pruebas/datos/FIS-*` y `entrega/05-pruebas/logs/FIS-*`)
se conserva sin alterar y está rotulada como histórica. El saneado se aplicó solo a identificadores
de red, nunca a los resultados ni a las marcas de tiempo relevantes.

## 5. Comprobación realizada

Antes de cerrar la entrega se verificó:

- que ningún archivo versionado sea `.env`, `secretos.h`, certificado, `*.raw` o `node_modules/`;
- que las evidencias y los documentos no contengan claves privadas, tokens ni contraseñas;
- que el snapshot de código entregado (`entrega/02-codigo/`) no incluya secretos (véase su LEEME).
