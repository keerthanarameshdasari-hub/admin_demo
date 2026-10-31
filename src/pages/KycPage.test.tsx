import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { IDS } from '../mocks/db.ts';
import { renderApp } from '../test/render.tsx';
import { db, server, TEST_API } from '../test/setup.ts';

const row = (name: string) => screen.getByRole('row', { name: `KYC submission from ${name}` });

describe('KYC review', () => {
  it('lists submissions newest first with owner, document and status', async () => {
    await renderApp('/kyc');
    await screen.findByRole('row', { name: 'KYC submission from Esha Patel' });
    const rows = screen.getAllByRole('row', { name: /KYC submission from/ });
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      'KYC submission from Esha Patel',
      'KYC submission from Chen Li',
      'KYC submission from Ben Okafor',
      'KYC submission from Asha Rao',
      'KYC submission from Asha Rao',
    ]);
    expect(within(row('Ben Okafor')).getByText('ben@example.com')).toBeInTheDocument();
    expect(within(row('Ben Okafor')).getByText(/Passport ····4567/)).toBeInTheDocument();
  });

  it('offers only the actions the API allows for each status', async () => {
    await renderApp('/kyc');
    await screen.findByRole('row', { name: 'KYC submission from Esha Patel' });
    const buttons = (name: string) =>
      within(row(name))
        .queryAllByRole('button')
        .map((b) => b.textContent);
    expect(buttons('Esha Patel')).toEqual([]); // PENDING: still with the provider
    expect(buttons('Chen Li')).toEqual(['Approve', 'Reject']); // TIMED_OUT
    expect(buttons('Ben Okafor')).toEqual(['Reject']); // APPROVED
  });

  it('approves a rejected submission and updates the row in place', async () => {
    const { user } = await renderApp('/kyc?status=REJECTED');
    const asha = await screen.findByRole('row', { name: 'KYC submission from Asha Rao' });
    await user.click(within(asha).getByRole('button', { name: 'Approve' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Approved Asha Rao.');
    expect(within(row('Asha Rao')).getByText('Approved')).toBeInTheDocument();
    expect(within(row('Asha Rao')).getByText('by an admin')).toBeInTheDocument();
    expect(within(row('Asha Rao')).queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(db.users.find((u) => u.id === IDS.asha)?.kycStatus).toBe('APPROVED');
  });

  it('rejects with a reason, which is required', async () => {
    const { user } = await renderApp('/kyc?status=APPROVED');
    const ben = await screen.findByRole('row', { name: 'KYC submission from Ben Okafor' });
    await user.click(within(ben).getByRole('button', { name: 'Reject' }));

    const confirm = screen.getByRole('button', { name: 'Confirm rejection' });
    const reason = screen.getByLabelText('Reason shown to Ben Okafor');
    expect(confirm).toBeDisabled();
    await user.type(reason, 'ab');
    expect(confirm).toBeDisabled();
    await user.type(reason, 'c photo is blurry');
    await user.click(confirm);

    expect(await screen.findByRole('status')).toHaveTextContent('Rejected Ben Okafor.');
    expect(within(row('Ben Okafor')).getByText('abc photo is blurry')).toBeInTheDocument();
    expect(db.submissions.find((s) => s.id === IDS.benSubmission)).toMatchObject({
      status: 'REJECTED',
      decisionReason: 'abc photo is blurry',
    });
  });

  it("shows the API's reason when it refuses (an older submission)", async () => {
    const { user } = await renderApp('/kyc?status=TIMED_OUT');
    await screen.findByRole('row', { name: 'KYC submission from Chen Li' });
    const ashaOld = screen.getByRole('row', { name: 'KYC submission from Asha Rao' });
    await user.click(within(ashaOld).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Only the user's latest KYC submission can be reviewed");
    expect(within(row('Asha Rao')).getByText('Timed out')).toBeInTheDocument();
  });

  it('filters by status through the URL and resets to the first page', async () => {
    const { user, router } = await renderApp('/kyc?offset=50');
    await user.selectOptions(await screen.findByLabelText('Status'), 'PENDING');
    await waitFor(() => expect(router.state.location.search).toBe('?status=PENDING'));
    await screen.findByRole('row', { name: 'KYC submission from Esha Patel' });
    expect(screen.getAllByRole('row', { name: /KYC submission from/ })).toHaveLength(1);
  });

  it('shows a retryable error when the list fails to load', async () => {
    let fail = true;
    server.use(
      http.get(`${TEST_API}/admin/kyc`, () =>
        fail
          ? HttpResponse.json({ statusCode: 500, code: 'INTERNAL', message: 'Something went wrong' }, { status: 500 })
          : undefined,
      ),
    );
    const { user } = await renderApp('/kyc');
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load KYC submissions: Something went wrong");
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('row', { name: 'KYC submission from Chen Li' })).toBeInTheDocument();
  });
});
