/**
 * scripts/medir.mjs
 * Medición de accesibilidad visual por vista, ancho y tema:
 *   textos <16px (12px en las etiquetas de la barra inferior), contraste <4.5:1 (todo texto), texto principal <7:1,
 *   controles <48px, campos sin etiqueta y desborde horizontal.
 * Guarda capturas en docs/capturas/ y el informe en docs/medicion.md.
 *
 * Uso:  node scripts/medir.mjs http://localhost:5173
 *   (o BASE_URL=http://localhost:5173 node scripts/medir.mjs)
 * Requiere el servidor en modo demo:  VITE_DEMO=1 npm run dev
 *   (la Agenda es plegable: las vistas "perros_abierta" y "ventana_editar_ficha" abren la primera entrada)
 * Sale con código 1 si algo no da 0, si una vista no se pudo abrir
 * o si el fondo del body es igual en claro y en oscuro.
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

const BASE_URL = process.argv[2] || process.env.BASE_URL || 'http://localhost:5173';
const CAPS_DIR = 'docs/capturas';
const REPORT = 'docs/medicion.md';
const THEME_KEY = 'pensionados_theme';

// Tamaño mínimo de texto: 16 px para todo...
const MIN_TEXT_PX = 16;
// ...salvo las etiquetas de la barra de navegación inferior (celular), que se aceptan desde 12 px.
// Son cuatro palabras cortas ("Hoy", "Agenda", "Cobros", "Ajustes") bajo un ícono de 24 px, repartidas en 5 columnas
// iguales: a 16 px "Ajustes" no entra en un ancho de 360 px sin cortarse. La excepción es sólo para esa barra
// (nav fija abajo); ningún otro texto baja del mínimo de 16 px.
const BOTTOM_NAV_MIN_TEXT_PX = 12;

const VIEWPORTS = [
  { name: '360', width: 360, height: 800 },
  { name: '1280', width: 1280, height: 800 },
];
const THEMES = ['light', 'dark'];

// ── navegación ───────────────────────────────────────────────────────────────

async function clickTid(page, id, { required = true } = {}) {
  const loc = page.locator(`[data-testid="${id}"]:visible`).first();
  if ((await loc.count()) === 0) {
    if (required) throw new Error(`No se encontró [data-testid="${id}"] visible`);
    return false;
  }
  await loc.click({ timeout: 5000 });
  await page.waitForTimeout(350);
  return true;
}

/** La Agenda arranca plegada: abre la primera entrada para que se vea la ficha completa. */
async function openFirstAgendaEntry(page) {
  await clickTid(page, 'tab-perros');
  const toggle = page.locator('[data-testid="agenda-entry-toggle"]:visible').first();
  if ((await toggle.count()) === 0) throw new Error('No se encontró ninguna entrada plegable de la Agenda');
  await toggle.click({ timeout: 5000 });
  await page.waitForSelector('[data-testid="agenda-entry-toggle"][aria-expanded="true"]', { timeout: 4000 });
  await page.waitForTimeout(350);
}

/** En el celular las tarjetas de Hoy arrancan plegadas: abre la primera para que aparezcan sus botones. */
async function expandFirstHoyCard(page) {
  const toggle = page.locator('button[aria-controls^="hoy-card-body-"]:visible').first();
  if ((await toggle.count()) === 0) return; // en pantalla ancha ya están abiertas
  if ((await toggle.getAttribute('aria-expanded')) === 'false') {
    await toggle.click({ timeout: 5000 });
    await page.waitForTimeout(350);
  }
}

async function openHistory(page) {
  for (const tab of ['tab-cobros', 'tab-perros', 'tab-hoy']) {
    await clickTid(page, tab);
    if (await clickTid(page, 'abrir-historial', { required: false })) {
      await page.waitForSelector('dialog[open]', { timeout: 4000 });
      return;
    }
  }
  throw new Error('No se encontró [data-testid="abrir-historial"] en ninguna pestaña');
}

async function openHistoryRow(page) {
  await openHistory(page);
  await clickTid(page, 'expandir-perro');
}

async function openDeleteDialog(page) {
  await openHistoryRow(page);
  await clickTid(page, 'borrar-estadia');
  await page.waitForSelector('[data-testid="dialog-borrar"]', { timeout: 4000 });
}

const VIEWS = [
  { id: 'hoy', run: p => clickTid(p, 'tab-hoy') },
  {
    // "Ver detalle" abierto en todas las tarjetas: total, cobrado, deducción, traslado, te queda
    id: 'hoy_detalle', run: async p => {
      await clickTid(p, 'tab-hoy');
      await p.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
    },
  },
  { id: 'perros', run: p => clickTid(p, 'tab-perros') },
  { id: 'perros_abierta', run: openFirstAgendaEntry },
  { id: 'cobros', run: async p => { await clickTid(p, 'tab-cobros'); await clickTid(p, 'ver-anteriores', { required: false }); } },
  { id: 'ajustes', run: p => clickTid(p, 'tab-ajustes') },
  { id: 'ventana_nueva_estadia', dialog: true, run: async p => { await clickTid(p, 'tab-hoy'); await clickTid(p, 'abrir-nueva-estadia'); } },
  { id: 'ventana_editar_ficha', dialog: true, run: async p => { await openFirstAgendaEntry(p); await clickTid(p, 'editar-ficha'); } },
  { id: 'ventana_finalizar', dialog: true, run: async p => { await clickTid(p, 'tab-hoy'); await expandFirstHoyCard(p); await clickTid(p, 'finalizar-estadia'); } },
  { id: 'ventana_historial', dialog: true, run: openHistoryRow },
  { id: 'ventana_borrar', dialog: true, run: openDeleteDialog },
  {
    id: 'aviso_deshacer', dialog: true, run: async p => {
      await openDeleteDialog(p);
      await clickTid(p, 'confirm-borrar');
      await p.waitForSelector('[data-testid="undo-delete-toast"]', { timeout: 4000 });
    },
  },
  // Ingreso con huella: en modo demo ?huella=... muestra cada pantalla
  {
    id: 'huella_activar', dialog: true, query: '?huella=activar',
    run: p => p.waitForSelector('[data-testid="dialog-activar-huella"]', { timeout: 4000 }),
  },
  {
    id: 'ajustes_huella_no_disponible', query: '?huella=no-disponible',
    run: async p => {
      await clickTid(p, 'tab-ajustes');
      await p.waitForSelector('[data-testid="switch-huella"][disabled]', { timeout: 4000 });
    },
  },
  {
    id: 'huella_activar_error', dialog: true, query: '?huella=activar-error',
    run: p => p.waitForSelector('[data-testid="aviso-error-huella"]', { timeout: 4000 }),
  },
  {
    id: 'huella_desbloquear', query: '?huella=desbloquear',
    run: p => p.waitForSelector('[data-testid="desbloquear-huella"]', { timeout: 4000 }),
  },
  {
    id: 'huella_desbloquear_contrasena', query: '?huella=contrasena',
    run: p => p.waitForSelector('[data-testid="ingresar-con-contrasena"]', { timeout: 4000 }),
  },
  // Respaldo: aviso de error (en modo demo, ?respaldo=error)
  {
    id: 'ajustes_respaldo_error', query: '?respaldo=error',
    run: async p => {
      await clickTid(p, 'tab-ajustes');
      await p.waitForSelector('[data-testid="aviso-respaldo"]', { timeout: 4000 });
    },
  },
  // Aviso de lectura fallida con "Reintentar": en modo demo lo muestra ?aviso=lectura
  {
    id: 'aviso_lectura', query: '?aviso=lectura',
    run: p => p.waitForSelector('[data-testid="aviso-lectura"]', { timeout: 4000 }),
  },
];

// ── medición en la página ────────────────────────────────────────────────────

async function measurePage(page) {
  return page.evaluate(({ minText, bottomNavMinText }) => {
    const openDialogs = document.querySelectorAll('dialog[open]');
    const root = openDialogs.length ? openDialogs[openDialogs.length - 1] : document.body;

    const parse = s => {
      const m = s && s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/);
      if (!m) return null;
      let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      return [+m[1], +m[2], +m[3], a];
    };
    // colores en otros espacios (oklab, color-mix…) se resuelven pintándolos en un canvas
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const toRgba = s => {
      if (!s || s === 'transparent') return [0, 0, 0, 0];
      const direct = parse(s);
      if (direct && /^rgba?\(/.test(s.trim())) return direct;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = s;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const gradientStops = img => {
      if (!img || img === 'none') return [];
      const out = [];
      const re = /(rgba?\([^)]*\)|oklab\([^)]*\)|oklch\([^)]*\)|color-mix\((?:[^()]|\([^)]*\))*\)|#[0-9a-f]{3,8})/gi;
      let m;
      while ((m = re.exec(img))) out.push(toRgba(m[1]));
      return out;
    };
    const over = (top, under) => {
      const a = top[3] + under[3] * (1 - top[3]);
      if (a === 0) return [0, 0, 0, 0];
      return [0, 1, 2].map(i => (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a).concat(a);
    };
    const lum = c => c.slice(0, 3).reduce((acc, v, i) => {
      const n = v / 255;
      return acc + (n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4)) * [0.2126, 0.7152, 0.0722][i];
    }, 0);
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

    // Fondos posibles detrás del elemento (varios si hay degradado)
    const backgrounds = el => {
      const layers = [];
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const cs = getComputedStyle(n);
        const stops = gradientStops(cs.backgroundImage);
        const col = toRgba(cs.backgroundColor);
        layers.push({ col, stops });
        if (col[3] >= 1 || (stops.length && stops.every(s => s[3] >= 1))) break;
      }
      let bases = [[255, 255, 255, 1]];
      for (let i = layers.length - 1; i >= 0; i--) {
        const { col, stops } = layers[i];
        bases = bases.map(b => over(col, b));
        if (stops.length) bases = bases.flatMap(b => stops.map(s => over(s, b)));
      }
      return bases;
    };
    const opacityOf = el => {
      let o = 1;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
      return o;
    };
    const worst = (fg, el) => {
      const op = opacityOf(el);
      const f = [fg[0], fg[1], fg[2], fg[3] * op];
      let min = Infinity, bgUsed = null;
      for (const b of backgrounds(el)) {
        const r = ratio(over(f, b), b);
        if (r < min) { min = r; bgUsed = b; }
      }
      return { cr: min, bg: bgUsed };
    };
    const visible = el => {
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      if (el.closest('[inert],[aria-hidden="true"]')) return false;
      return true;
    };
    const rgbStr = c => `rgb(${c.slice(0, 3).map(Math.round).join(',')})`;

    const probe = document.createElement('span');
    probe.style.color = 'var(--t-texto)';
    root.appendChild(probe);
    const primary = toRgba(getComputedStyle(probe).color);
    probe.remove();
    const isPrimary = c => c[3] > 0.99 && [0, 1, 2].every(i => Math.abs(c[i] - primary[i]) < 1.5);

    const f = {
      theme: document.documentElement.dataset.theme || '',
      bodyBg: getComputedStyle(document.body).backgroundColor,
      smallText: [], low45: [], lowPrimary: [], smallControls: [], unlabeled: [],
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1
        || (root !== document.body && root.scrollWidth > root.clientWidth + 1),
    };

    // Barra de navegación inferior: nav con aria-label "Secciones" fija al borde de abajo
    const inBottomNav = el => {
      const nav = el.closest('nav[aria-label="Secciones"]');
      if (!nav) return false;
      const cs = getComputedStyle(nav);
      return cs.position === 'fixed' && parseFloat(cs.bottom) === 0;
    };

    const checkText = (el, text, fgStr, fsPx, kind) => {
      if (el.closest(':disabled')) return;
      if (fsPx < (inBottomNav(el) ? bottomNavMinText : minText)) f.smallText.push({ text, fsPx });
      const fg = toRgba(fgStr);
      const { cr, bg } = worst(fg, el);
      const entry = { text, cr: Math.round(cr * 100) / 100, fg: rgbStr(fg), bg: rgbStr(bg), kind };
      if (cr < 4.5) f.low45.push(entry);
      else if (kind === 'texto' && isPrimary(fg) && cr < 7) f.lowPrimary.push(entry);
    };

    const seen = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (!text) continue;
      const el = node.parentElement;
      if (!el || seen.has(el) || ['SCRIPT', 'STYLE', 'OPTION'].includes(el.tagName)) continue;
      seen.add(el);
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      checkText(el, text.slice(0, 60), cs.color, parseFloat(cs.fontSize), 'texto');
    }

    root.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea').forEach(el => {
      if (!visible(el)) return;
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      if (el.value) checkText(el, `[${el.tagName.toLowerCase()}] ${String(el.value).slice(0, 40)}`, cs.color, fs, 'campo');
      else if (el.placeholder) checkText(el, `[placeholder] ${el.placeholder.slice(0, 40)}`, getComputedStyle(el, '::placeholder').color, fs, 'placeholder');
    });

    root.querySelectorAll('input:not([type=hidden]), select, textarea').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const id = el.id;
      const ok = (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) || el.getAttribute('aria-label')
        || el.getAttribute('aria-labelledby') || el.closest('label');
      if (!ok) f.unlabeled.push({ tag: el.tagName.toLowerCase(), type: el.type || '', placeholder: el.placeholder || '', id: id || '' });
    });

    root.querySelectorAll('button, a[href], [role=button], [role=radio], [role=tab], input:not([type=hidden]), select, textarea, summary').forEach(el => {
      if (!visible(el) && !(el.tagName === 'INPUT' && getComputedStyle(el).opacity === '0')) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      // un checkbox/radio dentro de una etiqueta grande usa la etiqueta como área táctil
      let target = r;
      if (el.matches('input[type=checkbox], input[type=radio]')) {
        const lab = el.closest('label') || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
        if (lab) target = lab.getBoundingClientRect();
      }
      if (target.width < 48 || target.height < 48) {
        const text = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.type || '').trim().slice(0, 50);
        f.smallControls.push({ tag: el.tagName.toLowerCase(), text, w: Math.round(target.width), h: Math.round(target.height) });
      }
    });

    // ── Contraste no textual (WCAG 1.4.11, 3:1) ──
    f.lowNonText = [];
    const parentBgs = el => (el.parentElement ? backgrounds(el.parentElement) : [[255, 255, 255, 1]]);
    const minVs = (color, bgs) => Math.min(...bgs.map(b => ratio(over(color, b), b)));
    const label = el => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);

    // Controles: si tienen borde o fondo propio, su contorno debe distinguirse 3:1 del fondo de alrededor
    root.querySelectorAll('button, a[href], [role=button], [role=radio], input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea, summary').forEach(el => {
      if (!visible(el) || el.closest(':disabled')) return;
      const cs = getComputedStyle(el);
      const outside = parentBgs(el);
      const bw = parseFloat(cs.borderTopWidth) || 0;
      const border = bw > 0 && cs.borderTopStyle !== 'none' ? toRgba(cs.borderTopColor) : null;
      const fill = toRgba(cs.backgroundColor);
      const hasBorder = border && border[3] > 0;
      const hasFill = fill[3] > 0.02;
      const isField = el.matches('input, select, textarea');
      // Campos: su contorno es obligatorio. Botones: un borde, si existe, debe verse (3:1);
      // un botón con texto sin borde se identifica por el texto (WCAG 1.4.11).
      if (!isField && !hasBorder) return;
      const opts = [];
      if (hasBorder) opts.push(minVs(border, outside));
      if (hasFill) opts.push(minVs(fill, outside));
      const best = opts.length ? Math.max(...opts) : 1;
      if (best < 3) f.lowNonText.push({ kind: isField ? 'campo' : 'borde', text: label(el), cr: Math.round(best * 100) / 100 });
    });

    // Íconos SVG visibles: trazo o relleno contra el fondo, 3:1
    root.querySelectorAll('svg').forEach(svg => {
      if (!visible(svg)) return;
      const cs = getComputedStyle(svg);
      const paint = cs.stroke && cs.stroke !== 'none' ? cs.stroke : cs.fill;
      if (!paint || paint === 'none' || paint.startsWith('url')) return;
      const col = toRgba(paint);
      if (col[3] === 0) return;
      const op = opacityOf(svg);
      const c = [col[0], col[1], col[2], col[3] * op];
      const cr = Math.min(...backgrounds(svg).map(b => ratio(over(c, b), b)));
      if (cr < 3) {
        const host = svg.closest('button, a, label, h1, h2, h3, p, span, div');
        f.lowNonText.push({ kind: 'ícono', text: host ? label(host) : 'svg', cr: Math.round(cr * 100) / 100 });
      }
    });

    return f;
  }, { minText: MIN_TEXT_PX, bottomNavMinText: BOTTOM_NAV_MIN_TEXT_PX });
}

// ── Foco con teclado: Tab por toda la vista ──────────────────────────────────

async function measureFocus(page) {
  const problems = [];
  const seen = new Set();
  let first = null;
  // transition-all anima el contorno; se mide el estado final
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
  for (let i = 0; i < 200; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      if (!el.dataset.medirId) el.dataset.medirId = String(Math.random()).slice(2);
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const width = cs.outlineStyle === 'none' ? 0 : parseFloat(cs.outlineWidth) || 0;
      const offset = parseFloat(cs.outlineOffset) || 0;
      // contraste del contorno con el fondo de alrededor
      const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      const toRgba = s => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = s; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
      const over = (t, u) => { const a = t[3] + u[3] * (1 - t[3]); return a === 0 ? [0, 0, 0, 0] : [0, 1, 2].map(i => (t[i] * t[3] + u[i] * u[3] * (1 - t[3])) / a).concat(a); };
      const lum = c => c.slice(0, 3).reduce((acc, v, i) => { const n = v / 255; return acc + (n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4)) * [0.2126, 0.7152, 0.0722][i]; }, 0);
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      let bg = [255, 255, 255, 1];
      const layers = [];
      for (let n = el.parentElement; n && n.nodeType === 1; n = n.parentElement) {
        const c = toRgba(getComputedStyle(n).backgroundColor);
        layers.push(c);
        if (c[3] >= 1) break;
      }
      for (let k = layers.length - 1; k >= 0; k--) bg = over(layers[k], bg);
      const oc = toRgba(cs.outlineColor);
      const cr = width ? ratio(over(oc, bg), bg) : 0;
      // ¿lo recorta algún contenedor con overflow?
      const grow = width + Math.max(0, offset);
      const outer = { l: r.left - grow, t: r.top - grow, r: r.right + grow, b: r.bottom + grow };
      let clipped = false;
      for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
        const pcs = getComputedStyle(p);
        if (pcs.overflowX === 'visible' && pcs.overflowY === 'visible') continue;
        const pr = p.getBoundingClientRect();
        const outX = outer.l < pr.left - 0.5 || outer.r > pr.right + 0.5;
        const outY = outer.t < pr.top - 0.5 || outer.b > pr.bottom + 0.5;
        if (outX || outY) { clipped = true; break; }
      }
      const text = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
      return { id: el.dataset.medirId, text, width, cr: Math.round(cr * 100) / 100, clipped, tag: el.tagName.toLowerCase() };
    });
    if (!info) continue;
    if (first === info.id) break;
    if (!first) first = info.id;
    if (seen.has(info.id)) continue;
    seen.add(info.id);
    const why = info.width < 3 ? `contorno ${info.width}px` : info.cr < 3 ? `contraste ${info.cr}:1` : info.clipped ? 'recortado' : null;
    if (why) problems.push({ text: info.text, tag: info.tag, why });
  }
  return { problems, count: seen.size };
}

// ── ejecución ────────────────────────────────────────────────────────────────

const slug = s => s.replace(/[^a-zA-Z0-9]+/g, '_');

async function newPage(browser, vp, theme, colorScheme = theme) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, colorScheme });
  await context.addInitScript(([key, value]) => {
    try { localStorage.setItem(key, value); } catch {}
  }, [THEME_KEY, theme]);
  const page = await context.newPage();
  return { context, page };
}

async function load(page, query = '') {
  await page.goto(BASE_URL + query, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector('main, form', { timeout: 15000 });
  await page.waitForTimeout(500);
}

async function run() {
  mkdirSync(CAPS_DIR, { recursive: true });
  // Sólo las capturas propias (vista_ancho_tema.png); otras imágenes de la carpeta no se tocan
  for (const f of readdirSync(CAPS_DIR)) if (/_(360|1280)_(light|dark)\.png$/.test(f)) unlinkSync(join(CAPS_DIR, f));

  // CHROMIUM_PATH: usar un Chromium ya instalado si la versión que espera Playwright no está descargada
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });

  // El servidor tiene que ser esta app en modo demo
  {
    const { context, page } = await newPage(browser, VIEWPORTS[0], 'light');
    await load(page);
    const isDemo = await page.evaluate(() => document.body.innerText.includes('MODO DEMO'));
    await context.close();
    if (!isDemo) {
      await browser.close();
      throw new Error(`${BASE_URL} no muestra "MODO DEMO". Levantá la app con VITE_DEMO=1 y pasá esa dirección.`);
    }
  }

  const results = [];
  const checks = [];

  for (const vp of VIEWPORTS) {
    const bodyBgByTheme = {};
    for (const theme of THEMES) {
      for (const view of VIEWS) {
        const { context, page } = await newPage(browser, vp, theme);
        const row = { view: view.id, vp: vp.name, theme };
        try {
          await load(page, view.query);
          await view.run(page);
          if (view.dialog) await page.waitForSelector('dialog[open]', { timeout: 4000 });
          await page.waitForTimeout(300);
          row.f = await measurePage(page);
          row.file = `${slug(view.id)}_${vp.name}_${theme}.png`;
          await page.screenshot({ path: join(CAPS_DIR, row.file), fullPage: !view.dialog });
          const focus = await measureFocus(page);
          row.f.focus = focus.problems;
          row.f.focusCount = focus.count;
          if (row.f.theme !== theme) row.error = `data-theme="${row.f.theme}", esperado "${theme}"`;
          if (view.id === 'hoy') bodyBgByTheme[theme] = row.f.bodyBg;
        } catch (err) {
          row.error = err.message.split('\n')[0];
        }
        results.push(row);
        await context.close();
      }
    }
    const same = bodyBgByTheme.light === bodyBgByTheme.dark;
    checks.push({
      name: `Fondo del body distinto en claro y oscuro (${vp.name} px)`,
      ok: !!bodyBgByTheme.light && !same,
      detail: `claro ${bodyBgByTheme.light} · oscuro ${bodyBgByTheme.dark}`,
    });
  }

  // "Automático" sigue al sistema
  for (const scheme of ['light', 'dark']) {
    const { context, page } = await newPage(browser, VIEWPORTS[1], 'auto', scheme);
    await load(page);
    const got = await page.evaluate(() => document.documentElement.dataset.theme);
    checks.push({ name: `Automático con sistema en ${scheme === 'light' ? 'claro' : 'oscuro'}`, ok: got === scheme, detail: `data-theme="${got}"` });
    await context.close();
  }

  await browser.close();

  // ── informe ──────────────────────────────────────────────────────────────
  const ok = results.filter(r => r.f && !r.error);
  const sum = key => ok.reduce((a, r) => a + (key === 'overflow' ? (r.f.overflow ? 1 : 0) : r.f[key].length), 0);
  const totals = {
    smallText: sum('smallText'), low45: sum('low45'), lowPrimary: sum('lowPrimary'),
    lowNonText: sum('lowNonText'), focus: sum('focus'),
    smallControls: sum('smallControls'), unlabeled: sum('unlabeled'), overflow: sum('overflow'),
    errors: results.filter(r => r.error).length, checksFailed: checks.filter(c => !c.ok).length,
  };

  const header = '| Vista | Ancho | Tema | Texto <16px | Contraste <4,5:1 | Principal <7:1 | Bordes/íconos <3:1 | Foco no visible | Controles <48px | Sin etiqueta | Desborde | Captura |';
  const sep = '|---|---|---|---|---|---|---|---|---|---|---|---|';
  const lines = [
    '# Medición de accesibilidad visual', '',
    `Fecha: ${new Date().toLocaleString('es-AR')} · Servidor: ${BASE_URL} (modo demo)`, '',
    'Contraste calculado contra el fondo visible (capas semitransparentes, degradados y opacidad incluidos). ',
    '"Principal" = texto con el color de texto principal del tema, exigido a 7:1; todo el resto a 4,5:1. ',
    '"Bordes/íconos" = contorno de cada control con borde o fondo propio, y cada ícono SVG, a 3:1 contra el fondo de alrededor. ',
    '"Foco no visible" = elementos alcanzados con Tab cuyo contorno de foco mide menos de 3 px, contrasta menos de 3:1 o queda recortado. ',
    `"Texto <16px": mínimo de ${MIN_TEXT_PX} px para todo el texto, salvo las etiquetas de la barra de navegación inferior, que se aceptan desde ${BOTTOM_NAV_MIN_TEXT_PX} px.`, '',
    '## Verificación de temas', '',
    '| Verificación | Resultado | Detalle |', '|---|---|---|',
    ...checks.map(c => `| ${c.name} | ${c.ok ? 'OK' : 'FALLA'} | ${c.detail} |`),
    '', '## Resultados por vista', '', header, sep,
  ];
  const tableRows = [];
  for (const r of results) {
    const theme = r.theme === 'light' ? 'claro' : 'oscuro';
    if (r.error) {
      tableRows.push(`| ${r.view} | ${r.vp} | ${theme} | ERROR | | | | | | | | ${r.error} |`);
      continue;
    }
    const f = r.f;
    tableRows.push(`| ${r.view} | ${r.vp} | ${theme} | ${f.smallText.length} | ${f.low45.length} | ${f.lowPrimary.length} | ${f.lowNonText.length} | ${f.focus.length} | ${f.smallControls.length} | ${f.unlabeled.length} | ${f.overflow ? 'SÍ' : 'no'} | [ver](capturas/${r.file}) |`);
  }
  const focusTotal = ok.reduce((a, r) => a + (r.f.focusCount || 0), 0);
  lines.push(...tableRows, '', '## Totales', '',
    `- Textos < 16px: **${totals.smallText}**`,
    `- Contraste < 4,5:1: **${totals.low45}**`,
    `- Texto principal < 7:1: **${totals.lowPrimary}**`,
    `- Bordes de controles e íconos < 3:1: **${totals.lowNonText}**`,
    `- Foco con teclado no visible: **${totals.focus}** (de ${focusTotal} elementos recorridos con Tab)`,
    `- Controles < 48px: **${totals.smallControls}**`,
    `- Campos sin etiqueta: **${totals.unlabeled}**`,
    `- Vistas con desborde horizontal: **${totals.overflow}**`,
    `- Vistas que no se pudieron abrir: **${totals.errors}**`,
    `- Verificaciones de tema fallidas: **${totals.checksFailed}**`);

  const detail = (title, key, fmt, cols) => {
    const map = new Map();
    for (const r of ok) for (const x of r.f[key]) {
      const k = fmt(x);
      if (!map.has(k)) map.set(k, new Set());
      map.get(k).add(`${r.view}/${r.vp}/${r.theme === 'light' ? 'claro' : 'oscuro'}`);
    }
    if (!map.size) return;
    lines.push('', `## ${title}`, '', `| ${cols} | Dónde |`, `|${'---|'.repeat(cols.split('|').length + 1)}`);
    let n = 0;
    for (const [k, where] of map) {
      if (n++ >= 60) break;
      lines.push(`| ${k} | ${[...where].slice(0, 4).join(', ')}${where.size > 4 ? ` (+${where.size - 4})` : ''} |`);
    }
  };
  const esc = s => String(s).replace(/\|/g, '/');
  detail('Contraste < 4,5:1', 'low45', x => `${x.cr}:1 | ${esc(x.text)} | ${x.fg} sobre ${x.bg}`, 'CR | Texto | Colores');
  detail('Texto principal < 7:1', 'lowPrimary', x => `${x.cr}:1 | ${esc(x.text)} | ${x.fg} sobre ${x.bg}`, 'CR | Texto | Colores');
  detail('Bordes de controles e íconos < 3:1', 'lowNonText', x => `${x.cr}:1 | ${x.kind} | ${esc(x.text)}`, 'CR | Tipo | Elemento');
  detail('Foco con teclado no visible', 'focus', x => `${x.tag} | ${esc(x.text)} | ${x.why}`, 'Tag | Elemento | Problema');
  detail('Textos < 16px', 'smallText', x => `${x.fsPx}px | ${esc(x.text)}`, 'Tamaño | Texto');
  detail('Controles < 48px', 'smallControls', x => `${x.tag} | ${esc(x.text)} | ${x.w}×${x.h}`, 'Tag | Texto | Tamaño');
  detail('Campos sin etiqueta', 'unlabeled', x => `${x.tag} | ${x.type} | ${esc(x.placeholder)} | ${x.id}`, 'Tag | Tipo | Placeholder | id');

  writeFileSync(REPORT, lines.join('\n') + '\n', 'utf8');

  console.log('\n' + header);
  console.log(sep);
  for (const l of tableRows) console.log(l);
  console.log('\nVerificación de temas:');
  for (const c of checks) console.log(`  ${c.ok ? 'OK   ' : 'FALLA'} ${c.name} — ${c.detail}`);
  console.log(`\nTotales: texto<16px ${totals.smallText} | contraste<4,5 ${totals.low45} | principal<7 ${totals.lowPrimary} | bordes/íconos<3 ${totals.lowNonText} | foco ${totals.focus} | controles<48px ${totals.smallControls} | sin etiqueta ${totals.unlabeled} | desborde ${totals.overflow} | vistas con error ${totals.errors} | temas fallidos ${totals.checksFailed}`);
  console.log(`Informe: ${REPORT} · Capturas: ${CAPS_DIR}/ (${results.filter(r => r.file).length})`);

  const allZero = Object.values(totals).every(v => v === 0);
  process.exit(allZero ? 0 : 1);
}

run().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
