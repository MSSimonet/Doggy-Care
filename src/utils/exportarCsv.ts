import type { Stay, StayCalculations } from '../types';
import type { DatoPrivado } from '../lib/privacidad';

/** Cómo se muestra un dato personal en la exportación: el dato, o su máscara si el modo privacidad está activo. */
export type Enmascarar = (tipo: DatoPrivado, valor: string | null | undefined) => string;

export const ENCABEZADOS_CSV = [
  'Perro',
  'Dueño / Cliente',
  'Desde',
  'Hasta',
  'Días',
  'Precio Asignado/Día',
  'Cálculo Puro/Día',
  'IFM Diario',
  'Total IFM',
  'Total',
  'Cobrado',
  'Deducción generada',
  'Deducción por transferir',
  'Te queda ARS',
  'Te queda USD',
  'Ubicación',
  'Km',
  'Costo traslado',
  'Falta cobrar',
  'A favor del cliente'
] as const;

/**
 * Arma el CSV (separado por ";") de la agenda activa. Con el modo privacidad activo, el nombre del dueño sale
 * enmascarado igual que en pantalla (`enmascarar`): la exportación nunca trae un dato que la pantalla oculta.
 * El resto de las columnas son datos de la estadía (fechas, importes, "Capital/Provincia"), no datos personales.
 */
export function construirCsvEstadias(items: { stay: Stay; calc: StayCalculations }[], enmascarar: Enmascarar): string {
  const filas = items.map(({ stay, calc }) => [
    `"${stay.dogName}"`,
    `"${enmascarar('dueno', stay.clientName)}"`,
    stay.fromDay,
    stay.untilDay,
    stay.days,
    stay.dailyRate,
    calc.pureDailyRate,
    calc.ifmDaily,
    calc.totalIfm,
    calc.totalCharge,
    calc.collected,
    Math.round(calc.dzGenerated),
    Math.round(calc.dzPending),
    Math.round(calc.netArs),
    calc.netUsd,
    stay.isCapital ? 'Capital' : 'Provincia',
    calc.kmApplied,
    Math.round(calc.fuelCost),
    calc.totalAdeudado,
    calc.creditBalance
  ]);
  return [ENCABEZADOS_CSV.join(';'), ...filas.map(f => f.join(';'))].join('\n');
}
