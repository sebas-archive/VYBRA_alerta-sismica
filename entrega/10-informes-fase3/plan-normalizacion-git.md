# Plan de normalización del repositorio Git

Fecha: 2026-11-17. **Estado: propuesta. No se ha ejecutado ninguna reescritura, publicación ni borrado.**

## 1. Auditoría

| Aspecto | Estado real |
|---|---|
| Rama actual | `main` (HEAD `3a274da`) |
| Commits | **53**, historia lineal, sin merges |
| Ramas | `main`, `ubicacion` (ambas en `3a274da`), `raft-esp32` (`d222f76`, ancestro) |
| Tags | `v1.0.0-rc1` (anotado) → commit `3a274da` |
| Remotos | **ninguno** → el historial **nunca se publicó** |
| Autor/committer de los 53 commits | `t1an <seferevelo123@umariana.edu.co>` (único) |
| Config local | `t1an` / `seferevelo123@umariana.edu.co` |
| Config global | `Sebastián Revelo` / `sebastianmeneses2456@gmail.com` |
| Trailers de IA | **45 commits** con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; 8 commits limpios |
| Secretos en el árbol actual | ninguno rastreado (`secretos.h` ignorado; nunca commiteado) |
| Secretos en el historial | clave del portal antigua (`[REDACTADO]`) en **1 commit** (`16fc9b0`) y en la documentación de esta fase. `WIFI_PASS` **no** está en el historial: solo la plantilla `PON_AQUI_LA_CLAVE` |
| Árbol de trabajo | `config.h` modificado (SSID `[SSID]`) + ~100 archivos de evidencia/scripts sin seguimiento |
| `.gitignore` | cubre `secretos.h`, `build/`, `bin/`, `node_modules/`, `.superpowers/`, `certs/`, `datos/`, `preview/`; **faltan** `*.raw`, `*.pid`, `.env` |
| Licencia | **no existe** `LICENSE` |
| Herramientas | git 2.56.0; `git-filter-repo` **no instalado**; `gh` autenticado como `sebas-archive` |
| Dependencias | Node **sin dependencias**; ArduinoJson (MIT, no vendorizado); core ESP32 (LGPL-2.1, toolchain); Node (MIT); imágenes Docker; fuente Inter vía Google Fonts (OFL 1.1, en tiempo de ejecución) |
| Tamaño | `.git` 7 MB; PNG mayores 642 KB; sin archivos enormes |

## 2. Respaldo ya generado (verificado)

| Archivo | Tamaño | Verificación |
|---|---|---|
| `/home/t1an/respaldos/sismo-git-20261117-174501.bundle` | 2,8 MB | `git bundle verify` → *complete history*, HEAD `3a274da` |
| `/home/t1an/respaldos/sismo-arbol-20261117-174501.tar.gz` | 4,2 MB | incluye archivos sin seguimiento (excluye `.git`, `build`) |
| `/home/t1an/respaldos/SHA256SUM-20261117-174501.txt` | — | hashes SHA-256 de ambos |
| `/home/t1an/respaldos/hashes-originales-20261117-174501.txt` | — | HEAD, ramas, tag y nº de commits originales |

## 3. Plan propuesto (por fases)

### F1. Higiene previa (sin reescritura)

1. Ampliar `.gitignore`: `*.raw` (el volcado usbmon contiene tráfico de **otros** dispositivos USB),
   `*.pid`, `.env`, `.env.*`.
2. Commits nuevos (mensajes convencionales, sin trailers):
   - `chore(git): ignora capturas USB crudas, PID y archivos .env`
   - `config(firmware): red de despliegue del clúster (SSID [SSID])`
   - `docs(entrega): verificación integral del clúster de tres nodos`
   - `test(campaña): P0 y T1, scripts de validación y evidencias`
   - `docs: diagnóstico del pulsador del Nodo 2 y plan de normalización Git`
3. `git status` limpio (salvo ignorados).

### F2. Licencia

- **MIT** para el código original (firmware, scripts, backend/UI, pruebas), compatible con:
  Node sin dependencias, ArduinoJson (MIT), core ESP32 (LGPL-2.1, no distribuido en el repo),
  imágenes Docker (cada una con su licencia), fuente Inter (OFL, servida por Google Fonts).
- Documentar en `README.md` y en un apartado `THIRD-PARTY` las licencias de terceros.
- Opcional: **CC BY 4.0** solo para `docs/` y `entrega/` si se desea separar documentación.
- Titular del copyright: **pendiente de tu confirmación** (nombre legal y año).

### F3. Normalización del historial (irreversible tras `gc`)

1. Reescribir **solo mensajes** de los 45 commits para eliminar el trailer de IA
   (conserva autor, fecha, orden y contenido).
2. Purgar del historial el secreto real: la clave antigua del portal (`[REDACTADO]`, commit `16fc9b0`). `WIFI_PASS` no aparece con valor real en ningún commit (solo la plantilla). Detalle en
   `7cd7f53`, sustituyéndolos por `<REDACTADO>` (afecta a los blobs de esos commits; el árbol
   actual no cambia porque ya no contiene esos valores).
3. Re-apuntar el tag `v1.0.0-rc1` al commit reescrito equivalente, con el mismo mensaje.
4. **No** combinar ni reordenar commits: se conservan los 53 para mantener la trazabilidad técnica.
5. Verificar después: mismo número de commits, mismo árbol final, cero trailers, cero secretos,
   tests compilando y ejecutando igual.
6. `refs/original` se elimina, reflog se expira y `gc` purga los objetos solo con tu autorización.

### F4. README profesional

Ampliar el actual con: arquitectura Mermaid, nodos ESP32, Raft, comunicación, backend, interfaces,
pulsador como simulación, tecnologías, requisitos, instalación, configuración, compilación/flasheo,
ejecución, pruebas, estructura, licencia y **estado real** (incluida la incidencia de T1, sin
presentarla como aprobada).

### F5. Estructura

**Mantener** `firmware/`, `web/` (backend + frontend), `docs/`, `entrega/`, `docker-compose.yml`.
No se moverán archivos: los scripts, Docker y las evidencias referencian estas rutas. Se documentará
el mapa en el README. `backend/`/`frontend/` separados obligarían a tocar Docker, pruebas y
evidencias, sin beneficio real.

### F6. GitHub (requiere autorización)

- Cuenta autenticada: `sebas-archive`.
- Nombre propuesto: **`alerta-sismica-raft-esp32`** · descripción: *"Clúster de detección sísmica
  simulada sobre tres ESP32 con consenso Raft, agregador Node.js y paneles web."*
- Visibilidad: **privada**.
- Sin force-push, sin sobrescribir remoto existente.

### F7. Validaciones finales

`git status` limpio · sin secretos rastreados · sin `Co-Authored-By` · tag preservado · árbol final
idéntico · `LICENSE` presente y compatible · README completo · identidad configurada · ramas y
evidencias intactas · Docker/backend/scripts sin cambios funcionales.

## 4. Decisiones que necesito (puntos de parada)

| # | Decisión | Opciones |
|---|---|---|
| D1 | **Identidad para commits nuevos** | (A) `t1an <seferevelo123@umariana.edu.co>` (coincide con los 53 commits) · (B) `Sebastián Revelo <sebastianmeneses2456@gmail.com>` (global) · (C) otra |
| D2 | **¿Reescribir también la autoría histórica** a la identidad elegida? | Sí / No (recomendado: sí si eliges B, para coherencia) |
| D3 | **Licencia y titular** | MIT + nombre legal exacto y año · ¿CC BY 4.0 para documentos? |
| D4 | **Autorización de reescritura** (F3) | Sí / No · ¿purgar también los secretos del historial? |
| D5 | **¿Combinar commits?** | Recomendado: mantener los 53 · alternativa: squashing por hitos |
| D6 | **GitHub** | Crear repo privado `alerta-sismica-raft-esp32` en `sebas-archive` y publicar tras la reescritura · o solo dejarlo preparado |
| D7 | **Privacidad** | ¿Aceptas que queden en el repo (privado) el SSID `[SSID]`, las IPs 192.168.x.x y las MAC de las placas? Si no, se sustituyen por marcadores |
