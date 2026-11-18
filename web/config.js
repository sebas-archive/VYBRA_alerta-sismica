// Configuración del servidor del PC. Los detectores usan DHCP y se encuentran por mDNS (sismo-nodo-N.local).
// NODOS="http://127.0.0.1:9001,http://127.0.0.1:9002,..." reemplaza la lista por defecto.
const POR_DEFECTO = [
  { n: 1, url: 'http://sismo-nodo-1.local' },
  { n: 2, url: 'http://sismo-nodo-2.local' },
  { n: 3, url: 'http://sismo-nodo-3.local' },
];

function nodosDesdeEntorno(texto) {
  if (!texto || !texto.trim()) return POR_DEFECTO;
  return texto
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
    .map((url, i) => ({ n: i + 1, url: url.replace(/\/+$/, '') }));
}

export const NODOS = nodosDesdeEntorno(process.env.NODOS);
export const PUERTO = 8090;

// Posición fija de cada detector en el mapa (ya no se ubican desde el panel).
export const UBICACIONES = {
  1: { lat: 4.648110, lon: -74.056690 },
  2: { lat: 4.648176, lon: -74.056661 },
  3: { lat: 4.648177, lon: -74.056703 },
};

// Servidores de datos: cada ESP32 tiene asignado uno (mismo número) con su propia base PostgreSQL.
// SERVIDORES="http://servidor1:8100,http://servidor2:8100,http://servidor3:8100". Sin variable: no hay histórico.
export const SERVIDORES = (process.env.SERVIDORES || '')
  .split(',').map((u) => u.trim().replace(/\/+$/, '')).filter(Boolean).map((url, i) => ({ n: i + 1, url }));
