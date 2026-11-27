// Copia local de los registros del Historial que se borran, para poder restaurarlos.
// Se guarda en este dispositivo ANTES de cada borrado real (no toca la base); quedan los últimos 30.
import type { HistoricalStayRecord } from '../data/historialData';

export const CLAVE_BORRADOS = 'pensionados_borrados_recientes';
export const MAX_BORRADOS = 30;

export interface BorradoReciente {
  registro: HistoricalStayRecord;
  /** cuándo se borró (ISO) */
  borradoEn: string;
}

/** Los borrados guardados, del más reciente al más antiguo. */
export function leerBorrados(): BorradoReciente[] {
  try {
    const texto = localStorage.getItem(CLAVE_BORRADOS);
    const datos = texto ? JSON.parse(texto) : [];
    if (!Array.isArray(datos)) return [];
    return datos.filter((b: BorradoReciente) => b && typeof b.borradoEn === 'string' && b.registro && typeof b.registro.id === 'string');
  } catch {
    return [];
  }
}

/** Guarda la copia (primero en la lista, sin repetir el mismo registro, máximo 30). Devuelve false si no se pudo guardar. */
export function guardarBorrado(registro: HistoricalStayRecord, ahora: string = new Date().toISOString()): boolean {
  try {
    const resto = leerBorrados().filter(b => b.registro.id !== registro.id);
    const lista = [{ registro, borradoEn: ahora }, ...resto].slice(0, MAX_BORRADOS);
    localStorage.setItem(CLAVE_BORRADOS, JSON.stringify(lista));
    return true;
  } catch {
    return false;
  }
}

/** Quita una copia (se deshizo el borrado o se restauró el registro). */
export function quitarBorrado(id: string): void {
  try {
    const resto = leerBorrados().filter(b => b.registro.id !== id);
    if (resto.length) localStorage.setItem(CLAVE_BORRADOS, JSON.stringify(resto));
    else localStorage.removeItem(CLAVE_BORRADOS);
  } catch {
    // sin espacio o bloqueado: no hay nada que quitar
  }
}
