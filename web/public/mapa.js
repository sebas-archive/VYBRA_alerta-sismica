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
const textoLargo = (m) => (m >= 1000 ? `${m / 1000} km` : `${m} m`);

// svg: elemento <svg> donde dibujar.
// ubicaciones: {"N": {lat, lon, precision}}; foto: foto del poller; persona: {lat, lon, precision?} | null;
// zona: {lat, lon, radioM, nivel?: 'leve'|'moderado'|'fuerte'|'severo'} | null; enfoque: número de nodo a resaltar | null.
// Devuelve la lista de nodos (números) de la foto sin ubicación.
export function dibujarMapa(svg, { ubicaciones = {}, foto = null, persona = null, zona = null, enfoque = null } = {}) {
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
  const p = proyectar(puntos, ANCHO, ALTO, margen);
  const px = (m) => Math.max(0, m / p.metrosPorPx);

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
    if (persona.precision > 0) g.appendChild(el('circle', { cx, cy, r: f1(Math.max(8, px(persona.precision))), fill: 'var(--focus)', 'fill-opacity': 0.14, stroke: 'var(--focus)', 'stroke-opacity': 0.5 }));
    g.appendChild(el('circle', { cx, cy, r: 6, fill: 'var(--focus)', stroke: 'var(--surface)', 'stroke-width': 2 }));
    g.appendChild(el('text', { x: cx, y: f1(p.y(persona) - 12), 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': 12, 'font-weight': 600, 'font-family': 'var(--font)' }, 'Estás aquí'));
    svg.appendChild(g);
  }

  // Nodos: halo, círculo, etiqueta.
  const resumen = [];
  for (const n of ubicados) {
    const u = ubicaciones[n];
    const { color, texto } = colorNodo(foto, n);
    const c = TOKEN[color];
    const movido = info(n)?.estado?.movido === true;
    const cx = f1(p.x(u)), cy = f1(p.y(u));
    const g = el('g', { 'data-nodo': n });
    if (u.precision > 0) g.appendChild(el('circle', { cx, cy, r: f1(Math.max(14, px(u.precision))), fill: c, 'fill-opacity': 0.12, stroke: c, 'stroke-opacity': 0.35, 'stroke-width': 1 }));
    if (enfoque === n) g.appendChild(el('circle', { cx, cy, r: 22, fill: 'none', stroke: 'var(--text)', 'stroke-width': 2 }));
    const attrs = { cx, cy, r: 14, fill: c, stroke: movido ? 'var(--text)' : 'var(--surface)', 'stroke-width': 2.5 };
    if (movido) attrs['stroke-dasharray'] = '4 3';
    g.appendChild(el('circle', attrs));
    g.appendChild(el('text', { x: cx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#fff', 'font-size': 13, 'font-weight': 700, 'font-family': 'var(--font)' }, String(n)));
    g.appendChild(el('text', { x: cx, y: f1(p.y(u) + 32), 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': 12, 'font-weight': 600, 'font-family': 'var(--font)' }, `Detector ${n} · ${texto}`));
    if (movido) g.appendChild(el('text', { x: cx, y: f1(p.y(u) + 46), 'text-anchor': 'middle', fill: 'var(--warn)', 'font-size': 11, 'font-family': 'var(--font)' }, 'se movió'));
    svg.appendChild(g);
    resumen.push(`Detector ${n}: ${texto}${movido ? ' (se movió)' : ''}`);
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
