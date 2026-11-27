// @vitest-environment jsdom
// "Transferidas" muestra sólo las últimas 5 (por si se tildó una por error), de la más reciente a la más antigua.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DeduccionesPendientes } from './DeduccionesPendientes';
import type { ItemDeduccion, ResumenDeducciones } from '../utils/deducciones';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const q = (sel: string) => container.querySelector<HTMLElement>(sel);
const qa = (sel: string) => [...container.querySelectorAll<HTMLElement>(sel)];
const texto = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

const item = (n: number): ItemDeduccion => ({
  id: `h${n}`, dogName: `Perro ${n}`, desde: '1/3', hasta: '5/3', fin: '2026-03-05',
  totalCobrado: 100000, tasa: 0.18, monto: 18000, transferidaEn: `2026-04-${String(n).padStart(2, '0')}T10:00:00.000Z`
});

const resumenCon = (cantidad: number): ResumenDeducciones => ({
  pendientes: [],
  porPerro: [],
  total: 0,
  // ya vienen ordenadas de la más reciente a la más antigua
  transferidas: Array.from({ length: cantidad }, (_, i) => item(cantidad - i)),
  inicio: '2026-01-01'
});

const render = (resumen: ResumenDeducciones, tildeSoloLocal = false) => act(() => root.render(
  <DeduccionesPendientes resumen={resumen} onMarcar={() => {}} onDesmarcar={() => {}} onMarcarTodas={() => {}} tildeSoloLocal={tildeSoloLocal} />
));

describe('Tasas pendientes: últimas transferidas', () => {
  it('con 59 transferidas muestra sólo las últimas 5, la más reciente primero', async () => {
    render(resumenCon(59));
    expect(texto(q('[data-testid="ver-transferidas"]'))).toContain('Últimas transferidas (5)');
    await act(async () => q('[data-testid="ver-transferidas"]')!.click());
    const filas = qa('[data-testid="transferida"]');
    expect(filas).toHaveLength(5);
    expect(texto(filas[0])).toContain('Perro 59');
    expect(texto(filas[4])).toContain('Perro 55');
  });

  it('con menos de 5 muestra las que hay, y el título usa la palabra "tasa"', async () => {
    render(resumenCon(2));
    expect(texto(q('[data-testid="ver-transferidas"]'))).toContain('Últimas transferidas (2)');
    expect(texto(q('[data-testid="deducciones-pendientes"]'))).toContain('Tasas pendientes');
    expect(texto(q('[data-testid="deducciones-pendientes"]'))).toContain('Sin tasas pendientes');
  });

  it('el aviso de la migración 005 aparece sólo cuando la nube no guarda el tilde (app real)', () => {
    render(resumenCon(1), true);
    expect(texto(q('[data-testid="aviso-tilde-local"]'))).toContain('migración 005');
    render(resumenCon(1), false);
    expect(q('[data-testid="aviso-tilde-local"]')).toBeNull();
  });
});
