import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ── Cliente de Supabase simulado ─────────────────────────────────────────────
// Cada tabla responde lo que diga `respuestas`; se cuentan lecturas y escrituras.

type Respuesta = { data: unknown; error: { message: string } | null };

const db = vi.hoisted(() => ({
  respuestas: {} as Record<string, Respuesta>,
  lecturas: [] as string[],
  escrituras: [] as string[]
}));

vi.mock('@supabase/supabase-js', () => {
  const builder = (table: string) => {
    const respuesta = () => db.respuestas[table] ?? { data: [], error: null };
    const b: any = {
      select: () => { db.lecturas.push(table); return b; },
      order: () => b,
      eq: () => b,
      maybeSingle: () => Promise.resolve(respuesta()),
      single: () => Promise.resolve(respuesta()),
      upsert: () => { db.escrituras.push(`upsert ${table}`); return Promise.resolve({ data: null, error: null }); },
      insert: () => { db.escrituras.push(`insert ${table}`); return Promise.resolve({ data: null, error: null }); },
      update: () => { db.escrituras.push(`update ${table}`); return b; },
      delete: () => { db.escrituras.push(`delete ${table}`); return b; },
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

let sync: typeof import('./sincronizacion');

beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://prueba.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'clave-de-prueba');
  vi.resetModules();
  sync = await import('./sincronizacion');
});

beforeEach(() => {
  db.respuestas = {};
  db.lecturas = [];
  db.escrituras = [];
});

const filaEstadia = {
  id: 's1', dog_name: 'Rex', from_day: '2026-11-01', until_day: '2026-11-03', days: 3,
  daily_rate: 20000, is_capital: true, amount_paid: 0
};
const filaCliente = { id: 'c1', dog_name: 'Rex', owner_name: 'Ana' };

function nuevaSincronizacion() {
  const aplicar = vi.fn();
  const limpiar = vi.fn();
  const s = sync.crearSincronizacion({ aplicar, limpiar });
  return { s, aplicar, limpiar };
}

describe('sincronización atada a la sesión', () => {
  it('sin sesión: 0 llamadas a Supabase', async () => {
    const { s, aplicar } = nuevaSincronizacion();
    await s.cambiarSesion(null);
    await s.recargar();
    expect(db.lecturas).toEqual([]);
    expect(db.escrituras).toEqual([]);
    expect(aplicar).not.toHaveBeenCalled();
  });

  it('con sesión: 4 lecturas, una por tabla, y ninguna escritura', async () => {
    db.respuestas.stays = { data: [filaEstadia], error: null };
    db.respuestas.clients_directory = { data: [filaCliente], error: null };
    const { s, aplicar } = nuevaSincronizacion();
    await s.cambiarSesion('usuario-1');

    expect(db.lecturas.sort()).toEqual(['app_config', 'clients_directory', 'historical_stays', 'stays']);
    expect(db.escrituras).toEqual([]);
    const datos = aplicar.mock.calls[0][0];
    expect(datos.stays).toMatchObject({ ok: true, data: [{ id: 's1', dogName: 'Rex' }] });
    expect(datos.clients).toMatchObject({ ok: true, data: [{ id: 'c1', ownerName: 'Ana' }] });
    expect(sync.erroresDeLectura(datos)).toEqual([]);
  });

  it('la misma sesión no vuelve a leer; "Reintentar" sí', async () => {
    const { s } = nuevaSincronizacion();
    await s.cambiarSesion('usuario-1');
    await s.cambiarSesion('usuario-1');
    expect(db.lecturas).toHaveLength(4);
    await s.recargar();
    expect(db.lecturas).toHaveLength(8);
  });

  it('lectura fallida: avisa con el mensaje real y 0 escrituras', async () => {
    db.respuestas.clients_directory = { data: null, error: { message: 'permission denied for table clients_directory' } };
    db.respuestas.stays = { data: null, error: { message: 'JWT expired' } };
    const { s, aplicar } = nuevaSincronizacion();
    await s.cambiarSesion('usuario-1');

    expect(db.escrituras).toEqual([]);
    const datos = aplicar.mock.calls[0][0];
    expect(datos.clients).toEqual({ ok: false, error: 'permission denied for table clients_directory' });
    expect(sync.erroresDeLectura(datos)).toEqual([
      { tabla: 'estadías', mensaje: 'JWT expired' },
      { tabla: 'directorio de clientes', mensaje: 'permission denied for table clients_directory' }
    ]);
  });

  it('tabla vacía: se distingue del error y 0 escrituras (no se cargan clientes de ejemplo)', async () => {
    db.respuestas.clients_directory = { data: [], error: null };
    db.respuestas.historical_stays = { data: [], error: null };
    db.respuestas.app_config = { data: null, error: null };
    const { s, aplicar } = nuevaSincronizacion();
    await s.cambiarSesion('usuario-1');

    expect(db.escrituras).toEqual([]);
    const datos = aplicar.mock.calls[0][0];
    expect(datos.clients).toEqual({ ok: true, data: [] });
    expect(datos.history).toEqual({ ok: true, data: [] });
    expect(datos.config).toEqual({ ok: true, data: null });
    expect(sync.erroresDeLectura(datos)).toEqual([]);
  });

  it('cerrar sesión limpia los datos de la cuenta y no llama a Supabase', async () => {
    const { s, limpiar } = nuevaSincronizacion();
    await s.cambiarSesion('usuario-1');
    db.lecturas = [];
    await s.cambiarSesion(null);
    expect(limpiar).toHaveBeenCalledTimes(1);
    expect(db.lecturas).toEqual([]);
    expect(db.escrituras).toEqual([]);
  });

  it('cambiar de cuenta limpia antes de leer la nueva', async () => {
    const { s, limpiar, aplicar } = nuevaSincronizacion();
    await s.cambiarSesion('usuario-1');
    await s.cambiarSesion('usuario-2');
    expect(limpiar).toHaveBeenCalledTimes(1);
    expect(aplicar).toHaveBeenCalledTimes(2);
  });

  it('una respuesta que llega después de cerrar sesión se descarta', async () => {
    const { s, aplicar, limpiar } = nuevaSincronizacion();
    const pendiente = s.cambiarSesion('usuario-1');
    await s.cambiarSesion(null);
    await pendiente;
    expect(limpiar).toHaveBeenCalledTimes(1);
    expect(aplicar).not.toHaveBeenCalled();
  });
});

describe('primera carga terminada (distinta de "cargando")', () => {
  it('pasa a true después de la primera lectura y no vuelve a false al reintentar', async () => {
    const primeraCarga = vi.fn();
    const cargando = vi.fn();
    const s = sync.crearSincronizacion({ aplicar: vi.fn(), limpiar: vi.fn(), cargando, primeraCarga });
    await s.cambiarSesion('u1');
    expect(primeraCarga.mock.calls).toEqual([[false], [true]]);
    expect(s.primeraCargaTerminada()).toBe(true);

    await s.recargar();
    expect(cargando).toHaveBeenCalledWith(true);
    expect(primeraCarga.mock.calls).toEqual([[false], [true]]);
    expect(s.primeraCargaTerminada()).toBe(true);
  });

  it('también termina si la lectura falla (se muestra el error, no "Sincronizando…" para siempre)', async () => {
    db.respuestas.stays = { data: null, error: { message: 'permission denied' } };
    const primeraCarga = vi.fn();
    const s = sync.crearSincronizacion({ aplicar: vi.fn(), limpiar: vi.fn(), primeraCarga });
    await s.cambiarSesion('u1');
    expect(s.primeraCargaTerminada()).toBe(true);
  });

  it('cambiar de cuenta la vuelve a false hasta leer la nueva', async () => {
    const primeraCarga = vi.fn();
    const s = sync.crearSincronizacion({ aplicar: vi.fn(), limpiar: vi.fn(), primeraCarga });
    await s.cambiarSesion('u1');
    const p = s.cambiarSesion('u2');
    expect(s.primeraCargaTerminada()).toBe(false);
    await p;
    expect(s.primeraCargaTerminada()).toBe(true);
    expect(primeraCarga.mock.calls).toEqual([[false], [true], [false], [true]]);
  });
});
