/**
 * VYBRA — aplicación ciudadana.
 * Los tres sismógrafos usan las posiciones fijas del proyecto (web/config.js).
 * Esas coordenadas son de los aparatos, no de un epicentro.
 */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const INSTRUMENTS = {
    1: { lat: 4.648110, lon: -74.056690 },
    2: { lat: 4.648176, lon: -74.056661 },
    3: { lat: 4.648177, lon: -74.056703 }
  };

  const NETWORKS = {
    ok: { id: 'ok', connected: [1, 2, 3], quorum: true },
    warn: { id: 'warn', connected: [1, 3], quorum: true },
    err: { id: 'err', connected: [], quorum: false }
  };

  const KIT = ['kitWater', 'kitLight', 'kitAid', 'kitRadio', 'kitWhistle', 'kitFood', 'kitDocs', 'kitMeds'];
  const HOME_ITEMS = ['homeFixItem', 'homeExitItem', 'homeSpotItem', 'homeGasItem'];
  const VIEWS = ['ahora', 'mapa', 'detalle', 'avisos', 'proteccion', 'sismografos', 'prevencion', 'ajustes'];
  const ALIAS = { sensores: 'sismografos', historial: 'avisos', notificaciones: 'avisos', ahora: 'ahora' };
  const TITLES = { detalle: 'detailHeading', sismografos: 'sensorsHeading', prevencion: 'prevHeading', ajustes: 'settingsHeading' };
  const PARENT = { detalle: 'mapa', sismografos: 'ahora', prevencion: 'ahora', ajustes: 'ahora' };
  const ALERT_SECONDS = 59;
  const TRACE_WINDOW = 24;

  const UNREAD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16 9.8"/></svg>';
  const READ_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>';
  const ICONS = {
    alert: '<svg viewBox="0 0 24 24"><path d="M12 4 3 19h18L12 4z"/><path d="M12 10v4M12 17h.01"/></svg>',
    detection: '<svg viewBox="0 0 24 24"><path d="M12 4 3 19h18L12 4z"/><path d="M12 10v4"/></svg>',
    update: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.2-5.8"/><path d="M21 4v5h-5"/></svg>',
    service: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4M12 16h.01"/></svg>',
    test: '<svg viewBox="0 0 24 24"><path d="M9 3h6M10 3v6L5 19a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-10V3"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8h.01"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 1 1 12 0c0 7 2 7 2 7H4s2 0 2-7"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>',
    wave: '<svg viewBox="0 0 24 24"><path d="M3 12h3l2-5 3 10 3-7 2 4h5"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3z"/></svg>',
    globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>'
  };

  let lang = localStorage.getItem('sismica_lang') === 'en' ? 'en' : 'es';
  let settings = {
    soundEnabled: true,
    notifEnabled: true,
    activeScale: localStorage.getItem('sismica_scale') === 'richter' ? 'richter' : 'mercalli',
    notifyScale: 'mercalli',
    minMercalli: 4,
    maxMercalli: 12,
    minRichter: 4,
    maxRichter: 9,
    notifyNew: true,
    notifyUpdates: true,
    notifyAlerts: true,
    notifyService: true,
    notifyInfo: true,
    notifyTest: true,
    theme: localStorage.getItem('sismica_theme') || 'system',
    fontSize: localStorage.getItem('sismica_font') || 'normal',
    reduceMotion: localStorage.getItem('sismica_motion') === 'true'
  };
  try {
    const saved = JSON.parse(localStorage.getItem('sismica_prefs') || '{}');
    if (saved && typeof saved === 'object') {
      delete saved.vibrateEnabled;
      if (saved.notifyTest == null && saved.notifyInfo === false) saved.notifyTest = false;
      settings = { ...settings, ...saved };
      if (saved.notifyScale !== 'richter' && saved.notifyScale !== 'mercalli') {
        settings.notifyScale = settings.activeScale === 'richter' ? 'richter' : 'mercalli';
      }
    }
  } catch (e) {}
  Object.assign(settings, normalizeThreshold(settings));
  let draft = normalizeThreshold(settings);

  const params = new URLSearchParams(location.search);
  let networkId = NETWORKS[params.get('demo')] ? params.get('demo') : 'ok';
  let LIVE = false;
  let liveNet = { id: 'live', connected: [], quorum: false };
  const network = () => (LIVE ? liveNet : NETWORKS[networkId]);

  const now = () => Date.now() / 1000;
  const t0 = now();
  let quakes = [
    {
      id: 'q-demo-1', t: t0 - 52, simulacro: true, confirmado: true,
      nombreEs: 'Simulacro confirmado', nombreEn: 'Confirmed drill',
      mercalli: 'VI', mercalliNivel: 6, textoEs: 'Fuerte', textoEn: 'Strong',
      richter: 4.8, nodos: [1, 3],
      efectosEs: 'Se siente con claridad dentro de casa. Los objetos colgados se mueven y algunos pueden caer.',
      efectosEn: 'Clearly felt indoors. Hanging objects swing, and some may fall.'
    },
    {
      id: 'q-demo-2', t: t0 - 480, simulacro: true, confirmado: true,
      nombreEs: 'Prueba de respuesta', nombreEn: 'Response test',
      mercalli: 'IV', mercalliNivel: 4, textoEs: 'Moderado', textoEn: 'Moderate',
      richter: 3.5, nodos: [1, 2],
      efectosEs: 'Mucha gente lo nota en interiores. La vajilla y las puertas vibran un poco.',
      efectosEn: 'Many people notice it indoors. Dishes and doors rattle slightly.'
    },
    {
      id: 'q-demo-4', t: t0 - 5000, simulacro: true, confirmado: false,
      nombreEs: 'Lectura de un solo sismógrafo', nombreEn: 'Single-seismograph reading',
      mercalli: 'III', mercalliNivel: 3, textoEs: 'Leve', textoEn: 'Light',
      richter: 2.8, nodos: [2],
      efectosEs: 'Un movimiento pequeño, del tipo que a veces produce algo cercano al aparato.',
      efectosEn: 'A small motion, the kind sometimes caused by something next to the device.'
    },
    {
      id: 'q-demo-3', t: t0 - 8400, simulacro: true, confirmado: true,
      nombreEs: 'Vibración leve de prueba', nombreEn: 'Light test vibration',
      mercalli: 'II', mercalliNivel: 2, textoEs: 'Muy leve', textoEn: 'Very light',
      richter: 2.3, nodos: [2, 3],
      efectosEs: 'Casi no se percibe. Lo notarían sobre todo personas quietas.',
      efectosEn: 'Barely noticeable. Mostly felt by people who are still.'
    }
  ];

  let notices = [
    { id: 'n-1', type: 'alert', quakeId: 'q-demo-1', time: t0 - 52, isRead: false,
      titleEs: 'Alerta sísmica — protégete', titleEn: 'Earthquake alert — protect yourself',
      bodyEs: 'Dos sismógrafos coincidieron. Agáchate, cúbrete y sujétate. Es un simulacro.',
      bodyEn: 'Two seismographs matched. Drop, cover, and hold on. This is a drill.' },
    { id: 'n-2', type: 'detection', quakeId: 'q-demo-1', time: t0 - 70, isRead: false,
      titleEs: 'Lectura fuerte en la red local', titleEn: 'Strong reading on the local network',
      bodyEs: 'S1 y S3 registraron el mismo movimiento. Simulacro, sin epicentro.',
      bodyEn: 'S1 and S3 recorded the same motion. A drill, with no epicenter.' },
    { id: 'n-3', type: 'update', quakeId: 'q-demo-1', time: t0 - 40, isRead: false,
      titleEs: 'Actualización del simulacro', titleEn: 'Drill update',
      bodyEs: 'La intensidad sigue en Mercalli VI. La red no calculó un punto geográfico.',
      bodyEn: 'Intensity remains Mercalli VI. The network did not calculate a geographic point.' },
    { id: 'n-4', type: 'service', time: t0 - 3600, isRead: true,
      titleEs: 'Los sismógrafos responden', titleEn: 'The seismographs are responding',
      bodyEs: 'Los tres aparatos están en línea y se comprueban entre sí.',
      bodyEn: 'All three devices are online and check one another.' },
    { id: 'n-5', type: 'info', time: t0 - 20000, isRead: true,
      titleEs: 'Revisa la mochila', titleEn: 'Check the bag',
      bodyEs: 'Agua, una luz y un lugar donde encontrarse. El avance queda en este navegador.',
      bodyEn: 'Water, a light, and a place to meet. Progress stays in this browser.' },
    { id: 'n-6', type: 'test', time: t0 - 86400, isRead: true,
      titleEs: 'Prueba de aviso', titleEn: 'Notice test',
      bodyEs: 'El sonido y la pantalla se ensayan en Ajustes. No es un sismo.',
      bodyEn: 'The sound and the screen can be tried in Settings. This is not an earthquake.' },
    { id: 'n-7', type: 'detection', quakeId: 'q-demo-2', time: t0 - 480, isRead: true,
      titleEs: 'Prueba moderada', titleEn: 'Moderate test',
      bodyEs: 'S1 y S2 coincidieron en un simulacro de intensidad IV.',
      bodyEn: 'S1 and S2 matched in a level IV drill.' },
    { id: 'n-8', type: 'detection', quakeId: 'q-demo-4', time: t0 - 5000, isRead: true,
      titleEs: 'Movimiento sin confirmar', titleEn: 'Unconfirmed motion',
      bodyEs: 'Solo S2 registró algo. No se abrió una alerta.',
      bodyEn: 'Only S2 recorded anything. No alert was opened.' }
  ];

  const sensors = {
    1: { triggered: false, since: 0, timer: null, drills: 4 },
    2: { triggered: false, since: 0, timer: null, drills: 3 },
    3: { triggered: false, since: 0, timer: null, drills: 4 }
  };

  // Aviso de ensayo (botón "Abrir la alerta de prueba"): es un ejemplo, no una lectura de la red.
  const TEST_QUAKE = {
    id: 'q-prueba', t: now(), simulacro: true, confirmado: true,
    nombreEs: 'Alerta de prueba', nombreEn: 'Test alert',
    mercalli: 'VI', mercalliNivel: 6, textoEs: 'Fuerte', textoEn: 'Strong', richter: 4.8, nodos: [1, 3],
    efectosEs: 'Ejemplo para ensayar la pantalla y el sonido. No procede de la red.',
    efectosEn: 'Example to rehearse the screen and sound. It does not come from the network.'
  };
  const qFirst = () => quakes[0] || TEST_QUAKE;

  // ---------- Modo en vivo: la foto del servidor del PC (/api/stream) ----------
  const LEIDOS_KEY = 'vybra_leidos';
  const leidos = new Set(loadJson(LEIDOS_KEY, []));
  const EVENTO_VIVO_S = 12;      // un detector "se mueve" mientras su último evento tenga menos de 12 s
  const ALERTA_RECIENTE_S = 60;  // solo se abre la pantalla de alerta para una alerta que acaba de ocurrir
  const NIVEL_TXT = [null, ['Muy leve', 'Very light'], ['Muy leve', 'Very light'], ['Leve', 'Light'], ['Moderado', 'Moderate'], ['Moderado', 'Moderate'], ['Fuerte', 'Strong'], ['Fuerte', 'Strong'], ['Muy fuerte', 'Very strong'], ['Muy fuerte', 'Very strong'], ['Severo', 'Severe']];
  const EFECTOS = [
    ['Casi no se percibe. Lo notarían sobre todo personas quietas.', 'Barely noticeable. Mostly felt by people who are still.'],
    ['Mucha gente lo nota en interiores. La vajilla y las puertas vibran un poco.', 'Many people notice it indoors. Dishes and doors rattle slightly.'],
    ['Se siente con claridad dentro de casa. Los objetos colgados se mueven y algunos pueden caer.', 'Clearly felt indoors. Hanging objects swing, and some may fall.'],
    ['Movimiento fuerte: puede haber caída de objetos y daños en construcciones frágiles.', 'Strong motion: objects may fall and fragile structures may be damaged.']
  ];
  let primeraFoto = true;
  let ultimaAlarma = 0;
  const alertasVistas = new Set();
  let ultimoQuorum = null;
  let ultimaConexion = null;
  // ---------- Notificaciones: cápsulas (web/public/shared/island.js) ----------
  const L = (es, en) => (lang === 'en' ? en : es);
  const isl = (o) => { if (window.VybraIsland) window.VybraIsland.show(o); };
  const islOff = (id) => { if (window.VybraIsland) window.VybraIsland.dismiss(id); };
  const islandsOn = () => settings.notifEnabled && settings.notifyService;
  let estadoPrevio = null; // { conn, quorum, caidos }
  let capsulaAlerta = null;
  function avisarEstado(fresco, vivos) {
    if (!islandsOn()) { islOff('estado'); return; }
    const p = estadoPrevio;
    if (!fresco) {
      isl({ id: 'estado', place: 'bar', kind: 'conn', icon: 'wifi-off', sticky: true, dismissible: false, pri: 7,
        title: L('Sin conexión con la red', 'No connection to the network'),
        text: L('Reconectando… se muestran los últimos datos conocidos.', 'Reconnecting… the last known data is shown.') });
    } else if (!liveNet.quorum) {
      isl({ id: 'estado', place: 'bar', kind: 'warn', sticky: true, dismissible: false, pri: 5,
        title: L('Sin acuerdo entre sismógrafos', 'No agreement between seismographs'),
        text: L('La red no puede confirmar alertas hasta que se restablezca.', 'The network cannot confirm alerts until it recovers.') });
    } else islOff('estado');
    if (p && fresco && p.conn === false) isl({ id: 'c-ok', kind: 'success', icon: 'wifi', title: L('Conexión restablecida', 'Connection restored'), text: L('Se reanudó la lectura de los sismógrafos.', 'Reading of the seismographs resumed.') });
    if (p && fresco && p.conn && p.quorum === false && liveNet.quorum) isl({ id: 'q-ok', kind: 'success', title: L('La red recuperó el acuerdo', 'The network regained agreement') });
    if (p && fresco && p.conn) {
      const caidos = [1, 2, 3].filter((n) => !vivos.includes(n));
      const nuevos = caidos.filter((n) => !p.caidos.includes(n));
      const vuelven = p.caidos.filter((n) => !caidos.includes(n));
      if (nuevos.length) isl({ id: 'n-down', kind: 'warn', icon: 'wifi-off', title: L(`Sin respuesta de ${names(nuevos)}`, `No response from ${names(nuevos)}`) });
      else if (vuelven.length) isl({ id: 'n-up', kind: 'success', icon: 'wifi', title: L(`${names(vuelven)} vuelve a responder`, `${names(vuelven)} is responding again`) });
    }
    estadoPrevio = { conn: fresco, quorum: fresco ? liveNet.quorum : (p ? p.quorum : null), caidos: fresco ? [1, 2, 3].filter((n) => !vivos.includes(n)) : (p ? p.caidos : []) };
  }
  // Alerta confirmada: al cerrar la pantalla de alerta queda una cápsula crítica expandible bajo la barra.
  function capsulaDeAlerta(q) {
    if (!q || !String(q.id).startsWith('a-')) return;
    capsulaAlerta = { id: 'alerta-' + q.id, t: q.t };
    const m = measure(q);
    isl({ id: capsulaAlerta.id, place: 'bar', kind: 'critical', sticky: true, pri: 9,
      title: L('Alerta confirmada', 'Confirmed alert'),
      text: L(`${names(q.nodos)} coincidieron · ${m.caption}`, `${names(q.nodos)} matched · ${m.caption}`),
      rows: [[L('Sismógrafos', 'Seismographs'), names(q.nodos)], [L('Intensidad', 'Intensity'), `${q.mercalli} · ${lang === 'en' ? q.textoEn : q.textoEs}`], [L('Hora', 'Time'), clockSec(q.t)]],
      actions: [{ label: L('Ver detalle', 'View details'), primary: true, onClick: () => navigate('detalle', q.id) }] });
  }
  const clampNivel = (n) => Math.min(10, Math.max(1, Math.round(Number(n) || 1)));
  const richterDe = (nivel) => Math.round((1.5 + 0.55 * nivel) * 10) / 10;
  function medida(nivel) {
    const n = clampNivel(nivel);
    const ef = EFECTOS[n <= 3 ? 0 : n <= 5 ? 1 : n <= 7 ? 2 : 3];
    return { mercalli: ROMAN[n], mercalliNivel: n, textoEs: NIVEL_TXT[n][0], textoEn: NIVEL_TXT[n][1], richter: richterDe(n), efectosEs: ef[0], efectosEn: ef[1] };
  }
  const horaMs = (ev) => (ev && (ev.t || ev.t_lider)) || null;

  function aplicarFoto(f) {
    if (!f) return;
    const nodos = f.nodos || [];
    const vivos = nodos.filter((x) => x.alcanzable && x.estado && !x.estado.caido).map((x) => x.n);
    const fresco = !window.VybraVivo || window.VybraVivo.conexion === 'conectado';
    liveNet = { id: 'live', connected: fresco ? vivos : [], quorum: fresco && !!f.quorum };
    avisarEstado(fresco, vivos);
    if (capsulaAlerta && now() - capsulaAlerta.t > 600 && window.VybraIsland) { islOff(capsulaAlerta.id); capsulaAlerta = null; }
    if (f.ubicaciones) [1, 2, 3].forEach((n) => { if (f.ubicaciones[n]) INSTRUMENTS[n] = f.ubicaciones[n]; });

    // Eventos del log (los confirma la mayoría) y alertas de la fuente
    const fuente = nodos.find((x) => x.n === f.fuente);
    const commit = fuente && fuente.estado ? fuente.estado.commit_index : 0;
    const eventos = (f.log || []).filter((x) => x.clase === 'evento' && x.ev).map((x) => {
      const ms = horaMs(x.ev);
      return { id: x.ev.id, det: x.ev.nodo, nivel: x.ev.nivel, t: ms ? ms / 1000 : null, idx: x.i, confirmado: x.i <= commit };
    });
    const porId = Object.fromEntries(eventos.map((e) => [e.id, e]));
    const enAlerta = new Set();
    const nuevasQ = [];
    const nuevosAvisos = [];
    (f.alertas || []).forEach((a) => {
      const evs = (a.eventos || []).map((id) => porId[id]).filter(Boolean);
      evs.forEach((e) => enAlerta.add(e.id));
      const tiempos = evs.map((e) => e.t).filter((x) => x != null);
      const t = tiempos.length ? Math.max(...tiempos) : null;
      if (t == null) return;
      const dets = [...new Set(evs.map((e) => e.det))].sort();
      const q = { id: 'a-' + a.id, clave: (a.eventos || []).slice().sort().join('|'), t, simulacro: true, confirmado: true, nodos: dets,
        nombreEs: 'Alerta confirmada', nombreEn: 'Confirmed alert', ...medida(a.promedio) };
      nuevasQ.push(q);
      nuevosAvisos.push({ id: 'n-a-' + a.id, type: 'alert', quakeId: q.id, time: t,
        titleEs: 'Alerta sísmica — protégete', titleEn: 'Earthquake alert — protect yourself',
        bodyEs: `${names(dets)} coincidieron dentro de 10 s y la mayoría de los servidores lo confirmó. Los aparatos se activan con un pulsador: es un simulacro.`,
        bodyEn: `${names(dets)} matched within 10 s and the server majority confirmed it. The devices are triggered by a push button: this is a drill.` });
    });
    eventos.forEach((e) => {
      if (e.t == null) return;
      const m = medida(e.nivel);
      if (!enAlerta.has(e.id)) {
        nuevasQ.push({ id: 'e-' + e.id, t: e.t, simulacro: true, confirmado: false, nodos: [e.det],
          nombreEs: e.confirmado ? 'Lectura de un solo sismógrafo' : 'Lectura pendiente de confirmar', nombreEn: e.confirmado ? 'Single-seismograph reading' : 'Reading pending confirmation', ...m });
      }
      nuevosAvisos.push({ id: 'n-e-' + e.id, type: 'detection', quakeId: enAlerta.has(e.id) ? null : 'e-' + e.id, time: e.t,
        titleEs: `S${e.det} registró un movimiento`, titleEn: `S${e.det} recorded a motion`,
        bodyEs: `Intensidad ${m.mercalli} (${m.textoEs}). ${enAlerta.has(e.id) ? 'Forma parte de una alerta confirmada.' : e.confirmado ? 'Solo un sismógrafo: no se abrió una alerta.' : 'Todavía no la confirma la mayoría de los servidores.'}`,
        bodyEn: `Intensity ${m.mercalli} (${m.textoEn}). ${enAlerta.has(e.id) ? 'Part of a confirmed alert.' : e.confirmado ? 'Only one seismograph: no alert was opened.' : 'The server majority has not confirmed it yet.'}` });
    });
    // Avisos de servicio solo por cambios reales de quórum durante la sesión
    if (fresco && ultimoQuorum !== null && ultimoQuorum !== liveNet.quorum) {
      nuevosAvisos.push({ id: 'n-s-' + Date.now(), type: 'service', time: now(),
        titleEs: liveNet.quorum ? 'La red recuperó el consenso' : 'La red perdió el consenso',
        titleEn: liveNet.quorum ? 'The network regained consensus' : 'The network lost consensus',
        bodyEs: liveNet.quorum ? 'Al menos dos servidores coinciden en el líder.' : 'No hay dos servidores que coincidan en el líder: los eventos quedan pendientes.',
        bodyEn: liveNet.quorum ? 'At least two servers agree on the leader.' : 'No two servers agree on the leader: events stay pending.' });
    }
    if (ultimaConexion !== null && ultimaConexion !== fresco) {
      nuevosAvisos.push({ id: 'n-c-' + Date.now(), type: 'service', time: now(),
        titleEs: fresco ? 'Conexión restablecida' : 'El servicio no responde',
        titleEn: fresco ? 'Connection restored' : 'The service is not responding',
        bodyEs: fresco ? 'Se reanudó la lectura de los sismógrafos.' : 'No hay respuesta del servidor de la red: se muestran los últimos datos conocidos.',
        bodyEn: fresco ? 'Reading of the seismographs resumed.' : 'The network server is not responding: the last known data is shown.' });
      if (settings.notifEnabled && settings.notifyService) systemNotice(lang === 'en' ? (fresco ? 'Connection restored' : 'The service is not responding') : (fresco ? 'Conexión restablecida' : 'El servicio no responde'), '');
    }
    ultimaConexion = fresco;
    if (fresco) ultimoQuorum = liveNet.quorum;
    const servicios = notices.filter((n) => n.type === 'service');
    nuevosAvisos.push(...servicios.filter((n) => !nuevosAvisos.some((m) => m.id === n.id)));
    nuevosAvisos.forEach((n) => { n.isRead = n.isRead != null ? n.isRead : leidos.has(n.id); });
    quakes = nuevasQ.sort((a, b) => b.t - a.t);
    notices = nuevosAvisos.sort((a, b) => b.time - a.time);

    // Sismógrafos: "en movimiento" mientras su último evento sea reciente; participaciones = eventos en el log
    [1, 2, 3].forEach((n) => {
      const propios = eventos.filter((e) => e.det === n && e.t != null).sort((a, b) => b.t - a.t);
      const ultimo = propios[0];
      const mueve = !!ultimo && now() - ultimo.t < EVENTO_VIVO_S;
      sensors[n].triggered = mueve;
      sensors[n].since = mueve ? ultimo.t : 0;
      sensors[n].drills = eventos.filter((e) => e.det === n).length;
    });
    if (!quakeById(detailId)) detailId = quakes[0] ? quakes[0].id : detailId;

    // Pantalla de alerta: solo para una alerta confirmada, reciente y no vista antes
    const clave = (q) => q.clave || (q.id + '@' + q.t); // identidad por eventos: el id puede recalcularse
    const sinVer = quakes.filter((q) => q.confirmado && q.id.startsWith('a-') && !alertasVistas.has(clave(q)));
    sinVer.forEach((q) => alertasVistas.add(clave(q)));
    const recientes = sinVer.filter((q) => now() - q.t < ALERTA_RECIENTE_S && now() - q.t > -10);
    if (!primeraFoto && recientes.length && Date.now() - ultimaAlarma > 20000) {
      ultimaAlarma = Date.now();
      const q = recientes[0];
      if (settings.notifEnabled && settings.notifyAlerts && meetsThreshold(q)) {
        systemNotice(lang === 'en' ? 'Earthquake alert — protect yourself' : 'Alerta sísmica — protégete', lang === 'en' ? 'Drop, cover, and hold on.' : 'Agáchate, cúbrete y sujétate.');
        openAlarm(q, { force: false });
      }
    }
    if ((f.log || []).length >= (fuente && fuente.estado ? fuente.estado.log_len : 0)) primeraFoto = false;
    renderAll();
    syncPulse();
  }

  function entrarModoVivo() {
    LIVE = true;
    quakes = [];
    notices = [];
    document.documentElement.dataset.vivo = '1';
    window.VybraVivo.alCambiarConexion = () => aplicarFoto(window.VybraVivo.foto);
    window.VybraVivo.suscribir(aplicarFoto);
    // Los eventos "recientes" caducan solos: se refresca la foto cada 2 s aunque el servidor no emita
    setInterval(() => aplicarFoto(window.VybraVivo.foto), 2000);
  }

  let currentView = 'ahora';
  let backTo = 'ahora';
  let detailId = quakes[0].id; // se reajusta al entrar en modo en vivo
  let feedFilter = 'all';
  let magFilter = 'all';
  let sheetMode = 'event';
  let selectedSensor = null;
  let alertLatched = false;
  let alarmQuake = null;
  let alarmTimer = null;
  let alarmTick = null;
  let alarmLeft = 0;
  let soundTest = false;
  let soundTestTimer = null;
  let userPoint = null;
  let map = null;
  let detailMap = null;
  let tiles = null;
  let detailTiles = null;
  const markers = {};
  let userMarker = null;
  let lastLive = '';
  let waveStarted = false;
  let matchState = null;

  function t(key) {
    return (I18N[lang] && I18N[lang][key]) || (I18N.es && I18N.es[key]) || key;
  }
  function tf(key, vars) {
    return t(key).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  }
  function savePrefs() {
    localStorage.setItem('sismica_prefs', JSON.stringify({
      soundEnabled: settings.soundEnabled,
      notifEnabled: settings.notifEnabled,
      notifyScale: settings.notifyScale,
      minMercalli: settings.minMercalli,
      maxMercalli: settings.maxMercalli,
      minRichter: settings.minRichter,
      maxRichter: settings.maxRichter,
      notifyNew: settings.notifyNew,
      notifyUpdates: settings.notifyUpdates,
      notifyAlerts: settings.notifyAlerts,
      notifyService: settings.notifyService,
      notifyInfo: settings.notifyInfo,
      notifyTest: settings.notifyTest
    }));
    localStorage.setItem('sismica_scale', settings.activeScale);
  }
  function locale() { return lang === 'en' ? 'en-US' : 'es-CO'; }
  function clock(ts) {
    return new Date(ts * 1000).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  function clockSec(ts) {
    return new Date(ts * 1000).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }
  function fullWhen(ts) {
    return new Date(ts * 1000).toLocaleString(locale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  }
  function rel(ts) {
    const d = Math.max(0, Math.round(now() - ts));
    if (lang === 'en') {
      if (d < 60) return `${d}s ago`;
      if (d < 3600) return `${Math.floor(d / 60)} min ago`;
      if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
      return `${Math.floor(d / 86400)} d ago`;
    }
    if (d < 60) return `hace ${d} s`;
    if (d < 3600) return `hace ${Math.floor(d / 60)} min`;
    if (d < 86400) return `hace ${Math.floor(d / 3600)} h`;
    return `hace ${Math.floor(d / 86400)} d`;
  }
  function feedWhen(ts) {
    if (dayBucket(ts) === 'feedToday') return clock(ts);
    return new Date(ts * 1000).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  }
  function dayBucket(ts) {
    const a = new Date(ts * 1000); a.setHours(0, 0, 0, 0);
    const b = new Date(); b.setHours(0, 0, 0, 0);
    const diff = (b - a) / 86400000;
    if (diff < 1) return 'feedToday';
    if (diff < 2) return 'feedYesterday';
    return 'feedEarlier';
  }
  function names(ids) {
    const list = ids.map((n) => 'S' + n);
    if (list.length <= 1) return list[0] || '';
    const last = list[list.length - 1];
    return list.slice(0, -1).join(', ') + (lang === 'en' ? ' and ' : ' y ') + last;
  }
  function measure(q) {
    if (settings.activeScale === 'richter') {
      return { value: Number(q.richter).toFixed(1), unit: 'M', caption: `${t('magnitudeWord')} ${t('richterName')}` };
    }
    const texto = lang === 'en' ? q.textoEn : q.textoEs;
    return { value: q.mercalli, unit: '', caption: `${t('intensityWord')} ${q.mercalli} · ${texto}` };
  }
  function magClass(q) {
    if (q.mercalliNivel >= 6) return '';
    if (q.mercalliNivel >= 4) return 'mid';
    return 'light';
  }
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  function scaleSpec(scale) {
    if (scale === 'richter') return { min: 0, max: 9, step: 0.1, decimals: 1 };
    return { min: 1, max: 12, step: 1, decimals: 0 };
  }
  function snapBound(n, spec) {
    const steps = Math.round((Number(n) - spec.min) / spec.step);
    const v = spec.min + steps * spec.step;
    return Number(Math.min(spec.max, Math.max(spec.min, v)).toFixed(spec.decimals));
  }
  function normalizeThreshold(s) {
    const m = scaleSpec('mercalli');
    const r = scaleSpec('richter');
    let minMercalli = snapBound(s.minMercalli, m);
    let maxMercalli = snapBound(s.maxMercalli == null ? 12 : s.maxMercalli, m);
    if (minMercalli > maxMercalli) maxMercalli = minMercalli;
    let minRichter = snapBound(s.minRichter, r);
    let maxRichter = snapBound(s.maxRichter == null ? 9 : s.maxRichter, r);
    if (minRichter > maxRichter) maxRichter = minRichter;
    return {
      notifyScale: s.notifyScale === 'richter' ? 'richter' : 'mercalli',
      minMercalli, maxMercalli, minRichter, maxRichter,
      notifyNew: s.notifyNew !== false,
      notifyUpdates: s.notifyUpdates !== false,
      notifyAlerts: s.notifyAlerts !== false,
      soundEnabled: !!s.soundEnabled
    };
  }
  function thresholdState(s) {
    const n = normalizeThreshold(s);
    return {
      notifyScale: n.notifyScale,
      minMercalli: n.minMercalli,
      maxMercalli: n.maxMercalli,
      minRichter: n.minRichter,
      maxRichter: n.maxRichter
    };
  }
  function thresholdKeys(s) {
    return JSON.stringify(thresholdState(s));
  }
  function boundsOf(src) {
    const scale = src.notifyScale === 'richter' ? 'richter' : 'mercalli';
    return scale === 'richter'
      ? { scale, min: src.minRichter, max: src.maxRichter }
      : { scale, min: src.minMercalli, max: src.maxMercalli };
  }
  function setBounds(src, min, max) {
    const spec = scaleSpec(src.notifyScale);
    let a = snapBound(min, spec);
    let b = snapBound(max, spec);
    if (a > b) b = a;
    if (src.notifyScale === 'richter') { src.minRichter = a; src.maxRichter = b; }
    else { src.minMercalli = a; src.maxMercalli = b; }
  }
  function presetOf(src) {
    const spec = scaleSpec(src.notifyScale);
    const { min, max } = boundsOf(src);
    if (min === spec.min && max === spec.max) return 'all';
    const from = src.notifyScale === 'richter' ? 4 : 4;
    if (min === from && max === spec.max) return 'from';
    return 'custom';
  }
  function formatBound(scale, n) {
    if (scale === 'richter') {
      return Number(n).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }
    return ROMAN[n] || String(n);
  }
  function previewText(src) {
    const { scale, min, max } = boundsOf(src);
    const spec = scaleSpec(scale);
    const scaleName = t(scale === 'richter' ? 'scaleRichterPhrase' : 'scaleMercalliPhrase');
    const minLabel = formatBound(scale, min);
    const maxLabel = formatBound(scale, max);
    let line;
    if (min === spec.min && max === spec.max) line = tf('rangePreviewAll', { scale: scaleName, min: minLabel, max: maxLabel });
    else if (min === max) line = tf('rangePreviewExact', { scale: scaleName, min: minLabel });
    else line = tf('rangePreviewBetween', { scale: scaleName, min: minLabel, max: maxLabel });
    return line;
  }
  function renderThreshold() {
    const panel = $('#rangePanel');
    if (!panel) return;
    const src = draft;
    const { scale, min, max } = boundsOf(src);
    const spec = scaleSpec(scale);
    $$('[data-action="notify-scale"]').forEach((b) => {
      const on = b.dataset.scale === scale;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const preset = presetOf(src);
    $$('[data-action="range-preset"]').forEach((b) => {
      const on = b.dataset.preset === preset;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $('#rangeScaleNote').textContent = t(scale === 'richter' ? 'rangeNoteRichter' : 'rangeNoteMercalli');
    $('#presetHint').textContent = t(preset === 'all' ? 'presetAllHint' : preset === 'from' ? (scale === 'richter' ? 'presetFromRichter' : 'presetFromMercalli') : 'presetCustomHint');
    $('#readMin').textContent = formatBound(scale, min);
    $('#readMax').textContent = formatBound(scale, max);
    $('#rangeTicks').textContent = '';
    (scale === 'richter' ? ['0', '3', '6', '9'] : ['I', 'IV', 'VIII', 'XII']).forEach((label) => {
      const s = document.createElement('span');
      s.textContent = label;
      $('#rangeTicks').appendChild(s);
    });
    const span = spec.max - spec.min || 1;
    const left = ((min - spec.min) / span) * 100;
    const width = ((max - min) / span) * 100;
    const fill = $('#rangeFill');
    fill.style.left = `calc(11px + (100% - 22px) * ${left / 100})`;
    fill.style.width = `calc((100% - 22px) * ${width / 100})`;
    ['rangeMin', 'rangeMax'].forEach((id, i) => {
      const el = $('#' + id);
      el.min = String(spec.min);
      el.max = String(spec.max);
      el.step = String(spec.step);
      const value = i === 0 ? min : max;
      if (document.activeElement !== el) el.value = String(value);
      el.setAttribute('aria-valuetext', formatBound(scale, value));
      el.setAttribute('aria-label', t(i === 0 ? 'rangeMin' : 'rangeMax'));
    });
    ['numMin', 'numMax'].forEach((id, i) => {
      const el = $('#' + id);
      el.min = String(spec.min);
      el.max = String(spec.max);
      el.step = String(spec.step);
      const value = i === 0 ? min : max;
      if (document.activeElement !== el) el.value = scale === 'richter' ? Number(value).toFixed(1) : String(value);
      el.setAttribute('aria-label', t(i === 0 ? 'rangeMin' : 'rangeMax'));
    });
    const unit = t(scale === 'richter' ? 'unitRichter' : 'unitMercalli');
    $('#numMinUnit').textContent = unit;
    $('#numMaxUnit').textContent = unit;
    $('#rangeLimits').textContent = t(scale === 'richter' ? 'rangeLimitsRichter' : 'rangeLimitsMercalli');
    $('#rangePreview').textContent = previewText(src);
    const dirty = thresholdKeys(draft) !== thresholdKeys(settings);
    const dirtyEl = $('#rangeDirty');
    dirtyEl.hidden = !dirty;
    dirtyEl.textContent = t('rangeDirty');
    $('#btnSaveRange').disabled = !dirty;
    $('#btnCancelRange').disabled = !dirty;
  }
  function applyBound(which, raw) {
    const text = String(raw).trim().replace(',', '.');
    if (text === '' || text === '.' || text === '-' || text === '-.') return;
    const { min, max } = boundsOf(draft);
    const next = Number(text);
    if (!Number.isFinite(next)) return;
    if (which === 'min') setBounds(draft, next, Math.max(next, max));
    else setBounds(draft, Math.min(min, next), next);
    renderThreshold();
  }
  function meetsThreshold(q) {
    if (!q) return true;
    if (settings.notifyScale === 'richter') {
      const v = Number(q.richter);
      return v >= settings.minRichter && v <= settings.maxRichter;
    }
    const v = Number(q.mercalliNivel);
    return v >= settings.minMercalli && v <= settings.maxMercalli;
  }
  function noticeAllowed(item) {
    if (!settings.notifEnabled) return false;
    const q = item.quakeId ? quakeById(item.quakeId) : null;
    const inRange = !q || meetsThreshold(q);
    if (item.type === 'alert') return settings.notifyAlerts && inRange;
    if (item.type === 'detection') return settings.notifyNew && inRange;
    if (item.type === 'update') return settings.notifyUpdates && inRange;
    if (item.type === 'service') return settings.notifyService;
    if (item.type === 'info') return settings.notifyInfo;
    if (item.type === 'test') return settings.notifyTest;
    return true;
  }
  function activeIds() {
    return [1, 2, 3].filter((n) => sensors[n].triggered && network().connected.includes(n));
  }
  function haversine(a, b) {
    const R = 6371000;
    const rad = (d) => d * Math.PI / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function spanMeters() {
    const pts = Object.values(INSTRUMENTS);
    let max = 0;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) max = Math.max(max, haversine(pts[i], pts[j]));
    }
    return Math.max(1, Math.round(max));
  }
  function formatDistance(m) {
    if (m < 1000) return `${Math.round(m)} m`;
    const km = m / 1000;
    return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
  }
  function centroid() {
    const pts = Object.values(INSTRUMENTS);
    return {
      lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
      lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length
    };
  }
  function quakeById(id) { return quakes.find((q) => q.id === id); }
  function visibleQuakes() {
    return quakes.filter((q) => {
      if (magFilter === 'fuerte') return q.mercalliNivel >= 6;
      if (magFilter === 'moderado') return q.mercalliNivel >= 4 && q.mercalliNivel <= 5;
      if (magFilter === 'leve') return q.mercalliNivel <= 3;
      return true;
    }).sort((a, b) => b.t - a.t);
  }
  function selectedQuake() {
    const list = visibleQuakes();
    return list.find((q) => q.id === detailId) || list[0] || null;
  }

  function resolvedTheme() {
    if (settings.theme === 'dark' || settings.theme === 'light') return settings.theme;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function tileUrl() {
    return 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  }

  function permState() {
    if (!('Notification' in window)) return 'na';
    if (Notification.permission === 'granted') return 'on';
    if (Notification.permission === 'denied') return 'off';
    return 'ask';
  }

  const NOTICE_TYPES = [
    ['notifyAlerts', 'typeAlerts', 'typeAlertsSub'],
    ['notifyNew', 'typeNew', 'typeNewSub'],
    ['notifyUpdates', 'typeUpdates', 'typeUpdatesSub'],
    ['notifyService', 'typeService', 'typeServiceSub'],
    ['notifyInfo', 'typeInfo', 'typeInfoSub'],
    ['notifyTest', 'typeTest', 'typeTestSub']
  ];

  function protectionChecks() {
    const perm = permState();
    const online = navigator.onLine;
    const connected = network().connected.length;
    const sensorLevel = connected >= 3 ? 'good' : connected === 2 ? 'warn' : 'bad';
    const typesOn = NOTICE_TYPES.filter(([key]) => settings[key] !== false).length;
    return [
      {
        id: 'notif', kind: 'switch', pref: 'notifEnabled',
        level: settings.notifEnabled ? 'good' : 'off',
        title: t('checkNotifTitle'),
        state: settings.notifEnabled ? t('prefOn') : t('prefOff'),
        hint: t('checkNotifHint'),
        help: t('checkNotifHelp'),
        icon: ICONS.bell
      },
      {
        id: 'sound', kind: 'switch', pref: 'soundEnabled',
        level: settings.soundEnabled ? 'good' : 'off',
        title: t('checkSoundTitle'),
        state: settings.soundEnabled ? t('prefOn') : t('prefOff'),
        hint: t('checkSoundHint'),
        help: t('checkSoundHelp'),
        icon: ICONS.wave
      },
      {
        id: 'perm', kind: 'permission',
        level: perm === 'on' || perm === 'na' ? 'good' : perm === 'ask' ? 'warn' : 'bad',
        title: t('checkPermTitle'),
        state: perm === 'on' ? t('checkPermOn') : perm === 'ask' ? t('checkPermAsk') : perm === 'off' ? t('checkPermOff') : t('checkPermNa'),
        hint: perm === 'on' ? t('checkPermOnHint') : perm === 'ask' ? t('checkPermAskHint') : perm === 'off' ? t('checkPermOffHint') : t('checkPermNaHint'),
        help: perm === 'off' ? t('checkPermBlocked') : perm === 'on' ? t('checkPermGrantedHelp') : perm === 'na' ? t('checkPermNaHelp') : t('checkPermHelp'),
        icon: ICONS.bell
      },
      {
        id: 'types', kind: 'types',
        level: 'good',
        title: t('checkTypesTitle'),
        state: tf('typesSummary', { n: typesOn, total: NOTICE_TYPES.length }),
        hint: t('checkTypesHint'),
        help: t('checkTypesHelp'),
        icon: ICONS.info
      },
      {
        id: 'net', kind: 'status',
        level: online ? 'good' : 'bad',
        title: t('checkNetTitle'),
        state: online ? t('checkNetOn') : t('checkNetOff'),
        hint: t('checkNetHint'),
        help: t('checkNetHelp'),
        icon: ICONS.globe
      },
      {
        id: 'sensors', kind: 'status',
        level: sensorLevel,
        title: t('checkSensorsTitle'),
        state: connected >= 3 ? t('checkSensors3') : connected === 2 ? t('checkSensors2') : t('checkSensorsBad'),
        hint: t('checkSensorsHint'),
        help: t('checkSensorsHelp'),
        icon: ICONS.wave
      }
    ];
  }

  function applyLanguage() {
    document.documentElement.lang = lang;
    localStorage.setItem('sismica_lang', lang);
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    $$('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    $$('[data-action="lang"]').forEach((b) => {
      const on = b.dataset.lang === lang;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    renderAll();
  }

  function applyTheme(choice) {
    settings.theme = choice;
    localStorage.setItem('sismica_theme', choice);
    const resolved = resolvedTheme();
    document.documentElement.dataset.theme = resolved === 'dark' ? 'dark' : '';
    if (resolved !== 'dark') delete document.documentElement.dataset.theme;
    if (resolved === 'dark') document.documentElement.dataset.theme = 'dark';
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = resolved === 'dark' ? '#0e1412' : '#f6f6f3';
    $$('[data-action="theme"]').forEach((b) => b.classList.toggle('on', b.dataset.theme === choice));
    if (window.VybraIsland) window.VybraIsland.setTheme(resolved);
    syncThemeButton();
    if (tiles) tiles.setUrl(tileUrl());
    if (detailTiles) detailTiles.setUrl(tileUrl());
  }

  function applyFont(size) {
    settings.fontSize = size === 'large' ? 'large' : 'normal';
    localStorage.setItem('sismica_font', settings.fontSize);
    document.documentElement.dataset.fontSize = settings.fontSize;
    $$('[data-action="font"]').forEach((b) => b.classList.toggle('on', b.dataset.font === settings.fontSize));
  }

  function applyMotion(on) {
    settings.reduceMotion = !!on;
    localStorage.setItem('sismica_motion', String(settings.reduceMotion));
    document.documentElement.dataset.reduceMotion = String(settings.reduceMotion);
    if (window.VybraIsland) window.VybraIsland.setReduce(settings.reduceMotion);
    const box = $('#switchMotion');
    if (box) box.checked = settings.reduceMotion;
  }

  function applyScale(scale) {
    const next = scale === 'richter' ? 'richter' : 'mercalli';
    settings.activeScale = next;
    settings.notifyScale = next;
    draft = normalizeThreshold(settings);
    savePrefs();
    renderAll();
  }

  function syncForm() {
    const motion = $('#switchMotion');
    if (motion) motion.checked = settings.reduceMotion;
    renderThreshold();
    $$('[data-action="scale"]').forEach((b) => b.classList.toggle('on', b.dataset.scale === settings.activeScale));
    $$('[data-action="network"]').forEach((b) => b.classList.toggle('on', b.dataset.network === networkId));
    syncPulse();
  }

  function loadJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback; } catch (e) { return fallback; }
  }

  function statusMode() {
    const ids = activeIds();
    if (!network().quorum) return 'bad';
    if (ids.length >= 2) return 'alert';
    if (ids.length === 1) return 'warn';
    return 'calm';
  }

  function renderHome() {
    const mode = statusMode();
    const card = $('#statusCard');
    card.className = 'status-card ' + mode;
    const copy = {
      calm: ['statusCalmKicker', 'statusCalmTitle', 'statusCalmSub', 'monitoringLive', ''],
      warn: ['statusOneKicker', 'statusOneTitle', 'statusOneSub', 'monitoringLive', 'warn'],
      alert: ['statusAlertKicker', 'statusAlertTitle', 'statusAlertSub', 'monitoringLive', 'alert'],
      bad: ['statusOffKicker', 'statusOffTitle', 'statusOffSub', 'monitoringOff', 'off']
    }[mode];
    $('#statusKicker').textContent = t(copy[0]);
    $('#statusTitle').textContent = t(copy[1]);
    $('#statusSub').textContent = t(copy[2]);
    $('#statusLive').textContent = t(copy[3]);
    $('#statusDot').className = copy[4];
    const see = $('#btnSeeAlert');
    see.hidden = mode !== 'alert';
    see.textContent = t('seeAlert');
    renderTelemetry();
    if (t(copy[1]) !== lastLive) {
      lastLive = t(copy[1]);
      $('#live').textContent = lastLive;
    }
    renderLatest();
    renderHomeProtect();
    renderHomeSensors();
    syncDeskLive();
    const near = $('#nearbyLine');
    if (userPoint) {
      near.hidden = false;
      near.textContent = tf('nearbyLine', { n: formatDistance(haversine(userPoint, centroid())) });
    } else {
      near.hidden = true;
    }
  }

  function renderTelemetry() {
    const el = $('#telemetry');
    if (!el) return;
    const net = network();
    const ids = activeIds();
    const agree = !net.quorum ? 'teleAgreeOff'
      : ids.length >= 2 ? 'teleAgreeHit'
      : ids.length === 1 ? 'teleAgreeOne'
      : 'teleAgreeWait';
    el.innerHTML = `
      <p><span>${t('teleNet')}</span><b>${navigator.onLine ? t('checkNetOn') : t('checkNetOff')}</b></p>
      <p><span>${t('teleNodes')}</span><b>${net.connected.length}/3</b></p>
      <p><span>${t('teleAgree')}</span><b>${t(agree)}</b></p>`;
  }

  function renderLatest() {
    const q = quakes.slice().sort((a, b) => b.t - a.t)[0];
    const box = $('#latestEvent');
    if (!q) { box.innerHTML = ''; return; }
    const m = measure(q);
    const nombre = lang === 'en' ? q.nombreEn : q.nombreEs;
    box.innerHTML = `
      <button type="button" class="event-row" data-action="open-detail" data-id="${q.id}">
        <div class="mag ${magClass(q)}">${m.value}${m.unit ? `<small>${m.unit}</small>` : ''}</div>
        <div class="event-copy">
          <span class="event-title-row"><b>${nombre}</b><span class="when">${clock(q.t)}</span></span>
          <p>${rel(q.t)}</p>
          <div class="tags">
            <span class="tag ${q.confirmado ? 'ok' : 'no'}">${q.confirmado ? t('confirmed') : t('unconfirmed')}</span>
            ${q.simulacro ? `<span class="tag drill">${t('drill')}</span>` : ''}
          </div>
        </div>
        ${ICONS.chev}
      </button>`;
  }

  function renderHomeProtect() {
    const checks = protectionChecks();
    const passed = checks.filter((c) => c.level === 'good').length;
    const level = passed === checks.length ? 'ready' : passed >= 4 ? 'limited' : 'incomplete';
    const word = level === 'ready' ? t('ready') : level === 'limited' ? t('limited') : t('incomplete');
    const segs = checks.map((c) => `<i class="${c.level === 'good' ? 'on' : c.level === 'off' ? 'opt' : 'off'}"></i>`).join('');
    const rows = checks.slice(0, 3).map((c) => `<p class="${c.id === 'perm' ? 'is-perm' : ''}"><span>${c.title}</span><em class="${c.level === 'good' ? '' : c.level === 'off' ? 'off' : 'warn'}">${c.state}</em></p>`).join('');
    const ring = ringSvg(passed, checks.length);
    $('#homeProtect').innerHTML = `
      <div class="protect-top">
        <div><b>${word}</b><span>${tf('checksOf', { n: passed, total: checks.length })}</span></div>
        ${ring}
      </div>
      <div class="segments">${segs}</div>
      <div class="mini-rows">${rows}</div>`;
  }

  function ringSvg(n, total) {
    const r = 15;
    const c = 2 * Math.PI * r;
    const dash = (n / total) * c;
    const color = n === total ? 'var(--green)' : 'var(--amber)';
    return `<svg class="ring" viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r="${r}" fill="none" stroke="var(--line)" stroke-width="3"></circle>
      <circle cx="18" cy="18" r="${r}" fill="none" stroke="${color}" stroke-width="3"
        stroke-linecap="round" stroke-dasharray="${dash} ${c}" transform="rotate(-90 18 18)"></circle>
      <text x="18" y="19" text-anchor="middle" dominant-baseline="middle" font-size="8" font-weight="700" fill="currentColor">${n}/${total}</text>
    </svg>`;
  }

  function renderHomeSensors() {
    const net = network();
    const active = activeIds();
    $('#homeSensors').innerHTML = [1, 2, 3].map((n) => {
      const on = net.connected.includes(n);
      const moving = on && sensors[n].triggered;
      const match = moving && active.length >= 2;
      const label = !on ? t('sensorOffline') : match ? t('sensorMatch') : moving ? t('sensorMove') : t('sensorCalm');
      const dot = !on ? 'off' : match ? 'alert' : moving ? 'warn' : '';
      return `<button type="button" class="sensor-mini" data-action="open-sensors">
        <i class="dot ${dot}"></i><b>S${n}</b><span>${label}</span>
        <span class="sensor-part">${tf('sensorPart', { n: sensors[n].drills })}</span>
      </button>`;
    }).join('');
  }

  function protectCard(c) {
    const copy = `<div><h3>${c.title}</h3><p class="state">${c.state}</p>${c.hint ? `<p class="hint">${c.hint}</p>` : ''}</div>`;
    const tone = c.level === 'good' ? '' : c.level;
    if (c.kind === 'switch') {
      const trial = c.pref === 'soundEnabled'
        ? `<button type="button" class="btn slim" id="btnTestSound" data-action="test-sound"><span>${soundTest ? t('btnStopSound') : t('btnTestSound')}</span></button>`
        : '';
      return `<article class="check ${tone}">
        ${c.icon}
        <div><h3>${c.title}</h3><p class="state">${c.state}</p>${c.hint ? `<p class="hint">${c.hint}</p>` : ''}${trial}</div>
        <label class="switch"><input type="checkbox" data-pref="${c.pref}" ${settings[c.pref] ? 'checked' : ''} aria-label="${c.title}"><span class="switch-ui"></span></label>
      </article>`;
    }
    if (c.kind === 'types') {
      return `<button type="button" class="check" data-action="open-types">
        ${c.icon}
        ${copy}
        ${ICONS.chev}
      </button>`;
    }
    if (c.kind === 'permission') {
      const perm = permState();
      const ask = perm === 'ask' ? `<button type="button" class="fix-btn" data-action="ask-permission">${t('permAskBtn')}</button>` : '';
      const blocked = perm === 'off' ? `<button type="button" class="fix-btn" data-action="perm-help">${t('permHelpBtn')}</button>` : '';
      return `<article class="check ${tone}">
        ${c.icon}
        ${copy}
        <div class="check-actions">
          <button type="button" class="help-btn" data-action="help" data-check="perm" aria-label="${t('help')}">?</button>
          ${ask}${blocked}
        </div>
      </article>`;
    }
    return `<article class="check status ${tone}">
      ${c.icon}
      ${copy}
      <span class="kind">${t('statusKind')}</span>
    </article>`;
  }

  function renderProtection() {
    const checks = protectionChecks();
    const passed = checks.filter((c) => c.level === 'good').length;
    const level = passed === checks.length ? 'ready' : passed >= 4 ? 'limited' : 'incomplete';
    const card = $('#readinessCard');
    card.className = 'readiness ' + (level === 'ready' ? 'ready' : level === 'incomplete' ? 'bad' : '');
    $('#readinessBadge').textContent = level === 'ready' ? t('ready') : level === 'limited' ? t('limited') : t('incomplete');
    $('#readinessMeta').textContent = `${tf('checksOf', { n: passed, total: checks.length })} · ${t('checkedNow')}`;
    $('#readinessRing').innerHTML = ringSvg(passed, checks.length);
    const score = $('#readinessScore');
    if (score) score.innerHTML = `<b>${passed}</b><span>/${checks.length}</span>`;
    const bars = $('#readinessSegs');
    if (bars) bars.innerHTML = checks.map((c) => `<i class="${c.level === 'good' ? 'on' : c.level === 'off' ? 'opt' : 'off'}"></i>`).join('');
    const cards = checks.map(protectCard);
    $('#protectList').innerHTML =
      `<p class="protect-sec">${t('deskChannels')}</p>${cards[0]}${cards[1]}` +
      `<p class="protect-sec">${t('deskPerms')}</p>${cards[2]}${cards[3]}` +
      `<p class="protect-sec">${t('deskDiag')}</p>${cards[4]}${cards[5]}` +
      `<button type="button" class="btn ghost protect-restore" data-action="restore-notices">${t('restoreNotices')}</button>` +
      `<p class="fine">${t('prefsLocalOnly')}</p>`;
    renderTypes();
  }

  function renderTypes() {
    const list = $('#typeList');
    if (!list) return;
    list.innerHTML = NOTICE_TYPES.map(([key, title, sub]) => `
      <div class="type-row">
        <div><h3>${t(title)}</h3><p>${t(sub)}</p></div>
        <label class="switch"><input type="checkbox" data-pref="${key}" ${settings[key] !== false ? 'checked' : ''} aria-label="${t(title)}"><span class="switch-ui"></span></label>
      </div>`).join('');
  }

  function applyNoticePref(key, value) {
    const active = document.activeElement;
    const refocusPref = !!(active && active.dataset && active.dataset.pref === key);
    const refocusId = active && active.id ? active.id : '';
    settings[key] = !!value;
    if (Object.prototype.hasOwnProperty.call(draft, key)) draft[key] = !!value;
    if (key === 'soundEnabled' && !value) stopSound();
    if ((key === 'notifEnabled' || key === 'notifyAlerts') && !value) hideAlarm();
    savePrefs();
    syncForm();
    renderHome();
    renderFeed();
    renderProtection();
    if (refocusPref) {
      const scope = document.querySelector('#typesDialog[open]') || document.querySelector('#protectList');
      const again = scope && scope.querySelector(`[data-pref="${key}"]`);
      if (again) again.focus();
    } else if (refocusId) {
      const again = document.getElementById(refocusId);
      if (again) again.focus();
    }
  }

  function restoreNoticePrefs() {
    const defaults = {
      notifEnabled: true,
      soundEnabled: true,
      notifyNew: true,
      notifyUpdates: true,
      notifyAlerts: true,
      notifyService: true,
      notifyInfo: true,
      notifyTest: true
    };
    Object.assign(settings, defaults);
    Object.assign(draft, {
      soundEnabled: true,
      notifyNew: true,
      notifyUpdates: true,
      notifyAlerts: true
    });
    savePrefs();
    syncForm();
    renderHome();
    renderFeed();
    renderProtection();
  }

  function noticeKind(type) {
    if (type === 'service') return t('filterService');
    if (type === 'test' || type === 'info') return t('filterTests');
    return t('filterQuakes');
  }

  function fillFeedSummary(shown) {
    const box = $('#feedSummary');
    if (!box) return;
    const allowed = notices.filter(noticeAllowed);
    const count = (types) => allowed.filter((n) => types.includes(n.type)).length;
    const unread = allowed.filter((n) => !n.isRead).length;
    box.innerHTML = `
      <div><strong>${settings.notifEnabled ? unread : 0}</strong><span>${t('deskSummaryUnread')}</span></div>
      <div><strong>${count(['alert', 'detection', 'update'])}</strong><span>${t('deskSummaryQuakes')}</span></div>
      <div><strong>${count(['service'])}</strong><span>${t('deskSummaryService')}</span></div>
      <div><strong>${count(['test', 'info'])}</strong><span>${t('deskSummaryTests')}</span></div>
      <p class="feed-foot">${tf('deskResults', { n: shown })}</p>`;
  }

  function renderFeed() {
    const badge = $('#navBadge');
    if (!settings.notifEnabled) {
      $('#unreadLabel').textContent = '';
      badge.hidden = true;
      fillFeedSummary(0);
      $('#feed').innerHTML = `<div class="empty"><b>${t('noticesOffTitle')}</b><p>${t('noticesOffSub')}</p></div>`;
      return;
    }
    const groups = { sismos: ['alert', 'detection', 'update'], service: ['service'], test: ['test', 'info'] };
    let list = notices.filter(noticeAllowed).sort((a, b) => b.time - a.time);
    if (feedFilter !== 'all') list = list.filter((n) => (groups[feedFilter] || []).includes(n.type));
    const unread = notices.filter((n) => noticeAllowed(n) && !n.isRead).length;
    $('#unreadLabel').textContent = unread ? `${unread} ${t('unreadCount')}` : '';
    badge.hidden = unread === 0;
    fillFeedSummary(list.length);
    if (!list.length) {
      const blocked = notices.length > 0 && !notices.some(noticeAllowed);
      $('#feed').innerHTML = `<div class="empty"><b>${t(blocked ? 'noticesFilteredTitle' : 'emptyNotifTitle')}</b><p>${t(blocked ? 'noticesFilteredSub' : 'emptyNotifSub')}</p></div>`;
      return;
    }
    let html = '';
    let lastDay = '';
    const closeDay = () => { if (lastDay) html += '</div></section>'; };
    list.forEach((item) => {
      const day = dayBucket(item.time);
      if (day !== lastDay) {
        closeDay();
        lastDay = day;
        html += `<section class="feed-day"><p class="day-label">${t(day)}</p><div class="feed-table">
          <div class="feed-head"><span>${t('deskFeedState')}</span><span>${t('deskFeedNotice')}</span><span>${t('deskFeedKind')}</span><span>${t('deskFeedTime')}</span><span class="feed-head-read">${t('deskFeedRead')}</span></div>`;
      }
      const title = lang === 'en' ? item.titleEn : item.titleEs;
      const body = lang === 'en' ? item.bodyEn : item.bodyEs;
      const toggleLabel = item.isRead ? (lang === 'en' ? 'Mark as unread' : 'Marcar como no leído') : (lang === 'en' ? 'Mark as read' : 'Marcar como leído');
      html += `<div class="feed-row"><button type="button" class="feed-item ${item.type} ${item.isRead ? '' : 'unread'}" data-action="open-notice" data-id="${item.id}">
        <span class="feed-ic">${ICONS[item.type] || ICONS.info}</span>
        <span>
          <span class="feed-top"><b>${title}${item.isRead ? '' : '<i class="unread-dot"></i>'}</b><span class="when">${feedWhen(item.time)}</span></span>
          <p>${body}</p>
        </span>
        <span class="feed-kind">${noticeKind(item.type)}</span>
      </button>
      <button type="button" class="feed-read ${item.isRead ? 'is-read' : ''}" data-action="toggle-read" data-id="${item.id}" aria-label="${toggleLabel}" title="${toggleLabel}">${item.isRead ? READ_ICON : UNREAD_ICON}</button></div>`;
    });
    closeDay();
    $('#feed').innerHTML = html;
  }

  function currentMatch() {
    const ids = activeIds();
    if (ids.length < 2 || !network().quorum) {
      matchState = null;
      return null;
    }
    const key = ids.join('-');
    if (!matchState || matchState.key !== key) matchState = { key, ids: ids.slice(), at: now() };
    return matchState;
  }

  function matchBox(match) {
    const ids = match.ids;
    const title = ids.length === 2 ? ids.map((n) => 'S' + n).join(' + ') : names(ids);
    const body = ids.length === 2 ? t('matchBodyTwo') : t('matchBodyMany');
    const state = ids.length === 2 ? t('matchStateTwo') : tf('matchStateMany', { n: ids.length });
    let skip = '';
    if (ids.length === 2) {
      const mid = [];
      for (let n = ids[0] + 1; n < ids[1]; n++) mid.push('S' + n);
      if (mid.length) skip = `<p>${tf('matchSkip', { name: mid.join(', ') })}</p>`;
    }
    return `<aside class="match-box" role="status">
      <p class="match-kicker"><span class="match-marks" aria-hidden="true"><i></i><i></i></span><span>${t('matchKicker')}</span></p>
      <p class="match-title">${title}</p>
      <p>${body}</p>
      ${skip}
      <p class="match-state">${state}</p>
      <p class="fine">${tf('matchWhen', { time: clockSec(match.at) })}</p>
    </aside>`;
  }

  function renderSensors() {
    const net = network();
    const active = activeIds();
    const match = currentMatch();
    $('#separationNote').textContent = tf('separationLine', { n: spanMeters() });
    const strip = $('#sensorStrip');
    if (strip) {
      const agree = !net.quorum ? 'teleAgreeOff'
        : active.length >= 2 ? 'teleAgreeHit'
        : active.length === 1 ? 'teleAgreeOne'
        : 'teleAgreeWait';
      strip.innerHTML = `
        <div><span>${t('deskSpan')}</span><strong>≈ ${spanMeters()} m</strong></div>
        <div><span>${t('teleAgree')}</span><strong>${t(agree)}</strong></div>
        <p>${t('traceNote')}</p>`;
    }
    let html = '';
    [1, 2, 3].forEach((n) => {
      const on = net.connected.includes(n);
      const moving = on && sensors[n].triggered;
      const paired = moving && active.length >= 2 && net.quorum;
      const cls = !on ? 'off' : paired ? 'match' : moving ? 'move' : '';
      const state = !on ? t('sensorOffline') : paired ? t('sensorMatch') : moving ? t('sensorMove') : t('sensorCalm');
      html += `<article class="sensor-card ${cls}" id="sensorCard-${n}">
        <div class="sensor-head"><b>S${n}</b><em class="sensor-device">${tf('sensorDevice', { n })}</em><span>${state}</span></div>
        <div class="trace-panel">
          <canvas class="wave" id="wave-${n}" role="img" aria-label="${tf('traceLabel', { name: 'S' + n, state })}"></canvas>
        </div>
        <footer class="sensor-foot">
          <p class="sensor-meta" id="reading-${n}">${on ? tf('sensorReading', { time: clockSec(now()) }) : t('sensorUpdatedOff')}</p>
          <p class="sensor-meta">${tf('sensorPart', { n: sensors[n].drills })}</p>
        </footer>
      </article>`;
      if (match && match.ids[0] === n) html += matchBox(match);
    });
    const list = $('#sensorList');
    list.classList.toggle('has-match', !!match);
    if (match) list.dataset.pair = match.ids.join('-');
    else delete list.dataset.pair;
    list.innerHTML = html;
    drawWavesOnce();
  }

  function renderDetail() {
    const q = quakeById(detailId) || quakes[0];
    if (!q) {
      $('#detailTop').innerHTML = `<div class="empty"><b>${t('emptyQuakes')}</b></div>`;
      $('#detailBottom').innerHTML = '';
      return;
    }
    detailId = q.id;
    const m = measure(q);
    const nombre = lang === 'en' ? q.nombreEn : q.nombreEs;
    const efectos = lang === 'en' ? q.efectosEn : q.efectosEs;
    const texto = lang === 'en' ? q.textoEn : q.textoEs;
    const both = `${t('magnitudeWord')} ${t('richterName')} ${Number(q.richter).toFixed(1)} · ${t('intensityWord')} ${t('mercalliName')} ${q.mercalli} (${texto})`;
    $('#detailTop').innerHTML = `
      <div class="detail-hero">
        <div>
          <p class="detail-mag ${magClass(q)}">${m.value}${m.unit ? `<span>${m.unit}</span>` : ''}</p>
          <div class="tags">
            <span class="tag ${q.confirmado ? 'ok' : 'no'}">${q.confirmado ? t('confirmed') : t('unconfirmed')}</span>
            ${q.simulacro ? `<span class="tag drill">${t('drill')}</span>` : ''}
          </div>
          <h2 class="detail-name">${nombre}</h2>
          <p class="detail-when">${fullWhen(q.t)} · ${rel(q.t)}</p>
        </div>
        <div class="scale-pair">
          <div><span>${t('intensityWord')}</span><strong>${q.mercalli}</strong><small>${texto}</small></div>
          <div><span>${t('magnitudeWord')}</span><strong>${Number(q.richter).toFixed(1)}</strong><small>${t('richterName')}</small></div>
        </div>
      </div>
      <p class="fine">${m.caption}</p>`;
    $('#detailBottom').innerHTML = `
      <div class="facts">
        <div class="fact"><span>${t('sensorsLabel')}</span><b>${names(q.nodos)}</b></div>
        <div class="fact"><span>${t('sourceLabel')}</span><b>${t('sourceValue')}</b></div>
        <div class="fact"><span>${t('confirmLabel')}</span><b>${q.confirmado ? t('confirmYes') : t('confirmNo')}</b></div>
      </div>
      <p class="scale-note">${t('scaleNote')}</p>
      <p class="scale-note"><b>${both}</b></p>
      <h2 class="block-title">${t('locationLabel')}</h2>
      <p class="scale-note">${t('locationUnavailable')}</p>
      <p class="fine">${t('mapInstruments')}</p>
      <h2 class="block-title">${t('whatFelt')}</h2>
      <p class="scale-note">${efectos}</p>
      <h2 class="block-title">${t('timelineTitle')}</h2>
      <ol class="timeline">
        <li>${q.nodos.length >= 2 ? tf('timelineMatch', { names: names(q.nodos) }) : tf('timelineAlone', { names: names(q.nodos) })}</li>
        <li>${q.confirmado ? t('timelineConfirmed') : t('timelineRejected')}</li>
      </ol>
      <button type="button" class="btn" data-action="open-prevention" style="margin-top:16px">${t('preventionLink')}</button>`;
    ensureDetailMap();
  }

  function renderSheet() {
    const sheet = $('#mapSheet');
    const list = visibleQuakes();
    $('#btnMapList').textContent = tf('mapCount', { n: list.length });
    const live = $('#mapLiveText');
    const dot = $('#mapLivePill .dot');
    const mode = statusMode();
    live.textContent = mode === 'bad' ? t('monitoringOff') : t('mapLive');
    dot.className = 'dot ' + (mode === 'bad' ? 'off' : mode === 'alert' ? 'alert' : mode === 'warn' ? 'warn' : '');
    if (sheetMode === 'list') {
      sheet.innerHTML = `<div class="sheet-handle"></div><h2>${t('listTitle')}</h2>` +
        (list.length ? `<div class="sheet-list">${list.map((q) => eventButton(q)).join('')}</div>` : `<p class="empty">${t('emptyQuakes')}</p>`) +
        `<button type="button" class="linkish" data-action="sheet-event">${t('close')}</button>`;
      liftMapChrome();
      return;
    }
    if (sheetMode === 'sensor' && selectedSensor) {
      const n = selectedSensor;
      const on = network().connected.includes(n);
      const moving = on && sensors[n].triggered;
      const state = !on ? t('sheetSensorOff') : moving ? t('sheetSensorMove') : t('sheetSensorCalm');
      sheet.innerHTML = `
        <div class="sheet-handle"></div>
        <h2>S${n}</h2>
        <p class="muted">${state}</p>
        <p class="source-line">${tf('sensorPart', { n: sensors[n].drills })}</p>
        <p class="map-note">${tf('separationLine', { n: spanMeters() })}</p>
        <button type="button" class="btn" data-action="open-sensors">${t('viewAll')}</button>`;
      liftMapChrome();
      return;
    }
    const q = selectedQuake();
    if (!q) {
      sheet.innerHTML = `<div class="sheet-handle"></div><p>${t('emptyQuakes')}</p>`;
      liftMapChrome();
      return;
    }
    const m = measure(q);
    const nombre = lang === 'en' ? q.nombreEn : q.nombreEs;
    sheet.innerHTML = `
      <div class="sheet-handle"></div>
      <p class="sheet-kicker">${t('deskSelected')}</p>
      <div class="sheet-event">
        <div class="mag ${magClass(q)}">${m.value}${m.unit ? `<small>${m.unit}</small>` : ''}</div>
        <div>
          <h2>${nombre}</h2>
          <p class="muted">${rel(q.t)} · ${clock(q.t)}</p>
          <div class="tags">
            <span class="tag ${q.confirmado ? 'ok' : 'no'}">${q.confirmado ? t('confirmed') : t('unconfirmed')}</span>
            ${q.simulacro ? `<span class="tag drill">${t('drill')}</span>` : ''}
          </div>
          <p class="source-line">${t('sourceValue')}</p>
        </div>
      </div>
      <button type="button" class="btn" data-action="sheet-detail">${ICONS.globe} ${t('viewDetails')}</button>
      <p class="map-note">${t('mapNote')}</p>`;
    liftMapChrome();
  }

  function liftMapChrome() {
    const sheet = $('#mapSheet');
    if (!sheet || !sheet.offsetHeight) return;
    document.documentElement.style.setProperty('--sheet', sheet.offsetHeight + 'px');
  }

  function eventButton(q) {
    const m = measure(q);
    const nombre = lang === 'en' ? q.nombreEn : q.nombreEs;
    return `<button type="button" class="event-row" data-action="select-quake" data-id="${q.id}">
      <div class="mag ${magClass(q)}">${m.value}${m.unit ? `<small>${m.unit}</small>` : ''}</div>
      <div class="event-copy"><b>${nombre}</b><p>${rel(q.t)}</p></div>
      ${ICONS.chev}
    </button>`;
  }

  function renderChecks() {
    const kitState = loadJson('sismica_kit', {});
    const homeState = loadJson('sismica_home', {});
    const kit = $('#kitList');
    const home = $('#homeList');
    if (kit) kit.innerHTML = KIT.map((key) => tick('kit', key, !!kitState[key])).join('');
    if (home) home.innerHTML = HOME_ITEMS.map((key) => tick('home', key, !!homeState[key])).join('');
    const kitOn = KIT.filter((k) => kitState[k]).length;
    const homeOn = HOME_ITEMS.filter((k) => homeState[k]).length;
    const kitProgress = $('#kitProgress');
    const homeProgress = $('#homeProgress');
    if (kitProgress) kitProgress.textContent = tf('kitProgress', { n: kitOn, total: KIT.length });
    if (homeProgress) homeProgress.textContent = tf('kitProgress', { n: homeOn, total: HOME_ITEMS.length });
  }
  function tick(group, key, checked) {
    return `<label class="tick"><input type="checkbox" data-store="${group}" data-key="${key}" ${checked ? 'checked' : ''}><span>${t(key)}</span></label>`;
  }

  function renderAll() {
    syncChrome();
    renderHome();
    renderFeed();
    renderProtection();
    renderSensors();
    renderSheet();
    if (currentView === 'detalle') renderDetail();
    renderChecks();
    syncForm();
    refreshMarkers();
    if (alarmQuake && $('#alarm').open) fillAlarm(alarmQuake);
  }

  const wideQuery = matchMedia('(min-width: 768px)');
  const deskQuery = matchMedia('(min-width: 1024px)');
  function layoutWide() { return wideQuery.matches; }
  function layoutDesk() { return deskQuery.matches; }
  function themeSlot() {
    if (layoutWide()) return $('#topActions');
    if (currentView === 'mapa') return $('#mapThemeSlot');
    if (currentView === 'avisos' || currentView === 'proteccion') {
      return document.querySelector('#view-' + currentView + ' .page-tools');
    }
    return $('#topActions');
  }
  function applyNav(collapsed, persist) {
    document.body.classList.toggle('nav-collapsed', collapsed);
    if (collapsed) document.documentElement.dataset.nav = 'closed';
    else delete document.documentElement.dataset.nav;
    const btn = $('#navToggle');
    if (btn) {
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      btn.setAttribute('aria-label', t(collapsed ? 'navExpand' : 'navCollapse'));
      btn.dataset.tip = btn.getAttribute('aria-label');
    }
    if (persist) localStorage.setItem('sismica_nav', collapsed ? 'closed' : 'open');
    requestAnimationFrame(() => {
      if (map) map.invalidateSize();
      if (detailMap) detailMap.invalidateSize();
    });
  }
  function placeChrome() {
    const btn = $('#btnTheme');
    const slot = themeSlot();
    if (!btn || !slot) return;
    if (btn.parentElement !== slot) slot.appendChild(btn);
    document.body.classList.add('chrome-ready');
  }

  function syncChrome() {
    placeChrome();
    document.body.dataset.view = currentView;
    const wide = layoutWide();
    const stacked = ['detalle', 'sismografos', 'prevencion'].includes(currentView);
    $('#btnBack').hidden = !stacked;
    $('#wordmark').hidden = wide || currentView !== 'ahora';
    $('#topActions').hidden = false;
    const namesTitle = {
      ahora: t('navHome'), mapa: t('navMap'), avisos: t('feedTitle'), proteccion: t('navProtection'),
      detalle: t('viewDetails'), sismografos: t('sensorsHeading'), prevencion: t('prevHeading'), ajustes: t('navSettings')
    };
    const title = $('#topTitle');
    if (layoutWide()) {
      title.hidden = false;
      title.textContent = namesTitle[currentView] || '';
    } else if (stacked) {
      title.hidden = false;
      title.textContent = t(TITLES[currentView] || 'brandName');
    } else title.hidden = true;
    $$('.tab').forEach((tab) => {
      const on = tab.dataset.view === currentView;
      tab.classList.toggle('on', on);
      if (on) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
      const label = tab.querySelector('span:last-child');
      if (label) tab.dataset.tip = label.textContent;
    });
    syncThemeButton();
    syncDeskLive();
    document.title = `${t('brandName')} — ${namesTitle[currentView] || ''}`.trim();
  }

  function syncDeskLive() {
    const live = $('#deskLive');
    if (!live) return;
    const mode = statusMode();
    live.dataset.mode = mode;
    live.textContent = mode === 'bad' ? t('monitoringOff') : t('monitoringLive');
  }

  function syncThemeButton() {
    const btn = $('#btnTheme');
    if (!btn) return;
    const label = t(resolvedTheme() === 'dark' ? 'themeToLight' : 'themeToDark');
    btn.setAttribute('aria-label', label);
    btn.dataset.tip = label;
    const text = btn.querySelector('.theme-label');
    if (text) text.textContent = label;
  }

  function navigate(view, id) {
    view = ALIAS[view] || view;
    if (!VIEWS.includes(view)) view = 'ahora';
    if (view === 'detalle') {
      if (currentView !== 'detalle') backTo = currentView;
      detailId = id || detailId;
    }
    currentView = view;
    $$('.view').forEach((sec) => sec.classList.toggle('on', sec.id === 'view-' + view));
    const hash = view === 'detalle' ? `detalle/${detailId}` : view;
    if (location.hash.slice(1) !== hash) history.replaceState(null, '', '#' + hash);
    syncChrome();
    if (view !== 'mapa') $('#main').scrollTop = 0;
    if (view === 'mapa') {
      ensureMap();
      requestAnimationFrame(() => map && map.invalidateSize());
      renderSheet();
    }
    if (view === 'detalle') {
      renderDetail();
      requestAnimationFrame(() => detailMap && detailMap.invalidateSize());
    }
    if (view === 'sismografos') drawWavesOnce();
    if (view === 'avisos') renderFeed();
  }

  function showProtocol(name) {
    $$('[data-action="protocol"]').forEach((b) => {
      const on = b.dataset.protocol === name;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== name; });
  }

  function audioEl() { return $('#alertaAudio'); }
  function startSound() {
    if (!settings.soundEnabled) return;
    const audio = audioEl();
    if (!audio) return;
    try {
      audio.currentTime = 0;
      const p = audio.play();
      if (p) p.catch(() => {});
    } catch (e) {}
  }
  function stopSound() {
    const audio = audioEl();
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }

  function fillAlarm(q) {
    alarmQuake = q;
    const m = measure(q);
    $('#alarmKicker').textContent = q.simulacro ? t('alarmKicker') : t('alarmTitle');
    $('#alarmHeading').textContent = t('alarmTitle');
    $('#alarmAction').textContent = t('alarmAction');
    $('#alarmLead').textContent = t('alarmLead');
    $('#alarmMeta').textContent = tf('alarmMeta', { measure: m.caption, names: names(q.nodos) });
    $('#alarmFine').textContent = t('alarmFine');
    $('#alarmTimer').textContent = tf('alarmTimer', { n: alarmLeft });
  }

  function openAlarm(q, { force = false } = {}) {
    if (!q) return;
    if (!force) {
      if (!settings.notifEnabled || !settings.notifyAlerts || !meetsThreshold(q)) return;
    }
    alarmLeft = ALERT_SECONDS;
    fillAlarm(q);
    const dialog = $('#alarm');
    if (!dialog.open) dialog.showModal();
    startSound();
    clearInterval(alarmTick);
    clearTimeout(alarmTimer);
    alarmTick = setInterval(() => {
      alarmLeft -= 1;
      const el = $('#alarmTimer');
      if (el) el.textContent = tf('alarmTimer', { n: Math.max(0, alarmLeft) });
      if (alarmLeft <= 0) clearInterval(alarmTick);
    }, 1000);
    alarmTimer = setTimeout(closeAlarm, ALERT_SECONDS * 1000);
  }

  function hideAlarm() {
    const dialog = $('#alarm');
    if (dialog && dialog.open) dialog.close();
    stopSound();
    clearInterval(alarmTick);
    clearTimeout(alarmTimer);
    alarmTick = null;
    alarmTimer = null;
  }

  function closeAlarm() {
    const dialog = $('#alarm');
    if (dialog.open) dialog.close();
    stopSound();
    clearInterval(alarmTick);
    clearTimeout(alarmTimer);
    alarmTick = null;
    alarmTimer = null;
    const cerrada = alarmQuake;
    alarmQuake = null;
    if (LIVE && cerrada) capsulaDeAlerta(cerrada);
    [1, 2, 3].forEach((n) => {
      clearTimeout(sensors[n].timer);
      sensors[n].triggered = false;
      sensors[n].since = 0;
    });
    alertLatched = false;
    renderHome();
    renderSensors();
    refreshMarkers();
    syncPulse();
  }

  function systemNotice(title, body) {
    if (!settings.notifEnabled || !settings.notifyAlerts) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try { new Notification(title, { body, silent: true }); } catch (e) {}
  }

  function pushNotice() {
    const id = 'n-live-' + Date.now();
    const titleEs = 'Alerta de prueba — protégete';
    const titleEn = 'Practice alert — protect yourself';
    const bodyEs = 'Dos sismógrafos de la prueba coincidieron. Es un simulacro.';
    const bodyEn = 'Two practice seismographs matched. This is a drill.';
    notices.unshift({
      id, type: 'alert', quakeId: 'q-demo-1', time: now(), isRead: false,
      titleEs, titleEn, bodyEs, bodyEn
    });
    systemNotice(lang === 'en' ? titleEn : titleEs, lang === 'en' ? bodyEn : bodyEs);
    renderFeed();
  }

  function guardarLeidos() {
    if (!LIVE) return;
    notices.forEach((n) => { if (n.isRead) leidos.add(n.id); else leidos.delete(n.id); });
    try { localStorage.setItem(LEIDOS_KEY, JSON.stringify([...leidos].slice(-500))); } catch (e) {}
  }

  function toggleSensor(n) {
    if (LIVE) return; // en vivo no se simulan movimientos: solo se muestran los de la red real
    n = Number(n);
    if (!network().connected.includes(n)) return;
    const s = sensors[n];
    if (s.triggered) {
      clearTimeout(s.timer);
      s.triggered = false;
      s.since = 0;
    } else {
      s.triggered = true;
      s.since = now();
      s.timer = setTimeout(() => {
        s.triggered = false;
        s.since = 0;
        considerAlert(false);
        renderHome();
        renderSensors();
        refreshMarkers();
        syncPulse();
      }, 12000);
    }
    considerAlert(true);
    renderHome();
    renderSensors();
    renderSheet();
    refreshMarkers();
    syncPulse();
  }

  function considerAlert(fromToggle) {
    const ids = activeIds();
    if (ids.length >= 2 && network().quorum) {
      if (!alertLatched) {
        alertLatched = true;
        ids.forEach((n) => { sensors[n].drills += 1; });
        if (fromToggle) {
          if (settings.notifEnabled && settings.notifyAlerts && meetsThreshold(quakes[0])) pushNotice();
          openAlarm(quakes[0], { force: false });
        }
      }
    } else if (ids.length < 2) {
      alertLatched = false;
    }
  }

  function markerStyle(n) {
    const on = network().connected.includes(n);
    const q = selectedQuake();
    const inEvent = !!(q && q.nodos.includes(n) && sheetMode !== 'list');
    if (!on) return { color: '#8a867f', fillColor: '#d9d4cc', fillOpacity: 1, weight: 2, radius: 7 };
    if (sensors[n].triggered && activeIds().length >= 2) return { color: '#b42318', fillColor: '#ffffff', fillOpacity: 1, weight: 3, radius: 8 };
    if (sensors[n].triggered) return { color: '#c2612a', fillColor: '#ffffff', fillOpacity: 1, weight: 3, radius: 8 };
    return { color: '#0b6b57', fillColor: '#ffffff', fillOpacity: 1, weight: inEvent ? 3 : 2, radius: inEvent ? 8 : 7 };
  }

  function refreshMarkers() {
    [1, 2, 3].forEach((n) => {
      if (!markers[n]) return;
      markers[n].setStyle(markerStyle(n));
      const on = network().connected.includes(n);
      const label = 'S' + n + ' · ' + (!on ? t('sensorOffline') : sensors[n].triggered ? t('sensorMove') : t('sensorCalm'));
      markers[n].unbindTooltip();
      markers[n].bindTooltip(label, { direction: 'top', className: 'pin-tip' });
    });
  }

  function ensureMap() {
    const fallback = $('#mapFallback');
    if (!window.L) {
      fallback.hidden = false;
      fallback.textContent = t('mapFallback');
      return;
    }
    fallback.hidden = true;
    if (map) {
      refreshMarkers();
      return;
    }
    map = L.map('liveMap', { zoomControl: false, attributionControl: true });
    tiles = L.tileLayer(tileUrl(), {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19
    }).addTo(map);
    const bounds = [];
    [1, 2, 3].forEach((n) => {
      const p = INSTRUMENTS[n];
      bounds.push([p.lat, p.lon]);
      markers[n] = L.circleMarker([p.lat, p.lon], markerStyle(n)).addTo(map);
      markers[n].on('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        selectedSensor = n;
        sheetMode = 'sensor';
        renderSheet();
        refreshMarkers();
      });
    });
    map.on('click', () => {
      if (sheetMode === 'sensor') {
        sheetMode = 'event';
        selectedSensor = null;
        renderSheet();
      }
    });
    const c = centroid();
    L.marker([c.lat, c.lon], {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({ className: 'group-label', html: '<span>S1 · S2 · S3</span>', iconSize: [108, 24], iconAnchor: [54, 34] })
    }).addTo(map);
    map.fitBounds(bounds, { padding: [80, 80], maxZoom: 18 });
    refreshMarkers();
    setTimeout(() => map.invalidateSize(), 60);
  }

  function ensureDetailMap() {
    if (!window.L) {
      $('#detailMap').innerHTML = `<p class="fine" style="padding:16px">${t('mapFallback')}</p>`;
      return;
    }
    if (!detailMap) {
      detailMap = L.map('detailMap', { zoomControl: false, attributionControl: true, scrollWheelZoom: false });
      detailTiles = L.tileLayer(tileUrl(), {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19
      }).addTo(detailMap);
      [1, 2, 3].forEach((n) => {
        const p = INSTRUMENTS[n];
        L.circleMarker([p.lat, p.lon], { radius: 7, color: '#0b6b57', weight: 2, fillColor: '#fff', fillOpacity: 1 })
          .addTo(detailMap);
      });
      const bounds = Object.values(INSTRUMENTS).map((p) => [p.lat, p.lon]);
      detailMap.fitBounds(bounds, { padding: [24, 24], maxZoom: 18 });
    }
    setTimeout(() => detailMap.invalidateSize(), 50);
  }

  function locate() {
    if (!navigator.geolocation) {
      openHelp(t('locateMe'), t('locateUnsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      userPoint = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      if (map && window.L) {
        if (userMarker) map.removeLayer(userMarker);
        userMarker = L.circleMarker([userPoint.lat, userPoint.lon], {
          radius: 7, color: '#24558a', weight: 2, fillColor: '#24558a', fillOpacity: 0.9
        }).addTo(map);
        const bounds = [...Object.values(INSTRUMENTS).map((p) => [p.lat, p.lon]), [userPoint.lat, userPoint.lon]];
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      }
      renderHome();
      renderSheet();
    }, () => openHelp(t('locateMe'), t('locateDenied')), { enableHighAccuracy: true, timeout: 8000 });
  }

  function openHelp(title, body) {
    $('#helpTitle').textContent = title;
    $('#helpBody').textContent = body;
    const dialog = $('#helpDialog');
    if (!dialog.open) dialog.showModal();
  }

  function fixCheck(id, how) {
    const checks = protectionChecks();
    const item = checks.find((c) => c.id === id);
    if (how === 'settings' || how === 'sound' || how === 'network') {
      navigate('ajustes');
      return;
    }
    if (how === 'permission' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().finally(() => renderProtection());
      return;
    }
    if (item) openHelp(item.title, item.help || item.hint);
  }

  function syncPulse() {
    $$('[data-action="toggle-sensor"]').forEach((b) => {
      const n = Number(b.dataset.id);
      const on = network().connected.includes(n);
      const moving = on && sensors[n].triggered;
      b.disabled = !on;
      b.classList.toggle('on', moving);
      b.setAttribute('aria-pressed', moving ? 'true' : 'false');
    });
  }

  let tracePalette = null;
  let tracePaletteKey = '';
  function palette() {
    const key = document.documentElement.dataset.theme || 'light';
    if (tracePalette && tracePaletteKey === key) return tracePalette;
    const cs = getComputedStyle(document.documentElement);
    const g = (name) => cs.getPropertyValue(name).trim();
    tracePaletteKey = key;
    tracePalette = {
      trace: g('--blue'),
      grid: g('--trace-grid'),
      gridStrong: g('--trace-grid-strong'),
      text: g('--muted'),
      zero: g('--trace-zero')
    };
    return tracePalette;
  }

  // Misma forma que el sismograma del operador: ruido de fondo y, si hay un
  // evento con amplitud, subida y atenuación. Aquí no hay serie en g; el
  // aumento solo marca el estado de prueba que ya dura 12 s.
  function traceSample(n, t) {
    let v = 0.0035 * (
      Math.sin(t * 41.3 + n * 1.7) +
      0.6 * Math.sin(t * 97.1 + n) +
      0.4 * Math.sin(t * 13.7 + n * 3)
    );
    const s = sensors[n];
    if (s.triggered && s.since) {
      const dt = t - s.since;
      if (dt >= 0 && dt < 16) {
        const A = 0.05;
        if (dt < 1.4) v += 0.22 * A * (dt / 1.4) * Math.sin(2 * Math.PI * 7.3 * dt);
        else {
          const u = dt - 1.4;
          v += A * Math.min(1, u / 0.35) * Math.exp(-u / 4.2) * Math.sin(2 * Math.PI * 2.1 * u);
        }
      }
    }
    return v;
  }

  function drawWavesOnce() {
    [1, 2, 3].forEach((n) => drawWave(n));
  }
  function drawWave(n) {
    const c = $('#wave-' + n);
    if (!c) return;
    const w = Math.floor(c.clientWidth);
    const h = Math.floor(c.clientHeight || 168);
    if (w < 2 || h < 2) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const C = palette();
    const on = network().connected.includes(n);
    const padL = 10;
    const padR = 22;
    const padT = 22;
    const padB = 18;
    const pw = w - padL - padR;
    const ph = h - padT - padB;
    const t1 = now();
    const t0 = t1 - TRACE_WINDOW;
    const yMax = 0.08;
    const mid = padT + ph / 2;
    const xOf = (t) => padL + ((t - t0) / TRACE_WINDOW) * pw;
    const scale = (ph / 2 - 6) / yMax;

    ctx.font = '11px "Source Sans 3", sans-serif';
    for (let tt = Math.ceil(t0 / 3) * 3; tt <= t1 + 0.001; tt += 3) {
      const x = Math.round(xOf(tt)) + 0.5;
      const major = Math.round(tt) % 6 === 0;
      ctx.strokeStyle = major ? C.gridStrong : C.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + ph);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = C.text;
        const label = clockSec(tt).slice(-5);
        ctx.fillText(label, Math.min(Math.max(x - 16, padL), padL + pw - 34), h - 4);
      }
    }

    ctx.strokeStyle = C.zero;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, mid + 0.5);
    ctx.lineTo(padL + pw, mid + 0.5);
    ctx.stroke();

    ctx.fillStyle = C.text;
    ctx.fillText('+', w - padR + 4, padT + 10);
    ctx.fillText('0', w - padR + 4, mid + 4);
    ctx.fillText('−', w - padR + 4, padT + ph - 2);

    ctx.strokeStyle = on ? C.trace : C.text;
    ctx.lineWidth = 1.25;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (!on) ctx.setLineDash([4, 3]);
    ctx.beginPath();
    const step = TRACE_WINDOW / pw;
    let started = false;
    let lastX = padL;
    let lastY = mid;
    for (let px = 0; px < pw; px++) {
      const v = on ? traceSample(n, t0 + px * step) : 0;
      const y = mid - Math.max(-yMax, Math.min(yMax, v)) * scale;
      const x = padL + px + 0.5;
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
      lastX = x;
      lastY = y;
    }
    ctx.stroke();
    ctx.setLineDash([]);
    if (on) {
      ctx.fillStyle = C.trace;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    const stamp = on ? clockSec(t1) : t('sensorUpdatedOff');
    ctx.font = '600 12px "Source Sans 3", sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText('S' + n + '  ·  ' + stamp, padL + 2, 14);

    const meta = $('#reading-' + n);
    if (meta) {
      const text = on ? tf('sensorReading', { time: clockSec(t1) }) : t('sensorUpdatedOff');
      if (meta.textContent !== text) meta.textContent = text;
    }
  }
  let lastWave = 0;
  function waveLoop(ts) {
    const quiet = document.documentElement.dataset.reduceMotion === 'true' || document.hidden;
    if (currentView === 'sismografos' && !quiet && ts - lastWave > 32) {
      lastWave = ts;
      [1, 2, 3].forEach(drawWave);
    }
    requestAnimationFrame(waveLoop);
  }

  function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'close-review') { location.hash = 'ahora'; return; }
    if (action === 'nav') navigate(el.dataset.view);
    else if (action === 'nav-toggle') applyNav(!document.body.classList.contains('nav-collapsed'), true);
    else if (action === 'back') navigate(currentView === 'detalle' ? (backTo || 'ahora') : (PARENT[currentView] || 'ahora'));
    else if (action === 'open-settings') navigate('ajustes');
    else if (action === 'cycle-theme') applyTheme(resolvedTheme() === 'dark' ? 'light' : 'dark');
    else if (action === 'open-protect') navigate('proteccion');
    else if (action === 'open-sensors') navigate('sismografos');
    else if (action === 'open-map') navigate('mapa');
    else if (action === 'jump-setting') {
      $$('[data-action="jump-setting"]').forEach((b) => b.classList.toggle('on', b === el));
      const target = document.getElementById(el.dataset.target);
      if (target) target.scrollIntoView({ block: 'start' });
    }
    else if (action === 'open-prevention') { navigate('prevencion'); showProtocol('durante'); }
    else if (action === 'open-detail') { navigate('detalle', el.dataset.id); }
    else if (action === 'open-notice') openNotice(el.dataset.id);
    else if (action === 'open-alarm' || action === 'test-alert') openAlarm(qFirst(), { force: true });
    else if (action === 'dismiss-alarm') closeAlarm();
    else if (action === 'alarm-details') { const id = (alarmQuake && alarmQuake.id) || qFirst().id; closeAlarm(); navigate('detalle', id); }
    else if (action === 'close-help') $('#helpDialog').close();
    else if (action === 'open-types') {
      renderTypes();
      const dialog = $('#typesDialog');
      if (dialog && !dialog.open) dialog.showModal();
    } else if (action === 'close-types') {
      const dialog = $('#typesDialog');
      if (dialog && dialog.open) dialog.close();
    } else if (action === 'ask-permission') requestBrowserPermission();
    else if (action === 'perm-help') openHelp(t('checkPermTitle'), t('checkPermBlocked'));
    else if (action === 'restore-notices') restoreNoticePrefs();
    else if (action === 'feed-filter') {
      feedFilter = el.dataset.filter;
      $$('[data-action="feed-filter"]').forEach((b) => b.classList.toggle('on', b === el));
      renderFeed();
    } else if (action === 'toggle-read') {
      const n = notices.find((x) => x.id === el.dataset.id);
      if (n) { n.isRead = !n.isRead; guardarLeidos(); renderFeed(); }
    } else if (action === 'mark-read') {
      notices.forEach((n) => { n.isRead = true; });
      guardarLeidos();
      renderFeed();
    } else if (action === 'mag-filter') {
      magFilter = el.dataset.filter;
      $$('[data-action="mag-filter"]').forEach((b) => b.classList.toggle('on', b === el));
      const vis = visibleQuakes();
      if (vis[0]) detailId = vis[0].id;
      sheetMode = 'event';
      renderSheet();
      refreshMarkers();
    } else if (action === 'sheet-list') { sheetMode = 'list'; renderSheet(); }
    else if (action === 'sheet-event') { sheetMode = 'event'; selectedSensor = null; renderSheet(); }
    else if (action === 'select-quake') {
      detailId = el.dataset.id; sheetMode = 'event'; selectedSensor = null; renderSheet(); refreshMarkers();
    } else if (action === 'sheet-detail') navigate('detalle', selectedQuake() && selectedQuake().id);
    else if (action === 'toggle-sensor') toggleSensor(el.dataset.id);
    else if (action === 'help') {
      const item = protectionChecks().find((c) => c.id === el.dataset.check);
      if (item) openHelp(item.title, item.help || item.hint);
    } else if (action === 'fix') fixCheck(el.dataset.check, el.dataset.fix);
    else if (action === 'scale' || action === 'notify-scale') applyScale(el.dataset.scale);
    else if (action === 'range-preset') {
      const spec = scaleSpec(draft.notifyScale);
      if (el.dataset.preset === 'all') setBounds(draft, spec.min, spec.max);
      else if (el.dataset.preset === 'from') setBounds(draft, draft.notifyScale === 'richter' ? 4 : 4, spec.max);
      else { const minEl = $('#rangeMin'); if (minEl) minEl.focus(); }
      renderThreshold();
    } else if (action === 'save-thresholds') {
      Object.assign(settings, thresholdState(draft));
      draft = normalizeThreshold(settings);
      savePrefs();
      renderAll();
    } else if (action === 'cancel-thresholds') {
      draft = normalizeThreshold(settings);
      renderThreshold();
    } else if (action === 'reset-thresholds') {
      draft = normalizeThreshold({
        ...settings,
        notifyScale: 'mercalli',
        minMercalli: 4, maxMercalli: 12,
        minRichter: 4, maxRichter: 9
      });
      renderThreshold();
    } else if (action === 'lang') { lang = el.dataset.lang === 'en' ? 'en' : 'es'; applyLanguage(); }
    else if (action === 'theme') applyTheme(el.dataset.theme);
    else if (action === 'font') applyFont(el.dataset.font);
    else if (action === 'network') {
      networkId = NETWORKS[el.dataset.network] ? el.dataset.network : 'ok';
      [1, 2, 3].forEach((n) => {
        if (!network().connected.includes(n)) {
          sensors[n].triggered = false;
          sensors[n].since = 0;
          clearTimeout(sensors[n].timer);
        }
      });
      considerAlert(false);
      renderAll();
    } else if (action === 'zoom-in') map && map.zoomIn();
    else if (action === 'zoom-out') map && map.zoomOut();
    else if (action === 'locate') locate();
    else if (action === 'test-sound') toggleSoundTest();
    else if (action === 'protocol') showProtocol(el.dataset.protocol);
    else if (action === 'prep-toggle') togglePrep(el);
  }

  function openNotice(id) {
    const item = notices.find((n) => n.id === id);
    if (!item) return;
    item.isRead = true;
    guardarLeidos();
    renderFeed();
    if (item.quakeId) navigate('detalle', item.quakeId);
    else openHelp(lang === 'en' ? item.titleEn : item.titleEs, lang === 'en' ? item.bodyEn : item.bodyEs);
  }

  function toggleSoundTest() {
    const btn = $('#btnTestSound span') || $('#btnTestSound');
    if (soundTest) {
      stopSound();
      soundTest = false;
      clearTimeout(soundTestTimer);
      if (btn) btn.textContent = t('btnTestSound');
      return;
    }
    const prev = settings.soundEnabled;
    settings.soundEnabled = true;
    startSound();
    settings.soundEnabled = prev;
    soundTest = true;
    if (btn) btn.textContent = t('btnStopSound');
    soundTestTimer = setTimeout(() => {
      stopSound();
      soundTest = false;
      const again = $('#btnTestSound span') || $('#btnTestSound');
      if (again) again.textContent = t('btnTestSound');
    }, 12000);
  }

  function requestBrowserPermission() {
    const aviso = (kind, texto) => isl({ id: 'permiso', kind, title: t('checkPermTitle'), text: texto.split('. ')[0].replace(/\.$/, ''), more: texto, ttl: 12000 });
    if (!('Notification' in window)) {
      aviso('info', t('checkPermNaHelp'));
      renderProtection();
      return;
    }
    if (Notification.permission !== 'default') {
      aviso(Notification.permission === 'denied' ? 'warn' : 'success', Notification.permission === 'denied' ? t('checkPermBlocked') : t('checkPermGrantedHelp'));
      renderProtection();
      return;
    }
    Notification.requestPermission().then((r) => {
      aviso(r === 'granted' ? 'success' : 'warn', r === 'granted' ? t('checkPermGrantedHelp') : t('checkPermBlocked'));
    }).finally(() => {
      renderHome();
      renderProtection();
    });
  }

  function onChange(e) {
    const el = e.target;
    if (el.dataset.pref) { applyNoticePref(el.dataset.pref, el.checked); return; }
    if (el.id === 'switchMotion') applyMotion(el.checked);
    else if (el.dataset.store) {
      const key = el.dataset.store === 'kit' ? 'sismica_kit' : 'sismica_home';
      const data = loadJson(key, {});
      data[el.dataset.key] = el.checked;
      localStorage.setItem(key, JSON.stringify(data));
      renderChecks();
    }
  }

  function togglePrep(button) {
    const article = button.closest('.prep');
    const more = article && article.querySelector('.prep-more');
    if (!article || !more) return;
    const open = button.getAttribute('aria-expanded') !== 'true';
    $$('.prep').forEach((other) => {
      if (other === article) return;
      other.classList.remove('is-open');
      const hit = other.querySelector('.prep-hit');
      const panel = other.querySelector('.prep-more');
      if (hit) hit.setAttribute('aria-expanded', 'false');
      if (panel) panel.hidden = true;
    });
    article.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    more.hidden = !open;
    if (open) {
      const reduce = document.documentElement.dataset.reduceMotion === 'true'
        || matchMedia('(prefers-reduced-motion: reduce)').matches;
      article.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    }
  }

  function syncReview() {
    const on = location.hash === '#missing-states';
    if (on) document.documentElement.dataset.review = 'true';
    else delete document.documentElement.dataset.review;
    const frame = $('#reviewFrame');
    const close = $('#reviewClose');
    if (frame) {
      if (on && !frame.getAttribute('src')) frame.src = './revision/index.html#missing-states';
      frame.hidden = !on;
    }
    if (close) {
      close.hidden = !on;
      close.textContent = t('reviewClose');
    }
    return on;
  }

  function boot() {
    document.body.addEventListener('click', onClick);
    document.body.addEventListener('change', onChange);
    document.body.addEventListener('input', (e) => {
      const id = e.target.id;
      if (id === 'rangeMin' || id === 'numMin') applyBound('min', e.target.value);
      else if (id === 'rangeMax' || id === 'numMax') applyBound('max', e.target.value);
    });
    document.body.addEventListener('focusout', (e) => {
      if (e.target.id === 'numMin' || e.target.id === 'numMax') renderThreshold();
    });
    document.body.addEventListener('pointerdown', (e) => {
      if (e.target.id !== 'rangeMin' && e.target.id !== 'rangeMax') return;
      $('#rangeMin').style.zIndex = e.target.id === 'rangeMin' ? '4' : '2';
      $('#rangeMax').style.zIndex = e.target.id === 'rangeMax' ? '4' : '2';
    });
    $('#alarm').addEventListener('cancel', (e) => { e.preventDefault(); closeAlarm(); });
    window.addEventListener('hashchange', () => {
      if (syncReview()) return;
      const raw = location.hash.slice(1);
      const [view, id] = raw.split('/');
      navigate(view || 'ahora', id);
    });
    window.addEventListener('online', () => { renderHome(); renderProtection(); });
    window.addEventListener('offline', () => { renderHome(); renderProtection(); });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { renderHome(); renderProtection(); }
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (settings.theme === 'system') applyTheme('system');
    });
    applyNav(localStorage.getItem('sismica_nav') === 'closed', false);
    wideQuery.addEventListener('change', () => {
      syncChrome();
      requestAnimationFrame(() => {
        if (map) map.invalidateSize();
        if (detailMap) detailMap.invalidateSize();
        liftMapChrome();
        if (currentView === 'sismografos') drawWavesOnce();
      });
    });
    deskQuery.addEventListener('change', () => {
      syncChrome();
      requestAnimationFrame(() => {
        if (map) map.invalidateSize();
        if (detailMap) detailMap.invalidateSize();
        liftMapChrome();
        if (currentView === 'sismografos') drawWavesOnce();
      });
    });
    let layoutTick = 0;
    window.addEventListener('resize', () => {
      clearTimeout(layoutTick);
      layoutTick = setTimeout(() => {
        if (map) map.invalidateSize();
        if (detailMap) detailMap.invalidateSize();
        liftMapChrome();
        if (currentView === 'sismografos') drawWavesOnce();
      }, 80);
    });
    applyTheme(settings.theme);
    applyFont(settings.fontSize);
    applyMotion(settings.reduceMotion);
    applyLanguage();
    showProtocol('durante');
    if (!syncReview()) {
      const raw = params.get('view') || (location.hash ? location.hash.slice(1) : 'ahora');
      const [view, id] = raw.split('/');
      navigate(view || 'ahora', id);
    }
    if (!waveStarted) { waveStarted = true; waveLoop(); }
    setInterval(() => {
      renderLatest();
      if (currentView === 'mapa') renderSheet();
      if (currentView === 'avisos') renderFeed();
    }, 30000);
    if (params.has('alerta')) openAlarm(qFirst(), { force: true });
  }

  const listo = window.VybraVivo ? window.VybraVivo.listo : Promise.resolve('demo');
  const arrancar = () => listo.then((modo) => {
    if (modo === 'real') entrarModoVivo();
    boot();
    if (modo === 'real') aplicarFoto(window.VybraVivo.foto);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
})();
