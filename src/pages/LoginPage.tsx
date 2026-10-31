import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext.tsx';

const REASON: Record<string, string> = {
  expired: 'Your session expired. Sign in again.',
  revoked: 'Your admin access was removed.',
};

export function LoginPage() {
  const { state, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const next = (location.state as { from?: string } | null)?.from ?? '/kyc';
  if (state.status === 'signed-in') return <Navigate to={next} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
      setBusy(false);
    }
  }

  const notice = state.reason ? REASON[state.reason] : undefined;
  return (
    <main className="login">
      <form className="login-card" onSubmit={submit} aria-labelledby="login-title">
        <p className="brand">Wallet Admin</p>
        <h1 id="login-title">Sign in</h1>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        <label>
          <span>Email</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
