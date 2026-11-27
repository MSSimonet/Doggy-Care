import { describe, it, expect } from 'vitest';
import {
  stayFromRow,
  stayToRow,
  historyFromRow,
  historyToRow,
  missingOptionalColumn
} from './mapeoDb';
import { calculateStay } from '../utils/calculations';
import { HISTORICAL_STAYS } from '../data/historialData';
import type { AppConfig, Stay } from '../types';

const stay: Stay = {
  id: 'stay-1',
  dogName: 'Rex',
  clientName: 'Ana',
  clientPhone: '555-0100',
  dogBreed: 'Mestizo',
  fromDay: '2026-10-01',
  untilDay: '2026-10-05',
  days: 5,
  dailyRate: 20000,
  isCapital: false,
  customKm: 0,
  additionalFeatures: { expenses: 1500, bath: 3000, moneyAdvance: 20000, tip: 500 },
  amountPaid: 50000,
  dzRate: 0.15,
  dzTransferred: true,
  dzTransferredAmount: 9000,
  notes: 'Come dos veces',
  savedToHistory: false,
  historyRecordId: 'hist-9',
  dogId: 'dog-42'
};

describe('mapeo de estadías: ida y vuelta', () => {
  it('guarda dz_rate y dog_id en la fila', () => {
    const row = stayToRow(stay);
    expect(row.dz_rate).toBe(0.15);
    expect(row.dog_id).toBe('dog-42');
    expect(row.custom_km).toBe(0);
  });

  it('leer lo guardado devuelve la misma estadía', () => {
    expect(stayFromRow(stayToRow(stay))).toEqual(stay);
  });

  it('sin porcentaje ni perro guarda null', () => {
    const row = stayToRow({ ...stay, dzRate: undefined, dogId: undefined });
    expect(row.dz_rate).toBeNull();
    expect(row.dog_id).toBeNull();
  });

  it('dz_rate vacío usa el porcentaje de la configuración', () => {
    const row = { ...stayToRow(stay), dz_rate: null };
    expect(stayFromRow(row).dzRate).toBeUndefined();
    expect(stayFromRow(row, 0.18).dzRate).toBe(0.18);
  });

  it('dz_rate llega como texto desde numeric(5,4) y se convierte en número', () => {
    const row = { ...stayToRow(stay), dz_rate: '0.1500' };
    expect(stayFromRow(row).dzRate).toBe(0.15);
  });

  it('el cálculo usa el porcentaje guardado, o el de Ajustes si vino vacío', () => {
    const config = { dzRate: 0.18, defaultCapitalKm: 90, fuelPricePerLiter: 2200, fuelConsumptionKmPerLiter: 8.64,
      exchangeRates: { usdRate: 1700 } } as unknown as AppConfig;
    expect(calculateStay(stayFromRow(stayToRow(stay)), config).dzRate).toBe(0.15);
    expect(calculateStay(stayFromRow({ ...stayToRow(stay), dz_rate: null }), config).dzRate).toBe(0.18);
  });
});

describe('mapeo del historial: ida y vuelta', () => {
  const record = { ...HISTORICAL_STAYS[0], dzRate: 0.16, dzTransferred: true, dzTransferredAmount: 1000, dogId: 'dog-7' };

  it('guarda dz_rate y dog_id en la fila', () => {
    const row = historyToRow(record);
    expect(row.dz_rate).toBe(0.16);
    expect(row.dog_id).toBe('dog-7');
  });

  it('leer lo guardado devuelve el mismo registro', () => {
    expect(historyFromRow(historyToRow(record))).toEqual(record);
  });

  it('dz_rate vacío usa el porcentaje de la configuración', () => {
    const row = { ...historyToRow(record), dz_rate: null, dog_id: null };
    const back = historyFromRow(row, 0.18);
    expect(back.dzRate).toBe(0.18);
    expect(back.dogId).toBeUndefined();
  });
});

describe('columnas que la base todavía no tiene', () => {
  it('reconoce las columnas de las migraciones 003 y 004 en el mensaje de error', () => {
    expect(missingOptionalColumn("Could not find the 'dz_rate' column of 'stays' in the schema cache")).toBe('dz_rate');
    expect(missingOptionalColumn("Could not find the 'dog_id' column of 'stays'")).toBe('dog_id');
    expect(missingOptionalColumn("Could not find the 'dz_transferred_amount' column")).toBe('dz_transferred_amount');
    // historical_stays de la base real no tiene el tilde (migración 005)
    expect(missingOptionalColumn("Could not find the 'dz_transferred' column of 'historical_stays' in the schema cache")).toBe('dz_transferred');
    expect(missingOptionalColumn('permission denied for table stays')).toBeNull();
    expect(missingOptionalColumn(undefined)).toBeNull();
  });
});

describe('estadía finalizada (en Cobros)', () => {
  it('se guarda en saved_to_history y se lee de vuelta sin necesitar una columna nueva', () => {
    const fila = stayToRow({ id: 's1', dogName: 'Luna', fromDay: '2026-11-01', untilDay: '2026-11-05', days: 5, dailyRate: 20000, isCapital: true, additionalFeatures: { expenses: 0, bath: 0, moneyAdvance: 0, tip: 0 }, amountPaid: 0, finalizada: true });
    expect(fila.saved_to_history).toBe(true);
    expect(stayFromRow({ ...fila, history_record_id: null }).finalizada).toBe(true);
  });

  it('una estadía de la Agenda (saved_to_history = false) o una ligada a un registro no es finalizada', () => {
    expect(stayFromRow({ id: 's', dog_name: 'X', saved_to_history: false, history_record_id: null, additional: {} }).finalizada).toBeUndefined();
    expect(stayFromRow({ id: 's', dog_name: 'X', saved_to_history: true, history_record_id: 'hist-1' }).finalizada).toBeUndefined();
  });
});
