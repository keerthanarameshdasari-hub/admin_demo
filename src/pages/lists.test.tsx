import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IDS } from '../mocks/db.ts';
import { renderApp } from '../test/render.tsx';

describe('Users', () => {
  it('lists users with role and KYC status, filterable by KYC status', async () => {
    const { user } = await renderApp('/users');
    const ravi = await screen.findByRole('row', { name: /Ravi Kumar/ });
    expect(within(ravi).getByText('ravi@example.com')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Ada Admin/ })).getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('1–6 of 6')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('KYC status'), 'TIMED_OUT');
    expect(await screen.findByText('1–1 of 1')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Chen Li/ })).toBeInTheDocument();
  });

  it("links to a user's transactions", async () => {
    const { user, router } = await renderApp('/users');
    const ben = await screen.findByRole('row', { name: /Ben Okafor/ });
    await user.click(within(ben).getByRole('link', { name: 'Transactions' }));
    expect(router.state.location.pathname).toBe('/transactions');
    expect(router.state.location.search).toBe(`?userId=${IDS.ben}`);
  });
});

describe('Transactions', () => {
  it('shows amounts in rupees from minor units, with status and failure reason', async () => {
    await renderApp('/transactions');
    const big = await screen.findByRole('row', { name: /₹2,500\.00/ });
    expect(within(big).getByText('Succeeded')).toBeInTheDocument();
    expect(within(big).getByText('ben@example.com')).toBeInTheDocument();
    const failed = screen.getByRole('row', { name: /₹9\.99/ });
    expect(within(failed).getByText('card_declined')).toBeInTheDocument();
  });

  it('filters by user (clearable) and by status', async () => {
    const { user, router } = await renderApp(`/transactions?userId=${IDS.asha}`);
    expect(await screen.findByText('No transactions match.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show all users' }));
    expect(router.state.location.search).toBe('');
    await screen.findByRole('row', { name: /₹2,500\.00/ });

    await user.selectOptions(screen.getByLabelText('Status'), 'FAILED');
    expect(await screen.findByText('1–1 of 1')).toBeInTheDocument();
  });
});
