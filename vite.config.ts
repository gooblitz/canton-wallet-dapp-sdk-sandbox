import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const scanProxyBackendURL = (env.SCAN_PROXY_BACKEND_URL || 'http://127.0.0.1:8086').trim();

  return {
    server: {
      proxy: {
        '/api/registry-proxy': {
          target: scanProxyBackendURL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/registry-proxy/, '/v0/scan-proxy'),
        },
      },
    },
  };
});
