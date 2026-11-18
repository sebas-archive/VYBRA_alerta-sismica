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
  servidor = crearServidor({ poller, nodos, publicDir: dir, timeoutNodoMs: 300 });
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
  assert.equal('detectores' in s.eventos[0].datos, false); // sin coordenadas de ejemplo
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

test('sse: latido vivo periódico aunque no haya cambios', async () => {
  const falso = new EventEmitter();
  falso.foto = () => ({ nodos: [] });
  const rapido = crearServidor({ poller: falso, nodos: [], publicDir: dir, vivoMs: 40 });
  await new Promise((r) => rapido.listen(0, '127.0.0.1', r));
  const baseAntes = base;
  base = `http://127.0.0.1:${rapido.address().port}`;
  const s = abrirSSE();
  try {
    await s.listo;
    await esperar(() => s.eventos.filter((e) => e.evento === 'vivo').length >= 2, 1000);
    assert.equal(s.eventos[0].evento, 'estado');
    const vivo = s.eventos.find((e) => e.evento === 'vivo');
    assert.equal(typeof vivo.datos.t, 'number');
    assert.ok(Math.abs(vivo.datos.t - Date.now()) < 5000);
    assert.equal(s.eventos.filter((e) => e.evento === 'estado').length, 1); // sin cambios, una sola foto
  } finally {
    s.cerrar();
    base = baseAntes;
    rapido.closeAllConnections();
    await new Promise((r) => rapido.close(r));
  }
});

test('sse: sin fugas de listeners al desconectar', async () => {
  const base0 = poller.listenerCount('cambio');
  const clientes = [1, 2, 3, 4].map(abrirSSE);
  await Promise.all(clientes.map((c) => c.listo));
  await esperar(() => poller.listenerCount('cambio') === base0 + 4);
  clientes.forEach((c) => c.cerrar());
  await esperar(() => poller.listenerCount('cambio') === base0);
});

test('api/estado: foto con las posiciones fijas de los detectores', async () => {
  const r = await fetch(`${base}/api/estado`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(Array.isArray(j.nodos));
  assert.deepEqual(Object.keys(j.ubicaciones), ['1', '2', '3']);
  assert.ok(Number.isFinite(j.ubicaciones['1'].lat) && Number.isFinite(j.ubicaciones['1'].lon));
  assert.equal('detectores' in j, false);
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
  let c = await r.json();
  assert.equal(c.ok, true);
  assert.equal(c.resultado, 'pendiente'); // seguidor: queda en su cola de reenvío al líder
  falsos[0].estado.rol = 'lider';
  r = await post('/api/nodos/1/pulsar', '{"ms":1500}');
  c = await r.json();
  assert.equal(c.resultado, 'aceptada'); // el líder lo agrega a su log
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
  const peque = crearServidor({ poller: falso, nodos: [], publicDir: dir, maxPendienteSse: 64 * 1024 });
  const base0 = falso.listenerCount('cambio');
  await new Promise((r) => peque.listen(0, '127.0.0.1', r));
  let q;
  try {
    await new Promise((ok, mal) => {
      q = http.get(`http://127.0.0.1:${peque.address().port}/api/stream`, (r) => { r.pause(); ok(); });
      q.on('error', () => {});
      q.on('error', mal);
    });
    await esperar(() => falso.listenerCount('cambio') === base0 + 1);
    const grande = { nodos: [], foto: 'x'.repeat(8 * 1024 * 1024) };
    // El primer envío llena los búferes del socket; el siguiente supera el tope y corta.
    for (let i = 0; i < 5 && falso.listenerCount('cambio') > base0; i++) {
      falso.emit('cambio', grande);
      await new Promise((r) => setTimeout(r, 50));
    }
    await esperar(() => falso.listenerCount('cambio') === base0);
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

test('nodo falso: "mover" marca movido con suceso; /huella lo limpia al fijar la referencia', async () => {
  const f = falsos[0];
  f.estado.con_huella = true;
  const post = (ruta, cuerpo) => fetch(`${f.url}${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  let r = await post('/control', { accion: 'mover' });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, movido: true });
  assert.equal(f.estado.movido, true);
  assert.equal(f.sucesos.at(-1).tipo, 'movido');
  assert.equal(f.sucesos.at(-1).texto, 'Servidor 1 detectó que lo movieron');
  await post('/control', { accion: 'mover' });
  assert.equal(f.sucesos.filter((x) => x.tipo === 'movido').length, 1); // una sola vez por transición
  f.control.huellaMs = 50;
  r = await post('/huella', {});
  assert.equal(r.status, 202);
  assert.equal(f.estado.movido, false); // como el firmware: tomando huella, ni movido ni con huella
  assert.equal(f.estado.con_huella, false);
  await esperar(() => f.estado.con_huella === true);
  assert.equal(f.estado.movido, false);
});

test('frontends nuevos: / y /publico redirigen a /admin/ y /cliente/ cuando están instalados', async () => {
  fs.mkdirSync(path.join(dir, 'admin'));
  fs.mkdirSync(path.join(dir, 'cliente'));
  fs.writeFileSync(path.join(dir, 'admin', 'index.html'), '<h1>admin</h1>');
  fs.writeFileSync(path.join(dir, 'cliente', 'index.html'), '<h1>cliente nuevo</h1>');
  let r = await fetch(`${base}/`, { redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/admin/');
  r = await fetch(`${base}/publico`, { redirect: 'manual' });
  assert.equal(r.headers.get('location'), '/cliente/');
  r = await fetch(`${base}/admin`, { redirect: 'manual' });
  assert.equal(r.headers.get('location'), '/admin/');
  r = await fetch(`${base}/admin/`);
  assert.equal(await r.text(), '<h1>admin</h1>');
  r = await fetch(`${base}/cliente/`);
  assert.equal(await r.text(), '<h1>cliente nuevo</h1>');
  // Las vistas anteriores siguen disponibles
  r = await fetch(`${base}/operador.html`);
  assert.equal(await r.text(), '<h1>operador</h1>');
});

test('estaticos: audio mp3 con Accept-Ranges y respuesta 206 a Range', async () => {
  fs.writeFileSync(path.join(dir, 'a.mp3'), Buffer.from('0123456789'));
  let r = await fetch(`${base}/a.mp3`);
  assert.equal(r.headers.get('content-type'), 'audio/mpeg');
  assert.equal(r.headers.get('accept-ranges'), 'bytes');
  r = await fetch(`${base}/a.mp3`, { headers: { Range: 'bytes=2-4' } });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('content-range'), 'bytes 2-4/10');
  assert.equal(await r.text(), '234');
  r = await fetch(`${base}/a.mp3`, { headers: { Range: 'bytes=50-60' } });
  assert.equal(r.status, 416);
});

// Servidor de datos de mentira: responde /info, /api/historial y guarda lo que le llega en /acciones.
async function servidorFalso(n, tipos = ['eventos', 'alertas']) {
  const acciones = [];
  const srv = http.createServer((req, res) => {
    const u = new URL(`http://x${req.url}`);
    const out = (st, o) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (u.pathname === '/info') return out(200, { servidor: n, sistema: `SO-${n}`, bd: { ok: true } });
    if (u.pathname === '/api/historial') {
      const tipo = u.searchParams.get('tipo');
      if (!tipos.includes(tipo)) return out(400, { error: 'tipo' });
      return out(200, { servidor: n, tipo, total: 1, pagina: 1, limite: 50, paginas: 1, registros: [{ id: `r${n}`, ts: n }] });
    }
    if (u.pathname === '/acciones' && req.method === 'POST') {
      let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { acciones.push(JSON.parse(b)); out(201, { ok: true }); });
      return;
    }
    out(404, {});
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { srv, acciones, url: `http://127.0.0.1:${srv.address().port}`, cerrar: () => new Promise((r) => { srv.closeAllConnections?.(); srv.close(r); }) };
}

test('servidores de datos: /api/servidores, /api/historial y registro de acciones en el servidor asignado', async () => {
  const sv = [await servidorFalso(1), await servidorFalso(2), { url: 'http://127.0.0.1:1', cerrar: async () => {} }]; // el 3 está caído
  const nodos = falsos.map((f) => ({ n: f.n, url: f.url }));
  const p2 = crearPoller({ nodos, intervaloMs: 30, timeoutMs: 80 });
  const s2 = crearServidor({ poller: p2, nodos, publicDir: dir, timeoutNodoMs: 300, timeoutServidorMs: 400, servidores: sv.map((s, i) => ({ n: i + 1, url: s.url })) });
  await new Promise((r) => s2.listen(0, '127.0.0.1', r));
  const b = `http://127.0.0.1:${s2.address().port}`;
  try {
    let r = await fetch(`${b}/api/servidores`);
    const lista = (await r.json()).servidores;
    assert.deepEqual(lista.map((x) => x.alcanzable), [true, true, false]);
    assert.equal(lista[1].sistema, 'SO-2');
    r = await fetch(`${b}/api/historial?tipo=eventos`);
    let j = await r.json();
    assert.deepEqual(j.registros.map((x) => x.id).sort(), ['r1', 'r2']);
    assert.deepEqual(j.servidores.map((x) => x.ok), [true, true, false]);
    r = await fetch(`${b}/api/historial?tipo=alertas&servidor=2`);
    assert.deepEqual((await r.json()).registros, [{ id: 'r2', ts: 2 }]);
    r = await fetch(`${b}/api/historial?tipo=raro&servidor=1`);
    assert.equal(r.status, 400);
    // una pulsación al nodo 2 queda registrada en el servidor 2 (no en el 1)
    r = await fetch(`${b}/api/nodos/2/pulsar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ms: 900 }) });
    assert.equal(r.status, 200);
    await esperar(() => sv[1].acciones.length === 1);
    assert.equal(sv[1].acciones[0].tipo, 'pulsar');
    assert.equal(sv[1].acciones[0].parametros.ms, 900);
    assert.equal(sv[1].acciones[0].estado_http, 200);
    assert.equal(sv[0].acciones.length, 0);
  } finally {
    p2.detener();
    s2.closeAllConnections?.();
    await new Promise((r) => s2.close(r));
    await Promise.all(sv.map((s) => s.cerrar()));
  }
});

test('sin SERVIDORES configurados /api/historial responde 404 claro', async () => {
  const r = await fetch(`${base}/api/historial`);
  assert.equal(r.status, 404);
});
