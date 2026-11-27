// @vitest-environment jsdom
// La tarjeta de Ajustes con una nube simulada que YA tiene los tildes (como la real hoy: 59 transferidas).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SubidaTildes } from './SubidaTildes';
import type { Marcas } from '../lib/marcasDeduccion';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const q = (sel: string) => container.querySelector<HTMLElement>(sel);
const texto = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const esperar = () => act(() => new Promise(r => setTimeout(r, 0)));

describe('SubidaTildes con la nube que ya tiene los tildes', () => {
  it('no hay nada por subir y ofrece borrar la copia local; al confirmar la borra y no escribe en la nube', async () => {
    let marcas: Marcas = {
      a: { dzTransferred: true, dzTransferredAmount: 10, dzTransferredAt: '2026-11-01T00:00:00.000Z' },
      b: { dzTransferred: true, dzTransferredAmount: 20, dzTransferredAt: '2026-11-02T00:00:00.000Z' }
    };
    const subidas: unknown[] = [];
    const confirmaciones: string[] = [];
    act(() => root.render(
      <SubidaTildes
        leerNube={async () => ({ ok: true, data: [{ id: 'a', dzTransferred: true, dzTransferredAmount: 10 }, { id: 'b', dzTransferred: true, dzTransferredAmount: 20 }, { id: 'c', dzTransferred: true, dzTransferredAmount: 30 }] })}
        leerMarcas={() => marcas}
        subir={async ops => { subidas.push(...ops); return true; }}
        borrarMarcas={ids => { marcas = Object.fromEntries(Object.entries(marcas).filter(([id]) => !ids.includes(id))); return true; }}
        confirm={async o => { confirmaciones.push(String(o.title)); return true; }}
      />
    ));
    await act(async () => q('[data-testid="revisar-tildes"]')!.click());
    await esperar();
    expect(texto(q('[data-testid="en-la-nube"]'))).toBe('3 transferidas');
    expect(texto(q('[data-testid="por-subir"]'))).toContain('0');
    expect(q('[data-testid="subir-tildes"]')).toBeNull();
    const boton = q('[data-testid="limpiar-copia-local"]')!;
    expect(boton.textContent).toBe('Borrar copia de este teléfono (2)');
    await act(async () => boton.click());
    await esperar();
    expect(confirmaciones).toEqual(['Borrar la copia de este teléfono']);
    expect(subidas).toEqual([]); // no se escribió nada en la nube
    expect(marcas).toEqual({});
    expect(texto(q('[data-testid="resultado-subida"]'))).toContain('Copia de este teléfono borrada: 2');
    expect(q('[data-testid="limpiar-copia-local"]')).toBeNull();
  });
});
