#!/usr/bin/env bash
# GET validado: exige HTTP 200, cuerpo no vacío y JSON válido.
# uso: fis-http.sh <url> <archivo_salida>
set -uo pipefail
URL="$1"; OUT="$2"; TMP="$OUT.tmp"
TS="$(date +%Y-%m-%dT%H:%M:%S.%3N%:z)"
RES="$(curl -sS --max-time 3 -o "$TMP" -w '%{http_code} %{time_total}' "$URL" 2>/dev/null)" || RES="000 0"
read -r HTTP DUR <<< "$RES"
if [ "$HTTP" != "200" ]; then
  echo "FALLO  $TS  HTTP=$HTTP  $URL" >&2; rm -f "$TMP"; exit 1
fi
if [ ! -s "$TMP" ]; then
  echo "FALLO  $TS  cuerpo vacío  $URL" >&2; rm -f "$TMP"; exit 1
fi
if ! python3 -m json.tool "$TMP" >/dev/null 2>&1; then
  echo "FALLO  $TS  JSON inválido  $URL" >&2; rm -f "$TMP"; exit 1
fi
mv "$TMP" "$OUT"
echo "OK     $TS  HTTP=$HTTP  dur=${DUR}s  $URL -> $OUT"
