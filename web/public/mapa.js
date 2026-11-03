// Mapa liso en SVG (sin calles ni internet): nodos, persona y zona del sismo.
// Compartido por la vista pública y el panel de operación. Solo usa APIs del DOM, nunca innerHTML.
import { colorNodo, proyectar } from './geo.js';

const NS = 'http://www.w3.org/2000/svg';
const ANCHO = 640;
const ALTO = 400;
const TOKEN = { rojo: 'var(--err)', azul: 'var(--info)', verde: 'var(--ok)' };
const SEV = { leve: 'var(--sev-leve)', moderado: 'var(--sev-moderado)', fuerte: 'var(--sev-fuerte)', severo: 'var(--sev-severo)' };
const MENSAJE_VACIO = 'Todavía no hay nodos ubicados. Ubícalos desde el panel con un celular.';

function el(nombre, attrs = {}, texto) {
  const e = document.createElementNS(NS, nombre);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (texto != null) e.textContent = texto;
  return e;
}

const f1 = (v) => Math.round(v * 10) / 10;

// Largo "redondo" de la barra de escala: 1, 2 o 5 por potencia de 10 que quepa en maxM.
function escalaBonita(maxM) {
  const pot = 10 ** Math.floor(Math.log10(maxM));
  for (const m of [5, 2, 1]) if (m * pot <= maxM) return m * pot;
  return pot;
}
const textoLargo = (m) => (m >= 1000 ? `${m / 1000} km` : m >= 1 ? `${m} m` : `${Math.round(m * 100)} cm`);

// ---------- Zoom y desplazamiento ----------
// Cada <svg> guarda su vista (zoom z y desplazamiento ox/oy en unidades del viewBox) entre redibujos.
const ANCHO_MIN_M = 3;          // lo más cerca: unos 3 m de ancho visible
const vistas = new WeakMap();
const limitar = (v, a, b) => Math.min(b, Math.max(a, v));

function vistaDe(svg) {
  let v = vistas.get(svg);
  if (!v) {
    v = { z: 1, ox: 0, oy: 0, zMax: 1, args: null, punteros: new Map(), pellizco: null, pendiente: false,
      baseEdicion: null, aLatLon: null, arrastre: null };
    vistas.set(svg, v);
    instalarInteraccion(svg, v);
  }
  return v;
}

function redibujar(svg, v) {
  if (v.pendiente) return;
  v.pendiente = true;
  requestAnimationFrame(() => { v.pendiente = false; if (v.args) dibujarMapa(svg, v.args); });
}

// Acerca o aleja manteniendo fijo el punto (cx, cy) del viewBox.
function zoomEn(svg, v, factor, cx = ANCHO / 2, cy = ALTO / 2) {
  const z = limitar(v.z * factor, 1, v.zMax);
  if (z === v.z) return;
  const wx = (cx - ANCHO / 2 - v.ox) / v.z, wy = (cy - ALTO / 2 - v.oy) / v.z;
  v.z = z;
  v.ox = z === 1 ? 0 : cx - ANCHO / 2 - wx * z;
  v.oy = z === 1 ? 0 : cy - ALTO / 2 - wy * z;
  acotar(v);
  redibujar(svg, v);
}

function acotar(v) {
  const mx = (ANCHO / 2) * v.z, my = (ALTO / 2) * v.z;
  v.ox = limitar(v.ox, -mx, mx);
  v.oy = limitar(v.oy, -my, my);
}

function aViewBox(svg, ev) {
  const r = svg.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) * ANCHO) / r.width, y: ((ev.clientY - r.top) * ALTO) / r.height };
}

function instalarInteraccion(svg, v) {
  // Rueda: zoom alrededor del cursor.
  svg.addEventListener('wheel', (ev) => {
    if (!v.args) return;
    ev.preventDefault();
    const p = aViewBox(svg, ev);
    zoomEn(svg, v, ev.deltaY < 0 ? 1.25 : 0.8, p.x, p.y);
  }, { passive: false });

  // Punteros: un dedo/mouse arrastra; dos dedos pellizcan. En modo edición, tomar un detector
  // lo arrastra a él (no al mapa) y al soltarlo se avisa su nueva posición con alMover.
  svg.addEventListener('pointerdown', (ev) => {
    if (!v.args) return;
    const nodo = v.args.editable && !v.arrastre ? ev.target.closest?.('[data-nodo]') : null;
    if (nodo && v.aLatLon) {
      const n = Number(nodo.dataset.nodo);
      const q = aViewBox(svg, ev);
      const cx = Number(nodo.dataset.x), cy = Number(nodo.dataset.y);
      v.arrastre = { n, id: ev.pointerId, dx: q.x - cx, dy: q.y - cy, pos: null };
      svg.setPointerCapture?.(ev.pointerId);
      ev.preventDefault();
      return;
    }
    v.punteros.set(ev.pointerId, aViewBox(svg, ev));
    svg.setPointerCapture?.(ev.pointerId);
    if (v.punteros.size === 2) {
      const [a, b] = [...v.punteros.values()];
      v.pellizco = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
    }
  });
  svg.addEventListener('pointermove', (ev) => {
    if (v.arrastre && v.arrastre.id === ev.pointerId) {
      const q = aViewBox(svg, ev);
      v.arrastre.pos = v.aLatLon(q.x - v.arrastre.dx, q.y - v.arrastre.dy);
      redibujar(svg, v);
      return;
    }
    if (!v.punteros.has(ev.pointerId)) return;
    const antes = v.punteros.get(ev.pointerId);
    const ahora = aViewBox(svg, ev);
    v.punteros.set(ev.pointerId, ahora);
    if (v.punteros.size === 2 && v.pellizco) {
      const [a, b] = [...v.punteros.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoomEn(svg, v, d / v.pellizco.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      v.pellizco.d = d;
    } else if (v.punteros.size === 1 && v.z > 1 && !v.arrastre) {
      v.ox += ahora.x - antes.x; v.oy += ahora.y - antes.y;
      acotar(v);
      redibujar(svg, v);
    }
  });
  const soltar = (ev) => {
    if (v.arrastre && v.arrastre.id === ev.pointerId) {
      const { n, pos } = v.arrastre;
      v.arrastre = null;
      if (pos && ev.type === 'pointerup' && v.args?.editable) v.args.alMover?.(n, pos);
      else redibujar(svg, v); // cancelado: vuelve a donde estaba
      return;
    }
    v.punteros.delete(ev.pointerId);
    if (v.punteros.size < 2) v.pellizco = null;
  };
  svg.addEventListener('pointerup', soltar);
  svg.addEventListener('pointercancel', soltar);

  // Botones + / − / Ver todo, debajo del mapa (HTML para que el toque sea cómodo en celular).
  const barra = document.createElement('div');
  barra.className = 'mapa-zoom';
  barra.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;align-items:center;margin-top:8px;flex-wrap:wrap';
  const ayuda = document.createElement('span');
  ayuda.textContent = 'Pellizca el mapa o usa + / − para acercar';
  ayuda.style.cssText = 'font-size:12px;color:var(--text-3);flex-basis:100%;text-align:right;order:2';
  const boton = (texto, etiqueta, accion) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = texto; b.setAttribute('aria-label', etiqueta);
    b.style.cssText = 'min-width:44px;min-height:40px;padding:0 12px;border-radius:8px;border:1px solid var(--border-strong);background:var(--surface);color:var(--text);font:600 15px var(--font);cursor:pointer';
    b.addEventListener('click', accion);
    barra.appendChild(b);
    return b;
  };
  v.btnMas = boton('+', 'Acercar el mapa', () => zoomEn(svg, v, 1.6));
  v.btnMenos = boton('−', 'Alejar el mapa', () => zoomEn(svg, v, 1 / 1.6));
  v.btnTodo = boton('Ver todo', 'Ver todos los puntos', () => { v.z = 1; v.ox = 0; v.oy = 0; redibujar(svg, v); });
  barra.appendChild(ayuda);
  svg.after(barra);
  v.barra = barra;
}

// svg: elemento <svg> donde dibujar.
// ubicaciones: {"N": {lat, lon, precision}}; foto: foto del poller; persona: {lat, lon, precision?} | null;
// zona: {lat, lon, radioM, nivel?: 'leve'|'moderado'|'fuerte'|'severo'} | null; enfoque: número de nodo a resaltar | null.
// editable: los detectores se arrastran (sin abanico) y al soltar se llama alMover(n, {lat, lon});
// pendientes: {"N": {lat, lon}} posiciones sin guardar, que se dibujan en vez de las guardadas.
// Devuelve la lista de nodos (números) de la foto sin ubicación.
export function dibujarMapa(svg, args = {}) {
  const { ubicaciones: guardadas = {}, foto = null, persona = null, zona = null, enfoque = null, editable = false, pendientes = {} } = args;
  const v = vistaDe(svg);
  v.args = args;
  if (!editable) { v.baseEdicion = null; v.arrastre = null; }
  // Posición a dibujar: la que se está arrastrando, luego la pendiente y si no la guardada.
  const ubicaciones = {};
  for (const [k, u] of Object.entries(guardadas)) {
    const n = Number(k);
    const otra = editable ? (v.arrastre?.n === n && v.arrastre.pos) || pendientes?.[k] : null;
    ubicaciones[k] = otra ? { ...u, lat: otra.lat, lon: otra.lon } : u;
  }
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${ANCHO} ${ALTO}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('role', 'img');
  svg.style.display = 'block';
  svg.style.height = 'auto';
  svg.style.maxWidth = '100%';

  const nodosFoto = foto?.nodos ?? [];
  const info = (n) => nodosFoto.find((x) => x.n === n);
  const ubicados = Object.keys(ubicaciones).map(Number).filter((n) => {
    const u = ubicaciones[n];
    return u && Number.isFinite(u.lat) && Number.isFinite(u.lon);
  }).sort((a, b) => a - b);
  const sinUbicar = nodosFoto.map((x) => x.n).filter((n) => !ubicados.includes(n)).sort((a, b) => a - b);

  svg.appendChild(el('rect', { x: 0, y: 0, width: ANCHO, height: ALTO, rx: 10, fill: 'var(--surface-2)', stroke: 'var(--border)' }));

  if (!ubicados.length) {
    svg.setAttribute('aria-label', MENSAJE_VACIO);
    svg.appendChild(el('text', {
      x: ANCHO / 2, y: ALTO / 2, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      fill: 'var(--text-2)', 'font-size': 16, 'font-family': 'var(--font)',
    }, MENSAJE_VACIO));
    if (v.barra) v.barra.hidden = true;
    return sinUbicar;
  }

  // Puntos a encuadrar: nodos, persona y los bordes de la zona (norte/sur/este/oeste aproximados).
  const puntos = ubicados.map((n) => ubicaciones[n]);
  if (persona && Number.isFinite(persona.lat)) puntos.push(persona);
  if (zona) {
    const dLat = zona.radioM / 111195;
    const dLon = dLat / Math.max(0.01, Math.cos((zona.lat * Math.PI) / 180));
    puntos.push({ lat: zona.lat + dLat, lon: zona.lon + dLon }, { lat: zona.lat - dLat, lon: zona.lon - dLon });
  }
  const margen = 56;
  // Mientras se edita el encuadre queda fijo: si siguiera a los puntos, el detector arrastrado
  // se correría bajo el dedo.
  const base = (editable && v.baseEdicion) || proyectar(puntos, ANCHO, ALTO, margen);
  if (editable) v.baseEdicion = base;
  // Vista con zoom: escala alrededor del centro y desplaza.
  v.zMax = Math.max(1, (base.metrosPorPx * ANCHO) / ANCHO_MIN_M);
  if (v.z > v.zMax) { v.z = v.zMax; acotar(v); }
  const p = {
    x: (q) => (base.x(q) - ANCHO / 2) * v.z + ANCHO / 2 + v.ox,
    y: (q) => (base.y(q) - ALTO / 2) * v.z + ALTO / 2 + v.oy,
    metrosPorPx: base.metrosPorPx / v.z,
  };
  const px = (m) => Math.max(0, m / p.metrosPorPx);
  // Inversa de p: punto del viewBox → {lat, lon} (deshace el desplazamiento y el zoom).
  v.aLatLon = (x, y) => base.invertir((x - ANCHO / 2 - v.ox) / v.z + ANCHO / 2, (y - ALTO / 2 - v.oy) / v.z + ALTO / 2);
  if (v.barra) {
    v.barra.hidden = false;
    v.btnMas.disabled = v.z >= v.zMax;
    v.btnMenos.disabled = v.z <= 1;
    v.btnTodo.disabled = v.z === 1 && v.ox === 0 && v.oy === 0;
  }
  // Con zoom, un dedo mueve el mapa; sin zoom, el dedo desplaza la página.
  // En modo edición el dedo arrastra detectores: la página no debe desplazarse bajo él.
  svg.style.touchAction = v.z > 1 || editable ? 'none' : 'pan-y';
  svg.style.cursor = v.z > 1 ? 'grab' : 'default';

  // Zona del sismo, debajo de todo lo demás.
  if (zona) {
    const c = SEV[zona.nivel] ?? 'var(--sev-fuerte)';
    const g = el('g');
    g.appendChild(el('circle', { cx: f1(p.x(zona)), cy: f1(p.y(zona)), r: f1(Math.max(4, px(zona.radioM))), fill: c, 'fill-opacity': 0.22, stroke: c, 'stroke-width': 2 }));
    svg.appendChild(g);
  }

  // Persona.
  if (persona && Number.isFinite(persona.lat) && Number.isFinite(persona.lon)) {
    const g = el('g');
    const cx = f1(p.x(persona)), cy = f1(p.y(persona));
    // Rango corto: un anillo pequeño fijo en vez del círculo de precisión del GPS (que a 10–20 m
    // tapaba a los detectores cercanos); la precisión va escrita en la etiqueta.
    g.appendChild(el('circle', { cx, cy, r: 12, fill: 'var(--focus)', 'fill-opacity': 0.15, stroke: 'var(--focus)', 'stroke-opacity': 0.6 }));
    g.appendChild(el('circle', { cx, cy, r: 6, fill: 'var(--focus)', stroke: 'var(--surface)', 'stroke-width': 2 }));
    const prec = persona.precision > 0 ? ` · ±${Math.round(persona.precision)} m` : '';
    g.appendChild(el('text', { x: cx, y: f1(p.y(persona) - 18), 'text-anchor': 'middle', fill: 'var(--text)', stroke: 'var(--surface-2)', 'stroke-width': 3, 'paint-order': 'stroke', 'font-size': 12, 'font-weight': 600, 'font-family': 'var(--font)' }, `Estás aquí${prec}`));
    svg.appendChild(g);
  }

  // Nodos: halo, círculo, etiqueta. Las etiquetas se acomodan para no taparse entre sí.
  const resumen = [];
  const etiquetas = [];
  const lugarEtiqueta = (x, y) => {
    let ly = y;
    while (etiquetas.some((b) => Math.abs(b.x - x) < 120 && Math.abs(b.y - ly) < 15)) ly += 15;
    etiquetas.push({ x, y: ly });
    return ly;
  };
  const orden = [...ubicados].sort((a, b) => p.y(ubicaciones[a]) - p.y(ubicaciones[b]) || a - b);

  // Nodos que caen en el mismo punto de la pantalla (el GPS de un celular no distingue
  // menos de ~10 m) se separan alrededor de ese punto para que se vean todos.
  const SEPARACION_PX = 22;
  const grupos = [];
  for (const n of orden) {
    const x = p.x(ubicaciones[n]), y = p.y(ubicaciones[n]);
    const g = grupos.find((gr) => Math.hypot(gr.x - x, gr.y - y) < SEPARACION_PX);
    if (g) { g.nodos.push(n); g.x = (g.x * (g.nodos.length - 1) + x) / g.nodos.length; g.y = (g.y * (g.nodos.length - 1) + y) / g.nodos.length; }
    else grupos.push({ x, y, nodos: [n] });
  }
  const posicion = new Map();
  let abanico = false;
  for (const gr of grupos) {
    if (gr.nodos.length === 1 || editable) {
      // Al editar no hay abanico: cada detector en su posición real.
      for (const n of gr.nodos) posicion.set(n, { x: p.x(ubicaciones[n]), y: p.y(ubicaciones[n]) });
      continue;
    }
    abanico = true;
    const radio = 20 + 4 * gr.nodos.length;
    gr.nodos.sort((a, b) => a - b).forEach((n, i) => {
      const ang = -Math.PI / 2 + (2 * Math.PI * i) / gr.nodos.length;
      posicion.set(n, { x: gr.x + radio * Math.cos(ang), y: gr.y + radio * Math.sin(ang), real: { x: p.x(ubicaciones[n]), y: p.y(ubicaciones[n]) } });
    });
  }

  for (const n of orden) {
    const u = ubicaciones[n];
    const { color, texto } = colorNodo(foto, n);
    const c = TOKEN[color];
    const movido = info(n)?.estado?.movido === true;
    const pos = posicion.get(n);
    const cx = f1(pos.x), cy = f1(pos.y);
    const g = el('g', { 'data-nodo': n, 'data-x': cx, 'data-y': cy });
    if (editable) g.style.cursor = v.arrastre?.n === n ? 'grabbing' : 'move';
    // Anillo pequeño fijo alrededor del nodo en vez del círculo de precisión del GPS (10–20 m),
    // que tapaba a los detectores vecinos. La precisión queda en la descripción del mapa.
    g.appendChild(el('circle', { cx, cy, r: 12, fill: c, 'fill-opacity': 0.15, stroke: c, 'stroke-opacity': 0.4, 'stroke-width': 1 }));
    if (enfoque === n) g.appendChild(el('circle', { cx, cy, r: 14, fill: 'none', stroke: 'var(--text)', 'stroke-width': 2 }));
    const attrs = { cx, cy, r: 9, fill: c, stroke: movido ? 'var(--text)' : 'var(--surface)', 'stroke-width': 2 };
    if (movido) attrs['stroke-dasharray'] = '4 3';
    g.appendChild(el('circle', attrs));
    g.appendChild(el('text', { x: cx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#fff', 'font-size': 10, 'font-weight': 700, 'font-family': 'var(--font)' }, String(n)));
    const ly = lugarEtiqueta(cx, f1(pos.y + 24));
    g.appendChild(el('text', { x: cx, y: ly, 'text-anchor': 'middle', fill: 'var(--text)', stroke: 'var(--surface-2)', 'stroke-width': 3, 'paint-order': 'stroke', 'font-size': 12, 'font-weight': 600, 'font-family': 'var(--font)' }, `Detector ${n} · ${texto}`));
    if (movido) g.appendChild(el('text', { x: cx, y: lugarEtiqueta(cx, ly + 14), 'text-anchor': 'middle', fill: 'var(--warn)', 'font-size': 11, 'font-family': 'var(--font)' }, 'se movió'));
    svg.appendChild(g);
    resumen.push(`Detector ${n}: ${texto}${movido ? ' (se movió)' : ''}${u.precision > 0 ? `, ubicado con ±${Math.round(u.precision)} m` : ''}`);
  }

  if (abanico) {
    svg.appendChild(el('text', { x: ANCHO - 16, y: ALTO - 18, 'text-anchor': 'end', fill: 'var(--text-2)', 'font-size': 11, 'font-family': 'var(--font)' },
      'Detectores en el mismo punto: separados para verlos'));
  }

  // Barra de escala (abajo a la izquierda).
  const largoM = escalaBonita(p.metrosPorPx * 140);
  const largoPx = largoM / p.metrosPorPx;
  const sx = 20, sy = ALTO - 22;
  const esc = el('g');
  esc.appendChild(el('path', { d: `M${f1(sx)} ${sy - 5}V${sy}H${f1(sx + largoPx)}V${sy - 5}`, fill: 'none', stroke: 'var(--text-2)', 'stroke-width': 2 }));
  esc.appendChild(el('text', { x: f1(sx + largoPx / 2), y: sy - 8, 'text-anchor': 'middle', fill: 'var(--text-2)', 'font-size': 11, 'font-family': 'var(--font)' }, textoLargo(largoM)));
  svg.appendChild(esc);

  // Norte (arriba a la derecha).
  const nx = ANCHO - 28;
  const norte = el('g');
  norte.appendChild(el('path', { d: `M${nx} 22L${nx - 6} 38H${nx + 6}Z`, fill: 'var(--text-2)' }));
  norte.appendChild(el('text', { x: nx, y: 54, 'text-anchor': 'middle', fill: 'var(--text-2)', 'font-size': 12, 'font-weight': 600, 'font-family': 'var(--font)' }, 'N↑'));
  svg.appendChild(norte);

  const extra = [persona ? 'Estás aquí' : null, zona ? 'zona del sismo marcada' : null].filter(Boolean);
  svg.setAttribute('aria-label', `Mapa. ${[...resumen, ...extra].join('; ')}`);
  return sinUbicar;
}
