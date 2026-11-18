// Política de retención y archivado de un servidor de datos. Por defecto NO hace nada: ni elimina ni archiva.
//
// Categorías y qué se puede hacer con cada una:
//  - Eventos sísmicos críticos (nivel ≥ RETENCION_CRITICO_NIVEL o que forman parte de una alerta): NUNCA se tocan.
//  - Alertas: nunca se eliminan automáticamente; con RETENCION_ALERTAS_DIAS solo se ARCHIVAN.
//  - Eventos no críticos (RETENCION_EVENTOS_DIAS), y registros técnicos: muestras (…_MUESTRAS_DIAS), sucesos Raft
//    (…_SUCESOS_DIAS), entradas de log que no son eventos (…_LOG_DIAS) y pruebas/órdenes (…_ACCIONES_DIAS).
// 0 días = se conserva para siempre. Modo: "archivar" (mueve a las tablas archivo_*, sigue consultable con fuente=archivo)
// o "eliminar" (borra de verdad: exige RETENCION_CONFIRMAR_ELIMINAR=si).

const CATEGORIAS = ['muestras', 'sucesos', 'log', 'acciones', 'eventos', 'alertas'];

export function leerRetencion(env = process.env) {
  const errores = [];
  const dias = {};
  const nombres = { muestras: 'MUESTRAS', sucesos: 'SUCESOS', log: 'LOG', acciones: 'ACCIONES', eventos: 'EVENTOS', alertas: 'ALERTAS' };
  for (const c of CATEGORIAS) {
    const v = env[`RETENCION_${nombres[c]}_DIAS`];
    if (v == null || v === '') { dias[c] = 0; continue; }
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 36500) { errores.push(`RETENCION_${nombres[c]}_DIAS debe ser un entero de 0 a 36500`); dias[c] = 0; } else dias[c] = n;
  }
  const modo = (env.RETENCION_MODO || 'archivar').toLowerCase();
  if (!['archivar', 'eliminar'].includes(modo)) errores.push('RETENCION_MODO debe ser archivar o eliminar');
  const criticoNivel = env.RETENCION_CRITICO_NIVEL ? Number(env.RETENCION_CRITICO_NIVEL) : 6;
  if (!Number.isInteger(criticoNivel) || criticoNivel < 1 || criticoNivel > 10) errores.push('RETENCION_CRITICO_NIVEL debe ser un entero de 1 a 10');
  const cadaHoras = env.RETENCION_CADA_HORAS ? Number(env.RETENCION_CADA_HORAS) : 24;
  if (!(cadaHoras >= 1 && cadaHoras <= 720)) errores.push('RETENCION_CADA_HORAS debe estar entre 1 y 720');
  const confirmarEliminar = String(env.RETENCION_CONFIRMAR_ELIMINAR || '').toLowerCase() === 'si';
  let activa = String(env.RETENCION_ACTIVA || '').toLowerCase() === 'si';
  if (activa && modo === 'eliminar' && !confirmarEliminar) {
    errores.push('RETENCION_MODO=eliminar exige RETENCION_CONFIRMAR_ELIMINAR=si; la retención queda DESACTIVADA');
    activa = false;
  }
  if (errores.length) activa = false;
  return { activa, modo: ['archivar', 'eliminar'].includes(modo) ? modo : 'archivar', confirmarEliminar, dias, criticoNivel, cadaHoras, errores };
}

// Predicado SQL de cada categoría ($1 = fecha de corte, $2 = nivel crítico). Los críticos quedan siempre fuera.
const NO_CRITICO_EVENTO = `nivel < $2 AND NOT EXISTS (SELECT 1 FROM alertas a WHERE eventos.id = ANY(a.eventos))`;
const PRED = {
  muestras: { tabla: 'muestras', where: 't < $1' },
  sucesos: { tabla: 'sucesos', where: 'COALESCE(to_timestamp(t_ms / 1000.0), guardado) < $1' },
  log: { tabla: 'log_entradas', where: "clase <> 'evento' AND guardado < $1" },
  acciones: { tabla: 'acciones', where: 't < $1' },
  eventos: { tabla: 'eventos', where: `COALESCE(to_timestamp(t_ms / 1000.0), guardado) < $1 AND ${NO_CRITICO_EVENTO}` },
  alertas: { tabla: 'alertas', where: 'guardado < $1' },
};
// Las entradas de log de un evento no crítico se archivan/eliminan junto con él.
const PRED_LOG_EVENTO = {
  tabla: 'log_entradas',
  where: `clase = 'evento' AND guardado < $1 AND (datos->'ev'->>'nivel')::int < $2 AND NOT EXISTS (SELECT 1 FROM alertas a WHERE (datos->'ev'->>'id') = ANY(a.eventos))`,
};

const corte = (dias) => new Date(Date.now() - dias * 86400000);
// Cada predicado usa $1 (corte) y, solo los de eventos, también $2 (nivel crítico).
const argsDe = (p, dias, nivel) => (p.where.includes('$2') ? [corte(dias), nivel] : [corte(dias)]);

// Qué se vería afectado si se aplicara ahora. No modifica nada.
export async function planificar(pool, cfg) {
  const plan = {};
  for (const c of CATEGORIAS) {
    const dias = cfg.dias[c];
    if (!dias) { plan[c] = { dias: 0, afectados: 0, accion: 'conservar' }; continue; }
    const p = PRED[c];
    const n = (await pool.query(`SELECT count(*) AS n FROM ${p.tabla} WHERE ${p.where}`, argsDe(p, dias, cfg.criticoNivel))).rows[0].n;
    plan[c] = { dias, afectados: n, accion: c === 'alertas' || cfg.modo === 'archivar' ? 'archivar' : 'eliminar' };
  }
  return plan;
}

async function mover(pool, p, args, archivar) {
  let total = 0;
  for (;;) {
    const sql = archivar
      ? `WITH movidas AS (DELETE FROM ${p.tabla} WHERE ctid IN (SELECT ctid FROM ${p.tabla} WHERE ${p.where} LIMIT 5000) RETURNING *)
         INSERT INTO archivo_${p.tabla} SELECT * FROM movidas`
      : `DELETE FROM ${p.tabla} WHERE ctid IN (SELECT ctid FROM ${p.tabla} WHERE ${p.where} LIMIT 5000)`;
    const r = await pool.query(sql, args);
    total += r.rowCount;
    if (r.rowCount < 5000) return total;
  }
}

// Aplica la política. Solo actúa si cfg.activa (configuración explícita); si no, no toca nada.
export async function aplicar(pool, cfg) {
  if (!cfg.activa) return { aplicada: false, motivo: 'retención desactivada', movidos: {} };
  const movidos = {};
  for (const c of CATEGORIAS) {
    const dias = cfg.dias[c];
    if (!dias) continue;
    const archivar = c === 'alertas' || cfg.modo === 'archivar';   // las alertas nunca se eliminan automáticamente
    movidos[c] = await mover(pool, PRED[c], argsDe(PRED[c], dias, cfg.criticoNivel), archivar);
    if (c === 'eventos') movidos.log_de_eventos = await mover(pool, PRED_LOG_EVENTO, argsDe(PRED_LOG_EVENTO, dias, cfg.criticoNivel), archivar);
  }
  return { aplicada: true, modo: cfg.modo, movidos };
}
