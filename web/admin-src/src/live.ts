/* Conexión de ADMIN con el servidor del PC (web/server.js): GET /api/estado decide el modo,
   /api/stream (SSE) entrega la "foto" del clúster y POST /api/nodos/N/{control,pulsar} actúa
   sobre los ESP32. Todo sale de los nodos; aquí no se inventa nada. Si no hay servidor, el
   modo es "demo" y ADMIN usa su simulador (rotulado DEMOSTRACIÓN). */
import { useSyncExternalStore } from "react";
import { WINDOW_S, alertLevelOf, liveSrc, type HAlert, type HEv, type Win } from "./seismo";

export type Srv = {
  id: number;
  reach: boolean;
  caido: boolean;
  role: "leader" | "follower" | "candidate" | "down";
  term: number;
  logLen: number;
  commit: number;
  pend: number;
  rssi: number;
  ip: string;
  uptime: number;
  url: string;
  situacion: string;
  sistema: string;
  conHora: boolean;
  movido: boolean;
  huella: boolean;
  leaderKnown: number | null;
  votedFor: number;
  full: boolean;
  ev: number;
};
export type Suceso = { n: number; seq: number; t: number; tipo: string; texto: string; termino: number };
export type LogEntry = { i: number; T: number; clase: string; lider?: number; ev?: any };
export type LiveData = {
  term: number;
  leader: number | null;
  connected: number[];
  candidates: number[];
  quorum: boolean;
  label: string;
  real: true;
  commit: number;
  logLen: number;
  servers: Srv[];
  log: LogEntry[];
  timeline: Suceso[];
  sourceNode: number | null;
};
export type LiveState = {
  mode: "connecting" | "real" | "demo";
  conn: "conectado" | "reconectando";
  beat: number;
  data: LiveData | null;
  hist: { events: HEv[]; alerts: HAlert[] };
};

const EMPTY: LiveState = { mode: "connecting", conn: "reconectando", beat: 0, data: null, hist: { events: [], alerts: [] } };
let state: LiveState = EMPTY;
let foto: any = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const set = (s: Partial<LiveState>) => {
  state = { ...state, ...s };
  liveSrc.on = state.mode === "real";
  liveSrc.hist = state.hist;
  emit();
};

export function parseFoto(f: any, conn: LiveState["conn"]): { data: LiveData; hist: LiveState["hist"] } {
  const nodos: any[] = f?.nodos ?? [];
  const servers: Srv[] = [1, 2, 3].map((id) => {
    const nd = nodos.find((x) => x.n === id);
    const e = nd?.estado;
    const reach = !!(nd && nd.alcanzable && e) && conn === "conectado";
    const caido = !!(e && e.caido);
    const role = !reach || caido ? "down" : e.rol === "lider" ? "leader" : e.rol === "candidato" ? "candidate" : "follower";
    return {
      id, reach, caido, role,
      term: e ? e.termino : 0, logLen: e ? e.log_len : 0, commit: e ? e.commit_index : 0, pend: e ? e.pendientes || 0 : 0,
      rssi: e ? e.rssi : 0, ip: e ? e.ip : "", uptime: e ? e.uptime_ms : 0,
      url: nd?.url ?? "", situacion: e?.situacion ?? "", sistema: e?.sistema ?? "", conHora: !!e?.con_hora, movido: !!e?.movido, huella: !!e?.con_huella,
      leaderKnown: e?.lider_conocido ?? null, votedFor: e?.votado_por ?? 0, full: !!e?.log_lleno, ev: e?.sucesos_seq ?? 0,
    };
  });
  const alive = servers.filter((s) => s.reach && !s.caido);
  const connected = alive.map((s) => s.id);
  const leader: number | null = conn === "conectado" ? (f?.lider ?? null) : null;
  const quorum = conn === "conectado" && !!f?.quorum;
  const term = Math.max(0, ...alive.map((s) => s.term));
  const src = servers.find((s) => s.id === f?.fuente) ?? null;
  const commit = src ? src.commit : 0;
  const log: LogEntry[] = (f?.log ?? []).slice();
  const liderDe: Record<number, number> = {};
  log.forEach((x) => x.clase === "inicio_termino" && x.lider != null && (liderDe[x.T] = x.lider));

  const alertaDe: Record<string, number> = {};
  (f?.alertas ?? []).forEach((a: any) => (a.eventos ?? []).forEach((id: string) => (alertaDe[id] = a.id)));
  const events: HEv[] = log
    .filter((x) => x.clase === "evento" && x.ev)
    .map((x) => {
      const ev = x.ev;
      const ms = ev.t || ev.t_lider || null;
      return {
        det: ev.nodo, t: ms ? ms / 1000 : 0, level: ev.nivel, committed: x.i <= commit,
        idx: x.i, id: ev.id, pga: +ev.pga || 0, receivedBy: ev.recibido_por, alertId: alertaDe[ev.id],
      } as HEv;
    })
    .sort((a, b) => a.idx - b.idx);
  const byId = Object.fromEntries(events.map((e) => [e.id, e]));
  const alerts: HAlert[] = (f?.alertas ?? [])
    .map((a: any) => {
      const evs: HEv[] = (a.eventos ?? []).map((id: string) => byId[id]).filter(Boolean);
      const timed = evs.filter((e) => e.t > 0).map((e) => e.t);
      const ws = timed.length ? Math.min(...timed) : 0;
      const trig = byId[(a.eventos ?? [])[0]];
      const level = (["baja", "media", "alta"].includes(a.nivel) ? a.nivel : alertLevelOf(a.promedio)) as Win["level"];
      return {
        id: a.id, t: trig && trig.t > 0 ? trig.t : timed.length ? Math.max(...timed) : 0, ws, we: ws ? ws + WINDOW_S : 0,
        dets: [...new Set(evs.map((e) => e.det))], level, avg: a.promedio, evs, live: false,
        logIdx: Math.max(0, ...evs.map((e) => e.idx)), term: a.termino, leader: a.lider,
      } as HAlert;
    })
    .sort((a: HAlert, b: HAlert) => b.id - a.id);

  const candidates = servers.filter((s) => s.role === "candidate").map((s) => s.id);
  const label =
    conn !== "conectado"
      ? "Sin conexión con el servidor del PC"
      : quorum && leader && connected.length === 3
        ? "Todos los sistemas operativos"
        : quorum && leader
          ? "Operando con redundancia reducida"
          : quorum
            ? "Elección de líder en curso"
            : "Consenso no disponible";
  return {
    data: {
      term, leader, connected, candidates, quorum, label, real: true, commit, logLen: src ? src.logLen : 0, servers, log,
      timeline: (f?.sucesos ?? []).slice(), sourceNode: f?.fuente ?? null,
    },
    hist: { events, alerts },
  };
}

function rebuild(conn: LiveState["conn"]) {
  if (!foto) return;
  const { data, hist } = parseFoto(foto, conn);
  set({ data, hist, conn });
}

let started = false;
export function startLive() {
  if (started) return;
  started = true;
  if (new URLSearchParams(location.search).has("demo") || location.protocol === "file:") return set({ mode: "demo" });
  const abort = setTimeout(() => state.mode === "connecting" && set({ mode: "demo" }), 2500);
  const open = () => {
    const es = new EventSource("/api/stream");
    es.addEventListener("estado", (e: MessageEvent) => {
      try { foto = JSON.parse(e.data); } catch { return; }
      set({ beat: Date.now() });
      rebuild("conectado");
    });
    es.addEventListener("vivo", () => state.mode === "real" && state.conn !== "conectado" ? rebuild("conectado") : set({ beat: Date.now() }));
    es.onerror = () => {
      if (state.mode === "real") rebuild("reconectando");
      if (es.readyState === EventSource.CLOSED) setTimeout(open, 2000);
    };
  };
  fetch("/api/estado", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
    .then((f) => {
      clearTimeout(abort);
      if (!f || !Array.isArray(f.nodos)) return set({ mode: "demo" });
      foto = f;
      set({ mode: "real" });
      rebuild("conectado");
      open();
    })
    .catch(() => {
      clearTimeout(abort);
      set({ mode: "demo" });
    });
}

export function useLive(): LiveState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
  );
}

/* ---- Acciones sobre los nodos (POST JSON; no lanza por códigos HTTP) ---- */
async function post(url: string, body: unknown): Promise<{ status: number; body: any }> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let b: any = null;
    try { b = await r.json(); } catch { b = null; }
    return { status: r.status, body: b };
  } catch {
    return { status: 0, body: { error: "sin conexión con el servidor del PC" } };
  }
}
export const control = (n: number, accion: "caer" | "recuperar") => post(`/api/nodos/${n}/control`, { accion });
/** ms = tiempo pulsado (el nodo acepta 80..60000 y calcula nivel = 1 + ms/450). */
export const pulsar = (n: number, ms: number) => post(`/api/nodos/${n}/pulsar`, { ms: Math.round(ms) });
export const msParaNivel = (nivel: number) => (nivel - 1) * 450 + 225;
