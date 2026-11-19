#!/usr/bin/env python3
"""Construye y valida entrega/11-documento-final/manifiesto-figuras.json.

Une las figuras estaticas (ARQ/FIS/PRE/RES) y las capturas (UI-ADM/UI-CLI/SRV/NOD/INF/TST),
comprueba IDs unicos, existencia, peso <= 200 KB, ancho <= 1600 px, sha256 e integridad de
campos, y escribe el manifiesto como lista JSON de objetos con las claves que consume el
constructor del .docx. Deja ademas una verificacion legible en _scripts/verificacion-manifiesto.txt.

Uso: python3 construir-manifiesto.py
"""
import hashlib
import json
import os
from collections import Counter, OrderedDict
from pathlib import Path

REPO = Path(os.environ.get("REPO", "/home/t1an/detector de sismos en red distribuida"))
BASE = REPO / "entrega/11-documento-final"
FIG = BASE / "figuras"
TMP = Path("/tmp/capturas-final")
MANIFEST = BASE / "manifiesto-figuras.json"
VERIF = FIG / "_scripts/verificacion-manifiesto.txt"

GRUPOS = ["ARQ", "UI-ADM", "UI-CLI", "SRV", "NOD", "INF", "TST", "FIS", "PRE", "RES"]
MAX_BYTES = 200 * 1024


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def sufijo_rank(fid: str) -> int:
    if fid.endswith("-M-D"):
        return 3
    if fid.endswith("-D"):
        return 1
    if fid.endswith("-M"):
        return 2
    return 0


def cargar(p: Path):
    if not p.exists():
        raise SystemExit(f"Falta {p}")
    return json.loads(p.read_text(encoding="utf-8"))["capturas"]


estaticas = cargar(TMP / "estaticas-meta.json")
capturas = cargar(TMP / "capturas-final-meta.json")
todas = estaticas + capturas

errores = []
avisos = []

# Control ortografico: formas sin tilde/enie que NUNCA deben aparecer en un caption en espanol.
# Si una nueva captura introduce una, el manifiesto no se escribe (falla ruidosa).
SIN_TILDE = ["fisica", "nucleo", "maquina", "lider", "caida", "mayoria", "eleccion", "termino",
             "indice", "aplicacion", "sismica", "acumulacion", "evaluacion", "agregacion",
             "pulsacion", "retencion", "relacion", "unicas", "logicas", "foraneas", "volumenes",
             "produccion", "maximo", "minimo", "fotografia", "fisico", "tactil", "modulo",
             "serigrafia", "conexion", "electronicos", "grafica", "quorum", "recuperacion",
             "operacion", "ejecucion", "automatica", "telemetria", "despues"]
import re as _re
for c in todas:
    for w in SIN_TILDE:
        if _re.search(r"(?<![A-Za-zÁÉÍÓÚáéíóúÑñ])" + w + r"(?![A-Za-zÁÉÍÓÚáéíóúÑñ])", c["caption_es"]):
            errores.append(f"{c['id']}: caption con forma sin tilde/enie: '{w}'")
    if "  " in c["caption_es"]:
        avisos.append(f"{c['id']}: espacio doble en el caption")

ids = Counter(c["id"] for c in todas)
for fid, n in ids.items():
    if n > 1:
        errores.append(f"ID duplicado: {fid} ({n} veces)")

for c in todas:
    for campo in ("id", "archivo", "caption_es", "grupo", "fuente", "fecha_hora", "viewport", "tema", "sha256", "ancho", "alto"):
        if c.get(campo) in (None, ""):
            errores.append(f"{c.get('id', '?')}: falta el campo {campo}")
    if c.get("grupo") not in GRUPOS:
        errores.append(f"{c['id']}: grupo desconocido {c.get('grupo')}")
    f = BASE / c["archivo"]
    if not f.exists():
        errores.append(f"{c['id']}: no existe {c['archivo']}")
        continue
    size = f.stat().st_size
    if size > MAX_BYTES:
        errores.append(f"{c['id']}: {size} bytes > 200 KB")
    if c.get("ancho", 0) > 1600:
        errores.append(f"{c['id']}: ancho {c['ancho']} > 1600 px")
    real = sha256(f)
    if real != c["sha256"]:
        errores.append(f"{c['id']}: sha256 no coincide")
    if len(c["caption_es"]) < 25:
        avisos.append(f"{c['id']}: caption muy corto")

# Capturas byte-identicas con IDs distintos = una vista mal capturada.
from collections import defaultdict as _dd
_sha = _dd(list)
for c in todas:
    _sha[c["sha256"]].append(c["id"])
duplicados = {k: v for k, v in _sha.items() if len(v) > 1}
for k, v in duplicados.items():
    errores.append(f"capturas byte-identicas con IDs distintos: {v}")

if errores:
    print("ERRORES:")
    for e in errores:
        print(" -", e)
    raise SystemExit(1)

todas.sort(key=lambda c: (GRUPOS.index(c["grupo"]), int(c.get("orden", 0)), sufijo_rank(c["id"]), c["id"]))

salida = []
for c in todas:
    salida.append(OrderedDict([
        ("id", c["id"]),
        ("archivo", c["archivo"]),
        ("caption_es", c["caption_es"]),
        ("grupo", c["grupo"]),
        ("fuente", c["fuente"]),
        ("fecha_hora", c["fecha_hora"]),
        ("viewport", c["viewport"]),
        ("tema", c["tema"]),
        ("sha256", c["sha256"]),
        ("ancho", c["ancho"]),
        ("alto", c["alto"]),
    ]))

MANIFEST.write_text(json.dumps(salida, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

por_grupo = Counter(c["grupo"] for c in salida)
lineas = [
    "VERIFICACION DEL MANIFIESTO DE FIGURAS — entrega/11-documento-final/manifiesto-figuras.json",
    f"Fecha: 2026-11-18 (America/Bogota). Commit del codigo: 0ee5ed4.",
    f"Total de figuras: {len(salida)}",
    "",
    "Recuento por grupo:",
]
for g in GRUPOS:
    lineas.append(f"  {g:7s} {por_grupo.get(g, 0):3d}")
lineas += [
    "",
    "Comprobaciones:",
    f"  IDs unicos: {'OK' if not any(v > 1 for v in ids.values()) else 'FALLO'}",
    "  Existencia de archivos: OK",
    f"  Peso maximo por archivo: 200 KB (maximo real {max((BASE / c['archivo']).stat().st_size for c in salida) / 1024:.1f} KB)",
    f"  Ancho maximo: 1600 px (maximo real {max(c['ancho'] for c in salida)} px)",
    "  sha256 recalculado: OK",
    f"  Capturas byte-identicas con IDs distintos: {'0' if not duplicados else str(len(duplicados))}",
    "",
    "Figuras por grupo y archivo:",
]
for c in salida:
    lineas.append(f"  {c['id']:18s} {c['archivo']:52s} {c['ancho']:4d}x{c['alto']:<4d} {c['tema']}")
if avisos:
    lineas += ["", "Avisos:"] + [f"  - {a}" for a in avisos]
VERIF.write_text("\n".join(lineas) + "\n", encoding="utf-8")

print(f"OK manifiesto: {len(salida)} figuras -> {MANIFEST}")
for g in GRUPOS:
    print(f"  {g:7s} {por_grupo.get(g, 0):3d}")
print(f"Verificacion: {VERIF}")
