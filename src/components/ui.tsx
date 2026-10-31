import type { ReactNode } from 'react';
import { humanise } from '../format.ts';
import type { LoadState } from '../useLoad.ts';

const TONE: Record<string, string> = {
  APPROVED: 'good',
  SUCCEEDED: 'good',
  REJECTED: 'bad',
  FAILED: 'bad',
  TIMED_OUT: 'warn',
  PENDING: 'info',
  NOT_STARTED: 'muted',
  ADMIN: 'info',
  USER: 'muted',
};

export function StatusBadge({ value }: { value: string }) {
  return <span className={`badge badge-${TONE[value] ?? 'muted'}`}>{humanise(value)}</span>;
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {children && <div className="filters">{children}</div>}
    </header>
  );
}

/** Renders loading, error (with retry) or the content for a LoadState. */
export function Loadable<T>({
  state,
  retry,
  label,
  children,
}: {
  state: LoadState<T>;
  retry: () => void;
  label: string;
  children: (data: T) => ReactNode;
}) {
  if (state.status === 'loading') {
    return (
      <p className="notice" role="status">
        Loading {label}…
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="notice notice-error" role="alert">
        Couldn't load {label}: {state.error.message}{' '}
        <button type="button" className="link-button" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }
  return <>{children(state.data)}</>;
}

export function Pager({
  total,
  limit,
  offset,
  onChange,
}: {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
}) {
  if (total === 0) return null;
  const first = offset + 1;
  const last = Math.min(offset + limit, total);
  return (
    <nav className="pager" aria-label="Pagination">
      <span>
        {first}–{last} of {total}
      </span>
      <button type="button" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
        Previous
      </button>
      <button type="button" disabled={last >= total} onClick={() => onChange(offset + limit)}>
        Next
      </button>
    </nav>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="empty">
        {children}
      </td>
    </tr>
  );
}

/** A <select> whose first option ("All") maps to an empty string. */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="filter">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {humanise(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
