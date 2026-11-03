// Conexión de las vistas con el servidor del PC: estado en vivo (SSE) y acciones sobre los nodos.
// Todo lo que muestran las vistas sale de aquí; nada se inventa en el navegador.

// Escapa texto que viene de la red antes de meterlo en innerHTML.
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Hora de pared de un evento en ms: t del detector, si no la del líder; null si ninguna.
export function horaEvento(ev) {
  if (!ev) return null;
  if (ev.t) return ev.t;
  if (ev.t_lider) return ev.t_lider;
  return null;
}

const REINTENTO_MS = 2000;

// Se suscribe a /api/stream. alRecibir(foto) en cada mensaje; alCambiarConexion('conectado'|'reconectando');
// alVivo(t) con cada latido del servidor (cada ~5 s): los datos siguen al día aunque no cambien.
// Devuelve una función para cerrar la suscripción.
export function suscribir(alRecibir, alCambiarConexion = () => {}, alVivo = () => {}) {
  let fuente = null;
  let temporizador = null;
  let estado = null;
  let cerrado = false;

  const avisar = (nuevo) => {
    if (nuevo === estado) return;
    estado = nuevo;
    alCambiarConexion(nuevo);
  };

  function abrir() {
    if (cerrado) return;
    fuente = new EventSource('/api/stream');
    fuente.addEventListener('estado', (e) => {
      let foto;
      try { foto = JSON.parse(e.data); } catch { return; }
      avisar('conectado');
      alRecibir(foto);
    });
    fuente.addEventListener('vivo', (e) => {
      let d;
      try { d = JSON.parse(e.data); } catch { return; }
      avisar('conectado');
      alVivo(typeof d?.t === 'number' ? d.t : Date.now());
    });
    fuente.onerror = () => {
      avisar('reconectando');
      // EventSource reintenta solo mientras está CONNECTING; si quedó CLOSED se reabre a mano.
      if (fuente.readyState === EventSource.CLOSED) {
        clearTimeout(temporizador);
        temporizador = setTimeout(abrir, REINTENTO_MS);
      }
    };
  }

  abrir();
  return () => {
    cerrado = true;
    clearTimeout(temporizador);
    if (fuente) fuente.close();
  };
}

// POST JSON al servidor. Devuelve { status, cuerpo } sin lanzar por códigos HTTP.
async function postJson(url, cuerpo) {
  let r;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
  } catch {
    return { status: 0, cuerpo: { error: 'sin conexión con el servidor' } };
  }
  let datos = null;
  try { datos = await r.json(); } catch { datos = null; }
  return { status: r.status, cuerpo: datos };
}

// accion: 'caer' | 'recuperar'
export function control(n, accion) {
  return postJson(`/api/nodos/${encodeURIComponent(n)}/control`, { accion });
}

// ms: tiempo pulsado (el nodo acepta 80..60000)
export function pulsar(n, ms) {
  return postJson(`/api/nodos/${encodeURIComponent(n)}/pulsar`, { ms: Math.round(ms) });
}
