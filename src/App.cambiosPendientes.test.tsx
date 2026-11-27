// @vitest-environment jsdom
// Guardado sin conexión en la app real (modo demo). La "nube" es un ejecutor simulado: nunca se toca la base real.
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

// La nube simulada: anota lo que recibe y responde según `nube.modo`
const nube = vi.hoisted(() => ({
  modo: 'ok' as 'ok' | 'red' | 'permanente',
  recibidas: [] as { tipo: string; tabla: string; clave: string; datos?: unknown }[]
}));
vi.mock('./lib/escrituras', async original => ({
  ...(await original<typeof import('./lib/escrituras')>()),
  crearEjecutorDemo: () => async (op: Operacion): Promise<ResultadoEjecucion> => {
    if (nube.modo === 'red') return { ok: false, tipo: 'red', mensaje: 'Failed to fetch' };
    if (nube.modo === 'permanente') return { ok: false, tipo: 'permanente', mensaje: 'permission denied for table historical_stays' };
    nube.recibidas.push({ tipo: op.tipo, tabla: op.tabla, clave: op.clave, datos: op.datos });
    return { ok: true };
  }
}));

let App: typeof import('./App').default;
let PrivacyProvider: typeof import('./components/PrivacyProvider').PrivacyProvider;
let CLAVE_COLA: string;

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
  CLAVE_COLA = (await import('./lib/useCambiosPendientes')).CLAVE_COLA;
});

let container: HTMLDivElement;
let root: Root;
let enLinea = true;
beforeEach(() => {
  localStorage.clear();
  nube.modo = 'ok';
  nube.recibidas = [];
  enLinea = true;
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => enLinea });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const qa = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const indicador = () => q('[data-testid="indicador-guardado"]')!.textContent!.replace(/\s+/g, ' ').trim();
const colaGuardada = (): Operacion[] => JSON.parse(localStorage.getItem(CLAVE_COLA) ?? '{"ops":[]}').ops;
const esperar = (ms = 0) => act(() => new Promise(r => setTimeout(r, ms)));

async function abrirApp() {
  await act(async () => root.render(<PrivacyProvider><App /></PrivacyProvider>));
  await esperar();
}
function sinConexion() {
  enLinea = false;
  nube.modo = 'red';
  act(() => { window.dispatchEvent(new Event('offline')); });
}
async function volverLaConexion() {
  enLinea = true;
  nube.modo = 'ok';
  await act(async () => { window.dispatchEvent(new Event('online')); });
  await esperar();
}
async function finalizar(nombre: string) {
  const cabecera = qa('button[aria-controls^="hoy-card-body-"]').find(b => b.textContent!.includes(nombre))!;
  const cuerpo = document.getElementById(cabecera.getAttribute('aria-controls')!)!;
  await act(async () => cuerpo.querySelector<HTMLElement>('[data-testid="finalizar-estadia"]')!.click());
  await act(async () => q('[data-testid="confirm-dialog-confirm"]')!.click());
  await esperar();
}
async function marcarTodas() {
  await act(async () => q('[data-testid="tab-cobros"]')!.click());
  await act(async () => q('[data-testid="marcar-todas"]')!.click());
  await act(async () => q('[data-testid="confirm-dialog-confirm"]')!.click());
  await esperar();
}

describe('guardado con y sin conexión', () => {
  it('con conexión: finalizar se sube enseguida (queda en Cobros) y no queda nada pendiente ni aviso', async () => {
    await abrirApp();
    await finalizar('Max');
    expect(nube.recibidas.map(r => `${r.tipo} ${r.tabla}`)).toEqual(['upsert stays']);
    expect((nube.recibidas[0].datos as { finalizada: boolean }).finalizada).toBe(true);
    expect(colaGuardada()).toEqual([]);
    expect(indicador()).toBe('');
  });

  it('sin conexión: se ve en pantalla, queda pendiente con aviso y al volver la conexión se sube', async () => {
    await abrirApp();
    sinConexion();
    expect(indicador()).toContain('Sin conexión: los cambios quedan pendientes');
    await finalizar('Max');
    // En pantalla ya no está en la Agenda
    expect(qa('button[aria-controls^="hoy-card-body-"]').some(b => b.textContent!.includes('Max'))).toBe(false);
    expect(indicador()).toContain('1 cambio pendiente de guardar');
    expect(indicador()).not.toContain('Todo guardado');
    expect(nube.recibidas).toEqual([]);
    const ops = colaGuardada();
    expect(ops.map(o => `${o.tipo} ${o.tabla}`)).toEqual(['upsert stays']);

    await volverLaConexion();
    expect(nube.recibidas.map(r => `${r.tipo} ${r.tabla}`)).toEqual(['upsert stays']);
    expect(colaGuardada()).toEqual([]);
    expect(indicador()).toBe('✓ Todo guardado');
  });

  it('cobrada y deducida sin conexión: pasa al Historial como grupo en orden (archivar y quitar la estadía)', async () => {
    await abrirApp();
    await finalizar('Max');
    sinConexion();
    await act(async () => q('nav [data-testid="tab-cobros"]')!.click());
    const fila = () => qa('[data-testid="por-cobrar-fila"]')[0];
    await act(async () => fila().querySelector<HTMLElement>('[data-testid="casilla-cobrado"]')!.click());
    await act(async () => q('[data-testid="confirmar-cobrado"]')!.click());
    await act(async () => fila().querySelector<HTMLElement>('[data-testid="casilla-deducida"]')!.click());
    const ops = colaGuardada();
    // 1) la estadía cobrada (cambio de Cobros) y 2) el grupo: archivar en el Historial + quitar la estadía
    expect(ops.map(o => `${o.tipo} ${o.tabla}`)).toEqual(['upsert stays', 'upsert historical_stays', 'delete stays']);
    expect(ops[1].grupo).toBeDefined();
    expect(ops[1].grupo).toBe(ops[2].grupo);
    await volverLaConexion();
    // (el primer 'upsert stays' es el de finalizar, que se subió con conexión antes de cortarla)
    expect(nube.recibidas.map(r => `${r.tipo} ${r.tabla}`)).toEqual(['upsert stays', 'upsert stays', 'upsert historical_stays', 'delete stays']);
    expect(colaGuardada()).toEqual([]);
  });

  it('cerrar y reabrir la app con cambios pendientes: siguen en la cola y se suben al volver la conexión', async () => {
    await abrirApp();
    sinConexion();
    await finalizar('Max');
    act(() => root.unmount());
    // reabrir (sigue sin conexión)
    root = createRoot(container);
    await abrirApp();
    expect(indicador()).toContain('1 cambio pendiente de guardar');
    expect(colaGuardada()).toHaveLength(1);
    await volverLaConexion();
    expect(nube.recibidas).toHaveLength(1);
    expect(colaGuardada()).toEqual([]);
  });

  it('"Marcar todas" sin conexión: un cambio por registro tildado y sólo con el tilde, el monto y la fecha', async () => {
    await abrirApp();
    sinConexion();
    await marcarTodas();
    const ops = colaGuardada();
    expect(ops.length).toBeGreaterThan(0);
    expect(ops.every(o => o.tipo === 'parche')).toBe(true);
    expect(ops.every(o => Object.keys(o.datos as object).sort().join() === 'dzTransferred,dzTransferredAmount,dzTransferredAt')).toBe(true);
    expect(new Set(ops.map(o => `${o.tabla}:${o.clave}`)).size).toBe(ops.length);
    await volverLaConexion();
    expect(nube.recibidas).toHaveLength(ops.length);
    expect(colaGuardada()).toEqual([]);
  });

  it('error permanente: queda "con error" (no se descarta solo) y descartarlo pide confirmación', async () => {
    await abrirApp();
    nube.modo = 'permanente';
    await finalizar('Max');
    expect(indicador()).toContain('1 cambio con error: no se guardaron');
    expect(colaGuardada().map(o => o.estado)).toEqual(['error']);

    await act(async () => q('[data-testid="ver-cambios-con-error"]')!.click());
    expect(q('[data-testid="lista-cambios-con-error"]')!.textContent).toContain('permission denied');
    await act(async () => q('[data-testid="descartar-cambio"]')!.click());
    expect(q('[data-testid="confirm-dialog"]')!.textContent).toContain('no se puede recuperar');
    // Cancelar no descarta
    await act(async () => q('[data-testid="confirm-dialog-cancel"]')!.click());
    expect(colaGuardada()).toHaveLength(1);
    await act(async () => q('[data-testid="descartar-cambio"]')!.click());
    await act(async () => q('[data-testid="confirmar-descartar-cambio"]')!.click());
    expect(colaGuardada()).toEqual([]);
  });

  it('error permanente que se arregla: "Reintentar" lo sube', async () => {
    await abrirApp();
    nube.modo = 'permanente';
    await finalizar('Max');
    nube.modo = 'ok';
    await act(async () => q('[data-testid="ver-cambios-con-error"]')!.click());
    const reintentar = qa('[data-testid="lista-cambios-con-error"] button').find(b => b.textContent === 'Reintentar')!;
    await act(async () => reintentar.click());
    await esperar();
    expect(nube.recibidas.map(r => `${r.tipo} ${r.tabla}`)).toEqual(['upsert stays']);
    expect(colaGuardada()).toEqual([]);
  });

  it('el aviso se anuncia a lectores de pantalla y usa texto de 14 px', async () => {
    await abrirApp();
    sinConexion();
    const el = q('[data-testid="indicador-guardado"]')!;
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(el.querySelector('.text-sm')).not.toBeNull();
  });
});
