// Tilde de "deducción transferida" de los registros archivados, guardado también en este dispositivo.
//
// Mientras la base no tenga la columna dz_transferred en historical_stays (migración 005 sin aplicar), la nube
// no guarda el tilde: al volver a leerla, cada registro llega sin él (dzTransferred === undefined). Entonces se
// usa la última marca hecha en este dispositivo, y el tilde no se pierde al cerrar la app ni al releer la nube.
// Cuando la base sí tiene la columna, manda lo de la nube.
import type { HistoricalStayRecord } from '../data/historialData';

export const CLAVE_MARCAS = 'pensionados_marcas_deduccion';

export interface MarcaDeduccion {
  dzTransferred: boolean;
  dzTransferredAmount: number;
  dzTransferredAt?: string;
}

export type Marcas = Record<string, MarcaDeduccion>;

export function leerMarcas(): Marcas {
  try {
    const texto = localStorage.getItem(CLAVE_MARCAS);
    const datos = texto ? JSON.parse(texto) : {};
    return datos && typeof datos === 'object' && !Array.isArray(datos) ? (datos as Marcas) : {};
  } catch {
    return {};
  }
}

/** Guarda la marca de un registro. Devuelve false si el dispositivo no la pudo guardar. */
export function guardarMarca(id: string, marca: MarcaDeduccion): boolean {
  try {
    localStorage.setItem(CLAVE_MARCAS, JSON.stringify({ ...leerMarcas(), [id]: marca }));
    return true;
  } catch {
    return false;
  }
}

/** Borra de este dispositivo las marcas de esos registros (cuando ya están en la nube). */
export function borrarMarcas(ids: string[]): boolean {
  try {
    const quedan = { ...leerMarcas() };
    for (const id of ids) delete quedan[id];
    if (Object.keys(quedan).length) localStorage.setItem(CLAVE_MARCAS, JSON.stringify(quedan));
    else localStorage.removeItem(CLAVE_MARCAS);
    return true;
  } catch {
    return false;
  }
}

/** Registros leídos de la nube + las marcas de este dispositivo para los que llegaron sin tilde (sin columna). */
export function aplicarMarcas(registros: HistoricalStayRecord[], marcas: Marcas = leerMarcas()): HistoricalStayRecord[] {
  return registros.map(r => {
    if (r.dzTransferred !== undefined) return r;
    const m = marcas[r.id];
    return m ? { ...r, ...m } : r;
  });
}

/** ¿La nube devolvió registros sin la columna del tilde? (migración 005 sin aplicar) */
export function faltaColumnaTilde(registros: HistoricalStayRecord[]): boolean {
  return registros.length > 0 && registros.some(r => r.dzTransferred === undefined);
}
