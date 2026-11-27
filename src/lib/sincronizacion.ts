import type { AppConfig, Stay } from '../types';
import type { HistoricalStayRecord } from '../data/historialData';
import type { ClientProfile } from '../data/clientsDirectory';
import {
  isSupabaseConfigured,
  fetchStaysFromDb,
  fetchHistoryFromDb,
  fetchConfigFromDb,
  fetchClientsFromDb,
  type Lectura
} from './supabase';

// Sincronización con Supabase atada a la sesión:
// - sin sesión no se llama a Supabase;
// - al iniciar sesión se leen las 4 tablas (sólo lecturas, nunca escrituras);
// - al cerrar sesión se limpian los datos de la cuenta.

export type DatosCuenta = {
  stays: Lectura<Stay[]>;
  history: Lectura<HistoricalStayRecord[]>;
  config: Lectura<AppConfig | null>;
  clients: Lectura<ClientProfile[]>;
};

const NOMBRES_TABLAS: Record<keyof DatosCuenta, string> = {
  stays: 'estadías',
  history: 'historial',
  config: 'configuración',
  clients: 'directorio de clientes'
};

async function cargarCuenta(): Promise<DatosCuenta> {
  const [stays, history, config, clients] = await Promise.all([
    fetchStaysFromDb(),
    fetchHistoryFromDb(),
    fetchConfigFromDb(),
    fetchClientsFromDb()
  ]);
  return { stays, history, config, clients };
}

/** Lecturas que fallaron, con el mensaje real de la base. */
export function erroresDeLectura(datos: DatosCuenta): { tabla: string; mensaje: string }[] {
  return (Object.keys(datos) as (keyof DatosCuenta)[])
    .map(key => ({ key, r: datos[key] }))
    .filter(({ r }) => !r.ok)
    .map(({ key, r }) => ({ tabla: NOMBRES_TABLAS[key], mensaje: (r as { error: string }).error }));
}

export function crearSincronizacion(acciones: {
  aplicar: (datos: DatosCuenta) => void;
  limpiar: () => void;
  cargando?: (activo: boolean) => void;
  /** false al entrar a una cuenta, true cuando terminó su primera lectura (aunque falle). Los reintentos no la cambian. */
  primeraCarga?: (terminada: boolean) => void;
}) {
  let usuario: string | null = null;
  let primeraTerminada = false;

  function marcarPrimeraCarga(terminada: boolean) {
    if (terminada && primeraTerminada) return; // los reintentos no la vuelven a avisar
    primeraTerminada = terminada;
    acciones.primeraCarga?.(terminada);
  }
  // Una respuesta que llega después de cerrar sesión (o de otra carga) se descarta
  let version = 0;

  async function recargar(): Promise<void> {
    if (!usuario || !isSupabaseConfigured) return;
    const mia = ++version;
    acciones.cargando?.(true);
    const datos = await cargarCuenta();
    if (mia !== version || !usuario) return;
    acciones.cargando?.(false);
    acciones.aplicar(datos);
    marcarPrimeraCarga(true);
  }

  async function cambiarSesion(userId: string | null): Promise<void> {
    if (userId === usuario) return;
    const anterior = usuario;
    usuario = userId;
    if (!userId) {
      version++;
      acciones.cargando?.(false);
      if (anterior) acciones.limpiar();
      return;
    }
    // Cambio de cuenta sin pasar por "cerrar sesión": no se mezclan datos
    if (anterior) acciones.limpiar();
    marcarPrimeraCarga(false);
    await recargar();
  }

  return { cambiarSesion, recargar, usuarioActual: () => usuario, primeraCargaTerminada: () => primeraTerminada };
}
