// Archivo de ejemplo con registros inventados (datos reales eliminados por privacidad)
export interface HistoricalStayRecord {
  id: string;
  rowIndex: number;
  dogName: string;
  rawDogName: string;
  fromDay: string;
  untilDay: string;
  days: number;
  totalPagar: number;
  totalPagarRaw: string;
  dz: number;
  neto: number;
  fuel: number;
  mixta: number;
  soloUsd: number;
  dailyRate: number;
  dailyRateRaw: string;
  pureRate: number;
  pureRateRaw: string;
  ifmDaily: number;
  totalIfm: number;
  netoEuros: number;
  dzRate?: number; // Porcentaje de deducción de la estadía (vacío = el de la configuración)
  dzTransferred?: boolean;
  dzTransferredAmount?: number;
  /** Cuándo se marcó como transferida (ISO, dz_transferred_at) */
  dzTransferredAt?: string;
  dogId?: string;
}

export const HISTORICAL_STAYS: HistoricalStayRecord[] = [
  {
    "id": "hist-1",
    "rowIndex": 4,
    "dogName": "Candela",
    "rawDogName": "Candela",
    "fromDay": "2025-03-10",
    "untilDay": "2025-03-17",
    "days": 8,
    "totalPagar": 168000,
    "totalPagarRaw": "168.000",
    "dz": 26880,
    "neto": 141120,
    "fuel": 0,
    "mixta": 0,
    "soloUsd": 0,
    "dailyRate": 21000,
    "dailyRateRaw": "21000",
    "pureRate": 21000,
    "pureRateRaw": "21000",
    "ifmDaily": 0,
    "totalIfm": 0,
    "netoEuros": 0
  },
  {
    "id": "hist-2",
    "rowIndex": 5,
    "dogName": "Bóxer",
    "rawDogName": "Bóxer",
    "fromDay": "2025-04-02",
    "untilDay": "2025-04-07",
    "days": 6,
    "totalPagar": 138000,
    "totalPagarRaw": "138.000",
    "dz": 22080,
    "neto": 115920,
    "fuel": 0,
    "mixta": 0,
    "soloUsd": 0,
    "dailyRate": 23000,
    "dailyRateRaw": "23000",
    "pureRate": 23000,
    "pureRateRaw": "23000",
    "ifmDaily": 0,
    "totalIfm": 0,
    "netoEuros": 0
  },
  {
    "id": "hist-3",
    "rowIndex": 6,
    "dogName": "Luna",
    "rawDogName": "Luna",
    "fromDay": "2025-06-01",
    "untilDay": "2025-06-08",
    "days": 8,
    "totalPagar": 192000,
    "totalPagarRaw": "192.000",
    "dz": 30720,
    "neto": 161280,
    "fuel": 9800,
    "mixta": 0,
    "soloUsd": 0,
    "dailyRate": 24000,
    "dailyRateRaw": "24000",
    "pureRate": 24000,
    "pureRateRaw": "24000",
    "ifmDaily": 0,
    "totalIfm": 0,
    "netoEuros": 0
  },
  {
    "id": "hist-4",
    "rowIndex": 7,
    "dogName": "Candela",
    "rawDogName": "Candela",
    "fromDay": "2025-07-14",
    "untilDay": "2025-07-21",
    "days": 8,
    "totalPagar": 200000,
    "totalPagarRaw": "200.000",
    "dz": 32000,
    "neto": 168000,
    "fuel": 0,
    "mixta": 0,
    "soloUsd": 0,
    "dailyRate": 25000,
    "dailyRateRaw": "25000",
    "pureRate": 25000,
    "pureRateRaw": "25000",
    "ifmDaily": 0,
    "totalIfm": 0,
    "netoEuros": 0
  },
  {
    "id": "hist-5",
    "rowIndex": 8,
    "dogName": "Bóxer",
    "rawDogName": "Bóxer",
    "fromDay": "2025-09-05",
    "untilDay": "2025-09-12",
    "days": 8,
    "totalPagar": 216000,
    "totalPagarRaw": "216.000",
    "dz": 34560,
    "neto": 181440,
    "fuel": 9800,
    "mixta": 0,
    "soloUsd": 0,
    "dailyRate": 27000,
    "dailyRateRaw": "27000",
    "pureRate": 27000,
    "pureRateRaw": "27000",
    "ifmDaily": 0,
    "totalIfm": 0,
    "netoEuros": 0
  }
];

export function normalizeDogName(name: string): string {
  // Sin tildes, en minúsculas y con un solo espacio entre palabras: "Ramón", "ramon " y "RAMÓN" son el mismo perro
  return (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
