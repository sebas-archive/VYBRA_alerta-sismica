import { useEffect, useRef } from "react";
import { G, P, richterOf } from "./prefs";
import { tr } from "./i18n";

/* Trazas sismográficas de DEMOSTRACIÓN.
   Porta la lógica de dibujo de la web real (web/public/operador.html): marcadores con etiqueta
   Mercalli + nivel, franja de ventana de coincidencia, ejes ±g y eje de tiempo común.
   Las señales se generan a partir de eventos simulados: no hay telemetría física. */

export const WINDOW_S = 10;

export type Ev = { det: number; t: number; level: number; committed: boolean; live?: boolean; pga?: number };
export type Win = { ws: number; we: number; dets: number[]; level: "baja" | "media" | "alta" };

export const sevOf = (l: number) =>
  l <= 2
    ? { key: "leve", name: "Leve", merc: "I–III" }
    : l <= 4
      ? { key: "moderado", name: "Moderado", merc: "IV–V" }
      : l <= 7
        ? { key: "fuerte", name: "Fuerte", merc: "VI–VII" }
        : { key: "severo", name: "Severo", merc: "VIII+" };

const PGA_PTS: [number, number][] = [
  [1, 0.04],
  [2, 0.071],
  [4, 0.127],
  [6, 0.188],
  [9, 0.302],
  [10, 0.34],
];
export function pgaOf(level: number) {
  for (let i = 1; i < PGA_PTS.length; i++) {
    const [l1, p1] = PGA_PTS[i];
    const [l0, p0] = PGA_PTS[i - 1];
    if (level <= l1) return p0 + ((p1 - p0) * (level - l0)) / (l1 - l0);
  }
  return 0.34;
}

export const alertLevelOf = (avg: number): Win["level"] => (avg <= 3 ? "baja" : avg <= 6 ? "media" : "alta");
export const alertLevelName = (l: Win["level"]) => (l === "baja" ? "Alerta baja" : l === "media" ? "Alerta media" : "Alerta alta");

/* Fuente en vivo (la llena live.ts con la foto real del clúster). Con on=true, eventsIn() e
   history() devuelven los eventos y alertas REALES del log replicado en vez de los simulados. */
export const liveSrc: { on: boolean; hist: { events: HEv[]; alerts: HAlert[] } } = { on: false, hist: { events: [], alerts: [] } };

/* ---------- Modelo compartido (lo actualiza App en cada render) ---------- */
export const demo = {
  connected: [1, 2, 3] as number[],
  confirmed: true, // líder elegido y quórum
  live: [] as { det: number; t: number; level: number }[],
  paused: false,
  pauseAt: 0,
};
export const nowS = () => Date.now() / 1000;
export const viewNow = () => (demo.paused ? demo.pauseAt : nowS());

/* Ciclo periódico de 60 s para que la demostración nunca quede vacía. */
const CYCLE = 40;
const BASE: { det: number; level: number; o: number }[] = [
  { det: 1, level: 2, o: 1 },
  { det: 2, level: 7, o: 14 },
  { det: 3, level: 4, o: 15.5 },
  { det: 2, level: 5, o: 20 },
  { det: 3, level: 5, o: 20.4 },
];
const BASE_WIN = { o: 14, dets: [2, 3] };

export function eventsIn(t0: number, t1: number): Ev[] {
  const now = nowS();
  if (liveSrc.on) return liveSrc.hist.events.filter((e) => e.t > 0 && e.t >= t0 - 45 && e.t <= Math.min(t1, now));
  const out: Ev[] = [];
  for (let c = Math.floor((t0 - 45) / CYCLE); c <= Math.floor(t1 / CYCLE); c++) {
    for (const b of BASE) {
      const t = c * CYCLE + b.o;
      if (t <= now && demo.connected.includes(b.det)) out.push({ det: b.det, t, level: b.level, committed: demo.confirmed });
    }
  }
  for (const e of demo.live) if (e.t <= now && demo.connected.includes(e.det)) out.push({ ...e, committed: demo.confirmed, live: true });
  return out;
}

/* ---------- Historial (Registros y Alertas) ---------- */
export const T_START = nowS() - 100;
export type HEv = Ev & { idx: number; id: string; pga: number; receivedBy: number; alertId?: number };
export type HAlert = {
  id: number;
  logIdx?: number;
  term?: number;
  leader?: number;
  /** Ensayo local de la pantalla de alerta (no sale de la red). */
  test?: boolean;
  t: number;
  ws: number;
  we: number;
  dets: number[];
  level: Win["level"];
  avg: number;
  evs: HEv[];
  live: boolean;
};

export function history(leader: number | null = null) {
  if (liveSrc.on) return liveSrc.hist;
  const raw = eventsIn(T_START, nowS())
    .filter((e) => e.t >= T_START)
    .sort((a, b) => a.t - b.t);
  const events: HEv[] = raw.map((e, i) => ({
    ...e,
    idx: i + 2,
    id: `nodo-${e.det}-${i + 2}`,
    pga: pgaOf(e.level),
    receivedBy: demo.connected.includes(e.det) ? e.det : (leader ?? demo.connected[0] ?? e.det),
  }));
  const alerts: HAlert[] = [];
  if (demo.confirmed) {
    const used = new Set<number>();
    for (let i = 0; i < events.length; i++) {
      if (used.has(i)) continue;
      const j = events.findIndex((x, k) => k > i && !used.has(k) && x.det !== events[i].det && x.t - events[i].t <= WINDOW_S);
      if (j < 0) continue;
      used.add(i);
      used.add(j);
      const a = events[i],
        b = events[j],
        avg = (a.level + b.level) / 2;
      a.alertId = b.idx;
      b.alertId = b.idx;
      alerts.push({ id: b.idx, t: b.t, ws: a.t, we: a.t + WINDOW_S, dets: [b.det, a.det], level: alertLevelOf(avg), avg, evs: [a, b], live: Boolean(a.live || b.live) });
    }
  }
  alerts.sort((x, y) => y.t - x.t);
  // Solo lo más reciente (los índices del log se conservan).
  return { events: events.slice(-40), alerts: alerts.slice(0, 10) };
}

export function windowsIn(t0: number, t1: number): Win[] {
  return history()
    .alerts.filter((a) => a.we >= t0 && a.ws <= t1)
    .map((a) => ({ ws: a.ws, we: a.we, dets: a.dets, level: a.level }));
}

/* Recorte de una alerta: 4 s antes de la ventana y 10 s después. */
export function clipOf(a: HAlert) {
  return { t0: a.ws - 4, t1: a.we + 10, evs: a.test ? (a.evs as Ev[]) : history().events, wins: [{ ws: a.ws, we: a.we, dets: a.dets, level: a.level }] as Win[] };
}

/* ---------- Señal ---------- */
function signal(det: number, t: number, evs: Ev[]) {
  let v = 0.0035 * (Math.sin(t * 41.3 + det * 1.7) + 0.6 * Math.sin(t * 97.1 + det) + 0.4 * Math.sin(t * 13.7 + det * 3));
  for (const e of evs) {
    const dt = t - e.t;
    if (dt < 0 || dt > 45) continue;
    const A = e.pga && e.pga > 0 ? e.pga : pgaOf(e.level);
    if (dt < 1.4) v += 0.22 * A * (dt / 1.4) * Math.sin(2 * Math.PI * 7.3 * dt);
    else {
      const s = dt - 1.4;
      v += A * Math.min(1, s / 0.35) * Math.exp(-s / (1.6 + e.level * 0.35)) * Math.sin(2 * Math.PI * 2.1 * s);
    }
  }
  return v;
}

export const ticksFor = (span: number) =>
  span <= 30 ? { minor: 1, major: 5 } : span <= 60 ? { minor: 2, major: 10 } : span <= 120 ? { minor: 5, major: 20 } : { minor: 10, major: 60 };

export function yMaxFor(dets: number[], t0: number, t1: number) {
  let m = 0;
  eventsIn(t0, t1).forEach((e) => {
    if (dets.includes(e.det) && e.t < t1) m = Math.max(m, e.pga && e.pga > 0 ? e.pga : pgaOf(e.level));
  });
  return Math.max(0.05, Math.ceil(m * 1.15 * 100) / 100);
}

export const fmtTime = (t: number) => {
  if (!t || t <= 0) return "sin hora";
  const d = new Date(t * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  if (P.hour12) {
    const h = d.getHours();
    return `${h % 12 || 12}:${p(d.getMinutes())}:${p(d.getSeconds())} ${h < 12 ? "a. m." : "p. m."}`;
  }
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** Etiqueta de intensidad según la escala elegida (Mercalli o equivalencia tipo Richter). */
export const scaleLabel = (level: number) =>
  P.scale === "richter" ? `Richter ≈ ${richterOf(level).toFixed(1)}` : `Mercalli ${sevOf(level).merc}`;
export const scaleShort = (level: number) => (P.scale === "richter" ? `M${richterOf(level).toFixed(1)}` : sevOf(level).merc);
const pgaAxis = (v: number) => (P.pgaUnit === "g" ? `${v.toFixed(2)} g` : `${(v * G).toFixed(1)} m/s²`);

/* ---------- Colores desde el tema activo ---------- */
function colors(el: HTMLElement) {
  const cs = getComputedStyle(el.closest(".desktop") || document.body);
  const g = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  return {
    text: g("--text", "#17201d"),
    text2: g("--secondary", "#68726e"),
    text3: g("--tertiary", "#7d8782"),
    trace: g("--trace", "#17201d"),
    grid: g("--line", "#e2e6e2"),
    gridStrong: g("--line-strong", "#cdd3cf"),
    surface: g("--surface", "#fff"),
    border: g("--line", "#e2e6e2"),
    win: g("--blue", "#0b6b57"),
    leve: g("--sev-leve", "#0b6b57"),
    moderado: g("--sev-moderado", "#a56812"),
    fuerte: g("--sev-fuerte", "#c2612a"),
    severo: g("--sev-severo", "#b42318"),
  } as Record<string, string>;
}

const fs = (n: number) => `${Math.round(n * P.fontScale * 10) / 10}px`;
export const gutterPx = () => Math.round(60 * Math.max(1, P.fontScale));
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Inter, system-ui, sans-serif';

function fit(cv: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1,
    w = cv.clientWidth,
    h = cv.clientHeight;
  if (!w || !h) return null;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  const ctx = cv.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

type DrawOpts = {
  labels: boolean;
  yLabels: boolean;
  yMax: number;
  online: boolean;
  evs: Ev[];
  wins: Win[];
  limit: number;
  ticks?: { minor: number; major: number };
};

function drawTrace(cv: HTMLCanvasElement, det: number, t0: number, t1: number, o: DrawOpts) {
  const ctx = fit(cv);
  if (!ctx) return;
  const C = colors(cv);
  const W = cv.clientWidth,
    H = cv.clientHeight,
    gutter = o.yLabels ? gutterPx() : 0,
    pw = W - gutter;
  const X = (t: number) => ((t - t0) / (t1 - t0)) * pw;
  ctx.clearRect(0, 0, W, H);
  const { minor, major } = o.ticks || ticksFor(t1 - t0);
  for (let tt = Math.ceil(t0 / minor) * minor; tt <= t1; tt += minor) {
    const x = Math.round(X(tt)) + 0.5;
    ctx.strokeStyle = Math.round(tt) % major === 0 ? C.gridStrong : C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  // Franja de ventana de coincidencia
  o.wins.forEach((a) => {
    if (!a.dets.includes(det) || a.we < t0 || a.ws > t1) return;
    const x0 = Math.max(0, X(a.ws)),
      x1 = Math.min(pw, X(a.we));
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = C.win;
    ctx.fillRect(x0, 0, x1 - x0, H);
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = C.win;
    ctx.setLineDash([3, 3]);
    [X(a.ws), X(a.we)].forEach((x) => {
      if (x >= 0 && x <= pw) {
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, H);
        ctx.stroke();
      }
    });
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    if (o.labels && x1 - x0 > 150) {
      ctx.font = `${fs(11.5)} ${FONT}`;
      ctx.fillStyle = C.text2;
      ctx.fillText(tr(`Ventana de coincidencia ${WINDOW_S} s · ${alertLevelName(a.level)}`), x0 + 6, H - 7);
    }
  });
  const evs = o.evs.filter((e) => e.det === det);
  const none = !o.online || evs.length === 0;
  const mid = H / 2,
    amp = (H / 2 - 10) / o.yMax,
    step = (t1 - t0) / pw;
  ctx.strokeStyle = none ? C.text3 : C.trace;
  ctx.lineWidth = 1.1;
  if (none) ctx.setLineDash([4, 4]);
  ctx.beginPath();
  let started = false,
    lastX = 0,
    lastY = mid;
  for (let px = 0; px < pw; px++) {
    const ta = t0 + px * step;
    if (ta > o.limit) break;
    let mn = Infinity,
      mx = -Infinity;
    for (let k = 0; k < 4; k++) {
      const v = none ? 0 : signal(det, ta + (k * step) / 4, evs);
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    const y1 = mid - Math.min(mx, o.yMax) * amp,
      y2 = mid - Math.max(mn, -o.yMax) * amp;
    if (!started) {
      ctx.moveTo(px, y1);
      started = true;
    }
    ctx.lineTo(px + 0.5, y1);
    ctx.lineTo(px + 0.5, y2);
    lastX = px;
    lastY = (y1 + y2) / 2;
  }
  ctx.stroke();
  ctx.setLineDash([]);
  if (started && o.limit < t1 + 1 && o.limit >= t1 - 0.5) {
    ctx.fillStyle = none ? C.text3 : C.trace;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2.5, 0, 7);
    ctx.fill();
  }
  if (!o.online) {
    ctx.font = `600 ${fs(12)} ${FONT}`;
    ctx.fillStyle = C.text2;
    const m = tr("Sin conexión");
    ctx.fillText(m, pw / 2 - ctx.measureText(m).width / 2, mid - 8);
  }
  const narrow = pw < 520;
  if (o.online)
    evs.forEach((e) => {
      if (e.t < t0 || e.t > t1) return;
      const s = sevOf(e.level),
        col = C[s.key],
        x = Math.round(X(e.t)) + 0.5;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.5;
      if (!e.committed) ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, 7);
      ctx.lineTo(x, H);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, 7, 4.5, 0, 7);
      ctx.fill();
      if (o.labels) {
        const txt = narrow
          ? `${scaleShort(e.level)} · ${e.level}`
          : tr(`nodo-${det} · ${scaleLabel(e.level)} ${s.name} · nivel ${e.level}${!e.committed ? " · pendiente" : ""}`);
        ctx.font = `600 ${fs(11.5)} ${FONT}`;
        const w = ctx.measureText(txt).width + 12,
          h = 20;
        let bx = x - w - 8;
        if (bx < 2) bx = Math.min(x + 8, pw - w - 2);
        const by = 14;
        ctx.fillStyle = C.surface;
        ctx.fillRect(bx, by, w, h);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
        ctx.fillStyle = C.text;
        ctx.fillText(txt, bx + 6, by + 14);
      }
    });
  if (o.yLabels) {
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pw + 0.5, 0);
    ctx.lineTo(pw + 0.5, H);
    ctx.stroke();
    ctx.font = `${fs(11.5)} ${FONT}`;
    ctx.fillStyle = C.text2;
    ctx.fillText(`+${pgaAxis(o.yMax)}`, pw + 6, 14);
    ctx.fillText(`0 ${P.pgaUnit === "g" ? "g" : "m/s²"}`, pw + 6, mid + 4);
    ctx.fillText(`−${pgaAxis(o.yMax)}`, pw + 6, H - 6);
  }
}

function drawAxis(cv: HTMLCanvasElement, t0: number, t1: number, gutter: number) {
  const ctx = fit(cv);
  if (!ctx) return;
  const C = colors(cv);
  const W = cv.clientWidth,
    pw = W - gutter,
    X = (t: number) => ((t - t0) / (t1 - t0)) * pw;
  ctx.clearRect(0, 0, W, cv.clientHeight);
  const { major } = ticksFor(t1 - t0);
  ctx.font = `${fs(11.5)} ${FONT}`;
  ctx.fillStyle = C.text2;
  ctx.strokeStyle = C.gridStrong;
  let lastEnd = -Infinity;
  for (let tt = Math.ceil(t0 / major) * major; tt <= t1; tt += major) {
    const x = X(tt),
      label = fmtTime(tt),
      w = ctx.measureText(label).width;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, 5);
    ctx.stroke();
    const lx = Math.min(Math.max(x - w / 2, 0), pw - w);
    if (lx > lastEnd + 10) {
      ctx.fillText(label, lx, 18);
      lastEnd = lx + w;
    }
  }
}

/* ---------- Componentes ---------- */
export type ChartProps = {
  det: number;
  online: boolean;
  /** Ventana visible en segundos (modo en vivo). */
  win?: number;
  labels?: boolean;
  yLabels?: boolean;
  yMode?: "comun" | "canal";
  commonDets?: number[];
  /** Modo fijo: fragmento recortado alrededor de una coincidencia (sin reloj). */
  clip?: { t0: number; t1: number; evs: Ev[]; wins: Win[] };
  className?: string;
  label?: string;
};

export function SeismoChart({ det, online, win = 30, labels = false, yLabels = false, yMode = "canal", commonDets, clip, className = "", label }: ChartProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const props = useRef({ det, online, win, labels, yLabels, yMode, commonDets, clip });
  props.current = { det, online, win, labels, yLabels, yMode, commonDets, clip };
  useEffect(() => {
    let raf = 0,
      last = 0;
    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);
      if (ts - last < 33) return;
      last = ts;
      const cv = ref.current;
      if (!cv) return;
      const p = props.current;
      let t0: number, t1: number, evs: Ev[], wins: Win[], limit: number, yMax: number, ticks: { minor: number; major: number } | undefined;
      if (p.clip) {
        ({ t0, t1, evs, wins } = p.clip);
        limit = Math.min(t1, nowS());
        ticks = { minor: 1, major: 5 };
        yMax = Math.max(0.05, Math.ceil(Math.max(0, ...evs.map((e) => (e.pga && e.pga > 0 ? e.pga : pgaOf(e.level)))) * 1.15 * 100) / 100);
      } else {
        t1 = viewNow();
        t0 = t1 - p.win;
        evs = eventsIn(t0, t1);
        wins = windowsIn(t0, t1);
        limit = t1;
        yMax = p.yMode === "comun" ? yMaxFor(p.commonDets || [1, 2, 3], t0, t1) : yMaxFor([p.det], t0, t1);
      }
      drawTrace(cv, p.det, t0, t1, { labels: p.labels, yLabels: p.yLabels, yMax, online: p.online, evs, wins, limit, ticks });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className={`sx-canvas ${className}`} role="img" aria-label={tr(label || `Traza del detector ${det}, datos de demostración`)} />;
}

export function SeismoAxis({ win, range, gutter }: { win?: number; range?: { t0: number; t1: number }; gutter?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const st = useRef({ win, range, gutter });
  st.current = { win, range, gutter };
  useEffect(() => {
    let raf = 0,
      last = 0;
    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);
      if (ts - last < 100) return;
      last = ts;
      const cv = ref.current;
      if (!cv) return;
      const { win: w, range: r, gutter: g0 } = st.current;
      const g = g0 ?? gutterPx();
      if (r) drawAxis(cv, r.t0, r.t1, g);
      else {
        const t1 = viewNow();
        drawAxis(cv, t1 - (w || 30), t1, g);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="sx-axis" aria-hidden />;
}

/* Fragmento fijo de una coincidencia: dos detectores dentro de la ventana de 10 s. */
export function clipFor(ids: number[], levelA: number, levelB: number, committed: boolean) {
  const t0 = 0;
  const evs: Ev[] = ids.map((det, i) => ({ det, t: 4 + i * 1.5, level: i === 0 ? levelA : levelB, committed }));
  const wins: Win[] = ids.length > 1 ? [{ ws: 4, we: 4 + WINDOW_S, dets: ids, level: alertLevelOf((levelA + levelB) / 2) }] : [];
  return { t0, t1: 24, evs, wins };
}
