import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { crearNodoFalso } from '../fake/nodo-falso.js';
import { crearPoller } from '../poller.js';

let falsos = [];
let poller = null;

async function crearCluster() {
  falsos = [1, 2, 3].map((n) => crearNodoFalso({ n, puerto: 0 }));
  await Promise.all(falsos.map((f) => f.listo));
  return falsos;
}

function nuevoPoller(extra = {}) {
  poller = crearPoller({
    nodos: falsos.map((f) => ({ n: f.n, url: f.url })),
    intervaloMs: 30, timeoutMs: 80, ...extra,
  });
  return poller;
}

async function esperar(cond, ms = 3000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail('tiempo agotado esperando la condición');
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const llamadas = (f, prefijo) => f.peticiones.filter((p) => p.ruta.startsWith(prefijo));

// Pone al nodo 1 de líder y a los demás de seguidores suyos.
function liderEs(lider) {
  for (const f of falsos) {
    f.estado.rol = f.n === lider ? 'lider' : 'seguidor';
    f.estado.lider_conocido = lider;
  }
}

beforeEach(crearCluster);

afterEach(async () => {
  poller?.detener();
  poller = null;
  await Promise.all(falsos.map((f) => f.cerrar()));
});

test('poller: arma foto con lider y quorum', async () => {
  liderEs(1);
  nuevoPoller().iniciar();
  await esperar(() => poller.foto().lider === 1 && poller.foto().nodos.every((x) => x.alcanzable));
  const foto = poller.foto();
  assert.equal(foto.quorum, true);
  assert.equal(foto.fuente, 1);
  assert.deepEqual(foto.nodos.map((x) => x.n), [1, 2, 3]);
  assert.equal(foto.nodos[0].estado.rol, 'lider');
  assert.equal(foto.nodos[1].estado.nodo, 2);
  assert.equal(typeof foto.nodos[0].estado.uptime_ms, 'number');
  assert.equal(foto.nodos[0].fallos, 0);
});

test('poller: nodo colgado no frena a los demás', async () => {
  liderEs(1);
  nuevoPoller().iniciar();
  await esperar(() => poller.foto().nodos.every((x) => x.alcanzable));
  falsos[1].colgar(true);
  await esperar(() => !poller.foto().nodos[1].alcanzable, 1000);
  assert.ok(poller.foto().nodos[1].fallos >= 3);
  const antes1 = llamadas(falsos[0], '/estado').length;
  const antes3 = llamadas(falsos[2], '/estado').length;
  await pausa(300);
  assert.ok(llamadas(falsos[0], '/estado').length - antes1 >= 4);
  assert.ok(llamadas(falsos[2], '/estado').length - antes3 >= 4);
  // Nunca dos pedidos simultáneos al mismo nodo: el colgado no acumula pedidos cada ciclo.
  assert.ok(llamadas(falsos[1], '/estado').length < llamadas(falsos[0], '/estado').length);
  assert.equal(poller.foto().nodos[0].alcanzable, true);
  falsos[1].colgar(false);
  await esperar(() => poller.foto().nodos[1].alcanzable, 1000);
});

test('poller: pide /log solo cuando cambia log_len', async () => {
  liderEs(1);
  falsos[0].agregarEntrada({ clase: 'inicio_termino', lider: 1 });
  falsos[0].agregarEntrada({});
  nuevoPoller().iniciar();
  await esperar(() => poller.foto().log.length === 2);
  const base = llamadas(falsos[0], '/log').length;
  const ciclos = llamadas(falsos[0], '/estado').length;
  await esperar(() => llamadas(falsos[0], '/estado').length >= ciclos + 10);
  assert.equal(llamadas(falsos[0], '/log').length, base);
  assert.equal(llamadas(falsos[1], '/log').length, 0);
  assert.equal(llamadas(falsos[2], '/log').length, 0);
});

test('poller: log incremental', async () => {
  liderEs(1);
  for (let i = 0; i < 4; i++) falsos[0].agregarEntrada({});
  nuevoPoller().iniciar();
  await esperar(() => poller.foto().log.length === 4);
  for (let i = 0; i < 3; i++) falsos[0].agregarEntrada({});
  await esperar(() => poller.foto().log.length === 7);
  assert.deepEqual(poller.foto().log.map((e) => e.i), [1, 2, 3, 4, 5, 6, 7]);
  const ultima = llamadas(falsos[0], '/log').at(-1);
  assert.match(ultima.ruta, /desde=5$/);
});

test('poller: cambio de fuente recarga el log', async () => {
  liderEs(1);
  for (let i = 0; i < 5; i++) falsos[0].agregarEntrada({ clase: 'evento', ev: { id: `a${i}` } });
  for (let i = 0; i < 2; i++) falsos[2].agregarEntrada({ clase: 'evento', ev: { id: `b${i}` } });
  nuevoPoller().iniciar();
  await esperar(() => poller.foto().fuente === 1 && poller.foto().log.length === 5);
  liderEs(3);
  await esperar(() => poller.foto().fuente === 3 && poller.foto().log.length === 2);
  assert.deepEqual(poller.foto().log.map((e) => e.ev.id), ['b0', 'b1']);
  assert.ok(llamadas(falsos[2], '/log').some((p) => /desde=1$/.test(p.ruta)));
});

test('poller: sucesos de todos los nodos ordenados', async () => {
  liderEs(1);
  falsos[0].agregarSuceso({ t: 1000, tipo: 'gano', texto: 'uno' });
  falsos[1].agregarSuceso({ t: 3000, tipo: 'voto', texto: 'dos' });
  falsos[2].agregarSuceso({ t: 2000, tipo: 'postulo', texto: 'tres' });
  nuevoPoller().iniciar();
  await esperar(() => poller.foto().sucesos.length === 3);
  const s = poller.foto().sucesos;
  assert.deepEqual(s.map((x) => x.t), [3000, 2000, 1000]);
  assert.deepEqual(s.map((x) => x.n), [2, 3, 1]);
  assert.deepEqual(Object.keys(s[0]).sort(), ['n', 'seq', 't', 'termino', 'texto', 'tipo']);
  // Incremental: un suceso nuevo se pide con desde=<último seq>.
  falsos[0].agregarSuceso({ t: 4000, tipo: 'cayo', texto: 'cuatro' });
  await esperar(() => poller.foto().sucesos.length === 4);
  assert.equal(poller.foto().sucesos[0].texto, 'cuatro');
  assert.match(llamadas(falsos[0], '/sucesos').at(-1).ruta, /desde=1$/);
});

test('poller: caido=true cuenta como no disponible para quorum', async () => {
  liderEs(1);
  nuevoPoller().iniciar();
  await esperar(() => poller.foto().quorum === true);
  falsos[1].estado.caido = true;
  falsos[2].estado.caido = true;
  await esperar(() => poller.foto().nodos[1].estado?.caido && poller.foto().nodos[2].estado?.caido);
  assert.equal(poller.foto().quorum, false);
  assert.equal(poller.foto().nodos[1].alcanzable, true); // responde, pero está caído
  falsos[2].estado.caido = false;
  await esperar(() => poller.foto().quorum === true);
  // Un líder caído no es fuente ni líder.
  falsos[0].estado.caido = true;
  await esperar(() => poller.foto().lider === null);
  assert.equal(poller.foto().quorum, false);
  assert.notEqual(poller.foto().fuente, 1);
});

test('poller: sin lider la fuente es el de mayor commit_index', async () => {
  for (const f of falsos) { f.estado.rol = 'candidato'; f.estado.lider_conocido = 0; }
  falsos[1].agregarEntrada({});
  falsos[2].agregarEntrada({});
  falsos[2].agregarEntrada({});
  nuevoPoller().iniciar();
  await esperar(() => poller.foto().fuente === 3);
  assert.equal(poller.foto().lider, null);
  assert.equal(poller.foto().quorum, false);
  await esperar(() => poller.foto().log.length === 2);
});

test('poller: solo emite cambio si la foto cambió', async () => {
  liderEs(1);
  nuevoPoller();
  let cambios = 0;
  poller.on('cambio', () => { cambios += 1; });
  poller.iniciar();
  await esperar(() => poller.foto().nodos.every((x) => x.alcanzable));
  await pausa(200); // deja asentar
  const asentado = cambios;
  const ciclos = llamadas(falsos[0], '/estado').length;
  await esperar(() => llamadas(falsos[0], '/estado').length >= ciclos + 8);
  assert.equal(cambios, asentado); // uptime_ms y rssi no cuentan
  falsos[0].estado.termino = 9;
  await esperar(() => cambios > asentado);
});
