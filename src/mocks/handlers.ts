/**
 * MSW handlers that behave like backend_demo for the routes the portal uses,
 * including its auth, admin check, validation and KYC override rules (see
 * backend_demo's AdminService). Response bodies are checked against the
 * generated schema with `satisfies`.
 *
 * Erasable TypeScript only: Node runs this file directly for the E2E mock server.
 */
import { http, HttpResponse } from 'msw';
import type { Schemas } from '../api/client.ts';
import { createDb, type MockDb, type UserRow } from './db.ts';

const MAX_PAGE = 100;

type ErrorBody = Schemas['ErrorResponse'];

const error = (statusCode: number, code: string, message: string) =>
  HttpResponse.json({ statusCode, code, message } satisfies ErrorBody, { status: statusCode });

const publicUser = (user: UserRow): Schemas['UserResponse'] => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  role: user.role,
  kycStatus: user.kycStatus,
  createdAt: user.createdAt,
});

function page(url: URL): { limit: number; offset: number } | Response {
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const offset = Number(url.searchParams.get('offset') ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE) {
    return error(400, 'BAD_REQUEST', `limit must not be greater than ${MAX_PAGE}`);
  }
  if (!Number.isInteger(offset) || offset < 0) return error(400, 'BAD_REQUEST', 'offset must not be less than 0');
  return { limit, offset };
}

export function createHandlers(baseUrl: string, db: MockDb = createDb()) {
  const api = (path: string) => `${baseUrl}${path}`;
  let issued = 0;

  function signedIn(request: Request): UserRow | Response {
    const [scheme, token] = (request.headers.get('Authorization') ?? '').split(' ');
    const userId = scheme === 'Bearer' && token ? db.tokens.get(token) : undefined;
    const user = userId ? db.users.find((u) => u.id === userId) : undefined;
    return user ?? error(401, 'UNAUTHORIZED', 'Invalid or expired token');
  }

  function admin(request: Request): UserRow | Response {
    const user = signedIn(request);
    if (user instanceof Response) return user;
    return user.role === 'ADMIN' ? user : error(403, 'FORBIDDEN', 'Admin access required');
  }

  function decide(request: Request, id: string, status: 'APPROVED' | 'REJECTED', reason: string | null) {
    const actor = admin(request);
    if (actor instanceof Response) return actor;
    const submission = db.submissions.find((s) => s.id === id);
    if (!submission) return error(404, 'NOT_FOUND', 'KYC submission not found');
    if (submission.userId === actor.id) return error(403, 'FORBIDDEN', 'Admins cannot review their own KYC submission');
    if (submission.status === 'PENDING') {
      return error(409, 'CONFLICT', 'This submission is still with the verification provider');
    }
    if (submission.status === status) return error(409, 'CONFLICT', `This submission is already ${status}`);
    const latest = db.submissions
      .filter((s) => s.userId === submission.userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (latest?.id !== submission.id)
      return error(409, 'CONFLICT', "Only the user's latest KYC submission can be reviewed");

    Object.assign(submission, {
      status,
      decisionReason: reason,
      decidedAt: new Date().toISOString(),
      reviewedBy: actor.id,
    });
    const owner = db.users.find((u) => u.id === submission.userId);
    if (owner) owner.kycStatus = status;
    return HttpResponse.json(submission satisfies Schemas['AdminKycSubmissionResponse']);
  }

  return [
    http.post(api('/auth/login'), async ({ request }) => {
      const body = (await request.json().catch(() => null)) as Partial<Schemas['LoginRequest']> | null;
      const user = db.users.find((u) => u.email === body?.email?.trim().toLowerCase());
      if (!user || user.password !== body?.password) return error(401, 'UNAUTHORIZED', 'Invalid email or password');
      const accessToken = `mock-token-${user.id}-${(issued += 1)}`;
      db.tokens.set(accessToken, user.id);
      return HttpResponse.json({
        accessToken,
        tokenType: 'Bearer',
        expiresIn: 3600,
      } satisfies Schemas['TokenResponse']);
    }),

    http.get(api('/users/me'), ({ request }) => {
      const user = signedIn(request);
      return user instanceof Response ? user : HttpResponse.json(publicUser(user));
    }),

    http.get(api('/admin/users'), ({ request }) => {
      const actor = admin(request);
      if (actor instanceof Response) return actor;
      const url = new URL(request.url);
      const paging = page(url);
      if (paging instanceof Response) return paging;
      const kycStatus = url.searchParams.get('kycStatus');
      const rows = [...db.users]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .filter((u) => !kycStatus || u.kycStatus === kycStatus);
      return HttpResponse.json({
        items: rows.slice(paging.offset, paging.offset + paging.limit).map(publicUser),
        total: rows.length,
        ...paging,
      } satisfies Schemas['AdminUserPage']);
    }),

    http.get(api('/admin/kyc'), ({ request }) => {
      const actor = admin(request);
      if (actor instanceof Response) return actor;
      const url = new URL(request.url);
      const paging = page(url);
      if (paging instanceof Response) return paging;
      const status = url.searchParams.get('status');
      const rows = db.submissions.filter((s) => !status || s.status === status);
      return HttpResponse.json({
        items: rows.slice(paging.offset, paging.offset + paging.limit),
        total: rows.length,
        ...paging,
      } satisfies Schemas['AdminKycSubmissionPage']);
    }),

    http.post<{ id: string }>(api('/admin/kyc/:id/approve'), ({ request, params }) =>
      decide(request, params.id, 'APPROVED', null),
    ),

    http.post<{ id: string }>(api('/admin/kyc/:id/reject'), async ({ request, params }) => {
      const body = (await request.json().catch(() => null)) as Partial<Schemas['RejectKycRequest']> | null;
      const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
      if (reason.length < 3 || reason.length > 500) {
        const actor = admin(request); // auth errors win over validation, as in the real API
        return actor instanceof Response ? actor : error(400, 'VALIDATION', 'reason must be 3-500 characters');
      }
      return decide(request, params.id, 'REJECTED', reason);
    }),

    http.get(api('/admin/top-ups'), ({ request }) => {
      const actor = admin(request);
      if (actor instanceof Response) return actor;
      const url = new URL(request.url);
      const paging = page(url);
      if (paging instanceof Response) return paging;
      const userId = url.searchParams.get('userId');
      const status = url.searchParams.get('status');
      const rows = db.topUps.filter((t) => (!userId || t.userId === userId) && (!status || t.status === status));
      return HttpResponse.json({
        items: rows.slice(paging.offset, paging.offset + paging.limit),
        total: rows.length,
        ...paging,
      } satisfies Schemas['AdminTopUpPage']);
    }),
  ];
}
