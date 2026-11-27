import { AppConfig, Stay, StayCalculations } from '../types';
import { tasaParaFin } from './tasasDeduccion';

/**
 * Cálculo puro de la app para cobrar por día según la fórmula del Excel:
 * Base de costo operativo puro por día = 12.393,67 + (Transporte Base * 2/3) / días
 * Para 5 días = $17.087
 * Para 8 días = $15.327
 * Para 45 días = $12.915
 */
/** Parte fija diaria del cálculo puro (planilla Excel). */
export const PURE_DAILY_BASE = 12393.67;

/** Transporte base repartido en la estadía: (litros base * precio del litro) * 2/3. */
export const pureTransportShare = (config: AppConfig): number =>
  (config.baseTransportLiters || 16) * (config.fuelPricePerLiter || 2200) * (2 / 3);

export const calculatePureDailyRate = (days: number, config: AppConfig): number => {
  const safeDays = Math.max(1, days || 1);
  return Math.round(PURE_DAILY_BASE + pureTransportShare(config) / safeDays);
};

/** 0.18 -> "18%", 0.185 -> "18,5%" */
export const formatPercent = (rate: number): string =>
  `${(Math.round(rate * 1000) / 10).toLocaleString('es-AR')}%`;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Días = (hasta - desde) + 1: el día de llegada y el de salida cuentan. null si las fechas no sirven. */
export const calcDays = (fromDay: string, untilDay: string): number | null => {
  const from = Date.parse(`${fromDay}T00:00:00Z`);
  const until = Date.parse(`${untilDay}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(until) || until < from) return null;
  return Math.round((until - from) / MS_PER_DAY) + 1;
};

/** Costo del traslado por km = precio de la nafta ÷ rendimiento (los dos de Ajustes). */
export const costPerKm = (config: AppConfig): number =>
  config.fuelConsumptionKmPerLiter > 0 ? config.fuelPricePerLiter / config.fuelConsumptionKmPerLiter : 0;

/**
 * Monto de deducción ya transferido. Las estadías anteriores a dz_transferred_amount
 * sólo tienen el tilde: si está tildado y no hay monto, se toma como transferido todo lo generado.
 */
const effectiveDzTransferred = (flag: boolean | undefined, amount: number | undefined, generated: number): number =>
  amount !== undefined && amount !== null && amount > 0 ? amount : (flag ? generated : 0);

/** Deducción del historial que falta transferir (no cambia el estado de los registros viejos). */
export const historyDzPending = (record: { dz: number; dzTransferred?: boolean; dzTransferredAmount?: number }): number =>
  Math.max(0, (record.dz || 0) - effectiveDzTransferred(record.dzTransferred, record.dzTransferredAmount, record.dz || 0));

export const calculateStay = (stay: Stay, config: AppConfig): StayCalculations => {
  const days = calcDays(stay.fromDay, stay.untilDay) ?? Math.max(1, stay.days || 1);
  const totalGross = days * (stay.dailyRate || 0);
  const extras = stay.additionalFeatures || { expenses: 0, bath: 0, moneyAdvance: 0, tip: 0 };

  // Total que paga el cliente: días × tarifa + baño + gastos (la propina no suma)
  const totalCharge = totalGross + (extras.expenses || 0) + (extras.bath || 0);

  // Cobrado = seña o adelanto + ya cobrado
  const collected = (extras.moneyAdvance || 0) + (stay.amountPaid || 0);
  const totalAdeudado = Math.max(0, totalCharge - collected);
  const creditBalance = Math.max(0, collected - totalCharge);

  // Deducción: la tasa del año de la fecha de fin (tabla de Ajustes); sin tabla, el porcentaje de la estadía o el de Ajustes
  const dzRate = tasaParaFin(stay.untilDay, config) ?? stay.dzRate ?? config.dzRate;
  const dzOnTotal = totalCharge * dzRate;
  // Sobre lo cobrado hasta el total: lo cobrado de más no genera deducción
  const dzGenerated = Math.min(collected, totalCharge) * dzRate;
  const dzTransferredAmount = effectiveDzTransferred(stay.dzTransferred, stay.dzTransferredAmount, dzGenerated);
  const dzPending = Math.max(0, dzGenerated - dzTransferredAmount);

  // Km: Capital usa los km fijos de Ajustes; fuera de Capital, los cargados (0 vale)
  const kmApplied = stay.isCapital
    ? config.defaultCapitalKm
    : (stay.customKm !== undefined && stay.customKm !== null && stay.customKm >= 0 ? stay.customKm : config.defaultCapitalKm);
  const fuelLitersNeeded = config.fuelConsumptionKmPerLiter > 0 ? kmApplied / config.fuelConsumptionKmPerLiter : 0;
  const fuelCost = kmApplied * costPerKm(config);

  // Mantenimiento (20% del total a pagar)
  const maintenanceAmount = totalGross * config.maintenanceRate;

  // Te queda = total - deducción sobre el total - traslado; hasta ahora, sobre lo cobrado
  const netArs = totalCharge - dzOnTotal - fuelCost;
  // Lo que está a favor del cliente no es tuyo: cuenta lo cobrado hasta el total
  const netSoFarArs = Math.min(collected, totalCharge) - dzGenerated - fuelCost;

  // Neto en USD (con cotización única de dólar editable, default $1700)
  const usdRate = config.exchangeRates.usdRate || config.exchangeRates.promedioUsd || 1700;
  const netUsd = usdRate > 0 ? Math.round(netArs / usdRate) : 0;
  const netSoFarUsd = usdRate > 0 ? Math.round(netSoFarArs / usdRate) : 0;

  // Cálculo puro diario según el Excel
  const pureDailyRate = calculatePureDailyRate(days, config);
  const totalPure = pureDailyRate * days;

  // IFM: Sobreprecio que se le cobra al cliente respecto al cálculo puro de la app
  const ifmDaily = (stay.dailyRate || 0) - pureDailyRate;
  const totalIfm = ifmDaily * days;

  return {
    days,
    totalGross,
    totalCharge,
    collected,
    totalAdeudado,
    creditBalance,
    dzRate,
    dzOnTotal,
    dzGenerated,
    dzTransferredAmount,
    dzPending,
    kmApplied,
    fuelLitersNeeded,
    fuelCost,
    maintenanceAmount,
    netArs,
    netUsd,
    netSoFarArs,
    netSoFarUsd,
    pureDailyRate,
    totalPure,
    ifmDaily,
    totalIfm
  };
};

/** Tilde "Transferida": si queda algo por transferir, se transfiere todo lo generado; si no, se destilda. */
export const toggleDzTransfer = (stay: Stay, config: AppConfig, ahora: string = new Date().toISOString()): Stay => {
  const calc = calculateStay(stay, config);
  // Sin nada cobrado no hay deducción que transferir: un tilde con monto 0 se confundiría con uno viejo
  if (!stay.dzTransferred && calc.dzGenerated < 1) return stay;
  if (calc.dzPending >= 1 || !stay.dzTransferred) {
    return { ...stay, dzTransferred: true, dzTransferredAmount: Math.round(calc.dzGenerated), dzTransferredAt: ahora };
  }
  return { ...stay, dzTransferred: false, dzTransferredAmount: 0, dzTransferredAt: undefined };
};

/** "Marcar todas": deja transferida toda la deducción generada hasta hoy, con la fecha de la transferencia. */
export const markDzTransferred = (stay: Stay, config: AppConfig, ahora: string = new Date().toISOString()): Stay => {
  const calc = calculateStay(stay, config);
  return { ...stay, dzTransferred: true, dzTransferredAmount: Math.round(calc.dzGenerated), dzTransferredAt: ahora };
};

export const formatCurrencyARS = (amount: number): string => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  }).format(amount);
};

export const formatCurrencyUSD = (amount: number): string => {
  return 'US$ ' + Math.round(amount).toLocaleString('es-AR');
};

export const formatNumber = (num: number, decimals = 1): string => {
  return new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals
  }).format(num);
};
