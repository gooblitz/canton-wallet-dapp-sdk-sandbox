# Local dApp SDK Sandbox

Small local dApp for testing Canton Wallet CIP-0103 integration with `@canton-network/dapp-sdk`.

## What this tests

- SDK wallet picker and direct remote flows (`@canton-network/dapp-sdk@^1.1.0`)
- DevNet, TestNet, and MainNet transfer presets for supported assets
- `connect`, `disconnect`, `status`, `listAccounts`
- wallet launch intent handoff for picker or direct remote connection
- `getPrimaryAccount` via provider request
- `signMessage` via provider request for extension, or direct remote JSON-RPC bridge for remote gateways when remote approval details need to be surfaced in the sandbox
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
VITE_WALLET_RPC_URLS_JSON='{"devnet":"https://lat-dn.cddev.site/api/v1/dapp","testnet":"https://lat-tn.cddev.site/api/v1/dapp","mainnet":"https://lat-mn.cddev.site/api/v1/dapp"}'
VITE_WALLET_DOMAIN='https://lat-dn.cddev.site'
VITE_TESTNET_WALLET_RPC_URL='https://lat-tn.cddev.site/api/v1/dapp'
VITE_MAINNET_WALLET_RPC_URL='https://lat-mn.cddev.site/api/v1/dapp'
VITE_REGISTRY_DOMAIN='https://sp-lat-dn.cddev.site' # default domain used by "Registry Domain (Default)"
VITE_TESTNET_REGISTRY_DOMAIN='https://sp-lat-tn.cddev.site'
VITE_MAINNET_REGISTRY_DOMAIN='https://sp-lat-mn.cddev.site'
VITE_TESTNET_REGISTRY_URL='/api/registry-proxy/testnet'
VITE_MAINNET_REGISTRY_URL='/api/registry-proxy/mainnet'
VITE_MAINNET_DSO_ADMIN='' # optional override for the built-in MainNet Amulet/CC admin
VITE_REGISTRY_URLS_JSON='{"devnet":"/api/registry-proxy","testnet":"/api/registry-proxy/testnet","mainnet":"/api/registry-proxy/mainnet"}'
VITE_TOKEN_REGISTRY_URLS_JSON='{"testnet:USDCx":"/api/token-standard/testnet/registrars/decentralized-usdc-interchain-rep%3A%3A122049e2af8a725bd19759320fc83c638e7718973eac189d8f201309c512d1ffec61","mainnet:USDCx":"/api/token-standard/mainnet/registrars/decentralized-usdc-interchain-rep%3A%3A12208115f1e168dd7e792320be9c4ca720c751a02a3053c7606e1c1cd3dad9bf60ef"}'
VITE_TOKEN_REGISTRY_URL='/api/registry-proxy' # recommended default
VITE_SCAN_URL='/api/registry-proxy'           # recommended default
VITE_HOLDINGS_DIAGNOSTICS='false'
SCAN_PROXY_BACKEND_URL='https://sp-lat-dn.cddev.site' # DevNet scan-proxy upstream target
TESTNET_SCAN_PROXY_BACKEND_URL='https://sp-lat-tn.cddev.site' # TestNet scan-proxy upstream target
MAINNET_SCAN_PROXY_BACKEND_URL='https://sp-lat-mn.cddev.site' # MainNet scan-proxy upstream target
UTILITIES_TOKEN_STANDARD_TESTNET_URL='https://api.utilities.digitalasset-staging.com/api/token-standard/v0'
UTILITIES_TOKEN_STANDARD_MAINNET_URL='https://api.utilities.digitalasset.com/api/token-standard/v0'
UTILITIES_INSTRUMENT_CONFIG_TESTNET_URL='https://api.utilities.digitalasset-staging.com/api/utilities/v0/contract/instrument-configuration/all'
UTILITIES_INSTRUMENT_CONFIG_MAINNET_URL='https://api.utilities.digitalasset.com/api/utilities/v0/contract/instrument-configuration/all'
# Optional upstream auth header:
# SCAN_PROXY_UPSTREAM_AUTH='Bearer <token>'
```

For a local wallet gateway, use the official dApp JSON-RPC endpoint path:

```bash
VITE_WALLET_DOMAIN='http://wallet-devnet.localhost:5183'
VITE_WALLET_RPC_URL='http://wallet-devnet.localhost:5183/api/v1/dapp'
```

## Run

```bash
cd canton-wallet-dapp-sdk-sandbox
npm install
npm run dev
```

Open: `http://127.0.0.1:4174`

## Usage (remote provider)

1. Choose the network preset.
2. Choose `Connection Mode`.
3. Ensure `Preferred Wallet Gateway URL` is your wallet backend dApp endpoint (default DevNet: `https://lat-dn.cddev.site/api/v1/dapp`).
4. Click `connect()`.
5. In picker mode, choose the configured gateway entry (host shown in the label) or enter a custom gateway URL.
6. Use `status()` / `listAccounts()` to confirm the session.
7. To prefill a transfer command for `prepareExecute`:
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
8. Use the other actions (`status`, `listAccounts`, `signMessage`, etc.).

## Usage (extension provider)

1. Load wallet browser extension.
2. Keep `Connection Mode` on `Picker`.
3. Click `connect()`.
4. Choose `Browser Extension` in the picker.
5. Use the same action buttons.

## Notes

- `prepareExecute*` needs valid command payloads for the selected network's packages/contracts.
- The default command JSON is only a template and will usually fail until replaced.
- The `Preferred Wallet Gateway URL` field is a per-network UI override. Env vars seed defaults; editing the field wins until it is cleared or changed again.
- When deriving a gateway URL from `Wallet Domain`, the path comes from the configured network RPC URL when one is present. The official dApp JSON-RPC endpoint path is `/api/v1/dapp`.
- Transfer context lookup is cached for a short TTL per `(networkId, partyId, registryUrl, transfer args, input holdings)`.
- The transfer helper filters out currently locked token-standard holdings, allows expired locks, and selects an exact or sufficient unlocked holding set for the requested amount.
- Default fallbacks (when env vars are unset):
  - `VITE_WALLET_RPC_URL=https://lat-dn.cddev.site/api/v1/dapp`
  - `VITE_TOKEN_REGISTRY_URL=/api/registry-proxy`
  - `VITE_SCAN_URL=/api/registry-proxy`
  - `SCAN_PROXY_BACKEND_URL=https://sp-lat-dn.cddev.site`
- TestNet and MainNet have built-in transfer presets for CC and USDCx. The default TestNet wallet gateway is `https://lat-tn.cddev.site/api/v1/dapp`; the default MainNet wallet gateway is `https://lat-mn.cddev.site/api/v1/dapp`.
- The default TestNet registry / scan-proxy target is `https://sp-lat-tn.cddev.site`.
- The default MainNet registry / scan-proxy target is `https://sp-lat-mn.cddev.site`.
- USDCx uses the utilities token-standard registrar route under `/api/token-standard/<network>/registrars/<USDCx-admin>`.
- The utilities instrument configuration catalogs are `https://api.utilities.digitalasset-staging.com/api/utilities/v0/contract/instrument-configuration/all` for TestNet and `https://api.utilities.digitalasset.com/api/utilities/v0/contract/instrument-configuration/all` for MainNet; they are useful for asset discovery/metadata checks, but they are not the per-asset transfer-factory registry endpoint.
- MainNet CC currently defaults to admin `DSO::1220b1431ef217342db44d516bb9befde802be7d8899637d290895fa58880f19accc`.
- MainNet USDCx currently defaults to registrar `decentralized-usdc-interchain-rep::12208115f1e168dd7e792320be9c4ca720c751a02a3053c7606e1c1cd3dad9bf60ef`.
- MainNet CC uses `/api/registry-proxy/mainnet`. Set `VITE_MAINNET_DSO_ADMIN` only when overriding the built-in Amulet/CC admin. Do not infer Amulet from unrelated MainNet catalog entries that happen to use ticker `CC`; the public catalog currently confirms USDCx, but not a `DSO::...` Amulet registrar.
- The normal connect flow initializes the SDK picker with `init()` before `connect()`, matching the SDK 1.1.0 adapter-registration API. The configured gateway URL in Settings is only used to seed that picker; the active remote session may come from a different picker entry.
- Wallets can launch this sandbox, or a third-party dApp using the same pattern, with `#walletIntent=<base64url-json>` to prefill request ID, audience origin, expiry, network, connection mode, gateway label, gateway URL, and optional reconciliation IDs. See [wallet launch intent notes](dapps/WALLET-LAUNCH-INTENT.md).
- The `Launch Links` section is an editable v1 `walletIntent` generator. It prepopulates from the current network, connection mode, and preferred gateway URL, then lets you override the target dApp URL, request/audience/timestamp fields, gateway label/URL, and reconciliation fields before copying or opening the link. `Use Current Settings` resets the generator, while manual edits are preserved until reset.
- Direct remote mode bypasses the SDK picker and connects to the configured gateway URL. It is intended for wallet-controlled handoff flows; picker mode remains the default because it supports extension discovery and user choice. Direct remote gateways must use HTTPS, except for localhost development URLs.
- When a wallet launch intent includes `connection.networkId`, the sandbox verifies the connected wallet reports that network before continuing and disconnects rejected sessions on mismatch.
- Wallet launch intent `reconciliation.commandId` is copied into `prepareExecute.commandId` when a request does not already have one. `reconciliation.transferMeta` is optional and is written into generated transfer metadata at `cddev.site/reconciliation-id` only when non-blank; treat it as transaction-visible and public-safe. The decoded launch intent is also written to the app log for debugging.
- SDK 1.1.0 adds `WalletConnectAdapter`. This sandbox installs the optional WalletConnect peer packages because Vite dev optimization of SDK 1.1.0 imports that code path, but it does not register the adapter yet. Enabling WalletConnect should be a separate change with a configured WalletConnect project ID and wallet-side approval testing.
- The UI now separates wallet/gateway identity from account identity: the picker entry identifies the wallet source, while the page shows the resolved connected party/account after `connect()`.
- Relative Registry / Scan endpoints should use same-origin `/api/registry-proxy...` for scan-proxy routes or `/api/token-standard...` for utilities token-standard routes; absolute Registry / Scan URLs are also supported.
- Scan-proxy requests include `X-API-Key` from the UI; utilities token-standard proxy requests do not require that key.
- Set `VITE_HOLDINGS_DIAGNOSTICS=true` to include verbose holdings lookup diagnostics in the app log.
- The app auto-normalizes `TransferFactory` template IDs before submit (adds `#` for package-name IDs).
- `getPrimaryAccount` now goes through the injected SDK provider for both extension and remote connections.
- `prepareExecuteAndWait` uses the SDK helper for extension wallets, but keeps a custom remote wait path so the sandbox can wait up to 5 minutes and correlate `txChanged` events by `commandId`.
- `signMessage` is still a special case for remote gateways in this sandbox: although the SDK exposes `signMessage()`, the remote provider path does not surface pending-approval `userUrl` data, so the sandbox calls the connected gateway directly using the SDK-managed session token.
- macOS Safari blocks async popups more strictly than Chrome. When macOS Safari and a remote gateway are configured, picker mode is upgraded to the direct remote path and primes the SDK wallet popup from the initial `connect()` click so the remote wallet approval can reuse that window. See [Safari remote popup notes](dapps/SAFARI-REMOTE-POPUP.md).

## Troubleshooting

- `connect -> Failed to open popup window`
  - In macOS Safari, allow popups for the sandbox origin, then retry from a fresh `connect()` click.
- Page renders without styling in Chrome/Safari after dependency changes
  - Restart the dev server with `npm run dev -- --force`, then hard-reload the browser tab. Stale or incomplete Vite optimized dependencies can throw before `/src/styles.css` is applied.
- `Registry info lookup failed: HTTP 401` / `The supplied authentication is invalid`
  - Verify `Registry / Scan API Key` in the UI matches a configured key for your upstream scan-proxy.
  - If upstream expects bearer auth too, set `SCAN_PROXY_UPSTREAM_AUTH`.
  - Restart `npm run dev` after env changes.
- `discoverTransferFactory -> Registry fetch failed at network layer`
  - Ensure `/api/registry-proxy` and `/api/token-standard/<network>` are available (run `npm run dev`).
  - Ensure `SCAN_PROXY_BACKEND_URL` is reachable for DevNet (default `https://sp-lat-dn.cddev.site`).
  - For TestNet CC, ensure `TESTNET_SCAN_PROXY_BACKEND_URL` is reachable (default `https://sp-lat-tn.cddev.site`).
  - For MainNet CC, ensure `MAINNET_SCAN_PROXY_BACKEND_URL` is reachable (default `https://sp-lat-mn.cddev.site`).
  - Verify your API key is present and valid.
- `TEMPLATES_OR_INTERFACES_NOT_FOUND` with `pkg:Module:Template`
  - `commands JSON` still has the placeholder command.
  - Click `Prefill prepareExecute transfer` and submit the generated `ExerciseCommand` for `TransferFactory_Transfer`.
