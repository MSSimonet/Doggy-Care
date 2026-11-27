// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PrivacyProvider, usePrivacy } from './PrivacyProvider';
import { PRIVACY_STORAGE_KEY } from '../lib/privacidad';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  const { isPrivacyMode, togglePrivacy, mask } = usePrivacy();
  return (
    <div>
      <button data-testid="toggle" aria-pressed={isPrivacyMode} onClick={togglePrivacy} />
      <span data-testid="tel">{mask('telefono', '11 5555-1234')}</span>
      <span data-testid="dir">{mask('direccion', 'Calle Falsa 123')}</span>
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const q = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const mount = () => act(() => root.render(<PrivacyProvider><Probe /></PrivacyProvider>));

describe('PrivacyProvider', () => {
  it('apagado muestra los datos; al activarlo los enmascara en todos los consumidores', () => {
    mount();
    expect(q('tel').textContent).toBe('11 5555-1234');
    expect(q('toggle').getAttribute('aria-pressed')).toBe('false');
    act(() => q('toggle').click());
    expect(q('toggle').getAttribute('aria-pressed')).toBe('true');
    expect(q('tel').textContent).not.toMatch(/\d/);
    expect(q('dir').textContent).toBe('Dirección oculta');
    expect(container.innerHTML).not.toContain('Calle Falsa');
    expect(container.innerHTML).not.toContain('5555');
  });

  it('se guarda en el almacenamiento local y se recupera al volver a abrir', () => {
    mount();
    act(() => q('toggle').click());
    expect(localStorage.getItem(PRIVACY_STORAGE_KEY)).toBe('1');
    act(() => root.unmount());
    root = createRoot(container);
    mount();
    expect(q('toggle').getAttribute('aria-pressed')).toBe('true');
    expect(q('tel').textContent).not.toMatch(/\d/);
  });

  it('al desactivarlo vuelve a mostrar los datos y borra la marca guardada', () => {
    localStorage.setItem(PRIVACY_STORAGE_KEY, '1');
    mount();
    act(() => q('toggle').click());
    expect(q('tel').textContent).toBe('11 5555-1234');
    expect(localStorage.getItem(PRIVACY_STORAGE_KEY)).toBeNull();
  });

  it('usePrivacy fuera del proveedor falla con un mensaje claro', () => {
    const errores = console.error;
    console.error = () => {};
    expect(() => act(() => root.render(<Probe />))).toThrow(/PrivacyProvider/);
    console.error = errores;
  });
});
