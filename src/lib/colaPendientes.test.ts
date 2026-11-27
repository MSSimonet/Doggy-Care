// Cola de cambios pendientes: pruebas con un "servidor" simulado en memoria (nunca la base real).
import { describe, expect, it } from 'vitest';
import { conPendientes, crearCola, describirOperacion, type Almacen, type Ejecutor, type Operacion, type ResultadoEjecucion, type TipoFalla } from './colaPendientes';

type Fila = { id: string; [k: string]: unknown };

/** Servidor simulado: tablas en memoria + registro de llamadas + fallas programables. */
function servidorSimulado() {
  const tablas: Record<string, Map<string, Fila>> = {};
  const tabla = (t: string) => (tablas[t] ??= new Map());
  const llamadas: string[] = [];
  let falla: TipoFalla | null = null;
  /** falla puntual para una clave (para errores permanentes o intermitentes) */
  const fallasPorClave = new Map<string, { tipo: TipoFalla; veces: number }>();
  /** se "corta la conexión" después de N operaciones exitosas */
  let cortarDespuesDe: number | null = null;

  const ejecutar: Ejecutor = async (op: Operacion): Promise<ResultadoEjecucion> => {
    await Promise.resolve();
    if (falla) return { ok: false, tipo: falla, mensaje: falla === 'red' ? 'Failed to fetch' : 'JWT expired' };
    const f = fallasPorClave.get(op.clave);
    if (f && f.veces > 0) {
      f.veces--;
      return { ok: false, tipo: f.tipo, mensaje: f.tipo === 'permanente' ? 'permission denied for table stays' : 'Failed to fetch' };
    }
    if (cortarDespuesDe !== null) {
      if (cortarDespuesDe === 0) return { ok: false, tipo: 'red', mensaje: 'Failed to fetch' };
      cortarDespuesDe--;
    }
    llamadas.push(`${op.tipo} ${op.tabla}:${op.clave}`);
    const t = tabla(op.tabla);
    if (op.tipo === 'upsert') t.set(op.clave, { ...(op.datos as Fila) });
    else if (op.tipo === 'delete') t.delete(op.clave);
    else {
      const actual = t.get(op.clave);
      if (actual) t.set(op.clave, { ...actual, ...(op.datos as object) });
    }
    return { ok: true };
  };

  return {
    ejecutar,
    tabla,
    llamadas,
    sinConexion: () => { falla = 'red'; },
    sesionVencida: () => { falla = 'sesion'; },
    conConexion: () => { falla = null; },
    fallarClave: (clave: string, tipo: TipoFalla, veces = Infinity) => fallasPorClave.set(clave, { tipo, veces }),
    cortarDespuesDe: (n: number | null) => { cortarDespuesDe = n; }
  };
}

/** Almacén en memoria que imita localStorage (y puede "llenarse"). */
function almacenMemoria(): Almacen & { texto: string | null; lleno: boolean } {
  const a = {
    texto: null as string | null,
    lleno: false,
    leer: () => a.texto,
    escribir: (t: string) => {
      if (a.lleno) throw new Error('QuotaExceededError');
      a.texto = t;
    }
  };
  return a;
}

const estadia = (id: string, dogName: string, extra: Record<string, unknown> = {}) => ({ id, dogName, dailyRate: 21000, ...extra });

describe('cola de cambios pendientes', () => {
  it('guardar con conexión: se sube enseguida y la cola queda vacía', async () => {
    const srv = servidorSimulado();
    const cola = crearCola({ almacen: almacenMemoria(), ejecutar: srv.ejecutar });
    cola.encolar([{ tipo: 'upsert', tabla: 'stays', clave: 's1', datos: estadia('s1', 'Candela') }]);
    const r = await cola.vaciar();
    expect(r).toMatchObject({ guardadas: 1, red: false, sesion: false });
    expect(cola.estado().pendientes).toBe(0);
    expect(srv.tabla('stays').get('s1')).toMatchObject({ dogName: 'Candela' });
  });

  it('guardar sin conexión: queda pendiente y al reconectar se sube en el orden en que se hizo', async () => {
    const srv = servidorSimulado();
    const cola = crearCola({ almacen: almacenMemoria(), ejecutar: srv.ejecutar });
    srv.sinConexion();
    cola.encolar([{ tipo: 'upsert', tabla: 'stays', clave: 's1', datos: estadia('s1', 'Candela') }]);
    cola.encolar([{ tipo: 'upsert', tabla: 'stays', clave: 's2', datos: estadia('s2', 'Luna') }]);
    cola.encolar([{ tipo: 'upsert', tabla: 'stays', clave: 's1', datos: estadia('s1', 'Candela', { dailyRate: 25000 }) }]);
    cola.encolar([{ tipo: 'delete', tabla: 'stays', clave: 's2' }]);
    const sin = await cola.vaciar();
    expect(sin.red).toBe(true);
    expect(cola.estado().pendientes).toBe(4);
    expect(srv.llamadas).toEqual([]);

    srv.conConexion();
    const con = await cola.vaciar();
    expect(con.guardadas).toBe(4);
    expect(srv.llamadas).toEqual(['upsert stays:s1', 'upsert stays:s2', 'upsert stays:s1', 'delete stays:s2']);
    expect(srv.tabla('stays').get('s1')).toMatchObject({ dailyRate: 25000 });
    expect(srv.tabla('stays').has('s2')).toBe(false);
    expect(cola.estado().pendientes).toBe(0);
  });

  it('cerrar y reabrir la app con cambios pendientes: siguen ahí y se suben al volver la conexión', async () => {
    const srv = servidorSimulado();
    const almacen = almacenMemoria();
    srv.sinConexion();
    const antes = crearCola({ almacen, ejecutar: srv.ejecutar });
    antes.encolar([{ tipo: 'upsert', tabla: 'clients_directory', clave: 'c1', datos: { id: 'c1', dogName: 'Tony' } }]);
    antes.encolar([{ tipo: 'parche', tabla: 'historical_stays', clave: 'h1', datos: { dzTransferred: true } }]);
    await antes.vaciar();
    // "se cierra la app": se descarta el objeto y se crea otro leyendo el mismo almacenamiento
    srv.conConexion();
    const despues = crearCola({ almacen, ejecutar: srv.ejecutar });
    expect(despues.estado().pendientes).toBe(2);
    expect(despues.operaciones().map(o => o.tipo)).toEqual(['upsert', 'parche']);
    srv.tabla('historical_stays').set('h1', { id: 'h1', dogName: 'Tony', dzTransferred: false });
    await despues.vaciar();
    expect(despues.estado().pendientes).toBe(0);
    expect(srv.tabla('clients_directory').get('c1')).toMatchObject({ dogName: 'Tony' });
    expect(srv.tabla('historical_stays').get('h1')).toMatchObject({ dzTransferred: true });
  });

  it('error de red intermitente: se corta a mitad, lo hecho no se repite mal y lo demás se sube después', async () => {
    const srv = servidorSimulado();
    const cola = crearCola({ almacen: almacenMemoria(), ejecutar: srv.ejecutar });
    srv.sinConexion();
    for (const id of ['a', 'b', 'c']) cola.encolar([{ tipo: 'upsert', tabla: 'stays', clave: id, datos: estadia(id, id) }]);
    await cola.vaciar();
    srv.conConexion();
    srv.cortarDespuesDe(1);
    const r1 = await cola.vaciar();
    expect(r1).toMatchObject({ guardadas: 1, red: true });
    expect(cola.estado().pendientes).toBe(2);
    srv.cortarDespuesDe(null);
    srv.fallarClave('b', 'red', 1);
    const r2 = await cola.vaciar();
    expect(r2).toMatchObject({ guardadas: 0, red: true });
    const r3 = await cola.vaciar();
    expect(r3.guardadas).toBe(2);
    expect(srv.llamadas).toEqual(['upsert stays:a', 'upsert stays:b', 'upsert stays:c']);
    expect([...srv.tabla('stays').keys()]).toEqual(['a', 'b', 'c']);
  });

  it('error permanente: queda "con error", no se descarta solo, no frena a otros registros y se puede reintentar o descartar', async () => {
    const srv = servidorSimulado();
    const cola = crearCola({ almacen: almacenMemoria(), ejecutar: srv.ejecutar });
    srv.fallarClave('malo', 'permanente');
    cola.encolar([{ tipo: 'upsert', tabla: 'stays', clave: 'malo', datos: estadia('malo', 'Rex') }]);
    cola.encolar([{ tipo: 'upsert', tabla: 'stays', clave: 'malo', datos: estadia('malo', 'Rex', { dailyRate: 1 }) }]);
    cola.encolar([{ tipo: 'upsert', tabla: 'stays', clave: 'bueno', datos: estadia('bueno', 'Luna') }]);
    const r = await cola.vaciar();
    expect(r).toMatchObject({ guardadas: 1, nuevosErrores: 1 });
    const e = cola.estado();
    expect(e.conError).toHaveLength(1);
    expect(e.conError[0].error).toMatch(/permission denied/);
    // el segundo cambio del mismo registro espera (no se sube algo posterior encima de un error)
    expect(e.pendientes).toBe(1);
    expect(srv.llamadas).toEqual(['upsert stays:bueno']);

    // varias pasadas después, sigue ahí: nada se pierde en silencio
    await cola.vaciar();
    await cola.vaciar();
    expect(cola.estado().conError).toHaveLength(1);

    // reintentar cuando el problema se arregló
    srv.fallarClave('malo', 'permanente', 0);
    cola.reintentar(e.conError[0].id);
    await cola.vaciar();
    expect(cola.estado()).toMatchObject({ pendientes: 0, conError: [] });
    expect(srv.tabla('stays').get('malo')).toMatchObject({ dailyRate: 1 });
  });

  it('descartar una operación con error la quita sólo a ella (y a las de su grupo)', async () => {
    const srv = servidorSimulado();
    const cola = crearCola({ almacen: almacenMemoria(), ejecutar: srv.ejecutar });
    srv.fallarClave('h-mal', 'permanente');
    cola.encolar(
      [
        { tipo: 'upsert', tabla: 'historical_stays', clave: 'h-mal', datos: { id: 'h-mal' } },
        { tipo: 'delete', tabla: 'stays', clave: 's9' }
      ],
      { grupo: true }
    );
    cola.encolar([{ tipo: 'upsert', tabla: 'stays', clave: 's10', datos: estadia('s10', 'Otro') }]);
    await cola.vaciar();
    const [err] = cola.estado().conError;
    expect(cola.estado().pendientes).toBe(1); // el borrado del grupo espera
    expect(cola.descartar(err.id)).toBe(2);
    expect(cola.operaciones()).toEqual([]);
  });

  it('finalizar sin conexión: archivar y quitar de la agenda van juntos y en orden', async () => {
    const srv = servidorSimulado();
    srv.tabla('stays').set('s1', { id: 's1', dogName: 'Candela' });
    const cola = crearCola({ almacen: almacenMemoria(), ejecutar: srv.ejecutar });
    srv.sinConexion();
    cola.encolar(
      [
        { tipo: 'upsert', tabla: 'historical_stays', clave: 'h-s1', datos: { id: 'h-s1', dogName: 'Candela' } },
        { tipo: 'delete', tabla: 'stays', clave: 's1' }
      ],
      { grupo: true }
    );
    await cola.vaciar();
    expect(srv.tabla('stays').has('s1')).toBe(true);

    // Si el archivado falla por red, el borrado de la agenda NO se hace antes
    srv.conConexion();
    srv.fallarClave('h-s1', 'red', 1);
    await cola.vaciar();
    expect(srv.tabla('stays').has('s1')).toBe(true);
    expect(srv.tabla('historical_stays').has('h-s1')).toBe(false);

    await cola.vaciar();
    expect(srv.llamadas).toEqual(['upsert historical_stays:h-s1', 'delete stays:s1']);
    expect(srv.tabla('stays').has('s1')).toBe(false);
    expect(srv.tabla('historical_stays').get('h-s1')).toMatchObject({ dogName: 'Candela' });
  });

  it('finalizar con error permanente en el archivado: la estadía NO se borra de la agenda', async () => {
    const srv = servidorSimulado();
    srv.tabla('stays').set('s1', { id: 's1' });
    srv.fallarClave('h-s1', 'permanente');
    const cola = crearCola({ almacen: almacenMemoria(), ejecutar: srv.ejecutar });
    cola.encolar(
      [
        { tipo: 'upsert', tabla: 'historical_stays', clave: 'h-s1', datos: { id: 'h-s1' } },
        { tipo: 'delete', tabla: 'stays', clave: 's1' }
      ],
      { grupo: true }
    );
    await cola.vaciar();
    expect(srv.tabla('stays').has('s1')).toBe(true);
    expect(cola.estado().conError).toHaveLength(1);
    expect(cola.estado().pendientes).toBe(1);
  });

  it('idempotencia: si la app se cierra después de subir pero antes de anotarlo, repetir no duplica nada', async () => {
    const srv = servidorSimulado();
    const almacen = almacenMemoria();
    const cola = crearCola({ almacen, ejecutar: srv.ejecutar });
    srv.sinConexion();
    cola.encolar(
      [
        { tipo: 'upsert', tabla: 'historical_stays', clave: 'h1', datos: { id: 'h1', dogName: 'Luna' } },
        { tipo: 'delete', tabla: 'stays', clave: 's1' }
      ],
      { grupo: true }
    );
    await cola.vaciar();
    const copiaDelDispositivo = almacen.texto; // lo que quedó guardado antes del "cierre"

    // Se sube todo con éxito…
    srv.conConexion();
    srv.tabla('stays').set('s1', { id: 's1' });
    await cola.vaciar();
    expect(srv.tabla('historical_stays').size).toBe(1);

    // …pero la app se cerró antes de borrar la cola del dispositivo: al reabrir se repite todo
    almacen.texto = copiaDelDispositivo;
    const reabierta = crearCola({ almacen, ejecutar: srv.ejecutar });
    expect(reabierta.estado().pendientes).toBe(2);
    await reabierta.vaciar();
    expect(srv.tabla('historical_stays').size).toBe(1);
    expect(srv.tabla('historical_stays').get('h1')).toMatchObject({ dogName: 'Luna' });
    expect(srv.tabla('stays').has('s1')).toBe(false);
    expect(reabierta.estado().pendientes).toBe(0);
  });

  it('"Marcar todas" sin conexión: un cambio por registro tocado, sólo del tilde', async () => {
    const srv = servidorSimulado();
    for (const id of ['h1', 'h2', 'h3']) srv.tabla('historical_stays').set(id, { id, dogName: id, dzTransferred: false, totalPagar: 100 });
    const cola = crearCola({ almacen: almacenMemoria(), ejecutar: srv.ejecutar });
    srv.sinConexion();
    // h3 ya estaba tildado en pantalla: no genera cambio
    cola.encolar(['h1', 'h2'].map(id => ({ tipo: 'parche' as const, tabla: 'historical_stays' as const, clave: id, datos: { dzTransferred: true, dzTransferredAmount: 18 } })));
    await cola.vaciar();
    expect(cola.estado().pendientes).toBe(2);
    srv.conConexion();
    await cola.vaciar();
    expect(srv.llamadas).toEqual(['parche historical_stays:h1', 'parche historical_stays:h2']);
    expect(srv.tabla('historical_stays').get('h1')).toMatchObject({ dzTransferred: true, totalPagar: 100 });
    expect(srv.tabla('historical_stays').get('h3')).toMatchObject({ dzTransferred: false });
  });

  it('una copia vieja de la app no sube registros que no modificó (ni pisa campos que no tocó)', async () => {
    const srv = servidorSimulado();
    // En la nube, otro dispositivo ya cambió h1 (nuevo total) y h2
    srv.tabla('historical_stays').set('h1', { id: 'h1', totalPagar: 999, dzTransferred: false });
    srv.tabla('historical_stays').set('h2', { id: 'h2', totalPagar: 555 });
    const cola = crearCola({ almacen: almacenMemoria(), ejecutar: srv.ejecutar });
    // Esta copia vieja (que tenía h1 con total 100 y h2 con 200) sólo tilda h1
    cola.encolar([{ tipo: 'parche', tabla: 'historical_stays', clave: 'h1', datos: { dzTransferred: true } }]);
    await cola.vaciar();
    expect(srv.llamadas).toEqual(['parche historical_stays:h1']);
    expect(srv.tabla('historical_stays').get('h1')).toEqual({ id: 'h1', totalPagar: 999, dzTransferred: true });
    expect(srv.tabla('historical_stays').get('h2')).toEqual({ id: 'h2', totalPagar: 555 });
  });

  it('sesión vencida: no se pierde nada, pide iniciar sesión y sigue al volver', async () => {
    const srv = servidorSimulado();
    const cola = crearCola({ almacen: almacenMemoria(), ejecutar: srv.ejecutar });
    srv.sesionVencida();
    cola.encolar([{ tipo: 'upsert', tabla: 'stays', clave: 's1', datos: estadia('s1', 'Candela') }]);
    const r = await cola.vaciar();
    expect(r.sesion).toBe(true);
    expect(cola.estado()).toMatchObject({ requiereSesion: true, pendientes: 1, conError: [] });
    srv.conConexion();
    cola.sesionLista();
    await cola.vaciar();
    expect(cola.estado()).toMatchObject({ requiereSesion: false, pendientes: 0 });
  });

  it('si el dispositivo no puede guardar la cola, avisa (no hay pérdida silenciosa)', async () => {
    const srv = servidorSimulado();
    const almacen = almacenMemoria();
    const cola = crearCola({ almacen, ejecutar: srv.ejecutar });
    almacen.lleno = true;
    srv.sinConexion();
    cola.encolar([{ tipo: 'upsert', tabla: 'stays', clave: 's1', datos: estadia('s1', 'Candela') }]);
    expect(cola.estado().errorAlmacen).toMatch(/No se pudieron guardar los cambios pendientes en este dispositivo/);
    expect(cola.estado().pendientes).toBe(1); // en memoria sigue
    almacen.lleno = false;
    srv.conConexion();
    await cola.vaciar();
    expect(cola.estado().errorAlmacen).toBeNull();
  });

  it('una cola dañada en el dispositivo se avisa, se guarda aparte y no se pisa ni se olvida el aviso', async () => {
    const almacen = almacenMemoria();
    const apartadas: string[] = [];
    almacen.texto = '{no es json';
    const cola = crearCola({ almacen: { ...almacen, leer: () => almacen.texto, escribir: t => { almacen.texto = t; }, apartarDanada: t => { apartadas.push(t); return 'copia-1'; } }, ejecutar: async () => ({ ok: true }) });
    expect(apartadas).toEqual(['{no es json']);
    expect(cola.estado().errorAlmacen).toMatch(/dañada.*copia-1/);
    cola.encolar([{ tipo: 'upsert', tabla: 'stays', clave: 's1', datos: estadia('s1', 'A') }]);
    await cola.vaciar();
    // escribir bien después no borra el aviso de que había una cola dañada
    expect(cola.estado().errorAlmacen).toMatch(/dañada/);
  });

  it('dos pestañas con la misma cola: ninguna pisa los cambios de la otra', async () => {
    const srv = servidorSimulado();
    const almacen = almacenMemoria();
    srv.sinConexion();
    let t = 0;
    const ahora = () => ++t;
    const pestanaB = crearCola({ almacen, ejecutar: srv.ejecutar, ahora }); // abierta antes, con la cola vacía
    const pestanaA = crearCola({ almacen, ejecutar: srv.ejecutar, ahora });
    pestanaA.encolar([{ tipo: 'upsert', tabla: 'stays', clave: 'x', datos: estadia('x', 'X') }]);
    pestanaB.encolar([{ tipo: 'upsert', tabla: 'stays', clave: 'y', datos: estadia('y', 'Y') }]);
    // Se cierra la pestaña A sin conexión: lo suyo sigue en el dispositivo
    const reabierta = crearCola({ almacen, ejecutar: srv.ejecutar });
    expect(reabierta.operaciones().map(o => o.clave)).toEqual(['x', 'y']);
    srv.conConexion();
    await reabierta.vaciar();
    expect(srv.llamadas).toEqual(['upsert stays:x', 'upsert stays:y']);
    // lo que una pestaña ya guardó no vuelve a aparecer cuando la otra escribe
    pestanaB.encolar([{ tipo: 'upsert', tabla: 'stays', clave: 'z', datos: estadia('z', 'Z') }]);
    await pestanaB.vaciar();
    expect(srv.tabla('stays').size).toBe(3);
  });

  it('si la nube acepta un cambio, se quita el aviso de sesión vencida', async () => {
    const srv = servidorSimulado();
    const cola = crearCola({ almacen: almacenMemoria(), ejecutar: srv.ejecutar });
    srv.sesionVencida();
    cola.encolar([{ tipo: 'upsert', tabla: 'stays', clave: 's1', datos: estadia('s1', 'A') }]);
    await cola.vaciar();
    expect(cola.estado().requiereSesion).toBe(true);
    srv.conConexion(); // por ejemplo, volvió a iniciar sesión con la misma cuenta
    await cola.vaciar();
    expect(cola.estado()).toMatchObject({ requiereSesion: false, pendientes: 0 });
  });

  it('un cambio agregado justo cuando termina una pasada no queda esperando', async () => {
    const srv = servidorSimulado();
    const cola = crearCola({ almacen: almacenMemoria(), ejecutar: srv.ejecutar });
    cola.encolar([{ tipo: 'upsert', tabla: 'stays', clave: 's1', datos: estadia('s1', 'A') }]);
    const p = cola.vaciar();
    // Al resolverse la pasada (antes de que se limpie la anterior), se agrega otro
    p.then(() => {});
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    cola.encolar([{ tipo: 'upsert', tabla: 'stays', clave: 's2', datos: estadia('s2', 'B') }]);
    void cola.vaciar();
    await p;
    for (let i = 0; i < 10 && cola.estado().pendientes; i++) await new Promise(r => setTimeout(r, 0));
    expect(cola.estado().pendientes).toBe(0);
    expect(srv.llamadas).toEqual(['upsert stays:s1', 'upsert stays:s2']);
  });

  it('dos vaciados a la vez no suben dos veces lo mismo', async () => {
    const srv = servidorSimulado();
    const cola = crearCola({ almacen: almacenMemoria(), ejecutar: srv.ejecutar });
    cola.encolar([{ tipo: 'upsert', tabla: 'stays', clave: 's1', datos: estadia('s1', 'A') }]);
    const p1 = cola.vaciar();
    cola.encolar([{ tipo: 'upsert', tabla: 'stays', clave: 's2', datos: estadia('s2', 'B') }]);
    const p2 = cola.vaciar();
    await Promise.all([p1, p2]);
    expect(srv.llamadas).toEqual(['upsert stays:s1', 'upsert stays:s2']);
    expect(cola.estado().procesando).toBe(false);
  });
});

describe('conPendientes (lo que se ve mientras no se subió)', () => {
  it('aplica guardados, cambios y borrados pendientes sobre lo leído de la nube', () => {
    const leido = [{ id: 'a', n: 1 }, { id: 'b', n: 2 }];
    const ops = [
      { id: '1', tipo: 'upsert', tabla: 'stays', clave: 'c', datos: { id: 'c', n: 3 } },
      { id: '2', tipo: 'parche', tabla: 'stays', clave: 'a', datos: { n: 10 } },
      { id: '3', tipo: 'delete', tabla: 'stays', clave: 'b' },
      { id: '4', tipo: 'delete', tabla: 'historical_stays', clave: 'a' }
    ] as Operacion[];
    expect(conPendientes(leido, ops, 'stays')).toEqual([{ id: 'a', n: 10 }, { id: 'c', n: 3 }]);
    expect(leido).toEqual([{ id: 'a', n: 1 }, { id: 'b', n: 2 }]);
  });

  it('describe la operación sin datos personales', () => {
    const op = { id: '1', tipo: 'upsert', tabla: 'clients_directory', clave: 'c', datos: { dogName: 'Tony', contact: '555-1234', ownerName: 'Ana' } } as Operacion;
    expect(describirOperacion(op)).toBe('Ficha de Tony');
  });
});
