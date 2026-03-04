# Transfer Context Discovery (Portable)

## Goal

Use a wallet-agnostic transfer prefill flow without relying on party ACS visibility of `TransferFactory`.

## What Was Removed

- Legacy TransferFactory discovery via:
  - `GET /v2/state/ledger-end`
  - `POST /v2/state/active-contracts`
- Multi-factory ACS selector logic and related cache/state.

## Current Flow

1. Collect transfer intent in dApp UI:
   - sender (from connected account)
   - receiver
   - amount
   - instrument id/admin
   - expected admin
2. Resolve registry URL.
3. Query Token Standard off-ledger API directly:
   - `POST {registryUrl}/registry/transfer-instruction/v1/transfer-factory`
   - send `X-API-Key` from dApp settings
   - endpoint must allow dApp origin via CORS
4. Use response to prefill:
   - `factoryId` -> `ExerciseCommand.contractId`
   - `choiceContext.choiceContextData` -> `extraArgs.context`
   - `choiceContext.disclosedContracts` -> `prepareExecute.disclosedContracts`
5. Build `prepareExecute` payload and submit via wallet dApp API.

## Registry URL Resolution Order

1. Manual UI value (`Registry URL` field).
2. Network config:
   - local storage map `networkId -> registryUrl`
   - env `VITE_REGISTRY_URLS_JSON`
   - env `VITE_TOKEN_REGISTRY_URL` (devnet fallback)
3. CNS fallback (if `Scan URL` + instrument admin are available):
   - `GET {scanUrl}/v0/ans-entries/by-party/{adminParty}`
   - parse description metadata key:
     - `splice.lfdecentralizedtrust.org/registryUrls`

## Caching

- Resolved transfer context is cached for a short TTL keyed by:
  - `networkId`
  - `partyId`
  - `registryUrl`
  - transfer args (sender/receiver/amount/instrument)
- On stale contract errors, dApp force-refreshes context once and retries.

## Conformance Split

- Wallet interaction remains CIP-0103 dApp API.
- Transfer factory/context discovery uses Token Standard off-ledger registry API.
- No wallet-specific proxy/auth protocol is required for discovery.
