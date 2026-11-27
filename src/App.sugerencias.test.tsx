// @vitest-environment jsdom
// Nueva estadía: las sugerencias de perros salen del historial cargado, no de los registros de ejemplo fijos.
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

// "Pirata" sólo existe en el historial del demo (no en la Agenda, el directorio ni los registros de ejemplo)
vi.mock('./data/demoData', async (original) => {
  const o = await original<typeof import('./data/demoData')>();
  const base = o.DEMO_HISTORY[o.DEMO_HISTORY.length - 1];
  return { ...o, DEMO_HISTORY: [...o.DEMO_HISTORY, { ...base, id: 'hist-pirata', rowIndex: 99, dogName: 'Pirata', rawDogName: 'Pirata' }] };
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
beforeEach(() => { localStorage.clear(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function abrirFormulario() {
  await act(async () => root.render(<PrivacyProvider><App /></PrivacyProvider>));
  await act(async () => container.querySelector<HTMLElement>('[data-testid="abrir-nueva-estadia"]')!.click());
}
async function escribirPerro(nombre: string) {
  const campo = document.getElementById('sm-dog-name') as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    set.call(campo, nombre);
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const sugerencias = (nombre: string) => [...document.querySelectorAll<HTMLElement>('button')].filter(b => b.textContent?.includes(nombre));

describe('Nueva estadía: sugerencias de perros', () => {
  it('sugiere un perro que sólo está en el historial cargado', async () => {
    await abrirFormulario();
    await escribirPerro('Pira');
    expect(sugerencias('Pirata').length).toBeGreaterThan(0);
  });
});
