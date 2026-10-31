import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { ApiError, unwrap, type ApiClient } from '../api/client.ts';
import type { Session, SessionState } from './session.ts';

export const NOT_AN_ADMIN = "This account doesn't have admin access.";
export const BAD_CREDENTIALS = 'Wrong email or password.';

interface AuthValue {
  state: SessionState;
  signIn(email: string, password: string): Promise<void>;
  signOut(): void;
}

const AuthContext = createContext<AuthValue | null>(null);
const ApiContext = createContext<ApiClient | null>(null);

/**
 * Exchanges credentials for a token, then checks the account is an ADMIN
 * before keeping anything: a non-admin's token is discarded straight away.
 */
export async function signIn(api: ApiClient, session: Session, email: string, password: string): Promise<void> {
  const login = await api.POST('/auth/login', { body: { email, password } });
  if (login.response.status === 401) throw new ApiError(401, 'UNAUTHORIZED', BAD_CREDENTIALS);
  const { accessToken, expiresIn } = unwrap(login);

  const me = unwrap(await api.GET('/users/me', { headers: { Authorization: `Bearer ${accessToken}` } }));
  if (me.role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', NOT_AN_ADMIN);
  session.start(accessToken, expiresIn, me);
}

export function AppProviders({ api, session, children }: { api: ApiClient; session: Session; children: ReactNode }) {
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const doSignIn = useCallback(
    (email: string, password: string) => signIn(api, session, email, password),
    [api, session],
  );
  const signOut = useCallback(() => session.end('signed-out'), [session]);
  const value = useMemo(() => ({ state, signIn: doSignIn, signOut }), [state, doSignIn, signOut]);
  return (
    <ApiContext.Provider value={api}>
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </ApiContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AppProviders>');
  return value;
}

export function useApi(): ApiClient {
  const value = useContext(ApiContext);
  if (!value) throw new Error('useApi must be used inside <AppProviders>');
  return value;
}
