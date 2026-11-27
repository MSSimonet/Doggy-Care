// @vitest-environment jsdom
// Borrar estadías de la Agenda (en curso o futuras): con confirmación, sin registro en el Historial, por la cola.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Operacion, ResultadoEjecucion } from './lib/colaPendientes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@supabase/supabase-js', () => {
  const cadena: unknown = new Proxy(function () {}, {
    get: (_t, prop) => (prop === 'then' ? (res: (v: unknown) => unknown) => res({ data: null, error: null }) : cadena),
    apply: () => cadena
  });
  return {
    createClient: () => ({
      from: () => cadena,
      auth: { getSession: () => Promise.resolve({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => {}
    })
  };
});

const nube = vi.hoisted(() => ({ red: false, recibidas: [] as Operacion[] }));
vi.mock('./lib/escrituras', async original => ({
  ...(await original<typeof import('./lib/escrituras')>()),
  crearEjecutorDemo: () => async (op: Operacion): Promise<ResultadoEjecucion> => {
    if (nube.red) return { ok: false, tipo: 'red', mensaje: 'Failed to fetch' };
    nube.recibidas.push(op);
    return { ok: true };
  }
}));

let App: typeof import('./App').default;
let PrivacyProvider: typeof import('./components/PrivacyProvider').PrivacyProvider;

beforeAll(async () => {
  vi.stubEnv('VITE_DEMO', '1');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://prueba.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'clave-de-prueba');
  vi.resetModules();
  const dialog = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
  dialog.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  dialog.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
  Element.prototype.scrollIntoView = () => {};
  window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  App = (await import('./App')).default;
  PrivacyProvider = (await import('./components/PrivacyProvider')).PrivacyProvider;
});

let container: HTMLDivElement;
let root: Root;
let enLinea = true;
beforeEach(() => {
  localStorage.clear();
  nube.red = false;
  nube.recibidas = [];
  enLinea = true;
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => enLinea });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const q = (sel: string, base: ParentNode = document) => base.querySelector<HTMLElement>(sel);
const qa = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const esperar = (ms = 0) => act(() => new Promise(r => setTimeout(r, ms)));
const enAgenda = () => qa('button[aria-controls^="hoy-card-body-"]').map(b => b.querySelector('span')!.textContent!.trim());
const tarjeta = (perro: string) => {
  const cab = qa('button[aria-controls^="hoy-card-body-"]').find(b => b.textContent!.includes(perro))!;
  return document.getElementById(cab.getAttribute('aria-controls')!)!;
};

async function abrir() {
  await act(async () => root.render(<PrivacyProvider><App /></PrivacyProvider>));
  await esperar();
}
async function borrar(perro: string, confirmar = true) {
  await act(async () => q('[data-testid="borrar-estadia"]', tarjeta(perro))!.click());
  const dialogo = q('[data-testid="confirm-dialog"]')!;
  await act(async () => q(confirmar ? '[data-testid="confirmar-borrar-estadia"]' : '[data-testid="confirm-dialog-cancel"]')!.click());
  await esperar(50);
  return dialogo;
}
async function nombresHistorial() {
  await act(async () => q('[data-testid="tab-perros"]')!.click());
  return qa('[data-testid="agenda-entry-toggle"]').map(b => b.textContent!.trim());
}

describe('Borrar estadías de la Agenda', () => {
  it('borrar y finalizar son botones distintos, con textos que lo dicen', async () => {
    await abrir();
    const t = tarjeta('Firulais');
    expect(q('[data-testid="borrar-estadia"]', t)!.getAttribute('aria-label')).toBe('Borrar la estadía de Firulais sin pasarla al Historial');
    expect(q('[data-testid="finalizar-estadia"]', t)!.getAttribute('aria-label')).toBe('Finalizar la estadía de Firulais y pasarla a Cobros');
  });

  it('borrar una estadía en curso: pide confirmación, se va de la Agenda y no aparece en el Historial', async () => {
    await abrir();
    const dialogo = await borrar('Firulais');
    expect(dialogo.textContent).toContain('No pasa al Historial');
    expect(enAgenda()).not.toContain('Firulais');
    expect(nube.recibidas.map(o => `${o.tipo} ${o.tabla}:${o.clave}`)).toEqual(['delete stays:demo-1']);
    expect(await nombresHistorial()).not.toContain('Firulais');
  });

  it('borrar una reserva futura', async () => {
    await abrir();
    expect(enAgenda()).toContain('Bruno');
    await borrar('Bruno');
    expect(enAgenda()).not.toContain('Bruno');
    expect(nube.recibidas.map(o => o.clave)).toEqual(['demo-6']);
    expect(await nombresHistorial()).not.toContain('Bruno');
  });

  it('cancelar la confirmación no borra nada', async () => {
    await abrir();
    await borrar('Bruno', false);
    expect(enAgenda()).toContain('Bruno');
    expect(nube.recibidas).toEqual([]);
  });

  it('borrar un perro que tiene historial no toca su historial', async () => {
    await abrir();
    const antes = await nombresHistorial();
    await act(async () => q('[data-testid="tab-hoy"]')!.click());
    await borrar('Tony');
    expect(enAgenda()).not.toContain('Tony');
    expect(await nombresHistorial()).toEqual(antes);
  });

  it('sin conexión: se borra en pantalla, queda pendiente y se sube al volver', async () => {
    await abrir();
    enLinea = false;
    nube.red = true;
    act(() => { window.dispatchEvent(new Event('offline')); });
    await borrar('Coco');
    expect(enAgenda()).not.toContain('Coco');
    expect(nube.recibidas).toEqual([]);
    enLinea = true;
    nube.red = false;
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await esperar(50);
    expect(nube.recibidas.map(o => `${o.tipo} ${o.tabla}:${o.clave}`)).toEqual(['delete stays:demo-5']);
  });
});
