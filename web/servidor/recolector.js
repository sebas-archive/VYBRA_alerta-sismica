// Recolector de un servidor: consulta al ESP32 que tiene asignado y guarda todo en la base de datos.
// El ESP32 no se entera: solo responde a /estado, /log, /sucesos y /alertas, como ya hacía para el panel.
const MUESTRA_CADA_MS = 30000;   // aunque nada cambie, una muestra de estado cada 30 s

export function crearRecolector({ n, url, almacen, intervaloMs = 1000, timeoutMs = 3000, fetchImpl = fetch, avisar = console.error }) {
  const base = url.replace(/\/+$/, '');
  const st = {
    alcanzable: null, ultimoContacto: null, ultimaMuestra: 0, claveMuestra: null,
    seqVisto: 0, logLeido: 0, commitVisto: -1, confirmadoGuardado: 0, claveAlertas: null, errores: 0, ultimoError: null, estado: null,
  };
  let temporizador = null;
  let enCurso = false;

  const pedir = async (ruta) => {
    const r = await fetchImpl(base + ruta, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };

  async function ciclo() {
    if (enCurso) return;
    enCurso = true;
    try {
      let e;
      try {
        e = await pedir('/estado');
      } catch {
        if (st.alcanzable !== false) await almacen.guardarMuestra({ nodo: n, alcanzable: false });
        st.alcanzable = false;
        st.claveMuestra = null;
        return;
      }
      st.alcanzable = true;
      st.ultimoContacto = Date.now();
      st.estado = e;

      // 1) muestra del estado (cuando cambia algo relevante, o cada 30 s)
      const clave = [e.rol, e.termino, e.log_len, e.commit_index, e.pendientes, e.situacion, e.caido, e.lider_conocido].join('|');
      if (clave !== st.claveMuestra || Date.now() - st.ultimaMuestra > MUESTRA_CADA_MS) {
        await almacen.guardarMuestra({ nodo: n, alcanzable: true, ...e, estado: e });
        st.claveMuestra = clave;
        st.ultimaMuestra = Date.now();
      }

      // 2) sucesos nuevos
      if (typeof e.sucesos_seq === 'number' && e.sucesos_seq !== st.seqVisto) {
        if (e.sucesos_seq < st.seqVisto) st.seqVisto = 0; // el nodo se reinició
        const r = await pedir(`/sucesos?desde=${st.seqVisto}`);
        await almacen.guardarSucesos(n, r.sucesos ?? []);
        st.seqVisto = Math.max(st.seqVisto, e.sucesos_seq, ...(r.sucesos ?? []).map((s) => s.seq));
      }

      // 3) log: lo que falte, y relee la cola para marcar como confirmado lo que la mayoría ya aceptó
      const cambioLog = e.log_len !== st.logLeido || e.commit_index !== st.commitVisto;
      if (cambioLog) {
        if (e.log_len < st.logLeido) { st.logLeido = 0; st.confirmadoGuardado = 0; }
        let desde = Math.min(st.logLeido, st.confirmadoGuardado) + 1;
        let leidas = st.logLeido;
        while (desde <= e.log_len) {
          const r = await pedir(`/log?desde=${desde}`);
          const entradas = r.entradas ?? [];
          if (!entradas.length) break;
          await almacen.guardarLog(entradas, e.commit_index);
          leidas = Math.max(leidas, entradas[entradas.length - 1].i);
          desde = entradas[entradas.length - 1].i + 1;
        }
        st.logLeido = leidas;
        st.confirmadoGuardado = Math.min(e.commit_index, leidas);
        st.commitVisto = e.commit_index;
        // 4) alertas
        const claveAl = `${e.log_len}:${e.commit_index}`;
        if (claveAl !== st.claveAlertas) {
          const r = await pedir('/alertas');
          await almacen.guardarAlertas(r.alertas ?? []);
          st.claveAlertas = claveAl;
        }
      }
      st.errores = 0;
    } catch (err) {
      st.errores++;
      st.ultimoError = err.message;
      if (st.errores === 1 || st.errores % 30 === 0) avisar(`Recolector S${n}: ${err.message}`);
    } finally {
      enCurso = false;
    }
  }

  return {
    estado: () => ({ alcanzable: st.alcanzable, ultimoContacto: st.ultimoContacto, ultimoError: st.ultimoError, nodo: st.estado }),
    ciclo,
    iniciar() { if (!temporizador) { temporizador = setInterval(ciclo, intervaloMs); ciclo(); } },
    detener() { if (temporizador) clearInterval(temporizador); temporizador = null; },
  };
}
