import { expect, test, type Page } from '@playwright/test';
import { API } from '../playwright.config.ts';

const ADMIN = { email: 'admin@example.com', password: 'admin-password-1' };
const NON_ADMIN = { email: 'ravi@example.com', password: 'ravi-password-1' };

test.beforeEach(async ({ request }) => {
  const reset = await request.post(`${API}/__mock/reset`);
  expect(reset.status()).toBe(204);
});

async function signIn(page: Page, who = ADMIN) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

const submissionRow = (page: Page, name: string) => page.getByRole('row', { name: `KYC submission from ${name}` });

test.describe('login', () => {
  test('an admin signs in and lands on KYC review; the token is kept in memory only', async ({ page, context }) => {
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'KYC review' })).toBeVisible();
    await expect(page).toHaveURL(/\/kyc$/);
    await expect(page.getByText(ADMIN.email)).toBeVisible();

    const stored = await page.evaluate(() => ({
      local: Object.keys(localStorage).length,
      session: Object.keys(sessionStorage).length,
      cookie: document.cookie,
    }));
    expect(stored).toEqual({ local: 0, session: 0, cookie: '' });
    expect(await context.cookies()).toEqual([]);

    // Nothing persisted, so a reload means signing in again.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('a wrong password and a non-admin account are both refused', async ({ page }) => {
    await signIn(page, { email: ADMIN.email, password: 'not-the-password' });
    await expect(page.getByRole('alert')).toHaveText('Wrong email or password.');

    await page.getByLabel('Password').fill(NON_ADMIN.password);
    await page.getByLabel('Email').fill(NON_ADMIN.email);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText("This account doesn't have admin access.");
    await expect(page).toHaveURL(/\/login$/);
  });

  test('signing out returns to the login page', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await page.goto('/users');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test('approve KYC: a provider rejection is overridden and the user becomes approved', async ({ page }) => {
  await signIn(page);
  await page.getByLabel('Status').selectOption('REJECTED');
  const asha = submissionRow(page, 'Asha Rao');
  await expect(asha).toContainText('document_expired');

  await asha.getByRole('button', { name: 'Approve' }).click();

  await expect(page.getByRole('status')).toHaveText('Approved Asha Rao.');
  await expect(asha).toContainText('Approved');
  await expect(asha).toContainText('by an admin');
  await expect(asha.getByRole('button', { name: 'Approve' })).toHaveCount(0);

  // The user list reflects the new status.
  await page.getByRole('link', { name: 'Users' }).click();
  await page.getByLabel('KYC status').selectOption('APPROVED');
  await expect(page.getByRole('row', { name: /Asha Rao/ })).toBeVisible();
});

test('reject KYC: an approval is overridden with a required reason', async ({ page }) => {
  await signIn(page);
  await page.getByLabel('Status').selectOption('APPROVED');
  const ben = submissionRow(page, 'Ben Okafor');
  await ben.getByRole('button', { name: 'Reject' }).click();

  const confirm = page.getByRole('button', { name: 'Confirm rejection' });
  await expect(confirm).toBeDisabled();
  await page.getByLabel('Reason shown to Ben Okafor').fill('Name on the document does not match the account');
  await confirm.click();

  await expect(page.getByRole('status')).toHaveText('Rejected Ben Okafor.');
  await expect(ben).toContainText('Rejected');
  await expect(ben).toContainText('Name on the document does not match the account');

  // Reload the list from the API: the decision stuck.
  await page.getByLabel('Status').selectOption('REJECTED');
  await expect(submissionRow(page, 'Ben Okafor')).toBeVisible();
});

test("view transactions: every user's top-ups, and one user's from the user list", async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Transactions' }).click();
  await expect(page.getByRole('heading', { name: 'Wallet transactions' })).toBeVisible();

  const big = page.getByRole('row', { name: /₹2,500\.00/ });
  await expect(big).toContainText('Succeeded');
  await expect(big).toContainText('ben@example.com');
  await expect(page.getByRole('row', { name: /₹9\.99/ })).toContainText('card_declined');
  await expect(page.getByText('1–4 of 4')).toBeVisible();

  await page.getByLabel('Status').selectOption('FAILED');
  await expect(page.getByText('1–1 of 1')).toBeVisible();

  // From a user with no top-ups.
  await page.getByRole('link', { name: 'Users' }).click();
  await page
    .getByRole('row', { name: /Asha Rao/ })
    .getByRole('link', { name: 'Transactions' })
    .click();
  await expect(page.getByText('No transactions match.')).toBeVisible();
  await page.getByRole('button', { name: 'Show all users' }).click();
  await expect(page.getByText('1–4 of 4')).toBeVisible();
});
