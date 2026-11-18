// Pruebas del servidor de datos (recolector + PostgreSQL). Necesitan una base: se saltan si no hay
//   TEST_DATABASE_URL=postgres://postgres:test@localhost:54329/vybra node --test test/servidor.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { crearNodoFalso } from '../fake/nodo-falso.js';
import { abrirBD, TABLAS } from '../servidor/bd.js';
import { crearRecolector } from '../servidor/recolector.js';
import { crearManejador } from '../servidor/servidor.js';

const URL_BD = process.env.TEST_DATABASE_URL;
const opts = { skip: URL_BD ? false : 'defina TEST_DATABASE_URL para probar con PostgreSQL' };

async function entorno() {
  const almacen = await abrirBD(URL_BD, { reintentos: 3, esperaMs: 200 });
  for (const t of TABLAS) await almacen.pool.query(`TRUNCATE ${t} RESTART IDENTITY`);
  const f = crearNodoFalso({ n: 2, puerto: 0 });
  await f.listo;
  const recolector = crearRecolector({ n: 2, url: f.url, almacen, intervaloMs: 50, timeoutMs: 500 });
  const cerrar = async () => { recolector.detener(); await f.cerrar(); await almacen.cerrar(); };
  return { almacen, f, recolector, cerrar };
}
const ev = (id, nodo, nivel, t) => ({ T: 1, clase: 'evento', ev: { id, nodo, nivel, pga: 0.05 * nivel, duracion_ms: 450 * nivel, t, t_lider: t + 5, recibido_por: nodo } });

test('recolector: guarda log, eventos, alertas, sucesos y muestras del ESP32 asignado, sin duplicar', opts, async () => {
  const { almacen, f, recolector, cerrar } = await entorno();
  try {
    f.estado.rol = 'seguidor'; f.estado.termino = 1;
    f.agregarSuceso({ t: 1000, tipo: 'gano', texto: 'Servidor 1 ganó', termino: 1 });
    f.agregarEntrada({ T: 1, clase: 'inicio_termino', lider: 1 });
    f.agregarEntrada(ev('nodo-2-a', 2, 5, 5000));
    f.agregarEntrada(ev('nodo-3-b', 3, 6, 6000));
    f.alertas.push({ id: 3, promedio: 5.5, nivel: 'media', eventos: ['nodo-3-b', 'nodo-2-a'], termino: 1, lider: 1 });
    await recolector.ciclo();
    await recolector.ciclo();     // segunda vuelta: no debe duplicar nada
    const c = (await almacen.info()).conteos;
    assert.equal(c.log_entradas, 3);
    assert.equal(c.eventos, 2);
    assert.equal(c.alertas, 1);
    assert.equal(c.sucesos, 1);
    assert.ok(c.muestras >= 1);
    const evs = await almacen.leer('eventos');
    assert.deepEqual(evs.map((e) => e.id).sort(), ['nodo-2-a', 'nodo-3-b']);
    assert.equal(Number(evs.find((e) => e.id === 'nodo-2-a').nivel), 5);
  } finally { await cerrar(); }
});

test('recolector: lo pendiente se marca confirmado cuando la mayoría lo acepta', opts, async () => {
  const { almacen, f, recolector, cerrar } = await entorno();
  try {
    f.agregarEntrada({ T: 1, clase: 'inicio_termino', lider: 1 });
    f.agregarEntrada(ev('nodo-2-a', 2, 5, 5000));
    f.estado.commit_index = 1;                       // el evento (índice 2) aún no está confirmado
    await recolector.ciclo();
    assert.equal((await almacen.leer('eventos'))[0].confirmado, false);
    f.estado.commit_index = 2;                       // ahora sí
    await recolector.ciclo();
    assert.equal((await almacen.leer('eventos'))[0].confirmado, true);
    assert.equal((await almacen.info()).conteos.eventos, 1);
  } finally { await cerrar(); }
});

test('recolector: nodo caído queda registrado como muestra no alcanzable', opts, async () => {
  const { almacen, f, recolector, cerrar } = await entorno();
  try {
    await recolector.ciclo();
    await f.cerrar();
    await recolector.ciclo();
    await recolector.ciclo();                        // no repite la muestra mientras siga caído
    const m = await almacen.leer('muestras');
    assert.equal(m.filter((x) => x.alcanzable === false).length, 1);
    assert.equal(recolector.estado().alcanzable, false);
  } finally { recolector.detener(); await almacen.cerrar(); }
});

test('API del servidor: /info, /api/historial y POST /acciones', opts, async () => {
  const { almacen, f, recolector, cerrar } = await entorno();
  const srv = http.createServer(crearManejador({ n: 2, nodoUrl: f.url, almacen, recolector, sistema: 'Sistema de prueba' }));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    f.agregarEntrada(ev('nodo-2-a', 2, 5, 5000));
    await recolector.ciclo();
    let r = await fetch(`${base}/info`);
    const info = await r.json();
    assert.equal(info.servidor, 2);
    assert.equal(info.sistema, 'Sistema de prueba');
    assert.equal(info.nodo.alcanzable, true);
    assert.equal(info.bd.ok, true);
    assert.equal(info.bd.conteos.eventos, 1);
    r = await fetch(`${base}/api/historial?tipo=eventos&limite=5`);
    assert.equal((await r.json()).registros[0].id, 'nodo-2-a');
    r = await fetch(`${base}/api/historial?tipo=nada`);
    assert.equal(r.status, 400);
    const post = (cuerpo, tipo = 'application/json') => fetch(`${base}/acciones`, { method: 'POST', headers: { 'Content-Type': tipo }, body: JSON.stringify(cuerpo) });
    r = await post({ tipo: 'pulsar', parametros: { ms: 900 }, estado_http: 200, resultado: { resultado: 'aceptada' }, origen: 'admin' });
    assert.equal(r.status, 201);
    assert.equal((await post({ sin: 'tipo' })).status, 400);
    assert.equal((await post({ tipo: 'x' }, 'text/plain')).status, 415);
    const acc = (await (await fetch(`${base}/api/historial?tipo=acciones`)).json()).registros;
    assert.equal(acc.length, 1);
    assert.equal(acc[0].tipo, 'pulsar');
    assert.equal(acc[0].nodo, 2);
    assert.equal((await fetch(`${base}/salud`)).status, 200);
  } finally { await new Promise((r) => srv.close(r)); await cerrar(); }
});
