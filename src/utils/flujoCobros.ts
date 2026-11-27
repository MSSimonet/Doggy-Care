// Flujo de una estadía:  Agenda → (Finalizar) → Cobros → (Cobrado + Deducida) → Historial.
// - Finalizar la saca de la Agenda y la deja en Cobros (sigue siendo una estadía, no un registro del Historial).
// - En Cobros se marca "Cobrado" (se cobró todo lo que faltaba) y "Deducida" (se transfirió la deducción).
// - Con las dos tildadas pasa sola al Historial y se va de Cobros.
import type { AppConfig, Stay } from '../types';
import { calculateStay, markDzTransferred, toggleDzTransfer } from './calculations';

export interface EstadoCobro {
  /** no falta cobrar nada (el total de la estadía está cubierto) */
  cobrado: boolean;
  /** la deducción generada ya está transferida; sin nada que deducir cuenta como hecha */
  deducida: boolean;
  /** hay deducción que transferir (si no, el tilde "Deducida" no se puede tocar) */
  hayDeduccion: boolean;
  /** cobrado + deducida: pasa al Historial */
  listo: boolean;
}

export function estadoCobro(stay: Stay, config: AppConfig): EstadoCobro {
  const calc = calculateStay(stay, config);
  const cobrado = calc.totalCharge >= 1 && calc.totalAdeudado < 1;
  const hayDeduccion = calc.dzGenerated >= 1;
  const deducida = hayDeduccion ? stay.dzTransferred === true && calc.dzPending < 1 : cobrado;
  return { cobrado, deducida, hayDeduccion, listo: cobrado && deducida };
}

/** Marca "Cobrado": se cobra lo que faltaba. Si la deducción ya estaba transferida, se actualiza al nuevo cobrado. */
export function cobrar(stay: Stay, config: AppConfig, ahora?: string): Stay {
  const calc = calculateStay(stay, config);
  const falta = Math.max(0, calc.totalAdeudado);
  const conCobro: Stay = { ...stay, amountPaid: Math.round((stay.amountPaid || 0) + falta) };
  return stay.dzTransferred ? markDzTransferred(conCobro, config, ahora) : conCobro;
}

/** Marca o desmarca "Deducida" (transferida todo lo generado hasta ahora, con la fecha). */
export function deducir(stay: Stay, config: AppConfig, ahora?: string): Stay {
  return toggleDzTransfer(stay, config, ahora);
}

export const finalizar = (stay: Stay): Stay => ({ ...stay, finalizada: true });
export const volverALaAgenda = (stay: Stay): Stay => ({ ...stay, finalizada: false });
