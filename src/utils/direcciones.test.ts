import { describe, expect, it } from 'vitest';
import type { Stay } from '../types';
import type { ClientProfile } from '../data/clientsDirectory';
import { cambiarDireccion, notasConDireccion } from './direcciones';
import { resolveStayAddress } from './waze';

const ficha = (id: string, dogName: string, address?: string): ClientProfile => ({ id, dogName, ownerName: 'X', address });
const estadia = (id: string, dogName: string, notes = '', extra: Partial<Stay> = {}): Stay => ({
  id, dogName, fromDay: '2026-11-20', untilDay: '2026-11-28', days: 9, dailyRate: 20000, isCapital: true,
  additionalFeatures: { expenses: 0, bath: 0, moneyAdvance: 0, tip: 0 }, amountPaid: 0, notes, ...extra
});

describe('notasConDireccion', () => {
  it('cambia sólo la parte de la dirección', () => {
    expect(notasConDireccion('Dirección: Calle 1 | Familiar: Ana', 'Av. 2 500')).toBe('Dirección: Av. 2 500 | Familiar: Ana');
    expect(notasConDireccion('Dirección: Calle 1', 'Av. 2')).toBe('Dirección: Av. 2');
    expect(notasConDireccion('Llega tarde', 'Av. 2')).toBe('Llega tarde');
    expect(notasConDireccion('Dirección: Calle 1 | Familiar: Ana', '')).toBe('Familiar: Ana');
  });
});

describe('cambiarDireccion', () => {
  it('actualiza la ficha existente (aunque el nombre esté escrito distinto) y las notas de sus estadías', () => {
    const r = cambiarDireccion({
      dogName: 'Tobías', direccion: 'Av. Nueva 10',
      fichas: [ficha('c1', 'tobias', 'Calle Vieja 1'), ficha('c2', 'Luna', 'Otra 3')],
      estadias: [estadia('s1', 'Tobias', 'Dirección: Calle Vieja 1'), estadia('s2', 'Luna', 'Dirección: Otra 3')]
    });
    expect(r.esNueva).toBe(false);
    expect(r.ficha).toMatchObject({ id: 'c1', address: 'Av. Nueva 10' });
    expect(r.estadias.map(s => [s.id, s.notes])).toEqual([['s1', 'Dirección: Av. Nueva 10']]);
    // Waze toma la dirección nueva
    expect(resolveStayAddress(estadia('s1', 'Tobias'), [r.ficha])).toBe('Av. Nueva 10');
  });

  it('un perro sin ficha recibe una nueva con los datos de su estadía', () => {
    const r = cambiarDireccion({
      dogName: 'Firulais', direccion: 'Calle 5', fichas: [], nuevoId: () => 'client-nuevo',
      estadias: [estadia('s1', 'Firulais', '', { clientName: 'Ana', clientPhone: '555', dogBreed: 'Labrador' })]
    });
    expect(r.esNueva).toBe(true);
    expect(r.ficha).toEqual({ id: 'client-nuevo', dogName: 'Firulais', breed: 'Labrador', ownerName: 'Ana', contact: '555', address: 'Calle 5' });
  });
});
