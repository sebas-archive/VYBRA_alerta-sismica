#!/usr/bin/env bash
# Sondeo de /estado de los tres nodos.
# Cada consulta registra SU PROPIO instante de inicio y SU PROPIA duración.
# IMPORTANTE: las tres consultas de un ciclo son SECUENCIALES; el ciclo dura
# 3 consultas + 250 ms de espera, no 250 ms.
# uso: fis-poll.sh <segundos> <archivo.csv>
set -uo pipefail
SEG="${1:?uso: fis-poll.sh <segundos> <csv>}"
CSV="${2:?uso: fis-poll.sh <segundos> <csv>}"
DIR="entrega/05-pruebas/datos"
. "$DIR/ips.env"
mkdir -p "$(dirname "$CSV")"
echo "ciclo,t_inicio_epoch_ms,t_inicio_iso,nodo,http_code,dur_ms,rol,termino,lider,log_len,commit,pendientes" > "$CSV"
FIN=$(( $(date +%s) + SEG ))
CICLO=0
while [ "$(date +%s)" -lt "$FIN" ]; do
  CICLO=$((CICLO+1))
  for N in 1 2 3; do
    VAR="IP$N"; IP="${!VAR}"
    T0="$(date +%s%3N)"; T0ISO="$(date +%Y-%m-%dT%H:%M:%S.%3N%:z)"
    RES="$(curl -sS --max-time 2 -o "/tmp/fispoll-$N.json" -w '%{http_code} %{time_total}' "http://$IP/estado" 2>/dev/null)" || RES="000 0"
    T1="$(date +%s%3N)"
    read -r CODE DURS <<< "$RES"
    DURWALL=$((T1-T0))
    if [ "$CODE" = "200" ] && python3 -m json.tool "/tmp/fispoll-$N.json" >/dev/null 2>&1; then
      python3 - "$CICLO" "$T0" "$T0ISO" "$N" "$CODE" "$DURWALL" "/tmp/fispoll-$N.json" >> "$CSV" <<'PY'
import sys, json
ciclo, t0, iso, nodo, code, dur, path = sys.argv[1:8]
d = json.load(open(path))
print(f"{ciclo},{t0},{iso},{nodo},{code},{dur},{d['rol']},{d['termino']},"
      f"{d['lider_conocido']},{d['log_len']},{d['commit_index']},{d['pendientes']}")
PY
    else
      echo "$CICLO,$T0,$T0ISO,$N,$CODE,$DURWALL,-,-,-,-,-,-" >> "$CSV"
    fi
  done
  sleep 0.25
done
echo "== poll guardado en $CSV: $(( $(wc -l < "$CSV") - 1 )) consultas individuales en $CICLO ciclos"
