// Configuración del servidor del PC.
// NODOS="http://127.0.0.1:9001,http://127.0.0.1:9002,..." reemplaza la lista por defecto.
const POR_DEFECTO = [
  { n: 1, url: 'http://192.168.80.201' },
  { n: 2, url: 'http://192.168.80.202' },
  { n: 3, url: 'http://192.168.80.203' },
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
export const PUERTO_HTTPS = 8091;
export const DETECTORES = [
  { n: 1, lat: 1.2250, lon: -77.2850 },
  { n: 2, lat: 1.2050, lon: -77.2700 },
  { n: 3, lat: 1.2120, lon: -77.2980 },
];
