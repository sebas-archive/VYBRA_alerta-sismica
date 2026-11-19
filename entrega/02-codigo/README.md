# Código fuente entregable — Alerta Sísmica (VYBRA)

El código fuente está en el propio repositorio. No hay ZIP ni archivo comprimido: se lee y se
ejecuta directamente desde las carpetas del proyecto.

| Dato | Valor |
|---|---|
| Commit documentado | `0ee5ed4a626c28904db55ab6e436e040c03f046c` (`0ee5ed4`) |
| Fecha | 2026-11-18 10:58:38 -05:00 |
| Versión declarada | `v1.0.0-rc1` |
| Licencia | MIT, © 2026 Sebastián Revelo |
| Terceros | [`../../THIRD-PARTY.md`](../../THIRD-PARTY.md) |

## Dónde está cada cosa

| Ruta | Contenido |
|---|---|
| [`../../firmware/`](../../firmware/) | Firmware de las ESP32, núcleo Raft portable, pruebas C++ y scripts de carga |
| [`../../web/`](../../web/) | Agregador, panel ADMIN, vista CLIENTE, servidores de datos, controlador y nodo simulado |
| [`../../docker/`](../../docker/) | Dockerfiles y configuración de Caddy |
| [`../../docker-compose.yml`](../../docker-compose.yml) | Despliegue de once servicios |
| [`../../docs/`](../../docs/) | Documentación técnica de apoyo: arquitectura actual, servidores de datos y prueba de hardware |

## Cómo obtener y verificar

```bash
git clone <URL-del-repositorio>
cd "detector de sismos en red distribuida"
git log -1 --format='%H %ad %s' --date=iso
sha256sum docker-compose.yml firmware/detector/detector.ino web/server.js
```

No se necesita descomprimir nada. Si necesita una copia inmutable, use `git archive`:

```bash
git archive --format=tar.gz --prefix=vybra-0ee5ed4/ 0ee5ed4 > /tmp/vybra-0ee5ed4.tar.gz
```

## Qué se retiró

Se retiró `codigo-fuente-0ee5ed4.zip`, que era una exportación del mismo commit. El código vivo y
versionado es la fuente de verdad. Para compilar y ejecutar, siga
[`../12-manual-instalacion/secciones/07-instalacion-ejecucion.md`](../12-manual-instalacion/secciones/07-instalacion-ejecucion.md)
y [`../06-manual/manual-instalacion-y-ejecucion.md`](../06-manual/manual-instalacion-y-ejecucion.md).
