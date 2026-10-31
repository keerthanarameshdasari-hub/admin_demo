import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createApiClient } from '../api/client.ts';
import { routes } from '../App.tsx';
import { AppProviders, signIn } from '../auth/AuthContext.tsx';
import { Session } from '../auth/session.ts';
import { ADMIN } from '../mocks/db.ts';
import { TEST_API } from './setup.ts';

/** Renders the whole app (real routes, real client) at `path`, against the MSW API. */
export async function renderApp(path: string, { signedIn = true } = {}) {
  const session = new Session();
  const api = createApiClient(TEST_API, session);
  if (signedIn) await signIn(api, session, ADMIN.email, ADMIN.password);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();
  const view = render(
    <AppProviders api={api} session={session}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...view, user, session, api, router };
}
