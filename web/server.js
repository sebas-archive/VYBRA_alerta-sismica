// Servidor del PC: estáticos, estado agregado, SSE y control de los nodos.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearPoller } from './poller.js';
import { NODOS, PUERTO, DETECTORES } from './config.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const LIMITE_CUERPO = 4096;
const PING_MS = 15000;
const MAX_PENDIENTE = 1024 * 1024;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
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

export function crearServidor({ poller, nodos, publicDir = path.join(AQUI, 'public'), detectores = DETECTORES, timeoutNodoMs = 1000, maxPendienteSse = MAX_PENDIENTE }) {
  const raiz = path.resolve(publicDir);

  function estatico(res, nombre) {
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
      res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-cache', 'Content-Length': datos.length });
      res.end(datos);
    });
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
    const enviar = (foto) => escribir(`event: estado\ndata: ${JSON.stringify({ ...foto, detectores: detectores })}\n\n`);
    const ping = setInterval(() => escribir(': ping\n\n'), PING_MS);
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

  return http.createServer((req, res) => {
    // Se antepone el origen como texto: con base, "//x/y" se leería como host.
    // URL normaliza los ".." en silencio: se rechazan antes sobre la ruta cruda.
    try {
      if (decodeURIComponent(req.url.split('?')[0]).split(/[\\/]/).includes('..')) return responderJson(res, 404, { error: 'no existe' });
    } catch { return responderJson(res, 404, { error: 'no existe' }); }
    let pathname;
    try { ({ pathname } = new URL(`http://x${req.url}`)); } catch { return responderJson(res, 400, { error: 'url invalida' }); }
    const metodo = req.method;

    if (metodo === 'GET' || metodo === 'HEAD') {
      if (pathname === '/api/estado') return responderJson(res, 200, { ...poller.foto(), detectores });
      if (pathname === '/api/stream') return stream(req, res);
      if (pathname === '/') return estatico(res, 'operador.html');
      if (pathname === '/publico') return estatico(res, 'cliente.html');
      if (pathname.startsWith('/api/')) return responderJson(res, 404, { error: 'no existe' });
      return estatico(res, pathname.slice(1));
    }
    if (metodo === 'POST') {
      const m = /^\/api\/nodos\/([^/]+)\/(control|pulsar)$/.exec(pathname);
      if (m) return proxy(req, res, /^[1-9]$/.test(m[1]) ? Number(m[1]) : 0, m[2]);
    }
    responderJson(res, 404, { error: 'no existe' });
  });
}

function ipLan() {
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const i of lista ?? []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return 'localhost';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const puerto = Number(process.env.PUERTO) || PUERTO;
  const poller = crearPoller({ nodos: NODOS });
  const servidor = crearServidor({ poller, nodos: NODOS });
  poller.iniciar();
  servidor.listen(puerto, '0.0.0.0', () => {
    const ip = ipLan();
    console.log(`Panel: http://${ip}:${puerto}  Vista pública: http://${ip}:${puerto}/publico`);
  });
  const salir = () => { poller.detener(); servidor.close(); servidor.closeAllConnections(); process.exit(0); };
  process.on('SIGINT', salir);
  process.on('SIGTERM', salir);
}
