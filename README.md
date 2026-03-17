# Local dApp SDK Sandbox

Small local dApp for testing Canton Wallet CIP-0103 integration with `@canton-network/dapp-sdk`.

## What this tests

- SDK wallet picker flow (`@canton-network/dapp-sdk@^0.23.0`)
- `connect`, `disconnect`, `status`, `listAccounts`
- `getPrimaryAccount` via provider request
- `signMessage` via provider request for extension, or direct remote JSON-RPC bridge for remote gateways
- Transfer command helper that resolves Token Standard transfer context and prefills `prepareExecute` JSON
- `prepareExecute`, `prepareExecuteAndWait`
- `ledgerApi` smoke call (`GET /v2/version`)
- Event subscriptions (`statusChanged`, `accountsChanged`, `txChanged`)

## Prerequisites

1. A reachable wallet endpoint (`remote` mode) or wallet browser extension (`extension` mode).
2. Reachability to scan-proxy upstream (default: `https://sp-lat-dn.cddev.site`).
3. API key accepted by that scan-proxy endpoint.
4. No separate proxy/backend process is required for this sandbox.

Optional dApp env for registry discovery:

```bash
VITE_REGISTRY_DOMAIN='https://sp-lat-dn.cddev.site' # default domain used by "Registry Domain (Default)"
VITE_REGISTRY_URLS_JSON='{"devnet":"https://registry.devnet.example.com","mainnet":"https://registry.mainnet.example.com"}'
VITE_TOKEN_REGISTRY_URL='/api/registry-proxy' # recommended default
VITE_SCAN_URL='/api/registry-proxy'           # recommended default
SCAN_PROXY_BACKEND_URL='https://sp-lat-dn.cddev.site' # Vite proxy upstream target
# Optional upstream auth header:
# SCAN_PROXY_UPSTREAM_AUTH='Bearer <token>'
```

## Run

```bash
cd canton-wallet-dapp-sdk-sandbox
npm install
npm run dev
```

Open: `http://127.0.0.1:4174`

## Usage (remote provider)

1. Ensure `Preferred Wallet Gateway URL` is your wallet backend dApp endpoint (default `https://lat-dn.cddev.site/api/v1/dapp`).
2. Click `connect() via picker`.
3. In the picker, choose `Configured Gateway (...)` or enter a custom gateway URL.
4. Use `status()` / `listAccounts()` to confirm the session.
5. To prefill a transfer command for `prepareExecute`:
   - Fill recipient and amount.
   - Use either:
     - a relative same-origin proxy path such as `/api/registry-proxy`, or
     - an absolute Registry URL discovered from network config or CNS metadata.
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
2. Click `connect() via picker`.
3. Choose `Browser Extension` in the picker.
4. Use the same action buttons.

## Notes

- `prepareExecute*` needs valid command payloads for your devnet packages/contracts.
- The default command JSON is only a template and will usually fail until replaced.
- Transfer context lookup is cached for a short TTL per `(networkId, partyId, registryUrl, transfer args)`.
- Default fallbacks (when env vars are unset):
  - `VITE_WALLET_RPC_URL=https://lat-dn.cddev.site/api/v1/dapp`
  - `VITE_TOKEN_REGISTRY_URL=/api/registry-proxy`
  - `VITE_SCAN_URL=/api/registry-proxy`
  - `SCAN_PROXY_BACKEND_URL=https://sp-lat-dn.cddev.site`
- The connect flow now uses the SDK picker. The configured gateway URL in Settings is only used to seed that picker; the active remote session may come from a different picker entry.
- Relative Registry / Scan endpoints must use same-origin `/api/registry-proxy`; absolute Registry / Scan URLs are also supported.
- Requests include `X-API-Key` from the UI; Vite forwards to configured upstream scan-proxy.
- The app auto-normalizes `TransferFactory` template IDs before submit (adds `#` for package-name IDs).
- `getPrimaryAccount` now goes through the injected SDK provider for both extension and remote connections.
- `prepareExecuteAndWait` uses the SDK helper for extension wallets, but keeps a custom remote wait path so the sandbox can wait up to 5 minutes and correlate `txChanged` events by `commandId`.
- `signMessage` is still a special case for remote gateways because the SDK does not proxy that method yet; this sandbox calls the connected gateway directly using the SDK-managed session token.

## Troubleshooting

- `Registry info lookup failed: HTTP 401` / `The supplied authentication is invalid`
  - Verify `Registry / Scan API Key` in the UI matches a configured key for your upstream scan-proxy.
  - If upstream expects bearer auth too, set `SCAN_PROXY_UPSTREAM_AUTH`.
  - Restart `npm run dev` after env changes.
- `discoverTransferFactory -> Registry fetch failed at network layer`
  - Ensure `/api/registry-proxy` is available (run `npm run dev`).
  - Ensure `SCAN_PROXY_BACKEND_URL` is reachable (default `https://sp-lat-dn.cddev.site`).
  - Verify your API key is present and valid.
- `TEMPLATES_OR_INTERFACES_NOT_FOUND` with `pkg:Module:Template`
  - `commands JSON` still has the placeholder command.
  - Click `Prefill prepareExecute transfer` and submit the generated `ExerciseCommand` for `TransferFactory_Transfer`.
