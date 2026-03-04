import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const scanProxyBackendURL = (env.SCAN_PROXY_BACKEND_URL || 'https://sp-lat-dn.cddev.site').trim();
  const upstreamAuthRaw = (env.SCAN_PROXY_UPSTREAM_AUTH || '').trim();
  const upstreamAuthHeader =
    upstreamAuthRaw.length === 0
      ? ''
      : (upstreamAuthRaw.toLowerCase().startsWith('bearer ')
          ? upstreamAuthRaw
          : `Bearer ${upstreamAuthRaw}`);

  return {
    server: {
      proxy: {
        '/api/registry-proxy': {
          target: scanProxyBackendURL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/registry-proxy/, '/v0/scan-proxy'),
          ...(upstreamAuthHeader.length > 0
            ? {
                headers: {
                  Authorization: upstreamAuthHeader,
                },
              }
            : {}),
        },
      },
    },
  };
});
