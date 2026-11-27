import { describe, it, expect } from 'vitest';
import type { Stay } from '../types';

// Pure split logic extracted from App.tsx cobrosSplit useMemo
function splitCobrosByDate(
  calculatedStays: { stay: Stay; calc: { totalGross: number; totalAdeudado: number } }[],
  today: string
) {
  const started = calculatedStays.filter(item => item.stay.fromDay <= today);
  const future = calculatedStays.filter(item => item.stay.fromDay > today);
  return { started, future };
}

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

const makeCalcItem = (fromDay: string, id = 's1') => ({
  stay: makeStay({ id, fromDay }),
  calc: { totalGross: 100000, totalAdeudado: 50000 },
});

describe('cobrosSplit — separación de estadías empezadas vs reservas futuras', () => {
  it('estadía con fromDay == today va a started', () => {
    const today = '2026-10-31';
    const item = makeCalcItem(today);
    const { started, future } = splitCobrosByDate([item], today);
    expect(started).toHaveLength(1);
    expect(future).toHaveLength(0);
  });

  it('estadía con fromDay < today va a started', () => {
    const today = '2026-10-31';
    const item = makeCalcItem('2026-10-01');
    const { started, future } = splitCobrosByDate([item], today);
    expect(started).toHaveLength(1);
    expect(future).toHaveLength(0);
  });

  it('estadía con fromDay > today va a future', () => {
    const today = '2026-10-31';
    const item = makeCalcItem('2026-11-01');
    const { started, future } = splitCobrosByDate([item], today);
    expect(started).toHaveLength(0);
    expect(future).toHaveLength(1);
  });

  it('mezcla de estadías empezadas y reservas se divide correctamente', () => {
    const today = '2026-10-31';
    const items = [
      makeCalcItem('2026-10-15', 's1'),
      makeCalcItem('2026-10-31', 's2'),
      makeCalcItem('2026-11-01', 's3'),
      makeCalcItem('2026-12-26', 's4'),
    ];
    const { started, future } = splitCobrosByDate(items, today);
    expect(started).toHaveLength(2);
    expect(future).toHaveLength(2);
    expect(started.map(i => i.stay.id)).toEqual(['s1', 's2']);
    expect(future.map(i => i.stay.id)).toEqual(['s3', 's4']);
  });

  it('lista vacía retorna ambos arrays vacíos', () => {
    const { started, future } = splitCobrosByDate([], '2026-10-31');
    expect(started).toHaveLength(0);
    expect(future).toHaveLength(0);
  });

  it('todas son reservas futuras cuando today es muy antiguo', () => {
    const today = '2020-01-01';
    const items = [
      makeCalcItem('2026-10-15', 's1'),
      makeCalcItem('2026-12-26', 's2'),
    ];
    const { started, future } = splitCobrosByDate(items, today);
    expect(started).toHaveLength(0);
    expect(future).toHaveLength(2);
  });

  it('todas son started cuando today es muy lejano', () => {
    const today = '2099-12-31';
    const items = [
      makeCalcItem('2026-10-15', 's1'),
      makeCalcItem('2026-12-26', 's2'),
    ];
    const { started, future } = splitCobrosByDate(items, today);
    expect(started).toHaveLength(2);
    expect(future).toHaveLength(0);
  });
});
