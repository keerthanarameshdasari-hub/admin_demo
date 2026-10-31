/**
 * Typed client for backend_demo. Every path, parameter and body type comes
 * from schema.d.ts, which is generated from the pinned api/openapi.json, so a
 * field the backend renames or removes becomes a compile error here.
 */
import createClient, { type Middleware } from 'openapi-fetch';
import type { Session } from '../auth/session.ts';
import type { components, paths } from './schema';

export type Schemas = components['schemas'];
export type ApiClient = ReturnType<typeof createClient<paths>>;

export type KycStatus = Schemas['UserResponse']['kycStatus'];
export type TopUpStatus = Schemas['TopUpResponse']['status'];

/** Runtime lists for filters. The `satisfies` checks fail to compile if the API adds or renames a status. */
export const KYC_STATUSES = [
  'NOT_STARTED',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'TIMED_OUT',
] as const satisfies readonly KycStatus[];
export const TOP_UP_STATUSES = [
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'TIMED_OUT',
] as const satisfies readonly TopUpStatus[];
type Exhaustive<All, Listed> = [Exclude<All, Listed>] extends [never] ? true : never;
const kycComplete: Exhaustive<KycStatus, (typeof KYC_STATUSES)[number]> = true;
const topUpComplete: Exhaustive<TopUpStatus, (typeof TOP_UP_STATUSES)[number]> = true;
void kycComplete;
void topUpComplete;

/** An error response from the API, in its `{ statusCode, code, message }` shape. */
export class ApiError extends Error {
  override name = 'ApiError';
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Turns an openapi-fetch result into data, or throws ApiError. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.data !== undefined && result.response.ok) return result.data;
  const body = (result.error ?? {}) as Partial<Schemas['ErrorResponse']>;
  throw new ApiError(
    result.response.status,
    typeof body.code === 'string' ? body.code : 'ERROR',
    typeof body.message === 'string' && body.message ? body.message : `Request failed (HTTP ${result.response.status})`,
  );
}

/** The backend's AdminGuard refusal, as opposed to a 403 about one specific action. */
export const ADMIN_ACCESS_REQUIRED = 'Admin access required';

async function isAdminAccessRevoked(response: Response): Promise<boolean> {
  try {
    const body = (await response.json()) as Partial<Schemas['ErrorResponse']>;
    return body.message === ADMIN_ACCESS_REQUIRED;
  } catch {
    return false;
  }
}

export function createApiClient(baseUrl: string, session: Session, fetchImpl?: typeof fetch): ApiClient {
  // Resolve fetch at call time (not import time) so test doubles installed later are used.
  const client = createClient<paths>({ baseUrl, fetch: fetchImpl ?? ((input) => globalThis.fetch(input)) });

  const auth: Middleware = {
    onRequest({ request }) {
      const token = session.getToken();
      // A caller that set its own Authorization (sign-in's profile check) keeps it.
      if (token && !request.headers.has('Authorization')) request.headers.set('Authorization', `Bearer ${token}`);
      return request;
    },
    async onResponse({ request, response }) {
      const token = session.getToken();
      if (!token || request.headers.get('Authorization') !== `Bearer ${token}`) return response;
      if (response.status === 401) {
        session.end('expired'); // token expired or was refused
      } else if (response.status === 403 && (await isAdminAccessRevoked(response.clone()))) {
        session.end('revoked'); // the account was demoted while signed in
      }
      return response;
    },
  };
  client.use(auth);
  return client;
}
