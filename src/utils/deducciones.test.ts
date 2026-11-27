import { describe, expect, it } from 'vitest';
import type { AppConfig, Stay } from '../types';
import type { HistoricalStayRecord } from '../data/historialData';
import { defaultAppConfig } from '../data/initialData';
import { calculateStay } from './calculations';
import { completarConfig, fechasDeFin, resumirDeducciones, tasaParaFin, tasaPorAño } from './deducciones';
import { aplicarMarcas, faltaColumnaTilde } from '../lib/marcasDeduccion';

const AHORA = Date.UTC(2026, 10, 26);
const config: AppConfig = completarConfig(defaultAppConfig);

const reg = (id: string, dogName: string, rowIndex: number, fromDay: string, untilDay: string, dz: number, extra: Partial<HistoricalStayRecord> = {}): HistoricalStayRecord =>
  ({ id, rowIndex, dogName, rawDogName: dogName, fromDay, untilDay, days: 3, totalPagar: Math.round(dz / 0.18), totalPagarRaw: '', dz, neto: 0, fuel: 0, mixta: 0, soloUsd: 0, dailyRate: 20000, dailyRateRaw: '', pureRate: 0, pureRateRaw: '', ifmDaily: 0, totalIfm: 0, netoEuros: 0, dzRate: 0.18, ...extra }) as HistoricalStayRecord;

const estadia = (id: string, dogName: string, fromDay: string, untilDay: string, cobrado: number, extra: Partial<Stay> = {}): Stay => ({
  id, dogName, fromDay, untilDay, days: 0, dailyRate: 10000, isCapital: true,
  additionalFeatures: { expenses: 0, bath: 0, moneyAdvance: 0, tip: 0 }, amountPaid: cobrado, dzRate: 0.18, ...extra
});

describe('tasa por año', () => {
  it('2026 → 18 %, 2027 → 19 %, años posteriores usan la última, anteriores la primera', () => {
    const tabla = config.dzRatesByYear;
    expect(tasaPorAño(2026, tabla)).toBe(0.18);
    expect(tasaPorAño(2027, tabla)).toBe(0.19);
    expect(tasaPorAño(2031, tabla)).toBe(0.19);
    expect(tasaPorAño(2025, tabla)).toBe(0.18);
    expect(tasaPorAño(2026, undefined)).toBeUndefined();
  });

  it('se decide por el año de la fecha de FIN: una estadía que cruza de año usa la del año nuevo', () => {
    expect(tasaParaFin('2026-12-31', config)).toBe(0.18);
    expect(tasaParaFin('2027-01-03', config)).toBe(0.19);
    const cruza = estadia('s1', 'Bruno', '2026-12-26', '2027-01-03', 100000);
    const calc = calculateStay(cruza, config);
    expect(calc.dzRate).toBe(0.19);
    // monto correcto: 19 % de lo cobrado (hasta el total: 9 días × 10.000 = 90.000)
    expect(calc.dzGenerated).toBeCloseTo(90000 * 0.19);
  });

  it('las tasas vienen de la configuración, no del código', () => {
    const otra = { ...config, dzRatesByYear: { '2026': 0.2 } };
    expect(calculateStay(estadia('s1', 'A', '2026-05-01', '2026-05-02', 20000), otra).dzRate).toBe(0.2);
  });

  it('una configuración guardada antes (sin tabla ni fecha de inicio) se completa con los valores por defecto', () => {
    const vieja = { ...defaultAppConfig, dzRatesByYear: undefined, dzStartDate: undefined };
    expect(completarConfig(vieja)).toMatchObject({ dzRatesByYear: { '2026': 0.18, '2027': 0.19 }, dzStartDate: '2026-01-01' });
  });
});

describe('fechas de fin de los registros "D/M" (sin año)', () => {
  it('recorre la planilla desde el más nuevo y resta un año al cruzar de enero a diciembre', () => {
    const registros = [
      reg('a', 'Ramón', 4, '1/12', '10/12', 100),
      reg('b', 'Tango', 5, '20/12', '5/01', 100),
      reg('c', 'Luna', 6, '3/10', '8/10', 100),
      reg('d', 'Tobías', 7, '21/11', '24/11', 100)
    ];
    const fines = fechasDeFin(registros, AHORA);
    expect(fines.get('d')).toBe('2026-11-24');
    expect(fines.get('c')).toBe('2026-10-08');
    expect(fines.get('b')).toBe('2026-01-05');
    expect(fines.get('a')).toBe('2025-12-10');
  });

  it('un registro archivado desde la app usa la hora de archivado de su id', () => {
    const ms = Date.UTC(2026, 9, 20);
    const fines = fechasDeFin([reg(`hist-agenda-s9-${ms}`, 'Kiara', 50, '15/10', '19/10', 100)], AHORA);
    expect(fines.get(`hist-agenda-s9-${ms}`)).toBe('2026-10-19');
  });
});

describe('deducciones pendientes', () => {
  const registros = [
    reg('h1', 'Rocky', 10, '2026-02-10', '2026-02-15', 21600),
    reg('h2', 'Nina', 11, '2026-08-03', '2026-08-10', 31680),
    reg('h3', 'Rocky', 12, '2026-10-05', '2026-10-09', 19800),
    reg('h0', 'Candela', 9, '2025-07-14', '2025-07-21', 32000),
    reg('h4', 'Tony', 13, '2026-06-01', '2026-06-05', 18000, { dzTransferred: true, dzTransferredAmount: 18000, dzTransferredAt: '2026-06-10T12:00:00.000Z' })
  ];

  it('agrupa perro por perro con subtotal, la estadía más reciente arriba, y el total arriba', () => {
    const r = resumirDeducciones({ registros, config, ahoraMs: AHORA });
    expect(r.total).toBe(21600 + 31680 + 19800);
    const rocky = r.porPerro.find(g => g.dogName === 'Rocky')!;
    expect(rocky.subtotal).toBe(41400);
    expect(rocky.items.map(i => i.id)).toEqual(['h3', 'h1']);
    expect(r.porPerro[0].dogName).toBe('Rocky');
  });

  it('cuenta sólo registros del Historial: una estadía de la Agenda (actual o futura) no suma aunque tenga cobrado', () => {
    // Una reserva de 2027 con seña y una estadía en curso: son Stay de la Agenda y la función ni las recibe
    const futura = estadia('s1', 'Bruno', '2026-12-26', '2027-01-03', 50000);
    const enCurso = estadia('s2', 'Nina', '2026-11-24', '2026-11-29', 40000);
    expect(calculateStay(futura, config).dzGenerated).toBeGreaterThan(0);
    expect(calculateStay(enCurso, config).dzGenerated).toBeGreaterThan(0);
    const r = resumirDeducciones({ registros, config, ahoraMs: AHORA });
    expect(r.pendientes.map(i => i.dogName)).not.toContain('Bruno');
    expect(r.total).toBe(21600 + 31680 + 19800);
  });

  it('un registro ligado a una estadía que sigue en la Agenda tampoco suma hasta que se finaliza', () => {
    const r = resumirDeducciones({ registros, config, ahoraMs: AHORA, excluir: new Set(['h2']) });
    expect(r.pendientes.some(i => i.id === 'h2')).toBe(false);
    expect(r.total).toBe(21600 + 19800);
  });

  it('fecha de corte: lo que termina antes no cuenta (por defecto 1/1/2026)', () => {
    const r = resumirDeducciones({ registros, config, ahoraMs: AHORA });
    expect(r.pendientes.map(i => i.id).sort()).toEqual(['h1', 'h2', 'h3']);
    const corte = resumirDeducciones({ registros, config: { ...config, dzStartDate: '2026-08-01' }, ahoraMs: AHORA });
    expect(corte.pendientes.map(i => i.id).sort()).toEqual(['h2', 'h3']);
    expect(corte.total).toBe(31680 + 19800);
  });

  it('las transferidas salen de pendientes y quedan aparte con su fecha', () => {
    const r = resumirDeducciones({ registros, config, ahoraMs: AHORA });
    expect(r.pendientes.some(i => i.id === 'h4')).toBe(false);
    expect(r.transferidas).toEqual([expect.objectContaining({ id: 'h4', monto: 18000, transferidaEn: '2026-06-10T12:00:00.000Z' })]);
  });
});

describe('tilde guardado en el dispositivo (mientras la nube no tiene la columna)', () => {
  it('releer la nube sin la columna no borra el tilde: se usa el del dispositivo', () => {
    const deLaNube = [reg('h1', 'Rocky', 10, '2026-02-10', '2026-02-15', 21600, { dzTransferred: undefined })];
    expect(faltaColumnaTilde(deLaNube)).toBe(true);
    const marcas = { h1: { dzTransferred: true, dzTransferredAmount: 21600, dzTransferredAt: '2026-11-26T10:00:00.000Z' } };
    const r = resumirDeducciones({ registros: aplicarMarcas(deLaNube, marcas), config, ahoraMs: AHORA });
    expect(r.pendientes).toEqual([]);
    expect(r.transferidas[0]).toMatchObject({ id: 'h1', transferidaEn: '2026-11-26T10:00:00.000Z' });
  });

  it('con la columna en la nube, manda lo de la nube', () => {
    const deLaNube = [reg('h1', 'Rocky', 10, '2026-02-10', '2026-02-15', 21600, { dzTransferred: false })];
    expect(faltaColumnaTilde(deLaNube)).toBe(false);
    const marcas = { h1: { dzTransferred: true, dzTransferredAmount: 21600 } };
    expect(aplicarMarcas(deLaNube, marcas)[0].dzTransferred).toBe(false);
  });
});
