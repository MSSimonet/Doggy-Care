import { describe, expect, it } from 'vitest';
import type { Stay } from '../types';
import { defaultAppConfig } from '../data/initialData';
import { calculateStay } from './calculations';
import { cobrar, deducir, estadoCobro, finalizar, volverALaAgenda } from './flujoCobros';

const config = defaultAppConfig;
const estadia = (extra: Partial<Stay> = {}): Stay => ({
  id: 's1', dogName: 'Luna', fromDay: '2026-11-01', untilDay: '2026-11-05', days: 5, dailyRate: 20000, isCapital: true,
  additionalFeatures: { expenses: 0, bath: 0, moneyAdvance: 0, tip: 0 }, amountPaid: 0, finalizada: true, ...extra
});
const AHORA = '2026-11-26T10:00:00.000Z';

describe('flujo Cobros: cobrado + deducida → Historial', () => {
  it('recién finalizada y sin cobrar: ni cobrada ni deducida', () => {
    expect(estadoCobro(estadia(), config)).toEqual({ cobrado: false, deducida: false, hayDeduccion: false, listo: false });
  });

  it('cobrar paga lo que faltaba (descontando la seña) y la deja cobrada', () => {
    const conSena = estadia({ additionalFeatures: { expenses: 0, bath: 0, moneyAdvance: 30000, tip: 0 } });
    const cobrada = cobrar(conSena, config);
    const calc = calculateStay(cobrada, config);
    expect(calc.totalAdeudado).toBe(0);
    expect(cobrada.amountPaid).toBe(70000); // 100.000 de total - 30.000 de seña
    expect(estadoCobro(cobrada, config)).toMatchObject({ cobrado: true, hayDeduccion: true, deducida: false, listo: false });
  });

  it('cobrada y deducida: pasa al Historial (listo)', () => {
    const cobrada = cobrar(estadia(), config);
    const lista = deducir(cobrada, config, AHORA);
    expect(lista).toMatchObject({ dzTransferred: true, dzTransferredAmount: 18000, dzTransferredAt: AHORA });
    expect(estadoCobro(lista, config)).toMatchObject({ cobrado: true, deducida: true, listo: true });
  });

  it('deducida antes de cobrar todo: al cobrar se actualiza la deducción y queda lista (en cualquier orden)', () => {
    const conAnticipo = estadia({ amountPaid: 40000 });
    const deducidaParcial = deducir(conAnticipo, config, AHORA);
    expect(deducidaParcial.dzTransferredAmount).toBe(7200); // 18 % de lo cobrado hasta ahora
    expect(estadoCobro(deducidaParcial, config).listo).toBe(false);
    const todo = cobrar(deducidaParcial, config, AHORA);
    expect(todo.dzTransferredAmount).toBe(18000);
    expect(estadoCobro(todo, config).listo).toBe(true);
  });

  it('cobrada pero sin deducir no pasa; destildar la deducción la saca de "lista"', () => {
    const cobrada = cobrar(estadia(), config);
    expect(estadoCobro(cobrada, config).listo).toBe(false);
    const lista = deducir(cobrada, config, AHORA);
    const sinDeducir = deducir(lista, config, AHORA);
    expect(sinDeducir.dzTransferred).toBe(false);
    expect(estadoCobro(sinDeducir, config).listo).toBe(false);
  });

  it('la deducción usa la tasa del año de la fecha de fin (2027 → 19 %)', () => {
    const cruza = estadia({ fromDay: '2026-12-26', untilDay: '2027-01-03', days: 9, dailyRate: 10000 });
    const lista = deducir(cobrar(cruza, config), config, AHORA);
    expect(lista.dzTransferredAmount).toBe(Math.round(90000 * 0.19));
  });

  it('finalizar y volver a la Agenda sólo cambian la marca', () => {
    const activa = estadia({ finalizada: false });
    expect(finalizar(activa).finalizada).toBe(true);
    expect(volverALaAgenda(finalizar(activa))).toEqual(activa);
  });
});
