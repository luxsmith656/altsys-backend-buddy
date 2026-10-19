import { createClient } from '@supabase/supabase-js';

export type ApiRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
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

export function databaseClient(accessToken?: string) {
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY');
  if (!url || !key) return null;
  return createClient(url, key, { global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined, auth: { persistSession: false, autoRefreshToken: false } });
}

export function parseNotes(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}
