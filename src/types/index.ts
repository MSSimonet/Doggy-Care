export interface ExchangeRates {
  usdRate: number; // Cotización única de dólar editable (default: 1700)
  promedioUsd?: number;
  blue?: number;
  mep?: number;
  bna?: number;
  ccl?: number;
  tarjeta?: number;
  euroBlue?: number;
}

export interface AppConfig {
  fuelPricePerLiter: number; // e.g. 2200 ARS
  fuelConsumptionKmPerLiter: number; // e.g. 8.64 km/L
  baseTransportLiters: number; // e.g. 16 L -> $35,200
  defaultCapitalKm: number; // e.g. 90 km
  dzRate: number; // 0.18 (18%)
  maintenanceRate: number; // 0.20 (20%)
  usdReferenceDaily: number; // 5.5 USD
  fuelFixedComponent: number; // Componente operativo del Excel
  exchangeRates: ExchangeRates;
  /** Deducción por año de la fecha de fin: { "2026": 0.18, "2027": 0.19 }. Años posteriores: la última definida. */
  dzRatesByYear?: Record<string, number>;
  /** Fecha de inicio de deducciones (AAAA-MM-DD): lo que termina antes se considera resuelto */
  dzStartDate?: string;
}

export interface AdditionalFeatures {
  expenses: number; // Gastos
  bath: number; // Baño
  moneyAdvance: number; // Adelanto
  tip: number; // Propina
}

export interface Stay {
  id: string;
  dogName: string;
  clientName?: string; // Nombre del dueño / cliente
  clientPhone?: string; // Teléfono o WhatsApp de contacto
  dogBreed?: string; // Raza o características
  notes?: string;
  fromDay: string; // 'YYYY-MM-DD'
  untilDay: string; // 'YYYY-MM-DD'
  days: number;
  
  // Tarifas
  dailyRate: number; // Precio asignado manual (ARS/día)
  
  // Ubicación / Kilometraje
  isCapital: boolean; // Si es capital (90 km fijo) o fuera
  customKm?: number; // Km totales si es fuera de capital
  
  // Extras
  additionalFeatures: AdditionalFeatures;
  
  // Deducción operativa guardada en la estadía (por defecto config.dzRate)
  dzRate?: number; // e.g. 0.18 — se muestra en lugar del "(18%)" fijo

  // Vinculación por ID (reemplaza coincidencia por nombre)
  dogId?: string; // ID del perro en clientsDirectory

  // Estado de cobro
  amountPaid: number; // Cuánto ya pagó el cliente
  dzTransferred?: boolean; // Tilde para marcar si se transfirieron las deducciones operativas (18%)
  dzTransferredAmount?: number; // Monto de deducción ya transferido (dz_transferred_amount)
  dzTransferredAt?: string; // Cuándo se marcó como transferida (ISO, dz_transferred_at)
  /** Finalizada: ya no está en la Agenda y espera en Cobros (cobrada + deducida → pasa al Historial). Se guarda en saved_to_history. */
  finalizada?: boolean;
  savedToHistory?: boolean; // Tildar para guardar automáticamente en el Historial
  historyRecordId?: string; // ID del registro en el Historial
}

export interface StayCalculations {
  days: number; // (hasta - desde) + 1
  totalGross: number; // días * precio asignado
  totalCharge: number; // Total = días * precio + baño + gastos
  collected: number; // Cobrado = seña o adelanto + ya cobrado
  totalAdeudado: number; // Falta cobrar = máx(0, total - cobrado)
  creditBalance: number; // A favor del cliente = máx(0, cobrado - total)
  dzRate: number; // Porcentaje de deducción aplicado
  dzOnTotal: number; // Deducción sobre el total (para "Te queda")
  dzGenerated: number; // Deducción generada = porcentaje * mín(cobrado, total)
  dzTransferredAmount: number; // Deducción ya transferida
  dzPending: number; // Deducción por transferir = generada - transferida
  kmApplied: number; // 90 km o customKm
  fuelLitersNeeded: number; // km / km_per_liter
  fuelCost: number; // Costo del traslado = km * costo por km
  maintenanceAmount: number; // 20% de mantenimiento
  netArs: number; // Te queda = total - deducción sobre el total - traslado
  netUsd: number; // Te queda en USD
  netSoFarArs: number; // Te queda hasta ahora = mín(cobrado, total) - deducción generada - traslado
  netSoFarUsd: number;

  // Cálculo Puro & IFM
  pureDailyRate: number; // Cálculo puro diario de la app según el Excel (REAL)
  totalPure: number; // pureDailyRate * días
  ifmDaily: number; // IFM diario = Precio asignado - Cálculo puro
  totalIfm: number; // Total IFM = ifmDaily * días
}

export interface DogStayHistory {
  dogName: string;
  lastStay: Stay;
  lastStayCalc: StayCalculations;
  totalStaysCount: number;
}
