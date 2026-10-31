/**
 * Runtime configuration. The build is identical for every environment; each
 * environment's deploy writes /config.json next to index.html, e.g.
 *
 *   { "apiBaseUrl": "https://api.dev.example.com" }
 *
 * scripts/write-config.mjs writes and validates it.
 */
export interface RuntimeConfig {
  /** Origin (plus optional path prefix) of backend_demo, without a trailing slash. */
  apiBaseUrl: string;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export function parseConfig(value: unknown): RuntimeConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConfigError('config.json must be a JSON object');
  }
  const { apiBaseUrl } = value as Record<string, unknown>;
  if (typeof apiBaseUrl !== 'string' || apiBaseUrl.length === 0) {
    throw new ConfigError('config.json needs "apiBaseUrl" (a string)');
  }
  let url: URL;
  try {
    url = new URL(apiBaseUrl);
  } catch {
    throw new ConfigError(`"apiBaseUrl" is not an absolute URL: ${apiBaseUrl}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ConfigError('"apiBaseUrl" must be an http(s) URL');
  }
  if (url.search || url.hash || url.username || url.password) {
    throw new ConfigError('"apiBaseUrl" must not contain a query, fragment or credentials');
  }
  return { apiBaseUrl: url.href.replace(/\/+$/, '') };
}

/** Fetches and validates config.json. `no-store` so a re-deployed config is picked up on reload. */
export async function loadConfig(fetchImpl: typeof fetch = fetch, url = `${import.meta.env.BASE_URL}config.json`) {
  let response: Response;
  try {
    response = await fetchImpl(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
  } catch {
    throw new ConfigError(`Could not load ${url}`);
  }
  if (!response.ok) throw new ConfigError(`Could not load ${url} (HTTP ${response.status})`);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ConfigError(`${url} is not valid JSON`);
  }
  return parseConfig(body);
}
