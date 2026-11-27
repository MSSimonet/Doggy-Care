// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, useConfirm, type ConfirmOptions } from './ConfirmDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom no trae <dialog>.showModal()/close(): se simula lo que hace el navegador
beforeAll(() => {
  const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
  proto.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe('ConfirmDialog', () => {
  it('es un diálogo modal con nombre y descripción accesibles', () => {
    act(() => root.render(<ConfirmDialog title="Finalizar estadía" message="Se archiva." onConfirm={() => {}} onCancel={() => {}} />));
    const dialog = container.querySelector('dialog')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.hasAttribute('open')).toBe(true);
    const titleId = dialog.getAttribute('aria-labelledby')!;
    const descId = dialog.getAttribute('aria-describedby')!;
    expect(document.getElementById(titleId)?.textContent).toBe('Finalizar estadía');
    expect(document.getElementById(descId)?.textContent).toBe('Se archiva.');
  });

  it('confirma sólo al tocar el botón de confirmar', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    act(() => root.render(<ConfirmDialog title="t" message="m" confirmLabel="Finalizar" onConfirm={onConfirm} onCancel={onCancel} />));
    act(() => byTestId('confirm-dialog-confirm')!.click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Cancelar y Escape (evento close del diálogo) cancelan', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    act(() => root.render(<ConfirmDialog title="t" message="m" onConfirm={onConfirm} onCancel={onCancel} />));
    act(() => byTestId('confirm-dialog-cancel')!.click());
    expect(onCancel).toHaveBeenCalledTimes(1);
    act(() => { container.querySelector('dialog')!.dispatchEvent(new Event('close')); });
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('nunca confirma solo con el paso del tiempo (sin cuenta regresiva)', () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    act(() => root.render(<ConfirmDialog title="¿Finalizar estadía?" message="m" onConfirm={onConfirm} onCancel={() => {}} />));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(container.querySelector('dialog')!.hasAttribute('open')).toBe(true);
  });

  it('un cambio de onCancel en cada render no vuelve a abrir el diálogo', () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype as unknown as { showModal: () => void }, 'showModal');
    const render = () => act(() => root.render(<ConfirmDialog title="t" message="m" onConfirm={() => {}} onCancel={() => {}} />));
    render();
    render();
    render();
    expect(showModal).toHaveBeenCalledTimes(1);
  });

  it('el foco empieza en Cancelar', () => {
    act(() => root.render(<ConfirmDialog title="t" message="m" onConfirm={() => {}} onCancel={() => {}} />));
    expect(byTestId('confirm-dialog-cancel')!.hasAttribute('autofocus') || document.activeElement === byTestId('confirm-dialog-cancel')).toBe(true);
  });
});

describe('useConfirm', () => {
  function Harness({ options, onResult }: { options: ConfirmOptions; onResult: (v: boolean) => void }) {
    const { confirm, confirmDialog } = useConfirm();
    return (
      <>
        <button data-testid="abrir" onClick={async () => onResult(await confirm(options))} />
        {confirmDialog}
      </>
    );
  }

  it('resuelve true al confirmar y cierra el diálogo', async () => {
    const onResult = vi.fn();
    act(() => root.render(<Harness options={{ title: 't', message: 'm' }} onResult={onResult} />));
    expect(container.querySelector('dialog')).toBeNull();
    act(() => byTestId('abrir')!.click());
    expect(container.querySelector('dialog')).not.toBeNull();
    await act(async () => byTestId('confirm-dialog-confirm')!.click());
    expect(onResult).toHaveBeenCalledWith(true);
    expect(container.querySelector('dialog')).toBeNull();
  });

  it('resuelve false al cancelar', async () => {
    const onResult = vi.fn();
    act(() => root.render(<Harness options={{ title: 't', message: 'm' }} onResult={onResult} />));
    act(() => byTestId('abrir')!.click());
    await act(async () => byTestId('confirm-dialog-cancel')!.click());
    expect(onResult).toHaveBeenCalledWith(false);
    expect(container.querySelector('dialog')).toBeNull();
  });
});
