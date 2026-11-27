import { createClient } from '@supabase/supabase-js';
import type { Stay, AppConfig } from '../types';
import type { HistoricalStayRecord } from '../data/historialData';
import type { ClientProfile } from '../data/clientsDirectory';
import { stayFromRow, historyFromRow } from './mapeoDb';

export const SUPABASE_URL_INVALID_MESSAGE = 'La dirección de la base de datos no es válida (ver docs/despliegue.md)';

// VITE_SUPABASE_URL a veces llega con una ruta de más (p. ej. /rest/v1/), que rompe el ingreso.
// Se usa solo el origen. Vacía o de ejemplo = "sin configurar"; cualquier otra cosa no válida = error.
export function normalizeSupabaseUrl(raw: string | undefined | null): { url: string | null; error: string | null } {
  const value = (raw ?? '').trim();
  if (!value || value.includes('tu-proyecto')) return { url: null, error: null };
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || !parsed.hostname) {
      return { url: null, error: SUPABASE_URL_INVALID_MESSAGE };
    }
    return { url: parsed.origin, error: null };
  } catch {
    return { url: null, error: SUPABASE_URL_INVALID_MESSAGE };
  }
}

const { url: supabaseUrl, error: urlError } = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabaseUrlError: string | null = urlError;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey)
  : null;

export async function signInWithPassword(email: string, password: string): Promise<{ error: Error | null }> {
  if (!supabase) return { error: new Error('Supabase no configurado') };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error as Error | null };
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

// Resultado de una lectura: distingue "tabla vacía" (ok con lista vacía) de "error de lectura"
export type Lectura<T> = { ok: true; data: T } | { ok: false; error: string };
const SIN_CONEXION = { ok: false as const, error: 'Supabase no está configurado' };
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Las escrituras van por la cola persistente (src/lib/escrituras.ts); acá sólo se lee.

// ==========================================
// 1. STAYS (AGENDA ACTIVA)
// ==========================================

export async function fetchStaysFromDb(): Promise<Lectura<Stay[]>> {
  if (!supabase) return SIN_CONEXION;
  try {
    const { data, error } = await supabase
      .from('stays')
      .select('*')
      .order('from_day', { ascending: true });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []).map((row: any) => stayFromRow(row)) };
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
}

// ==========================================
// 2. HISTORIAL DE ESTADÍAS
// ==========================================

/** Tilde de transferida de un registro archivado, tal como está en la nube. */
export interface TildeNube {
  id: string;
  dzTransferred: boolean;
  dzTransferredAmount: number;
  dzTransferredAt?: string;
}

/**
 * Lee sólo los tildes de historical_stays (lectura, nunca escribe). Si la tabla no tiene las columnas
 * (migración 005 sin aplicar) devuelve el error real de la base.
 */
export async function leerTildesDeLaNube(): Promise<Lectura<TildeNube[]>> {
  if (!supabase) return SIN_CONEXION;
  try {
    const { data, error } = await supabase
      .from('historical_stays')
      .select('id, dz_transferred, dz_transferred_amount, dz_transferred_at')
      .range(0, 4999);
    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      data: (data ?? []).map((r: any) => ({
        id: String(r.id),
        dzTransferred: r.dz_transferred === true,
        dzTransferredAmount: Number(r.dz_transferred_amount) || 0,
        dzTransferredAt: r.dz_transferred_at || undefined
      }))
    };
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
}

export async function fetchHistoryFromDb(): Promise<Lectura<HistoricalStayRecord[]>> {
  if (!supabase) return SIN_CONEXION;
  try {
    const { data, error } = await supabase
      .from('historical_stays')
      .select('*')
      .order('row_index', { ascending: true });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []).map((row: any) => historyFromRow(row)) };
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
}

// ==========================================
// 3. CONFIGURACIÓN & COTIZACIONES
// ==========================================

/** Tabla año → tasa guardada como JSON ({"2026": 0.18}); cualquier otra cosa se ignora. */
function leerTablaTasas(valor: unknown): Record<string, number> | undefined {
  let v = valor;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return undefined; }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const tabla: Record<string, number> = {};
  for (const [año, tasa] of Object.entries(v as Record<string, unknown>)) {
    const n = Number(tasa);
    if (/^\d{4}$/.test(año) && Number.isFinite(n) && n >= 0 && n < 1) tabla[año] = n;
  }
  return Object.keys(tabla).length ? tabla : undefined;
}

export async function fetchConfigFromDb(): Promise<Lectura<AppConfig | null>> {
  if (!supabase) return SIN_CONEXION;
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    // Sin fila: se sigue con la configuración de este dispositivo
    if (!data) return { ok: true, data: null };

    return { ok: true, data: {
      fuelPricePerLiter: data.fuel_price_per_liter,
      fuelConsumptionKmPerLiter: data.fuel_consumption_km_per_liter,
      baseTransportLiters: data.base_transport_liters,
      defaultCapitalKm: data.default_capital_km,
      dzRate: data.dz_rate,
      maintenanceRate: data.maintenance_rate,
      usdReferenceDaily: data.usd_reference_daily,
      fuelFixedComponent: data.fuel_fixed_component,
      // Migración 005: sin las columnas quedan sin definir y se usa lo de este dispositivo o los valores por defecto
      dzRatesByYear: leerTablaTasas(data.dz_rates_by_year),
      dzStartDate: typeof data.dz_start_date === 'string' ? data.dz_start_date.slice(0, 10) : undefined,
      exchangeRates: {
        usdRate: Number(data.usd_rate || data.promedio_usd || 1700),
        promedioUsd: Number(data.promedio_usd || data.usd_rate || 1700),
        blue: Number(data.blue || 1700),
        mep: Number(data.mep || 1700),
        bna: Number(data.bna || 1700),
        ccl: Number(data.ccl || 1700),
        tarjeta: Number(data.tarjeta || 1700),
        euroBlue: Number(data.euro_blue || 1700)
      }
    } };
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
}

// ==========================================
// 4. CLIENTES / DIRECTORIO
// ==========================================

export async function fetchClientsFromDb(): Promise<Lectura<ClientProfile[]>> {
  if (!supabase) return SIN_CONEXION;
  try {
    const { data, error } = await supabase
      .from('clients_directory')
      .select('*')
      .order('dog_name', { ascending: true });
    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      data: (data ?? []).map((row: any) => ({
        id: row.id,
        dogName: row.dog_name,
        breed: row.breed || undefined,
        birthYear: row.birth_year || undefined,
        ownerName: row.owner_name,
        ownerLastName: row.owner_last_name || undefined,
        relatives: row.relatives || undefined,
        contact: row.contact || undefined,
        address: row.address || undefined
      }))
    };
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
}

// ==========================================
// 5. RESPALDO (sólo lectura)
// ==========================================

// Lee una tabla entera tal como está en la base, para el respaldo. Nunca escribe.
export async function leerTablaParaRespaldo(
  tabla: 'stays' | 'historical_stays' | 'app_config' | 'clients_directory'
): Promise<{ data: unknown[] | null; error: { message: string } | null }> {
  if (!supabase) return { data: null, error: { message: 'Supabase no está configurado' } };
  try {
    const { data, error } = await supabase.from(tabla).select('*');
    return { data: data ?? [], error: error ? { message: error.message } : null };
  } catch (err) {
    return { data: null, error: { message: errorText(err) } };
  }
}

// ==========================================
// 6. REALTIME LIVE SYNC
// ==========================================

export function subscribeToStaysChanges(onStaysUpdated: () => void) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel('realtime_stays')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stays' }, () => {
      onStaysUpdated();
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
