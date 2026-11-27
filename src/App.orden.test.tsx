// @vitest-environment jsdom
// Navegación con los nombres nuevos (Agenda = ex Hoy, Historial = ex Agenda/Directorio) y orden "más reciente arriba".
// Se prueba la app real en modo demo (datos ficticios, sin base de datos).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Cliente de Supabase que acepta cualquier llamada encadenada sin hacer nada
vi.mock('@supabase/supabase-js', () => {
  const cadena: unknown = new Proxy(function () {}, {
    get: (_t, prop) => (prop === 'then' ? (res: (v: unknown) => unknown) => res({ data: null, error: null }) : cadena),
    apply: () => cadena
  });
  return {
    createClient: () => ({
      from: () => cadena,
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
      },
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
const nombresHistorial = () => qa('[data-testid="agenda-entry-toggle"]').map(b => b.textContent!.trim());

async function abrirApp() {
  await act(async () => root.render(<PrivacyProvider><App /></PrivacyProvider>));
}
const irA = (tab: 'hoy' | 'perros' | 'cobros' | 'ajustes') => act(() => q(`[data-testid="tab-${tab}"]`)!.click());

describe('nombres de las solapas', () => {
  it('la barra inferior dice Agenda, Historial, Cobros y Ajustes (ya no Hoy)', async () => {
    await abrirApp();
    const barra = q('nav[aria-label="Secciones"]')!;
    const etiquetas = [...barra.querySelectorAll('button')]
      .filter(b => b.getAttribute('data-testid')?.startsWith('tab-'))
      .map(b => b.textContent!.trim());
    expect(etiquetas).toEqual(['Agenda', 'Historial', 'Cobros', 'Ajustes']);
    expect(barra.textContent).not.toContain('Hoy');
  });

  it('la barra lateral y las solapas de tablet usan los mismos nombres', async () => {
    await abrirApp();
    const lateral = qa('aside button').map(b => b.textContent!.trim());
    expect(lateral).toEqual(['Agenda', 'Historial', 'Cobros', 'Ajustes']);
    const solapas = qa('main div.md\\:flex button').map(b => b.textContent!.trim());
    expect(solapas).toEqual(['Agenda', 'Historial', 'Cobros', 'Ajustes']);
  });

  it('cada pantalla tiene su título: Agenda (ex Hoy) e Historial (ex Agenda)', async () => {
    await abrirApp();
    expect(q('[data-testid="titulo-agenda"]')!.textContent).toBe('Agenda');
    expect(q('[data-testid="titulo-historial"]')).toBeNull();
    irA('perros');
    expect(q('[data-testid="titulo-historial"]')!.textContent).toBe('Historial');
    expect(q('[data-testid="titulo-agenda"]')).toBeNull();
  });

  it('la solapa Agenda muestra las estadías en curso y conserva los textos de fecha con "hoy"', async () => {
    await abrirApp();
    expect(q('[data-testid="titulo-agenda"]')).not.toBeNull();
    expect(container.textContent).toContain('Ya debían irse');
    expect(q('[data-testid="tab-hoy"]')!.textContent).toContain('Agenda');
    expect(q('[data-testid="tab-perros"]')!.textContent).toContain('Historial');
  });

  it('la pantalla vieja de registros archivados se llama Registro de estadías (ya no choca con la solapa Historial)', async () => {
    await abrirApp();
    irA('cobros');
    const boton = q('[data-testid="abrir-historial"]')!;
    expect(boton.textContent).toContain('Registro de estadías');
    expect(boton.textContent).not.toContain('Ver Historial');
    await act(async () => boton.click());
    const dialogo = document.querySelector('dialog[open]')!;
    expect(dialogo.querySelector('h2')!.textContent).toContain('Registro de estadías');
    expect(dialogo.querySelector('h2')!.textContent).not.toContain('Historial');
    expect(dialogo.querySelector('button[aria-label="Cerrar registro de estadías"]')).not.toBeNull();
    expect(dialogo.querySelector('input[aria-label="Buscar en el registro"]')).not.toBeNull();
    expect(dialogo.textContent).toContain('Registro Excel');
    expect(dialogo.textContent).toContain('Directorio');
    expect(dialogo.textContent).not.toContain('Historial Excel');
  });
});

describe('orden de la solapa Historial: lo más reciente primero', () => {
  it('con los datos demo: sólo los perros con registro, del de mayor secuencia al de menor', async () => {
    await abrirApp();
    irA('perros');
    // Registros demo: Rocky (fila 12), Nina (11), Tony (10), Bóxer (8), Candela (7), Luna (6); los que sólo están en la Agenda no aparecen
    expect(nombresHistorial()).toEqual(['Rocky', 'Nina', 'Tony', 'Bóxer', 'Candela', 'Luna']);
  });
});

describe('finalizar una estadía desde la Agenda: Agenda → Cobros → Historial', () => {
  async function finalizar(nombre: string) {
    const cabecera = qa('button[aria-controls^="hoy-card-body-"]').find(b => b.textContent!.includes(nombre))!;
    const cuerpo = document.getElementById(cabecera.getAttribute('aria-controls')!)!;
    await act(async () => cuerpo.querySelector<HTMLElement>('[data-testid="finalizar-estadia"]')!.click());
    // Sólo finaliza al confirmar
    await act(async () => q('[data-testid="confirm-dialog-confirm"]')!.click());
  }
  /** En Cobros: tilda "Cobrado" (con su confirmación) y "Deducida": con las dos pasa sola al Historial */
  async function cobrarYDeducir(nombre: string) {
    irA('cobros');
    const fila = () => qa('[data-testid="por-cobrar-fila"]').find(f => f.querySelector('[data-testid="nombre-por-cobrar"]')!.textContent === nombre)!;
    await act(async () => fila().querySelector<HTMLElement>('[data-testid="casilla-cobrado"]')!.click());
    await act(async () => q('[data-testid="confirmar-cobrado"]')!.click());
    await act(async () => fila().querySelector<HTMLElement>('[data-testid="casilla-deducida"]')!.click());
  }

  it('no se finaliza hasta confirmar', async () => {
    await abrirApp();
    const cabecera = qa('button[aria-controls^="hoy-card-body-"]').find(b => b.textContent!.includes('Max'))!;
    const cuerpo = document.getElementById(cabecera.getAttribute('aria-controls')!)!;
    await act(async () => cuerpo.querySelector<HTMLElement>('[data-testid="finalizar-estadia"]')!.click());
    expect(q('[data-testid="confirm-dialog"]')).not.toBeNull();
    await act(async () => q('[data-testid="confirm-dialog-cancel"]')!.click());
    expect(qa('button[aria-controls^="hoy-card-body-"]').some(b => b.textContent!.includes('Max'))).toBe(true);
    irA('perros');
    expect(nombresHistorial()[0]).toBe('Rocky');
  });

  it('al finalizar sale de la Agenda y va sólo a Cobros: todavía no está en el Historial', async () => {
    await abrirApp();
    await finalizar('Max');
    expect(qa('button[aria-controls^="hoy-card-body-"]').some(b => b.textContent!.includes('Max'))).toBe(false);
    irA('perros');
    expect(nombresHistorial()).not.toContain('Max');
    irA('cobros');
    expect(qa('[data-testid="nombre-por-cobrar"]').map(b => b.textContent)).toContain('Max');
  });

  it('cobrada y deducida pasa sola al Historial (en primer lugar) y se va de Cobros', async () => {
    await abrirApp();
    await finalizar('Max');
    await cobrarYDeducir('Max');
    expect(qa('[data-testid="nombre-por-cobrar"]').map(b => b.textContent)).not.toContain('Max');
    irA('perros');
    const nombres = nombresHistorial();
    // Max termina el 30/10: la fecha de fin más vieja de las activas; igual queda primero al pasar al Historial
    expect(nombres[0]).toBe('Max');
    expect(nombres.filter(n => n === 'Max')).toHaveLength(1);
    expect(nombres.slice(1, 4)).toEqual(['Rocky', 'Nina', 'Tony']);
  });

  it('también queda primera en la pantalla vieja de registros archivados (agrupada y en línea de tiempo)', async () => {
    await abrirApp();
    await finalizar('Max');
    await cobrarYDeducir('Max');
    await act(async () => q('[data-testid="abrir-historial"]')!.click());
    const dialogo = document.querySelector('dialog[open]') as HTMLElement;
    const filas = [...dialogo.querySelectorAll<HTMLElement>('[data-testid="expandir-perro"]')];
    expect(filas[0].getAttribute('aria-label')).toContain('Max');
    // Línea de tiempo: el botón de vista alterna entre agrupado y lista
    const alternar = [...dialogo.querySelectorAll('button')].find(b => /Vista Lista|Lista/.test(b.textContent ?? ''))!;
    await act(async () => alternar.click());
    const primeraFila = dialogo.querySelector('table tbody tr')!;
    expect(primeraFila.textContent).toContain('Max');
  });

  it('sólo cobrada (sin deducir) o sólo deducida no pasa: espera en Cobros', async () => {
    await abrirApp();
    await finalizar('Max');
    irA('cobros');
    const fila = () => qa('[data-testid="por-cobrar-fila"]').find(f => f.querySelector('[data-testid="nombre-por-cobrar"]')!.textContent === 'Max')!;
    await act(async () => fila().querySelector<HTMLElement>('[data-testid="casilla-cobrado"]')!.click());
    await act(async () => q('[data-testid="confirmar-cobrado"]')!.click());
    expect(fila()).toBeDefined();
    irA('perros');
    expect(nombresHistorial()).not.toContain('Max');
  });
});

describe('Registro de estadías: orden más reciente primero en todas sus subpantallas', () => {
  async function abrirRegistro() {
    await abrirApp();
    irA('cobros');
    await act(async () => q('[data-testid="abrir-historial"]')!.click());
    return document.querySelector('dialog[open]') as HTMLElement;
  }
  const subpantalla = async (dialogo: HTMLElement, texto: string) => {
    const boton = [...dialogo.querySelectorAll('button')].find(b => b.textContent!.trim().startsWith(texto))!;
    await act(async () => boton.click());
  };
  const titulos = (dialogo: HTMLElement) => [...dialogo.querySelectorAll('h3')].map(h => h.textContent!.trim().split(/\s{2,}|\n/)[0]);

  it('Registro Excel: los perros del registro más reciente primero', async () => {
    const dialogo = await abrirRegistro();
    const nombres = [...dialogo.querySelectorAll<HTMLElement>('[data-testid="expandir-perro"]')].map(b =>
      b.getAttribute('aria-label')!.replace(/^(Ver|Ocultar) estadías de /, '')
    );
    expect(nombres).toEqual(['Rocky', 'Nina', 'Tony', 'Bóxer', 'Candela', 'Luna']);
  });

  it('Directorio: primero el perro con el registro más reciente', async () => {
    const dialogo = await abrirRegistro();
    await subpantalla(dialogo, 'Directorio');
    const nombres = titulos(dialogo).filter(t => ['Bóxer', 'Candela', 'Luna'].some(n => t.startsWith(n)));
    expect(nombres.map(n => n.split(' ')[0])).toEqual(['Bóxer', 'Candela', 'Luna']);
  });

  it('Agenda Activa: la estadía que termina más tarde primero', async () => {
    const dialogo = await abrirRegistro();
    await subpantalla(dialogo, 'Agenda');
    const conocidos = ['Tony', 'Firulais', 'Coco', 'Max', 'Luna'];
    const nombres = titulos(dialogo)
      .map(t => conocidos.find(n => t.startsWith(n)))
      .filter((n): n is string => !!n);
    expect(nombres).toEqual(['Tony', 'Firulais', 'Coco', 'Max', 'Luna']);
  });
});
