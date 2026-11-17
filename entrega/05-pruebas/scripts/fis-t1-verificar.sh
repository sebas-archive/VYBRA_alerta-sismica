#!/usr/bin/env bash
# T1 — Verificación del evento generado con el pulsador en el Nodo 2 (líder).
# Requiere: FIS-01-pre-nodoN-*.json (baseline) y que ya se haya pulsado.
# Toma snapshots FIS-01-post y valida:
#   - mismo id de evento en los tres nodos
#   - id con prefijo nodo-2-
#   - nivel y pga según la fórmula real
#   - log_len y commit_index incrementados en 1 en los tres
#   - sin alerta y sin entradas pendientes
#   - /api/estado coherente
set -uo pipefail
DATA="entrega/05-pruebas/datos"
SCRIPTS="entrega/05-pruebas/scripts"
SUM="entrega/05-pruebas/logs/FIS-01-verificacion.txt"
: > "$SUM"
FALLOS=0
ok()    { echo "   OK: $*"    | tee -a "$SUM"; }
fallo() { echo "   FALLO: $*" | tee -a "$SUM"; FALLOS=$((FALLOS+1)); }
paso()  { echo "" | tee -a "$SUM"; echo "== $* ==" | tee -a "$SUM"; }

paso "T1 verificación  $(date -Ins)"

# ---------- snapshot posterior ----------
paso "Snapshot posterior FIS-01-post"
if bash "$SCRIPTS/fis-snapshot.sh" FIS-01-post 2>&1 | tee -a "$SUM"; then ok "snapshot posterior completo"; else fallo "snapshot posterior incompleto"; fi

# ---------- baseline ----------
PRE_LOG="$(jq -r '.log_len' "$DATA/FIS-01-pre-nodo2-log.json" 2>/dev/null)"
PRE_CMT="$(jq -r '.commit_index' "$DATA/FIS-01-pre-nodo2-log.json" 2>/dev/null)"
IDX=$(( ${PRE_LOG:-0} + 1 ))
echo "   baseline: log_len=$PRE_LOG commit_index=$PRE_CMT  -> se espera la entrada índice $IDX" | tee -a "$SUM"

# ---------- entrada nueva en cada nodo ----------
paso "Entrada nueva en /log de cada nodo (índice $IDX)"
IDS=""
for N in 1 2 3; do
  F="$DATA/FIS-01-post-nodo$N-log.json"
  LINE="$(jq -r --argjson i "$IDX" '.entradas[] | select(.i==$i) | [.i,.T,.clase,(.ev.id // "-"),(.ev.nodo // -1),(.ev.nivel // -1),(.ev.pga // -1),(.ev.duracion_ms // -1),(.en_alerta // false)] | @tsv' "$F" 2>/dev/null)"
  if [ -z "$LINE" ]; then fallo "nodo $N no tiene la entrada índice $IDX"; continue; fi
  echo "   nodo $N: $LINE" | tee -a "$SUM"
  ID="$(echo "$LINE" | cut -f4)"
  IDS="$IDS $ID"
done

# ---------- mismo id en los tres ----------
paso "Mismo identificador en los tres nodos"
UNIQ="$(echo $IDS | tr ' ' '\n' | grep -v '^-$' | grep -v '^$' | sort -u | wc -l)"
if [ "$UNIQ" -eq 1 ] && [ -n "$(echo $IDS | tr -d ' ')" ]; then
  ID_UNICO="$(echo $IDS | tr ' ' '\n' | grep -v '^-$' | head -1)"
  ok "los tres comparten el id: $ID_UNICO"
  case "$ID_UNICO" in
    nodo-2-*) ok "el id corresponde al Nodo 2 (emisor esperado)";;
    *)        fallo "el id no empieza por nodo-2-: $ID_UNICO";;
  esac
else
  fallo "ids distintos o ausentes entre nodos:$IDS"
fi

# ---------- nivel y pga según la fórmula ----------
paso "Nivel y PGA según la implementación (nivel=min(10,1+ms/450), pga=0.028·nivel+0.015)"
for N in 1 2 3; do
  F="$DATA/FIS-01-post-nodo$N-log.json"
  jq -r --argjson i "$IDX" '.entradas[] | select(.i==$i) | "\(.ev.duracion_ms) \(.ev.nivel) \(.ev.pga)"' "$F" 2>/dev/null \
  | while read -r DUR NIV PGA; do
      [ "$DUR" = "null" ] && continue
      ESP_NIV=$(( 1 + DUR / 450 )); [ "$ESP_NIV" -gt 10 ] && ESP_NIV=10
      ESP_PGA="$(python3 -c "print(round(0.028*$ESP_NIV+0.015,3))")"
      if [ "$NIV" = "$ESP_NIV" ] && python3 -c "import sys; sys.exit(0 if abs(float('$PGA')-float('$ESP_PGA'))<1e-9 else 1)"; then
        echo "   nodo $N: duracion=${DUR}ms nivel=$NIV (esp $ESP_NIV) pga=$PGA (esp $ESP_PGA) OK" | tee -a "$SUM"
      else
        echo "   nodo $N: duracion=${DUR}ms nivel=$NIV (esp $ESP_NIV) pga=$PGA (esp $ESP_PGA) FALLO" | tee -a "$SUM"
        echo "FALLO" >> /tmp/fis-t1-formula.flag
      fi
    done
done
[ -f /tmp/fis-t1-formula.flag ] && { FALLOS=$((FALLOS+1)); rm -f /tmp/fis-t1-formula.flag; }

# ---------- emisor, receptor, t y t_lider ----------
paso "Emisor, receptor y marcas de tiempo del evento (nodo 2)"
for N in 1 2 3; do
  F="$DATA/FIS-01-post-nodo$N-log.json"
  EV="$(jq -r --argjson i "$IDX" '.entradas[] | select(.i==$i) | [.ev.nodo, .ev.recibido_por, .ev.t, .ev.t_lider, .T] | @tsv' "$F" 2>/dev/null)"
  if [ -z "$EV" ]; then fallo "nodo $N: sin datos de evento"; continue; fi
  set -- $EV; EVNODO="$1"; EVREC="$2"; EVT="$3"; EVTL="$4"; EVTERM="$5"
  [ "$EVNODO" = "2" ] && ok "nodo $N: ev.nodo=2 (emisor correcto)" || fallo "nodo $N: ev.nodo=$EVNODO (esperado 2)"
  [ "$EVREC" = "2" ]  && ok "nodo $N: ev.recibido_por=2" || fallo "nodo $N: ev.recibido_por=$EVREC (esperado 2)"
  [ "$EVT" != "0" ] && [ "$EVT" != "null" ] && ok "nodo $N: ev.t=$EVT (hora del detector, NTP)" || fallo "nodo $N: ev.t inválido ($EVT)"
  [ "$EVTL" != "0" ] && [ "$EVTL" != "null" ] && ok "nodo $N: ev.t_lider=$EVTL (hora del líder al aceptar)" || fallo "nodo $N: ev.t_lider inválido ($EVTL)"
  [ "$EVTERM" = "739" ] && ok "nodo $N: T=739 (término del líder)" || fallo "nodo $N: T=$EVTERM (esperado 739)"
done

# ---------- log_len y commit_index ----------
paso "Incremento de log_len y commit_index"
for N in 1 2 3; do
  E="$DATA/FIS-01-post-nodo$N-estado.json"
  LL="$(jq -r '.log_len' "$E")"; CM="$(jq -r '.commit_index' "$E")"; PD="$(jq -r '.pendientes' "$E")"
  if [ "$LL" = "$IDX" ] && [ "$CM" = "$IDX" ]; then
    ok "nodo $N: log_len=$LL commit_index=$CM (incrementado en 1)"
  else
    fallo "nodo $N: log_len=$LL commit_index=$CM (esperado $IDX/$IDX)"
  fi
  [ "$PD" = "0" ] && ok "nodo $N: pendientes=0" || fallo "nodo $N: pendientes=$PD"
done

# ---------- sin alerta ----------
paso "Sin alerta generada"
for N in 1 2 3; do
  A="$(jq -r '.alertas | length' "$DATA/FIS-01-post-nodo$N-alertas.json" 2>/dev/null)"
  EN="$(jq -r --argjson i "$IDX" '[.entradas[] | select(.i==$i) | .en_alerta] | .[0]' "$DATA/FIS-01-post-nodo$N-log.json" 2>/dev/null)"
  if [ "$A" = "0" ] && [ "$EN" = "false" ]; then ok "nodo $N: 0 alertas y en_alerta=false"
  else fallo "nodo $N: alertas=$A en_alerta=$EN"; fi
done

# ---------- agregador ----------
paso "Estado del agregador"
CODE="$(curl -sS --max-time 3 -o "$DATA/FIS-01-api-estado.json" -w '%{http_code}' http://localhost:8090/api/estado 2>/dev/null || echo 000)"
if [ "$CODE" = "200" ]; then
  ok "/api/estado HTTP 200"
  python3 -m json.tool "$DATA/FIS-01-api-estado.json" >/dev/null 2>&1 && ok "JSON válido" || fallo "JSON inválido"
  jq -e '.quorum==true' "$DATA/FIS-01-api-estado.json" >/dev/null && ok "quorum=true" || fallo "quorum!=true"
  jq -e '.lider==2' "$DATA/FIS-01-api-estado.json" >/dev/null && ok "lider=2" || fallo "lider!=2"
  jq -r '.nodos[] | "   nodo \(.n) log=\(.estado.log_len) commit=\(.estado.commit_index)"' "$DATA/FIS-01-api-estado.json" | tee -a "$SUM"
  CP="$(jq -r '.nodos[].estado.commit_index' "$DATA/FIS-01-api-estado.json" | sort -u | wc -l)"
  [ "$CP" -eq 1 ] && ok "commit_index coherente en el agregador" || fallo "commit_index incoherente en el agregador"
else
  fallo "/api/estado HTTP $CODE"
fi

paso "RESUMEN T1"
if [ "$FALLOS" -eq 0 ]; then
  echo "   T1 APROBADO: evento replicado y comprometido en los tres nodos, sin alerta." | tee -a "$SUM"
  exit 0
else
  echo "   T1 CON FALLOS: $FALLOS comprobación(es). DETENERSE." | tee -a "$SUM"
  exit 1
fi
