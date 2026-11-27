import { useId } from 'react';
import { ArchiveRestore } from 'lucide-react';
import type { BorradoReciente } from '../lib/borradosRecientes';

interface BorradosRecientesProps {
  borrados: BorradoReciente[];
  onRestaurar: (borrado: BorradoReciente) => void;
}

const fecha = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return a && m && d ? `${d}/${m}/${a}` : iso;
};

/** Ajustes > Borrados recientes: los últimos 30 registros borrados del Historial, guardados en este dispositivo. */
export function BorradosRecientes({ borrados, onRestaurar }: BorradosRecientesProps) {
  const tituloId = useId();
  return (
    <section aria-labelledby={tituloId} data-testid="borrados-recientes" className="bg-superficie border border-borde rounded-xl p-3 shadow-md space-y-2">
      <h2 id={tituloId} className="text-sm font-bold text-texto flex items-center gap-1.5">
        <ArchiveRestore className="w-4 h-4 text-acento-texto" aria-hidden="true" />
        Borrados recientes
      </h2>
      <p className="text-sm text-texto-sec">
        Antes de borrar un registro se guarda una copia en este teléfono (los últimos 30). Restaurar lo vuelve al Historial y a la nube.
      </p>
      {borrados.length === 0 ? (
        <p className="text-sm text-texto-sec" data-testid="sin-borrados">No hay borrados recientes.</p>
      ) : (
        <ul className="divide-y divide-borde/60" data-testid="lista-borrados">
          {borrados.map(b => (
            <li key={b.registro.id} data-testid="borrado" className="flex items-center justify-between gap-2 py-1 text-sm">
              <div className="min-w-0">
                <p className="font-bold text-texto truncate">{(b.registro.dogName || '').trim()}</p>
                <p className="text-texto-sec">
                  {b.registro.fromDay} → {b.registro.untilDay} · borrado el {fecha(b.borradoEn)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRestaurar(b)}
                data-testid="restaurar-borrado"
                aria-label={`Restaurar la estadía de ${b.registro.dogName} (${b.registro.fromDay} → ${b.registro.untilDay})`}
                className="shrink-0 min-h-11 px-3 rounded-lg text-sm font-semibold border border-borde-fuerte bg-superficie-alt hover:bg-realce text-texto cursor-pointer"
              >
                Restaurar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
