#!/usr/bin/env bash
# P0 — Preparación de la campaña: baseline, agregador, validaciones y capturas.
# Solo hace GET y arranca el agregador. NO pulsa botones, NO usa /control,
# NO desconecta ni reinicia nodos, NO toca NVS, firmware ni configuración.
set -uo pipefail
ROOT="$(pwd)"
DATA="entrega/05-pruebas/datos"
LOGS="entrega/05-pruebas/logs"
EVID="entrega/04-evidencias/F-fisicas"
SCRIPTS="entrega/05-pruebas/scripts"
SUM="$LOGS/FIS-00-p0.txt"
mkdir -p "$DATA" "$LOGS" "$EVID"
: > "$SUM"
FALLOS=0
paso() { echo "" | tee -a "$SUM"; echo "== $* ==" | tee -a "$SUM"; }
fallo() { echo "   FALLO: $*" | tee -a "$SUM" >&2; FALLOS=$((FALLOS+1)); }
ok()    { echo "   OK: $*" | tee -a "$SUM"; }

paso "P0 inicio $(date -Ins)  commit=$(git rev-parse --short HEAD)  version=$(git describe --tags --always)"

# ---------- 1) puerto libre ----------
if ss -ltn 2>/dev/null | grep -q ':8090 '; then
  fallo "el puerto 8090 ya está ocupado; no se toca el proceso existente"
else
  ok "puerto 8090 libre"
fi

# ---------- 2) IPs ----------
paso "Resolución de IPs (mDNS)"
if bash "$SCRIPTS/fis-ips.sh" 2>&1 | tee -a "$SUM"; then ok "IPs resueltas"; else fallo "resolución de IPs"; fi

# ---------- 3) validación de nodos ----------
paso "Validación de identidad y HTTP de los tres nodos"
if bash "$SCRIPTS/fis-validar.sh" 2>&1 | tee -a "$SUM"; then ok "los tres nodos validados"; else fallo "validación de nodos"; fi

# ---------- 4) snapshot previo ----------
paso "Snapshot previo FIS-00-pre"
if bash "$SCRIPTS/fis-snapshot.sh" FIS-00-pre 2>&1 | tee -a "$SUM"; then ok "snapshot previo completo"; else fallo "snapshot previo incompleto"; fi

# ---------- 5) coherencia de línea base ----------
paso "Coherencia de línea base (log_len y commit_index)"
BASE_OK=1
for RUTA in log_len commit_index termino; do
  VALS=""
  for N in 1 2 3; do
    V="$(jq -r ".$RUTA" "$DATA/FIS-00-pre-nodo$N-estado.json" 2>/dev/null)"
    VALS="$VALS $V"
  done
  UNIQ="$(echo $VALS | tr ' ' '\n' | sort -u | tr '\n' ' ' | xargs)"
  echo "   $RUTA: nodos=$VALS" | tee -a "$SUM"
  case "$UNIQ" in
    *" "*) BASE_OK=0 ;;
  esac
done
if [ "$BASE_OK" -eq 1 ]; then ok "los tres coinciden en término, log_len y commit_index"; else fallo "incoherencia de línea base"; fi

# ---------- 6) arranque del agregador ----------
paso "Arranque del agregador (solo GET durante la validación)"
. "$DATA/ips.env"
NODOS="http://$IP1,http://$IP2,http://$IP3"
AGGLOG="$ROOT/$LOGS/FIS-00-agregador.log"
AGGPID="$ROOT/$LOGS/FIS-00-agregador.pid"
: > "$AGGLOG"
( cd "$ROOT/web" && env NODOS="$NODOS" nohup node server.js >> "$AGGLOG" 2>&1 & echo $! > "$AGGPID" )
sleep 1
if [ -s "$AGGPID" ] && kill -0 "$(cat "$AGGPID")" 2>/dev/null; then
  ok "agregador arrancado, PID=$(cat "$AGGPID"), log=$AGGLOG"
else
  fallo "el agregador no arrancó (ver $AGGLOG)"
fi

# ---------- 7) espera a /api/estado ----------
CODE=000
for _ in $(seq 1 50); do
  CODE="$(curl -sS --max-time 3 -o "$DATA/FIS-00-api-estado.json" -w '%{http_code}' http://localhost:8090/api/estado 2>/dev/null || echo 000)"
  [ "$CODE" = "200" ] && break
  sleep 0.5
done
if [ "$CODE" != "200" ]; then
  fallo "/api/estado no respondió 200 (último código: $CODE)"
else
  ok "/api/estado respondió 200"
  if python3 -m json.tool "$DATA/FIS-00-api-estado.json" >/dev/null 2>&1; then ok "JSON de /api/estado válido"; else fallo "JSON de /api/estado inválido"; fi

  # ---------- 8) validaciones de contenido ----------
  paso "Contenido de /api/estado"
  chk() { # chk <descripcion> <expresion jq>
    if jq -e "$2" "$DATA/FIS-00-api-estado.json" >/dev/null 2>&1; then ok "$1"; else fallo "$1"; fi
  }
  chk "quorum == true"            '.quorum == true'
  chk "lider == 2"                '.lider == 2'
  chk "exactamente 3 nodos"       '(.nodos | length) == 3'
  chk "ids de nodo 1,2,3"         '([.nodos[].n] | sort) == [1,2,3]'
  chk "los 3 alcanzables"         '([.nodos[] | .alcanzable] | all)'
  chk "estado.nodo == n en cada uno" '([.nodos[] | (.estado.nodo == .n)] | all)'
  chk "fuente no nula"            '.fuente != null'
  chk "log_len coherente"         '([.nodos[].estado.log_len] | unique | length) == 1'
  chk "commit_index coherente"    '([.nodos[].estado.commit_index] | unique | length) == 1'
  chk "con_hora en los tres"      '([.nodos[].estado.con_hora] | all)'

  echo "   líder=$(jq -r '.lider' "$DATA/FIS-00-api-estado.json")  fuente=$(jq -r '.fuente' "$DATA/FIS-00-api-estado.json")  quorum=$(jq -r '.quorum' "$DATA/FIS-00-api-estado.json")" | tee -a "$SUM"
  jq -r '.nodos[] | "   nodo \(.n) alcanzable=\(.alcanzable) rol=\(.estado.rol) termino=\(.estado.termino) log=\(.estado.log_len) commit=\(.estado.commit_index)"' "$DATA/FIS-00-api-estado.json" | tee -a "$SUM"
fi

# ---------- 9) snapshot posterior ----------
paso "Snapshot posterior FIS-00-post"
if bash "$SCRIPTS/fis-snapshot.sh" FIS-00-post 2>&1 | tee -a "$SUM"; then ok "snapshot posterior completo"; else fallo "snapshot posterior incompleto"; fi

# ---------- 10) capturas ----------
paso "Capturas del panel y de la vista pública"
if bash "$SCRIPTS/fis-shot.sh" "http://localhost:8090/" "$EVID/cap-FIS-00-panel.png" 2>&1 | tee -a "$SUM"; then ok "captura del panel válida"; else fallo "captura del panel"; fi
if bash "$SCRIPTS/fis-shot.sh" "http://localhost:8090/publico" "$EVID/cap-FIS-00-publico.png" 2>&1 | tee -a "$SUM"; then ok "captura de /publico válida"; else fallo "captura de /publico"; fi

# ---------- resumen ----------
paso "RESUMEN P0"
if [ "$FALLOS" -eq 0 ]; then
  echo "   P0 COMPLETADO: todas las comprobaciones pasaron." | tee -a "$SUM"
  echo "   Agregador activo (PID $(cat "$AGGPID" 2>/dev/null)). Para detenerlo: kill \$(cat $AGGPID)" | tee -a "$SUM"
  exit 0
else
  echo "   P0 CON FALLOS: $FALLOS comprobación(es) fallida(s). NO se continúa a T1." | tee -a "$SUM"
  exit 1
fi
