import { describe, expect, it } from 'vitest';
import type { HistoricalStayRecord } from '../data/historialData';
import type { Operacion } from './colaPendientes';
import { historialDesdeLaNube } from './historialNube';
import { historyFromRow } from './mapeoDb';
import { resumirDeducciones } from '../utils/deducciones';
import { defaultAppConfig } from '../data/initialData';

const fila = (id: string, extra: Record<string, unknown> = {}) => ({
  id, row_index: 5, dog_name: 'Rocky', raw_dog_name: 'Rocky', from_day: '2026-10-05', until_day: '2026-10-09', days: 5,
  total_pagar: 110000, dz: 19800, neto: 90200, daily_rate: 22000, pure_rate: 22000, ...extra
});
const op = (o: Partial<Operacion>): Operacion => ({ id: 'o1', tipo: 'parche', tabla: 'historical_stays', clave: 'h1', creada: 0, intentos: 0, estado: 'pendiente', ...o });
const pendientes = (registros: HistoricalStayRecord[]) =>
  resumirDeducciones({ registros, config: defaultAppConfig, ahoraMs: Date.UTC(2026, 10, 26) }).pendientes.map(i => i.id);
const MARCA = { h1: { dzTransferred: true, dzTransferredAmount: 19800, dzTransferredAt: '2026-11-26T12:00:00.000Z' } };

describe('relectura de la nube y tilde de transferida', () => {
  it('sin la columna en la nube (migración 005 sin aplicar) el registro llega sin tilde', () => {
    expect(historyFromRow(fila('h1')).dzTransferred).toBeUndefined();
    expect(historyFromRow(fila('h1', { dz_transferred: false })).dzTransferred).toBe(false);
  });

  it('releer la nube no pisa el tilde: el registro sigue transferido y no vuelve a Pendientes', () => {
    const nube = [historyFromRow(fila('h1'))];
    expect(pendientes(nube)).toEqual(['h1']); // sin el guardado del dispositivo volvería
    const mostrado = historialDesdeLaNube({ nube, borrados: [], marcas: MARCA, ops: [] });
    expect(mostrado[0]).toMatchObject({ dzTransferred: true, dzTransferredAmount: 19800, dzTransferredAt: '2026-11-26T12:00:00.000Z' });
    expect(pendientes(mostrado)).toEqual([]);
  });

  it('se mantiene al leer varias veces seguidas (cada sincronización)', () => {
    const nube = [historyFromRow(fila('h1'))];
    for (let i = 0; i < 3; i++) {
      expect(pendientes(historialDesdeLaNube({ nube, borrados: [], marcas: MARCA, ops: [] }))).toEqual([]);
    }
  });

  it('destildar también se recuerda: no vuelve a quedar transferido al releer', () => {
    const marcas = { h1: { dzTransferred: false, dzTransferredAmount: 0 } };
    const mostrado = historialDesdeLaNube({ nube: [historyFromRow(fila('h1'))], borrados: [], marcas, ops: [] });
    expect(mostrado[0].dzTransferred).toBe(false);
    expect(pendientes(mostrado)).toEqual(['h1']);
  });

  it('con la columna en la nube, manda lo que dice la nube', () => {
    const nube = [historyFromRow(fila('h1', { dz_transferred: false, dz_transferred_amount: 0 }))];
    expect(historialDesdeLaNube({ nube, borrados: [], marcas: MARCA, ops: [] })[0].dzTransferred).toBe(false);
    const transferido = [historyFromRow(fila('h1', { dz_transferred: true, dz_transferred_amount: 19800, dz_transferred_at: '2026-11-20T10:00:00Z' }))];
    expect(pendientes(historialDesdeLaNube({ nube: transferido, borrados: [], marcas: {}, ops: [] }))).toEqual([]);
  });

  it('un tilde que todavía está en la cola (sin conexión) se ve aplicado aunque la nube diga otra cosa', () => {
    const nube = [historyFromRow(fila('h1', { dz_transferred: false }))];
    const ops = [op({ datos: { dzTransferred: true, dzTransferredAmount: 19800, dzTransferredAt: '2026-11-26T12:00:00.000Z' } })];
    const mostrado = historialDesdeLaNube({ nube, borrados: [], marcas: {}, ops });
    expect(pendientes(mostrado)).toEqual([]);
  });

  it('no mezcla tildes de otros registros ni trae de vuelta los borrados', () => {
    const nube = [historyFromRow(fila('h1')), historyFromRow(fila('h2')), historyFromRow(fila('h3'))];
    const mostrado = historialDesdeLaNube({ nube, borrados: ['h3'], marcas: MARCA, ops: [] });
    expect(mostrado.map(r => r.id)).toEqual(['h1', 'h2']);
    expect(pendientes(mostrado)).toEqual(['h2']);
  });
});
