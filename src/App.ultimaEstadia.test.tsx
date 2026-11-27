// @vitest-environment jsdom
// Nueva estadía: muestra lo que se cobró la última vez (registro archivado más reciente del perro) sin cambiar la tarifa sola.
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
beforeEach(() => { localStorage.clear(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const tarjeta = () => document.querySelector<HTMLElement>('[data-testid="ultima-estadia"]');
const tarifa = () => (document.getElementById('form-daily-rate') as HTMLInputElement).value;

async function abrirFormulario(privacidad = false) {
  if (privacidad) localStorage.setItem('pensionados_privacy_mode', '1');
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
const sinEspacios = (t: string) => t.replace(/\s+/g, ' ').trim();

describe('Nueva estadía: último precio', () => {
  it('perro con varias estadías: muestra sólo el precio por día de la más reciente (sin fechas ni total)', async () => {
    await abrirFormulario();
    await escribirPerro('Candela');
    const t = sinEspacios(tarjeta()!.textContent!);
    // Datos demo: Candela tiene 10/3→17/3 ($21.000/d) y 14/7→21/7 ($25.000/d, total $200.000)
    expect(t).toMatch(/^Último precio: \$\s?25\.000 por día/);
    expect(t).not.toMatch(/21\.000|200\.000|total|14\/7|→/);
  });

  it('perro sin historial: "Sin estadías anteriores" y sin botón', async () => {
    await abrirFormulario();
    await escribirPerro('Pochito');
    expect(sinEspacios(tarjeta()!.textContent!)).toBe('Sin estadías anteriores');
    expect(document.querySelector('[data-testid="usar-tarifa"]')).toBeNull();
  });

  it('nombres con distinta escritura cuentan como el mismo perro', async () => {
    await abrirFormulario();
    for (const escrito of ['candela', '  CÁNDELA ', 'Candéla']) {
      await escribirPerro(escrito);
      expect(sinEspacios(tarjeta()!.textContent!), escrito).toMatch(/Último precio: \$\s?25\.000 por día/);
    }
  });

  it('no cambia la tarifa sola; "Usar esta tarifa" la copia sólo al tocarlo', async () => {
    await abrirFormulario();
    const antes = tarifa();
    await escribirPerro('Bóxer');
    expect(tarifa()).toBe(antes);
    await act(async () => document.querySelector<HTMLElement>('[data-testid="usar-tarifa"]')!.click());
    // Bóxer: última estadía 5/9 → 12/9 a $27.000 por día
    expect(tarifa()).toBe('27000');
  });

  it('se anuncia a los lectores de pantalla y no muestra datos personales con el modo privacidad', async () => {
    await abrirFormulario(true);
    await escribirPerro('Luna');
    const t = tarjeta()!;
    expect(t.getAttribute('role')).toBe('status');
    expect(t.getAttribute('aria-live')).toBe('polite');
    expect(sinEspacios(t.textContent!)).toMatch(/Último precio: \$\s?24\.000 por día/);
    expect(t.textContent).not.toMatch(/Dueño|555-|Calle/);
  });

  it('sin nombre de perro no muestra nada', async () => {
    await abrirFormulario();
    expect(tarjeta()).toBeNull();
  });
});
