#!/usr/bin/env bash
# Compila y carga el firmware en un detector.
# Uso: ./cargar.sh                     por USB, detecta qué detector es por su MAC (placas.conf)
#      ./cargar.sh <1|2|3> [puerto]     por USB; la primera vez registra la placa como ese detector
#      ./cargar.sh <1|2|3> --wifi       por red (ArduinoOTA); la IP se busca como sismo-nodo-N.local
#                                       o se da con IP=x.x.x.x ./cargar.sh N --wifi
#      --forzar                         carga aunque la placa esté registrada como otro detector
set -euo pipefail

NODO=""; PUERTO=""; WIFI=0; FORZAR=0
for arg in "$@"; do
  case "$arg" in
    1|2|3) NODO="$arg" ;;
    --wifi) WIFI=1 ;;
    --forzar) FORZAR=1 ;;
    /dev/*) PUERTO="$arg" ;;
    *) echo "Uso: $0 [1|2|3] [puerto | --wifi] [--forzar]" >&2; exit 1 ;;
  esac
done
if [[ $WIFI -eq 1 && -z "$NODO" ]]; then
  echo "Por WiFi hay que decir qué detector: $0 <1|2|3> --wifi" >&2; exit 1
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

if [[ $WIFI -eq 1 ]]; then
  PUERTO="${IP:-$(getent hosts "sismo-nodo-$NODO.local" | awk '{print $1; exit}')}"
  if [[ -z "$PUERTO" ]]; then
    echo "No encuentro sismo-nodo-$NODO.local. Mira su IP en el monitor serie y usa: IP=x.x.x.x $0 $NODO --wifi" >&2
    exit 1
  fi
else
  if [[ -z "$PUERTO" ]]; then
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
  # Qué detector es esta placa según su MAC
  echo "== Identificando la placa en $PUERTO"
  set +e; REGISTRADO="$("$DIR/quien.sh" --nodo -p "$PUERTO" 2>/dev/null)"; COD=$?; set -e
  if [[ $COD -ne 0 && $COD -ne 2 ]]; then
    "$DIR/quien.sh" -p "$PUERTO" >/dev/null   # repite para mostrar el motivo (permiso, BOOT…)
    exit 1
  fi
  if [[ -z "$NODO" ]]; then
    if [[ -z "$REGISTRADO" ]]; then
      echo "Esta placa no está registrada. Dime cuál es: $0 <1|2|3>" >&2; exit 1
    fi
    NODO="$REGISTRADO"
    echo "   Es el detector $NODO (SIS-D$NODO)."
  elif [[ -n "$REGISTRADO" && "$REGISTRADO" != "$NODO" && $FORZAR -eq 0 ]]; then
    echo "Ojo: esta placa está registrada como detector $REGISTRADO, no $NODO." >&2
    echo "Usa $0 $REGISTRADO, o agrega --forzar si de verdad quieres cambiarla." >&2
    exit 1
  fi
fi

BUILD="$DIR/build/nodo-$NODO"
echo "== Compilando detector $NODO (nodo-$NODO)"
arduino-cli compile --fqbn "$FQBN" \
  --build-property "compiler.cpp.extra_flags=-DNODO=$NODO" \
  --build-path "$BUILD" "$DIR/detector"

if [[ $WIFI -eq 1 ]]; then
  echo "== Cargando por WiFi en $PUERTO (sismo-nodo-$NODO)"
  # espota directo a la IP resuelta (sismo-nodo-N.local por mDNS, o IP=x.x.x.x). La placa se conecta de vuelta al PC
  # por TCP en el puerto 32323, que el firewall debe permitir desde la red de las placas:
  #   sudo ufw allow from <tu subred>/24 to any port 32323 proto tcp
  ESPOTA="$(ls "$HOME"/.arduino15/packages/esp32/hardware/esp32/*/tools/espota.py 2>/dev/null | sort -V | tail -1)"
  [[ -n "$ESPOTA" ]] || { echo "No encuentro espota.py (soporte ESP32 de arduino-cli)." >&2; exit 1; }
  if ! timeout 120 python3 -I "$ESPOTA" -i "$PUERTO" -p 3232 -P 32323 -a "$OTA_CLAVE" -f "$BUILD/detector.ino.bin"; then
    echo "La carga por WiFi falló. Revisa que el puerto 32323 esté abierto en el firewall:" >&2
    echo "  sudo ufw allow from <tu subred>/24 to any port 32323 proto tcp" >&2
    exit 1
  fi
  echo "== Listo. nodo-$NODO se reinicia con el firmware nuevo."
  exit 0
fi

echo "== Cargando en $PUERTO"
arduino-cli upload --fqbn "$FQBN" -p "$PUERTO" --input-dir "$BUILD" "$DIR/detector"

if [[ -z "${REGISTRADO:-}" ]]; then
  "$DIR/quien.sh" --registrar "$NODO" -p "$PUERTO" | sed 's/^/   /'
fi
echo "== Listo: detector $NODO (SIS-D$NODO) cargado."
echo "   Para ver el detector: arduino-cli monitor -p $PUERTO -c baudrate=115200"
