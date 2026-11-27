export const UNDO_WINDOW_MS = 10_000;
export const DELETED_IDS_KEY = 'pensionados_history_deleted_ids';

type WithId = { id: string };

export function removeRecord<T extends WithId>(records: T[], id: string): { next: T[]; removed: T | null; index: number } {
  const index = records.findIndex(r => r.id === id);
  if (index === -1) return { next: records, removed: null, index: -1 };
  return { next: [...records.slice(0, index), ...records.slice(index + 1)], removed: records[index], index };
}

export function restoreRecord<T extends WithId>(records: T[], removed: T, index: number): T[] {
  if (records.some(r => r.id === removed.id)) return records;
  const at = Math.max(0, Math.min(index, records.length));
  return [...records.slice(0, at), removed, ...records.slice(at)];
}

export function filterDeleted<T extends WithId>(records: T[], deletedIds: Iterable<string>): T[] {
  const set = new Set(deletedIds);
  return set.size === 0 ? records : records.filter(r => !set.has(r.id));
}

export interface PendingDeletion {
  undo: () => boolean;
  flush: () => void;
  readonly state: 'pending' | 'committing' | 'done' | 'undone' | 'failed';
}

// commit resolves to null on success or the real error message on failure
export function scheduleDeletion(opts: {
  delayMs?: number;
  commit: () => Promise<string | null>;
  onCommitted: () => void;
  onFailed: (message: string) => void;
}): PendingDeletion {
  let state: PendingDeletion['state'] = 'pending';

  const run = async () => {
    if (state !== 'pending') return;
    clearTimeout(timer);
    state = 'committing';
    let error: string | null;
    try {
      error = await opts.commit();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    if (error) {
      state = 'failed';
      opts.onFailed(error);
    } else {
      state = 'done';
      opts.onCommitted();
    }
  };

  const timer = setTimeout(run, opts.delayMs ?? UNDO_WINDOW_MS);

  return {
    undo() {
      if (state !== 'pending') return false;
      clearTimeout(timer);
      state = 'undone';
      return true;
    },
    flush() {
      void run();
    },
    get state() {
      return state;
    },
  };
}
