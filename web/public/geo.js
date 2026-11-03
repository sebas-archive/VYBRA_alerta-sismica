// Funciones puras del mapa: color de estado, distancias, proyección y zona del sismo.
// Sin DOM: se importan igual desde el navegador y desde Node.

const R_TIERRA = 6371008.8;
const rad = (g) => (g * Math.PI) / 180;
const RADIO_MIN_M = 30;
const ENCUADRE_MIN_M = 100;

const TEXTO = { rojo: 'Caído', azul: 'Sincronizando', verde: 'Al día' };
const res = (color) => ({ color, texto: TEXTO[color] });

// Color de un nodo según la foto: rojo caído, azul sincronizando, verde al día.
export function colorNodo(foto, n) {
  const nodo = (foto?.nodos ?? []).find((x) => x.n === n);
  if (!nodo || !nodo.alcanzable || !nodo.estado || nodo.estado.caido) return res('rojo');
  const e = nodo.estado;
  // Al día exige reconocer al mismo líder que ve el PC (uno con un líder viejo sigue sincronizando).
  if (foto.lider == null || e.rol === 'candidato' || !e.lider_conocido || e.lider_conocido !== foto.lider) return res('azul');
  const fuente = foto.fuente == null ? null : foto.nodos.find((x) => x.n === foto.fuente)?.estado;
  if (!fuente) return res('azul');
  if (e.log_len < fuente.log_len || e.commit_index < fuente.commit_index) return res('azul');
  return res('verde');
}

// Distancia haversine en metros entre {lat, lon} y {lat, lon}.
export function distanciaM(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_TIERRA * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Plano local equirrectangular centrado en el centro de los puntos. Norte arriba.
// Devuelve x(p), y(p) en px dentro de ancho x alto, metrosPorPx e invertir(x, y) → {lat, lon} (la inversa exacta);
// el encuadre nunca es menor a 100 m de ancho.
export function proyectar(puntos, ancho, alto, margen = 24) {
  const pts = puntos.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon));
  let c = { lat: 0, lon: 0 };
  let minLat = 0, maxLat = 0, minLon = 0, maxLon = 0;
  if (pts.length) {
    minLat = Math.min(...pts.map((p) => p.lat)); maxLat = Math.max(...pts.map((p) => p.lat));
    minLon = Math.min(...pts.map((p) => p.lon)); maxLon = Math.max(...pts.map((p) => p.lon));
    c = { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
  }
  const mLat = (R_TIERRA * Math.PI) / 180;
  const mLon = mLat * Math.cos(rad(c.lat));
  const extX = (maxLon - minLon) * mLon;
  const extY = (maxLat - minLat) * mLat;
  const libreX = Math.max(1, ancho - 2 * margen);
  const libreY = Math.max(1, alto - 2 * margen);
  const metrosPorPx = Math.max(extX / libreX, extY / libreY, ENCUADRE_MIN_M / ancho);
  return {
    x: (p) => ancho / 2 + ((p.lon - c.lon) * mLon) / metrosPorPx,
    y: (p) => alto / 2 - ((p.lat - c.lat) * mLat) / metrosPorPx,
    invertir: (x, y) => ({
      lat: c.lat + ((alto / 2 - y) * metrosPorPx) / mLat,
      lon: c.lon + ((x - ancho / 2) * metrosPorPx) / mLon,
    }),
    metrosPorPx,
  };
}

// Zona del sismo: centroide ponderado por nivel de los nodos de la alerta que están ubicados y no se movieron.
// radio = distancia máxima del centro a esos nodos, mínimo 30 m. Sin nodos válidos: null.
export function zonaSismo(alerta, eventos, ubicaciones, movidos) {
  const ids = new Set(alerta?.eventos ?? []);
  const peso = new Map(); // nodo -> nivel mayor
  for (const ev of eventos ?? []) {
    if (!ids.has(ev.id)) continue;
    const u = ubicaciones?.[ev.nodo];
    if (!u || !Number.isFinite(u.lat) || !Number.isFinite(u.lon) || movidos?.has(ev.nodo)) continue;
    peso.set(ev.nodo, Math.max(peso.get(ev.nodo) ?? 0, Number(ev.nivel) || 0));
  }
  if (!peso.size) return null;
  const nodos = [...peso.keys()].sort((a, b) => a - b);
  let suma = 0, lat = 0, lon = 0;
  for (const n of nodos) { const w = peso.get(n) || 1e-9; suma += w; lat += ubicaciones[n].lat * w; lon += ubicaciones[n].lon * w; }
  const centro = { lat: lat / suma, lon: lon / suma };
  const radioM = Math.max(RADIO_MIN_M, ...nodos.map((n) => distanciaM(centro, ubicaciones[n])));
  return { lat: centro.lat, lon: centro.lon, radioM, nodos };
}

// Nodo ubicado (y no movido) más cercano al punto; null si no hay.
export function nodoMasCercano(punto, ubicaciones, movidos) {
  let mejor = null, dm = Infinity;
  for (const [k, u] of Object.entries(ubicaciones ?? {})) {
    const n = Number(k);
    if (movidos?.has(n)) continue;
    const d = distanciaM(punto, u);
    if (d < dm) { dm = d; mejor = n; }
  }
  return mejor;
}

// Promedio de varias lecturas del GPS ([{lat, lon, accuracy}]), ponderado por 1/accuracy².
// Se descartan las de accuracy > maxAcc; si no queda ninguna se usa la mejor y impreciso es true.
// precision = max(1, sqrt(1/Σw)) en metros, con 1 decimal. Sin lecturas válidas: null.
export function promediarLecturas(lecturas, maxAcc = 30) {
  const validas = (lecturas ?? []).filter((l) => l && Number.isFinite(l.lat) && Number.isFinite(l.lon) && Number.isFinite(l.accuracy) && l.accuracy >= 0);
  if (!validas.length) return null;
  const f1 = (v) => Math.round(v * 10) / 10;
  const buenas = validas.filter((l) => l.accuracy <= maxAcc);
  if (!buenas.length) {
    const mejor = validas.reduce((a, b) => (b.accuracy < a.accuracy ? b : a));
    return { lat: mejor.lat, lon: mejor.lon, precision: f1(Math.max(1, mejor.accuracy)), usadas: 1, descartadas: validas.length - 1, impreciso: true };
  }
  let suma = 0, lat = 0, lon = 0;
  for (const l of buenas) {
    const w = 1 / Math.max(0.1, l.accuracy) ** 2; // accuracy 0 no debe dar peso infinito
    suma += w; lat += l.lat * w; lon += l.lon * w;
  }
  return {
    lat: lat / suma, lon: lon / suma, precision: f1(Math.max(1, Math.sqrt(1 / suma))),
    usadas: buenas.length, descartadas: validas.length - buenas.length, impreciso: false,
  };
}
