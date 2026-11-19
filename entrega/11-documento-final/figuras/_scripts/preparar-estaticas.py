#!/usr/bin/env python3
"""Prepara las figuras ESTATICAS del documento final VYBRA:
   - FIG-ARQ-01..14 : diagramas D-01..D-14 de entrega/03-diagramas/exportado/
   - FIG-FIS-01..03 : fotografias del prototipo de entrega/04-evidencias/F-fisicas/
   - FIG-PRE-01..04 : comprobante y fotos de componentes de entrega/07-presupuesto/
   - FIG-RES-01..02 : graficas de resultados de entrega/04-evidencias/I-resultados/

Copia (nunca modifica el origen), optimiza a max. 1600 px de ancho y <= 200 KB, y deja el
metadato en /tmp/capturas-final/estaticas-meta.json para construir el manifiesto.

Uso: python3 preparar-estaticas.py
"""
import hashlib
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from PIL import Image

REPO = Path(os.environ.get("REPO", "/home/t1an/detector de sismos en red distribuida"))
FIG = REPO / "entrega/11-documento-final/figuras"
META = Path(os.environ.get("STATIC_META", "/tmp/capturas-final/estaticas-meta.json"))
MAX_W = 1600
MAX_BYTES = 200 * 1024
BOG = timezone(timedelta(hours=-5))

META.parent.mkdir(parents=True, exist_ok=True)
FIG.mkdir(parents=True, exist_ok=True)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fecha_bogota(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, BOG).strftime("%Y-%m-%dT%H:%M:%S-05:00")


def rgb(im: Image.Image) -> Image.Image:
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        fondo = Image.new("RGB", im.size, (255, 255, 255))
        fondo.paste(im, mask=im.split()[-1])
        return fondo
    return im.convert("RGB")


def optimizar(src: Path, nombre_base: str, prefer_jpeg: bool = False, calidad: int = 85):
    """Devuelve (ruta_final, ancho, alto, bytes, sha256)."""
    im = Image.open(src)
    w, h = im.size
    if w > MAX_W:
        nh = round(h * MAX_W / w)
        im = im.resize((MAX_W, nh), Image.LANCZOS)
        w, h = im.size
    ext = ".jpg" if prefer_jpeg else ".png"
    final = FIG / (nombre_base + ext)
    if ext == ".png":
        rgb(im).save(final, "PNG", optimize=True, compress_level=9)
        if final.stat().st_size > MAX_BYTES:
            # PNG optimizado no alcanza: JPEG q85 como permite la regla de la entrega
            final = FIG / (nombre_base + ".jpg")
            rgb(im).save(final, "JPEG", quality=calidad, optimize=True, progressive=True)
    else:
        rgb(im).save(final, "JPEG", quality=calidad, optimize=True, progressive=True)
    # Ultimo recurso: reducir ancho y repetir JPEG q85
    if final.stat().st_size > MAX_BYTES and final.suffix == ".jpg":
        w2 = 1200 if imagen_ancho(final) > 1200 else 1000
        im2 = Image.open(src)
        if im2.width > MAX_W:
            im2 = im2.resize((MAX_W, round(im2.height * MAX_W / im2.width)), Image.LANCZOS)
        nh2 = round(im2.height * w2 / im2.width)
        im2 = im2.resize((w2, nh2), Image.LANCZOS)
        rgb(im2).save(final, "JPEG", quality=calidad, optimize=True, progressive=True)
    with Image.open(final) as f:
        fw, fh = f.size
    return final, fw, fh, final.stat().st_size, sha256(final)


def imagen_ancho(path: Path) -> int:
    with Image.open(path) as im:
        return im.width


# --------------------------------------------------------------------------------------
# Definiciones. El orden manda para el manifiesto.
# --------------------------------------------------------------------------------------
ARQ = [
    ("D-01-arquitectura-fisica", "arquitectura-fisica",
     "Diagrama de despliegue de la arquitectura física del sistema: tres ESP32 con HTTP y UDP, agregador Node.js y panel, servidores de datos con PostgreSQL, navegadores ADMIN/CLIENTE, Caddy opcional, NTP y flujos HTTP/SSE/OTA."),
    ("D-02-despliegue-docker", "despliegue-docker",
     "Diagrama de despliegue Docker: los 11 servicios del perfil por defecto, puertos publicados, volúmenes, dependencias y healthchecks; perfil https con Caddy en 8443 y overlay de producción."),
    ("D-03-componentes-dependencias", "componentes-dependencias",
     "Diagrama de componentes y dependencias del sistema: firmware portable, backend con panel, servidor de datos, controlador y nodo simulado, y dependencias externas."),
    ("D-04-clases-nucleo-raft", "clases-nucleo-raft",
     "Diagrama de clases y estructuras del núcleo: Raft, ConfigRaft, Propuesta, Persistencia, Salida, Msg, Entrada, Evento, Sismo, Alerta, Suceso y los enums de rol y clase."),
    ("D-05-estados-nodo-raft", "estados-nodo-raft",
     "Máquina de estados del nodo Raft: seguidor, candidato, líder y caída simulada, con timeouts, mayoría 2 de 3 y POST /control."),
    ("D-06-secuencia-eleccion", "secuencia-eleccion",
     "Secuencia de elección de líder: plazo aleatorio, VoteReq/VoteResp, voto persistido en NVS antes de responder, mayoría 2 de 3, entrada InicioTermino y primer latido."),
    ("D-07-secuencia-latido-append", "secuencia-latido-append",
     "Secuencia de latido y Append: latido cada 500 ms, Append con pi/pt/c/e, commit por mayoría y retroceso por pista con máximo de lotes en vuelo."),
    ("D-08-secuencia-failover-recuperacion", "secuencia-failover-recuperacion",
     "Secuencia de failover y recuperación: caída del líder, nueva elección con término incrementado y catch-up del nodo reincorporado desde el índice 1."),
    ("D-09-secuencia-evento-alerta", "secuencia-evento-alerta",
     "Secuencia de evento a alerta: pulsador, nivel y PGA, propuesta Raft, commit 2 de 3, aplicación en la máquina sísmica y alerta por coincidencia de dos detectores en 10 s."),
    ("D-10-secuencia-sin-quorum", "secuencia-sin-quorum",
     "Secuencia sin quórum: el commitIndex no avanza, el evento queda pendiente con tope de 100 y se reintenta hasta recuperar la mayoría."),
    ("D-11-estados-maquina-sismica", "estados-maquina-sismica",
     "Máquina de estados sísmica determinista: reposo, acumulación con tope de 100, evaluación de coincidencia en ventana de 10 000 ms y niveles alta, media y baja."),
    ("D-12-secuencia-agregacion-sse", "secuencia-agregacion-sse",
     "Secuencia de agregación y SSE: sondeo 1 Hz de los nodos, foto agregada con líder y quórum inferido, eventos SSE hacia ADMIN/CLIENTE y proxy de control y pulsación."),
    ("D-13-flujo-servidores-datos", "flujo-servidores-datos",
     "Diagrama de actividad del flujo ESP32 a servidor de datos y PostgreSQL (muestras, log_entradas, eventos, alertas, sucesos y acciones) hasta el panel, con retención y archivado opcionales."),
    ("D-14-modelo-er-postgresql", "modelo-er-postgresql",
     "Modelo entidad-relación de PostgreSQL: tablas activas y de archivo, claves primarias y únicas y relaciones lógicas, sin claves foráneas declaradas."),
]

FIS = [
    ("fot-FIS-03-prototipo-montado-a.png", "prototipo-montado-a",
     "Fotografía del montaje físico del prototipo: vista general del ESP32 DevKit V1 sobre protoboard blanca, pulsador táctil conectado con dos cables dupont y, al fondo, el PC con el monitor serie abierto."),
    ("fot-FIS-03-prototipo-montado-b.png", "prototipo-montado-b",
     "Fotografía del montaje físico del prototipo: detalle del módulo ESP32-WROOM-32 con conector micro-USB, botones EN/BOOT y serigrafía de pines, insertado en la protoboard."),
    ("fot-FIS-03-prototipo-montado-c.png", "prototipo-montado-c",
     "Fotografía del montaje físico del prototipo: detalle del pulsador táctil de cuatro patas sobre la protoboard, con sus puentes y los dos cables dupont de conexión."),
]

PRE = [
    ("comprobante-electronilab-pedido-60869.jpg", "comprobante-compra", False,
     "Comprobante de compra del pedido 60869 de Electronilab correspondiente a los componentes del prototipo."),
    ("fotos-componentes-recibidos-1.png", "componentes-recibidos-1", True,
     "Fotografía de los componentes electrónicos recibidos para el prototipo (1 de 3)."),
    ("fotos-componentes-recibidos-2.png", "componentes-recibidos-2", True,
     "Fotografía de los componentes electrónicos recibidos para el prototipo (2 de 3)."),
    ("fotos-componentes-recibidos-3.png", "componentes-recibidos-3", True,
     "Fotografía de los componentes electrónicos recibidos para el prototipo (3 de 3)."),
]

RES = [
    ("cap-RES-02-grafica-latencia.png", "grafica-latencia",
     "Gráfica real de latencia de GET /api/estado del panel: 100 muestras del 2026-11-18, con mínimo 0,407 ms, mediana 0,613 ms, p95 1,097 ms y máximo 1,338 ms."),
    ("cap-RES-10-grafica-consumo.png", "grafica-consumo",
     "Gráfica real de consumo del stack (docker stats durante 21 s): memoria y CPU medias por contenedor, con el panel y los servidores de datos como mayores consumidores."),
]

FUENTES = {
    "ARQ": "Entrega del proyecto (03-diagramas/exportado), diagrama PlantUML original del commit 0ee5ed4.",
    "FIS": "Fotografia real del montaje del prototipo aportada por el autor de la campana fisica (04-evidencias/F-fisicas).",
    "PRE": "Documento y fotografias reales de la compra de componentes (07-presupuesto).",
    "RES": "Grafica real generada en las pruebas de resultados del 2026-11-18 (04-evidencias/I-resultados).",
}

entradas = []


def añadir(grupo, orden, fid, archivo, caption, fuente, viewport_prefix, prefer_jpeg=False):
    src = None
    if grupo == "ARQ":
        src = REPO / "entrega/03-diagramas/exportado" / f"{FUENTE_ARQ[orden - 1]}.png"
    elif grupo == "FIS":
        src = REPO / "entrega/04-evidencias/F-fisicas" / FUENTE_FIS[orden - 1]
    elif grupo == "PRE":
        src = REPO / "entrega/07-presupuesto" / FUENTE_PRE[orden - 1]
    elif grupo == "RES":
        src = REPO / "entrega/04-evidencias/I-resultados" / FUENTE_RES[orden - 1]
    if not src.exists():
        raise SystemExit(f"Falta el archivo origen {src}")
    final, w, h, size, sha = optimizar(src, archivo, prefer_jpeg=prefer_jpeg)
    entradas.append({
        "id": fid,
        "archivo": f"figuras/{final.name}",
        "caption_es": caption,
        "grupo": grupo,
        "fuente": fuente,
        "fecha_hora": fecha_bogota(src),
        "viewport": f"{w}x{h} ({viewport_prefix})",
        "tema": "no aplica",
        "sha256": sha,
        "ancho": w,
        "alto": h,
        "orden": orden,
        "origen": str(src.relative_to(REPO)) if src.is_relative_to(REPO) else str(src),
        "bytes": size,
    })
    print(f"{fid} -> {final.name} ({w}x{h}, {size/1024:.1f} KB)")


FUENTE_ARQ = [a[0] for a in ARQ]
FUENTE_FIS = [f[0] for f in FIS]
FUENTE_PRE = [p[0] for p in PRE]
FUENTE_RES = [r[0] for r in RES]

for i, (stem, slug, caption) in enumerate(ARQ, 1):
    añadir("ARQ", i, f"FIG-ARQ-{i:02d}", f"FIG-ARQ-{i:02d}-{slug}", caption, FUENTES["ARQ"], "exportacion PlantUML", prefer_jpeg=False)

for i, (_, slug, caption) in enumerate(FIS, 1):
    añadir("FIS", i, f"FIG-FIS-{i:02d}", f"FIG-FIS-{i:02d}-{slug}", caption, FUENTES["FIS"], "fotografia", prefer_jpeg=True)

for i, (_, slug, jpeg, caption) in enumerate(PRE, 1):
    añadir("PRE", i, f"FIG-PRE-{i:02d}", f"FIG-PRE-{i:02d}-{slug}", caption, FUENTES["PRE"], "fotografia / documento", prefer_jpeg=jpeg)

for i, (_, slug, caption) in enumerate(RES, 1):
    añadir("RES", i, f"FIG-RES-{i:02d}", f"FIG-RES-{i:02d}-{slug}", caption, FUENTES["RES"], "grafica", prefer_jpeg=False)

META.write_text(json.dumps({"total": len(entradas), "capturas": entradas}, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"OK {len(entradas)} figuras estaticas -> {META}")
