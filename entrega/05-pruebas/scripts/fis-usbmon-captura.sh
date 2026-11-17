#!/usr/bin/env bash
# Captura PASIVA del tráfico serie USB (usbmon) SIN abrir /dev/ttyUSBx.
#
# Por qué NO se abre el tty: al abrirlo, el driver cp210x afirma DTR/RTS; en esta placa
# RTS está cableado a EN (comprobado: un pulso por RTS reiniciaba la placa). Abrir el
# puerto podría reiniciar el nodo. usbmon lee el tráfico desde el kernel: no toca líneas,
# no reinicia y no altera Raft.
#
# No usa esptool (read-mac también reinicia). La identidad se deduce del propio mensaje
# del firmware: "pulso N ms -> nodo-2-<hex>-<n> nivel X: resultado".
#
# uso: fis-usbmon-captura.sh <segundos> [archivo_salida]
set -uo pipefail
SEG="${1:-60}"
OUT="${2:-entrega/05-pruebas/datos/FIS-02-serial-usbmon.txt}"
mkdir -p "$(dirname "$OUT")"

# Bus(es) USB de los tres CP2102 (todos deberían compartir bus).
BUSES="$(for t in /sys/class/tty/ttyUSB*/device; do
          [ -e "$t" ] || continue
          readlink -f "$t" | sed 's#.*/usb[0-9]*/##' >/dev/null 2>&1
          d="$(readlink -f "$t")"
          cat "$d/../../busnum" 2>/dev/null
        done | sort -u | tr '\n' ' ')"
[ -n "$BUSES" ] || { echo "FALLO: no se detectan puertos ttyUSB*" >&2; exit 1; }
echo "== buses USB detectados: $BUSES"

sudo -n modprobe usbmon 2>/dev/null || true
RAW="$OUT.raw"; : > "$RAW"
FALLOS=0
for B in $BUSES; do
  MON="/sys/kernel/debug/usb/usbmon/${B}u"
  if ! sudo -n test -r "$MON"; then echo "FALLO: no puedo leer $MON" >&2; FALLOS=1; continue; fi
  timeout "$SEG" sudo -n cat "$MON" >> "$RAW" 2>/dev/null || true
done
[ "$FALLOS" -eq 0 ] || exit 1
[ -s "$RAW" ] || { echo "FALLO: captura vacía" >&2; exit 1; }

python3 - "$RAW" "$OUT" "$SEG" <<'PY'
import sys, re
raw_path, out_path, seg = sys.argv[1], sys.argv[2], sys.argv[3]
# líneas de datos entrantes (device -> host): "Bi:bus:dev:ep ... = XX XX ..."
pat = re.compile(r'Bi:\d+:(\d{3}):\d+')
por_dev = {}
with open(raw_path, errors='ignore') as f:
    for line in f:
        if '=' not in line:
            continue
        m = pat.search(line)
        if not m:
            continue
        dev = m.group(1)
        hexpart = line.split('=', 1)[1].strip()
        try:
            payload = bytes(int(o, 16) for o in hexpart.split() if len(o) == 2)
        except ValueError:
            continue
        por_dev.setdefault(dev, bytearray()).extend(payload)

lineas = []
for dev, buf in sorted(por_dev.items()):
    texto = buf.decode('utf-8', 'replace').replace('\r', '')
    for l in texto.split('\n'):
        l = l.strip()
        if l:
            lineas.append((dev, l))

with open(out_path, 'w', encoding='utf-8') as f:
    f.write(f"captura pasiva usbmon · duración {seg}s · sin abrir el tty\n")
    f.write(f"dispositivos con datos entrantes: {len(por_dev)}\n\n")
    for dev, l in lineas:
        f.write(f"dev {dev}: {l}\n")

print(f"dispositivos con datos: {len(por_dev)} · líneas decodificadas: {len(lineas)}")
for dev, l in lineas:
    print(f"  dev {dev}: {l}")
pulsos = [l for _, l in lineas if l.startswith('pulso ')]
print(f"LÍNEAS 'pulso': {len(pulsos)}")
for p in pulsos:
    print("  " + p)
PY
echo "== evidencia: $OUT (crudo: $RAW)"
