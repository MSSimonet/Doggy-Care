import { Trash2 } from 'lucide-react';
import { HistoricalStayRecord } from '../data/historialData';

export function DeleteStayButton({ record, onRequestDelete }: { record: HistoricalStayRecord; onRequestDelete: (r: HistoricalStayRecord) => void }) {
  return (
    <button
      type="button"
      onClick={() => onRequestDelete(record)}
      data-testid="borrar-estadia"
      aria-label={`Borrar estadía de ${record.dogName} del ${record.fromDay} al ${record.untilDay}`}
      className="h-12 min-w-12 px-3 inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold border border-error bg-error/10 text-error hover:bg-error/20 cursor-pointer whitespace-nowrap"
    >
      <Trash2 className="w-4 h-4" aria-hidden="true" />
      <span>Borrar</span>
    </button>
  );
}
