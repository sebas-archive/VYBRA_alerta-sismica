// Certificado autofirmado para HTTPS (el celular exige contexto seguro para usar el GPS).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

export function ipsLan() {
  const ips = [];
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const i of lista ?? []) if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
  }
  return ips;
}

const SAN_PREFIJO = 'san:'; // se guarda junto al cert para saber con qué IP se generó

function ejecutar(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 30000 }, (err, out, errout) => (err ? reject(new Error(`${cmd}: ${errout || err.message}`)) : resolve(out)));
  });
}

// Devuelve {cert, key} (texto PEM). Genera con openssl si falta o si cambiaron las IP.
export async function asegurarCertificado(dir) {
  const ips = ipsLan();
  const archCert = path.join(dir, 'cert.pem');
  const archKey = path.join(dir, 'key.pem');
  const archSan = path.join(dir, 'san.txt');
  const san = ['localhost', '127.0.0.1', ...ips].join(',');
  let vigente = false;
  try {
    vigente = fs.existsSync(archCert) && fs.existsSync(archKey) && fs.readFileSync(archSan, 'utf8') === SAN_PREFIJO + san;
  } catch { /* sin san.txt: se regenera */ }
  if (!vigente) {
    fs.mkdirSync(dir, { recursive: true });
    const lista = ['DNS:localhost', 'IP:127.0.0.1', ...ips.map((ip) => `IP:${ip}`)].join(',');
    await ejecutar('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '825',
      '-keyout', archKey, '-out', archCert,
      '-subj', '/CN=detector-sismos',
      '-addext', `subjectAltName=${lista}`,
    ]);
    fs.writeFileSync(archSan, SAN_PREFIJO + san);
  }
  return { cert: fs.readFileSync(archCert, 'utf8'), key: fs.readFileSync(archKey, 'utf8') };
}
