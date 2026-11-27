// @vitest-environment jsdom
// Borrado real desde la solapa Historial, con copia local y restauración desde Ajustes (modo demo, nube simulada).
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
const copias = () => JSON.parse(localStorage.getItem('pensionados_borrados_recientes') ?? '[]') as { registro: { id: string; dogName: string }; borradoEn: string }[];

async function abrirHistorial() {
  await act(async () => root.render(<PrivacyProvider><App /></PrivacyProvider>));
  await esperar();
  await act(async () => q('nav [data-testid="tab-perros"]')!.click());
}
const entrada = (perro: string) => qa('[data-testid="agenda-entry"]').find(e => texto(q('[data-testid="agenda-entry-toggle"]', e)) === perro)!;
async function abrirPerro(perro: string) {
  await act(async () => q('[data-testid="agenda-entry-toggle"]', entrada(perro))!.click());
  return entrada(perro);
}
const aAjustes = () => act(async () => q('nav [data-testid="tab-ajustes"]')!.click());

describe('Borrado real desde Historial', () => {
  it('cada estadía pasada tiene su botón Borrar; el diálogo nombra perro y fechas', async () => {
    await abrirHistorial();
    const candela = await abrirPerro('Candela');
    const botones = qa('[data-testid="borrar-estadia-pasada"]').filter(b => candela.contains(b));
    expect(botones).toHaveLength(2); // Candela tiene dos estadías finalizadas
    await act(async () => botones[0].click());
    const dialogo = texto(q('[data-testid="dialog-borrar"]'));
    expect(dialogo).toContain('Candela');
    expect(dialogo).toMatch(/\d{4}-\d{2}-\d{2} al \d{4}-\d{2}-\d{2}/);
    expect(dialogo).toContain('Borrados recientes');
    await act(async () => q('[data-testid="confirm-dialog-cancel"]')!.click());
    expect(copias()).toEqual([]); // cancelar no guarda ni borra nada
    expect(nube.recibidas).toEqual([]);
  });

  it('antes de borrar guarda una copia en el dispositivo y el aviso permite deshacer (y la copia se quita)', async () => {
    await abrirHistorial();
    const candela = await abrirPerro('Candela');
    await act(async () => qa('[data-testid="borrar-estadia-pasada"]').filter(b => candela.contains(b))[0].click());
    await act(async () => q('[data-testid="confirm-borrar"]')!.click());
    expect(copias()).toHaveLength(1);
    expect(copias()[0].registro.dogName).toBe('Candela');
    expect(q('[data-testid="undo-delete-toast"]')).not.toBeNull();
    await act(async () => q('[data-testid="undo-delete"]')!.click());
    expect(copias()).toEqual([]);
    expect(qa('[data-testid="borrar-estadia-pasada"]').filter(b => entrada('Candela').contains(b))).toHaveLength(2);
  });

  it('Ajustes > Borrados recientes lista lo borrado y Restaurar lo devuelve al Historial y a la nube', async () => {
    await abrirHistorial();
    const candela = await abrirPerro('Candela');
    await act(async () => qa('[data-testid="borrar-estadia-pasada"]').filter(b => candela.contains(b))[0].click());
    await act(async () => q('[data-testid="confirm-borrar"]')!.click());
    expect(qa('[data-testid="borrar-estadia-pasada"]').filter(b => entrada('Candela').contains(b))).toHaveLength(1);

    await aAjustes();
    const fila = q('[data-testid="borrado"]')!;
    expect(texto(fila)).toContain('Candela');
    await act(async () => q('[data-testid="restaurar-borrado"]', fila)!.click());
    await esperar(50);
    expect(q('[data-testid="sin-borrados"]')).not.toBeNull();
    expect(copias()).toEqual([]);
    expect(nube.recibidas.some(o => o.tipo === 'upsert' && o.tabla === 'historical_stays')).toBe(true);

    await act(async () => q('nav [data-testid="tab-perros"]')!.click());
    expect(qa('[data-testid="borrar-estadia-pasada"]').filter(b => entrada('Candela').contains(b)).length).toBe(2);
  });

  it('si el dispositivo no puede guardar la copia, no se borra', async () => {
    await abrirHistorial();
    const candela = await abrirPerro('Candela');
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (clave: string, valor: string) {
      if (clave === 'pensionados_borrados_recientes') throw new Error('QuotaExceededError');
      return original.call(this, clave, valor);
    };
    try {
      await act(async () => qa('[data-testid="borrar-estadia-pasada"]').filter(b => candela.contains(b))[0].click());
      await act(async () => q('[data-testid="confirm-borrar"]')!.click());
    } finally {
      Storage.prototype.setItem = original;
    }
    expect(texto(q('[data-testid="toast-error"]'))).toContain('No se borró');
    expect(q('[data-testid="undo-delete-toast"]')).toBeNull();
    expect(qa('[data-testid="borrar-estadia-pasada"]').filter(b => entrada('Candela').contains(b))).toHaveLength(2);
  });
});
