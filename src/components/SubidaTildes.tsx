import { useId, useState } from 'react';
import { CloudUpload } from 'lucide-react';
import type { ConfirmOptions } from './ConfirmDialog';
import type { NuevaOperacion } from '../lib/colaPendientes';
import type { Marcas } from '../lib/marcasDeduccion';
import type { Lectura, TildeNube } from '../lib/supabase';
import { planificarSubida, subirTildesLocales, type PlanSubida, type ResultadoSubida } from '../lib/subidaTildes';

interface SubidaTildesProps {
  leerNube: () => Promise<Lectura<TildeNube[]>>;
  leerMarcas: () => Marcas;
  subir: (ops: NuevaOperacion[]) => Promise<boolean>;
  borrarMarcas: (ids: string[]) => boolean;
  confirm: (opciones: ConfirmOptions) => Promise<boolean>;
}

const n = (cant: number, uno: string, varios: string) => `${cant} ${cant === 1 ? uno : varios}`;

/**
 * Ajustes > Tildes de deducciones: sube a la nube los tildes de "Deducida" que quedaron sólo en este dispositivo.
 * Primero se revisa (sólo lectura); subir pide confirmación, no pisa lo que la nube ya tiene y, al terminar,
 * borra la copia local de lo que la nube confirmó.
 */
export function SubidaTildes({ leerNube, leerMarcas, subir, borrarMarcas, confirm }: SubidaTildesProps) {
  const tituloId = useId();
  const [ocupado, setOcupado] = useState(false);
  const [plan, setPlan] = useState<PlanSubida | null>(null);
  const [resultado, setResultado] = useState<ResultadoSubida | null>(null);
  const [error, setError] = useState<string | null>(null);

  const revisar = async () => {
    setOcupado(true);
    setError(null);
    setResultado(null);
    const r = await leerNube();
    setOcupado(false);
    if (!r.ok) {
      setPlan(null);
      setError(r.error);
      return;
    }
    setPlan(planificarSubida(leerMarcas(), r.data));
  };

  const limpiables = plan ? plan.yaEnLaNube.length + plan.destildadas.length + plan.sinFila.length : 0;

  const subirAhora = async () => {
    if (!plan || (!plan.porSubir.length && !limpiables)) return;
    const ok = await confirm(plan.porSubir.length
      ? {
          title: 'Subir tildes a la nube',
          message: (
            <p>
              Se van a subir <strong>{n(plan.porSubir.length, 'tilde', 'tildes')}</strong> de este teléfono. Los que la nube ya tiene tildados
              no se tocan. Al terminar se borra la copia de este teléfono de lo que la nube confirme.
            </p>
          ),
          confirmLabel: `Subir ${plan.porSubir.length}`,
          confirmTestId: 'confirmar-subir-tildes'
        }
      : {
          title: 'Borrar la copia de este teléfono',
          message: (
            <p>
              La nube ya tiene los tildes. Se borra la copia de <strong>{n(limpiables, 'tilde', 'tildes')}</strong> que quedó en este teléfono
              (sólo la de lo que la nube confirme). No cambia nada en la nube.
            </p>
          ),
          confirmLabel: `Borrar ${limpiables}`,
          confirmTestId: 'confirmar-subir-tildes'
        });
    if (!ok) return;
    setOcupado(true);
    setError(null);
    const r = await subirTildesLocales({ leerNube, marcas: leerMarcas(), subir, borrarMarcas });
    setOcupado(false);
    if (!r.ok) return setError(r.error);
    setResultado(r);
    const otra = await leerNube();
    setPlan(otra.ok ? planificarSubida(leerMarcas(), otra.data) : null);
  };

  return (
    <section aria-labelledby={tituloId} data-testid="subida-tildes" className="bg-superficie border border-borde rounded-xl p-3 shadow-md space-y-2">
      <h2 id={tituloId} className="text-sm font-bold text-texto flex items-center gap-1.5">
        <CloudUpload className="w-4 h-4 text-acento-texto" aria-hidden="true" />
        Tildes de tasas en la nube
      </h2>
      <p className="text-sm text-texto-sec">
        Los tildes de “Tasa” que hiciste mientras la nube no tenía las columnas quedaron sólo en este teléfono. Acá se revisan y se suben una vez.
      </p>
      <div role="status" aria-live="polite" className="space-y-1 text-sm text-texto">
        {plan && (
          <ul data-testid="resumen-subida" className="space-y-0.5">
            <li>En la nube: <strong data-testid="en-la-nube">{n(plan.enLaNube, 'transferida', 'transferidas')}</strong></li>
            <li>En este teléfono: <strong>{n(plan.locales, 'tilde', 'tildes')}</strong></li>
            <li>Por subir: <strong data-testid="por-subir">{plan.porSubir.length}</strong>
              {plan.yaEnLaNube.length > 0 && <span className="text-texto-sec"> · {plan.yaEnLaNube.length} ya están en la nube</span>}
            </li>
          </ul>
        )}
        {resultado?.ok && (
          <p data-testid="resultado-subida" className="font-semibold">
            Subidas y confirmadas: {resultado.subidas}. En la nube ahora: {n(resultado.despues, 'transferida', 'transferidas')}. Copia de este teléfono borrada: {resultado.borradas}.
            {resultado.sinConfirmar > 0 && <span className="block text-error">No se pudieron confirmar {resultado.sinConfirmar}: siguen guardadas en este teléfono. Reintentá cuando haya conexión.</span>}
          </p>
        )}
        {error && (
          <p role="alert" data-testid="error-subida" className="text-error font-semibold break-words">
            No se pudo leer la nube: {error}{/dz_|column/i.test(error) ? ' (probablemente falta aplicar la migración 005).' : ''}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={revisar}
          disabled={ocupado}
          data-testid="revisar-tildes"
          className="min-h-11 px-3 rounded-lg text-sm font-semibold border border-borde-fuerte bg-superficie-alt hover:bg-realce text-texto disabled:opacity-60 cursor-pointer"
        >
          {ocupado ? 'Revisando…' : 'Revisar'}
        </button>
        {plan && plan.porSubir.length > 0 && (
          <button
            type="button"
            onClick={subirAhora}
            disabled={ocupado}
            data-testid="subir-tildes"
            className="min-h-11 px-3 rounded-lg text-sm font-bold bg-acento hover:bg-acento-hover text-acento-fg disabled:opacity-60 cursor-pointer"
          >
            Subir {plan.porSubir.length}
          </button>
        )}
        {plan && plan.porSubir.length === 0 && limpiables > 0 && (
          <button
            type="button"
            onClick={subirAhora}
            disabled={ocupado}
            data-testid="limpiar-copia-local"
            className="min-h-11 px-3 rounded-lg text-sm font-semibold border border-borde-fuerte bg-superficie-alt hover:bg-realce text-texto disabled:opacity-60 cursor-pointer"
          >
            Borrar copia de este teléfono ({limpiables})
          </button>
        )}
      </div>
    </section>
  );
}
