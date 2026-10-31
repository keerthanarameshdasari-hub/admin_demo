import { TOP_UP_STATUSES, unwrap } from '../api/client.ts';
import { useApi } from '../auth/AuthContext.tsx';
import { EmptyRow, FilterSelect, Loadable, PageHeader, Pager, StatusBadge } from '../components/ui.tsx';
import { formatDateTime, formatMoney } from '../format.ts';
import { useLoad } from '../useLoad.ts';
import { oneOf, PAGE_SIZE, useListParams } from './searchParams.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function TransactionsPage() {
  const api = useApi();
  const { filters, offset, setFilter, setOffset } = useListParams(['status', 'userId'] as const);
  const status = oneOf(filters.status, TOP_UP_STATUSES);
  const userId = UUID.test(filters.userId) ? filters.userId : undefined;

  const { state, reload } = useLoad(`${status}|${userId}|${offset}`, async (signal) =>
    unwrap(
      await api.GET('/admin/top-ups', { params: { query: { status, userId, limit: PAGE_SIZE, offset } }, signal }),
    ),
  );

  return (
    <>
      <PageHeader title="Wallet transactions">
        <FilterSelect
          label="Status"
          value={status ?? ''}
          options={TOP_UP_STATUSES}
          onChange={(v) => setFilter('status', v)}
        />
        {userId && (
          <span className="chip">
            One user only
            <button type="button" aria-label="Show all users" onClick={() => setFilter('userId', '')}>
              ×
            </button>
          </span>
        )}
      </PageHeader>
      <Loadable state={state} retry={reload} label="transactions">
        {(page) => (
          <>
            <table>
              <thead>
                <tr>
                  <th scope="col">Created</th>
                  <th scope="col">User</th>
                  <th scope="col" className="num">
                    Amount
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Failure reason</th>
                  <th scope="col">Completed</th>
                </tr>
              </thead>
              <tbody>
                {page.items.length === 0 && <EmptyRow colSpan={6}>No transactions match.</EmptyRow>}
                {page.items.map((topUp) => (
                  <tr key={topUp.id}>
                    <td>{formatDateTime(topUp.createdAt)}</td>
                    <td>
                      {topUp.user ? (
                        <>
                          {topUp.user.fullName}
                          <span className="sub">{topUp.user.email}</span>
                        </>
                      ) : (
                        <span className="sub">Deleted user</span>
                      )}
                    </td>
                    <td className="num">{formatMoney(topUp.amountMinor, topUp.currency)}</td>
                    <td>
                      <StatusBadge value={topUp.status} />
                    </td>
                    <td>{topUp.failureReason ?? '—'}</td>
                    <td>{formatDateTime(topUp.completedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager total={page.total} limit={page.limit} offset={page.offset} onChange={setOffset} />
          </>
        )}
      </Loadable>
    </>
  );
}
