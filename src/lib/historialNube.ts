// Qué se muestra del Registro de estadías después de leer la nube: lo leído + lo que la nube no guarda todavía
// (el tilde de transferida, mientras falte la migración 005) + lo que sigue pendiente en la cola.
// Así releer la nube nunca pisa un tilde que la persona ya puso.
import type { HistoricalStayRecord } from '../data/historialData';
import { filterDeleted } from '../utils/historyDelete';
import { conPendientes, type Operacion } from './colaPendientes';
import { aplicarMarcas, type Marcas } from './marcasDeduccion';

export function historialDesdeLaNube(opciones: {
  /** registros tal como llegaron de la nube */
  nube: HistoricalStayRecord[];
  /** ids borrados en este dispositivo (no vuelven a aparecer) */
  borrados: string[];
  /** tildes guardados en este dispositivo */
  marcas: Marcas;
  /** cambios todavía sin subir (se ven aplicados) */
  ops: Operacion[];
  /** registro que está en sus 10 s para deshacer el borrado */
  enBorrado?: string | null;
}): HistoricalStayRecord[] {
  const { nube, borrados, marcas, ops, enBorrado } = opciones;
  const leidos = aplicarMarcas(filterDeleted(nube, borrados), marcas).filter(r => r.id !== enBorrado);
  return conPendientes(leidos, ops, 'historical_stays');
}
