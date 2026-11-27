// Conecta la cola de cambios pendientes con la app: guarda enseguida si hay conexión y, si no, reintenta solo
// al volver la conexión (evento "online"), al volver la app a primer plano y cada tanto (cada vez más espaciado).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { almacenLocal, crearCola, type Cola, type EstadoCola, type Ejecutor, type NuevaOperacion } from './colaPendientes';

export const CLAVE_COLA = 'pensionados_cambios_pendientes';
/** Espera entre reintentos automáticos: 5 s, 10 s, 20 s… hasta 5 minutos */
const REINTENTOS_MS = [5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000];
const TODO_GUARDADO_MS = 3_000;

export interface OpcionesCambiosPendientes {
  /** false: no hay a dónde guardar (sin Supabase configurado y fuera del modo demo) */
  activo: boolean;
  /** sólo se sube con sesión iniciada; sin sesión la cola espera */
  conSesion: boolean;
  /** cambia al volver a iniciar sesión (por ejemplo, el token): se quita el aviso de sesión vencida y se reintenta */
  marcaSesion?: string | null;
  ejecutor: Ejecutor;
  /** mensaje para la persona (errores, avisos de guardado parcial) */
  avisar: (mensaje: string) => void;
  /** se llama cuando, después de una falla, se terminó de subir todo (para volver a leer la nube) */
  alVaciar?: () => void;
  /** para pruebas */
  cola?: Cola;
}

export interface CambiosPendientes {
  cola: Cola;
  estado: EstadoCola;
  /** no hay conexión (según el dispositivo o porque el último intento falló por red) */
  sinConexion: boolean;
  /** se muestra un momento después de subir lo que había quedado pendiente */
  todoGuardado: boolean;
  /** agrega cambios a la cola y trata de subirlos ya. Devuelve los ids de las operaciones. */
  guardar: (ops: NuevaOperacion[], opciones?: { grupo?: boolean }) => string[];
  /**
   * Agrega y espera el primer intento: null si se guardó o quedó pendiente por falta de conexión;
   * el mensaje de error si falló de forma permanente (y en ese caso la operación se quita de la cola).
   */
  guardarYEsperar: (ops: NuevaOperacion[], opciones?: { grupo?: boolean }) => Promise<string | null>;
  /** vuelve a intentar ya: lo pendiente y lo que tenía error (o sólo la operación `id`) */
  reintentarAhora: (id?: string) => void;
}

const navegadorSinConexion = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export function useCambiosPendientes(opciones: OpcionesCambiosPendientes): CambiosPendientes {
  const ultimas = useRef(opciones);
  ultimas.current = opciones;

  const [cola] = useState<Cola>(() => opciones.cola ?? crearCola({ almacen: almacenLocal(CLAVE_COLA), ejecutar: opciones.ejecutor }));
  useEffect(() => cola.cambiarEjecutor(opciones.ejecutor), [cola, opciones.ejecutor]);

  // Estado de la cola para React (se vuelve a pedir en cada cambio)
  const version = useRef(0);
  const instantanea = useRef<{ v: number; e: EstadoCola }>({ v: -1, e: cola.estado() });
  const suscribir = useCallback((f: () => void) => {
    const quitar = cola.suscribir(() => { version.current++; f(); });
    return () => { quitar(); };
  }, [cola]);
  const leer = useCallback(() => {
    if (instantanea.current.v !== version.current) instantanea.current = { v: version.current, e: cola.estado() };
    return instantanea.current.e;
  }, [cola]);
  const estado = useSyncExternalStore(suscribir, leer, leer);

  const [fallaDeRed, setFallaDeRed] = useState(false);
  const [dispositivoSinRed, setDispositivoSinRed] = useState(navegadorSinConexion);
  const [todoGuardado, setTodoGuardado] = useState(false);

  const intento = useRef(0);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const temporizadorListo = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hubo algo que no se pudo subir enseguida: al terminar se avisa "Todo guardado" y se vuelve a leer la nube
  const huboFalla = useRef(cola.estado().pendientes > 0);

  const cancelarReintento = () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
  };

  // Una sola subida en curso a la vez: quien llama mientras tanto espera la misma (y se hace otra pasada al final)
  const enVuelo = useRef<Promise<void> | null>(null);
  const repetir = useRef(false);
  const vaciarAhora = useCallback((): Promise<void> => {
    if (enVuelo.current) {
      repetir.current = true;
      return enVuelo.current;
    }
    const p = (async () => {
      let seguir = true;
      while (seguir) {
        repetir.current = false;
        seguir = (await unaPasada()) && repetir.current;
      }
    })().finally(() => { enVuelo.current = null; });
    enVuelo.current = p;
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cola]);

  /** Sube lo pendiente una vez. Devuelve false si conviene no seguir (sin conexión o sesión vencida). */
  async function unaPasada(): Promise<boolean> {
    const { activo, conSesion } = ultimas.current;
    if (!activo || !conSesion) return false;
    if (cola.estado().pendientes === 0) return false;
    cancelarReintento();
    const r = await cola.vaciar();

    for (const aviso of cola.estado().avisos) ultimas.current.avisar(`⚠ ${aviso}`);
    if (cola.estado().avisos.length) cola.limpiarAvisos();
    if (r.nuevosErrores > 0) {
      ultimas.current.avisar(
        r.nuevosErrores === 1
          ? '⚠ Un cambio no se pudo guardar en la nube. Tocá "Ver" en el aviso de cambios para reintentarlo o descartarlo.'
          : `⚠ ${r.nuevosErrores} cambios no se pudieron guardar en la nube. Tocá "Ver" en el aviso de cambios para reintentarlos o descartarlos.`
      );
    }

    if (r.red) {
      huboFalla.current = true;
      setFallaDeRed(true);
      const espera = REINTENTOS_MS[Math.min(intento.current, REINTENTOS_MS.length - 1)];
      intento.current++;
      cancelarReintento();
      temporizador.current = setTimeout(() => { void vaciarAhora(); }, espera);
      return false;
    }
    intento.current = 0;
    setFallaDeRed(false);
    if (r.sesion) {
      huboFalla.current = true;
      return false;
    }
    const e = cola.estado();
    if (huboFalla.current && e.pendientes === 0 && e.conError.length === 0) {
      huboFalla.current = false;
      setTodoGuardado(true);
      if (temporizadorListo.current) clearTimeout(temporizadorListo.current);
      temporizadorListo.current = setTimeout(() => setTodoGuardado(false), TODO_GUARDADO_MS);
      ultimas.current.alVaciar?.();
    }
    return true;
  }

  // Volvió la conexión, la app volvió a primer plano, o se inició sesión: reintentar ya
  useEffect(() => {
    const alConectar = () => { setDispositivoSinRed(false); intento.current = 0; void vaciarAhora(); };
    const alDesconectar = () => setDispositivoSinRed(true);
    const alVolver = () => { if (!document.hidden) void vaciarAhora(); };
    window.addEventListener('online', alConectar);
    window.addEventListener('offline', alDesconectar);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      window.removeEventListener('online', alConectar);
      window.removeEventListener('offline', alDesconectar);
      document.removeEventListener('visibilitychange', alVolver);
      cancelarReintento();
      if (temporizadorListo.current) clearTimeout(temporizadorListo.current);
    };
  }, [vaciarAhora]);

  useEffect(() => {
    if (!opciones.activo || !opciones.conSesion) return;
    cola.sesionLista();
    void vaciarAhora();
  }, [opciones.activo, opciones.conSesion, opciones.marcaSesion, cola, vaciarAhora]);

  const guardar = useCallback((ops: NuevaOperacion[], o: { grupo?: boolean } = {}) => {
    if (!ultimas.current.activo || ops.length === 0) return [];
    setTodoGuardado(false);
    const ids = cola.encolar(ops, o);
    if (navegadorSinConexion()) huboFalla.current = true;
    void vaciarAhora();
    return ids;
  }, [cola, vaciarAhora]);

  const guardarYEsperar = useCallback(async (ops: NuevaOperacion[], o: { grupo?: boolean } = {}) => {
    const ids = guardar(ops, o);
    if (!ids.length) return null;
    await vaciarAhora();
    const conError = ids.map(id => cola.conError(id)).find(Boolean);
    if (!conError) return null;
    cola.descartar(conError.id);
    return conError.error ?? 'Error al guardar';
  }, [cola, guardar, vaciarAhora]);

  const reintentarAhora = useCallback((id?: string) => {
    intento.current = 0;
    cola.reintentar(id);
    void vaciarAhora();
  }, [cola, vaciarAhora]);

  return {
    cola,
    estado,
    sinConexion: dispositivoSinRed || fallaDeRed,
    todoGuardado,
    guardar,
    guardarYEsperar,
    reintentarAhora
  };
}
