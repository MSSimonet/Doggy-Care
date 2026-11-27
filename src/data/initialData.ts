import { AppConfig, Stay } from '../types';

export const defaultAppConfig: AppConfig = {
  fuelPricePerLiter: 2200,
  fuelConsumptionKmPerLiter: 8.64, // 11.57 lt cada 100 km (455 km / 52.66 L)
  baseTransportLiters: 16, // 16 lt x 2200 = 35.200 ARS
  defaultCapitalKm: 90, // según la regla del archivo: "si es capital que sean 90 km"
  dzRate: 0.18, // 18% Dz
  maintenanceRate: 0.20, // 20% Mantenimiento
  usdReferenceDaily: 5.5, // 5.5 U$S por día
  fuelFixedComponent: 7810, // Componente operativo del Excel
  exchangeRates: {
    usdRate: 1700,
    promedioUsd: 1700,
    blue: 1700,
    mep: 1700,
    bna: 1700,
    ccl: 1700,
    tarjeta: 1700,
    euroBlue: 1700
  },
  // Deducción por año de la fecha de fin (Ajustes > Deducciones) y fecha de inicio de deducciones
  dzRatesByYear: { '2026': 0.18, '2027': 0.19 },
  dzStartDate: '2026-01-01'
};

// Sin estadías precargadas: los datos vienen de Supabase (o, en modo demo, de src/data/demoData.ts)
export const initialStays: Stay[] = [];
