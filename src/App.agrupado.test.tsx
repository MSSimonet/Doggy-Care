// @vitest-environment jsdom
// Un mismo perro escrito de distintas maneras aparece como UNA sola entrada en la solapa Historial (ex Directorio),
// con la escritura más reciente. Se prueba la app real en modo demo con registros de ejemplo agregados.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({}),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {}
  })
}));

// Los registros de ejemplo, más tres de "Candela" escritos distinto
vi.mock('./data/historialData', async importOriginal => {
  const original = await importOriginal<typeof import('./data/historialData')>();
  const base = original.HISTORICAL_STAYS.find(r => r.dogName === 'Candela')!;
  const variante = (id: string, dogName: string, rowIndex: number, untilDay: string) => ({
    ...base,
    id,
    dogName,
    rawDogName: dogName,
    rowIndex,
    fromDay: untilDay,
    untilDay
  });
  return {
    ...original,
    HISTORICAL_STAYS: [
      ...original.HISTORICAL_STAYS,
      variante('hist-x1', 'candela ', 60, '2025-10-01'),
      variante('hist-x2', 'CÁNDELA', 70, '2025-11-01'),
      // el más reciente: se muestra esta escritura, sin el espacio de más
      variante('hist-x3', ' Cándela  ', 80, '2025-12-01')
    ]
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
  dialog.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
  Element.prototype.scrollIntoView = () => {};
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia;

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
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const q = (sel: string) => container.querySelector<HTMLElement>(sel);
const nombres = () => [...container.querySelectorAll<HTMLElement>('[data-testid="agenda-entry-toggle"]')].map(b => b.textContent!.trim());

async function abrirHistorial() {
  await act(async () => root.render(<PrivacyProvider><App /></PrivacyProvider>));
  act(() => q('[data-testid="tab-perros"]')!.click());
}

describe('Historial (ex Directorio): un perro escrito distinto es una sola entrada', () => {
  it('Candela, candela, CÁNDELA y " Cándela " son una sola entrada', async () => {
    await abrirHistorial();
    const candelas = nombres().filter(n => n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') === 'candela');
    expect(candelas).toHaveLength(1);
  });

  it('muestra la escritura del registro más reciente, sin espacios sobrantes', async () => {
    await abrirHistorial();
    expect(nombres()).toContain('Cándela');
    expect(nombres()).not.toContain('Candela');
    expect(nombres().some(n => n !== n.trim() || /\s{2,}/.test(n))).toBe(false);
  });

  it('el desplegado junta las visitas de todas las escrituras', async () => {
    await abrirHistorial();
    const fila = [...container.querySelectorAll<HTMLElement>('[data-testid="agenda-entry-toggle"]')].find(b => b.textContent!.trim() === 'Cándela')!;
    act(() => fila.click());
    const region = document.getElementById(fila.getAttribute('aria-controls')!)!;
    // 2 del ejemplo + 3 agregadas
    expect(region.textContent).toMatch(/5 visitas/);
  });
});
