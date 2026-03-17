# Transfer Context Discovery (Portable)

## Goal

Use a wallet-agnostic transfer prefill flow based on Token Standard registry APIs.

This is intentionally separate from wallet connection UX. The sandbox now connects wallets through the
`@canton-network/dapp-sdk@^0.23.x` picker flow, then uses the connected provider for account and submit calls.

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
   - relative endpoints must use `/api/registry-proxy` (same-origin Vite proxy)
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
   - env `VITE_TOKEN_REGISTRY_URL` (devnet fallback)
   - configured values may be relative proxy paths or absolute URLs
3. CNS fallback (if `Scan URL` + instrument admin are available):
   - proxy-style base path: `GET {scanUrl}/ans-entries/by-party/{adminParty}`
   - direct scan base path: `GET {scanUrl}/v0/ans-entries/by-party/{adminParty}`
   - parse description metadata key:
     - `splice.lfdecentralizedtrust.org/registryUrls`
   - discovered registry URLs may also be absolute URLs

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
- Relative discovery endpoints go through same-origin `/api/registry-proxy` (Vite proxy to scan-proxy upstream).
- Absolute Registry / Scan URLs are fetched directly by the dApp.
