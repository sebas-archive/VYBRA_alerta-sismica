import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { crearNodoFalso } from '../fake/nodo-falso.js';
import { crearPoller } from '../poller.js';
import https from 'node:https';
import { crearServidor } from '../server.js';
import { crearUbicaciones } from '../ubicaciones.js';
import { asegurarCertificado } from '../certificado.js';

let falsos = [], poller, servidor, base, dir, archivoUbi, ubicaciones, llamadasHuella, reloj;

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
  archivoUbi = path.join(dir, 'datos', 'ubicaciones.json');
  ubicaciones = crearUbicaciones(archivoUbi);
  llamadasHuella = [];
  reloj = 1000000;
  servidor = crearServidor({
    poller, nodos, publicDir: dir, timeoutNodoMs: 300, ubicaciones,
    ahora: () => reloj,
  });
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

test('api/estado: foto y ubicaciones, sin coordenadas de ejemplo', async () => {
  const r = await fetch(`${base}/api/estado`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(Array.isArray(j.nodos));
  assert.deepEqual(j.ubicaciones, {});
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
  const base0 = falso.listenerCount('cambio'); // el reintento de huella también escucha
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

const UBI = { lat: 1.21, lon: -77.28, precision: 12 };
const postUbi = (n, cuerpo, tipo = 'application/json') => fetch(`${base}/api/nodos/${n}/ubicacion`, {
  method: 'POST', headers: { 'Content-Type': tipo }, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
});

test('ubicacion: valida coordenadas', async () => {
  const malos = [{ ...UBI, lat: 91 }, { ...UBI, lat: -91 }, { ...UBI, lon: 181 }, { ...UBI, lon: -181 },
    { ...UBI, precision: -1 }, { ...UBI, precision: 'x' }, { lat: 1, lon: 1 }, 'no json', []];
  for (const m of malos) {
    const r = await postUbi(2, m);
    assert.equal(r.status, 400, JSON.stringify(m));
    assert.ok((await r.json()).error);
  }
  assert.equal((await postUbi(4, UBI)).status, 404);
  assert.equal((await postUbi(2, UBI, 'text/plain')).status, 415);
  assert.equal(fs.existsSync(archivoUbi), false);
  assert.equal(falsos[1].peticiones.filter((p) => p.ruta === '/huella').length, 0);
});

test('ubicacion: guarda y aparece en la foto', async () => {
  const r = await postUbi(2, UBI);
  assert.equal(r.status, 200);
  const { ubicacion } = await r.json();
  assert.deepEqual({ ...ubicacion, t: 0 }, { ...UBI, t: 0 });
  assert.ok(Number.isFinite(ubicacion.t));
  const j = await (await fetch(`${base}/api/estado`)).json();
  assert.deepEqual(j.ubicaciones['2'], ubicacion);
  const sse = abrirSSE();
  await sse.listo;
  await esperar(() => sse.eventos.length >= 1);
  assert.deepEqual(sse.eventos[0].datos.ubicaciones['2'], ubicacion);
  sse.cerrar();
  // Sobrevive a un servidor nuevo sobre el mismo archivo.
  const otro = crearServidor({ poller, nodos: [], publicDir: dir, ubicaciones: crearUbicaciones(archivoUbi) });
  await new Promise((ok) => otro.listen(0, '127.0.0.1', ok));
  const j2 = await (await fetch(`http://127.0.0.1:${otro.address().port}/api/estado`)).json();
  assert.deepEqual(j2.ubicaciones['2'], ubicacion);
  await new Promise((ok) => { otro.close(ok); otro.closeAllConnections(); });
});

test('ubicacion: pide huella al nodo', async () => {
  assert.equal((await postUbi(2, UBI)).status, 200);
  await esperar(() => falsos[1].peticiones.some((p) => p.metodo === 'POST' && p.ruta === '/huella'));
  await esperar(() => falsos[1].estado.con_huella);
});

test('ubicacion: reintenta huella como máximo 1 vez por minuto', async () => {
  const f = falsos[1];
  f.control.huellaMs = 1e9; // el nodo nunca llega a tener huella
  const propias = [];
  const nodos = falsos.map((x) => ({ n: x.n, url: x.url }));
  const p2 = crearPoller({ nodos, intervaloMs: 20, timeoutMs: 80 });
  let t = 5000000;
  const ubi = crearUbicaciones(null);
  ubi.fijar(2, UBI);
  const s2 = crearServidor({ poller: p2, nodos, publicDir: dir, ubicaciones: ubi, ahora: () => t, revisionHuellaMs: 20, pedirHuella: async (n) => { propias.push(n); } });
  p2.iniciar();
  try {
    await esperar(() => propias.length >= 1);
    // Foto estable, sin forzar cambios: solo avanza el reloj simulado, de a 30 s, hasta 3 min menos 1 s.
    for (let seg = 30; seg < 180; seg += 30) {
      await new Promise((r) => setTimeout(r, 80)); // varias revisiones con el mismo reloj
      t = 5000000 + seg * 1000;
    }
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(propias.length, 3, `llamadas: ${propias.length}`); // t=0, 60 s y 120 s
    assert.ok(propias.every((n) => n === 2));
  } finally {
    p2.detener();
    s2.closeAllConnections?.();
  }
});

test('ubicacion: guardar envía la foto nueva por SSE sin esperar al poller', async () => {
  const s = abrirSSE();
  await s.listo;
  await esperar(() => s.eventos.length >= 1);
  const estados = () => s.eventos.filter((e) => e.evento === 'estado');
  assert.equal(estados()[0].datos.ubicaciones['3'], undefined);
  poller.detener(); // sin sondeos: el único 'estado' nuevo puede venir del guardado
  await new Promise((r) => setTimeout(r, 100));
  const antes = estados().length;
  assert.equal((await postUbi(3, UBI)).status, 200);
  await esperar(() => estados().length > antes);
  const ultima = estados().at(-1).datos;
  assert.equal(ultima.ubicaciones['3'].lat, UBI.lat);
  assert.equal(ultima.ubicaciones['3'].lon, UBI.lon);
  s.cerrar();
});

// Servidor con pedirHuella simulado y reloj propio; devuelve lo necesario para avanzar el tiempo.
async function conPedidos(respuestas) {
  const llamadas = [];
  const nodos = falsos.map((x) => ({ n: x.n, url: x.url }));
  const p2 = crearPoller({ nodos, intervaloMs: 20, timeoutMs: 80 });
  const reloj2 = { t: 7000000 };
  const s2 = crearServidor({
    poller: p2, nodos, publicDir: dir, ubicaciones: crearUbicaciones(null), ahora: () => reloj2.t, revisionHuellaMs: 20,
    pedirHuella: async (n) => { llamadas.push(n); return respuestas.shift() ?? false; },
  });
  await new Promise((r) => s2.listen(0, '127.0.0.1', r));
  p2.iniciar();
  const url = `http://127.0.0.1:${s2.address().port}/api/nodos/1/ubicacion`;
  const post = () => fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(UBI),
  });
  post.url = url;
  const cerrar = async () => { p2.detener(); s2.closeAllConnections(); await new Promise((r) => s2.close(r)); };
  return { llamadas, reloj2, post, cerrar, p2 };
}

test('ubicacion: pedido de huella rechazado (409 o sin respuesta) queda pendiente y se reintenta', async () => {
  falsos[0].estado.con_huella = true; // nodo movido: tiene su referencia vieja
  const c = await conPedidos([false, false, true]);
  try {
    await esperar(() => c.p2.foto().nodos.every((x) => x.alcanzable));
    assert.equal((await c.post()).status, 200);
    await esperar(() => c.llamadas.length === 1);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(c.llamadas.length, 1); // dentro del minuto no insiste
    c.reloj2.t += 60000;
    await esperar(() => c.llamadas.length === 2);
    c.reloj2.t += 60000;
    await esperar(() => c.llamadas.length === 3); // este sí lo acepta (202)
    c.reloj2.t += 60000;
    await new Promise((r) => setTimeout(r, 100));
    c.reloj2.t += 60000;
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(c.llamadas.length, 3); // ya no está pendiente: no se pide más
    assert.ok(c.llamadas.every((n) => n === 1));
  } finally {
    await c.cerrar();
  }
});

test('ubicacion: pedido de huella aceptado (202) no se repite', async () => {
  falsos[0].estado.con_huella = true;
  const c = await conPedidos([true]);
  try {
    await esperar(() => c.p2.foto().nodos.every((x) => x.alcanzable));
    assert.equal((await c.post()).status, 200);
    await esperar(() => c.llamadas.length === 1);
    for (let i = 0; i < 3; i++) {
      c.reloj2.t += 60000;
      await new Promise((r) => setTimeout(r, 80));
    }
    assert.deepEqual(c.llamadas, [1]);
  } finally {
    await c.cerrar();
  }
});

test('pedirHuella por defecto: solo 202 cuenta como aceptado', async () => {
  // Con el nodo caído el falso responde 409: queda pendiente y se vuelve a pedir al recuperarse.
  falsos[0].estado.con_huella = true;
  falsos[0].estado.caido = true;
  const avisos = [];
  const log = console.log;
  console.log = (m) => { avisos.push(m); };
  try {
    assert.equal((await postUbi(1, UBI)).status, 200);
    await esperar(() => avisos.length === 1);
  } finally {
    console.log = log;
  }
  assert.match(avisos[0], /No se pudo pedir la huella al nodo 1/); // el 409 cuenta como no aceptado
  assert.equal(falsos[0].peticiones.filter((p) => p.ruta === '/huella').length, 1);
  await new Promise((r) => setTimeout(r, 150));
  reloj += 60000;
  falsos[0].estado.caido = false; // la foto cambia y el reintento sale
  await esperar(() => falsos[0].peticiones.filter((p) => p.ruta === '/huella').length === 2);
  await esperar(() => falsos[0].estado.con_huella === true);
  reloj += 60000;
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(falsos[0].peticiones.filter((p) => p.ruta === '/huella').length, 2); // aceptado: no más
});

const borrarUbi = (n, b = base) => fetch(`${b}/api/nodos/${n}/ubicacion`, { method: 'DELETE' });

test('ubicacion: DELETE quita la ubicación, persiste y avisa por SSE', async () => {
  assert.equal((await borrarUbi(2)).status, 404); // no estaba ubicado
  for (const n of [0, 4, 'x', '1.5']) assert.equal((await borrarUbi(n)).status, 404, String(n));
  assert.equal((await postUbi(2, UBI)).status, 200);
  assert.equal((await postUbi(3, UBI)).status, 200);
  const s = abrirSSE();
  await s.listo;
  await esperar(() => s.eventos.length >= 1);
  const estados = () => s.eventos.filter((e) => e.evento === 'estado');
  assert.ok(estados()[0].datos.ubicaciones['2']);
  poller.detener(); // sin sondeos: el único 'estado' nuevo puede venir del borrado
  await new Promise((r) => setTimeout(r, 100));
  const antes = estados().length;
  const r = await borrarUbi(2);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  await esperar(() => estados().length > antes);
  assert.equal(estados().at(-1).datos.ubicaciones['2'], undefined);
  assert.ok(estados().at(-1).datos.ubicaciones['3']);
  const j = await (await fetch(`${base}/api/estado`)).json();
  assert.deepEqual(Object.keys(j.ubicaciones), ['3']);
  assert.deepEqual(Object.keys(crearUbicaciones(archivoUbi).todas()), ['3']);
  assert.equal((await borrarUbi(2)).status, 404); // ya se quitó
  s.cerrar();
});

test('ubicacion: ajuste:true guarda sin pedir huella ni dejarla pendiente', async () => {
  falsos[0].estado.con_huella = true; // la placa tiene su referencia y no se movió
  const c = await conPedidos([]);
  try {
    await esperar(() => c.p2.foto().nodos.every((x) => x.alcanzable));
    const url = c.post.url;
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...UBI, ajuste: true }) });
    assert.equal(r.status, 200);
    const { ubicacion } = await r.json();
    assert.equal('ajuste' in ubicacion, false);
    assert.equal(ubicacion.lat, UBI.lat);
    for (let i = 0; i < 3; i++) {
      c.reloj2.t += 60000;
      await new Promise((ok) => setTimeout(ok, 80));
    }
    assert.deepEqual(c.llamadas, []);
    // Sin ajuste sí la pide (control).
    assert.equal((await c.post()).status, 200);
    await esperar(() => c.llamadas.length === 1);
  } finally {
    await c.cerrar();
  }
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

test('certificado: key.pem 0600 y carpeta 0700', async () => {
  const d = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'perm-')), 'c');
  await asegurarCertificado(d);
  assert.equal(fs.statSync(path.join(d, 'key.pem')).mode & 0o777, 0o600);
  assert.equal(fs.statSync(d).mode & 0o777, 0o700);
  fs.chmodSync(path.join(d, 'key.pem'), 0o644);
  await asegurarCertificado(d);
  assert.equal(fs.statSync(path.join(d, 'key.pem')).mode & 0o777, 0o600);
  fs.rmSync(path.dirname(d), { recursive: true });
});

test('ubicacion: no reintenta nodos sin ubicación, con huella o caídos', async () => {
  const propias = [];
  const nodos = falsos.map((x) => ({ n: x.n, url: x.url }));
  const p2 = crearPoller({ nodos, intervaloMs: 20, timeoutMs: 80 });
  const ubi = crearUbicaciones(null);
  ubi.fijar(1, UBI); ubi.fijar(2, UBI);
  falsos[0].estado.con_huella = true;
  falsos[1].estado.caido = true;
  crearServidor({ poller: p2, nodos, publicDir: dir, ubicaciones: ubi, pedirHuella: async (n) => { propias.push(n); } });
  p2.iniciar();
  await new Promise((r) => setTimeout(r, 300));
  p2.detener();
  assert.deepEqual(propias, []);
});

test('https: sirve /api/estado en el puerto seguro', async () => {
  const certs = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-'));
  const { cert, key } = await asegurarCertificado(certs);
  const sec = https.createServer({ cert, key });
  const nodos = falsos.map((x) => ({ n: x.n, url: x.url }));
  const s2 = crearServidor({ poller, nodos, publicDir: dir, ubicaciones, https: { cert, key } });
  await new Promise((ok) => s2.listen(0, '127.0.0.1', ok));
  try {
    const estado = await new Promise((ok, mal) => {
      https.get({ host: '127.0.0.1', port: s2.address().port, path: '/api/estado', rejectUnauthorized: false }, (res) => {
        let b = '';
        res.on('data', (c) => { b += c; });
        res.on('end', () => ok({ status: res.statusCode, cuerpo: JSON.parse(b) }));
      }).on('error', mal);
    });
    assert.equal(estado.status, 200);
    assert.ok(Array.isArray(estado.cuerpo.nodos));
  } finally {
    sec.close();
    await new Promise((ok) => { s2.close(ok); s2.closeAllConnections(); });
    fs.rmSync(certs, { recursive: true, force: true });
  }
});
