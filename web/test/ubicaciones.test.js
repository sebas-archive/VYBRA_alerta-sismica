import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { crearUbicaciones } from '../ubicaciones.js';
import { asegurarCertificado } from '../certificado.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ubi-'));

test('ubicaciones: fija, persiste y no deja temporales', () => {
  const d = tmp();
  const f = path.join(d, 'datos', 'u.json');
  const u = crearUbicaciones(f, () => 123);
  assert.deepEqual(u.fijar(2, { lat: 1.5, lon: -77, precision: 10 }), { lat: 1.5, lon: -77, precision: 10, t: 123 });
  assert.deepEqual(crearUbicaciones(f).todas(), { 2: { lat: 1.5, lon: -77, precision: 10, t: 123 } });
  assert.deepEqual(fs.readdirSync(path.dirname(f)), ['u.json']);
  fs.rmSync(d, { recursive: true });
});

test('ubicaciones: valida con codigo 400', () => {
  const u = crearUbicaciones(null);
  const malos = [[0, {}], [4, {}], [1.5, {}],
    [1, { lat: 91, lon: 0, precision: 1 }], [1, { lat: -91, lon: 0, precision: 1 }],
    [1, { lat: 0, lon: 181, precision: 1 }], [1, { lat: 0, lon: 0, precision: -1 }],
    [1, { lat: 0, lon: 0, precision: Infinity }], [1, { lat: '1', lon: 0, precision: 1 }],
    [1, { lat: NaN, lon: 0, precision: 1 }], [1, { lat: 0, lon: 0 }]];
  for (const [n, c] of malos) assert.throws(() => u.fijar(n, c), (e) => e.codigo === 400, JSON.stringify([n, c]));
  assert.deepEqual(u.todas(), {});
});

test('ubicaciones: quitar borra, persiste atómicamente y dice si estaba', () => {
  const d = tmp();
  const f = path.join(d, 'u.json');
  const u = crearUbicaciones(f, () => 5);
  u.fijar(1, { lat: 1, lon: 2, precision: 3 });
  u.fijar(3, { lat: 4, lon: 5, precision: 6 });
  assert.equal(u.quitar(1), true);
  assert.deepEqual(u.todas(), { 3: { lat: 4, lon: 5, precision: 6, t: 5 } });
  assert.deepEqual(crearUbicaciones(f).todas(), { 3: { lat: 4, lon: 5, precision: 6, t: 5 } });
  assert.deepEqual(fs.readdirSync(d), ['u.json']);
  assert.equal(u.quitar(1), false); // ya no estaba
  assert.equal(u.quitar(2), false);
  for (const n of [0, 4, 1.5, '3']) assert.throws(() => u.quitar(n), (e) => e.codigo === 400, String(n));
  assert.deepEqual(crearUbicaciones(f).todas(), { 3: { lat: 4, lon: 5, precision: 6, t: 5 } });
  fs.rmSync(d, { recursive: true });
});

test('certificado: SAN incluye las IPv4', async () => {
  const d = tmp();
  const { cert, key } = await asegurarCertificado(d);
  assert.match(cert, /BEGIN CERTIFICATE/);
  assert.match(key, /PRIVATE KEY/);
  const texto = execFileSync('openssl', ['x509', '-in', path.join(d, 'cert.pem'), '-noout', '-text']).toString();
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i.family === 'IPv4' && !i.internal).map((i) => i.address);
  for (const ip of ['127.0.0.1', ...ips]) assert.ok(texto.includes(`IP Address:${ip}`), ip);
  // Segunda llamada reutiliza el mismo certificado.
  const otra = await asegurarCertificado(d);
  assert.equal(otra.cert, cert);
  // Las IP van ordenadas: un cambio de orden de las interfaces no regenera el certificado.
  assert.equal(fs.readFileSync(path.join(d, 'san.txt'), 'utf8'), `san:${['localhost', '127.0.0.1', ...[...new Set(ips)].sort()].join(',')}`);
  fs.rmSync(d, { recursive: true });
});
