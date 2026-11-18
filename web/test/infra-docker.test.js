// Integración REAL con Docker: apagar y encender cada uno de los 3 servidores desde la API del panel y comprobar
// en Docker y en Raft que lo que se dice que ocurre ocurre de verdad. Se ejecuta con:  npm run test:infra
// (levanta un proyecto de compose aislado "vybraint"; sin PANEL_URL se omite).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const PANEL = process.env.PANEL_URL;
const PREFIJO = process.env.PREFIJO || 'vybraint';
const PROYECTO = process.env.COMPOSE_PROJECT_NAME || PREFIJO;
const exigir = process.env.REQUIRE_INFRA === '1';
const opts = { skip: PANEL || exigir ? false : 'defina PANEL_URL o ejecute npm run test:infra', timeout: 600000 };
const sh = promisify(execFile);

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperar(cond, { ms = 45000, cada = 500, msg = 'condición', diag = null } = {}) {
  const fin = Date.now() + ms;
  let ultimo;
  while (Date.now() < fin) {
    try { const v = await cond(); if (v) return v; } catch (e) { ultimo = e; }
    await dormir(cada);
  }
  let extra = '';
  if (diag) { try { extra = ` · estado: ${await diag()}`; } catch { /* sin diagnóstico */ } }
  assert.fail(`tiempo agotado esperando: ${msg}${ultimo ? ` (${ultimo.message})` : ''}${extra}`);
}
const get = async (ruta) => (await fetch(PANEL + ruta, { cache: 'no-store' })).json();
const post = async (ruta, cuerpo, cab = {}) => {
  const r = await fetch(PANEL + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cab }, body: JSON.stringify(cuerpo) });
  return { status: r.status, cuerpo: await r.json().catch(() => null) };
};
const foto = () => get('/api/estado');
const accion = (n, a) => post(`/api/infra/servidores/${n}/${a}`, { confirmar: true });
const pulsar = (n, ms = 900) => post(`/api/nodos/${n}/pulsar`, { ms });

// Verificación INDEPENDIENTE del controlador: se pregunta a Docker directamente (solo lectura, argumentos fijos).
async function corriendo(servicio, n) {
  try {
    const { stdout } = await sh('docker', ['inspect', '-f', '{{.State.Running}}', `${PREFIJO}-${servicio}-${n}`]);
    return stdout.trim() === 'true';
  } catch { return false; }
}
async function volumenExiste(n) {
  const { stdout } = await sh('docker', ['volume', 'ls', '-q', '--filter', `label=com.docker.compose.project=${PROYECTO}`, '--filter', `name=sismo-db${n}`]);
  return stdout.trim().length > 0;
}
const estadoNodo = (f, n) => f.nodos.find((x) => x.n === n);
const vivos = (f) => f.nodos.filter((x) => x.alcanzable && x.estado && !x.estado.caido).map((x) => x.n);
const eventosDb = async (servidor, extra = '') => (await get(`/api/historial?tipo=eventos&servidor=${servidor}&limite=200${extra}`));

async function todoEncendido() {
  for (const n of [1, 2, 3]) {
    assert.equal(await corriendo('nodo', n), true, `nodo ${n}`);
    assert.equal(await corriendo('servidor', n), true, `servidor ${n}`);
    assert.equal(await corriendo('db', n), true, `db ${n}`);
  }
}
async function clusterEstable(ms = 60000) {
  return esperar(async () => {
    const f = await foto();
    const ok = f.quorum && f.lider && vivos(f).length === 3 && f.nodos.every((x) => x.estado.situacion === 'funcionando' && x.estado.log_len === x.estado.commit_index && x.estado.log_len === f.nodos[0].estado.log_len);
    return ok ? f : false;
  }, { ms, msg: 'clúster de 3 nodos estable y sincronizado' });
}

test('0. El stack aislado está encendido, con Raft real, quórum y sin exponer Docker', opts, async () => {
  const inf = await esperar(async () => { const i = await get('/api/infra'); return i.disponible && i.servidores.every((s) => s.servidor.corriendo && s.bd.corriendo) ? i : false; }, { ms: 120000, msg: 'controlador y servidores arriba' });
  assert.deepEqual(inf.servidores.map((s) => s.modo), ['simulado', 'simulado', 'simulado']);
  await todoEncendido();
  const f = await clusterEstable(90000);
  assert.ok([1, 2, 3].includes(f.lider));
  // Las bases tienen volumen propio
  for (const n of [1, 2, 3]) assert.equal(await volumenExiste(n), true, `volumen de la base ${n}`);
  // El controlador no se publica: no hay puerto de host que lo alcance (8200 es solo de la red interna)
  await assert.rejects(fetch('http://127.0.0.1:8200/estado', { signal: AbortSignal.timeout(1500) }));
  // Docker no se expone por el panel: ninguna ruta devuelve contenedores ni acepta nombres/ids/comandos
  for (const [m, u] of [['GET', '/containers/json'], ['POST', '/api/infra/servidores/db1/apagar'], ['POST', '/api/infra/servidores/4/apagar'], ['POST', '/api/infra/servidores/1/borrar'], ['POST', '/api/infra/exec']]) {
    const r = await fetch(PANEL + u, m === 'GET' ? { method: m } : { method: m, headers: { 'Content-Type': 'application/json' }, body: '{"confirmar":true}' });
    assert.equal(r.status, 404, `${m} ${u}`);
  }
  assert.equal((await post('/api/infra/servidores/1/apagar', {})).status, 400);                                 // sin confirmación explícita
  assert.equal((await post('/api/infra/servidores/1/apagar', { confirmar: true }, { Origin: 'http://malo.example' })).status, 403);
  await todoEncendido();                                                                                       // nada de lo anterior apagó algo
});

for (const n of [1, 2, 3]) {
  test(`${n}. Apagar y encender el Servidor ${n}: solo cae lo suyo, Raft lo detecta y se reincorpora sincronizado`, opts, async () => {
    const antes = await clusterEstable();
    const lideraba = antes.lider === n;
    const otros = [1, 2, 3].filter((x) => x !== n);
    // Algo guardado en su base ANTES de apagar (una pulsación confirmada por la mayoría)
    const p0 = await pulsar(otros[0]);
    assert.equal(p0.status, 200);
    const previosDb = await esperar(async () => { const e = await eventosDb(n); return e.total >= 1 ? e.total : false; }, { msg: `evento guardado en la base ${n}` });

    // ---- APAGAR
    const r = await accion(n, 'apagar');
    assert.equal(r.status, 200, JSON.stringify(r.cuerpo));
    assert.equal(r.cuerpo.modo, 'simulado');
    assert.deepEqual(r.cuerpo.controlador.detenidos, [`nodo${n}`, `servidor${n}`]);
    assert.equal(await corriendo('nodo', n), false, 'su ESP32 simulado se detuvo');
    assert.equal(await corriendo('servidor', n), false, 'su servidor de datos se detuvo');
    for (const k of otros) { assert.equal(await corriendo('nodo', k), true); assert.equal(await corriendo('servidor', k), true); }
    for (const k of [1, 2, 3]) { assert.equal(await corriendo('db', k), true, `la base ${k} sigue encendida`); assert.equal(await volumenExiste(k), true, `volumen ${k} conservado`); }

    // Raft detecta la caída REAL y mantiene el clúster con los otros dos
    const f1 = await esperar(async () => {
      const f = await foto();
      const nn = estadoNodo(f, n);
      return !nn.alcanzable && f.quorum && f.lider && f.lider !== n && vivos(f).length === 2 && vivos(f).every((x) => x !== n) ? f : false;
    }, { ms: 45000, msg: `Raft detecta la caída del nodo ${n} y mantiene líder y quórum` });
    if (lideraba) assert.ok(f1.nodos.find((x) => x.n === f1.lider).estado.termino > antes.nodos[0].estado.termino - 1 && f1.lider !== n, 'elección: nuevo líder distinto del caído');
    // con 2 de 3 SÍ se confirman operaciones (mayoría)
    const idsAntes = Object.fromEntries(otros.map((k) => [k, estadoNodo(f1, k).estado.commit_index]));
    const p1 = await pulsar(otros[1]);
    assert.equal(p1.status, 200);
    await esperar(async () => { const f = await foto(); return otros.every((k) => estadoNodo(f, k).estado.commit_index > idsAntes[k]); }, { msg: 'con 2 de 3 el evento se confirma' });
    // las otras dos bases siguen guardando; la del servidor apagado no responde (no se inventa)
    const inf = await get('/api/servidores');
    assert.equal(inf.servidores.find((s) => s.n === n).alcanzable, false);
    assert.equal(inf.servidores.filter((s) => s.n !== n).every((s) => s.alcanzable && s.bd.ok), true);

    // ---- ENCENDER
    const e = await accion(n, 'encender');
    assert.equal(e.status, 200, JSON.stringify(e.cuerpo));
    assert.deepEqual(e.cuerpo.controlador.iniciados, [`nodo${n}`, `servidor${n}`]);
    for (const s of ['nodo', 'servidor', 'db']) assert.equal(await corriendo(s, n), true, `${s} ${n} encendido`);
    const f2 = await clusterEstable(90000);                                      // 3 nodos, mismo log, todos "funcionando"
    assert.equal(vivos(f2).length, 3);
    assert.equal(estadoNodo(f2, n).estado.rol === 'lider' || estadoNodo(f2, n).estado.rol === 'seguidor', true);
    // el nodo se sincronizó de verdad: tiene el mismo log (incluido lo ocurrido mientras estuvo apagado)
    assert.equal(estadoNodo(f2, n).estado.log_len, estadoNodo(f2, otros[0]).estado.log_len);
    // su base conservó lo anterior y vuelve a guardar lo nuevo
    const despues = await esperar(async () => { const e2 = await eventosDb(n); return e2.total >= previosDb + 1 ? e2 : false; }, { ms: 60000, msg: `la base ${n} conserva lo anterior y se pone al día` });
    assert.ok(despues.total >= previosDb);
    await todoEncendido();
  });
}

test('4. Pérdida de quórum: con 1 de 3 no se confirma nada; al volver la mayoría se confirma y todo se recupera', opts, async () => {
  await clusterEstable();
  // se apagan dos servidores (1 y 2): queda solo el nodo 3
  assert.equal((await accion(1, 'apagar')).status, 200);
  assert.equal((await accion(2, 'apagar')).status, 200);
  assert.equal(await corriendo('nodo', 3), true);
  for (const k of [1, 2, 3]) assert.equal(await corriendo('db', k), true, 'las tres bases siguen encendidas');
  const sin = await esperar(async () => { const f = await foto(); return f.quorum === false && vivos(f).length === 1 ? f : false; }, { ms: 45000, msg: 'el panel detecta que no hay quórum', diag: async () => JSON.stringify({ quorum: (await foto()).quorum, lider: (await foto()).lider, nodos: (await foto()).nodos.map((x) => ({ n: x.n, alc: x.alcanzable, rol: x.estado?.rol, caido: x.estado?.caido, lc: x.estado?.lider_conocido })) }) });
  assert.equal(sin.quorum, false);
  // una operación que exige mayoría NO se confirma: el nodo la deja pendiente / sin commit
  const commit0 = estadoNodo(sin, 3).estado.commit_index;
  const p = await pulsar(3);
  assert.equal(p.status, 200);
  assert.notEqual(p.cuerpo.resultado, 'confirmada');                      // el nodo nunca dice "confirmada": solo aceptada/pendiente
  await dormir(7000);
  const aun = estadoNodo(await foto(), 3).estado;
  assert.equal(aun.commit_index, commit0, 'sin mayoría el índice de confirmación no avanza');
  assert.ok(aun.log_len > aun.commit_index || aun.pendientes > 0, `el evento sigue sin confirmar (respuesta ${JSON.stringify(p.cuerpo)}; estado ${JSON.stringify({ rol: aun.rol, termino: aun.termino, log_len: aun.log_len, commit: aun.commit_index, pend: aun.pendientes })})`);
  const s3 = (await get('/api/servidores')).servidores.find((s) => s.n === 3);
  assert.equal(s3.alcanzable, true, `el servidor de datos 3 debe seguir respondiendo (su ESP32 sigue vivo): ${JSON.stringify(s3)}`);

  // vuelve UNA parte de la mayoría: se enciende el servidor 2 → 2 de 3, hay quórum y se elige líder
  assert.equal((await accion(2, 'encender')).status, 200);
  const con = await esperar(async () => { const f = await foto(); return f.quorum && f.lider && vivos(f).length === 2 ? f : false; }, { ms: 60000, msg: 'se recupera el quórum con 2 nodos' });
  assert.ok([2, 3].includes(con.lider));
  // el evento que estaba pendiente termina confirmado por la mayoría
  await esperar(async () => { const f = await foto(); return f.nodos.filter((x) => x.alcanzable).every((x) => x.estado.commit_index === x.estado.log_len && x.estado.log_len > commit0); }, { ms: 60000, msg: 'el evento pendiente se confirma al volver la mayoría' });
  // y se vuelve a un clúster completo
  assert.equal((await accion(1, 'encender')).status, 200);
  const fin = await clusterEstable(90000);
  assert.equal(vivos(fin).length, 3);
  await todoEncendido();
});
