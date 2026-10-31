import type { Schemas } from '../api/client.ts';

export type AdminUser = Schemas['UserResponse'];

export type SignOutReason = 'signed-out' | 'expired' | 'revoked';

export type SessionState =
  { status: 'signed-out'; reason: SignOutReason | null } | { status: 'signed-in'; user: AdminUser };

/**
 * Holds the access token in memory, and nowhere else: not localStorage,
 * sessionStorage, IndexedDB or a readable cookie (an ESLint rule enforces
 * this for src/). The cost is that a page reload signs you out; the benefit
 * is that a script injected into the page can't read a stored token later.
 *
 * The token is dropped when it expires (from the API's `expiresIn`), when the
 * API answers 401, or when it says the account is no longer an admin.
 */
export class Session {
  private token: string | null = null;
  private state: SessionState = { status: 'signed-out', reason: null };
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<() => void>();

  getToken(): string | null {
    return this.token;
  }

  getState = (): SessionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(token: string, expiresInSeconds: number, user: AdminUser): void {
    this.token = token;
    clearTimeout(this.expiryTimer);
    // A little early, so a request is never sent with a token that expires in flight.
    const ms = Math.max(0, expiresInSeconds * 1000 - 5_000);
    this.expiryTimer = setTimeout(() => this.end('expired'), ms);
    this.set({ status: 'signed-in', user });
  }

  end(reason: SignOutReason): void {
    if (this.token === null && this.state.status === 'signed-out') return;
    this.token = null;
    clearTimeout(this.expiryTimer);
    this.set({ status: 'signed-out', reason });
  }

  private set(state: SessionState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
