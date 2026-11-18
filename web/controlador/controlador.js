// Controlador de infraestructura: apaga y enciende servidores de VYBRA (su ESP32 simulado + su servidor de datos).
//
// Es el ÚNICO componente con acceso al socket de Docker y está diseñado para no poder hacer nada más:
//  · Solo entiende  GET /estado · GET /salud · POST /servidores/{1|2|3}/{apagar|encender}. Ninguna otra ruta existe.
//  · De la petición solo sale un número 1-3 y una de dos palabras: ningún nombre, id, comando ni argumento llega a Docker.
//  · Solo toca los contenedores de ESTE proyecto de compose con servicio nodo{n} o servidor{n}, y solo con
//    "stop" y "start". Las bases de datos (db{n}) jamás se paran ni se arrancan: solo se consultan (lectura).
//  · No se publica ningún puerto: solo lo alcanza el panel por la red interna de compose, con un token compartido.
//  · Si no hay contenedor nodo{n} (ESP32 FÍSICO), no hay nada que apagar: se informa y el panel hace la desconexión LÓGICA.
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const API = '/v1.43';
const ETIQ_PROYECTO = 'com.docker.compose.project';
const ETIQ_SERVICIO = 'com.docker.compose.service';

// Cliente mínimo del Engine API por socket Unix. Solo ofrece las 4 operaciones que usa el controlador.
export function clienteDocker(socketPath = '/var/run/docker.sock') {
  const pedir = (metodo, ruta) => new Promise((resolve, reject) => {
    const req = http.request({ socketPath, path: API + ruta, method: metodo, timeout: 15000 }, (res) => {
      const partes = [];
      res.on('data', (c) => partes.push(c));
      res.on('end', () => {
        const t = Buffer.concat(partes).toString('utf8');
        let cuerpo = null;
        try { cuerpo = t ? JSON.parse(t) : null; } catch { cuerpo = { texto: t.slice(0, 200) }; }
        resolve({ status: res.statusCode, cuerpo });
      });
    });
    req.on('timeout', () => req.destroy(new Error('Docker no responde')));
    req.on('error', reject);
    req.end();
  });
  return {
    listar: (etiquetas) => pedir('GET', `/containers/json?all=1&filters=${encodeURIComponent(JSON.stringify({ label: etiquetas }))}`),
    inspeccionar: (id) => pedir('GET', `/containers/${encodeURIComponent(id)}/json`),
    parar: (id, segundos) => pedir('POST', `/containers/${encodeURIComponent(id)}/stop?t=${Number(segundos) | 0}`),
    arrancar: (id) => pedir('POST', `/containers/${encodeURIComponent(id)}/start`),
  };
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
export class ErrorControl extends Error { constructor(msg, status = 409) { super(msg); this.status = status; } }

export function crearControlador({ proyecto, docker, esperaParadaS = 3, esperaArranqueMs = 15000, pausaMs = 300 }) {
  const ocupados = new Set();

  async function contenedor(servicio) {
    const r = await docker.listar([`${ETIQ_PROYECTO}=${proyecto}`, `${ETIQ_SERVICIO}=${servicio}`]);
    if (r.status !== 200) throw new ErrorControl(`Docker respondió ${r.status}`, 502);
    const c = (r.cuerpo || [])[0];
    return c ? { id: c.Id, nombre: (c.Names?.[0] || '').replace(/^\//, '') } : null;
  }
  async function leer(servicio) {
    const c = await contenedor(servicio);
    if (!c) return { existe: false, estado: 'inexistente' };
    const r = await docker.inspeccionar(c.id);
    if (r.status !== 200) throw new ErrorControl(`Docker respondió ${r.status}`, 502);
    const s = r.cuerpo.State || {};
    return {
      existe: true, id: c.id, contenedor: c.nombre, estado: s.Status || 'desconocido', corriendo: !!s.Running,
      salud: s.Health?.Status ?? null, desde: s.StartedAt || null, termino: s.FinishedAt || null, codigoSalida: s.ExitCode ?? null,
      volumenes: (r.cuerpo.Mounts || []).filter((m) => m.Type === 'volume').map((m) => m.Name),
    };
  }
  const publico = (x) => { const { id, ...resto } = x; return resto; };   // el id de Docker no sale del controlador

  async function estadoDe(n) {
    const [nodo, servidor, bd] = await Promise.all([leer(`nodo${n}`), leer(`servidor${n}`), leer(`db${n}`)]);
    return { n, modo: nodo.existe ? 'simulado' : 'fisico', nodo: publico(nodo), servidor: publico(servidor), bd: publico(bd), enCurso: ocupados.has(n) };
  }
  async function estado() { return { proyecto, servidores: await Promise.all([1, 2, 3].map(estadoDe)) }; }

  async function esperar(servicio, corriendo) {
    const limite = Date.now() + esperaArranqueMs;
    for (;;) {
      const x = await leer(servicio);
      if (x.corriendo === corriendo) return x;
      if (Date.now() > limite) throw new ErrorControl(`${servicio} no llegó a ${corriendo ? 'arrancar' : 'pararse'} a tiempo`, 504);
      await dormir(200);
    }
  }

  async function conCerrojo(n, fn) {
    if (ocupados.has(n)) throw new ErrorControl(`Ya hay una operación en curso en el servidor ${n}`);
    ocupados.add(n);
    try { return await fn(); } finally { ocupados.delete(n); }
  }

  // Apagar = parar el ESP32 simulado y el servidor de datos. La base de datos y su volumen no se tocan.
  async function apagar(n) {
    return conCerrojo(n, async () => {
      const antes = await estadoDe(n);
      const hechos = [];
      if (antes.nodo.existe && antes.nodo.corriendo) {   // primero el nodo: el servidor alcanza a registrar que dejó de responder
        const r = await docker.parar((await contenedor(`nodo${n}`)).id, esperaParadaS);
        if (![204, 304].includes(r.status)) throw new ErrorControl(`No se pudo parar el nodo ${n} (Docker ${r.status})`, 502);
        await esperar(`nodo${n}`, false);
        hechos.push(`nodo${n}`);
        await dormir(pausaMs);
      }
      if (antes.servidor.existe && antes.servidor.corriendo) {
        const r = await docker.parar((await contenedor(`servidor${n}`)).id, esperaParadaS);
        if (![204, 304].includes(r.status)) throw new ErrorControl(`No se pudo parar el servidor ${n} (Docker ${r.status})`, 502);
        await esperar(`servidor${n}`, false);
        hechos.push(`servidor${n}`);
      }
      return { accion: 'apagar', n, detenidos: hechos, estado: await estadoDe(n) };
    });
  }

  // Encender = arrancar el ESP32 simulado y el servidor de datos (la base ya debe estar encendida).
  async function encender(n) {
    return conCerrojo(n, async () => {
      const antes = await estadoDe(n);
      if (!antes.bd.existe || !antes.bd.corriendo) throw new ErrorControl(`La base de datos del servidor ${n} no está encendida: este controlador no la arranca`);
      const hechos = [];
      if (antes.nodo.existe && !antes.nodo.corriendo) {
        const r = await docker.arrancar((await contenedor(`nodo${n}`)).id);
        if (![204, 304].includes(r.status)) throw new ErrorControl(`No se pudo arrancar el nodo ${n} (Docker ${r.status})`, 502);
        await esperar(`nodo${n}`, true);
        hechos.push(`nodo${n}`);
      }
      if (antes.servidor.existe && !antes.servidor.corriendo) {
        const r = await docker.arrancar((await contenedor(`servidor${n}`)).id);
        if (![204, 304].includes(r.status)) throw new ErrorControl(`No se pudo arrancar el servidor ${n} (Docker ${r.status})`, 502);
        await esperar(`servidor${n}`, true);
        hechos.push(`servidor${n}`);
      }
      return { accion: 'encender', n, iniciados: hechos, estado: await estadoDe(n) };
    });
  }
  return { estado, estadoDe, apagar, encender, proyecto };
}

const RUTA = /^\/servidores\/([1-3])\/(apagar|encender)$/;
const igual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export function crearManejador({ controlador, token = '' }) {
  const responder = (res, st, o) => {
    const c = JSON.stringify(o);
    res.writeHead(st, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(c) });
    res.end(c);
  };
  return async (req, res) => {
    req.resume();
    const ruta = (req.url || '').split('?')[0];
    if (req.method === 'GET' && ruta === '/salud') return responder(res, 200, { ok: true });
    if (token && !igual((req.headers.authorization || '').replace(/^Bearer /, ''), token)) return responder(res, 401, { error: 'no autorizado' });
    try {
      if (req.method === 'GET' && ruta === '/estado') return responder(res, 200, await controlador.estado());
      const m = RUTA.exec(ruta);
      if (req.method === 'POST' && m) {
        const n = Number(m[1]);
        return responder(res, 200, await (m[2] === 'apagar' ? controlador.apagar(n) : controlador.encender(n)));
      }
      return responder(res, 404, { error: 'no existe' });
    } catch (e) {
      return responder(res, e instanceof ErrorControl ? e.status : 502, { error: e.message });
    }
  };
}

async function proyectoPropio(docker) {
  if (process.env.COMPOSE_PROJECT) return process.env.COMPOSE_PROJECT;
  const r = await docker.inspeccionar(process.env.HOSTNAME || '');
  const p = r.cuerpo?.Config?.Labels?.[ETIQ_PROYECTO];
  if (!p) throw new Error('No se pudo averiguar el proyecto de compose (define COMPOSE_PROJECT)');
  return p;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const docker = clienteDocker(process.env.DOCKER_SOCKET || '/var/run/docker.sock');
  const proyecto = await proyectoPropio(docker).catch((e) => { console.error(e.message); process.exit(1); });
  let token = process.env.CONTROL_TOKEN || '';
  if (process.env.CONTROL_TOKEN_FILE) token = (await import('node:fs')).readFileSync(process.env.CONTROL_TOKEN_FILE, 'utf8').trim();
  if (!token) console.warn('AVISO: sin CONTROL_TOKEN; solo el panel debe poder alcanzar este servicio (red interna de compose).');
  const srv = http.createServer(crearManejador({ controlador: crearControlador({ proyecto, docker }), token }));
  srv.listen(Number(process.env.PUERTO) || 8200, '0.0.0.0', () => console.log(`Controlador de infraestructura · proyecto "${proyecto}" · puerto ${process.env.PUERTO || 8200}`));
  const salir = () => srv.close(() => process.exit(0));
  process.on('SIGTERM', salir);
  process.on('SIGINT', salir);
}
