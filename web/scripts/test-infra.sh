#!/usr/bin/env bash
# Prueba de integración REAL: apagar/encender cada servidor con Docker. Usa un proyecto de compose aislado ("vybraint")
# con otros nombres de contenedor y puertos y sus propios volúmenes (se destruyen al terminar); no toca el stack normal.
#   uso: npm run test:infra            (todas)      npm run test:infra -- --test-name-pattern='^4\.'   (solo algunas)
set -euo pipefail
cd "$(dirname "$0")/../.."
export COMPOSE_PROJECT_NAME=vybraint PREFIJO=vybraint
export PUERTO_PANEL=18095 PUERTO_NODO1=19001 PUERTO_NODO2=19002 PUERTO_NODO3=19003
export PUERTO_SERVIDOR1=18101 PUERTO_SERVIDOR2=18102 PUERTO_SERVIDOR3=18103
export CONTROL_TOKEN="prueba-$(date +%s)" DB_PASSWORD="prueba-$(date +%s)"
limpiar() { docker compose -p vybraint down -v --remove-orphans >/dev/null 2>&1 || true; }
trap limpiar EXIT
limpiar
docker compose -p vybraint up -d --build
export PANEL_URL="http://127.0.0.1:${PUERTO_PANEL}" REQUIRE_INFRA=1
cd web
node --test "$@" test/infra-docker.test.js
