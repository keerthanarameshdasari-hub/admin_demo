# CI and security checks

This page explains what runs automatically on this repository and why. You don't need to
run any of it yourself; it all happens on GitHub when you open a pull request.

## How code moves

```
feature/* ──PR──▶ dev ──PR──▶ test ──PR──▶ main
```

Every arrow is a pull request, and every pull request into `dev`, `test` or `main` runs two
workflows: **CI** (`.github/workflows/ci.yml`: lint, types, tests, build, E2E, bundle size; see
"The CI workflow" below) and **Security** (`.github/workflows/security.yml`). Security also runs:

- on every push to `dev` (i.e. after a PR merges), so `dev` itself is scanned and the Security
  tab reflects what is actually on the branch;
- every Monday morning, so new problems in code that hasn't changed still get noticed (a
  vulnerability can be discovered in a package years after we added it).

It never runs on `pull_request_target`, and it needs no secrets.

A pull request can only merge when all of its required checks are green. PRs into `dev` need
nothing more, so you can merge your own. PRs into `test` and `main` also need an approval from
the other maintainer (see "Who reviews what").

## The Security workflow

### Secret scan (gitleaks)

Looks through **every commit in the history** for things that look like passwords, API keys
and tokens.

*Why:* once a secret is pushed to GitHub, deleting it in a later commit doesn't help. It is
still in the history and anyone who clones the repo can find it. This job catches it in
the PR, before it reaches a shared branch.

*If it fails:* the log shows the file and commit (the secret itself is redacted). Revoke the
secret with whoever issued it first, then remove it from your branch's history.

### Dependency review

Compares the dependencies in your PR with those on the branch you're merging into. It fails if
your PR **adds** a package that has a **high or critical** known vulnerability, or a package
licensed under **GPL or AGPL**.

*Why:* most of the code we ship is other people's. A vulnerable package is an easy way in for
an attacker, and GPL/AGPL licences can oblige us to publish our own source code.

*If it fails:* upgrade to a fixed version, or pick a different package. It only runs on pull
requests, so it shows as "skipped" on pushes to `dev` and the weekly run, which is expected.

### CodeQL (actions) and CodeQL (javascript-typescript)

GitHub's code analyser. It runs once per language, which is why it shows up as two checks:

- **actions** reads our workflow files and looks for things like untrusted input reaching a
  shell script, or a job with more permissions than it uses.
- **javascript-typescript** reads the portal (`src/`), its scripts (`scripts/`) and the E2E mock
  server (`e2e/`), and looks for security bugs such as injection, cross-site scripting and unsafe
  use of user input.

*Why:* these are the bugs reviewers miss most often, because the dangerous path can run across
several files.

*If it fails:* open the **Security → Code scanning** tab for the explanation and a suggested fix.

**A later step must add more languages.** This repo has no native code yet. When `android/`
is added, add `java-kotlin` to the language list in `security.yml`; when `ios/` is added, add
`swift` (that one needs a macOS runner). Until then those folders are not analysed.

### Workflow audit (zizmor)

Checks our GitHub Actions workflow files for security mistakes: overly broad permissions,
unpinned third-party actions, untrusted input injected into shell scripts, and so on.

*Why:* CI has access to the code and often to deployment credentials. A badly written
workflow is one of the easiest ways to compromise a repository.

### Workflow lint (actionlint)

Checks workflow files for plain mistakes: YAML errors, typos in keys, wrong expression syntax,
and bugs in the shell scripts inside `run:` steps.

*Why:* without it, a typo in a workflow only shows up when the workflow runs, or quietly
makes a job do nothing.

## The CI workflow

`ci.yml` runs on every pull request. Its jobs, and what to do when one fails:

### Lint

ESLint (including a rule that forbids `localStorage`, `sessionStorage`, IndexedDB and
`document.cookie` in `src/`, because the access token must stay in memory) and Prettier.

*If it fails:* run `npm run lint` and `npm run format` locally.

### Types and API contract

1. `npm run api:check`: `api/openapi.json` must match the sha256 in `api/openapi.lock.json`
   (so nobody hand-edits the copied spec), and `src/api/schema.d.ts` must be exactly what the
   generator produces from it. It warns (doesn't fail) while the spec is pinned to a commit
   rather than a tag.
2. `npm run typecheck`: `tsc` for the app and for the tooling and E2E code.
3. `npm run api:canary`: renames, one at a time, several fields and a path the portal uses,
   regenerates the client and requires `tsc` to fail in app code each time.

*Why:* the backend's contract can change. With a typed client, a renamed or removed field is
caught here, not by an admin clicking a broken button.

*If it fails:* if you updated the spec, run `npm run api:fetch -- <tag>` (never edit
`api/openapi.json` by hand) and fix what `tsc` reports. If the canary fails, some code reads API
data through `any` or a cast; type it from `Schemas` in `src/api/client.ts` instead.

### Unit and component tests

Vitest with Testing Library. The API is mocked with MSW (`src/mocks/`), which follows the
backend's rules. A request with no mock fails the test.

### Build

`npm run build`, uploaded as the `admin-dist` artifact. The next two jobs test that exact output
instead of rebuilding.

### E2E (Playwright)

Headless Chromium against the build, served by `vite preview`, talking cross-origin to
`e2e/mock-api-server.ts` (the same MSW handlers on a real port). The run writes a `config.json`
into a copy of the build, as a deploy does. Covers login, approve KYC, reject KYC and viewing
transactions.

*If it fails:* download the `playwright-report` artifact and open `index.html`; failed tests
include a trace and a screenshot. Locally: `npm run build && npm run e2e`.

### Bundle size budget

Gzipped JS and CSS in the build must stay within `bundle-budget.json`. It also fails if the
build contains the test mocks or a `config.json`, because the same build must work in every
environment.

*If it fails:* look at what grew (the job summary lists sizes). Raise the budget only on purpose,
in the PR that needs it.

### admin-ci-passed

Runs last, always, and fails unless every job above succeeded. GitHub treats a *skipped*
required check as passing, so this is the one CI check to require, and adding a job to `ci.yml`
only means adding it to this job's `needs`.

## Rules we follow in workflows

- **Permissions start at nothing.** The workflow sets `permissions: {}` and each job asks only
  for what it needs (usually just read access to the code).
- **Third-party actions are pinned to a commit SHA**, with the version in a comment, e.g.
  `actions/checkout@3d3c42e…  # v7.0.1`. A tag like `v7` can be moved to point at different
  code; a SHA cannot.
- **Downloaded tools are checksum-verified** before they run.
- **No `pull_request_target`.** It runs PR code with write access, which is the classic way
  CI gets hijacked.
- **Never put `${{ github.event.* }}` inside a `run:` script.** Things like PR titles and branch
  names are typed by whoever opens the PR, and putting them straight into a script lets them
  run commands. Pass them through `env:` instead.
- **No secrets are needed** for these checks.

## Keeping things up to date

Dependabot (`.github/dependabot.yml`) opens a pull request into `dev` every Monday for
outdated npm packages and GitHub Actions. Minor and patch updates are grouped into one PR per
ecosystem, so there's less noise. Those PRs go through the same checks as everyone else's.

## Who reviews what

`.github/CODEOWNERS` makes @keerthanarameshdasari-hub and @Keerthana-212 the code owners of
every file, with explicit lines for CI config (`.github/`), infrastructure (`infra/`),
Dockerfiles and `package-lock.json`. Lines for `android/` and `ios/` are ready but commented
out until those folders exist.

Because every file has owners, GitHub automatically asks the other maintainer to review each
pull request; it shows up in their GitHub notifications (and email, if they have it on). What
that review means depends on where the PR is going.

Each branch has its own ruleset (Settings → Rules → Rulesets):

| | `protect-dev` | `protect-test` | `protect-main` |
|---|---|---|---|
| Approvals needed | none set | 1, from a code owner | 1, from a code owner |
| Merge method | squash only | merge commit only | merge commit only |
| Branch must be up to date with its target | yes | no | no |

So you can merge your own PR into `dev` once its checks are green, but a PR into `test` or `main`
needs the other maintainer to approve it.

All three also: dismiss an approval when new commits are pushed, require every review
conversation to be resolved, and block force-pushes and deleting the branch. None has a bypass
list, so admins follow the same rules. A fourth ruleset, `protect-release-tags`, stops `v*` tags
from being moved or deleted.

To review, open the PR, go to **Files changed → Review changes**, pick **Approve** or
**Request changes**, and submit.

## Required checks

These are the check names to require in all three branch rulesets, `protect-dev`,
`protect-test` and `protect-main`:

| Check name | Workflow | Job |
|---|---|---|
| `admin-ci-passed` | CI | admin-ci-passed (covers every other CI job) |
| `Secret scan (gitleaks)` | Security | gitleaks |
| `Dependency review` | Security | dependency-review |
| `CodeQL (actions)` | Security | codeql |
| `CodeQL (javascript-typescript)` | Security | codeql |
| `Workflow audit (zizmor)` | Security | zizmor |
| `Workflow lint (actionlint)` | Security | actionlint |

Don't add the individual CI jobs: `admin-ci-passed` already requires them, and new CI jobs are
covered as soon as they're added to its `needs:` list.

If you rename a job or add a CodeQL language, update the rulesets too. A required check whose
name no longer exists never reports, and PRs wait on it forever.
