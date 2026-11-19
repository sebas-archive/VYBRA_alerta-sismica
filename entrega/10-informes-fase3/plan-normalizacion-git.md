# Estado del repositorio Git y plan de normalización

| Dato | Valor |
|---|---|
| Fecha de la auditoría | **2026-11-18** (America/Bogota), sobre `main` en `0ee5ed4` |
| Alcance | Auditoría en **solo lectura**. **No se ejecutó ninguna reescritura de historial, ningún `push` y ningún borrado** |
| Documento anterior | Versión del 2026-11-17, que describía un historial de 53 commits históricos + 6 nuevos. Ese estado ya no coincide con el actual |
| Herramientas | git 2.56.0; `gh` autenticado como `sebas-archive` (solo consulta) |

Las afirmaciones de este documento se verificaron con los comandos indicados en el §8.

**Rutas:** las citas de archivo y línea son relativas a la raíz del repositorio salvo que se indique otra cosa; los enlaces entre informes son relativos a esta carpeta.


---

## 1. Resumen del estado real

| Aspecto | Estado verificado el 2026-11-18 |
|---|---|
| `HEAD` | `0ee5ed4a626c28904db55ab6e436e040c03f046c` (`0ee5ed4`), 2026-11-18 10:58:38 -05:00 |
| Asunto | `chore: retira material de diseño histórico, prompts y planes internos` |
| Commits alcanzables | **102** (99 en primera línea; **3 merges**); rango de fechas 2026-11-02 a 2026-11-18 |
| Archivos rastreados | **279** |
| Ramas locales | Solo `main` |
| Ramas remotas | `origin/main` = `0ee5ed4`; `origin/HEAD` → `origin/main` |
| Remoto | `origin` = `https://github.com/sebas-archive/alerta-sismica-raft-esp32.git`, **privado** |
| Push | **Hecho y verificado antes de esta auditoría**: `git ls-remote` devuelve `main` = `0ee5ed4`; `gh repo view` informa `pushedAt` = 2026-11-18T16:03:06Z. La sesión de regeneración **no hizo commit ni push** (ficha v2 §1) |
| Tags | `v1.0.0-rc1` (anotado, `fc439b3` → `f567487`) y `backup-pre-rewrite` (ligero, `f40527f`) |
| Relación tag ↔ `HEAD` | `v1.0.0-rc1` es ancestro de `HEAD`; **`HEAD` está 49 commits por delante del tag** |
| Autor/committer | **102/102** commits: `sebas-archive <sebastianmeneses2456@gmail.com>` |
| Trailers de IA | **0** `Co-Authored-By` y **0** menciones a Claude en los mensajes de todo el historial |
| Licencia | `LICENSE` MIT (© 2026 Sebastián Revelo), creado en `a55f5fe` |
| Terceros | `THIRD-PARTY.md` existente, creado en `a55f5fe` |
| Secretos en el árbol | Ninguno rastreado; `firmware/detector/secretos.h`, `.env`, `.env.*` y `secretos/` están ignorados y no versionados |
| Secretos en el historial | El historial vigente sustituyó las apariciones por `[REDACTADO]`; riesgo residual en los respaldos externos previos a la reescritura (§3.3) |
| Árbol de trabajo | No limpio: hay carpetas de la entrega en regeneración sin seguimiento (`entrega/01-documento/`, `entrega/03-diagramas/`, `entrega/07-presupuesto/`, `entrega/08-video/`), ajenas a este plan |
| Reescrituras | **No ejecutadas en esta sesión** |

---

## 2. Auditoría

### 2.1 Commits, ramas y remotos

```
git rev-list --count HEAD                  -> 102
git rev-list --count --first-parent HEAD   -> 99
git rev-list --count --merges HEAD         -> 3
git branch                                 -> * main
git branch -r                              -> origin/HEAD -> origin/main, origin/main
git remote -v                              -> origin https://github.com/sebas-archive/alerta-sismica-raft-esp32.git (fetch/push)
```

- Hay **3 commits de merge**, entre ellos `9b1cd4f` («Caddy con certificado local delante del
  panel») y dos merges por la retirada de la fila de ubicación (`af29875`, `20bb9f6`).
- Solo existe `main`; las ramas `ubicacion` y `raft-esp32` que describía el plan del 2026-11-17 ya no
  están en el repositorio actual.

### 2.2 Tags

| Tag | Tipo | Objeto | Commit | Fecha del tag | ¿En el remoto? |
|---|---|---|---|---|---|
| `v1.0.0-rc1` | Anotado (`fc439b3`) | `fc439b3` | `f567487` (2026-11-17 16:33:15 -05:00) | 2026-11-18 04:41:39 -05:00 | **Sí** (`ls-remote` devuelve el objeto y el commit) |
| `backup-pre-rewrite` | Ligero | — | `f40527f` (2026-11-18 04:36:00 -05:00) | — | **No** (solo local) |

`git describe --tags HEAD` = `backup-pre-rewrite-8-g0ee5ed4`: el commit de `HEAD` **no tiene tag
exacto**.

**Discrepancia del tag:** su mensaje enumera resultados de la Fase 3 (pruebas C++, A′ y
JavaScript, firmware y sistemas operativos de Docker). Son las cifras del 2026-11-17; hoy el sistema
tiene 11 servicios Docker y 75 pruebas JavaScript (60 pasan + 15 se omiten). Además el tag está 49
commits por detrás de `HEAD`. **No se movió ni se recreó el tag** en esta auditoría.

### 2.3 Autoría y atribuciones de IA

- Todos los commits alcanzables tienen la misma identidad de autor y committer:
  `sebas-archive <sebastianmeneses2456@gmail.com>` (102/102).
- `git log --all --format='%B' | grep -ci 'co-authored-by'` → **0**.
- `git log --all --format='%B' | grep -ci 'claude'` → **0**.
- La configuración local del repositorio (`.git/config`) tiene `user.name = sebas-archive` y
  `user.email = sebastianmeneses2456@gmail.com`; no hay configuración de autoría distinta por commit.
- **Contraste histórico:** el bundle previo a la reescritura (59 commits, autoría `t1an`) conserva
  **45 trailers `Co-Authored-By` de IA** en sus mensajes. El historial vigente tiene 0: la
  normalización los eliminó, junto con el cambio de identidad. La historia con trailers solo está en
  los respaldos externos (§3.3).

### 2.4 Historial: reconstrucción y hashes que ya no existen

El historial actual **no es** el que se documentó el 2026-11-17:

| Indicio | Valor actual |
|---|---|
| Commits | 102 (el plan del 2026-11-17 describía 53 históricos + 6 nuevos = 59) |
| Autoría | `sebas-archive` en todos (el bundle antiguo tiene 59 commits con `t1an <seferevelo123@umariana.edu.co>`) |
| Hashes citados en la documentación de esa fecha (`3a274da`, `7cd7f53`, `16fc9b0`, `43aa2d5`, `1977662`, `3e30729`) | **No existen** en el repositorio actual (`git cat-file -e` falla) |
| Tag | Recreado el 2026-11-18 04:41:39 sobre `f567487` |
| Objetos no alcanzables | **61 commits** más 1 objeto, según `git fsck --unreachable --no-reflogs` |
| Reflog | 2 entradas: un `commit` y su `amend` sobre el mensaje del commit final |

La reconstrucción exacta del proceso no se puede determinar solo con el repositorio. Lo verificable
es el estado actual, que la historia anterior se conserva en los bundles de respaldo (§3.3) y que los
hashes antiguos citados en evidencias físicas son históricos y no resolubles hoy.

### 2.5 Licencia y terceros

| Archivo | Estado |
|---|---|
| `LICENSE` | MIT, «Copyright (c) 2026 Sebastián Revelo»; añadido en `a55f5fe` (2026-11-17 17:52:55 -05:00) |
| `THIRD-PARTY.md` | Presente; añadido en `a55f5fe`; enumera ArduinoJson (MIT), core ESP32 (LGPL-2.1), Node.js (MIT), Alpine, Debian, Fedora, openSUSE, Ubuntu, GCC y la fuente Inter (OFL). **Está incompleto**: no lista Leaflet 1.9.4 vendorizado en `web/public/cliente/vendor/leaflet/` (BSD-2-Clause), ni PostgreSQL, Caddy ni Docker Engine/Compose; la entrega documenta Leaflet aparte (`02-codigo/README.md`, `09-anexos/referencias.md` §5 y documento técnico §19) |
| `VERSION` | Presente, añadido en `2306a9d`; **conserva cifras de la Fase 3** (pruebas JavaScript y servicios Docker de entonces) que hoy están desactualizadas; `README.md` sí está actualizado |

---

## 3. Secretos

### 3.1 Árbol de trabajo actual

| Comprobación | Resultado |
|---|---|
| Archivos rastreados con «secretos» en el nombre | Solo `firmware/detector/secretos.ejemplo.h` (plantilla con `WIFI_PASS`, `OTA_CLAVE` y `PORTAL_CLAVE` sin valores reales) |
| `firmware/detector/secretos.h` | Existe localmente y **no está rastreado**; `git check-ignore -v` confirma `.gitignore:2` |
| `.env` | Existe localmente y **no está rastreado**: `.gitignore:29-30` cubre `.env` y `.env.*` |
| `secretos/` (secretos de producción) | Ignorado (`.gitignore:36`) |
| `.claude/` (metadatos locales) | Ignorado (`.gitignore:33`); no rastreado |
| Valores por defecto en `docker-compose.yml` | `DB_PASSWORD:-vybra` y `CONTROL_TOKEN:-vybra-control-dev`, documentados como **solo desarrollo**; producción usa `*_FILE` con secretos (`docker-compose.prod.yml`) |
| Credenciales reales en código o documentación | No detectadas en el árbol rastreado |

### 3.2 Historial del repositorio

- Las apariciones de la clave antigua del portal en los blobs históricos fueron sustituidas por el
  marcador literal `[REDACTADO]`.
- Barrido de los árboles de todos los commits alcanzables y de los 61 commits no alcanzables: los
  únicos valores de `PORTAL_CLAVE` encontrados son la plantilla `PON_AQUI_CLAVE_PORTAL`, el marcador
  `[REDACTADO]` y un texto informativo con puntos suspensivos. **No se encontró la clave real en el
  repositorio actual.**
- `WIFI_PASS` no aparece con valor real en ningún commit; solo la plantilla.

### 3.3 Riesgo residual: respaldos externos

Fuera del repositorio, en `/home/t1an/respaldos/`, se conservan respaldos previos a la
normalización:

| Archivo | Tamaño | Contenido verificado |
|---|---|---|
| `sismo-git-20261117-174501.bundle` | 2,8 MB | Historia completa anterior; `git bundle verify` → *complete history* |
| `sismo-git-pre-reescritura-20261117-175405.bundle` | 3,48 MB | **59 commits**, autoría `t1an`, **45 trailers `Co-Authored-By` de IA**; contiene la clave antigua con un valor real en `firmware/detector/config.h` de los commits de esa historia (el valor no se reproduce aquí) |
| `sismo-git-pre-identidad-20261117-180733.bundle` | 3,48 MB | Historia previa a la normalización de identidad |
| `sismo-arbol-20261117-174501.tar.gz` y variantes | ~4,4 MB | Árbol de trabajo de esas fechas |
| `SHA256SUM-*.txt` y `hashes-*.txt` | — | Verificación e hashes originales |

**Conclusión:** el riesgo de la clave antigua ya no está en el repositorio, pero **sí en los
respaldos externos**. Antes de compartir el equipo o los respaldos con terceros hay que decidir si se
retiran, se cifran o se regraban. No se ha borrado nada.

---

## 4. Remoto y estado del push

| Comprobación | Resultado |
|---|---|
| URL de `origin` | `https://github.com/sebas-archive/alerta-sismica-raft-esp32.git` |
| Visibilidad | **Privada** (`gh repo view --json isPrivate,visibility`) |
| Repositorio creado | 2026-11-17T23:02:41Z |
| Último push registrado | 2026-11-18T16:03:06Z (11:03 -05:00) |
| `main` remoto | `0ee5ed4` (igual que `HEAD`); `git status -sb` no marca divergencia |
| Tag remoto | `v1.0.0-rc1` → `fc439b3` / `f567487` |
| Tag `backup-pre-rewrite` | **Local únicamente**; no publicado |
| Otras ramas remotas | Ninguna (`git ls-remote --heads` devuelve solo `main`) |

El «push pendiente» que describía el plan del 2026-11-17 ya está hecho: el remoto contiene `HEAD`. Lo que
queda abierto no es el envío, sino las decisiones del §6 (visibilidad, re-etiquetado y respaldos). La
ficha canónica v2 registra que la sesión de regeneración no hizo commit ni push; este documento
describe el estado del remoto, no una acción de esta sesión.

---

## 5. Plan de normalización por fases (estado)

| Fase | Objetivo | Estado el 2026-11-18 |
|---|---|---|
| F1 | Higiene previa: `.gitignore` con `*.raw`, `*.pid`, `.env`, `.env.*`; metadatos locales fuera del índice | **Hecho**: `.gitignore:23-39`; `.claude/` ignorado |
| F2 | Licencia: MIT para el código original y avisos de terceros | **Hecho**: `LICENSE` y `THIRD-PARTY.md` (commit `a55f5fe`) |
| F3 | Normalización del historial: eliminar trailers de IA y purgar la clave antigua; conservar el número de commits y re-apuntar el tag | **Hecho en el repositorio** (0 trailers; clave sustituida por `[REDACTADO]`). Pendiente: respaldos externos (§3.3) y re-etiquetado (§6) |
| F4 | README profesional | **Hecho**: `README.md` completo y actualizado |
| F5 | Estructura del repositorio | **Hecho**: se mantuvieron `firmware/`, `web/`, `docs/`, `entrega/`, `docker-compose*.yml`; se retiró el material de diseño histórico |
| F6 | Publicación en GitHub | **Hecho**: repositorio privado `alerta-sismica-raft-esp32` en la cuenta `sebas-archive`, con `main` y el tag publicados |
| F7 | Validaciones finales | **Parcial**: sin trailers, sin secretos en el repositorio, licencia y README presentes; queda re-etiquetar `v1.0.0-rc1` y decidir el estado de los respaldos |

**Lo que no se ha hecho y este documento no hace:** mover o recrear tags, reescribir mensajes, purgar
objetos, expirar el reflog, hacer `gc`, borrar ramas ni publicar nada.

---

## 6. Decisiones abiertas

| # | Decisión | Estado real | Opciones |
|---|---|---|---|
| G-1 | **Re-etiquetar `v1.0.0-rc1`** | El tag apunta a `f567487` (49 commits por detrás de `HEAD`) y su mensaje cita cifras de la Fase 3 | Dejarlo como registro histórico; crear un tag nuevo en `HEAD`; moverlo (implica reescribir refs) |
| G-2 | **Tag `v1.0.0` definitiva** | No existe; depende de la campaña física (`pendientes.md` §1) | Crearlo tras aprobar T1 y el resto de la campaña |
| G-3 | **Respaldos externos con la clave antigua** | `/home/t1an/respaldos/*.bundle` conservan la historia previa y la clave antigua (§3.3) | Retirar; cifrar; regrabar solo el árbol actual; conservar localmente |
| G-4 | **Visibilidad del repositorio** | Privado; `main` y el tag publicados | Mantener privado; publicar; archivar |
| G-5 | **Identificadores en el repositorio privado** | Se conservan el SSID en `firmware/detector/config.h` y las MAC en `firmware/placas.conf` (parcialmente truncadas); las evidencias usan marcadores | Mantener el repositorio privado; o sustituir por marcadores antes de publicar |
| G-6 | **Cifras del tag y de `VERSION`** | El mensaje del tag y `VERSION` conservan cifras de la Fase 3 (A′ 5/5, pruebas JavaScript y servicios Docker de entonces) | Actualizarlas en un commit aparte antes de etiquetar la definitiva |

---

## 7. Riesgos identificados

| Riesgo | Severidad | Nota |
|---|---|---|
| Respaldo externo con la clave antigua | Alta | Fuera del repositorio, pero en el equipo |
| Tag `v1.0.0-rc1` 49 commits por detrás y con cifras obsoletas en su mensaje | Media | Puede confundir una revisión externa |
| `VERSION` con cifras obsoletas | Media | `README.md` está actualizado; `VERSION` no |
| Objetos no alcanzables y reflog con historia intermedia | Baja | No contienen la clave real; se eliminarían con `gc` si se decidiera |
| Árbol de trabajo con carpetas de entrega sin seguimiento | Baja | Es el estado esperado durante la regeneración de la entrega; no se auditan aquí |

---

## 8. Validaciones ejecutadas (solo lectura)

```bash
git log -1 --format='%H%n%ad%n%s' --date=iso
git rev-list --count HEAD
git rev-list --count --first-parent HEAD
git rev-list --count --merges HEAD
git branch -a -vv
git remote -v
git for-each-ref
git tag -l -n5
git cat-file -p refs/tags/v1.0.0-rc1
git rev-list --count v1.0.0-rc1..HEAD
git log --all --format='%B' | grep -ci 'co-authored-by'
git log --all --format='%B' | grep -ci 'claude'
git log --format='%an <%ae>' | sort | uniq -c
git ls-files | wc -l
git check-ignore -v firmware/detector/secretos.h
git grep -nE "PORTAL_CLAVE|WIFI_PASS|OTA_CLAVE" -- .
git fsck --unreachable --no-reflogs
git reflog
git count-objects -v
git ls-remote --heads --tags origin
gh repo view sebas-archive/alerta-sismica-raft-esp32 --json isPrivate,visibility,pushedAt,createdAt,url
git bundle verify /home/t1an/respaldos/*.bundle
```

No se ejecutó `git push`, `git tag`, `git filter-repo`, `git gc` ni ninguna operación que modifique
el historial o el remoto.
