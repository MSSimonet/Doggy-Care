/**
 * Casilla con etiqueta visible: 20 px de casilla y un área táctil de 44 px de alto (la etiqueta entera se toca)
 * sin agrandar la fila. El nombre accesible empieza con la etiqueta visible.
 */
export function Casilla({
  etiqueta,
  marcada,
  onCambiar,
  descripcion,
  testId,
  deshabilitada = false,
  titulo
}: {
  etiqueta: string;
  marcada: boolean;
  onCambiar: () => void;
  descripcion: string;
  testId: string;
  deshabilitada?: boolean;
  titulo?: string;
}) {
  return (
    <label
      title={titulo}
      className={`shrink-0 min-h-11 min-w-11 px-1.5 -my-1 inline-flex items-center gap-2 rounded-lg select-none ${
        deshabilitada ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-info/10'
      }`}
    >
      <input
        type="checkbox"
        checked={marcada}
        disabled={deshabilitada}
        onChange={onCambiar}
        data-testid={testId}
        aria-label={`${etiqueta}: ${descripcion}`}
        className="w-5 h-5 shrink-0 accent-info-solido cursor-pointer disabled:cursor-not-allowed"
      />
      <span className="text-sm font-semibold text-texto">{etiqueta}</span>
    </label>
  );
}
