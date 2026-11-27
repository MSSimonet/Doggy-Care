import { describe, it, expect } from 'vitest';
import {
  calculateStay,
  calculatePureDailyRate,
  calcDays,
  costPerKm,
  historyDzPending,
  toggleDzTransfer,
  markDzTransferred,
  formatPercent,
  pureTransportShare,
  PURE_DAILY_BASE
} from './calculations';
import type { AppConfig, Stay } from '../types';

const config: AppConfig = {
  fuelPricePerLiter: 2200,
  fuelConsumptionKmPerLiter: 8.64,
  baseTransportLiters: 16,
  defaultCapitalKm: 90,
  dzRate: 0.18,
  maintenanceRate: 0.20,
  usdReferenceDaily: 5.5,
  fuelFixedComponent: 7810,
  exchangeRates: {
    usdRate: 1700,
    promedioUsd: 1700,
    blue: 1700,
    mep: 1700,
    bna: 1700,
    ccl: 1700,
    tarjeta: 1700,
    euroBlue: 1700
  }
};

// 5 días (01 → 05) a $20.000 = $100.000; Capital, 90 km
const makeStay = (overrides: Partial<Stay> = {}): Stay => ({
  id: 'test-1',
  dogName: 'Rex',
  clientName: 'Cliente Test',
  clientPhone: '',
  dogBreed: '',
  fromDay: '2025-10-01',
  untilDay: '2025-10-05',
  days: 5,
  dailyRate: 20000,
  isCapital: true,
  customKm: undefined,
  additionalFeatures: { expenses: 0, bath: 0, moneyAdvance: 0, tip: 0 },
  amountPaid: 0,
  dzTransferred: false,
  notes: '',
  savedToHistory: false,
  ...overrides
});

const withPayments = (moneyAdvance: number, amountPaid: number, overrides: Partial<Stay> = {}) =>
  makeStay({ additionalFeatures: { expenses: 0, bath: 0, moneyAdvance, tip: 0 }, amountPaid, ...overrides });

const KM_COST = 2200 / 8.64; // $254,63 por km
const TRASLADO_90 = 90 * KM_COST; // $22.916,67

describe('días = (hasta - desde) + 1', () => {
  it('1 día cuando llega y se va el mismo día', () => {
    expect(calcDays('2025-10-05', '2025-10-05')).toBe(1);
  });

  it('5 días contando el de llegada y el de salida (01 → 05)', () => {
    expect(calcDays('2025-10-01', '2025-10-05')).toBe(5);
  });

  it('5 días aunque cambie el mes (30/10 → 03/11)', () => {
    expect(calcDays('2025-10-30', '2025-11-03')).toBe(5);
  });

  it('null si "hasta" es anterior a "desde"', () => {
    expect(calcDays('2025-10-05', '2025-10-01')).toBeNull();
  });

  it('el cálculo usa las fechas aunque el número guardado esté desactualizado', () => {
    const calc = calculateStay(makeStay({ days: 99 }), config);
    expect(calc.days).toBe(5);
    expect(calc.totalCharge).toBe(100000);
  });
});

describe('sin pagos', () => {
  const calc = calculateStay(makeStay(), config);

  it('falta cobrar todo el total y no hay deducción generada', () => {
    expect(calc.totalCharge).toBe(100000);
    expect(calc.collected).toBe(0);
    expect(calc.totalAdeudado).toBe(100000);
    expect(calc.creditBalance).toBe(0);
    expect(calc.dzGenerated).toBe(0);
    expect(calc.dzPending).toBe(0);
  });

  it('Te queda = total - 18 % del total - traslado; hasta ahora es negativo por el traslado', () => {
    expect(calc.netArs).toBeCloseTo(100000 - 18000 - TRASLADO_90, 2);
    expect(calc.netSoFarArs).toBeCloseTo(-TRASLADO_90, 2);
  });

  it('no deja tildar "Transferida" sin nada cobrado', () => {
    const stay = makeStay();
    expect(toggleDzTransfer(stay, config)).toBe(stay);
  });
});

describe('pago parcial', () => {
  const calc = calculateStay(withPayments(0, 40000), config);

  it('falta cobrar = total - cobrado', () => {
    expect(calc.collected).toBe(40000);
    expect(calc.totalAdeudado).toBe(60000);
  });

  it('la deducción se genera sobre lo cobrado', () => {
    expect(calc.dzGenerated).toBeCloseTo(7200, 2);
    expect(calc.dzPending).toBeCloseTo(7200, 2);
  });

  it('Te queda hasta ahora = cobrado - deducción generada - traslado', () => {
    expect(calc.netSoFarArs).toBeCloseTo(40000 - 7200 - TRASLADO_90, 2);
    expect(calc.netArs).toBeCloseTo(100000 - 18000 - TRASLADO_90, 2);
  });
});

describe('adelanto más ya cobrado', () => {
  const calc = calculateStay(withPayments(30000, 20000), config);

  it('cobrado = seña o adelanto + ya cobrado', () => {
    expect(calc.collected).toBe(50000);
    expect(calc.totalAdeudado).toBe(50000);
  });

  it('el adelanto también genera deducción', () => {
    expect(calc.dzGenerated).toBeCloseTo(9000, 2);
  });

  it('la propina no suma al total', () => {
    const conPropina = calculateStay(
      makeStay({ additionalFeatures: { expenses: 0, bath: 0, moneyAdvance: 30000, tip: 5000 }, amountPaid: 20000 }),
      config
    );
    expect(conPropina.totalCharge).toBe(100000);
    expect(conPropina.totalAdeudado).toBe(50000);
  });

  it('baño y gastos suman al total', () => {
    const conExtras = calculateStay(
      makeStay({ additionalFeatures: { expenses: 500, bath: 2000, moneyAdvance: 30000, tip: 0 }, amountPaid: 20000 }),
      config
    );
    expect(conExtras.totalCharge).toBe(102500);
    expect(conExtras.totalAdeudado).toBe(52500);
  });
});

describe('cobro posterior a una transferencia', () => {
  it('al tildar "Transferida", lo transferido es igual a la deducción generada', () => {
    const tilded = toggleDzTransfer(withPayments(30000, 20000), config);
    expect(tilded.dzTransferred).toBe(true);
    expect(tilded.dzTransferredAmount).toBe(9000);
    expect(calculateStay(tilded, config).dzPending).toBe(0);
  });

  it('si después se cobra más, la diferencia vuelve a quedar por transferir', () => {
    const tilded = toggleDzTransfer(withPayments(30000, 20000), config);
    const laterPayment = { ...tilded, amountPaid: 50000 };
    const calc = calculateStay(laterPayment, config);
    expect(calc.collected).toBe(80000);
    expect(calc.dzGenerated).toBeCloseTo(14400, 2);
    expect(calc.dzTransferredAmount).toBe(9000);
    expect(calc.dzPending).toBeCloseTo(5400, 2);
  });

  it('"Marcar todas" transfiere la diferencia', () => {
    const tilded = toggleDzTransfer(withPayments(30000, 20000), config);
    const marked = markDzTransferred({ ...tilded, amountPaid: 50000 }, config);
    expect(marked.dzTransferredAmount).toBe(14400);
    expect(calculateStay(marked, config).dzPending).toBe(0);
  });

  it('destildar deja todo por transferir', () => {
    const tilded = toggleDzTransfer(withPayments(30000, 20000), config);
    const untilded = toggleDzTransfer(tilded, config);
    expect(untilded.dzTransferred).toBe(false);
    expect(calculateStay(untilded, config).dzPending).toBeCloseTo(9000, 2);
  });

  it('una estadía vieja tildada sin monto cuenta como transferida por completo', () => {
    const legacy = withPayments(0, 100000, { dzTransferred: true, dzTransferredAmount: undefined });
    const calc = calculateStay(legacy, config);
    expect(calc.dzTransferredAmount).toBeCloseTo(18000, 2);
    expect(calc.dzPending).toBe(0);
  });
});

describe('km 0 y 90', () => {
  it('costo por km = precio de la nafta ÷ rendimiento (Ajustes)', () => {
    expect(costPerKm(config)).toBeCloseTo(254.63, 2);
  });

  it('fuera de Capital con 0 km no hay costo de traslado', () => {
    const calc = calculateStay(withPayments(0, 100000, { isCapital: false, customKm: 0 }), config);
    expect(calc.kmApplied).toBe(0);
    expect(calc.fuelCost).toBe(0);
    expect(calc.netArs).toBeCloseTo(82000, 2);
    expect(calc.netSoFarArs).toBeCloseTo(82000, 2);
  });

  it('90 km restan $22.917 del neto', () => {
    const calc = calculateStay(withPayments(0, 100000, { isCapital: false, customKm: 90 }), config);
    expect(calc.kmApplied).toBe(90);
    expect(calc.fuelCost).toBeCloseTo(TRASLADO_90, 2);
    expect(calc.netArs).toBeCloseTo(82000 - TRASLADO_90, 2);
  });

  it('Capital usa los km fijos de Ajustes', () => {
    const calc = calculateStay(makeStay({ isCapital: true, customKm: 0 }), config);
    expect(calc.kmApplied).toBe(90);
  });
});

describe('cobrado mayor que el total', () => {
  const calc = calculateStay(withPayments(20000, 100000), config);

  it('falta cobrar nunca es negativo y el sobrante queda a favor del cliente', () => {
    expect(calc.totalAdeudado).toBe(0);
    expect(calc.creditBalance).toBe(20000);
  });

  it('la deducción se genera sólo hasta el total: lo cobrado de más no suma', () => {
    expect(calc.dzGenerated).toBeCloseTo(18000, 2);
    expect(calc.dzGenerated).toBeCloseTo(calc.dzOnTotal, 2);
  });

  it('con una transferencia previa de $9.000 quedan $9.000 por transferir', () => {
    const c = calculateStay(
      withPayments(20000, 100000, { dzTransferred: true, dzTransferredAmount: 9000 }),
      config
    );
    expect(c.dzPending).toBeCloseTo(9000, 2);
    expect(c.creditBalance).toBe(20000);
  });

  it('lo que está a favor del cliente no suma a "Te queda hasta ahora"', () => {
    expect(calc.netSoFarArs).toBeCloseTo(100000 - 18000 - calc.fuelCost, 2);
    expect(calc.netSoFarArs).toBeCloseTo(calc.netArs, 2);
  });
});

describe('dz_rate por estadía', () => {
  it('usa el porcentaje de la estadía si está definido', () => {
    const calc = calculateStay(withPayments(0, 100000, { dzRate: 0.10 }), config);
    expect(calc.dzGenerated).toBeCloseTo(10000, 2);
    expect(calc.dzOnTotal).toBeCloseTo(10000, 2);
  });

  it('cae al porcentaje de Ajustes si la estadía no lo define', () => {
    const calc = calculateStay(withPayments(0, 100000), config);
    expect(calc.dzRate).toBe(0.18);
  });
});

describe('historial: deducción pendiente', () => {
  it('registro viejo sin tilde: queda pendiente toda la deducción', () => {
    expect(historyDzPending({ dz: 26880, dzTransferred: false })).toBe(26880);
  });

  it('registro viejo tildado sin monto: no queda nada pendiente', () => {
    expect(historyDzPending({ dz: 26880, dzTransferred: true })).toBe(0);
  });

  it('registro con monto parcial: queda la diferencia', () => {
    expect(historyDzPending({ dz: 14400, dzTransferred: true, dzTransferredAmount: 9000 })).toBe(5400);
  });
});

describe('US$', () => {
  it('netUsd = redondeo(Te queda ÷ cotización)', () => {
    const calc = calculateStay(withPayments(0, 100000), config);
    expect(calc.netUsd).toBe(Math.round(calc.netArs / 1700));
  });
});

describe('calculatePureDailyRate', () => {
  it('crece cuando bajan los días (el componente fijo se reparte en menos días)', () => {
    const rate5 = calculatePureDailyRate(5, config);
    const rate8 = calculatePureDailyRate(8, config);
    const rate45 = calculatePureDailyRate(45, config);
    expect(rate5).toBeGreaterThan(rate8);
    expect(rate8).toBeGreaterThan(rate45);
  });
});

describe('formatPercent', () => {
  it('muestra la tasa como porcentaje con coma decimal', () => {
    expect(formatPercent(0.18)).toBe('18%');
    expect(formatPercent(0.2)).toBe('20%');
    expect(formatPercent(0.185)).toBe('18,5%');
  });
});

describe('pureTransportShare', () => {
  it('es 2/3 del transporte base y coincide con el cálculo puro', () => {
    expect(Math.round(pureTransportShare(config))).toBe(23467);
    expect(calculatePureDailyRate(5, config)).toBe(Math.round(PURE_DAILY_BASE + pureTransportShare(config) / 5));
  });

  it('sigue la configuración de litros y precio del litro', () => {
    const otro = { ...config, baseTransportLiters: 20, fuelPricePerLiter: 3000 };
    expect(pureTransportShare(otro)).toBe(40000);
  });
});
