import React, { useState } from 'react';
import { Fuel, DollarSign, Settings } from 'lucide-react';
import { AppConfig } from '../types';
import { DialogModal } from './DialogModal';

// Modal Component for App Configuration & Exchange Rates
export function ConfigModal({
  config,
  onClose,
  onSave
}: {
  config: AppConfig;
  onClose: () => void;
  onSave: (config: AppConfig) => void;
}) {
  const [fuelPrice, setFuelPrice] = useState(config.fuelPricePerLiter);
  const [consumption, setConsumption] = useState(config.fuelConsumptionKmPerLiter);
  const [baseLiters, setBaseLiters] = useState(config.baseTransportLiters);
  const [capitalKm, setCapitalKm] = useState(config.defaultCapitalKm);
  const [dzPercent, setDzPercent] = useState(config.dzRate * 100);
  const [maintPercent, setMaintPercent] = useState(config.maintenanceRate * 100);
  const [fixedComponent] = useState(config.fuelFixedComponent || 7810);

  // Exchange rate (Único Dólar Editable)
  const [usdRate, setUsdRate] = useState(config.exchangeRates.usdRate || config.exchangeRates.promedioUsd || 1700);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      fuelPricePerLiter: Number(fuelPrice),
      fuelConsumptionKmPerLiter: Number(consumption),
      baseTransportLiters: Number(baseLiters),
      defaultCapitalKm: Number(capitalKm),
      dzRate: Number(dzPercent) / 100,
      maintenanceRate: Number(maintPercent) / 100,
      usdReferenceDaily: config.usdReferenceDaily,
      fuelFixedComponent: Number(fixedComponent),
      exchangeRates: {
        usdRate: Number(usdRate),
        promedioUsd: Number(usdRate),
        blue: Number(usdRate),
        mep: Number(usdRate),
        bna: Number(usdRate),
        ccl: Number(usdRate),
        tarjeta: Number(usdRate),
        euroBlue: Number(usdRate)
      }
    });
  };

  return (
    <DialogModal onClose={onClose}>
      <div className="bg-superficie border border-borde rounded-2xl w-full max-w-lg max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        <form onSubmit={handleSave} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-borde px-4 py-3 sm:px-6 shrink-0 bg-superficie/95 backdrop-blur">
            <h2 className="text-sm sm:text-base font-bold text-texto flex items-center gap-2">
              <Settings className="w-5 h-5 text-acento-texto shrink-0" />
              <span className="truncate">Parámetros Operativos & Cotizaciones</span>
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

          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 overscroll-contain">
            {/* Section: Fuel & Transport */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-acento-texto flex items-center gap-1.5">
              <Fuel className="w-4 h-4" />
              <span>Combustible y Traslados</span>
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="cfg-fuel-price" className="text-sm text-texto-sec block mb-1">Precio Nafta ($/Litro)</label>
                <input
                  id="cfg-fuel-price"
                  type="number"
                  value={fuelPrice}
                  onChange={e => setFuelPrice(Number(e.target.value))}
                  className="w-full bg-fondo border border-borde-fuerte rounded-xl px-3 py-2 text-sm font-mono text-texto"
                />
              </div>
              <div>
                <label htmlFor="cfg-consumption" className="text-sm text-texto-sec block mb-1">Rendimiento (km/Litro)</label>
                <input
                  id="cfg-consumption"
                  type="number"
                  step="0.01"
                  value={consumption}
                  onChange={e => setConsumption(Number(e.target.value))}
                  className="w-full bg-fondo border border-borde-fuerte rounded-xl px-3 py-2 text-sm font-mono text-texto"
                />
              </div>
              <div>
                <label htmlFor="cfg-base-liters" className="text-sm text-texto-sec block mb-1">Litros Traslado Base</label>
                <input
                  id="cfg-base-liters"
                  type="number"
                  value={baseLiters}
                  onChange={e => setBaseLiters(Number(e.target.value))}
                  className="w-full bg-fondo border border-borde-fuerte rounded-xl px-3 py-2 text-sm font-mono text-texto"
                />
                <span className="text-sm text-texto-sec mt-0.5 block">{baseLiters}L x ${fuelPrice} = ${fuelPrice * baseLiters}</span>
              </div>
              <div>
                <label htmlFor="cfg-capital-km" className="text-sm text-texto-sec block mb-1">Km Fijo Capital</label>
                <input
                  id="cfg-capital-km"
                  type="number"
                  value={capitalKm}
                  onChange={e => setCapitalKm(Number(e.target.value))}
                  className="w-full bg-fondo border border-borde-fuerte rounded-xl px-3 py-2 text-sm font-mono text-texto"
                />
              </div>
            </div>
          </div>

          {/* Section: Rates & Deductions */}
          <div className="space-y-3 pt-2 border-t border-borde">
            <h3 className="text-sm font-bold uppercase tracking-wider text-info flex items-center gap-1.5">
              <span>Porcentajes de Tasa</span>
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="cfg-dz-percent" className="text-sm text-texto-sec block mb-1">Tasa (%)</label>
                <input
                  id="cfg-dz-percent"
                  type="number"
                  value={dzPercent}
                  onChange={e => setDzPercent(Number(e.target.value))}
                  className="w-full bg-fondo border border-borde-fuerte rounded-xl px-3 py-2 text-sm font-mono text-texto"
                />
              </div>
              <div>
                <label htmlFor="cfg-maint-percent" className="text-sm text-texto-sec block mb-1">Mantenimiento (%)</label>
                <input
                  id="cfg-maint-percent"
                  type="number"
                  value={maintPercent}
                  onChange={e => setMaintPercent(Number(e.target.value))}
                  className="w-full bg-fondo border border-borde-fuerte rounded-xl px-3 py-2 text-sm font-mono text-texto"
                />
              </div>
            </div>
          </div>

          {/* Section: Exchange Rate */}
          <div className="space-y-3 pt-2 border-t border-borde">
            <h3 className="text-sm font-bold uppercase tracking-wider text-exito flex items-center gap-1.5">
              <DollarSign className="w-4 h-4" />
              <span>Cotización Dólar</span>
            </h3>
            <div className="bg-fondo/80 p-3.5 rounded-xl border border-borde space-y-2">
              <label htmlFor="cfg-usd-rate" className="text-sm text-texto-sec block font-medium">Cotización Dólar ($/USD)</label>
              <div className="flex items-center gap-2">
                <span className="text-texto-sec font-mono text-sm">$</span>
                <input
                  id="cfg-usd-rate"
                  type="number"
                  value={usdRate}
                  onChange={e => setUsdRate(Number(e.target.value))}
                  className="w-full bg-superficie border border-exito rounded-xl px-3 py-2 text-sm font-mono text-exito font-bold focus:border-exito "
                />
              </div>
              <p className="text-sm text-texto-sec leading-tight">
                Se toma este único valor para convertir automáticamente los netos a U$S en toda la aplicación.
              </p>
            </div>
          </div>

          </div>{/* End scrollable body */}

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
              Aplicar y Recalcular
            </button>
          </div>
        </form>
      </div>
    </DialogModal>
  );
}
