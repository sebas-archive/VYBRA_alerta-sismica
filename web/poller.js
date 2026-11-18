// Sondeo de los nodos ESP32 y armado de la "foto" agregada del clúster.
// Todo lo que contiene la foto sale de los nodos; aquí no se inventa nada.
import { EventEmitter } from 'node:events';

const MAX_SUCESOS = 200;

// Campos que cambian en cada sondeo; no cuentan para decidir si la foto cambió
// (pero siguen estando en nodos[].estado para la interfaz).
const VOLATILES_ESTADO = ['uptime_ms', 'rssi'];

function claveComparable(foto) {
  const copia = {
    ...foto,
    t: 0,
    nodos: foto.nodos.map((x) => {
      if (!x.estado) return x;
      const estado = { ...x.estado };
      for (const k of VOLATILES_ESTADO) delete estado[k];
      return { ...x, estado };
    }),
  };
  return JSON.stringify(copia);
}

export function crearPoller({ nodos, intervaloMs = 300, timeoutMs = 250, fallosParaCaido = 3, fetchImpl = fetch }) {
  const emisor = new EventEmitter();
  const timeoutSecundario = Math.max(timeoutMs, 500); // /log, /sucesos y /alertas pesan más

  const info = nodos.map((nodo) => ({
    n: nodo.n,
    url: nodo.url.replace(/\/+$/, ''),
    alcanzable: false,
    fallos: 0,
    estado: null,
    enCurso: false,      // hay un pedido en vuelo a este nodo
    sucesos: [],         // sucesos acumulados de este nodo (con n)
    ultimaSeq: 0,        // último seq de suceso recibido
  }));

  // Copia del log y las alertas de la fuente actual.
  const fuenteLog = { n: null, log: [], alertas: [], clave: null };
  let enSincronizacion = false;
  let temporizador = null;
  let ultimaClave = null;

  async function pedirJson(nodo, ruta, ms) {
    const r = await fetchImpl(nodo.url + ruta, { signal: AbortSignal.timeout(ms) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  // Sondea /estado (y /sucesos si hay nuevos) de un nodo.
  async function sondear(nodo) {
    nodo.enCurso = true;
    try {
      const estado = await pedirJson(nodo, '/estado', timeoutMs);
      nodo.estado = estado;
      nodo.fallos = 0;
      nodo.alcanzable = true;
      await sincronizarSucesos(nodo, estado);
    } catch {
      nodo.fallos = Math.min(nodo.fallos + 1, fallosParaCaido); // tope: si no, la foto cambiaría en cada ciclo
      if (nodo.fallos >= fallosParaCaido) nodo.alcanzable = false;
    } finally {
      nodo.enCurso = false;
    }
  }

  async function sincronizarSucesos(nodo, estado) {
    const seq = estado.sucesos_seq;
    if (typeof seq !== 'number' || seq === nodo.ultimaSeq) return;
    if (seq < nodo.ultimaSeq) { nodo.sucesos = []; nodo.ultimaSeq = 0; } // el nodo se reinició
    try {
      const r = await pedirJson(nodo, `/sucesos?desde=${nodo.ultimaSeq}`, timeoutSecundario);
      for (const s of r.sucesos ?? []) {
        if (s.seq > nodo.ultimaSeq) nodo.sucesos.push({ n: nodo.n, ...s });
      }
      nodo.ultimaSeq = Math.max(nodo.ultimaSeq, ...(r.sucesos ?? []).map((s) => s.seq), 0);
      nodo.sucesos = nodo.sucesos.slice(-MAX_SUCESOS);
    } catch { /* se reintenta en el próximo ciclo */ }
  }

  const disponible = (x) => x.alcanzable && x.estado && !x.estado.caido;

  function calcularLiderYFuente() {
    const lideres = info.filter((x) => disponible(x) && x.estado.rol === 'lider');
    lideres.sort((a, b) => (b.estado.termino - a.estado.termino) || (a.n - b.n));
    const lider = lideres[0]?.n ?? null;

    // Quórum: al menos 2 nodos disponibles que reconocen al mismo líder.
    const votos = new Map();
    for (const x of info) {
      if (!disponible(x)) continue;
      const l = x.estado.lider_conocido;
      if (l) votos.set(l, (votos.get(l) ?? 0) + 1);
    }
    const quorum = Math.max(0, ...votos.values()) >= 2;

    let fuente = lider;
    if (fuente === null) {
      const candidatos = info.filter(disponible);
      candidatos.sort((a, b) => (b.estado.commit_index - a.estado.commit_index) || (a.n - b.n));
      fuente = candidatos[0]?.n ?? null;
    }
    return { lider, quorum, fuente };
  }

  // Trae lo que falte del log de la fuente y refresca sus alertas.
  async function sincronizarFuente() {
    const { fuente } = calcularLiderYFuente();
    const nodo = info.find((x) => x.n === fuente);
    if (!nodo) return;
    if (nodo.enCurso) return;
    nodo.enCurso = true; // el log también cuenta como pedido en vuelo a este nodo
    try {
      await sincronizarLog(nodo, fuente);
    } finally {
      nodo.enCurso = false;
    }
  }

  async function sincronizarLog(nodo, fuente) {
    const est = nodo.estado;
    if (fuenteLog.n !== fuente || est.log_len < fuenteLog.log.length) {
      fuenteLog.n = fuente;
      fuenteLog.log = [];
      fuenteLog.alertas = [];
      fuenteLog.clave = null;
    }
    try {
      while (fuenteLog.log.length < est.log_len) {
        const desde = fuenteLog.log.length + 1;
        const r = await pedirJson(nodo, `/log?desde=${desde}`, timeoutSecundario);
        const entradas = r.entradas ?? [];
        if (entradas.length === 0) break;
        fuenteLog.log.push(...entradas);
      }
      const clave = `${fuente}:${est.log_len}:${est.commit_index}`;
      if (clave !== fuenteLog.clave) {
        const r = await pedirJson(nodo, '/alertas', timeoutSecundario);
        fuenteLog.alertas = r.alertas ?? [];
        fuenteLog.clave = clave;
      }
    } catch { /* se reintenta en el próximo ciclo */ }
  }

  function construirFoto() {
    const { lider, quorum, fuente } = calcularLiderYFuente();
    const sucesos = info.flatMap((x) => x.sucesos)
      .sort((a, b) => (b.t - a.t) || (b.seq - a.seq) || (a.n - b.n))
      .slice(0, MAX_SUCESOS);
    return {
      t: Date.now(),
      quorum,
      lider,
      fuente,
      nodos: info.map((x) => ({ n: x.n, url: x.url, alcanzable: x.alcanzable, fallos: x.fallos, estado: x.estado })),
      log: fuente !== null && fuenteLog.n === fuente ? fuenteLog.log.slice() : [],
      alertas: fuente !== null && fuenteLog.n === fuente ? fuenteLog.alertas.slice() : [],
      sucesos,
    };
  }

  function emitirSiCambio() {
    const foto = construirFoto();
    const clave = claveComparable(foto);
    if (clave !== ultimaClave) {
      ultimaClave = clave;
      emisor.emit('cambio', foto);
    }
  }

  async function ciclo() {
    // Los nodos con un pedido en curso se saltan: nunca dos pedidos simultáneos al mismo nodo.
    const libres = info.filter((x) => !x.enCurso);
    await Promise.allSettled(libres.map(sondear));
    if (!enSincronizacion) {
      enSincronizacion = true;
      try { await sincronizarFuente(); } finally { enSincronizacion = false; }
    }
    if (temporizador !== null) emitirSiCambio();
  }

  emisor.iniciar = function iniciar() {
    if (temporizador !== null) return;
    temporizador = setInterval(ciclo, intervaloMs);
    ciclo();
  };
  emisor.detener = function detener() {
    if (temporizador !== null) clearInterval(temporizador);
    temporizador = null;
  };
  // Cambia la URL de un nodo (la IP la da el DHCP y puede cambiar).
  emisor.fijarUrl = function fijarUrl(n, url) {
    const x = info.find((i) => i.n === n);
    if (x) x.url = url.replace(/\/+$/, '');
  };
  emisor.foto = construirFoto;
  return emisor;
}
