#!/usr/bin/env bash
# Reproduce TODAS las figuras del documento final VYBRA (entrega/11-documento-final/figuras).
#
# Requisitos:
#   - Stack Docker en ejecucion: panel 8095, servidores 8101-8103, nodos 9001-9003,
#     3 PostgreSQL y controlador (docker compose up -d).
#   - playwright-core en /tmp/pw/node_modules y Chromium 1248 cacheado por Playwright.
#   - Pillow en el Python indicado.
#
# Duracion aproximada: UI 10-14 min, terminales ~1 min, estaticas y manifiesto < 30 s.
# Uso:  bash ejecutar-todo.sh
set -euo pipefail

REPO="${REPO:-/home/t1an/detector de sismos en red distribuida}"
NODE="${NODE:-/home/t1an/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node}"
PY="${PY:-/home/t1an/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/bin/python3}"
export NODE_PATH="${NODE_PATH:-/tmp/pw/node_modules}"
export REPO

cd "$(dirname "$0")"
mkdir -p /tmp/capturas-final/raw entrega/../figuras 2>/dev/null || true

echo '== 1/5 UI ADMIN + CLIENTE (stack real, 4 combinaciones de tema/dispositivo) =='
# PULSAR_ADMIN=1 genera 2 pulsaciones reales (nodos 1 y 2) al empezar la tanda ADMIN para que
# Sismografos/Alertas/Registros muestren eventos recientes. Quedan persistidas en PostgreSQL.
PULSAR_ADMIN=1 "$NODE" capturar-ui.cjs

# Recapturas puntuales cubiertas por el propio script; solo necesarias si una vista falla:
#   MODO=admin PULSAR_ADMIN=1 UI_META=/tmp/capturas-final/ui-admin-fresh.json "$NODE" capturar-ui.cjs
#   MODO=cli13m UI_META=/tmp/capturas-final/ui-13m.json "$NODE" capturar-ui.cjs
#   MODO=climd  UI_META=/tmp/capturas-final/ui-climd.json "$NODE" capturar-ui.cjs

echo '== 2/5 Servidores, nodos, infraestructura y pruebas (comandos reales) =='
"$NODE" capturar-terminales.cjs

echo '== 3/5 Figuras estaticas (ARQ/FIS/PRE/RES) =='
"$PY" preparar-estaticas.py

echo '== 4/5 Optimizacion a PNG/JPEG <= 200 KB y <= 1600 px =='
"$PY" optimizar-capturas.py

echo '== 5/5 Manifiesto + verificacion =='
"$PY" construir-manifiesto.py
sha256sum ../../manifiesto-figuras.json
echo 'Listo: entrega/11-documento-final/manifiesto-figuras.json y figuras/'
