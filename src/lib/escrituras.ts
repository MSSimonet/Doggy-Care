// Ejecuta en Supabase las operaciones de la cola de pendientes y clasifica los errores.
//   - red: sin conexión, servidor caído o demasiadas llamadas -> se reintenta solo
//   - sesion: sesión vencida o token inválido -> se pide iniciar sesión, la cola se conserva
//   - permanente: permiso denegado, dato inválido, columna inexistente -> queda "con error" para que la persona decida
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig, Stay } from '../types';
import type { HistoricalStayRecord } from '../data/historialData';
import type { ClientProfile } from '../data/clientsDirectory';
import type { Ejecutor, Operacion, ResultadoEjecucion, TipoFalla } from './colaPendientes';
import { historyToRow, missingOptionalColumn, stayToRow } from './mapeoDb';

export interface ErrorBase {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}

const RED = /failed to fetch|networkerror|network request failed|load failed|fetch failed|network|timeout|timed out|econn|enotfound|eai_again|err_internet|err_network|offline|aborted|socket hang up/i;
const SESION = /jwt|token.*(expired|invalid)|not authenticated|invalid claim|refresh token|session.*(expired|missing)|auth session missing/i;

/** Clasifica un error de Supabase o de red. */
export function clasificarError(e: ErrorBase | null | undefined): TipoFalla {
  const msg = `${e?.name ?? ''} ${e?.message ?? ''}`;
  const status = typeof e?.status === 'number' ? e.status : undefined;
  const code = String(e?.code ?? '');
  if (status === 401 || code === 'PGRST301' || code === 'PGRST302' || SESION.test(msg)) return 'sesion';
  if (status === 0 || status === 408 || status === 429 || (status !== undefined && status >= 500)) return 'red';
  if (RED.test(msg)) return 'red';
  return 'permanente';
}

// ── De la app a las columnas de la base ───────────────────────────────────────────

function clienteToRow(client: ClientProfile) {
  return {
    id: client.id,
    dog_name: client.dogName,
    breed: client.breed || null,
    birth_year: client.birthYear || null,
    owner_name: client.ownerName,
    owner_last_name: client.ownerLastName || null,
    relatives: client.relatives || null,
    contact: client.contact || null,
    address: client.address || null
  };
}

function configToRow(config: AppConfig) {
  return {
    id: 1,
    fuel_price_per_liter: config.fuelPricePerLiter,
    fuel_consumption_km_per_liter: config.fuelConsumptionKmPerLiter,
    base_transport_liters: config.baseTransportLiters,
    default_capital_km: config.defaultCapitalKm,
    dz_rate: config.dzRate,
    maintenance_rate: config.maintenanceRate,
    usd_reference_daily: config.usdReferenceDaily,
    fuel_fixed_component: config.fuelFixedComponent,
    promedio_usd: config.exchangeRates.promedioUsd || config.exchangeRates.usdRate || 1700,
    usd_rate: config.exchangeRates.usdRate || config.exchangeRates.promedioUsd || 1700,
    blue: config.exchangeRates.blue || config.exchangeRates.usdRate || 1700,
    mep: config.exchangeRates.mep,
    bna: config.exchangeRates.bna,
    ccl: config.exchangeRates.ccl,
    tarjeta: config.exchangeRates.tarjeta,
    euro_blue: config.exchangeRates.euroBlue,
    dz_rates_by_year: config.dzRatesByYear ?? null,
    dz_start_date: config.dzStartDate ?? null
  };
}

/** Campos que se pueden cambiar con un "parche" (cambio de campos sueltos) y su columna en la base. */
const COLUMNAS_PARCHE: Record<string, string> = {
  dzTransferred: 'dz_transferred',
  dzTransferredAmount: 'dz_transferred_amount',
  dzTransferredAt: 'dz_transferred_at',
  address: 'address'
};

export function parcheToRow(datos: Record<string, unknown>): Record<string, unknown> | null {
  const fila: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(datos)) {
    const col = COLUMNAS_PARCHE[k];
    if (!col) return null;
    fila[col] =
      col === 'dz_transferred' ? Boolean(v)
      : col === 'dz_transferred_amount' ? v ?? 0
      : v ?? null;
  }
  return fila;
}

const AVISO_COLUMNAS = 'Se guardó sin algunas columnas que la base todavía no tiene (ver migraciones 003, 004 y 005).';
export const AVISO_TILDE_LOCAL =
  'El tilde de tasa quedó guardado en este teléfono, pero todavía no en la nube: falta aplicar la migración 005.';

/** Aviso según las columnas que la base no tenía. */
function avisoPorColumnas(quitadas: string[]): string {
  return quitadas.some(c => c.startsWith('dz_transferred')) ? AVISO_TILDE_LOCAL : AVISO_COLUMNAS;
}

type Respuesta = { error: ErrorBase | null; status?: number; data?: unknown };

/** Reintenta sacando las columnas opcionales que la base no tiene. */
async function conColumnasOpcionales(
  hacer: (fila: Record<string, unknown>) => PromiseLike<Respuesta>,
  fila: Record<string, unknown>
): Promise<{ r: Respuesta; quitadas: string[] }> {
  let actual = { ...fila };
  const quitadas: string[] = [];
  for (let i = 0; i < 6; i++) {
    const r = await hacer(actual);
    if (!r.error) return { r, quitadas };
    const col = missingOptionalColumn(r.error.message);
    if (!col || !(col in actual)) return { r, quitadas };
    const { [col]: _omit, ...resto } = actual;
    actual = resto;
    quitadas.push(col);
    if (!Object.keys(actual).some(k => k !== 'id' && k !== 'updated_at')) return { r: { error: null, status: 200, data: [] }, quitadas };
  }
  return { r: await hacer(actual), quitadas };
}

const falla = (e: ErrorBase, status?: number): ResultadoEjecucion => ({
  ok: false,
  tipo: clasificarError({ ...e, status: e.status ?? status }),
  mensaje: e.message || `Error ${status ?? ''}`.trim()
});

const cuantas = (r: Respuesta) => (Array.isArray(r.data) ? r.data.length : 0);

/**
 * ¿Sigue el registro en la nube? false = no está; un resultado de falla = sí está (sin permiso) o no se pudo saber.
 */
async function existe(cliente: SupabaseClient, op: Operacion): Promise<false | ResultadoEjecucion> {
  const r = (await cliente.from(op.tabla).select('id').eq('id', op.clave)) as unknown as Respuesta;
  if (r.error) return falla(r.error, r.status);
  if (cuantas(r) === 0) return false;
  return {
    ok: false,
    tipo: 'permanente',
    mensaje: op.tipo === 'delete'
      ? 'La base no dejó borrar el registro (sin permiso): sigue en la nube.'
      : 'La base no dejó cambiar el registro (sin permiso).'
  };
}

/** Ejecutor real: hace la operación en Supabase. Idempotente: guardar/borrar/cambiar por id. */
export function crearEjecutorSupabase(cliente: SupabaseClient | null): Ejecutor {
  return async (op: Operacion): Promise<ResultadoEjecucion> => {
    if (!cliente) return { ok: false, tipo: 'permanente', mensaje: 'Supabase no está configurado' };
    const ahora = new Date().toISOString();
    try {
      if (op.tipo === 'upsert') {
        const fila =
          op.tabla === 'stays' ? { ...stayToRow(op.datos as Stay), updated_at: ahora }
          : op.tabla === 'historical_stays' ? { ...historyToRow(op.datos as HistoricalStayRecord), updated_at: ahora }
          : op.tabla === 'clients_directory' ? { ...clienteToRow(op.datos as ClientProfile), updated_at: ahora }
          : { ...configToRow(op.datos as AppConfig), updated_at: ahora };
        const { r, quitadas } = await conColumnasOpcionales(f => cliente.from(op.tabla).upsert(f) as unknown as PromiseLike<Respuesta>, fila);
        if (r.error) return falla(r.error, r.status);
        return quitadas.length ? { ok: true, aviso: avisoPorColumnas(quitadas) } : { ok: true };
      }
      if (op.tipo === 'parche') {
        const fila = parcheToRow((op.datos ?? {}) as Record<string, unknown>);
        if (!fila) return { ok: false, tipo: 'permanente', mensaje: 'Cambio con un campo que no se puede guardar' };
        const { r, quitadas } = await conColumnasOpcionales(
          f => cliente.from(op.tabla).update({ ...f, updated_at: ahora }).eq('id', op.clave).select('id') as unknown as PromiseLike<Respuesta>,
          fila
        );
        if (r.error) return falla(r.error, r.status);
        if (cuantas(r) === 0 && !quitadas.length) {
          // 0 filas: o el registro ya no existe en la nube (no se recrea: una copia vieja no revive algo borrado),
          // o existe y la base no dejó cambiarlo (sin permiso). Se pregunta cuál de las dos.
          const sigue = await existe(cliente, op);
          if (sigue !== false) return sigue;
          return { ok: true };
        }
        return quitadas.length ? { ok: true, aviso: avisoPorColumnas(quitadas) } : { ok: true };
      }
      // delete
      const r = (await cliente.from(op.tabla).delete().eq('id', op.clave).select('id')) as unknown as Respuesta;
      if (r.error) return falla(r.error, r.status);
      if (cuantas(r) === 0) {
        // 0 filas borradas: si el registro ya no está (por ejemplo, se borró en un intento anterior), está hecho;
        // si sigue estando, la base no dejó borrarlo (sin permiso) y se avisa.
        const sigue = await existe(cliente, op);
        if (sigue !== false) return sigue;
      }
      return { ok: true };
    } catch (e) {
      const err = e as ErrorBase;
      return { ok: false, tipo: clasificarError(err), mensaje: err?.message || String(e) };
    }
  };
}

/** Ejecutor del modo demo: no hay base; "guarda" si el navegador tiene conexión y falla como red si no. */
export function crearEjecutorDemo(demoraMs = 150): Ejecutor {
  return async () => {
    await new Promise(r => setTimeout(r, demoraMs));
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { ok: false, tipo: 'red', mensaje: 'Failed to fetch (modo demo sin conexión)' };
    }
    return { ok: true };
  };
}
