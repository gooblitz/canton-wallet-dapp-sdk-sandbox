# Safari Remote Wallet Popup Notes

Last reviewed: 2026-04-24 against `@canton-network/dapp-sdk@1.1.0`

## Symptom

On Safari for macOS, remote wallet connect can fail with:

```text
connect -> Failed to open popup window
```

A naive workaround that pre-opens the SDK popup with `about:blank` before using the SDK picker can also fail with:

```text
connect -> User closed the wallet picker
```

That happens before the user intentionally closes anything.

## Local Workaround

As of 2026-04-24, macOS Safari remote connects bypass the SDK picker and connect directly to the configured `Preferred Wallet Gateway URL`.

The click handler still primes the SDK global wallet popup synchronously from the initial `connect()` click. The SDK remote provider can then reuse that window when it receives the async `userUrl` from the wallet gateway.

This keeps Chrome, iOS/iPadOS Safari, and other non-macOS-Safari browsers on the normal SDK picker path. We have not seen evidence that the exact SDK failure reproduced on iOS Safari, and iOS Safari was reported working before this workaround.

Tradeoff as of 2026-04-24: macOS Safari's `connect()` click targets the configured remote gateway directly. It does not offer the SDK picker selection UI for extension or alternate remote adapters on that click. Revisit this if Safari extension testing becomes a requirement here, or when upstream provides a browser-safe picker handoff.

The workaround intentionally patches the SDK singleton's internal `client` field after creating a `DappClient`. That is not a public SDK API. It is isolated in `setSDKSingletonClientForSafariRemote()` and should be removed when upstream exposes a supported direct remote connect flow or fixes the picker popup lifecycle.

## Upstream Findings

Findings as of 2026-04-24:

- No public upstream issue was found for the exact Safari errors `Failed to open popup window` or `User closed the wallet picker`.
- [Issue #197](https://github.com/hyperledger-labs/splice-wallet-kernel/issues/197) documents the broader remote dApp API design problem: `connect` returns a `userUrl`, the SDK opens a window, then waits for a later event.
- [PR #1561](https://github.com/hyperledger-labs/splice-wallet-kernel/pull/1561) added the global popup for async dApp API wallets because a new `userUrl` popup can be blocked by the browser.
- [PR #1560](https://github.com/hyperledger-labs/splice-wallet-kernel/pull/1560) was an alternate popup-closing fix and explicitly notes that secure browser contexts require direct user input for each popup or redirect. It was closed unmerged.
- [PR #1091](https://github.com/hyperledger-labs/splice-wallet-kernel/pull/1091) added earlier blockage-friendly popup handling, tested against Chrome and Firefox.
- `@canton-network/dapp-sdk@1.1.0` was released on 2026-04-24 with `init()` discovery improvements, `WalletConnectAdapter`, and an empty-adapter-list fix. The remote HTTP connect path still opens `response.userUrl` after `await provider.request({ method: "connect" })`, so it does not appear to fix this Safari-specific flow.

## Revisit Checklist

Recheck this workaround when upgrading beyond `@canton-network/dapp-sdk@1.1.0` or when upstream changes the remote connect flow.

Remove or revise the workaround if upstream provides one of:

- A public API to reserve/open the approval popup synchronously before async remote `connect`.
- A supported direct remote connect path that does not require the SDK picker.
- A picker implementation that can safely hand off the same popup to the approval URL without interpreting navigation as user close.
- A remote dApp API shape where the wallet approval URL is surfaced synchronously or through a browser-safe user-request event.

Manual Safari retest:

- Connect to DevNet remote gateway.
- Connect to TestNet remote gateway.
- Connect to MainNet remote gateway.
- Run `open()`.
- Run remote `signMessage`.
- Run remote `prepareExecute` / approval flow.
