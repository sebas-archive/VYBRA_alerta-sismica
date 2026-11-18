// Servidor de datos: un ESP32 asignado + su propia base de datos PostgreSQL.
// Variables: ver config.js (N, NODO_URL, DATABASE_URL o DB_*, VYBRA_ENTORNO, PUERTO, INTERVALO_MS, RETENCION_*).
// API: GET /info · /salud · /api/historial (paginado y filtrado) · /api/registro · /api/publico · /retencion
//      POST /acciones  (el panel registra aquí las pruebas y órdenes que envía al ESP32 de este servidor)
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { abrirBD } from './bd.js';
import { ErrorValidacion, NOMBRES_TIPO } from './consulta.js';
import { leerConfig } from './config.js';
import { planificar, aplicar } from './retencion.js';
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

export function crearManejador({ n, nodoUrl, almacen, recolector, retencion = null, sistema = sistemaOperativo(), iniciado = Date.now() }) {
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
      // Histórico paginado con filtros: tipo, pagina, limite (máx. 200), nodo, categoria, estado, desde, hasta, q, orden, fuente.
      if (req.method === 'GET' && pathname === '/api/historial') {
        const f = Object.fromEntries(q.entries());
        const r = await almacen.listar(f.tipo || 'eventos', f);
        return json(res, 200, { servidor: n, ...r });
      }
      // Un registro completo: /api/registro?tipo=eventos&id=...
      if (req.method === 'GET' && pathname === '/api/registro') {
        const r = await almacen.detalle(q.get('tipo') || '', q.get('id'), q.get('fuente'));
        if (!r) return json(res, 404, { error: 'no existe ese registro' });
        return json(res, 200, { servidor: n, tipo: q.get('tipo'), registro: r });
      }
      // Vista pública (CLIENTE): solo alertas confirmadas y lecturas, sin datos internos.
      if (req.method === 'GET' && pathname === '/api/publico') {
        const r = await almacen.listarPublico(q.get('tipo') || 'alertas', Object.fromEntries(q.entries()));
        return json(res, 200, { servidor: n, ...r });
      }
      // Política de retención y qué afectaría ahora (solo lectura: no modifica nada).
      if (req.method === 'GET' && pathname === '/retencion') {
        const cfg = retencion || { activa: false, modo: 'archivar', dias: {}, criticoNivel: 6, errores: [] };
        const plan = retencion ? await planificar(almacen.pool, retencion) : {};
        return json(res, 200, { servidor: n, config: { activa: cfg.activa, modo: cfg.modo, dias: cfg.dias, criticoNivel: cfg.criticoNivel, errores: cfg.errores }, plan });
      }
      if (req.method === 'POST' && pathname === '/acciones') {
        if (!/^application\/json/i.test(req.headers['content-type'] ?? '')) { req.resume(); return json(res, 415, { error: 'se requiere application/json' }); }
        const partes = []; let total = 0;
        for await (const c of req) { total += c.length; if (total > LIMITE_CUERPO) { req.destroy(); return json(res, 413, { error: 'cuerpo demasiado grande' }); } partes.push(c); }
        let a; try { a = JSON.parse(Buffer.concat(partes).toString('utf8')); } catch { return json(res, 400, { error: 'json invalido' }); }
        if (!a || typeof a.tipo !== 'string' || !a.tipo) return json(res, 400, { error: 'falta tipo' });
        const r = await almacen.guardarAccion({ ...a, nodo: n });
        return json(res, r.duplicada ? 200 : 201, { ok: true, id: r.id, duplicada: r.duplicada });
      }
      return json(res, 404, { error: 'no existe' });
    } catch (e) {
      if (e instanceof ErrorValidacion) return json(res, 400, { error: e.message });
      return json(res, 500, { error: e.message });
    }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let cfg;
  try { cfg = leerConfig(); } catch (e) { console.error(e.message); process.exit(1); }
  if (cfg.claveDesarrollo) console.warn('AVISO: la base usa la clave de DESARROLLO. Solo válida en desarrollo; en producción usa DB_PASSWORD_FILE y VYBRA_ENTORNO=produccion.');
  for (const e of cfg.retencion.errores) console.error(`Retención: ${e}`);
  const almacen = await abrirBD(cfg.dbUrl).catch((e) => { console.error(e.message); process.exit(1); });
  const recolector = crearRecolector({ n: cfg.n, url: cfg.nodoUrl, almacen, intervaloMs: cfg.intervaloMs, timeoutMs: cfg.timeoutNodoMs });
  const servidor = http.createServer(crearManejador({ n: cfg.n, nodoUrl: cfg.nodoUrl, almacen, recolector, retencion: cfg.retencion }));
  recolector.iniciar();
  let tRet = null;
  if (cfg.retencion.activa) {
    const correr = () => aplicar(almacen.pool, cfg.retencion).then((r) => console.log(`Retención (${r.modo}):`, JSON.stringify(r.movidos))).catch((e) => console.error(`Retención: ${e.message}`));
    setTimeout(correr, 60000).unref();
    tRet = setInterval(correr, cfg.retencion.cadaHoras * 3600000);
    console.log(`Retención ACTIVA (${cfg.retencion.modo}): ${JSON.stringify(cfg.retencion.dias)}`);
  } else console.log('Retención desactivada: no se archiva ni se elimina nada.');
  servidor.listen(cfg.puerto, '0.0.0.0', () => console.log(`Servidor ${cfg.n} (${sistemaOperativo()}, Node ${process.version}): ESP32 ${cfg.nodoUrl} → PostgreSQL. API en :${cfg.puerto}`));
  const salir = () => { recolector.detener(); if (tRet) clearInterval(tRet); servidor.close(); almacen.cerrar().finally(() => process.exit(0)); };
  process.on('SIGINT', salir);
  process.on('SIGTERM', salir);
}
