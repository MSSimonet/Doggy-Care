import React, { useState, useEffect, useMemo } from 'react';
import {
  Settings,
  Plus,
  Trash2,
  Edit3,
  Calendar,
  AlertCircle,
  Download,
  MapPin,
  CheckCircle2,
  History,
  Search,
  ChevronDown,
  Users,
  BookOpen,
  ShieldCheck,
  CreditCard,
  LayoutDashboard,
  BarChart3,
  Eye,
  EyeOff,
  Fingerprint,
  Navigation,
  X
} from 'lucide-react';
import { AppConfig, Stay } from './types';
import { defaultAppConfig, initialStays } from './data/initialData';
import { DEMO_STAYS, DEMO_CONFIG, DEMO_HISTORY, DEMO_CLIENTS } from './data/demoData';
import { clientsDirectory, ClientProfile } from './data/clientsDirectory';
import { HISTORICAL_STAYS, HistoricalStayRecord, normalizeDogName } from './data/historialData';
import { DialogModal } from './components/DialogModal';
import { ConfirmDialog, useConfirm } from './components/ConfirmDialog';
import { usePrivacy } from './components/PrivacyProvider';
import { AppLogo } from './components/AppLogo';
import { BalanceField, StayDetail } from './components/DetalleEstadia';
import { AvisoErrorHuella, PantallaDesbloqueo } from './components/PantallaDesbloqueo';
import { TopLayerPortal } from './components/TopLayerPortal';
import { EditClientModal } from './components/EditClientModal';
import { StayModal } from './components/StayModal';
import { HistoryModal } from './components/HistoryModal';
import { ConfigModal } from './components/ConfigModal';
import { AgendaEntry } from './components/AgendaEntry';
import { construirCsvEstadias } from './utils/exportarCsv';
import { fechasDeFin, resumirDeducciones, type ItemDeduccion } from './utils/deducciones';
import { completarConfig } from './utils/tasasDeduccion';
import {
  aplicarMarcas,
  borrarMarcas,
  CLAVE_MARCAS,
  faltaColumnaTilde,
  guardarMarca,
  leerMarcas
} from './lib/marcasDeduccion';
import { SubidaTildes } from './components/SubidaTildes';
import { BorradosRecientes } from './components/BorradosRecientes';
import { PorCobrar } from './components/PorCobrar';
import { cobrar, deducir, estadoCobro, finalizar, volverALaAgenda } from './utils/flujoCobros';
import {
  CLAVE_BORRADOS,
  guardarBorrado,
  leerBorrados,
  quitarBorrado,
  type BorradoReciente
} from './lib/borradosRecientes';
import { historialDesdeLaNube } from './lib/historialNube';
import { DeduccionesPendientes } from './components/DeduccionesPendientes';
import { AjustesDeducciones } from './components/AjustesDeducciones';
import { cambiarDireccion } from './utils/direcciones';
import {
  claveDeRegistro,
  compararClaves,
  elegirNombreVisible,
  limpiarNombre,
  mejorClave,
  type ClaveOrden
} from './utils/agendaOrden';
import { WhatsAppLink } from './components/WhatsAppLink';
import { downloadHistorialHtml } from './utils/exportHistorialHtml';
import { cantidad, dias, estadias } from './utils/texto';
import { buildWazeNavigationUrl, resolveStayAddress } from './utils/waze';
import { calculateStay, historyDzPending, toggleDzTransfer, formatCurrencyARS } from './utils/calculations';
import {
  isSupabaseConfigured,
  supabaseUrlError,
  supabase,
  fetchStaysFromDb,
  leerTildesDeLaNube,
  subscribeToStaysChanges,
  signInWithPassword,
  signOut,
  leerTablaParaRespaldo
} from './lib/supabase';
import { conPendientes, type NuevaOperacion } from './lib/colaPendientes';
import { crearEjecutorDemo, crearEjecutorSupabase } from './lib/escrituras';
import { useCambiosPendientes } from './lib/useCambiosPendientes';
import { IndicadorGuardado } from './components/IndicadorGuardado';
import { crearSincronizacion, erroresDeLectura } from './lib/sincronizacion';
import { armarRespaldo, descargarArchivo, type LectorTabla } from './lib/respaldo';
import { stayToRow, historyToRow } from './lib/mapeoDb';
import * as huella from './lib/huella';

import {
  UNDO_WINDOW_MS,
  DELETED_IDS_KEY,
  removeRecord,
  restoreRecord,
  filterDeleted,
  scheduleDeletion,
  type PendingDeletion
} from './utils/historyDelete';
import { type ThemeChoice, loadThemeChoice, saveThemeChoice, applyTheme, watchSystemTheme } from './lib/theme';

// Demo mode: only active in dev builds with VITE_DEMO=1 — dead code in production
// Datos de la cuenta guardados en este dispositivo: se borran al cerrar sesión
const ACCOUNT_STORAGE_KEYS = [
  CLAVE_MARCAS,
  CLAVE_BORRADOS,
  'pensionados_stays',
  'pensionados_history',
  'pensionados_history_records',
  'pensionados_directory_clients',
  'pensionados_config',
  DELETED_IDS_KEY
];

const IS_DEMO = import.meta.env.DEV && import.meta.env.VITE_DEMO === '1';

// Quién guarda en la nube los cambios de la cola (src/lib/escrituras.ts). En modo demo no hay base: se simula.
const EJECUTOR_NUBE = IS_DEMO ? crearEjecutorDemo() : crearEjecutorSupabase(supabase);
const quitarDeLaAgenda = (id: string): NuevaOperacion => ({ tipo: 'delete', tabla: 'stays', clave: id });

/**
 * Registros del Historial que corresponden a una estadía que sigue en la Agenda (todavía no son pasado): los
 * que la estadía tiene ligados y los que se archivaron desde ella (id "hist-agenda-<id>-…") si la quitar de la
 * Agenda quedó pendiente. No cuentan en Historial ni en deducciones hasta que se finaliza.
 */
function registrosDeLaAgenda(stays: Stay[], registros: HistoricalStayRecord[] = []): Set<string> {
  const ids = new Set(stays.map(s => s.historyRecordId).filter((id): id is string => Boolean(id)));
  for (const r of registros) {
    if (stays.some(s => r.id.startsWith(`hist-agenda-${s.id}-`))) ids.add(r.id);
  }
  return ids;
}

function loadDeletedHistoryIds(): string[] {
  try {
    const raw = localStorage.getItem(DELETED_IDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function removeDeletedHistoryId(id: string) {
  try {
    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(loadDeletedHistoryIds().filter(x => x !== id)));
  } catch {}
}

function saveDeletedHistoryId(id: string) {
  try {
    const ids = new Set(loadDeletedHistoryIds());
    ids.add(id);
    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify([...ids]));
  } catch {}
}

export default function App() {
  // Auth session
  const [session, setSession] = useState<any>(IS_DEMO ? { user: { email: 'demo@doggy.local' } } : null);
  const [authLoading, setAuthLoading] = useState(!IS_DEMO);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginShowPassword, setLoginShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    if (IS_DEMO) return;
    if (!supabase) { setAuthLoading(false); return; }
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Config & State with localStorage persistence
  const [config, setConfig] = useState<AppConfig>(() => {
    if (IS_DEMO) return DEMO_CONFIG;
    try {
      const saved = localStorage.getItem('pensionados_config');
      // Las guardadas antes no tienen las tasas por año ni la fecha de inicio de deducciones: se completan
      return completarConfig(saved ? { ...defaultAppConfig, ...JSON.parse(saved) } : defaultAppConfig);
    } catch {
      return defaultAppConfig;
    }
  });

  const [stays, setStays] = useState<Stay[]>(() => {
    if (IS_DEMO) return DEMO_STAYS;
    const saved = localStorage.getItem('pensionados_stays');
    let loaded = initialStays;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Filter out legacy test stays that were not in the original Agenda sheet
          const filtered = parsed.filter(s => !s.id.startsWith('stay-17933'));
          if (filtered.length > 0) {
            const savedIds = new Set(filtered.map(s => s.id));
            const missing = initialStays.filter(s => !savedIds.has(s.id));
            loaded = [...filtered, ...missing];
          }
        }
      } catch (e) {}
    }
    // Deduplicate by ID
    const seenIds = new Set<string>();
    loaded = loaded.filter(s => {
      if (seenIds.has(s.id)) return false;
      seenIds.add(s.id);
      return true;
    });
    // Enrich with clientsDirectory (real owners, breeds, phones, addresses)
    const normalizeStr = (str: string) => (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    return loaded.map(s => {
      const match = clientsDirectory.find(c =>
        (s.dogId && c.id === s.dogId) ||
        (!s.dogId && normalizeStr(c.dogName) === normalizeStr(s.dogName))
      );
      if (match) {
        const isGeneric = !s.clientName || s.clientName.startsWith('Familia') || s.clientName.startsWith('Cliente');
        const fullName = match.ownerLastName ? `${match.ownerName} ${match.ownerLastName}`.trim() : match.ownerName;
        return {
          ...s,
          clientName: (!isGeneric && s.clientName) ? s.clientName : (fullName || s.clientName),
          clientPhone: s.clientPhone || match.contact,
          dogBreed: s.dogBreed || match.breed,
          notes: s.notes || (match.address ? `Dirección: ${match.address}` + (match.relatives ? ` | Familiar: ${match.relatives}` : '') : (match.relatives ? `Familiar: ${match.relatives}` : undefined))
        };
      }
      return s;
    });
  });

  // Active view: 'agenda' (Agenda), 'directory' (Directorio), 'dashboard' (Estadísticas), 'fuelCalc' (Simulador)
  const [activeTab, setActiveTab] = useState<'hoy' | 'perros' | 'cobros' | 'ajustes'>('hoy');

  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(loadThemeChoice);
  useEffect(() => {
    applyTheme(themeChoice);
    saveThemeChoice(themeChoice);
    if (themeChoice !== 'auto') return;
    return watchSystemTheme(() => applyTheme('auto'));
  }, [themeChoice]);

  // Ingreso con huella (src/lib/huella.ts). En modo demo, ?huella=activar|activar-error|desbloquear|contrasena
  // muestra esas pantallas para medirlas.
  const demoHuella = IS_DEMO ? new URLSearchParams(window.location.search).get('huella') : null;
  // null = todavía comprobando; si no está disponible trae el motivo
  const [huellaEstado, setHuellaEstado] = useState<huella.Disponibilidad | null>(null);
  const huellaDisponible = huellaEstado?.disponible === true;
  // Error real del último intento de activar (name y message de WebAuthn), visible en pantalla
  const [huellaError, setHuellaError] = useState<string | null>(() =>
    demoHuella === 'activar-error' ? 'NotAllowedError: The operation either timed out or was not allowed.' : null
  );
  const [activandoHuella, setActivandoHuella] = useState(false);
  const [huellaActiva, setHuellaActiva] = useState(() => !IS_DEMO && huella.estaActivada());
  const [huellaBloqueada, setHuellaBloqueada] = useState(() =>
    demoHuella === 'desbloquear' || demoHuella === 'contrasena' || (!IS_DEMO && huella.estaActivada())
  );
  const [desbloqueo, setDesbloqueo] = useState<huella.EstadoDesbloqueo>(() =>
    demoHuella === 'contrasena'
      ? huella.despuesDeIntentar(huella.ESTADO_INICIAL, { ok: false, motivo: 'cancelado', mensaje: 'Cancelaste la huella. Podés intentar de nuevo o ingresar con tu contraseña.', detalle: 'NotAllowedError: The operation either timed out or was not allowed.' })
      : huella.ESTADO_INICIAL
  );
  const [pidiendoHuella, setPidiendoHuella] = useState(false);
  const [ofrecerHuella, setOfrecerHuella] = useState(demoHuella === 'activar' || demoHuella === 'activar-error');
  // La oferta se muestra una vez por apertura de la app como máximo
  const ofertaMostrada = React.useRef(false);

  useEffect(() => {
    // En modo demo, ?huella=no-disponible muestra el interruptor desactivado con su causa
    if (demoHuella === 'no-disponible') {
      setHuellaEstado({ disponible: false, motivo: 'sin_webauthn' });
      return;
    }
    huella.disponible().then(setHuellaEstado);
  }, []);

  // Al volver de segundo plano después de 5 minutos se vuelve a pedir la huella
  useEffect(() => {
    if (IS_DEMO || !huellaActiva) return;
    const onVisibility = () => {
      if (document.hidden) {
        huella.marcarSegundoPlano();
      } else if (huella.debePedirAlVolver()) {
        setDesbloqueo(huella.ESTADO_INICIAL);
        setHuellaBloqueada(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [huellaActiva]);

  // Con sesión y sin huella activada se ofrece activarla, hasta que esa cuenta elija "Ahora no".
  // No depende de haber escrito la contraseña en esta apertura: una sesión ya guardada
  // (por ejemplo, de antes de que existiera la huella) también la ve.
  const huellaUserId: string | null = session?.user?.id ?? null;
  useEffect(() => {
    if (IS_DEMO || ofertaMostrada.current) return;
    if (huellaUserId && !huellaBloqueada && huellaDisponible && !huellaActiva && !huella.yaSeRechazo(huellaUserId)) {
      ofertaMostrada.current = true;
      setHuellaError(null);
      setOfrecerHuella(true);
    }
  }, [huellaUserId, huellaBloqueada, huellaDisponible, huellaActiva]);

  const pidiendoHuellaRef = React.useRef(false);
  const pedirHuella = async (automatico = false) => {
    if (pidiendoHuellaRef.current) return;
    pidiendoHuellaRef.current = true;
    setPidiendoHuella(true);
    const r = await huella.desbloquear();
    pidiendoHuellaRef.current = false;
    setPidiendoHuella(false);
    if (r.ok) {
      setHuellaBloqueada(false);
      setDesbloqueo(huella.ESTADO_INICIAL);
      return;
    }
    // Un pedido automático que el navegador no deja abrir sin un toque no cuenta como cancelación
    if (automatico && r.motivo === 'cancelado') return;
    setDesbloqueo(prev => huella.despuesDeIntentar(prev, r));
  };

  // Si falla, el error real queda a la vista (en el cuadro de la oferta y en Ajustes) y la
  // oferta no se da por rechazada: sólo "Ahora no" la descarta.
  const handleActivarHuella = async () => {
    if (IS_DEMO) {
      setOfrecerHuella(false);
      return;
    }
    if (activandoHuella) return;
    setActivandoHuella(true);
    setHuellaError(null);
    const r = await huella.activar(session?.user?.email ?? '');
    setActivandoHuella(false);
    if (r.ok) {
      setOfrecerHuella(false);
      setHuellaActiva(true);
      setToastMessage('✓ Listo: la próxima vez vas a entrar con tu huella.');
    } else {
      setHuellaError(`${r.mensaje}${r.detalle ? ` Error: ${r.detalle}` : ''}`);
    }
  };

  const handleRechazarHuella = () => {
    huella.marcarRechazada(huellaUserId);
    setOfrecerHuella(false);
    setHuellaError(null);
  };

  const handleDesactivarHuella = () => {
    huella.desactivar();
    setHuellaActiva(false);
    setHuellaError(null);
    setToastMessage('Ingreso con huella desactivado.');
  };

  // Desde el candado: se sale de la sesión para entrar con correo y contraseña.
  // La huella queda activada para la próxima vez.
  const handleIngresarConContrasena = async () => {
    setHuellaBloqueada(false);
    setDesbloqueo(huella.ESTADO_INICIAL);
    if (IS_DEMO) return;
    await signOut();
    setSession(null);
  };

  // Cerrar sesión desactiva la huella
  // Respaldo: lee las 4 tablas (en modo demo, los datos ficticios en memoria) y baja un JSON
  const [respaldoEnCurso, setRespaldoEnCurso] = useState(false);
  // En modo demo, ?respaldo=error muestra el aviso para medirlo
  const [respaldoError, setRespaldoError] = useState<string | null>(() =>
    IS_DEMO && new URLSearchParams(window.location.search).get('respaldo') === 'error'
      ? 'Error: historical_stays: permission denied for table historical_stays'
      : null
  );
  const handleDescargarRespaldo = async () => {
    if (respaldoEnCurso) return;
    // El respaldo trae teléfonos, direcciones, familiares y dueños sin enmascarar (hace falta para restaurar):
    // con el modo privacidad activo no se descarga.
    if (isPrivacyMode) {
      setRespaldoError('El modo privacidad está activo y el respaldo incluye teléfonos, direcciones, familiares y dueños. Desactivá el modo privacidad (botón del ojo, arriba) y volvé a intentar.');
      return;
    }
    setRespaldoEnCurso(true);
    setRespaldoError(null);
    const leer: LectorTabla = IS_DEMO || !isSupabaseConfigured
      ? async tabla => ({
          error: null,
          data: tabla === 'stays' ? stays.map(stayToRow)
            : tabla === 'historical_stays' ? historyRecords.map(historyToRow)
            : tabla === 'app_config' ? [config]
            : directoryClients
        })
      : leerTablaParaRespaldo;
    const r = await armarRespaldo(leer);
    setRespaldoEnCurso(false);
    if (!r.ok) {
      setRespaldoError(`Error: ${r.error}`);
      return;
    }
    descargarArchivo(r.nombre, r.contenido);
    setToastMessage(`✓ Respaldo descargado: ${r.nombre} (${cantidad(r.total, 'registro', 'registros')}).`);
  };

  const handleCerrarSesion = async () => {
    if (IS_DEMO) {
      setToastMessage('En modo demo no se cierra la sesión.');
      return;
    }
    const sinSubir = colaCambios.operaciones().length;
    if (sinSubir > 0) {
      const ok = await confirm({
        title: 'Hay cambios sin guardar en la nube',
        message: <p>{sinSubir === 1 ? 'Hay 1 cambio que todavía no se guardó' : `Hay ${sinSubir} cambios que todavía no se guardaron`} en la nube. Si cerrás sesión ahora se pierden. Mejor esperá a tener conexión.</p>,
        confirmLabel: 'Cerrar sesión igual',
        cancelLabel: 'Esperar',
        tone: 'danger',
        confirmTestId: 'cerrar-sesion-igual'
      });
      if (!ok) return;
      colaCambios.descartarTodo();
    }
    huella.desactivar();
    // El próximo ingreso vuelve a ofrecerla
    huella.olvidarRechazo();
    ofertaMostrada.current = false;
    setHuellaActiva(false);
    setHuellaError(null);
    await signOut();
    setSession(null);
  };

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [editingStay, setEditingStay] = useState<Stay | null>(null);
  const [isNewStayOpen, setIsNewStayOpen] = useState(false);
  const [prefillDogName, setPrefillDogName] = useState<string>('');
  const [prefillDailyRate, setPrefillDailyRate] = useState<number | undefined>(undefined);
  const [prefillDogId, setPrefillDogId] = useState<string | undefined>(undefined);
  // Confirmaciones (borrar, finalizar, archivar, marcar deducciones): un solo diálogo, ver src/components/ConfirmDialog.tsx
  const { confirm, confirmDialog } = useConfirm();
  const [prefillProfile, setPrefillProfile] = useState<{
    clientName?: string;
    clientPhone?: string;
    dogBreed?: string;
    notes?: string;
  } | null>(null);

  // Directorio Unificado Filter & Search
  const [directorySearch, setDirectorySearch] = useState('');

  // Directorio de Clientes y Fichas Caninas Dinámico (Editable, Persistente y Sincronizado)
  const [directoryClients, setDirectoryClients] = useState<ClientProfile[]>(() => {
    try {
      const saved = localStorage.getItem('pensionados_directory_clients');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return IS_DEMO ? DEMO_CLIENTS : clientsDirectory;
  });

  useEffect(() => {
    guardarCopiaLocal('pensionados_directory_clients', directoryClients);
  }, [directoryClients]);

  // Modo Privacidad para demostración pública (Blur / Enmascaramiento de datos personales)
  // Modo privacidad global (guardado en el dispositivo): src/components/PrivacyProvider.tsx
  const { isPrivacyMode, togglePrivacy, mask } = usePrivacy();

  // Modal para Crear / Editar Ficha Canina en el Directorio
  const [editingClient, setEditingClient] = useState<ClientProfile | null>(null);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);

  const handleOpenEditClient = (client: ClientProfile) => {
    setEditingClient(client);
    setIsClientModalOpen(true);
  };

  const handleOpenNewClient = (prefillDogName?: string) => {
    setEditingClient({
      id: `client-${Date.now()}`,
      dogName: prefillDogName || '',
      breed: '',
      birthYear: undefined,
      ownerName: '',
      ownerLastName: '',
      relatives: '',
      contact: '',
      address: ''
    });
    setIsClientModalOpen(true);
  };

  const handleSaveClient = async (updatedClient: ClientProfile) => {
    setDirectoryClients(prev => {
      const exists = prev.some(c => c.id === updatedClient.id || normalizeDogName(c.dogName) === normalizeDogName(updatedClient.dogName));
      let nextList: ClientProfile[];
      if (exists) {
        nextList = prev.map(c => (c.id === updatedClient.id || normalizeDogName(c.dogName) === normalizeDogName(updatedClient.dogName)) ? updatedClient : c);
      } else {
        nextList = [updatedClient, ...prev];
      }
      return nextList;
    });

    // Si cambió o se borró la dirección, también en las notas de sus estadías (si no, Waze usaría la vieja)
    const direccionAnterior = (ultimoEstado.current.clients.find(c => c.id === updatedClient.id)?.address ?? '').trim();
    const direccionNueva = (updatedClient.address ?? '').trim();
    const estadiasCambiadas = direccionAnterior === direccionNueva ? [] : cambiarDireccion({
      dogName: updatedClient.dogName, dogId: updatedClient.id, direccion: direccionNueva,
      fichas: [updatedClient], estadias: ultimoEstado.current.stays
    }).estadias;
    if (estadiasCambiadas.length) {
      const porId = new Map(estadiasCambiadas.map(s => [s.id, s]));
      setStays(prev => prev.map(s => (porId.has(s.id) ? { ...s, notes: porId.get(s.id)!.notes } : s)));
    }
    guardarEnNube([
      { tipo: 'upsert', tabla: 'clients_directory', clave: updatedClient.id, datos: updatedClient },
      ...estadiasCambiadas.map(s => ({ tipo: 'upsert' as const, tabla: 'stays' as const, clave: s.id, datos: s }))
    ]);

    setIsClientModalOpen(false);
    setEditingClient(null);
    // El aviso de guardado (arriba) dice si quedó pendiente de subir a la nube.
    // La solapa Historial sólo muestra perros con estadías finalizadas: se avisa si este todavía no tiene.
    const tienePasado = historyRecords.some(h => normalizeDogName(h.dogName) === normalizeDogName(updatedClient.dogName));
    setToastMessage(tienePasado
      ? `✓ Ficha de ${updatedClient.dogName} actualizada.`
      : `✓ Ficha de ${updatedClient.dogName} guardada. Aparece en el Historial cuando tenga una estadía finalizada.`);
  };

  /**
   * Pone la dirección de un perro: su ficha (o una nueva si no tenía) y las notas de sus estadías, por la cola.
   * `estadias` es la lista de estadías sobre la que se calcula (la pantalla, o con la estadía que se acaba de guardar).
   */
  const aplicarDireccion = (dogName: string, dogId: string | undefined, direccion: string, estadias: Stay[]) => {
    const cambio = cambiarDireccion({ dogName, dogId, direccion, fichas: ultimoEstado.current.clients, estadias });
    setDirectoryClients(prev =>
      cambio.esNueva ? [cambio.ficha, ...prev] : prev.map(c => (c.id === cambio.ficha.id ? cambio.ficha : c))
    );
    if (cambio.estadias.length) {
      const porId = new Map(cambio.estadias.map(s => [s.id, s]));
      setStays(prev => prev.map(s => (porId.has(s.id) ? { ...s, notes: porId.get(s.id)!.notes } : s)));
    }
    guardarEnNube([
      { tipo: 'upsert', tabla: 'clients_directory', clave: cambio.ficha.id, datos: cambio.ficha },
      ...cambio.estadias.map(s => ({ tipo: 'upsert' as const, tabla: 'stays' as const, clave: s.id, datos: s }))
    ]);
  };

  const handleDeleteClient = async (clientId: string) => {
    const ok = await confirm({
      title: 'Eliminar ficha',
      message: <p>¿Eliminar esta ficha del directorio?</p>,
      confirmLabel: 'Eliminar',
      tone: 'danger'
    });
    if (!ok) return;
    setDirectoryClients(prev => prev.filter(c => c.id !== clientId));
    guardarEnNube([{ tipo: 'delete', tabla: 'clients_directory', clave: clientId }]);
    setIsClientModalOpen(false);
    setEditingClient(null);
    setToastMessage(`Ficha eliminada del directorio.`);
  };

  // Historial Persistente
  const [historyRecords, setHistoryRecords] = useState<HistoricalStayRecord[]>(() => {
    // En demo, como la base real sin la migración 005: el tilde de transferida sale de este dispositivo
    if (IS_DEMO) return aplicarMarcas(DEMO_HISTORY);
    const deleted = loadDeletedHistoryIds();
    try {
      const saved = localStorage.getItem('pensionados_history_records');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length + deleted.length >= HISTORICAL_STAYS.length) {
          const cleaned = aplicarMarcas(filterDeleted(parsed, deleted));
          const seenIds = new Set<string>();
          return cleaned.filter(r => {
            if (seenIds.has(r.id)) return false;
            seenIds.add(r.id);
            return true;
          });
        }
      }
    } catch (e) {
      console.error('Error loading history records', e);
    }
    return aplicarMarcas(filterDeleted(HISTORICAL_STAYS, deleted));
  });

  useEffect(() => {
    if (IS_DEMO) return;
    guardarCopiaLocal('pensionados_history_records', historyRecords);
  }, [historyRecords]);

  const [toast, setToast] = useState<{ message: string; kind: 'ok' | 'error' } | null>(null);
  const setToastMessage = (message: string | null) =>
    setToast(message ? { message, kind: message.startsWith('⚠') ? 'error' : 'ok' } : null);
  const showErrorToast = (message: string) => setToast({ message, kind: 'error' });

  // Copia local de los datos (para abrir la app sin conexión). Si el dispositivo no la puede guardar se avisa una vez.
  const avisoCopiaLocal = React.useRef(false);
  const guardarCopiaLocal = (clave: string, valor: unknown) => {
    try {
      localStorage.setItem(clave, JSON.stringify(valor));
    } catch {
      if (avisoCopiaLocal.current) return;
      avisoCopiaLocal.current = true;
      showErrorToast('⚠ Este dispositivo no pudo guardar una copia de los datos (sin espacio o bloqueado). Lo que ya se subió a la nube está a salvo; no cierres la app mientras no haya conexión.');
    }
  };

  // Lo último que se ve en pantalla: después de un diálogo de confirmación se usa esto (no la copia de antes de abrirlo)
  const ultimoEstado = React.useRef({ stays, historyRecords, config, clients: directoryClients });
  ultimoEstado.current = { stays, historyRecords, config, clients: directoryClients };

  // Cambios pendientes de guardar en la nube: se suben enseguida si hay conexión; si no, quedan en una cola
  // en el dispositivo (sobrevive a cerrar la app) y se suben solos al volver la conexión. src/lib/colaPendientes.ts
  const cambiosPendientes = useCambiosPendientes({
    activo: IS_DEMO || isSupabaseConfigured,
    conSesion: IS_DEMO || Boolean(session?.user?.id),
    marcaSesion: session?.access_token ?? null,
    ejecutor: EJECUTOR_NUBE,
    avisar: mensaje => setToastMessage(mensaje),
    // Después de subir lo que había quedado pendiente se vuelve a leer la nube
    alVaciar: () => { if (!IS_DEMO) void sincronizacion.recargar(); }
  });
  const colaCambios = cambiosPendientes.cola;
  const guardarEnNube = cambiosPendientes.guardar;

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), toast.kind === 'error' ? 8000 : 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Borrado de estadías terminadas: confirmación + 10 s para deshacer
  const [deleteCandidate, setDeleteCandidate] = useState<HistoricalStayRecord | null>(null);
  // Copia local de lo borrado (últimos 30), para restaurar desde Ajustes
  const [borrados, setBorrados] = useState<BorradoReciente[]>(() => leerBorrados());
  const [pendingDelete, setPendingDelete] = useState<{ record: HistoricalStayRecord; index: number; startedAt: number } | null>(null);
  const pendingDeleteCtl = React.useRef<PendingDeletion | null>(null);
  // Registro en sus 10 s para deshacer: una relectura de la nube no lo vuelve a mostrar
  const borrandoConDeshacer = React.useRef<string | null>(null);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0);

  useEffect(() => {
    if (!pendingDelete) return;
    const tick = () => setUndoSecondsLeft(Math.max(0, Math.ceil((pendingDelete.startedAt + UNDO_WINDOW_MS - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [pendingDelete]);

  const confirmDeleteHistoryRecord = (record: HistoricalStayRecord) => {
    setDeleteCandidate(null);
    // Antes de borrar de verdad se guarda una copia en este dispositivo (Ajustes > Borrados recientes).
    // Si no se puede guardar, no se borra.
    if (!guardarBorrado(record)) {
      showErrorToast('⚠ No se borró: este dispositivo no pudo guardar la copia de seguridad (sin espacio o bloqueado).');
      return;
    }
    setBorrados(leerBorrados());
    pendingDeleteCtl.current?.flush();

    const removedIndex = historyRecords.findIndex(r => r.id === record.id);
    setHistoryRecords(prev => removeRecord(prev, record.id).next);
    const entry = { record, index: removedIndex, startedAt: Date.now() };
    setPendingDelete(entry);
    borrandoConDeshacer.current = record.id;
    const terminar = () => {
      if (borrandoConDeshacer.current === record.id) borrandoConDeshacer.current = null;
    };

    const ctl = scheduleDeletion({
      // Con conexión: si la base no lo borra, vuelve a aparecer con el aviso (como antes). Sin conexión: queda pendiente.
      commit: () => cambiosPendientes.guardarYEsperar([{ tipo: 'delete', tabla: 'historical_stays', clave: record.id }]),
      onCommitted: () => {
        terminar();
        // Sólo se anota como borrado en este dispositivo cuando la nube ya lo borró (si quedó pendiente, la cola lo oculta)
        const sigueEnCola = colaCambios.operaciones().some(o => o.tipo === 'delete' && o.tabla === 'historical_stays' && o.clave === record.id);
        if (!IS_DEMO && !sigueEnCola) saveDeletedHistoryId(record.id);
        // Por si una relectura lo trajo de vuelta durante los 10 s
        setHistoryRecords(prev => (prev.some(r => r.id === record.id) ? prev.filter(r => r.id !== record.id) : prev));
        setPendingDelete(cur => (cur?.record.id === record.id ? null : cur));
      },
      onFailed: (message) => {
        terminar();
        quitarBorrado(record.id);
        setBorrados(leerBorrados());
        setHistoryRecords(prev => restoreRecord(prev, record, entry.index));
        setPendingDelete(cur => (cur?.record.id === record.id ? null : cur));
        showErrorToast(`⚠ No se pudo borrar la estadía de ${record.dogName}: ${message}`);
      },
    });
    pendingDeleteCtl.current = ctl;
  };

  /** Restaura un registro borrado: vuelve al Historial (en este dispositivo y, por la cola, en la nube). */
  const restaurarBorrado = (borrado: BorradoReciente) => {
    const r = borrado.registro;
    removeDeletedHistoryId(r.id);
    setHistoryRecords(prev => (prev.some(x => x.id === r.id) ? prev : [...prev, r]));
    guardarEnNube([{ tipo: 'upsert', tabla: 'historical_stays', clave: r.id, datos: r }]);
    quitarBorrado(r.id);
    setBorrados(leerBorrados());
    setToastMessage(`✓ Estadía de ${r.dogName} (${r.fromDay} → ${r.untilDay}) restaurada en el Historial.`);
  };

  const undoDeleteHistoryRecord = () => {
    const ctl = pendingDeleteCtl.current;
    const entry = pendingDelete;
    if (!ctl || !entry || !ctl.undo()) return;
    quitarBorrado(entry.record.id);
    setBorrados(leerBorrados());
    borrandoConDeshacer.current = null;
    setHistoryRecords(prev => restoreRecord(prev, entry.record, entry.index));
    setPendingDelete(null);
    pendingDeleteCtl.current = null;
  };

  // Sincronización con Supabase: sólo con sesión y sólo lecturas (src/lib/sincronizacion.ts).
  // Una tabla vacía se muestra vacía; una lectura fallida avisa y no escribe nada.
  // En modo demo, ?aviso=lectura muestra el aviso para medirlo
  const [syncErrors, setSyncErrors] = useState<{ tabla: string; mensaje: string }[]>(() =>
    IS_DEMO && new URLSearchParams(window.location.search).get('aviso') === 'lectura'
      ? [{ tabla: 'estadías', mensaje: 'permission denied for table stays' }]
      : []
  );
  const [syncLoading, setSyncLoading] = useState(false);
  // La nube todavía no guarda el tilde de los registros archivados (migración 005). El demo lo simula.
  const [tildeSoloLocal, setTildeSoloLocal] = useState(
    () => IS_DEMO && faltaColumnaTilde(DEMO_HISTORY)
  );
  // Distinto de syncLoading (que se reactiva en cada "Reintentar"): sólo la primera lectura de la cuenta
  const [firstLoadDone, setFirstLoadDone] = useState(IS_DEMO || !isSupabaseConfigured);
  const sincronizacion = React.useMemo(() => crearSincronizacion({
    cargando: setSyncLoading,
    primeraCarga: setFirstLoadDone,
    aplicar: datos => {
      // Lo leído de la nube + los cambios que todavía no se subieron (no desaparecen de la pantalla)
      const ops = colaCambios.operaciones();
      if (datos.stays.ok) {
        const seen = new Set<string>();
        setStays(conPendientes(datos.stays.data.filter(s => {
          if (s.id.startsWith('stay-17933') || seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        }), ops, 'stays'));
      }
      if (datos.history.ok) {
        // Sin la columna del tilde en la nube (migración 005), se usa el tilde guardado en este dispositivo
        setTildeSoloLocal(faltaColumnaTilde(datos.history.data));
        setHistoryRecords(historialDesdeLaNube({
          nube: datos.history.data,
          borrados: loadDeletedHistoryIds(),
          marcas: leerMarcas(),
          ops,
          enBorrado: borrandoConDeshacer.current
        }));
      }
      const configPendiente = [...ops].reverse().find(o => o.tabla === 'app_config' && o.tipo === 'upsert');
      if (configPendiente) setConfig(completarConfig(configPendiente.datos as AppConfig));
      else if (datos.config.ok && datos.config.data) {
        const nube = datos.config.data;
        // Sin las columnas nuevas en la nube, se conservan las tasas y la fecha de inicio de este dispositivo
        setConfig(prev => completarConfig({
          ...nube,
          dzRatesByYear: nube.dzRatesByYear ?? prev.dzRatesByYear,
          dzStartDate: nube.dzStartDate ?? prev.dzStartDate
        }));
      }
      if (datos.clients.ok) setDirectoryClients(conPendientes(datos.clients.data, ops, 'clients_directory'));
      setSyncErrors(erroresDeLectura(datos));
    },
    limpiar: () => {
      setStays([]);
      setHistoryRecords([]);
      setDirectoryClients([]);
      setConfig(defaultAppConfig);
      setSyncErrors([]);
      for (const key of ACCOUNT_STORAGE_KEYS) {
        try { localStorage.removeItem(key); } catch {}
      }
    }
  }), []);

  const sessionUserId: string | null = session?.user?.id ?? null;
  useEffect(() => {
    if (IS_DEMO || !isSupabaseConfigured) return;
    sincronizacion.cambiarSesion(sessionUserId);
    if (!sessionUserId) return;
    // Tiempo real: sólo con sesión; una lectura fallida no borra lo que se ve
    const unsubscribe = subscribeToStaysChanges(() => {
      fetchStaysFromDb().then(r => {
        if (r.ok) setStays(conPendientes(r.data, colaCambios.operaciones(), 'stays'));
      });
    });
    return () => unsubscribe();
  }, [sessionUserId, sincronizacion]);

  const getLocalDateISO = (daysAhead = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Persistence
  useEffect(() => {
    guardarCopiaLocal('pensionados_config', config);
  }, [config]);

  useEffect(() => {
    guardarCopiaLocal('pensionados_stays', stays);
  }, [stays]);

  // Derived Calculations
  const calculatedAll = useMemo(() => {
    return stays.map(stay => ({
      stay,
      calc: calculateStay(stay, config)
    }));
  }, [stays, config]);
  // Agenda = estadías en curso o futuras; las finalizadas esperan en Cobros hasta estar cobradas y deducidas
  const calculatedStays = useMemo(() => calculatedAll.filter(i => !i.stay.finalizada), [calculatedAll]);
  const porCobrar = useMemo(() => calculatedAll.filter(i => i.stay.finalizada), [calculatedAll]);

  // Agenda (Directorio) plegable: una sola entrada abierta a la vez. Se pliega al cambiar la búsqueda o el filtro.
  const [openDirectoryKey, setOpenDirectoryKey] = useState<string | null>(null);
  useEffect(() => {
    setOpenDirectoryKey(null);
  }, [directorySearch]);

  // Solapa Historial: sólo perros que YA estuvieron (al menos un registro archivado) y sólo con su pasado.
  // Las estadías de la Agenda (en curso o futuras) no se ven acá hasta que se finalizan; un registro que
  // corresponde a una estadía que sigue en la Agenda tampoco. Los datos de contacto salen de la ficha.
  const unifiedDirectoryDogs = useMemo(() => {
    const dogMap: {
      [key: string]: {
        dogName: string;
        breed?: string;
        birthYear?: number;
        ownerName?: string;
        ownerLastName?: string;
        relatives?: string;
        contact?: string;
        address?: string;
        clientProfile?: ClientProfile;
        historicalCount: number;
        historicalDays: number;
        lastRate?: number;
        /** Cada escritura del nombre en sus registros archivados, con su clave de recencia */
        escrituras: { nombre: string; clave: ClaveOrden }[];
        /** clave del registro con la que se eligió lastRate (el más reciente) */
        claveTarifa?: ClaveOrden;
        /** sus estadías ya finalizadas (registros archivados) */
        registros: HistoricalStayRecord[];
      };
    } = {};

    // 1. Registros archivados (el pasado): definen quién aparece
    const deLaAgenda = registrosDeLaAgenda(stays, historyRecords);
    historyRecords.forEach(h => {
      if (deLaAgenda.has(h.id)) return;
      const norm = normalizeDogName(h.dogName);
      if (!norm) return;
      const item = (dogMap[norm] ??= { dogName: h.dogName, historicalCount: 0, historicalDays: 0, escrituras: [], registros: [] });
      item.registros.push(h);
      const clave = claveDeRegistro(h);
      item.escrituras.push({ nombre: h.dogName, clave });
      item.historicalCount += 1;
      item.historicalDays += h.days || 0;
      if (h.dailyRate && (!item.claveTarifa || compararClaves(clave, item.claveTarifa, { conNombre: false }) < 0)) {
        item.claveTarifa = clave;
        item.lastRate = h.dailyRate;
      }
    });

    // 2. Ficha del directorio (dueño, teléfono, dirección); si no hay ficha, el contacto de una estadía
    directoryClients.forEach(client => {
      const item = dogMap[normalizeDogName(client.dogName)];
      if (!item || item.clientProfile) return;
      Object.assign(item, {
        breed: client.breed,
        birthYear: client.birthYear,
        ownerName: client.ownerName,
        ownerLastName: client.ownerLastName,
        relatives: client.relatives,
        contact: client.contact,
        address: client.address,
        clientProfile: client
      });
    });
    stays.forEach(stay => {
      const item = dogMap[normalizeDogName(stay.dogName)];
      if (!item || item.clientProfile) return;
      if (stay.dogBreed && !item.breed) item.breed = stay.dogBreed;
      if (stay.clientName && !item.ownerName) item.ownerName = stay.clientName;
      if (stay.clientPhone && !item.contact) item.contact = stay.clientPhone;
    });

    // Un mismo perro escrito distinto (Ramón, Ramon, "ramón ") es una sola entrada; se muestra la escritura más
    // reciente y sin espacios sobrantes. Cómo se guarda el nombre en la base no cambia.
    let list = Object.values(dogMap).map(item => {
      const dogName = elegirNombreVisible(item.escrituras) || limpiarNombre(item.dogName);
      // Orden: el registro más reciente del perro (hora de archivado, si no ID/secuencia, si no fin de estadía)
      const mejor = mejorClave(item.escrituras.map(e => e.clave));
      const claveOrden: ClaveOrden = { archivado: null, secuencia: null, fin: null, ...mejor, nombre: dogName };
      return { ...item, dogName, claveOrden };
    });

    // Search filter
    if (directorySearch.trim()) {
      const term = normalizeDogName(directorySearch);
      list = list.filter(item => {
        const normDog = normalizeDogName(item.dogName);
        const normBreed = normalizeDogName(item.breed || '');
        // Con el modo privacidad activo se busca sólo por lo que se ve: nombre del perro y raza
        if (isPrivacyMode) return normDog.includes(term) || normBreed.includes(term);
        const normOwner = normalizeDogName(item.ownerName || '');
        const normContact = (item.contact || '').replace(/\D/g, '');
        const normAddress = normalizeDogName(item.address || '');
        return (
          normDog.includes(term) ||
          normBreed.includes(term) ||
          normOwner.includes(term) ||
          (normContact.length > 0 && normContact.includes(term)) ||
          normAddress.includes(term)
        );
      });
    }

    // Orden: lo más recientemente finalizado o archivado primero (src/utils/agendaOrden.ts). Una estadía que se
    // finaliza desde la Agenda queda en el primer lugar.
    return list.sort((a, b) => compararClaves(a.claveOrden, b.claveOrden));
  }, [directoryClients, stays, historyRecords, directorySearch, isPrivacyMode]);

  // Deducciones pendientes (perro por perro) y transferidas, desde la fecha de inicio de Ajustes (src/utils/deducciones.ts).
  // Un registro que corresponde a una estadía que sigue en la Agenda no se cuenta dos veces.
  const resumenDeducciones = useMemo(
    () => resumirDeducciones({ registros: historyRecords, config, excluir: registrosDeLaAgenda(stays, historyRecords) }),
    [historyRecords, config, stays]
  );

  // Stay groups for "Hoy" tab
  const stayGroups = useMemo(() => {
    const today = getLocalDateISO(0);
    const overdue: typeof calculatedStays = [];
    const leavingToday: typeof calculatedStays = [];
    const arrivingToday: typeof calculatedStays = [];
    const inHouse: typeof calculatedStays = [];
    const upcoming: typeof calculatedStays = [];

    for (const item of calculatedStays) {
      const { fromDay, untilDay } = item.stay;
      if (untilDay < today) overdue.push(item);
      else if (untilDay === today) leavingToday.push(item);
      else if (fromDay === today) arrivingToday.push(item);
      else if (fromDay < today) inHouse.push(item);
      else upcoming.push(item);
    }
    return { overdue, leavingToday, arrivingToday, inHouse, upcoming };
  }, [calculatedStays]);

  // Estado para acordeón desplegable en vista "Hoy" (responsive / móvil)
  const [expandedHoyStayIds, setExpandedHoyStayIds] = useState<Record<string, boolean>>({});
  const toggleHoyStay = (id: string) => {
    setExpandedHoyStayIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Handlers
  const handleSaveStay = (savedStay: Stay, direccion?: string) => {
    if (editingStay) {
      if (savedStay.savedToHistory && savedStay.historyRecordId) {
        const calc = calculateStay(savedStay, config);
        const formatExcelDate = (isoStr: string) => {
          if (!isoStr) return '';
          const parts = isoStr.split('-');
          if (parts.length === 3) {
            return `${parseInt(parts[2], 10)}/${parseInt(parts[1], 10)}`;
          }
          return isoStr;
        };
        const updatedHistRecord: HistoricalStayRecord = {
          id: savedStay.historyRecordId,
          rowIndex: 0,
          dogName: savedStay.dogName,
          rawDogName: savedStay.dogName,
          fromDay: formatExcelDate(savedStay.fromDay),
          untilDay: formatExcelDate(savedStay.untilDay),
          days: savedStay.days,
          totalPagar: Math.round(calc.totalGross),
          totalPagarRaw: Math.round(calc.totalGross).toLocaleString('es-AR'),
          dz: Math.round(calc.dzGenerated),
          neto: Math.round(calc.netArs),
          fuel: Math.round(calc.fuelCost),
          mixta: 0,
          soloUsd: Math.round(calc.netUsd),
          dzRate: calc.dzRate,
          dzTransferred: Boolean(savedStay.dzTransferred),
          dzTransferredAmount: Math.round(calc.dzTransferredAmount),
          dogId: savedStay.dogId,
          dailyRate: Math.round(savedStay.dailyRate),
          dailyRateRaw: Math.round(savedStay.dailyRate).toLocaleString('es-AR'),
          pureRate: Math.round(calc.pureDailyRate),
          pureRateRaw: Math.round(calc.pureDailyRate).toLocaleString('es-AR'),
          ifmDaily: Math.round(calc.ifmDaily),
          totalIfm: Math.round(calc.totalIfm),
          netoEuros: 0,
        };
        // Se conserva la posición (rowIndex) del registro: antes se subía con 0 y quedaba primero en la lista
        const previo = historyRecords.find(h => h.id === savedStay.historyRecordId);
        const registroActualizado: HistoricalStayRecord = previo
          ? { ...previo, ...updatedHistRecord, rowIndex: previo.rowIndex }
          : { ...updatedHistRecord, rowIndex: historyRecords.length + 4 };
        setHistoryRecords(prev => prev.map(h => (h.id === registroActualizado.id ? registroActualizado : h)));
        guardarEnNube([{ tipo: 'upsert', tabla: 'historical_stays', clave: registroActualizado.id, datos: registroActualizado }]);
      }
      setStays(prev => prev.map(s => s.id === savedStay.id ? savedStay : s));
      setEditingStay(null);
    } else {
      setStays(prev => [savedStay, ...prev]);
      setIsNewStayOpen(false);
      setPrefillDogName('');
      setPrefillDailyRate(undefined);
    }
    // Sincronizar con Supabase (si no hay conexión queda pendiente; los errores los avisa la cola)
    guardarEnNube([{ tipo: 'upsert', tabla: 'stays', clave: savedStay.id, datos: savedStay }]);
    // La dirección se cambió en el mismo formulario: ficha y notas de las estadías del perro (incluida esta)
    if (direccion !== undefined) {
      aplicarDireccion(savedStay.dogName, savedStay.dogId, direccion, [savedStay, ...ultimoEstado.current.stays.filter(s => s.id !== savedStay.id)]);
    }
  };

  // Borrar ≠ Finalizar: borrar quita la estadía de la Agenda (en curso o futura) y NO genera ningún registro
  // en el Historial. Si la estadía tenía un registro propio (guardado mientras seguía en curso), también se quita.
  const handleDeleteStay = async (id: string) => {
    const aBorrar = stays.find(s => s.id === id);
    if (!aBorrar) return;
    const ok = await confirm({
      title: 'Borrar estadía',
      message: (
        <p>
          Se borra la estadía de <strong>{aBorrar.dogName}</strong> de la Agenda. <strong>No pasa al Historial</strong> ni queda
          ningún registro. Si la estadía terminó y la querés guardar, usá «Finalizar».
        </p>
      ),
      confirmLabel: 'Borrar',
      tone: 'danger',
      confirmTestId: 'confirmar-borrar-estadia'
    });
    if (!ok) return;
    const stay = ultimoEstado.current.stays.find(s => s.id === id);
    if (!stay) return;
    const ops: NuevaOperacion[] = [];
    if (stay?.historyRecordId) {
      const historyId = stay.historyRecordId;
      setHistoryRecords(prev => prev.filter(h => h.id !== historyId));
      ops.push({ tipo: 'delete', tabla: 'historical_stays', clave: historyId });
    }
    setStays(prev => prev.filter(s => s.id !== id));
    ops.push(quitarDeLaAgenda(id));
    guardarEnNube(ops);
    setToastMessage(`Estadía de ${stay.dogName} borrada de la Agenda (no pasó al Historial).`);
  };

  // Finalizar = pasa a Cobros (sale de la Agenda). Con "Cobrado" y "Deducida" tildadas pasa sola al Historial.
  const requestFinishStay = async (stay: Stay) => {
    const ok = await confirm({
      title: '¿Finalizar estadía?',
      message: <p><strong>{stay.dogName}</strong> pasa a Cobros y se quita de la Agenda. Cuando esté cobrada y con la tasa transferida pasa sola al Historial.</p>,
      confirmLabel: 'Finalizar',
      tone: 'success'
    });
    if (!ok) return;
    const actual = ultimoEstado.current.stays.find(s => s.id === stay.id);
    if (actual) guardarCambioCobro(finalizar(actual), 'pasó a Cobros');
  };

  /**
   * Guarda un cambio de una estadía finalizada. Si ya está cobrada y deducida pasa al Historial (y se va de Cobros);
   * si no, queda en Cobros con el cambio guardado por la cola.
   */
  const guardarCambioCobro = (actualizada: Stay, mensajeSiQueda: string) => {
    if (estadoCobro(actualizada, ultimoEstado.current.config).listo) {
      handleArchiveStayToHistory(actualizada.id, actualizada);
      setToastMessage(`✓ ${actualizada.dogName} pasó al Historial.`);
      return;
    }
    setStays(prev => prev.map(s => (s.id === actualizada.id ? actualizada : s)));
    guardarEnNube([{ tipo: 'upsert', tabla: 'stays', clave: actualizada.id, datos: actualizada }]);
    setToastMessage(`✓ ${actualizada.dogName} ${mensajeSiQueda}.`);
  };

  const handleCobrado = async (stayId: string) => {
    const stay = ultimoEstado.current.stays.find(s => s.id === stayId);
    if (!stay) return;
    const falta = Math.round(calculateStay(stay, ultimoEstado.current.config).totalAdeudado);
    const ok = await confirm({
      title: 'Marcar como cobrado',
      message: <p>Se marca como cobrado lo que faltaba de <strong>{stay.dogName}</strong>: <strong>{formatCurrencyARS(falta)}</strong>.</p>,
      confirmLabel: 'Cobrado',
      confirmTestId: 'confirmar-cobrado'
    });
    if (!ok) return;
    const vigente = ultimoEstado.current.stays.find(s => s.id === stayId);
    if (vigente) guardarCambioCobro(cobrar(vigente, ultimoEstado.current.config), 'quedó cobrada');
  };

  const handleDeducidaCobro = (stayId: string) => {
    const stay = ultimoEstado.current.stays.find(s => s.id === stayId);
    if (!stay) return;
    const nueva = deducir(stay, ultimoEstado.current.config);
    if (nueva === stay) return;
    guardarCambioCobro(nueva, nueva.dzTransferred ? 'quedó con la tasa transferida' : 'volvió a tener la tasa pendiente');
  };

  const handleVolverALaAgenda = (stayId: string) => {
    const stay = ultimoEstado.current.stays.find(s => s.id === stayId);
    if (stay) guardarCambioCobro(volverALaAgenda(stay), 'volvió a la Agenda');
  };

  const handleArchiveStayToHistory = (stayId: string, estadiaActual?: Stay) => {
    // Se llama después de confirmar: se usa lo último en pantalla, no la copia de antes de abrir el diálogo
    const { stays: staysAhora, historyRecords: historialAhora, config: configAhora } = ultimoEstado.current;
    const stay = estadiaActual ?? staysAhora.find(s => s.id === stayId);
    if (!stay) return;

    const calc = calculateStay(stay, configAhora);
    const histId = `hist-agenda-${stay.id}-${Date.now()}`;

    // Formato fecha estilo Excel D/M (ej: 12/3 o 22/10)
    const formatExcelDate = (isoStr: string) => {
      if (!isoStr) return '';
      const parts = isoStr.split('-');
      if (parts.length === 3) {
        const d = parseInt(parts[2], 10);
        const m = parseInt(parts[1], 10);
        return `${d}/${m}`;
      }
      return isoStr;
    };

    const fromFormatted = formatExcelDate(stay.fromDay);
    const untilFormatted = formatExcelDate(stay.untilDay);

    const newRecord: HistoricalStayRecord = {
      id: histId,
      rowIndex: historialAhora.length + 4,
      dogName: stay.dogName,
      rawDogName: stay.dogName,
      fromDay: fromFormatted,
      untilDay: untilFormatted,
      days: stay.days,
      totalPagar: Math.round(calc.totalGross),
      totalPagarRaw: Math.round(calc.totalGross).toLocaleString('es-AR'),
      dz: Math.round(calc.dzGenerated),
      neto: Math.round(calc.netArs),
      fuel: Math.round(calc.fuelCost),
      mixta: 0,
      soloUsd: Math.round(calc.netUsd),
      dailyRate: Math.round(stay.dailyRate),
      dailyRateRaw: Math.round(stay.dailyRate).toLocaleString('es-AR'),
      pureRate: Math.round(calc.pureDailyRate),
      pureRateRaw: Math.round(calc.pureDailyRate).toLocaleString('es-AR'),
      ifmDaily: Math.round(calc.ifmDaily),
      totalIfm: Math.round(calc.totalIfm),
      netoEuros: 0,
      // Lo que no se transfirió sigue en Cobros > Deducciones por transferir
      dzTransferred: Boolean(stay.dzTransferred),
      dzTransferredAmount: Math.round(calc.dzTransferredAmount),
      dzTransferredAt: stay.dzTransferredAt,
      // Tasa del año de la fecha de fin (Ajustes > Deducciones), calculada en calculateStay
      dzRate: calc.dzRate,
      dogId: stay.dogId
    };

    // 1. Guardar en Historial (local y Supabase), evitando duplicar si ya existe el mismo perro y fechas.
    //    Se calcula afuera del setState: antes la nube recibía siempre el registro nuevo (con otro id) aunque hubiera coincidencia.
    const matchIdx = historialAhora.findIndex(r =>
      (stay.historyRecordId && r.id === stay.historyRecordId) ||
      r.id.startsWith(`hist-agenda-${stay.id}`) ||
      (normalizeDogName(r.dogName) === normalizeDogName(stay.dogName) &&
       (r.fromDay === fromFormatted || r.fromDay === stay.fromDay) &&
       (r.untilDay === untilFormatted || r.untilDay === stay.untilDay))
    );
    const recordToSave: HistoricalStayRecord = matchIdx >= 0
      ? { ...historialAhora[matchIdx], ...newRecord, id: historialAhora[matchIdx].id }
      : newRecord;
    setHistoryRecords(prev =>
      prev.some(r => r.id === recordToSave.id) ? prev.map(r => (r.id === recordToSave.id ? recordToSave : r)) : [...prev, recordToSave]
    );
    // Si la estadía ya estaba transferida, el registro nuevo también (y se recuerda en este dispositivo por si la
    // nube todavía no guarda el tilde: así no vuelve a aparecer como pendiente al releerla)
    if (recordToSave.dzTransferred) {
      guardarMarca(recordToSave.id, {
        dzTransferred: true,
        dzTransferredAmount: recordToSave.dzTransferredAmount ?? recordToSave.dz,
        dzTransferredAt: recordToSave.dzTransferredAt
      });
    }

    // 2. Eliminar de la planilla detallada activa (local y Supabase)
    setStays(prev => prev.filter(s => s.id !== stayId));

    // En la nube: primero archivar y después quitar de la agenda; si el archivado no se puede, no se quita
    guardarEnNube(
      [{ tipo: 'upsert', tabla: 'historical_stays', clave: recordToSave.id, datos: recordToSave }, quitarDeLaAgenda(stay.id)],
      { grupo: true }
    );

    // (el aviso lo da quien llama: "pasó al Historial")
  };

  const parcheDeduccion = (
    tabla: 'stays' | 'historical_stays',
    r: { id: string; dzTransferred?: boolean; dzTransferredAmount?: number; dzTransferredAt?: string }
  ): NuevaOperacion => ({
    tipo: 'parche',
    tabla,
    clave: r.id,
    datos: { dzTransferred: Boolean(r.dzTransferred), dzTransferredAmount: r.dzTransferredAmount ?? 0, dzTransferredAt: r.dzTransferredAt ?? null }
  });

  /**
   * Marca (o desmarca) deducciones como transferidas: en pantalla, en este dispositivo (para los registros
   * archivados, por si la nube todavía no guarda el tilde) y en la nube por la cola, un cambio por registro.
   */
  const aplicarTildes = (items: ItemDeduccion[], transferida: boolean) => {
    const { historyRecords: historialAhora } = ultimoEstado.current;
    const fecha = new Date().toISOString();
    const ids = new Set(items.map(it => it.id));
    const registros = historialAhora
      .filter(r => ids.has(r.id))
      .map(r => (transferida
        ? { ...r, dzTransferred: true, dzTransferredAmount: r.dz, dzTransferredAt: fecha }
        : { ...r, dzTransferred: false, dzTransferredAmount: 0, dzTransferredAt: undefined }));
    let marcasOk = true;
    for (const r of registros) {
      marcasOk = guardarMarca(r.id, { dzTransferred: Boolean(r.dzTransferred), dzTransferredAmount: r.dzTransferredAmount ?? 0, dzTransferredAt: r.dzTransferredAt }) && marcasOk;
    }
    // En pantalla sólo se cambian el tilde, el monto y la fecha de cada registro (el resto queda como está)
    const porId = new Map(registros.map(x => [x.id, x]));
    if (registros.length) {
      setHistoryRecords(prev => prev.map(r => {
        const t = porId.get(r.id);
        return t ? { ...r, dzTransferred: t.dzTransferred, dzTransferredAmount: t.dzTransferredAmount, dzTransferredAt: t.dzTransferredAt } : r;
      }));
    }
    guardarEnNube(registros.map(r => parcheDeduccion('historical_stays', r)));
    if (!marcasOk) showErrorToast('⚠ Este dispositivo no pudo guardar el tilde (sin espacio o bloqueado). Puede volver a aparecer como pendiente.');
    return registros.length;
  };

  const handleToggleDzTransferred = (stayId: string) => {
    const s = stays.find(x => x.id === stayId);
    if (!s) return;
    const updated = toggleDzTransfer(s, config);
    if (updated === s) return;
    setStays(prev => prev.map(x => (x.id === stayId ? updated : x)));
    guardarEnNube([parcheDeduccion('stays', updated)]);
  };

  const handleToggleHistoryDzTransferred = (recordId: string) => {
    const r = historyRecords.find(x => x.id === recordId);
    if (!r) return;
    const nextVal = historyDzPending(r) >= 1;
    const item: ItemDeduccion = { id: r.id, dogName: r.dogName, desde: r.fromDay, hasta: r.untilDay, fin: null, totalCobrado: r.totalPagar, tasa: r.dzRate ?? config.dzRate, monto: r.dz };
    aplicarTildes([item], nextVal);
    setToastMessage('Estado de la tasa actualizado en el Registro de estadías');
  };

  /** Desde "Deducciones pendientes": marca una estadía como transferida (con la fecha de hoy). */
  const handleMarcarDeduccion = (item: ItemDeduccion) => {
    aplicarTildes([item], true);
    setToastMessage(`✓ Tasa de ${item.dogName} marcada como transferida.`);
  };

  /** Desmarcar (por si se marcó por error): pide confirmación y vuelve a pendientes. */
  const handleDesmarcarDeduccion = async (item: ItemDeduccion) => {
    const ok = await confirm({
      title: 'Destildar tasa',
      message: <p>La tasa de <strong>{item.dogName}</strong> ({formatCurrencyARS(Math.round(item.monto))}) deja de figurar como transferida y vuelve a Pendientes. ¿Destildarla?</p>,
      confirmLabel: 'Destildar',
      tone: 'danger',
      confirmTestId: 'confirmar-desmarcar'
    });
    if (!ok) return;
    aplicarTildes([item], false);
    setToastMessage(`Tasa de ${item.dogName} desmarcada: vuelve a pendientes.`);
  };

  // Subida única de tildes: lee la nube (sólo lectura; en demo se simula) y sube por la cola, esperando a que se guarde
  const leerNubeTildes = IS_DEMO
    ? async () => ({ ok: true as const, data: DEMO_HISTORY.map(r => ({ id: r.id, dzTransferred: false, dzTransferredAmount: 0 })) })
    : leerTildesDeLaNube;
  const subirYEsperar = (ops: NuevaOperacion[]) => new Promise<boolean>(resolver => {
    const ids = guardarEnNube(ops);
    if (!ids.length) return resolver(false);
    let listo = false;
    let quitar = () => {};
    let limite: ReturnType<typeof setTimeout> | undefined;
    const terminar = (ok: boolean) => {
      if (listo) return;
      listo = true;
      quitar();
      clearTimeout(limite);
      resolver(ok);
    };
    const revisar = () => {
      if (ids.some(id => colaCambios.conError(id))) terminar(false);
      else if (!ids.some(id => colaCambios.pendiente(id))) terminar(true);
    };
    quitar = colaCambios.suscribir(revisar);
    limite = setTimeout(() => terminar(false), 60_000);
    revisar();
  });

  /** Ajustes > Deducciones: tasas por año y fecha de inicio. Se guardan con el resto de la configuración. */
  const handleGuardarDeducciones = (cambios: Pick<AppConfig, 'dzRatesByYear' | 'dzStartDate'>) => {
    const nueva = completarConfig({ ...ultimoEstado.current.config, ...cambios });
    setConfig(nueva);
    guardarEnNube([{ tipo: 'upsert', tabla: 'app_config', clave: '1', datos: nueva }]);
    setToastMessage('✓ Tasas actualizadas.');
  };

  const handleMarkAllDzTransferred = async () => {
    const pendingCount = resumenDeducciones.pendientes.length;
    if (pendingCount === 0) return;
    const ok = await confirm({
      title: 'Marcar todas las tasas',
      message: (
        <p>
          Se van a marcar <strong>{pendingCount} {pendingCount === 1 ? 'tasa' : 'tasas'}</strong> como transferidas,
          por un total de <strong>{formatCurrencyARS(Math.round(resumenDeducciones.total))}</strong>. ¿Seguimos?
        </p>
      ),
      confirmLabel: `Marcar ${pendingCount}`
    });
    if (!ok) return;
    // Se calcula con lo último en pantalla (pudo cambiar mientras el diálogo estaba abierto): las pendientes desde
    // la fecha de inicio. Un cambio por cada registro que se tilda (sólo el tilde, el monto y la fecha).
    const ahora = ultimoEstado.current;
    const actual = resumirDeducciones({
      registros: ahora.historyRecords,
      config: ahora.config,
      excluir: registrosDeLaAgenda(ahora.stays, ahora.historyRecords)
    });
    const n = aplicarTildes(actual.pendientes, true);
    setToastMessage(`✓ ${n} tasas marcadas como transferidas.`);
  };

  const handleExportCSV = () => {
    const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
    // Con el modo privacidad activo el dueño sale enmascarado, igual que en pantalla (src/utils/exportarCsv.ts)
    const csvLines = construirCsvEstadias(calculatedStays, mask);
    // UTF-8 BOM so Excel opens it with correct encoding
    const BOM = '﻿';
    const blob = new Blob([BOM + csvLines], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `pensionados_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleOpenNewStayForDog = (
    dogName: string,
    lastRate?: number,
    extra?: { clientName?: string; clientPhone?: string; dogBreed?: string; notes?: string },
    dogId?: string
  ) => {
    setIsHistoryOpen(false);
    setEditingStay(null);
    setPrefillDogName(dogName);
    setPrefillDailyRate(lastRate);
    setPrefillDogId(dogId);
    setPrefillProfile(extra || null);
    setIsNewStayOpen(true);
  };

  // Auth gate
  if (authLoading) {
    return (
      <div className="min-h-screen bg-fondo flex items-center justify-center text-texto-sec">
        Cargando…
      </div>
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-fondo flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-superficie border border-acento/40 rounded-2xl p-8 shadow-2xl text-center">
          <AppLogo size={88} className="mx-auto mb-3" />
          <h1 className="text-xl font-bold text-texto mb-3">Doggy Care</h1>
          {supabaseUrlError ? (
            <p role="alert" className="text-error font-semibold leading-relaxed">{supabaseUrlError}</p>
          ) : (
            <>
              <p className="text-acento-texto text-sm leading-relaxed">
                Falta configurar la conexión a la base de datos.
              </p>
              <p className="text-texto-sec text-sm mt-2">
                Seguí los pasos en{' '}
                <code className="text-acento-texto">docs/despliegue.md</code>.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!session) {
    const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoginLoading(true);
      setLoginError('');
      const { error } = await signInWithPassword(loginEmail, loginPassword);
      setLoginLoading(false);
      if (!error) {
        setLoginPassword('');
        setHuellaBloqueada(false);
      }
      if (error) {
        const msg = error.message?.toLowerCase() ?? '';
        if (msg.includes('invalid login') || msg.includes('invalid credentials') || msg.includes('wrong password') || msg.includes('email not confirmed')) {
          setLoginError('Correo o contraseña incorrectos.');
        } else if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch')) {
          setLoginError('Sin conexión. Revisá tu red e intentá de nuevo.');
        } else {
          setLoginError('No se pudo iniciar sesión. Revisá tu conexión e intentá de nuevo.');
        }
      }
    };

    return (
      <div className="min-h-screen bg-fondo flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-superficie border border-borde rounded-2xl p-8 shadow-2xl">
          <AppLogo size={88} className="mx-auto mb-3" />
          <h1 className="text-xl font-bold text-texto mb-1 text-center">Doggy Care</h1>
          <p className="text-texto-sec text-sm mb-6 text-center">Acceso exclusivo para el administrador</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-texto-sec mb-1">
                Correo electrónico
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="username"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                placeholder="tu@correo.com"
                className="w-full bg-fondo border border-borde-fuerte rounded-xl px-4 py-3 text-texto focus:border-acento "
              />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-texto-sec mb-1">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={loginShowPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-fondo border border-borde-fuerte rounded-xl px-4 py-3 pr-14 text-texto focus:border-acento "
                />
                <button
                  type="button"
                  aria-label={loginShowPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setLoginShowPassword(v => !v)}
                  className="absolute right-0 top-0 h-full w-12 flex items-center justify-center text-texto-sec hover:text-texto transition-colors cursor-pointer"
                >
                  {loginShowPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>
            {loginError && <p className="text-error text-sm">{loginError}</p>}
            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-acento hover:bg-acento-hover disabled:opacity-50 text-acento-fg font-bold rounded-xl py-3 transition-colors cursor-pointer"
            >
              {loginLoading ? 'Ingresando…' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (huellaBloqueada) {
    return (
      <PantallaDesbloqueo
        estado={desbloqueo}
        pidiendo={pidiendoHuella}
        // En modo demo no se pide automáticamente: la pantalla se muestra para medirla
        pedirAlAbrir={!IS_DEMO}
        onHuella={pedirHuella}
        onContrasena={handleIngresarConContrasena}
      />
    );
  }

  return (
    <div className="min-h-screen bg-fondo text-texto flex flex-col font-sans">
      {IS_DEMO && (
        <div className="bg-acento text-acento-fg text-sm font-bold text-center py-1.5 px-4">
          MODO DEMO — datos ficticios, sin conexión a base de datos
        </div>
      )}
      {syncErrors.length > 0 && (
        <div role="alert" data-testid="aviso-lectura" className="bg-error/10 border-b border-error/40 px-4 py-3">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0 text-base text-texto">
              <p className="font-bold">No se pudieron leer los datos de la nube. No se guardó ni se borró nada.</p>
              <ul className="mt-1 space-y-0.5">
                {syncErrors.map(e => (
                  <li key={e.tabla} className="break-words">
                    <span className="font-semibold">{e.tabla}:</span> {e.mensaje}
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              data-testid="reintentar-lectura"
              disabled={syncLoading}
              onClick={() => sincronizacion.recargar()}
              className="shrink-0 min-h-12 px-5 rounded-xl bg-acento hover:bg-acento-hover disabled:opacity-60 text-acento-fg font-bold text-base transition-colors cursor-pointer"
            >
              {syncLoading ? 'Reintentando…' : 'Reintentar'}
            </button>
          </div>
        </div>
      )}
      {/* Top Navigation Bar */}
      <header className="border-b border-borde bg-superficie/90 backdrop-blur sticky top-0 z-30 px-3 sm:px-4 lg:px-8 py-2.5 sm:py-3.5 shadow-lg shadow-black/20">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
          {/* Logo y nombre */}
          <div className="min-w-0 flex items-center gap-2.5">
            <AppLogo size={48} />
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-texto truncate">Doggy Care</h1>
          </div>

          {/* Header Action Buttons: Variables y Nueva Estadía */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* MODO PRIVACIDAD: global, disponible desde cualquier pantalla */}
            <button
              type="button"
              onClick={togglePrivacy}
              aria-label="Modo privacidad"
              aria-pressed={isPrivacyMode}
              data-testid="modo-privacidad"
              className={`min-w-12 min-h-12 px-3 text-sm font-medium rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-95 border ${
                isPrivacyMode
                  ? 'bg-info/15 border-info text-info'
                  : 'bg-superficie-alt hover:bg-realce text-texto border-borde-fuerte'
              }`}
              title={isPrivacyMode ? 'Desactivar modo privacidad' : 'Activar modo privacidad (oculta teléfonos, direcciones, familiares y dueños)'}
            >
              {isPrivacyMode ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4 text-texto-sec" aria-hidden="true" />}
              <span className="hidden sm:inline">{isPrivacyMode ? 'Privacidad: ON' : 'Privacidad'}</span>
            </button>

            {/* BOTÓN VARIABLES / AJUSTES */}
            <button
              onClick={() => setIsConfigOpen(true)}
              className="h-9 px-3 text-sm sm:text-sm font-medium rounded-xl bg-superficie-alt hover:bg-realce text-texto border border-borde-fuerte flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-95"
              title="Configurar cotizaciones y parámetros"
            >
              <Settings className="w-4 h-4 text-texto-sec" />
              <span className="inline">Variables</span>
            </button>

            {/* BOTÓN NUEVA ESTADÍA */}
            <button
              onClick={() => {
                setEditingStay(null);
                setPrefillDogName('');
                setPrefillDailyRate(undefined);
                setIsNewStayOpen(true);
              }}
              data-testid="abrir-nueva-estadia"
              className="hidden sm:flex h-9 px-3.5 text-sm sm:text-sm font-bold rounded-xl bg-acento hover:bg-acento-hover text-acento-fg items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Nueva Estadía</span>
            </button>
          </div>
        </div>
        <IndicadorGuardado
          estado={cambiosPendientes.estado}
          sinConexion={cambiosPendientes.sinConexion}
          todoGuardado={cambiosPendientes.todoGuardado}
          onReintentar={() => cambiosPendientes.reintentarAhora()}
          onReintentarUno={id => cambiosPendientes.reintentarAhora(id)}
          onDescartar={id => {
            colaCambios.descartar(id);
            // Lo descartado se deja de ver: se vuelve a leer la nube
            if (!IS_DEMO) void sincronizacion.recargar();
          }}
          onIniciarSesion={handleIngresarConContrasena}
          confirm={confirm}
        />
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto w-full flex-1 flex flex-col lg:flex-row pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">

        {/* Sidebar nav — visible from lg (1024px) */}
        <aside className="hidden lg:flex flex-col w-52 shrink-0 border-r border-borde p-4 gap-1 sticky top-0 h-[calc(100vh-4rem)] self-start">
          {([
            { key: 'hoy', label: 'Agenda', icon: Calendar },
            { key: 'perros', label: 'Historial', icon: BookOpen },
            { key: 'cobros', label: 'Cobros', icon: CreditCard },
            { key: 'ajustes', label: 'Ajustes', icon: Settings },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              data-testid={`tab-${key}`}
              aria-current={activeTab === key ? 'page' : undefined}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === key ? 'bg-acento text-acento-fg' : 'text-texto-sec hover:text-texto hover:bg-superficie-alt'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              {label}
            </button>
          ))}
        </aside>

        {/* Content area */}
        <div className="flex-1 min-w-0 p-3 sm:p-4 lg:p-8 space-y-4 sm:space-y-6">

        {/* View Switcher Tabs: Agenda, Historial, Cobros, Ajustes (hidden on lg+). Las claves internas siguen siendo
            'hoy' (la Agenda) y 'perros' (el Historial), igual que sus data-testid: sólo cambió el nombre visible. */}
        <div className="hidden md:flex lg:hidden items-center gap-1 bg-superficie p-1 rounded-xl border border-borde self-start">
          <button
            onClick={() => setActiveTab('hoy')}
            data-testid="tab-hoy"
            className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'hoy' ? 'bg-acento text-acento-fg shadow-sm font-bold' : 'text-texto-sec hover:text-texto'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Agenda</span>
          </button>
          <button
            onClick={() => setActiveTab('perros')}
            data-testid="tab-perros"
            className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'perros' ? 'bg-acento text-acento-fg shadow-sm font-bold' : 'text-texto-sec hover:text-texto'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Historial</span>
          </button>
          <button
            onClick={() => setActiveTab('cobros')}
            data-testid="tab-cobros"
            className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'cobros' ? 'bg-acento text-acento-fg shadow-sm font-bold' : 'text-texto-sec hover:text-texto'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Cobros</span>
          </button>
          <button
            onClick={() => setActiveTab('ajustes')}
            data-testid="tab-ajustes"
            className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'ajustes' ? 'bg-acento text-acento-fg shadow-sm font-bold' : 'text-texto-sec hover:text-texto'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Ajustes</span>
          </button>
        </div>

        {/* Tab 1: Agenda (clave interna 'hoy') — estadías en curso, en grupos de tarjetas en todos los tamaños */}
        {activeTab === 'hoy' && (
          <div className="max-w-3xl mx-auto w-full space-y-6">
          <h2 className="sr-only" data-testid="titulo-agenda">Agenda</h2>
          {calculatedStays.length === 0 && !firstLoadDone ? (
            <div role="status" data-testid="sincronizando" className="rounded-2xl border border-borde bg-superficie p-8 text-center text-texto-sec">
              Sincronizando…
            </div>
          ) : calculatedStays.length === 0 ? (
            <div className="rounded-2xl border border-borde bg-superficie p-8 text-center text-texto-sec">
              No hay estadías activas.{' '}
              <button onClick={() => { setEditingStay(null); setPrefillDogName(''); setPrefillDailyRate(undefined); setIsNewStayOpen(true); }} className="text-acento-texto underline cursor-pointer">Agregar una</button>
            </div>
          ) : (
            ([
              { key: 'overdue', label: 'Ya debían irse', color: 'text-error', borderColor: 'border-error', items: stayGroups.overdue },
              { key: 'leavingToday', label: 'Se van hoy', color: 'text-acento-texto', borderColor: 'border-acento', items: stayGroups.leavingToday },
              { key: 'arrivingToday', label: 'Llegan hoy', color: 'text-info', borderColor: 'border-info', items: stayGroups.arrivingToday },
              { key: 'inHouse', label: 'En casa', color: 'text-exito', borderColor: 'border-exito', items: stayGroups.inHouse },
              { key: 'upcoming', label: 'Próximas', color: 'text-texto-sec', borderColor: 'border-borde-fuerte', items: stayGroups.upcoming },
            ] as const).filter(g => g.items.length > 0).map(group => (
              <section key={group.key} aria-labelledby={`grupo-${group.key}`}>
                <h2 id={`grupo-${group.key}`} className={`text-lg font-bold mb-2 ${group.color}`}>
                  {group.label} <span className="text-texto-sec font-mono font-normal">({group.items.length})</span>
                </h2>
                <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
                  {group.items.map(({ stay, calc }) => {
                    const isExpanded = expandedHoyStayIds[stay.id] ?? false;
                    const stayAddress = resolveStayAddress(stay, directoryClients);
                    const wazeUrl = stayAddress ? buildWazeNavigationUrl(stayAddress, stay.isCapital) : '';
                    return (
                      <article
                        key={stay.id}
                        aria-labelledby={`perro-${stay.id}`}
                        className={`rounded-2xl border-2 ${group.borderColor} bg-superficie p-2.5 sm:p-3 md:p-4 flex flex-col min-w-0 transition-all shadow-sm`}
                      >
                        {/* Fila plegada (móvil): nombre + IR a Waze + lo que falta cobrar. El nombre abre y cierra la tarjeta; el
                            IR es un enlace aparte (un enlace no puede ir dentro de un botón), así se ve sin desplegar. */}
                        <div className="md:hidden flex items-center gap-1 rounded-xl hover:bg-superficie-alt/60 transition-colors">
                          <button
                            type="button"
                            onClick={() => toggleHoyStay(stay.id)}
                            aria-expanded={isExpanded}
                            aria-controls={`hoy-card-body-${stay.id}`}
                            className="min-w-0 flex-1 min-h-12 flex items-center gap-2 text-left p-1.5 cursor-pointer select-none rounded-xl"
                          >
                            <span className="font-bold text-base text-texto truncate">{stay.dogName}</span>
                            <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold bg-superficie-alt text-texto-sec border border-borde">
                              {stay.days} {stay.days === 1 ? 'día' : 'días'}
                            </span>
                          </button>
                          {stayAddress && !isPrivacyMode && (
                            <a
                              href={wazeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              data-testid={`waze-ir-fila-${stay.id}`}
                              aria-label={`Ir con Waze a ${stay.dogName}: ${stayAddress}`}
                              title={`Ir con Waze a ${stayAddress}`}
                              className="shrink-0 min-h-12 px-2.5 rounded-lg bg-info/15 hover:bg-info/25 text-info border border-info inline-flex items-center gap-1 text-xs font-bold transition-colors"
                            >
                              <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>IR</span>
                            </a>
                          )}
                          {/* Lo que falta cobrar y la flecha: también abren la tarjeta al tocarlos (el botón del nombre es el accesible) */}
                          <div
                            aria-hidden="true"
                            onClick={() => toggleHoyStay(stay.id)}
                            className="shrink-0 min-h-12 flex items-center gap-2 pl-1 pr-1.5 cursor-pointer select-none"
                          >
                            <div className="text-right">
                              <span className="text-[12px] uppercase font-bold tracking-wider text-texto-sec block leading-none mb-0.5">A cobrar</span>
                              <span className={`text-sm font-bold ${calc.totalAdeudado >= 1 ? 'text-error' : 'text-exito'}`}>
                                {calc.totalAdeudado >= 1 ? formatCurrencyARS(calc.totalAdeudado) : 'Cobrado ✓'}
                              </span>
                            </div>
                            <ChevronDown
                              className={`w-4 h-4 text-texto-sec transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                              aria-hidden="true"
                            />
                          </div>
                        </div>

                        {/* Contenido completo: visible al tocar en móvil, y siempre visible en escritorio */}
                        <div
                          id={`hoy-card-body-${stay.id}`}
                          className={`${isExpanded ? 'flex' : 'hidden'} md:!flex flex-col gap-3 pt-2 md:pt-0 px-1 md:px-0 pb-1 md:pb-0 border-t border-borde/50 md:border-t-0 mt-1 md:mt-0`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 id={`perro-${stay.id}`} className="text-lg font-bold text-texto leading-tight break-words">{stay.dogName}</h3>
                                {stayAddress && !isPrivacyMode && (
                                  <a
                                    href={wazeUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    data-testid={`waze-ir-hoy-${stay.id}`}
                                    aria-label={`Ir con Waze a ${stay.dogName}: ${stayAddress}`}
                                    title={`Ir con Waze a ${stayAddress}`}
                                    className="shrink-0 px-2 py-0.5 rounded-lg bg-info/15 hover:bg-info/25 text-info border border-info inline-flex items-center gap-1 text-xs font-bold transition-colors"
                                  >
                                    <Navigation className="w-3 h-3" aria-hidden="true" />
                                    <span>IR</span>
                                  </a>
                                )}
                              </div>
                              {stay.clientName && <p className="text-texto-sec break-words text-sm">{mask('dueno', stay.clientName)}</p>}
                              {stay.dogBreed && <p className="text-texto-sec break-words text-sm">{stay.dogBreed}</p>}
                              {stayAddress && !isPrivacyMode && (
                                <p className="text-texto-sec text-xs flex items-center gap-1 mt-0.5 truncate" title={stayAddress}>
                                  <MapPin className="w-3 h-3 shrink-0 text-info" aria-hidden="true" />
                                  <span className="truncate">{stayAddress}</span>
                                </p>
                              )}
                            </div>
                            <div className="text-right shrink-0 font-mono text-texto-sec text-sm">
                              <p className="whitespace-nowrap">{stay.fromDay}</p>
                              <p className="whitespace-nowrap">→ {stay.untilDay}</p>
                              <p className="text-acento-texto font-semibold font-sans">{stay.days} {stay.days === 1 ? 'día' : 'días'}</p>
                            </div>
                          </div>
                          <dl className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <dt className="text-texto-sec">Total</dt>
                              <dd className="font-bold text-texto">{formatCurrencyARS(calc.totalCharge)}</dd>
                            </div>
                            <BalanceField calc={calc} />
                          </dl>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => { setEditingStay(stay); setPrefillDogName(''); setPrefillDailyRate(undefined); setIsNewStayOpen(true); }}
                              className="min-h-12 font-semibold px-3 rounded-xl bg-superficie-alt hover:bg-realce text-texto border-2 border-borde-fuerte transition-colors cursor-pointer text-sm"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => requestFinishStay(stay)}
                              data-testid="finalizar-estadia"
                              aria-label={`Finalizar la estadía de ${stay.dogName} y pasarla a Cobros`}
                              className="min-h-12 font-semibold px-2 rounded-xl bg-exito/10 hover:bg-exito/20 text-exito border-2 border-exito transition-colors cursor-pointer text-sm"
                            >
                              Finalizar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteStay(stay.id)}
                              data-testid="borrar-estadia"
                              aria-label={`Borrar la estadía de ${stay.dogName} sin pasarla al Historial`}
                              className="min-h-12 font-semibold px-2 rounded-xl bg-error/10 hover:bg-error/20 text-error border-2 border-error transition-colors cursor-pointer text-sm inline-flex items-center justify-center gap-1"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                              Borrar
                            </button>
                          </div>
                          <p className="text-[12px] leading-snug text-texto-sec -mt-1">
                            Finalizar la pasa a Cobros. Borrar la quita sin dejar registro.
                          </p>
                          <details className="group/det border-t border-borde pt-2">
                            <summary className="min-h-12 flex items-center gap-2 font-semibold text-texto cursor-pointer list-none rounded-lg text-sm">
                              <ChevronDown className="w-4 h-4 transition-transform group-open/det:rotate-180" aria-hidden="true" />
                              Ver detalle
                            </summary>
                            <StayDetail stay={stay} calc={calc} config={config} />
                            <label className={`mt-3 min-h-12 flex items-center gap-3 select-none rounded-xl border-2 border-borde-fuerte px-3 ${calc.dzGenerated < 1 ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                              <input
                                type="checkbox"
                                checked={calc.dzGenerated >= 1 && calc.dzPending < 1}
                                disabled={calc.dzGenerated < 1}
                                onChange={() => handleToggleDzTransferred(stay.id)}
                                className="w-5 h-5 accent-info-solido cursor-pointer disabled:cursor-not-allowed"
                              />
                              <span className="text-texto text-sm">
                                {calc.dzGenerated < 1 ? 'Transferida (todavía no hay nada cobrado)' : 'Transferida'}
                              </span>
                            </label>
                          </details>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
          </div>
        )}

        {/* Tab 2: Historial (clave interna 'perros') — los perros y clientes, plegables; antes se llamaba Agenda/Directorio */}
        {activeTab === 'perros' && (
          <div className="space-y-4">
            <h2 className="sr-only" data-testid="titulo-historial">Historial</h2>
            {/* Search and Filters Bar */}
            <div className="bg-superficie/90 border border-borde rounded-2xl p-3.5 sm:p-4 shadow-lg flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-texto-sec absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  aria-label="Buscar en directorio"
                  value={directorySearch}
                  onChange={(e) => setDirectorySearch(e.target.value)}
                  placeholder="Buscar por perro, dueño o teléfono"
                  className="w-full pl-9 pr-4 py-2 bg-fondo border border-borde-fuerte rounded-xl text-sm sm:text-sm text-texto placeholder-texto-sec focus:border-acento/40 transition-colors"
                />
                {directorySearch && (
                  <button
                    type="button"
                    onClick={() => setDirectorySearch('')}
                    aria-label="Borrar búsqueda"
                    className="absolute right-0 top-1/2 -translate-y-1/2 min-w-12 min-h-12 flex items-center justify-center text-texto-sec hover:text-texto cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Filter Chips, Privacy Mode & New Client */}
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <span data-testid="contador-historial" className="px-3 py-1.5 rounded-xl text-sm font-semibold whitespace-nowrap bg-fondo text-texto-sec border border-borde-fuerte">
                  {unifiedDirectoryDogs.length === 1 ? '1 perro' : `${unifiedDirectoryDogs.length} perros`}
                </span>

                {/* + Nueva Ficha */}
                <button
                  type="button"
                  onClick={() => handleOpenNewClient()}
                  className="px-3 py-1.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all cursor-pointer bg-acento hover:bg-acento-hover text-acento-fg shadow-sm flex items-center gap-1 active:scale-95"
                  title="Crear nueva ficha canina y cliente en el directorio"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Nueva Ficha</span>
                </button>
              </div>
            </div>

            {/* Dogs Grid */}
            {unifiedDirectoryDogs.length === 0 ? (
              <div className="bg-superficie/60 border border-borde rounded-2xl p-12 text-center text-texto-sec">
                <Users className="w-8 h-8 text-texto-sec mx-auto mb-2" />
                <p className="text-sm font-medium">No se encontraron perros o clientes para "{directorySearch}".</p>
                <button
                  onClick={() => setDirectorySearch('')}
                  className="mt-3 text-sm text-acento-texto hover:underline cursor-pointer"
                >
                  Limpiar filtros
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
                {unifiedDirectoryDogs.map((item) => {
                  const fullName = item.ownerLastName ? `${item.ownerName} ${item.ownerLastName}`.trim() : item.ownerName;
                  const clientObj: ClientProfile = item.clientProfile || {
                    id: `client-${Date.now()}-${normalizeDogName(item.dogName)}`,
                    dogName: item.dogName,
                    breed: item.breed || '',
                    birthYear: item.birthYear,
                    ownerName: item.ownerName || '',
                    ownerLastName: item.ownerLastName || '',
                    relatives: item.relatives || '',
                    contact: item.contact || '',
                    address: item.address || ''
                  };

                  return (
                    <AgendaEntry
                      key={normalizeDogName(item.dogName)}
                      title={item.dogName}
                      isOpen={openDirectoryKey === normalizeDogName(item.dogName)}
                      onToggle={() => setOpenDirectoryKey(prev => (prev === normalizeDogName(item.dogName) ? null : normalizeDogName(item.dogName)))}
                      className="transition-colors bg-superficie/90 border-borde hover:border-borde-fuerte"
                    >
                      <div className="flex flex-col justify-between space-y-4">
                      <div>
                        {/* Header: Breed & Edit button (el nombre está en la fila plegable) */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleOpenEditClient(clientObj)}
                                data-testid="editar-ficha"
                                aria-label={`Editar ficha de ${item.dogName}`}
                                className="min-w-12 min-h-12 flex items-center justify-center p-1 rounded-lg bg-superficie-alt/80 hover:bg-realce text-texto-sec hover:text-acento-texto transition-colors cursor-pointer"
                                title="Editar ficha canina"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                              {item.breed && (
                                <span className="text-sm px-2 py-0.5 rounded-full bg-superficie-alt text-texto-sec border border-borde-fuerte font-sans">
                                  {item.breed}
                                </span>
                              )}
                              {item.birthYear && (
                                <span className="text-sm px-2 py-0.5 rounded-full bg-info/10 text-info border border-info/40 font-mono">
                                  Nac. {item.birthYear}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Visitas (sólo estadías ya finalizadas) */}
                          <span className="px-2 py-0.5 rounded-full bg-superficie-alt text-texto-sec font-medium text-sm border border-borde-fuerte shrink-0">
                            {item.historicalCount === 1 ? '1 visita' : `${item.historicalCount} visitas`}
                          </span>
                        </div>

                        {/* Los 4 campos requeridos siempre presentes: Dueño/a, Teléfono, Dirección, Familiares */}
                        <div className="mt-3 pt-3 border-t border-borde space-y-2 text-sm">
                          {/* 1. Dueño/a */}
                          <div className="flex items-center justify-between text-texto-sec">
                            <span className="text-texto-sec font-medium">Dueño/a:</span>
                            <span className={`font-semibold ${fullName ? 'text-texto' : 'text-texto-sec italic'}`}>
                              {mask('dueno', fullName) || 'Sin registrar'}
                            </span>
                          </div>

                          {/* 2. Teléfono */}
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                            <span className="text-texto-sec font-medium">Teléfono:</span>
                            {item.contact ? (
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <span className="font-mono text-texto-sec whitespace-nowrap">
                                  {mask('telefono', item.contact)}
                                </span>
                                <WhatsAppLink contact={item.contact} />
                              </div>
                            ) : (
                              <span className="text-texto-sec italic">Sin registrar</span>
                            )}
                          </div>

                          {/* 3. Dirección */}
                          <div className="flex items-center justify-between gap-2 text-texto-sec">
                            <span className="text-texto-sec font-medium shrink-0">Dirección:</span>
                            {item.address ? (
                              <div className="flex items-center gap-2 min-w-0 justify-end">
                                <span className="truncate max-w-[140px] sm:max-w-[180px] text-right" title={mask('direccion', item.address)}>
                                  {mask('direccion', item.address)}
                                </span>
                                {!isPrivacyMode && (
                                  <a
                                    href={buildWazeNavigationUrl(item.address)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    data-testid={`waze-ir-agenda-${normalizeDogName(item.dogName)}`}
                                    aria-label={`Ir con Waze a ${item.dogName}: ${item.address}`}
                                    className="text-sm px-2.5 py-0.5 rounded-lg bg-info/15 hover:bg-info/25 text-info border border-info inline-flex items-center gap-1 font-bold transition-colors shrink-0"
                                    title="Abrir ruta en Waze"
                                  >
                                    <Navigation className="w-3.5 h-3.5 text-info" aria-hidden="true" />
                                    <span>IR</span>
                                  </a>
                                )}
                              </div>
                            ) : (
                              <span className="text-texto-sec italic">Sin registrar</span>
                            )}
                          </div>

                          {/* 4. Familiares */}
                          <div className="flex items-center justify-between text-texto-sec">
                            <span className="text-texto-sec font-medium">Familiares:</span>
                            <span className="truncate max-w-[180px] sm:max-w-[210px] text-right" title={mask('familiares', item.relatives) || 'Sin registrar'}>
                              {mask('familiares', item.relatives) || <span className="text-texto-sec italic">Sin registrar</span>}
                            </span>
                          </div>
                        </div>

                        {/* Historial acumulado (sólo estadías finalizadas) */}
                        {item.historicalCount > 0 && (
                          <div className="mt-3 pt-3 border-t border-borde flex flex-wrap items-baseline justify-between gap-x-3 text-texto-sec">
                            <span className="whitespace-nowrap">Historial acumulado:</span>
                            <span className="text-texto font-medium font-mono">
                              <span className="whitespace-nowrap">{dias(item.historicalDays)}</span>{' '}
                              <span className="whitespace-nowrap">({item.historicalCount} {item.historicalCount === 1 ? 'visita' : 'visitas'})</span>
                            </span>
                          </div>
                        )}

                        {/* Sus estadías ya finalizadas, con el borrado real (pide confirmación y se puede deshacer 10 s) */}
                        {item.registros.length > 0 && (
                          <ul data-testid="estadias-pasadas" className="mt-2 divide-y divide-borde/60" aria-label={`Estadías de ${item.dogName}`}>
                            {[...item.registros]
                              .sort((x, y) => compararClaves(claveDeRegistro(x), claveDeRegistro(y), { conNombre: false }))
                              .map(r => (
                                <li key={r.id} className="flex items-center justify-between gap-2 py-0.5 text-sm">
                                  <span className="min-w-0 font-mono text-texto-sec">
                                    <span className="whitespace-nowrap">{r.fromDay} →</span> <span className="whitespace-nowrap">{r.untilDay}</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteCandidate(r)}
                                    data-testid="borrar-estadia-pasada"
                                    aria-label={`Borrar la estadía de ${item.dogName} del ${r.fromDay} al ${r.untilDay}`}
                                    className="shrink-0 min-h-11 px-3 inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold border border-error text-error bg-error/10 hover:bg-error/20 cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                                    Borrar
                                  </button>
                                </li>
                              ))}
                          </ul>
                        )}
                      </div>

                      {/* Card Actions */}
                      <div className="pt-3 border-t border-borde">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleOpenNewStayForDog(
                                item.dogName,
                                item.lastRate,
                                {
                                  clientName: item.ownerName,
                                  clientPhone: item.contact,
                                  dogBreed: item.breed,
                                  notes: item.relatives
                                },
                                clientObj?.id
                              )}
                              className="flex-1 py-2.5 px-3 text-sm font-bold rounded-xl bg-acento hover:bg-acento-hover text-acento-fg transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer active:scale-98"
                            >
                              <Plus className="w-4 h-4 stroke-[2.5]" />
                              <span>Nueva Estadía</span>
                            </button>
                            <button
                              onClick={() => handleOpenEditClient(clientObj)}
                                data-testid="editar-ficha"
                              className="py-2.5 px-3 text-sm font-semibold rounded-xl bg-superficie-alt hover:bg-realce text-texto hover:text-acento-texto border border-borde-fuerte transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                              title="Editar ficha del cliente"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-acento-texto" />
                              <span>Editar Ficha</span>
                            </button>
                          </div>
                      </div>
                      </div>
                    </AgendaEntry>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Cobros */}
        {activeTab === 'cobros' && (
          <div className="space-y-6">
            {/* Cobros Header (compacto: título y botones chicos) */}
            <div className="bg-superficie border border-borde rounded-xl p-3 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <h2 className="text-base font-bold text-texto tracking-tight flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-acento-texto" aria-hidden="true" />
                Cobros
              </h2>

              {/* Botones de acción del negocio */}
              <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                <button
                  onClick={handleExportCSV}
                  aria-label="Exportar CSV"
                  className="px-2.5 min-h-11 text-sm font-semibold rounded-lg bg-superficie-alt hover:bg-realce text-texto border border-borde-fuerte flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-95"
                  title="Descargar agenda activa en formato CSV"
                >
                  <Download className="w-3.5 h-3.5 text-texto-sec" aria-hidden="true" />
                  <span>CSV</span>
                </button>
                <button
                  onClick={() => {
                    const ok = downloadHistorialHtml(historyRecords);
                    if (ok) {
                      setToastMessage(`✓ Archivo HISTORIAL.html descargado con ${cantidad(historyRecords.length, 'registro', 'registros')}.`);
                    }
                  }}
                  aria-label="Descargar para Excel"
                  className="px-2.5 min-h-11 text-sm font-semibold rounded-lg bg-exito/15 hover:bg-exito/20 text-exito border border-exito flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-95"
                  title="Descargar archivo de respaldo HTML"
                >
                  <Download className="w-3.5 h-3.5 text-exito" aria-hidden="true" />
                  <span>Excel</span>
                </button>
                <button
                  onClick={() => setIsHistoryOpen(true)}
                  data-testid="abrir-historial"
                  className="px-2.5 min-h-11 text-sm font-semibold rounded-lg bg-info/15 hover:bg-info/20 text-info border border-info flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-95"
                  title={historyRecords.length === 1 ? 'Ver la estadía' : `Ver todas las ${estadias(historyRecords.length)}`}
                >
                  <History className="w-3.5 h-3.5 text-info" aria-hidden="true" />
                  <span>Registro de estadías ({historyRecords.length})</span>
                </button>
              </div>
            </div>

            {/* Estadías finalizadas esperando cobro y deducción; con las dos tildadas pasan solas al Historial */}
            <PorCobrar
              items={porCobrar}
              config={config}
              onCobrado={handleCobrado}
              onDeducida={handleDeducidaCobro}
              onVolver={handleVolverALaAgenda}
            />

            {/* Deducciones pendientes, perro por perro, y transferidas (src/components/DeduccionesPendientes.tsx) */}
            <DeduccionesPendientes
              resumen={resumenDeducciones}
              onMarcar={handleMarcarDeduccion}
              onDesmarcar={handleDesmarcarDeduccion}
              onMarcarTodas={handleMarkAllDzTransferred}
              // El demo simula la nube sin la columna para recordar los tildes en el dispositivo, pero no muestra el aviso:
              // sólo la app real avisa cuando de verdad falta la migración 005.
              tildeSoloLocal={tildeSoloLocal && !IS_DEMO}
            />

            {/* Cobros sólo cuenta estadías ya finalizadas (Historial). Las de la Agenda, actuales o futuras, no figuran
                acá: cuando se cobran, se finalizan, pasan al Historial y recién ahí entran en Cobros. */}

            {/* SECCIÓN 4: Resumen por Año (tabla chica; el año es el de la fecha de fin, también para los registros "D/M") */}
            {(() => {
              const fines = fechasDeFin(historyRecords);
              const byYear = historyRecords.reduce<Record<string, { stays: number; days: number; revenue: number; dz: number }>>((acc, r) => {
                const yr = fines.get(r.id)?.slice(0, 4) || 'Sin fecha';
                if (!acc[yr]) acc[yr] = { stays: 0, days: 0, revenue: 0, dz: 0 };
                acc[yr].stays++;
                acc[yr].days += r.days || 0;
                acc[yr].revenue += r.totalPagar || 0;
                acc[yr].dz += r.dz || 0;
                return acc;
              }, {});
              const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));
              if (years.length === 0) return null;
              return (
                <section aria-labelledby="resumen-anio" data-testid="resumen-anio" className="bg-superficie border border-borde rounded-xl p-3 shadow-md space-y-1.5">
                  <h3 id="resumen-anio" className="text-sm font-bold text-texto flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-acento-texto" aria-hidden="true" />
                    <span>Resumen por Año</span>
                  </h3>
                  <table className="w-full text-sm tabular-nums">
                    <thead>
                      <tr className="text-texto-sec text-[12px] uppercase tracking-wide">
                        <th scope="col" className="text-left font-semibold py-0.5">Año</th>
                        <th scope="col" className="text-right font-semibold py-0.5">Est.</th>
                        <th scope="col" className="text-right font-semibold py-0.5">Días</th>
                        <th scope="col" className="text-right font-semibold py-0.5">Facturado</th>
                        <th scope="col" className="text-right font-semibold py-0.5">Tasa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-borde/60">
                      {years.map(yr => (
                        <tr key={yr}>
                          <th scope="row" className="text-left font-bold text-texto py-1">{yr}</th>
                          <td className="text-right text-info py-1">{byYear[yr].stays}</td>
                          <td className="text-right text-acento-texto py-1">{byYear[yr].days.toLocaleString('es-AR')}</td>
                          <td className="text-right text-exito font-bold py-1 whitespace-nowrap">{formatCurrencyARS(byYear[yr].revenue)}</td>
                          <td className="text-right text-info py-1 whitespace-nowrap">{formatCurrencyARS(byYear[yr].dz)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              );
            })()}
          </div>
        )}

        {/* Tab 4: Ajustes */}
        {activeTab === 'ajustes' && (
          <div className="space-y-4 max-w-2xl mx-auto">
            {/* Theme toggle */}
            <div className="bg-superficie border border-borde rounded-2xl p-4 sm:p-6 shadow-xl">
              <h2 className="text-base font-bold text-texto mb-4 flex items-center gap-2">
                <Eye className="w-5 h-5 text-acento-texto" />
                <span>Apariencia</span>
              </h2>
              <fieldset className="space-y-3">
                <legend className="font-semibold text-texto mb-1">Tema de la aplicación</legend>
                <p className="text-texto-sec text-base">Claro por defecto. "Automático" sigue la configuración del teléfono o la computadora.</p>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tema de la aplicación">
                  {([
                    { value: 'light', label: 'Claro' },
                    { value: 'dark', label: 'Oscuro' },
                    { value: 'auto', label: 'Automático' },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={themeChoice === opt.value}
                      data-testid={`theme-${opt.value}`}
                      onClick={() => setThemeChoice(opt.value)}
                      className={`min-h-12 px-3 rounded-xl font-semibold border transition-colors cursor-pointer ${
                        themeChoice === opt.value
                          ? 'bg-acento text-acento-fg border-acento'
                          : 'bg-superficie-alt hover:bg-realce text-texto border-borde-fuerte'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <AjustesDeducciones config={config} onGuardar={handleGuardarDeducciones} />

            <BorradosRecientes borrados={borrados} onRestaurar={restaurarBorrado} />

            <SubidaTildes
              leerNube={leerNubeTildes}
              leerMarcas={leerMarcas}
              subir={subirYEsperar}
              borrarMarcas={borrarMarcas}
              confirm={confirm}
            />

            <div className="bg-superficie border border-borde rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
              <h2 className="text-base font-bold text-texto flex items-center gap-2">
                <Download className="w-5 h-5 text-acento-texto" aria-hidden="true" />
                <span>Respaldo</span>
              </h2>
              <p className="text-texto-sec text-base">
                Baja un archivo con todo lo guardado: agenda, registro de estadías, ajustes y directorio de clientes.
                Sólo lee los datos; no cambia nada.
              </p>
              <button
                type="button"
                data-testid="descargar-respaldo"
                onClick={handleDescargarRespaldo}
                disabled={respaldoEnCurso}
                className="w-full sm:w-auto min-h-12 px-5 rounded-xl bg-acento hover:bg-acento-hover disabled:opacity-60 text-acento-fg font-bold text-base inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Download className="w-5 h-5" aria-hidden="true" />
                <span>{respaldoEnCurso ? 'Preparando respaldo…' : 'Descargar respaldo'}</span>
              </button>
              {respaldoError && (
                <div role="alert" data-testid="aviso-respaldo" className="rounded-xl border border-error/50 bg-error/10 p-3 text-base text-texto break-words">
                  No se pudo armar el respaldo y no se descargó nada. {respaldoError}
                </div>
              )}
            </div>

            <div className="bg-superficie border border-borde rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
              <h2 className="text-base font-bold text-texto flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-acento-texto" aria-hidden="true" />
                <span>Seguridad</span>
              </h2>

              {/* Siempre visible: si no se puede usar, queda desactivado y dice por qué y qué hacer */}
              {(() => {
                const puedeCambiar = huellaActiva || huellaDisponible;
                const descripcion = huellaActiva
                  ? `Se pide la huella al abrir la app y al volver después de ${huella.MINUTOS_SEGUNDO_PLANO} minutos.`
                  : huellaEstado === null
                    ? 'Comprobando si este celular puede usar la huella…'
                    : huellaEstado.disponible
                      ? 'Apagado: se entra sólo con correo y contraseña.'
                      : huella.explicarNoDisponible(huellaEstado);
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p id="huella-switch-label" className="font-semibold text-texto text-base">Ingreso con huella</p>
                        <p id="huella-switch-desc" data-testid="huella-motivo" className="text-texto-sec text-base">
                          {descripcion}
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={huellaActiva}
                        aria-labelledby="huella-switch-label"
                        aria-describedby="huella-switch-desc"
                        data-testid="switch-huella"
                        disabled={!puedeCambiar || activandoHuella}
                        onClick={() => (huellaActiva ? handleDesactivarHuella() : handleActivarHuella())}
                        className={`relative shrink-0 w-20 min-h-12 rounded-full border-2 transition-colors ${
                          huellaActiva ? 'bg-acento border-acento' : 'bg-superficie-alt border-borde-fuerte'
                        } ${puedeCambiar ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`absolute top-1/2 -translate-y-1/2 w-8 h-8 rounded-full shadow transition-all ${
                            huellaActiva ? 'left-10 bg-acento-fg' : 'left-1 bg-texto-sec'
                          }`}
                        />
                      </button>
                    </div>
                    {huellaError && !ofrecerHuella && <AvisoErrorHuella texto={huellaError} />}
                  </div>
                );
              })()}

              <div className="border-t border-borde pt-4">
                <p className="text-texto-sec text-base mb-3">
                  Al cerrar sesión también se apaga el ingreso con huella.
                </p>
                <button
                  type="button"
                  data-testid="cerrar-sesion"
                  onClick={handleCerrarSesion}
                  className="w-full sm:w-auto min-h-12 px-5 rounded-xl font-semibold text-base border border-borde-fuerte bg-superficie-alt hover:bg-realce text-texto transition-colors cursor-pointer"
                >
                  Cerrar sesión
                </button>
              </div>
            </div>

          </div>
        )}

        </div>{/* end content area */}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav aria-label="Secciones" className="fixed bottom-0 left-0 right-0 z-40 bg-superficie/95 backdrop-blur-md border-t border-borde pb-[env(safe-area-inset-bottom,0px)] lg:hidden grid grid-cols-5 shadow-2xl shadow-black">
        <button
          onClick={() => setActiveTab('hoy')}
          data-testid="tab-hoy"
          className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-0.5 transition-colors cursor-pointer min-h-12 ${
            activeTab === 'hoy' ? 'text-acento-texto' : 'text-texto-sec'
          }`}
          aria-current={activeTab === 'hoy' ? 'page' : undefined}
        >
          <Calendar className="w-6 h-6" aria-hidden="true" />
          <span className="text-[13px] font-semibold leading-tight">Agenda</span>
        </button>

        <button
          onClick={() => setActiveTab('perros')}
          data-testid="tab-perros"
          className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-0.5 transition-colors cursor-pointer min-h-12 ${
            activeTab === 'perros' ? 'text-acento-texto' : 'text-texto-sec'
          }`}
          aria-current={activeTab === 'perros' ? 'page' : undefined}
        >
          <BookOpen className="w-6 h-6" aria-hidden="true" />
          <span className="text-[13px] font-semibold leading-tight">Historial</span>
        </button>

        {/* Central FAB Nueva Estadía */}
        <button
          onClick={() => {
            setEditingStay(null);
            setPrefillDogName('');
            setPrefillDailyRate(undefined);
            setIsNewStayOpen(true);
          }}
          className="flex flex-col items-center justify-center gap-0.5 py-1 px-0.5 transition-colors cursor-pointer min-h-12"
          aria-label="Nueva estadía"
          data-testid="abrir-nueva-estadia"
        >
          <span className="w-12 h-12 rounded-full bg-gradient-to-tr from-acento to-acento text-acento-fg flex items-center justify-center shadow-md">
            <Plus className="w-6 h-6 stroke-[3]" aria-hidden="true" />
          </span>
        </button>

        <button
          onClick={() => setActiveTab('cobros')}
          data-testid="tab-cobros"
          className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-0.5 transition-colors cursor-pointer min-h-12 ${
            activeTab === 'cobros' ? 'text-acento-texto' : 'text-texto-sec'
          }`}
          aria-current={activeTab === 'cobros' ? 'page' : undefined}
        >
          <LayoutDashboard className="w-6 h-6" aria-hidden="true" />
          <span className="text-[13px] font-semibold leading-tight">Cobros</span>
        </button>

        <button
          onClick={() => setActiveTab('ajustes')}
          data-testid="tab-ajustes"
          className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-0.5 transition-colors cursor-pointer min-h-12 ${
            activeTab === 'ajustes' ? 'text-acento-texto' : 'text-texto-sec'
          }`}
          aria-current={activeTab === 'ajustes' ? 'page' : undefined}
        >
          <Settings className="w-6 h-6" aria-hidden="true" />
          <span className="text-[13px] font-semibold leading-tight">Ajustes</span>
        </button>
      </nav>

      {/* Modal: New / Edit Stay */}
      {isNewStayOpen && (
        <StayModal
          stay={editingStay}
          initialDogName={prefillDogName}
          initialDailyRate={prefillDailyRate}
          initialDogId={prefillDogId}
          initialProfile={prefillProfile}
          existingStays={stays}
          historyRecords={historyRecords}
          config={config}
          directoryClients={directoryClients}
          onClose={() => {
            setIsNewStayOpen(false);
            setEditingStay(null);
            setPrefillDogName('');
            setPrefillDailyRate(undefined);
            setPrefillDogId(undefined);
            setPrefillProfile(null);
          }}
          onSave={handleSaveStay}
        />
      )}

      {/* Modal: Registro de estadías (antes "Historial & Directorio"): los registros archivados, el directorio y la agenda activa */}
      {isHistoryOpen && (
        <HistoryModal
          stays={stays}
          config={config}
          historyRecords={historyRecords}
          directoryClients={directoryClients}
          syncing={!firstLoadDone}
          onToggleHistoryDzTransferred={handleToggleHistoryDzTransferred}
          onRequestDelete={setDeleteCandidate}
          onClose={() => setIsHistoryOpen(false)}
          onSelectDogForNewStay={handleOpenNewStayForDog}
        />
      )}

      {/* Floating Toast Notification */}
      {toast && !pendingDelete && (
        <TopLayerPortal>
        <div
          role={toast.kind === 'error' ? 'alert' : 'status'}
          data-testid={toast.kind === 'error' ? 'toast-error' : 'toast-ok'}
          className={`fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:bottom-6 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-md z-50 flex items-center justify-between gap-2.5 pl-4 pr-1 py-1 rounded-xl bg-superficie border-2 text-texto shadow-2xl shadow-black/20 ${
            toast.kind === 'error' ? 'border-error' : 'border-exito'
          }`}
        >
          <div className="flex items-start gap-2 min-w-0 py-2">
            {toast.kind === 'error'
              ? <AlertCircle className="w-5 h-5 text-error shrink-0 mt-0.5" aria-hidden="true" />
              : <CheckCircle2 className="w-5 h-5 text-exito shrink-0 mt-0.5" aria-hidden="true" />}
            <span className="break-words">{toast.message}</span>
          </div>
          <button
            onClick={() => setToast(null)}
            aria-label="Cerrar aviso"
            className="min-w-12 min-h-12 shrink-0 flex items-center justify-center rounded-lg text-texto-sec hover:text-texto hover:bg-superficie-alt cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        </TopLayerPortal>
      )}

      {/* Aviso de borrado con Deshacer (10 s) */}
      {pendingDelete && (
        <TopLayerPortal>
        <div
          role="status"
          data-testid="undo-delete-toast"
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:bottom-6 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-md z-50 flex items-center justify-between gap-3 pl-4 pr-1 py-1 rounded-xl bg-superficie border-2 border-borde-fuerte text-texto shadow-2xl shadow-black/20"
        >
          <span className="py-2">
            <strong>Estadía borrada</strong>
            <span className="text-texto-sec"> · {pendingDelete.record.dogName} · {undoSecondsLeft} s</span>
          </span>
          <button
            onClick={undoDeleteHistoryRecord}
            data-testid="undo-delete"
            className="min-h-12 px-4 shrink-0 rounded-lg font-bold bg-acento hover:bg-acento-hover text-acento-fg cursor-pointer"
          >
            Deshacer
          </button>
        </div>
        </TopLayerPortal>
      )}

      {/* Confirmación de borrado de una estadía terminada */}
      {deleteCandidate && (
        <ConfirmDialog
          title="Borrar estadía"
          message={
            <p>
              ¿Borrar la estadía de <strong className="text-texto">{deleteCandidate.dogName}</strong> ({deleteCandidate.fromDay} al {deleteCandidate.untilDay})?
              Se borra del Historial y de la nube. Podés deshacerlo durante 10 segundos; después queda una copia en este teléfono
              (Ajustes &gt; Borrados recientes) para restaurarla.
            </p>
          }
          confirmLabel="Borrar"
          tone="danger"
          testId="dialog-borrar"
          confirmTestId="confirm-borrar"
          onConfirm={() => confirmDeleteHistoryRecord(deleteCandidate)}
          onCancel={() => setDeleteCandidate(null)}
        />
      )}

      {/* Modal: Config & Exchange Rates */}
      {isConfigOpen && (
        <ConfigModal
          config={config}
          onClose={() => setIsConfigOpen(false)}
          onSave={(cambios) => {
            // Las variables no incluyen las tasas por año ni la fecha de inicio: se conservan
            const newConfig = completarConfig({ ...config, ...cambios });
            setConfig(newConfig);
            setIsConfigOpen(false);
            guardarEnNube([{ tipo: 'upsert', tabla: 'app_config', clave: '1', datos: newConfig }]);
          }}
        />
      )}

      {confirmDialog}

      {/* Modal: Editar / Crear Ficha Canina del Directorio */}
      {isClientModalOpen && editingClient && (
        <EditClientModal
          client={editingClient}
          onClose={() => {
            setIsClientModalOpen(false);
            setEditingClient(null);
          }}
          onSave={handleSaveClient}
          onDelete={handleDeleteClient}
        />
      )}

      {ofrecerHuella && (
        // Cerrar el cuadro (Esc o tocar afuera) no cuenta como "Ahora no": se vuelve a ofrecer la próxima vez
        <DialogModal onClose={() => { setOfrecerHuella(false); setHuellaError(null); }}>
          <div
            role="document"
            data-testid="dialog-activar-huella"
            className="bg-superficie border border-borde-fuerte rounded-2xl w-full max-w-sm p-6 sm:p-8 shadow-2xl space-y-5"
          >
            <div className="w-14 h-14 rounded-full bg-acento/10 border border-acento/40 flex items-center justify-center">
              <Fingerprint className="w-8 h-8 text-acento-texto" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-texto">¿Activar ingreso con huella?</h2>
              <p className="text-texto-sec text-base">
                La próxima vez vas a poder entrar con tu huella, sin escribir la contraseña. La contraseña sigue sirviendo si la huella falla.
              </p>
            </div>
            {huellaError && <AvisoErrorHuella texto={huellaError} />}
            <div className="flex flex-col gap-3">
              <button
                type="button"
                data-testid="activar-huella-si"
                onClick={handleActivarHuella}
                disabled={activandoHuella}
                className="w-full min-h-12 px-4 rounded-xl bg-acento hover:bg-acento-hover disabled:opacity-60 text-acento-fg font-bold text-base transition-colors cursor-pointer"
              >
                {activandoHuella ? 'Esperando la huella…' : huellaError ? 'Probar de nuevo' : 'Sí, activar'}
              </button>
              <button
                type="button"
                data-testid="activar-huella-no"
                onClick={handleRechazarHuella}
                className="w-full min-h-12 px-4 rounded-xl border border-borde-fuerte bg-superficie-alt hover:bg-realce text-texto font-semibold text-base transition-colors cursor-pointer"
              >
                Ahora no
              </button>
            </div>
          </div>
        </DialogModal>
      )}
    </div>
  );
}
