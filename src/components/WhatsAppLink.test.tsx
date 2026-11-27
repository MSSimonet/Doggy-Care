// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivacyProvider } from './PrivacyProvider';
import { WhatsAppLink, whatsappUrl } from './WhatsAppLink';
import { PRIVACY_STORAGE_KEY } from '../lib/privacidad';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  vi.restoreAllMocks();
});

const mount = () => act(() => root.render(<PrivacyProvider><WhatsAppLink contact="11 5555-1234" /></PrivacyProvider>));

describe('WhatsAppLink', () => {
  it('arma la dirección con prefijo 549 y sólo dígitos', () => {
    expect(whatsappUrl('11 5555-1234')).toBe('https://wa.me/549115555123' + '4');
  });

  it('sin privacidad es un enlace a wa.me', () => {
    mount();
    const a = container.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://wa.me/5491155551234');
  });

  it('con privacidad no hay href ni dígitos en la página, y el botón abre WhatsApp al tocarlo', () => {
    localStorage.setItem(PRIVACY_STORAGE_KEY, '1');
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);
    mount();
    expect(container.querySelector('a')).toBeNull();
    expect(container.innerHTML).not.toContain('5555');
    expect(container.innerHTML).not.toContain('wa.me');
    const boton = container.querySelector<HTMLButtonElement>('button')!;
    expect(boton.getAttribute('aria-label')).toBe('Abrir WhatsApp');
    act(() => boton.click());
    expect(abrir).toHaveBeenCalledWith('https://wa.me/5491155551234', '_blank', 'noopener,noreferrer');
  });
});
