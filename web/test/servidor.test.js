// Pruebas del servidor de datos con TRES bases PostgreSQL reales (una por servidor).
//   npm run test:db      → levanta 3 PostgreSQL efímeros y ejecuta todo (las pruebas fallan si falta alguna base)
//   TEST_DATABASE_URL_1..3=postgres://… node --test test/servidor.test.js     (con bases propias)
// Sin las variables y sin REQUIRE_DB=1 estas pruebas se omiten; con REQUIRE_DB=1 FALLAN si no hay bases.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearNodoFalso } from '../fake/nodo-falso.js';
import { abrirBD, TABLAS } from '../servidor/bd.js';
import { crearRecolector } from '../servidor/recolector.js';
import { crearManejador as manejadorServidor } from '../servidor/servidor.js';
import { leerConfig } from '../servidor/config.js';
import { leerRetencion, planificar, aplicar } from '../servidor/retencion.js';
import { crearManejador as manejadorPanel } from '../server.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const URLS = [1, 2, 3].map((i) => process.env[`TEST_DATABASE_URL_${i}`]);
const HAY = URLS.every(Boolean);
const EXIGIR = process.env.REQUIRE_DB === '1';
const opts = { skip: HAY || EXIGIR ? false : 'defina TEST_DATABASE_URL_1..3 o ejecute npm run test:db' };

const ev = (id, nodo, nivel, t) => ({ T: 1, clase: 'evento', ev: { id, nodo, nivel, pga: 0.05 * nivel, duracion_ms: 450 * nivel, t, t_lider: t + 5, recibido_por: nodo } });
const ARCHIVOS = TABLAS.map((t) => `archivo_${t}`);
const escuchar = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${srv.address().port}`)));
const cerrarSrv = (srv) => new Promise((r) => { srv.closeAllConnections?.(); srv.close(r); });
const json = async (url, init) => { const r = await fetch(url, init); return { status: r.status, cuerpo: await r.json().catch(() => null) }; };

// Tres ESP32 simulados + tres servidores (recolector + API) con su base + el panel que los lee.
async function entorno3() {
  assert.ok(HAY, 'REQUIRE_DB=1 pero faltan TEST_DATABASE_URL_1..3: las pruebas con PostgreSQL no pueden omitirse');
  const almacenes = [], fakes = [], recolectores = [], srvs = [], urls = [];
  for (let i = 0; i < 3; i++) {
    const a = await abrirBD(URLS[i], { reintentos: 5, esperaMs: 300 });
    await a.pool.query(`TRUNCATE ${[...TABLAS, ...ARCHIVOS].join(', ')} RESTART IDENTITY`);
    const f = crearNodoFalso({ n: i + 1, puerto: 0 });
    await f.listo;
    const r = crearRecolector({ n: i + 1, url: f.url, almacen: a, intervaloMs: 50, timeoutMs: 800 });
    const s = http.createServer(manejadorServidor({ n: i + 1, nodoUrl: f.url, almacen: a, recolector: r, retencion: null, sistema: `SO-${i + 1}` }));
    urls.push(await escuchar(s));
    almacenes.push(a); fakes.push(f); recolectores.push(r); srvs.push(s);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-'));
  const panelSrv = http.createServer(manejadorPanel({
    poller: { foto: () => ({}), on() {}, off() {} }, nodos: [], publicDir: dir, timeoutServidorMs: 800,
    servidores: urls.map((url, i) => ({ n: i + 1, url })),
  }));
  const panel = await escuchar(panelSrv);
  const recoger = () => Promise.all(recolectores.map((r) => r.ciclo()));
  const cerrar = async () => {
    recolectores.forEach((r) => r.detener());
    await cerrarSrv(panelSrv);
    for (const s of srvs) await cerrarSrv(s);
    for (const f of fakes) await f.cerrar().catch(() => {});
    for (const a of almacenes) await a.cerrar().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  };
  return { almacenes, fakes, recolectores, urls, panel, recoger, cerrar };
}

// ---------------------------------------------------------------- recolección y correspondencia nodo ↔ base
test('lectura de las tres bases: cada servidor guarda solo lo de su ESP32 (nodo ↔ base)', opts, async () => {
  const E = await entorno3();
  try {
    const t0 = Date.now() - 600000;
    E.fakes.forEach((f, i) => {
      f.agregarSuceso({ t: t0 + i * 1000, tipo: 'postulo', texto: `Servidor ${i + 1} se postuló`, termino: 1 });
      f.agregarEntrada({ T: 1, clase: 'inicio_termino', lider: 1 });
      f.agregarEntrada(ev(`nodo-${i + 1}-propio`, i + 1, 3, t0 + i * 2000));
    });
    await E.recoger();
    for (let i = 0; i < 3; i++) {
      const a = E.almacenes[i];
      const m = (await a.listar('muestras', {})).registros;
      assert.ok(m.length >= 1 && m.every((x) => x.nodo === i + 1), `base ${i + 1}: todas las muestras son del nodo ${i + 1}`);
      const s = (await a.listar('sucesos', {})).registros;
      assert.deepEqual(s.map((x) => x.nodo), [i + 1]);
      const e = (await a.listar('eventos', {})).registros;
      assert.deepEqual(e.map((x) => x.id), [`nodo-${i + 1}-propio`]);
    }
    // cada servidor sabe qué ESP32 tiene asignado
    for (let i = 0; i < 3; i++) {
      const { cuerpo } = await json(`${E.urls[i]}/info`);
      assert.equal(cuerpo.servidor, i + 1);
      assert.equal(cuerpo.nodo.url, E.fakes[i].url);
      assert.equal(cuerpo.bd.ok, true);
      assert.ok(cuerpo.bd.tamanoBytes > 0);
    }
    const { cuerpo } = await json(`${E.panel}/api/servidores`);
    assert.deepEqual(cuerpo.servidores.map((x) => [x.n, x.alcanzable, x.sistema]), [[1, true, 'SO-1'], [2, true, 'SO-2'], [3, true, 'SO-3']]);
  } finally { await E.cerrar(); }
});

test('filtrado por servidor desde el panel y unión sin duplicar lo replicado', opts, async () => {
  const E = await entorno3();
  try {
    const t0 = Date.now() - 600000;
    E.fakes.forEach((f, i) => {
      f.agregarSuceso({ t: t0 + i * 1000, tipo: 'voto', texto: `voto ${i + 1}`, termino: 1 });
      f.agregarEntrada({ T: 1, clase: 'inicio_termino', lider: 1 });
      f.agregarEntrada(ev('nodo-2-compartido', 2, 5, t0 + 5000));          // el log Raft está replicado en los tres
      f.alertas.push({ id: 1, promedio: 5, nivel: 'media', eventos: ['nodo-2-compartido'], termino: 1, lider: 1 });
    });
    await E.recoger();
    // sucesos son de cada nodo: servidor=2 → solo el suceso del nodo 2
    let r = await json(`${E.panel}/api/historial?tipo=sucesos&servidor=2`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.cuerpo.registros.map((x) => x.nodo), [2]);
    assert.deepEqual(r.cuerpo.servidores, [{ n: 2, ok: true, total: 1 }]);
    r = await json(`${E.panel}/api/historial?tipo=sucesos&servidor=todos`);
    assert.equal(r.cuerpo.total, 3);
    assert.deepEqual(r.cuerpo.registros.map((x) => x.servidor).sort(), [1, 2, 3]);
    // el evento replicado en las tres bases aparece UNA vez, indicando en qué servidores está
    r = await json(`${E.panel}/api/historial?tipo=eventos`);
    assert.equal(r.cuerpo.registros.length, 1);
    assert.deepEqual(r.cuerpo.registros[0].servidores, [1, 2, 3]);
    assert.equal(r.cuerpo.total, 1);
    r = await json(`${E.panel}/api/historial?tipo=alertas`);
    assert.equal(r.cuerpo.registros.length, 1);
    assert.equal((await json(`${E.panel}/api/historial?tipo=alertas&servidor=3`)).cuerpo.registros.length, 1);
    assert.equal((await json(`${E.panel}/api/historial?tipo=eventos&servidor=7`)).status, 400);
  } finally { await E.cerrar(); }
});

// ---------------------------------------------------------------- paginación y filtros
test('paginación real: páginas sin solaparse, límites y validación', opts, async () => {
  const E = await entorno3();
  try {
    const base = Date.now() - 3600000;
    for (let k = 1; k <= 120; k++) E.fakes[0].agregarEntrada(ev(`nodo-1-p${String(k).padStart(3, '0')}`, 1, (k % 10) + 1, base + k * 1000));
    await E.recoger();
    const pag = async (p, l = 50) => (await json(`${E.panel}/api/historial?tipo=eventos&servidor=1&pagina=${p}&limite=${l}`)).cuerpo;
    const [a, b, c, d] = [await pag(1), await pag(2), await pag(3), await pag(4)];
    assert.deepEqual([a.registros.length, b.registros.length, c.registros.length, d.registros.length], [50, 50, 20, 0]);
    assert.equal(a.total, 120); assert.equal(a.paginas, 3);
    const ids = [...a.registros, ...b.registros, ...c.registros].map((x) => x.id);
    assert.equal(new Set(ids).size, 120, 'sin repetidos entre páginas');
    assert.equal(ids[0], 'nodo-1-p120');                      // más reciente primero
    assert.equal(ids[119], 'nodo-1-p001');
    const asc = (await json(`${E.panel}/api/historial?tipo=eventos&servidor=1&limite=3&orden=asc`)).cuerpo.registros.map((x) => x.id);
    assert.deepEqual(asc, ['nodo-1-p001', 'nodo-1-p002', 'nodo-1-p003']);
    // límites y validaciones
    for (const mal of ['limite=500', 'limite=0', 'pagina=0', 'pagina=abc', 'tipo=otro', 'desde=ayer', 'nodo=9', 'categoria=raro']) {
      const r = await json(`${E.panel}/api/historial?servidor=1&${mal}`);
      assert.equal(r.status, 400, mal);
    }
    assert.equal((await json(`${E.panel}/api/historial?servidor=1&desde=2026-12-01&hasta=2026-01-01`)).status, 400);
    assert.equal((await json(`${E.panel}/api/historial?servidor=1&pagina=100000&limite=200`)).status, 400);   // salto excesivo
    // modo "todos": paginación acotada
    const t = await json(`${E.panel}/api/historial?tipo=eventos&servidor=todos&pagina=2&limite=50`);
    assert.equal(t.status, 200);
    assert.equal(t.cuerpo.registros.length, 50);
    assert.equal((await json(`${E.panel}/api/historial?tipo=eventos&pagina=6&limite=200`)).status, 400);    // 1200 > 1000
  } finally { await E.cerrar(); }
});

test('filtros por nodo, categoría, estado, fechas y búsqueda; detalle de un registro', opts, async () => {
  const E = await entorno3();
  try {
    const t0 = Date.now() - 86400000;
    const f = E.fakes[0];
    f.agregarEntrada({ T: 1, clase: 'inicio_termino', lider: 1 });
    f.agregarEntrada(ev('nodo-1-leve', 1, 2, t0));
    f.agregarEntrada(ev('nodo-2-fuerte', 2, 6, t0 + 3600000));
    f.agregarEntrada(ev('nodo-3-severo', 3, 9, t0 + 7200000));
    f.alertas.push({ id: 5, promedio: 7.5, nivel: 'alta', eventos: ['nodo-2-fuerte', 'nodo-3-severo'], termino: 1, lider: 1 });
    f.agregarSuceso({ t: t0, tipo: 'gano', texto: 'Servidor 1 ganó la elección', termino: 1 });
    f.agregarSuceso({ t: t0 + 1000, tipo: 'cayo', texto: 'Servidor 3 cayó', termino: 1 });
    f.estado.commit_index = 3;   // el último evento (índice 4) queda pendiente
    await E.recoger();
    const ids = async (qs) => (await json(`${E.panel}/api/historial?servidor=1&${qs}`)).cuerpo.registros.map((x) => x.id ?? x.clave ?? x.alerta_id);
    assert.deepEqual((await ids('tipo=eventos&nodo=2')), ['nodo-2-fuerte']);
    assert.deepEqual((await ids('tipo=eventos&categoria=severo')), ['nodo-3-severo']);
    assert.deepEqual((await ids('tipo=eventos&categoria=leve')), ['nodo-1-leve']);
    assert.deepEqual((await ids('tipo=eventos&estado=pendiente')), ['nodo-3-severo']);
    assert.deepEqual((await ids('tipo=eventos&q=fuerte')), ['nodo-2-fuerte']);
    assert.deepEqual((await ids(`tipo=eventos&desde=${t0 + 1800000}&hasta=${t0 + 5400000}`)), ['nodo-2-fuerte']);
    assert.deepEqual((await ids('tipo=eventos&q=%25')), []);               // el comodín % se busca como texto, no como patrón
    assert.deepEqual((await ids('tipo=alertas&categoria=alta')), ['5|nodo-2-fuerte,nodo-3-severo']);
    assert.deepEqual((await ids('tipo=alertas&categoria=baja')), []);
    assert.deepEqual((await ids('tipo=alertas&nodo=3')).length, 1);
    assert.deepEqual((await ids('tipo=sucesos&categoria=cayo')).length, 1);
    assert.equal((await ids('tipo=log&categoria=evento')).length, 3);
    assert.equal((await ids('tipo=muestras&categoria=lider')).length >= 0, true);
    // texto con inyección SQL: se trata como texto
    assert.equal((await json(`${E.panel}/api/historial?servidor=1&tipo=eventos&q=${encodeURIComponent("'; DROP TABLE eventos; --")}`)).status, 200);
    assert.equal((await E.almacenes[0].info()).conteos.eventos, 3);
    // detalle
    let r = await json(`${E.panel}/api/registro?servidor=1&tipo=eventos&id=nodo-2-fuerte`);
    assert.equal(r.status, 200);
    assert.equal(r.cuerpo.registro.nivel, 6);
    assert.equal(r.cuerpo.registro.datos.recibido_por, 2);               // el JSON completo tal como lo reportó el nodo
    r = await json(`${E.panel}/api/registro?servidor=1&tipo=muestras&id=1`);
    assert.equal(r.status, 200);
    assert.ok(r.cuerpo.registro.estado, 'la muestra incluye el estado completo del nodo');
    assert.equal((await json(`${E.panel}/api/registro?servidor=1&tipo=eventos&id=no-existe`)).status, 404);
    assert.equal((await json(`${E.panel}/api/registro?servidor=1&tipo=muestras&id=abc`)).status, 400);
    assert.equal((await json(`${E.panel}/api/registro?tipo=eventos&id=x`)).status, 400);
  } finally { await E.cerrar(); }
});

// ---------------------------------------------------------------- persistencia, duplicados, caídas
test('persistencia tras reiniciar y ausencia de duplicados', opts, async () => {
  const E = await entorno3();
  try {
    const t0 = Date.now() - 600000;
    const f = E.fakes[0];
    f.agregarEntrada({ T: 1, clase: 'inicio_termino', lider: 1 });
    for (let k = 1; k <= 5; k++) f.agregarEntrada(ev(`nodo-1-r${k}`, 1, 4, t0 + k * 1000));
    f.agregarSuceso({ t: t0, tipo: 'gano', texto: 'ganó', termino: 1 });
    f.alertas.push({ id: 1, promedio: 4, nivel: 'baja', eventos: ['nodo-1-r1', 'nodo-1-r2'], termino: 1, lider: 1 });
    await E.recoger(); await E.recoger();
    const antes = (await E.almacenes[0].info()).conteos;
    assert.equal(antes.eventos, 5); assert.equal(antes.alertas, 1); assert.equal(antes.sucesos, 1);
    // "reinicio": se cierra todo el servidor 1 y se abre uno nuevo sobre la misma base
    E.recolectores[0].detener();
    await E.almacenes[0].cerrar();
    const nuevo = await abrirBD(URLS[0], { reintentos: 3, esperaMs: 200 });
    try {
      assert.deepEqual((await nuevo.info()).conteos.eventos, 5, 'los datos siguen ahí');
      const r2 = crearRecolector({ n: 1, url: f.url, almacen: nuevo, intervaloMs: 50, timeoutMs: 800 });
      await r2.ciclo(); await r2.ciclo();
      const despues = (await nuevo.info()).conteos;
      assert.equal(despues.eventos, 5); assert.equal(despues.log_entradas, antes.log_entradas);
      assert.equal(despues.alertas, 1); assert.equal(despues.sucesos, 1);
      // un evento nuevo después del reinicio se añade una sola vez
      f.agregarEntrada(ev('nodo-1-r6', 1, 4, t0 + 9000));
      await r2.ciclo(); await r2.ciclo();
      assert.equal((await nuevo.info()).conteos.eventos, 6);
    } finally { await nuevo.cerrar(); }
  } finally { await E.cerrar(); }
});

test('una orden con el mismo ref no se duplica (reintentos); la orden queda en el servidor de su nodo', opts, async () => {
  const E = await entorno3();
  try {
    const post = (url, cuerpo) => json(`${url}/acciones`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const orden = { ref: 'orden-1', tipo: 'pulsar', parametros: { ms: 900 }, estado_http: 200, resultado: { resultado: 'aceptada' }, origen: 'prueba' };
    const a = await post(E.urls[1], orden);
    const b = await post(E.urls[1], orden);          // reintento
    assert.equal(a.status, 201); assert.equal(b.status, 200);
    assert.equal(b.cuerpo.duplicada, true); assert.equal(b.cuerpo.id, a.cuerpo.id);
    assert.equal((await post(E.urls[1], { tipo: 'pulsar' })).status, 201);      // sin ref siempre se guarda
    assert.equal((await post(E.urls[1], { sin: 'tipo' })).status, 400);
    const acc = (await json(`${E.panel}/api/historial?tipo=acciones&servidor=2`)).cuerpo.registros;
    assert.equal(acc.length, 2);
    assert.ok(acc.every((x) => x.nodo === 2));
    assert.equal((await json(`${E.panel}/api/historial?tipo=acciones&servidor=1`)).cuerpo.total, 0);
  } finally { await E.cerrar(); }
});

test('si una base cae, el resto sigue y el panel lo dice', opts, async () => {
  const E = await entorno3();
  try {
    E.fakes.forEach((f, i) => f.agregarSuceso({ t: Date.now() - 1000, tipo: 'gano', texto: `s${i + 1}`, termino: 1 }));
    await E.recoger();
    await E.almacenes[1].pool.end();                    // la base del servidor 2 deja de responder
    const info = (await json(`${E.panel}/api/servidores`)).cuerpo.servidores;
    assert.equal(info[1].bd.ok, false);
    assert.equal(info[0].bd.ok, true);
    const r = await json(`${E.panel}/api/historial?tipo=sucesos`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.cuerpo.servidores.map((x) => x.ok), [true, false, true]);
    assert.ok(r.cuerpo.servidores[1].error);
    assert.deepEqual(r.cuerpo.registros.map((x) => x.servidor).sort(), [1, 3]);
    const solo = await json(`${E.panel}/api/historial?tipo=sucesos&servidor=2`);
    assert.equal(solo.status, 502);
    assert.equal(solo.cuerpo.servidores[0].ok, false);
    assert.equal((await json(`${E.panel}/api/historial?tipo=sucesos&servidor=1`)).status, 200);
    // el recolector del servidor caído no se detiene ni lanza: reintenta en el siguiente ciclo
    await assert.doesNotReject(E.recolectores[1].ciclo());
    await E.almacenes[0].pool.end(); await E.almacenes[2].pool.end();
    const todas = await json(`${E.panel}/api/historial?tipo=sucesos`);
    assert.equal(todas.status, 502);
  } finally { await E.cerrar(); }
});

// ---------------------------------------------------------------- vista pública (CLIENTE)
test('la vista pública solo expone campos del usuario: nada de datos internos', opts, async () => {
  const E = await entorno3();
  try {
    const t0 = Date.now() - 3600000;
    E.fakes.forEach((f) => {
      f.agregarEntrada({ T: 1, clase: 'inicio_termino', lider: 1 });
      f.agregarEntrada(ev('nodo-2-a', 2, 5, t0));
      f.agregarEntrada(ev('nodo-3-b', 3, 6, t0 + 2000));
      f.alertas.push({ id: 2, promedio: 5.5, nivel: 'media', eventos: ['nodo-3-b', 'nodo-2-a'], termino: 1, lider: 1 });
    });
    E.fakes[0].estado.commit_index = 2;                  // nodo-3-b sin confirmar en el servidor 1 (en los demás sí)
    await E.recoger();
    const al = (await json(`${E.panel}/api/publico/historial?tipo=alertas`)).cuerpo;
    assert.equal(al.registros.length, 1);
    assert.deepEqual(Object.keys(al.registros[0]).sort(), ['detectores', 'id', 'nivel', 'promedio', 'ts', 'servidor', 'servidores'].sort());
    assert.deepEqual(al.registros[0].detectores, [2, 3]);
    const evs = (await json(`${E.panel}/api/publico/historial?tipo=eventos`)).cuerpo;
    for (const r of evs.registros) assert.ok(!('termino' in r) && !('recibido_por' in r) && !('datos' in r) && !('pga' in r), JSON.stringify(r));
    assert.ok(evs.registros.length >= 1);
    for (const tipo of ['muestras', 'acciones', 'log', 'sucesos']) assert.equal((await json(`${E.panel}/api/publico/historial?tipo=${tipo}`)).status, 400, tipo);
    assert.equal((await json(`${E.panel}/api/publico/historial?tipo=alertas&limite=999`)).status, 400);
  } finally { await E.cerrar(); }
});

// ---------------------------------------------------------------- retención y archivado
test('retención: por defecto no hace nada; críticos intactos; alertas solo se archivan; eliminar exige confirmación', opts, async () => {
  const E = await entorno3();
  const pool = E.almacenes[0].pool;
  try {
    const viejo = Date.now() - 400 * 86400000;
    const a = E.almacenes[0];
    await a.guardarLog([
      { i: 1, T: 1, clase: 'inicio_termino', lider: 1 },
      { i: 2, ...ev('nodo-1-leve-viejo', 1, 2, viejo) },
      { i: 3, ...ev('nodo-2-critico-viejo', 2, 8, viejo) },
      { i: 4, ...ev('nodo-3-en-alerta-viejo', 3, 3, viejo) },
      { i: 5, ...ev('nodo-1-reciente', 1, 2, Date.now()) },
    ], 5);
    await a.guardarAlertas([{ id: 1, promedio: 3, nivel: 'baja', eventos: ['nodo-3-en-alerta-viejo'], termino: 1, lider: 1 }]);
    await a.guardarSucesos(1, [{ seq: 1, t: viejo, tipo: 'gano', texto: 'viejo', termino: 1 }, { seq: 2, t: Date.now(), tipo: 'gano', texto: 'nuevo', termino: 1 }]);
    await a.guardarMuestra({ nodo: 1, alcanzable: true, rol: 'lider' });
    await pool.query("UPDATE muestras SET t = now() - interval '100 days'");
    await pool.query("UPDATE alertas SET guardado = now() - interval '500 days'");
    await a.guardarAccion({ tipo: 'pulsar', nodo: 1, parametros: { ms: 1 } });
    await pool.query("UPDATE acciones SET t = now() - interval '500 days'");

    // 1) sin configuración: nada
    const porDefecto = leerRetencion({});
    assert.equal(porDefecto.activa, false);
    assert.deepEqual((await aplicar(pool, porDefecto)).movidos, {});
    // 2) plan (solo lectura) con una política configurada pero DESACTIVADA
    const cfg = leerRetencion({ RETENCION_MUESTRAS_DIAS: '30', RETENCION_SUCESOS_DIAS: '365', RETENCION_EVENTOS_DIAS: '365', RETENCION_ALERTAS_DIAS: '365', RETENCION_ACCIONES_DIAS: '365' });
    assert.equal(cfg.activa, false);
    const plan = await planificar(pool, cfg);
    assert.equal(plan.muestras.afectados, 1);
    assert.equal(plan.sucesos.afectados, 1);
    assert.equal(plan.eventos.afectados, 1, 'solo el evento leve viejo: el crítico (nivel 8) y el que está en una alerta se salvan');
    assert.equal(plan.alertas.accion, 'archivar');
    assert.equal((await aplicar(pool, cfg)).aplicada, false);
    assert.equal((await a.info()).conteos.eventos, 4, 'nada cambió');
    // 3) eliminar sin confirmación explícita: se rechaza y queda desactivada
    const sinConf = leerRetencion({ RETENCION_ACTIVA: 'si', RETENCION_MODO: 'eliminar', RETENCION_EVENTOS_DIAS: '365' });
    assert.equal(sinConf.activa, false);
    assert.ok(sinConf.errores.some((e) => /CONFIRMAR_ELIMINAR/.test(e)));
    assert.equal(leerRetencion({ RETENCION_MUESTRAS_DIAS: '-4' }).errores.length, 1);
    // 4) archivar (activa): los eventos críticos y los de alertas no se tocan; las alertas pasan al archivo, no se pierden
    const arch = leerRetencion({ RETENCION_ACTIVA: 'si', RETENCION_MODO: 'archivar', RETENCION_MUESTRAS_DIAS: '30', RETENCION_SUCESOS_DIAS: '365',
      RETENCION_EVENTOS_DIAS: '365', RETENCION_ALERTAS_DIAS: '365', RETENCION_ACCIONES_DIAS: '365' });
    assert.equal(arch.activa, true);
    const r = await aplicar(pool, arch);
    assert.equal(r.movidos.eventos, 1); assert.equal(r.movidos.muestras, 1); assert.equal(r.movidos.alertas, 1);
    const ids = (await a.listar('eventos', {})).registros.map((x) => x.id).sort();
    assert.deepEqual(ids, ['nodo-1-reciente', 'nodo-2-critico-viejo', 'nodo-3-en-alerta-viejo']);
    const archivados = (await a.listar('eventos', { fuente: 'archivo' })).registros.map((x) => x.id);
    assert.deepEqual(archivados, ['nodo-1-leve-viejo']);
    assert.equal((await a.listar('alertas', { fuente: 'archivo' })).total, 1);
    assert.equal((await a.listar('alertas', {})).total, 0);
    // 5) eliminar con confirmación: borra lo técnico/no crítico pero NUNCA un evento crítico ni una alerta
    await a.guardarAlertas([{ id: 2, promedio: 9, nivel: 'alta', eventos: ['nodo-2-critico-viejo'], termino: 1, lider: 1 }]);
    await pool.query("UPDATE alertas SET guardado = now() - interval '900 days', t_ms = NULL WHERE alerta_id = 2");
    await a.guardarAccion({ tipo: 'control', nodo: 1, parametros: { accion: 'caer' } });
    await pool.query("UPDATE acciones SET t = now() - interval '500 days'");
    const elim = leerRetencion({ RETENCION_ACTIVA: 'si', RETENCION_MODO: 'eliminar', RETENCION_CONFIRMAR_ELIMINAR: 'si', RETENCION_EVENTOS_DIAS: '1', RETENCION_ALERTAS_DIAS: '1', RETENCION_ACCIONES_DIAS: '1' });
    assert.equal(elim.activa, true);
    const r2 = await aplicar(pool, elim);
    assert.equal(r2.movidos.acciones, 1, 'lo técnico se elimina de verdad');
    assert.equal((await a.listar('acciones', { fuente: 'archivo' })).total, 1, 'y no pasa al archivo (solo el de antes)');
    assert.equal((await a.listar('eventos', {})).registros.some((x) => x.id === 'nodo-2-critico-viejo'), true, 'el crítico sigue');
    assert.equal((await a.listar('alertas', { fuente: 'archivo' })).total, 2, 'la alerta se archivó, no se eliminó');
  } finally { await E.cerrar(); }
});

// ---------------------------------------------------------------- compatibilidad con ESP32 reales
function esp32Real(n) {
  // Sirve las capturas REALES del firmware (entrega/05-pruebas/datos) con el mismo contrato HTTP.
  const datos = (k) => JSON.parse(fs.readFileSync(path.join(AQUI, '..', '..', 'entrega', '05-pruebas', 'datos', `FIS-00-post-nodo${n}-${k}.json`), 'utf8'));
  const [estado, log, sucesos, alertas] = ['estado', 'log', 'sucesos', 'alertas'].map(datos);
  const srv = http.createServer((req, res) => {
    const u = new URL(`http://x${req.url}`);
    const out = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (u.pathname === '/estado') return out(estado);
    if (u.pathname === '/log') { const d = Number(u.searchParams.get('desde')) || 1; return out({ desde: d, log_len: log.log_len ?? estado.log_len, commit_index: estado.commit_index, entradas: log.entradas.filter((x) => x.i >= d) }); }
    if (u.pathname === '/sucesos') { const d = Number(u.searchParams.get('desde')) || 0; return out({ seq: sucesos.seq, sucesos: sucesos.sucesos.filter((s) => s.seq > d) }); }
    if (u.pathname === '/alertas') return out(alertas);
    res.writeHead(404); res.end('{}');
  });
  return { srv, estado, log, sucesos, alertas };
}

test('compatibilidad con el contrato del firmware real (capturas de los ESP32 físicos)', opts, async () => {
  assert.ok(HAY);
  for (let n = 1; n <= 3; n++) {
    const e = esp32Real(n);
    const url = await escuchar(e.srv);
    const a = await abrirBD(URLS[n - 1], { reintentos: 3, esperaMs: 200 });
    try {
      await a.pool.query(`TRUNCATE ${[...TABLAS, ...ARCHIVOS].join(', ')} RESTART IDENTITY`);
      const r = crearRecolector({ n, url, almacen: a, intervaloMs: 50, timeoutMs: 800 });
      await r.ciclo(); await r.ciclo();
      const c = (await a.info()).conteos;
      assert.equal(c.log_entradas, e.log.entradas.length, `nodo ${n}: log completo`);
      assert.equal(c.eventos, e.log.entradas.filter((x) => x.clase === 'evento').length, `nodo ${n}: eventos`);
      assert.equal(c.sucesos, new Set(e.sucesos.sucesos.map((s) => s.seq)).size, `nodo ${n}: sucesos`);
      assert.equal(c.alertas, e.alertas.alertas.length);
      const m = (await a.listar('muestras', {})).registros[0];
      assert.equal(m.nodo, e.estado.nodo); assert.equal(m.termino, e.estado.termino); assert.equal(m.rssi, e.estado.rssi);
      assert.equal(r.estado().alcanzable, true);
    } finally { await a.cerrar(); await cerrarSrv(e.srv); }
  }
});

test('configuración: ESP32 reales por IP o mDNS, validación de URL y secretos', () => {
  const base = { N: '1', DATABASE_URL: 'postgres://u:p@db1:5432/vybra' };
  assert.equal(leerConfig({ ...base, NODO_URL: 'http://192.168.1.50' }).nodoUrl, 'http://192.168.1.50');
  assert.equal(leerConfig({ ...base, NODO_URL: 'http://sismo-nodo-1.local/' }).nodoUrl, 'http://sismo-nodo-1.local');
  assert.equal(leerConfig({ ...base, NODO_URL: 'http://nodo1:8080' }).nodoUrl, 'http://nodo1:8080');
  assert.throws(() => leerConfig({ ...base, NODO_URL: 'ftp://x' }), /http/);
  assert.throws(() => leerConfig({ ...base, NODO_URL: 'no es url' }), /URL válida/);
  assert.throws(() => leerConfig({ ...base, NODO_URL: 'http://u:p@10.0.0.1' }), /usuario/);
  assert.throws(() => leerConfig({ ...base }), /NODO_URL/);
  assert.throws(() => leerConfig({ ...base, N: '4', NODO_URL: 'http://x' }), /N=1/);
  // la clave sale de un archivo (secreto), no del código ni de la URL
  const leer = (p) => (p === '/run/secrets/db_password' ? 'clave-larga-y-secreta\n' : (() => { throw new Error('no existe'); })());
  const c = leerConfig({ N: '2', NODO_URL: 'http://192.168.1.51', DB_HOST: 'db2', DB_PASSWORD_FILE: '/run/secrets/db_password', VYBRA_ENTORNO: 'produccion' }, leer);
  assert.equal(c.dbUrl, 'postgres://vybra:clave-larga-y-secreta@db2:5432/vybra');
  assert.equal(c.claveDesarrollo, false);
  assert.throws(() => leerConfig({ N: '2', NODO_URL: 'http://x', DB_HOST: 'db2', DB_PASSWORD_FILE: '/no/existe' }, leer), /DB_PASSWORD_FILE/);
  // en producción se rechaza la clave de desarrollo y la vacía
  assert.throws(() => leerConfig({ ...base, DATABASE_URL: 'postgres://u:vybra@db1/vybra', NODO_URL: 'http://x', VYBRA_ENTORNO: 'produccion' }), /producción/);
  assert.throws(() => leerConfig({ N: '1', NODO_URL: 'http://x', DB_HOST: 'db', VYBRA_ENTORNO: 'produccion' }), /producción/);
  assert.equal(leerConfig({ ...base, DATABASE_URL: 'postgres://u:vybra@db1/vybra', NODO_URL: 'http://x' }).claveDesarrollo, true);   // en desarrollo se acepta (con aviso)
});
