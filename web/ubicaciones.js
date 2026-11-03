// Ubicaciones de los nodos, guardadas en un JSON: { "N": {lat, lon, precision, t} }.
import fs from 'node:fs';
import path from 'node:path';

function invalido(msg) {
  const e = new Error(msg);
  e.codigo = 400;
  return e;
}

const num = (v) => typeof v === 'number' && Number.isFinite(v);

// archivo null: solo en memoria (sin escribir nada).
export function crearUbicaciones(archivo, ahora = Date.now) {
  let datos = {};
  if (archivo) {
    try {
      const leido = JSON.parse(fs.readFileSync(archivo, 'utf8'));
      if (leido && typeof leido === 'object' && !Array.isArray(leido)) datos = leido;
    } catch { /* sin archivo o dañado: se empieza vacío */ }
  }

  // Escritura atómica: temporal en la misma carpeta y luego rename.
  function escribir(nuevo) {
    if (!archivo) return;
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    const tmp = `${archivo}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(nuevo, null, 2));
    fs.renameSync(tmp, archivo);
  }
  const validarNodo = (n) => { if (!Number.isInteger(n) || n < 1 || n > 3) throw invalido('nodo fuera de 1-3'); };

  return {
    todas: () => structuredClone(datos),
    fijar(n, { lat, lon, precision } = {}) {
      validarNodo(n);
      if (!num(lat) || lat < -90 || lat > 90) throw invalido('lat fuera de rango');
      if (!num(lon) || lon < -180 || lon > 180) throw invalido('lon fuera de rango');
      if (!num(precision) || precision < 0) throw invalido('precision invalida');
      const guardado = { lat, lon, precision, t: ahora() };
      const nuevo = { ...datos, [n]: guardado };
      escribir(nuevo);
      datos = nuevo;
      return { ...guardado };
    },
    // Quita la ubicación del nodo n. Devuelve false si no estaba ubicado.
    quitar(n) {
      validarNodo(n);
      if (!Object.hasOwn(datos, String(n))) return false;
      const nuevo = { ...datos };
      delete nuevo[n];
      escribir(nuevo);
      datos = nuevo;
      return true;
    },
  };
}
