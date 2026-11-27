import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { removeRecord, restoreRecord, filterDeleted, scheduleDeletion, UNDO_WINDOW_MS } from './historyDelete';

const recs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('removeRecord / restoreRecord', () => {
  it('quita el registro y recuerda su posición', () => {
    const { next, removed, index } = removeRecord(recs, 'b');
    expect(next.map(r => r.id)).toEqual(['a', 'c']);
    expect(removed).toEqual({ id: 'b' });
    expect(index).toBe(1);
  });

  it('no cambia nada si el id no existe', () => {
    const { next, removed, index } = removeRecord(recs, 'zz');
    expect(next).toBe(recs);
    expect(removed).toBeNull();
    expect(index).toBe(-1);
  });

  it('restaura en la misma posición', () => {
    const { next, removed, index } = removeRecord(recs, 'b');
    expect(restoreRecord(next, removed!, index).map(r => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('no duplica si ya está presente', () => {
    expect(restoreRecord(recs, { id: 'b' }, 0)).toBe(recs);
  });

  it('restaura al final si la lista se achicó', () => {
    expect(restoreRecord([{ id: 'a' }], { id: 'c' }, 5).map(r => r.id)).toEqual(['a', 'c']);
  });

  it('filterDeleted oculta los ids borrados', () => {
    expect(filterDeleted(recs, ['a', 'c']).map(r => r.id)).toEqual(['b']);
    expect(filterDeleted(recs, [])).toBe(recs);
  });
});

describe('scheduleDeletion', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('no borra en la base antes de 10 segundos', async () => {
    const commit = vi.fn().mockResolvedValue(null);
    scheduleDeletion({ commit, onCommitted: vi.fn(), onFailed: vi.fn() });
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS - 1);
    expect(commit).not.toHaveBeenCalled();
  });

  it('borra en la base a los 10 segundos y avisa éxito', async () => {
    const commit = vi.fn().mockResolvedValue(null);
    const onCommitted = vi.fn();
    const onFailed = vi.fn();
    const p = scheduleDeletion({ commit, onCommitted, onFailed });
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(onCommitted).toHaveBeenCalledTimes(1);
    expect(onFailed).not.toHaveBeenCalled();
    expect(p.state).toBe('done');
  });

  it('deshacer dentro de los 10 segundos cancela el borrado', async () => {
    const commit = vi.fn().mockResolvedValue(null);
    const onCommitted = vi.fn();
    const p = scheduleDeletion({ commit, onCommitted, onFailed: vi.fn() });
    await vi.advanceTimersByTimeAsync(5000);
    expect(p.undo()).toBe(true);
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
    expect(commit).not.toHaveBeenCalled();
    expect(onCommitted).not.toHaveBeenCalled();
    expect(p.state).toBe('undone');
  });

  it('deshacer después de confirmado no tiene efecto', async () => {
    const p = scheduleDeletion({ commit: vi.fn().mockResolvedValue(null), onCommitted: vi.fn(), onFailed: vi.fn() });
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
    expect(p.undo()).toBe(false);
  });

  it('si la base falla, entrega el mensaje real', async () => {
    const onFailed = vi.fn();
    const onCommitted = vi.fn();
    scheduleDeletion({
      commit: vi.fn().mockResolvedValue('permission denied for table historical_stays'),
      onCommitted,
      onFailed,
    });
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
    expect(onFailed).toHaveBeenCalledWith('permission denied for table historical_stays');
    expect(onCommitted).not.toHaveBeenCalled();
  });

  it('una excepción en commit también cuenta como falla', async () => {
    const onFailed = vi.fn();
    scheduleDeletion({ commit: () => Promise.reject(new Error('Failed to fetch')), onCommitted: vi.fn(), onFailed });
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
    expect(onFailed).toHaveBeenCalledWith('Failed to fetch');
  });

  it('flush confirma de inmediato y una sola vez', async () => {
    const commit = vi.fn().mockResolvedValue(null);
    const p = scheduleDeletion({ commit, onCommitted: vi.fn(), onFailed: vi.fn() });
    p.flush();
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
