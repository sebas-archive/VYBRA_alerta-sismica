// Histórico en disco de lo que reportan los nodos: eventos (ya confirmados por la mayoría), alertas y
// sucesos del clúster. Los nodos guardan su log en memoria; aquí se conserva aunque se reinicien.
// Un archivo JSON-lines por tipo (datos/eventos.jsonl, alertas.jsonl, sucesos.jsonl). Sin duplicados:
// cada registro lleva una `clave` y solo se escribe la primera vez que se ve.
import fs from 'node:fs';
import path from 'node:path';

const ARCHIVOS = { eventos: 'eventos.jsonl', alertas: 'alertas.jsonl', sucesos: 'sucesos.jsonl' };
export const TIPOS = Object.keys(ARCHIVOS);

export function crearHistorial({ dir, avisar = console.error }) {
  fs.mkdirSync(dir, { recursive: true });
  const ruta = (tipo) => path.join(dir, ARCHIVOS[tipo]);
  const vistos = Object.fromEntries(TIPOS.map((t) => [t, new Set()]));
  let cola = Promise.resolve();
  let fallo = false;

  function leerArchivo(tipo) {
    let texto = '';
    try { texto = fs.readFileSync(ruta(tipo), 'utf8'); } catch { return []; }
    const filas = [];
    for (const linea of texto.split('\n')) {
      if (!linea.trim()) continue;
      try { filas.push(JSON.parse(linea)); } catch { /* línea cortada por un apagón: se ignora */ }
    }
    return filas;
  }
  for (const tipo of TIPOS) for (const r of leerArchivo(tipo)) vistos[tipo].add(r.clave);

  function nuevos(foto) {
    const out = { eventos: [], alertas: [], sucesos: [] };
    const fuente = (foto.nodos || []).find((x) => x.n === foto.fuente);
    const commit = fuente && fuente.estado ? fuente.estado.commit_index : 0;
    for (const x of foto.log || []) {
      if (x.clase !== 'evento' || !x.ev || x.i > commit) continue; // solo lo confirmado por la mayoría
      out.eventos.push({ clave: x.ev.id, indice: x.i, termino: x.T, ...x.ev });
    }
    for (const a of foto.alertas || []) {
      out.alertas.push({ clave: `${a.id}|${[...(a.eventos || [])].sort().join(',')}`, ...a });
    }
    for (const s of foto.sucesos || []) out.sucesos.push({ clave: `${s.n}|${s.seq}|${s.t}`, ...s });
    return out;
  }

  // Escribe lo que aún no estaba. Devuelve una promesa que se resuelve al terminar de escribir.
  function registrar(foto) {
    if (!foto) return cola;
    const ahora = Date.now();
    const lotes = nuevos(foto);
    for (const tipo of TIPOS) {
      const lineas = [];
      for (const r of lotes[tipo]) {
        if (r.clave == null || vistos[tipo].has(r.clave)) continue;
        vistos[tipo].add(r.clave);
        lineas.push(JSON.stringify({ ...r, guardado: ahora }));
      }
      if (!lineas.length) continue;
      cola = cola.then(() => fs.promises.appendFile(ruta(tipo), lineas.join('\n') + '\n')).catch((e) => {
        if (!fallo) { fallo = true; avisar(`No se pudo escribir el histórico en ${dir}: ${e.message}`); }
      });
    }
    return cola;
  }

  // Últimos `limite` registros del tipo (más recientes al final).
  function leer(tipo, limite = 200) {
    if (!TIPOS.includes(tipo)) return null;
    const n = Math.min(Math.max(1, Math.floor(limite) || 200), 5000);
    return cola.then(() => leerArchivo(tipo).slice(-n));
  }

  return { registrar, leer, dir };
}
