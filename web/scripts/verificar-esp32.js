#!/usr/bin/env node
// Comprueba que cada ESP32 (real o simulado) responde con el contrato HTTP que esperan los servidores de datos
// y el panel: GET /estado, /log?desde=1, /sucesos?desde=0 y /alertas. No escribe nada en los nodos.
//   node scripts/verificar-esp32.js                      (usa NODO1_URL, NODO2_URL, NODO3_URL del entorno)
//   node scripts/verificar-esp32.js http://IP1 http://IP2 http://IP3
const urls = process.argv.length > 2
  ? process.argv.slice(2)
  : [1, 2, 3].map((n) => process.env[`NODO${n}_URL`] || process.env[`IP${n}`] && `http://${process.env[`IP${n}`]}`).filter(Boolean);
if (!urls.length) { console.error('Indica las URL de los ESP32 como argumentos o con NODO1_URL, NODO2_URL y NODO3_URL.'); process.exit(2); }

const pedir = async (base, ruta) => {
  const r = await fetch(base + ruta, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`${ruta}: HTTP ${r.status}`);
  return r.json();
};
const faltan = (o, claves) => claves.filter((k) => !(k in o));

let mal = 0;
for (const [i, url0] of urls.entries()) {
  const n = i + 1;
  const base = url0.replace(/\/+$/, '');
  const problemas = [];
  try {
    const e = await pedir(base, '/estado');
    problemas.push(...faltan(e, ['nodo', 'rol', 'caido', 'termino', 'log_len', 'commit_index', 'pendientes', 'sucesos_seq']).map((k) => `/estado sin "${k}"`));
    if (e.nodo !== n) problemas.push(`/estado dice nodo=${e.nodo} pero está en la posición ${n}: revisa el orden de NODO1_URL, NODO2_URL y NODO3_URL`);
    const l = await pedir(base, '/log?desde=1');
    if (!Array.isArray(l.entradas)) problemas.push('/log sin "entradas"');
    else for (const x of l.entradas.slice(0, 50)) { const f = faltan(x, ['i', 'T', 'clase']); if (f.length) { problemas.push(`entrada de log sin ${f.join(', ')}`); break; } }
    const s = await pedir(base, '/sucesos?desde=0');
    if (!Array.isArray(s.sucesos)) problemas.push('/sucesos sin "sucesos"');
    const a = await pedir(base, '/alertas');
    if (!Array.isArray(a.alertas)) problemas.push('/alertas sin "alertas"');
    console.log(`${problemas.length ? '✖' : '✔'} nodo ${n} ${base}  rol=${e.rol} término=${e.termino} log=${e.log_len}/${e.commit_index} sucesos=${e.sucesos_seq}${e.ip ? ` ip=${e.ip}` : ''}`);
  } catch (err) {
    problemas.push(`no responde: ${err.message}`);
    console.log(`✖ nodo ${n} ${base}`);
  }
  for (const p of problemas) console.log(`    - ${p}`);
  if (problemas.length) mal++;
}
console.log(mal ? `\n${mal} nodo(s) con problemas.` : '\nTodos los nodos cumplen el contrato.');
process.exit(mal ? 1 : 0);
