// Raft REAL: tres procesos del nodo simulado (núcleo Raft del firmware compilado para Linux) en localhost.
// Elección, caída del líder, reelección, reincorporación con sincronización y pérdida de quórum.
// Requiere el binario (web/nodo-sim/compilar.sh). Sin él se omite, salvo REQUIRE_NATIVO=1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(AQUI, '..', 'nodo-sim', 'nodo-sim');
if (!fs.existsSync(BIN) && spawnSync('which', ['g++']).status === 0) spawnSync('bash', [path.join(AQUI, '..', 'nodo-sim', 'compilar.sh')], { stdio: 'ignore' });
const HAY = fs.existsSync(BIN);
const opts = { skip: HAY || process.env.REQUIRE_NATIVO === '1' ? false : 'falta web/nodo-sim/nodo-sim (bash web/nodo-sim/compilar.sh)', timeout: 120000 };

const BASE = 21000 + Math.floor(Math.random() * 2000) * 3;
const http = (n) => BASE + n, udp = (n) => BASE + 10 + n;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperar(cond, ms = 30000, msg = 'condición') {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { try { const v = await cond(); if (v) return v; } catch { /* aún no */ } await dormir(150); }
  assert.fail(`tiempo agotado: ${msg}`);
}

function grupo() {
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-'));
  const procs = {};
  const arrancar = (n) => {
    const env = { ...process.env, N: String(n), PUERTO_HTTP: String(http(n)), PUERTO_RAFT: String(udp(n)), DATOS_DIR: datos,
      PEER_1: `127.0.0.1:${udp(1)}`, PEER_2: `127.0.0.1:${udp(2)}`, PEER_3: `127.0.0.1:${udp(3)}` };
    procs[n] = spawn(BIN, [], { env, stdio: 'ignore' });
  };
  const parar = async (n) => { const p = procs[n]; if (!p || p.exitCode !== null) return; p.kill('SIGTERM'); await new Promise((r) => p.once('exit', r)); };   // apagado real del proceso
  const estado = async (n) => (await fetch(`http://127.0.0.1:${http(n)}/estado`, { signal: AbortSignal.timeout(800) })).json();
  const pulsar = async (n, ms = 900) => (await fetch(`http://127.0.0.1:${http(n)}/pulsar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ms }), signal: AbortSignal.timeout(800) })).json();
  const todos = async (ns) => { const o = {}; for (const n of ns) { try { o[n] = await estado(n); } catch { o[n] = null; } } return o; };
  const cerrar = async () => { for (const n of [1, 2, 3]) await parar(n); fs.rmSync(datos, { recursive: true, force: true }); };
  return { arrancar, parar, estado, pulsar, todos, cerrar };
}
const lider = (e) => { const ls = Object.values(e).filter((x) => x && x.rol === 'lider'); return ls.length === 1 ? ls[0] : null; };

test('Raft real: elección, caída del líder, reelección, reincorporación sincronizada y pérdida de quórum', opts, async () => {
  const g = grupo();
  try {
    [1, 2, 3].forEach(g.arrancar);
    // 1) elección inicial: un solo líder y los demás lo reconocen
    let e = await esperar(async () => { const x = await g.todos([1, 2, 3]); const l = lider(x); return l && Object.values(x).every((s) => s && s.lider_conocido === l.nodo) ? x : false; }, 20000, 'líder inicial');
    const l1 = lider(e).nodo, t1 = lider(e).termino;
    const resto = [1, 2, 3].filter((n) => n !== l1);

    // 2) un seguidor recibe una pulsación: la reenvía al líder y la confirma la mayoría
    const p = await g.pulsar(resto[0]);
    assert.equal(p.ok, true);
    e = await esperar(async () => { const x = await g.todos([1, 2, 3]); return Object.values(x).every((s) => s && s.commit_index === 2 && s.log_len === 2) ? x : false; }, 10000, 'evento confirmado en los 3');

    // 3) el líder muere de verdad: los otros dos eligen uno nuevo en un término mayor
    await g.parar(l1);
    e = await esperar(async () => { const x = await g.todos(resto); const l = lider(x); return l && l.nodo !== l1 && l.termino > t1 && resto.every((n) => x[n].lider_conocido === l.nodo) ? x : false; }, 25000, 'nueva elección entre los 2 restantes');
    const l2 = lider(e).nodo;
    // con 2 de 3 se sigue confirmando
    const p2 = await g.pulsar(resto.find((n) => n !== l2));
    assert.equal(p2.ok, true);
    // (el nuevo líder añade al log la entrada "inicio de término" antes del evento)
    const largo = await esperar(async () => { const x = await g.todos(resto); const L = x[l2]; return L && L.log_len >= 4 && resto.every((n) => x[n] && x[n].commit_index === L.log_len && x[n].log_len === L.log_len) ? L.log_len : false; }, 10000, 'con 2 de 3 se confirma');

    // 4) el caído vuelve: se reincorpora como seguidor y recupera TODO el log (incluido lo que se perdió)
    g.arrancar(l1);
    await esperar(async () => { const s = await g.estado(l1); return s.rol === 'seguidor' && s.lider_conocido === l2 && s.log_len === largo && s.commit_index === largo && s.situacion === 'funcionando' ? s : false; }, 20000, 'reincorporación y sincronización');

    // 5) sin mayoría: se apagan dos nodos, el que queda NO puede confirmar
    const solo = l1;
    for (const n of [1, 2, 3].filter((x) => x !== solo)) await g.parar(n);
    await dormir(1500);
    const antes = await g.estado(solo);
    const p3 = await g.pulsar(solo);
    assert.equal(p3.ok, true);
    assert.notEqual(p3.resultado, 'confirmada');
    await dormir(6000);
    const aun = await g.estado(solo);
    assert.equal(aun.commit_index, antes.commit_index, 'sin quórum el commit no avanza');
    assert.notEqual(aun.rol, 'lider', 'un nodo solo no puede ser líder (no consigue mayoría)');
    assert.equal(aun.situacion, 'sincronizando');
    // 6) vuelve la mayoría: se elige líder y el evento pendiente se confirma
    const otro = [1, 2, 3].find((x) => x !== solo);
    g.arrancar(otro);
    await esperar(async () => { const x = await g.todos([solo, otro]); const l = lider(x); return l && Object.values(x).every((s) => s && s.commit_index === s.log_len && s.log_len > largo) ? x : false; }, 30000, 'quórum recuperado y evento confirmado');
  } finally { await g.cerrar(); }
});
