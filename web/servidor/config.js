// Configuración de un servidor de datos a partir de variables de entorno (sin credenciales en el código).
//   N                 1-3: número de servidor = número de su ESP32
//   NODO_URL          URL del ESP32 asignado (http://192.168.1.50, http://sismo-nodo-1.local, http://nodo1:8080…)
//   DATABASE_URL      postgres://usuario:clave@host:5432/base   (opción A)
//   DB_HOST, DB_PORT, DB_NAME, DB_USER + DB_PASSWORD_FILE (o DB_PASSWORD)   (opción B: la clave en un secreto/archivo)
//   VYBRA_ENTORNO     "produccion" exige una clave distinta de la de desarrollo
//   PUERTO, INTERVALO_MS, TIMEOUT_NODO_MS, RETENCION_*  (ver retencion.js)
import fs from 'node:fs';
import { leerRetencion } from './retencion.js';

export const CLAVE_DESARROLLO = 'vybra';   // solo para desarrollo; en producción se rechaza

export function validarUrlNodo(texto) {
  let u;
  try { u = new URL(texto); } catch { throw new Error(`NODO_URL no es una URL válida: "${texto}"`); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('NODO_URL debe empezar por http:// o https://');
  if (u.username || u.password) throw new Error('NODO_URL no debe llevar usuario ni clave');
  return u.origin;     // sin ruta ni barra final: el ESP32 se consulta en /estado, /log, /sucesos y /alertas
}

export function leerConfig(env = process.env, leerArchivo = (p) => fs.readFileSync(p, 'utf8')) {
  const n = Number(env.N);
  if (![1, 2, 3].includes(n)) throw new Error('Falta N=1, 2 o 3');
  if (!env.NODO_URL) throw new Error('Falta NODO_URL (el ESP32 asignado a este servidor)');
  const nodoUrl = validarUrlNodo(env.NODO_URL);
  const produccion = String(env.VYBRA_ENTORNO || env.NODE_ENV || '').toLowerCase().startsWith('prod');

  let dbUrl = env.DATABASE_URL;
  let clave = null;
  if (!dbUrl) {
    if (!env.DB_HOST) throw new Error('Falta DATABASE_URL o DB_HOST (+ DB_NAME, DB_USER, DB_PASSWORD_FILE)');
    if (env.DB_PASSWORD_FILE) {
      try { clave = leerArchivo(env.DB_PASSWORD_FILE).replace(/\r?\n$/, ''); } catch (e) { throw new Error(`No se pudo leer DB_PASSWORD_FILE: ${e.message}`); }
    } else clave = env.DB_PASSWORD ?? '';
    const u = new URL('postgres://placeholder');
    u.hostname = env.DB_HOST;
    u.port = env.DB_PORT || '5432';
    u.username = env.DB_USER || 'vybra';
    u.password = clave;
    u.pathname = `/${env.DB_NAME || 'vybra'}`;
    dbUrl = u.toString();
  } else {
    try { clave = decodeURIComponent(new URL(dbUrl).password); } catch { throw new Error('DATABASE_URL no es una URL válida'); }
  }
  if (produccion && (!clave || clave === CLAVE_DESARROLLO)) {
    throw new Error(`En producción la base de datos no puede usar una clave vacía ni la de desarrollo ("${CLAVE_DESARROLLO}"). Usa DB_PASSWORD_FILE.`);
  }
  const retencion = leerRetencion(env);
  return {
    n, nodoUrl, dbUrl, produccion,
    puerto: Number(env.PUERTO) || 8100,
    intervaloMs: Number(env.INTERVALO_MS) || 1000,
    timeoutNodoMs: Number(env.TIMEOUT_NODO_MS) || 3000,
    retencion,
    claveDesarrollo: !!clave && clave === CLAVE_DESARROLLO,
  };
}
