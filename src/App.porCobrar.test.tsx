// @vitest-environment jsdom
// Cobros > Por cobrar: Finalizar manda a Cobros; Cobrado + Deducida pasan solas al Historial (modo demo, nube simulada).
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

const nube = vi.hoisted(() => ({ recibidas: [] as Operacion[] }));
vi.mock('./lib/escrituras', async original => ({
  ...(await original<typeof import('./lib/escrituras')>()),
  crearEjecutorDemo: () => async (op: Operacion): Promise<ResultadoEjecucion> => { nube.recibidas.push(op); return { ok: true }; }
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
beforeEach(() => {
  localStorage.clear();
  nube.recibidas = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const q = (sel: string, base: ParentNode = document) => base.querySelector<HTMLElement>(sel);
const qa = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const texto = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const esperar = (ms = 0) => act(() => new Promise(r => setTimeout(r, ms)));
const ir = (tab: string) => act(async () => q(`nav [data-testid="tab-${tab}"]`)!.click());
const porCobrar = () => qa('[data-testid="nombre-por-cobrar"]').map(b => texto(b));
const fila = (perro: string) => qa('[data-testid="por-cobrar-fila"]').find(f => texto(f.querySelector('[data-testid="nombre-por-cobrar"]')) === perro)!;
const enAgenda = () => qa('button[aria-controls^="hoy-card-body-"]').map(b => b.querySelector('span')!.textContent!.trim());
const enHistorial = () => qa('[data-testid="agenda-entry-toggle"]').map(b => texto(b));

async function abrir() {
  await act(async () => root.render(<PrivacyProvider><App /></PrivacyProvider>));
  await esperar();
}
const cobrado = async (perro: string) => {
  await act(async () => q('[data-testid="casilla-cobrado"]', fila(perro))!.click());
  await act(async () => q('[data-testid="confirmar-cobrado"]')!.click());
  await esperar(100);
};

describe('Cobros > Por cobrar', () => {
  it('una estadía finalizada (Kiara en el demo) no está en la Agenda ni en el Historial: sólo en Cobros', async () => {
    await abrir();
    expect(enAgenda()).not.toContain('Kiara');
    await ir('perros');
    expect(enHistorial()).not.toContain('Kiara');
    await ir('cobros');
    expect(porCobrar()).toEqual(['Kiara']);
  });

  it('cada fila muestra sólo el nombre y las casillas Cobrado y Deducida; el detalle está oculto hasta tocar el nombre', async () => {
    await abrir();
    await ir('cobros');
    const f = fila('Kiara');
    expect([...f.querySelectorAll('button')].map(b => b.getAttribute('data-testid'))).toEqual(['nombre-por-cobrar', 'volver-a-la-agenda']);
    const detalle = document.getElementById(q('[data-testid="nombre-por-cobrar"]', f)!.getAttribute('aria-controls')!)!;
    expect(detalle.hasAttribute('hidden')).toBe(true);
    for (const id of ['casilla-cobrado', 'casilla-deducida']) {
      const c = q(`[data-testid="${id}"]`, f) as HTMLInputElement;
      expect(c.type).toBe('checkbox');
      expect(c.closest('label')!.className).toContain('min-h-11');
    }
  });

  it('Cobrado pide confirmación, queda tildada y la estadía sigue en Cobros hasta que esté deducida', async () => {
    await abrir();
    await ir('cobros');
    await act(async () => q('[data-testid="casilla-cobrado"]', fila('Kiara'))!.click());
    expect(texto(q('[data-testid="confirm-dialog"]'))).toContain('Kiara');
    await act(async () => q('[data-testid="confirm-dialog-cancel"]')!.click());
    expect((q('[data-testid="casilla-cobrado"]', fila('Kiara')) as HTMLInputElement).checked).toBe(false);
    await cobrado('Kiara');
    expect((q('[data-testid="casilla-cobrado"]', fila('Kiara')) as HTMLInputElement).checked).toBe(true);
    expect((q('[data-testid="casilla-cobrado"]', fila('Kiara')) as HTMLInputElement).disabled).toBe(true);
    expect(porCobrar()).toEqual(['Kiara']);
  });

  it('Cobrado + Deducida: pasa sola al Historial y se va de Cobros (y se guarda por la cola)', async () => {
    await abrir();
    await ir('cobros');
    await cobrado('Kiara');
    await act(async () => q('[data-testid="casilla-deducida"]', fila('Kiara'))!.click());
    await esperar(100);
    expect(porCobrar()).toEqual([]);
    expect(q('[data-testid="sin-por-cobrar"]')).not.toBeNull();
    await ir('perros');
    expect(enHistorial()[0]).toBe('Kiara');
    const ops = nube.recibidas.map(o => `${o.tipo} ${o.tabla}`);
    expect(ops).toEqual(['upsert stays', 'upsert historical_stays', 'delete stays']);
    expect(nube.recibidas[1].datos).toMatchObject({ dogName: 'Kiara', dzTransferred: true });
  });

  it('en cualquier orden: primero Deducida (con lo cobrado hasta ahora) y después Cobrado', async () => {
    await abrir();
    await ir('cobros');
    // Kiara tiene una seña de $50.000: ya hay deducción para marcar
    await act(async () => q('[data-testid="casilla-deducida"]', fila('Kiara'))!.click());
    expect(porCobrar()).toEqual(['Kiara']);
    await cobrado('Kiara'); // al cobrar el resto la deducción se actualiza y queda lista
    expect(porCobrar()).toEqual([]);
    await ir('perros');
    expect(enHistorial()[0]).toBe('Kiara');
  });

  it('Volver a la Agenda deja la estadía otra vez en la Agenda', async () => {
    await abrir();
    await ir('cobros');
    const f = fila('Kiara');
    await act(async () => q('[data-testid="nombre-por-cobrar"]', f)!.click());
    await act(async () => q('[data-testid="volver-a-la-agenda"]', f)!.click());
    expect(porCobrar()).toEqual([]);
    await ir('hoy');
    expect(enAgenda()).toContain('Kiara');
  });
});
