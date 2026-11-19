/**
 * Capturas COMPLETAS de la interfaz VYBRA contra el stack Docker real.
 *
 *   ADMIN   (http://127.0.0.1:8095/admin/)   : 9 vistas x (escritorio claro, escritorio oscuro,
 *                                              movil claro) + 4 vistas movil oscuro.
 *   CLIENTE (http://127.0.0.1:8095/cliente/) : 14 vistas x (escritorio claro, escritorio oscuro,
 *                                              movil claro) + 4 vistas movil oscuro.
 *
 * Reglas de salida (las consume construir-manifiesto.py):
 *   FIG-UI-ADM-NN            escritorio claro (ID base)
 *   FIG-UI-ADM-NN-D          escritorio oscuro
 *   FIG-UI-ADM-NN-M          movil claro
 *   FIG-UI-ADM-NN-M-D        movil oscuro (solo representativas)
 *   FIG-UI-CLI-NN ... idem.
 *
 * Uso:
 *   NODE_PATH=/tmp/pw/node_modules node capturar-ui.cjs
 * Salida: /tmp/capturas-final/raw/*.png + /tmp/capturas-final/ui-meta.json
 * No modifica ningun archivo del repositorio: solo escribe en /tmp y en figuras/ lo hara el
 * optimizador. Requiere el stack Docker arriba (panel 8095).
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const CHROME = process.env.CHROME || '/home/t1an/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8095';
const RAW = process.env.RAW_DIR || '/tmp/capturas-final/raw';
const META = process.env.UI_META || '/tmp/capturas-final/ui-meta.json';
const TZ = 'America/Bogota';
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(path.dirname(META), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const capturas = [];
const incidencias = [];

function bogotaISO(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d).reduce((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}-05:00`;
}
function pngSize(buf) { return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; }

/* =====================================================================================
   ADMIN
   ===================================================================================== */
const ADMIN_VISTAS = [
  { orden: 1, vista: 'Panorama', slug: 'panorama',
    caption: 'Panel ADMIN, vista Panorama: estado del sistema en vivo, quórum Raft 3/3, líder, índice de confirmación, actividad de señal y eventos recientes.',
    wait: `(() => { const t=(document.querySelector('main')?.innerText||'').replace(/\\s+/g,' '); return /ÍNDICE DE CONFIRMACI/.test(t) && /Actividad de señal/.test(t) && /Totalmente replicado|Replicación pendiente|Sincronizando/.test(t) && document.querySelectorAll('main svg circle').length>=3; })()` },
  { orden: 2, vista: 'Sismógrafos', slug: 'sismografos',
    caption: 'Panel ADMIN, vista Sismógrafos: trazas de los tres detectores, ventana de coincidencia de 10 s y eventos reales (ventana de 5 min seleccionada con el control de la interfaz).',
    wait: `(() => { const t=(document.querySelector('main')?.innerText||'').replace(/\\s+/g,' '); return /Trazas ilustrativas/.test(t) && /Eventos en vivo 3\\/3 canales/.test(t) && /Ventana de coincidencia 10 s/.test(t) && /último reporte/.test(t) && document.querySelectorAll('main svg').length>=3; })()`,
    setup: `(() => { const b=[...document.querySelectorAll('main button')].find(x=>(x.textContent||'').trim()==='5 min'); if (!b) return false; b.click(); return b.className || 'clicked'; })()` },
  { orden: 3, vista: 'Alertas', slug: 'alertas',
    caption: 'Panel ADMIN, vista Alertas: bandeja de alertas reales del clúster y detalle de la alerta seleccionada con la regla de correlación, el promedio de intensidad y el término Raft.',
    wait: `(() => { const t=(document.querySelector('main')?.innerText||'').replace(/\\s+/g,' '); const rows=document.querySelectorAll('.alert-rows .alert-row').length; const det=document.querySelector('.incident-detail'); return /Bandeja de alertas/.test(t) && rows>0 && !!det && !det.classList.contains('al-empty') && document.querySelectorAll('main .sx-box').length>=2; })()` },
  { orden: 4, vista: 'Histórico', slug: 'historico',
    caption: 'Panel ADMIN, vista Histórico: eventos leídos de las tres bases PostgreSQL reales con filtros, paginación y exportación CSV.',
    wait: `(() => { const t=(document.querySelector('main')?.innerText||'').replace(/\\s+/g,' '); return !document.querySelector('.hist-skeleton') && !document.querySelector('.hist-loading') && document.querySelectorAll('.hist-table .hist-row').length>0 && /Página 1 de \\d+/.test(t) && /registro/.test(t); })()` },
  { orden: 5, vista: 'Clúster Raft', slug: 'cluster-raft',
    caption: 'Panel ADMIN, vista Clúster Raft: líder y término actuales, estado de los tres servidores y línea temporal del consenso con sucesos reales de elección.',
    wait: `(() => { const t=(document.querySelector('main')?.innerText||'').replace(/\\s+/g,' '); const serv=(t.match(/Servidor [123]/g)||[]).length; return /RED RAFT · TÉRMINO/.test(t) && /Línea temporal del consenso/.test(t) && /Sucesos reales de los tres servidores/.test(t) && serv>=3; })()` },
  { orden: 6, vista: 'Servidores', slug: 'servidores',
    caption: 'Panel ADMIN, vista Servidores: estado de los tres contenedores de servidor, sistema operativo, PostgreSQL, conteos de datos y botones de apagado.',
    taller: 1100,
    wait: `(() => { const t=(document.querySelector('main')?.innerText||'').replace(/\\s+/g,' '); return document.querySelectorAll('.servers-grid > *').length>=3 && /Contenedor de la base/.test(t) && /Sistema operativo/.test(t) && /PostgreSQL/.test(t) && /Apagar servidor/.test(t) && !/Consultando la infraestructura/.test(t); })()` },
  { orden: 7, vista: 'Detectores', slug: 'detectores',
    caption: 'Panel ADMIN, vista Detectores: tres detectores conectados, última lectura real, botones de intensidad simulada y actividad reciente.',
    wait: `(() => { const t=(document.querySelector('main')?.innerText||'').replace(/\\s+/g,' '); return /Espacio de detectores/.test(t) && /CONECTADOS/.test(t) && /Actividad reciente/.test(t) && document.querySelectorAll('.detector-spark').length>=3 && /Nivel \\d+ · \\d{2}:\\d{2}/.test(t); })()` },
  { orden: 8, vista: 'Registros', slug: 'registros',
    caption: 'Panel ADMIN, vista Registros: log de consenso confirmado por mayoría, integridad verificada y exportación CSV.',
    wait: `(() => { const t=(document.querySelector('main')?.innerText||'').replace(/\\s+/g,' '); return /Integridad del log verificada/.test(t) && /Log de consenso/.test(t) && /Exportar CSV/.test(t) && /Evento: nodo-/.test(t) && document.querySelectorAll('.rg-table.log .rg-row').length>=4; })()` },
  { orden: 9, vista: 'Configuración', slug: 'configuracion',
    caption: 'Panel ADMIN, vista Configuración: tema, tamaño de letra, animaciones, idioma, formato de hora y escala de las gráficas.',
    wait: `(() => { const t=(document.querySelector('main')?.innerText||'').replace(/\\s+/g,' '); return /APARIENCIA/.test(t) && /Tamaño de letra/.test(t) && /Idioma/.test(t) && /Formato de hora/.test(t); })()` },
];
const ADMIN_MOBILE_DARK = [1, 2, 6, 9]; // Panorama, Sismógrafos, Servidores, Configuración
const MOBILE_LABEL = (vista) => (vista === 'Clúster Raft' ? 'Clúster' : vista);

const READY_ADMIN = `(() => {
  const txt = (s) => (document.querySelector(s)?.textContent || '').replace(/\\s+/g,' ').trim();
  const body = document.body.innerText || '';
  return /Conectado,/.test(txt('.toolbar-conn'))
    && /En vivo/.test(txt('.sidebar .version'))
    && !/Sin conexión con el servidor del PC/.test(body)
    && !document.querySelector('.alarm-overlay');
})()`;

async function cerrarBannerAdmin(page) {
  const n = await page.evaluate(() => {
    const x = document.querySelector('.island-slot[data-place="bar"] .isl-x');
    if (!x) return 0; x.click(); return 1;
  }).catch(() => 0);
  if (n) await page.waitForTimeout(450);
  return n;
}
async function cerrarAlarmaAdmin(page) {
  const ov = await page.$('.alarm-overlay');
  if (!ov) return false;
  await page.click('.alarm-dismiss').catch(() => {});
  await page.waitForTimeout(700);
  await page.waitForFunction(() => !document.querySelector('.alarm-overlay'), null, { timeout: 8000 }).catch(() => {});
  return true;
}
async function gotoAdminView(page, vista, mobile) {
  if (mobile) {
    if (vista === 'Configuración') {
      await page.click('.mobile-gear', { timeout: 8000 });
    } else {
      const ok = await page.evaluate((lab) => {
        const b = [...document.querySelectorAll('.mobile-nav button')].find((x) => (x.textContent || '').trim() === lab);
        if (!b) return false; b.click(); return true;
      }, MOBILE_LABEL(vista));
      if (!ok) throw new Error(`No encontré el botón móvil "${MOBILE_LABEL(vista)}"`);
    }
  } else {
    try {
      await page.click(`.sidebar nav button[title="${vista}"]`, { timeout: 8000 });
    } catch (e) {
      const ok = await page.evaluate((v) => {
        const b = document.querySelector(`.sidebar nav button[title="${v}"]`);
        if (!b) return false; b.click(); return true;
      }, vista);
      if (!ok) throw new Error(`No encontré el botón lateral "${vista}"`);
    }
  }
  await page.waitForFunction((v) => (document.querySelector('.toolbar h1')?.textContent || '').trim() === v, vista, { timeout: 15000 });
  const v = ADMIN_VISTAS.find((x) => x.vista === vista);
  if (v.setup) {
    const done = await page.evaluate(v.setup);
    if (!done) incidencias.push(`ADMIN ${vista}: el control de ventana de 5 min no apareció`);
    await page.waitForTimeout(700);
  }
  await page.waitForFunction(v.wait, null, { timeout: 45000 });
  await page.evaluate(() => { const m = document.querySelector('main'); if (m) m.scrollTop = 0; window.scrollTo(0, 0); });
  await page.waitForTimeout(1100);
  await cerrarAlarmaAdmin(page);
  const vp = page.viewportSize();
  await page.mouse.move(vp.width - 6, 4);
  await page.waitForTimeout(350);
}

async function shotPng(page, nombre) {
  for (let intento = 1; intento <= 3; intento++) {
    await cerrarAlarmaAdmin(page);
    await page.waitForFunction(() => !document.querySelector('.alarm-overlay'), null, { timeout: 8000 }).catch(() => {});
    const vp = page.viewportSize();
    await page.mouse.move(vp.width - 6, 4);
    await page.waitForTimeout(250);
    const buf = await page.screenshot({ type: 'png', animations: 'disabled' });
    const sucio = await page.evaluate(() => !!document.querySelector('.alarm-overlay') || /Sin conexión con el servidor del PC/.test(document.body.innerText));
    if (sucio && intento < 3) { await page.waitForTimeout(1200); continue; }
    if (sucio) incidencias.push(`ADMIN ${nombre}: captura con alerta o sin conexión (intento ${intento})`);
    const file = path.join(RAW, nombre);
    fs.writeFileSync(file, buf);
    const { w, h } = pngSize(buf);
    return { raw: file, ancho: w, alto: h, bytes: buf.length, capturado_en: bogotaISO(), url: page.url(), dpr: await page.evaluate(() => window.devicePixelRatio) };
  }
  throw new Error('No se pudo capturar limpio ' + nombre);
}

function registrar({ id, archivo, grupo, caption, vista, tema, dispositivo, viewport, fuente, raw, checks }) {
  const s = raw ? { ...raw } : {};
  capturas.push({
    id, archivo, grupo, orden: Number((id.match(/-(\d{2})(?:-|$)/) || [])[1] || 0),
    caption_es: caption, vista, tema, dispositivo, viewport, fuente,
    fecha_hora: s.capturado_en || bogotaISO(),
    raw: s.raw || null, ancho_crudo: s.ancho || null, alto_crudo: s.alto || null, checks: checks || {},
  });
}

async function pulsosAdmin() {
  try {
    const antes = await (await fetch(BASE + '/api/estado', { cache: 'no-store' })).json();
    const ids = new Set((antes.alertas || []).map((a) => a.id));
    const post = (n, ms) => fetch(`${BASE}/api/nodos/${n}/pulsar`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ ms }) });
    await post(1, 2475); await sleep(1500); await post(2, 2025);
    for (let i = 0; i < 40; i++) {
      const ahora = await (await fetch(BASE + '/api/estado', { cache: 'no-store' })).json();
      if ((ahora.alertas || []).some((a) => !ids.has(a.id))) break;
      await sleep(500);
    }
    await sleep(2500);
    console.log('ADMIN: pulsos de demostracion enviados (nodos 1 y 2) para mostrar eventos reales recientes');
  } catch (e) { incidencias.push('ADMIN: no se pudieron generar pulsos de demostracion: ' + e.message); }
}

async function capturarAdmin(browser) {
  if (process.env.PULSAR_ADMIN === '1') await pulsosAdmin();
  const FUENTE = 'Captura propia con Playwright (Chromium 1248 headless) de la SPA ADMIN real del stack Docker, http://127.0.0.1:8095/admin/';
  const vpDesk = '1400x900 DPR1';
  const vpMov = '390x844 DPR2';

  // ---------- ESCRITORIO claro ----------
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, locale: 'es-CO', timezoneId: TZ, colorScheme: 'light' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => incidencias.push('ADMIN pageerror: ' + e.message.slice(0, 160)));
  await page.goto(BASE + '/admin/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(READY_ADMIN, null, { timeout: 45000 });
  await page.waitForTimeout(1500);
  await cerrarBannerAdmin(page);
  console.log('ADMIN escritorio claro: modo real conectado');

  for (const v of ADMIN_VISTAS) {
    console.log(`ADMIN claro ${v.orden}/9 ${v.vista}`);
    if (v.taller) await page.setViewportSize({ width: 1400, height: v.taller });
    await gotoAdminView(page, v.vista, false);
    await cerrarBannerAdmin(page);
    const nombre = `adm-${String(v.orden).padStart(2, '0')}-${v.slug}-claro-desk.png`;
    const raw = await shotPng(page, nombre);
    const checks = await page.evaluate(() => ({
      h1: (document.querySelector('.toolbar h1')?.textContent || '').trim(),
      tema: document.querySelector('.desktop')?.className || '',
      fondo: getComputedStyle(document.body).backgroundColor,
    }));
    registrar({
      id: `FIG-UI-ADM-${String(v.orden).padStart(2, '0')}`,
      archivo: `FIG-UI-ADM-${String(v.orden).padStart(2, '0')}-${v.slug}.png`,
      grupo: 'UI-ADM', caption: `${v.caption} Escritorio 1400×${v.taller || 900}, tema claro.`,
      vista: v.vista, tema: 'claro', dispositivo: 'escritorio', viewport: v.taller ? `1400x${v.taller} DPR1` : vpDesk,
      fuente: FUENTE, raw, checks,
    });
    if (v.taller) await page.setViewportSize({ width: 1400, height: 900 });
  }

  // ---------- ESCRITORIO oscuro (control real de la barra lateral + verificación DOM) ----------
  await page.click('button[title="Apariencia oscura"]', { timeout: 8000 });
  await page.waitForFunction(() => document.querySelector('.desktop')?.classList.contains('dark'), null, { timeout: 8000 });
  await page.waitForTimeout(900);
  const darkCheck = await page.evaluate(() => ({
    clase: document.querySelector('.desktop')?.className || '',
    boton: document.querySelector('button[title="Apariencia clara"]')?.textContent?.trim() || '',
    fondo: getComputedStyle(document.body).backgroundColor,
  }));
  console.log('ADMIN escritorio oscuro verificado:', JSON.stringify(darkCheck).slice(0, 160));
  for (const v of ADMIN_VISTAS) {
    console.log(`ADMIN oscuro ${v.orden}/9 ${v.vista}`);
    if (v.taller) await page.setViewportSize({ width: 1400, height: v.taller });
    await gotoAdminView(page, v.vista, false);
    await cerrarBannerAdmin(page);
    const nombre = `adm-${String(v.orden).padStart(2, '0')}-${v.slug}-oscuro-desk.png`;
    const raw = await shotPng(page, nombre);
    const checks = await page.evaluate(() => ({
      h1: (document.querySelector('.toolbar h1')?.textContent || '').trim(),
      tema: document.querySelector('.desktop')?.className || '',
      fondo: getComputedStyle(document.body).backgroundColor,
      dataTheme: document.documentElement.dataset.theme || '',
    }));
    if (!String(checks.tema).includes('dark')) incidencias.push(`ADMIN oscuro ${v.vista}: el DOM no conserva la clase dark`);
    registrar({
      id: `FIG-UI-ADM-${String(v.orden).padStart(2, '0')}-D`,
      archivo: `FIG-UI-ADM-${String(v.orden).padStart(2, '0')}-${v.slug}-D.png`,
      grupo: 'UI-ADM', caption: `${v.caption} Escritorio 1400×${v.taller || 900}, tema oscuro.`,
      vista: v.vista, tema: 'oscuro', dispositivo: 'escritorio', viewport: v.taller ? `1400x${v.taller} DPR1` : vpDesk,
      fuente: FUENTE, raw, checks,
    });
    if (v.taller) await page.setViewportSize({ width: 1400, height: 900 });
  }
  await ctx.close();

  // ---------- MÓVIL claro ----------
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-CO', timezoneId: TZ, colorScheme: 'light' });
  const mp = await mctx.newPage();
  mp.on('pageerror', (e) => incidencias.push('ADMIN móvil pageerror: ' + e.message.slice(0, 160)));
  await mp.goto(BASE + '/admin/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await mp.waitForFunction(READY_ADMIN, null, { timeout: 45000 });
  await mp.waitForTimeout(1500);
  await cerrarBannerAdmin(mp);
  console.log('ADMIN móvil claro: modo real conectado');
  for (const v of ADMIN_VISTAS) {
    console.log(`ADMIN móvil ${v.orden}/9 ${v.vista}`);
    await gotoAdminView(mp, v.vista, true);
    await mp.waitForTimeout(500);
    await cerrarBannerAdmin(mp);
    const nombre = `adm-${String(v.orden).padStart(2, '0')}-${v.slug}-claro-mov.png`;
    const raw = await shotPng(mp, nombre);
    const checks = await mp.evaluate(() => ({
      h1: (document.querySelector('.toolbar h1')?.textContent || '').trim(),
      tema: document.querySelector('.desktop')?.className || '',
      fondo: getComputedStyle(document.body).backgroundColor,
    }));
    registrar({
      id: `FIG-UI-ADM-${String(v.orden).padStart(2, '0')}-M`,
      archivo: `FIG-UI-ADM-${String(v.orden).padStart(2, '0')}-${v.slug}-M.png`,
      grupo: 'UI-ADM', caption: `${v.caption} Móvil 390×844, tema claro.`,
      vista: v.vista, tema: 'claro', dispositivo: 'móvil', viewport: vpMov,
      fuente: FUENTE, raw, checks,
    });
  }

  // ---------- MÓVIL oscuro: control real de Configuración > Tema > Oscuro ----------
  await gotoAdminView(mp, 'Configuración', true);
  const okTema = await mp.evaluate(() => {
    const row = [...document.querySelectorAll('.set-row')].find((r) => /Tema/.test(r.querySelector('strong')?.textContent || ''));
    if (!row) return false;
    const b = [...row.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === 'Oscuro');
    if (!b) return false; b.click(); return true;
  });
  if (!okTema) incidencias.push('ADMIN móvil oscuro: no se encontró el control Tema > Oscuro en Configuración');
  await mp.waitForFunction(() => document.querySelector('.desktop')?.classList.contains('dark'), null, { timeout: 8000 });
  await mp.waitForTimeout(900);
  const mdark = await mp.evaluate(() => ({ clase: document.querySelector('.desktop')?.className || '', fondo: getComputedStyle(document.body).backgroundColor }));
  console.log('ADMIN móvil oscuro verificado:', JSON.stringify(mdark).slice(0, 160));
  for (const orden of ADMIN_MOBILE_DARK) {
    const v = ADMIN_VISTAS.find((x) => x.orden === orden);
    console.log(`ADMIN móvil oscuro ${v.orden}/9 ${v.vista}`);
    await gotoAdminView(mp, v.vista, true);
    await mp.waitForTimeout(600);
    await cerrarBannerAdmin(mp);
    const nombre = `adm-${String(v.orden).padStart(2, '0')}-${v.slug}-oscuro-mov.png`;
    const raw = await shotPng(mp, nombre);
    const checks = await mp.evaluate(() => ({ h1: (document.querySelector('.toolbar h1')?.textContent || '').trim(), tema: document.querySelector('.desktop')?.className || '', fondo: getComputedStyle(document.body).backgroundColor }));
    if (!String(checks.tema).includes('dark')) incidencias.push(`ADMIN móvil oscuro ${v.vista}: el DOM no conserva la clase dark`);
    registrar({
      id: `FIG-UI-ADM-${String(v.orden).padStart(2, '0')}-M-D`,
      archivo: `FIG-UI-ADM-${String(v.orden).padStart(2, '0')}-${v.slug}-M-D.png`,
      grupo: 'UI-ADM', caption: `${v.caption} Móvil 390×844, tema oscuro.`,
      vista: v.vista, tema: 'oscuro', dispositivo: 'móvil', viewport: vpMov,
      fuente: FUENTE, raw, checks,
    });
  }
  await mctx.close();
}

/* =====================================================================================
   CLIENTE
   ===================================================================================== */
const CLI_VISTAS = [
  { orden: 1, slug: 'inicio', vista: 'Inicio / estado de la red',
    caption: 'Vista CLIENTE, Inicio: estado de la red en vivo, última alerta confirmada, sismógrafos, protección y mapa.' },
  { orden: 2, slug: 'alerta-pantalla-completa', vista: 'Alerta a pantalla completa',
    caption: 'Vista CLIENTE, alerta a pantalla completa: alerta real confirmada por coincidencia de dos sismógrafos, franja SIMULACRO, pasos Agáchate/Cúbrete/Sujétate y cuenta atrás.' },
  { orden: 3, slug: 'estado-post-alerta', vista: 'Estado posterior a "Estoy a salvo"',
    caption: 'Vista CLIENTE, estado posterior a «Estoy a salvo»: bloque principal con los dos sismógrafos que coincidieron y la alerta confirmada.' },
  { orden: 4, slug: 'avisos', vista: 'Avisos',
    caption: 'Vista CLIENTE, Avisos: avisos recibidos con su estado de lectura y acceso al historial.' },
  { orden: 5, slug: 'historial-alertas', vista: 'Avisos → Historial de alertas confirmadas',
    caption: 'Vista CLIENTE, Avisos → Historial de alertas confirmadas: pestañas y periodos con alertas reales leídas de PostgreSQL.' },
  { orden: 6, slug: 'historial-lecturas', vista: 'Avisos → Historial de lecturas',
    caption: 'Vista CLIENTE, Avisos → Historial de lecturas: eventos registrados por los sismógrafos.' },
  { orden: 7, slug: 'mapa', vista: 'Mapa',
    caption: 'Vista CLIENTE, Mapa (Leaflet sobre OpenStreetMap): sismógrafos, zona estimada y registro seleccionado.' },
  { orden: 8, slug: 'detalle-alerta', vista: 'Detalle de una alerta',
    caption: 'Vista CLIENTE, detalle de una alerta real: intensidad, sismógrafos participantes, fuente, confirmación y ubicación.' },
  { orden: 9, slug: 'que-hacer-durante', vista: 'Prevención / Qué hacer — Durante',
    caption: 'Vista CLIENTE, Prevención → Durante: pasos Agáchate, Cúbrete y Sujétate y situaciones frecuentes.' },
  { orden: 10, slug: 'que-hacer-antes', vista: 'Prevención / Qué hacer — Antes',
    caption: 'Vista CLIENTE, Prevención → Antes: medidas de preparación antes de un sismo.' },
  { orden: 11, slug: 'que-hacer-despues', vista: 'Prevención / Qué hacer — Después',
    caption: 'Vista CLIENTE, Prevención → Después: revisión de daños y recomendaciones tras un sismo.' },
  { orden: 12, slug: 'proteccion', vista: 'Protección',
    caption: 'Vista CLIENTE, Protección: centro de protección con preparación y umbrales.' },
  { orden: 13, slug: 'sismografos', vista: 'Sismógrafos (telemetría)',
    caption: 'Vista CLIENTE, Sismógrafos: telemetría y últimas lecturas de los tres detectores.' },
  { orden: 14, slug: 'ajustes', vista: 'Configuración / Ajustes',
    caption: 'Vista CLIENTE, Ajustes: idioma, tema, tamaño de letra y escalas.' },
];
const CLI_MOBILE_DARK = [1, 4, 7, 14]; // Inicio, Avisos, Mapa, Ajustes
const CLI_LINKS = [
  { orden: 1, id: 'FIG-UI-CLI-01', slug: 'inicio' },
  { orden: 2, id: 'FIG-UI-CLI-02', slug: 'alerta-pantalla-completa' },
  { orden: 3, id: 'FIG-UI-CLI-03', slug: 'estado-post-alerta' },
  { orden: 4, id: 'FIG-UI-CLI-04', slug: 'avisos' },
  { orden: 5, id: 'FIG-UI-CLI-05', slug: 'historial-alertas' },
  { orden: 6, id: 'FIG-UI-CLI-06', slug: 'historial-lecturas' },
  { orden: 7, id: 'FIG-UI-CLI-07', slug: 'mapa' },
  { orden: 8, id: 'FIG-UI-CLI-08', slug: 'detalle-alerta' },
  { orden: 9, id: 'FIG-UI-CLI-09', slug: 'que-hacer-durante' },
  { orden: 10, id: 'FIG-UI-CLI-10', slug: 'que-hacer-antes' },
  { orden: 11, id: 'FIG-UI-CLI-11', slug: 'que-hacer-despues' },
  { orden: 12, id: 'FIG-UI-CLI-12', slug: 'proteccion' },
  { orden: 13, id: 'FIG-UI-CLI-13', slug: 'sismografos' },
  { orden: 14, id: 'FIG-UI-CLI-14', slug: 'ajustes' },
];

async function clickAccionVisible(page, action) {
  const ok = await page.evaluate((a) => {
    const b = [...document.querySelectorAll(`[data-action="${a}"]`)].find((x) => x.offsetWidth || x.offsetHeight);
    if (!b) return false; b.click(); return true;
  }, action);
  if (!ok) throw new Error(`No hay control visible [data-action="${action}"]`);
}

async function estadoApi() {
  const r = await fetch(BASE + '/api/estado', { cache: 'no-store' });
  if (!r.ok) throw new Error('GET /api/estado -> HTTP ' + r.status);
  return r.json();
}
async function pulso(n, ms) {
  const r = await fetch(`${BASE}/api/nodos/${n}/pulsar`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ ms }) });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) { j = txt; }
  return { status: r.status, cuerpo: j };
}
async function waitReal(page) {
  await page.waitForFunction(() => document.documentElement.dataset.vivo === '1', null, { timeout: 20000 });
  await page.waitForFunction(() => (document.querySelector('#statusTitle')?.textContent || '').trim().length > 0, null, { timeout: 15000 });
  await sleep(2000);
}
async function waitAlarm(page) {
  await page.waitForFunction(() => document.querySelector('#alarm')?.open === true, null, { timeout: 30000 });
}
async function closeAlarmIfAny(page) {
  const open = await page.evaluate(() => !!document.querySelector('#alarm')?.open);
  if (!open) return false;
  await page.evaluate(() => document.querySelector('[data-action="dismiss-alarm"]')?.click());
  await page.waitForFunction(() => !document.querySelector('#alarm')?.open, null, { timeout: 8000 }).catch(() => {});
  await sleep(1200);
  return true;
}
async function titulo(page) {
  return page.evaluate(() => {
    const on = document.querySelector('.view.on');
    const h = on && (on.querySelector('h1') || on.querySelector('h2'));
    return { titulo: h ? h.textContent.trim().replace(/\s+/g, ' ') : '', hash: location.hash, vivo: document.documentElement.dataset.vivo || '', dsTema: document.documentElement.dataset.theme || '' };
  });
}
async function clicTab(page, view) {
  await page.locator(`.tabbar [data-view="${view}"]`).first().click({ timeout: 10000 });
  await sleep(2400);
}
async function irHash(page, h) { await page.evaluate((x) => { location.hash = x; }, h); await sleep(2600); }
async function esperarMapa(page) {
  try {
    await page.waitForFunction(() => document.querySelectorAll('.leaflet-tile-loaded').length > 0, null, { timeout: 15000 });
  } catch (e) {
    incidencias.push('CLIENTE: el mapa no cargó teselas en 15 s');
  }
  await sleep(1600);
  return page.evaluate(() => document.querySelectorAll('.leaflet-tile-loaded').length).catch(() => 0);
}

async function generarAlerta(page, etiqueta, ms1 = 2475, ms2 = 2025) {
  const abiertaPrevia = await closeAlarmIfAny(page);
  if (abiertaPrevia) incidencias.push(`CLIENTE ${etiqueta}: se cerró una alerta previa antes de generar la nueva`);
  const antes = await estadoApi();
  const idsAntes = new Set((antes.alertas || []).map((a) => a.id));
  const t0 = bogotaISO();
  const r1 = await pulso(1, ms1);
  await sleep(1500);
  const r2 = await pulso(2, ms2);
  let abierta = true;
  try { await waitAlarm(page); } catch (e) { abierta = false; incidencias.push(`CLIENTE ${etiqueta}: la alerta no se abrió por SSE en 30 s`); }
  let detalle = null;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const ahora = await estadoApi();
    const nuevas = (ahora.alertas || []).filter((a) => !idsAntes.has(a.id));
    if (nuevas.length) { detalle = nuevas[nuevas.length - 1]; break; }
    await sleep(600);
  }
  const modal = abierta ? await page.evaluate(() => ({
    kicker: (document.querySelector('#alarmKicker') || {}).textContent || '',
    heading: (document.querySelector('#alarmHeading') || {}).textContent || '',
    action: (document.querySelector('#alarmAction') || {}).textContent || '',
    meta: (document.querySelector('#alarmMeta') || {}).textContent || '',
    timer: (document.querySelector('#alarmTimer') || {}).textContent || '',
    pasos: [...document.querySelectorAll('.alarm-steps b')].map((b) => b.textContent.trim()),
    dismiss: (document.querySelector('[data-action="dismiss-alarm"]') || {}).textContent || '',
  })) : null;
  await sleep(750);
  return {
    etiqueta, generada_en: t0, pulsaciones: [r1, r2], abierta, alerta_id: detalle ? detalle.id : null,
    alerta: detalle ? { id: detalle.id, promedio: detalle.promedio, nivel: detalle.nivel, termino: detalle.termino, lider: detalle.lider, eventos: detalle.eventos } : null,
    modal,
  };
}

async function capturarSecuenciaCliente(page, { tema, dispositivo, viewport }) {
  const fuente = 'Captura propia con Playwright (Chromium 1248 headless) de la SPA CLIENTE real del stack Docker, http://127.0.0.1:8095/cliente/';
  const ctxPref = `${dispositivo === 'escritorio' ? 'Escritorio 1400×900' : 'Móvil 390×844'}, tema ${tema}`;
  const sufijo = dispositivo === 'escritorio' ? (tema === 'claro' ? '' : '-D') : (tema === 'claro' ? '-M' : '-M-D');
  const etiqueta = `${dispositivo}/${tema}`;
  const reg = (v, raw, checks) => {
    registrar({
      id: `${CLI_LINKS[v.orden - 1].id}${sufijo}`,
      archivo: `${CLI_LINKS[v.orden - 1].id}-${v.slug}${sufijo}.png`,
      grupo: 'UI-CLI', caption: `${v.caption} ${ctxPref}.`,
      vista: v.vista, tema, dispositivo, viewport, fuente, raw, checks,
    });
  };
  const info = { dispositivo, tema, alertas: [], vistas: [] };

  await waitReal(page);
  await closeAlarmIfAny(page);
  { // 01 Inicio
    const v = CLI_VISTAS[0];
    const raw = await shotCliente(page, `cli-01-inicio-${tema}-${dispositivo}.png`, true);
    const infoTitulo = await titulo(page);
    reg(v, raw, infoTitulo);
    info.vistas.push(infoTitulo);
    console.log(`CLIENTE ${etiqueta} 01/14 Inicio ${infoTitulo.titulo}`);
  }

  // 02 alerta a pantalla completa (alerta REAL por SSE) + 03 estado posterior
  const al = await generarAlerta(page, etiqueta);
  info.alertas.push({ etiqueta, ...al });
  {
    const v = CLI_VISTAS[1];
    await waitAlarm(page).catch(() => {});
    await sleep(600);
    const raw = await shotCliente(page, `cli-02-alerta-pantalla-completa-${tema}-${dispositivo}.png`, true);
    const info2 = await titulo(page);
    info2.modal = await page.evaluate(() => ({
      kicker: (document.querySelector('#alarmKicker') || {}).textContent || '',
      heading: (document.querySelector('#alarmHeading') || {}).textContent || '',
      pasos: [...document.querySelectorAll('.alarm-steps b')].map((b) => b.textContent.trim()),
    }));
    reg(v, raw, info2);
    console.log(`CLIENTE ${etiqueta} 02/14 Alerta -> ${info2.modal.heading}`);
  }
  // 03: "Estoy a salvo"
  try {
    await page.locator('[data-action="dismiss-alarm"]').click({ timeout: 8000 });
    await sleep(2600);
  } catch (e) {
    incidencias.push(`CLIENTE ${etiqueta}: no se pudo pulsar "Estoy a salvo": ${e.message.slice(0, 120)}`);
  }
  {
    const v = CLI_VISTAS[2];
    const raw = await shotCliente(page, `cli-03-estado-post-alerta-${tema}-${dispositivo}.png`, true);
    const info3 = await page.evaluate(() => ({
      statusKicker: (document.querySelector('#statusKicker') || {}).textContent || '',
      statusTitle: (document.querySelector('#statusTitle') || {}).textContent || '',
      h1: (document.querySelector('.view.on h1, .view.on h2') || {}).textContent || '',
    }));
    reg(v, raw, info3);
    console.log(`CLIENTE ${etiqueta} 03/14 Post-alerta -> ${info3.statusTitle}`);
  }

  // 04 Avisos
  await clicTab(page, 'avisos');
  { const v = CLI_VISTAS[3]; reg(v, await shotCliente(page, `cli-04-avisos-${tema}-${dispositivo}.png`), await titulo(page)); }

  // 05 Historial alertas
  try {
    await page.locator('[data-action="open-historial"]').first().click({ timeout: 8000 });
    await sleep(3200);
    const v = CLI_VISTAS[4];
    const checks = await page.evaluate(() => ({
      activo: (document.querySelector('[data-action="hist-tipo"].on') || {}).textContent || '',
      filas: document.querySelectorAll('#histList .hist-item, #histList > *').length,
      pager: (document.querySelector('#histPage') || {}).textContent || '',
    }));
    reg(v, await shotCliente(page, `cli-05-historial-alertas-${tema}-${dispositivo}.png`), checks);
  } catch (e) { incidencias.push(`CLIENTE ${etiqueta}: no se abrió el Historial: ${e.message.slice(0, 120)}`); }

  // 06 Historial lecturas
  try {
    await page.locator('[data-action="hist-tipo"][data-tipo="eventos"]').click({ timeout: 8000 });
    await sleep(3200);
    const v = CLI_VISTAS[5];
    reg(v, await shotCliente(page, `cli-06-historial-lecturas-${tema}-${dispositivo}.png`), await titulo(page));
  } catch (e) { incidencias.push(`CLIENTE ${etiqueta}: no se pudo cambiar a Lecturas: ${e.message.slice(0, 120)}`); }

  // 07 Mapa
  await clicTab(page, 'mapa');
  const teselas = await esperarMapa(page);
  { const v = CLI_VISTAS[6]; const checks = await titulo(page); checks.teselas = teselas; reg(v, await shotCliente(page, `cli-07-mapa-${tema}-${dispositivo}.png`), checks); }

  // 08 Detalle de una alerta real
  let alertaDet = al.alerta_id;
  if (!alertaDet) { const st = await estadoApi(); alertaDet = st.alertas.slice(-1)[0].id; }
  await irHash(page, 'detalle/a-' + alertaDet);
  await sleep(1200);
  { const v = CLI_VISTAS[7]; const checks = await titulo(page); checks.alerta_id = alertaDet; reg(v, await shotCliente(page, `cli-08-detalle-alerta-${tema}-${dispositivo}.png`), checks); }

  // 09/10/11 Prevención
  await clicTab(page, 'ahora');
  try {
    await page.locator('[data-action="open-prevention"]').first().click({ timeout: 8000 });
    await sleep(2600);
    { const v = CLI_VISTAS[8]; reg(v, await shotCliente(page, `cli-09-que-hacer-durante-${tema}-${dispositivo}.png`), await titulo(page)); }
    await page.locator('[data-action="protocol"][data-protocol="antes"]').click({ timeout: 8000 });
    await sleep(1800);
    { const v = CLI_VISTAS[9]; reg(v, await shotCliente(page, `cli-10-que-hacer-antes-${tema}-${dispositivo}.png`), await titulo(page)); }
    await page.locator('[data-action="protocol"][data-protocol="despues"]').click({ timeout: 8000 });
    await sleep(1800);
    { const v = CLI_VISTAS[10]; reg(v, await shotCliente(page, `cli-11-que-hacer-despues-${tema}-${dispositivo}.png`), await titulo(page)); }
  } catch (e) { incidencias.push(`CLIENTE ${etiqueta}: fallo en Prevención: ${e.message.slice(0, 120)}`); }

  // 12 Protección
  await clicTab(page, 'proteccion');
  { const v = CLI_VISTAS[11]; reg(v, await shotCliente(page, `cli-12-proteccion-${tema}-${dispositivo}.png`), await titulo(page)); }

  // 13 Sismógrafos (se usa el control REAL visible: escritorio "Ver telemetría"; móvil "Ver todo")
  await clicTab(page, 'ahora');
  try {
    await clickAccionVisible(page, 'open-sensors');
    await page.waitForFunction(() => document.querySelector('.view.on')?.id === 'view-sismografos', null, { timeout: 10000 }).catch(() => {});
    await sleep(2600);
    const v = CLI_VISTAS[12];
    reg(v, await shotCliente(page, `cli-13-sismografos-${tema}-${dispositivo}.png`), await titulo(page));
  } catch (e) { incidencias.push(`CLIENTE ${etiqueta}: fallo en Sismógrafos: ${e.message.slice(0, 120)}`); }

  // 14 Ajustes
  await clicTab(page, 'ajustes');
  { const v = CLI_VISTAS[13]; reg(v, await shotCliente(page, `cli-14-ajustes-${tema}-${dispositivo}.png`), await titulo(page)); }

  return info;
}

async function shotCliente(page, nombre, permitirAlerta = false) {
  for (let intento = 1; intento <= 3; intento++) {
    if (!permitirAlerta) await closeAlarmIfAny(page);
    const buf = await page.screenshot({ type: 'png', animations: 'disabled' });
    const sucio = await page.evaluate(() => ({
      alarma: !!document.querySelector('#alarm')?.open,
      sinConexion: /Sin conexión|no responde/.test((document.querySelector('#svc')?.textContent || '')),
    }));
    const malo = sucio.sinConexion || (sucio.alarma && !permitirAlerta);
    if (malo && intento < 3) { await page.waitForTimeout(1200); continue; }
    if (malo) incidencias.push(`CLIENTE ${nombre}: captura con alerta/conexión cambiando`);
    const file = path.join(RAW, nombre);
    fs.writeFileSync(file, buf);
    const { w, h } = pngSize(buf);
    return { raw: file, ancho: w, alto: h, bytes: buf.length, capturado_en: bogotaISO(), url: page.url(), dpr: await page.evaluate(() => window.devicePixelRatio) };
  }
  throw new Error('No se pudo capturar limpio ' + nombre);
}

async function capturarCliente(browser) {
  const vpDesk = '1400x900 DPR1';

  // ---------- escritorio claro ----------
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, locale: 'es-CO', timezoneId: TZ, colorScheme: 'light' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => incidencias.push('CLIENTE pageerror: ' + e.message.slice(0, 160)));
  await page.goto(BASE + '/cliente/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('CLIENTE escritorio claro: cargando');
  await capturarSecuenciaCliente(page, { tema: 'claro', dispositivo: 'escritorio', viewport: vpDesk });
  await ctx.close();

  // ---------- escritorio oscuro: página nueva + control real de tema ----------
  const ctxD = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, locale: 'es-CO', timezoneId: TZ, colorScheme: 'light' });
  const pd = await ctxD.newPage();
  pd.on('pageerror', (e) => incidencias.push('CLIENTE oscuro pageerror: ' + e.message.slice(0, 160)));
  await pd.goto(BASE + '/cliente/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitReal(pd);
  await pd.click('#btnTheme', { timeout: 8000 });
  await pd.waitForFunction(() => document.documentElement.dataset.theme === 'dark', null, { timeout: 8000 });
  await pd.waitForTimeout(900);
  const verifDark = await pd.evaluate(() => ({ dataset: document.documentElement.dataset.theme, fondo: getComputedStyle(document.body).backgroundColor, aria: document.querySelector('#btnTheme')?.getAttribute('aria-label') }));
  console.log('CLIENTE escritorio oscuro verificado:', JSON.stringify(verifDark).slice(0, 160));
  await capturarSecuenciaCliente(pd, { tema: 'oscuro', dispositivo: 'escritorio', viewport: vpDesk });
  await ctxD.close();

  // ---------- móvil claro ----------
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-CO', timezoneId: TZ, colorScheme: 'light' });
  const mp = await mctx.newPage();
  mp.on('pageerror', (e) => incidencias.push('CLIENTE móvil pageerror: ' + e.message.slice(0, 160)));
  await mp.goto(BASE + '/cliente/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('CLIENTE móvil claro: cargando');
  await capturarSecuenciaCliente(mp, { tema: 'claro', dispositivo: 'móvil', viewport: '390x844 DPR2' });

  // ---------- móvil oscuro: 4 vistas representativas ----------
  await clicTab(mp, 'ajustes');
  await mp.click('#btnTheme', { timeout: 8000 });
  await mp.waitForFunction(() => document.documentElement.dataset.theme === 'dark', null, { timeout: 8000 });
  await mp.waitForTimeout(900);
  const mverif = await mp.evaluate(() => ({ dataset: document.documentElement.dataset.theme, fondo: getComputedStyle(document.body).backgroundColor }));
  console.log('CLIENTE móvil oscuro verificado:', JSON.stringify(mverif).slice(0, 160));
  const fuente = 'Captura propia con Playwright (Chromium 1248 headless) de la SPA CLIENTE real del stack Docker, http://127.0.0.1:8095/cliente/';
  for (const orden of CLI_MOBILE_DARK) {
    const v = CLI_VISTAS.find((x) => x.orden === orden);
    console.log(`CLIENTE móvil oscuro ${orden}/14 ${v.vista}`);
    if (orden === 1) { await clicTab(mp, 'ahora'); }
    else if (orden === 4) { await clicTab(mp, 'avisos'); }
    else if (orden === 7) { await clicTab(mp, 'mapa'); await esperarMapa(mp); }
    else if (orden === 14) { await clicTab(mp, 'ajustes'); }
    const raw = await shotCliente(mp, `cli-${String(orden).padStart(2, '0')}-${v.slug}-oscuro-mov.png`);
    const checks = await titulo(mp);
    checks.datasetTema = mverif.dataset;
    registrar({
      id: `${CLI_LINKS[orden - 1].id}-M-D`,
      archivo: `${CLI_LINKS[orden - 1].id}-${v.slug}-M-D.png`,
      grupo: 'UI-CLI', caption: `${v.caption} Móvil 390×844, tema oscuro.`,
      vista: v.vista, tema: 'oscuro', dispositivo: 'móvil', viewport: '390x844 DPR2',
      fuente, raw, checks,
    });
  }
  await mctx.close();
}


async function capturarCli13M(browser) {
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-CO', timezoneId: TZ, colorScheme: 'light' });
  const mp = await mctx.newPage();
  mp.on('pageerror', (e) => incidencias.push('CLIENTE móvil pageerror: ' + e.message.slice(0, 160)));
  await mp.goto(BASE + '/cliente/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitReal(mp);
  await closeAlarmIfAny(mp);
  await clicTab(mp, 'ahora');
  await clickAccionVisible(mp, 'open-sensors');
  await mp.waitForFunction(() => document.querySelector('.view.on')?.id === 'view-sismografos', null, { timeout: 10000 });
  await sleep(3200);
  const raw = await shotCliente(mp, 'cli-13-sismografos-claro-móvil.png');
  const checks = await titulo(mp);
  checks.vista_on = await mp.evaluate(() => document.querySelector('.view.on')?.id || '');
  const v = CLI_VISTAS[12];
  registrar({
    id: 'FIG-UI-CLI-13-M',
    archivo: 'FIG-UI-CLI-13-sismografos-M.png',
    grupo: 'UI-CLI', caption: `${v.caption} Móvil 390×844, tema claro.`,
    vista: v.vista, tema: 'claro', dispositivo: 'móvil', viewport: '390x844 DPR2',
    fuente: 'Captura propia con Playwright (Chromium 1248 headless) de la SPA CLIENTE real del stack Docker, http://127.0.0.1:8095/cliente/',
    raw, checks,
  });
  await mctx.close();
}


async function capturarCliMD(browser) {
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-CO', timezoneId: TZ, colorScheme: 'light' });
  const mp = await mctx.newPage();
  mp.on('pageerror', (e) => incidencias.push('CLIENTE móvil-oscuro pageerror: ' + e.message.slice(0, 160)));
  await mp.goto(BASE + '/cliente/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitReal(mp);
  await closeAlarmIfAny(mp);
  await clicTab(mp, 'ajustes');
  await mp.click('#btnTheme', { timeout: 8000 });
  await mp.waitForFunction(() => document.documentElement.dataset.theme === 'dark', null, { timeout: 8000 });
  await mp.waitForTimeout(900);
  const verif = await mp.evaluate(() => ({ dataset: document.documentElement.dataset.theme, fondo: getComputedStyle(document.body).backgroundColor }));
  console.log('CLIENTE móvil oscuro (recaptura) verificado:', JSON.stringify(verif).slice(0, 140));
  const fuente = 'Captura propia con Playwright (Chromium 1248 headless) de la SPA CLIENTE real del stack Docker, http://127.0.0.1:8095/cliente/';
  for (const orden of CLI_MOBILE_DARK) {
    const v = CLI_VISTAS.find((x) => x.orden === orden);
    if (orden === 1) await clicTab(mp, 'ahora');
    else if (orden === 4) await clicTab(mp, 'avisos');
    else if (orden === 7) { await clicTab(mp, 'mapa'); await esperarMapa(mp); }
    else if (orden === 14) await clicTab(mp, 'ajustes');
    console.log(`CLIENTE móvil oscuro ${orden}/14 ${v.vista}`);
    const raw = await shotCliente(mp, `cli-${String(orden).padStart(2, '0')}-${v.slug}-oscuro-mov.png`);
    const checks = await titulo(mp);
    checks.datasetTema = verif.dataset;
    checks.vista_on = await mp.evaluate(() => document.querySelector('.view.on')?.id || '');
    registrar({
      id: `${CLI_LINKS[orden - 1].id}-M-D`,
      archivo: `${CLI_LINKS[orden - 1].id}-${v.slug}-M-D.png`,
      grupo: 'UI-CLI', caption: `${v.caption} Móvil 390×844, tema oscuro.`,
      vista: v.vista, tema: 'oscuro', dispositivo: 'móvil', viewport: '390x844 DPR2',
      fuente, raw, checks,
    });
  }
  await mctx.close();
}

/* ===================================================================================== */
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--force-color-profile=srgb'] });
  const inicio = bogotaISO();
  const modo = process.env.MODO || 'todo';
  try {
    if (modo === 'todo' || modo === 'admin') await capturarAdmin(browser);
    if (modo === 'todo' || modo === 'cliente') await capturarCliente(browser);
    if (modo === 'cli13m') await capturarCli13M(browser);
    if (modo === 'climd') await capturarCliMD(browser);
  } finally {
    await browser.close();
  }
  const meta = {
    herramienta: 'playwright-core 1.65.1 + Chromium 1248 (headless), locale es-CO, timezone America/Bogota, colorScheme light por defecto',
    stack: BASE,
    inicio, fin: bogotaISO(),
    total: capturas.length,
    capturas,
    incidencias,
  };
  fs.writeFileSync(META, JSON.stringify(meta, null, 2));
  console.log(`OK ${capturas.length} capturas -> ${META}`);
  const porGrupo = capturas.reduce((a, c) => ((a[c.grupo] = (a[c.grupo] || 0) + 1), a), {});
  console.log('por grupo:', JSON.stringify(porGrupo));
  if (incidencias.length) console.log('INCIDENCIAS:', JSON.stringify(incidencias, null, 1));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
