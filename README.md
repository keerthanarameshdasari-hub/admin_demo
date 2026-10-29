# admin_demo

Admin panel (React + TypeScript) for the CI/CD demo (`backend_demo`, `admin_demo`, `frontend_demo`, `infra_demo`).

Branch flow: `feature/*` → `dev` → `test` → `main`, each step by pull request.

`src/App.tsx` is a placeholder until the real app lands; it exists so CodeQL has
TypeScript to analyse. See [docs/ci.md](docs/ci.md) for what runs on every pull request.
