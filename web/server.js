// Servidor del PC: estáticos, estado agregado, SSE y control de los nodos.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearPoller } from './poller.js';
import os from 'node:os';
import dns from 'node:dns/promises';
import { NODOS, PUERTO, UBICACIONES } from './config.js';
import { crearHistorial, TIPOS as TIPOS_HISTORIAL } from './historial.js';

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
  ubicaciones = UBICACIONES, historial = null,
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
      res.writeHead(r.status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Content-Length': Buffer.byteLength(texto),
      });
      res.end(texto);
    } catch {
      responderJson(res, 502, { error: 'nodo inalcanzable' });
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
      // Histórico guardado en disco: /api/historial?tipo=eventos|alertas|sucesos&limite=200
      if (pathname === '/api/historial') {
        if (!historial) return responderJson(res, 404, { error: 'el histórico no está activado' });
        const q = new URL(`http://x${req.url}`).searchParams;
        const tipo = q.get('tipo') || 'eventos';
        if (!TIPOS_HISTORIAL.includes(tipo)) return responderJson(res, 400, { error: `tipo debe ser ${TIPOS_HISTORIAL.join(', ')}` });
        return historial.leer(tipo, Number(q.get('limite')) || 200).then((filas) => responderJson(res, 200, { tipo, total: filas.length, registros: filas }));
      }
      // Frontends nuevos: ADMIN en /admin/ y CLIENTE en /cliente/. Si no están instalados se
      // conservan las vistas anteriores (operador.html y cliente.html) en las mismas rutas.
      if (pathname === '/') return existe('admin/index.html') ? redirigir(res, '/admin/') : estatico(res, 'operador.html');
      if (pathname === '/publico') return existe('cliente/index.html') ? redirigir(res, '/cliente/') : estatico(res, 'cliente.html');
      if (pathname === '/admin' || pathname === '/cliente') return redirigir(res, `${pathname}/`);
      if (pathname.startsWith('/api/')) return responderJson(res, 404, { error: 'no existe' });
      return estatico(res, (pathname.endsWith('/') ? `${pathname}index.html` : pathname).slice(1), req.headers.range);
    }
    if (metodo === 'POST') {
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
  // Histórico en disco (carpeta datos/, o DATOS_DIR; en Docker es un volumen).
  let historial = null;
  try {
    historial = crearHistorial({ dir: process.env.DATOS_DIR || path.join(AQUI, 'datos') });
    poller.on('cambio', (f) => historial.registrar(f));
    console.log(`Histórico en disco: ${historial.dir}`);
  } catch (e) { console.error(`Histórico desactivado (no se pudo abrir ${process.env.DATOS_DIR || 'datos/'}): ${e.message}`); }
  const manejador = crearManejador({ poller, nodos: NODOS, timeoutNodoMs, historial });
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
