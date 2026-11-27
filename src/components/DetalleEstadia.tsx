import React from 'react';
import { AppConfig, Stay, StayCalculations } from '../types';
import { costPerKm, formatCurrencyARS, formatCurrencyUSD, formatNumber } from '../utils/calculations';

// "Falta cobrar", o "A favor del cliente" si cobró de más
export function BalanceField({ calc }: { calc: StayCalculations }) {
  if (calc.creditBalance >= 1) {
    return (
      <div>
        <dt className="text-texto-sec">A favor del cliente</dt>
        <dd className="font-bold text-info">{formatCurrencyARS(calc.creditBalance)}</dd>
      </div>
    );
  }
  return (
    <div>
      <dt className="text-texto-sec">Falta cobrar</dt>
      <dd className={`font-bold ${calc.totalAdeudado >= 1 ? 'text-error' : 'text-exito'}`}>
        {calc.totalAdeudado >= 1 ? formatCurrencyARS(calc.totalAdeudado) : 'Nada ✓'}
      </dd>
    </div>
  );
}
// "Ver detalle" de cada estadía, en el orden de docs/calculos.md
export function StayDetail({ stay, calc, config }: { stay: Stay; calc: StayCalculations; config: AppConfig }) {
  const ars = (n: number) => formatCurrencyARS(Math.round(n));
  const pct = Math.round(calc.dzRate * 1000) / 10;
  const rows: { label: React.ReactNode; value: React.ReactNode; className?: string }[] = [
    { label: 'Total', value: ars(calc.totalCharge), className: 'text-texto font-bold' },
    { label: 'Cobrado (adelanto + ya cobrado)', value: ars(calc.collected), className: 'text-exito font-bold' },
    { label: <span className="block pl-4">Seña o adelanto (recibido al retirar o reservar)</span>, value: ars(stay.additionalFeatures?.moneyAdvance || 0) },
    { label: <span className="block pl-4">Ya cobrado</span>, value: ars(stay.amountPaid || 0) },
    calc.creditBalance >= 1
      ? { label: 'A favor del cliente', value: ars(calc.creditBalance), className: 'text-info font-bold' }
      : { label: 'Falta cobrar', value: ars(calc.totalAdeudado), className: calc.totalAdeudado >= 1 ? 'text-error font-bold' : 'text-exito font-bold' },
    { label: `Tasa (${pct.toLocaleString('es-AR')} %) generada`, value: ars(calc.dzGenerated), className: 'text-info' },
    { label: 'Tasa transferida', value: ars(calc.dzTransferredAmount), className: 'text-info' },
    { label: 'Tasa por transferir', value: ars(calc.dzPending), className: calc.dzPending >= 1 ? 'text-error font-bold' : 'text-texto' },
    { label: `Traslado (${calc.kmApplied} km × $ ${formatNumber(costPerKm(config), 2)})`, value: `−${ars(calc.fuelCost)}`, className: 'text-texto' },
    { label: 'Te queda', value: ars(calc.netArs), className: 'text-texto font-bold' },
    { label: 'Te queda hasta ahora', value: ars(calc.netSoFarArs), className: 'text-texto font-bold' },
    { label: 'US$ (te queda)', value: formatCurrencyUSD(calc.netUsd), className: 'text-exito font-bold' },
    { label: 'US$ hasta ahora', value: formatCurrencyUSD(calc.netSoFarUsd), className: 'text-exito' },
    { label: 'Tarifa asignada', value: `${ars(stay.dailyRate)}/día`, className: 'text-texto' },
    { label: 'Cálculo puro', value: `${ars(calc.pureDailyRate)}/día`, className: 'text-acento-texto' },
  ];
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 mt-2">
      {rows.map((r, i) => (
        <React.Fragment key={i}>
          <dt className="text-texto-sec">{r.label}</dt>
          <dd className={`font-mono text-right whitespace-nowrap ${r.className ?? 'text-texto'}`}>{r.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
