import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { crearHistorial } from '../historial.js';
import { crearManejador } from '../server.js';

const foto = (extra = {}) => ({
  t: 1, quorum: true, lider: 1, fuente: 1,
  nodos: [{ n: 1, alcanzable: true, estado: { commit_index: 2, log_len: 3 } }],
  log: [
    { i: 1, T: 1, clase: 'inicio_termino', lider: 1 },
    { i: 2, T: 1, clase: 'evento', ev: { id: 'nodo-2-a', nodo: 2, nivel: 5, pga: 0.1, t: 1000, recibido_por: 2 } },
    { i: 3, T: 1, clase: 'evento', ev: { id: 'nodo-3-b', nodo: 3, nivel: 6, pga: 0.2, t: 2000, recibido_por: 3 } }, // sin confirmar
  ],
  alertas: [{ id: 7, promedio: 5, nivel: 'media', eventos: ['nodo-2-a', 'nodo-3-b'], termino: 1, lider: 1 }],
  sucesos: [{ n: 1, seq: 1, t: 5, tipo: 'gano', texto: 'Servidor 1 ganó', termino: 1 }],
  ...extra,
});

function carpeta() { return fs.mkdtempSync(path.join(os.tmpdir(), 'hist-')); }

test('historial: guarda lo confirmado, sin duplicados y sin lo pendiente', async () => {
  const dir = carpeta();
  const h = crearHistorial({ dir });
  await h.registrar(foto());
  await h.registrar(foto());
  const ev = await h.leer('eventos');
  assert.deepEqual(ev.map((e) => e.id), ['nodo-2-a']); // nodo-3-b (i=3 > commit 2) todavía no
  assert.equal((await h.leer('alertas')).length, 1);
  assert.equal((await h.leer('sucesos')).length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('historial: sobrevive a un reinicio y completa lo que faltaba', async () => {
  const dir = carpeta();
  await crearHistorial({ dir }).registrar(foto());
  const h2 = crearHistorial({ dir });                 // "reinicio": nuevo objeto, mismo disco
  await h2.registrar(foto());                          // no duplica
  const f = foto();
  f.nodos[0].estado.commit_index = 3;                  // ahora la mayoría confirma el evento 3
  await h2.registrar(f);
  assert.deepEqual((await h2.leer('eventos')).map((e) => e.id), ['nodo-2-a', 'nodo-3-b']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('historial: una línea cortada no rompe la lectura; tipo inválido da null', async () => {
  const dir = carpeta();
  fs.writeFileSync(path.join(dir, 'eventos.jsonl'), '{"clave":"x","id":"x"}\n{"clave":"cortad');
  const h = crearHistorial({ dir });
  assert.equal((await h.leer('eventos')).length, 1);
  assert.equal(h.leer('otro'), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('API /api/historial devuelve los registros y valida el tipo', async () => {
  const dir = carpeta();
  const h = crearHistorial({ dir });
  await h.registrar(foto());
  const manejador = crearManejador({ poller: { foto: () => foto(), on() {}, off() {} }, nodos: [], publicDir: dir, historial: h });
  const srv = http.createServer(manejador);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  let r = await fetch(`${base}/api/historial?tipo=alertas`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.tipo, 'alertas');
  assert.equal(j.registros[0].id, 7);
  r = await fetch(`${base}/api/historial?tipo=nada`);
  assert.equal(r.status, 400);
  r = await fetch(`${base}/api/historial?limite=1`);       // por defecto: eventos
  assert.equal((await r.json()).registros.length, 1);
  await new Promise((r2) => srv.close(r2));
  fs.rmSync(dir, { recursive: true, force: true });
});
