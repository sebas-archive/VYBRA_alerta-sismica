/**
 * Capturas de TERMINAL / INFRAESTRUCTURA / PRUEBAS para el documento final VYBRA.
 *
 * Ejecuta comandos REALES contra el stack Docker en ejecucion (docker, curl, jq, psql dentro de
 * los contenedores) y contra los registros REALES de entrega/05-pruebas/logs, guarda el texto
 * tal cual en _scripts/salidas/ y lo renderiza con Chromium sobre un HTML monoespaciado.
 * No se inventa ninguna salida: el texto de cada figura es el stdout/stderr real del comando o
 * el extracto literal del archivo de log indicado.
 *
 * Figuras:
 *   FIG-SRV-01..03  API HTTP de los servidores de datos 8101-8103
 *   FIG-SRV-04..06  consultas psql reales a PostgreSQL 1..3
 *   FIG-NOD-01..03  API HTTP de los nodos simulados 9001-9003
 *   FIG-INF-01..06  docker ps, compose ps, stats, healthchecks, uname/os-release, controlador
 *   FIG-TST-01..07  pruebas C++, JS, DB, infra, firmware, Raft y tres corridas
 *
 * Uso:  NODE_PATH=/tmp/pw/node_modules node capturar-terminales.cjs
 * Salida: /tmp/capturas-final/raw/*.png + /tmp/capturas-final/terminal-meta.json
 *         entrega/11-documento-final/figuras/_scripts/salidas/*.txt
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright-core');

const REPO = process.env.REPO || '/home/t1an/detector de sismos en red distribuida';
const CHROME = process.env.CHROME || '/home/t1an/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const RAW = process.env.RAW_DIR || '/tmp/capturas-final/raw';
const META = process.env.TERM_META || '/tmp/capturas-final/terminal-meta.json';
const SALIDAS = process.env.SALIDAS_DIR || path.join(REPO, 'entrega/11-documento-final/figuras/_scripts/salidas');
const TZ = 'America/Bogota';
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(path.dirname(META), { recursive: true });
fs.mkdirSync(SALIDAS, { recursive: true });

const FIGURAS = [];
const incidencias = [];

function bogotaISO(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d).reduce((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}-05:00`;
}
function pngSize(buf) { return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function sh(cmd) {
  try {
    return execSync(cmd + ' 2>&1', { cwd: REPO, encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024 }).replace(/\s+$/, '');
  } catch (e) {
    const out = ((e.stdout || '') + (e.stderr || '')).replace(/\s+$/, '');
    incidencias.push(`comando con exit ${e.status}: ${cmd.slice(0, 120)}`);
    return out + `\n[exit=${e.status}]`;
  }
}
function bloque(cmd, extra = '') {
  return { cmd, out: sh(cmd), extra };
}
function registrar(fig) { FIGURAS.push(fig); }

/* ============================ SERVIDORES DE DATOS (8101-8103) ============================ */
for (const n of [1, 2, 3]) {
  const p = 8100 + n;
  registrar({
    id: `FIG-SRV-0${n}`, grupo: 'SRV', orden: n,
    archivo: `FIG-SRV-0${n}-api-servidor-${n}.png`,
    titulo: `Servidor de datos ${n} · API HTTP real (127.0.0.1:${p})`,
    caption: `API HTTP real del servidor de datos ${n} publicado en 127.0.0.1:${p}: /salud, /info con el estado de su PostgreSQL, /api/publico y /retención. Salida de terminal real renderizada (JSON formateado con jq, sin alterar datos).`,
    fuente: `Salida real de curl/jq contra http://127.0.0.1:${p} en el stack Docker, renderizada con Chromium sobre HTML monoespaciado.`,
    bloques: [
      bloque(`curl -sS -m 5 http://127.0.0.1:${p}/salud`),
      bloque(`curl -sS -m 5 http://127.0.0.1:${p}/info | jq '{servidor, sistema, node, nodo, bd: {ok: .bd.ok, version: .bd.version, conteos: .bd.conteos, tamanoBytes: .bd.tamanoBytes}}'`),
      bloque(`curl -sS -m 5 'http://127.0.0.1:${p}/api/publico?limite=2' | jq '{tipo, servidor, total, pagina, paginas, registros}'`),
      bloque(`curl -sS -m 5 http://127.0.0.1:${p}/retencion | jq '{servidor, config: {activa: .config.activa, modo: .config.modo, dias: .config.dias, criticoNivel: .config.criticoNivel}}'`),
    ],
    notas: 'Los puertos 8101-8103 son los publicados por docker-compose.yml para los servicios servidor1..3.',
  });
}

/* ============================ POSTGRESQL (psql real) ============================ */
for (const n of [1, 2, 3]) {
  const c = `sismo-db-${n}`;
  registrar({
    id: `FIG-SRV-0${n + 3}`, grupo: 'SRV', orden: n + 3,
    archivo: `FIG-SRV-0${n + 3}-psql-postgresql-${n}.png`,
    titulo: `PostgreSQL ${n} · consultas psql reales (contenedor ${c})`,
    caption: `Consultas psql reales sobre la base PostgreSQL ${n} (contenedor ${c}): motor y base, tablas, conteos por tabla y últimos eventos y alertas persistidos. Salida de terminal real renderizada.`,
    fuente: `Salida real de docker exec ${c} psql -U vybra -d vybra, renderizada con Chromium sobre HTML monoespaciado.`,
    bloques: [
      bloque(`docker exec ${c} psql -U vybra -d vybra -c "SELECT current_database() AS base, current_setting('server_version') AS version, inet_server_addr() AS ip;"`),
      bloque(`docker exec ${c} psql -U vybra -d vybra -c '\\dt'`),
      bloque(`docker exec ${c} psql -U vybra -d vybra -c "SELECT 'muestras' AS tabla, count(*) FROM muestras UNION ALL SELECT 'log_entradas', count(*) FROM log_entradas UNION ALL SELECT 'eventos', count(*) FROM eventos UNION ALL SELECT 'alertas', count(*) FROM alertas UNION ALL SELECT 'sucesos', count(*) FROM sucesos UNION ALL SELECT 'acciones', count(*) FROM acciones ORDER BY 1;"`),
      bloque(`docker exec ${c} psql -U vybra -d vybra -c "SELECT id, nodo, nivel, pga, duracion_ms, to_char(to_timestamp(t_ms/1000.0) AT TIME ZONE 'America/Bogota','YYYY-MM-DD HH24:MI:SS') AS hora, confirmado FROM eventos ORDER BY t_ms DESC LIMIT 4;"`),
      bloque(`docker exec ${c} psql -U vybra -d vybra -c "SELECT alerta_id, nivel, promedio, termino, lider, eventos FROM alertas ORDER BY t_ms DESC NULLS LAST LIMIT 4;"`),
    ],
    notas: 'El contenedor de base no publica puertos al host; se consulta con docker exec, igual que lo hace el servidor de datos.',
  });
}

/* ============================ NODOS SIMULADOS (9001-9003) ============================ */
for (const n of [1, 2, 3]) {
  const p = 9000 + n;
  registrar({
    id: `FIG-NOD-0${n}`, grupo: 'NOD', orden: n,
    archivo: `FIG-NOD-0${n}-api-nodo-${n}.png`,
    titulo: `Nodo simulado ${n} · API HTTP real (127.0.0.1:${p})`,
    caption: `API HTTP real del nodo simulado ${n} (ESP32 con el núcleo Raft real del firmware, publicado en 127.0.0.1:${p}): /estado, /sucesos, /alertas y las últimas entradas de /log. Salida de terminal real renderizada.`,
    fuente: `Salida real de curl/jq contra http://127.0.0.1:${p} en el stack Docker, renderizada con Chromium sobre HTML monoespaciado.`,
    bloques: [
      bloque(`curl -sS -m 5 http://127.0.0.1:${p}/estado | jq .`),
      bloque(`curl -sS -m 5 http://127.0.0.1:${p}/sucesos | jq .`),
      bloque(`curl -sS -m 5 http://127.0.0.1:${p}/alertas | jq '{alertas: .alertas[-2:]}'`),
      bloque(`curl -sS -m 5 http://127.0.0.1:${p}/log | jq '{desde, log_len, commit_index, entradas: .entradas[-2:]}'`),
    ],
    notas: 'Los nodos son contenedores con el firmware compilado para Linux (nodo-sim); no son las placas fisicas.',
  });
}

/* ============================ INFRAESTRUCTURA ============================ */
registrar({
  id: 'FIG-INF-01', grupo: 'INF', orden: 1,
  archivo: 'FIG-INF-01-docker-ps.png',
  titulo: 'Infraestructura · docker ps del stack real',
  caption: 'Salida real de docker ps con los 11 contenedores del stack VYBRA en ejecución: nombres, estado y puertos publicados del panel, servidores de datos, nodos simulados, PostgreSQL y controlador.',
  fuente: 'Salida real de `docker ps` en el host de despliegue, renderizada con Chromium sobre HTML monoespaciado.',
  bloques: [
    bloque(`docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"`),
    bloque(`printf 'contenedores del proyecto: '; docker ps --format '{{.Names}}' | grep -c '^sismo-'`),
  ],
  notas: '',
});

registrar({
  id: 'FIG-INF-02', grupo: 'INF', orden: 2,
  archivo: 'FIG-INF-02-docker-compose-ps.png',
  titulo: 'Infraestructura · docker compose ps y servicios del compose',
  caption: 'Salida real de docker compose ps con el mapeo contenedor→servicio del compose y la lista de los 11 servicios del perfil por defecto.',
  fuente: 'Salida real de `docker compose ps` y `docker compose config --services`, renderizada con Chromium sobre HTML monoespaciado.',
  bloques: [
    bloque(`docker compose ps --format "table {{.Name}}\\t{{.Service}}\\t{{.Status}}"`),
    bloque(`docker compose config --services`),
  ],
  notas: '',
});

registrar({
  id: 'FIG-INF-03', grupo: 'INF', orden: 3,
  archivo: 'FIG-INF-03-docker-stats.png',
  titulo: 'Infraestructura · docker stats --no-stream',
  caption: 'Salida real de docker stats --no-stream: consumo instantáneo de CPU, memoria, red y bloque de los 11 contenedores del stack.',
  fuente: 'Salida real de `docker stats --no-stream` en el host de despliegue, renderizada con Chromium sobre HTML monoespaciado.',
  bloques: [
    bloque(`docker stats --no-stream --format "table {{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}\\t{{.MemPerc}}\\t{{.NetIO}}\\t{{.BlockIO}}"`),
  ],
  notas: '',
});

registrar({
  id: 'FIG-INF-04', grupo: 'INF', orden: 4,
  archivo: 'FIG-INF-04-healthchecks.png',
  titulo: 'Infraestructura · healthchecks y sondas HTTP',
  caption: 'Healthchecks reales de los 11 contenedores (docker inspect) y códigos HTTP devueltos por los servicios: panel, los tres servidores de datos y los tres nodos.',
  fuente: 'Salida real de `docker inspect` y `curl` contra el stack, renderizada con Chromium sobre HTML monoespaciado.',
  bloques: [
    bloque(`docker inspect --format '{{.Name}} -> {{if .State.Health}}{{.State.Health.Status}}{{else}}sin healthcheck{{end}}' $(docker compose ps -q) | sort`),
    bloque(`for u in http://127.0.0.1:8101/salud http://127.0.0.1:8102/salud http://127.0.0.1:8103/salud http://127.0.0.1:9001/estado http://127.0.0.1:9002/estado http://127.0.0.1:9003/estado http://127.0.0.1:8095/api/estado http://127.0.0.1:8095/admin/; do printf '%-46s -> ' "$u"; curl -sS -m 5 -o /dev/null -w '%{http_code}\\n' "$u"; done`),
  ],
  notas: '',
});

registrar({
  id: 'FIG-INF-05', grupo: 'INF', orden: 5,
  archivo: 'FIG-INF-05-tres-so.png',
  titulo: 'Infraestructura · sistema operativo de los tres servidores',
  caption: 'Salida real de uname y /etc/os-release dentro de los contenedores de los tres servidores de datos: Fedora Linux 42, openSUSE Leap 15.6 y Ubuntu 24.04 LTS sobre el mismo kernel del host.',
  fuente: 'Salida real de `docker exec sismo-servidor-N` con uname/os-release, renderizada con Chromium sobre HTML monoespaciado.',
  bloques: [
    bloque(`for c in sismo-servidor-1 sismo-servidor-2 sismo-servidor-3; do echo "## $c"; docker exec $c sh -c 'uname -sr; grep -E "^(NAME|VERSION|PRETTY_NAME|VERSION_ID)=" /etc/os-release'; echo; done`),
  ],
  notas: '',
});

registrar({
  id: 'FIG-INF-06', grupo: 'INF', orden: 6,
  archivo: 'FIG-INF-06-controlador.png',
  titulo: 'Infraestructura · controlador (logs reales)',
  caption: 'Controlador de infraestructura: log real del contenedor sismo-controlador y su estado/healthcheck. El log registra el arranque; el controlador opera bajo demanda desde el panel.',
  fuente: 'Salida real de `docker logs` y `docker inspect`, renderizada con Chromium sobre HTML monoespaciado.',
  bloques: [
    bloque(`docker logs sismo-controlador --tail 40`),
    bloque(`docker inspect --format '{{.Name}} estado={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}} reinicios={{.RestartCount}}' sismo-controlador`),
  ],
  notas: '',
});

/* ============================ PRUEBAS (registros reales) ============================ */
const L = (f) => `entrega/05-pruebas/logs/${f}`;
registrar({
  id: 'FIG-TST-01', grupo: 'TST', orden: 1,
  archivo: 'FIG-TST-01-cpp-78.png',
  titulo: 'Pruebas C++ · 5 binarios, 78 casos [ok]',
  caption: 'Salida real de las pruebas C++ del firmware portable (arnés propio): cabecera del registro, nombres de los cinco binarios y resumen de cada uno. Suman 78 casos [ok] y 0 fallas (9 API + 17 huella + 9 mensajes + 32 Raft + 11 sismo).',
  fuente: 'Extracto literal de entrega/05-pruebas/logs/TST-01-cpp.log (commit 0ee5ed4, 2026-11-18), renderizado con Chromium sobre HTML monoespaciado.',
  bloques: [
    { cmd: `head -4 ${L('TST-01-cpp.log')}`, out: sh(`head -4 ${L('TST-01-cpp.log')}`), extra: '' },
    { cmd: `grep -E '^(== bin|[0-9]+ ok, 0 fallas)' ${L('TST-01-cpp.log')}`, out: sh(`grep -E '^(== bin|[0-9]+ ok, 0 fallas)' ${L('TST-01-cpp.log')}`), extra: '' },
  ],
  notas: 'Total 78 calculado como suma de los cinco resúmenes reales: 9+17+9+32+11.',
});

registrar({
  id: 'FIG-TST-02', grupo: 'TST', orden: 2,
  archivo: 'FIG-TST-02-js-75.png',
  titulo: 'Pruebas JS · npm test (75 casos, 0 fallas)',
  caption: 'Salida real de npm test del backend Node.js: 75 casos, 60 pasan y 15 se omiten porque requieren las bases PostgreSQL; 0 fallas. Se incluyen la cabecera y el resumen del registro.',
  fuente: 'Extracto literal de entrega/05-pruebas/logs/TST-03-js.log (commit 0ee5ed4, 2026-11-18), renderizado con Chromium sobre HTML monoespaciado.',
  bloques: [
    { cmd: `head -4 ${L('TST-03-js.log')}`, out: sh(`head -4 ${L('TST-03-js.log')}`), extra: '' },
    { cmd: `tail -12 ${L('TST-03-js.log')}`, out: sh(`tail -12 ${L('TST-03-js.log')}`), extra: '' },
  ],
  notas: '',
});

registrar({
  id: 'FIG-TST-03', grupo: 'TST', orden: 3,
  archivo: 'FIG-TST-03-db-70.png',
  titulo: 'Pruebas de base de datos · npm run test:db (70 + 5)',
  caption: 'Salida real de npm run test:db contra las tres bases PostgreSQL: 75 casos, 70 pasan y 5 se omiten; 0 fallas. Se incluyen la cabecera y el resumen del registro.',
  fuente: 'Extracto literal de entrega/05-pruebas/logs/TST-04-test-db.log (commit 0ee5ed4, 2026-11-18), renderizado con Chromium sobre HTML monoespaciado.',
  bloques: [
    { cmd: `head -4 ${L('TST-04-test-db.log')}`, out: sh(`head -4 ${L('TST-04-test-db.log')}`), extra: '' },
    { cmd: `tail -13 ${L('TST-04-test-db.log')}`, out: sh(`tail -13 ${L('TST-04-test-db.log')}`), extra: '' },
  ],
  notas: '',
});

registrar({
  id: 'FIG-TST-04', grupo: 'TST', orden: 4,
  archivo: 'FIG-TST-04-infra-5.png',
  titulo: 'Pruebas de infraestructura · 5/5 (apagado, failover y quórum)',
  caption: 'Salida real de npm run test:infra: 5 de 5 comprobaciones superadas sobre el stack aislado (encendido, apagado y reincorporación de cada servidor y pérdida de quórum con recuperación), con sus tiempos.',
  fuente: 'Extracto literal de entrega/05-pruebas/logs/TST-05-test-infra.log (commit 0ee5ed4, 2026-11-18), renderizado con Chromium sobre HTML monoespaciado.',
  bloques: [
    { cmd: `grep -E '^(# test:infra|✔ [0-9]\\.|ℹ (tests|pass|fail))' ${L('TST-05-test-infra.log')}`, out: sh(`grep -E '^(# test:infra|✔ [0-9]\\.|ℹ (tests|pass|fail))' ${L('TST-05-test-infra.log')}`), extra: '' },
  ],
  notas: '',
});

registrar({
  id: 'FIG-TST-05', grupo: 'TST', orden: 5,
  archivo: 'FIG-TST-05-firmware.png',
  titulo: 'Pruebas de firmware · compilación de los tres nodos',
  caption: 'Salida real de arduino-cli al compilar el firmware para los tres nodos ESP32 (core esp32:esp32 3.3.12): uso de flash (84 %) y de memoria dinámica (16 %), con exit 0 en los tres y el tamaño del binario generado.',
  fuente: 'Extracto literal de entrega/05-pruebas/logs/NOD-11-compilacion.log (commit 0ee5ed4, 2026-11-18), renderizado con Chromium sobre HTML monoespaciado.',
  bloques: [
    { cmd: `head -5 ${L('NOD-11-compilacion.log')}`, out: sh(`head -5 ${L('NOD-11-compilacion.log')}`), extra: '' },
    { cmd: `grep -E '^(=== NODO=|Sketch uses|Global variables|\\[exit)' ${L('NOD-11-compilacion.log')}`, out: sh(`grep -E '^(=== NODO=|Sketch uses|Global variables|\\[exit)' ${L('NOD-11-compilacion.log')}`), extra: '' },
  ],
  notas: '',
});

registrar({
  id: 'FIG-TST-06', grupo: 'TST', orden: 6,
  archivo: 'FIG-TST-06-raft-32.png',
  titulo: 'Pruebas Raft · 32 casos [ok]',
  caption: 'Salida real del binario test_raft del núcleo de consenso: los 32 casos [ok] (elección, latidos, commit, failover y resincronización) y el resumen 32 ok, 0 fallas.',
  fuente: 'Extracto literal de entrega/05-pruebas/logs/TST-02-raft.log (commit 0ee5ed4, 2026-11-18), renderizado con Chromium sobre HTML monoespaciado.',
  bloques: [
    { cmd: `head -6 ${L('TST-02-raft.log')}`, out: sh(`head -6 ${L('TST-02-raft.log')}`), extra: '' },
    { cmd: `grep -E '^\\[ok\\]|^32 ok' ${L('TST-02-raft.log')}`, out: sh(`grep -E '^\\[ok\\]|^32 ok' ${L('TST-02-raft.log')}`), extra: '' },
  ],
  notas: '',
});

registrar({
  id: 'FIG-TST-07', grupo: 'TST', orden: 7,
  archivo: 'FIG-TST-07-tres-corridas.png',
  titulo: 'Pruebas C++ · tres corridas consecutivas',
  caption: 'Salida real de tres ejecuciones consecutivas de make test (2026-11-18): los cinco binarios con 0 fallas y exit 0 en cada corrida. Evidencia de estabilidad de las pruebas.',
  fuente: 'Extracto literal de entrega/05-pruebas/logs/TST-09-tres-corridas.log (commit 0ee5ed4, 2026-11-18), renderizado con Chromium sobre HTML monoespaciado.',
  bloques: [
    { cmd: `cat ${L('TST-09-tres-corridas.log')}`, out: sh(`cat ${L('TST-09-tres-corridas.log')}`), extra: '' },
  ],
  notas: '',
});

/* ============================ RENDER ============================ */
function html(fig, fecha) {
  const bloques = fig.bloques.map((b) => `
    <div class="blk">
      <div class="cmd"><span class="prompt">$</span> ${esc(b.cmd)}</div>
      <pre>${esc(b.out || '(sin salida)')}</pre>
    </div>`).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#f4f2ec}
    body{font-family:"DejaVu Sans Mono","Liberation Mono",monospace;color:#1d232b;width:1400px}
    .w{background:#fbfaf6;border:1px solid #cfcabe;border-radius:6px;margin:22px;overflow:hidden}
    .top{background:#eceae3;border-bottom:1px solid #d5d1c6;padding:14px 22px}
    .top .id{font-size:12px;letter-spacing:.14em;color:#5d6b7a;text-transform:uppercase}
    .top h1{font-size:18px;margin:4px 0 2px;font-weight:700;color:#152026}
    .top .meta{font-size:11.5px;color:#5d6b7a}
    .body{padding:18px 22px 8px}
    .blk{margin:0 0 14px}
    .cmd{font-size:12.5px;color:#0f4f43;background:#eef1ea;border:1px solid #dde2d6;border-radius:4px;padding:5px 8px;word-break:break-word}
    .cmd .prompt{color:#2b7a63;font-weight:700}
    pre{margin:6px 0 0;font-family:inherit;font-size:12.3px;line-height:1.5;white-space:pre-wrap;word-break:break-word;color:#20262d;background:#fff;border:1px solid #e4e0d6;border-radius:4px;padding:9px 11px}
    .foot{border-top:1px solid #ddd9cf;padding:9px 22px;font-size:10.6px;color:#6b7683;display:flex;justify-content:space-between;gap:20px}
    .nota{padding:0 22px 14px;font-size:11px;color:#6b7683}
  </style></head><body><div class="w">
    <div class="top"><div class="id">${esc(fig.id)} · ${esc(fig.grupo)}</div><h1>${esc(fig.titulo)}</h1>
      <div class="meta">Stack Docker VYBRA · commit 0ee5ed4 · capturado ${esc(fecha)} (America/Bogota)</div></div>
    <div class="body">${bloques}</div>
    ${fig.notas ? `<div class="nota">Nota: ${esc(fig.notas)}</div>` : ''}
    <div class="foot"><span>Salida de terminal real renderizada con Chromium sobre HTML monoespaciado; sin edición del texto.</span><span>VYBRA · ${esc(fig.id)}</span></div>
  </div></body></html>`;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--force-color-profile=srgb'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const capturas = [];
  for (const fig of FIGURAS) {
    const fecha = bogotaISO();
    // Guarda la salida real (auditoria) antes de renderizar
    const txt = [`# ${fig.id} — ${fig.titulo}`, `# fecha: ${fecha}`, `# fuente: ${fig.fuente}`, '']
      .concat(fig.bloques.flatMap((b) => [`$ ${b.cmd}`, b.out || '(sin salida)', ''])).join('\n');
    fs.writeFileSync(path.join(SALIDAS, `${fig.id}.txt`), txt + '\n');
    await page.setContent(html(fig, fecha), { waitUntil: 'load' });
    await page.waitForTimeout(160);
    const h = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewportSize({ width: 1400, height: Math.min(3200, Math.max(240, h + 2)) });
    await page.waitForTimeout(120);
    const file = path.join(RAW, fig.archivo.replace(/^FIG-/, 'term-FIG-'));
    const buf = await page.screenshot({ path: file, type: 'png', fullPage: true, animations: 'disabled' });
    const dim = pngSize(buf);
    const w = dim.w, hh = dim.h;
    capturas.push({
      id: fig.id, archivo: fig.archivo, grupo: fig.grupo, orden: fig.orden,
      caption_es: fig.caption, vista: fig.titulo, tema: 'no aplica (render de terminal)',
      dispositivo: 'render de terminal', viewport: `${w}x${hh} (render de salida real)`,
      fuente: fig.fuente, fecha_hora: fecha, raw: file, ancho_crudo: w, alto_crudo: hh,
      checks: { comandos: fig.bloques.length, alto_html: h, alto_png: hh },
    });
    console.log(`${fig.id} -> ${fig.archivo} (${w}x${hh}, ${(buf.length / 1024).toFixed(1)} KB)`);
  }
  await browser.close();
  const meta = { herramienta: 'Chromium 1248 (headless) sobre HTML monoespaciado; comandos reales docker/curl/jq/psql', tz: TZ, fin: bogotaISO(), total: capturas.length, capturas, incidencias };
  fs.writeFileSync(META, JSON.stringify(meta, null, 2));
  console.log(`OK ${capturas.length} figuras de terminal -> ${META}`);
  if (incidencias.length) console.log('INCIDENCIAS:', JSON.stringify(incidencias, null, 1));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
