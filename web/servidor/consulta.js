// Lectura del histórico en PostgreSQL: filtros validados, paginación real (LIMIT/OFFSET) y detalle.
// Solo devuelve lo que hay en las tablas. Nunca construye SQL con texto del usuario: los valores van como parámetros
// y los nombres de tabla/columna salen de listas fijas.

export const MAX_LIMITE = 200;          // registros por página
export const LIMITE_DEFAULT = 50;
export const MAX_DESPLAZAMIENTO = 100000;   // salto máximo (refinar filtros antes de paginar más allá)

export class ErrorValidacion extends Error {
  constructor(msg) { super(msg); this.name = 'ErrorValidacion'; this.status = 400; }
}

// Tabla, clave primaria, instante de ordenación/filtrado y columnas que se listan (sin los campos pesados).
export const DEF = {
  muestras: { tabla: 'muestras', pk: 'id', ts: 't',
    cols: 'id, nodo, alcanzable, rol, termino, log_len, commit_index, pendientes, rssi, uptime_ms, situacion',
    q: ['rol', 'situacion'] },
  log: { tabla: 'log_entradas', pk: 'clave', ts: 'guardado',
    cols: 'clave, indice, termino, clase, confirmada, datos, guardado', q: ['clase', 'datos::text'] },
  eventos: { tabla: 'eventos', pk: 'id', ts: 'COALESCE(to_timestamp(t_ms / 1000.0), guardado)',
    cols: 'id, nodo, nivel, pga, duracion_ms, t_ms, t_lider_ms, recibido_por, indice, termino, confirmado, guardado', q: ['id'] },
  alertas: { tabla: 'alertas', pk: 'clave', ts: 'COALESCE(to_timestamp(t_ms / 1000.0), guardado)',
    cols: 'clave, alerta_id, promedio, nivel, eventos, termino, lider, t_ms, guardado', q: ['clave', 'nivel', 'array_to_string(eventos, \' \')'] },
  sucesos: { tabla: 'sucesos', pk: 'clave', ts: 'COALESCE(to_timestamp(t_ms / 1000.0), guardado)',
    cols: 'clave, nodo, seq, t_ms, tipo, texto, termino, guardado', q: ['texto', 'tipo'] },
  acciones: { tabla: 'acciones', pk: 'id', ts: 't',
    cols: 'id, t, tipo, nodo, parametros, estado_http, resultado, origen, ref', q: ['tipo', 'parametros::text', 'resultado::text'] },
};
export const NOMBRES_TIPO = Object.keys(DEF);

// Categorías de cada tipo (valores aceptados por el filtro `categoria`).
const CATEGORIAS = {
  eventos: { leve: 'nivel BETWEEN 1 AND 2', moderado: 'nivel BETWEEN 3 AND 4', fuerte: 'nivel BETWEEN 5 AND 7', severo: 'nivel >= 8' },
  alertas: { baja: "nivel = 'baja'", media: "nivel = 'media'", alta: "nivel = 'alta'" },
  muestras: { lider: "rol = 'lider'", seguidor: "rol = 'seguidor'", candidato: "rol = 'candidato'", sin_respuesta: 'alcanzable = false' },
};
const RE_SIMPLE = /^[a-z_]{1,30}$/;

const aMs = (v, nombre) => {
  if (v == null || v === '') return null;
  const t = /^\d{9,}$/.test(String(v)) ? Number(v) : Date.parse(String(v));
  if (!Number.isFinite(t) || t < 0 || t > 4102444800000) throw new ErrorValidacion(`${nombre}: fecha no válida`);
  return t;
};
const entero = (v, nombre, min, max, def) => {
  if (v == null || v === '') return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new ErrorValidacion(`${nombre} debe ser un entero entre ${min} y ${max}`);
  return n;
};

// Valida y normaliza los filtros (de la query string o de un objeto). Lanza ErrorValidacion.
export function normalizarFiltros(tipo, f = {}) {
  if (!DEF[tipo]) throw new ErrorValidacion(`tipo debe ser ${NOMBRES_TIPO.join(', ')}`);
  const out = {
    limite: entero(f.limite, 'limite', 1, MAX_LIMITE, LIMITE_DEFAULT),
    pagina: entero(f.pagina, 'pagina', 1, 1000000, 1),
    nodo: entero(f.nodo, 'nodo', 1, 3, null),
    desde: aMs(f.desde, 'desde'),
    hasta: aMs(f.hasta, 'hasta'),
    q: f.q == null ? '' : String(f.q).trim().slice(0, 80),
    orden: f.orden === 'asc' ? 'asc' : 'desc',
    categoria: null, estado: null, clase: null,
    fuente: f.fuente === 'archivo' ? 'archivo' : 'activo',
  };
  if (out.desde != null && out.hasta != null && out.desde > out.hasta) throw new ErrorValidacion('desde no puede ser posterior a hasta');
  if (f.categoria) {
    const c = String(f.categoria);
    if (tipo === 'sucesos' || tipo === 'log' || tipo === 'acciones') {
      if (!RE_SIMPLE.test(c)) throw new ErrorValidacion('categoria no válida');
      out.clase = c;                                   // tipo de suceso / clase de entrada / tipo de acción
    } else {
      if (!CATEGORIAS[tipo] || !CATEGORIAS[tipo][c]) throw new ErrorValidacion(`categoria debe ser ${Object.keys(CATEGORIAS[tipo] || {}).join(', ') || '(ninguna para este tipo)'}`);
      out.categoria = c;
    }
  }
  if (f.estado) {
    if (!['confirmado', 'pendiente'].includes(f.estado) || !['eventos', 'log'].includes(tipo)) throw new ErrorValidacion('estado: confirmado o pendiente (solo eventos y log)');
    out.estado = f.estado;
  }
  if ((out.pagina - 1) * out.limite > MAX_DESPLAZAMIENTO) throw new ErrorValidacion('página demasiado lejana: afina los filtros (fechas, nodo, búsqueda)');
  return out;
}

const escapaLike = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);

// WHERE y parámetros a partir de filtros ya normalizados.
function donde(tipo, f) {
  const d = DEF[tipo];
  const w = [], p = [];
  const add = (sql, ...vals) => { w.push(sql.replace(/\?/g, () => `$${p.push(vals.shift()) }`)); };
  if (f.nodo != null) {
    if (tipo === 'alertas') add("EXISTS (SELECT 1 FROM unnest(eventos) e WHERE e LIKE ?)", `nodo-${f.nodo}-%`);
    else if (tipo === 'log') add("(datos->'ev'->>'nodo')::int = ?", f.nodo);
    else add('nodo = ?', f.nodo);
  }
  if (f.desde != null) add(`${d.ts} >= to_timestamp(? / 1000.0)`, f.desde);
  if (f.hasta != null) add(`${d.ts} <= to_timestamp(? / 1000.0)`, f.hasta);
  if (f.categoria) w.push(`(${CATEGORIAS[tipo][f.categoria]})`);
  if (f.clase) add(tipo === 'log' ? 'clase = ?' : 'tipo = ?', f.clase);
  if (f.estado) w.push(`${tipo === 'eventos' ? 'confirmado' : 'confirmada'} = ${f.estado === 'confirmado' ? 'true' : 'false'}`);
  if (f.q) {
    const like = `%${escapaLike(f.q)}%`;
    const orq = d.q.map((c) => { p.push(like); return `${c} ILIKE $${p.length}`; });
    // el número de nodo o de nivel también se busca como texto en eventos
    w.push(`(${orq.join(' OR ')})`);
  }
  return { sql: w.length ? `WHERE ${w.join(' AND ')}` : '', p };
}

const nombreTabla = (d, fuente) => (fuente === 'archivo' ? `archivo_${d.tabla}` : d.tabla);

// Una página del histórico. Devuelve { tipo, pagina, limite, total, paginas, registros }, cada registro con `ts` (ms).
export async function listar(pool, tipo, filtros = {}) {
  const f = normalizarFiltros(tipo, filtros);
  const d = DEF[tipo];
  const tabla = nombreTabla(d, f.fuente);
  const { sql, p } = donde(tipo, f);
  const total = (await pool.query(`SELECT count(*) AS c FROM ${tabla} ${sql}`, p)).rows[0].c;
  const dir = f.orden === 'asc' ? 'ASC' : 'DESC';
  const r = await pool.query(
    `SELECT ${d.cols}, (EXTRACT(EPOCH FROM ${d.ts}) * 1000)::bigint AS ts FROM ${tabla} ${sql}
     ORDER BY ${d.ts} ${dir}, ${d.pk} ${dir} LIMIT $${p.length + 1} OFFSET $${p.length + 2}`,
    [...p, f.limite, (f.pagina - 1) * f.limite]);
  return { tipo, pagina: f.pagina, limite: f.limite, total, paginas: Math.max(1, Math.ceil(total / f.limite)), registros: r.rows };
}

// Un registro completo (con sus datos en bruto: estado del nodo, JSON del evento, resultado de la orden...).
export async function detalle(pool, tipo, id, fuente = 'activo') {
  if (!DEF[tipo]) throw new ErrorValidacion(`tipo debe ser ${NOMBRES_TIPO.join(', ')}`);
  const d = DEF[tipo];
  if (id == null || String(id).length === 0 || String(id).length > 200) throw new ErrorValidacion('id no válido');
  const valor = d.pk === 'id' && tipo !== 'eventos' ? Number(id) : String(id);
  if (typeof valor === 'number' && !Number.isInteger(valor)) throw new ErrorValidacion('id no válido');
  const r = await pool.query(
    `SELECT *, (EXTRACT(EPOCH FROM ${d.ts}) * 1000)::bigint AS ts FROM ${nombreTabla(d, fuente === 'archivo' ? 'archivo' : 'activo')} WHERE ${d.pk} = $1`, [valor]);
  return r.rows[0] ?? null;
}

// Vista pública (CLIENTE): solo alertas confirmadas y lecturas, con campos sin información interna
// (sin IP, WiFi, término Raft, líder, órdenes ni muestras de estado).
export async function listarPublico(pool, tipo, filtros = {}) {
  if (!['alertas', 'eventos'].includes(tipo)) throw new ErrorValidacion('tipo debe ser alertas o eventos');
  const f = normalizarFiltros(tipo, { limite: filtros.limite, pagina: filtros.pagina, desde: filtros.desde, hasta: filtros.hasta, orden: 'desc' });
  const lim = Math.min(f.limite, 50);
  const where = []; const p = [];
  const fecha = DEF[tipo].ts;
  if (f.desde != null) where.push(`${fecha} >= to_timestamp($${p.push(f.desde)} / 1000.0)`);
  if (f.hasta != null) where.push(`${fecha} <= to_timestamp($${p.push(f.hasta)} / 1000.0)`);
  if (tipo === 'eventos') where.push('confirmado = true');
  const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const tabla = tipo === 'alertas' ? 'alertas' : 'eventos';
  const total = (await pool.query(`SELECT count(*) AS c FROM ${tabla} ${sql}`, p)).rows[0].c;
  const cols = tipo === 'alertas'
    ? 'alerta_id AS id, promedio, nivel, eventos'
    : 'id, nodo AS detector, nivel';
  const r = await pool.query(
    `SELECT ${cols}, (EXTRACT(EPOCH FROM ${fecha}) * 1000)::bigint AS ts FROM ${tabla} ${sql}
     ORDER BY ${fecha} DESC LIMIT $${p.length + 1} OFFSET $${p.length + 2}`, [...p, lim, (f.pagina - 1) * lim]);
  const registros = r.rows.map((x) => {
    if (tipo !== 'alertas') return x;
    const dets = [...new Set((x.eventos || []).map((id) => /^nodo-(\d)-/.exec(id)?.[1]).filter(Boolean).map(Number))].sort();
    return { id: x.id, ts: x.ts, nivel: x.nivel, promedio: x.promedio, detectores: dets };
  });
  return { tipo, pagina: f.pagina, limite: lim, total, paginas: Math.max(1, Math.ceil(total / lim)), registros };
}
