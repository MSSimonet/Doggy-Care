// Subida única de los tildes de "transferida" que quedaron sólo en este dispositivo hacia la nube.
// - Lee primero la nube (sólo lectura) y sólo sube los registros que la nube NO tiene tildados: nunca pisa un
//   tilde que ya está en la nube, y repetirla no cambia nada (idempotente).
// - Sube por la cola sin conexión (un cambio por registro, sólo tilde + monto + fecha).
// - Borra la copia local de un tilde únicamente cuando una segunda lectura confirma que la nube ya lo tiene.
import type { NuevaOperacion } from './colaPendientes';
import type { Marcas } from './marcasDeduccion';
import type { Lectura, TildeNube } from './supabase';

export interface PlanSubida {
  /** registros con dz_transferred = true hoy en la nube */
  enLaNube: number;
  /** tildes guardados en este dispositivo */
  locales: number;
  /** tildados acá y todavía no en la nube: lo que se sube */
  porSubir: string[];
  /** tildados acá que la nube ya tiene tildados (no se tocan) */
  yaEnLaNube: string[];
  /** tildados acá cuyo registro ya no existe en la nube */
  sinFila: string[];
  /** marcas "destildado" locales (no se suben: la nube manda) */
  destildadas: string[];
}

export function planificarSubida(marcas: Marcas, nube: TildeNube[]): PlanSubida {
  const porId = new Map(nube.map(n => [n.id, n]));
  const plan: PlanSubida = { enLaNube: nube.filter(n => n.dzTransferred).length, locales: Object.keys(marcas).length, porSubir: [], yaEnLaNube: [], sinFila: [], destildadas: [] };
  for (const [id, m] of Object.entries(marcas)) {
    if (!m.dzTransferred) { plan.destildadas.push(id); continue; }
    const fila = porId.get(id);
    if (!fila) plan.sinFila.push(id);
    else if (fila.dzTransferred) plan.yaEnLaNube.push(id);
    else plan.porSubir.push(id);
  }
  return plan;
}

export type ResultadoSubida =
  | { ok: false; error: string }
  | {
      ok: true;
      /** transferidas en la nube antes y después */
      antes: number;
      despues: number;
      /** subidas y confirmadas por la segunda lectura */
      subidas: number;
      /** que no se pudieron confirmar (sin conexión, error, columna que falta): siguen guardadas acá */
      sinConfirmar: number;
      /** marcas borradas de este dispositivo */
      borradas: number;
    };

export async function subirTildesLocales(opciones: {
  leerNube: () => Promise<Lectura<TildeNube[]>>;
  marcas: Marcas;
  /** encola y espera: true si todas las operaciones se guardaron en la nube */
  subir: (ops: NuevaOperacion[]) => Promise<boolean>;
  borrarMarcas: (ids: string[]) => boolean;
}): Promise<ResultadoSubida> {
  const primera = await opciones.leerNube();
  if (!primera.ok) return { ok: false, error: primera.error };
  const plan = planificarSubida(opciones.marcas, primera.data);

  if (plan.porSubir.length) {
    const ops: NuevaOperacion[] = plan.porSubir.map(id => {
      const m = opciones.marcas[id];
      return { tipo: 'parche', tabla: 'historical_stays', clave: id, datos: { dzTransferred: true, dzTransferredAmount: m.dzTransferredAmount, dzTransferredAt: m.dzTransferredAt ?? null } };
    });
    await opciones.subir(ops);
  }

  // Segunda lectura: sólo lo que la nube confirma se borra de este dispositivo
  const segunda = await opciones.leerNube();
  if (!segunda.ok) return { ok: false, error: segunda.error };
  const confirmados = new Set(segunda.data.filter(n => n.dzTransferred).map(n => n.id));
  const subidasOk = plan.porSubir.filter(id => confirmados.has(id));
  const sinConfirmar = plan.porSubir.filter(id => !confirmados.has(id));
  const aBorrar = [...subidasOk, ...plan.yaEnLaNube, ...plan.destildadas, ...plan.sinFila];
  const borradas = aBorrar.length && opciones.borrarMarcas(aBorrar) ? aBorrar.length : 0;
  return { ok: true, antes: plan.enLaNube, despues: confirmados.size, subidas: subidasOk.length, sinConfirmar: sinConfirmar.length, borradas };
}
