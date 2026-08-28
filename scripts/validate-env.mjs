import { loadEnv } from 'vite';

const env = { ...loadEnv(process.env.MODE || 'development', process.cwd(), ''), ...process.env };
const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'];
const missing = required.filter((name) => !env[name]?.trim());

if (missing.length > 0) {
  console.error(`Missing required environment variable(s): ${missing.join(', ')}`);
  console.error('Copy .env.example to .env for local work, or configure the values in CI/Vercel.');
  process.exit(1);
}

try {
  const url = new URL(env.VITE_SUPABASE_URL);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL must use http or https');
} catch (error) {
  console.error(`VITE_SUPABASE_URL is invalid: ${error instanceof Error ? error.message : 'not a URL'}`);
  process.exit(1);
}

console.log('Environment configuration is valid.');
