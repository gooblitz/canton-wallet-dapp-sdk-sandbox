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

1. A reachable wallet endpoint (`remote` mode) or wallet browser extension (`extension` mode).
2. A scan-proxy backend endpoint for registry discovery (default local target: `http://127.0.0.1:8086`).
3. API key accepted by that scan-proxy backend.

Optional dApp env for registry discovery:

```bash
VITE_REGISTRY_DOMAIN='https://sp-lat-dn.cddev.site' # default domain used by "Registry Domain (Default)"
VITE_REGISTRY_URLS_JSON='{"devnet":"https://registry.devnet.example.com","mainnet":"https://registry.mainnet.example.com"}'
VITE_TOKEN_REGISTRY_URL='/api/registry-proxy' # recommended default
VITE_SCAN_URL='/api/registry-proxy'           # recommended default
SCAN_PROXY_BACKEND_URL='http://127.0.0.1:8086' # Vite dev proxy target
```

## Run

```bash
cd canton-wallet-dapp-sdk-sandbox
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
   - Keep `Registry URL` as `/api/registry-proxy` unless you have a custom endpoint.
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
  - `VITE_TOKEN_REGISTRY_URL=/api/registry-proxy`
  - `VITE_SCAN_URL=/api/registry-proxy`
  - `SCAN_PROXY_BACKEND_URL=http://127.0.0.1:8086`
- ACS/`/v2/state/active-contracts` factory discovery has been removed from this dApp.
- Registry discovery defaults to same-origin `/api/registry-proxy`, which Vite rewrites to your scan-proxy backend `/v0/scan-proxy/*`.
- Requests include `X-API-Key` from the UI; upstream bearer/JWT auth is handled by your scan-proxy backend configuration.
- The app auto-normalizes `TransferFactory` template IDs before submit (adds `#` for package-name IDs).
- In `remote` mode, this sandbox uses direct JSON-RPC for `getPrimaryAccount`, `signMessage`, and `prepareExecuteAndWait` so testing is not blocked by SDK remote-provider method coverage.

## Troubleshooting

- `Registry info lookup failed: HTTP 401` / `The supplied authentication is invalid`
  - Verify `Registry / Scan API Key` in the UI matches a configured key in your scan-proxy backend.
  - Restart `npm run dev` after env changes.
- `discoverTransferFactory -> Registry fetch failed at network layer`
  - Ensure scan-proxy backend is running and reachable at `SCAN_PROXY_BACKEND_URL` (default `http://127.0.0.1:8086`).
  - If using a non-default target, set `SCAN_PROXY_BACKEND_URL` and restart `npm run dev`.
- `connect()` fails in remote mode due to CORS / network errors
  - This is mainly for integrators/self-hosters. Ensure wallet backend CORS allows this dApp origin.
  - Example backend env:
    ```bash
    CORS_ALLOWED_ORIGINS="http://wallet.localhost:5183,http://127.0.0.1:4174"
    FRONTEND_URL="http://wallet.localhost:5183"
    ```
  - If you use a different host/port for this app, add it to `CORS_ALLOWED_ORIGINS`.
- `TEMPLATES_OR_INTERFACES_NOT_FOUND` with `pkg:Module:Template`
  - `commands JSON` still has the placeholder command.
  - Click `Prefill prepareExecute transfer` and submit the generated `ExerciseCommand` for `TransferFactory_Transfer`.
