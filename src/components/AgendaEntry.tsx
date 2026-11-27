import React, { useEffect, useId, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

interface AgendaEntryProps {
  /** Nombre que se ve con la entrada plegada */
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  /** Clases del contorno de la tarjeta (borde, fondo, sombra) */
  className?: string;
  /** Contenido del desplegado. Sólo se monta mientras la entrada está abierta. */
  children: React.ReactNode;
  testId?: string;
}

const prefiereMenosMovimiento = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Entrada plegable de la Agenda: una fila con el nombre y, al tocarla, el resto de la ficha.
 * Es un <button> (Enter y Espacio nativos) con aria-expanded y aria-controls; el desplegado es una región
 * con nombre. Al abrirse, si queda fuera de pantalla, se desplaza hasta ella (sin animación si el sistema
 * pide menos movimiento).
 */
export function AgendaEntry({ title, isOpen, onToggle, className = '', children, testId = 'agenda-entry' }: AgendaEntryProps) {
  const botonId = useId();
  const panelId = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const yaMontada = useRef(false);

  useEffect(() => {
    // No desplazar al montar; sólo cuando la persona abre la entrada
    if (!yaMontada.current) {
      yaMontada.current = true;
      return;
    }
    if (!isOpen) return;
    const el = raiz.current;
    if (!el || typeof el.scrollIntoView !== 'function') return;
    // Esperar a que se pinte el desplegado y a que se pliegue la entrada anterior
    const frame = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      if (r.top < 0 || r.bottom > vh) {
        el.scrollIntoView({ block: 'nearest', behavior: prefiereMenosMovimiento() ? 'auto' : 'smooth' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  return (
    // scroll-mt deja lugar al encabezado fijo al desplazarse hasta la entrada
    <div ref={raiz} data-testid={testId} data-open={isOpen ? 'true' : 'false'} className={`rounded-2xl shadow-lg border scroll-mt-24 ${className}`}>
      <h3 className="m-0">
        <button
          type="button"
          id={botonId}
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={onToggle}
          data-testid="agenda-entry-toggle"
          className="w-full min-h-12 px-5 py-3 flex items-center justify-between gap-3 text-left rounded-2xl cursor-pointer"
        >
          <span className="font-extrabold text-texto text-lg tracking-tight truncate">{title}</span>
          <ChevronDown
            className={`w-5 h-5 shrink-0 text-texto-sec motion-safe:transition-transform ${isOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </h3>
      <div id={panelId} role="region" aria-labelledby={botonId} hidden={!isOpen} className="px-5 pb-5">
        {isOpen && children}
      </div>
    </div>
  );
}
