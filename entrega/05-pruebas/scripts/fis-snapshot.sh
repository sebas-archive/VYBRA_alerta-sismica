#!/usr/bin/env bash
# Snapshot de los 3 nodos: estado, log, sucesos y alertas.
# Falla (exit 1) si CUALQUIER consulta falla; no declara snapshot completo si falta algo.
# uso: fis-snapshot.sh <prefijo>     (p.ej. FIS-01-pre)
set -uo pipefail
PREF="${1:?uso: fis-snapshot.sh <prefijo>}"
DIR="entrega/05-pruebas/datos"
. "$DIR/ips.env"
FALLOS=0; TOTAL=0
LOG="entrega/05-pruebas/logs/$PREF-snapshot.log"
mkdir -p "$DIR" entrega/05-pruebas/logs
: > "$LOG"
for N in 1 2 3; do
  VAR="IP$N"; IP="${!VAR}"
  for RUTA in estado log sucesos alertas; do
    Q=""
    [ "$RUTA" = "log" ] && Q="?desde=1"
    [ "$RUTA" = "sucesos" ] && Q="?desde=0"
    DEST="$DIR/$PREF-nodo$N-$RUTA.json"
    TOTAL=$((TOTAL+1))
    if ! bash entrega/05-pruebas/scripts/fis-http.sh "http://$IP/$RUTA$Q" "$DEST" >>"$LOG" 2>&1; then
      echo "FALLO: $PREF nodo $N ruta /$RUTA" | tee -a "$LOG" >&2
      FALLOS=$((FALLOS+1))
    fi
  done
done
echo "== snapshot $PREF: $((TOTAL-FALLOS))/$TOTAL consultas OK (log: $LOG)"
if [ "$FALLOS" -ne 0 ]; then
  echo "FALLO: snapshot $PREF INCOMPLETO ($FALLOS consultas fallidas)" >&2
  exit 1
fi
