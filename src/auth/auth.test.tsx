import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../api/client.ts';
import { ADMIN, NON_ADMIN } from '../mocks/db.ts';
import { renderApp } from '../test/render.tsx';
import { server, TEST_API } from '../test/setup.ts';
import { BAD_CREDENTIALS, NOT_AN_ADMIN, signIn } from './AuthContext.tsx';
import { Session } from './session.ts';

async function fillLogin(user: Awaited<ReturnType<typeof renderApp>>['user'], email: string, password: string) {
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('signing in', () => {
  afterEach(() => vi.useRealTimers());

  it('sends an admin to the page they asked for', async () => {
    const { user, router } = await renderApp('/users', { signedIn: false });
    expect(router.state.location.pathname).toBe('/login');
    await fillLogin(user, ADMIN.email, ADMIN.password);
    expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/users');
    expect(screen.getByText(ADMIN.email)).toBeInTheDocument();
  });

  it('shows a clear error for a wrong password', async () => {
    const { user, session } = await renderApp('/login', { signedIn: false });
    await fillLogin(user, ADMIN.email, 'wrong-password');
    expect(await screen.findByRole('alert')).toHaveTextContent(BAD_CREDENTIALS);
    expect(session.getToken()).toBeNull();
  });

  it('refuses a valid account that is not an admin, and keeps no token', async () => {
    const { user, session } = await renderApp('/login', { signedIn: false });
    await fillLogin(user, NON_ADMIN.email, NON_ADMIN.password);
    expect(await screen.findByRole('alert')).toHaveTextContent(NOT_AN_ADMIN);
    expect(session.getToken()).toBeNull();
    expect(session.getState()).toEqual({ status: 'signed-out', reason: null });
  });

  it('never writes the token to localStorage, sessionStorage or cookies', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { session } = await renderApp('/kyc');
    expect(session.getToken()).toMatch(/^mock-token-/);
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });

  it('sends the in-memory token as a bearer header', async () => {
    const seen: (string | null)[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/admin/')) seen.push(request.headers.get('Authorization'));
    });
    const { session } = await renderApp('/kyc');
    await screen.findByRole('heading', { name: 'KYC review' });
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen.every((h) => h === `Bearer ${session.getToken()}`)).toBe(true);
    server.events.removeAllListeners();
  });
});

describe('signing out', () => {
  it('the button forgets the token and returns to the login page', async () => {
    const { user, session, router } = await renderApp('/kyc');
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(session.getToken()).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('a 401 from the API ends the session as expired', async () => {
    server.use(http.get(`${TEST_API}/admin/users`, () => HttpResponse.json({}, { status: 401 })));
    const { session } = await renderApp('/users');
    expect(await screen.findByText('Your session expired. Sign in again.')).toBeInTheDocument();
    expect(session.getToken()).toBeNull();
  });

  it('a 403 "Admin access required" ends the session as revoked', async () => {
    server.use(
      http.get(`${TEST_API}/admin/users`, () =>
        HttpResponse.json({ statusCode: 403, code: 'FORBIDDEN', message: 'Admin access required' }, { status: 403 }),
      ),
    );
    await renderApp('/users');
    expect(await screen.findByText('Your admin access was removed.')).toBeInTheDocument();
  });

  it('the token is dropped shortly before it expires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const session = new Session();
    const api = createApiClient(TEST_API, session);
    await signIn(api, session, ADMIN.email, ADMIN.password); // mock expiresIn: 3600 s
    vi.advanceTimersByTime(3595_000 - 1);
    expect(session.getToken()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(session.getState()).toEqual({ status: 'signed-out', reason: 'expired' });
  });
});
