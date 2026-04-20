# Transfer Context Discovery (Portable)

## Goal

Use a wallet-agnostic transfer prefill flow based on Token Standard registry APIs.

This is intentionally separate from wallet connection UX. The sandbox now connects wallets through the
`@canton-network/dapp-sdk@^1.0.0` picker flow, then uses the connected provider for account and submit calls.

## Current Flow

1. Collect transfer intent in dApp UI:
   - sender (from connected account)
   - receiver
   - amount
   - instrument id/admin
   - expected admin
2. Resolve registry URL.
3. Query Token Standard off-ledger API via configured registry base URL:
   - `POST {registryUrl}/registry/transfer-instruction/v1/transfer-factory`
   - send `X-API-Key` from dApp settings
   - relative scan-proxy endpoints use `/api/registry-proxy...` (same-origin Vite proxy)
   - relative utilities token-standard endpoints use `/api/token-standard/<network>/...`
   - absolute registry URLs are also supported
4. Use response to prefill:
   - `factoryId` -> `ExerciseCommand.contractId`
   - `choiceContext.choiceContextData` -> `extraArgs.context`
   - `choiceContext.disclosedContracts` -> `prepareExecute.disclosedContracts`
5. Build `prepareExecute` payload and submit via wallet dApp API.

## Registry URL Resolution Order

1. Manual UI value (`Registry URL` field).
   - may be a relative same-origin proxy path or an absolute registry URL
2. Network config:
   - local storage map `networkId -> registryUrl`
   - env `VITE_REGISTRY_URLS_JSON`
   - env `VITE_TOKEN_REGISTRY_URL` (DevNet fallback)
   - env `VITE_TESTNET_REGISTRY_URL` (TestNet CC / scan-proxy fallback)
   - configured values may be relative proxy paths or absolute URLs
3. Asset config:
   - selected asset preset registry URL
   - env `VITE_TOKEN_REGISTRY_URLS_JSON`, keyed by values such as `testnet:USDCx`
   - env `VITE_TESTNET_USDCX_REGISTRY_URL`
   - defaults to `/api/token-standard/testnet/registrars/<USDCx-admin>` for TestNet USDCx
4. CNS fallback (if `Scan URL` + instrument admin are available):
   - proxy-style base path: `GET {scanUrl}/ans-entries/by-party/{adminParty}`
   - direct scan base path: `GET {scanUrl}/v0/ans-entries/by-party/{adminParty}`
   - parse description metadata key:
     - `splice.lfdecentralizedtrust.org/registryUrls`
   - discovered registry URLs may also be absolute URLs

## Utilities Instrument Catalog

- TestNet catalog endpoint:
  - `GET https://api.utilities.digitalasset-staging.com/api/utilities/v0/contract/instrument-configuration/all`
- The catalog returns global utilities instrument configuration data such as registrar, provider, default identifier, additional identifiers, and issuer/holder requirements.
- Use it for discovery, verification, and metadata checks.
- Do not use it as the transfer-factory registry base. Transfer context still comes from a per-asset registry URL such as `/api/registry-proxy/testnet` or `/api/token-standard/testnet/registrars/<admin>`.

## Caching

- Resolved transfer context is cached for a short TTL keyed by:
  - `networkId`
  - `partyId`
  - `registryUrl`
  - transfer args (sender/receiver/amount/instrument)
- On stale contract errors, dApp force-refreshes context once and retries.

## Conformance Split

- Wallet connection/session flow uses the SDK picker (`connect()`) and then exposes the connected CIP-0103-style provider.
- Wallet interaction after connect remains CIP-0103 dApp API.
- Transfer factory/context discovery uses Token Standard off-ledger registry API.
- dApp-side discovery auth is API-key based via `X-API-Key`.
- Relative scan-proxy discovery endpoints go through same-origin `/api/registry-proxy...` (Vite proxy to scan-proxy upstream).
- Relative utilities token-standard discovery endpoints go through same-origin `/api/token-standard/<network>/...`.
- Absolute Registry / Scan URLs are fetched directly by the dApp.
