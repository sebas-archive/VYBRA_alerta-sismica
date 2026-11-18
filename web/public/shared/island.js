/* VYBRA — notificaciones tipo cápsula (Dynamic Island). Compartido por CLIENTE y ADMIN.
 *
 * VybraIsland.show({ id, kind, title, text, rows, actions, place, ttl, sticky, pri, icon, spin, dismissible, onClose })
 *   kind:  info | success | warn | error | critical | conn
 *   place: 'top' (emergente superior, por defecto) | 'bar' (bajo la top bar)
 *   more:  texto largo que se ve al expandir
 *   rows:  [[etiqueta, valor], ...]  información adicional (la cápsula se expande al pulsarla)
 *   actions: [{ label, primary, onClick }]
 *   id repetido = se actualiza en su sitio (sin duplicar). Cada posición muestra UNA cápsula; el resto espera en cola
 *   por prioridad (critical > error > warn > conn > info/success).
 * VybraIsland.dismiss(id) · VybraIsland.setTheme('dark'|'light') · VybraIsland.setReduce(bool)
 */
(function () {
  'use strict';
  if (window.VybraIsland) return;
  const SVG = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    info: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    success: SVG('<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16 9.8"/>'),
    warn: SVG('<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17h.01"/>'),
    error: SVG('<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>'),
    critical: SVG('<path d="M6 9a6 6 0 1 1 12 0c0 7 2 7 2 7H4s2 0 2-7"/><path d="M10 19a2 2 0 0 0 4 0"/>'),
    wifi: SVG('<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a5 5 0 0 1 6.4 0"/><path d="M12 19.5h.01"/>'),
    'wifi-off': SVG('<path d="M2.5 9a14 14 0 0 1 4-2.8M10 5.2A14 14 0 0 1 21.5 9M5.5 12.5a9.5 9.5 0 0 1 3-1.9M14.5 10.6a9.5 9.5 0 0 1 4 1.9M8.8 16a5 5 0 0 1 6.4 0"/><path d="M12 19.5h.01M3 3l18 18"/>'),
    sync: SVG('<path d="M20 11a8 8 0 0 0-14.5-3.5M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 3.5M20 20v-4h-4"/>')
  };
  const CHEV = SVG('<path d="m6 9 6 6 6-6"/>');
  const X = SVG('<path d="M6 6l12 12M18 6 6 18"/>');
  const KINDS = {
    info: { ttl: 4500, pri: 1, icon: 'info' },
    success: { ttl: 3500, pri: 1, icon: 'success' },
    conn: { ttl: 5000, pri: 2, icon: 'wifi' },
    warn: { ttl: 7000, pri: 5, icon: 'warn' },
    error: { ttl: 9000, pri: 6, icon: 'error' },
    critical: { ttl: 0, pri: 9, icon: 'critical' }
  };
  const LEAVE_MS = 220;
  const reducedQuery = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  let theme = null;
  let reduce = false;

  function mkSlot(place) {
    const el = document.createElement('div');
    el.className = 'island-slot';
    el.dataset.place = place;
    el.dataset.reduce = '0';
    const slot = { place, el, queue: [], cur: null, node: null, timer: null, left: 0, since: 0, hold: false, closing: false };
    document.body.appendChild(el);
    return slot;
  }
  let slots = null;
  function ensure() {
    if (slots) return slots;
    if (!document.body) return null;
    slots = { top: mkSlot('top'), bar: mkSlot('bar') };
    applyTheme();
    window.addEventListener('resize', () => anchor(slots.bar));
    return slots;
  }
  function applyTheme() {
    if (!slots) return;
    const t = theme || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    Object.values(slots).forEach((s) => { s.el.dataset.theme = t; s.el.dataset.reduce = reduce || reducedQuery.matches ? '1' : '0'; });
  }
  // La cápsula "bajo la top bar" se centra en la barra y queda 8 px por debajo de ella; no desplaza nada.
  function anchor(slot) {
    if (slot.place !== 'bar') return;
    const bar = document.querySelector('[data-island-anchor]') || document.getElementById('topbar') || document.querySelector('.toolbar');
    const r = bar && bar.getBoundingClientRect();
    // Si hay un aviso emergente arriba, la cápsula de la barra baja lo justo para no solaparse con él.
    const t = slots && slots.top.node && !slots.top.closing ? slots.top.node.getBoundingClientRect() : null;
    const libre = t ? t.bottom + 8 : 0;
    if (r && r.height > 0) {
      slot.el.style.top = Math.max(r.bottom + 8, libre, 8) + 'px';
      slot.el.style.left = r.left + r.width / 2 + 'px';
    } else {
      slot.el.style.top = Math.max(64, libre) + 'px';
      slot.el.style.left = '50%';
    }
  }
  const instant = () => reduce || reducedQuery.matches;

  function build(slot, o) {
    const open = slot.node ? slot.node.dataset.open === '1' : false;
    const k = o.kind;
    const hasMore = !!((o.rows && o.rows.length) || (o.actions && o.actions.length) || o.more);
    const node = document.createElement('div');
    node.className = `island k-${k}`;
    node.dataset.open = open && hasMore ? '1' : '0';
    node.setAttribute('role', k === 'critical' || k === 'error' ? 'alert' : 'status');
    node.setAttribute('aria-live', k === 'critical' || k === 'error' ? 'assertive' : 'polite');
    node.setAttribute('aria-atomic', 'true');
    const ic = document.createElement('span');
    ic.className = 'isl-ic' + (o.spin ? ' isl-spin' : '');
    ic.innerHTML = ICONS[o.icon || KINDS[k].icon] || ICONS.info;
    const main = document.createElement(hasMore ? 'button' : 'div');
    main.className = 'isl-main';
    if (hasMore) { main.type = 'button'; main.setAttribute('aria-expanded', node.dataset.open === '1' ? 'true' : 'false'); }
    const title = document.createElement('span');
    title.className = 'isl-title';
    title.textContent = o.title || '';
    main.appendChild(title);
    if (o.text) {
      const tx = document.createElement('span');
      tx.className = 'isl-text';
      tx.textContent = o.text;
      main.appendChild(tx);
    }
    const tools = document.createElement('div');
    tools.className = 'isl-tools';
    if (hasMore) {
      const chev = document.createElement('span');
      chev.className = 'isl-chev';
      chev.innerHTML = CHEV;
      tools.appendChild(chev);
    }
    if (o.dismissible !== false) {
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'isl-x';
      x.setAttribute('aria-label', 'Cerrar notificación');
      x.innerHTML = X;
      x.addEventListener('click', (e) => { e.stopPropagation(); if (o.onClose) o.onClose(); close(slot); });
      tools.appendChild(x);
    }
    node.append(ic, main, tools);
    if (hasMore) {
      const more = document.createElement('div');
      more.className = 'isl-more';
      const inn = document.createElement('div');
      inn.className = 'isl-more-in';
      if (o.more) {
        const mt = document.createElement('p');
        mt.className = 'isl-more-text';
        mt.textContent = o.more;
        inn.appendChild(mt);
      }
      if (o.rows && o.rows.length) {
        const rows = document.createElement('div');
        rows.className = 'isl-rows';
        o.rows.forEach(([a, b]) => {
          const r = document.createElement('div');
          r.className = 'isl-row';
          const s = document.createElement('span'); s.textContent = a;
          const v = document.createElement('b'); v.textContent = b;
          r.append(s, v);
          rows.appendChild(r);
        });
        inn.appendChild(rows);
      }
      if (o.actions && o.actions.length) {
        const acts = document.createElement('div');
        acts.className = 'isl-acts';
        o.actions.forEach((a) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'isl-act' + (a.primary ? ' primary' : '');
          b.textContent = a.label;
          b.addEventListener('click', (e) => { e.stopPropagation(); if (a.onClick) a.onClick(); if (a.close !== false) close(slot); });
          acts.appendChild(b);
        });
        inn.appendChild(acts);
      }
      more.appendChild(inn);
      node.appendChild(more);
      const toggle = () => {
        const nowOpen = node.dataset.open !== '1';
        node.dataset.open = nowOpen ? '1' : '0';
        main.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
        nowOpen ? pause(slot) : resume(slot);
      };
      main.addEventListener('click', toggle);
      // El chevron también despliega (el botón accesible sigue siendo el texto de la cápsula).
      const chevEl = tools.querySelector('.isl-chev');
      if (chevEl) chevEl.addEventListener('click', toggle);
    }
    // No desaparece mientras el usuario interactúa con ella.
    node.addEventListener('pointerenter', () => pause(slot));
    node.addEventListener('pointerleave', () => resume(slot));
    node.addEventListener('focusin', () => pause(slot));
    node.addEventListener('focusout', () => resume(slot));
    node.addEventListener('keydown', (e) => { if (e.key === 'Escape' && o.dismissible !== false) { if (o.onClose) o.onClose(); close(slot); } });
    return node;
  }

  function render(slot, replaceInPlace) {
    const node = build(slot, slot.cur);
    if (replaceInPlace && slot.node) {
      node.style.animation = 'none';
      slot.node.replaceWith(node);
    } else {
      slot.el.textContent = '';
      slot.el.appendChild(node);
    }
    slot.node = node;
    anchor(slot);
    if (slot.place === 'top' && slots) anchor(slots.bar);
  }
  function arm(slot) {
    clearTimeout(slot.timer);
    const o = slot.cur;
    if (!o || !o.ttl) return;
    slot.left = o.ttl;
    slot.since = Date.now();
    slot.hold = false;
    slot.timer = setTimeout(() => close(slot), slot.left);
  }
  function pause(slot) {
    if (!slot.cur || !slot.cur.ttl || slot.hold) return;
    slot.hold = true;
    clearTimeout(slot.timer);
    slot.left = Math.max(1200, slot.left - (Date.now() - slot.since));
  }
  function resume(slot) {
    if (!slot.cur || !slot.cur.ttl || !slot.hold) return;
    if (slot.node && (slot.node.dataset.open === '1' || slot.node.matches(':hover') || slot.node.contains(document.activeElement))) return;
    slot.hold = false;
    slot.since = Date.now();
    slot.timer = setTimeout(() => close(slot), slot.left);
  }
  function close(slot) {
    if (!slot.cur || slot.closing) return;
    slot.closing = true;
    clearTimeout(slot.timer);
    const done = () => {
      slot.closing = false;
      slot.cur = null;
      slot.node = null;
      slot.el.textContent = '';
      if (slot.place === 'top' && slots) anchor(slots.bar);
      next(slot);
    };
    if (slot.node && !instant()) {
      slot.node.classList.add('leaving');
      if (slot.place === 'top' && slots) { slot.closing = true; anchor(slots.bar); }
      setTimeout(done, LEAVE_MS);
    } else done();
  }
  function next(slot) {
    if (slot.cur || !slot.queue.length) return;
    slot.queue.sort((a, b) => b.pri - a.pri || a.seq - b.seq);
    slot.cur = slot.queue.shift();
    render(slot);
    arm(slot);
  }
  let seq = 0;
  function show(opts) {
    const S = ensure();
    if (!S) return;
    const kind = KINDS[opts.kind] ? opts.kind : 'info';
    const o = Object.assign({}, opts, { kind, seq: ++seq });
    o.pri = opts.pri != null ? opts.pri : KINDS[kind].pri;
    o.ttl = opts.sticky ? 0 : opts.ttl != null ? opts.ttl : KINDS[kind].ttl;
    if (!o.id) o.id = 'n' + o.seq;
    const slot = S[opts.place === 'bar' ? 'bar' : 'top'];
    if (slot.cur && slot.cur.id === o.id) {            // misma notificación: se actualiza en su sitio
      const same = slot.cur.title === o.title && slot.cur.text === o.text && slot.cur.kind === o.kind && slot.cur.icon === o.icon;
      slot.cur = Object.assign({}, slot.cur, o, { seq: slot.cur.seq });
      if (!same) { render(slot, true); if (!slot.hold) arm(slot); }
      return;
    }
    const q = slot.queue.findIndex((x) => x.id === o.id);
    if (q >= 0) { slot.queue[q] = Object.assign({}, o, { seq: slot.queue[q].seq }); return; }
    slot.queue.push(o);
    if (slot.cur && !slot.closing && o.pri > slot.cur.pri) {   // más urgente: la actual espera si es persistente
      const prev = slot.cur;
      slot.queue.push(prev);   // la desplazada espera su turno (sea persistente o efímera)
      slot.queue = slot.queue.filter((x) => x !== o);
      slot.cur = o;
      render(slot);
      arm(slot);
      return;
    }
    next(slot);
  }
  function dismiss(id) {
    if (!slots) return;
    Object.values(slots).forEach((slot) => {
      slot.queue = slot.queue.filter((x) => x.id !== id);
      if (slot.cur && slot.cur.id === id) close(slot);
    });
  }
  window.VybraIsland = {
    show, dismiss,
    setTheme(t) { theme = t === 'dark' || t === 'light' ? t : null; applyTheme(); },
    setReduce(v) { reduce = !!v; applyTheme(); },
    has(id) { return !!slots && Object.values(slots).some((s) => (s.cur && s.cur.id === id) || s.queue.some((x) => x.id === id)); }
  };
  if (!document.body) document.addEventListener('DOMContentLoaded', ensure); else ensure();
})();
