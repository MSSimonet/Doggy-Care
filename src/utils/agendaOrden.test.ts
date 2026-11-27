import { describe, expect, it } from 'vitest';
import { archivadoEn, normalizarFecha } from './agendaOrden';

describe('normalizarFecha', () => {
  it('acepta fechas ISO válidas y rechaza inexistentes', () => {
    expect(normalizarFecha('2026-03-09')).toBe('2026-03-09');
    expect(normalizarFecha('2026-02-30')).toBeNull();
    expect(normalizarFecha('2026-13-01')).toBeNull();
    expect(normalizarFecha('')).toBeNull();
    expect(normalizarFecha(undefined)).toBeNull();
    expect(normalizarFecha('mañana')).toBeNull();
  });

  it('"D/M" toma el año de cuándo se archivó', () => {
    const archivado = Date.parse('2026-11-24T12:00:00Z');
    const ahora = Date.parse('2026-12-01T00:00:00Z');
    expect(normalizarFecha('12/3', archivado, ahora)).toBe('2026-03-12');
    expect(normalizarFecha('22/10', archivado, ahora)).toBe('2026-10-22');
  });

  it('"D/M" de fin de año archivado en enero cae en el año anterior', () => {
    const archivado = Date.parse('2027-01-03T12:00:00Z');
    expect(normalizarFecha('30/12', archivado, Date.parse('2027-02-01T00:00:00Z'))).toBe('2026-12-30');
  });

});

describe('archivadoEn', () => {
  it('id con hora válida: la lee', () => {
    expect(archivadoEn('hist-agenda-stay-77-1795573200000')).toBe(1795573200000);
  });

  it('id sin hora: no hay momento', () => {
    expect(archivadoEn('hist-agenda-stay-77')).toBeUndefined();
    expect(archivadoEn('hist-1')).toBeUndefined();
    expect(archivadoEn(undefined)).toBeUndefined();
    expect(archivadoEn('')).toBeUndefined();
  });

  it('id con formato roto: no hay momento y nunca lanza', () => {
    const rotos = [
      'hist-agenda-',
      'hist-agenda--',
      'hist-agenda-stay-77-abc',
      'hist-agenda-stay-77-1795573200000x',
      'hist-agenda-stay-77-99999999999999999999', // número enorme
      'hist-agenda-stay-77-1000000000', // año 2001 no es posible para una hora en milisegundos de 10 cifras
      'hist-agenda-stay-77-9999999999999', // año 2286
      'HIST-AGENDA-stay-77-1795573200000',
      null as unknown as string,
      42 as unknown as string
    ];
    for (const id of rotos) {
      expect(() => archivadoEn(id)).not.toThrow();
      expect(archivadoEn(id)).toBeUndefined();
    }
  });
});

describe('normalizarFecha: año de los "D/M" sin año (registros archivados)', () => {
  const AHORA = Date.parse('2026-11-24T12:00:00Z');

  it('con hora de archivado válida usa el año de esa hora', () => {
    const archivado = Date.parse('2025-06-10T12:00:00Z');
    expect(normalizarFecha('12/3', archivado, AHORA)).toBe('2025-03-12');
  });

  it('sin hora: usa la fecha más cercana al presente que no cae en el futuro', () => {
    expect(normalizarFecha('12/3', undefined, AHORA)).toBe('2026-03-12'); // ya pasó este año
    expect(normalizarFecha('25/12', undefined, AHORA)).toBe('2025-12-25'); // este año sería futuro: va al año anterior
    expect(normalizarFecha('24/11', undefined, AHORA)).toBe('2026-11-24'); // hoy no es futuro
  });

  it('hora ilegible o imposible: se trata como si faltara', () => {
    expect(normalizarFecha('12/3', Number.NaN, AHORA)).toBe('2026-03-12');
    expect(normalizarFecha('12/3', Date.parse('2090-01-01T00:00:00Z'), AHORA)).toBe('2026-03-12');
    expect(normalizarFecha('12/3', Date.parse('1990-01-01T00:00:00Z'), AHORA)).toBe('2026-03-12');
    expect(normalizarFecha('12/3', Number.POSITIVE_INFINITY, AHORA)).toBe('2026-03-12');
  });

  it('cerca de fin de año, con hora de archivado en enero: cae en el año anterior', () => {
    expect(normalizarFecha('30/12', Date.parse('2027-01-03T12:00:00Z'), Date.parse('2027-02-01T00:00:00Z'))).toBe('2026-12-30');
    expect(normalizarFecha('2/1', Date.parse('2027-01-03T12:00:00Z'), Date.parse('2027-02-01T00:00:00Z'))).toBe('2027-01-02');
  });

  it('cerca de fin de año, sin hora: nunca elige una fecha futura', () => {
    expect(normalizarFecha('30/12', undefined, Date.parse('2027-01-03T12:00:00Z'))).toBe('2026-12-30');
    expect(normalizarFecha('1/1', undefined, Date.parse('2026-12-31T23:00:00Z'))).toBe('2026-01-01');
    expect(normalizarFecha('31/12', undefined, Date.parse('2026-12-31T23:00:00Z'))).toBe('2026-12-31');
  });

  it('29/2 busca el último año bisiesto que no sea futuro', () => {
    expect(normalizarFecha('29/2', undefined, AHORA)).toBe('2024-02-29');
  });

  it('un "D/M" imposible queda sin fecha, sin lanzar ni inventar una fecha inválida', () => {
    for (const malo of ['31/2', '0/5', '5/13', '32/1', '1/0', '1/2/3', 'a/b', '/', '12-3', '  ']) {
      expect(() => normalizarFecha(malo, undefined, AHORA)).not.toThrow();
      expect(normalizarFecha(malo, undefined, AHORA)).toBeNull();
      expect(normalizarFecha(malo, Date.parse('2026-01-01T00:00:00Z'), AHORA)).toBeNull();
    }
  });

  it('todo lo que devuelve es una fecha real', () => {
    const entradas = ['12/3', '25/12', '29/2', '31/12', '1/1', '15/6'];
    const horas = [undefined, Number.NaN, Date.parse('2024-02-10T00:00:00Z'), Date.parse('2027-01-03T00:00:00Z')];
    for (const e of entradas) {
      for (const h of horas) {
        const r = normalizarFecha(e, h, AHORA);
        if (r !== null) {
          expect(r).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(new Date(`${r}T00:00:00Z`).toISOString().slice(0, 10)).toBe(r);
        }
      }
    }
  });
});
