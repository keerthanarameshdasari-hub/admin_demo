import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { createApiClient } from './api/client.ts';
import { routes } from './App.tsx';
import { AppProviders } from './auth/AuthContext.tsx';
import { Session } from './auth/session.ts';
import { loadConfig } from './config.ts';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('index.html has no #root element');
const root = createRoot(container);

try {
  const config = await loadConfig();
  const session = new Session();
  const api = createApiClient(config.apiBaseUrl, session);
  const router = createBrowserRouter(routes);
  root.render(
    <StrictMode>
      <AppProviders api={api} session={session}>
        <RouterProvider router={router} />
      </AppProviders>
    </StrictMode>,
  );
} catch (error) {
  // No API to talk to: say so plainly instead of rendering a half-working app.
  root.render(
    <main className="login">
      <div className="login-card" role="alert">
        <p className="brand">Wallet Admin</p>
        <h1>Can't start</h1>
        <p>The admin portal's configuration is missing or invalid.</p>
        <p className="sub">{error instanceof Error ? error.message : String(error)}</p>
      </div>
    </main>,
  );
}
