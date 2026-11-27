import { Stay, AppConfig } from '../types';
import { HISTORICAL_STAYS, type HistoricalStayRecord } from './historialData';
import { clientsDirectory, type ClientProfile } from './clientsDirectory';

/** "AAAA-MM-DD" de hoy más `dias` (fecha local), para que el demo siempre tenga una estadía en curso. */
function diaRelativo(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const registroDemo = (
  id: string, rowIndex: number, dogName: string, fromDay: string, untilDay: string, days: number, dailyRate: number,
  extra: Partial<HistoricalStayRecord> = {}
): HistoricalStayRecord => {
  const total = days * dailyRate;
  const dz = Math.round(total * 0.18);
  return {
    id, rowIndex, dogName, rawDogName: dogName, fromDay, untilDay, days,
    totalPagar: total, totalPagarRaw: total.toLocaleString('es-AR'), dz, neto: total - dz, fuel: 0, mixta: 0, soloUsd: 0,
    dailyRate, dailyRateRaw: String(dailyRate), pureRate: dailyRate, pureRateRaw: String(dailyRate),
    ifmDaily: 0, totalIfm: 0, netoEuros: 0, dzRate: 0.18, ...extra
  };
};

/**
 * Registro de estadías del modo demo: los de ejemplo (2025, anteriores a la fecha de inicio de deducciones)
 * y estadías de 2026 con deducciones pendientes y una ya transferida.
 * Sin `dzTransferred` (como la base real mientras falte la migración 005): el tilde se guarda en el dispositivo.
 */
export const DEMO_HISTORY: HistoricalStayRecord[] = [
  ...HISTORICAL_STAYS,
  registroDemo('hist-demo-6', 9, 'Rocky', '2026-02-10', '2026-02-15', 6, 20000),
  registroDemo('hist-demo-7', 10, 'Tony', '2026-06-01', '2026-06-05', 5, 22000, {
    dzTransferred: true, dzTransferredAmount: Math.round(5 * 22000 * 0.18), dzTransferredAt: '2026-06-10T15:00:00.000Z'
  }),
  registroDemo('hist-demo-8', 11, 'Nina', '2026-08-03', '2026-08-10', 8, 22000),
  registroDemo('hist-demo-9', 12, 'Rocky', '2026-10-05', '2026-10-09', 5, 22000)
];

// Only imported in DEV + VITE_DEMO=1 — tree-shaken out of production builds.
export const DEMO_STAYS: Stay[] = [
  {
    id: 'demo-1',
    dogName: 'Firulais',
    clientName: 'Ana García',
    clientPhone: '555-0101',
    dogBreed: 'Labrador',
    fromDay: '2026-10-28',
    untilDay: '2026-11-04',
    days: 8,
    dailyRate: 24000,
    isCapital: true,
    additionalFeatures: { expenses: 0, bath: 2000, moneyAdvance: 50000, tip: 0 },
    amountPaid: 50000,
    dzTransferred: false,
    notes: '',
    savedToHistory: false,
  },
  {
    id: 'demo-2',
    dogName: 'Max',
    clientName: 'Carlos Quiroga',
    clientPhone: '555-0102',
    dogBreed: 'Golden Retriever',
    fromDay: '2026-10-30',
    untilDay: '2026-10-30',
    days: 1,
    dailyRate: 22000,
    isCapital: true,
    additionalFeatures: { expenses: 0, bath: 0, moneyAdvance: 0, tip: 0 },
    amountPaid: 0,
    dzTransferred: false,
    notes: '',
    savedToHistory: false,
  },
  {
    id: 'demo-3',
    dogName: 'Luna',
    clientName: 'Julieta Fernández',
    clientPhone: '555-0103',
    dogBreed: 'Caniche',
    fromDay: '2026-10-25',
    untilDay: '2026-10-29',
    days: 5,
    dailyRate: 20000,
    isCapital: false,
    customKm: 120,
    additionalFeatures: { expenses: 500, bath: 0, moneyAdvance: 0, tip: 2000 },
    amountPaid: 100000,
    dzTransferred: true,
    notes: '',
    savedToHistory: false,
  },
  {
    id: 'demo-4',
    dogName: 'Tony',
    clientName: 'Laura Díaz',
    clientPhone: '555-0104',
    dogBreed: 'Beagle',
    fromDay: '2026-11-10',
    untilDay: '2026-11-14',
    days: 5,
    dailyRate: 23000,
    isCapital: false,
    customKm: 0,
    additionalFeatures: { expenses: 0, bath: 0, moneyAdvance: 30000, tip: 0 },
    amountPaid: 0,
    dzTransferred: false,
    notes: 'Seña al reservar; la traen ellos (0 km)',
    savedToHistory: false,
  },
  {
    id: 'demo-5',
    dogName: 'Coco',
    clientName: 'Pedro Ruiz',
    clientPhone: '555-0105',
    dogBreed: 'Mestizo',
    fromDay: '2026-10-27',
    untilDay: '2026-10-31',
    days: 5,
    dailyRate: 20000,
    isCapital: true,
    additionalFeatures: { expenses: 0, bath: 0, moneyAdvance: 20000, tip: 0 },
    amountPaid: 100000,
    // Se transfirió la deducción de los primeros $50.000; después cobró el resto y de más
    dzTransferred: true,
    dzTransferredAmount: 9000,
    notes: '',
    savedToHistory: false,
  },
  {
    // Reserva futura que cruza de año: termina en 2027, su deducción es del 19 %
    id: 'demo-6',
    dogName: 'Bruno',
    clientName: 'Julia Paz',
    clientPhone: '555-0106',
    dogBreed: 'Border collie',
    fromDay: '2026-12-26',
    untilDay: '2027-01-03',
    days: 9,
    dailyRate: 25000,
    isCapital: true,
    additionalFeatures: { expenses: 0, bath: 0, moneyAdvance: 60000, tip: 0 },
    amountPaid: 0,
    dzTransferred: false,
    notes: 'Dirección: Calle Ficticia 606',
    savedToHistory: false,
  },
  {
    // En casa ahora (fechas relativas a hoy): perro con historial y estadía activa
    id: 'demo-7',
    dogName: 'Nina',
    clientName: 'Rosa Vera',
    clientPhone: '555-0107',
    dogBreed: 'Dachshund',
    fromDay: diaRelativo(-2),
    untilDay: diaRelativo(3),
    days: 6,
    dailyRate: 23000,
    isCapital: true,
    additionalFeatures: { expenses: 0, bath: 0, moneyAdvance: 40000, tip: 0 },
    amountPaid: 0,
    dzTransferred: false,
    notes: '',
    savedToHistory: false,
  },
  {
    // Finalizada: ya no está en la Agenda y espera en Cobros (cobrado + deducida → pasa al Historial)
    id: 'demo-8',
    dogName: 'Kiara',
    clientName: 'Sol Acosta',
    clientPhone: '555-0108',
    dogBreed: 'Schnauzer',
    fromDay: diaRelativo(-12),
    untilDay: diaRelativo(-7),
    days: 6,
    dailyRate: 21000,
    isCapital: true,
    additionalFeatures: { expenses: 0, bath: 0, moneyAdvance: 50000, tip: 0 },
    amountPaid: 0,
    dzTransferred: false,
    notes: '',
    savedToHistory: true,
    finalizada: true,
  },
];

/** Fichas del modo demo: las de ejemplo más Rocky y Nina, con direcciones para editar. */
export const DEMO_CLIENTS: ClientProfile[] = [
  ...clientsDirectory,
  { id: 'client-demo-rocky', dogName: 'Rocky', breed: 'Bulldog francés', ownerName: 'Diego', ownerLastName: 'Sosa', contact: '555-0208', address: 'Calle Ficticia 808' },
  { id: 'client-demo-nina', dogName: 'Nina', breed: 'Dachshund', ownerName: 'Rosa', ownerLastName: 'Vera', contact: '555-0107', address: 'Calle Ficticia 707' }
];

export const DEMO_CONFIG: AppConfig = {
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
    euroBlue: 1700,
  },
  dzRatesByYear: { '2026': 0.18, '2027': 0.19 },
  dzStartDate: '2026-01-01',
};
