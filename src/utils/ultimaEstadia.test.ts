import { describe, expect, it } from 'vitest';
import type { HistoricalStayRecord } from '../data/historialData';
import { fechaCorta, ultimaEstadiaDe } from './ultimaEstadia';

const reg = (id: string, dogName: string, rowIndex: number, fromDay: string, untilDay: string, dailyRate: number, totalPagar: number): HistoricalStayRecord =>
  ({ id, rowIndex, dogName, rawDogName: dogName, fromDay, untilDay, days: 3, totalPagar, totalPagarRaw: '', dz: 0, neto: 0, fuel: 0, mixta: 0, soloUsd: 0, dailyRate, dailyRateRaw: '', pureRate: 0, pureRateRaw: '', ifmDaily: 0, totalIfm: 0, netoEuros: 0 }) as HistoricalStayRecord;

const registros = [
  reg('hist-30', 'Tobías ', 33, '17/10', '21/10', 21000, 105000),
  reg('hist-31', 'Tobias', 34, '13/11', '15/11', 21000, 63000),
  reg('hist-32', 'Tobías', 35, '21/11', '24/11', 21000, 84000),
  reg('hist-10', 'Ramón', 13, '2023-04-03', '2023-04-27', 15000, 360000),
  reg('hist-40', 'ramon ', 43, '5/10', '14/10', 19000, 190000),
  reg('hist-5', 'Luna', 8, '1/6', '8/6', 24000, 192000)
];

describe('fechaCorta', () => {
  it('lleva ISO y D/M a "D/M" sin ceros', () => {
    expect(fechaCorta('2026-11-21')).toBe('21/11');
    expect(fechaCorta('5/01')).toBe('5/1');
    expect(fechaCorta('21/11')).toBe('21/11');
    expect(fechaCorta('')).toBe('');
  });
});

describe('ultimaEstadiaDe', () => {
  it('perro con historial: devuelve su última estadía con fechas, tarifa y total', () => {
    const u = ultimaEstadiaDe(registros, 'Luna')!;
    expect(u).toMatchObject({ desde: '1/6', hasta: '8/6', tarifaDiaria: 24000, total: 192000, cantidad: 1 });
  });

  it('perro sin historial: null', () => {
    expect(ultimaEstadiaDe(registros, 'Pochito')).toBeNull();
    expect(ultimaEstadiaDe(registros, '   ')).toBeNull();
  });

  it('nombres con distinta escritura cuentan como el mismo perro', () => {
    for (const escrito of ['tobias', 'TOBÍAS', ' Tobias  ', 'Tobías']) {
      expect(ultimaEstadiaDe(registros, escrito)?.registro.id).toBe('hist-32');
    }
    expect(ultimaEstadiaDe(registros, 'RAMÓN')?.registro.id).toBe('hist-40');
    expect(ultimaEstadiaDe(registros, 'tobias')?.cantidad).toBe(3);
  });

  it('con varias estadías toma la más reciente (mayor ID/secuencia), no la de fecha mayor ni la última del arreglo', () => {
    const desordenados = [registros[2], registros[0], registros[1]];
    expect(ultimaEstadiaDe(desordenados, 'tobias')).toMatchObject({ desde: '21/11', hasta: '24/11', total: 84000 });
  });

  it('una estadía archivada desde la app (con hora) gana a las importadas', () => {
    const ahora = Date.parse('2026-11-26T12:00:00Z');
    const conHora = [...registros, reg(`hist-agenda-stay-9-${ahora}`, 'Tobias', 36, '1/11', '3/11', 25000, 75000)];
    expect(ultimaEstadiaDe(conHora, 'Tobías', ahora)).toMatchObject({ desde: '1/11', hasta: '3/11', tarifaDiaria: 25000 });
  });
});
