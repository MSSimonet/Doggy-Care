// @vitest-environment jsdom
// Deducciones pendientes (Cobros) en la app real, modo demo. La nube es simulada: nunca se toca la base real.
// Demo: registros 2025 (antes de la fecha de inicio) y 2026: Rocky 10/2→15/2 ($21.600) y 5/10→9/10 ($19.800),
// Nina 3/8→10/8 ($31.680); Tony 1/6→5/6 ya transferida. Agenda: Firulais, Coco, Tony, Nina y Bruno (2027) con algo cobrado.
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
const texto = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const esperar = (ms = 0) => act(() => new Promise(r => setTimeout(r, ms)));
// Cada pendiente es una fila con el nombre del perro (botón) y la casilla; el detalle está dentro, oculto hasta tocar el nombre
const nombreDe = (li: Element) => texto(li.querySelector('[data-testid="nombre-pendiente"]')).split(' · ')[0];
const grupos = () => [...new Set(qa('[data-testid="pendiente"]').map(nombreDe))];
const subtotal = (perro: string) => {
  const li = qa('[data-testid="pendiente"]').find(l => nombreDe(l) === perro)!;
  // con varias estadías el detalle trae el subtotal del perro; con una sola, el monto de esa estadía
  return texto(li.querySelector('[data-testid="subtotal-perro"]') ?? li.querySelector('[data-testid="monto-pendiente"]'));
};
const pesos = (s: string) => Number(s.replace(/[^\d]/g, ''));

async function abrirCobros() {
  await act(async () => root.render(<PrivacyProvider><App /></PrivacyProvider>));
  await esperar();
  await act(async () => q('[data-testid="tab-cobros"]')!.click());
}
async function reabrir() {
  act(() => root.unmount());
  root = createRoot(container);
  await abrirCobros();
}
const pendienteDe = (perro: string, fechas: string) =>
  qa('[data-testid="pendiente"]').find(li => nombreDe(li) === perro && texto(li).includes(fechas))!;

describe('Deducciones pendientes', () => {
  it('detalla perro por perro, con subtotal, fechas, cobrado, tasa y monto; sólo desde la fecha de inicio', async () => {
    await abrirCobros();
    const vista = q('[data-testid="deducciones-pendientes"]')!;
    expect(texto(vista)).toContain('Desde el 1/1/2026');
    // Rocky: dos estadías de 2026
    expect(pesos(subtotal('Rocky'))).toBe(21600 + 19800);
    const rocky = pendienteDe('Rocky', '5/10 → 9/10 de 2026');
    expect(texto(rocky)).toMatch(/Cobrado \$\s?110\.000 · 18%/);
    expect(texto(rocky)).toMatch(/\$\s?19\.800/);
    expect(grupos()).toContain('Nina');
    // Las estadías de la Agenda (Bruno con seña y reserva de 2027, Nina en curso, Firulais, Coco, Tony) NO suman
    expect(grupos()).not.toContain('Bruno');
    expect(grupos()).not.toContain('Firulais');
    expect(grupos()).not.toContain('Coco');
    expect(pesos(subtotal('Nina'))).toBe(31680);
    expect(pesos(texto(q('[data-testid="total-pendiente"]')))).toBe(21600 + 19800 + 31680);
    // Los de 2025 (antes del 1/1/2026) no aparecen; Tony (registro) ya estaba transferido
    expect(grupos()).not.toContain('Candela');
    expect(grupos()).not.toContain('Bóxer');
    // El total es la suma de lo que muestra cada fila
    const suma = qa('[data-testid="monto-pendiente"]').reduce((s, el) => s + pesos(texto(el)), 0);
    expect(pesos(texto(q('[data-testid="total-pendiente"]')))).toBe(suma);
    // El demo simula la nube sin la columna del tilde (así lo recuerda en el dispositivo), pero no muestra el aviso de la migración
    expect(q('[data-testid="aviso-tilde-local"]')).toBeNull();
  });

  it('marcar una como transferida: sale de pendientes, queda en Transferidas con la fecha y sobrevive a cerrar y abrir', async () => {
    await abrirCobros();
    await act(async () => pendienteDe('Nina', '3/8 → 10/8').querySelector<HTMLElement>('[data-testid="marcar-transferida"]')!.click());
    await esperar(200);
    const ninaArchivada = () => qa('[data-testid="pendiente"]').some(li => texto(li).includes('3/8 → 10/8'));
    expect(ninaArchivada()).toBe(false);
    await act(async () => q('[data-testid="ver-transferidas"]')!.click());
    const hoy = new Date();
    const fecha = `${hoy.getUTCDate()}/${hoy.getUTCMonth() + 1}/${hoy.getUTCFullYear()}`;
    const nina = qa('[data-testid="transferida"]').find(li => texto(li).startsWith('Nina'))!;
    expect(texto(nina)).toContain(`transferida el ${fecha}`);
    // Se subió a la nube sólo el tilde, el monto y la fecha de ese registro
    expect(nube.recibidas.map(o => `${o.tipo} ${o.tabla}:${o.clave}`)).toEqual(['parche historical_stays:hist-demo-8']);

    await reabrir();
    // (Nina también tiene una estadía en curso con seña en la Agenda: esa sí sigue pendiente)
    expect(ninaArchivada()).toBe(false);
  });

  it('desmarcar pide confirmación; cancelar no cambia nada y confirmar la devuelve a pendientes', async () => {
    await abrirCobros();
    await act(async () => q('[data-testid="ver-transferidas"]')!.click());
    const tony = () => qa('[data-testid="transferida"]').find(li => texto(li).startsWith('Tony'))!;
    expect(texto(tony())).toContain('transferida el 10/6/2026');
    await act(async () => tony().querySelector<HTMLElement>('[data-testid="desmarcar-transferida"]')!.click());
    expect(texto(q('[data-testid="confirm-dialog"]'))).toContain('vuelve a Pendientes');
    await act(async () => q('[data-testid="confirm-dialog-cancel"]')!.click());
    expect(tony()).toBeDefined();
    // (Tony también tiene una estadía en la Agenda con seña: esa sí está pendiente; la de junio no)
    expect(qa('[data-testid="pendiente"]').some(li => texto(li).includes('1/6 → 5/6'))).toBe(false);

    await act(async () => tony().querySelector<HTMLElement>('[data-testid="desmarcar-transferida"]')!.click());
    await act(async () => q('[data-testid="confirmar-desmarcar"]')!.click());
    await esperar(200);
    expect(pendienteDe('Tony', '1/6 → 5/6')).toBeDefined();
  });

  it('"Marcar todas" deja todo en cero y no vuelve a aparecer al cerrar y abrir', async () => {
    await abrirCobros();
    const antes = qa('[data-testid="pendiente"]').length;
    expect(antes).toBeGreaterThan(2);
    await act(async () => q('[data-testid="marcar-todas"]')!.click());
    await act(async () => q('[data-testid="confirm-dialog-confirm"]')!.click());
    await esperar(200);
    expect(pesos(texto(q('[data-testid="total-pendiente"]')))).toBe(0);
    expect(nube.recibidas).toHaveLength(antes);
    expect(nube.recibidas.every(o => o.tipo === 'parche')).toBe(true);
    await reabrir();
    // Los registros archivados siguen transferidos (en demo, las estadías de la Agenda vuelven a sus datos de ejemplo)
    expect(grupos()).not.toContain('Rocky');
    expect(qa('[data-testid="pendiente"]').some(li => texto(li).includes('3/8 → 10/8'))).toBe(false);
  });

  it('sin conexión: queda en la cola y se sube al volver', async () => {
    await abrirCobros();
    enLinea = false;
    nube.red = true;
    act(() => { window.dispatchEvent(new Event('offline')); });
    await act(async () => pendienteDe('Rocky', '10/2 → 15/2').querySelector<HTMLElement>('[data-testid="marcar-transferida"]')!.click());
    await esperar(50);
    expect(pesos(subtotal('Rocky'))).toBe(19800);
    expect(nube.recibidas).toEqual([]);
    enLinea = true;
    nube.red = false;
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await esperar(50);
    expect(nube.recibidas.map(o => o.clave)).toEqual(['hist-demo-6']);
  });

  it('la fecha de inicio se cambia en Ajustes y cambia la lista', async () => {
    await abrirCobros();
    expect(qa('[data-testid="pendiente"]').some(li => texto(li).includes('10/2 → 15/2'))).toBe(true);
    await act(async () => q('[data-testid="tab-ajustes"]')!.click());
    const campo = q('[data-testid="inicio-deducciones"]') as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { set.call(campo, '2026-08-01'); campo.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => q('[data-testid="guardar-deducciones"]')!.click());
    await act(async () => q('[data-testid="tab-cobros"]')!.click());
    expect(texto(q('[data-testid="deducciones-pendientes"]'))).toContain('Desde el 1/8/2026');
    expect(qa('[data-testid="pendiente"]').some(li => texto(li).includes('10/2 → 15/2'))).toBe(false);
    expect(pesos(subtotal('Rocky'))).toBe(19800);
  });

  it('cada pendiente tiene una casilla chica "Tasa" con etiqueta visible y área táctil de 44 px', async () => {
    await abrirCobros();
    const casillas = qa('[data-testid="marcar-transferida"]') as HTMLInputElement[];
    expect(casillas.length).toBeGreaterThan(2);
    for (const c of casillas) {
      expect(c.type).toBe('checkbox');
      expect(c.checked).toBe(false);
      const etiqueta = c.closest('label')!;
      expect(texto(etiqueta)).toBe('Tasa');
      expect(etiqueta.className).toContain('min-h-11'); // 44 px
      expect(c.className).toContain('w-5'); // la casilla en sí es chica (20 px)
      expect(c.getAttribute('aria-label')).toMatch(/^Tasa: /); // el nombre accesible incluye la etiqueta visible
    }
    // Cada fila muestra sólo el nombre (que abre el detalle) y la casilla: no hay botones grandes
    const filas = qa('[data-testid="pendiente"]');
    for (const f of filas) expect([...f.querySelectorAll('button')].map(x => x.getAttribute('data-testid'))).toEqual(['nombre-pendiente']);
    // El detalle está oculto hasta tocar el nombre
    const primero = filas[0].querySelector<HTMLElement>('[data-testid="nombre-pendiente"]')!;
    const detalle = document.getElementById(primero.getAttribute('aria-controls')!)!;
    expect(detalle.hasAttribute('hidden')).toBe(true);
    await act(async () => primero.click());
    expect(detalle.hasAttribute('hidden')).toBe(false);
    expect(primero.getAttribute('aria-expanded')).toBe('true');
  });

  it('tildar una casilla la marca como transferida, guarda monto y fecha por la cola y la saca de Pendientes', async () => {
    await abrirCobros();
    const casilla = pendienteDe('Nina', '3/8 → 10/8').querySelector<HTMLInputElement>('[data-testid="marcar-transferida"]')!;
    await act(async () => casilla.click());
    await esperar(200);
    expect(qa('[data-testid="pendiente"]').some(li => texto(li).includes('3/8 → 10/8'))).toBe(false);
    const op = nube.recibidas.find(o => o.clave === 'hist-demo-8')!;
    expect(op.tipo).toBe('parche');
    expect(op.datos).toMatchObject({ dzTransferred: true, dzTransferredAmount: 31680 });
    expect((op.datos as { dzTransferredAt: string }).dzTransferredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('en Transferidas la casilla está tildada; destildar pide confirmación y cancelar la deja tildada', async () => {
    await abrirCobros();
    await act(async () => q('[data-testid="ver-transferidas"]')!.click());
    const casilla = () => qa('[data-testid="desmarcar-transferida"]')[0] as HTMLInputElement;
    expect(casilla().checked).toBe(true);
    await act(async () => casilla().click());
    expect(q('[data-testid="confirm-dialog"]')).not.toBeNull();
    await act(async () => q('[data-testid="confirm-dialog-cancel"]')!.click());
    expect(casilla().checked).toBe(true);
    expect(nube.recibidas).toEqual([]);
    await act(async () => casilla().click());
    await act(async () => q('[data-testid="confirmar-desmarcar"]')!.click());
    await esperar(200);
    expect(nube.recibidas[0].datos).toMatchObject({ dzTransferred: false, dzTransferredAmount: 0 });
  });

  it('"Marcar todas" pregunta cuántas son y el total antes de marcar', async () => {
    await abrirCobros();
    const n = qa('[data-testid="pendiente"]').length;
    const total = texto(q('[data-testid="total-pendiente"]'));
    await act(async () => q('[data-testid="marcar-todas"]')!.click());
    const dialogo = texto(q('[data-testid="confirm-dialog"]'));
    expect(dialogo).toContain(`${n} tasas`);
    expect(dialogo).toContain(total);
    await act(async () => q('[data-testid="confirm-dialog-cancel"]')!.click());
    expect(nube.recibidas).toEqual([]);
    expect(qa('[data-testid="pendiente"]')).toHaveLength(n);
  });

  it('una estadía que ya estaba transferida: finalizar la deja en Cobros y al cobrarla pasa transferida al Historial', async () => {
    await abrirCobros();
    await act(async () => q('nav [data-testid="tab-hoy"]')!.click());
    const cab = qa('button[aria-controls^="hoy-card-body-"]').find(b => b.textContent!.includes('Luna'))!;
    const cuerpo = document.getElementById(cab.getAttribute('aria-controls')!)!;
    await act(async () => q('[data-testid="finalizar-estadia"]', cuerpo)!.click());
    await act(async () => q('[data-testid="confirm-dialog-confirm"]')!.click());
    await esperar(200);
    await act(async () => q('nav [data-testid="tab-cobros"]')!.click());
    // Todavía está en Cobros (le faltaba cobrar $500): no pasó al Historial
    const fila = () => qa('[data-testid="por-cobrar-fila"]').find(f => texto(f.querySelector('[data-testid="nombre-por-cobrar"]')) === 'Luna')!;
    expect(fila()).toBeDefined();
    expect(localStorage.getItem('pensionados_marcas_deduccion')).toBeNull();
    // Al cobrar lo que falta, la deducción que ya estaba transferida se actualiza y pasa sola al Historial
    await act(async () => fila().querySelector<HTMLElement>('[data-testid="casilla-cobrado"]')!.click());
    await act(async () => q('[data-testid="confirmar-cobrado"]')!.click());
    await esperar(200);
    expect(qa('[data-testid="nombre-por-cobrar"]').some(b => texto(b) === 'Luna')).toBe(false);
    // Se recuerda el tilde en este dispositivo (la nube real puede no tener la columna)
    const marcas = JSON.parse(localStorage.getItem('pensionados_marcas_deduccion') ?? '{}');
    const ids = Object.keys(marcas).filter(id => id.startsWith('hist-agenda-demo-3-'));
    expect(ids).toHaveLength(1);
    expect(marcas[ids[0]]).toMatchObject({ dzTransferred: true });
    expect(grupos()).not.toContain('Luna');
    await act(async () => q('[data-testid="ver-transferidas"]')!.click());
    expect(qa('[data-testid="transferida"]').some(li => texto(li).startsWith('Luna'))).toBe(true);
  });
});
