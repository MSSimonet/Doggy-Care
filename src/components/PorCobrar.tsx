import { useId, useState } from 'react';
import { Wallet } from 'lucide-react';
import type { AppConfig, Stay, StayCalculations } from '../types';
import { estadoCobro } from '../utils/flujoCobros';
import { formatCurrencyARS, formatPercent } from '../utils/calculations';
import { fechaCorta } from '../utils/ultimaEstadia';
import { Casilla } from './Casilla';

interface PorCobrarProps {
  items: { stay: Stay; calc: StayCalculations }[];
  config: AppConfig;
  onCobrado: (stayId: string) => void;
  onDeducida: (stayId: string) => void;
  onVolver: (stayId: string) => void;
}

const fechas = (s: Stay) => `${fechaCorta(s.fromDay) || s.fromDay} → ${fechaCorta(s.untilDay) || s.untilDay}`;

/**
 * Cobros > Por cobrar: las estadías finalizadas que todavía no pasaron al Historial. Cada fila muestra el nombre y las
 * casillas "Cobrado" y "Deducida"; con las dos tildadas la estadía pasa sola al Historial y se va de acá.
 */
export function PorCobrar({ items, config, onCobrado, onDeducida, onVolver }: PorCobrarProps) {
  const tituloId = useId();
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set());
  const alternar = (id: string) => setAbiertos(prev => {
    const sig = new Set(prev);
    if (!sig.delete(id)) sig.add(id);
    return sig;
  });

  return (
    <section aria-labelledby={tituloId} data-testid="por-cobrar" className="bg-superficie border border-acento/40 rounded-xl p-3 shadow-md space-y-1">
      <div className="flex items-center justify-between gap-2">
        <h3 id={tituloId} className="text-sm font-bold text-texto flex items-center gap-1.5">
          <Wallet className="w-3.5 h-3.5 text-acento-texto shrink-0" aria-hidden="true" />
          Por cobrar
        </h3>
        <span data-testid="pill-por-cobrar" className="text-[12px] px-2 py-0.5 rounded-full bg-acento/15 text-acento-texto border border-acento/40 font-bold whitespace-nowrap">
          {items.length === 1 ? '1 finalizada' : `${items.length} finalizadas`}
        </span>
      </div>
      <p className="text-[12px] text-texto-sec">
        Con “Cobrado” y “Tasa” tildadas pasa sola al Historial.
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-texto-sec" data-testid="sin-por-cobrar">No hay estadías finalizadas por cobrar ✓</p>
      ) : (
        <ul className="divide-y divide-borde/60">
          {items.map(({ stay, calc }) => {
            const estado = estadoCobro(stay, config);
            const abierto = abiertos.has(stay.id);
            const detalleId = `por-cobrar-${stay.id}`;
            const descripcion = `${stay.dogName}, ${fechas(stay)}`;
            return (
              <li key={stay.id} data-testid="por-cobrar-fila" className="py-0.5">
                <div className="flex flex-wrap items-center justify-between gap-x-1">
                  <button
                    type="button"
                    data-testid="nombre-por-cobrar"
                    aria-expanded={abierto}
                    aria-controls={detalleId}
                    onClick={() => alternar(stay.id)}
                    className="min-h-11 min-w-[5rem] flex-1 text-left text-base font-bold text-texto truncate cursor-pointer rounded-lg"
                  >
                    {stay.dogName}
                  </button>
                  <div className="flex items-center">
                    <Casilla
                      etiqueta="Cobrado"
                      marcada={estado.cobrado}
                      deshabilitada={estado.cobrado}
                      titulo={estado.cobrado ? 'Ya está cobrada' : undefined}
                      onCambiar={() => onCobrado(stay.id)}
                      descripcion={descripcion}
                      testId="casilla-cobrado"
                    />
                    <Casilla
                      etiqueta="Tasa"
                      marcada={estado.deducida && estado.hayDeduccion}
                      deshabilitada={!estado.hayDeduccion}
                      titulo={!estado.hayDeduccion ? 'Todavía no hay nada cobrado: no hay tasa que transferir' : undefined}
                      onCambiar={() => onDeducida(stay.id)}
                      descripcion={descripcion}
                      testId="casilla-deducida"
                    />
                  </div>
                </div>
                <div id={detalleId} hidden={!abierto} className="pb-2 text-sm text-texto-sec space-y-0.5">
                  <p className="text-texto font-mono">{fechas(stay)}</p>
                  <p>
                    Total {formatCurrencyARS(Math.round(calc.totalCharge))} · Falta cobrar{' '}
                    <span data-testid="falta-cobrar" className="font-mono font-bold text-texto">{formatCurrencyARS(Math.round(calc.totalAdeudado))}</span>
                  </p>
                  <p>Tasa {formatCurrencyARS(Math.round(calc.dzGenerated))} ({formatPercent(calc.dzRate)}), pendiente {formatCurrencyARS(Math.round(calc.dzPending))}</p>
                  <button
                    type="button"
                    onClick={() => onVolver(stay.id)}
                    data-testid="volver-a-la-agenda"
                    className="min-h-11 px-3 rounded-lg text-sm font-semibold border border-borde-fuerte bg-superficie-alt hover:bg-realce text-texto cursor-pointer"
                  >
                    Volver a la Agenda
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
