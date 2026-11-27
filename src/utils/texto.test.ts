import { describe, it, expect } from 'vitest';
import { cantidad, dias, estadias } from './texto';

describe('singular y plural', () => {
  it('1 va en singular', () => {
    expect(dias(1)).toBe('1 día');
    expect(estadias(1)).toBe('1 estadía');
    expect(cantidad(1, 'día activo', 'días activos')).toBe('1 día activo');
  });

  it('0 y más de 1 van en plural', () => {
    expect(dias(0)).toBe('0 días');
    expect(dias(2)).toBe('2 días');
    expect(estadias(7)).toBe('7 estadías');
  });

  it('miles con punto, como en el resto de la app', () => {
    expect(cantidad(1500, 'registro', 'registros')).toBe('1.500 registros');
  });

  it('un valor no numérico cuenta como 0', () => {
    expect(dias(Number.NaN)).toBe('0 días');
  });
});
