// Cola de cambios pendientes de guardar en la nube (sobrevive a cerrar la app).
//
// Guarda OPERACIONES CONCRETAS y ordenadas sobre un registro identificado por id (guardar, borrar o cambiar unos
// campos), nunca el estado completo de la app: una copia vieja de la app no puede pisar datos nuevos.
//  - Se ejecutan en el orden en que se hicieron. Las de un mismo "grupo" (finalizar = archivar + quitar de la agenda)
//    se ejecutan completas y en orden: si una falla, las que siguen del grupo esperan.
//  - Sin conexión (o error de red): se detiene y se reintenta después. Nada se pierde.
//  - Sesión vencida: se detiene y pide iniciar sesión. Nada se pierde.
//  - Error permanente (permiso denegado, dato inválido): la operación queda "con error" y NO se reintenta sola ni se
//    descarta sola; las que tocan el mismo registro o son de su grupo esperan. La persona decide reintentar o descartar.
//  - Cada operación es idempotente (guardar por id, borrar por id, cambiar campos por id): repetirla no duplica nada.
//  - Se guarda en el dispositivo después de cada cambio; si el guardado local falla se avisa (errorAlmacen).

export type TablaCola = 'stays' | 'historical_stays' | 'clients_directory' | 'app_config';
export type TipoOperacion = 'upsert' | 'delete' | 'parche';

export interface Operacion {
  id: string;
  tipo: TipoOperacion;
  tabla: TablaCola;
  /** id del registro afectado */
  clave: string;
  /** upsert: el objeto completo; parche: sólo los campos que cambian (nombres de la app, no de la base) */
  datos?: unknown;
  /** operaciones que van juntas y en orden */
  grupo?: string;
  creada: number;
  intentos: number;
  estado: 'pendiente' | 'error';
  error?: string;
}

export type NuevaOperacion = Pick<Operacion, 'tipo' | 'tabla' | 'clave' | 'datos'>;

export type TipoFalla = 'red' | 'sesion' | 'permanente';
export type ResultadoEjecucion = { ok: true; aviso?: string } | { ok: false; tipo: TipoFalla; mensaje: string };
export type Ejecutor = (op: Operacion) => Promise<ResultadoEjecucion>;

/** Dónde se guarda la cola. `escribir` lanza si no se puede (lleno, bloqueado). */
export interface Almacen {
  leer(): string | null;
  escribir(texto: string): void;
  /** guarda aparte una cola que no se pudo leer, para no pisarla (devuelve dónde quedó) */
  apartarDanada?(texto: string): string | null;
}

export interface EstadoCola {
  /** operaciones esperando (sin contar las que tienen error) */
  pendientes: number;
  conError: Operacion[];
  requiereSesion: boolean;
  procesando: boolean;
  /** mensaje si el guardado en el dispositivo falló (no hay pérdida silenciosa) */
  errorAlmacen: string | null;
  /** avisos de guardado parcial (por ejemplo, falta una columna en la base) */
  avisos: string[];
}

export interface ResumenVaciado {
  guardadas: number;
  red: boolean;
  sesion: boolean;
  nuevosErrores: number;
  /** ids de operaciones guardadas en esta pasada */
  ids: string[];
}

const VERSION = 1;
const claveRegistro = (op: Pick<Operacion, 'tabla' | 'clave'>) => `${op.tabla}:${op.clave}`;

let contador = 0;
const idPorDefecto = () => `op-${Date.now().toString(36)}-${(contador++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function leerOperaciones(almacen: Almacen): { ops: Operacion[]; error: string | null; texto: string | null } {
  let texto: string | null;
  try {
    texto = almacen.leer();
  } catch (e) {
    return { ops: [], texto: null, error: `No se pudo leer la cola de cambios pendientes en este dispositivo (${e instanceof Error ? e.message : String(e)}).` };
  }
  if (!texto) return { ops: [], error: null, texto };
  try {
    const datos = JSON.parse(texto);
    const ops = Array.isArray(datos?.ops) ? datos.ops : [];
    return { ops: ops.filter((o: Operacion) => o && typeof o.id === 'string' && typeof o.clave === 'string'), error: null, texto };
  } catch {
    return { ops: [], error: 'La cola de cambios pendientes guardada en este dispositivo está dañada y no se pudo leer.', texto };
  }
}

export function crearCola(opciones: {
  almacen: Almacen;
  ejecutar: Ejecutor;
  nuevoId?: () => string;
  ahora?: () => number;
}) {
  const { almacen } = opciones;
  let ejecutar = opciones.ejecutar;
  const nuevoId = opciones.nuevoId ?? idPorDefecto;
  const ahora = opciones.ahora ?? (() => Date.now());

  const inicial = leerOperaciones(almacen);
  let ops: Operacion[] = inicial.ops;
  // El aviso de lectura (cola dañada) no lo borra una escritura que sale bien: es otro problema
  let errorLectura: string | null = inicial.error;
  let errorEscritura: string | null = null;
  if (inicial.error && inicial.texto) {
    // Antes de escribir encima, se guarda aparte lo que no se pudo leer
    let donde: string | null = null;
    try {
      donde = almacen.apartarDanada?.(inicial.texto) ?? null;
    } catch {
      donde = null;
    }
    errorLectura = donde
      ? `${inicial.error} Se guardó una copia aparte en este dispositivo (${donde}) y se empezó una cola nueva.`
      : `${inicial.error} No se pudo guardar una copia aparte.`;
  }
  let requiereSesion = false;
  let procesando = false;
  let enCurso: Promise<ResumenVaciado> | null = null;
  let otraVuelta = false;
  let avisos: string[] = [];
  /** operaciones que esta copia de la app ya guardó o descartó (para no traerlas de vuelta desde otra pestaña) */
  const terminadas = new Set<string>();
  const oyentes = new Set<() => void>();

  const notificar = () => oyentes.forEach(f => f());

  /**
   * Otra pestaña o ventana puede haber agregado operaciones al mismo almacenamiento: antes de escribir se suman
   * las que esta copia no conoce (y no terminó), en el orden en que se crearon. Así ninguna pisa a la otra.
   */
  function sumarAjenas() {
    let enDisco: Operacion[];
    try {
      const r = leerOperaciones(almacen);
      if (r.error) return;
      enDisco = r.ops;
    } catch {
      return;
    }
    const mias = new Set(ops.map(o => o.id));
    const ajenas = enDisco.filter(o => !mias.has(o.id) && !terminadas.has(o.id));
    if (ajenas.length) ops = [...ops, ...ajenas].sort((a, b) => a.creada - b.creada);
  }

  function persistir(): boolean {
    sumarAjenas();
    try {
      almacen.escribir(JSON.stringify({ version: VERSION, ops }));
      errorEscritura = null;
      return true;
    } catch (e) {
      errorEscritura = `No se pudieron guardar los cambios pendientes en este dispositivo (${e instanceof Error ? e.message : String(e)}). No cierres la app hasta que vuelva la conexión.`;
      return false;
    }
  }

  function estado(): EstadoCola {
    const errores = [errorLectura, errorEscritura].filter(Boolean);
    return {
      pendientes: ops.filter(o => o.estado === 'pendiente').length,
      conError: ops.filter(o => o.estado === 'error'),
      requiereSesion,
      procesando,
      errorAlmacen: errores.length ? errores.join(' ') : null,
      avisos
    };
  }

  /** Agrega operaciones al final. Con `grupo`, van juntas y en orden. Devuelve sus ids. */
  function encolar(nuevas: NuevaOperacion[], { grupo = false } = {}): string[] {
    if (!nuevas.length) return [];
    const idGrupo = grupo && nuevas.length > 1 ? nuevoId() : undefined;
    const creadas = nuevas.map(n => ({
      ...n,
      id: nuevoId(),
      grupo: idGrupo,
      creada: ahora(),
      intentos: 0,
      estado: 'pendiente' as const
    }));
    ops = [...ops, ...creadas];
    persistir();
    notificar();
    return creadas.map(c => c.id);
  }

  /** ¿Hay que esperar? (mismo registro o mismo grupo que una operación anterior que no se pudo hacer) */
  function bloqueada(op: Operacion, frenadas: Operacion[]): boolean {
    return frenadas.some(f => claveRegistro(f) === claveRegistro(op) || (op.grupo !== undefined && f.grupo === op.grupo));
  }

  async function unaVuelta(): Promise<ResumenVaciado> {
    const resumen: ResumenVaciado = { guardadas: 0, red: false, sesion: false, nuevosErrores: 0, ids: [] };
    const frenadas: Operacion[] = [];
    for (const op of [...ops]) {
      if (!ops.some(o => o.id === op.id)) continue; // la descartaron mientras tanto
      if (op.estado === 'error') {
        frenadas.push(op);
        continue;
      }
      if (bloqueada(op, frenadas)) {
        frenadas.push(op);
        continue;
      }
      // Se cuenta el intento ANTES de ejecutar: si la app se cierra a mitad, el reintento sabe que ya se probó
      ops = ops.map(o => (o.id === op.id ? { ...o, intentos: o.intentos + 1 } : o));
      persistir();
      const actual = ops.find(o => o.id === op.id)!;
      let r: ResultadoEjecucion;
      try {
        r = await ejecutar(actual);
      } catch (e) {
        r = { ok: false, tipo: 'red', mensaje: e instanceof Error ? e.message : String(e) };
      }
      if (r.ok) {
        terminadas.add(op.id);
        requiereSesion = false; // si la nube aceptó un cambio, la sesión está bien
        ops = ops.filter(o => o.id !== op.id);
        if (r.aviso && !avisos.includes(r.aviso)) avisos = [...avisos, r.aviso];
        persistir();
        resumen.guardadas++;
        resumen.ids.push(op.id);
        notificar();
        continue;
      }
      if (r.tipo === 'red') {
        resumen.red = true;
        break;
      }
      if (r.tipo === 'sesion') {
        requiereSesion = true;
        resumen.sesion = true;
        break;
      }
      ops = ops.map(o => (o.id === op.id ? { ...o, estado: 'error' as const, error: r.mensaje } : o));
      persistir();
      frenadas.push(op);
      resumen.nuevosErrores++;
      notificar();
    }
    return resumen;
  }

  /** Intenta guardar todo lo pendiente, en orden. Si ya se está vaciando, encadena otra pasada. */
  function vaciar(): Promise<ResumenVaciado> {
    if (enCurso) {
      otraVuelta = true;
      return enCurso;
    }
    procesando = true;
    notificar();
    const vuelta = (async () => {
      const total: ResumenVaciado = { guardadas: 0, red: false, sesion: false, nuevosErrores: 0, ids: [] };
      do {
        otraVuelta = false;
        const r = await unaVuelta();
        total.guardadas += r.guardadas;
        total.nuevosErrores += r.nuevosErrores;
        total.ids.push(...r.ids);
        total.red = r.red;
        total.sesion = r.sesion;
        if (r.red || r.sesion) {
          otraVuelta = false;
          break;
        }
      } while (otraVuelta);
      return total;
    })();
    enCurso = vuelta.finally(() => {
      enCurso = null;
      procesando = false;
      notificar();
      // Algo se agregó justo cuando terminaba la última pasada: se hace otra para no dejarlo esperando
      if (otraVuelta) {
        otraVuelta = false;
        void vaciar();
      }
    });
    return enCurso;
  }

  /** Vuelve a intentar una operación con error (o todas). */
  function reintentar(id?: string) {
    ops = ops.map(o => (o.estado === 'error' && (!id || o.id === id) ? { ...o, estado: 'pendiente' as const, error: undefined } : o));
    persistir();
    notificar();
  }

  /** Descarta una operación con error y las que dependían de ella (las demás de su grupo). Devuelve cuántas quitó. */
  function descartar(id: string): number {
    const op = ops.find(o => o.id === id);
    if (!op) return 0;
    const antes = ops.length;
    for (const o of ops) if (o.id === id || (op.grupo !== undefined && o.grupo === op.grupo)) terminadas.add(o.id);
    ops = ops.filter(o => !terminadas.has(o.id));
    persistir();
    notificar();
    return antes - ops.length;
  }

  /** Descarta TODO (por ejemplo, al cerrar sesión confirmando que se pierden los cambios). */
  function descartarTodo() {
    for (const o of ops) terminadas.add(o.id);
    ops = [];
    persistir();
    notificar();
  }

  function sesionLista() {
    if (requiereSesion) {
      requiereSesion = false;
      notificar();
    }
  }

  return {
    encolar,
    vaciar,
    reintentar,
    descartar,
    descartarTodo,
    sesionLista,
    estado,
    operaciones: () => ops,
    /** ¿Sigue en la cola? (para saber si una operación recién encolada ya se guardó) */
    pendiente: (id: string) => ops.some(o => o.id === id),
    conError: (id: string) => ops.find(o => o.id === id && o.estado === 'error') ?? null,
    limpiarAvisos: () => {
      avisos = [];
      notificar();
    },
    cambiarEjecutor: (nuevo: Ejecutor) => {
      ejecutar = nuevo;
    },
    suscribir(f: () => void) {
      oyentes.add(f);
      return () => oyentes.delete(f);
    }
  };
}

export type Cola = ReturnType<typeof crearCola>;

/** Almacén en localStorage. */
export function almacenLocal(clave: string): Almacen {
  return {
    leer: () => localStorage.getItem(clave),
    escribir: texto => localStorage.setItem(clave, texto),
    apartarDanada: texto => {
      const donde = `${clave}_danada_${Date.now()}`;
      localStorage.setItem(donde, texto);
      return donde;
    }
  };
}

// ── Mostrar en pantalla lo que todavía no se guardó ──────────────────────────────

interface ConId { id: string }

function aplicarEnLista<T extends ConId>(lista: T[], ops: Operacion[], tabla: TablaCola): T[] {
  let res = lista;
  for (const op of ops) {
    if (op.tabla !== tabla) continue;
    if (op.tipo === 'delete') res = res.filter(x => x.id !== op.clave);
    else if (op.tipo === 'upsert') {
      const nuevo = op.datos as T;
      res = res.some(x => x.id === op.clave) ? res.map(x => (x.id === op.clave ? nuevo : x)) : [...res, nuevo];
    } else if (op.tipo === 'parche') {
      res = res.map(x => (x.id === op.clave ? { ...x, ...(op.datos as Partial<T>) } : x));
    }
  }
  return res;
}

/**
 * Lo que se leyó de la nube + los cambios que todavía están en la cola, en orden: así una relectura no hace
 * desaparecer de la pantalla algo que la persona ya hizo y todavía no se subió.
 */
export function conPendientes<T extends ConId>(lista: T[], ops: Operacion[], tabla: TablaCola): T[] {
  return aplicarEnLista(lista, ops, tabla);
}

/** Descripción corta de una operación, sin datos personales (sólo tipo de dato y nombre del perro). */
export function describirOperacion(op: Operacion): string {
  const perro = (op.datos as { dogName?: string } | undefined)?.dogName;
  const de = perro ? ` de ${String(perro).trim()}` : '';
  if (op.tabla === 'stays') return op.tipo === 'delete' ? 'Quitar una estadía de la agenda' : `Estadía${de}`;
  if (op.tabla === 'historical_stays') return op.tipo === 'delete' ? 'Borrar un registro del Registro de estadías' : `Registro${de}`;
  if (op.tabla === 'clients_directory') return op.tipo === 'delete' ? 'Borrar una ficha' : `Ficha${de}`;
  return 'Configuración';
}
