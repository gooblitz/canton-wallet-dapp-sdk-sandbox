# Local dApp SDK Sandbox

Small local dApp for testing Canton Wallet CIP-0103 integration with `@canton-network/dapp-sdk`.

## What this tests

- Provider injection (`remote` or `extension`)
- `connect`, `status`, `listAccounts`
- `getPrimaryAccount` and `signMessage` via raw RPC request
- Transfer command helper that resolves Token Standard transfer context and prefills `prepareExecute` JSON
- `prepareExecute`, `prepareExecuteAndWait`
- `ledgerApi` smoke call (`GET /v2/version`)
- Event subscriptions (`statusChanged`, `accountsChanged`, `txChanged`)

## Prerequisites

1. Wallet backend and frontend running locally.
2. Backend CORS must allow this dApp origin when using `remote` provider.

Example backend env:

```bash
CORS_ALLOWED_ORIGINS="http://wallet.localhost:5183,http://127.0.0.1:4174"
FRONTEND_URL="http://wallet.localhost:5183"
```

If you use a different host/port for this app, add it to `CORS_ALLOWED_ORIGINS`.

Optional dApp env for registry discovery:

```bash
VITE_REGISTRY_URLS_JSON='{"devnet":"https://registry.devnet.example.com","mainnet":"https://registry.mainnet.example.com"}'
VITE_TOKEN_REGISTRY_URL='https://registry.devnet.example.com' # fallback for devnet
VITE_SCAN_URL='https://scan.devnet.example.com'               # optional CNS fallback
VITE_REGISTRY_PROXY_URL='/api/registry-proxy'                 # proxy endpoint used by this app
REGISTRY_PROXY_ALLOWED_HOSTS='wallet.localhost,localhost,127.0.0.1,sp-lat-dn.cddev.site'
# REGISTRY_PROXY_TIMEOUT_MS='15000'                           # optional
```

## Run

```bash
cd experiments/typescript/local-dapp-sdk
npm install
npm run dev
```

Open: `http://127.0.0.1:4174`

## Usage (remote provider)

1. Keep `walletType=remote`.
2. Ensure RPC URL is your wallet backend dApp endpoint (default `https://lat-dn.cddev.site/api/v1/dapp`).
3. Click `Inject Provider`.
4. Click `connect()`.
   - If the wallet requires user interaction, errors may include `data.userUrl`; the app auto-opens it.
5. To prefill a transfer command for `prepareExecute`:
   - Fill recipient and amount.
   - Set `Registry URL` (or let the app resolve it from network config/CNS fallback).
   - Keep `Registry Proxy URL` as `/api/registry-proxy` for CORS-restricted scan-proxy/registry deployments.
   - Set `Expected Admin` (or `Instrument Admin`) under `Advanced (optional)`.
   - Click `Resolve context` (or use `Refresh context`) to query:
     - `POST /registry/transfer-instruction/v1/transfer-factory`
   - The app fills:
     - `Transfer Factory Contract ID`
     - `extraArgs.context`
     - `disclosedContracts`
   - Keep `Transfer Factory Template ID` (in `Advanced`) as `#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferFactory` unless your network uses a different package mapping.
   - If registry lookup is unavailable, enable `Edit manually` and enter fields yourself.
   - Expand `Advanced (optional)` for expected admin, template-id override, context, and disclosed contracts.
   - Click `Prefill prepareExecute transfer`.
   - Review the generated JSON and run `prepareExecute()` (or `prepareExecuteAndWait()`).
6. Use the other actions (`status`, `listAccounts`, `signMessage`, etc.).

## Usage (extension provider)

1. Load wallet browser extension.
2. Switch to `walletType=extension` and click `Inject Provider`.
3. Use the same action buttons.

## Notes

- `prepareExecute*` needs valid command payloads for your devnet packages/contracts.
- The default command JSON is only a template and will usually fail until replaced.
- Transfer context lookup is cached for a short TTL per `(networkId, partyId, registryUrl, transfer args)`.
- Default fallbacks (when env vars are unset):
  - `VITE_WALLET_RPC_URL=https://lat-dn.cddev.site/api/v1/dapp`
  - `VITE_TOKEN_REGISTRY_URL=https://sp-lat-dn.cddev.site/v0/scan-proxy`
  - `VITE_SCAN_URL=https://sp-lat-dn.cddev.site/v0/scan-proxy`
- ACS/`/v2/state/active-contracts` factory discovery has been removed from this dApp.
- Discovery calls are proxy-first (`/api/registry-proxy`) then fall back to direct browser fetch.
- `/api/registry-proxy` is implemented by this Vite dev server (`vite.config.ts`). For non-dev deployments, expose the same endpoint contract in your dApp backend.
- Registry discovery uses `X-API-Key` + allowlisted domains (no bearer-token forwarding/minting in the proxy).
- The app auto-normalizes `TransferFactory` template IDs before submit (adds `#` for package-name IDs).
- In `remote` mode, this sandbox uses direct JSON-RPC for `getPrimaryAccount`, `signMessage`, and `prepareExecuteAndWait` so testing is not blocked by SDK remote-provider method coverage.

## Troubleshooting

- `Registry info lookup failed: HTTP 401` / `The supplied authentication is invalid`
  - Verify `Registry / Scan API Key` in the UI and ensure the target domain is in `REGISTRY_PROXY_ALLOWED_HOSTS`.
  - Restart `npm run dev` after env changes.
- `TEMPLATES_OR_INTERFACES_NOT_FOUND` with `pkg:Module:Template`
  - `commands JSON` still has the placeholder command.
  - Click `Prefill prepareExecute transfer` and submit the generated `ExerciseCommand` for `TransferFactory_Transfer`.
