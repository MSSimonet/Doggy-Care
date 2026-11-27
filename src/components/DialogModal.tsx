import React, { useEffect, useRef } from 'react';

interface DialogModalProps {
  onClose: () => void;
  children: React.ReactNode;
  /** id del título del diálogo (nombre accesible) */
  labelledBy?: string;
  /** id del texto que describe el diálogo */
  describedBy?: string;
}

/**
 * Diálogo nativo con showModal(): modal (aria-modal), Esc automático y foco atrapado por el navegador.
 * `onClose` se lee desde una ref: si cambia en cada render del padre, el diálogo no se vuelve a abrir.
 */
export function DialogModal({ onClose, children, labelledBy, describedBy }: DialogModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const handleClose = () => onCloseRef.current();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, []);

  return (
    <dialog
      ref={ref}
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={e => { if (e.target === ref.current) ref.current?.close(); }}
      // Chrome no desplaza un elemento enfocado que ya está a medias en pantalla; así el contorno de foco queda entero
      onFocus={e => (e.target as HTMLElement).scrollIntoView?.({ block: 'nearest', inline: 'nearest' })}
      className="p-0 m-auto bg-transparent border-0 max-w-none w-full h-full max-h-none backdrop:bg-black/80 backdrop:backdrop-blur-sm"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.75rem' }}
    >
      {children}
    </dialog>
  );
}
