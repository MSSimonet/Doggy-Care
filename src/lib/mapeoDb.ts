import type { Stay } from '../types';
import type { HistoricalStayRecord } from '../data/historialData';

// Conversión entre filas de Supabase (snake_case) y objetos de la app.
// Sin dependencias del cliente para poder probar ida y vuelta.

// Columnas agregadas por migraciones que pueden no estar corridas todavía
// (dz_transferred va después de dz_transferred_amount y dz_transferred_at: su nombre está contenido en esos)
const OPTIONAL_COLUMNS = [
  'dz_transferred_amount',
  'dz_transferred_at',
  'dz_transferred',
  'dz_rate',
  'dog_id',
  'dz_rates_by_year',
  'dz_start_date'
] as const;
export type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];

export function missingOptionalColumn(message: string | undefined): OptionalColumn | null {
  if (!message) return null;
  // Primero el nombre exacto entre comillas (como lo devuelve PostgREST), después cualquier mención
  return OPTIONAL_COLUMNS.find(col => message.includes(`'${col}'`)) ?? OPTIONAL_COLUMNS.find(col => message.includes(col)) ?? null;
}

// Vacío (null/undefined/no numérico) = usar el porcentaje de la configuración
function readRate(value: unknown, fallback?: number): number | undefined {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function stayFromRow(row: any, defaultDzRate?: number): Stay {
  return {
    id: row.id,
    dogName: row.dog_name,
    clientName: row.client_name,
    clientPhone: row.client_phone,
    dogBreed: row.dog_breed,
    fromDay: row.from_day,
    untilDay: row.until_day,
    days: row.days,
    dailyRate: row.daily_rate,
    isCapital: row.is_capital,
    customKm: row.custom_km ?? undefined,
    additionalFeatures: {
      expenses: row.expenses || 0,
      bath: row.bath || 0,
      moneyAdvance: row.money_advance || 0,
      tip: row.tip || 0
    },
    amountPaid: row.amount_paid || 0,
    dzRate: readRate(row.dz_rate, defaultDzRate),
    dzTransferred: row.dz_transferred || false,
    dzTransferredAmount: row.dz_transferred_amount ?? undefined,
    dzTransferredAt: row.dz_transferred_at || undefined,
    notes: row.notes || '',
    savedToHistory: row.saved_to_history || false,
    // Finalizada = saved_to_history sin registro ligado (columna que ya existe: no hace falta una migración)
    finalizada: row.saved_to_history && !row.history_record_id ? true : undefined,
    historyRecordId: row.history_record_id || undefined,
    dogId: row.dog_id || undefined
  };
}

export function stayToRow(stay: Stay) {
  return {
    id: stay.id,
    dog_name: stay.dogName,
    client_name: stay.clientName || null,
    client_phone: stay.clientPhone || null,
    dog_breed: stay.dogBreed || null,
    from_day: stay.fromDay,
    until_day: stay.untilDay,
    days: stay.days,
    daily_rate: stay.dailyRate,
    is_capital: stay.isCapital,
    custom_km: stay.customKm ?? null,
    expenses: stay.additionalFeatures?.expenses || 0,
    bath: stay.additionalFeatures?.bath || 0,
    money_advance: stay.additionalFeatures?.moneyAdvance || 0,
    tip: stay.additionalFeatures?.tip || 0,
    amount_paid: stay.amountPaid || 0,
    dz_rate: stay.dzRate ?? null,
    dz_transferred: stay.dzTransferred || false,
    dz_transferred_amount: stay.dzTransferredAmount ?? 0,
    dz_transferred_at: stay.dzTransferredAt || null,
    notes: stay.notes || null,
    saved_to_history: Boolean(stay.finalizada) || stay.savedToHistory || false,
    history_record_id: stay.historyRecordId || null,
    dog_id: stay.dogId || null
  };
}

export function historyFromRow(row: any, defaultDzRate?: number): HistoricalStayRecord {
  return {
    id: row.id,
    rowIndex: row.row_index || 0,
    dogName: row.dog_name,
    rawDogName: row.raw_dog_name || row.dog_name,
    fromDay: row.from_day,
    untilDay: row.until_day,
    days: row.days,
    totalPagar: row.total_pagar,
    totalPagarRaw: row.total_pagar_raw || Number(row.total_pagar).toLocaleString('es-AR'),
    dz: row.dz,
    neto: row.neto,
    fuel: row.fuel || 0,
    mixta: row.mixta || 0,
    soloUsd: row.solo_usd || 0,
    dailyRate: row.daily_rate,
    dailyRateRaw: row.daily_rate_raw || Number(row.daily_rate).toLocaleString('es-AR'),
    pureRate: row.pure_rate,
    pureRateRaw: row.pure_rate_raw || Number(row.pure_rate).toLocaleString('es-AR'),
    ifmDaily: row.ifm_daily || 0,
    totalIfm: row.total_ifm || 0,
    netoEuros: row.neto_euros || 0,
    dzRate: readRate(row.dz_rate, defaultDzRate),
    // Sin la columna (migración 005 sin aplicar) queda undefined: así se sabe que la nube no tiene el tilde
    // y se usa el guardado en este dispositivo (src/lib/marcasDeduccion.ts)
    dzTransferred: 'dz_transferred' in row ? Boolean(row.dz_transferred) : undefined,
    dzTransferredAmount: row.dz_transferred_amount ?? undefined,
    dzTransferredAt: row.dz_transferred_at || undefined,
    dogId: row.dog_id || undefined
  };
}

export function historyToRow(record: HistoricalStayRecord) {
  return {
    id: record.id,
    row_index: record.rowIndex,
    dog_name: record.dogName,
    raw_dog_name: record.rawDogName,
    from_day: record.fromDay,
    until_day: record.untilDay,
    days: record.days,
    total_pagar: record.totalPagar,
    total_pagar_raw: record.totalPagarRaw,
    dz: record.dz,
    neto: record.neto,
    fuel: record.fuel,
    mixta: record.mixta,
    solo_usd: record.soloUsd,
    daily_rate: record.dailyRate,
    daily_rate_raw: record.dailyRateRaw,
    pure_rate: record.pureRate,
    pure_rate_raw: record.pureRateRaw,
    ifm_daily: record.ifmDaily,
    total_ifm: record.totalIfm,
    neto_euros: record.netoEuros,
    dz_rate: record.dzRate ?? null,
    dz_transferred: Boolean(record.dzTransferred),
    dz_transferred_amount: record.dzTransferredAmount ?? 0,
    dz_transferred_at: record.dzTransferredAt || null,
    dog_id: record.dogId || null
  };
}
