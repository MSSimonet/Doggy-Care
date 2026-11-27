import { useId, useState } from 'react';
import { Percent, Plus, Trash2 } from 'lucide-react';
import type { AppConfig } from '../types';
import { completarConfig } from '../utils/tasasDeduccion';

interface AjustesDeduccionesProps {
  config: AppConfig;
  onGuardar: (cambios: Pick<AppConfig, 'dzRatesByYear' | 'dzStartDate'>) => void;
}

type Fila = { año: string; porcentaje: string };

const aFilas = (tabla: Record<string, number>): Fila[] =>
  Object.keys(tabla)
    .sort()
    .map(año => ({ año, porcentaje: String(Math.round(tabla[año] * 1000) / 10).replace('.', ',') }));

/** Valida las filas: años de 4 cifras sin repetir, porcentajes entre 0 y 100. Devuelve la tabla o el error. */
function validarTasas(filas: Fila[]): { tabla: Record<string, number> } | { error: string } {
  const tabla: Record<string, number> = {};
  for (const f of filas) {
    const año = f.año.trim();
    const pct = Number(f.porcentaje.trim().replace(',', '.'));
    if (!/^\d{4}$/.test(año)) return { error: `"${f.año}" no es un año (4 cifras).` };
    if (año in tabla) return { error: `El año ${año} está repetido.` };
    if (!Number.isFinite(pct) || pct < 0 || pct >= 100) return { error: `La tasa de ${año} tiene que ser un porcentaje entre 0 y 100.` };
    tabla[año] = Math.round(pct * 10) / 1000;
  }
  if (!Object.keys(tabla).length) return { error: 'Tiene que haber al menos un año con su tasa.' };
  return { tabla };
}

/** Ajustes > Deducciones: tasa por año de la fecha de fin y fecha de inicio de deducciones. */
export function AjustesDeducciones({ config, onGuardar }: AjustesDeduccionesProps) {
  const completa = completarConfig(config);
  const [filas, setFilas] = useState<Fila[]>(() => aFilas(completa.dzRatesByYear!));
  const [inicio, setInicio] = useState(completa.dzStartDate!);
  const [error, setError] = useState<string | null>(null);
  const tituloId = useId();
  const inicioId = useId();

  const guardar = () => {
    const r = validarTasas(filas);
    if ('error' in r) return setError(r.error);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return setError('Elegí una fecha de inicio de tasas.');
    setError(null);
    onGuardar({ dzRatesByYear: r.tabla, dzStartDate: inicio });
  };

  const cambiar = (i: number, campo: keyof Fila, valor: string) => setFilas(fs => fs.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));

  return (
    <section aria-labelledby={tituloId} data-testid="ajustes-deducciones" className="bg-superficie border border-borde rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
      <h2 id={tituloId} className="text-base font-bold text-texto flex items-center gap-2">
        <Percent className="w-5 h-5 text-acento-texto" aria-hidden="true" />
        <span>Tasas</span>
      </h2>

      <div className="space-y-1">
        <label htmlFor={inicioId} className="font-semibold text-texto block">Fecha de inicio de tasas</label>
        <p className="text-texto-sec text-sm">Las estadías que terminaron antes se consideran ya resueltas y no aparecen en pendientes.</p>
        <input
          id={inicioId}
          type="date"
          data-testid="inicio-deducciones"
          value={inicio}
          onChange={e => setInicio(e.target.value)}
          className="min-h-12 w-full sm:w-auto px-3 rounded-xl bg-fondo border border-borde-fuerte text-texto"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="font-semibold text-texto">Tasa por año</legend>
        <p className="text-texto-sec text-sm">
          Se usa el año de la fecha de fin de la estadía, al finalizarla. Los años que no están usan la última tasa
          definida. Las estadías ya archivadas no se recalculan.
        </p>
        <ul className="space-y-2">
          {filas.map((f, i) => (
            <li key={i} className="flex items-center gap-2" data-testid="fila-tasa">
              <input
                aria-label={`Año ${i + 1}`}
                inputMode="numeric"
                value={f.año}
                onChange={e => cambiar(i, 'año', e.target.value)}
                className="min-h-12 w-24 px-3 rounded-xl bg-fondo border border-borde-fuerte text-texto font-mono"
              />
              <input
                aria-label={`Tasa del año ${f.año || i + 1} (%)`}
                inputMode="decimal"
                value={f.porcentaje}
                onChange={e => cambiar(i, 'porcentaje', e.target.value)}
                className="min-h-12 w-24 px-3 rounded-xl bg-fondo border border-borde-fuerte text-texto font-mono"
              />
              <span className="text-texto-sec">%</span>
              <button
                type="button"
                onClick={() => setFilas(fs => fs.filter((_, j) => j !== i))}
                disabled={filas.length === 1}
                aria-label={`Quitar el año ${f.año}`}
                className="min-w-12 min-h-12 flex items-center justify-center rounded-xl border border-borde-fuerte text-texto-sec hover:text-error disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => {
            const ultimo = Math.max(...filas.map(f => Number(f.año)).filter(Number.isFinite), new Date().getFullYear());
            setFilas(fs => [...fs, { año: String(ultimo + 1), porcentaje: fs[fs.length - 1]?.porcentaje ?? '18' }]);
          }}
          className="min-h-12 px-3 rounded-xl text-sm font-semibold border border-borde-fuerte bg-superficie-alt hover:bg-realce text-texto inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Agregar año
        </button>
      </fieldset>

      {error && <p role="alert" className="text-sm text-error font-semibold">{error}</p>}
      <button
        type="button"
        onClick={guardar}
        data-testid="guardar-deducciones"
        className="w-full sm:w-auto min-h-12 px-5 rounded-xl bg-acento hover:bg-acento-hover text-acento-fg font-bold cursor-pointer"
      >
        Guardar tasas
      </button>
    </section>
  );
}
