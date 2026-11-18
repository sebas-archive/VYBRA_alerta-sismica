// Servidor del PC: estáticos, estado agregado, SSE y control de los nodos.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearPoller } from './poller.js';
import os from 'node:os';
import dns from 'node:dns/promises';
import { randomUUID } from 'node:crypto';
import { NODOS, PUERTO, UBICACIONES, SERVIDORES, CONTROLADOR } from './config.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const LIMITE_CUERPO = 4096;
const VIVO_MS = 5000;  // latido SSE: mantiene viva la conexión y dice "el PC sigue al día"
const MAX_PENDIENTE = 1024 * 1024;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function responderJson(res, status, obj) {
  const cuerpo = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Content-Length': Buffer.byteLength(cuerpo),
  });
  res.end(cuerpo);
}

// Lee el cuerpo con tope; devuelve null (y ya respondió 413) si se excede.
function leerCuerpo(req, res) {
  return new Promise((resolve) => {
    const partes = [];
    let total = 0;
    let excedido = false;
    req.on('data', (c) => {
      if (excedido) return;
      total += c.length;
      if (total > LIMITE_CUERPO) {
        excedido = true;
        responderJson(res, 413, { error: 'cuerpo demasiado grande' });
        res.once('finish', () => req.destroy());
        resolve(null);
        return;
      }
      partes.push(c);
    });
    req.on('end', () => { if (!excedido) resolve(Buffer.concat(partes).toString('utf8')); });
    req.on('error', () => resolve(null));
  });
}

// Manejador HTTP.
export function crearManejador({
  poller, nodos, publicDir = path.join(AQUI, 'public'), timeoutNodoMs = 1000,
  maxPendienteSse = MAX_PENDIENTE, vivoMs = VIVO_MS,
  ubicaciones = UBICACIONES, servidores = [], timeoutServidorMs = 2000,
  controlador = null, timeoutControlMs = 30000,
}) {
  const raiz = path.resolve(publicDir);
  // Las posiciones de los detectores son fijas (config.js): se agregan a cada foto.
  const conUbicaciones = (foto) => ({ ...foto, ubicaciones });

  function estatico(res, nombre, rango) {
    let rel;
    try { rel = decodeURIComponent(nombre); } catch { return responderJson(res, 404, { error: 'no existe' }); }
    // Sin NUL, sin barras iniciales extra ni segmentos '..' (ni con \ de Windows).
    const segmentos = rel.split(/[\\/]/);
    if (rel.includes('\0') || segmentos.some((s) => s === '..') || rel.startsWith('/') || rel.startsWith('\\')) {
      return responderJson(res, 404, { error: 'no existe' });
    }
    const ruta = path.resolve(raiz, rel);
    if (!ruta.startsWith(raiz + path.sep)) return responderJson(res, 404, { error: 'no existe' });
    const tipo = TIPOS[path.extname(ruta).toLowerCase()];
    if (!tipo) return responderJson(res, 404, { error: 'no existe' });
    fs.readFile(ruta, (err, datos) => {
      if (err) return responderJson(res, 404, { error: 'no existe' });
      // Range: los navegadores lo exigen para reposicionar un audio (currentTime = 0).
      const m = /^bytes=(\d*)-(\d*)$/.exec(rango ?? '');
      if (m && (m[1] || m[2])) {
        let ini = m[1] === '' ? datos.length - Number(m[2]) : Number(m[1]);
        let fin = m[1] === '' || m[2] === '' ? datos.length - 1 : Math.min(Number(m[2]), datos.length - 1);
        ini = Math.max(0, ini);
        if (ini > fin || ini >= datos.length) {
          res.writeHead(416, { 'Content-Range': `bytes */${datos.length}` });
          return res.end();
        }
        res.writeHead(206, {
          'Content-Type': tipo, 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${ini}-${fin}/${datos.length}`, 'Content-Length': fin - ini + 1,
        });
        return res.end(datos.subarray(ini, fin + 1));
      }
      res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes', 'Content-Length': datos.length });
      res.end(datos);
    });
  }

  const existe = (rel) => fs.existsSync(path.join(raiz, rel));
  function redirigir(res, destino) {
    res.writeHead(302, { Location: destino, 'Cache-Control': 'no-cache' });
    res.end();
  }

  function stream(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    // Cliente detenido (socket a medias): si se acumula demasiado, se corta.
    const escribir = (texto) => {
      if (res.writableLength > maxPendienteSse) return res.destroy();
      res.write(texto);
    };
    const enviar = (foto) => escribir(`event: estado\ndata: ${JSON.stringify(conUbicaciones(foto))}\n\n`);
    // Las fotos solo salen cuando algo cambia: el latido "vivo" le confirma a la vista que los
    // datos siguen al día aunque no cambien (y evita que proxies corten la conexión ociosa).
    const ping = setInterval(() => escribir(`event: vivo\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`), vivoMs);
    poller.on('cambio', enviar);
    let limpio = false;
    const limpiar = () => {
      if (limpio) return;
      limpio = true;
      clearInterval(ping);
      poller.off('cambio', enviar);
    };
    req.on('close', limpiar);
    res.on('close', limpiar);
    res.on('error', limpiar);
    enviar(poller.foto());
  }

  async function proxy(req, res, n, accion) {
    const nodo = nodos.find((x) => x.n === n);
    if (!nodo) return responderJson(res, 404, { error: 'nodo no existe' });
    // Solo JSON: obliga a preflight CORS desde otras páginas (anti-CSRF).
    if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) {
      req.resume();
      return responderJson(res, 415, { error: 'se requiere application/json' });
    }
    const cuerpo = await leerCuerpo(req, res);
    if (cuerpo === null) return;
    try { JSON.parse(cuerpo); } catch { return responderJson(res, 400, { error: 'json invalido' }); }
    try {
      const r = await fetch(`${nodo.url}/${accion}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: cuerpo,
        signal: AbortSignal.timeout(timeoutNodoMs),
      });
      const texto = await r.text();
      registrarAccion(n, accion, cuerpo, r.status, texto);
      res.writeHead(r.status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Content-Length': Buffer.byteLength(texto),
      });
      res.end(texto);
    } catch {
      registrarAccion(n, accion, cuerpo, 502, JSON.stringify({ error: 'nodo inalcanzable' }));
      responderJson(res, 502, { error: 'nodo inalcanzable' });
    }
  }

  // Cada ESP32 tiene un servidor asignado (mismo número) con su propia base de datos. Las pruebas y órdenes
  // que se le envían quedan registradas allí (sin esperar: si el servidor no responde, la orden sigue su curso).
  const servidorDe = (n) => servidores.find((x) => x.n === n);
  function registrarAccion(n, accion, cuerpo, status, texto) {
    const s = servidorDe(n);
    if (!s) return;
    let parametros = null, resultado = null;
    try { parametros = JSON.parse(cuerpo); } catch { /* ya validado antes */ }
    try { resultado = JSON.parse(texto); } catch { resultado = { texto: String(texto).slice(0, 300) }; }
    // `ref` identifica esta orden: si hay que reintentar, el servidor no la guarda dos veces.
    const cuerpoAccion = JSON.stringify({ ref: randomUUID(), tipo: accion, parametros, estado_http: status, resultado, origen: 'panel' });
    const enviar = () => fetch(`${s.url}/acciones`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpoAccion, signal: AbortSignal.timeout(timeoutServidorMs),
    }).then((r) => { if (r.status >= 500) throw new Error(`HTTP ${r.status}`); });
    enviar().catch(() => setTimeout(() => enviar().catch(() => {}), 500).unref());
  }
  // Consulta a un servidor de datos. Un reintento si falla la red o responde 5xx (no en errores 4xx).
  class ErrorServidor extends Error { constructor(msg, status) { super(msg); this.status = status; } }
  async function pedirServidor(s, ruta) {
    for (let intento = 0; ; intento++) {
      try {
        const r = await fetch(`${s.url}${ruta}`, { signal: AbortSignal.timeout(timeoutServidorMs) });
        if (r.ok) return await r.json();
        let msg = `HTTP ${r.status}`;
        try { msg = (await r.json()).error || msg; } catch { /* sin cuerpo */ }
        if (r.status < 500) throw new ErrorServidor(msg, r.status);
        throw new Error(msg);
      } catch (e) {
        if (e instanceof ErrorServidor || intento >= 1) throw e;
        await new Promise((ok) => setTimeout(ok, 250));
      }
    }
  }
  // Lo que se replica en los tres ESP32 (Raft) se guarda en los tres servidores: en el modo "todos" se une sin duplicar.
  const REPLICADOS = new Set(['eventos', 'alertas', 'log']);
  // Los ids de alerta se repiten si el clúster se reinicia: la clave incluye los eventos (o, en la vista pública, hora y detectores).
  const claveReplicada = (tipo, r) => (tipo === 'eventos' ? r.id
    : tipo === 'alertas' ? `${r.alerta_id ?? r.id}|${r.eventos ? r.eventos.slice().sort().join(',') : `${r.ts}|${(r.detectores || []).join(',')}`}`
    : r.clave);
  const MAX_FUSION = 1000;
  // Página `pagina` de `limite` registros de varias bases a la vez, sin cargar más de lo necesario:
  // de cada servidor se piden solo los primeros pagina×limite registros ya ordenados, y se mezclan.
  async function historialTodos({ tipo, pagina, limite, orden, consulta, ruta, replicado, tam = 200 }) {
    const K = pagina * limite;
    if (K > MAX_FUSION) { const e = new Error(`en el modo "todos" solo se puede llegar hasta el registro ${MAX_FUSION}; elige un servidor o afina los filtros`); e.status = 400; throw e; }
    const resultados = await Promise.all(servidores.map(async (s) => {
      try {
        const filas = []; let total = 0;
        for (let p = 1; filas.length < K; p++) {
          const q = new URLSearchParams(consulta); q.set('pagina', String(p)); q.set('limite', String(tam));
          const r = await pedirServidor(s, `${ruta}?${q}`);
          total = r.total; filas.push(...r.registros);
          if (r.registros.length < tam || p >= r.paginas) break;
        }
        return { n: s.n, ok: true, total, filas: filas.slice(0, K) };
      } catch (e) { return { n: s.n, ok: false, error: e.message, status: e.status }; }
    }));
    const malos = resultados.filter((x) => !x.ok);
    const err4 = malos.find((x) => x.status === 400);
    if (err4) { const e = new Error(err4.error); e.status = 400; throw e; }
    if (malos.length === resultados.length) { const e = new Error('ninguna base de datos responde'); e.status = 502; e.servidores = resultados.map((x) => ({ n: x.n, ok: false, total: 0, error: x.error })); throw e; }
    const dir = orden === 'asc' ? 1 : -1;
    let todas = resultados.filter((x) => x.ok).flatMap((x) => x.filas.map((r) => ({ servidor: x.n, ...r })));
    todas.sort((a, b) => dir * ((a.ts ?? 0) - (b.ts ?? 0)) || a.servidor - b.servidor);
    if (replicado) {
      const vistos = new Map();
      for (const r of todas) {
        const k = claveReplicada(tipo, r);
        if (vistos.has(k)) vistos.get(k).servidores.push(r.servidor); else vistos.set(k, { ...r, servidores: [r.servidor] });
      }
      todas = [...vistos.values()];
    }
    const oks = resultados.filter((x) => x.ok);
    const total = replicado ? Math.max(...oks.map((x) => x.total)) : oks.reduce((a, x) => a + x.total, 0);
    return {
      tipo, pagina, limite, total, paginas: Math.max(1, Math.ceil(total / limite)),
      servidores: resultados.map((x) => ({ n: x.n, ok: x.ok, total: x.ok ? x.total : 0, error: x.error })),
      registros: todas.slice((pagina - 1) * limite, pagina * limite),
    };
  }
  const entero = (v, def, min, max) => { if (v == null || v === '') return def; const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : NaN; };

  // ------------------------------------------------------------ infraestructura: apagar / encender servidores
  // El navegador solo habla con el panel; el panel habla con el controlador (único con acceso a Docker).
  // Del navegador solo se acepta un número 1-3 y "apagar" o "encender": nada llega a Docker tal cual.
  async function llamarControlador(metodo, ruta, ms = 4000) {
    const r = await fetch(`${controlador.url}${ruta}`, {
      method: metodo, signal: AbortSignal.timeout(ms),
      headers: controlador.token ? { Authorization: `Bearer ${controlador.token}` } : {},
    });
    let cuerpo = null;
    try { cuerpo = await r.json(); } catch { /* sin cuerpo */ }
    return { status: r.status, cuerpo };
  }
  async function estadoInfra() {
    if (!controlador || !controlador.url) return { disponible: false, motivo: 'No hay controlador de infraestructura configurado (variable CONTROLADOR_URL).' };
    try {
      const r = await llamarControlador('GET', '/estado');
      if (r.status !== 200) return { disponible: false, motivo: `El controlador respondió ${r.status}${r.cuerpo?.error ? `: ${r.cuerpo.error}` : ''}.` };
      return { disponible: true, ...r.cuerpo };
    } catch { return { disponible: false, motivo: 'El controlador de infraestructura no responde.' }; }
  }
  const llamarNodo = async (n, accion) => {
    const nodo = nodos.find((x) => x.n === n);
    if (!nodo) return { ok: false, error: 'nodo desconocido' };
    try {
      const r = await fetch(`${nodo.url}/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion }), signal: AbortSignal.timeout(timeoutNodoMs) });
      return { ok: r.ok, status: r.status };
    } catch { return { ok: false, error: 'nodo inalcanzable' }; }
  };
  const registrarInfra = (n, parametros, resultado, estado) => {
    const s = servidorDe(n);
    if (!s) return;
    const cuerpo = JSON.stringify({ ref: randomUUID(), tipo: 'infra', parametros, estado_http: estado, resultado, origen: 'panel' });
    const enviar = () => fetch(`${s.url}/acciones`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpo, signal: AbortSignal.timeout(timeoutServidorMs) }).then((r) => { if (r.status >= 500) throw new Error('5xx'); });
    // Al encender el servidor tarda unos segundos en responder: se reintenta hasta 10 veces (mismo ref: no se duplica).
    let intentos = 0;
    const probar = () => enviar().catch(() => { if (++intentos < 10) setTimeout(probar, 1500).unref(); });
    probar();
  };
  async function cambiarEstado(res, req, n, accion) {
    if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) { req.resume(); return responderJson(res, 415, { error: 'se requiere application/json' }); }
    // Anti-CSRF: una página de otro sitio no puede ordenar un apagado (el navegador envía su Origin).
    const origen = req.headers.origin;
    if (origen) { try { if (new URL(origen).host !== req.headers.host) return responderJson(res, 403, { error: 'origen no permitido' }); } catch { return responderJson(res, 403, { error: 'origen no permitido' }); } }
    const cuerpo = await leerCuerpo(req, res);
    if (cuerpo === null) return;
    let datos; try { datos = JSON.parse(cuerpo); } catch { return responderJson(res, 400, { error: 'json invalido' }); }
    if (!datos || datos.confirmar !== true) return responderJson(res, 400, { error: 'falta la confirmación explícita ({"confirmar":true})' });
    if (!controlador || !controlador.url) return responderJson(res, 503, { error: 'No hay controlador de infraestructura configurado (CONTROLADOR_URL).' });
    let previo;
    try { previo = await llamarControlador('GET', '/estado'); } catch { return responderJson(res, 502, { error: 'El controlador de infraestructura no responde.' }); }
    const info = previo.cuerpo?.servidores?.find((x) => x.n === n);
    if (previo.status !== 200 || !info) return responderJson(res, 502, { error: 'No se pudo leer el estado de la infraestructura.' });
    const modo = info.modo;                       // 'simulado' (contenedor) o 'fisico' (ESP32 real)
    const foto = poller.foto();
    const detalle = { modo, eraLider: foto.lider === n };
    console.log(`Infraestructura: ${accion} servidor ${n} (${modo})`);
    try {
      let nodoLogico = null;
      if (accion === 'apagar') {
        // El registro se escribe ANTES: después el servidor ya no puede recibirlo.
        registrarInfra(n, { accion, modo }, { solicitado: true }, 202);
        if (modo === 'fisico') nodoLogico = await llamarNodo(n, 'caer');       // el ESP32 físico sigue con corriente: se desconecta de Raft
      }
      const r = await llamarControlador('POST', `/servidores/${n}/${accion}`, timeoutControlMs);
      if (r.status !== 200) return responderJson(res, r.status === 409 ? 409 : 502, { error: r.cuerpo?.error || `El controlador respondió ${r.status}`, ...detalle });
      if (accion === 'encender') {
        if (modo === 'fisico') nodoLogico = await llamarNodo(n, 'recuperar');
        registrarInfra(n, { accion, modo }, { iniciados: r.cuerpo.iniciados }, 200);
      }
      const mensaje = modo === 'fisico'
        ? (accion === 'apagar' ? `Servidor ${n} apagado. Su ESP32 es físico: sigue con corriente y quedó desconectado lógicamente de Raft.` : `Servidor ${n} encendido y su ESP32 físico se reincorporó a Raft.`)
        : (accion === 'apagar' ? `Servidor ${n} apagado: se detuvieron su ESP32 simulado y su servidor de datos. Su base de datos sigue encendida.` : `Servidor ${n} encendido: arrancaron su ESP32 simulado y su servidor de datos; el nodo se reincorpora a Raft.`);
      return responderJson(res, 200, { ok: true, accion, n, ...detalle, mensaje, nodoLogico, controlador: r.cuerpo });
    } catch (e) {
      return responderJson(res, 502, { error: e.name === 'TimeoutError' ? 'El controlador tardó demasiado en responder.' : 'El controlador de infraestructura no responde.', ...detalle });
    }
  }

  const manejador = (req, res) => {
    // Se antepone el origen como texto: con base, "//x/y" se leería como host.
    // URL normaliza los ".." en silencio: se rechazan antes sobre la ruta cruda.
    try {
      if (decodeURIComponent(req.url.split('?')[0]).split(/[\\/]/).includes('..')) return responderJson(res, 404, { error: 'no existe' });
    } catch { return responderJson(res, 404, { error: 'no existe' }); }
    let pathname;
    try { ({ pathname } = new URL(`http://x${req.url}`)); } catch { return responderJson(res, 400, { error: 'url invalida' }); }
    const metodo = req.method;

    if (metodo === 'GET' || metodo === 'HEAD') {
      if (pathname === '/api/estado') return responderJson(res, 200, conUbicaciones(poller.foto()));
      if (pathname === '/api/stream') return stream(req, res);
      if (pathname === '/api/infra') return estadoInfra().then((o) => responderJson(res, 200, o));
      // Servidores de datos (uno por ESP32, cada uno con su base PostgreSQL): estado de cada uno.
      if (pathname === '/api/servidores') {
        return Promise.all(servidores.map(async (s) => {
          try { return { n: s.n, url: s.url, alcanzable: true, ...(await pedirServidor(s, '/info')) }; }
          catch (e) { return { n: s.n, url: s.url, alcanzable: false, error: e.message }; }
        })).then((lista) => responderJson(res, 200, { servidores: lista }));
      }
      // Histórico guardado en las bases PostgreSQL de los servidores (paginado y filtrado EN LA BASE):
      //   /api/historial?tipo=eventos|alertas|muestras|sucesos|log|acciones &servidor=1|2|3|todos &pagina= &limite=(máx 200)
      //     &nodo= &categoria= &estado= &desde= &hasta= &q= &orden=asc|desc &fuente=activo|archivo
      if (pathname === '/api/historial' || pathname === '/api/publico/historial') {
        const q = new URL(`http://x${req.url}`).searchParams;
        const publico = pathname === '/api/publico/historial';
        const tipo = q.get('tipo') || (publico ? 'alertas' : 'eventos');
        const pagina = entero(q.get('pagina'), 1, 1, 1000000), limite = entero(q.get('limite'), 50, 1, 200);
        if (Number.isNaN(pagina) || Number.isNaN(limite)) return responderJson(res, 400, { error: 'pagina y limite deben ser enteros (limite máx. 200)' });
        if (!servidores.length) return responderJson(res, 404, { error: 'no hay servidores de datos configurados (variable SERVIDORES)' });
        const sel = publico ? 'todos' : (q.get('servidor') || 'todos');
        if (sel !== 'todos' && !servidores.some((x) => x.n === Number(sel))) return responderJson(res, 400, { error: 'servidor debe ser 1, 2, 3 o todos' });
        const ruta = publico ? '/api/publico' : '/api/historial';
        const consulta = new URLSearchParams([...q.entries()].filter(([k]) => !['servidor', 'pagina', 'limite'].includes(k)));
        consulta.set('tipo', tipo);
        const falla = (e) => responderJson(res, e.status || 500, { error: e.message, ...(e.servidores ? { servidores: e.servidores } : {}) });
        if (sel !== 'todos') {
          const s = servidores.find((x) => x.n === Number(sel));
          consulta.set('pagina', String(pagina)); consulta.set('limite', String(limite));
          return pedirServidor(s, `${ruta}?${consulta}`)
            .then((r) => responderJson(res, 200, { ...r, registros: r.registros.map((x) => ({ servidor: s.n, ...x })), servidores: [{ n: s.n, ok: true, total: r.total }] }))
            .catch((e) => responderJson(res, e.status === 400 ? 400 : 502, { error: e.message, servidores: [{ n: s.n, ok: false, total: 0, error: e.message }] }));
        }
        return historialTodos({ tipo, pagina, limite: publico ? Math.min(limite, 50) : limite, orden: q.get('orden') === 'asc' ? 'asc' : 'desc', consulta, ruta, replicado: REPLICADOS.has(tipo), tam: publico ? 50 : 200 })
          .then((r) => responderJson(res, 200, r)).catch(falla);
      }
      // Un registro completo de la base de un servidor: /api/registro?servidor=2&tipo=eventos&id=...
      if (pathname === '/api/registro') {
        const q = new URL(`http://x${req.url}`).searchParams;
        const s = servidores.find((x) => x.n === Number(q.get('servidor')));
        if (!s) return responderJson(res, 400, { error: 'servidor debe ser 1, 2 o 3' });
        return pedirServidor(s, `/api/registro?${new URLSearchParams({ tipo: q.get('tipo') || '', id: q.get('id') || '', fuente: q.get('fuente') || '' })}`)
          .then((r) => responderJson(res, 200, r))
          .catch((e) => responderJson(res, e.status || 502, { error: e.message }));
      }
      // Política de retención de cada servidor y qué afectaría ahora (solo lectura).
      if (pathname === '/api/retencion') {
        return Promise.all(servidores.map(async (s) => {
          try { return await pedirServidor(s, '/retencion'); } catch (e) { return { servidor: s.n, error: e.message }; }
        })).then((lista) => responderJson(res, 200, { servidores: lista }));
      }
      if (pathname === '/') return existe('admin/index.html') ? redirigir(res, '/admin/') : estatico(res, 'operador.html');
      if (pathname === '/publico') return existe('cliente/index.html') ? redirigir(res, '/cliente/') : estatico(res, 'cliente.html');
      if (pathname === '/admin' || pathname === '/cliente') return redirigir(res, `${pathname}/`);
      if (pathname.startsWith('/api/')) return responderJson(res, 404, { error: 'no existe' });
      return estatico(res, (pathname.endsWith('/') ? `${pathname}index.html` : pathname).slice(1), req.headers.range);
    }
    if (metodo === 'POST') {
      const inf = /^\/api\/infra\/servidores\/([1-3])\/(apagar|encender)$/.exec(pathname);
      if (inf) return cambiarEstado(res, req, Number(inf[1]), inf[2]);
      const m = /^\/api\/nodos\/([^/]+)\/(control|pulsar)$/.exec(pathname);
      if (m) {
        const n = /^[1-9]$/.test(m[1]) ? Number(m[1]) : 0;
        return proxy(req, res, n, m[2]);
      }
    }
    responderJson(res, 404, { error: 'no existe' });
  };
  manejador.detener = () => {};
  return manejador;
}

// Servidor HTTP con el manejador.
export function crearServidor(opciones) {
  const manejador = crearManejador(opciones);
  const servidor = http.createServer(manejador);
  servidor.on('close', manejador.detener);
  return servidor;
}

// Los detectores usan DHCP y se encuentran por mDNS (sismo-nodo-N.local), que tarda segundos en
// resolver: demasiado para el sondeo. Se resuelve aparte, cada pocos segundos, y el poller usa la IP.
function resolverNodos(poller, nodos, cadaMs = 5000) {
  const hosts = nodos.map((x) => ({ n: x.n, host: new URL(x.url).hostname, puerto: new URL(x.url).port }))
    .filter((x) => /\.local$/i.test(x.host));
  if (!hosts.length) return () => {};
  const resolver = async () => {
    await Promise.all(hosts.map(async (h) => {
      try {
        const { address } = await dns.lookup(h.host, { family: 4 });
        poller.fijarUrl(h.n, `http://${address}${h.puerto ? `:${h.puerto}` : ''}`);
      } catch { /* sin respuesta: se conserva la IP anterior */ }
    }));
  };
  resolver();
  const t = setInterval(resolver, cadaMs);
  t.unref();
  return () => clearInterval(t);
}

function ipLan() {
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const i of lista ?? []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return 'localhost';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const puerto = Number(process.env.PUERTO) || PUERTO;
  // El WiFi de un hotspot responde en 100-2500 ms: con los 250 ms de fábrica todos salían caídos.
  const timeoutNodoMs = Number(process.env.TIMEOUT_NODO_MS) || 3000;
  const poller = crearPoller({ nodos: NODOS, timeoutMs: timeoutNodoMs, intervaloMs: Number(process.env.INTERVALO_MS) || 1000 });
  if (SERVIDORES.length) console.log(`Servidores de datos: ${SERVIDORES.map((s) => `S${s.n} ${s.url}`).join(' · ')}`);
  const manejador = crearManejador({ poller, nodos: NODOS, timeoutNodoMs, servidores: SERVIDORES, controlador: CONTROLADOR.url ? CONTROLADOR : null });
  const servidor = http.createServer(manejador);
  const ip = ipLan();
  resolverNodos(poller, NODOS);
  poller.iniciar();
  servidor.on('error', (e) => {
    console.error(e.code === 'EADDRINUSE'
      ? `El puerto ${puerto} está ocupado. Cierra el otro programa o usa otro con la variable PUERTO.`
      : `No se pudo abrir HTTP en el puerto ${puerto} (variable PUERTO): ${e.message}`);
    process.exit(1);
  });
  servidor.listen(puerto, '0.0.0.0', () => {
    console.log(`Panel: http://${ip}:${puerto}  Vista pública: http://${ip}:${puerto}/publico`);
    console.log(`Si el firewall bloquea el celular: sudo ufw allow from <tu subred>/24 to any port ${puerto} proto tcp`);
  });
  const salir = () => { poller.detener(); manejador.detener(); servidor.close(); servidor.closeAllConnections(); process.exit(0); };
  process.on('SIGINT', salir);
  process.on('SIGTERM', salir);
}
