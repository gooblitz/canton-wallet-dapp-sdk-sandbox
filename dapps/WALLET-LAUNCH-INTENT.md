# Wallet Launch Intent

The sandbox accepts a wallet-provided launch intent in the dApp URL. This lets a wallet open a third-party dApp while controlling the initial connection mode and preferred remote gateway URL.

Use a URL fragment rather than a query parameter:

```text
https://third-party-dapp.example/#walletIntent=<base64url-json>
```

The fragment is handled in browser JavaScript and is not sent to the dApp server as part of the HTTP request.

The sandbox also accepts `?walletIntent=<base64url-json>` only on localhost for local experiments. Wallet integrations should use the fragment form so the intent is not sent to dApp infrastructure.

In this sandbox, the `Launch Links` section is an editable generator. It prepopulates from the current network, connection mode, preferred gateway URL, request ID, audience origin, issue time, expiry time, and reconciliation fields before copying or opening the link.

Generator behavior:

- `Use Current Settings` resets the generator to the active Settings values.
- Editing any generator field stops automatic resync from Settings until `Use Current Settings` is clicked.
- Editing `Request ID` updates `reconciliation.commandId` while it still matches the previous generated request ID.
- Changing the generator `Network` refreshes the default gateway label and gateway URL for that network.
- Changing `Target dApp URL` refreshes `aud` while it still matches the previous target origin.
- The generated URL preserves any query string in `Target dApp URL` and replaces the fragment with `#walletIntent=...`.
- `Copy URL`, `Open`, and `Copy Payload` reject invalid request IDs, audience origins, timestamps, gateway URLs, direct-remote payloads, or reconciliation values.

## Payload

```json
{
  "version": 1,
  "requestId": "walletreq_opaque_random_id",
  "aud": "https://third-party-dapp.example",
  "issuedAt": "2026-04-26T12:00:00Z",
  "expiresAt": "2026-04-26T12:10:00Z",
  "connection": {
    "mode": "picker",
    "networkId": "testnet",
    "remote": {
      "name": "Lattice TestNet",
      "rpcUrl": "https://lat-tn.cddev.site/api/v1/dapp"
    }
  },
  "reconciliation": {
    "commandId": "walletreq_opaque_random_id"
  }
}
```

Fields:

- `version`: currently `1`.
- `requestId`: required opaque wallet handoff ID. Use one unique value per launched request.
- `aud`: required dApp origin that should receive the intent. The dApp rejects the intent when this does not match `window.location.origin`. It must use HTTPS, except for localhost development origins.
- `issuedAt`: required ISO timestamp for when the wallet generated the intent.
- `expiresAt`: required ISO timestamp. The dApp rejects expired intents.
- `connection.mode`: `picker` or `direct-remote`.
- `connection.networkId`: optional `devnet`, `testnet`, or `mainnet`.
- `connection.remote.name`: optional label shown for the configured gateway.
- `connection.remote.rpcUrl`: optional for `picker`, required for `direct-remote`.
- `reconciliation.commandId`: optional opaque ID copied into `prepareExecute.commandId` when the generated request has no command ID yet.
- `reconciliation.transferMeta`: optional public-safe string copied into generated Token Standard transfer metadata at `transfer.meta.values["cddev.site/reconciliation-id"]`.

The dApp treats the launch intent as a hint until the user clicks `connect()`. It pre-fills the UI but does not auto-connect on page load. When an intent is present, the decoded payload is written to the app log as `wallet launch intent from hash -> decoded payload` or `wallet launch intent from query -> decoded payload`. After connection, the dApp verifies the active wallet network matches `connection.networkId` when one was supplied and disconnects the rejected session on mismatch.

## Connection Modes

`picker` registers the supplied remote gateway as an SDK `RemoteAdapter` while still allowing the browser extension adapter. This is the recommended default for third-party dApps because the user can see what they are connecting to and can choose another available wallet.

`direct-remote` bypasses the SDK picker and connects directly to the supplied remote gateway. Use this when the launching wallet wants a tightly controlled handoff to a specific gateway.

## Reconciliation

Use `requestId` as the stable wallet-to-dApp handoff ID, even when the user only connects or abandons the flow before a transaction. Use `reconciliation.commandId` as the transaction-submission correlation value. The dApp sends it back to the wallet in the off-ledger `prepareExecute` request body:

```json
{
  "commandId": "walletreq_opaque_random_id",
  "commands": [
    {
      "ExerciseCommand": {
        "templateId": "...",
        "contractId": "...",
        "choice": "...",
        "choiceArgument": {}
      }
    }
  ]
}
```

The wallet/gateway can then record:

```text
wallet request id -> dApp origin -> connected party -> commandId -> txChanged/updateId
```

`commandId` is not intended to become transaction-visible contract metadata, but it is visible to the dApp, wallet/gateway, participant submission path, and logs/events.

The generator prepopulates `reconciliation.commandId` from `requestId`, but the two values can intentionally differ. If the command JSON already has a `commandId`, the explicit command JSON value wins. Do not reuse one `commandId` for unrelated transactions; generate one wallet request ID per intended transaction, or have the dApp derive unique command IDs for multi-transaction flows.

Use `reconciliation.transferMeta` only when the reference should also be carried inside generated Token Standard transfer metadata. The sandbox writes the string to:

```json
{
  "transfer": {
    "meta": {
      "values": {
        "cddev.site/reconciliation-id": "public_safe_reference"
      }
    }
  }
}
```

Transfer metadata can be visible to transaction stakeholders and contract consumers. Leave `transferMeta` blank or omit it unless the value is intentionally public-safe.

`requestId` and both reconciliation fields must be opaque strings of at most 128 characters using only letters, numbers, underscores, periods, colons, or hyphens. Reconciliation fields are ignored when blank or omitted.

## Encoding

Example launcher code:

```ts
const requestId = 'walletreq_opaque_random_id';
const intent = {
  version: 1,
  requestId,
  aud: 'https://third-party-dapp.example',
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  connection: {
    mode: 'picker',
    networkId: 'testnet',
    remote: {
      name: 'Lattice TestNet',
      rpcUrl: 'https://lat-tn.cddev.site/api/v1/dapp',
    },
  },
  reconciliation: {
    commandId: requestId,
  },
};

function base64UrlEncodeJson(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const encoded = base64UrlEncodeJson(intent);
window.open(`https://third-party-dapp.example/#walletIntent=${encoded}`, '_blank', 'noopener');
```

The sandbox decoder also accepts URL-encoded raw JSON for manual testing, but wallet integrations should send base64url JSON.

For local development, `http://localhost`, `http://127.0.0.1`, and `http://*.localhost` remote gateway URLs are accepted. Non-local remote gateway URLs must use `https`.

Do not put API keys, access tokens, session IDs, customer identifiers, emails, invoice numbers, or other sensitive values in the launch intent. Use opaque random IDs or backend-resolvable hashes.
