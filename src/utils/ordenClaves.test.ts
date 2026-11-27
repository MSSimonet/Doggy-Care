import { describe, expect, it } from 'vitest';
import {
  claveDeRegistro,
  compararClaves,
  elegirNombreVisible,
  limpiarNombre,
  mejorClave,
  type ClaveOrden
} from './agendaOrden';

const reg = (nombre: string, o: { archivado?: number; secuencia?: number; fin?: string } = {}): ClaveOrden => ({
  archivado: o.archivado ?? null,
  secuencia: o.secuencia ?? null,
  fin: o.fin ?? null,
  nombre
});
const ordenar = (claves: ClaveOrden[]) => [...claves].sort(compararClaves).map(c => c.nombre);

describe('limpiarNombre', () => {
  it('saca espacios de los bordes y junta los repetidos, sin tocar mayúsculas ni tildes', () => {
    expect(limpiarNombre('  Ramón  ')).toBe('Ramón');
    expect(limpiarNombre('Bolita   VL')).toBe('Bolita VL');
    expect(limpiarNombre('')).toBe('');
    expect(limpiarNombre(undefined as unknown as string)).toBe('');
  });
});

describe('claveDeRegistro', () => {
  it('toma archivado del id, secuencia de rowIndex y fin de until_day', () => {
    const c = claveDeRegistro({ id: 'hist-agenda-s1-1795573200000', rowIndex: 290, untilDay: '2026-11-24', dogName: ' Tobias ' });
    expect(c).toEqual({ archivado: 1795573200000, secuencia: 290, fin: '2026-11-24', nombre: 'Tobias' });
  });

  it('un registro de la hoja no tiene hora de archivado: usa la secuencia', () => {
    const c = claveDeRegistro({ id: 'hist-12', rowIndex: 15, fromDay: '2024-01-02', untilDay: '2024-01-09', dogName: 'Lola' });
    expect(c.archivado).toBeNull();
    expect(c.secuencia).toBe(15);
    expect(c.fin).toBe('2024-01-09');
  });

  it('sin until_day usa from_day; sin ninguno, fin queda vacío; rowIndex 0 no es secuencia', () => {
    expect(claveDeRegistro({ rowIndex: 0, fromDay: '2024-03-02', dogName: 'A' })).toMatchObject({ secuencia: null, fin: '2024-03-02' });
    expect(claveDeRegistro({ dogName: 'A' })).toMatchObject({ archivado: null, secuencia: null, fin: null });
  });

  it('una fecha D/M se completa con el año de la hora de archivado', () => {
    const archivado = Date.parse('2026-11-20T12:00:00Z');
    const c = claveDeRegistro({ id: `hist-agenda-s1-${archivado}`, untilDay: '15/11', dogName: 'Max' }, archivado);
    expect(c.fin).toBe('2026-11-15');
  });
});

describe('compararClaves: más reciente primero', () => {
  it('primero la hora de archivado, del más nuevo al más viejo', () => {
    expect(
      ordenar([reg('Vieja', { archivado: 1700000000000 }), reg('Nueva', { archivado: 1795573200000 }), reg('Media', { archivado: 1750000000000 })])
    ).toEqual(['Nueva', 'Media', 'Vieja']);
  });

  it('con hora de archivado va antes que sin ella, aunque su fin sea anterior', () => {
    expect(
      ordenar([
        reg('DeLaHoja', { secuencia: 281, fin: '2026-11-24' }),
        reg('FinalizadaHoy', { archivado: 1795573200000, secuencia: 290, fin: '2026-03-01' })
      ])
    ).toEqual(['FinalizadaHoy', 'DeLaHoja']);
  });

  it('sin hora de archivado: mayor ID/secuencia primero', () => {
    expect(
      ordenar([reg('Id10', { secuencia: 10, fin: '2025-12-01' }), reg('Id200', { secuencia: 200, fin: '2023-01-01' }), reg('Id50', { secuencia: 50 })])
    ).toEqual(['Id200', 'Id50', 'Id10']);
  });

  it('empate de archivado o de secuencia: desempata por fin y después por nombre', () => {
    expect(ordenar([reg('B', { secuencia: 5, fin: '2024-01-01' }), reg('A', { secuencia: 5, fin: '2024-05-01' })])).toEqual(['A', 'B']);
    expect(ordenar([reg('Luna', { secuencia: 5, fin: '2024-01-01' }), reg('Bóxer', { secuencia: 5, fin: '2024-01-01' })])).toEqual(['Bóxer', 'Luna']);
    expect(
      ordenar([reg('Z', { archivado: 1795573200000, fin: '2024-01-01' }), reg('A', { archivado: 1795573200000, fin: '2024-02-01' })])
    ).toEqual(['A', 'Z']);
  });

  it('con secuencia va antes que con solo fin; con solo fin antes que sin dato; sin dato, por nombre', () => {
    expect(ordenar([reg('Zeta'), reg('SoloFin', { fin: '2026-12-01' }), reg('ConSeq', { secuencia: 1 }), reg('Alfa')])).toEqual([
      'ConSeq',
      'SoloFin',
      'Alfa',
      'Zeta'
    ]);
  });

  it('es un orden consistente: el resultado no depende del orden de entrada', () => {
    const base = [
      reg('A', { archivado: 3 }),
      reg('B', { secuencia: 9 }),
      reg('C', { fin: '2025-01-01' }),
      reg('D'),
      reg('E', { archivado: 3, secuencia: 2 }),
      reg('F', { secuencia: 9, fin: '2020-01-01' })
    ];
    expect(ordenar([...base].reverse())).toEqual(ordenar(base));
  });
});

describe('finalizar desde la Agenda: queda primero', () => {
  it('un registro recién archivado supera a todos los de la hoja y a los archivados antes', () => {
    const ahora = Date.parse('2026-11-25T15:00:00Z');
    const registros = [
      { id: 'hist-281', rowIndex: 284, fromDay: '2026-11-21', untilDay: '2026-11-24', dogName: 'Tobias' },
      { id: `hist-agenda-stay-1-${ahora - 3 * 86400000}`, rowIndex: 285, fromDay: '12/11', untilDay: '15/11', dogName: 'Max' },
      // se finaliza hoy una estadía que terminó hace meses: su fin es anterior a todos
      { id: `hist-agenda-stay-9-${ahora}`, rowIndex: 286, fromDay: '2026-01-02', untilDay: '2026-01-09', dogName: 'Luna' }
    ];
    const orden = registros
      .map(r => claveDeRegistro(r, ahora))
      .sort(compararClaves)
      .map(c => c.nombre);
    expect(orden).toEqual(['Luna', 'Max', 'Tobias']);
  });
});

describe('mejorClave', () => {
  it('elige la clave más reciente de varias; sin claves devuelve null', () => {
    const a = reg('a', { secuencia: 3 });
    const b = reg('b', { secuencia: 8 });
    expect(mejorClave([a, b])).toBe(b);
    expect(mejorClave([])).toBeNull();
  });
});

describe('elegirNombreVisible: la escritura más reciente, sin espacios sobrantes', () => {
  it('usa la escritura del registro más reciente', () => {
    expect(
      elegirNombreVisible([
        { nombre: 'Ramon ', clave: reg('', { secuencia: 10 }) },
        { nombre: 'Ramón', clave: reg('', { secuencia: 200 }) },
        { nombre: 'ramón ', clave: reg('', { secuencia: 50 }) }
      ])
    ).toBe('Ramón');
  });

  it('una escritura archivada desde la app gana a las de la hoja', () => {
    expect(
      elegirNombreVisible([
        { nombre: 'Tobias ', clave: reg('', { secuencia: 281, fin: '2026-11-24' }) },
        { nombre: 'Tobías', clave: reg('', { archivado: 1795573200000 }) }
      ])
    ).toBe('Tobías');
  });

  it('con claves iguales o sin datos queda la primera, limpia', () => {
    expect(elegirNombreVisible([{ nombre: '  Kiara ', clave: reg('') }, { nombre: 'kiara', clave: reg('') }])).toBe('Kiara');
  });

  it('ignora nombres vacíos; sin candidatos devuelve cadena vacía', () => {
    expect(
      elegirNombreVisible([{ nombre: '   ', clave: reg('', { secuencia: 9 }) }, { nombre: 'Tango', clave: reg('', { secuencia: 1 }) }])
    ).toBe('Tango');
    expect(elegirNombreVisible([])).toBe('');
  });
});

describe('normalizeDogName: un mismo perro escrito de distintas maneras', () => {
  it('une tildes, mayúsculas y espacios', async () => {
    const { normalizeDogName } = await import('../data/historialData');
    for (const v of ['Ramón', 'Ramón ', 'Ramon ', 'Ramon', 'ramón ', ' RAMÓN', 'Ramón  ']) {
      expect(normalizeDogName(v)).toBe('ramon');
    }
    expect(normalizeDogName('Tobías ')).toBe(normalizeDogName('Tobias'));
    expect(normalizeDogName('REX')).toBe(normalizeDogName('Rex'));
    expect(normalizeDogName('León ')).toBe(normalizeDogName('Leon'));
  });

  it('no une nombres que no difieren sólo en tildes, mayúsculas o espacios', async () => {
    const { normalizeDogName } = await import('../data/historialData');
    expect(normalizeDogName('Bolita VL')).not.toBe(normalizeDogName('Pelusa'));
    expect(normalizeDogName('Kira')).not.toBe(normalizeDogName('Kira II'));
    expect(normalizeDogName('Pelusa')).not.toBe(normalizeDogName('Pelusa M'));
  });

  it('junta los espacios repetidos de adentro', async () => {
    const { normalizeDogName } = await import('../data/historialData');
    expect(normalizeDogName('Bolita   VL')).toBe('bolita vl');
  });
});
