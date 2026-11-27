import { useId, useState } from 'react';
import { CheckCircle2, ChevronDown, CreditCard } from 'lucide-react';
import type { ItemDeduccion, ResumenDeducciones } from '../utils/deducciones';
import { formatCurrencyARS, formatPercent } from '../utils/calculations';
import { fechaCorta } from '../utils/ultimaEstadia';

interface DeduccionesPendientesProps {
  resumen: ResumenDeducciones;
  onMarcar: (item: ItemDeduccion) => void;
  onDesmarcar: (item: ItemDeduccion) => void;
  onMarcarTodas: () => void;
  /** la nube todavía no guarda el tilde de los registros archivados (migración 005 sin aplicar) */
  tildeSoloLocal: boolean;
}

const fechaLarga = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return a && m && d ? `${d}/${m}/${a}` : iso;
};
/** "5/10 → 14/10 de 2026" (el año es el de la fecha de fin) */
const fechas = (it: ItemDeduccion) => `${fechaCorta(it.desde) || it.desde} → ${fechaCorta(it.hasta) || it.hasta}${it.fin ? ` de ${it.fin.slice(0, 4)}` : ''}`;
const ULTIMAS_TRANSFERIDAS = 5;

/**
 * Casilla "Deducida": 20 px visibles con su etiqueta, y un área táctil de 44 px de alto (la etiqueta entera es
 * tocable) sin agrandar la fila. El nombre accesible empieza con la etiqueta visible.
 */
function CasillaDeducida({ marcada, onCambiar, descripcion, testId }: { marcada: boolean; onCambiar: () => void; descripcion: string; testId: string }) {
  return (
    <label className="shrink-0 min-h-11 min-w-11 px-1.5 -my-1 inline-flex items-center gap-2 rounded-lg cursor-pointer select-none hover:bg-info/10">
      <input
        type="checkbox"
        checked={marcada}
        onChange={onCambiar}
        data-testid={testId}
        aria-label={`Tasa: ${descripcion}`}
        className="w-5 h-5 shrink-0 accent-info-solido cursor-pointer"
      />
      <span className="text-sm font-semibold text-texto">Tasa</span>
    </label>
  );
}

/**
 * Deducciones que todavía no se transfirieron, perro por perro y estadía por estadía (desde la fecha de inicio
 * de Ajustes), con el total arriba. Aparte, las ya transferidas con su fecha, que se pueden desmarcar.
 */
export function DeduccionesPendientes({ resumen, onMarcar, onDesmarcar, onMarcarTodas, tildeSoloLocal }: DeduccionesPendientesProps) {
  const [verTransferidas, setVerTransferidas] = useState(false);
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set());
  const alternar = (id: string) => setAbiertos(prev => {
    const sig = new Set(prev);
    if (!sig.delete(id)) sig.add(id);
    return sig;
  });
  const tituloId = useId();
  const n = resumen.pendientes.length;
  // Sólo las últimas transferidas (por si se tildó una por error); ya vienen de la más reciente a la más antigua
  const recientes = resumen.transferidas.slice(0, ULTIMAS_TRANSFERIDAS);

  return (
    <section
      aria-labelledby={tituloId}
      data-testid="deducciones-pendientes"
      className="bg-superficie border border-info/40 rounded-xl p-3 shadow-md space-y-2"
    >
      {/* Encabezado en una línea: título + cantidad, y a la derecha el total */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 id={tituloId} className="text-sm font-bold text-texto flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-info shrink-0" aria-hidden="true" />
              Tasas pendientes
            </h3>
            <span data-testid="pill-sin-transferir" className="text-[12px] px-2 py-0.5 rounded-full bg-info/15 text-info border border-info/40 font-bold whitespace-nowrap">
              {n === 1 ? '1 sin transferir' : `${n} sin transferir`}
            </span>
          </div>
          <p className="text-[12px] text-texto-sec mt-0.5">
            Desde el {fechaLarga(resumen.inicio)} (Ajustes)
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-[12px] text-info font-semibold uppercase tracking-wide block leading-none">Total</span>
          <div data-testid="total-pendiente" className="text-lg font-black font-mono text-info leading-tight">
            {formatCurrencyARS(Math.round(resumen.total))}
          </div>
        </div>
      </div>

      {n > 0 && (
        <button
          type="button"
          onClick={onMarcarTodas}
          data-testid="marcar-todas"
          className="min-h-11 px-3 text-sm font-semibold rounded-lg bg-info/15 hover:bg-info/20 text-info border border-info transition-colors cursor-pointer whitespace-nowrap"
        >
          Marcar todas ({n})
        </button>
      )}

      {tildeSoloLocal && (
        <p role="status" data-testid="aviso-tilde-local" className="rounded-lg border border-error/50 bg-error/10 px-2.5 py-1.5 text-[13px] text-texto">
          El tilde de “transferida” de las estadías archivadas se guarda en este teléfono, pero todavía no en la nube:
          falta aplicar la migración 005. Si usás otro teléfono, ahí no se va a ver.
        </p>
      )}

      {n === 0 ? (
        <p className="text-sm text-texto-sec">Sin tasas pendientes ✓</p>
      ) : (
        <ul className="border-t border-info/30 divide-y divide-borde/60" data-testid="pendientes-por-perro">
          {resumen.porPerro.flatMap(g => g.items.map(it => ({ g, it }))).map(({ g, it }) => {
            const varias = g.items.length > 1;
            const abierto = abiertos.has(it.id);
            const detalleId = `detalle-${it.id}`;
            return (
              <li key={it.id} data-testid="pendiente" className="py-0.5">
                {/* Sólo el nombre y la casilla; tocar el nombre muestra el detalle de esa estadía */}
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    data-testid="nombre-pendiente"
                    aria-expanded={abierto}
                    aria-controls={detalleId}
                    onClick={() => alternar(it.id)}
                    className="min-h-11 min-w-0 flex-1 text-left text-base font-bold text-texto truncate cursor-pointer rounded-lg"
                  >
                    {g.dogName}
                    {varias && <span className="font-normal text-texto-sec"> · {fechaCorta(it.desde) || it.desde}</span>}
                  </button>
                  <CasillaDeducida
                    marcada={false}
                    onCambiar={() => onMarcar(it)}
                    descripcion={`${it.dogName}, ${fechas(it)}`}
                    testId="marcar-transferida"
                  />
                </div>
                <div id={detalleId} hidden={!abierto} className="pb-2 text-sm text-texto-sec space-y-0.5">
                  <p className="text-texto font-mono">{fechas(it)}</p>
                  <p>Cobrado {formatCurrencyARS(Math.round(it.totalCobrado))} · {formatPercent(it.tasa)}</p>
                  <p>
                    Tasa <span data-testid="monto-pendiente" className="font-mono font-bold text-texto">{formatCurrencyARS(Math.round(it.monto))}</span>
                    {varias && <> · Subtotal de {g.dogName}: <span data-testid="subtotal-perro" className="font-mono font-bold text-info">{formatCurrencyARS(Math.round(g.subtotal))}</span></>}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-info/30">
        <button
          type="button"
          onClick={() => setVerTransferidas(v => !v)}
          aria-expanded={verTransferidas}
          data-testid="ver-transferidas"
          className="min-h-11 w-full flex items-center justify-between gap-2 rounded-lg px-1 text-sm font-semibold text-texto cursor-pointer"
        >
          <span>Últimas transferidas ({recientes.length})</span>
          <ChevronDown className={`w-4 h-4 motion-safe:transition-transform ${verTransferidas ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {verTransferidas && (
          recientes.length === 0 ? (
            <p className="text-sm text-texto-sec px-1">Todavía no hay tasas marcadas como transferidas.</p>
          ) : (
            <ul className="divide-y divide-borde/60" data-testid="lista-transferidas">
              {recientes.map(it => (
                <li key={it.id} data-testid="transferida" className="flex items-center justify-between gap-2 py-0.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-texto">{it.dogName} <span className="font-mono font-normal text-texto-sec">{fechas(it)}</span></p>
                    <p className="text-texto-sec flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4 text-exito shrink-0" aria-hidden="true" />
                      {formatCurrencyARS(Math.round(it.monto))} · {it.transferidaEn ? `transferida el ${fechaLarga(it.transferidaEn)}` : 'sin fecha registrada'}
                    </p>
                  </div>
                  <CasillaDeducida
                    marcada
                    onCambiar={() => onDesmarcar(it)}
                    descripcion={`${it.dogName}, ${fechas(it)}`}
                    testId="desmarcar-transferida"
                  />
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </section>
  );
}
