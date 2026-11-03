// Tres nodos falsos en 9001-9003 para probar la interfaz sin hardware.
// Uso: npm run fake   (Ctrl+C para salir)
import { crearNodoFalso } from './nodo-falso.js';

const PUERTOS = [9001, 9002, 9003];
const nodos = PUERTOS.map((puerto, i) => crearNodoFalso({ n: i + 1, puerto }));
await Promise.all(nodos.map((f) => f.listo));

const ahora = Date.now();
for (const f of nodos) {
  f.estado.rol = f.n === 1 ? 'lider' : 'seguidor';
  f.estado.lider_conocido = 1;
  f.estado.termino = 1;
  f.estado.votado_por = 1;
  f.agregarSuceso({ t: ahora - 8000, tipo: 'gano', texto: 'Servidor 1 ganó la elección y es el líder', termino: 1 });
}

let contador = 0;
function evento(nodo, t, nivel) {
  contador++;
  return {
    T: 1, clase: 'evento',
    ev: { id: `nodo-${nodo}-falso-${contador}`, nodo, nivel, pga: 0.05 * nivel, duracion_ms: 450 * nivel, t, t_lider: t + 20, recibido_por: nodo },
  };
}

const e1 = evento(2, ahora - 5000, 6);
const e2 = evento(3, ahora - 2000, 7);
for (const f of nodos) {
  f.agregarEntrada({ T: 1, clase: 'inicio_termino', lider: 1 });
  f.agregarEntrada({ ...e1, en_alerta: true });
  f.agregarEntrada({ ...e2, en_alerta: true });
  f.alertas.push({ id: 3, promedio: 6.5, nivel: 'media', eventos: [e2.ev.id, e1.ev.id], termino: 1, lider: 1 });
}

// Cada ~20 s un evento de un detector al azar, para ver cambios en vivo.
const timer = setInterval(() => {
  const nodo = 1 + Math.floor(Math.random() * 3);
  const e = evento(nodo, Date.now(), 1 + Math.floor(Math.random() * 10));
  for (const f of nodos) f.agregarEntrada(e);
}, 20000);

console.log('Cluster falso en', nodos.map((f) => f.url).join('  '));
const salir = async () => { clearInterval(timer); await Promise.all(nodos.map((f) => f.cerrar())); process.exit(0); };
process.on('SIGINT', salir);
process.on('SIGTERM', salir);
