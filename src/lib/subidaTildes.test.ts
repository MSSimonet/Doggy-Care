// Subida única de los tildes locales: nube simulada, nunca la base real.
import { describe, expect, it } from 'vitest';
import type { NuevaOperacion } from './colaPendientes';
import type { Marcas } from './marcasDeduccion';
import type { Lectura, TildeNube } from './supabase';
import { planificarSubida, subirTildesLocales } from './subidaTildes';

const fila = (id: string, dzTransferred: boolean, extra: Partial<TildeNube> = {}): TildeNube => ({ id, dzTransferred, dzTransferredAmount: dzTransferred ? 100 : 0, ...extra });
const marca = (monto = 100, at = '2026-11-26T10:00:00.000Z') => ({ dzTransferred: true, dzTransferredAmount: monto, dzTransferredAt: at });

/** Nube simulada: aplica los parches que recibe (como lo haría la base con las columnas) o los ignora (sin columnas / sin conexión). */
function nubeSimulada(inicial: TildeNube[], opciones: { guarda?: boolean; error?: string } = {}) {
  const filas = new Map(inicial.map(f => [f.id, { ...f }]));
  const recibidas: NuevaOperacion[] = [];
  const marcasBorradas: string[][] = [];
  return {
    recibidas,
    marcasBorradas,
    filas,
    leerNube: async (): Promise<Lectura<TildeNube[]>> => (opciones.error ? { ok: false, error: opciones.error } : { ok: true, data: [...filas.values()].map(f => ({ ...f })) }),
    subir: async (ops: NuevaOperacion[]) => {
      recibidas.push(...ops);
      if (opciones.guarda !== false) {
        for (const op of ops) {
          const f = filas.get(op.clave);
          const d = op.datos as { dzTransferred: boolean; dzTransferredAmount: number; dzTransferredAt: string | null };
          if (f) Object.assign(f, { dzTransferred: d.dzTransferred, dzTransferredAmount: d.dzTransferredAmount, dzTransferredAt: d.dzTransferredAt ?? undefined });
        }
      }
      return opciones.guarda !== false;
    },
    borrarMarcas: (ids: string[]) => { marcasBorradas.push(ids); return true; }
  };
}

describe('planificarSubida', () => {
  it('separa lo que hay que subir de lo que la nube ya tiene, de lo destildado y de lo que ya no existe', () => {
    const marcas: Marcas = { a: marca(), b: marca(), c: { dzTransferred: false, dzTransferredAmount: 0 }, d: marca() };
    const plan = planificarSubida(marcas, [fila('a', false), fila('b', true), fila('c', true), fila('x', true)]);
    expect(plan).toMatchObject({ enLaNube: 3, locales: 4, porSubir: ['a'], yaEnLaNube: ['b'], destildadas: ['c'], sinFila: ['d'] });
  });
});

describe('subirTildesLocales', () => {
  it('sube sólo los tildes que la nube no tiene, sin pisar los que ya tiene, y borra la copia local confirmada', async () => {
    const nube = nubeSimulada([fila('a', false), fila('b', true, { dzTransferredAmount: 555, dzTransferredAt: '2026-10-01T00:00:00.000Z' }), fila('c', false)]);
    const marcas: Marcas = { a: marca(31680), b: marca(999, '2026-11-26T10:00:00.000Z') };
    const r = await subirTildesLocales({ ...nube, marcas });
    expect(nube.recibidas.map(o => o.clave)).toEqual(['a']); // b ya estaba tildado en la nube: no se toca
    expect(nube.recibidas[0]).toMatchObject({ tipo: 'parche', tabla: 'historical_stays', datos: { dzTransferred: true, dzTransferredAmount: 31680 } });
    expect(nube.filas.get('b')).toMatchObject({ dzTransferredAmount: 555, dzTransferredAt: '2026-10-01T00:00:00.000Z' }); // intacto
    expect(r).toEqual({ ok: true, antes: 1, despues: 2, subidas: 1, sinConfirmar: 0, borradas: 2 });
    expect(nube.marcasBorradas[0].sort()).toEqual(['a', 'b']);
  });

  it('es idempotente: repetirla no sube nada más', async () => {
    const nube = nubeSimulada([fila('a', false)]);
    const marcas: Marcas = { a: marca() };
    await subirTildesLocales({ ...nube, marcas });
    nube.recibidas.length = 0;
    const r = await subirTildesLocales({ ...nube, marcas }); // la copia local seguiría (simulada) pero la nube ya tiene el tilde
    expect(nube.recibidas).toEqual([]);
    expect(r).toMatchObject({ ok: true, subidas: 0, sinConfirmar: 0 });
  });

  it('sin conexión (la cola no guardó): no se borra nada de este teléfono y se avisa cuántos faltan', async () => {
    const nube = nubeSimulada([fila('a', false), fila('b', false)], { guarda: false });
    const r = await subirTildesLocales({ ...nube, marcas: { a: marca(), b: marca() } });
    expect(r).toMatchObject({ ok: true, subidas: 0, sinConfirmar: 2, borradas: 0 });
    expect(nube.marcasBorradas).toEqual([]);
  });

  it('sólo se borra la copia de lo que la segunda lectura confirma', async () => {
    const nube = nubeSimulada([fila('a', false), fila('b', false)]);
    const subirOriginal = nube.subir;
    nube.subir = async ops => { await subirOriginal(ops.filter(o => o.clave === 'a')); return true; }; // "b" no llegó
    const r = await subirTildesLocales({ ...nube, marcas: { a: marca(), b: marca() } });
    expect(r).toMatchObject({ ok: true, subidas: 1, sinConfirmar: 1, borradas: 1 });
    expect(nube.marcasBorradas[0]).toEqual(['a']);
  });

  it('si la nube no tiene las columnas (migración 005 sin aplicar) frena sin subir ni borrar nada', async () => {
    const nube = nubeSimulada([], { error: 'column historical_stays.dz_transferred does not exist' });
    const r = await subirTildesLocales({ ...nube, marcas: { a: marca() } });
    expect(r).toEqual({ ok: false, error: 'column historical_stays.dz_transferred does not exist' });
    expect(nube.recibidas).toEqual([]);
    expect(nube.marcasBorradas).toEqual([]);
  });

  it('no sube los destildados ni los de registros que ya no existen, y limpia esas marcas', async () => {
    const nube = nubeSimulada([fila('a', true)]);
    const marcas: Marcas = { a: { dzTransferred: false, dzTransferredAmount: 0 }, z: marca() };
    const r = await subirTildesLocales({ ...nube, marcas });
    expect(nube.recibidas).toEqual([]);
    expect(nube.filas.get('a')!.dzTransferred).toBe(true); // la nube manda
    expect(r).toMatchObject({ ok: true, borradas: 2 });
  });
});
