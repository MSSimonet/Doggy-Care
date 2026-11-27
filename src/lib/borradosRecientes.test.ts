import { beforeEach, describe, expect, it } from 'vitest';
import type { HistoricalStayRecord } from '../data/historialData';
import { guardarBorrado, leerBorrados, MAX_BORRADOS, quitarBorrado } from './borradosRecientes';

const reg = (n: number): HistoricalStayRecord =>
  ({ id: `h${n}`, rowIndex: n, dogName: `Perro ${n}`, rawDogName: '', fromDay: '1/1', untilDay: '2/1', days: 2, totalPagar: 0, totalPagarRaw: '', dz: 0, neto: 0, fuel: 0, mixta: 0, soloUsd: 0, dailyRate: 0, dailyRateRaw: '', pureRate: 0, pureRateRaw: '', ifmDaily: 0, totalIfm: 0, netoEuros: 0 }) as HistoricalStayRecord;

beforeEach(() => localStorage.clear());

describe('borrados recientes', () => {
  it('guarda la copia completa del registro, el más reciente primero', () => {
    expect(guardarBorrado(reg(1), '2026-11-26T10:00:00.000Z')).toBe(true);
    expect(guardarBorrado(reg(2), '2026-11-26T11:00:00.000Z')).toBe(true);
    expect(leerBorrados().map(b => b.registro.id)).toEqual(['h2', 'h1']);
    expect(leerBorrados()[1].registro).toEqual(reg(1));
  });

  it('conserva sólo los últimos 30', () => {
    for (let i = 1; i <= MAX_BORRADOS + 5; i++) guardarBorrado(reg(i));
    const lista = leerBorrados();
    expect(lista).toHaveLength(MAX_BORRADOS);
    expect(lista[0].registro.id).toBe(`h${MAX_BORRADOS + 5}`);
    expect(lista.some(b => b.registro.id === 'h1')).toBe(false);
  });

  it('el mismo registro no se repite y quitar lo saca', () => {
    guardarBorrado(reg(1));
    guardarBorrado(reg(1));
    expect(leerBorrados()).toHaveLength(1);
    quitarBorrado('h1');
    expect(leerBorrados()).toEqual([]);
    expect(localStorage.getItem('pensionados_borrados_recientes')).toBeNull();
  });

  it('un contenido dañado se ignora sin romper', () => {
    localStorage.setItem('pensionados_borrados_recientes', '{no es json');
    expect(leerBorrados()).toEqual([]);
    expect(guardarBorrado(reg(1))).toBe(true);
    expect(leerBorrados()).toHaveLength(1);
  });
});
