#!/usr/bin/env bash
# Captura headless y validación REAL de la imagen:
#  - formato PNG y dimensiones mínimas
#  - número de colores (descarta imagen en blanco)
#  - desviación estándar (descarta imagen casi uniforme)
#  - cuerpo HTML de la URL no vacío
# uso: fis-shot.sh <url> <salida.png> [ancho] [alto]
set -uo pipefail
URL="$1"; OUT="${2:?uso: fis-shot.sh <url> <salida.png> [w] [h]}"
W="${3:-1400}"; H="${4:-900}"
# Firefox headless exige RUTA ABSOLUTA en --screenshot; con ruta relativa no genera archivo.
OUTDIR="$(dirname "$OUT")"
mkdir -p "$OUTDIR"
OUT="$(cd "$OUTDIR" && pwd)/$(basename "$OUT")"
PROF="$(mktemp -d)"
timeout 90 firefox --headless --no-remote --profile "$PROF" \
  --window-size="$W,$H" --screenshot "$OUT" "$URL" >/dev/null 2>&1 || true
rm -rf "$PROF"

[ -s "$OUT" ] || { echo "FALLO: captura no generada ($OUT)" >&2; exit 1; }

FMT="$(identify -format '%m' "$OUT" 2>/dev/null || echo '?')"
DIM="$(identify -format '%wx%h' "$OUT" 2>/dev/null || echo '0x0')"
SD="$(identify -format '%[standard-deviation]' "$OUT" 2>/dev/null | awk '{printf "%d", $1}')"
K="$(identify -format '%k' "$OUT" 2>/dev/null || echo 0)"
echo "imagen: formato=$FMT dimensiones=$DIM colores=$K stddev=${SD:-0} archivo=$OUT"

[ "$FMT" = "PNG" ] || { echo "FALLO: no es un PNG válido" >&2; exit 1; }
python3 - "$DIM" "$W" "$H" <<'PY' || exit 1
import sys
dim, w, h = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
try:
    aw, ah = [int(x) for x in dim.split('x')]
except Exception:
    print("FALLO: dimensiones ilegibles"); sys.exit(1)
print(f"dimensiones {aw}x{ah} (mínimo exigido {w}x{h})")
sys.exit(0 if aw >= w and ah >= h else 1)
PY
[ "${K:-0}" -gt 1000 ] || { echo "FALLO: solo $K colores -> imagen probablemente en blanco" >&2; exit 1; }
[ "${SD:-0}" -gt 3000 ] || { echo "FALLO: desviación $SD demasiado baja -> imagen sin contenido" >&2; exit 1; }

# El HTML de la URL debe existir (la captura se corrobora con el contenido servido)
CODE="$(curl -sS --max-time 3 -o /tmp/fis-shot.html -w '%{http_code}' "$URL" 2>/dev/null || echo 000)"
[ "$CODE" = "200" ] || { echo "FALLO: la URL respondió HTTP $CODE" >&2; exit 1; }
[ -s /tmp/fis-shot.html ] || { echo "FALLO: HTML vacío en $URL" >&2; exit 1; }
echo "HTML: HTTP=200 bytes=$(stat -c%s /tmp/fis-shot.html)"
echo "OK: captura válida y con contenido -> $OUT"
