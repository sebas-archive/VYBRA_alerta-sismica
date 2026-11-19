# Referencias y bibliografía

Fuentes consultadas para el diseño, la implementación y la documentación del proyecto. Las
referencias externas son documentación oficial o publicaciones académicas; la fecha de consulta es
2026-11-18 salvo que se indique otra. Las referencias internas son archivos del propio repositorio.

## 1. Consenso distribuido y Raft

1. Ongaro, D. y Ousterhout, J. (2014). *In Search of an Understandable Consensus Algorithm*.
   Proceedings of the 2014 USENIX Annual Technical Conference (USENIX ATC '14), Filadelfia,
   pp. 305–319. USENIX Association. ISBN 978-1-931971-10-2.
   Disponible en <https://www.usenix.org/conference/atc14/technical-sessions/presentation/ongaro>
   (consultado el 2026-11-18).
2. Ongaro, D. (2014). *Consensus: Bridging Theory and Practice*. Tesis doctoral, Stanford
   University. Enlazada desde el sitio oficial del proyecto Raft
   <https://raft.github.io/> (consultado el 2026-11-18).
3. Sitio oficial del algoritmo Raft: <https://raft.github.io/> (consultado el 2026-11-18).

## 2. ESP32, Arduino y firmware

4. Espressif Systems. *Arduino core for the ESP32 — documentación oficial*.
   <https://docs.espressif.com/projects/arduino-esp32/en/latest/> (consultado el 2026-11-18).
5. Espressif Systems. *ESP32 — SoC*. <https://www.espressif.com/en/products/socs/esp32>
   (consultado el 2026-11-18).
6. Arduino. *Arduino CLI — documentación*. <https://arduino.github.io/arduino-cli/>
   (consultado el 2026-11-18).
7. Arduino. *Arduino Reference (lenguaje y bibliotecas del core)*.
   <https://www.arduino.cc/reference/en/> (consultado el 2026-11-18).
8. Blanchon, B. *ArduinoJson — documentación de la versión 7*.
   <https://arduinojson.org/> y <https://arduinojson.org/v7/>
   (consultado el 2026-11-18).
9. Internet Engineering Task Force. *RFC 5905: Network Time Protocol Version 4: Protocol and
   Algorithms Specification* (2010). <https://www.rfc-editor.org/rfc/rfc5905>
   (consultado el 2026-11-18).

## 3. Backend, interfaces y formatos

10. OpenJS Foundation. *Node.js Documentation — versión 22 LTS*.
    <https://nodejs.org/docs/latest-v22.x/api/> (consultado el 2026-11-18).
11. OpenJS Foundation. *Node.js — Test runner (`node:test`)*.
    <https://nodejs.org/api/test.html> (consultado el 2026-11-18).
12. Internet Engineering Task Force. *RFC 8259: The JavaScript Object Notation (JSON) Data
    Interchange Format* (2017). <https://www.rfc-editor.org/rfc/rfc8259>
    (consultado el 2026-11-18).
13. MDN Web Docs. *Server-sent events — Web APIs*.
    <https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events>
    (consultado el 2026-11-18).
14. WHATWG. *HTML Living Standard — Server-sent events*.
    <https://html.spec.whatwg.org/multipage/server-sent-events.html>
    (consultado el 2026-11-18).

## 4. Persistencia e infraestructura

15. The PostgreSQL Global Development Group. *PostgreSQL 16 Documentation*.
    <https://www.postgresql.org/docs/16/> (consultado el 2026-11-18).
16. Docker Inc. *Docker Compose — documentación*.
    <https://docs.docker.com/compose/> (consultado el 2026-11-18).
17. Docker Inc. *Compose — Profiles*.
    <https://docs.docker.com/compose/how-tos/profiles/> (consultado el 2026-11-18).
18. Docker Inc. *Compose — Secrets*.
    <https://docs.docker.com/compose/how-tos/use-secrets/> (consultado el 2026-11-18).
19. Caddy. *Automatic HTTPS — documentación*.
    <https://caddyserver.com/docs/automatic-https> (consultado el 2026-11-18).
20. Caddy. *Caddyfile — documentación*.
    <https://caddyserver.com/docs/caddyfile> (consultado el 2026-11-18).

## 5. Licencias

21. Open Source Initiative. *The MIT License*.
    <https://opensource.org/license/mit> (consultado el 2026-11-18).
22. SPDX. *MIT License identifier*.
    <https://spdx.org/licenses/MIT.html> (consultado el 2026-11-18).

23. Leaflet. *Leaflet 1.9.4 — a JavaScript library for interactive maps* (licencia
    BSD-2-Clause, © 2010-2023 Vladimir Agafonkin y CloudMade). <https://leafletjs.com/>
    (consultado el 2026-11-18). Copia vendorizada en `web/public/cliente/vendor/leaflet/`
    (`leaflet.js`, `leaflet.css` e `images/`); el aviso `@preserve` del archivo conserva la
    atribución.

## 6. Documentación interna del proyecto

24. *README.md* del repositorio: descripción, arquitectura, puertos, instalación, pruebas,
    estado actual y limitaciones (versión `v1.0.0-rc1`, commit `0ee5ed4`).
25. *VERSION*: versión declarada, tag de Git y fecha de estabilización.
26. *LICENSE*: licencia MIT, © 2026 Sebastián Revelo.
27. *THIRD-PARTY.md*: avisos de licencias de dependencias de terceros.
28. *docs/prueba-hardware.md*: campaña física con las tres placas, criterios y mediciones.
29. *docs/servidores-de-datos.md*: servidores de datos, PostgreSQL, retención y
    apagado/encendido desde ADMIN.
30. *entrega/06-manual/manual-instalacion-y-ejecucion.md*: instalación, ejecución, pruebas y
    solución de problemas.
31. *entrega/06-manual/conexion-esp32.md*: flasheo, identificación de placas, portal, OTA y
    evidencias reales de la campaña del 2026-11-17.
32. *entrega/04-evidencias/* y *entrega/05-pruebas/*: evidencias y registros de ejecución.
33. *entrega/05-pruebas/datos/inventario-evidencias.csv*: inventario de evidencias y sus
    identificadores de citación.
34. *entrega/10-informes-fase3/*: informes de fase, diagnóstico del pulsador, identificación de
    nodos y plan de normalización de Git.

## 7. Nota sobre citas

- No se citan fuentes que no existan o que hayan sido retiradas del repositorio: el material de
  diseño histórico (`docs/superpowers/`, `mockup/`, `preview/`, `new interfaz/`) ya no forma parte
  del proyecto y no se usa como referencia (véase
  `aviso-material-historico-retirado.md`).
- Las referencias externas son documentación oficial o publicaciones; no se atribuyen al proyecto
  afirmaciones que no estén respaldadas por el código o por las evidencias.
