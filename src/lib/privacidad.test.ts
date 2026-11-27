import { beforeEach, describe, expect, it } from 'vitest';
import { MASCARAS, PRIVACY_STORAGE_KEY, enmascarar, loadPrivacyMode, savePrivacyMode } from './privacidad';

beforeEach(() => localStorage.clear());

describe('enmascarar', () => {
  it('sin modo privacidad devuelve el dato tal cual', () => {
    expect(enmascarar('telefono', '11 5555-1234', false)).toBe('11 5555-1234');
    expect(enmascarar('direccion', 'Calle Falsa 123', false)).toBe('Calle Falsa 123');
    expect(enmascarar('dueno', undefined, false)).toBe('');
  });

  it('con modo privacidad devuelve una máscara fija que no contiene el dato', () => {
    const datos = { telefono: '11 5555-1234', direccion: 'Calle Falsa 123', familiares: 'Marta (madre)', dueno: 'Laura' } as const;
    for (const tipo of Object.keys(datos) as (keyof typeof datos)[]) {
      const m = enmascarar(tipo, datos[tipo], true);
      expect(m).toBe(MASCARAS[tipo]);
      expect(m).not.toContain(datos[tipo]);
    }
    expect(enmascarar('telefono', '11 5555-1234', true)).not.toMatch(/\d/);
  });

  it('la máscara no revela el largo del dato', () => {
    expect(enmascarar('direccion', 'A', true)).toBe(enmascarar('direccion', 'Una dirección muy, muy larga 12345', true));
  });

  it('un dato vacío queda vacío (la pantalla muestra su "Sin registrar")', () => {
    expect(enmascarar('familiares', '', true)).toBe('');
    expect(enmascarar('familiares', '   ', true)).toBe('');
    expect(enmascarar('familiares', null, true)).toBe('');
  });
});

describe('persistencia del modo privacidad', () => {
  it('por defecto está apagado', () => {
    expect(loadPrivacyMode()).toBe(false);
  });

  it('se guarda y se recupera', () => {
    savePrivacyMode(true);
    expect(localStorage.getItem(PRIVACY_STORAGE_KEY)).toBe('1');
    expect(loadPrivacyMode()).toBe(true);
    savePrivacyMode(false);
    expect(loadPrivacyMode()).toBe(false);
    expect(localStorage.getItem(PRIVACY_STORAGE_KEY)).toBeNull();
  });

  it('un valor desconocido se toma como apagado', () => {
    localStorage.setItem(PRIVACY_STORAGE_KEY, 'quizás');
    expect(loadPrivacyMode()).toBe(false);
  });
});
