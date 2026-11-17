#!/usr/bin/env bash
# Resuelve las IPs de los tres nodos por mDNS y las cachea en ips.env.
# No imprime ni toca credenciales.
set -uo pipefail
DIR="entrega/05-pruebas/datos"
ENVF="$DIR/ips.env"
mkdir -p "$DIR"; : > "$ENVF"
FALLO=0
for N in 1 2 3; do
  IP="$(getent hosts "sismo-nodo-$N.local" | awk '{print $1}' | head -1)"
  if [ -z "$IP" ]; then
    echo "FALLO: no resuelve sismo-nodo-$N.local" >&2
    FALLO=1
    continue
  fi
  echo "IP$N=$IP" >> "$ENVF"
  echo "Nodo $N -> $IP"
done
if [ "$FALLO" -ne 0 ]; then
  echo "FALLO: resolución de IPs incompleta" >&2
  exit 1
fi
echo "IPs cacheadas en $ENVF"
