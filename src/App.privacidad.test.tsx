// @vitest-environment jsdom
// Modo privacidad: exportaciones y buscadores. Con el modo activo, ninguna salida ni búsqueda usa datos que la
// pantalla oculta (dueño, teléfono, dirección, familiares). Con el modo apagado todo funciona como siempre.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateStay } from './utils/calculations';
import { construirCsvEstadias, ENCABEZADOS_CSV } from './utils/exportarCsv';
import { DEMO_CONFIG, DEMO_STAYS } from './data/demoData';
import { enmascarar } from './lib/privacidad';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
const descargas: Blob[] = [];

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
  // jsdom no implementa las descargas: se captura el archivo que la app intenta bajar
  URL.createObjectURL = ((blob: Blob) => { descargas.push(blob); return 'blob:prueba'; }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
  HTMLAnchorElement.prototype.click = function () {};

  App = (await import('./App')).default;
  PrivacyProvider = (await import('./components/PrivacyProvider')).PrivacyProvider;
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  descargas.length = 0;
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
const irA = (tab: 'hoy' | 'perros' | 'cobros' | 'ajustes') => act(() => q(`[data-testid="tab-${tab}"]`)!.click());
const nombres = () => qa('[data-testid="agenda-entry-toggle"]').map(b => b.textContent!.trim());
const leer = (blob: Blob) =>
  new Promise<string>(resolve => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsText(blob);
  });
const botonConTexto = (texto: string, desde: ParentNode = container) =>
  [...desde.querySelectorAll<HTMLElement>('button')].find(b => b.textContent!.includes(texto))!;

async function abrir(privacidad: boolean) {
  if (privacidad) localStorage.setItem('pensionados_privacy_mode', '1');
  await act(async () => root.render(<PrivacyProvider><App /></PrivacyProvider>));
}

async function buscar(valor: string, campo: HTMLInputElement) {
  const setValor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setValor.call(campo, valor);
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const buscadorHistorial = () => q('input[placeholder^="Buscar por perro"]') as HTMLInputElement;

describe('construirCsvEstadias (armado puro)', () => {
  const items = DEMO_STAYS.map(stay => ({ stay, calc: calculateStay(stay, DEMO_CONFIG) }));

  it('sin privacidad trae el nombre del dueño', () => {
    const csv = construirCsvEstadias(items, (t, v) => enmascarar(t, v, false));
    expect(csv.split('\n')[0]).toBe(ENCABEZADOS_CSV.join(';'));
    expect(csv).toContain('Ana García');
    expect(csv.split('\n')).toHaveLength(items.length + 1);
  });

  it('con privacidad no trae ningún nombre de dueño y deja la máscara', () => {
    const csv = construirCsvEstadias(items, (t, v) => enmascarar(t, v, true));
    for (const { stay } of items) {
      if (stay.clientName) expect(csv).not.toContain(stay.clientName);
      if (stay.clientPhone) expect(csv).not.toContain(stay.clientPhone);
    }
    expect(csv).toContain('Dueño/a oculto/a');
    // los datos de la estadía siguen: perros, fechas e importes
    expect(csv).toContain('Firulais');
    expect(csv).toContain('2026-10-28');
  });

  it('el CSV nunca incluye teléfono, dirección ni familiares', () => {
    const csv = construirCsvEstadias(items, (t, v) => enmascarar(t, v, false));
    expect(ENCABEZADOS_CSV.join(' ')).not.toMatch(/Tel|Direcci|Familiar|WhatsApp/i);
    expect(csv).not.toMatch(/555-01/);
  });
});

describe('exportar CSV desde Cobros', () => {
  async function exportar() {
    irA('cobros');
    await act(async () => botonConTexto('CSV').click());
    expect(descargas).toHaveLength(1);
    return leer(descargas[0]);
  }

  it('con el modo apagado trae los dueños', async () => {
    await abrir(false);
    const csv = await exportar();
    expect(csv).toContain('Ana García');
    expect(csv).not.toContain('Dueño/a oculto/a');
  });

  it('con el modo activo trae los dueños enmascarados', async () => {
    await abrir(true);
    const csv = await exportar();
    expect(csv).not.toContain('Ana García');
    expect(csv).not.toContain('Carlos Quiroga');
    expect(csv).toContain('Dueño/a oculto/a');
    expect(csv).toContain('Firulais');
  });
});

describe('respaldo completo (Ajustes)', () => {
  it('con el modo apagado se descarga', async () => {
    await abrir(false);
    irA('ajustes');
    await act(async () => botonConTexto('Descargar respaldo').click());
    expect(descargas).toHaveLength(1);
    expect(await leer(descargas[0])).toContain('Doggy-Care');
  });

  it('con el modo activo no se descarga y avisa qué hacer', async () => {
    await abrir(true);
    irA('ajustes');
    await act(async () => botonConTexto('Descargar respaldo').click());
    expect(descargas).toHaveLength(0);
    const aviso = q('[data-testid="aviso-respaldo"]')!;
    expect(aviso.textContent).toContain('modo privacidad');
    expect(aviso.textContent).toContain('Desactivá');
  });
});

describe('buscador de la solapa Historial', () => {
  it('con el modo apagado busca por dueño, teléfono y dirección', async () => {
    await abrir(false);
    irA('perros');
    // (La solapa Historial sólo tiene perros con estadías finalizadas: Tony es de Laura Díaz, 555-0104)
    await buscar('Díaz', buscadorHistorial());
    expect(nombres()).toEqual(['Tony']);
    await buscar('0104', buscadorHistorial());
    expect(nombres()).toEqual(['Tony']);
    await buscar('ficticia', buscadorHistorial());
    expect(nombres().length).toBeGreaterThan(0);
  });

  it('con el modo activo no filtra por dueño, teléfono ni dirección', async () => {
    await abrir(true);
    irA('perros');
    for (const termino of ['Díaz', 'Laura', '0104', '555', 'ficticia']) {
      await buscar(termino, buscadorHistorial());
      expect(nombres(), `buscando "${termino}"`).toEqual([]);
    }
  });

  it('con el modo activo sigue buscando por lo que se ve: nombre del perro y raza', async () => {
    await abrir(true);
    irA('perros');
    await buscar('Tony', buscadorHistorial());
    expect(nombres()).toEqual(['Tony']);
    await buscar('beagle', buscadorHistorial());
    expect(nombres()).toEqual(['Tony']);
  });
});

describe('buscador del Registro de estadías (Directorio)', () => {
  async function abrirDirectorio() {
    irA('cobros');
    await act(async () => q('[data-testid="abrir-historial"]')!.click());
    const dialogo = document.querySelector('dialog[open]') as HTMLElement;
    await act(async () => botonConTexto('Directorio', dialogo).click());
    return dialogo;
  }
  const campo = (dialogo: HTMLElement) => dialogo.querySelector('input[aria-label="Buscar en el registro"]') as HTMLInputElement;

  it('con el modo apagado encuentra un perro por el nombre de su dueño', async () => {
    await abrir(false);
    const dialogo = await abrirDirectorio();
    await buscar('Ezequiel', campo(dialogo));
    expect(dialogo.textContent).toContain('Bóxer');
  });

  it('con el modo activo el nombre del dueño no filtra', async () => {
    await abrir(true);
    const dialogo = await abrirDirectorio();
    await buscar('Ezequiel', campo(dialogo));
    expect(dialogo.textContent).not.toContain('Bóxer');
    // sólo queda el mensaje de "sin resultados" (repite lo que se escribió, no un dato guardado)
    expect(dialogo.textContent).toContain('No se encontraron');
    expect(dialogo.textContent).not.toContain('Dueño: Ezequiel');
    await buscar('Bóxer', campo(dialogo));
    expect(dialogo.textContent).toContain('Bóxer');
  });
});
