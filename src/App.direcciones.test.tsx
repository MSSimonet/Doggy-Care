// @vitest-environment jsdom
// Editar la dirección de un cliente desde la Agenda y la solapa Historial (modo demo, nube simulada).
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
const NUEVA = 'Av. Siempreviva 742';

async function abrir(privacidad = false) {
  if (privacidad) localStorage.setItem('pensionados_privacy_mode', '1');
  await act(async () => root.render(<PrivacyProvider><App /></PrivacyProvider>));
  await esperar();
}
/** Cuerpo de la tarjeta de la Agenda de un perro */
const tarjeta = (perro: string) => {
  const cab = qa('button[aria-controls^="hoy-card-body-"]').find(b => b.textContent!.includes(perro))!;
  return document.getElementById(cab.getAttribute('aria-controls')!)!;
};
describe('La dirección se agrega, edita o borra desde el botón Editar', () => {
  const botonEditar = (perro: string) => [...tarjeta(perro).querySelectorAll<HTMLElement>('button')].find(b => b.textContent!.trim() === 'Editar')!;
  const campoEstadia = () => q('[data-testid="sm-direccion"]') as HTMLInputElement;
  async function escribirEnEstadia(texto: string) {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { set.call(campoEstadia(), texto); campoEstadia().dispatchEvent(new Event('input', { bubbles: true })); });
  }
  const guardarEstadia = async () => {
    await act(async () => q('form button[type="submit"]')!.click());
    await esperar(50);
  };

  it('al editar la estadía se ve la dirección de la ficha y, si se cambia, se actualiza ficha, notas y Waze', async () => {
    await abrir();
    await act(async () => botonEditar('Luna').click());
    expect(campoEstadia().value).toBe('Calle Ficticia 301');
    await escribirEnEstadia(NUEVA);
    await guardarEstadia();
    expect(q('a[data-testid^="waze-ir-hoy-"]', tarjeta('Luna'))!.getAttribute('href')).toContain(encodeURIComponent(NUEVA));
    const tablas = nube.recibidas.map(o => o.tabla);
    expect(tablas).toContain('stays');
    const ficha = nube.recibidas.find(o => o.tabla === 'clients_directory')!;
    expect((ficha.datos as { address: string }).address).toBe(NUEVA);
  });

  it('si no se toca la dirección, la ficha no se vuelve a guardar', async () => {
    await abrir();
    await act(async () => botonEditar('Luna').click());
    await guardarEstadia();
    expect(nube.recibidas.map(o => o.tabla)).toEqual(['stays']);
  });

  it('se puede dejar sin dirección una estadía nueva sin que se borre la de la ficha', async () => {
    await abrir();
    await act(async () => q('nav button[aria-label="Nueva estadía"]')!.click());
    const nombre = q('#sm-dog-name') as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { set.call(nombre, 'Candela'); nombre.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(campoEstadia().value).toBe('Calle Ficticia 101');
    await guardarEstadia();
    expect(nube.recibidas.some(o => o.tabla === 'clients_directory')).toBe(false);
  });

  it('sin conexión: la dirección cambiada en el formulario queda pendiente y se sube al volver', async () => {
    await abrir();
    enLinea = false;
    nube.red = true;
    act(() => { window.dispatchEvent(new Event('offline')); });
    await act(async () => botonEditar('Luna').click());
    await escribirEnEstadia(NUEVA);
    await guardarEstadia();
    expect(nube.recibidas).toEqual([]);
    enLinea = true;
    nube.red = false;
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await esperar(50);
    expect(nube.recibidas.map(o => o.tabla)).toEqual(expect.arrayContaining(['stays', 'clients_directory']));
  });

  it('con el modo privacidad el formulario muestra el valor real (como los demás) pero la pantalla no', async () => {
    await abrir(true);
    await act(async () => botonEditar('Luna').click());
    expect(campoEstadia().value).toBe('Calle Ficticia 301');
    await guardarEstadia();
    expect(document.body.textContent).not.toContain('Calle Ficticia 301');
  });

  it('no hay botones de dirección aparte: ni en la Agenda ni en el Historial', async () => {
    await abrir();
    expect(q('[data-testid="editar-direccion"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Editar dirección|Agregar dirección/);
    await act(async () => q('[data-testid="tab-perros"]')!.click());
    expect(document.body.textContent).not.toMatch(/Editar dirección|Agregar dirección/);
  });

  it('un perro sin dirección (Firulais): se agrega desde Editar y se crea su ficha', async () => {
    await abrir();
    await act(async () => botonEditar('Firulais').click());
    expect(campoEstadia().value).toBe('');
    await escribirEnEstadia('Calle Nueva 55');
    await guardarEstadia();
    expect(q('a[data-testid^="waze-ir-hoy-"]', tarjeta('Firulais'))!.getAttribute('href')).toContain(encodeURIComponent('Calle Nueva 55'));
    expect(nube.recibidas.find(o => o.tabla === 'clients_directory')).toMatchObject({ datos: expect.objectContaining({ dogName: 'Firulais', address: 'Calle Nueva 55' }) });
  });

  it('se borra dejando el campo vacío: desaparece de la ficha, de las notas y de Waze', async () => {
    await abrir();
    await act(async () => botonEditar('Luna').click());
    await escribirEnEstadia('');
    await guardarEstadia();
    expect(q('a[data-testid^="waze-ir-hoy-"]', tarjeta('Luna'))).toBeNull();
    const ficha = nube.recibidas.find(o => o.tabla === 'clients_directory')!;
    expect((ficha.datos as { address?: string }).address).toBeUndefined();
  });

  it('desde Editar Ficha (Historial) cambiar o borrar la dirección también actualiza las estadías', async () => {
    await abrir();
    await act(async () => q('[data-testid="tab-perros"]')!.click());
    const entrada = qa('[data-testid="agenda-entry"]').find(e => e.querySelector('[data-testid="agenda-entry-toggle"]')!.textContent!.trim() === 'Tony')!;
    await act(async () => q('[data-testid="agenda-entry-toggle"]', entrada)!.click());
    await act(async () => [...entrada.querySelectorAll<HTMLElement>('button')].find(b => b.textContent!.trim() === 'Editar Ficha')!.click());
    const campo = document.getElementById('ec-address') as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { set.call(campo, NUEVA); campo.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => campo.form!.requestSubmit());
    await esperar(50);
    expect(nube.recibidas.some(o => o.tabla === 'clients_directory' && (o.datos as { address: string }).address === NUEVA)).toBe(true);
  });

  it('la lista de la Agenda muestra el IR junto al nombre sin desplegar, y abre Waze con la dirección como destino', async () => {
    await abrir();
    const fila = (perro: string) => qa('[data-testid^="waze-ir-fila-"]').find(a => a.getAttribute('aria-label')!.includes(`Waze a ${perro}:`)) as HTMLAnchorElement | undefined;
    const luna = fila('Luna')!;
    // visible sin abrir la tarjeta, justo después del botón con el nombre
    expect(luna.previousElementSibling!.textContent).toContain('Luna');
    expect(luna.closest('button')).toBeNull();
    // Waze con destino y ruta automática
    const url = new URL(luna.href);
    expect(url.origin + url.pathname).toBe('https://waze.com/ul');
    expect(url.searchParams.get('q')).toBe('Calle Ficticia 301, Argentina');
    expect(url.searchParams.get('navigate')).toBe('yes');
    expect(luna.target).toBe('_blank');
    // un perro sin dirección no muestra IR
    expect(fila('Firulais')).toBeUndefined();
  });

  it('el IR de la fila sigue a la dirección que se edita en Editar', async () => {
    await abrir();
    await act(async () => botonEditar('Luna').click());
    await escribirEnEstadia(NUEVA);
    await guardarEstadia();
    const ir = qa('[data-testid^="waze-ir-fila-"]').find(a => a.getAttribute('aria-label')!.includes('Waze a Luna:')) as HTMLAnchorElement;
    expect(new URL(ir.href).searchParams.get('q')).toBe(`${NUEVA}, Argentina`);
  });

  it('con el modo privacidad no hay IR en la fila ni en el formulario', async () => {
    await abrir(true);
    expect(qa('[data-testid^="waze-ir-fila-"]')).toHaveLength(0);
    await act(async () => botonEditar('Luna').click());
    expect(q('[data-testid="sm-waze-ir"]')).toBeNull();
  });
});
