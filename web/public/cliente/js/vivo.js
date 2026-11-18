/**
 * VYBRA — conexión de la vista ciudadana con el servidor del PC (misma fuente que ADMIN).
 * GET /api/estado decide el modo; /api/stream (SSE) entrega la "foto" del clúster.
 * Nada se inventa aquí: si no hay servidor, el modo es 'demo' y la app usa sus datos de ensayo.
 *   VybraVivo.listo      Promise que se resuelve con 'real' | 'demo' (máx. 2 s)
 *   VybraVivo.conexion   'conectado' | 'reconectando'
 *   VybraVivo.foto       última foto recibida (o null)
 *   VybraVivo.suscribir(fn)  fn(foto) en cada cambio
 */
(function () {
  'use strict';
  const V = {
    modo: 'demo', conexion: 'reconectando', foto: null, ultimoLatido: 0, oyentes: [],
    suscribir(fn) { V.oyentes.push(fn); if (V.foto) fn(V.foto); },
    alCambiarConexion: null
  };
  window.VybraVivo = V;

  const forzarDemo = new URLSearchParams(location.search).has('demo') || location.protocol === 'file:';
  const emitir = (foto) => { V.foto = foto; V.oyentes.forEach((fn) => { try { fn(foto); } catch (e) { console.error(e); } }); };
  const conexion = (c) => { if (V.conexion === c) return; V.conexion = c; if (V.alCambiarConexion) V.alCambiarConexion(c); };

  function abrir() {
    const es = new EventSource('/api/stream');
    es.addEventListener('estado', (e) => {
      let f; try { f = JSON.parse(e.data); } catch (x) { return; }
      conexion('conectado'); V.ultimoLatido = Date.now(); emitir(f);
    });
    es.addEventListener('vivo', () => { V.ultimoLatido = Date.now(); conexion('conectado'); });
    es.onerror = () => {
      conexion('reconectando');
      if (es.readyState === EventSource.CLOSED) setTimeout(abrir, 2000);
    };
  }

  V.listo = new Promise((resolve) => {
    if (forzarDemo) return resolve('demo');
    const tope = setTimeout(() => resolve('demo'), 2000);
    fetch('/api/estado', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((f) => {
        clearTimeout(tope);
        if (!f || !Array.isArray(f.nodos)) return resolve('demo');
        V.modo = 'real'; V.foto = f; conexion('conectado'); V.ultimoLatido = Date.now();
        abrir();
        resolve('real');
      })
      .catch(() => { clearTimeout(tope); resolve('demo'); });
  });
})();
