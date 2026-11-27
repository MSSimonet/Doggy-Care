import React, { useState, useMemo } from 'react';
import { Calendar, RotateCcw, History, ArrowRight, Zap, Percent } from 'lucide-react';
import { AppConfig, Stay } from '../types';
import { clientsDirectory, ClientProfile } from '../data/clientsDirectory';
import { HistoricalStayRecord, normalizeDogName } from '../data/historialData';
import { DialogModal } from './DialogModal';
import { usePrivacy } from './PrivacyProvider';
import { ultimaEstadiaDe } from '../utils/ultimaEstadia';
import { cantidad, dias } from '../utils/texto';
import { resolveStayAddress } from '../utils/waze';
import {
  calculateStay,
  calculatePureDailyRate,
  calcDays,
  formatCurrencyARS,
  formatCurrencyUSD,
  PURE_DAILY_BASE,
  pureTransportShare
} from '../utils/calculations';

// Modal Component for Adding/Editing Stays (Without "huéspedes frecuentes")
export function StayModal({
  stay,
  initialDogName,
  initialDailyRate,
  initialDogId,
  initialProfile,
  existingStays,
  historyRecords = [],
  config,
  directoryClients,
  onClose,
  onSave
}: {
  stay: Stay | null;
  initialDogName?: string;
  initialDailyRate?: number;
  initialDogId?: string;
  initialProfile?: { clientName?: string; clientPhone?: string; dogBreed?: string; notes?: string } | null;
  existingStays: Stay[];
  /** Registros archivados reales (los mismos del Registro de estadías): para mostrar lo que se cobró la última vez */
  historyRecords?: HistoricalStayRecord[];
  config: AppConfig;
  directoryClients?: ClientProfile[];
  onClose: () => void;
  onSave: (stay: Stay, direccion?: string) => void;
}) {
  const [dogName, setDogName] = useState(stay?.dogName || initialDogName || '');
  const [clientName, setClientName] = useState(stay?.clientName || initialProfile?.clientName || '');
  const [clientPhone, setClientPhone] = useState(stay?.clientPhone || initialProfile?.clientPhone || '');
  const [dogBreed, setDogBreed] = useState(stay?.dogBreed || initialProfile?.dogBreed || '');
  // Dirección: la de la ficha del perro (o la de las notas de la estadía). null = no se tocó el campo.
  const direccionGuardada = resolveStayAddress(
    { ...(stay ?? {}), dogName, dogId: stay?.dogId ?? initialDogId, notes: stay?.notes ?? '' } as Stay,
    directoryClients ?? []
  ) ?? '';
  const [direccionEditada, setDireccionEditada] = useState<string | null>(null);
  const direccion = direccionEditada ?? direccionGuardada;
  const localToday = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();
  const localPlus5 = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();
  const [fromDay, setFromDay] = useState(stay?.fromDay || localToday);
  const [untilDay, setUntilDay] = useState(stay?.untilDay || localPlus5);
  const [days, setDays] = useState(stay?.days || 6);
  const [dailyRate, setDailyRate] = useState(stay?.dailyRate || initialDailyRate || 21000);
  const [isCapital, setIsCapital] = useState(stay ? stay.isCapital : true);
  const [customKm, setCustomKm] = useState(stay?.customKm ?? 90);
  const [expenses, setExpenses] = useState(stay?.additionalFeatures?.expenses || 0);
  const [bath, setBath] = useState(stay?.additionalFeatures?.bath || 0);
  const [moneyAdvance, setMoneyAdvance] = useState(stay?.additionalFeatures?.moneyAdvance || 0);
  const [tip, setTip] = useState(stay?.additionalFeatures?.tip || 0);
  const [amountPaid, setAmountPaid] = useState(stay?.amountPaid || 0);
  const [dzTransferred] = useState(stay?.dzTransferred || false);
  const [notes, setNotes] = useState(stay?.notes || initialProfile?.notes || '');
  const [showDirectoryDropdown, setShowDirectoryDropdown] = useState(false);

  const activeClientsList = (directoryClients && directoryClients.length > 0) ? directoryClients : clientsDirectory;

  const { mask, isPrivacyMode } = usePrivacy();

  // Matching directory clients as user types dog name
  const matchingDirectoryClients = useMemo(() => {
    if (!dogName.trim()) return [];
    const term = normalizeDogName(dogName.trim());
    
    // First from activeClientsList (has owner, phone, address)
    const directoryMatches = activeClientsList.filter(c => 
      normalizeDogName(c.dogName).includes(term) ||
      (c.breed && normalizeDogName(c.breed).includes(term)) ||
      // Con el modo privacidad activo se busca sólo por lo que se ve (el dueño aparece enmascarado)
      (!isPrivacyMode && c.ownerName && normalizeDogName(c.ownerName).includes(term))
    );

    // Perros del historial real que no están en el directorio (una sola entrada por nombre normalizado)
    const vistos = new Set<string>();
    const allUniqueDogs = historyRecords.map(r => r.dogName).filter(n => {
      const norm = normalizeDogName(n);
      if (!norm || vistos.has(norm)) return false;
      vistos.add(norm);
      return true;
    });
    const extraHistDogs = allUniqueDogs
      .filter(dName => {
        const norm = normalizeDogName(dName);
        return norm.includes(term) && !directoryMatches.some(m => normalizeDogName(m.dogName) === norm);
      })
      .map(dName => {
        const hist = ultimaEstadiaDe(historyRecords, dName)?.registro;
        return {
          id: `hist-dog-${dName}`,
          dogName: dName,
          ownerName: 'Historial Excel',
          breed: 'Huésped Histórico',
          contact: '',
          address: '',
          relatives: '',
          historicalStay: hist ? {
            arrivalDate: hist.fromDay,
            departureDate: hist.untilDay,
            days: hist.days,
            subDiario: String(hist.dailyRate),
            realXD: String(hist.pureRate),
            finalDT: `$ ${hist.totalPagar.toLocaleString('es-AR')}`
          } : undefined
        } as ClientProfile;
      });

    return [...directoryMatches, ...extraHistDogs].slice(0, 6);
  }, [dogName, isPrivacyMode, activeClientsList, historyRecords]);

  const handleSelectDirectoryClient = (client: ClientProfile) => {
    setDogName(client.dogName);
    const fullName = client.ownerLastName ? `${client.ownerName} ${client.ownerLastName}`.trim() : client.ownerName;
    if (fullName && fullName !== 'Historial Excel') setClientName(fullName);
    if (client.contact) setClientPhone(client.contact);
    if (client.breed && client.breed !== 'Huésped Histórico') setDogBreed(client.breed);
    
    const parts: string[] = [];
    if (client.address) parts.push(`Dirección: ${client.address}`);
    if (client.relatives) parts.push(`Familiar: ${client.relatives}`);
    if (parts.length > 0) {
      setNotes(parts.join(' | '));
    }
    
    // La tarifa no se cambia sola: la última que se cobró se muestra debajo del nombre, con "Usar esta tarifa"
    setShowDirectoryDropdown(false);
  };

  const [dateError, setDateError] = useState('');
  const [dogNameError, setDogNameError] = useState('');

  // Calculate dates difference automatically: arrival + departure both included → days = diff + 1
  const handleDateChange = (newFrom: string, newUntil: string) => {
    setFromDay(newFrom);
    setUntilDay(newUntil);
    if (!newFrom || !newUntil) return;
    const diffDays = calcDays(newFrom, newUntil);
    if (diffDays === null) {
      setDateError('La fecha "Hasta" no puede ser anterior a "Desde"');
      return;
    }
    setDateError('');
    setDays(diffDays);
  };

  // Find previous stay history for the current dog name
  const dogHistory = useMemo(() => {
    const cleanCurrentName = dogName.trim();
    if (!cleanCurrentName) return null;

    // 1. Filter active stays with same dog name, excluding the one being edited
    const activeMatches = existingStays.filter(s => 
      s.id !== stay?.id && normalizeDogName(s.dogName) === normalizeDogName(cleanCurrentName)
    );

    if (activeMatches.length > 0) {
      const sorted = [...activeMatches].sort((a, b) => b.untilDay.localeCompare(a.untilDay));
      const lastStay = sorted[0];
      const lastStayCalc = calculateStay(lastStay, config);

      return {
        type: 'stay' as const,
        lastStay,
        lastStayCalc,
        count: activeMatches.length
      };
    }

    // 2. La última estadía archivada se muestra aparte (Última vez), con los registros reales

    // 3. Check client in activeClientsList
    const clientMatch = activeClientsList.find(c => 
      normalizeDogName(c.dogName) === normalizeDogName(cleanCurrentName) && c.historicalStay
    );
    if (clientMatch?.historicalStay) {
      return {
        type: 'directoryHistory' as const,
        historicalStay: clientMatch.historicalStay,
        ownerName: clientMatch.ownerName,
        breed: clientMatch.breed
      };
    }

    return null;
  }, [dogName, existingStays, stay, config]);

  // Última estadía archivada del perro (mismo criterio de orden que las listas; Tobias = Tobías)
  const ultima = useMemo(() => ultimaEstadiaDe(historyRecords, dogName), [historyRecords, dogName]);

  // Pure calculated daily rate
  const pureRate = useMemo(() => {
    return calculatePureDailyRate(days, config);
  }, [days, config]);

  // IFM = Precio Asignado - Cálculo Puro
  const currentIfmDaily = Number(dailyRate || 0) - pureRate;
  const currentTotalIfm = currentIfmDaily * (Number(days) || 1);

  // Live preview calculation
  const previewStay: Stay = {
    id: stay?.id || 'temp',
    dogName: dogName || 'Perro',
    clientName,
    clientPhone,
    dogBreed,
    fromDay,
    untilDay,
    days: Number(days) || 1,
    dailyRate: Number(dailyRate) || 0,
    isCapital,
    customKm,
    additionalFeatures: {
      expenses: Number(expenses) || 0,
      bath: Number(bath) || 0,
      moneyAdvance: Number(moneyAdvance) || 0,
      tip: Number(tip) || 0
    },
    amountPaid: Number(amountPaid) || 0,
    notes
  };

  const previewCalc = calculateStay(previewStay, config);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dogName.trim()) {
      setDogNameError('Ingresá el nombre del perro.');
      document.getElementById('sm-dog-name')?.focus();
      return;
    }
    if (dateError) {
      // El mensaje ya está visible debajo de las fechas; se lleva el foco al campo que hay que corregir
      document.getElementById('form-until-day')?.focus();
      return;
    }

    onSave({
      id: stay?.id || `stay-${Date.now()}`,
      dogName: dogName.trim(),
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim(),
      dogBreed: dogBreed.trim(),
      fromDay,
      untilDay,
      days: Number(days),
      dailyRate: Number(dailyRate),
      isCapital,
      customKm: isCapital ? (config.defaultCapitalKm || 90) : Number(customKm),
      additionalFeatures: {
        expenses: Number(expenses),
        bath: Number(bath),
        moneyAdvance: Number(moneyAdvance),
        tip: Number(tip)
      },
      amountPaid: Number(amountPaid),
      dzTransferred,
      dzTransferredAmount: stay?.dzTransferredAmount,
      dzRate: stay?.dzRate ?? config.dzRate,
      dogId: stay?.dogId ?? initialDogId,
      notes: notes.trim()
    }, direccionEditada !== null && direccionEditada.trim() !== direccionGuardada.trim() ? direccionEditada.trim() : undefined);
  };

  return (
    <DialogModal onClose={onClose}>
      <div className="bg-superficie border border-borde rounded-2xl w-full max-w-xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          
          {/* Header - Fixed */}
          <div className="flex items-center justify-between border-b border-borde px-4 py-3 sm:px-6 shrink-0 bg-superficie/95 backdrop-blur">
            <h2 className="text-sm sm:text-base font-bold text-texto flex items-center gap-2">
              <Calendar className="w-5 h-5 text-acento-texto shrink-0" />
              <span className="truncate">{stay ? 'Editar Estadía' : 'Nueva Estadía de Pensionado'}</span>
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="min-w-12 min-h-12 flex items-center justify-center text-texto-sec hover:text-texto text-lg rounded-lg hover:bg-superficie-alt cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Scrollable Form Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 overscroll-contain">
          {/* Dog & Breed Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <label htmlFor="sm-dog-name" className="text-sm font-semibold text-texto-sec block mb-1">Nombre del Perro / Huésped *</label>
              <input
                id="sm-dog-name"
                type="text"
                required
                value={dogName}
                onChange={e => {
                  setDogName(e.target.value);
                  setDogNameError('');
                  setShowDirectoryDropdown(true);
                }}
                onFocus={() => setShowDirectoryDropdown(true)}
                aria-invalid={dogNameError ? true : undefined}
                aria-describedby={dogNameError ? 'sm-dog-name-error' : undefined}
                placeholder="Ej. Candela, Luna, Bóxer..."
                className={`w-full bg-fondo border rounded-xl px-3 py-2 text-sm text-texto focus:border-acento ${dogNameError ? 'border-error' : 'border-borde-fuerte'}`}
              />
              {dogNameError && <p id="sm-dog-name-error" role="alert" className="text-error text-sm mt-1">{dogNameError}</p>}
              {/* Autocomplete Dropdown from 31 Clients Directory */}
              {showDirectoryDropdown && matchingDirectoryClients.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-superficie border border-borde-fuerte rounded-xl shadow-2xl z-30 max-h-56 overflow-y-auto divide-y divide-borde overscroll-contain">
                  <div className="px-2.5 py-1 text-sm text-texto-sec bg-fondo/80 font-medium sticky top-0 backdrop-blur z-10">
                    Huéspedes del Directorio ({activeClientsList.length} registrados):
                  </div>
                  {matchingDirectoryClients.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectDirectoryClient(c)}
                      className="w-full text-left px-3 py-2 hover:bg-superficie-alt transition-colors flex items-center justify-between text-sm cursor-pointer"
                    >
                      <div>
                        <div className="font-bold text-texto flex items-center gap-1.5">
                          <span>{c.dogName}</span>
                          {c.breed && (
                            <span className="text-sm px-1.5 py-0.2 rounded bg-info/15 text-info border border-info/40 font-normal">
                              {c.breed}
                            </span>
                          )}
                        </div>
                        <span className="text-sm text-texto-sec">
                          Dueño: {mask('dueno', c.ownerName) || 'Sin registrar'} {c.address ? `· ${mask('direccion', c.address)}` : ''}
                        </span>
                      </div>
                      {c.historicalStay && (
                        <span className="text-sm bg-exito/15 text-exito px-1.5 py-0.5 rounded border border-exito/40">
                          Con historial ({c.historicalStay.days}d)
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="sm-dog-breed" className="text-sm font-semibold text-texto-sec block mb-1">Raza del Huésped</label>
              <input
                id="sm-dog-breed"
                type="text"
                value={dogBreed}
                onChange={e => setDogBreed(e.target.value)}
                placeholder="Ej. Bichón frisé, Caniche, Staffordshire..."
                className="w-full bg-fondo border border-borde-fuerte rounded-xl px-3 py-2 text-sm text-texto focus:border-acento "
              />
            </div>
          </div>

          {/* Precio por día de la última estadía archivada del perro (sin fechas ni total). No cambia la tarifa sola. */}
          {dogName.trim().length > 0 && (
            <div role="status" aria-live="polite" data-testid="ultima-estadia" className="-mt-1">
              {ultima ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-borde bg-superficie-alt/60 px-3 py-2">
                  <p className="text-sm text-texto">
                    <span className="font-semibold">Último precio:</span>{' '}
                    <span className="whitespace-nowrap">{formatCurrencyARS(ultima.tarifaDiaria)} por día</span>
                  </p>
                  {ultima.tarifaDiaria > 0 && (
                    <button
                      type="button"
                      data-testid="usar-tarifa"
                      onClick={() => setDailyRate(ultima.tarifaDiaria)}
                      aria-label={`Usar esta tarifa: ${formatCurrencyARS(ultima.tarifaDiaria)} por día`}
                      className="min-h-12 px-3 rounded-xl text-sm font-semibold border border-acento text-acento-texto bg-acento/10 hover:bg-acento/20 cursor-pointer"
                    >
                      Usar esta tarifa
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-sm text-texto-sec px-1">Sin estadías anteriores</p>
              )}
            </div>
          )}

          {/* Client & Phone Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="sm-client-name" className="text-sm font-semibold text-texto-sec block mb-1">Dueño / Responsable</label>
              <input
                id="sm-client-name"
                type="text"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="Ej. Sofía, Ezequiel, Florencia..."
                className="w-full bg-fondo border border-borde-fuerte rounded-xl px-3 py-2 text-sm text-texto focus:border-acento "
              />
            </div>
            <div>
              <label htmlFor="form-client-phone" className="text-sm font-semibold text-texto-sec block mb-1">Teléfono / WhatsApp</label>
              <input
                id="form-client-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={clientPhone}
                onChange={e => setClientPhone(e.target.value)}
                placeholder="Ej. 555-0101"
                className="w-full bg-fondo border border-borde-fuerte rounded-xl px-3 py-2 text-sm text-texto focus:border-acento "
              />
            </div>
          </div>

          {/* Dirección: se puede dejar como está; si se cambia, se actualiza la ficha del perro y sus estadías */}
          <div>
            <label htmlFor="sm-direccion" className="text-sm font-semibold text-texto-sec block mb-1">Dirección</label>
            <div className="flex items-center gap-2">
              <input
                id="sm-direccion"
                type="text"
                data-testid="sm-direccion"
                autoComplete="street-address"
                value={direccion}
                onChange={e => setDireccionEditada(e.target.value)}
                placeholder="Calle, número, localidad"
                className="min-w-0 flex-1 bg-fondo border border-borde-fuerte rounded-xl px-3 py-2 text-sm text-texto focus:border-acento "
              />
            </div>
          </div>

          {/* HISTORIAL DEL PERRO (Se activa automáticamente al escribir el nombre) */}
          {dogName.trim().length > 0 && (dogHistory || !ultima) && (
            <div className="rounded-xl border p-3 text-sm transition-all duration-200">
              {dogHistory ? (
                dogHistory.type === 'stay' ? (
                  <div className="bg-info/10 border border-info/40 -m-3 p-3 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-info font-semibold">
                      <span className="flex items-center gap-1.5">
                        <History className="w-4 h-4 text-info" />
                        <span>Historial activo en agenda: {dogHistory.lastStay.dogName}</span>
                      </span>
                      <span className="text-sm bg-info/10 px-2 py-0.5 rounded-full text-info">
                        {dogHistory.count} {dogHistory.count === 1 ? 'estadía anterior' : 'estadías anteriores'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-fondo/60 p-2.5 rounded-lg border border-info/40 font-mono text-sm">
                      <div>
                        <span className="text-texto-sec block text-sm">Última Fecha</span>
                        <strong className="text-texto">{dogHistory.lastStay.fromDay} ➔ {dogHistory.lastStay.untilDay}</strong>
                        <span className="text-sm text-texto-sec block">({dias(dogHistory.lastStay.days)})</span>
                      </div>
                      <div>
                        <span className="text-texto-sec block text-sm">Cobrado última vez</span>
                        <strong className="text-acento-texto text-sm">{formatCurrencyARS(dogHistory.lastStay.dailyRate)}/d</strong>
                        <span className="text-sm text-texto-sec block">Total: {formatCurrencyARS(dogHistory.lastStayCalc.totalGross)}</span>
                      </div>
                      <div>
                        <span className="text-texto-sec block text-sm">IFM aplicado</span>
                        <strong className="text-info">+{formatCurrencyARS(dogHistory.lastStayCalc.ifmDaily)}/d</strong>
                        <span className="text-sm text-texto-sec block">Total IFM: {formatCurrencyARS(Math.round(dogHistory.lastStayCalc.totalIfm))}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => setDailyRate(dogHistory.lastStay.dailyRate)}
                        className="text-sm px-2.5 py-1 rounded-md bg-info-solido hover:bg-info-solido-hover text-sobre-solido font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Repetir última tarifa ({formatCurrencyARS(dogHistory.lastStay.dailyRate)})</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-exito/10 border border-exito/40 -m-3 p-3 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-exito font-semibold">
                      <span className="flex items-center gap-1.5">
                        <History className="w-4 h-4 text-exito" />
                        <span>Guardado en el Registro de estadías ({dogHistory.breed || 'Huésped'})</span>
                      </span>
                      <span className="text-sm bg-exito/10 px-2 py-0.5 rounded-full text-exito">
                        {cantidad(dogHistory.historicalStay.days, 'día previo', 'días previos')}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-fondo/60 p-2.5 rounded-lg border border-exito/40 font-mono text-sm">
                      <div>
                        <span className="text-texto-sec block text-sm">Fechas Registradas</span>
                        <strong className="text-texto">{dogHistory.historicalStay.arrivalDate} ➔ {dogHistory.historicalStay.departureDate}</strong>
                        <span className="text-sm text-texto-sec block">({dias(dogHistory.historicalStay.days)})</span>
                      </div>
                      <div>
                        <span className="text-texto-sec block text-sm">Total Histórico Cobrado</span>
                        <strong className="text-exito text-sm">{dogHistory.historicalStay.finalDT}</strong>
                        <span className="text-sm text-texto-sec block">Sub-diario: $ {dogHistory.historicalStay.subDiario}</span>
                      </div>
                      <div>
                        <span className="text-texto-sec block text-sm">Transporte Registrado</span>
                        <strong className="text-info">$ {dogHistory.historicalStay.transporte || '0'}</strong>
                        <span className="text-sm text-texto-sec block">Real x D: $ {dogHistory.historicalStay.realXD}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          const rate = parseFloat(dogHistory.historicalStay.subDiario?.replace(/\./g, '') || '0');
                          if (rate > 0) setDailyRate(rate);
                        }}
                        className="text-sm px-2.5 py-1 rounded-md bg-exito-solido hover:bg-exito-solido-hover text-sobre-solido font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Usar tarifa histórica ($ {dogHistory.historicalStay.subDiario} / día)</span>
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <div className="bg-superficie/60 border border-borde -m-3 p-3 rounded-xl flex items-center gap-2 text-texto-sec">
                  <span className="text-base">✨</span>
                  <div>
                    <strong className="text-texto-sec font-semibold block">Huésped Nuevo</strong>
                    <span className="text-sm text-texto-sec">
                      Sin estadías previas registradas. La tarifa pura sugerida para {dias(days)} es de {formatCurrencyARS(pureRate)}/día.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dates & Days */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="form-from-day" className="text-sm font-semibold text-texto-sec block mb-1">Fecha Desde</label>
              <input
                id="form-from-day"
                type="date"
                value={fromDay}
                onChange={e => handleDateChange(e.target.value, untilDay)}
                className="w-full bg-fondo border border-borde-fuerte rounded-xl px-3 py-2 text-sm text-texto focus:border-acento "
              />
            </div>

            <div>
              <label htmlFor="form-until-day" className="text-sm font-semibold text-texto-sec block mb-1">Fecha Hasta</label>
              <input
                id="form-until-day"
                type="date"
                value={untilDay}
                onChange={e => handleDateChange(fromDay, e.target.value)}
                aria-invalid={dateError ? true : undefined}
                aria-describedby={dateError ? 'form-date-error' : undefined}
                className={`w-full bg-fondo border rounded-xl px-3 py-2 text-sm text-texto focus:border-acento ${dateError ? 'border-error' : 'border-borde-fuerte'}`}
              />
            </div>

            <div>
              <label htmlFor="form-days" className="text-sm font-semibold text-texto-sec block mb-1">Días (calculado)</label>
              <input
                id="form-days"
                type="number"
                readOnly
                value={days}
                className="w-full bg-superficie border border-borde-fuerte rounded-xl px-3 py-2 text-sm font-mono text-texto-sec cursor-not-allowed "
              />
            </div>
          </div>
          {dateError && <p id="form-date-error" role="alert" className="text-error text-sm -mt-2">{dateError}</p>}

          {/* DEFINICIÓN DE TARIFA: CÁLCULO PURO VS PRECIO ASIGNADO (IFM) */}
          <div className="bg-fondo p-4 rounded-xl border border-borde space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-texto flex items-center gap-1.5">
                <Percent className="w-4 h-4 text-acento-texto" />
                <span>Cálculo Puro vs Precio Asignado</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Tarifa según cálculo puro de la app */}
              <div className="p-3 rounded-xl bg-superficie border border-borde-fuerte flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-texto-sec uppercase tracking-wider font-bold">1. Cálculo Puro de la App</span>
                    <span className="text-sm bg-superficie-alt px-1.5 py-0.5 rounded text-texto-sec">Base</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-texto">
                    {formatCurrencyARS(pureRate)} <span className="text-sm font-normal text-texto-sec">/día</span>
                  </div>
                  <p className="text-sm text-texto-sec mt-1 leading-snug">
                    Tarifa base pura calculada para {days}d ({formatCurrencyARS(Math.round(PURE_DAILY_BASE))} + {formatCurrencyARS(Math.round(pureTransportShare(config)))}/{days}d)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDailyRate(pureRate)}
                  className="mt-3 w-full py-1.5 text-sm font-semibold rounded-lg bg-superficie-alt hover:bg-realce text-texto-sec border border-borde-fuerte transition-colors flex items-center justify-center gap-1 cursor-pointer"
                >
                  <span>Copiar Cálculo Puro</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {/* Precio Asignado por el usuario */}
              <div className="p-3 rounded-xl bg-superficie border border-acento/40 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="form-daily-rate" className="text-sm text-acento-texto uppercase tracking-wider font-bold">2. Precio que Asigno Yo</label>
                    <span className="text-sm text-acento-texto font-mono">Manual</span>
                  </div>
                  <div className="relative mt-1">
                    <input
                      id="form-daily-rate"
                      type="number"
                      step="500"
                      required
                      inputMode="numeric"
                      value={dailyRate}
                      onChange={e => setDailyRate(Number(e.target.value))}
                      className="w-full bg-fondo border border-acento rounded-lg px-3 py-1.5 text-lg font-mono font-bold text-acento-texto focus:border-acento "
                    />
                    <span className="absolute right-3 top-2 text-sm text-texto-sec font-mono">ARS/d</span>
                  </div>
                </div>
                <div className="mt-3 text-sm text-texto-sec text-center font-mono">
                  Total Bruto: <strong>{formatCurrencyARS((days || 1) * dailyRate)}</strong>
                </div>
              </div>
            </div>

            {/* SECCIÓN IFM */}
            <div className="bg-info/10 border border-info/40 p-3 rounded-xl flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-info flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-info" />
                  <span>IFM</span>
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-sm font-extrabold text-info">
                  {currentIfmDaily >= 0 ? `+${formatCurrencyARS(currentIfmDaily)}` : formatCurrencyARS(currentIfmDaily)} <span className="text-sm text-info font-normal">/día</span>
                </div>
                <div className="text-sm text-info font-bold">
                  Total IFM: {formatCurrencyARS(Math.round(currentTotalIfm))}
                </div>
              </div>
            </div>
          </div>

          {/* Location & Km Rules */}
          <div className="bg-fondo p-3.5 rounded-xl border border-borde space-y-2.5">
            <label className="text-sm font-bold text-texto block">📍 Ubicación del Traslado</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-texto-sec cursor-pointer">
                <input
                  type="radio"
                  name="locationType"
                  checked={isCapital}
                  onChange={() => setIsCapital(true)}
                  className="accent-acento"
                />
                <span>Capital Federal (Fijo {config.defaultCapitalKm} km)</span>
              </label>

              <label className="flex items-center gap-2 text-sm text-texto-sec cursor-pointer">
                <input
                  type="radio"
                  name="locationType"
                  checked={!isCapital}
                  onChange={() => setIsCapital(false)}
                  className="accent-acento"
                />
                <span>Fuera de Capital (Km totales)</span>
              </label>
            </div>

            {!isCapital && (
              <div className="pt-1.5 flex items-center gap-2">
                <label htmlFor="sm-custom-km" className="sr-only">Kilómetros totales</label>
                <input
                  id="sm-custom-km"
                  type="number"
                  min="0"
                  value={customKm}
                  onChange={e => setCustomKm(Number(e.target.value))}
                  placeholder="Ej. 150"
                  className="w-36 bg-superficie border border-borde-fuerte rounded-lg px-3 py-1 text-sm text-texto font-mono"
                />
                <span className="text-sm text-texto-sec">km totales ida y vuelta</span>
              </div>
            )}
          </div>

          {/* Extras and Payment */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <label htmlFor="form-bath" className="text-sm text-texto-sec block mb-1">Baño ($)</label>
              <input
                id="form-bath"
                type="number"
                inputMode="numeric"
                value={bath}
                onChange={e => setBath(Number(e.target.value))}
                className="w-full bg-fondo border border-borde-fuerte rounded-lg px-2.5 py-1.5 text-sm text-texto font-mono"
              />
            </div>
            <div>
              <label htmlFor="form-expenses" className="text-sm text-texto-sec block mb-1">Gastos ($)</label>
              <input
                id="form-expenses"
                type="number"
                inputMode="numeric"
                value={expenses}
                onChange={e => setExpenses(Number(e.target.value))}
                className="w-full bg-fondo border border-borde-fuerte rounded-lg px-2.5 py-1.5 text-sm text-texto font-mono"
              />
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label htmlFor="form-advance" className="text-sm text-texto-sec block mb-1">Seña o adelanto (recibido al retirar o reservar)</label>
              <input
                id="form-advance"
                type="number"
                inputMode="numeric"
                value={moneyAdvance}
                onChange={e => setMoneyAdvance(Number(e.target.value))}
                className="w-full bg-fondo border border-borde-fuerte rounded-lg px-2.5 py-1.5 text-sm text-texto font-mono"
              />
            </div>
            <div>
              <label htmlFor="form-tip" className="text-sm text-texto-sec block mb-1">
                Propina ($)
                <span className="ml-1.5 text-texto-sec font-normal">(no suma al total)</span>
              </label>
              <input
                id="form-tip"
                type="number"
                inputMode="numeric"
                value={tip}
                onChange={e => setTip(Number(e.target.value))}
                className="w-full bg-fondo border border-borde-fuerte rounded-lg px-2.5 py-1.5 text-sm text-acento-texto font-mono"
              />
            </div>
            <div>
              <label htmlFor="form-amount-paid" className="text-sm text-texto-sec block mb-1">Ya Cobrado ($)</label>
              <input
                id="form-amount-paid"
                type="number"
                inputMode="numeric"
                value={amountPaid}
                onChange={e => setAmountPaid(Number(e.target.value))}
                className="w-full bg-fondo border border-borde-fuerte rounded-lg px-2.5 py-1.5 text-sm text-exito font-mono font-bold"
              />
            </div>
          </div>

          {/* Preview Strip */}
          <div className="bg-fondo/90 border border-borde p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 text-sm">
            <div>
              <span className="text-texto-sec block text-sm">Te queda U$S</span>
              <strong className="text-exito font-mono text-sm">{formatCurrencyUSD(previewCalc.netUsd)}</strong>
            </div>
            <div>
              <span className="text-texto-sec block text-sm">Te queda</span>
              <strong className="text-info font-mono">{formatCurrencyARS(Math.round(previewCalc.netArs))}</strong>
            </div>
            <div>
              <span className="text-texto-sec block text-sm">{previewCalc.creditBalance >= 1 ? 'A favor del cliente' : 'Falta cobrar'}</span>
              <strong className={`font-mono ${previewCalc.creditBalance >= 1 ? 'text-info' : previewCalc.totalAdeudado >= 1 ? 'text-error' : 'text-exito'}`}>
                {formatCurrencyARS(previewCalc.creditBalance >= 1 ? previewCalc.creditBalance : previewCalc.totalAdeudado)}
              </strong>
            </div>
          </div>

          </div>{/* End Scrollable Form Body */}

          {/* Sticky action footer with safe-area */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 sm:px-6 border-t border-borde bg-fondo/95 backdrop-blur shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-superficie-alt hover:bg-realce text-texto-sec cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-bold rounded-lg bg-acento hover:bg-acento-hover text-acento-fg cursor-pointer shadow-md "
            >
              {stay ? 'Guardar Cambios' : 'Crear Estadía'}
            </button>
          </div>
        </form>
      </div>
    </DialogModal>
  );
}
