#!/usr/bin/env bash
# Verifica que cada IP responde y que /estado.nodo coincide con el número esperado.
set -uo pipefail
DIR="entrega/05-pruebas/datos"
. "$DIR/ips.env"
FALLO=0
echo "== Validación de identidad y conectividad de los tres nodos"
for N in 1 2 3; do
  VAR="IP$N"; IP="${!VAR}"
  BODY="$DIR/FIS-00-validacion-nodo$N.json"
  if ! bash entrega/05-pruebas/scripts/fis-http.sh "http://$IP/estado" "$BODY" >/dev/null; then
    echo "  Nodo $N ($IP): FALLO de HTTP/JSON"; FALLO=1; continue
  fi
  GOT="$(jq -r '.nodo' "$BODY")"
  IPR="$(jq -r '.ip' "$BODY")"
  HORA="$(jq -r '.con_hora' "$BODY")"
  ROL="$(jq -r '.rol' "$BODY")"
  TERM="$(jq -r '.termino' "$BODY")"
  LLEN="$(jq -r '.log_len' "$BODY")"
  CMM="$(jq -r '.commit_index' "$BODY")"
  if [ "$GOT" != "$N" ]; then
    echo "  Nodo $N ($IP): FALLO identidad (reporta nodo=$GOT)"; FALLO=1; continue
  fi
  if [ "$IPR" != "$IP" ]; then
    echo "  Nodo $N ($IP): FALLO la IP del JSON ($IPR) no coincide"; FALLO=1; continue
  fi
  if [ "$HORA" != "true" ]; then
    echo "  Nodo $N ($IP): FALLO con_hora=$HORA (NTP no sincronizado)"; FALLO=1; continue
  fi
  echo "  Nodo $N ($IP): OK  rol=$ROL termino=$TERM log_len=$LLEN commit=$CMM con_hora=$HORA"
done
[ "$FALLO" -eq 0 ] || { echo "FALLO: validación de nodos" >&2; exit 1; }
echo "== Los tres nodos responden y reportan su identidad correcta"
