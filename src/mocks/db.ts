/**
 * In-memory stand-in for backend_demo's data, shared by the unit/component
 * tests (MSW in Node) and the E2E mock API server. Rows are typed with the
 * generated API schema, so if the backend renames a field the fixtures stop
 * compiling too.
 *
 * Plain, erasable TypeScript with `.ts` import paths only: Node runs this file
 * directly (type stripping) for the E2E mock server.
 */
import type { Schemas } from '../api/client.ts';

export type UserRow = Schemas['UserResponse'] & { password: string };
export type SubmissionRow = Schemas['AdminKycSubmissionResponse'];
export type TopUpRow = Schemas['AdminTopUpResponse'];

export const ADMIN = { email: 'admin@example.com', password: 'admin-password-1' } as const;
export const NON_ADMIN = { email: 'ravi@example.com', password: 'ravi-password-1' } as const;

/** Stable ids so tests can refer to rows. */
export const IDS = {
  admin: '00000000-0000-4000-8000-00000000a001',
  asha: '00000000-0000-4000-8000-00000000a002',
  ben: '00000000-0000-4000-8000-00000000a003',
  chen: '00000000-0000-4000-8000-00000000a004',
  esha: '00000000-0000-4000-8000-00000000a005',
  ravi: '00000000-0000-4000-8000-00000000a006',
  ashaOldSubmission: '00000000-0000-4000-8000-00000000b001',
  ashaSubmission: '00000000-0000-4000-8000-00000000b002',
  benSubmission: '00000000-0000-4000-8000-00000000b003',
  chenSubmission: '00000000-0000-4000-8000-00000000b004',
  eshaSubmission: '00000000-0000-4000-8000-00000000b005',
} as const;

const at = (day: number, hour = 10) => new Date(Date.UTC(2026, 9, day, hour, 0, 0)).toISOString();

function seedUsers(): UserRow[] {
  const user = (
    id: string,
    fullName: string,
    email: string,
    kycStatus: UserRow['kycStatus'],
    day: number,
  ): UserRow => ({
    id,
    email,
    fullName,
    role: 'USER',
    kycStatus,
    createdAt: at(day),
    password: 'irrelevant-password',
  });
  return [
    { ...user(IDS.admin, 'Ada Admin', ADMIN.email, 'NOT_STARTED', 1), role: 'ADMIN', password: ADMIN.password },
    user(IDS.asha, 'Asha Rao', 'asha@example.com', 'REJECTED', 2),
    user(IDS.ben, 'Ben Okafor', 'ben@example.com', 'APPROVED', 3),
    user(IDS.chen, 'Chen Li', 'chen@example.com', 'TIMED_OUT', 4),
    user(IDS.esha, 'Esha Patel', 'esha@example.com', 'PENDING', 5),
    { ...user(IDS.ravi, 'Ravi Kumar', NON_ADMIN.email, 'NOT_STARTED', 6), password: NON_ADMIN.password },
  ];
}

function ownerOf(users: UserRow[], id: string) {
  const u = users.find((x) => x.id === id);
  if (!u) throw new Error(`seed data has no user ${id}`);
  return { id: u.id, email: u.email, fullName: u.fullName };
}

function seedSubmissions(users: UserRow[]): SubmissionRow[] {
  const owner = (id: string) => ownerOf(users, id);
  const submission = (
    id: string,
    userId: string,
    status: SubmissionRow['status'],
    day: number,
    decisionReason: string | null = null,
  ): SubmissionRow => ({
    id,
    userId,
    user: owner(userId),
    documentType: 'PASSPORT',
    documentNumberLast4: '4567',
    documentMimeType: 'image/png',
    status,
    decisionReason,
    reviewedBy: null,
    createdAt: at(day, 11),
    decidedAt: status === 'PENDING' ? null : at(day, 12),
  });
  // Newest first, as the API returns them.
  return [
    submission(IDS.eshaSubmission, IDS.esha, 'PENDING', 9),
    submission(IDS.chenSubmission, IDS.chen, 'TIMED_OUT', 8, 'Verification provider did not respond in time'),
    submission(IDS.benSubmission, IDS.ben, 'APPROVED', 7),
    submission(IDS.ashaSubmission, IDS.asha, 'REJECTED', 6, 'document_expired'),
    submission(IDS.ashaOldSubmission, IDS.asha, 'TIMED_OUT', 3, 'Verification provider did not respond in time'),
  ];
}

function seedTopUps(users: UserRow[]): TopUpRow[] {
  const owner = (id: string) => ownerOf(users, id);
  const topUp = (
    n: number,
    userId: string,
    amountMinor: number,
    status: TopUpRow['status'],
    day: number,
    failureReason: string | null = null,
  ): TopUpRow => ({
    id: `00000000-0000-4000-8000-00000000c${String(n).padStart(3, '0')}`,
    userId,
    user: owner(userId),
    amountMinor,
    currency: 'INR',
    status,
    failureReason,
    createdAt: at(day, 14),
    completedAt: status === 'PENDING' ? null : at(day, 15),
  });
  return [
    topUp(4, IDS.ben, 999, 'FAILED', 12, 'card_declined'),
    topUp(3, IDS.ben, 250_000, 'SUCCEEDED', 11),
    topUp(2, IDS.ben, 50_000, 'SUCCEEDED', 10),
    topUp(1, IDS.ben, 120_050, 'TIMED_OUT', 9, 'Payment provider did not respond in time'),
  ];
}

export interface MockDb {
  users: UserRow[];
  submissions: SubmissionRow[];
  topUps: TopUpRow[];
  /** token -> user id */
  tokens: Map<string, string>;
  reset(): void;
}

export function createDb(): MockDb {
  const db: MockDb = {
    users: [],
    submissions: [],
    topUps: [],
    tokens: new Map(),
    reset() {
      db.users = seedUsers();
      db.submissions = seedSubmissions(db.users);
      db.topUps = seedTopUps(db.users);
      db.tokens = new Map();
    },
  };
  db.reset();
  return db;
}
