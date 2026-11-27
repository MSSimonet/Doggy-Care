// @vitest-environment jsdom
// Ajustes > Tildes de deducciones en la nube (modo demo: la nube es simulada, nunca la base real).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const texto = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const esperar = (ms = 0) => act(() => new Promise(r => setTimeout(r, ms)));

async function irAAjustes() {
  await act(async () => root.render(<PrivacyProvider><App /></PrivacyProvider>));
  await esperar();
  await act(async () => q('nav [data-testid="tab-ajustes"]')!.click());
}

describe('Ajustes > Tildes de deducciones en la nube', () => {
  it('Revisar muestra cuántas transferidas hay en la nube, cuántos tildes hay en el teléfono y cuántos se subirían', async () => {
    localStorage.setItem('pensionados_marcas_deduccion', JSON.stringify({
      'hist-demo-6': { dzTransferred: true, dzTransferredAmount: 21600, dzTransferredAt: '2026-11-26T10:00:00.000Z' },
      'hist-demo-8': { dzTransferred: true, dzTransferredAmount: 31680, dzTransferredAt: '2026-11-26T10:00:00.000Z' }
    }));
    await irAAjustes();
    expect(q('[data-testid="resumen-subida"]')).toBeNull(); // no lee nada hasta que se toca Revisar
    await act(async () => q('[data-testid="revisar-tildes"]')!.click());
    await esperar();
    expect(texto(q('[data-testid="en-la-nube"]'))).toBe('0 transferidas');
    expect(texto(q('[data-testid="resumen-subida"]'))).toContain('En este teléfono: 2 tildes');
    expect(texto(q('[data-testid="por-subir"]'))).toBe('2');
    expect(q('[data-testid="subir-tildes"]')!.textContent).toBe('Subir 2');
  });

  it('subir pide confirmación; cancelar no sube nada', async () => {
    localStorage.setItem('pensionados_marcas_deduccion', JSON.stringify({ 'hist-demo-6': { dzTransferred: true, dzTransferredAmount: 21600 } }));
    await irAAjustes();
    await act(async () => q('[data-testid="revisar-tildes"]')!.click());
    await esperar();
    await act(async () => q('[data-testid="subir-tildes"]')!.click());
    expect(texto(q('[data-testid="confirm-dialog"]'))).toContain('1 tilde');
    await act(async () => q('[data-testid="confirm-dialog-cancel"]')!.click());
    expect(JSON.parse(localStorage.getItem('pensionados_cambios_pendientes') ?? '{"ops":[]}').ops).toEqual([]);
    expect(localStorage.getItem('pensionados_marcas_deduccion')).not.toBeNull();
  });

  it('en el demo la nube simulada no confirma: no se borra la copia local y se avisa que faltan', async () => {
    localStorage.setItem('pensionados_marcas_deduccion', JSON.stringify({ 'hist-demo-6': { dzTransferred: true, dzTransferredAmount: 21600 } }));
    await irAAjustes();
    await act(async () => q('[data-testid="revisar-tildes"]')!.click());
    await esperar();
    await act(async () => q('[data-testid="subir-tildes"]')!.click());
    await act(async () => q('[data-testid="confirmar-subir-tildes"]')!.click());
    await esperar(300);
    expect(texto(q('[data-testid="resultado-subida"]'))).toContain('No se pudieron confirmar 1');
    expect(localStorage.getItem('pensionados_marcas_deduccion')).not.toBeNull();
  });
});
