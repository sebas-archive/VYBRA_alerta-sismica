#!/usr/bin/env bash
# Compila y carga el firmware en un detector.
# Uso: ./cargar.sh <1|2|3> [puerto]     por USB, ej: ./cargar.sh 1  o  ./cargar.sh 2 /dev/ttyUSB1
#      ./cargar.sh <1|2|3> --wifi       por red (ArduinoOTA) a 192.168.80.20N
set -euo pipefail

NODO="${1:-}"
if [[ ! "$NODO" =~ ^[123]$ ]]; then
  echo "Uso: $0 <1|2|3> [puerto | --wifi]" >&2
  exit 1
fi

DIR="$(cd "$(dirname "$0")" && pwd)"
FQBN="esp32:esp32:esp32"
SECRETOS="$DIR/detector/secretos.h"

if [[ ! -f "$SECRETOS" ]] || grep -q 'PON_AQUI_LA_CLAVE' "$SECRETOS"; then
  echo "Falta firmware/detector/secretos.h con las claves (copia secretos.ejemplo.h)" >&2
  exit 1
fi
OTA_CLAVE="$(sed -n 's/^#define OTA_CLAVE "\([^"]*\)".*/\1/p' "$SECRETOS")"
if [[ -z "$OTA_CLAVE" ]]; then
  echo "Falta OTA_CLAVE en firmware/detector/secretos.h (mira secretos.ejemplo.h)" >&2
  exit 1
fi

WIFI=0
PUERTO="${2:-}"
if [[ "$PUERTO" == "--wifi" ]]; then
  WIFI=1
  PUERTO="192.168.80.20$NODO"
elif [[ -z "$PUERTO" ]]; then
  mapfile -t PUERTOS < <(ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null || true)
  if [[ ${#PUERTOS[@]} -eq 0 ]]; then
    echo "No hay ningún ESP32 conectado (no aparece /dev/ttyUSB*). Revisa el cable USB o usa --wifi." >&2
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

if [[ $WIFI -eq 1 ]]; then
  echo "== Cargando por WiFi en $PUERTO (sismo-nodo-$NODO)"
  arduino-cli upload --fqbn "$FQBN" -p "$PUERTO" --protocol network \
    --upload-field "password=$OTA_CLAVE" --input-dir "$BUILD" "$DIR/detector"
  echo "== Listo. nodo-$NODO se reinicia con el firmware nuevo."
  exit 0
fi

echo "== Cargando en $PUERTO"
arduino-cli upload --fqbn "$FQBN" -p "$PUERTO" --input-dir "$BUILD" "$DIR/detector"

echo "== Listo. Etiqueta esta protoboard como SIS-D$NODO."
echo "   Para ver el detector: arduino-cli monitor -p $PUERTO -c baudrate=115200"
