import type { HistoricalStayRecord } from '../data/historialData';
import { normalizeDogName } from '../data/historialData';
import { claveDeRegistro, compararClaves } from './agendaOrden';

export interface UltimaEstadia {
  registro: HistoricalStayRecord;
  /** "21/11" (sin año ni ceros a la izquierda) */
  desde: string;
  hasta: string;
  tarifaDiaria: number;
  total: number;
  /** Cuántas estadías archivadas tiene el perro (todas las escrituras de su nombre) */
  cantidad: number;
}

/** "2026-11-21" o "21/11" o "5/01" -> "21/11" / "5/1". Otro formato se devuelve tal cual. */
export function fechaCorta(valor: string | null | undefined): string {
  const v = String(valor ?? '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (iso) return `${Number(iso[3])}/${Number(iso[2])}`;
  const dm = /^(\d{1,2})\/(\d{1,2})$/.exec(v);
  if (dm) return `${Number(dm[1])}/${Number(dm[2])}`;
  return v;
}

/**
 * La estadía archivada más reciente de un perro, buscado por nombre normalizado (Tobias = Tobías, Ramón = "ramon ").
 * "Más reciente" usa el mismo criterio que las listas: hora de archivado, después mayor ID/secuencia, después fin.
 * Sin historial devuelve null.
 */
export function ultimaEstadiaDe(registros: HistoricalStayRecord[], nombrePerro: string, ahoraMs?: number): UltimaEstadia | null {
  const buscado = normalizeDogName(nombrePerro);
  if (!buscado) return null;
  const delPerro = registros.filter(r => normalizeDogName(r.dogName) === buscado);
  if (!delPerro.length) return null;
  let mejor = delPerro[0];
  let claveMejor = claveDeRegistro(mejor, ahoraMs);
  for (const r of delPerro.slice(1)) {
    const c = claveDeRegistro(r, ahoraMs);
    if (compararClaves(c, claveMejor, { conNombre: false }) < 0) {
      mejor = r;
      claveMejor = c;
    }
  }
  return {
    registro: mejor,
    desde: fechaCorta(mejor.fromDay),
    hasta: fechaCorta(mejor.untilDay),
    tarifaDiaria: Number(mejor.dailyRate) || 0,
    total: Number(mejor.totalPagar) || 0,
    cantidad: delPerro.length
  };
}
