import { describe, it, expect } from 'vitest';
import type { Stay } from '../types';
import type { ClientProfile } from '../data/clientsDirectory';

// Simulate the enrichment logic from App.tsx
function enrichStays(loaded: Stay[], clientsDirectory: ClientProfile[]): Stay[] {
  const normalizeStr = (str: string) =>
    (str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return loaded.map(s => {
    const match = clientsDirectory.find(c =>
      (s.dogId && c.id === s.dogId) ||
      (!s.dogId && normalizeStr(c.dogName) === normalizeStr(s.dogName))
    );
    if (match) {
      const isGeneric = !s.clientName || s.clientName.startsWith('Familia') || s.clientName.startsWith('Cliente');
      const fullName = match.ownerLastName
        ? `${match.ownerName} ${match.ownerLastName}`.trim()
        : match.ownerName;
      return {
        ...s,
        clientName: (!isGeneric && s.clientName) ? s.clientName : (fullName || s.clientName),
        clientPhone: s.clientPhone || match.contact,
        dogBreed: s.dogBreed || match.breed,
      };
    }
    return s;
  });
}

const makeClient = (overrides: Partial<ClientProfile> = {}): ClientProfile => ({
  id: 'c1',
  dogName: 'Rex',
  ownerName: 'Juan',
  ...overrides,
});

const makeStay = (overrides: Partial<Stay> = {}): Stay => ({
  id: 's1',
  dogName: 'Rex',
  clientName: '',
  clientPhone: '',
  dogBreed: '',
  fromDay: '2026-01-01',
  untilDay: '2026-01-07',
  days: 6,
  dailyRate: 21000,
  isCapital: true,
  customKm: 90,
  additionalFeatures: { expenses: 0, bath: 0, moneyAdvance: 0, tip: 0 },
  amountPaid: 0,
  dzTransferred: false,
  dzRate: 0.18,
  notes: '',
  savedToHistory: false,
  ...overrides,
});

describe('Stay enrichment by dogId', () => {
  it('prefers dogId match over name match', () => {
    const clientA = makeClient({ id: 'c-a', dogName: 'Rex', ownerName: 'Correcto' });
    const clientB = makeClient({ id: 'c-b', dogName: 'Rex', ownerName: 'Incorrecto' });
    const stay = makeStay({ dogId: 'c-a', clientName: 'Cliente' });
    const result = enrichStays([stay], [clientA, clientB]);
    expect(result[0].clientName).toBe('Correcto');
  });

  it('falls back to name match when dogId is absent', () => {
    const client = makeClient({ id: 'c1', dogName: 'Max', ownerName: 'Julieta' });
    const stay = makeStay({ dogName: 'Max', dogId: undefined, clientName: 'Cliente' });
    const result = enrichStays([stay], [client]);
    expect(result[0].clientName).toBe('Julieta');
  });

  it('does not match by name when dogId is set to a different client', () => {
    const clientA = makeClient({ id: 'c-a', dogName: 'Rex', ownerName: 'Correcto' });
    const clientB = makeClient({ id: 'c-b', dogName: 'Rex', ownerName: 'Incorrecto' });
    const stay = makeStay({ dogId: 'c-b', clientName: 'Cliente' });
    const result = enrichStays([stay], [clientA, clientB]);
    expect(result[0].clientName).toBe('Incorrecto');
  });

  it('returns stay unchanged when no client matches', () => {
    const client = makeClient({ id: 'c1', dogName: 'Otro', ownerName: 'Nadie' });
    const stay = makeStay({ dogName: 'Rex', dogId: undefined });
    const result = enrichStays([stay], [client]);
    expect(result[0].clientName).toBe('');
  });
});
