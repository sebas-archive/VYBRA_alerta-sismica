// Controlador de infraestructura contra un "Docker" simulado (socket Unix) que registra cada petición.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clienteDocker, crearControlador, crearManejador } from '../controlador/controlador.js';

const PROYECTO = 'vybra';

// Docker de mentira: contenedores en memoria (proyecto propio y uno ajeno) con las rutas que usa el controlador.
async function dockerFalso({ fisico = [], dbApagada = [] } = {}) {
  const cont = {};
  const peticiones = [];
  const alta = (id, proyecto, servicio, corriendo = true) => {
    cont[id] = { Id: id, Names: [`/${proyecto}-${servicio}`], Labels: { 'com.docker.compose.project': proyecto, 'com.docker.compose.service': servicio },
      State: { Status: corriendo ? 'running' : 'exited', Running: corriendo, StartedAt: '2026-11-18T00:00:00Z', FinishedAt: '0001-01-01T00:00:00Z', ExitCode: 0, Health: corriendo ? { Status: 'healthy' } : undefined },
      Mounts: servicio.startsWith('db') ? [{ Type: 'volume', Name: `vol-${servicio}` }] : [] };
  };
  for (const n of [1, 2, 3]) {
    if (!fisico.includes(n)) alta(`idnodo${n}`, PROYECTO, `nodo${n}`);
    alta(`idservidor${n}`, PROYECTO, `servidor${n}`);
    alta(`iddb${n}`, PROYECTO, `db${n}`, !dbApagada.includes(n));
    alta(`ajenonodo${n}`, 'otro-proyecto', `nodo${n}`);       // mismo servicio en OTRO proyecto: no se debe tocar
  }
  alta('idpanel', PROYECTO, 'panel');
  const ruta = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dk-')), 'docker.sock');
  const srv = http.createServer((req, res) => {
    peticiones.push(`${req.method} ${req.url}`);
    const u = new URL(req.url, 'http://x');
    const out = (st, o) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(o === undefined ? '' : JSON.stringify(o)); };
    let m;
    if (req.method === 'GET' && u.pathname === '/v1.43/containers/json') {
      const f = JSON.parse(u.searchParams.get('filters') || '{}').label || [];
      return out(200, Object.values(cont).filter((c) => f.every((l) => { const [k, v] = l.split('='); return c.Labels[k] === v; })).map((c) => ({ Id: c.Id, Names: c.Names, Labels: c.Labels })));
    }
    if (req.method === 'GET' && (m = /^\/v1\.43\/containers\/([^/]+)\/json$/.exec(u.pathname))) return cont[m[1]] ? out(200, { State: cont[m[1]].State, Mounts: cont[m[1]].Mounts, Config: { Labels: cont[m[1]].Labels } }) : out(404, {});
    if (req.method === 'POST' && (m = /^\/v1\.43\/containers\/([^/]+)\/(stop|start)$/.exec(u.pathname))) {
      const c = cont[m[1]];
      if (!c) return out(404, {});
      const quiere = m[2] === 'start';
      if (c.State.Running === quiere) return out(304);
      c.State.Running = quiere; c.State.Status = quiere ? 'running' : 'exited';
      return out(204);
    }
    out(404, { message: 'ruta no permitida en esta prueba' });
  });
  await new Promise((r) => srv.listen(ruta, r));
  return { cont, peticiones, ruta, cerrar: () => new Promise((r) => srv.close(r)) };
}
const corriendo = (d, id) => d.cont[id].State.Running;

async function entorno(opts) {
  const d = await dockerFalso(opts);
  const controlador = crearControlador({ proyecto: PROYECTO, docker: clienteDocker(d.ruta), esperaParadaS: 1, pausaMs: 10, esperaArranqueMs: 2000 });
  return { d, controlador };
}

test('estado: modo simulado, contenedores del proyecto y volumen de la base; sin ids de Docker', async () => {
  const { d, controlador } = await entorno();
  try {
    const e = await controlador.estado();
    assert.equal(e.servidores.length, 3);
    for (const s of e.servidores) {
      assert.equal(s.modo, 'simulado');
      assert.equal(s.nodo.corriendo, true); assert.equal(s.servidor.corriendo, true); assert.equal(s.bd.corriendo, true);
      assert.deepEqual(s.bd.volumenes, [`vol-db${s.n}`]);
      assert.equal(s.nodo.id, undefined);
    }
    assert.ok(!JSON.stringify(e).includes('ajeno'));
  } finally { await d.cerrar(); }
});

for (const n of [1, 2, 3]) {
  test(`apagar y encender el servidor ${n}: solo su nodo y su servidor; las bases y los demás siguen`, async () => {
    const { d, controlador } = await entorno();
    try {
      const r = await controlador.apagar(n);
      assert.deepEqual(r.detenidos, [`nodo${n}`, `servidor${n}`]);
      for (const k of [1, 2, 3]) {
        assert.equal(corriendo(d, `idnodo${k}`), k !== n, `nodo${k}`);
        assert.equal(corriendo(d, `idservidor${k}`), k !== n, `servidor${k}`);
        assert.equal(corriendo(d, `iddb${k}`), true, `db${k} sigue encendida`);
        assert.equal(corriendo(d, `ajenonodo${k}`), true, 'otro proyecto intacto');
      }
      assert.equal(corriendo(d, 'idpanel'), true);
      assert.equal(r.estado.nodo.corriendo, false);
      assert.equal(r.estado.bd.corriendo, true);
      // apagar otra vez no hace nada ni falla
      assert.deepEqual((await controlador.apagar(n)).detenidos, []);
      const e = await controlador.encender(n);
      assert.deepEqual(e.iniciados, [`nodo${n}`, `servidor${n}`]);
      for (const id of ['idnodo', 'idservidor', 'iddb']) assert.equal(corriendo(d, `${id}${n}`), true);
      // NUNCA se pidió parar o arrancar una base de datos ni nada fuera de nodo/servidor del proyecto
      for (const p of d.peticiones.filter((x) => /\/(stop|start)/.test(x))) {
        assert.ok(new RegExp(`/containers/id(nodo|servidor)${n}/(stop|start)`).test(p), `petición inesperada: ${p}`);
      }
    } finally { await d.cerrar(); }
  });
}

test('encender se niega si la base de datos está apagada y no la arranca', async () => {
  const { d, controlador } = await entorno({ dbApagada: [2] });
  try {
    await controlador.apagar(2);
    await assert.rejects(controlador.encender(2), /base de datos/);
    assert.equal(corriendo(d, 'iddb2'), false, 'el controlador no arranca bases de datos');
    assert.equal(corriendo(d, 'idservidor2'), false);
    assert.ok(!d.peticiones.some((p) => /iddb2\/(start|stop)/.test(p)));
  } finally { await d.cerrar(); }
});

test('ESP32 físico (sin contenedor nodo): solo se para el servidor de datos y se informa el modo', async () => {
  const { d, controlador } = await entorno({ fisico: [3] });
  try {
    const e = await controlador.estadoDe(3);
    assert.equal(e.modo, 'fisico');
    assert.equal(e.nodo.existe, false);
    const r = await controlador.apagar(3);
    assert.deepEqual(r.detenidos, ['servidor3']);
    assert.equal(corriendo(d, 'iddb3'), true);
    assert.deepEqual((await controlador.encender(3)).iniciados, ['servidor3']);
  } finally { await d.cerrar(); }
});

test('HTTP: solo existen /estado, /salud y POST /servidores/{1-3}/{apagar|encender}; exige token', async () => {
  const { d, controlador } = await entorno();
  const srv = http.createServer(crearManejador({ controlador, token: 'secreto-de-prueba' }));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const H = { Authorization: 'Bearer secreto-de-prueba' };
  const llamar = (m, u, h = H) => fetch(base + u, { method: m, headers: h }).then(async (r) => ({ st: r.status, j: await r.json().catch(() => null) }));
  try {
    assert.equal((await llamar('GET', '/salud', {})).st, 200);                         // salud sin token (solo dice "ok")
    assert.equal((await llamar('GET', '/estado', {})).st, 401);
    assert.equal((await llamar('GET', '/estado', { Authorization: 'Bearer otro' })).st, 401);
    assert.equal((await llamar('POST', '/servidores/1/apagar', {})).st, 401);
    assert.equal(d.peticiones.filter((p) => p.startsWith('POST')).length, 0, 'sin token no llega nada a Docker');
    // rutas que NO existen: nada de ids, nombres, comandos ni otros números
    for (const [m, u] of [['POST', '/servidores/4/apagar'], ['POST', '/servidores/0/apagar'], ['POST', '/servidores/1/borrar'], ['POST', '/servidores/1/apagar/x'],
      ['POST', '/servidores/db1/apagar'], ['POST', '/servidores/1;ls/apagar'], ['GET', '/servidores/1/apagar'], ['DELETE', '/servidores/1/apagar'], ['POST', '/containers/iddb1/stop'],
      ['GET', '/containers/json'], ['POST', '/exec'], ['POST', '/servidores/1/apagar%2F..%2Fdb1']]) {
      assert.equal((await llamar(m, u)).st, 404, `${m} ${u}`);
    }
    assert.equal(d.peticiones.filter((p) => p.startsWith('POST')).length, 0, 'ninguna ruta inválida llegó a Docker');
    // camino feliz
    const a = await llamar('POST', '/servidores/2/apagar');
    assert.equal(a.st, 200); assert.deepEqual(a.j.detenidos, ['nodo2', 'servidor2']);
    assert.equal((await llamar('GET', '/estado')).j.servidores[1].nodo.corriendo, false);
    assert.equal((await llamar('POST', '/servidores/2/encender')).st, 200);
    // todo lo que se envió a Docker son consultas o stop/start de nodo2/servidor2
    for (const p of d.peticiones) assert.ok(/^GET \/v1\.43\/containers\/(json\?|[a-z0-9]+\/json$)/.test(p) || /^POST \/v1\.43\/containers\/id(nodo|servidor)2\/(stop\?t=\d+|start)$/.test(p), p);
  } finally { await new Promise((r) => { srv.closeAllConnections?.(); srv.close(r); }); await d.cerrar(); }
});

test('dos órdenes simultáneas al mismo servidor: una se rechaza (409)', async () => {
  const { d, controlador } = await entorno();
  try {
    const [a, b] = await Promise.allSettled([controlador.apagar(1), controlador.apagar(1)]);
    const estados = [a, b].map((x) => x.status);
    assert.deepEqual(estados.sort(), ['fulfilled', 'rejected']);
    assert.match([a, b].find((x) => x.status === 'rejected').reason.message, /en curso/);
  } finally { await d.cerrar(); }
});
