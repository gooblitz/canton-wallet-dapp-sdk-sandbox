import { defineConfig, loadEnv } from 'vite';

function splitProxyTarget(raw: string): { origin: string; pathPrefix: string } {
  const parsed = new URL(raw);
  return {
    origin: parsed.origin,
    pathPrefix: parsed.pathname.replace(/\/+$/, ''),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const scanProxyBackendURL = (env.SCAN_PROXY_BACKEND_URL || 'https://sp-lat-dn.cddev.site').trim();
  const testnetScanProxyBackendURL = (
    env.TESTNET_SCAN_PROXY_BACKEND_URL
    || 'https://sp-lat-tn.cddev.site'
  ).trim();
  const utilitiesTokenStandardDevNetURL = splitProxyTarget(
    (env.UTILITIES_TOKEN_STANDARD_DEVNET_URL || 'https://api.utilities.digitalasset-dev.com/api/token-standard/v0').trim(),
  );
  const utilitiesTokenStandardTestNetURL = splitProxyTarget(
    (env.UTILITIES_TOKEN_STANDARD_TESTNET_URL || 'https://api.utilities.digitalasset-staging.com/api/token-standard/v0').trim(),
  );
  const utilitiesTokenStandardMainNetURL = splitProxyTarget(
    (env.UTILITIES_TOKEN_STANDARD_MAINNET_URL || 'https://api.utilities.digitalasset.com/api/token-standard/v0').trim(),
  );
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
        '/api/registry-proxy/testnet': {
          target: testnetScanProxyBackendURL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/registry-proxy\/testnet/, '/v0/scan-proxy'),
          ...(upstreamAuthHeader.length > 0
            ? {
                headers: {
                  Authorization: upstreamAuthHeader,
                },
              }
            : {}),
        },
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
        '/api/token-standard/devnet': {
          target: utilitiesTokenStandardDevNetURL.origin,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/token-standard\/devnet/, utilitiesTokenStandardDevNetURL.pathPrefix),
        },
        '/api/token-standard/testnet': {
          target: utilitiesTokenStandardTestNetURL.origin,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/token-standard\/testnet/, utilitiesTokenStandardTestNetURL.pathPrefix),
        },
        '/api/token-standard/mainnet': {
          target: utilitiesTokenStandardMainNetURL.origin,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/token-standard\/mainnet/, utilitiesTokenStandardMainNetURL.pathPrefix),
        },
      },
    },
  };
});
