import { useSearchParams } from 'react-router';

export const PAGE_SIZE = 50;

/** Filters and paging live in the URL, so a view can be bookmarked or shared. */
export function useListParams<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const offset = Math.max(0, Number.parseInt(params.get('offset') ?? '0', 10) || 0);
  const filters = Object.fromEntries(keys.map((key) => [key, params.get(key) ?? ''])) as Record<K, string>;

  /** Changing a filter goes back to the first page. */
  function setFilter(key: K, value: string) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete('offset');
      return next;
    });
  }

  function setOffset(value: number) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value > 0) next.set('offset', String(value));
      else next.delete('offset');
      return next;
    });
  }

  return { filters, offset, setFilter, setOffset };
}

/** Narrows a URL value to a known enum member, or undefined (so a bad bookmark shows everything). */
export function oneOf<T extends string>(value: string, allowed: readonly T[]): T | undefined {
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}
