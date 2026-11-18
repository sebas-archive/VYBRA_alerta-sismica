/* Puente de ADMIN con las cápsulas compartidas (web/public/shared/island.js). Un único sistema de
   notificaciones: avisos emergentes (place "top") y estados persistentes bajo la barra (place "bar"). */
export type IslandKind = "info" | "success" | "warn" | "error" | "critical" | "conn";
export type IslandOpts = {
  id?: string;
  kind?: IslandKind;
  title: string;
  text?: string;
  rows?: [string, string][];
  actions?: { label: string; primary?: boolean; onClick?: () => void; close?: boolean }[];
  place?: "top" | "bar";
  ttl?: number;
  sticky?: boolean;
  pri?: number;
  icon?: string;
  spin?: boolean;
  dismissible?: boolean;
  onClose?: () => void;
};
type Api = { show: (o: IslandOpts) => void; dismiss: (id: string) => void; setTheme: (t: string) => void; setReduce: (v: boolean) => void };
const api = () => (window as unknown as { VybraIsland?: Api }).VybraIsland;
const pending: (() => void)[] = [];
let loading = false;

/** Carga el CSS y el JS compartidos (los sirve web/server.js en /shared/). */
export function loadIsland() {
  if (loading || api()) return;
  loading = true;
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "/shared/island.css";
  document.head.appendChild(css);
  const js = document.createElement("script");
  js.src = "/shared/island.js";
  js.onload = () => pending.splice(0).forEach((f) => f());
  document.head.appendChild(js);
}
const run = (f: (a: Api) => void) => {
  const a = api();
  if (a) f(a);
  else pending.push(() => api() && f(api()!));
};
export const notify = (o: IslandOpts) => run((a) => a.show(o));
export const dismissIsland = (id: string) => run((a) => a.dismiss(id));
export const islandTheme = (dark: boolean) => run((a) => a.setTheme(dark ? "dark" : "light"));
export const islandReduce = (v: boolean) => run((a) => a.setReduce(v));
