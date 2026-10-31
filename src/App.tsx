import { Navigate, NavLink, Outlet, useLocation, type RouteObject } from 'react-router';
import { useAuth } from './auth/AuthContext.tsx';
import { KycPage } from './pages/KycPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { TransactionsPage } from './pages/TransactionsPage.tsx';
import { UsersPage } from './pages/UsersPage.tsx';

/** Everything except /login needs a signed-in admin. */
function RequireAdmin() {
  const { state, signOut } = useAuth();
  const location = useLocation();
  if (state.status !== 'signed-in') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Wallet Admin</span>
        <nav aria-label="Main">
          <NavLink to="/kyc">KYC review</NavLink>
          <NavLink to="/users">Users</NavLink>
          <NavLink to="/transactions">Transactions</NavLink>
        </nav>
        <div className="account">
          <span>{state.user.email}</span>
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

function NotFound() {
  return (
    <>
      <h1>Page not found</h1>
      <p>
        <NavLink to="/kyc">Go to KYC review</NavLink>
      </p>
    </>
  );
}

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAdmin />,
    children: [
      { index: true, element: <Navigate to="/kyc" replace /> },
      { path: '/kyc', element: <KycPage /> },
      { path: '/users', element: <UsersPage /> },
      { path: '/transactions', element: <TransactionsPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];
