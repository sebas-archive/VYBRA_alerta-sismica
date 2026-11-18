/* Preferencias de ADMIN. Se guardan en localStorage (si está disponible) y se leen desde
   cualquier módulo mediante el objeto mutable `P` (App lo sincroniza en cada render). */

export type Theme = "light" | "system" | "dark";
export type Lang = "es" | "en";
export type Scale = "mercalli" | "richter";
export type PgaUnit = "g" | "ms2";
export type Motion = "system" | "reduce" | "full";
export type Tone = "simulacro" | "emergencia";
export type MinLevel = "baja" | "media" | "alta";

export type Prefs = {
  theme: Theme;
  lang: Lang;
  fontScale: number; // 0.9 | 1 | 1.15 | 1.3
  scale: Scale;
  pgaUnit: PgaUnit;
  hour12: boolean;
  motion: Motion;
  defaultWindow: "30 s" | "1 min" | "5 min";
  defaultYScale: "Común" | "Por canal";
  sound: boolean;
  tone: Tone;
  volume: number; // 0..1
  minLevel: MinLevel;
  banner: boolean;
};

export const DEFAULTS: Prefs = {
  theme: "system",
  lang: "es",
  fontScale: 1,
  scale: "mercalli",
  pgaUnit: "g",
  hour12: false,
  motion: "system",
  defaultWindow: "30 s",
  defaultYScale: "Común",
  sound: true,
  tone: "simulacro",
  volume: 1,
  minLevel: "baja",
  banner: true,
};

const KEY = "vybra-admin-prefs";

export function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* sin almacenamiento: se usan los valores por defecto */
  }
  return { ...DEFAULTS };
}

export function savePrefs(p: Prefs) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignorar */
  }
}

/** Copia mutable leída por módulos que dibujan (canvas) o formatean. */
export const P: Prefs = { ...DEFAULTS };

export const systemReducesMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
export const motionReduced = () => P.motion === "reduce" || (P.motion === "system" && systemReducesMotion());

export const G = 9.80665;
export const pgaText = (g: number) => (P.pgaUnit === "g" ? `${g.toFixed(3)} g` : `${(g * G).toFixed(2)} m/s²`);
/** Convierte textos como "0.127 g" a la unidad elegida. */
export const pgaStr = (s: string) => {
  const m = s.match(/^([\d.]+)\s*g$/);
  return m ? pgaText(parseFloat(m[1])) : s;
};
export const pgaUnitLabel = () => (P.pgaUnit === "g" ? "g" : "m/s²");

/** Equivalencia orientativa nivel (1–10) → magnitud tipo Richter. NO es una medición. */
export const richterOf = (level: number) => Math.round((1.5 + 0.55 * level) * 10) / 10;

/** Archivo de audio de cada tono (los sirve web/server.js). */
export const toneSrc = (t: Tone) => (t === "emergencia" ? "/shared/audio/alarma-emergencia.mp3" : "./audio/alerta-simulacro.mp3");
