import { describe, expect, it, vi } from 'vitest';
import { ConfigError, loadConfig, parseConfig } from './config.ts';

describe('parseConfig', () => {
  it('accepts an http(s) base URL and drops trailing slashes', () => {
    expect(parseConfig({ apiBaseUrl: 'https://api.dev.example.com/' })).toEqual({
      apiBaseUrl: 'https://api.dev.example.com',
    });
    expect(parseConfig({ apiBaseUrl: 'http://localhost:3000/v1//' })).toEqual({
      apiBaseUrl: 'http://localhost:3000/v1',
    });
  });

  it.each([
    [null, /JSON object/],
    [[], /JSON object/],
    [{}, /needs "apiBaseUrl"/],
    [{ apiBaseUrl: 42 }, /needs "apiBaseUrl"/],
    [{ apiBaseUrl: '/api' }, /absolute URL/],
    [{ apiBaseUrl: 'javascript:alert(1)' }, /http\(s\)/],
    [{ apiBaseUrl: 'https://user:pw@api.example.com' }, /credentials/],
    [{ apiBaseUrl: 'https://api.example.com/?debug=1' }, /query/],
  ])('rejects %j', (value, message) => {
    expect(() => parseConfig(value)).toThrow(ConfigError);
    expect(() => parseConfig(value)).toThrow(message);
  });
});

describe('loadConfig', () => {
  it('fetches config.json without the HTTP cache, so a redeployed config applies on reload', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ apiBaseUrl: 'https://api.example.com' }));
    await expect(loadConfig(fetchImpl, '/config.json')).resolves.toEqual({ apiBaseUrl: 'https://api.example.com' });
    expect(fetchImpl).toHaveBeenCalledWith('/config.json', expect.objectContaining({ cache: 'no-store' }));
  });

  it.each([
    ['a 404', async () => new Response('nope', { status: 404 }), /HTTP 404/],
    ['invalid JSON', async () => new Response('<html>', { status: 200 }), /not valid JSON/],
    [
      'a network error',
      async () => {
        throw new TypeError('offline');
      },
      /Could not load/,
    ],
  ])('fails clearly on %s', async (_label, impl, message) => {
    await expect(loadConfig(impl as typeof fetch, '/config.json')).rejects.toThrow(message);
  });
});
