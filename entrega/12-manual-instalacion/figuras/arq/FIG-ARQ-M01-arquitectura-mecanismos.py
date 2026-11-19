#!/usr/bin/env python3
# Genera el SVG de FIG-ARQ-M01 para el manual VYBRA.
# Layout 3000x2200, fondo blanco, etiquetas en español.
import html

W, H = 3000, 2200
partes = []

def add(s):
    partes.append(s)

def esc(t):
    return html.escape(t, quote=True)

def rect(x, y, w, h, fill, stroke, sw=2, rx=12, dash=None, opacity=None):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    o = f' fill-opacity="{opacity}"' if opacity is not None else ''
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}{o}/>')

def text(x, y, t, size=18, fill="#1e293b", weight="normal", anchor="start", rotate=None):
    tr = f' transform="rotate({rotate} {x} {y})"' if rotate is not None else ''
    add(f'<text x="{x}" y="{y}" font-family="DejaVu Sans, sans-serif" font-size="{size}" '
        f'font-weight="{weight}" fill="{fill}" text-anchor="{anchor}"{tr}>{esc(t)}</text>')

def lines(x, y, arr, size=18, fill="#1e293b", lh=None, weight=None, anchor="start"):
    lh = lh or int(size * 1.35)
    for i, t in enumerate(arr):
        text(x, y + i * lh, t, size=size, fill=fill, weight=(weight or "normal"), anchor=anchor)

def line(x1, y1, x2, y2, color="#334155", sw=2.5, dash=None, start=False, end=False, marker="gray"):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    ms = f' marker-start="url(#{marker}-start)"' if start else ''
    me = f' marker-end="url(#{marker}-end)"' if end else ''
    add(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{sw}" '
        f'stroke-linecap="round"{d}{ms}{me}/>')

def path(d, color="#334155", sw=2.5, dash=None, start=False, end=False, marker="gray"):
    da = f' stroke-dasharray="{dash}"' if dash else ''
    ms = f' marker-start="url(#{marker}-start)"' if start else ''
    me = f' marker-end="url(#{marker}-end)"' if end else ''
    add(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{sw}" '
        f'stroke-linejoin="round" stroke-linecap="round"{da}{ms}{me}/>')

def pill(cx, cy, t, size=18, pad=12, fill="#ffffff", stroke="#cbd5e1", color="#0f172a", weight="normal", w=None, rotate=None):
    tw = w if w is not None else int(len(t) * size * 0.56) + 2 * pad
    h = int(size * 1.5) + 6
    rect(cx - tw // 2, cy - h // 2, tw, h, fill, stroke, sw=1.2, rx=8)
    text(cx, cy + size * 0.36, t, size=size, fill=color, weight=weight, anchor="middle", rotate=rotate)

def bridge(x, y, horizontal=True, largo=14, grosor=12):
    # borra un tramo de línea para que un cruce se lea como puente
    if horizontal:
        rect(x - largo // 2, y - grosor // 2, largo, grosor, "#ffffff", "#ffffff", sw=0, rx=0)
    else:
        rect(x - grosor // 2, y - largo // 2, grosor, largo, "#ffffff", "#ffffff", sw=0, rx=0)

# ------------------------------------------------------------------ defs
add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
add('<defs>')
for name, color in [("gray", "#334155"), ("teal", "#0f766e"), ("purple", "#7c3aed"), ("blue", "#1d4ed8")]:
    add(f'<marker id="{name}-end" viewBox="0 0 10 10" markerWidth="9" markerHeight="9" refX="8.5" refY="5" orient="auto">'
        f'<path d="M0,0 L10,5 L0,10 z" fill="{color}"/></marker>')
    add(f'<marker id="{name}-start" viewBox="0 0 10 10" markerWidth="9" markerHeight="9" refX="1.5" refY="5" orient="auto">'
        f'<path d="M10,0 L0,5 L10,10 z" fill="{color}"/></marker>')
add('</defs>')

add(f'<rect x="0" y="0" width="{W}" height="{H}" fill="#ffffff"/>')

# ------------------------------------------------------------------ título
text(70, 64, "Arquitectura de VYBRA: componentes y mecanismos de comunicación", size=38, weight="bold", fill="#0f172a")
text(70, 104, "3 nodos ESP32 con Raft propio · agregador Node.js · 3 servidores de datos con PostgreSQL · controlador · Caddy opcional · NTP", size=20, fill="#475569")

# ------------------------------------------------------------------ campo de nodos
rect(60, 220, 1860, 780, "#f8fafc", "#94a3b8", sw=2, rx=20)
text(1010, 272, "Campo · red WiFi 2,4 GHz · DHCP · broadcast permitido", size=20, fill="#334155", anchor="middle", weight="bold")

# OTA (PC de desarrollo)
rect(90, 245, 360, 115, "#eef2ff", "#6366f1", sw=2.2, rx=12)
lines(110, 285, ["PC de desarrollo", "arduino-cli 1.5.1 · cargar.sh", "flasheo por USB o WiFi"], size=18, lh=28, fill="#312e81")
line(250, 360, 250, 480, color="#6366f1", sw=2.4, dash="7 5", end=True, marker="purple")
text(95, 392, "OTA", size=17, fill="#4338ca", weight="bold")
text(95, 416, "TCP 32323", size=17, fill="#4338ca")
text(95, 440, "UDP 3232", size=17, fill="#4338ca")

# NTP
rect(1500, 245, 400, 115, "#f0f9ff", "#0ea5e9", sw=2.2, rx=12)
lines(1520, 285, ["NTP (SNTP)", "pool.ntp.org · time.google.com", "UTC-5 · cada 10 min"], size=18, lh=28, fill="#0c4a6e")
line(1700, 360, 1700, 480, color="#0ea5e9", sw=2.4, dash="7 5", end=True, marker="purple")
pill(1750, 425, "SNTP", size=17, pad=10, stroke="#bae6fd", color="#075985")

# nodos
nodo_x = [110, 730, 1350]
for i, x in enumerate(nodo_x):
    rect(x, 480, 500, 280, "#ffffff", "#1e3a8a", sw=2.4, rx=14)
    add(f'<path d="M{x+14},480 h472 a14,14 0 0 1 14,14 v32 h-500 v-32 a14,14 0 0 1 14,-14 z" fill="#1d4ed8"/>')
    text(x + 22, 511, f"ESP32 · Nodo {i+1}", size=22, weight="bold", fill="#ffffff")
    yy = 552
    body = [
        "Pulsador en GPIO4 · activo en bajo",
        "LED azul integrado en GPIO2",
        "Raft propio · log en RAM",
        "API HTTP :80 · JSON sin TLS",
        "UDP 4210 y 4211 · descubrimiento",
        "NTP UTC-5 · OTA TCP 32323",
    ]
    for t in body:
        text(x + 22, yy, t, size=17.5, fill="#1e293b")
        yy += 30

# enlaces Raft y descubrimiento entre nodos adyacentes
for x1, x2 in [(610, 730), (1230, 1350)]:
    line(x1, 620, x2, 620, color="#334155", sw=2.6, start=True, end=True, marker="gray")
    text((x1 + x2) / 2, 604, "4210", size=16, fill="#334155", anchor="middle", weight="bold")
    line(x1, 700, x2, 700, color="#64748b", sw=2.2, dash="7 5", start=True, end=True, marker="gray")
    text((x1 + x2) / 2, 724, "4211", size=16, fill="#64748b", anchor="middle", weight="bold")

# descubrimiento broadcast (U superior, nodos 1 y 3)
line(360, 400, 1590, 400, color="#64748b", sw=2.2, dash="7 5")
line(360, 400, 360, 480, color="#64748b", sw=2.2, dash="7 5", end=True, marker="gray")
line(1590, 400, 1590, 480, color="#64748b", sw=2.2, dash="7 5", end=True, marker="gray")
pill(975, 382, "UDP 4211 · broadcast SISMO-HOLA:N cada 2 s", size=18, pad=14, stroke="#cbd5e1", color="#334155")

# consenso Raft (U inferior, nodos 1 y 3)
line(360, 900, 1590, 900, color="#334155", sw=2.6)
line(360, 900, 360, 760, color="#334155", sw=2.6, end=True, marker="gray")
line(1590, 900, 1590, 760, color="#334155", sw=2.6, end=True, marker="gray")
pill(800, 940, "UDP 4210 · Raft unicast · malla completa de 3 nodos", size=18, pad=14, stroke="#cbd5e1", color="#334155")

# ------------------------------------------------------------------ bus HTTP :80 de los nodos
BUS80_Y = 1080
line(360, BUS80_Y, 1900, BUS80_Y, color="#0f766e", sw=3.2)
# stubs de los nodos al bus (offset para no pisar la U de Raft)
for x in (510, 1130, 1740):
    bridge(x, 900, horizontal=True)
    line(x, 760, x, BUS80_Y, color="#0f766e", sw=2.4, start=True, end=True, marker="teal")
pill(820, 1018, "API HTTP :80 de los nodos", size=18, pad=12, stroke="#99f6e4", color="#115e59", weight="bold")
pill(820, 1057, "sondeo 1 Hz · POST /control y /pulsar", size=16, pad=10, stroke="#99f6e4", color="#115e59")

# ------------------------------------------------------------------ panel / agregador
rect(2100, 480, 600, 400, "#fffbeb", "#b45309", sw=2.6, rx=16)
add('<path d="M2116,480 h568 a16,16 0 0 1 16,16 v34 h-600 v-34 a16,16 0 0 1 16,-16 z" fill="#b45309"/>')
text(2122, 515, "Agregador y panel", size=24, weight="bold", fill="#ffffff")
lines(2122, 560, ["Node.js ESM · sin framework", "HTTP :8090 · host :8095", "SSE /api/stream", "Sondeo 1 Hz · foto en RAM", "Proxy de control e histórico"], size=19, lh=32, fill="#78350f")
text(2122, 760, "12 rutas HTTP en /api/*", size=17, fill="#92400e")

# panel -> bus HTTP 80 de nodos
path(f"M2100,650 L1960,650 L1960,{BUS80_Y} L1900,{BUS80_Y}", color="#0f766e", sw=2.6, end=True, marker="teal")
text(1975, 1014, "panel: GET 1 Hz", size=16, fill="#115e59", weight="bold")

# ------------------------------------------------------------------ navegadores
rect(2050, 120, 370, 200, "#eff6ff", "#2563eb", sw=2.4, rx=14)
text(2070, 155, "Navegador ADMIN", size=20, weight="bold", fill="#1e3a8a")
lines(2070, 195, ["React 19 · TypeScript", "operación y control", "/admin/"], size=17.5, lh=30, fill="#1e40af")
rect(2480, 120, 370, 200, "#eff6ff", "#2563eb", sw=2.4, rx=14)
text(2500, 155, "Navegador CLIENTE", size=20, weight="bold", fill="#1e3a8a")
lines(2500, 195, ["HTML + JS + Leaflet", "alerta y protocolo", "/cliente/"], size=17.5, lh=30, fill="#1e40af")
line(2200, 320, 2200, 480, color="#334155", sw=2.4, start=True, end=True, marker="gray")
line(2600, 320, 2600, 480, color="#334155", sw=2.4, start=True, end=True, marker="gray")
pill(2345, 390, "HTTP/SSE :8095", size=17, pad=10, stroke="#cbd5e1")
pill(2345, 421, "estado + vivo cada 5 s", size=16, pad=9, stroke="#cbd5e1")

# Caddy opcional
rect(2760, 560, 230, 150, "#faf5ff", "#7c3aed", sw=2.0, rx=12, dash="8 6")
lines(2775, 595, ["Caddy 2", "HTTPS :8443", "perfil opcional", "TLS interno"], size=16.5, lh=26, fill="#4c1d95")
line(2700, 635, 2760, 635, color="#7c3aed", sw=2.2, dash="7 5", start=True, end=True, marker="purple")
text(2730, 616, "TLS", size=16, fill="#6d28d9", anchor="middle")

# ------------------------------------------------------------------ controlador y Docker
rect(2100, 1100, 320, 180, "#fef2f2", "#dc2626", sw=2.4, rx=14)
text(2120, 1135, "Controlador", size=21, weight="bold", fill="#7f1d1d")
lines(2120, 1172, ["Node.js", "HTTP :8200 interno", "token Bearer", "solo stop y start"], size=17, lh=26, fill="#991b1b")
rect(2500, 1100, 400, 180, "#f1f5f9", "#64748b", sw=2.2, rx=14)
text(2520, 1135, "Docker Engine", size=21, weight="bold", fill="#1e293b")
lines(2520, 1172, ["socket /var/run/docker.sock", "nodoN y servidorN", "las bases no se tocan"], size=17, lh=26, fill="#334155")
line(2420, 1190, 2500, 1190, color="#334155", sw=2.4, start=True, end=True, marker="gray")
text(2460, 1168, "socket", size=16, fill="#334155", anchor="middle")
line(2300, 880, 2300, 1100, color="#334155", sw=2.6, start=True, end=True, marker="gray")
pill(2325, 985, "HTTP :8200 · Bearer", size=16, pad=9, stroke="#cbd5e1")

# ------------------------------------------------------------------ servidores de datos + PostgreSQL
srv_x = [110, 730, 1350]
srv_data = [("Servidor de datos 1", "Node.js · Fedora 42"), ("Servidor de datos 2", "Node.js · openSUSE Leap 15.6"), ("Servidor de datos 3", "Node.js · Ubuntu 24.04")]
for (x, (titulo, distro)) in zip(srv_x, srv_data):
    rect(x, 1450, 500, 380, "#ecfdf5", "#047857", sw=2.4, rx=14)
    add(f'<path d="M{x+14},1450 h472 a14,14 0 0 1 14,14 v32 h-500 v-32 a14,14 0 0 1 14,-14 z" fill="#047857"/>')
    text(x + 22, 1481, titulo, size=21, weight="bold", fill="#ffffff")
    text(x + 22, 1528, distro, size=17.5, fill="#065f46")
    text(x + 22, 1557, "API HTTP :8100 (interno)", size=17.5, fill="#065f46")
    text(x + 22, 1586, "recolector propio a 1 Hz", size=17.5, fill="#065f46")
    rect(x + 30, 1610, 440, 190, "#ffffff", "#059669", sw=2.0, rx=10)
    text(x + 50, 1643, "PostgreSQL 16", size=19, weight="bold", fill="#064e3b")
    lines(x + 50, 1678, ["TCP 5432 · solo red interna", "una base por servidor", "sin puerto publicado", "volumen sismo-dbN"], size=16.5, lh=27, fill="#065f46")

# servidores -> bus HTTP 80 (sondeo propio)
for x in (360, 980, 1590):
    line(x, 1450, x, BUS80_Y, color="#0f766e", sw=2.4, start=True, end=True, marker="teal")
pill(610, 1215, "cada servidorN sondea a su nodoN · HTTP 1 Hz", size=17, pad=11, stroke="#99f6e4", color="#115e59")

# ------------------------------------------------------------------ bus de consulta del histórico (panel -> servidores)
Q_Y = 1370
line(510, Q_Y, 2470, Q_Y, color="#7c3aed", sw=3.0)
for x in (980, 1590):
    bridge(x, Q_Y, horizontal=True)
# panel -> bus de consulta
path(f"M2470,880 L2470,{Q_Y}", color="#7c3aed", sw=2.6, end=True, marker="purple")
# drops a cada servidor
for x in (510, 1130, 1740):
    line(x, Q_Y, x, 1450, color="#7c3aed", sw=2.4, start=True, end=True, marker="purple")
pill(680, 1338, "HTTP :8100 interno · histórico, registro y retención", size=17, pad=11, stroke="#ddd6fe", color="#5b21b6")

# ------------------------------------------------------------------ leyenda
rect(70, 1930, 1310, 200, "#ffffff", "#cbd5e1", sw=1.6, rx=12)
text(95, 1965, "Leyenda", size=18, weight="bold", fill="#0f172a")
line(100, 2005, 220, 2005, color="#334155", sw=2.6, start=True, end=True, marker="gray")
text(240, 2011, "petición y respuesta (HTTP/TCP)", size=17, fill="#334155")
line(100, 2048, 220, 2048, color="#64748b", sw=2.2, dash="7 5", start=True, end=True, marker="gray")
text(240, 2054, "broadcast UDP o elemento opcional", size=17, fill="#334155")
rect(100, 2078, 26, 22, "#1d4ed8", "#1e3a8a", sw=1.4, rx=4)
text(140, 2096, "nodo ESP32", size=17, fill="#334155")
rect(280, 2078, 26, 22, "#047857", "#065f46", sw=1.4, rx=4)
text(320, 2096, "servidor de datos", size=17, fill="#334155")
rect(540, 2078, 26, 22, "#b45309", "#78350f", sw=1.4, rx=4)
text(580, 2096, "agregador y panel", size=17, fill="#334155")
rect(790, 2078, 26, 22, "#dc2626", "#7f1d1d", sw=1.4, rx=4)
text(830, 2096, "controlador", size=17, fill="#334155")

# nota de fuente
text(2930, 2152, "Fuente: docker-compose.yml, web/ y firmware/detector/config.h · versión v1.0.0-rc1, commit 0ee5ed4 · 2026-11-18", size=16, fill="#64748b", anchor="end")

add('</svg>')

with open('/tmp/FIG-ARQ-M01.svg', 'w', encoding='utf-8') as f:
    f.write('\n'.join(partes))
print("SVG escrito:", len('\n'.join(partes)), "bytes")
