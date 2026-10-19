export type ApiRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  rawBody?: string | Uint8Array;
};

export type ApiResponse = {
  setHeader(name: string, value: string): ApiResponse;
  status(code: number): ApiResponse;
  json(body: unknown): void;
};

export const env = (name: string) => (process.env[name] ?? '').trim();

export function send(res: ApiResponse, body: unknown, status = 200) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.status(status).json(body);
}

export function getHeader(req: ApiRequest, name: string) {
  const value = req.headers[name.toLowerCase()] ?? req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function databaseConfig() {
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY');
  return url && key ? { url, key } : null;
}

export async function supabaseRequest(path: string, init: RequestInit = {}) {
  const config = databaseConfig();
  if (!config) throw new Error('Server database configuration is missing.');
  const headers = new Headers(init.headers);
  headers.set('apikey', config.key);
  headers.set('Authorization', `Bearer ${config.key}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(`${config.url}/rest/v1/${path}`, { ...init, headers });
}

export async function supabaseAuthUser(token: string) {
  const config = databaseConfig();
  if (!config) return null;
  const response = await fetch(`${config.url}/auth/v1/user`, { headers: { apikey: config.key, Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  return response.json() as Promise<{ id: string; email?: string }>;
}

export function parseNotes(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

export async function readRawBody(req: ApiRequest): Promise<string> {
  if (typeof req.rawBody === 'string') return req.rawBody;
  if (req.rawBody instanceof Uint8Array) return Buffer.from(req.rawBody).toString('utf8');
  if (typeof req.body === 'string') return req.body;
  const stream = req as unknown as AsyncIterable<Uint8Array>;
  if (typeof stream[Symbol.asyncIterator] === 'function') {
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
  }
  return JSON.stringify(req.body ?? {});
}
