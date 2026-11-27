import { describe, it, expect } from 'vitest';
import { buildWazeNavigationUrl, resolveStayAddress } from './waze';
import type { Stay } from '../types';
import type { ClientProfile } from '../data/clientsDirectory';

describe('buildWazeNavigationUrl', () => {
  it('devuelve cadena vacía si la dirección está vacía', () => {
    expect(buildWazeNavigationUrl('')).toBe('');
    expect(buildWazeNavigationUrl('   ')).toBe('');
  });

  it('arma enlace oficial de Waze con navigate=yes agregando CABA, Argentina cuando isCapital=true y no lo especifica', () => {
    const url = buildWazeNavigationUrl('Av. Cabildo 2040', true);
    expect(url).toBe('https://waze.com/ul?q=Av.%20Cabildo%202040%2C%20CABA%2C%20Argentina&navigate=yes');
  });

  it('no duplica CABA si la dirección ya dice Caba', () => {
    const url = buildWazeNavigationUrl('Av. Santa Fe 3200, Caba', true);
    expect(url).toBe('https://waze.com/ul?q=Av.%20Santa%20Fe%203200%2C%20Caba%2C%20Argentina&navigate=yes');
  });

  it('respeta la localidad cuando no es CABA y agrega Argentina si falta', () => {
    const url = buildWazeNavigationUrl('Calle Falsa 1500, Villa Ficticia', false);
    expect(url).toBe('https://waze.com/ul?q=Calle%20Falsa%201500%2C%20Villa%20Ficticia%2C%20Argentina&navigate=yes');
  });

  it('no duplica Argentina si ya viene en la dirección y limpia prefijo Dirección:', () => {
    const url = buildWazeNavigationUrl('Dirección: Calle Falsa 500, Villa Ficticia, Argentina', false);
    expect(url).toBe('https://waze.com/ul?q=Calle%20Falsa%20500%2C%20Villa%20Ficticia%2C%20Argentina&navigate=yes');
  });
});

describe('resolveStayAddress', () => {
  const baseStay: Stay = {
    id: 'stay-1',
    dogName: 'Firulais',
    fromDay: '2026-11-24',
    untilDay: '2026-11-26',
    days: 3,
    dailyRate: 22000,
    isCapital: true,
    additionalFeatures: { expenses: 0, bath: 0, moneyAdvance: 0, tip: 0 },
    amountPaid: 0,
    dzTransferred: false,
  };

  const directory: ClientProfile[] = [
    {
      id: 'dog-1',
      dogName: 'Firulais',
      ownerName: 'Ana',
      contact: '11-1111-1111',
      address: 'Av. Corrientes 1234, CABA',
    },
  ];

  it('obtiene la dirección desde directoryClients por nombre normalizado o dogId', () => {
    expect(resolveStayAddress(baseStay, directory)).toBe('Av. Corrientes 1234, CABA');
  });

  it('extrae la dirección desde notes cuando no está en el directorio', () => {
    const stayWithNotes: Stay = {
      ...baseStay,
      dogName: 'OtroPerro',
      notes: 'Dirección: Calle Falsa 800, Villa Ficticia | Familiares: Juan',
    };
    expect(resolveStayAddress(stayWithNotes, directory)).toBe('Calle Falsa 800, Villa Ficticia');
  });

  it('devuelve undefined si no hay dirección en el directorio ni en notes', () => {
    const stayNoAddr: Stay = { ...baseStay, dogName: 'SinDir' };
    expect(resolveStayAddress(stayNoAddr, directory)).toBeUndefined();
  });
});
