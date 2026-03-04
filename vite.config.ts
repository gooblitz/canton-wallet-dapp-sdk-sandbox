import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, loadEnv } from 'vite';

type RegistryProxyRequestPayload = {
  endpoint?: unknown;
  method?: unknown;
  headers?: unknown;
  bodyText?: unknown;
};

const DEFAULT_ALLOWED_HOSTS = ['localhost', '127.0.0.1', 'wallet.localhost'];
const SAFE_ENDPOINT_MARKERS = ['/registry/', '/v0/scan-proxy/', '/v0/ans-entries/'];
const MAX_REQUEST_BYTES = 256 * 1024;

function normalizeHost(hostname: string): string {
  const value = hostname.toLowerCase();
  if (value === 'localhost' || value === '127.0.0.1' || value === 'wallet.localhost') {
    return 'local-dev-host';
  }
  return value;
}

function parseAllowedHosts(raw: string): Set<string> {
  const configured = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const selected = configured.length > 0 ? configured : DEFAULT_ALLOWED_HOSTS;
  return new Set(selected.map((host) => normalizeHost(host)));
}

function parseTimeoutMs(raw: string | undefined): number {
  const parsed = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 15_000;
  }
  return parsed;
}

function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_REQUEST_BYTES) {
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function parseForwardHeaders(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string') continue;
    const lower = key.toLowerCase();
    if (lower === 'accept' || lower === 'content-type' || lower === 'x-api-key') {
      out[key] = value;
    }
  }
  return out;
}

function parseMethod(raw: unknown): 'GET' | 'POST' | null {
  if (typeof raw !== 'string') return null;
  const upper = raw.toUpperCase();
  if (upper === 'GET' || upper === 'POST') {
    return upper;
  }
  return null;
}

function isAllowedEndpoint(endpoint: URL, allowedHosts: Set<string>): boolean {
  if (!['http:', 'https:'].includes(endpoint.protocol)) {
    return false;
  }
  if (!allowedHosts.has(normalizeHost(endpoint.hostname))) {
    return false;
  }
  return SAFE_ENDPOINT_MARKERS.some((marker) => endpoint.pathname.includes(marker));
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const allowedHosts = parseAllowedHosts(env.REGISTRY_PROXY_ALLOWED_HOSTS || '');
  const timeoutMs = parseTimeoutMs(env.REGISTRY_PROXY_TIMEOUT_MS);

  return {
    plugins: [
      {
        name: 'registry-discovery-proxy',
        configureServer(server) {
          server.middlewares.use('/api/registry-proxy', async (req, res) => {
            if (req.method !== 'POST') {
              writeJson(res, 405, { error: 'Method not allowed' });
              return;
            }

            let rawBody = '';
            try {
              rawBody = await readRequestBody(req);
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              const status = message.includes('too large') ? 413 : 400;
              writeJson(res, status, { error: message });
              return;
            }

            let payload: RegistryProxyRequestPayload;
            try {
              payload = JSON.parse(rawBody) as RegistryProxyRequestPayload;
            } catch {
              writeJson(res, 400, { error: 'Request body must be valid JSON' });
              return;
            }

            const endpointRaw = typeof payload.endpoint === 'string' ? payload.endpoint.trim() : '';
            let endpoint: URL;
            try {
              endpoint = new URL(endpointRaw);
            } catch {
              writeJson(res, 400, { error: 'Invalid endpoint URL' });
              return;
            }

            if (!isAllowedEndpoint(endpoint, allowedHosts)) {
              writeJson(res, 403, { error: 'Endpoint is not allowed by registry proxy policy' });
              return;
            }

            const method = parseMethod(payload.method);
            if (!method) {
              writeJson(res, 400, { error: 'method must be GET or POST' });
              return;
            }

            const headers = parseForwardHeaders(payload.headers);

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);
            try {
              const upstream = await fetch(endpoint.toString(), {
                method,
                headers,
                body: method === 'POST' && typeof payload.bodyText === 'string' ? payload.bodyText : undefined,
                signal: controller.signal,
              });
              const bodyText = await upstream.text();
              clearTimeout(timeout);

              writeJson(res, 200, {
                status: upstream.status,
                headers: {
                  'content-type': upstream.headers.get('content-type') || 'application/json',
                },
                bodyText,
              });
            } catch (err) {
              clearTimeout(timeout);
              const message = err instanceof Error ? err.message : String(err);
              writeJson(res, 502, { error: `Upstream registry request failed: ${message}` });
            }
          });
        },
      },
    ],
  };
});
