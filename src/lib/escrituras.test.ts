// Ejecutor de Supabase con un cliente simulado (nunca la base real) y clasificación de errores.
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Operacion } from './colaPendientes';
import { AVISO_TILDE_LOCAL, clasificarError, crearEjecutorSupabase, parcheToRow } from './escrituras';

describe('clasificarError', () => {
  it('sin conexión, servidor caído o demasiadas llamadas = red (se reintenta solo)', () => {
    expect(clasificarError({ message: 'TypeError: Failed to fetch', status: 0 })).toBe('red');
    expect(clasificarError({ message: 'Load failed' })).toBe('red');
    expect(clasificarError({ message: 'Bad gateway', status: 502 })).toBe('red');
    expect(clasificarError({ message: 'Too many requests', status: 429 })).toBe('red');
  });
  it('sesión vencida = sesion (pide iniciar sesión, conserva la cola)', () => {
    expect(clasificarError({ message: 'JWT expired', code: 'PGRST301', status: 401 })).toBe('sesion');
    expect(clasificarError({ message: 'Invalid Refresh Token: Refresh Token Not Found' })).toBe('sesion');
  });
  it('permiso denegado o dato inválido = permanente', () => {
    expect(clasificarError({ message: 'new row violates row-level security policy', code: '42501', status: 403 })).toBe('permanente');
    expect(clasificarError({ message: 'invalid input syntax for type numeric', code: '22P02', status: 400 })).toBe('permanente');
    expect(clasificarError({ message: "Could not find the 'otra' column", code: 'PGRST204', status: 400 })).toBe('permanente');
  });
});

describe('parcheToRow', () => {
  it('sólo acepta los campos del tilde de deducción', () => {
    expect(parcheToRow({ dzTransferred: true, dzTransferredAmount: 18 })).toEqual({ dz_transferred: true, dz_transferred_amount: 18 });
    expect(parcheToRow({ dailyRate: 1 })).toBeNull();
  });
});

type Llamada = { tabla: string; accion: string; fila?: Record<string, unknown>; id?: unknown };

/** Cliente simulado: responde según una función y anota cada llamada. */
function clienteSimulado(responder: (l: Llamada) => { error: { message: string; code?: string } | null; status?: number; data?: unknown }) {
  const llamadas: Llamada[] = [];
  const cliente = {
    from(tabla: string) {
      const l: Llamada = { tabla, accion: '' };
      const fin = {
        eq(_c: string, v: unknown) { l.id = v; return fin; },
        select() { return fin; },
        then(res: (v: unknown) => unknown) { llamadas.push({ ...l }); return Promise.resolve(responder(l)).then(res); }
      };
      return {
        upsert(fila: Record<string, unknown>) { l.accion = 'upsert'; l.fila = fila; return fin; },
        update(fila: Record<string, unknown>) { l.accion = 'update'; l.fila = fila; return fin; },
        delete() { l.accion = 'delete'; return fin; },
        select() { l.accion = 'select'; return fin; }
      };
    }
  };
  return { cliente: cliente as unknown as SupabaseClient, llamadas };
}

const op = (o: Partial<Operacion>): Operacion => ({ id: 'op1', tipo: 'upsert', tabla: 'stays', clave: 'x', creada: 0, intentos: 1, estado: 'pendiente', ...o });

describe('crearEjecutorSupabase', () => {
  it('historial sin la columna del tilde: guarda el resto y avisa (antes fallaba sin aviso)', async () => {
    const { cliente, llamadas } = clienteSimulado(l =>
      l.fila && 'dz_transferred_amount' in l.fila ? { error: { message: "Could not find the 'dz_transferred_amount' column of 'historical_stays' in the schema cache", code: 'PGRST204' }, status: 400 }
      : l.fila && 'dz_transferred' in l.fila ? { error: { message: "Could not find the 'dz_transferred' column of 'historical_stays' in the schema cache", code: 'PGRST204' }, status: 400 }
      : { error: null, status: 201 }
    );
    const ejecutar = crearEjecutorSupabase(cliente);
    const r = await ejecutar(op({ tabla: 'historical_stays', clave: 'h1', datos: { id: 'h1', rowIndex: 3, dogName: 'Luna', fromDay: '1/6', untilDay: '8/6', dzTransferred: true, dzTransferredAmount: 10 } }));
    expect(r).toEqual({ ok: true, aviso: AVISO_TILDE_LOCAL });
    expect(llamadas).toHaveLength(3);
    expect(llamadas[2].fila).toMatchObject({ id: 'h1', dog_name: 'Luna' });
    expect(llamadas[2].fila).not.toHaveProperty('dz_transferred');
  });

  it('parche: cambia sólo esos campos del registro con ese id', async () => {
    const { cliente, llamadas } = clienteSimulado(() => ({ error: null, status: 200, data: [{ id: 'h1' }] }));
    const r = await crearEjecutorSupabase(cliente)(op({ tipo: 'parche', tabla: 'historical_stays', clave: 'h1', datos: { dzTransferred: true } }));
    expect(r).toEqual({ ok: true });
    expect(llamadas[0]).toMatchObject({ tabla: 'historical_stays', accion: 'update', id: 'h1' });
    expect(Object.keys(llamadas[0].fila!).sort()).toEqual(['dz_transferred', 'updated_at']);
  });

  it('sin conexión: falla como red', async () => {
    const { cliente } = clienteSimulado(() => ({ error: { message: 'TypeError: Failed to fetch' }, status: 0 }));
    const r = await crearEjecutorSupabase(cliente)(op({ datos: { id: 'x', dogName: 'A', fromDay: '2026-01-01', untilDay: '2026-01-02' } }));
    expect(r).toMatchObject({ ok: false, tipo: 'red' });
  });

  it('borrar sin filas borradas: si el registro sigue en la nube es error (sin permiso), en cualquier intento', async () => {
    // La base no borra (permiso denegado por RLS) pero el registro sigue ahí
    const { cliente, llamadas } = clienteSimulado(l => ({ error: null, status: 200, data: l.accion === 'select' ? [{ id: 'h1' }] : [] }));
    const ejecutar = crearEjecutorSupabase(cliente);
    for (const intentos of [1, 2, 5]) {
      const r = await ejecutar(op({ tipo: 'delete', tabla: 'historical_stays', clave: 'h1', intentos }));
      expect(r, `intento ${intentos}`).toMatchObject({ ok: false, tipo: 'permanente' });
    }
    expect(llamadas.map(l => l.accion)).toEqual(['delete', 'select', 'delete', 'select', 'delete', 'select']);
  });

  it('borrar sin filas borradas porque ya no estaba (por ejemplo, se borró en un intento anterior): cuenta como hecho', async () => {
    const { cliente } = clienteSimulado(() => ({ error: null, status: 200, data: [] }));
    const ejecutar = crearEjecutorSupabase(cliente);
    expect(await ejecutar(op({ tipo: 'delete', tabla: 'historical_stays', clave: 'h1', intentos: 2 }))).toEqual({ ok: true });
    expect(await ejecutar(op({ tipo: 'delete', tabla: 'stays', clave: 's1', intentos: 1 }))).toEqual({ ok: true });
  });

  it('borrar: si no se puede comprobar si sigue (sin conexión) se reintenta, no se da por hecho', async () => {
    const { cliente } = clienteSimulado(l => (l.accion === 'select' ? { error: { message: 'Failed to fetch' }, status: 0 } : { error: null, status: 200, data: [] }));
    expect(await crearEjecutorSupabase(cliente)(op({ tipo: 'delete', tabla: 'historical_stays', clave: 'h1' }))).toMatchObject({ ok: false, tipo: 'red' });
  });

  it('parche que no cambia ninguna fila: error si el registro existe (sin permiso); hecho si ya no existe (no se recrea)', async () => {
    const existe = clienteSimulado(l => ({ error: null, status: 200, data: l.accion === 'select' ? [{ id: 'h1' }] : [] }));
    expect(await crearEjecutorSupabase(existe.cliente)(op({ tipo: 'parche', tabla: 'historical_stays', clave: 'h1', datos: { dzTransferred: true } }))).toMatchObject({ ok: false, tipo: 'permanente' });
    const noExiste = clienteSimulado(() => ({ error: null, status: 200, data: [] }));
    expect(await crearEjecutorSupabase(noExiste.cliente)(op({ tipo: 'parche', tabla: 'historical_stays', clave: 'h1', datos: { dzTransferred: true } }))).toEqual({ ok: true });
    expect(noExiste.llamadas.some(l => l.accion === 'upsert')).toBe(false);
  });

  it('una excepción de red (fetch rechazado) se toma como red, no como error permanente', async () => {
    const cliente = { from: () => { throw new TypeError('Failed to fetch'); } } as unknown as SupabaseClient;
    expect(await crearEjecutorSupabase(cliente)(op({ tipo: 'delete', clave: 's1' }))).toMatchObject({ ok: false, tipo: 'red' });
  });
});
