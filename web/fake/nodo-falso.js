// Nodo HTTP falso: imita el contrato JSON del firmware (Task 5) para pruebas y ensayo sin hardware.
import http from 'node:http';

const PAGINA_LOG = 50;
const MAX_SUCESOS = 50;

export function crearNodoFalso({ n, puerto = 0 }) {
  const inicio = Date.now();
  let contadorPulsos = 0;
  let colgado = false;
  const colgadas = new Set(); // respuestas retenidas por colgar(true)

  // Cuerpo de /estado, mutable desde las pruebas.
  const estado = {
    nodo: n, rol: 'seguidor', caido: false, termino: 1, votado_por: 0,
    lider_conocido: 0, log_len: 0, commit_index: 0, pendientes: 0,
    log_lleno: false, sucesos_seq: 0, con_hora: true,
    ip: `192.168.80.20${n}`, rssi: -50, uptime_ms: 0,
  };
  const log = [];
  const sucesos = [];
  const alertas = [];
  const peticiones = [];

  function json(res, codigo, cuerpo) {
    res.writeHead(codigo, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(cuerpo));
  }

  function leerCuerpo(req) {
    return new Promise((resolve) => {
      let texto = '';
      req.on('data', (c) => { texto += c; });
      req.on('end', () => resolve(texto));
      req.on('error', () => resolve(texto));
    });
  }

  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const ruta = url.pathname;
    const texto = req.method === 'POST' ? await leerCuerpo(req) : '';
    let cuerpo = null;
    let jsonValido = true;
    if (texto) {
      try { cuerpo = JSON.parse(texto); } catch { cuerpo = texto; jsonValido = false; }
    }
    peticiones.push({ metodo: req.method, ruta: req.url, cuerpo });

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return res.end();
    }

    if (req.method === 'GET' && ruta === '/estado') {
      if (colgado) { colgadas.add(res); return; } // nunca responde
      estado.uptime_ms = Date.now() - inicio;
      return json(res, 200, estado);
    }
    if (req.method === 'GET' && ruta === '/log') {
      const desde = Math.max(1, parseInt(url.searchParams.get('desde') || '1', 10) || 1);
      return json(res, 200, {
        desde, log_len: estado.log_len, commit_index: estado.commit_index,
        entradas: log.slice(desde - 1, desde - 1 + PAGINA_LOG),
      });
    }
    if (req.method === 'GET' && ruta === '/sucesos') {
      const desde = parseInt(url.searchParams.get('desde') || '0', 10) || 0;
      return json(res, 200, {
        seq: estado.sucesos_seq,
        sucesos: sucesos.filter((s) => s.seq > desde).slice(-MAX_SUCESOS),
      });
    }
    if (req.method === 'GET' && ruta === '/alertas') {
      return json(res, 200, { alertas });
    }
    if (req.method === 'POST' && ruta === '/control') {
      if (!jsonValido || cuerpo === null || typeof cuerpo !== 'object') {
        return json(res, 400, { error: 'json invalido' });
      }
      if (cuerpo.accion === 'caer') estado.caido = true;
      else if (cuerpo.accion === 'recuperar') estado.caido = false;
      else return json(res, 400, { error: 'accion invalida' });
      return json(res, 200, { ok: true, caido: estado.caido });
    }
    if (req.method === 'POST' && ruta === '/pulsar') {
      if (!jsonValido || cuerpo === null || typeof cuerpo !== 'object') {
        return json(res, 400, { error: 'json invalido' });
      }
      const ms = cuerpo.ms;
      if (!Number.isFinite(ms) || ms < 80 || ms > 60000) {
        return json(res, 400, { error: 'ms fuera de rango' });
      }
      if (estado.caido) return json(res, 409, { error: 'caido' });
      if (estado.log_lleno) return json(res, 507, { error: 'log lleno' });
      contadorPulsos += 1;
      return json(res, 200, {
        ok: true, id: `nodo-${n}-fake-${contadorPulsos}`,
        nivel: Math.min(10, 1 + Math.floor(ms / 450)), resultado: 'aceptada',
      });
    }
    return json(res, 404, { error: 'no existe' });
  });

  servidor.listen(puerto, '127.0.0.1');

  return {
    n, servidor, estado, log, sucesos, alertas, peticiones,
    // Puerto real (útil con puerto 0); resuelve cuando el servidor ya escucha.
    listo: new Promise((resolve) => {
      if (servidor.listening) resolve();
      else servidor.once('listening', resolve);
    }),
    get puerto() { return servidor.address()?.port; },
    get url() { return `http://127.0.0.1:${servidor.address()?.port}`; },
    // Agrega una entrada al log (asigna i si falta) y sube log_len/commit_index.
    agregarEntrada(e = {}) {
      const entrada = { i: log.length + 1, T: estado.termino, clase: 'evento', ...e };
      entrada.i = e.i ?? log.length + 1;
      log.push(entrada);
      estado.log_len = log.length;
      estado.commit_index = log.length;
      return entrada;
    },
    // Agrega un suceso (asigna seq) y sube sucesos_seq.
    agregarSuceso(s = {}) {
      const seq = estado.sucesos_seq + 1;
      const suceso = { seq, t: Date.now(), tipo: 'voto', texto: '', termino: estado.termino, ...s };
      suceso.seq = seq;
      sucesos.push(suceso);
      estado.sucesos_seq = seq;
      return suceso;
    },
    // true: /estado deja de responder; false: vuelve a responder (libera las retenidas).
    colgar(valor) {
      colgado = !!valor;
      if (!colgado) {
        for (const res of colgadas) { estado.uptime_ms = Date.now() - inicio; json(res, 200, estado); }
        colgadas.clear();
      }
    },
    cerrar() {
      return new Promise((resolve) => {
        servidor.close(() => resolve());
        servidor.closeAllConnections();
      });
    },
  };
}
