# Avisos de terceros

Este repositorio contiene **solo código y documentación originales**. No incluye código de terceros
vendorizado. Las siguientes dependencias se usan en tiempo de compilación o de ejecución y conservan
sus propias licencias:

| Componente | Licencia | Titular / origen | Uso en el proyecto | ¿Se distribuye en el repo? |
|---|---|---|---|---|
| **ArduinoJson** | MIT | © Benoit Blanchon | Serialización JSON del firmware, de las pruebas y del nodo simulado (`api.cpp`, `mensajes.cpp`, `test_api.cpp`, `nodo_sim.cpp`) | No; se instala en la toolchain del usuario o se descarga la versión fija **7.4.3** al construir la imagen del nodo simulado |
| **Arduino core para ESP32 (arduino-esp32)** | LGPL-2.1 | © Espressif Systems | Compilación del firmware (WiFi, UDP, WebServer, OTA, Preferences) | No; se instala con `arduino-cli core install esp32:esp32` |
| **Node.js** | MIT | © OpenJS Foundation y colaboradores | Agregador, interfaz servida y suite de pruebas | No; runtime del sistema o `node:22-alpine` |
| **Alpine Linux** (imagen `node:22.22-alpine`) | MIT y otras licencias de paquetes | Alpine Linux / Node.js | Contenedor del panel | No; se descarga al construir |
| **Debian** (imagen `debian:bookworm-slim`) | Licencias Debian (GPL y otras) | Debian Project | Compilación y contenedor del nodo simulado | No; se descarga al construir |
| **Fedora 42** (imagen base) | Licencias Fedora (MIT y otras) | Fedora Project | Contenedor del servidor de datos 1 | No; se descarga al construir |
| **openSUSE Leap** (imagen base) | Licencias openSUSE | openSUSE Project | Contenedor del servidor de datos 2 | No; se descarga al construir |
| **Ubuntu 24.04** (imagen base) | Licencias Ubuntu | Canonical | Contenedor del servidor de datos 3 | No; se descarga al construir |
| **GCC/g++** (paquete `g++` de Debian) | GPL-3.0-or-later con excepción de runtime de GCC | Free Software Foundation | Compilación del nodo simulado para Linux (la imagen instala también `curl` y `ca-certificates` para descargar ArduinoJson) | No; se instala al construir |
| **Inter** (tipografía) | SIL Open Font License 1.1 | © The Inter Project Authors (Rasmus Andersson) | Tipografía de las interfaces, **cargada desde Google Fonts en tiempo de ejecución** | No |

## Notas

- Las capturas de pantalla, diagramas, guías de montaje y textos de este repositorio son material
  original del proyecto.
- Las imágenes de diseño (`new interfaz/*.webp`, `interfaz_*.png`, `mockup/`) son material propio de
  diseño y no son la aplicación entregada.
- Si se publica una compilación binaria del firmware, deben respetarse las condiciones de la
  **LGPL-2.1** del core de ESP32 (entre ellas, la posibilidad de reenlazar con una versión
  modificada de la biblioteca). Por eso el repositorio distribuye **código fuente**, no binarios.
- `Inter` se sirve desde `fonts.googleapis.com`; si se busca funcionamiento totalmente offline,
  debe alojarse localmente respetando la OFL 1.1.
