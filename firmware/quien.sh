#!/usr/bin/env bash
# Dice qué detector está conectado por USB, usando la MAC de fábrica del ESP32.
# (Las 3 placas tienen el mismo chip USB con el mismo número de serie, así que el
#  PC no las distingue por el USB; la MAC sí es única.)
#
# Uso:
#   ./quien.sh                    identifica la placa conectada
#   ./quien.sh --registrar N      guarda la placa conectada como detector N (1, 2 o 3)
#   ./quien.sh --vigilar          avisa cada vez que se conecta una placa
#   ./quien.sh [...] -p PUERTO    usa ese puerto en vez de detectarlo
#   ./quien.sh --nodo             solo imprime el número de detector (para otros scripts)
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
REGISTRO="$DIR/placas.conf"
ESPTOOL="$(ls -d "$HOME"/.arduino15/packages/esp32/tools/esptool_py/*/esptool 2>/dev/null | sort -V | tail -1)"

MODO="identificar"; NODO=""; PUERTO=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --registrar) MODO="registrar"; NODO="${2:-}"; shift 2 ;;
    --vigilar)   MODO="vigilar"; shift ;;
    --nodo)      MODO="nodo"; shift ;;
    -p)          PUERTO="${2:-}"; shift 2 ;;
    *) echo "Opción desconocida: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$ESPTOOL" ]]; then
  echo "No encuentro esptool (viene con el soporte ESP32 de arduino-cli)." >&2; exit 1
fi

puerto_unico() {
  local p=()
  mapfile -t p < <(ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null || true)
  if [[ ${#p[@]} -eq 0 ]]; then echo "No hay ninguna placa conectada por USB." >&2; return 1; fi
  if [[ ${#p[@]} -gt 1 ]]; then echo "Hay varias placas conectadas (${p[*]}). Deja solo una o usa -p PUERTO." >&2; return 1; fi
  echo "${p[0]}"
}

leer_mac() {   # $1 = puerto → imprime la MAC en minúsculas
  local p="$1" salida
  if [[ ! -r "$p" || ! -w "$p" ]]; then
    echo "Sin permiso sobre $p. Corre: sudo setfacl -m u:$USER:rw $p" >&2; return 1
  fi
  salida="$(timeout 20 "$ESPTOOL" --port "$p" read-mac 2>&1)" || {
    echo "No pude leer la placa en $p. Si sigue fallando, mantén presionado BOOT al conectarla." >&2; return 1; }
  grep -oiE '([0-9a-f]{2}:){5}[0-9a-f]{2}' <<<"$salida" | head -1 | tr 'A-F' 'a-f'
}

nodo_de_mac() {   # $1 = MAC → imprime N o nada
  [[ -f "$REGISTRO" ]] || return 0
  awk -v m="$1" '!/^#/ && tolower($1) == m { print $2; exit }' "$REGISTRO"
}

identificar() {   # $1 = puerto
  local mac n
  mac="$(leer_mac "$1")" || return 1
  n="$(nodo_de_mac "$mac")"
  if [[ -n "$n" ]]; then
    echo "Detector $n (SIS-D$n) conectado en $1 · MAC $mac"
  else
    echo "Placa sin registrar en $1 · MAC $mac"
    echo "Regístrala con: ./quien.sh --registrar N   (N = 1, 2 o 3)"
  fi
}

case "$MODO" in
  identificar)
    [[ -n "$PUERTO" ]] || PUERTO="$(puerto_unico)"
    identificar "$PUERTO"
    ;;
  nodo)
    [[ -n "$PUERTO" ]] || PUERTO="$(puerto_unico)"
    mac="$(leer_mac "$PUERTO")"
    n="$(nodo_de_mac "$mac")"
    [[ -n "$n" ]] || { echo "La placa conectada (MAC $mac) no está registrada. Usa ./quien.sh --registrar N" >&2; exit 2; }
    echo "$n"
    ;;
  registrar)
    [[ "$NODO" =~ ^[123]$ ]] || { echo "Uso: $0 --registrar <1|2|3>" >&2; exit 1; }
    [[ -n "$PUERTO" ]] || PUERTO="$(puerto_unico)"
    mac="$(leer_mac "$PUERTO")"
    previo="$(nodo_de_mac "$mac")"
    if [[ -n "$previo" && "$previo" != "$NODO" ]]; then
      echo "Esta placa ya está registrada como detector $previo. Si de verdad quieres cambiarla, borra su línea de placas.conf." >&2; exit 1
    fi
    otra="$( [[ -f "$REGISTRO" ]] && awk -v n="$NODO" '!/^#/ && $2 == n { print $1; exit }' "$REGISTRO" || true)"
    if [[ -n "$otra" && "$otra" != "$mac" ]]; then
      echo "El detector $NODO ya está asignado a otra placa (MAC $otra). Borra esa línea de placas.conf si la cambiaste." >&2; exit 1
    fi
    if [[ -z "$previo" ]]; then
      [[ -f "$REGISTRO" ]] || printf '# MAC del ESP32 → número de detector. Lo escribe ./quien.sh --registrar N\n' > "$REGISTRO"
      echo "$mac $NODO" >> "$REGISTRO"
    fi
    echo "Listo: la placa con MAC $mac es el detector $NODO. Etiquétala SIS-D$NODO."
    ;;
  vigilar)
    echo "Esperando placas… (Ctrl+C para salir)"
    declare -A vistos=()
    while true; do
      for p in /dev/ttyUSB* /dev/ttyACM*; do
        [[ -e "$p" ]] || continue
        if [[ -z "${vistos[$p]:-}" ]]; then
          vistos[$p]=1
          sleep 1   # deja que el puerto termine de aparecer
          if msg="$(identificar "$p" 2>&1)"; then :; fi
          echo "$msg"
          command -v notify-send >/dev/null && notify-send "Sismógrafo" "$(head -1 <<<"$msg")" || true
        fi
      done
      for p in "${!vistos[@]}"; do [[ -e "$p" ]] || { unset 'vistos[$p]'; echo "Se desconectó la placa de $p"; }; done
      sleep 1
    done
    ;;
esac
