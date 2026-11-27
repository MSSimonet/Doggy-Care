// @vitest-environment jsdom
// Historial (antes Agenda/Directorio) plegable: se prueba la app real en modo demo (datos ficticios, sin base de datos).
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

let App: typeof import('./App').default;
let PrivacyProvider: typeof import('./components/PrivacyProvider').PrivacyProvider;

beforeAll(async () => {
  vi.stubEnv('VITE_DEMO', '1');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://prueba.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'clave-de-prueba');
  vi.resetModules();

  // jsdom no trae estas piezas del navegador
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
const qa = (sel: string) => [...container.querySelectorAll<HTMLElement>(sel)];
const toggles = () => qa('[data-testid="agenda-entry-toggle"]');
const nombres = () => toggles().map(b => b.textContent!.trim());
const estados = () => toggles().map(b => b.getAttribute('aria-expanded'));
const entrada = (nombre: string) => toggles().find(b => b.textContent!.trim() === nombre)!;

async function abrirAgenda() {
  await act(async () => root.render(<PrivacyProvider><App /></PrivacyProvider>));
  act(() => q('[data-testid="tab-perros"]')!.click());
}

describe('Historial plegable', () => {
  it('arranca plegada: sólo los nombres, sin ficha a la vista', async () => {
    await abrirAgenda();
    expect(toggles().length).toBeGreaterThan(3);
    expect(estados().every(e => e === 'false')).toBe(true);
    expect(qa('[data-testid="editar-ficha"]')).toHaveLength(0);
    expect(container.textContent).not.toContain('Ana García');
    expect(container.textContent).not.toContain('555-0101');
  });

  it('cada fila es un botón de 48 px mínimo, con aria-controls hacia una región con nombre', async () => {
    await abrirAgenda();
    const boton = entrada('Tony');
    expect(boton.tagName).toBe('BUTTON'); // Enter y Espacio los maneja el navegador
    expect(boton.getAttribute('type')).toBe('button');
    expect(boton.className).toContain('min-h-12');
    const region = document.getElementById(boton.getAttribute('aria-controls')!)!;
    expect(region.getAttribute('role')).toBe('region');
    expect(region.getAttribute('aria-labelledby')).toBe(boton.id);
    expect(region.hasAttribute('hidden')).toBe(true);
  });

  it('tocar abre y volver a tocar cierra', async () => {
    await abrirAgenda();
    const boton = entrada('Tony');
    act(() => boton.click());
    expect(boton.getAttribute('aria-expanded')).toBe('true');
    const region = document.getElementById(boton.getAttribute('aria-controls')!)!;
    expect(region.hasAttribute('hidden')).toBe(false);
    expect(region.textContent).toContain('Laura Díaz');
    act(() => boton.click());
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    expect(region.hasAttribute('hidden')).toBe(true);
  });

  it('abrir una entrada cierra la anterior', async () => {
    await abrirAgenda();
    act(() => entrada('Tony').click());
    expect(estados().filter(e => e === 'true')).toHaveLength(1);
    act(() => entrada('Candela').click());
    expect(entrada('Tony').getAttribute('aria-expanded')).toBe('false');
    expect(entrada('Candela').getAttribute('aria-expanded')).toBe('true');
    expect(estados().filter(e => e === 'true')).toHaveLength(1);
  });

  it('sólo perros con estadías finalizadas, del más reciente al más antiguo', async () => {
    await abrirAgenda();
    // Registros demo: Rocky (fila 12), Nina (11), Tony (10), Bóxer (8), Candela (7) y Luna (6)
    expect(nombres()).toEqual(['Rocky', 'Nina', 'Tony', 'Bóxer', 'Candela', 'Luna']);
  });

  it('perros que sólo están en la Agenda (en curso o con una reserva futura) no aparecen', async () => {
    await abrirAgenda();
    // Firulais, Coco y Max sólo tienen estadía en la Agenda; Bruno, una reserva para diciembre
    for (const perro of ['Firulais', 'Coco', 'Max', 'Bruno']) expect(nombres()).not.toContain(perro);
  });

  it('un perro con historial y estadía en la Agenda se ve sólo con su pasado y sin acciones de archivar', async () => {
    await abrirAgenda();
    act(() => entrada('Tony').click());
    const region = document.getElementById(entrada('Tony').getAttribute('aria-controls')!)!;
    const etiquetas = [...region.querySelectorAll('button')].map(b => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim());
    expect(etiquetas).toEqual(expect.arrayContaining(['Editar ficha de Tony', 'Nueva Estadía', 'Editar Ficha']));
    // Nada de la estadía en curso (10/11 → 14/11) ni acciones sobre ella
    for (const prohibida of ['Historial', 'Estadía', 'Eliminar estadía', 'Finalizar']) expect(etiquetas).not.toContain(prohibida);
    expect(region.textContent).not.toMatch(/2026-11-10|2026-11-14|días? activos?|Falta cobrar|Precio Asignado/);
    expect(region.textContent).toContain('1 visita');
    expect(region.querySelector('[data-testid="whatsapp"]')).not.toBeNull();
  });

  it('el desplegado conserva los botones de un perro sin estadía activa', async () => {
    await abrirAgenda();
    act(() => entrada('Candela').click());
    const region = document.getElementById(entrada('Candela').getAttribute('aria-controls')!)!;
    const etiquetas = [...region.querySelectorAll('button')].map(b => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim());
    expect(etiquetas).toEqual(expect.arrayContaining(['Nueva Estadía', 'Editar Ficha']));
  });

  it('con el modo privacidad activo el desplegado sigue enmascarado', async () => {
    localStorage.setItem('pensionados_privacy_mode', '1');
    await abrirAgenda();
    act(() => entrada('Tony').click());
    const region = document.getElementById(entrada('Tony').getAttribute('aria-controls')!)!;
    expect(region.textContent).toContain('Dueño/a oculto/a');
    expect(region.textContent).toContain('•••• ••••••');
    expect(region.textContent).not.toContain('Laura Díaz');
    expect(region.textContent).not.toMatch(/555-\d{4}/);
    expect(region.innerHTML).not.toContain('wa.me');
    expect(region.querySelector('a[href]')).toBeNull();
  });

  it('el nombre de la fila plegada es el mismo con o sin modo privacidad', async () => {
    await abrirAgenda();
    const sinPrivacidad = nombres();
    act(() => root.unmount());
    root = createRoot(container);
    localStorage.setItem('pensionados_privacy_mode', '1');
    await abrirAgenda();
    expect(nombres()).toEqual(sinPrivacidad);
  });

  it('una búsqueda con una sola coincidencia la muestra plegada', async () => {
    await abrirAgenda();
    const buscador = q('input[type="text"], input:not([type])')!;
    const setValor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setValor.call(buscador, 'Tony');
      buscador.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(nombres()).toEqual(['Tony']);
    expect(estados()).toEqual(['false']);
  });

  it('cambiar la búsqueda pliega la entrada que estaba abierta', async () => {
    await abrirAgenda();
    act(() => entrada('Tony').click());
    expect(entrada('Tony').getAttribute('aria-expanded')).toBe('true');
    const buscador = q('input[type="text"], input:not([type])')!;
    const setValor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setValor.call(buscador, 'Ton');
      buscador.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(estados()).toEqual(['false']);
  });
});
