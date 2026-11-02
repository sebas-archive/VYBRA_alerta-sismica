#!/usr/bin/env bash
# Compila y carga el firmware en un detector.
# Uso: ./cargar.sh <1|2|3> [puerto]     ej: ./cargar.sh 1  o  ./cargar.sh 2 /dev/ttyUSB1
set -euo pipefail

NODO="${1:-}"
if [[ ! "$NODO" =~ ^[123]$ ]]; then
  echo "Uso: $0 <1|2|3> [puerto]" >&2
  exit 1
fi

DIR="$(cd "$(dirname "$0")" && pwd)"
FQBN="esp32:esp32:esp32"

if [[ ! -f "$DIR/detector/secretos.h" ]] || grep -q 'PON_AQUI_LA_CLAVE' "$DIR/detector/secretos.h"; then
  echo "Falta firmware/detector/secretos.h con la clave del WiFi (copia secretos.ejemplo.h)" >&2
  exit 1
fi

PUERTO="${2:-}"
if [[ -z "$PUERTO" ]]; then
  mapfile -t PUERTOS < <(ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null || true)
  if [[ ${#PUERTOS[@]} -eq 0 ]]; then
    echo "No hay ningún ESP32 conectado (no aparece /dev/ttyUSB*). Revisa el cable USB." >&2
    exit 1
  elif [[ ${#PUERTOS[@]} -gt 1 ]]; then
    echo "Hay varias placas conectadas: ${PUERTOS[*]}. Conecta solo una o indica el puerto." >&2
    exit 1
  fi
  PUERTO="${PUERTOS[0]}"
fi

BUILD="$DIR/build/nodo-$NODO"
echo "== Compilando detector $NODO (nodo-$NODO)"
arduino-cli compile --fqbn "$FQBN" \
  --build-property "compiler.cpp.extra_flags=-DNODO=$NODO" \
  --build-path "$BUILD" "$DIR/detector"

echo "== Cargando en $PUERTO"
arduino-cli upload --fqbn "$FQBN" -p "$PUERTO" --input-dir "$BUILD" "$DIR/detector"

echo "== Listo. Etiqueta esta protoboard como SIS-D$NODO."
echo "   Para ver el detector: arduino-cli monitor -p $PUERTO -c baudrate=115200"
