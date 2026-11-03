import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { crearNodoFalso } from '../fake/nodo-falso.js';
import { crearPoller } from '../poller.js';
import { crearServidor } from '../server.js';

let falsos = [], poller, servidor, base, dir;
const DETECTORES = [{ n: 1, lat: 1, lon: 2 }];

async function esperar(cond, ms = 3000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail('tiempo agotado esperando la condición');
}

beforeEach(async () => {
  falsos = [1, 2, 3].map((n) => crearNodoFalso({ n, puerto: 0 }));
  await Promise.all(falsos.map((f) => f.listo));
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-'));
  fs.writeFileSync(path.join(dir, 'operador.html'), '<h1>operador</h1>');
  fs.writeFileSync(path.join(dir, 'cliente.html'), '<h1>cliente</h1>');
  fs.writeFileSync(path.join(dir, 'tokens.css'), 'a{}');
  fs.writeFileSync(path.join(dir, 'datos.js'), 'x=1');
  fs.writeFileSync(path.join(dir, 'mapa.svg'), '<svg/>');
  const nodos = falsos.map((f) => ({ n: f.n, url: f.url }));
  poller = crearPoller({ nodos, intervaloMs: 30, timeoutMs: 80 });
  servidor = crearServidor({ poller, nodos, publicDir: dir, detectores: DETECTORES, timeoutNodoMs: 300 });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
  poller.iniciar();
});

afterEach(async () => {
  poller.detener();
  servidor.closeAllConnections?.();
  await new Promise((r) => servidor.close(r));
  await Promise.all(falsos.map((f) => f.cerrar()));
  fs.rmSync(dir, { recursive: true, force: true });
});

// Abre un SSE y acumula los eventos recibidos.
function abrirSSE() {
  const eventos = [];
  let req, res, buf = '';
  const listo = new Promise((ok, mal) => {
    req = http.get(`${base}/api/stream`, (r) => {
      res = r;
      r.setEncoding('utf8');
      r.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const bloque = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.*)$/m.exec(bloque);
          const da = /^data: (.*)$/m.exec(bloque);
          if (ev && da) eventos.push({ evento: ev[1], datos: JSON.parse(da[1]) });
        }
      });
      ok();
    });
    req.on('error', mal);
  });
  return { eventos, listo, cerrar: () => req.destroy(), res: () => res };
}

test('sse: cliente nuevo recibe snapshot', async () => {
  const t0 = Date.now();
  const s = abrirSSE();
  await s.listo;
  assert.match(s.res().headers['content-type'], /text\/event-stream/);
  assert.equal(s.res().headers['cache-control'], 'no-cache');
  await esperar(() => s.eventos.length > 0, 200);
  assert.ok(Date.now() - t0 < 200);
  assert.equal(s.eventos[0].evento, 'estado');
  assert.ok(Array.isArray(s.eventos[0].datos.nodos));
  assert.deepEqual(s.eventos[0].datos.detectores, DETECTORES);
  s.cerrar();
});

test('sse: cambio se propaga', async () => {
  falsos.forEach((f) => { f.estado.rol = f.n === 1 ? 'lider' : 'seguidor'; f.estado.lider_conocido = 1; });
  await esperar(() => poller.foto().lider === 1);
  const s = abrirSSE();
  await s.listo;
  await esperar(() => s.eventos.length > 0);
  const antes = s.eventos.length;
  falsos[0].agregarEntrada({ T: 1, ev: { id: 'a', nodo: 1, nivel: 3, t: 1 } });
  await esperar(() => s.eventos.length > antes && s.eventos.at(-1).datos.log.length > 0);
  assert.equal(s.eventos.at(-1).evento, 'estado');
  s.cerrar();
});

test('sse: sin fugas de listeners al desconectar', async () => {
  const base0 = poller.listenerCount('cambio');
  const clientes = [1, 2, 3, 4].map(abrirSSE);
  await Promise.all(clientes.map((c) => c.listo));
  await esperar(() => poller.listenerCount('cambio') === base0 + 4);
  clientes.forEach((c) => c.cerrar());
  await esperar(() => poller.listenerCount('cambio') === base0);
});

test('api/estado: foto más detectores', async () => {
  const r = await fetch(`${base}/api/estado`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(Array.isArray(j.nodos));
  assert.deepEqual(j.detectores, DETECTORES);
});

test('control: reenvía al nodo correcto', async () => {
  const r = await fetch(`${base}/api/nodos/2/control`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"accion":"caer"}',
  });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, caido: true });
  const p = falsos[1].peticiones.find((x) => x.metodo === 'POST' && x.ruta === '/control');
  assert.deepEqual(p.cuerpo, { accion: 'caer' });
  assert.equal(falsos[0].peticiones.some((x) => x.metodo === 'POST'), false);
});

test('pulsar: reenvía status y cuerpo del nodo (409 caído, 400 cuerpo malo)', async () => {
  const post = (u, b) => fetch(`${base}${u}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: b });
  let r = await post('/api/nodos/1/pulsar', '{"ms":1500}');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
  falsos[0].estado.caido = true;
  r = await post('/api/nodos/1/pulsar', '{"ms":1500}');
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { error: 'caido' });
  r = await post('/api/nodos/2/pulsar', '{"ms":5}');
  assert.equal(r.status, 400);
});

test('control: cuerpo mayor a 4 KB da 413', async () => {
  const r = await fetch(`${base}/api/nodos/1/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(5000) }) });
  assert.equal(r.status, 413);
});

test('control: nodo inalcanzable da 502', async () => {
  await falsos[2].cerrar();
  const r = await fetch(`${base}/api/nodos/3/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"accion":"caer"}' });
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), { error: 'nodo inalcanzable' });
});

test('control: nodo colgado da 502 por tiempo', async () => {
  falsos[0].colgar(true);
  const t0 = Date.now();
  const r = await fetch(`${base}/api/nodos/1/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"accion":"caer"}' });
  assert.equal(r.status, 502);
  assert.ok(Date.now() - t0 < 1500);
});

test('control: n fuera de 1-3 da 404', async () => {
  for (const n of ['0', '4', 'x']) {
    const r = await fetch(`${base}/api/nodos/${n}/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 404);
  }
});

test('estaticos: rutas y tipos', async () => {
  let r = await fetch(`${base}/`);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '<h1>operador</h1>');
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.equal(r.headers.get('cache-control'), 'no-cache');
  r = await fetch(`${base}/publico`);
  assert.equal(await r.text(), '<h1>cliente</h1>');
  r = await fetch(`${base}/tokens.css`);
  assert.match(r.headers.get('content-type'), /text\/css/);
  r = await fetch(`${base}/datos.js`);
  assert.match(r.headers.get('content-type'), /javascript/);
  r = await fetch(`${base}/mapa.svg`);
  assert.match(r.headers.get('content-type'), /image\/svg\+xml/);
  r = await fetch(`${base}/no-existe.png`);
  assert.equal(r.status, 404);
});

test('estaticos: no permite ..', async () => {
  const fuera = path.join(dir, '..', 'secreto-prueba.html');
  fs.writeFileSync(fuera, 'SECRETO');
  fs.writeFileSync(path.join(dir, 'secreto-prueba.html'), 'DENTRO');
  try {
    // Control positivo: el mismo nombre dentro de dir sí se sirve.
    const ok = await fetch(`${base}/secreto-prueba.html`);
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), 'DENTRO');
    for (const ruta of ['/..%2fsecreto-prueba.html', '/..%5csecreto-prueba.html',
      `/%2f${fuera.slice(1)}`, `//${fuera.slice(1)}`, '/a%00b.html']) {
      const r = await fetch(`${base}${ruta}`);
      assert.equal(r.status, 404, ruta);
      assert.notEqual(await r.text(), 'SECRETO', ruta);
    }
    // Peticiones crudas: fetch normaliza ".." y "%2e%2e" antes de enviarlas.
    const u = new URL(base);
    for (const ruta of ['/../secreto-prueba.html', '/%2e%2e/secreto-prueba.html', '/%2E%2E/secreto-prueba.html']) {
      const [estado, texto] = await new Promise((ok2, mal) => {
        const q = http.request({ host: u.hostname, port: u.port, path: ruta }, (res) => {
          let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => ok2([res.statusCode, t]));
        });
        q.on('error', mal); q.end();
      });
      assert.equal(estado, 404, ruta);
      assert.notEqual(texto, 'SECRETO', ruta);
    }
  } finally {
    fs.rmSync(fuera, { force: true });
  }
});

test('control: sin application/json da 415 y no llega al nodo', async () => {
  for (const ct of ['text/plain', undefined]) {
    const r = await fetch(`${base}/api/nodos/1/control`, {
      method: 'POST', headers: ct ? { 'content-type': ct } : {}, body: '{"accion":"caer"}',
    });
    assert.equal(r.status, 415);
  }
  assert.equal(falsos[0].peticiones.some((x) => x.metodo === 'POST'), false);
});

test('control: JSON inválido da 400 y no llega al nodo', async () => {
  const r = await fetch(`${base}/api/nodos/1/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{no' });
  assert.equal(r.status, 400);
  assert.equal(falsos[0].peticiones.some((x) => x.metodo === 'POST'), false);
});

test('sse: cliente detenido con cola enorme es desconectado', async () => {
  // Poller falso: solo emite fotos enormes; el cliente no lee nada.
  const falso = new EventEmitter();
  falso.foto = () => ({ nodos: [] });
  const peque = crearServidor({ poller: falso, nodos: [], publicDir: dir, detectores: DETECTORES, maxPendienteSse: 64 * 1024 });
  await new Promise((r) => peque.listen(0, '127.0.0.1', r));
  let q;
  try {
    await new Promise((ok, mal) => {
      q = http.get(`http://127.0.0.1:${peque.address().port}/api/stream`, (r) => { r.pause(); ok(); });
      q.on('error', () => {});
      q.on('error', mal);
    });
    await esperar(() => falso.listenerCount('cambio') === 1);
    const grande = { nodos: [], foto: 'x'.repeat(8 * 1024 * 1024) };
    // El primer envío llena los búferes del socket; el siguiente supera el tope y corta.
    for (let i = 0; i < 5 && falso.listenerCount('cambio') > 0; i++) {
      falso.emit('cambio', grande);
      await new Promise((r) => setTimeout(r, 50));
    }
    await esperar(() => falso.listenerCount('cambio') === 0);
  } finally {
    q?.destroy();
    peque.closeAllConnections();
    await new Promise((r) => peque.close(r));
  }
});

test('estaticos: sin operador.html responde 404 sin caerse', async () => {
  fs.rmSync(path.join(dir, 'operador.html'));
  const r = await fetch(`${base}/`);
  assert.equal(r.status, 404);
});
