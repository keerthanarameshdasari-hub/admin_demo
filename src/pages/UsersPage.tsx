import { Link } from 'react-router';
import { KYC_STATUSES, unwrap } from '../api/client.ts';
import { useApi } from '../auth/AuthContext.tsx';
import { EmptyRow, FilterSelect, Loadable, PageHeader, Pager, StatusBadge } from '../components/ui.tsx';
import { formatDateTime } from '../format.ts';
import { useLoad } from '../useLoad.ts';
import { oneOf, PAGE_SIZE, useListParams } from './searchParams.ts';

export function UsersPage() {
  const api = useApi();
  const { filters, offset, setFilter, setOffset } = useListParams(['kycStatus'] as const);
  const kycStatus = oneOf(filters.kycStatus, KYC_STATUSES);

  const { state, reload } = useLoad(`${kycStatus}|${offset}`, async (signal) =>
    unwrap(await api.GET('/admin/users', { params: { query: { kycStatus, limit: PAGE_SIZE, offset } }, signal })),
  );

  return (
    <>
      <PageHeader title="Users">
        <FilterSelect
          label="KYC status"
          value={kycStatus ?? ''}
          options={KYC_STATUSES}
          onChange={(v) => setFilter('kycStatus', v)}
        />
      </PageHeader>
      <Loadable state={state} retry={reload} label="users">
        {(page) => (
          <>
            <table>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">KYC</th>
                  <th scope="col">Joined</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.items.length === 0 && <EmptyRow colSpan={6}>No users match.</EmptyRow>}
                {page.items.map((user) => (
                  <tr key={user.id}>
                    <td>{user.fullName}</td>
                    <td>{user.email}</td>
                    <td>
                      <StatusBadge value={user.role} />
                    </td>
                    <td>
                      <StatusBadge value={user.kycStatus} />
                    </td>
                    <td>{formatDateTime(user.createdAt)}</td>
                    <td className="actions">
                      <Link to={`/transactions?userId=${encodeURIComponent(user.id)}`}>Transactions</Link>
                    </td>
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
