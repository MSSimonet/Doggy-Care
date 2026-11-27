// Deducciones: tasa por año, fecha de corte, y qué falta transferir (perro por perro) o ya se transfirió.
import type { AppConfig } from '../types';
import type { HistoricalStayRecord } from '../data/historialData';
import { historyDzPending } from './calculations';
import { archivadoEn, normalizarFecha } from './agendaOrden';
import { normalizeDogName } from '../data/historialData';
import { completarConfig } from './tasasDeduccion';

export { completarConfig, tasaPorAño, tasaParaFin } from './tasasDeduccion';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MS_DIA = 24 * 60 * 60 * 1000;

/**
 * Fecha de fin ("AAAA-MM-DD") de cada registro archivado. Los importados de la planilla guardan "D/M" sin año:
 * se recorren en el orden de la planilla (rowIndex) desde el más nuevo, que se toma como el más cercano a hoy
 * sin pasarse; cada anterior es el más cercano que no quede más de 2 meses después del siguiente.
 * Los archivados desde la app usan la hora de archivado de su id.
 */
export function fechasDeFin(registros: HistoricalStayRecord[], ahoraMs: number = Date.now()): Map<string, string | null> {
  const res = new Map<string, string | null>();
  const sinAño: HistoricalStayRecord[] = [];
  for (const r of registros) {
    const valor = (r.untilDay || r.fromDay || '').trim();
    const pista = archivadoEn(r.id);
    if (ISO.test(valor) || pista !== undefined) res.set(r.id, normalizarFecha(valor, pista, ahoraMs));
    else sinAño.push(r);
  }
  const ordenados = [...sinAño].sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0));
  let siguiente: number | null = null;
  for (let i = ordenados.length - 1; i >= 0; i--) {
    const r = ordenados[i];
    const limite: number = siguiente === null ? ahoraMs : siguiente + 60 * MS_DIA;
    const fin = normalizarFecha(r.untilDay || r.fromDay, undefined, limite);
    res.set(r.id, fin);
    if (fin) siguiente = Date.parse(`${fin}T00:00:00Z`);
  }
  return res;
}

export interface ItemDeduccion {
  id: string;
  dogName: string;
  desde: string;
  hasta: string;
  /** fin "AAAA-MM-DD" (para la fecha de corte); null si no se pudo saber */
  fin: string | null;
  /** total cobrado de la estadía (el total a pagar del registro) */
  totalCobrado: number;
  tasa: number;
  /** pendientes: lo que falta transferir; transferidas: lo transferido */
  monto: number;
  /** fecha (ISO) en que se marcó como transferida, si se sabe */
  transferidaEn?: string;
}

export interface GrupoPerro {
  clave: string;
  dogName: string;
  subtotal: number;
  items: ItemDeduccion[];
}

export interface ResumenDeducciones {
  pendientes: ItemDeduccion[];
  porPerro: GrupoPerro[];
  total: number;
  transferidas: ItemDeduccion[];
  inicio: string;
}

const enCorte = (fin: string | null, inicio: string) => fin !== null && fin >= inicio;

/**
 * Qué falta transferir y qué ya se transfirió, desde la fecha de inicio de deducciones.
 * Cuenta SÓLO registros del Historial (historical_stays): una estadía de la Agenda, actual o futura, no suma
 * hasta que se finaliza y pasa al Historial. Los registros que terminan antes (o sin fecha reconocible)
 * se consideran resueltos.
 */
export function resumirDeducciones(opciones: {
  registros: HistoricalStayRecord[];
  config: AppConfig;
  ahoraMs?: number;
  /** registros que no se muestran (por ejemplo, los de estadías que siguen en la Agenda) */
  excluir?: Set<string>;
}): ResumenDeducciones {
  const config = completarConfig(opciones.config);
  const inicio = config.dzStartDate!;
  const fines = fechasDeFin(opciones.registros, opciones.ahoraMs);
  const pendientes: ItemDeduccion[] = [];
  const transferidas: ItemDeduccion[] = [];

  for (const r of opciones.registros) {
    if (opciones.excluir?.has(r.id)) continue;
    const fin = fines.get(r.id) ?? null;
    if (!enCorte(fin, inicio)) continue;
    const base: Omit<ItemDeduccion, 'monto'> = {
      id: r.id,
      dogName: (r.dogName || '').trim(),
      desde: r.fromDay,
      hasta: r.untilDay,
      fin,
      totalCobrado: r.totalPagar || 0,
      tasa: r.dzRate ?? config.dzRate,
      transferidaEn: r.dzTransferredAt
    };
    const falta = historyDzPending(r);
    if (falta >= 1) pendientes.push({ ...base, monto: falta });
    else if (r.dzTransferred && (r.dz || 0) >= 1) transferidas.push({ ...base, monto: (r.dz || 0) - falta });
  }

  // Perro por perro: el que más debe arriba; dentro de cada perro, la estadía más reciente arriba
  const grupos = new Map<string, GrupoPerro>();
  for (const it of pendientes) {
    const clave = normalizeDogName(it.dogName);
    const g = grupos.get(clave) ?? { clave, dogName: it.dogName, subtotal: 0, items: [] };
    g.subtotal += it.monto;
    g.items.push(it);
    grupos.set(clave, g);
  }
  const porFin = (a: ItemDeduccion, b: ItemDeduccion) => (b.fin ?? '').localeCompare(a.fin ?? '');
  const porPerro = [...grupos.values()]
    .map(g => ({ ...g, items: [...g.items].sort(porFin) }))
    .sort((a, b) => b.subtotal - a.subtotal || a.dogName.localeCompare(b.dogName, 'es'));

  return {
    pendientes,
    porPerro,
    total: pendientes.reduce((s, it) => s + it.monto, 0),
    transferidas: [...transferidas].sort((a, b) => (b.transferidaEn ?? '').localeCompare(a.transferidaEn ?? '') || porFin(a, b)),
    inicio
  };
}
