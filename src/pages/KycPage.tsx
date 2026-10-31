import { useState, type FormEvent } from 'react';
import { KYC_STATUSES, unwrap, type KycStatus, type Schemas } from '../api/client.ts';
import { useApi } from '../auth/AuthContext.tsx';
import { EmptyRow, FilterSelect, Loadable, PageHeader, Pager, StatusBadge } from '../components/ui.tsx';
import { formatDateTime, humanise } from '../format.ts';
import { useLoad } from '../useLoad.ts';
import { oneOf, PAGE_SIZE, useListParams } from './searchParams.ts';

type Submission = Schemas['AdminKycSubmissionResponse'];

/** What the backend allows: an override of the provider's decision, never of a PENDING one. */
const CAN_APPROVE: readonly KycStatus[] = ['REJECTED', 'TIMED_OUT'];
const CAN_REJECT: readonly KycStatus[] = ['APPROVED', 'TIMED_OUT'];
const REASON_MIN = 3;
const REASON_MAX = 500;

export function KycPage() {
  const api = useApi();
  const { filters, offset, setFilter, setOffset } = useListParams(['status'] as const);
  const status = oneOf(filters.status, KYC_STATUSES);

  const { state, reload, update } = useLoad(`${status}|${offset}`, async (signal) =>
    unwrap(await api.GET('/admin/kyc', { params: { query: { status, limit: PAGE_SIZE, offset } }, signal })),
  );

  /** Swap in the decided submission without refetching, so the row stays put. */
  function replace(updated: Submission) {
    update((data) => ({ ...data, items: data.items.map((s) => (s.id === updated.id ? updated : s)) }));
  }

  return (
    <>
      <PageHeader title="KYC review">
        <FilterSelect
          label="Status"
          value={status ?? ''}
          options={KYC_STATUSES}
          onChange={(v) => setFilter('status', v)}
        />
      </PageHeader>
      <p className="hint">
        The verification provider decides first. You can approve a rejected or timed-out submission, or reject an
        approved or timed-out one. Only a user&apos;s latest submission can be changed.
      </p>
      <Loadable state={state} retry={reload} label="KYC submissions">
        {(page) => (
          <>
            <table>
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Document</th>
                  <th scope="col">Status</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Submitted</th>
                  <th scope="col">Decided</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.items.length === 0 && <EmptyRow colSpan={7}>No submissions match.</EmptyRow>}
                {page.items.map((submission) => (
                  <SubmissionRow key={submission.id} submission={submission} onDecided={replace} />
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

function SubmissionRow({ submission, onDecided }: { submission: Submission; onDecided: (s: Submission) => void }) {
  const api = useApi();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const who = submission.user?.fullName ?? 'this user';

  async function run(action: () => Promise<Submission>, message: string) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const updated = await action();
      setRejecting(false);
      setReason('');
      setDone(message);
      onDecided(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const approve = () =>
    run(
      async () => unwrap(await api.POST('/admin/kyc/{id}/approve', { params: { path: { id: submission.id } } })),
      `Approved ${who}.`,
    );

  const reject = (event: FormEvent) => {
    event.preventDefault();
    void run(
      async () =>
        unwrap(
          await api.POST('/admin/kyc/{id}/reject', {
            params: { path: { id: submission.id } },
            body: { reason: reason.trim() },
          }),
        ),
      `Rejected ${who}.`,
    );
  };

  const reasonLength = reason.trim().length;
  const reasonId = `reason-${submission.id}`;
  return (
    <>
      <tr aria-label={`KYC submission from ${who}`}>
        <td>
          {submission.user ? (
            <>
              {submission.user.fullName}
              <span className="sub">{submission.user.email}</span>
            </>
          ) : (
            <span className="sub">Deleted user</span>
          )}
        </td>
        <td>
          {humanise(submission.documentType)} ····{submission.documentNumberLast4}
          <span className="sub">{submission.documentMimeType}</span>
        </td>
        <td>
          <StatusBadge value={submission.status} />
          {submission.reviewedBy && <span className="sub">by an admin</span>}
        </td>
        <td>{submission.decisionReason ?? '—'}</td>
        <td>{formatDateTime(submission.createdAt)}</td>
        <td>{formatDateTime(submission.decidedAt)}</td>
        <td className="actions">
          {CAN_APPROVE.includes(submission.status) && (
            <button type="button" className="approve" disabled={busy} onClick={() => void approve()}>
              Approve
            </button>
          )}
          {CAN_REJECT.includes(submission.status) && !rejecting && (
            <button type="button" className="reject" disabled={busy} onClick={() => setRejecting(true)}>
              Reject
            </button>
          )}
        </td>
      </tr>
      {(rejecting || error || done) && (
        <tr className="row-detail">
          <td colSpan={7}>
            {rejecting && (
              <form className="reject-form" onSubmit={reject}>
                <label htmlFor={reasonId}>Reason shown to {who}</label>
                <textarea
                  id={reasonId}
                  rows={2}
                  maxLength={REASON_MAX}
                  required
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <div className="form-actions">
                  <button type="submit" className="reject" disabled={busy || reasonLength < REASON_MIN}>
                    Confirm rejection
                  </button>
                  <button type="button" disabled={busy} onClick={() => setRejecting(false)}>
                    Cancel
                  </button>
                  <span className="sub">
                    {reasonLength}/{REASON_MAX}
                  </span>
                </div>
              </form>
            )}
            {error && (
              <p className="notice notice-error" role="alert">
                {error}
              </p>
            )}
            {done && (
              <p className="notice notice-good" role="status">
                {done}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
