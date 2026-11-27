import { useState, useMemo } from 'react';
import {
  Plus,
  Calendar,
  Download,
  MapPin,
  CheckCircle2,
  History,
  Search,
  ChevronDown,
  ChevronUp,
  Table,
  Users,
  Phone
} from 'lucide-react';
import { AppConfig, Stay } from '../types';
import { clientsDirectory, ClientProfile } from '../data/clientsDirectory';
import { HistoricalStayRecord, normalizeDogName } from '../data/historialData';
import { DialogModal } from './DialogModal';
import { usePrivacy } from './PrivacyProvider';
import { DeleteStayButton } from './DeleteStayButton';
import { ultimaEstadiaDe } from '../utils/ultimaEstadia';
import {
  claveDeRegistro,
  claveSinRegistro,
  compararClaves,
  limpiarNombre,
  normalizarFecha,
  type ClaveOrden
} from '../utils/agendaOrden';
import { WhatsAppLink } from './WhatsAppLink';
import { downloadHistorialHtml } from '../utils/exportHistorialHtml';
import { cantidad, dias, estadias } from '../utils/texto';
import { calculateStay, formatCurrencyARS, formatPercent } from '../utils/calculations';

// Modal Component: Complete History of all dogs / stays & Client Directory
export function HistoryModal({
  stays,
  config,
  historyRecords,
  directoryClients,
  syncing = false,
  onToggleHistoryDzTransferred,
  onRequestDelete,
  onClose,
  onSelectDogForNewStay
}: {
  stays: Stay[];
  config: AppConfig;
  historyRecords: HistoricalStayRecord[];
  directoryClients?: ClientProfile[];
  /** true mientras no terminó la primera lectura de la cuenta */
  syncing?: boolean;
  onToggleHistoryDzTransferred?: (recordId: string) => void;
  onRequestDelete: (record: HistoricalStayRecord) => void;
  onClose: () => void;
  onSelectDogForNewStay: (
    dogName: string, 
    lastRate?: number, 
    extra?: { clientName?: string; clientPhone?: string; dogBreed?: string; notes?: string }
  ) => void;
}) {
  const { mask, isPrivacyMode } = usePrivacy();
  const [activeSubTab, setActiveSubTab] = useState<'historical' | 'directory' | 'agenda'>('historical');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedDogs, setExpandedDogs] = useState<{ [key: string]: boolean }>({});
  const [viewMode, setViewMode] = useState<'grouped' | 'timeline'>('grouped');
  const [exportSuccess, setExportSuccess] = useState(false);

  const clientsList: ClientProfile[] = (directoryClients && directoryClients.length > 0) ? directoryClients : clientsDirectory;

  const toggleDogExpand = (dogName: string) => {
    setExpandedDogs(prev => ({
      ...prev,
      [dogName]: !prev[dogName]
    }));
  };

  // 1. Grouped Historical Stays
  const historicalDogsList = useMemo(() => {
    const groups: { 
      [key: string]: { 
        dogName: string; 
        stays: HistoricalStayRecord[]; 
        totalDays: number; 
        totalRevenue: number; 
        totalIfm: number; 
        latestStay: HistoricalStayRecord;
      } 
    } = {};
    
    // Del más recientemente finalizado o archivado al más antiguo (src/utils/agendaOrden.ts)
    const clave = new Map(historyRecords.map(r => [r, claveDeRegistro(r)] as const));
    const recientesPrimero = [...historyRecords].sort((a, b) => compararClaves(clave.get(a)!, clave.get(b)!));

    recientesPrimero.forEach(item => {
      const norm = normalizeDogName(item.dogName);
      if (!groups[norm]) {
        groups[norm] = {
          dogName: item.dogName,
          stays: [],
          totalDays: 0,
          totalRevenue: 0,
          totalIfm: 0,
          latestStay: item
        };
      }
      groups[norm].stays.push(item);
      groups[norm].totalDays += item.days;
      groups[norm].totalRevenue += item.totalPagar;
      groups[norm].totalIfm += item.totalIfm;
    });

    // Como se recorrió del más reciente al más antiguo, la primera estadía de cada grupo es la última
    return Object.values(groups)
      .map(g => ({ ...g, latestStay: g.stays[0] }))
      .sort((a, b) => compararClaves({ ...clave.get(a.latestStay)!, nombre: limpiarNombre(a.dogName) }, { ...clave.get(b.latestStay)!, nombre: limpiarNombre(b.dogName) }));
  }, [historyRecords]);

  // Filter historical dogs by search
  const filteredHistoricalDogs = useMemo(() => {
    if (!searchTerm.trim()) return historicalDogsList;
    const term = normalizeDogName(searchTerm);
    return historicalDogsList.filter(g => {
      const normDog = normalizeDogName(g.dogName);
      const client = clientsList.find(c => normalizeDogName(c.dogName) === normDog);
      return (
        normDog.includes(term) ||
        (client?.breed && normalizeDogName(client.breed).includes(term)) ||
        (!isPrivacyMode && client?.ownerName && normalizeDogName(client.ownerName).includes(term)) ||
        g.stays.some(s => s.fromDay.includes(term) || s.untilDay.includes(term))
      );
    });
  }, [historicalDogsList, searchTerm, isPrivacyMode]);

  // Filter all raw historical stays for timeline view
  const filteredHistoricalStays = useMemo(() => {
    const clave = new Map(historyRecords.map(r => [r, claveDeRegistro(r)] as const));
    const reversed = [...historyRecords].sort((a, b) => compararClaves(clave.get(a)!, clave.get(b)!));
    if (!searchTerm.trim()) return reversed;
    const term = normalizeDogName(searchTerm);
    return reversed.filter(s => 
      normalizeDogName(s.dogName).includes(term) ||
      normalizeDogName(s.rawDogName).includes(term) ||
      s.fromDay.includes(term) ||
      s.untilDay.includes(term) ||
      String(s.totalPagar).includes(term)
    );
  }, [historyRecords, searchTerm]);

  // Total stats from historyRecords
  const historicalStats = useMemo(() => {
    const totalRevenue = historyRecords.reduce((acc, s) => acc + s.totalPagar, 0);
    const totalIfm = historyRecords.reduce((acc, s) => acc + s.totalIfm, 0);
    const totalDays = historyRecords.reduce((acc, s) => acc + s.days, 0);
    return { totalRevenue, totalIfm, totalDays, totalStays: historyRecords.length, uniqueDogs: historicalDogsList.length };
  }, [historyRecords, historicalDogsList]);

  // Clave de orden de cada perro: la de su registro más reciente (hora de archivado, si no ID/secuencia, si no fin)
  const clavePorPerro = useMemo(() => {
    const m = new Map<string, ClaveOrden>();
    for (const r of historyRecords) {
      const k = normalizeDogName(r.dogName);
      const c = claveDeRegistro(r);
      const previa = m.get(k);
      if (!previa || compararClaves(c, previa, { conNombre: false }) < 0) m.set(k, c);
    }
    return m;
  }, [historyRecords]);

  // 2. Directorio de clientes: filtro por búsqueda y orden del más reciente al más antiguo
  const filteredClients = useMemo(() => {
    const term = searchTerm.toLowerCase();
    const lista = !searchTerm.trim()
      ? clientsList
      : clientsList.filter(c =>
          c.dogName.toLowerCase().includes(term) ||
          (c.breed && c.breed.toLowerCase().includes(term)) ||
          // Con el modo privacidad activo se busca sólo por lo que se ve: nombre del perro y raza
          (!isPrivacyMode && (
            (c.ownerName && c.ownerName.toLowerCase().includes(term)) ||
            (c.contact && c.contact.includes(term)) ||
            (c.address && c.address.toLowerCase().includes(term)) ||
            (c.relatives && c.relatives.toLowerCase().includes(term))
          ))
        );
    const clave = (c: ClientProfile): ClaveOrden => ({
      ...(clavePorPerro.get(normalizeDogName(c.dogName)) ??
        claveSinRegistro(normalizarFecha(c.historicalStay?.departureDate || c.historicalStay?.arrivalDate), c.dogName)),
      nombre: limpiarNombre(c.dogName)
    });
    return [...lista].sort((a, b) => compararClaves(clave(a), clave(b)));
  }, [searchTerm, clientsList, clavePorPerro, isPrivacyMode]);

  // 3. Active Agenda Stays
  const dogGroups = useMemo(() => {
    const groups: { [key: string]: { stays: Stay[]; dogName: string } } = {};
    stays.forEach(stay => {
      const cleanName = stay.dogName.trim();
      const key = cleanName.toLowerCase();
      if (!groups[key]) groups[key] = { stays: [], dogName: cleanName };
      groups[key].stays.push(stay);
    });
    Object.values(groups).forEach(g => {
      g.stays.sort((a, b) => b.untilDay.localeCompare(a.untilDay));
    });
    // Agenda activa: la estadía que termina más tarde primero; empate o sin fecha, por nombre
    const clave = (g: { stays: Stay[]; dogName: string }) =>
      claveSinRegistro(normalizarFecha(g.stays[0]?.untilDay || g.stays[0]?.fromDay), g.dogName);
    return Object.values(groups).sort((a, b) => compararClaves(clave(a), clave(b)));
  }, [stays]);

  const filteredAgendaGroups = useMemo(() => {
    if (!searchTerm.trim()) return dogGroups;
    const term = searchTerm.toLowerCase();
    return dogGroups.filter(g =>
      g.dogName.toLowerCase().includes(term) ||
      g.stays.some(s => (!isPrivacyMode && s.clientName?.toLowerCase().includes(term)) || s.dogBreed?.toLowerCase().includes(term))
    );
  }, [dogGroups, searchTerm, isPrivacyMode]);

  return (
    <DialogModal onClose={onClose}>
      <div className="bg-superficie border border-borde rounded-2xl w-full max-w-6xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="p-3 sm:p-5 border-b border-borde flex items-center justify-between gap-2 bg-fondo/80 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="hidden sm:flex w-10 h-10 rounded-xl bg-info/15 text-info items-center justify-center border border-info/40 shrink-0">
              <History className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-texto flex items-center gap-1.5 flex-wrap">
                <span>Registro de estadías</span>
                <span className="text-sm px-1.5 py-0.5 rounded-full bg-exito/10 text-exito font-mono border border-exito/40 whitespace-nowrap">
                  {estadias(historicalStats.totalStays)}
                </span>
              </h2>
              <p className="text-sm text-texto-sec truncate hidden sm:block">
                REGISTRO ({cantidad(historicalStats.uniqueDogs, 'perro', 'perros')}, {historicalStats.totalDays}d) + Directorio
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={() => {
                const ok = downloadHistorialHtml(historyRecords);
                if (ok) {
                  setExportSuccess(true);
                  setTimeout(() => setExportSuccess(false), 4500);
                }
              }}
              type="button"
              aria-label="Guardar cambios en HTML"
              className="min-w-12 min-h-12 flex items-center justify-center gap-1.5 px-3 rounded-xl bg-exito-solido hover:bg-exito-solido-hover text-sobre-solido font-semibold shadow-md transition-all cursor-pointer active:scale-95 whitespace-nowrap"
              title="Descargar archivo HISTORIAL.html completo actualizado"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Guardar Cambios en HTML</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar registro de estadías"
              className="min-w-12 min-h-12 flex items-center justify-center text-texto-sec hover:text-texto text-base sm:text-lg cursor-pointer rounded-lg bg-superficie-alt hover:bg-realce"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Success Banner on Export */}
        {exportSuccess && (
          <div className="bg-exito/15 border-b border-exito/40 px-4 py-2.5 flex items-center justify-between text-sm text-exito shrink-0">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-exito shrink-0" />
              <span>
                <strong>¡HISTORIAL.html guardado exitosamente!</strong> Se descargó el archivo con {cantidad(historyRecords.length, 'registro', 'registros')} y cálculos actualizados.
              </span>
            </div>
            <button type="button" onClick={() => setExportSuccess(false)} aria-label="Cerrar aviso" className="min-w-12 min-h-12 flex items-center justify-center text-exito hover:text-texto cursor-pointer">✕</button>
          </div>
        )}

        {/* Global Stats Strip for Historical Tab */}
        {activeSubTab === 'historical' && (
          <div className="hidden sm:grid sm:grid-cols-4 gap-2 p-3 bg-fondo border-b border-borde font-mono text-sm shrink-0">
            <div className="bg-superficie/60 p-2 rounded-lg border border-borde">
              <span className="text-sm text-texto-sec block uppercase">Estadías</span>
              <strong className="text-info text-sm sm:text-sm">{historicalStats.totalStays}</strong>
              <span className="text-sm text-texto-sec block font-sans">{cantidad(historicalStats.uniqueDogs, 'perro', 'perros')}</span>
            </div>
            <div className="bg-superficie/60 p-2 rounded-lg border border-borde">
              <span className="text-sm text-texto-sec block uppercase">Días Acumulados</span>
              <strong className="text-acento-texto text-sm sm:text-sm">{historicalStats.totalDays}</strong>
              <span className="text-sm text-texto-sec block font-sans">días hosp.</span>
            </div>
            <div className="bg-superficie/60 p-2 rounded-lg border border-borde">
              <span className="text-sm text-texto-sec block uppercase">Total Facturado</span>
              <strong className="text-exito text-sm sm:text-sm truncate block">{formatCurrencyARS(historicalStats.totalRevenue)}</strong>
              <span className="text-sm text-texto-sec block font-sans">en el registro</span>
            </div>
            <div className="bg-superficie/60 p-2 rounded-lg border border-borde">
              <span className="text-sm text-texto-sec block uppercase">IFM Histórico</span>
              <strong className={`text-sm sm:text-sm truncate block ${historicalStats.totalIfm >= 0 ? "text-exito" : "text-error"}`}>
                {historicalStats.totalIfm >= 0 ? '+' : ''}{formatCurrencyARS(historicalStats.totalIfm)}
              </strong>
              <span className="text-sm text-texto-sec block font-sans">registro</span>
            </div>
          </div>
        )}

        {/* Sub-tabs & Search Bar */}
        <div className="p-2.5 sm:p-3.5 border-b border-borde bg-superficie/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
          <div className="grid grid-cols-3 sm:flex items-center gap-1 bg-fondo p-1 rounded-xl border border-borde w-full sm:w-auto">
            <button
              onClick={() => setActiveSubTab('historical')}
              className={`min-w-0 px-1 sm:px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer flex flex-col sm:flex-row items-center justify-center sm:gap-1 text-center leading-tight ${
                activeSubTab === 'historical'
                  ? 'bg-info-solido text-sobre-solido shadow-sm'
                  : 'text-texto-sec hover:text-texto'
              }`}
            >
              <History className="hidden sm:block w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Registro Excel</span>
              <span className="sm:hidden">Registro</span>
              <span className="text-sm">({historicalStats.totalStays})</span>
            </button>
            <button
              onClick={() => setActiveSubTab('directory')}
              className={`min-w-0 px-1 sm:px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer flex flex-col sm:flex-row items-center justify-center sm:gap-1 text-center leading-tight ${
                activeSubTab === 'directory'
                  ? 'bg-acento text-acento-fg shadow-sm'
                  : 'text-texto-sec hover:text-texto'
              }`}
            >
              <Users className="hidden sm:block w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Directorio Clientes</span>
              <span className="sm:hidden">Directorio</span>
              <span className="text-sm">({clientsList.length})</span>
            </button>
            <button
              onClick={() => setActiveSubTab('agenda')}
              className={`min-w-0 px-1 sm:px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer flex flex-col sm:flex-row items-center justify-center sm:gap-1 text-center leading-tight ${
                activeSubTab === 'agenda'
                  ? 'bg-superficie-alt text-texto shadow-sm border border-borde-fuerte'
                  : 'text-texto-sec hover:text-texto'
              }`}
            >
              <Calendar className="hidden sm:block w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Agenda Activa</span>
              <span className="sm:hidden">Agenda</span>
              <span className="text-sm">({dogGroups.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:flex-1 sm:w-auto sm:max-w-md">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-texto-sec absolute left-3 top-2.5" />
              <input
                type="text"
                aria-label="Buscar en el registro"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar por perro, raza, dueño..."
                className="w-full bg-fondo border border-borde-fuerte rounded-xl pl-9 pr-3 py-2 text-sm text-texto focus:border-info font-sans"
              />
            </div>

            {activeSubTab === 'historical' && (
              <button
                type="button"
                onClick={() => setViewMode(v => v === 'grouped' ? 'timeline' : 'grouped')}
                className="px-2.5 py-2 text-sm font-medium rounded-xl bg-fondo border border-borde-fuerte text-texto-sec hover:text-texto flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                title={viewMode === 'grouped' ? 'Ver como lista cronológica' : 'Ver agrupado por perro'}
              >
                <Table className="w-3.5 h-3.5 text-info" />
                <span className="hidden sm:inline">{viewMode === 'grouped' ? 'Vista Lista' : 'Por Perro'}</span>
                <span className="sm:hidden">{viewMode === 'grouped' ? 'Lista' : 'Perros'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Modal Content based on active subtab */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">
          
          {/* Subtab 1: HISTORICAL STAYS FROM EXCEL (278 RECORDS) */}
          {activeSubTab === 'historical' && (
            viewMode === 'grouped' ? (
              filteredHistoricalDogs.length === 0 ? (
                <div className="text-center py-12 text-texto-sec text-sm">
                  No se encontraron perros en el registro para "{searchTerm}".
                </div>
              ) : (
                filteredHistoricalDogs.map(group => {
                  const isExpanded = expandedDogs[group.dogName] ?? false;
                  const clientMatch = clientsList.find(c => normalizeDogName(c.dogName) === normalizeDogName(group.dogName));
                  const averageRate = group.totalDays > 0 ? Math.round(group.totalRevenue / group.totalDays) : 0;

                  return (
                    <div key={group.dogName} className="bg-fondo/70 border border-borde rounded-2xl shadow-lg transition-all [&>*:first-child]:rounded-t-2xl">
                      
                      {/* Dog Summary Header */}
                      <div className="p-3 sm:p-4 bg-superficie/90 border-b border-borde flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => toggleDogExpand(group.dogName)}
                            data-testid="expandir-perro"
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? 'Ocultar' : 'Ver'} estadías de ${group.dogName}`}
                            className="min-w-12 min-h-12 shrink-0 rounded-xl bg-superficie-alt hover:bg-realce border border-borde-fuerte flex items-center justify-center cursor-pointer transition-colors"
                          >
                            {isExpanded ? <ChevronUp className="w-5 h-5 text-texto" aria-hidden="true" /> : <ChevronDown className="w-5 h-5 text-texto" aria-hidden="true" />}
                          </button>
                          <div className="min-w-0">
                            <h3 className="font-bold text-texto text-base flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="break-words">{group.dogName}</span>
                              {clientMatch?.breed && (
                                <span className="px-2 rounded-full bg-superficie-alt text-texto-sec border border-borde-fuerte font-sans font-normal whitespace-nowrap">
                                  {clientMatch.breed}
                                </span>
                              )}
                              <span className="font-mono font-medium px-2 rounded-full bg-info/10 text-info border border-info/40 whitespace-nowrap">
                                {group.stays.length} {group.stays.length === 1 ? 'estadía' : 'estadías'}
                              </span>
                            </h3>
                            <p className="text-texto-sec mt-0.5">
                              {clientMatch?.ownerName && (
                                <span className="text-acento-texto font-medium mr-2">Dueño: {mask('dueno', clientMatch.ownerName)}</span>
                              )}
                              <span className="font-mono whitespace-nowrap">{dias(group.totalDays)}</span>
                              {' · '}
                              <span className="font-mono whitespace-nowrap">{formatCurrencyARS(group.totalRevenue)}</span>
                              <span className="hidden sm:inline font-mono"> · Prom: {formatCurrencyARS(averageRate)}/d</span>
                              {group.totalIfm !== 0 && (
                                <span className={`ml-2 font-semibold font-mono whitespace-nowrap ${group.totalIfm >= 0 ? 'text-exito' : 'text-error'}`}>
                                  IFM: {group.totalIfm >= 0 ? '+' : ''}{formatCurrencyARS(group.totalIfm)}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Visibles sin expandir la tarjeta, también en celular */}
                        <div className="flex gap-2 w-full sm:w-auto" data-testid="acciones-perro">
                          <button
                            type="button"
                            data-testid="cargar-perro"
                            onClick={() => onSelectDogForNewStay(
                              group.dogName,
                              group.latestStay.dailyRate,
                              clientMatch ? {
                                clientName: clientMatch.ownerName,
                                clientPhone: clientMatch.contact,
                                dogBreed: clientMatch.breed,
                                notes: clientMatch.address ? `Dirección: ${clientMatch.address}` : undefined
                              } : undefined
                            )}
                            className="flex-1 sm:flex-none min-h-12 px-3 inline-flex items-center justify-center rounded-xl font-semibold border border-acento bg-acento/10 text-acento-texto hover:bg-acento/20 cursor-pointer whitespace-nowrap"
                            title={`Cargar estadía para ${group.dogName} con la última tarifa (${formatCurrencyARS(group.latestStay.dailyRate)})`}
                          >
                            Cargar
                          </button>
                          <button
                            type="button"
                            data-testid="nueva-estadia-perro"
                            onClick={() => onSelectDogForNewStay(
                              group.dogName,
                              undefined,
                              clientMatch ? {
                                clientName: clientMatch.ownerName,
                                clientPhone: clientMatch.contact,
                                dogBreed: clientMatch.breed,
                                notes: clientMatch.address ? `Dirección: ${clientMatch.address}` : undefined
                              } : undefined
                            )}
                            className="flex-1 sm:flex-none min-h-12 px-3 font-semibold rounded-xl bg-acento hover:bg-acento-hover text-acento-fg inline-flex items-center justify-center gap-1 cursor-pointer transition-all shadow-sm whitespace-nowrap"
                            title={`Nueva estadía para ${group.dogName}, sin repetir la tarifa`}
                          >
                            <Plus className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
                            <span>Nueva estadía</span>
                          </button>
                        </div>
                      </div>

                      {/* Stays Timeline for this Dog (Expanded) */}
                      {isExpanded && (
                        <ul className="divide-y divide-borde bg-fondo/40">
                          {group.stays.slice().reverse().map((stay, idx) => (
                            <li key={stay.id} className="p-3 sm:px-5 space-y-2">
                              {/* En celular angosto los botones van en su propia fila para no apretar las fechas */}
                              <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
                                <div className="min-w-0 font-mono">
                                  <p className="font-semibold text-texto">
                                    <span className="text-texto-sec font-sans mr-1">#{group.stays.length - idx}</span>
                                    <span className="whitespace-nowrap">{stay.fromDay}</span> ➔ <span className="whitespace-nowrap">{stay.untilDay}</span>
                                  </p>
                                  <p className="text-acento-texto font-sans">{stay.days} {stay.days === 1 ? 'día' : 'días'} · <span className="text-exito font-mono">{formatCurrencyARS(stay.totalPagar)}</span></p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => onSelectDogForNewStay(
                                      group.dogName,
                                      stay.dailyRate,
                                      clientMatch ? {
                                        clientName: clientMatch.ownerName,
                                        clientPhone: clientMatch.contact,
                                        dogBreed: clientMatch.breed,
                                        notes: clientMatch.address ? `Dirección: ${clientMatch.address}` : undefined
                                      } : undefined
                                    )}
                                    className="inline-flex min-h-12 px-3 items-center rounded-xl font-semibold border border-acento bg-acento/10 text-acento-texto hover:bg-acento/20 cursor-pointer"
                                    title={`Cargar estadía para ${group.dogName} con tarifa ${formatCurrencyARS(stay.dailyRate)}`}
                                  >
                                    Cargar
                                  </button>
                                  <DeleteStayButton record={stay} onRequestDelete={onRequestDelete} />
                                </div>
                              </div>

                              <label className={`flex items-center gap-2 min-h-12 px-3 rounded-xl border cursor-pointer select-none ${
                                stay.dzTransferred ? 'bg-info/10 border-info text-info' : 'bg-superficie border-borde-fuerte text-texto'
                              }`}>
                                <input
                                  type="checkbox"
                                  checked={!!stay.dzTransferred}
                                  onChange={() => onToggleHistoryDzTransferred?.(stay.id)}
                                  className="w-5 h-5 accent-info-solido cursor-pointer shrink-0"
                                />
                                <span className="font-semibold">Tasa ({formatPercent(stay.dzRate ?? config.dzRate)}): <span className="font-mono whitespace-nowrap">{formatCurrencyARS(stay.dz)}</span></span>
                                <span className="ml-auto font-bold whitespace-nowrap">{stay.dzTransferred ? '✓ Transferida' : 'Pendiente'}</span>
                              </label>

                              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 font-mono">
                                <div>
                                  <dt className="text-texto-sec font-sans">Cobrado / día</dt>
                                  <dd className="text-texto font-bold">{formatCurrencyARS(stay.dailyRate)}</dd>
                                </div>
                                <div>
                                  <dt className="text-texto-sec font-sans">Cálculo puro</dt>
                                  <dd className="text-texto-sec">{formatCurrencyARS(stay.pureRate)}</dd>
                                </div>
                                <div>
                                  <dt className="text-info font-sans font-semibold">IFM total</dt>
                                  <dd className={`font-bold ${stay.totalIfm >= 0 ? 'text-exito' : 'text-error'}`}>
                                    {stay.totalIfm >= 0 ? '+' : ''}{formatCurrencyARS(stay.totalIfm)}
                                    <span className="block font-normal text-texto-sec">{stay.ifmDaily >= 0 ? '+' : ''}{formatCurrencyARS(stay.ifmDaily)}/d</span>
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-texto-sec font-sans">Fila Excel</dt>
                                  <dd className="text-texto-sec">#{stay.rowIndex}</dd>
                                </div>
                              </dl>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })
              )
            ) : (
              /* Timeline View (All 278 Stays) */
              filteredHistoricalStays.length === 0 ? (
                <div className="text-center py-12 text-texto-sec text-sm">
                  No se encontraron estadías para "{searchTerm}".
                </div>
              ) : (
                <div className="bg-fondo border border-borde rounded-2xl overflow-hidden shadow-xl">
                  <div className="overflow-x-auto max-h-[60vh]">
                    <table className="w-full text-left font-mono text-sm border-collapse">
                      <thead className="bg-superficie/90 text-sm text-texto-sec uppercase tracking-wider sticky top-0 border-b border-borde z-10">
                        <tr>
                          <th className="p-2.5">Fila</th>
                          <th className="p-2.5">Perro</th>
                          <th className="p-2.5">Fechas</th>
                          <th className="p-2.5 text-center">Días</th>
                          <th className="p-2.5 text-right">Cobrado/Día</th>
                          <th className="p-2.5 text-right">Puro (REAL)</th>
                          <th className="p-2.5 text-right">IFM Total</th>
                          <th className="p-2.5 text-right">Total Pagar</th>
                          <th className="p-2.5 text-right">Tasa ({formatPercent(config.dzRate)})</th>
                          <th className="p-2.5 text-center">Acción</th>
                          <th className="p-2.5 text-center relative"><span className="sr-only">Borrar</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-borde">
                        {filteredHistoricalStays.map(s => {
                          const client = clientsList.find(c => normalizeDogName(c.dogName) === normalizeDogName(s.dogName));
                          return (
                            <tr key={s.id} className="hover:bg-superficie/50 transition-colors">
                              <td className="p-2.5 text-texto-sec text-sm">#{s.rowIndex}</td>
                              <td className="p-2.5 font-bold text-texto flex items-center gap-1.5 font-sans">
                                <span>{s.dogName}</span>
                                {client?.breed && (
                                  <span className="text-sm px-1.5 py-0.2 rounded bg-superficie-alt text-texto-sec">
                                    {client.breed}
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 text-texto-sec">{s.fromDay} ➔ {s.untilDay}</td>
                              <td className="p-2.5 text-center text-acento-texto font-bold">{s.days}d</td>
                              <td className="p-2.5 text-right text-texto">{formatCurrencyARS(s.dailyRate)}</td>
                              <td className="p-2.5 text-right text-texto-sec">{formatCurrencyARS(s.pureRate)}</td>
                              <td className={`p-2.5 text-right font-bold ${s.totalIfm >= 0 ? 'text-exito' : 'text-error'}`}>
                                {s.totalIfm >= 0 ? '+' : ''}{formatCurrencyARS(s.totalIfm)}
                              </td>
                              <td className="p-2.5 text-right font-bold text-exito">{formatCurrencyARS(s.totalPagar)}</td>
                              <td className="p-2.5 text-right">
                                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={!!s.dzTransferred}
                                    onChange={() => onToggleHistoryDzTransferred?.(s.id)}
                                    className="w-3.5 h-3.5 accent-info-solido rounded cursor-pointer"
                                  />
                                  <span className={`font-mono ${s.dzTransferred ? 'text-info font-bold line-through' : 'text-texto-sec'}`}>
                                    {formatCurrencyARS(s.dz)}
                                  </span>
                                  <span className={`text-sm px-1 py-0.2 rounded font-bold ${s.dzTransferred ? 'bg-info/15 text-info border border-info/40' : 'bg-superficie-alt text-texto-sec'}`}>
                                    {s.dzTransferred ? '✓' : 'Pend'}
                                  </span>
                                </label>
                              </td>
                              <td className="p-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => onSelectDogForNewStay(
                                    s.dogName,
                                    s.dailyRate,
                                    client ? {
                                      clientName: client.ownerName,
                                      clientPhone: client.contact,
                                      dogBreed: client.breed,
                                      notes: client.address ? `Dirección: ${client.address}` : undefined
                                    } : undefined
                                  )}
                                  className="px-2 py-1 rounded bg-acento hover:bg-acento-hover text-acento-fg font-bold text-sm cursor-pointer shadow-sm"
                                  title={`Cargar estadía para ${s.dogName} con tarifa ${formatCurrencyARS(s.dailyRate)}`}
                                >
                                  Cargar
                                </button>
                              </td>
                              <td className="p-2.5 text-center">
                                <DeleteStayButton record={s} onRequestDelete={onRequestDelete} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )
          )}

          {/* Subtab 2: Client & Dog Directory (31 Clients) */}
          {activeSubTab === 'directory' && (
            filteredClients.length === 0 ? (
              <div className="text-center py-12 text-texto-sec text-sm">
                No se encontraron huéspedes ni clientes para "{searchTerm}".
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredClients.map(client => {
                  const hasActiveStay = stays.some(s => normalizeDogName(s.dogName) === normalizeDogName(client.dogName));
                  const histStays = historyRecords.filter(r => normalizeDogName(r.dogName) === normalizeDogName(client.dogName));
                  const latestHist = ultimaEstadiaDe(historyRecords, client.dogName)?.registro;
                  const fullName = client.ownerLastName ? `${client.ownerName} ${client.ownerLastName}`.trim() : client.ownerName;

                  return (
                    <div 
                      key={client.id}
                      className="group bg-gradient-to-b from-superficie/90 via-superficie/60 to-fondo border border-borde hover:border-acento/40 rounded-2xl p-4.5 flex flex-col justify-between gap-3.5 shadow-lg transition-all duration-300"
                    >
                      <div>
                        {/* Top header of dog card */}
                        <div className="flex items-start justify-between gap-3 mb-2.5">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-extrabold text-texto text-base tracking-tight">
                                {client.dogName}
                              </h3>
                              {client.breed && (
                                <span className="text-sm font-medium px-2 py-0.5 rounded-full bg-superficie-alt text-acento-texto border border-acento/40">
                                  {client.breed}
                                </span>
                              )}
                              {client.birthYear && (
                                <span className="text-sm font-mono px-2 py-0.5 rounded-full bg-info/10 text-info border border-info/40">
                                  Nac. {client.birthYear}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-texto-sec font-medium flex items-center gap-1.5 mt-0.5">
                              <span className="text-texto-sec">Dueño/a:</span>
                              <strong className="text-acento-texto font-semibold">{mask('dueno', fullName) || 'No especificado'}</strong>
                            </p>
                          </div>

                          {/* Status badges */}
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {hasActiveStay && (
                              <span className="text-sm font-semibold px-2 py-0.5 rounded-full bg-exito/10 text-exito border border-exito/40 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-exito-solido animate-pulse"></span>
                                <span>En Agenda</span>
                              </span>
                            )}
                            {histStays.length > 0 && (
                              <span className="text-sm font-semibold px-2 py-0.5 rounded-full bg-info/10 text-info border border-info/40 font-mono">
                                {histStays.length} {histStays.length === 1 ? 'estadía' : 'estadías'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Details: Address, Contact, Relatives */}
                        <div className="space-y-2 text-sm text-texto-sec font-sans pt-3 border-t border-borde">
                          {client.address ? (
                            <div className="flex items-center gap-2 text-texto-sec bg-fondo/40 px-2.5 py-1.5 rounded-xl border border-borde">
                              <MapPin className="w-3.5 h-3.5 text-error shrink-0" />
                              <span className="truncate">{mask('direccion', client.address)}</span>
                            </div>
                          ) : (
                            <div className="text-sm text-texto-sec italic px-1">
                              Sin dirección registrada
                            </div>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-2">
                            {client.contact ? (
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5 bg-fondo/60 px-2.5 py-1 rounded-lg border border-borde text-texto-sec font-mono text-sm">
                                  <Phone className="w-3 h-3 text-exito" />
                                  <span>{mask('telefono', client.contact)}</span>
                                </div>
                                <WhatsAppLink contact={client.contact} />
                              </div>
                            ) : (
                              <span className="text-sm text-texto-sec">Sin teléfono</span>
                            )}

                            {client.relatives && (
                              <div className="flex items-center gap-1.5 text-texto-sec text-sm bg-info/10 px-2 py-1 rounded-lg border border-info/40">
                                <Users className="w-3 h-3 text-info shrink-0" />
                                <span className="truncate">Familiar: <strong className="text-texto font-normal">{mask('familiares', client.relatives)}</strong></span>
                              </div>
                            )}
                          </div>

                          {/* Historical stay snippet if from Dogs table */}
                          {client.historicalStay && (
                            <div className="bg-fondo/80 p-2.5 rounded-xl border border-info/40 text-sm font-mono grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-texto-sec mt-2">
                              <div>
                                <span className="text-sm text-texto-sec block uppercase">Fechas Base</span>
                                <strong className="text-texto">{client.historicalStay.arrivalDate} ➔ {client.historicalStay.departureDate}</strong>
                              </div>
                              <div>
                                <span className="text-sm text-texto-sec block uppercase">Sub-diario</span>
                                <strong className="text-exito">$ {client.historicalStay.subDiario}</strong>
                              </div>
                              <div>
                                <span className="text-sm text-texto-sec block uppercase">Real x Día</span>
                                <strong className="text-info">$ {client.historicalStay.realXD}</strong>
                              </div>
                              <div className="text-right">
                                <span className="text-sm text-texto-sec block uppercase">Total D+T</span>
                                <strong className="text-acento-texto">{client.historicalStay.finalDT}</strong>
                              </div>
                            </div>
                          )}

                          {/* Latest stay in 278 records (if different or complementary) */}
                          {latestHist && !client.historicalStay && (
                            <div className="bg-fondo/60 p-2 rounded-xl border border-borde text-sm font-mono flex items-center justify-between text-texto-sec">
                              <span>Último cobrado: <strong className="text-texto">{formatCurrencyARS(latestHist.dailyRate)}/d</strong></span>
                              <span className="text-texto-sec">({latestHist.fromDay} ➔ {latestHist.untilDay}, {latestHist.days}d)</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Card Action Button */}
                      <div className="pt-2.5 border-t border-borde flex items-center justify-end">
                        <button
                          onClick={() => onSelectDogForNewStay(
                            client.dogName,
                            latestHist ? latestHist.dailyRate : undefined,
                            {
                              clientName: fullName,
                              clientPhone: client.contact,
                              dogBreed: client.breed,
                              notes: client.address ? `Dirección: ${client.address}` + (client.relatives ? ` | Familiar: ${client.relatives}` : '') : (client.relatives ? `Familiar: ${client.relatives}` : undefined)
                            }
                          )}
                          className="w-full sm:w-auto px-3.5 py-1.5 text-sm font-bold rounded-xl bg-gradient-to-r from-acento to-acento hover:from-acento-hover hover:to-acento-hover text-acento-fg flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-md active:scale-95"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Cargar Nueva Estadía</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* Subtab 3: Agenda Activa */}
          {activeSubTab === 'agenda' && (
            filteredAgendaGroups.length === 0 ? (
              <div role="status" className="text-center py-12 text-texto-sec text-sm">
                {syncing
                  ? 'Sincronizando…'
                  : searchTerm
                    ? `No hay estadías activas en agenda para "${searchTerm}".`
                    : 'No hay estadías activas en agenda.'}
              </div>
            ) : (
              filteredAgendaGroups.map(group => {
                const totalDays = group.stays.reduce((acc, s) => acc + (s.days || 0), 0);
                const totalCharged = group.stays.reduce((acc, s) => acc + ((s.days || 0) * (s.dailyRate || 0)), 0);
                const lastStay = group.stays[0];
                const clientMatch = clientsList.find(c => normalizeDogName(c.dogName) === normalizeDogName(group.dogName));

                return (
                  <div key={group.dogName} className="bg-fondo/70 border border-borde rounded-2xl overflow-hidden shadow-lg">
                    <div className="p-4 bg-superficie/90 border-b border-borde flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-texto text-sm sm:text-base flex items-center gap-2">
                          <span>{group.dogName}</span>
                          {clientMatch?.breed && (
                            <span className="text-sm px-2 py-0.5 rounded-full bg-superficie-alt text-texto-sec border border-borde-fuerte font-sans">
                              {clientMatch.breed}
                            </span>
                          )}
                          <span className="text-sm font-mono font-medium px-2 py-0.5 rounded-full bg-info/10 text-info border border-info/40">
                            {group.stays.length} {group.stays.length === 1 ? 'estadía activa' : 'estadías activas'}
                          </span>
                        </h3>
                        <p className="text-sm text-texto-sec font-mono mt-0.5">
                          {(clientMatch?.ownerName || group.stays.find(s => s.clientName)?.clientName) && (
                            <span className="text-acento-texto font-sans mr-2 font-medium">
                              Dueño: {mask('dueno', clientMatch?.ownerName || group.stays.find(s => s.clientName)?.clientName)} |
                            </span>
                          )}
                          Total: {dias(totalDays)} | {formatCurrencyARS(totalCharged)} cobrados
                        </p>
                      </div>

                      <button
                        onClick={() => onSelectDogForNewStay(
                          group.dogName, 
                          lastStay.dailyRate, 
                          clientMatch ? {
                            clientName: clientMatch.ownerName,
                            clientPhone: clientMatch.contact,
                            dogBreed: clientMatch.breed,
                            notes: clientMatch.address ? `Dirección: ${clientMatch.address}` : undefined
                          } : undefined
                        )}
                        className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-acento hover:bg-acento-hover text-acento-fg flex items-center gap-1 cursor-pointer transition-all shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>Nueva Estadía</span>
                      </button>
                    </div>

                    <div className="divide-y divide-borde font-mono text-sm">
                      {group.stays.map((stay, idx) => {
                        const calc = calculateStay(stay, config);
                        return (
                          <div key={stay.id} className="p-3.5 sm:px-5 flex flex-wrap items-center justify-between gap-3 hover:bg-superficie/40 transition-colors">
                            <div className="flex items-center gap-3">
                              <span className="text-sm bg-superficie-alt px-2 py-0.5 rounded text-texto-sec">
                                #{group.stays.length - idx}
                              </span>
                              <div>
                                <div className="font-semibold text-texto flex items-center gap-2">
                                  <Calendar className="w-3.5 h-3.5 text-texto-sec" />
                                  <span>{stay.fromDay} ➔ {stay.untilDay}</span>
                                  <span className="text-acento-texto text-sm">({stay.days}d)</span>
                                </div>
                                <span className="text-sm text-texto-sec font-sans">
                                  {stay.isCapital ? `Capital Federal (${config.defaultCapitalKm} km)` : `Provincia (${calc.kmApplied} km)`}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-4 sm:gap-6">
                              <div>
                                <span className="text-sm text-texto-sec block">Cobrado / día</span>
                                <strong className="text-texto text-sm">{formatCurrencyARS(stay.dailyRate)}</strong>
                              </div>

                              <div>
                                <span className="text-sm text-texto-sec block">Cálculo Puro</span>
                                <span className="text-texto-sec text-sm">{formatCurrencyARS(calc.pureDailyRate)}</span>
                              </div>

                              <div className="text-right">
                                <span className="text-sm text-info block font-semibold">IFM Total</span>
                                <strong className="text-info text-sm font-bold">+{formatCurrencyARS(Math.round(calc.totalIfm))}</strong>
                                <span className="text-sm text-texto-sec block">+{formatCurrencyARS(calc.ifmDaily)}/d</span>
                              </div>

                              <div className="text-right pl-2 border-l border-borde">
                                <span className="text-sm text-texto-sec block">Total Bruto</span>
                                <strong className="text-exito text-sm">{formatCurrencyARS(calc.totalGross)}</strong>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )
          )}

        </div>

        {/* Footer */}
        <div className="p-3.5 bg-fondo/80 border-t border-borde flex items-center justify-between">
          <span className="text-sm text-texto-sec font-mono">
            {cantidad(historicalStats.totalStays, 'estadía registrada', 'estadías registradas')} · {cantidad(historicalStats.uniqueDogs, 'perro', 'perros')} en el registro · {clientsList.length} en directorio
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-superficie-alt hover:bg-realce text-texto-sec cursor-pointer"
          >
            Cerrar
          </button>
        </div>

      </div>
    </DialogModal>
  );
}
