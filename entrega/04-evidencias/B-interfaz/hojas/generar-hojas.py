#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""generar-hojas.py — compone las láminas PNG de evidencia visual de VYBRA.

Genera dos hojas apaisadas de alta resolución a partir de los manifiestos que
escriben los capturadores:

    <manifiestos>/admin.json    + capturas   -> hoja-01-ADMIN-escritorio-y-movil.png
    <manifiestos>/cliente.json  + capturas   -> hoja-02-CLIENTE-escritorio-y-movil.png

Formato del manifiesto (una captura por vista y dispositivo):

    {"rol": "ADMIN", "base_url": "...", "capturas": [
      {"orden": 1, "vista": "Panorama",
       "escritorio": {"archivo": "admin/ADM-01-panorama-escritorio.png",
                      "ancho": 1400, "alto": 900, "capturado_en": "..."},
       "movil":      {"archivo": "admin/ADM-01-panorama-movil.png",
                      "ancho": 780, "alto": 1688, "capturado_en": "..."}}]}

Los archivos se resuelven relativos a --capturas-dir. El script nunca amplía una
captura por encima de su tamaño nativo: sólo escala proporcionalmente hacia
abajo. Si falta una captura o un dispositivo, aborta y lista lo que falta (no
inventa recuadros).

Ejecución típica (final):
    python3 generar-hojas.py \
        --manifiesto-dir /tmp/hojas-ui/capturas \
        --capturas-dir  /tmp/hojas-ui/capturas \
        --salida        .

Prueba de maquetación (marcadores de posición en /tmp):
    python3 generar-hojas.py --manifiesto-dir /tmp/hojas-ui/prueba \
        --capturas-dir /tmp/hojas-ui --salida /tmp/hojas-ui/prueba/out \
        --prefijo prueba-
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
from datetime import datetime, timezone

from PIL import Image, ImageDraw, ImageFont

# --------------------------------------------------------------------------- #
# Tokens de diseño — tomados de web/public/tokens.css (tema claro)
# --------------------------------------------------------------------------- #
FONDO = "#f6f6f3"          # lienzo claro de la lámina (instrucción del encargo)
SUPERFICIE = "#ffffff"     # --surface
SUPERFICIE2 = "#f5f7f8"    # --surface-2
BORDE = "#dbe2e6"          # --border
BORDE_FUERTE = "#b9c4ca"   # --border-strong
TEXTO = "#17212a"          # --text
TEXTO2 = "#4d5b66"         # --text-2
TEXTO3 = "#6b7883"         # --text-3
MARCA = "#0e6a76"          # --brand
MARCA_SUAVE = "#dcefef"    # --brand-soft
SOMBRA = "#e7e7e3"         # mezcla de FONDO con negro ~7 %

# --------------------------------------------------------------------------- #
# Tipografía (DejaVu Sans: instalada en el sistema)
# --------------------------------------------------------------------------- #
DIRS_FUENTES = [
    "/usr/share/fonts/TTF",
    "/usr/share/fonts/truetype/dejavu",
    "/usr/share/fonts/dejavu",
    "/usr/share/fonts/liberation",
]
ARCHIVOS_FUENTES = {
    "regular": ["DejaVuSans.ttf", "LiberationSans-Regular.ttf", "NotoSans-Regular.ttf"],
    "bold": ["DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf", "NotoSans-Bold.ttf"],
    "mono": ["DejaVuSansMono.ttf", "LiberationMono-Regular.ttf"],
}
_CACHE_FUENTES: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}
_CACHE_RUTAS: dict[str, str] = {}


def _buscar_fuente(kind: str) -> str:
    if kind in _CACHE_RUTAS:
        return _CACHE_RUTAS[kind]
    candidatos = [os.path.join(d, n) for d in DIRS_FUENTES for n in ARCHIVOS_FUENTES[kind]]
    for ruta in candidatos:
        if os.path.isfile(ruta):
            _CACHE_RUTAS[kind] = ruta
            return ruta
    raise FileNotFoundError(
        "No se encontró una fuente del sistema para %r. Buscado en: %s"
        % (kind, ", ".join(candidatos))
    )


def fuente(kind: str, tam: int) -> ImageFont.FreeTypeFont:
    clave = (kind, tam)
    if clave not in _CACHE_FUENTES:
        _CACHE_FUENTES[clave] = ImageFont.truetype(_buscar_fuente(kind), tam)
    return _CACHE_FUENTES[clave]


# --------------------------------------------------------------------------- #
# Utilidades de texto
# --------------------------------------------------------------------------- #
def ancho_texto(d: ImageDraw.ImageDraw, txt: str, f: ImageFont.FreeTypeFont) -> int:
    return d.textbbox((0, 0), txt, font=f)[2]


def alto_linea(f: ImageFont.FreeTypeFont) -> int:
    asc, desc = f.getmetrics()
    return asc + desc


def texto(
    d: ImageDraw.ImageDraw,
    x: float,
    y: float,
    txt: str,
    f: ImageFont.FreeTypeFont,
    color: str,
    alineacion: str = "izq",
    centrado_vertical: bool = False,
) -> None:
    w = ancho_texto(d, txt, f)
    if alineacion == "der":
        x = x - w
    elif alineacion == "centro":
        x = x - w / 2
    if centrado_vertical:
        y = y - alto_linea(f) / 2
    d.text((int(x), int(y)), txt, font=f, fill=color)


def envolver(
    d: ImageDraw.ImageDraw, txt: str, f: ImageFont.FreeTypeFont, max_w: int
) -> list[str]:
    palabras = txt.split(" ")
    lineas: list[str] = []
    actual = ""
    for p in palabras:
        cand = (actual + " " + p).strip()
        if not actual or ancho_texto(d, cand, f) <= max_w:
            actual = cand
        else:
            lineas.append(actual)
            actual = p
    if actual:
        lineas.append(actual)
    return lineas


# --------------------------------------------------------------------------- #
# Geometría de la lámina
# --------------------------------------------------------------------------- #
MARGEN_X = 90
MARGEN_SUP = 80
MARGEN_INF = 80
ALTO_CABECERA = 250
HUECO_CABECERA = 34
ALTO_SECCION = 64
HUECO_SECCION = 22
HUECO_COLUMNA = 34
HUECO_FILA = 44
HUECO_GRILLA_SECCION = 54
HUECO_PIE = 55
ALTO_PIE = 120
RELLENO_TARJETA = 16
MARGEN_ENMARCADO_MAX = 120  # marco extra máximo a cada lado de la captura de escritorio
HUECO_MOVIL = 26
RELLENO_MOVIL = 16
ALTO_MAX_CAPTURA_MOVIL = 1000  # px de alto mostrado de una captura móvil
RADIO = 16
RELACION_APUNTADA = 1.18  # ancho / alto objetivo de la lámina (apaisada)
ANCHO_MINIMO = 3600
COMMIT_EVIDENCIA = "0ee5ed4"
URL_STACK = "http://127.0.0.1:8095"
FECHA_PIE = "2026-11-18"


# --------------------------------------------------------------------------- #
# Manifiestos y capturas
# --------------------------------------------------------------------------- #
def sha256(ruta: str) -> str:
    h = hashlib.sha256()
    with open(ruta, "rb") as fh:
        for bloque in iter(lambda: fh.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


def detectar_dpr(ancho: int, alto: int, dispositivo: str) -> tuple[int, tuple[int, int]]:
    """Devuelve (dpr, tamaño lógico en px CSS)."""
    if dispositivo == "movil":
        dpr = 2 if (ancho >= 700 and alto >= 1300) else 1
    else:
        dpr = 2 if ancho >= 2400 else 1
    return dpr, (int(round(ancho / dpr)), int(round(alto / dpr)))


def cargar_manifiesto(ruta: str) -> dict:
    with open(ruta, "r", encoding="utf-8") as fh:
        return json.load(fh)


def parse_fecha(txt) -> datetime | None:
    """Acepta ISO 8601 (con o sin zona) y el formato dd/mm/aaaa HH:MM:SS."""
    if not txt:
        return None
    txt = str(txt).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S", "%d/%m/%Y %H:%M:%S"):
        try:
            return datetime.strptime(txt, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(txt)
    except Exception:  # noqa: BLE001
        return None


def extraer_alertas(notas: list[str]) -> list[tuple[str, str]]:
    """Localiza en las notas de los capturadores las alertas de demostración usadas."""
    import re
    encontradas: list[tuple[str, str]] = []
    for nota in notas or []:
        ident = re.search(r"alerta\s+id\s+(\d+)", nota or "", re.IGNORECASE)
        fecha = re.search(r"el\s+(\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}:\d{2})", nota or "")
        if ident and fecha:
            encontradas.append((ident.group(1), fecha.group(1)))
    return encontradas


def preparar_vistas(
    manifiesto: dict, capturas_dir: str, ruta_manifiesto: str, errores: list[str]
) -> tuple[list[dict], list[dict]]:
    """Resuelve archivos, tamaños y datos de cada vista. Devuelve (vistas, discrepancias)."""
    discrepancias: list[dict] = []
    vistas: list[dict] = []
    capturas = manifiesto.get("capturas") or []
    if not capturas:
        errores.append("%s: el manifiesto no contiene capturas" % ruta_manifiesto)
        return [], []

    for item in capturas:
        orden = int(item.get("orden", len(vistas) + 1))
        nombre = str(item.get("vista", "Vista %02d" % orden)).strip()
        vista: dict = {"orden": orden, "vista": nombre, "dispositivos": {}}
        for dispositivo in ("escritorio", "movil"):
            datos = item.get(dispositivo)
            if not datos or not datos.get("archivo"):
                errores.append(
                    "%s · vista %02d %r: falta la captura de %s"
                    % (ruta_manifiesto, orden, nombre, dispositivo)
                )
                continue
            ruta = os.path.join(capturas_dir, datos["archivo"])
            if not os.path.isfile(ruta):
                errores.append(
                    "%s · vista %02d %r: no existe el archivo %s"
                    % (ruta_manifiesto, orden, nombre, ruta)
                )
                continue
            try:
                with Image.open(ruta) as im:
                    im.load()
                    nativo = im.size
                    gris = im.convert("L")
                    extremos = gris.getextrema()
            except Exception as exc:  # noqa: BLE001
                errores.append(
                    "%s · vista %02d %r: no se pudo abrir %s (%s)"
                    % (ruta_manifiesto, orden, nombre, ruta, exc)
                )
                continue
            if extremos[0] == extremos[1]:
                discrepancias.append(
                    {
                        "tipo": "captura_uniforme",
                        "vista": "%02d · %s" % (orden, nombre),
                        "dispositivo": dispositivo,
                        "archivo": datos["archivo"],
                    }
                )
            ancho_m = int(datos.get("ancho") or nativo[0])
            alto_m = int(datos.get("alto") or nativo[1])
            dpr, logico = detectar_dpr(nativo[0], nativo[1], dispositivo)
            if (ancho_m, alto_m) not in ((nativo[0], nativo[1]), logico):
                discrepancias.append(
                    {
                        "tipo": "tamano_manifiesto_no_coincide",
                        "vista": "%02d · %s" % (orden, nombre),
                        "dispositivo": dispositivo,
                        "manifiesto": [ancho_m, alto_m],
                        "archivo": list(nativo),
                    }
                )
            vista["dispositivos"][dispositivo] = {
                "archivo": datos["archivo"],
                "ruta": ruta,
                "sha256": sha256(ruta),
                "nativo": (nativo[0], nativo[1]),
                "logico": logico,
                "dpr": dpr,
                "capturado_en": datos.get("capturado_en") or datos.get("capturado"),
            }
        if set(vista["dispositivos"]) == {"escritorio", "movil"}:
            vistas.append(vista)

    vistas.sort(key=lambda v: (v["orden"], v["vista"]))
    return vistas, discrepancias


# --------------------------------------------------------------------------- #
# Maquetación
# --------------------------------------------------------------------------- #
def construir_layout(
    rol: str, vistas: list[dict], ancho_hoja: int, medidor: ImageDraw.ImageDraw
) -> dict:
    columnas = 3 if rol == "ADMIN" else 4
    n_vistas = len(vistas)

    # --- escritorio: misma altura de imagen para todas las capturas y sin ampliarlas
    alturas_nat = [v["dispositivos"]["escritorio"]["nativo"][1] for v in vistas]
    alto_display_esc = max(120, min(1000, min(alturas_nat)))
    desp_esc_nat = []
    for v in vistas:
        w, h = v["dispositivos"]["escritorio"]["nativo"]
        desp_esc_nat.append((int(round(w * alto_display_esc / h)), int(alto_display_esc)))
    ancho_display_max = max(w for w, _ in desp_esc_nat)
    ancho_tarjeta_max = ancho_display_max + 2 * RELLENO_TARJETA + 2 * MARGEN_ENMARCADO_MAX
    ancho_bandas_max = columnas * ancho_tarjeta_max + (columnas - 1) * HUECO_COLUMNA
    ancho_contenido = min(ancho_hoja - 2 * MARGEN_X, ancho_bandas_max)
    ancho_tarjeta_esc = (ancho_contenido - (columnas - 1) * HUECO_COLUMNA) // columnas
    interior_esc = ancho_tarjeta_esc - 2 * RELLENO_TARJETA
    factor_esc = min(1.0, interior_esc / ancho_display_max)
    desp_esc = [
        (max(1, int(round(w * factor_esc))), max(1, int(round(h * factor_esc))))
        for w, h in desp_esc_nat
    ]
    alto_imagen_esc = max(h for _, h in desp_esc)
    x_contenido = (ancho_hoja - ancho_contenido) // 2

    # --- capturas móviles: la tira ocupa el ancho de banda disponible
    celda_mov = (ancho_contenido - (n_vistas - 1) * HUECO_MOVIL) // n_vistas
    celda_mov = max(celda_mov, 2 * RELLENO_MOVIL + 40)
    caja_mov_w = celda_mov - 2 * RELLENO_MOVIL
    aspectos = [
        v["dispositivos"]["movil"]["nativo"][0] / v["dispositivos"]["movil"]["nativo"][1]
        for v in vistas
    ]
    aspecto_mov = sum(aspectos) / len(aspectos)
    nativo_mov_w = max(v["dispositivos"]["movil"]["nativo"][0] for v in vistas)
    nativo_mov_h = max(v["dispositivos"]["movil"]["nativo"][1] for v in vistas)
    ancho_imagen_mov = min(
        caja_mov_w, int(round(ALTO_MAX_CAPTURA_MOVIL * aspecto_mov)), nativo_mov_w
    )
    alto_imagen_mov = min(int(round(ancho_imagen_mov / aspecto_mov)), nativo_mov_h)
    alto_imagen_mov = max(alto_imagen_mov, 20)

    # --- pies de foto
    def pie_escritorio(v: dict) -> list[tuple[str, ImageFont.FreeTypeFont, str]]:
        disp = v["dispositivos"]["escritorio"]
        logico = disp["logico"]
        n = "%02d" % v["orden"]
        completo = "%s · %s — escritorio %d×%d" % (n, v["vista"], logico[0], logico[1])
        if ancho_texto(medidor, completo, fuente("bold", 26)) <= interior_esc:
            return [(completo, fuente("bold", 26), TEXTO)]
        lineas = envolver(
            medidor, "%s · %s" % (n, v["vista"]), fuente("bold", 26), interior_esc,
        )
        detalle = "escritorio %d×%d" % (logico[0], logico[1])
        if disp["dpr"] == 2:
            detalle += " · PNG %d×%d" % disp["nativo"]
        return [(l, fuente("bold", 26), TEXTO) for l in lineas] + [
            (detalle, fuente("regular", 21), TEXTO2)
        ]

    def pie_movil(v: dict) -> list[tuple[str, ImageFont.FreeTypeFont, str]]:
        disp = v["dispositivos"]["movil"]
        logico = disp["logico"]
        n = "%02d" % v["orden"]
        f1 = fuente("bold", 24)
        f2 = fuente("regular", 20)
        lineas: list[tuple[str, ImageFont.FreeTypeFont, str]] = []
        for parte in envolver(medidor, "%s · %s" % (n, v["vista"]), f1, caja_mov_w):
            lineas.append((parte, f1, TEXTO))
        detalle = "móvil %d×%d" % (logico[0], logico[1])
        if disp["dpr"] == 2:
            detalle += " · PNG %d×%d" % disp["nativo"]
        for parte in envolver(medidor, detalle, f2, caja_mov_w):
            lineas.append((parte, f2, TEXTO2))
        return lineas

    lineas_esc = [pie_escritorio(v) for v in vistas]
    lineas_mov = [pie_movil(v) for v in vistas]

    def alto_pie(lineas: list[tuple[str, ImageFont.FreeTypeFont, str]]) -> int:
        return sum(int(alto_linea(f) * 0.92) for _, f, _ in lineas)

    alto_pie_esc = max((alto_pie(l) for l in lineas_esc), default=40)
    alto_pie_mov = max((alto_pie(l) for l in lineas_mov), default=40)

    # --- filas de escritorio
    filas: list[dict] = []
    for i in range(0, n_vistas, columnas):
        grupo = vistas[i : i + columnas]
        alto_max = max(desp_esc[i + j][1] for j in range(len(grupo)))
        filas.append({"vistas": grupo, "alto_imagen": alto_max})

    alto_tarjeta_mov = 2 * RELLENO_MOVIL + alto_imagen_mov + int(alto_pie_mov) + 14

    # --- posiciones verticales
    y = MARGEN_SUP
    y_cabecera = y
    y += ALTO_CABECERA + HUECO_CABECERA
    y_seccion_esc = y
    y += ALTO_SECCION + HUECO_SECCION
    y_grilla = y
    filas_pos = []
    for idx, fila in enumerate(filas):
        alto = 2 * RELLENO_TARJETA + fila["alto_imagen"] + int(alto_pie_esc) + 14
        n_fila = len(fila["vistas"])
        ancho_fila = n_fila * ancho_tarjeta_esc + (n_fila - 1) * HUECO_COLUMNA
        x_fila = x_contenido + (ancho_contenido - ancho_fila) // 2
        filas_pos.append({"y": y, "alto": alto, "fila": fila, "x": x_fila})
        y += alto
        if idx < len(filas) - 1:
            y += HUECO_FILA
    y += HUECO_GRILLA_SECCION
    y_seccion_mov = y
    y += ALTO_SECCION + HUECO_SECCION
    y_movil = y
    y += alto_tarjeta_mov
    y += HUECO_PIE
    y_pie = y
    y += ALTO_PIE
    alto_hoja = y + MARGEN_INF

    return {
        "rol": rol,
        "ancho": ancho_hoja,
        "alto": alto_hoja,
        "columnas": columnas,
        "n_vistas": n_vistas,
        "x_contenido": x_contenido,
        "ancho_contenido": ancho_contenido,
        "y_cabecera": y_cabecera,
        "y_seccion_esc": y_seccion_esc,
        "y_grilla": y_grilla,
        "filas": filas_pos,
        "y_seccion_mov": y_seccion_mov,
        "y_movil": y_movil,
        "y_pie": y_pie,
        "ancho_tarjeta_esc": ancho_tarjeta_esc,
        "desp_esc": desp_esc,
        "alto_imagen_esc": alto_imagen_esc,
        "alto_pie_esc": int(alto_pie_esc),
        "celda_mov": celda_mov,
        "ancho_imagen_mov": ancho_imagen_mov,
        "alto_imagen_mov": alto_imagen_mov,
        "alto_tarjeta_mov": alto_tarjeta_mov,
        "lineas_esc": lineas_esc,
        "lineas_mov": lineas_mov,
    }


def calcular_ancho(rol: str, vistas: list[dict], medidor: ImageDraw.ImageDraw) -> tuple[int, dict]:
    """Elige el ancho de hoja (apaisada, ≥ 3600) y devuelve (ancho, layout estable)."""
    columnas = 3 if rol == "ADMIN" else 4
    nativo_esc = max(v["dispositivos"]["escritorio"]["nativo"][0] for v in vistas)
    ancho = max(
        ANCHO_MINIMO,
        2 * MARGEN_X + columnas * (nativo_esc + 2 * RELLENO_TARJETA) + (columnas - 1) * HUECO_COLUMNA,
    )
    layout = construir_layout(rol, vistas, ancho, medidor)
    for _ in range(24):
        objetivo = max(
            ANCHO_MINIMO,
            layout["x_contenido"] * 2 + layout["ancho_contenido"],
            int(math.ceil(layout["alto"] * RELACION_APUNTADA)),
        )
        if objetivo == ancho:
            break
        ancho = objetivo
        layout = construir_layout(rol, vistas, ancho, medidor)
    return ancho, layout


# --------------------------------------------------------------------------- #
# Dibujo
# --------------------------------------------------------------------------- #
def tarjeta(
    d: ImageDraw.ImageDraw,
    caja: tuple[int, int, int, int],
    radio: int = RADIO,
    relleno: str = SUPERFICIE,
    borde: str = BORDE,
) -> None:
    x0, y0, x1, y1 = caja
    d.rounded_rectangle((x0 + 2, y0 + 5, x1 + 2, y1 + 5), radius=radio, fill=SOMBRA)
    d.rounded_rectangle(caja, radius=radio, fill=relleno, outline=borde, width=2)


def dibujar_cabecera(
    d: ImageDraw.ImageDraw, layout: dict, manifiesto: dict, n_capturas: int
) -> None:
    rol = layout["rol"]
    x0 = layout["x_contenido"]
    x1 = x0 + layout["ancho_contenido"]
    y0 = layout["y_cabecera"]
    y1 = y0 + ALTO_CABECERA
    tarjeta(d, (x0, y0, x1, y1), radio=18)
    d.rounded_rectangle((x0, y0, x0 + 10, y1), radius=6, fill=MARCA)

    pad = 44
    texto(d, x0 + pad + 8, y0 + 28, "VYBRA", fuente("bold", 92), MARCA)
    titulo = "INTERFAZ %s — evidencia visual · escritorio y móvil" % rol
    texto(d, x0 + pad + 8, y0 + 146, titulo, fuente("bold", 34), TEXTO)
    base_url = manifiesto.get("base_url") or "http://127.0.0.1:8095"
    etiqueta_rol = "Panel de operación" if rol == "ADMIN" else "Vista pública"
    meta = "%s · stack Docker real · %s · commit 0ee5ed4" % (etiqueta_rol, base_url)
    texto(d, x0 + pad + 8, y0 + 196, meta, fuente("regular", 25), TEXTO2)

    chip_txt = "ROL · %s" % rol
    f_chip = fuente("bold", 24)
    chip_w = ancho_texto(d, chip_txt, f_chip) + 2 * 26
    chip_h = 46
    cx1 = x1 - pad
    cx0 = cx1 - chip_w
    d.rounded_rectangle((cx0, y0 + 34, cx1, y0 + 34 + chip_h), radius=23, fill=MARCA_SUAVE)
    texto(
        d, (cx0 + cx1) / 2, y0 + 34 + chip_h / 2, chip_txt, f_chip, MARCA,
        alineacion="centro", centrado_vertical=True,
    )

    texto(
        d, x1 - pad, y0 + 122, "%d vistas · %d capturas" % (layout["n_vistas"], n_capturas),
        fuente("bold", 34), TEXTO, alineacion="der",
    )
    texto(
        d, x1 - pad, y0 + 172,
        "2 dispositivos · %d columnas en escritorio" % layout["columnas"],
        fuente("regular", 23), TEXTO2, alineacion="der",
    )
    texto(
        d, x1 - pad, y0 + 206, "todas las vistas · escritorio y móvil",
        fuente("regular", 21), TEXTO3, alineacion="der",
    )


def dibujar_seccion(
    d: ImageDraw.ImageDraw, layout: dict, y: int, titulo: str, detalle: str, derecha: str,
) -> None:
    x0 = layout["x_contenido"]
    x1 = x0 + layout["ancho_contenido"]
    cy = y + 26
    d.rounded_rectangle((x0, cy - 17, x0 + 9, cy + 17), radius=4, fill=MARCA)
    f_tit = fuente("bold", 30)
    texto(d, x0 + 26, cy, titulo, f_tit, MARCA, centrado_vertical=True)
    texto(
        d, x0 + 26 + ancho_texto(d, titulo, f_tit) + 18, cy, detalle,
        fuente("regular", 23), TEXTO2, centrado_vertical=True,
    )
    if derecha:
        texto(d, x1, cy, derecha, fuente("regular", 21), TEXTO3, alineacion="der", centrado_vertical=True)
    d.rectangle((x0, y + ALTO_SECCION - 4, x1, y + ALTO_SECCION - 2), fill=BORDE)


def _pegar_captura(hoja: Image.Image, ruta: str, caja: tuple[int, int, int, int]) -> None:
    """Pega la captura escalada exactamente a la caja indicada (sin ampliar nunca)."""
    x0, y0, x1, y1 = caja
    ancho_dib, alto_dib = x1 - x0, y1 - y0
    with Image.open(ruta) as im:
        im = im.convert("RGB")
        if im.size != (ancho_dib, alto_dib):
            im = im.resize((ancho_dib, alto_dib), Image.LANCZOS)
        hoja.paste(im, (x0, y0))


def dibujar_grilla(
    d: ImageDraw.ImageDraw, layout: dict, vistas: list[dict], hoja: Image.Image
) -> list[dict]:
    recuadros: list[dict] = []
    indice = {id(v): i for i, v in enumerate(vistas)}
    ancho_tarjeta = layout["ancho_tarjeta_esc"]
    relleno = RELLENO_TARJETA
    interior = ancho_tarjeta - 2 * relleno
    for fila in layout["filas"]:
        y_fila = fila["y"]
        alto_img = fila["fila"]["alto_imagen"]
        for idx, v in enumerate(fila["fila"]["vistas"]):
            x0 = fila["x"] + idx * (ancho_tarjeta + HUECO_COLUMNA)
            card = (x0, y_fila, x0 + ancho_tarjeta, y_fila + fila["alto"])
            tarjeta(d, card)
            mx0 = x0 + relleno
            my0 = y_fila + relleno
            d.rounded_rectangle((mx0, my0, mx0 + interior, my0 + alto_img), radius=8, fill=SUPERFICIE2)
            disp = v["dispositivos"]["escritorio"]
            ancho_dib, alto_dib = layout["desp_esc"][indice[id(v)]]
            x_img = mx0 + (interior - ancho_dib) // 2
            y_img = my0 + (alto_img - alto_dib) // 2
            _pegar_captura(hoja, disp["ruta"], (x_img, y_img, x_img + ancho_dib, y_img + alto_dib))
            d.rectangle((x_img, y_img, x_img + ancho_dib, y_img + alto_dib), outline=BORDE_FUERTE, width=2)
            y_txt = my0 + alto_img + 14
            for linea, f, color in layout["lineas_esc"][indice[id(v)]]:
                d.text((mx0, y_txt), linea, font=f, fill=color)
                y_txt += int(alto_linea(f) * 0.92)
            recuadros.append(
                {
                    "vista": v["vista"],
                    "orden": v["orden"],
                    "dispositivo": "escritorio",
                    "etiqueta": "%02d · %s — escritorio" % (v["orden"], v["vista"]),
                    "caja": list(card),
                    "imagen_mostrada": [ancho_dib, alto_dib],
                    "archivo": disp["archivo"],
                }
            )
    return recuadros


def dibujar_tira_movil(
    d: ImageDraw.ImageDraw, layout: dict, vistas: list[dict], hoja: Image.Image
) -> list[dict]:
    recuadros: list[dict] = []
    n = len(vistas)
    celda = layout["celda_mov"]
    ancho_tira = n * celda + (n - 1) * HUECO_MOVIL
    x_tira = (layout["ancho"] - ancho_tira) // 2
    y0 = layout["y_movil"]
    alto_card = layout["alto_tarjeta_mov"]
    box_w = layout["ancho_imagen_mov"]
    box_h = layout["alto_imagen_mov"]
    relleno = RELLENO_MOVIL
    interior = celda - 2 * relleno
    for i, v in enumerate(vistas):
        x0 = x_tira + i * (celda + HUECO_MOVIL)
        card = (x0, y0, x0 + celda, y0 + alto_card)
        tarjeta(d, card)
        disp = v["dispositivos"]["movil"]
        w, h = disp["nativo"]
        escala = min(box_w / w, box_h / h, 1.0)
        ancho_dib = max(1, int(round(w * escala)))
        alto_dib = max(1, int(round(h * escala)))
        mx0 = x0 + relleno
        my0 = y0 + relleno
        d.rounded_rectangle((mx0, my0, mx0 + interior, my0 + box_h), radius=8, fill=SUPERFICIE2)
        x_img = mx0 + (interior - ancho_dib) // 2
        y_img = my0 + (box_h - alto_dib) // 2
        _pegar_captura(hoja, disp["ruta"], (x_img, y_img, x_img + ancho_dib, y_img + alto_dib))
        d.rectangle((x_img, y_img, x_img + ancho_dib, y_img + alto_dib), outline=BORDE_FUERTE, width=2)
        y_txt = my0 + box_h + 14
        for linea, f, color in layout["lineas_mov"][i]:
            d.text((x0 + relleno, y_txt), linea, font=f, fill=color)
            y_txt += int(alto_linea(f) * 0.92)
        recuadros.append(
            {
                "vista": v["vista"],
                "orden": v["orden"],
                "dispositivo": "movil",
                "etiqueta": "%02d · %s — móvil" % (v["orden"], v["vista"]),
                "caja": list(card),
                "imagen_mostrada": [ancho_dib, alto_dib],
                "archivo": disp["archivo"],
            }
        )
    return recuadros


def dibujar_pie(d: ImageDraw.ImageDraw, layout: dict, n_hoja: int) -> None:
    x0 = layout["x_contenido"]
    x1 = x0 + layout["ancho_contenido"]
    y0 = layout["y_pie"]
    y1 = y0 + ALTO_PIE
    tarjeta(d, (x0, y0, x1, y1), radio=18)
    d.rounded_rectangle((x0 + 18, y0 + 24, x0 + 27, y1 - 24), radius=4, fill=MARCA)
    texto_pie = (
        "Stack Docker real · http://127.0.0.1:8095 · capturas 2026-11-18 (America/Bogota) · "
        "commit 0ee5ed4 · eventos y alertas de demostración generados por el software; "
        "no son la campaña física."
    )
    f_pie = fuente("regular", 23)
    max_w = x1 - x0 - 90 - 330
    lineas = envolver(d, texto_pie, f_pie, max_w)
    alto_total = sum(int(alto_linea(f_pie) * 0.92) for _ in lineas)
    y_txt = y0 + (ALTO_PIE - alto_total) // 2
    for linea in lineas:
        d.text((x0 + 52, y_txt), linea, font=f_pie, fill=TEXTO2)
        y_txt += int(alto_linea(f_pie) * 0.92)
    f_r1 = fuente("bold", 22)
    f_r2 = fuente("regular", 20)
    alto_der = int(alto_linea(f_r1) * 0.92) + int(alto_linea(f_r2) * 0.92)
    y_der = y0 + (ALTO_PIE - alto_der) // 2
    texto(d, x1 - 40, y_der, "VYBRA · hoja %02d / 02" % n_hoja, f_r1, TEXTO3, alineacion="der")
    etiqueta = "ADMIN · panel de operación" if layout["rol"] == "ADMIN" else "CLIENTE · vista pública"
    texto(d, x1 - 40, y_der + int(alto_linea(f_r1) * 0.92), etiqueta, f_r2, TEXTO3, alineacion="der")


def validar_geometria(layout: dict) -> list[str]:
    problemas: list[str] = []
    W, H = layout["ancho"], layout["alto"]
    if W < ANCHO_MINIMO:
        problemas.append("ancho %d < mínimo %d" % (W, ANCHO_MINIMO))
    if W <= H:
        problemas.append("la lámina no es apaisada: %d×%d" % (W, H))
    cajas = []
    for fila in layout["filas"]:
        x = fila["x"]
        for _ in fila["fila"]["vistas"]:
            cajas.append((x, fila["y"], x + layout["ancho_tarjeta_esc"], fila["y"] + fila["alto"]))
            x += layout["ancho_tarjeta_esc"] + HUECO_COLUMNA
    ancho_tira = layout["n_vistas"] * layout["celda_mov"] + (layout["n_vistas"] - 1) * HUECO_MOVIL
    x_tira = (W - ancho_tira) // 2
    for i in range(layout["n_vistas"]):
        x0 = x_tira + i * (layout["celda_mov"] + HUECO_MOVIL)
        cajas.append((x0, layout["y_movil"], x0 + layout["celda_mov"], layout["y_movil"] + layout["alto_tarjeta_mov"]))
    for caja in cajas:
        if caja[0] < 0 or caja[2] > W or caja[1] < 0 or caja[3] > H:
            problemas.append("recuadro fuera de la lámina: %s" % (caja,))
    # sin solapes entre recuadros
    for i in range(len(cajas)):
        for j in range(i + 1, len(cajas)):
            a, b = cajas[i], cajas[j]
            if a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]:
                problemas.append("recuadros solapados: %s y %s" % (a, b))
    return problemas


# --------------------------------------------------------------------------- #
# Generación de una hoja
# --------------------------------------------------------------------------- #
def generar_hoja(
    rol_esperado: str,
    vistas: list[dict],
    manifiesto: dict,
    ruta_salida: str,
    n_hoja: int,
    medidor: ImageDraw.ImageDraw,
) -> dict:
    if not vistas:
        raise ValueError("No hay vistas que componer para %s" % rol_esperado)
    ancho, layout = calcular_ancho(rol_esperado, vistas, medidor)
    problemas = validar_geometria(layout)
    if problemas:
        raise ValueError("Geometría inválida: %s" % "; ".join(problemas))

    hoja = Image.new("RGB", (ancho, layout["alto"]), FONDO)
    d = ImageDraw.Draw(hoja)
    n_capturas = len(vistas) * 2

    dibujar_cabecera(d, layout, manifiesto, n_capturas)
    dim_esc = vistas[0]["dispositivos"]["escritorio"]["nativo"]
    dibujar_seccion(
        d, layout, layout["y_seccion_esc"], "ESCRITORIO",
        "· %d capturas · %d columnas · sin ampliación (escala sólo hacia abajo)" % (layout["n_vistas"], layout["columnas"]),
        "orden de lectura: fila a fila, de izquierda a derecha",
    )
    recuadros_esc = dibujar_grilla(d, layout, vistas, hoja)

    dprs_mov = {v["dispositivos"]["movil"]["dpr"] for v in vistas}
    mov = vistas[0]["dispositivos"]["movil"]
    if dprs_mov == {2}:
        detalle_mov = "· %d capturas · %d×%d lógicos · PNG a DPR 2" % (
            layout["n_vistas"], mov["logico"][0], mov["logico"][1])
    else:
        detalle_mov = "· %d capturas · viewport móvil ~%d×%d" % (
            layout["n_vistas"], mov["logico"][0], mov["logico"][1])
    dibujar_seccion(
        d, layout, layout["y_seccion_mov"], "MÓVIL", detalle_mov,
        "misma interfaz, barra de navegación inferior",
    )
    recuadros_mov = dibujar_tira_movil(d, layout, vistas, hoja)
    dibujar_pie(d, layout, n_hoja)

    os.makedirs(os.path.dirname(os.path.abspath(ruta_salida)), exist_ok=True)
    hoja.save(ruta_salida, format="PNG", compress_level=6)

    with Image.open(ruta_salida) as verif:
        verif.load()
        if verif.size != (ancho, layout["alto"]):
            raise ValueError(
                "La hoja guardada mide %s y se esperaba %s" % (verif.size, (ancho, layout["alto"]))
            )
        if not verif.getbbox():
            raise ValueError("La hoja guardada está vacía")

    return {
        "archivo": os.path.basename(ruta_salida),
        "rol": rol_esperado,
        "base_url": manifiesto.get("base_url"),
        "dimensiones": [ancho, layout["alto"]],
        "apaisada": ancho > layout["alto"],
        "vistas": len(vistas),
        "capturas": n_capturas,
        "dimensiones_escritorio": list(dim_esc),
        "recuadros": recuadros_esc + recuadros_mov,
    }


# --------------------------------------------------------------------------- #
# Nota y manifiesto de salida
# --------------------------------------------------------------------------- #
ORDEN_ROLES = [
    ("ADMIN", "admin.json", "hoja-01-ADMIN-escritorio-y-movil.png", 1),
    ("CLIENTE", "cliente.json", "hoja-02-CLIENTE-escritorio-y-movil.png", 2),
]


def escribir_nota(
    ruta: str,
    resultados: list[dict],
    discrepancias: list[dict],
    manifiestos_fuente: dict,
    capturas_dir: str,
) -> None:
    ahora = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M %Z")
    bases = sorted({r["base_url"] for r in resultados if r.get("base_url")})
    lineas = [
        "# NOTA — Hojas de evidencia visual (B-interfaz)",
        "",
        "Láminas PNG de alta resolución con **todas las vistas de cada rol**, en escritorio y",
        "en móvil, con cabecera, pie de foto por captura y pie de trazabilidad.",
        "",
        "## Archivos de esta carpeta",
        "",
        "| archivo | contenido |",
        "| --- | --- |",
    ]
    for r in resultados:
        lineas.append(
            "| `%s` | %s · %d vistas · %d capturas · %d×%d px |"
            % (r["archivo"], r["rol"], r["vistas"], r["capturas"],
               r["dimensiones"][0], r["dimensiones"][1])
        )
    lineas += [
        "| `generar-hojas.py` | script reproducible de composición (Pillow) |",
        "| `manifest-hojas.json` | mapeo recuadro → archivo fuente + sha256 |",
        "",
        "## Contexto y trazabilidad",
        "",
        "- Stack Docker real en ejecución en `%s` (ADMIN en `/admin/`, CLIENTE en" % URL_STACK,
        "  `/cliente/`; la ruta `/publico` redirige a `/cliente/`).",
        "- Commit de la evidencia: `%s`. Zona horaria: America/Bogota." % COMMIT_EVIDENCIA,
        "- Fecha de composición de las láminas: %s." % ahora,
    ]
    for r in resultados:
        rango = ""
        desde, hasta = r.get("captura_desde"), r.get("captura_hasta")
        if desde and hasta:
            rango = " · capturas %s → %s" % (desde, hasta) if desde != hasta else " · captura %s" % desde
        lineas.append(
            "- **%s**: %d vistas / %d capturas%s. Fecha del manifiesto: %s."
            % (r["rol"], r["vistas"], r["capturas"], rango, r.get("manifiesto_fecha") or "—")
        )
    alertas: list[tuple[str, str]] = []
    for r in resultados:
        for nota in r.get("notas") or []:
            alertas.extend(extraer_alertas([nota]))
    alertas = sorted(set(alertas), key=lambda a: a[1])
    if alertas:
        detalle = " y ".join("alerta id %s (%s)" % (i, f) for i, f in alertas)
        lineas += [
            "",
            "Alertas de demostración generadas por el software durante la sesión de capturas:",
            "%s. Proceden de pulsaciones reales `POST /api/nodos/N/pulsar` sobre el" % detalle,
            "stack y no son la campaña física; el pie de página de cada lámina lo advierte.",
        ]
    origen = next((r.get("origen") for r in resultados if r.get("origen")), None)
    if origen:
        lineas += ["", "Origen declarado por los capturadores:", "", "- " + origen]

    lineas += [
        "",
        "## Método de composición",
        "",
        "- Pillow 12.3.0 sobre el Python del harness:",
        "  `/home/t1an/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/bin/python3`.",
        "- Fuentes del sistema: DejaVu Sans (regular/bold).",
        "- Paleta tomada de `web/public/tokens.css`: lienzo `#f6f6f3`, superficie `#ffffff`,",
        "  borde `#dbe2e6`, textos `#17212a` / `#4d5b66` / `#6b7883`, marca `#0e6a76`.",
        "- Hojas apaisadas, ancho ≥ %d px, con bandas (cabecera, secciones, rejilla, pie)" % ANCHO_MINIMO,
        "  alineadas al mismo margen; la fila incompleta final se centra.",
        "- Las capturas se escalan **sólo hacia abajo** (nunca por encima de su tamaño",
        "  nativo) y de forma proporcional. En escritorio se usa una altura común de imagen",
        "  (sin recortar; las de otra proporción quedan enmarcadas) y en móvil se parte del",
        "  tamaño lógico CSS, indicando el tamaño del PNG cuando el original está a DPR 2.",
        "- Pie de foto: número de orden · nombre de vista · dispositivo · resolución.",
        "- Se verifica al guardar que el PNG abre, que sus dimensiones son las calculadas",
        "  y que cada recuadro se dibujó a partir de un archivo real (sha256 en el manifiesto).",
        "",
        "## Recuento",
        "",
        "| hoja | rol | vistas | capturas | recuadros | dimensiones | apaisada |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in resultados:
        lineas.append(
            "| `%s` | %s | %d | %d | %d | %d×%d | %s |"
            % (r["archivo"], r["rol"], r["vistas"], r["capturas"], len(r["recuadros"]),
               r["dimensiones"][0], r["dimensiones"][1], "sí" if r["apaisada"] else "no")
        )

    lineas += ["", "## Discrepancias y avisos automáticos", ""]
    if discrepancias:
        for disc in discrepancias:
            detalles = "; ".join(
                "%s=%s" % (k, v) for k, v in disc.items()
                if k not in {"tipo", "hoja", "vista", "dispositivo"}
            )
            lineas.append(
                "- **%s** · %s · %s · %s · %s"
                % (disc.get("tipo", "aviso"), disc.get("hoja", ""),
                   disc.get("vista", ""), disc.get("dispositivo", ""), detalles)
            )
    else:
        lineas.append(
            "- Ninguna automática: los manifiestos, los archivos y las dimensiones coinciden;"
        )
        lineas.append("  todas las vistas tienen captura de escritorio y de móvil.")

    lineas += [
        "",
        "## Discrepancias documentadas por los capturadores",
        "",
        "Anotadas en los manifiestos y heredadas de `NOTA-capturas-REF.md`; no se inventó",
        "ninguna captura para cubrirlas:",
        "",
        '- **SIMULACRO sin franja "PRUEBA"**: la pantalla de alerta del CLIENTE rotula siempre',
        "  SIMULACRO; la SPA vigente no incluye franja PRUEBA.",
        '- **Sin diálogo "Ayuda y atajos"**: el inventario original lo menciona, pero la SPA',
        "  vigente no lo tiene; por eso no aparece en las láminas.",
        "- **Leaflet + teselas de OpenStreetMap**: el mapa del CLIENTE usa Leaflet/OSM, mientras",
        '  `README.md` §7 afirma "mapa SVG propio (sin Leaflet ni teselas externas)".',
        '- **"Ver telemetría" oculto en móvil**: el botón de escritorio no está en móvil; se',
        '  llegó a Sismógrafos desde el enlace real "Ver todo" (misma acción `open-sensors`).',
        "- **ADMIN móvil**: la barra inferior real tiene 8 secciones (sin Configuración);",
        "  Configuración se abre con el engranaje real de la barra superior.",
        "- **ADMIN sin rutas por URL**: la SPA cambia de vista por estado React; todas las",
        '  capturas quedan en `/admin/` y la vista se identifica por el campo "vista".',
        "- **Servidores (ADMIN)**: única captura de escritorio a 1400×1200, para mostrar las tres",
        "  tarjetas completas; en la lámina se muestra a 1050×900 (altura común de fila), sin",
        "  recortar contenido.",
        "",
        "## Reproducción",
        "",
        "```bash",
        "python3 generar-hojas.py \\",
        "    --manifiesto-dir /tmp/hojas-ui/capturas \\",
        "    --capturas-dir  /tmp/hojas-ui/capturas \\",
        "    --salida        .",
        "```",
        "",
        "El script aborta si falta una vista, un dispositivo o un archivo: no inventa recuadros.",
        "",
    ]
    with open(ruta, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lineas))


def escribir_manifest_hojas(
    ruta: str, resultados: list[dict], discrepancias: list[dict], manifiestos_fuente: dict
) -> None:
    datos = {
        "generado_en": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "script": "generar-hojas.py",
        "fuente": manifiestos_fuente,
        "hojas": resultados,
        "discrepancias": discrepancias,
    }
    with open(ruta, "w", encoding="utf-8") as fh:
        json.dump(datos, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Compone las hojas PNG de evidencia visual de VYBRA.")
    ap.add_argument("--manifiesto-dir", default="/tmp/hojas-ui/capturas",
                    help="directorio donde están admin.json y cliente.json")
    ap.add_argument("--capturas-dir", default="/tmp/hojas-ui/capturas",
                    help="directorio base para resolver los archivos de captura")
    ap.add_argument("--salida", default=os.path.dirname(os.path.abspath(__file__)),
                    help="directorio donde escribir las hojas, la nota y el manifiesto")
    ap.add_argument("--prefijo", default="", help="prefijo para los nombres de archivo generados")
    ap.add_argument("--permitir-faltantes", action="store_true",
                    help="no abortar si falta una captura; sólo componer lo disponible")
    args = ap.parse_args(argv)

    medidor = ImageDraw.Draw(Image.new("RGB", (8, 8), FONDO))
    resultados: list[dict] = []
    discrepancias: list[dict] = []
    errores: list[str] = []
    manifiestos_fuente = {"manifiestos": [], "capturas_dir": os.path.abspath(args.capturas_dir)}

    for rol, archivo_manifiesto, archivo_salida, n_hoja in ORDEN_ROLES:
        ruta_man = os.path.join(args.manifiesto_dir, archivo_manifiesto)
        if not os.path.isfile(ruta_man):
            errores.append("No existe el manifiesto %s" % ruta_man)
            continue
        manifiesto = cargar_manifiesto(ruta_man)
        rol_man = str(manifiesto.get("rol", rol)).upper()
        if rol_man != rol:
            discrepancias.append(
                {"tipo": "rol_manifiesto_distinto", "hoja": archivo_salida,
                 "vista": "-", "dispositivo": "-", "manifiesto": rol_man, "esperado": rol}
            )
        vistas, disc = preparar_vistas(manifiesto, args.capturas_dir, ruta_man, errores)
        for d_ in disc:
            d_["hoja"] = archivo_salida
        discrepancias.extend(disc)
        if errores and not args.permitir_faltantes:
            continue
        if not vistas:
            continue
        ruta_final = os.path.join(args.salida, args.prefijo + archivo_salida)
        print("· componiendo %s (%d vistas)…" % (ruta_final, len(vistas)), flush=True)
        try:
            resultado = generar_hoja(rol, vistas, manifiesto, ruta_final, n_hoja, medidor)
        except Exception as exc:  # noqa: BLE001
            errores.append("Fallo al generar %s: %s" % (rol, exc))
            continue
        por_archivo = {
            (v["orden"], d): info for v in vistas for d, info in v["dispositivos"].items()
        }
        for rec in resultado["recuadros"]:
            info = por_archivo.get((rec["orden"], rec["dispositivo"]))
            if info:
                rec["archivo_fuente"] = info["archivo"]
                rec["sha256"] = info["sha256"]
                rec["tamano_nativo"] = list(info["nativo"])
                rec["tamano_logico"] = list(info["logico"])
                rec["dpr"] = info["dpr"]
                rec["capturado_en"] = info.get("capturado_en")
        resultado["manifiesto_fecha"] = manifiesto.get("fecha")
        resultado["origen"] = manifiesto.get("origen")
        resultado["notas"] = manifiesto.get("notas") or []
        fechas = sorted(
            f for f in (
                parse_fecha(info.get("capturado_en"))
                for v in vistas for info in v["dispositivos"].values()
            ) if f is not None
        )
        if fechas:
            resultado["captura_desde"] = fechas[0].strftime("%Y-%m-%d %H:%M:%S")
            resultado["captura_hasta"] = fechas[-1].strftime("%Y-%m-%d %H:%M:%S")
        resultados.append(resultado)
        manifiestos_fuente["manifiestos"].append(os.path.abspath(ruta_man))
        print("  ok: %d×%d px, %d recuadros" % (
            resultado["dimensiones"][0], resultado["dimensiones"][1], len(resultado["recuadros"])
        ), flush=True)

    if errores:
        print("\nERRORES:", file=sys.stderr)
        for e in errores:
            print("  - " + e, file=sys.stderr)
        if not args.permitir_faltantes:
            print("\nNo se escribieron hojas finales. Corrige los manifiestos/capturas y reintenta.",
                  file=sys.stderr)
            return 2

    if not resultados:
        print("No se generó ninguna hoja.", file=sys.stderr)
        return 2

    os.makedirs(args.salida, exist_ok=True)
    escribir_nota(
        os.path.join(args.salida, args.prefijo + "NOTA-hojas.md"),
        resultados, discrepancias, manifiestos_fuente, args.capturas_dir,
    )
    escribir_manifest_hojas(
        os.path.join(args.salida, args.prefijo + "manifest-hojas.json"),
        resultados, discrepancias, manifiestos_fuente,
    )
    print("\nResumen:", flush=True)
    for r in resultados:
        print("  %s — %d×%d px · %d vistas · %d capturas" % (
            r["archivo"], r["dimensiones"][0], r["dimensiones"][1], r["vistas"], r["capturas"]
        ))
    if discrepancias:
        print("Discrepancias: %d (ver NOTA-hojas.md)" % len(discrepancias), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
