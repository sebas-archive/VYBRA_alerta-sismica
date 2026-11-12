// Un solo nodo falso, para correr cada detector en su propio contenedor.
// Variables: N (1-3, obligatoria), PUERTO (8080), HOST (0.0.0.0).
// Imita el contrato HTTP del firmware (/estado, /log, /sucesos, /alertas, /control, /pulsar...).
// Arranca como seguidor del nodo 1 en el término 1, con un par de eventos de ejemplo.
import fs from 'node:fs';
import { crearNodoFalso } from './nodo-falso.js';

const n = Number(process.env.N);
if (![1, 2, 3].includes(n)) { console.error('Falta N=1, 2 o 3'); process.exit(1); }
const puerto = Number(process.env.PUERTO) || 8080;
const host = process.env.HOST || '0.0.0.0';

// Sistema operativo del contenedor (cada servidor corre en uno distinto).
let sistema = 'desconocido';
try { sistema = /^PRETTY_NAME="?([^"\n]*)"?/m.exec(fs.readFileSync('/etc/os-release', 'utf8'))?.[1] ?? sistema; } catch { /* sin os-release */ }

const f = crearNodoFalso({ n, puerto, host });
f.estado.sistema = sistema;
await f.listo;

const ahora = Date.now();
f.estado.rol = n === 1 ? 'lider' : 'seguidor';
f.estado.lider_conocido = 1;
f.estado.termino = 1;
f.estado.votado_por = 1;
f.agregarSuceso({ t: ahora - 8000, tipo: 'gano', texto: 'Servidor 1 ganó la elección y es el líder', termino: 1 });

const evento = (nodo, id, t, nivel) => ({
  T: 1, clase: 'evento',
  ev: { id, nodo, nivel, pga: 0.05 * nivel, duracion_ms: 450 * nivel, t, t_lider: t + 20, recibido_por: nodo },
});
const e1 = evento(2, 'nodo-2-falso-1', ahora - 5000, 6);
const e2 = evento(3, 'nodo-3-falso-2', ahora - 2000, 7);
f.agregarEntrada({ T: 1, clase: 'inicio_termino', lider: 1 });
f.agregarEntrada({ ...e1, en_alerta: true });
f.agregarEntrada({ ...e2, en_alerta: true });
f.alertas.push({ id: 3, promedio: 6.5, nivel: 'media', eventos: [e2.ev.id, e1.ev.id], termino: 1, lider: 1 });

console.log(`Servidor ${n} (${sistema}, Node ${process.version}) escuchando en ${host}:${f.puerto}`);
const salir = () => { f.cerrar().finally(() => process.exit(0)); };
process.on('SIGINT', salir);
process.on('SIGTERM', salir);
