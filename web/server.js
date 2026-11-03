// Servidor del PC: estáticos, estado agregado, SSE y control de los nodos.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearPoller } from './poller.js';
import { NODOS, PUERTO, PUERTO_HTTPS, DETECTORES } from './config.js';
import { crearUbicaciones } from './ubicaciones.js';
import { asegurarCertificado, ipsLan } from './certificado.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const LIMITE_CUERPO = 4096;
const VIVO_MS = 5000;  // latido SSE: mantiene viva la conexión y dice "el PC sigue al día"
const MAX_PENDIENTE = 1024 * 1024;
const REINTENTO_HUELLA_MS = 60000; // como máximo un pedido de huella por minuto y nodo

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

// Pide al nodo que tome su huella Wi-Fi. Los errores se tragan (se avisa una sola vez).
function pedirHuellaPorDefecto(nodos, timeoutMs) {
  let avisado = false;
  return async (n) => {
    const nodo = nodos.find((x) => x.n === n);
    if (!nodo) return;
    try {
      await fetch(`${nodo.url}/huella`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      if (!avisado) { avisado = true; console.log(`No se pudo pedir la huella al nodo ${n}; se reintenta luego.`); }
    }
  };
}

// Manejador HTTP compartido por el servidor HTTP y el HTTPS.
export function crearManejador({
  poller, nodos, publicDir = path.join(AQUI, 'public'), detectores = DETECTORES, timeoutNodoMs = 1000,
  maxPendienteSse = MAX_PENDIENTE, vivoMs = VIVO_MS,
  ubicaciones = crearUbicaciones(null), pedirHuella = pedirHuellaPorDefecto(nodos, timeoutNodoMs), ahora = Date.now,
}) {
  const raiz = path.resolve(publicDir);
  const conUbicaciones = (foto) => ({ ...foto, ubicaciones: ubicaciones.todas() });

  // Reintento de huella: un nodo ubicado, alcanzable, no caído y sin huella la recibe de nuevo,
  // a lo sumo una vez por minuto.
  const ultimoPedido = new Map();
  function pedirSiHaceFalta(foto) {
    const ubic = ubicaciones.todas();
    const t = ahora();
    for (const x of foto.nodos) {
      if (!ubic[x.n] || !x.alcanzable || !x.estado || x.estado.caido || x.estado.con_huella !== false) continue;
      const antes = ultimoPedido.get(x.n);
      if (antes !== undefined && t - antes < REINTENTO_HUELLA_MS) continue;
      ultimoPedido.set(x.n, t);
      Promise.resolve(pedirHuella(x.n)).catch(() => {});
    }
  }
  poller.on('cambio', pedirSiHaceFalta);
  pedirSiHaceFalta(poller.foto());

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
    const enviar = (foto) => escribir(`event: estado\ndata: ${JSON.stringify({ ...conUbicaciones(foto), detectores: detectores })}\n\n`);
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

  // Guarda la ubicación de un nodo y le pide la huella.
  async function ubicacion(req, res, n) {
    if (!nodos.some((x) => x.n === n)) return responderJson(res, 404, { error: 'nodo no existe' });
    if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) {
      req.resume();
      return responderJson(res, 415, { error: 'se requiere application/json' });
    }
    const cuerpo = await leerCuerpo(req, res);
    if (cuerpo === null) return;
    let datos;
    try { datos = JSON.parse(cuerpo); } catch { return responderJson(res, 400, { error: 'json invalido' }); }
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return responderJson(res, 400, { error: 'se esperaba un objeto' });
    let guardada;
    try { guardada = ubicaciones.fijar(n, datos); } catch (e) {
      if (e.codigo === 400) return responderJson(res, 400, { error: e.message });
      console.error('No se pudo guardar la ubicación:', e.message);
      return responderJson(res, 500, { error: 'no se pudo guardar' });
    }
    ultimoPedido.set(n, ahora());
    Promise.resolve(pedirHuella(n)).catch(() => {});
    responderJson(res, 200, { ubicacion: guardada });
  }

  return (req, res) => {
    // Se antepone el origen como texto: con base, "//x/y" se leería como host.
    // URL normaliza los ".." en silencio: se rechazan antes sobre la ruta cruda.
    try {
      if (decodeURIComponent(req.url.split('?')[0]).split(/[\\/]/).includes('..')) return responderJson(res, 404, { error: 'no existe' });
    } catch { return responderJson(res, 404, { error: 'no existe' }); }
    let pathname;
    try { ({ pathname } = new URL(`http://x${req.url}`)); } catch { return responderJson(res, 400, { error: 'url invalida' }); }
    const metodo = req.method;

    if (metodo === 'GET' || metodo === 'HEAD') {
      if (pathname === '/api/estado') return responderJson(res, 200, { ...conUbicaciones(poller.foto()), detectores });
      if (pathname === '/api/stream') return stream(req, res);
      if (pathname === '/') return estatico(res, 'operador.html');
      if (pathname === '/publico') return estatico(res, 'cliente.html');
      if (pathname.startsWith('/api/')) return responderJson(res, 404, { error: 'no existe' });
      return estatico(res, pathname.slice(1));
    }
    if (metodo === 'POST') {
      const m = /^\/api\/nodos\/([^/]+)\/(control|pulsar|ubicacion)$/.exec(pathname);
      if (m) {
        const n = /^[1-9]$/.test(m[1]) ? Number(m[1]) : 0;
        return m[2] === 'ubicacion' ? ubicacion(req, res, n) : proxy(req, res, n, m[2]);
      }
    }
    responderJson(res, 404, { error: 'no existe' });
  };
}

// Servidor HTTP; con `https: {cert, key}` devuelve un servidor HTTPS con el mismo manejador.
export function crearServidor({ https: tls, ...opciones }) {
  const manejador = crearManejador(opciones);
  return tls ? https.createServer({ cert: tls.cert, key: tls.key }, manejador) : http.createServer(manejador);
}

const REGLA_UFW = 'sudo ufw allow from 192.168.80.0/24 to any port 8091 proto tcp';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const puerto = Number(process.env.PUERTO) || PUERTO;
  const puertoHttps = Number(process.env.PUERTO_HTTPS) || PUERTO_HTTPS;
  const dirCerts = process.env.DIR_CERTS || path.join(AQUI, 'certs');
  const archivoUbi = process.env.ARCHIVO_UBICACIONES || path.join(AQUI, 'datos', 'ubicaciones.json');
  const poller = crearPoller({ nodos: NODOS });
  const manejador = crearManejador({ poller, nodos: NODOS, ubicaciones: crearUbicaciones(archivoUbi) });
  const servidores = [http.createServer(manejador)];
  const ip = ipsLan()[0] ?? 'localhost';
  poller.iniciar();
  servidores[0].listen(puerto, '0.0.0.0', () => {
    console.log(`Panel: http://${ip}:${puerto}  Vista pública: http://${ip}:${puerto}/publico`);
  });
  try {
    const tls = await asegurarCertificado(dirCerts);
    const seguro = https.createServer({ cert: tls.cert, key: tls.key }, manejador);
    servidores.push(seguro);
    seguro.listen(puertoHttps, '0.0.0.0', () => {
      console.log(`Para ubicar nodos con el celular (GPS): https://${ip}:${puertoHttps}  (acepta el aviso del certificado)`);
      console.log(`Si el firewall bloquea el celular: ${REGLA_UFW}`);
    });
  } catch (e) {
    console.log(`No se pudo preparar HTTPS (${e.message}). ¿Está instalado openssl? Se sirve solo HTTP; sin HTTPS el celular no podrá usar el GPS.`);
  }
  const salir = () => { poller.detener(); for (const s of servidores) { s.close(); s.closeAllConnections(); } process.exit(0); };
  process.on('SIGINT', salir);
  process.on('SIGTERM', salir);
}
