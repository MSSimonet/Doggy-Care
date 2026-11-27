import { useId, useState } from 'react';
import { DialogModal } from './DialogModal';
import { describirOperacion, type EstadoCola } from '../lib/colaPendientes';
import type { ConfirmOptions } from './ConfirmDialog';

interface IndicadorGuardadoProps {
  estado: EstadoCola;
  sinConexion: boolean;
  todoGuardado: boolean;
  onReintentar: () => void;
  onReintentarUno: (id: string) => void;
  onDescartar: (id: string) => void;
  onIniciarSesion: () => void;
  confirm: (opciones: ConfirmOptions) => Promise<boolean>;
}

const cambios = (n: number) => (n === 1 ? '1 cambio' : `${n} cambios`);

/**
 * Aviso de guardado: sin conexión, cambios pendientes, cambios con error, sesión vencida y "Todo guardado".
 * Nunca dice que algo está guardado si todavía no se subió. Texto de 14 px o más, anunciado a lectores de pantalla.
 */
export function IndicadorGuardado({ estado, sinConexion, todoGuardado, onReintentar, onReintentarUno, onDescartar, onIniciarSesion, confirm }: IndicadorGuardadoProps) {
  const [verErrores, setVerErrores] = useState(false);
  const tituloId = useId();
  const { pendientes, conError, requiereSesion, procesando, errorAlmacen } = estado;
  const hayAlgo = sinConexion || pendientes > 0 || conError.length > 0 || requiereSesion || errorAlmacen || todoGuardado;

  const descartar = async (id: string, descripcion: string) => {
    const ok = await confirm({
      title: 'Descartar cambio',
      message: <p>¿Descartar «{descripcion}»? Este cambio no se va a guardar en la nube y no se puede recuperar.</p>,
      confirmLabel: 'Descartar',
      tone: 'danger',
      confirmTestId: 'confirmar-descartar-cambio'
    });
    if (ok) onDescartar(id);
  };

  const lineas: { texto: string; tono: 'error' | 'info' | 'exito' }[] = [];
  if (errorAlmacen) lineas.push({ texto: errorAlmacen, tono: 'error' });
  if (requiereSesion) lineas.push({ texto: 'Tu sesión venció. Iniciá sesión de nuevo para guardar los cambios pendientes (no se pierden).', tono: 'error' });
  if (sinConexion) lineas.push({ texto: 'Sin conexión: los cambios quedan pendientes', tono: 'info' });
  if (pendientes > 0) {
    lineas.push({
      texto: procesando && !sinConexion ? `Guardando ${cambios(pendientes)}…` : `${pendientes === 1 ? '1 cambio pendiente' : `${pendientes} cambios pendientes`} de guardar`,
      tono: 'info'
    });
  }
  if (conError.length > 0) lineas.push({ texto: `${conError.length === 1 ? '1 cambio' : `${conError.length} cambios`} con error: no se guardaron`, tono: 'error' });
  if (!lineas.length && todoGuardado) lineas.push({ texto: '✓ Todo guardado', tono: 'exito' });

  const fondo = lineas.some(l => l.tono === 'error') ? 'bg-error/10 border-error/40' : lineas.some(l => l.tono === 'info') ? 'bg-info/10 border-info/40' : 'bg-exito/10 border-exito/40';

  return (
    <>
      <div role="status" aria-live="polite" data-testid="indicador-guardado" className={hayAlgo ? `border-t ${fondo} -mx-3 sm:-mx-4 lg:-mx-8 -mb-2.5 sm:-mb-3.5 mt-2.5 sm:mt-3.5 px-3 sm:px-4 lg:px-8 py-2` : 'sr-only'}>
        {hayAlgo && (
          <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex-1 min-w-0 text-sm font-semibold text-texto space-y-0.5">
              {lineas.map(l => (
                <p key={l.texto} data-testid={`guardado-${l.tono}`} className="break-words">{l.texto}</p>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {requiereSesion && (
                <button type="button" onClick={onIniciarSesion} className="min-h-12 px-4 rounded-xl text-sm font-bold bg-acento hover:bg-acento-hover text-acento-fg cursor-pointer">
                  Iniciar sesión
                </button>
              )}
              {pendientes > 0 && !procesando && !requiereSesion && (
                <button type="button" data-testid="reintentar-guardado" onClick={onReintentar} className="min-h-12 px-4 rounded-xl text-sm font-bold border border-borde-fuerte bg-superficie hover:bg-realce text-texto cursor-pointer">
                  Reintentar ahora
                </button>
              )}
              {conError.length > 0 && (
                <button type="button" data-testid="ver-cambios-con-error" onClick={() => setVerErrores(true)} className="min-h-12 px-4 rounded-xl text-sm font-bold bg-error-solido hover:bg-error-solido-hover text-sobre-solido cursor-pointer">
                  Ver
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {verErrores && conError.length > 0 && (
        <DialogModal onClose={() => setVerErrores(false)} labelledBy={tituloId}>
          <div data-testid="lista-cambios-con-error" className="bg-superficie border border-borde-fuerte rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <h2 id={tituloId} className="text-lg font-bold text-texto">Cambios que no se guardaron</h2>
            <p className="text-sm text-texto-sec">Siguen en este dispositivo. Podés reintentarlos (por ejemplo, después de arreglar el permiso o el dato) o descartarlos.</p>
            <ul className="space-y-3">
              {conError.map(op => {
                const descripcion = describirOperacion(op);
                return (
                  <li key={op.id} className="rounded-xl border border-borde p-3 space-y-2">
                    <p className="text-sm font-semibold text-texto">{descripcion}</p>
                    <p className="text-sm text-texto-sec break-words">Error: {op.error}</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => onReintentarUno(op.id)} className="flex-1 min-h-12 rounded-xl text-sm font-bold bg-acento hover:bg-acento-hover text-acento-fg cursor-pointer">
                        Reintentar
                      </button>
                      <button type="button" data-testid="descartar-cambio" onClick={() => descartar(op.id, descripcion)} className="flex-1 min-h-12 rounded-xl text-sm font-bold border border-borde-fuerte bg-superficie-alt hover:bg-realce text-texto cursor-pointer">
                        Descartar
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <button type="button" onClick={() => setVerErrores(false)} className="w-full min-h-12 rounded-xl text-sm font-bold border border-borde-fuerte bg-superficie-alt hover:bg-realce text-texto cursor-pointer">
              Cerrar
            </button>
          </div>
        </DialogModal>
      )}
    </>
  );
}
