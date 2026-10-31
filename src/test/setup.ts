import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { createDb } from '../mocks/db.ts';
import { createHandlers } from '../mocks/handlers.ts';

export const TEST_API = 'http://api.test';
export const db = createDb();
export const server = setupServer(...createHandlers(TEST_API, db));

// Any request without a handler is a bug in the test or the app: fail loudly.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  db.reset();
});
afterAll(() => server.close());
