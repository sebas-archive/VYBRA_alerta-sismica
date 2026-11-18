// Servidor de datos: un ESP32 asignado + su propia base de datos PostgreSQL.
// Variables: N (1-3), NODO_URL (el ESP32 que tiene asignado), DATABASE_URL, PUERTO (8100), INTERVALO_MS (1000).
// API: GET /info · GET /salud · GET /api/historial?tipo=muestras|log|eventos|alertas|sucesos|acciones&limite=200
//      POST /acciones  (el panel registra aquí las pruebas y órdenes que envía al ESP32 de este servidor)
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { abrirBD, TIPOS } from './bd.js';
import { crearRecolector } from './recolector.js';

const LIMITE_CUERPO = 4096;
const json = (res, status, obj) => {
  const c = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Length': Buffer.byteLength(c) });
  res.end(c);
};

function sistemaOperativo() {
  try { return /^PRETTY_NAME="?([^"\n]*)"?/m.exec(fs.readFileSync('/etc/os-release', 'utf8'))?.[1] ?? 'desconocido'; } catch { return 'desconocido'; }
}

export function crearManejador({ n, nodoUrl, almacen, recolector, sistema = sistemaOperativo(), iniciado = Date.now() }) {
  return async (req, res) => {
    let pathname, q;
    try { const u = new URL(`http://x${req.url}`); pathname = u.pathname; q = u.searchParams; } catch { return json(res, 400, { error: 'url invalida' }); }
    try {
      if (req.method === 'GET' && pathname === '/salud') { await almacen.pool.query('SELECT 1'); return json(res, 200, { ok: true }); }
      if (req.method === 'GET' && pathname === '/info') {
        let bd;
        try { bd = await almacen.info(); } catch (e) { bd = { ok: false, error: e.message }; }
        const r = recolector.estado();
        return json(res, 200, {
          servidor: n, sistema, node: process.version, iniciado,
          nodo: { n, url: nodoUrl, alcanzable: r.alcanzable, ultimoContacto: r.ultimoContacto, ultimoError: r.ultimoError },
          bd,
        });
      }
      if (req.method === 'GET' && pathname === '/api/historial') {
        const tipo = q.get('tipo') || 'eventos';
        if (!TIPOS[tipo]) return json(res, 400, { error: `tipo debe ser ${Object.keys(TIPOS).join(', ')}` });
        const filas = await almacen.leer(tipo, Number(q.get('limite')) || 200);
        return json(res, 200, { servidor: n, tipo, total: filas.length, registros: filas });
      }
      if (req.method === 'POST' && pathname === '/acciones') {
        if (!/^application\/json/i.test(req.headers['content-type'] ?? '')) { req.resume(); return json(res, 415, { error: 'se requiere application/json' }); }
        const partes = []; let total = 0;
        for await (const c of req) { total += c.length; if (total > LIMITE_CUERPO) { req.destroy(); return json(res, 413, { error: 'cuerpo demasiado grande' }); } partes.push(c); }
        let a; try { a = JSON.parse(Buffer.concat(partes).toString('utf8')); } catch { return json(res, 400, { error: 'json invalido' }); }
        if (!a || typeof a.tipo !== 'string' || !a.tipo) return json(res, 400, { error: 'falta tipo' });
        const id = await almacen.guardarAccion({ ...a, nodo: n });
        return json(res, 201, { ok: true, id });
      }
      return json(res, 404, { error: 'no existe' });
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const n = Number(process.env.N);
  if (![1, 2, 3].includes(n)) { console.error('Falta N=1, 2 o 3'); process.exit(1); }
  const nodoUrl = process.env.NODO_URL;
  const dbUrl = process.env.DATABASE_URL;
  if (!nodoUrl || !dbUrl) { console.error('Faltan NODO_URL (el ESP32 asignado) y DATABASE_URL (PostgreSQL de este servidor)'); process.exit(1); }
  const puerto = Number(process.env.PUERTO) || 8100;
  const almacen = await abrirBD(dbUrl).catch((e) => { console.error(e.message); process.exit(1); });
  const recolector = crearRecolector({ n, url: nodoUrl, almacen, intervaloMs: Number(process.env.INTERVALO_MS) || 1000, timeoutMs: Number(process.env.TIMEOUT_NODO_MS) || 3000 });
  const servidor = http.createServer(crearManejador({ n, nodoUrl, almacen, recolector }));
  recolector.iniciar();
  servidor.listen(puerto, '0.0.0.0', () => console.log(`Servidor ${n} (${sistemaOperativo()}, Node ${process.version}): ESP32 ${nodoUrl} → PostgreSQL. API en :${puerto}`));
  const salir = () => { recolector.detener(); servidor.close(); almacen.cerrar().finally(() => process.exit(0)); };
  process.on('SIGINT', salir);
  process.on('SIGTERM', salir);
}
