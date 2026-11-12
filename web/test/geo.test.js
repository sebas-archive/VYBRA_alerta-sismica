import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorNodo, distanciaM, proyectar, zonaSismo, nodoMasCercano } from '../public/geo.js';

const est = (o = {}) => ({ rol: 'seguidor', caido: false, termino: 1, lider_conocido: 1, log_len: 5, commit_index: 5, ...o });
const foto = (nodos, extra = {}) => ({ nodos, fuente: 1, lider: 1, ...extra });
const nodo = (n, estado, alcanzable = true) => ({ n, alcanzable, fallos: 0, estado });

test('color: inalcanzable o caido es rojo', () => {
  const f = foto([nodo(1, est({ rol: 'lider' })), nodo(2, null, false), nodo(3, est({ caido: true })), nodo(4, null, true)]);
  for (const n of [2, 3, 4]) assert.deepEqual(colorNodo(f, n), { color: 'rojo', texto: 'Caído' });
  assert.equal(colorNodo(f, 9).color, 'rojo');
});

test('color: candidato o atrasado es azul', () => {
  const f = foto([
    nodo(1, est({ rol: 'lider' })),
    nodo(2, est({ rol: 'candidato' })),
    nodo(3, est({ log_len: 4 })),
    nodo(4, est({ commit_index: 4 })),
    nodo(5, est({ lider_conocido: 0 })),
  ]);
  for (const n of [2, 3, 4, 5]) assert.deepEqual(colorNodo(f, n), { color: 'azul', texto: 'Sincronizando' });
  assert.equal(colorNodo({ ...f, lider: null }, 1).color, 'azul');
  assert.equal(colorNodo({ ...f, fuente: null }, 1).color, 'azul');
});

test('color: al día es verde', () => {
  const f = foto([nodo(1, est({ rol: 'lider', lider_conocido: 1 })), nodo(2, est())]);
  assert.deepEqual(colorNodo(f, 1), { color: 'verde', texto: 'Al día' });
  assert.deepEqual(colorNodo(f, 2), { color: 'verde', texto: 'Al día' });
});

test('color: si reconoce otro líder que el de la foto es azul', () => {
  const f = foto([nodo(1, est({ rol: 'lider', lider_conocido: 1 })), nodo(2, est({ lider_conocido: 3 }))]);
  assert.equal(colorNodo(f, 1).color, 'verde');
  assert.deepEqual(colorNodo(f, 2), { color: 'azul', texto: 'Sincronizando' });
});

test('distancia: 1 grado de latitud ≈ 111 km (±1%)', () => {
  const d = distanciaM({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
  assert.ok(Math.abs(d - 111195) / 111195 < 0.01);
});

const ub = { 1: { lat: 4.0, lon: -74.0 }, 2: { lat: 4.001, lon: -74.0 }, 3: { lat: 4.002, lon: -74.0 } };
const eventos = [{ id: 'a', nodo: 1, nivel: 2 }, { id: 'b', nodo: 2, nivel: 6 }, { id: 'c', nodo: 3, nivel: 4 }];

test('zona: centroide ponderado por nivel', () => {
  const z = zonaSismo({ eventos: ['a', 'b'] }, eventos, ub, new Set());
  assert.ok(Math.abs(z.lat - 4.00075) < 1e-9);
  assert.ok(Math.abs(z.lon + 74.0) < 1e-9);
  const d1 = distanciaM(z, ub[1]);
  assert.ok(Math.abs(z.radioM - d1) < 1e-6);
  assert.deepEqual(z.nodos.sort(), [1, 2]);
});

test('zona: excluye movidos y sin ubicar; con uno es ese nodo y 30 m; con ninguno null', () => {
  const a = { eventos: ['a', 'b', 'c'] };
  const z = zonaSismo(a, eventos, { 1: ub[1], 2: ub[2] }, new Set([2]));
  assert.deepEqual([z.lat, z.lon, z.radioM, z.nodos], [4.0, -74.0, 30, [1]]);
  assert.equal(zonaSismo(a, eventos, { 2: ub[2] }, new Set([2])), null);
  assert.equal(zonaSismo(a, eventos, {}, new Set()), null);
  assert.equal(zonaSismo({ eventos: [] }, eventos, ub, new Set()), null);
});

test('zona: radio mínimo 30 m', () => {
  const z = zonaSismo({ eventos: ['a', 'b'] }, eventos, { 1: ub[1], 2: { lat: 4.00005, lon: -74.0 } }, new Set());
  assert.equal(z.radioM, 30);
});

test('geo: un solo punto da encuadre mínimo', () => {
  const p = proyectar([{ lat: 4, lon: -74 }], 600, 400);
  assert.ok(p.metrosPorPx * 600 >= 100);
  assert.ok(Number.isFinite(p.x({ lat: 4, lon: -74 })));
  assert.equal(p.x({ lat: 4, lon: -74 }), 300);
  assert.equal(p.y({ lat: 4, lon: -74 }), 200);
});

test('geo: norte arriba, este a la derecha, todos dentro del margen', () => {
  const pts = [{ lat: 4, lon: -74 }, { lat: 4.01, lon: -73.99 }];
  const p = proyectar(pts, 600, 400, 24);
  assert.ok(p.y(pts[1]) < p.y(pts[0]));
  assert.ok(p.x(pts[1]) > p.x(pts[0]));
  for (const q of pts) {
    assert.ok(p.x(q) >= 24 - 1e-6 && p.x(q) <= 576 + 1e-6);
    assert.ok(p.y(q) >= 24 - 1e-6 && p.y(q) <= 376 + 1e-6);
  }
});

test('nodoMasCercano: ignora movidos; null sin candidatos', () => {
  assert.equal(nodoMasCercano({ lat: 4.0019, lon: -74 }, ub, new Set()), 3);
  assert.equal(nodoMasCercano({ lat: 4.0019, lon: -74 }, ub, new Set([3])), 2);
  assert.equal(nodoMasCercano({ lat: 4, lon: -74 }, {}, new Set()), null);
});
