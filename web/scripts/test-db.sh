#!/usr/bin/env bash
# Ejecuta TODAS las pruebas con tres PostgreSQL reales (uno por servidor), en contenedores efímeros.
# Las pruebas que necesitan base de datos FALLAN si falta alguna (REQUIRE_DB=1): no se omiten.
# La clave de estos contenedores es solo de prueba (se destruyen al terminar y no publican nada fuera de localhost).
#   uso: npm run test:db
set -euo pipefail
IMG="${PG_IMAGE:-postgres:16-alpine}"
CLAVE_PRUEBA="prueba-efimera"
cd "$(dirname "$0")/.."
limpiar() { for i in 1 2 3; do docker rm -f "vybra-test-pg$i" >/dev/null 2>&1 || true; done; }
trap limpiar EXIT
limpiar
for i in 1 2 3; do
  docker run -d --rm --name "vybra-test-pg$i" -p "127.0.0.1:5443$i:5432" \
    -e POSTGRES_PASSWORD="$CLAVE_PRUEBA" -e POSTGRES_DB=vybra "$IMG" >/dev/null
done
for i in 1 2 3; do
  for _ in $(seq 1 60); do
    docker exec "vybra-test-pg$i" pg_isready -U postgres -d vybra >/dev/null 2>&1 && break
    sleep 1
  done
done
sleep 2   # pg_isready responde antes de aceptar conexiones desde el anfitrión en algunas imágenes
export REQUIRE_DB=1
for i in 1 2 3; do export "TEST_DATABASE_URL_$i=postgres://postgres:$CLAVE_PRUEBA@127.0.0.1:5443$i/vybra"; done
node --test "test/*.test.js"
