import { useCallback, useEffect, useRef, useState } from 'react';

export type LoadState<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: Error };

/**
 * Runs `load` whenever `key` changes and on `reload()`. Results are tagged
 * with the request they answer, so a slow, stale response can never replace
 * a newer one, and "loading" is derived rather than set from the effect.
 */
export function useLoad<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const [generation, setGeneration] = useState(0);
  const requestKey = `${key}#${generation}`;
  const [result, setResult] = useState<{ requestKey: string; state: LoadState<T> } | null>(null);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    const controller = new AbortController();
    const settle = (state: LoadState<T>) => {
      if (!controller.signal.aborted) setResult({ requestKey, state });
    };
    loadRef.current(controller.signal).then(
      (data) => settle({ status: 'ready', data }),
      (error: unknown) => settle({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) }),
    );
    return () => controller.abort();
  }, [requestKey]);

  const state: LoadState<T> = result?.requestKey === requestKey ? result.state : { status: 'loading' };
  const reload = useCallback(() => setGeneration((g) => g + 1), []);
  /** Changes the loaded data locally, e.g. after a mutation returned the updated row. */
  const update = useCallback(
    (change: (data: T) => T) =>
      setResult((current) =>
        current?.state.status === 'ready'
          ? { ...current, state: { status: 'ready', data: change(current.state.data) } }
          : current,
      ),
    [],
  );
  return { state, reload, update };
}
