# Local dApp SDK Sandbox

Small local dApp for testing Canton Wallet CIP-0103 integration with `@canton-network/dapp-sdk`.

## What this tests

- SDK wallet picker flow (`@canton-network/dapp-sdk@^0.23.0`)
- DevNet and TestNet transfer presets for supported assets
- `connect`, `disconnect`, `status`, `listAccounts`
- `getPrimaryAccount` via provider request
- `signMessage` via provider request for extension, or direct remote JSON-RPC bridge for remote gateways
- Transfer command helper that resolves Token Standard transfer context and prefills `prepareExecute` JSON
- `prepareExecute`, `prepareExecuteAndWait`
- `ledgerApi` smoke call (`GET /v2/version`)
- Event subscriptions (`statusChanged`, `accountsChanged`, `txChanged`)

## Prerequisites

1. A reachable wallet endpoint (`remote` mode) or wallet browser extension (`extension` mode).
2. Reachability to the selected network's scan-proxy upstream (default DevNet: `https://sp-lat-dn.cddev.site`).
3. API key accepted by that scan-proxy endpoint.
4. No separate proxy/backend process is required for this sandbox.

Optional dApp env for registry discovery:

```bash
VITE_NETWORK='devnet'
VITE_WALLET_RPC_URLS_JSON='{"devnet":"https://lat-dn.cddev.site/api/v1/dapp","testnet":"https://lat-tn.cddev.site/api/v1/dapp"}'
VITE_TESTNET_WALLET_RPC_URL='https://lat-tn.cddev.site/api/v1/dapp'
VITE_REGISTRY_DOMAIN='https://sp-lat-dn.cddev.site' # default domain used by "Registry Domain (Default)"
VITE_TESTNET_REGISTRY_DOMAIN='https://sp-lat-tn.cddev.site'
VITE_TESTNET_REGISTRY_URL='/api/registry-proxy/testnet'
VITE_REGISTRY_URLS_JSON='{"devnet":"/api/registry-proxy","testnet":"/api/registry-proxy/testnet"}'
VITE_TOKEN_REGISTRY_URLS_JSON='{"testnet:USDCx":"/api/token-standard/testnet/registrars/decentralized-usdc-interchain-rep%3A%3A122049e2af8a725bd19759320fc83c638e7718973eac189d8f201309c512d1ffec61"}'
VITE_TOKEN_REGISTRY_URL='/api/registry-proxy' # recommended default
VITE_SCAN_URL='/api/registry-proxy'           # recommended default
VITE_HOLDINGS_DIAGNOSTICS='false'
SCAN_PROXY_BACKEND_URL='https://sp-lat-dn.cddev.site' # DevNet scan-proxy upstream target
TESTNET_SCAN_PROXY_BACKEND_URL='https://sp-lat-tn.cddev.site' # TestNet scan-proxy upstream target
UTILITIES_TOKEN_STANDARD_TESTNET_URL='https://api.utilities.digitalasset-staging.com/api/token-standard/v0'
UTILITIES_INSTRUMENT_CONFIG_TESTNET_URL='https://api.utilities.digitalasset-staging.com/api/utilities/v0/contract/instrument-configuration/all'
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

1. Choose the network preset and ensure `Preferred Wallet Gateway URL` is your wallet backend dApp endpoint (default DevNet: `https://lat-dn.cddev.site/api/v1/dapp`).
2. Click `connect() via picker`.
3. In the picker, choose `Configured Gateway (...)` or enter a custom gateway URL.
4. Use `status()` / `listAccounts()` to confirm the session.
5. To prefill a transfer command for `prepareExecute`:
   - Choose `CC (Amulet)` or `USDCx` in `Asset`.
   - Fill recipient and amount.
   - Use either:
     - a relative same-origin proxy path such as `/api/registry-proxy`, or
     - an absolute Registry URL discovered from network config or CNS metadata.
   - The asset preset fills `Instrument ID`, `Instrument Admin`, `Expected Admin`, and the registry URL. You can still override them under `Advanced (optional)`.
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

- `prepareExecute*` needs valid command payloads for the selected network's packages/contracts.
- The default command JSON is only a template and will usually fail until replaced.
- Transfer context lookup is cached for a short TTL per `(networkId, partyId, registryUrl, transfer args)`.
- Default fallbacks (when env vars are unset):
  - `VITE_WALLET_RPC_URL=https://lat-dn.cddev.site/api/v1/dapp`
  - `VITE_TOKEN_REGISTRY_URL=/api/registry-proxy`
  - `VITE_SCAN_URL=/api/registry-proxy`
  - `SCAN_PROXY_BACKEND_URL=https://sp-lat-dn.cddev.site`
- TestNet has built-in transfer presets for CC and USDCx. The default TestNet wallet gateway is `https://lat-tn.cddev.site/api/v1/dapp`.
- The default TestNet registry / scan-proxy target is `https://sp-lat-tn.cddev.site`.
- USDCx uses the utilities token-standard registrar route under `/api/token-standard/testnet/registrars/<USDCx-admin>`.
- The utilities TestNet instrument configuration catalog is `https://api.utilities.digitalasset-staging.com/api/utilities/v0/contract/instrument-configuration/all`; it is useful for asset discovery/metadata checks, but it is not the per-asset transfer-factory registry endpoint.
- The connect flow now uses the SDK picker. The configured gateway URL in Settings is only used to seed that picker; the active remote session may come from a different picker entry.
- Relative Registry / Scan endpoints should use same-origin `/api/registry-proxy...` for scan-proxy routes or `/api/token-standard...` for utilities token-standard routes; absolute Registry / Scan URLs are also supported.
- Scan-proxy requests include `X-API-Key` from the UI; utilities token-standard proxy requests do not require that key.
- Set `VITE_HOLDINGS_DIAGNOSTICS=true` to include verbose holdings lookup diagnostics in the app log.
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
  - Ensure `/api/registry-proxy` and `/api/token-standard/testnet` are available (run `npm run dev`).
  - Ensure `SCAN_PROXY_BACKEND_URL` is reachable for DevNet (default `https://sp-lat-dn.cddev.site`).
  - For TestNet CC, ensure `TESTNET_SCAN_PROXY_BACKEND_URL` is reachable (default `https://sp-lat-tn.cddev.site`).
  - Verify your API key is present and valid.
- `TEMPLATES_OR_INTERFACES_NOT_FOUND` with `pkg:Module:Template`
  - `commands JSON` still has the placeholder command.
  - Click `Prefill prepareExecute transfer` and submit the generated `ExerciseCommand` for `TransferFactory_Transfer`.
