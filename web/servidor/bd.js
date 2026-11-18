// Base de datos PostgreSQL de un servidor: guarda todo lo que toma su ESP32 asignado.
// Los ESP32 solo toman y transportan los datos; aquí es donde quedan.
import pg from 'pg';

export const TABLAS = ['muestras', 'log_entradas', 'eventos', 'alertas', 'sucesos', 'acciones'];

export const ESQUEMA = `
CREATE TABLE IF NOT EXISTS muestras (
  id bigserial PRIMARY KEY, t timestamptz NOT NULL DEFAULT now(), nodo int NOT NULL, alcanzable boolean NOT NULL,
  rol text, termino int, log_len int, commit_index int, pendientes int, rssi int, uptime_ms bigint, situacion text, estado jsonb);
CREATE INDEX IF NOT EXISTS muestras_t ON muestras (t DESC);
CREATE TABLE IF NOT EXISTS log_entradas (
  clave text PRIMARY KEY, indice int NOT NULL, termino int NOT NULL, clase text NOT NULL, datos jsonb NOT NULL,
  confirmada boolean NOT NULL DEFAULT false, guardado timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS log_indice ON log_entradas (indice);
CREATE TABLE IF NOT EXISTS eventos (
  id text PRIMARY KEY, nodo int, nivel int, pga double precision, duracion_ms int, t_ms bigint, t_lider_ms bigint,
  recibido_por int, indice int, termino int, confirmado boolean NOT NULL DEFAULT false, datos jsonb NOT NULL,
  guardado timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS eventos_indice ON eventos (indice);
CREATE TABLE IF NOT EXISTS alertas (
  clave text PRIMARY KEY, alerta_id int, promedio double precision, nivel text, eventos text[], termino int, lider int,
  datos jsonb NOT NULL, guardado timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS sucesos (
  clave text PRIMARY KEY, nodo int, seq int, t_ms bigint, tipo text, texto text, termino int,
  guardado timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS sucesos_t ON sucesos (t_ms DESC);
CREATE TABLE IF NOT EXISTS acciones (
  id bigserial PRIMARY KEY, t timestamptz NOT NULL DEFAULT now(), tipo text NOT NULL, nodo int,
  parametros jsonb, estado_http int, resultado jsonb, origen text);
`;

const ORDEN = {
  muestras: 'id DESC', log_entradas: 'indice DESC, guardado DESC', eventos: 'indice DESC NULLS LAST, guardado DESC',
  alertas: 'alerta_id DESC NULLS LAST, guardado DESC', sucesos: 't_ms DESC NULLS LAST, seq DESC', acciones: 'id DESC',
};
export const TIPOS = { muestras: 'muestras', log: 'log_entradas', eventos: 'eventos', alertas: 'alertas', sucesos: 'sucesos', acciones: 'acciones' };

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Abre el pool y crea las tablas. Reintenta mientras PostgreSQL arranca (en Docker tarda unos segundos).
export async function abrirBD(url, { reintentos = 40, esperaMs = 1000, avisar = console.error } = {}) {
  const pool = new pg.Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 4000 });
  pool.on('error', (e) => avisar(`PostgreSQL: ${e.message}`));
  let ultimo;
  for (let i = 0; i < reintentos; i++) {
    try { await pool.query(ESQUEMA); return crearAlmacen(pool); } catch (e) { ultimo = e; await dormir(esperaMs); }
  }
  await pool.end().catch(() => {});
  throw new Error(`no se pudo abrir PostgreSQL: ${ultimo && ultimo.message}`);
}

export function crearAlmacen(pool) {
  let ultimaEscritura = null;
  const escribio = () => { ultimaEscritura = Date.now(); };

  return {
    pool,
    async guardarMuestra(m) {
      await pool.query(
        `INSERT INTO muestras (nodo, alcanzable, rol, termino, log_len, commit_index, pendientes, rssi, uptime_ms, situacion, estado)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [m.nodo, m.alcanzable, m.rol ?? null, m.termino ?? null, m.log_len ?? null, m.commit_index ?? null, m.pendientes ?? null,
          m.rssi ?? null, m.uptime_ms ?? null, m.situacion ?? null, m.estado ? JSON.stringify(m.estado) : null]);
      escribio();
    },
    // entradas: del /log del nodo ({i, T, clase, ...}); commit: commit_index actual del nodo.
    async guardarLog(entradas, commit) {
      for (const x of entradas) {
        const datos = JSON.stringify(x);
        const clave = `${x.i}|${x.T}|${x.clase}|${x.ev ? x.ev.id : ''}`;
        const conf = x.i <= commit;
        await pool.query(
          `INSERT INTO log_entradas (clave, indice, termino, clase, datos, confirmada) VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (clave) DO UPDATE SET confirmada = log_entradas.confirmada OR EXCLUDED.confirmada`,
          [clave, x.i, x.T, x.clase, datos, conf]);
        if (x.clase === 'evento' && x.ev) {
          const e = x.ev;
          await pool.query(
            `INSERT INTO eventos (id, nodo, nivel, pga, duracion_ms, t_ms, t_lider_ms, recibido_por, indice, termino, confirmado, datos)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (id) DO UPDATE SET confirmado = eventos.confirmado OR EXCLUDED.confirmado, indice = EXCLUDED.indice, termino = EXCLUDED.termino`,
            [e.id, e.nodo ?? null, e.nivel ?? null, e.pga ?? null, e.duracion_ms ?? null, e.t ?? null, e.t_lider ?? null,
              e.recibido_por ?? null, x.i, x.T, conf, JSON.stringify(e)]);
        }
      }
      if (entradas.length) escribio();
    },
    async guardarAlertas(alertas) {
      for (const a of alertas) {
        const clave = `${a.id}|${[...(a.eventos || [])].sort().join(',')}`;
        await pool.query(
          `INSERT INTO alertas (clave, alerta_id, promedio, nivel, eventos, termino, lider, datos) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (clave) DO NOTHING`,
          [clave, a.id ?? null, a.promedio ?? null, a.nivel ?? null, a.eventos ?? [], a.termino ?? null, a.lider ?? null, JSON.stringify(a)]);
      }
      if (alertas.length) escribio();
    },
    async guardarSucesos(nodo, sucesos) {
      for (const s of sucesos) {
        await pool.query(
          `INSERT INTO sucesos (clave, nodo, seq, t_ms, tipo, texto, termino) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (clave) DO NOTHING`,
          [`${nodo}|${s.seq}|${s.t}`, nodo, s.seq ?? null, s.t ?? null, s.tipo ?? null, s.texto ?? null, s.termino ?? null]);
      }
      if (sucesos.length) escribio();
    },
    // Pruebas y órdenes enviadas al nodo (pulsaciones simuladas, caídas simuladas...).
    async guardarAccion(a) {
      const r = await pool.query(
        `INSERT INTO acciones (tipo, nodo, parametros, estado_http, resultado, origen) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [String(a.tipo).slice(0, 40), a.nodo ?? null, JSON.stringify(a.parametros ?? null), a.estado_http ?? null,
          JSON.stringify(a.resultado ?? null), a.origen ? String(a.origen).slice(0, 60) : null]);
      escribio();
      return r.rows[0].id;
    },
    async leer(tipo, limite = 200) {
      const tabla = TIPOS[tipo];
      if (!tabla) return null;
      const n = Math.min(Math.max(1, Math.floor(limite) || 200), 5000);
      const r = await pool.query(`SELECT * FROM ${tabla} ORDER BY ${ORDEN[tabla]} LIMIT $1`, [n]);
      return r.rows;
    },
    async info() {
      const v = await pool.query('SELECT version() AS v');
      const conteos = {};
      for (const t of TABLAS) conteos[t] = Number((await pool.query(`SELECT count(*) AS c FROM ${t}`)).rows[0].c);
      return { ok: true, version: v.rows[0].v.split(' on ')[0], conteos, ultimaEscritura };
    },
    cerrar: () => pool.end(),
  };
}
