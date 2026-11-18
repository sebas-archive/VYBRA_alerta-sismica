import { P, type Lang } from "./prefs";
import { DICT, PATTERNS, WORDS } from "./dict-en";

/* Traducción español → inglés de la interfaz de ADMIN.
   El español es el idioma de origen: los componentes escriben en español y, si el idioma es
   inglés, un observador del DOM traduce textos y atributos (placeholder, aria-label, title).
   Al volver a español se restauran los textos originales. */

export function translate(s: string): string {
  const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!m || !m[2]) return s;
  const [, pre, core, post] = m;
  if (DICT[core] !== undefined) return pre + DICT[core] + post;
  for (const [re, fn] of PATTERNS) {
    const mm = core.match(re);
    if (mm) return pre + fn(mm) + post;
  }
  let out = core;
  for (const [re, to] of WORDS) out = out.replace(re, to);
  return pre + out + post;
}

/** Traduce un texto compuesto (p. ej. etiquetas de canvas) según el idioma activo. */
export const tr = (s: string) => (P.lang === "en" ? translate(s) : s);
export const lang = () => P.lang;

const ATTRS = ["placeholder", "aria-label", "title", "alt"];
type Rec = { o: string; t: string };
const texts = new WeakMap<Node, Rec>();
const attrs = new WeakMap<Element, Record<string, Rec>>();
let obs: MutationObserver | null = null;
let current: Lang = "es";

function doText(n: Node) {
  if (current !== "en") return;
  const v = n.nodeValue || "";
  const e = texts.get(n);
  if (e && v === e.t) return;
  const t = translate(v);
  if (t !== v) {
    texts.set(n, { o: v, t });
    n.nodeValue = t;
  } else texts.delete(n);
}

function doAttr(el: Element, a: string) {
  if (current !== "en") return;
  const v = el.getAttribute(a);
  if (!v) return;
  const rec = (attrs.get(el) || {}) as Record<string, Rec>;
  if (rec[a] && v === rec[a].t) return;
  const t = translate(v);
  if (t !== v) {
    rec[a] = { o: v, t };
    attrs.set(el, rec);
    el.setAttribute(a, t);
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    doText(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "CANVAS") return;
  ATTRS.forEach((a) => doAttr(el, a));
  el.childNodes.forEach(walk);
}

function restore(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    const e = texts.get(root);
    if (e && root.nodeValue === e.t) root.nodeValue = e.o;
    texts.delete(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  const rec = attrs.get(el);
  if (rec) {
    for (const a of Object.keys(rec)) if (el.getAttribute(a) === rec[a].t) el.setAttribute(a, rec[a].o);
    attrs.delete(el);
  }
  el.childNodes.forEach(restore);
}

export function startI18n(l: Lang) {
  const root = document.getElementById("root");
  if (!root) return;
  if (!obs) {
    obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "characterData") doText(m.target);
        else if (m.type === "attributes") doAttr(m.target as Element, m.attributeName || "");
        else m.addedNodes.forEach(walk);
      }
    });
    obs.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (l === current && l === "es") return;
  current = l;
  if (l === "en") walk(root);
  else restore(root);
}
