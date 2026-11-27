// Orden de la Agenda (Directorio): del perro con la estadía más reciente al más antiguo.
//
// Fecha usada: la de FIN de la última estadía (untilDay; si falta, fromDay) entre
//   - las estadías activas del perro,
//   - sus registros del Historial,
//   - la estadía base de su ficha del directorio (historicalStay.departureDate / arrivalDate).
// Las fichas del directorio no guardan fecha de creación, así que no hay otro campo de desempate:
// empata por nombre. Sin ninguna fecha, el perro va al final, por nombre.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DIA_MES = /^(\d{1,2})\/(\d{1,2})$/;
const ID_ARCHIVADO = /^hist-agenda-.+-(\d{10,13})$/;
const MS_DIA = 24 * 60 * 60 * 1000;
// Una hora de archivado sólo es creíble entre 2000 y 2100, y no más de un par de días en el futuro
const HORA_MINIMA = Date.UTC(2000, 0, 1);
const HORA_MAXIMA = Date.UTC(2100, 0, 1);
const TOLERANCIA_FUTURO = 2 * MS_DIA;
// Años hacia atrás que se prueban para un "D/M" (alcanza para un 29/2: el último bisiesto está a 4 años)
const AÑOS_ATRAS = 5;

const pad = (n: number) => String(n).padStart(2, '0');

function aIso(año: number, mes: number, dia: number): string | null {
  const d = new Date(Date.UTC(año, mes - 1, dia));
  if (d.getUTCFullYear() !== año || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${año}-${pad(mes)}-${pad(dia)}`;
}

/**
 * Momento (ms) en que se archivó un registro creado desde la agenda: id "hist-agenda-<id>-<ms>".
 * Si el id no tiene hora, la tiene rota o ilegible, o no es una fecha creíble, devuelve undefined. Nunca lanza.
 */
export function archivadoEn(idRegistro: string | undefined): number | undefined {
  if (typeof idRegistro !== 'string') return undefined;
  const m = ID_ARCHIVADO.exec(idRegistro);
  if (!m) return undefined;
  const ms = Number(m[1]);
  return Number.isFinite(ms) && ms >= HORA_MINIMA && ms <= HORA_MAXIMA ? ms : undefined;
}

/** La fecha de ese día y mes más cercana al límite sin pasarse de él, o null si no existe en 5 años. */
function diaMesHasta(dia: number, mes: number, limiteMs: number): string | null {
  const añoLimite = new Date(limiteMs).getUTCFullYear();
  for (let atras = 0; atras < AÑOS_ATRAS; atras++) {
    const candidata = aIso(añoLimite - atras, mes, dia);
    if (candidata && Date.parse(`${candidata}T00:00:00Z`) <= limiteMs) return candidata;
  }
  return null;
}

/**
 * Lleva una fecha guardada a "AAAA-MM-DD", o null (= "sin fecha") si no se puede. Nunca lanza ni devuelve una fecha inválida.
 *
 * Acepta ISO y "D/M" (así guarda el archivado desde la agenda, sin año). El año de un "D/M" sale de:
 *  1. la hora de archivado (`pistaMs`, ver archivadoEn): la fecha más cercana que no pase de un mes después de ella;
 *  2. si esa hora falta o no es creíble: la fecha más cercana al presente (`ahoraMs`) que no cae en el futuro.
 */
export function normalizarFecha(valor: string | null | undefined, pistaMs?: number, ahoraMs: number = Date.now()): string | null {
  const v = typeof valor === 'string' ? valor.trim() : '';
  const iso = ISO.exec(v);
  if (iso) return aIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dm = DIA_MES.exec(v);
  if (!dm) return null;
  const dia = Number(dm[1]);
  const mes = Number(dm[2]);
  const ahora = Number.isFinite(ahoraMs) ? ahoraMs : Date.now();
  const pistaCreible =
    typeof pistaMs === 'number' && Number.isFinite(pistaMs) && pistaMs >= HORA_MINIMA && pistaMs <= ahora + TOLERANCIA_FUTURO;
  if (pistaCreible) return diaMesHasta(dia, mes, (pistaMs as number) + 31 * MS_DIA);
  return diaMesHasta(dia, mes, ahora);
}

// ── Claves de orden "más reciente primero" ───────────────────────────────────────────────────────
// Orden de un registro o de un perro en las listas (nueva solapa Historial y pantalla de registros archivados):
//   1. hora en que se finalizó o archivó la estadía (la del id "hist-agenda-<id>-<ms>"), del más nuevo al más viejo;
//   2. si no hay hora: el ID/secuencia de la hoja (rowIndex; mayor = más reciente);
//   3. fin de la estadía (until_day, o from_day);
//   4. nombre.
// Un dato que falta va siempre después de uno que existe. Lo finalizado desde la Agenda lleva hora de archivado:
// queda por encima de todo lo que no la tiene, aunque su fecha de fin sea anterior.

export interface ClaveOrden {
  /** Momento (ms) en que se archivó, o null */
  archivado: number | null;
  /** Posición en la hoja / secuencia de archivado (rowIndex), o null */
  secuencia: number | null;
  /** Fin de la estadía "AAAA-MM-DD", o null */
  fin: string | null;
  nombre: string;
}

/** Saca espacios de los bordes y junta los repetidos. No toca mayúsculas ni tildes (eso es de normalizeDogName). */
export function limpiarNombre(nombre: string | null | undefined): string {
  return typeof nombre === 'string' ? nombre.replace(/\s+/g, ' ').trim() : '';
}

export interface RegistroParaClave {
  id?: string;
  rowIndex?: number;
  fromDay?: string;
  untilDay?: string;
  dogName: string;
}

/** Clave de un registro archivado. `ahoraMs` sólo sirve para completar el año de fechas "D/M" sin hora de archivado. */
export function claveDeRegistro(r: RegistroParaClave, ahoraMs?: number): ClaveOrden {
  const archivado = archivadoEn(r.id) ?? null;
  const secuencia = typeof r.rowIndex === 'number' && Number.isFinite(r.rowIndex) && r.rowIndex > 0 ? r.rowIndex : null;
  const fin = normalizarFecha(r.untilDay || r.fromDay, archivado ?? undefined, ahoraMs);
  return { archivado, secuencia, fin, nombre: limpiarNombre(r.dogName) };
}

/** Clave de algo que no es un registro archivado (una estadía activa, una ficha): sólo puede tener fin. */
export function claveSinRegistro(fin: string | null | undefined, nombre: string): ClaveOrden {
  return { archivado: null, secuencia: null, fin: fin ?? null, nombre: limpiarNombre(nombre) };
}

function compararNumeroDesc(a: number | null, b: number | null): number {
  if (a !== null && b !== null) return a === b ? 0 : a < b ? 1 : -1;
  if (a !== null) return -1;
  if (b !== null) return 1;
  return 0;
}

/** Negativo si `a` va antes (es más reciente). Con `conNombre: false` no desempata por nombre. */
export function compararClaves(a: ClaveOrden, b: ClaveOrden, opciones: { conNombre?: boolean } = {}): number {
  const porArchivado = compararNumeroDesc(a.archivado, b.archivado);
  if (porArchivado !== 0) return porArchivado;
  const porSecuencia = compararNumeroDesc(a.secuencia, b.secuencia);
  if (porSecuencia !== 0) return porSecuencia;
  if (a.fin !== null && b.fin !== null && a.fin !== b.fin) return a.fin < b.fin ? 1 : -1;
  if (a.fin !== null && b.fin === null) return -1;
  if (a.fin === null && b.fin !== null) return 1;
  if (opciones.conNombre === false) return 0;
  return a.nombre.localeCompare(b.nombre, 'es');
}

/** La clave más reciente de la lista (ignora el nombre al comparar), o null si está vacía. */
export function mejorClave(claves: ClaveOrden[]): ClaveOrden | null {
  let mejor: ClaveOrden | null = null;
  for (const c of claves) {
    if (mejor === null || compararClaves(c, mejor, { conNombre: false }) < 0) mejor = c;
  }
  return mejor;
}

/**
 * Cómo se muestra un perro que está escrito de varias maneras (Ramón, Ramon, "ramón "): la escritura del registro más
 * reciente, sin espacios sobrantes. Con claves iguales o sin datos queda la primera. Los nombres vacíos se ignoran.
 */
export function elegirNombreVisible(candidatos: { nombre: string; clave: ClaveOrden }[]): string {
  let mejor: { nombre: string; clave: ClaveOrden } | null = null;
  for (const c of candidatos) {
    if (!limpiarNombre(c.nombre)) continue;
    if (mejor === null || compararClaves(c.clave, mejor.clave, { conNombre: false }) < 0) mejor = c;
  }
  return mejor ? limpiarNombre(mejor.nombre) : '';
}
