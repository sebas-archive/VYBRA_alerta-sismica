#!/usr/bin/env python3
"""Optimiza las capturas crudas de UI y de terminal y deja el metadato definitivo.

Entradas : /tmp/capturas-final/ui-meta.json        (capturar-ui.cjs)
           /tmp/capturas-final/terminal-meta.json  (capturar-terminales.cjs)
Salida   : entrega/11-documento-final/figuras/FIG-*.png|jpg
           /tmp/capturas-final/capturas-final-meta.json

Regla: PNG optimizado si cabe en <= 200 KB; si no, JPEG calidad 85 (y si aun asi excede, se
reduce el ancho manteniendo JPEG q85). Ancho maximo 1600 px.

Uso: python3 optimizar-capturas.py
"""
import hashlib
import json
import os
from datetime import timedelta, timezone
from pathlib import Path

from PIL import Image

REPO = Path(os.environ.get("REPO", "/home/t1an/detector de sismos en red distribuida"))
FIG = REPO / "entrega/11-documento-final/figuras"
TMP = Path("/tmp/capturas-final")
MAX_W = 1600
MAX_BYTES = 200 * 1024

FIG.mkdir(parents=True, exist_ok=True)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def rgb(im: Image.Image) -> Image.Image:
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        fondo = Image.new("RGB", im.size, (255, 255, 255))
        fondo.paste(im, mask=im.split()[-1])
        return fondo
    return im.convert("RGB")


def optimizar(src: Path, nombre_base: str):
    im = Image.open(src)
    if im.width > MAX_W:
        im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
    final = FIG / (nombre_base + ".png")
    rgb(im).save(final, "PNG", optimize=True, compress_level=9)
    if final.stat().st_size > MAX_BYTES:
        final = FIG / (nombre_base + ".jpg")
        rgb(im).save(final, "JPEG", quality=85, optimize=True, progressive=True)
    if final.stat().st_size > MAX_BYTES and final.suffix == ".jpg":
        w2 = 1200
        im2 = Image.open(src)
        if im2.width > MAX_W:
            im2 = im2.resize((MAX_W, round(im2.height * MAX_W / im2.width)), Image.LANCZOS)
        im2 = im2.resize((w2, round(im2.height * w2 / im2.width)), Image.LANCZOS)
        rgb(im2).save(final, "JPEG", quality=85, optimize=True, progressive=True)
    with Image.open(final) as f:
        w, h = f.size
    return final, w, h, final.stat().st_size, sha256(final)


def procesar(meta_path: Path, etiqueta: str):
    if not meta_path.exists():
        raise SystemExit(f"Falta {meta_path}; ejecuta primero el script de captura ({etiqueta})")
    data = json.loads(meta_path.read_text(encoding="utf-8"))
    salida = []
    for c in data["capturas"]:
        raw = Path(c["raw"])
        if not raw.exists():
            raise SystemExit(f"Falta la captura cruda {raw} ({c['id']})")
        base = Path(c["archivo"]).stem
        final, w, h, size, sha = optimizar(raw, base)
        if size > MAX_BYTES:
            raise SystemExit(f"{c['id']} supera 200 KB: {size} bytes")
        salida.append({
            "id": c["id"],
            "archivo": f"figuras/{final.name}",
            "caption_es": c["caption_es"],
            "grupo": c["grupo"],
            "fuente": c["fuente"],
            "fecha_hora": c["fecha_hora"],
            "viewport": c["viewport"],
            "tema": c["tema"],
            "sha256": sha,
            "ancho": w,
            "alto": h,
            "orden": int(c.get("orden", 0)),
            "bytes": size,
            "checks": c.get("checks", {}),
        })
        print(f"{c['id']} -> {final.name} ({w}x{h}, {size/1024:.1f} KB)")
    return salida


ui = procesar(TMP / "ui-meta.json", "capturar-ui.cjs")
term = procesar(TMP / "terminal-meta.json", "capturar-terminales.cjs")

# Limpieza de figuras viejas de estos dos grupos que ya no existan en el metadato
validos = {Path(e["archivo"]).name for e in ui + term}
for p in FIG.glob("FIG-*"):
    if p.name in validos:
        continue
    if p.name.startswith(("FIG-UI-", "FIG-SRV-", "FIG-NOD-", "FIG-INF-", "FIG-TST-")):
        p.unlink()

TMP.joinpath("capturas-final-meta.json").write_text(
    json.dumps({"total": len(ui) + len(term), "capturas": ui + term}, ensure_ascii=False, indent=2),
    encoding="utf-8",
)
print(f"OK {len(ui)} UI + {len(term)} terminal = {len(ui)+len(term)} -> /tmp/capturas-final/capturas-final-meta.json")
