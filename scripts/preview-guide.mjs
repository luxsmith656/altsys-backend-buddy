import { createServer } from 'vite';

// Normal app preview: use .env and real authentication, never a seeded browser session.
const server = await createServer({
  server: { host: '127.0.0.1', port: 3011, strictPort: true },
  plugins: [{
    name: 'remove-retired-design-preview-session',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        // Remove only the obsolete local fake session, not a real account's login.
        return html.replace('<head>', `<head><script>
          try {
            const key = 'sb-127-auth-token';
            const session = JSON.parse(localStorage.getItem(key) || 'null');
            if (session?.access_token === 'design-preview') localStorage.removeItem(key);
          } catch {}
        </script>`);
      },
    },
  }],
});
await server.listen();
console.log('Connected local preview: http://127.0.0.1:3011/ (real backend; sign in normally)');
