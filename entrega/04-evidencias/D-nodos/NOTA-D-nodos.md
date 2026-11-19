# Procedencia de la evidencia `D-nodos`

Logs y datos **reales** capturados el **2026-11-17** con las tres placas ESP32 físicas durante la
campaña (P0 completada y T1 ejecutada). Incluyen banners de arranque por puerto serie, flasheo,
identificación por MAC, `/estado`, `/log`, `/sucesos`, red de los 3 nodos y descubrimiento UDP 4211.

- **No se pueden regenerar sin hardware** y no forman parte de la re-ejecución software del 2026-11-18.
- Se conservan **intactos**; los identificadores de red (MAC/IP/SSID/BSSID) están saneados según
  `entrega/05-pruebas/datos/NOTA-saneado.md`. Las IPs `[IP-N1]`…`[IP-N3]` de `05-pruebas/datos/ips.env`
  son marcadores, no direcciones reales.
- Resultados y cifras no se han modificado al sanear.

Ver también: `FIS-*` en `04-evidencias/F-fisicas/` y `05-pruebas/datos/FIS-*`.
