import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { DialogModal } from './DialogModal';

export type ConfirmTone = 'default' | 'danger' | 'success';

export interface ConfirmOptions {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = acción destructiva (botón rojo); success = acción positiva (botón verde) */
  tone?: ConfirmTone;
  testId?: string;
  confirmTestId?: string;
}

export interface ConfirmDialogProps extends ConfirmOptions {
  onConfirm: () => void;
  onCancel: () => void;
}

const TONE_STYLES: Record<ConfirmTone, { border: string; confirm: string }> = {
  default: { border: 'border-borde-fuerte', confirm: 'bg-acento hover:bg-acento-hover text-acento-fg' },
  danger: { border: 'border-borde-fuerte', confirm: 'bg-error-solido hover:bg-error-solido-hover text-sobre-solido' },
  success: { border: 'border-exito/40', confirm: 'bg-exito-solido hover:bg-exito-solido-hover text-sobre-solido' }
};

/**
 * Confirmación única de la app. Sólo confirma cuando la persona toca el botón de confirmar:
 * Esc, tocar fuera o "Cancelar" cancelan. El foco empieza en "Cancelar" para que Enter no confirme por error.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'default',
  testId = 'confirm-dialog',
  confirmTestId = 'confirm-dialog-confirm',
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const styles = TONE_STYLES[tone];
  return (
    <DialogModal onClose={onCancel} labelledBy={titleId} describedBy={messageId}>
      <div data-testid={testId} className={`bg-superficie border ${styles.border} rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-5`}>
        <h2 id={titleId} className="text-lg font-bold text-texto">{title}</h2>
        <div id={messageId} className="text-texto">{message}</div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            autoFocus
            data-testid="confirm-dialog-cancel"
            className="flex-1 min-h-12 font-bold rounded-xl bg-superficie-alt hover:bg-realce text-texto border border-borde-fuerte cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            data-testid={confirmTestId}
            className={`flex-1 min-h-12 font-bold rounded-xl cursor-pointer ${styles.confirm}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </DialogModal>
  );
}

/**
 * `confirm(opciones)` devuelve una promesa: true si confirmó, false si canceló.
 * Renderizar `confirmDialog` una vez en el componente.
 * Pedir otra confirmación mientras hay una abierta cancela la anterior.
 */
export function useConfirm(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  confirmDialog: React.ReactNode;
} {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback((next: ConfirmOptions) => {
    resolver.current?.(false);
    return new Promise<boolean>(resolve => {
      resolver.current = resolve;
      setOptions(next);
    });
  }, []);

  // Si el componente se desmonta con una confirmación abierta, la promesa no queda colgada
  useEffect(() => () => resolver.current?.(false), []);

  const confirmDialog = options
    ? <ConfirmDialog {...options} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
    : null;
  return { confirm, confirmDialog };
}
