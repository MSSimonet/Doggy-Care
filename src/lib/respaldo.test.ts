import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { armarRespaldo, nombreRespaldo, TABLAS_RESPALDO, descargarArchivo } from './respaldo';

// ── Cliente de Supabase simulado: cuenta lecturas y escrituras ──────────────

const db = vi.hoisted(() => ({
  respuestas: {} as Record<string, { data: unknown; error: { message: string } | null }>,
  lecturas: [] as string[],
  escrituras: [] as string[]
}));

vi.mock('@supabase/supabase-js', () => {
  const builder = (table: string) => {
    const respuesta = () => db.respuestas[table] ?? { data: [], error: null };
    const escribir = (op: string) => () => { db.escrituras.push(`${op} ${table}`); return b; };
    const b: any = {
      select: () => { db.lecturas.push(table); return b; },
      order: () => b,
      eq: () => b,
      upsert: escribir('upsert'),
      insert: escribir('insert'),
      update: escribir('update'),
      delete: escribir('delete'),
      then: (ok: any, fail: any) => Promise.resolve(respuesta()).then(ok, fail)
    };
    return b;
  };
  return {
    createClient: () => ({
      from: (table: string) => builder(table),
      auth: {},
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => {}
    })
  };
});

let leerTablaParaRespaldo: typeof import('./supabase').leerTablaParaRespaldo;

beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://prueba.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'clave-de-prueba');
  vi.resetModules();
  ({ leerTablaParaRespaldo } = await import('./supabase'));
});

beforeEach(() => {
  db.respuestas = {};
  db.lecturas = [];
  db.escrituras = [];
});

const ahora = new Date(2026, 10, 1, 9, 5); // 1/11/2026 09:05 hora local

describe('nombre del archivo', () => {
  it('lleva la fecha y la hora', () => {
    expect(nombreRespaldo(ahora)).toBe('doggy-care-respaldo-2026-11-01-0905.json');
  });
});

describe('respaldo de las 4 tablas', () => {
  it('lee las 4 tablas y no escribe nada', async () => {
    db.respuestas.stays = { data: [{ id: 's1' }, { id: 's2' }], error: null };
    db.respuestas.historical_stays = { data: [{ id: 'h1' }], error: null };
    db.respuestas.app_config = { data: [{ id: 1, dz_rate: 0.18 }], error: null };
    db.respuestas.clients_directory = { data: [{ id: 'c1' }], error: null };

    const r = await armarRespaldo(leerTablaParaRespaldo, ahora);

    expect(db.lecturas.sort()).toEqual([...TABLAS_RESPALDO].sort());
    expect(db.escrituras).toEqual([]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nombre).toBe('doggy-care-respaldo-2026-11-01-0905.json');
    expect(r.total).toBe(5);
    const json = JSON.parse(r.contenido);
    expect(Object.keys(json.tablas)).toEqual([...TABLAS_RESPALDO]);
    expect(json.tablas.stays).toEqual([{ id: 's1' }, { id: 's2' }]);
    expect(json.conteo).toEqual({ stays: 2, historical_stays: 1, app_config: 1, clients_directory: 1 });
    expect(json.generado).toBe(ahora.toISOString());
  });

  it('tablas vacías: el respaldo igual se arma, con listas vacías', async () => {
    const r = await armarRespaldo(leerTablaParaRespaldo, ahora);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.total).toBe(0);
    expect(db.escrituras).toEqual([]);
  });

  it('si una lectura falla no se arma el archivo y se devuelve el mensaje real', async () => {
    db.respuestas.historical_stays = { data: null, error: { message: 'permission denied for table historical_stays' } };
    const r = await armarRespaldo(leerTablaParaRespaldo, ahora);
    expect(r).toEqual({ ok: false, error: 'historical_stays: permission denied for table historical_stays' });
    expect(db.escrituras).toEqual([]);
  });
});

describe('descarga', () => {
  it('baja un JSON con ese nombre', () => {
    const crear = vi.fn(() => 'blob:prueba');
    const revocar = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL: crear, revokeObjectURL: revocar });
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    let nombre = '';
    clic.mockImplementation(function (this: HTMLAnchorElement) { nombre = this.download; });

    descargarArchivo('doggy-care-respaldo-2026-11-01-0905.json', '{}');

    expect(crear).toHaveBeenCalledTimes(1);
    expect((crear.mock.calls[0] as unknown[])[0]).toBeInstanceOf(Blob);
    expect(nombre).toBe('doggy-care-respaldo-2026-11-01-0905.json');
    clic.mockRestore();
    vi.unstubAllGlobals();
  });
});
