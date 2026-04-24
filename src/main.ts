import {
  connect,
  DappClient,
  dappSDK,
  disconnect,
  ExtensionAdapter,
  init,
  ledgerApi,
  listAccounts,
  onAccountsChanged,
  onStatusChanged,
  onTxChanged,
  open,
  prepareExecute,
  prepareExecuteAndWait,
  RemoteAdapter,
  status,
} from '@canton-network/dapp-sdk';
import { popup as walletPopup } from '@canton-network/core-wallet-ui-components';
import './styles.css';

type RequestingProvider = {
  request<T>(payload: { method: string; params?: Record<string, unknown> | unknown[] }): Promise<T>;
  on<T>(event: string, listener: (event: T) => void): RequestingProvider;
  removeListener<T>(event: string, listener: (event: T) => void): RequestingProvider;
};

type SDKConnectResult = Awaited<ReturnType<typeof connect>>;
type DappSDKWithInternalClient = {
  client: DappClient | null;
};

type SDKStatusSnapshot = Awaited<ReturnType<typeof status>>;
type SDKPrepareExecuteParams = Parameters<typeof prepareExecute>[0];
type SDKPrepareExecuteInput = SDKPrepareExecuteParams & {
  estimateTrafficCost?: Record<string, unknown>;
};

type ErrorLike = {
  message?: string;
  code?: number;
  data?: unknown;
  cause?: unknown;
  error?: number;
  details?: unknown;
  status?: string;
};

type KernelDiscoveryState = {
  walletType?: string;
  url?: string;
};

type JSONRPCErrorPayload = {
  code?: number;
  message?: string;
  data?: unknown;
};

type JSONRPCResponsePayload<T> = {
  jsonrpc?: string;
  id?: string | number | null;
  result?: T;
  error?: JSONRPCErrorPayload;
};

type TxChangedEvent = {
  commandId?: string;
  status?: string;
  [key: string]: unknown;
};

type NetworkInfo = {
  networkId?: string;
};

type RegistryDiscoverySource = 'manual' | 'network-config' | 'asset-config' | 'cns';

type RegistryResolution = {
  registryUrl: string;
  source: RegistryDiscoverySource;
};

type ResolvedTransferContext = {
  source: 'registry' | 'cache';
  networkId: string;
  partyId: string;
  registryUrl: string;
  factoryId: string;
  transferKind?: string;
  inputHoldingCids: string[];
  choiceContextData: Record<string, unknown>;
  disclosedContracts: Record<string, unknown>[];
};

type TransferContextCacheEntry = ResolvedTransferContext & {
  updatedAt: number;
};

type TransferContextCacheStore = Record<string, TransferContextCacheEntry>;

type RegistryUrlStore = Record<string, string>;

type DomainSettingsStore = {
  walletDomain?: string;
  registryDomain?: string;
  networkId?: string;
  // Legacy key kept for backward compatibility with existing localStorage.
  devnetRegistryDomain?: string;
};

type TransferAssetPreset = {
  assetId: string;
  label: string;
  symbol: string;
  instrumentId: string;
  instrumentAdmin: string;
  expectedAdmin: string;
  registryUrl: string;
};

type NetworkPreset = {
  networkId: string;
  label: string;
  walletDomain: string;
  registryDomain: string;
  scanUrl: string;
  defaultRegistryUrl: string;
  assets: TransferAssetPreset[];
};

type TransferFactoryRegistryResponse = {
  factoryId?: unknown;
  transferKind?: unknown;
  choiceContext?: unknown;
};

type TransferChoiceContext = {
  choiceContextData: Record<string, unknown>;
  disclosedContracts: Record<string, unknown>[];
};

type LedgerApiRPCResult = {
  response?: unknown;
};

type ActiveContractParts = {
  contractId: string;
  templateId: string;
  interfaceId: string;
  payload: Record<string, unknown>;
  hasHoldingInterfaceView: boolean;
};

type HoldingLookupResult = {
  contractIds: string[];
  scannedContracts: number;
  holdingCandidates: number;
  instruments: Record<string, number>;
  templates: Record<string, number>;
};

type AccountSummary = {
  partyId: string;
  primary?: boolean;
  hint?: string;
  networkId?: string;
  signingProviderId?: string;
};

type AccountConnectionSummary = {
  primaryAccount: AccountSummary;
  accountCount: number;
  accountPartyIds: string[];
};

function qs<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

const els = {
  networkPreset: qs<HTMLSelectElement>('#networkPreset'),
  walletDomain: qs<HTMLInputElement>('#walletDomain'),
  devnetRegistryDomain: qs<HTMLInputElement>('#devnetRegistryDomain'),
  registryApiKey: qs<HTMLInputElement>('#registryApiKey'),
  remoteUrl: qs<HTMLInputElement>('#remoteUrl'),
  remotePickerLabel: qs<HTMLElement>('#remotePickerLabel'),
  connectedAccountLabel: qs<HTMLElement>('#connectedAccountLabel'),
  connectedAccountMeta: qs<HTMLParagraphElement>('#connectedAccountMeta'),
  message: qs<HTMLInputElement>('#message'),
  transferAsset: qs<HTMLSelectElement>('#transferAsset'),
  transferToParty: qs<HTMLInputElement>('#transferToParty'),
  transferAmount: qs<HTMLInputElement>('#transferAmount'),
  registryUrl: qs<HTMLInputElement>('#registryUrl'),
  scanUrl: qs<HTMLInputElement>('#scanUrl'),
  transferInstrumentId: qs<HTMLInputElement>('#transferInstrumentId'),
  transferInstrumentAdmin: qs<HTMLInputElement>('#transferInstrumentAdmin'),
  transferFactoryContractId: qs<HTMLInputElement>('#transferFactoryContractId'),
  transferFactoryStatus: qs<HTMLParagraphElement>('#transferFactoryStatus'),
  transferFactoryManualOverride: qs<HTMLInputElement>('#transferFactoryManualOverride'),
  transferAdvanced: qs<HTMLDetailsElement>('#transferAdvanced'),
  transferFactoryTemplateId: qs<HTMLInputElement>('#transferFactoryTemplateId'),
  transferExpectedAdmin: qs<HTMLInputElement>('#transferExpectedAdmin'),
  transferContextJson: qs<HTMLTextAreaElement>('#transferContextJson'),
  transferDisclosedJson: qs<HTMLTextAreaElement>('#transferDisclosedJson'),
  commandsJson: qs<HTMLTextAreaElement>('#commandsJson'),
  log: qs<HTMLPreElement>('#log'),
  openWallet: qs<HTMLButtonElement>('#openWallet'),
  connect: qs<HTMLButtonElement>('#connect'),
  disconnect: qs<HTMLButtonElement>('#disconnect'),
  status: qs<HTMLButtonElement>('#status'),
  listAccounts: qs<HTMLButtonElement>('#listAccounts'),
  getPrimaryAccount: qs<HTMLButtonElement>('#getPrimaryAccount'),
  subscribeEvents: qs<HTMLButtonElement>('#subscribeEvents'),
  signMessage: qs<HTMLButtonElement>('#signMessage'),
  discoverTransferFactory: qs<HTMLButtonElement>('#discoverTransferFactory'),
  refreshTransferFactory: qs<HTMLButtonElement>('#refreshTransferFactory'),
  prefillTransferCommand: qs<HTMLButtonElement>('#prefillTransferCommand'),
  prepareExecute: qs<HTMLButtonElement>('#prepareExecute'),
  prepareExecuteAndWait: qs<HTMLButtonElement>('#prepareExecuteAndWait'),
  ledgerVersion: qs<HTMLButtonElement>('#ledgerVersion'),
  clearLog: qs<HTMLButtonElement>('#clearLog'),
};

const layoutEls = {
  workspace: qs<HTMLElement>('.workspace'),
  leftPane: qs<HTMLElement>('.left-pane'),
};

const DEFAULT_WALLET_DOMAIN = 'https://lat-dn.cddev.site';
const DEFAULT_TESTNET_WALLET_DOMAIN = 'https://lat-tn.cddev.site';
const DEFAULT_DEVNET_REGISTRY_DOMAIN = 'https://sp-lat-dn.cddev.site';
const DEFAULT_TESTNET_REGISTRY_DOMAIN = 'https://sp-lat-tn.cddev.site';
const DEFAULT_REGISTRY_PROXY_BASE_PATH = '/api/registry-proxy';
const DEFAULT_TOKEN_STANDARD_PROXY_BASE_PATH = '/api/token-standard';
const DEFAULT_NETWORK_ID = 'devnet';
const HOLDING_INTERFACE_ID = '#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding';
const TESTNET_DSO_ADMIN =
  'DSO::1220f22a8b8f2d813c25b9a684dc4dd52b532a0174d8e73a13cdf2baabfff7518337';
const TESTNET_USDCX_ADMIN =
  'decentralized-usdc-interchain-rep::122049e2af8a725bd19759320fc83c638e7718973eac189d8f201309c512d1ffec61';
const DOMAIN_SETTINGS_STORAGE_KEY = 'local_dapp_domain_settings_v1';
const NETWORK_ID_STORAGE_KEY = 'local_dapp_network_id_v1';
const REGISTRY_URLS_STORAGE_KEY = 'local_dapp_registry_urls_v1';
const REGISTRY_URLS_META_KEY = 'splice.lfdecentralizedtrust.org/registryUrls';
const TRANSFER_CONTEXT_CACHE_STORAGE_KEY = 'local_dapp_transfer_context_cache_v1';
const TRANSFER_CONTEXT_CACHE_TTL_MS = 90 * 1000;
const PLACEHOLDER_TEMPLATE_IDS = new Set(['pkg:Module:Template', '#pkg:Module:Template']);
const ENV_NETWORK_ID = import.meta.env.VITE_NETWORK?.toString().trim() || DEFAULT_NETWORK_ID;
const ENV_REGISTRY_URLS = parseEnvRegistryUrlMap(import.meta.env.VITE_REGISTRY_URLS_JSON?.toString().trim() || '');
const ENV_TOKEN_REGISTRY_URLS = parseEnvRegistryUrlMap(
  import.meta.env.VITE_TOKEN_REGISTRY_URLS_JSON?.toString().trim()
    || import.meta.env.VITE_ASSET_REGISTRY_URLS_JSON?.toString().trim()
    || '',
);
const ENV_WALLET_RPC_URLS = parseEnvRegistryUrlMap(import.meta.env.VITE_WALLET_RPC_URLS_JSON?.toString().trim() || '');
const HOLDINGS_DIAGNOSTICS_ENABLED = ['1', 'true', 'yes', 'on'].includes(
  (import.meta.env.VITE_HOLDINGS_DIAGNOSTICS?.toString().trim() || '').toLowerCase(),
);
const ENV_WALLET_DOMAIN = normalizeDomainValue(
  import.meta.env.VITE_WALLET_DOMAIN?.toString().trim() || DEFAULT_WALLET_DOMAIN,
  DEFAULT_WALLET_DOMAIN,
);
const ENV_REGISTRY_DOMAIN = normalizeDomainValue(
  import.meta.env.VITE_REGISTRY_DOMAIN?.toString().trim()
    || import.meta.env.VITE_DEVNET_REGISTRY_DOMAIN?.toString().trim()
    || DEFAULT_DEVNET_REGISTRY_DOMAIN,
  DEFAULT_DEVNET_REGISTRY_DOMAIN,
);
const savedDomainSettings = loadDomainSettingsStore();
const initialWalletDomain = normalizeDomainValue(savedDomainSettings.walletDomain || ENV_WALLET_DOMAIN, ENV_WALLET_DOMAIN);
const initialDevnetRegistryDomain = normalizeDomainValue(
  savedDomainSettings.registryDomain || savedDomainSettings.devnetRegistryDomain || ENV_REGISTRY_DOMAIN,
  ENV_REGISTRY_DOMAIN,
);
const ENV_SINGLE_REGISTRY_URL =
  import.meta.env.VITE_TOKEN_REGISTRY_URL?.toString().trim()
  || ENV_REGISTRY_URLS.devnet
  || DEFAULT_REGISTRY_PROXY_BASE_PATH;
const ENV_SCAN_URL =
  import.meta.env.VITE_SCAN_URL?.toString().trim()
  || DEFAULT_REGISTRY_PROXY_BASE_PATH;
const ENV_REGISTRY_API_KEY = import.meta.env.VITE_REGISTRY_API_KEY?.toString().trim() || '';
const NETWORK_PRESETS = buildNetworkPresets();
const initialNetworkId = normalizeNetworkId(
  localStorage.getItem(NETWORK_ID_STORAGE_KEY)
    || savedDomainSettings.networkId
    || ENV_NETWORK_ID,
);

els.networkPreset.value = initialNetworkId;
els.walletDomain.value = initialWalletDomain;
els.devnetRegistryDomain.value = initialDevnetRegistryDomain;
els.registryApiKey.value = ENV_REGISTRY_API_KEY;
const defaultRemoteUrl =
  getConfiguredWalletRpcUrl(initialNetworkId, initialWalletDomain);
els.remoteUrl.value = defaultRemoteUrl;
els.commandsJson.value = JSON.stringify(
  {
    commands: [
      {
        CreateCommand: {
          templateId: 'pkg:Module:Template',
          createArguments: {},
        },
      },
    ],
  },
  null,
  2,
);
els.transferInstrumentId.value = 'Amulet';
els.transferInstrumentAdmin.value = '';
els.transferContextJson.value = '{ "values": {} }';
els.transferDisclosedJson.value = '[]';
els.transferFactoryContractId.readOnly = true;

let eventsSubscribed = false;
const KERNEL_DISCOVERY_KEY = 'splice_wallet_kernel_discovery';
const KERNEL_SESSION_KEY = 'splice_wallet_kernel_session';
const DISCOVERY_SESSION_STORAGE_KEY = 'splice_discovery_client_session';
const SIGN_MESSAGE_WAIT_TIMEOUT_MS = 5 * 60 * 1000;
const SIGN_MESSAGE_POLL_INTERVAL_MS = 1200;
const TX_WAIT_TIMEOUT_MS = 5 * 60 * 1000;
const TRANSFER_FACTORY_TEMPLATE_ID =
  '#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferFactory';
const HOLDING_TEMPLATE_ID = 'Splice.Amulet:Amulet';
const MOBILE_LAYOUT_MEDIA_QUERY = '(max-width: 860px)';
const MAX_LOG_ENTRIES = 400;

const logEntries: string[] = [];

els.transferFactoryTemplateId.value = els.transferFactoryTemplateId.value.trim() || TRANSFER_FACTORY_TEMPLATE_ID;
els.scanUrl.value = ENV_SCAN_URL;
if (!els.registryUrl.value.trim()) {
  const bootstrapRegistryUrl =
    getConfiguredRegistryUrl(initialNetworkId, '', { ignoreInput: true })
    || ENV_SINGLE_REGISTRY_URL
    || loadRegistryUrlStore().devnet
    || '';
  if (bootstrapRegistryUrl) {
    els.registryUrl.value = bootstrapRegistryUrl;
  }
}
applyNetworkPreset(initialNetworkId, false);

function now(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function syncRightPaneHeightToLeftPane(): void {
  if (window.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY).matches) {
    layoutEls.workspace.style.removeProperty('--left-pane-height');
    return;
  }

  const leftPaneHeight = Math.ceil(layoutEls.leftPane.getBoundingClientRect().height);
  if (leftPaneHeight <= 0) {
    layoutEls.workspace.style.removeProperty('--left-pane-height');
    return;
  }

  layoutEls.workspace.style.setProperty('--left-pane-height', `${leftPaneHeight}px`);
}

function setupPaneHeightSync(): void {
  const observer = new ResizeObserver(() => {
    syncRightPaneHeightToLeftPane();
  });
  observer.observe(layoutEls.leftPane);
  window.addEventListener('resize', syncRightPaneHeightToLeftPane);
  syncRightPaneHeightToLeftPane();
}

function appendLog(kind: 'INFO' | 'OK' | 'ERR', label: string, payload?: unknown): void {
  const line = `[${now()}] [${kind}] ${label}`;
  const text = payload === undefined ? line : `${line}\n${stringify(payload)}`;
  logEntries.unshift(text);
  if (logEntries.length > MAX_LOG_ENTRIES) {
    logEntries.length = MAX_LOG_ENTRIES;
  }
  els.log.textContent = logEntries.join('\n\n');
}

function appendDiagnosticsLog(kind: 'INFO' | 'OK' | 'ERR', label: string, payload?: unknown): void {
  if (HOLDINGS_DIAGNOSTICS_ENABLED) {
    appendLog(kind, label, payload);
  }
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeError(err: unknown): { message: string; details: Record<string, unknown> } {
  if (err && typeof err === 'object') {
    const e = err as ErrorLike;
    const details: Record<string, unknown> = {};

    if (typeof e.code === 'number') {
      details.code = e.code;
    }
    if (typeof e.error === 'number') {
      details.error = e.error;
    }
    if (typeof e.status === 'string' && e.status) {
      details.status = e.status;
    }
    if (e.data !== undefined) {
      details.data = e.data;
    }
    if (e.details !== undefined) {
      details.details = e.details;
    }
    if (e.cause !== undefined) {
      details.cause = e.cause;
    }

    return {
      message:
        (typeof e.message === 'string' && e.message)
        || (typeof e.details === 'string' && e.details)
        || 'Unknown error',
      details,
    };
  }

  return {
    message: String(err),
    details: {},
  };
}

function setTransferFactoryStatus(text: string, tone: 'info' | 'ok' | 'warn' = 'info'): void {
  els.transferFactoryStatus.textContent = text;
  els.transferFactoryStatus.dataset.tone = tone;
}

function setTransferFactoryManualMode(manual: boolean): void {
  els.transferFactoryManualOverride.checked = manual;
  els.transferFactoryContractId.readOnly = !manual;
}

function normalizeDomainValue(raw: string, fallback: string): string {
  const candidate = raw.trim() || fallback.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return fallback;
  }
}

function normalizeNetworkId(raw: string): string {
  const networkId = raw.trim().toLowerCase();
  return networkId === 'testnet' ? 'testnet' : DEFAULT_NETWORK_ID;
}

function buildNetworkPresets(): Record<string, NetworkPreset> {
  const testnetWalletDomain = normalizeDomainValue(
    import.meta.env.VITE_TESTNET_WALLET_DOMAIN?.toString().trim() || DEFAULT_TESTNET_WALLET_DOMAIN,
    DEFAULT_TESTNET_WALLET_DOMAIN,
  );
  const testnetRegistryUrl =
    import.meta.env.VITE_TESTNET_REGISTRY_URL?.toString().trim()
    || import.meta.env.VITE_TESTNET_TOKEN_REGISTRY_URL?.toString().trim()
    || ENV_REGISTRY_URLS.testnet
    || `${DEFAULT_REGISTRY_PROXY_BASE_PATH}/testnet`;
  const testnetScanUrl =
    import.meta.env.VITE_TESTNET_SCAN_URL?.toString().trim()
    || testnetRegistryUrl;
  const testnetUsdcxRegistryUrl =
    import.meta.env.VITE_TESTNET_USDCX_REGISTRY_URL?.toString().trim()
    || ENV_TOKEN_REGISTRY_URLS['testnet:USDCx']
    || ENV_TOKEN_REGISTRY_URLS['testnet:usdcx']
    || joinUrl(
      `${DEFAULT_TOKEN_STANDARD_PROXY_BASE_PATH}/testnet`,
      `/registrars/${encodeURIComponent(TESTNET_USDCX_ADMIN)}`,
    );

  return {
    devnet: {
      networkId: 'devnet',
      label: 'DevNet',
      walletDomain: ENV_WALLET_DOMAIN,
      registryDomain: ENV_REGISTRY_DOMAIN,
      scanUrl: ENV_SCAN_URL,
      defaultRegistryUrl: ENV_SINGLE_REGISTRY_URL,
      assets: [
        {
          assetId: 'CC',
          label: 'CC (Amulet)',
          symbol: 'CC',
          instrumentId: 'Amulet',
          instrumentAdmin: '',
          expectedAdmin: '',
          registryUrl: ENV_SINGLE_REGISTRY_URL,
        },
      ],
    },
    testnet: {
      networkId: 'testnet',
      label: 'TestNet',
      walletDomain: testnetWalletDomain,
      registryDomain: import.meta.env.VITE_TESTNET_REGISTRY_DOMAIN?.toString().trim()
        ? normalizeDomainValue(import.meta.env.VITE_TESTNET_REGISTRY_DOMAIN.toString().trim(), DEFAULT_TESTNET_REGISTRY_DOMAIN)
        : DEFAULT_TESTNET_REGISTRY_DOMAIN,
      scanUrl: testnetScanUrl,
      defaultRegistryUrl: testnetRegistryUrl,
      assets: [
        {
          assetId: 'CC',
          label: 'CC (Amulet)',
          symbol: 'CC',
          instrumentId: 'Amulet',
          instrumentAdmin: TESTNET_DSO_ADMIN,
          expectedAdmin: TESTNET_DSO_ADMIN,
          registryUrl: testnetRegistryUrl,
        },
        {
          assetId: 'USDCx',
          label: 'USDCx',
          symbol: 'USDCx',
          instrumentId: 'USDCx',
          instrumentAdmin: TESTNET_USDCX_ADMIN,
          expectedAdmin: TESTNET_USDCX_ADMIN,
          registryUrl: testnetUsdcxRegistryUrl,
        },
      ],
    },
  };
}

function getSelectedNetworkId(): string {
  return normalizeNetworkId(els.networkPreset.value || initialNetworkId);
}

function getNetworkPreset(networkId: string): NetworkPreset {
  return NETWORK_PRESETS[normalizeNetworkId(networkId)] || NETWORK_PRESETS[DEFAULT_NETWORK_ID];
}

function getConfiguredWalletRpcUrl(networkId: string, walletDomain: string): string {
  const normalizedNetworkId = normalizeNetworkId(networkId);
  const networkSpecificUrl =
    ENV_WALLET_RPC_URLS[normalizedNetworkId]
    || (normalizedNetworkId === 'testnet'
      ? import.meta.env.VITE_TESTNET_WALLET_RPC_URL?.toString().trim()
      : '')
    || (normalizedNetworkId === DEFAULT_NETWORK_ID
      ? import.meta.env.VITE_WALLET_RPC_URL?.toString().trim()
      : '');
  if (networkSpecificUrl) {
    return networkSpecificUrl;
  }

  const presetDomain = getNetworkPreset(normalizedNetworkId).walletDomain;
  if (presetDomain) {
    return joinUrl(presetDomain, '/api/v1/dapp');
  }
  if (walletDomain.trim()) {
    return joinUrl(walletDomain, '/api/v1/dapp');
  }
  return '';
}

function assetRegistryKeys(networkId: string, instrumentAdmin: string, instrumentId: string): string[] {
  const normalizedNetworkId = normalizeNetworkId(networkId);
  const keys: string[] = [];
  if (instrumentAdmin && instrumentId) {
    keys.push(`${normalizedNetworkId}:${instrumentAdmin}:${instrumentId}`);
  }
  if (instrumentId) {
    keys.push(`${normalizedNetworkId}:${instrumentId}`);
  }
  keys.push(normalizedNetworkId);
  return keys;
}

function findAssetPreset(networkId: string, instrumentAdmin: string, instrumentId: string): TransferAssetPreset | null {
  const preset = getNetworkPreset(networkId);
  const normalizedInstrumentId = instrumentId.trim();
  const normalizedInstrumentAdmin = instrumentAdmin.trim();
  return preset.assets.find((asset) => {
    if (asset.instrumentId !== normalizedInstrumentId) return false;
    if (normalizedInstrumentAdmin && asset.instrumentAdmin && asset.instrumentAdmin !== normalizedInstrumentAdmin) {
      return false;
    }
    return true;
  }) ?? null;
}

function getSelectedAssetPreset(): TransferAssetPreset | null {
  const preset = getNetworkPreset(getSelectedNetworkId());
  const assetId = els.transferAsset.value.trim();
  return preset.assets.find((asset) => asset.assetId === assetId) ?? preset.assets[0] ?? null;
}

function populateTransferAssetOptions(networkId: string): void {
  const preset = getNetworkPreset(networkId);
  const previousAssetId = els.transferAsset.value.trim();
  els.transferAsset.replaceChildren();

  for (const asset of preset.assets) {
    const option = document.createElement('option');
    option.value = asset.assetId;
    option.textContent = asset.label;
    els.transferAsset.append(option);
  }

  const hasPrevious = preset.assets.some((asset) => asset.assetId === previousAssetId);
  els.transferAsset.value = hasPrevious ? previousAssetId : (preset.assets[0]?.assetId ?? '');
}

function applySelectedAssetPreset(options: { overwriteRegistryUrl: boolean }): void {
  const asset = getSelectedAssetPreset();
  if (!asset) return;

  els.transferInstrumentId.value = asset.instrumentId;
  els.transferInstrumentAdmin.value = asset.instrumentAdmin;
  els.transferExpectedAdmin.value = asset.expectedAdmin;
  if (options.overwriteRegistryUrl || !els.registryUrl.value.trim()) {
    els.registryUrl.value = asset.registryUrl;
  }
  resetTransferFactoryDiscoveryUI();
}

function applyNetworkPreset(networkId: string, persist = true): void {
  const normalizedNetworkId = normalizeNetworkId(networkId);
  const preset = getNetworkPreset(normalizedNetworkId);
  els.networkPreset.value = normalizedNetworkId;

  if (preset.walletDomain) {
    els.walletDomain.value = preset.walletDomain;
  }
  const walletRpcUrl = getConfiguredWalletRpcUrl(normalizedNetworkId, els.walletDomain.value.trim());
  els.remoteUrl.value = walletRpcUrl;
  els.devnetRegistryDomain.value = preset.registryDomain;
  els.scanUrl.value = preset.scanUrl;
  populateTransferAssetOptions(normalizedNetworkId);
  applySelectedAssetPreset({ overwriteRegistryUrl: true });

  if (persist) {
    localStorage.setItem(NETWORK_ID_STORAGE_KEY, normalizedNetworkId);
    saveDomainSettingsStore({
      walletDomain: els.walletDomain.value.trim(),
      registryDomain: els.devnetRegistryDomain.value.trim(),
      networkId: normalizedNetworkId,
      devnetRegistryDomain: els.devnetRegistryDomain.value.trim(),
    });
  }

  syncWalletIdentityPreview();
}

function loadDomainSettingsStore(): DomainSettingsStore {
  const raw = localStorage.getItem(DOMAIN_SETTINGS_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const obj = parsed as Record<string, unknown>;
    const out: DomainSettingsStore = {};
    if (typeof obj.walletDomain === 'string') {
      out.walletDomain = obj.walletDomain.trim();
    }
    if (typeof obj.registryDomain === 'string') {
      out.registryDomain = obj.registryDomain.trim();
    }
    if (typeof obj.networkId === 'string') {
      out.networkId = normalizeNetworkId(obj.networkId);
    }
    if (typeof obj.devnetRegistryDomain === 'string') {
      out.devnetRegistryDomain = obj.devnetRegistryDomain.trim();
    }
    return out;
  } catch {
    return {};
  }
}

function saveDomainSettingsStore(store: DomainSettingsStore): void {
  localStorage.setItem(DOMAIN_SETTINGS_STORAGE_KEY, JSON.stringify(store));
}

function buildScanAnsEntriesEndpoint(scanBaseURL: string, adminPartyId: string): string {
  const parsed = parseUrl(scanBaseURL);
  const path = parsed?.pathname || '';
  const normalizedBase = scanBaseURL.trim().toLowerCase();
  const usesScanProxyStyleBase = path.includes('/scan-proxy/')
    || path.endsWith('/scan-proxy')
    || normalizedBase.includes('/api/registry-proxy');
  const ansEntriesPath = usesScanProxyStyleBase
    ? `/ans-entries/by-party/${encodeURIComponent(adminPartyId)}`
    : `/v0/ans-entries/by-party/${encodeURIComponent(adminPartyId)}`;
  return joinUrl(scanBaseURL, ansEntriesPath);
}

function applyDomainSettings(persist = true): void {
  const networkId = getSelectedNetworkId();
  const networkPreset = getNetworkPreset(networkId);
  const selectedAsset = getSelectedAssetPreset();
  const walletDomain = normalizeDomainValue(els.walletDomain.value, ENV_WALLET_DOMAIN);
  const devnetRegistryDomain = normalizeDomainValue(
    els.devnetRegistryDomain.value,
    networkPreset.registryDomain || ENV_REGISTRY_DOMAIN,
  );
  const derivedRegistryURL = selectedAsset?.registryUrl || networkPreset.defaultRegistryUrl;
  els.walletDomain.value = walletDomain;
  els.devnetRegistryDomain.value = devnetRegistryDomain;
  els.remoteUrl.value = getConfiguredWalletRpcUrl(networkId, walletDomain);
  els.registryUrl.value = derivedRegistryURL;
  els.scanUrl.value = networkPreset.scanUrl || derivedRegistryURL;
  rememberRegistryUrlForNetwork(
    networkId,
    derivedRegistryURL,
    selectedAsset?.instrumentAdmin || '',
    selectedAsset?.instrumentId || '',
  );
  if (persist) {
    saveDomainSettingsStore({
      walletDomain,
      registryDomain: devnetRegistryDomain,
      networkId,
      devnetRegistryDomain,
    });
  }

  syncWalletIdentityPreview();
}

function applyDomainSettingsFromInputs(): void {
  try {
    applyDomainSettings(true);
    appendLog('OK', 'settings -> applied domain defaults', {
      walletDomain: els.walletDomain.value.trim(),
      registryDomain: els.devnetRegistryDomain.value.trim(),
      networkId: getSelectedNetworkId(),
      remoteUrl: els.remoteUrl.value.trim(),
      registryUrl: els.registryUrl.value.trim(),
      scanUrl: els.scanUrl.value.trim(),
    });
  } catch (err) {
    const normalized = normalizeError(err);
    appendLog('ERR', 'settings -> failed to apply domains', normalized);
  }
}

function parseEnvRegistryUrlMap(raw: string): RegistryUrlStore {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: RegistryUrlStore = {};
    for (const [networkId, url] of Object.entries(parsed)) {
      if (typeof url !== 'string') continue;
      const normalized = url.trim();
      if (normalized) {
        out[networkId] = normalized;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function loadRegistryUrlStore(): RegistryUrlStore {
  const raw = localStorage.getItem(REGISTRY_URLS_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: RegistryUrlStore = {};
    for (const [networkId, url] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof url === 'string' && url.trim()) {
        out[networkId] = url.trim();
      }
    }
    return out;
  } catch {
    return {};
  }
}

function saveRegistryUrlStore(store: RegistryUrlStore): void {
  localStorage.setItem(REGISTRY_URLS_STORAGE_KEY, JSON.stringify(store));
}

function getConfiguredRegistryUrl(
  networkId: string,
  instrumentAdmin = '',
  options: { ignoreInput?: boolean; instrumentId?: string } = {},
): string {
  const normalizedNetworkId = normalizeNetworkId(networkId);
  const normalizedInstrumentAdmin = instrumentAdmin.trim();
  const normalizedInstrumentId = options.instrumentId?.trim() || '';
  const fromInput = els.registryUrl.value.trim();
  if (!options.ignoreInput && fromInput) return fromInput;

  const keys = assetRegistryKeys(normalizedNetworkId, normalizedInstrumentAdmin, normalizedInstrumentId);
  const localStore = loadRegistryUrlStore();
  for (const key of keys) {
    const local = localStore[key];
    if (local) return local;
  }

  for (const key of keys) {
    const envMapped = ENV_TOKEN_REGISTRY_URLS[key] || ENV_REGISTRY_URLS[key];
    if (envMapped) return envMapped;
  }

  const assetPreset = findAssetPreset(normalizedNetworkId, normalizedInstrumentAdmin, normalizedInstrumentId);
  if (assetPreset?.registryUrl) {
    return assetPreset.registryUrl;
  }

  const networkPreset = getNetworkPreset(normalizedNetworkId);
  if (networkPreset.defaultRegistryUrl) {
    return networkPreset.defaultRegistryUrl;
  }

  return '';
}

function rememberRegistryUrlForNetwork(
  networkId: string,
  registryUrl: string,
  instrumentAdmin = '',
  instrumentId = '',
): void {
  const normalized = registryUrl.trim();
  if (!normalized) return;
  const store = loadRegistryUrlStore();
  const keys = assetRegistryKeys(networkId, instrumentAdmin, instrumentId);
  store[keys[0]] = normalized;
  saveRegistryUrlStore(store);
}

function transferContextCacheKey(
  networkId: string,
  partyId: string,
  registryUrl: string,
  sender: string,
  receiver: string,
  amount: string,
  instrumentAdmin: string,
  instrumentId: string,
): string {
  return [
    networkId,
    partyId,
    registryUrl,
    sender,
    receiver,
    amount,
    instrumentAdmin,
    instrumentId,
  ].join('::');
}

function loadTransferContextCacheStore(): TransferContextCacheStore {
  const raw = localStorage.getItem(TRANSFER_CONTEXT_CACHE_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as TransferContextCacheStore;
  } catch {
    return {};
  }
}

function saveTransferContextCacheStore(store: TransferContextCacheStore): void {
  localStorage.setItem(TRANSFER_CONTEXT_CACHE_STORAGE_KEY, JSON.stringify(store));
}

function loadTransferContextCacheEntry(cacheKey: string): TransferContextCacheEntry | null {
  const store = loadTransferContextCacheStore();
  const entry = store[cacheKey];
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > TRANSFER_CONTEXT_CACHE_TTL_MS) {
    delete store[cacheKey];
    saveTransferContextCacheStore(store);
    return null;
  }
  return entry;
}

function saveTransferContextCacheEntry(cacheKey: string, entry: TransferContextCacheEntry): void {
  const store = loadTransferContextCacheStore();
  store[cacheKey] = entry;
  saveTransferContextCacheStore(store);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function asAmountString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return value.toString();
  return '';
}

function uniqueStrings(values: string[]): string[] {
  const out = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    out.add(normalized);
  }
  return [...out];
}

function isHoldingTemplateId(templateId: string): boolean {
  if (templateId === HOLDING_TEMPLATE_ID || templateId.endsWith(`:${HOLDING_TEMPLATE_ID}`)) {
    return true;
  }
  if (templateId.endsWith(':TestTokenHolding')) {
    return true;
  }
  if (!templateId.endsWith(':Holding')) {
    return false;
  }
  return !(
    templateId.includes('TransferInstruction')
    || templateId.includes('TransferOffer')
    || templateId.includes('Factory')
  );
}

function isHoldingInterfaceId(interfaceId: string): boolean {
  return interfaceId === HOLDING_INTERFACE_ID || interfaceId.endsWith(':Splice.Api.Token.HoldingV1:Holding');
}

function extractOwnerFromPayload(payload: Record<string, unknown>): string {
  return asString(payload.owner)
    || asString(payload.holder)
    || asString(asObject(payload.amulet)?.owner);
}

function extractAmountFromPayload(payload: Record<string, unknown>): string {
  const direct = asAmountString(payload.amount);
  if (direct) return direct;

  const transfer = asObject(payload.transfer);
  if (transfer) {
    const transferAmount = extractAmountFromPayload(transfer);
    if (transferAmount) return transferAmount;
  }

  const amount = asObject(payload.amount);
  if (amount) {
    return asAmountString(amount.amount)
      || asAmountString(amount.value)
      || asAmountString(amount.initialAmount);
  }

  const amulet = asObject(payload.amulet);
  if (amulet) {
    const amuletAmount = extractAmountFromPayload(amulet);
    if (amuletAmount) return amuletAmount;
  }

  return asAmountString(payload.quantity);
}

function extractInstrumentIdFromPayload(payload: Record<string, unknown>): { admin: string; id: string } | null {
  const directInstrumentId = asObject(payload.instrumentId);
  const directId = asString(directInstrumentId?.id);
  if (directId) {
    return {
      admin: asString(directInstrumentId?.admin),
      id: directId,
    };
  }

  const recordId = asString(payload.id);
  const recordAdmin = asString(payload.admin) || asString(payload.source);
  if (recordId && recordAdmin) {
    return {
      admin: recordAdmin,
      id: recordId,
    };
  }

  const transfer = asObject(payload.transfer);
  if (transfer) {
    const nested = extractInstrumentIdFromPayload(transfer);
    if (nested) return nested;
  }

  const instrument = asObject(payload.instrument);
  const instrumentId = asString(instrument?.id);
  if (instrumentId) {
    return {
      admin: asString(instrument?.admin) || asString(instrument?.source) || asString(payload.registrar),
      id: instrumentId,
    };
  }

  const amount = asObject(payload.amount);
  const unit = asObject(amount?.unit);
  if (unit) {
    const nested = extractInstrumentIdFromPayload(unit);
    if (nested) return nested;
  }

  const tokenConfig = asObject(payload.tokenConfig);
  const tokenId = asString(tokenConfig?.tokenId);
  if (tokenId) {
    return {
      admin: asString(payload.admin),
      id: tokenId,
    };
  }

  const dso = asString(payload.dso);
  if (dso) {
    return {
      admin: dso,
      id: 'Amulet',
    };
  }

  const amulet = asObject(payload.amulet);
  if (amulet) {
    const nested = extractInstrumentIdFromPayload(amulet);
    if (nested) return nested;
  }

  return null;
}

function holdingMatchesInstrument(
  templateId: string,
  payload: Record<string, unknown>,
  requestedInstrumentId: string,
  requestedInstrumentAdmin: string,
): boolean {
  const instrumentId = requestedInstrumentId.trim();
  const instrumentAdmin = requestedInstrumentAdmin.trim();
  if (!instrumentId) {
    return true;
  }

  const holdingInstrument = extractInstrumentIdFromPayload(payload);
  if (!holdingInstrument) {
    return instrumentId === 'Amulet' && isHoldingTemplateId(templateId);
  }
  if (holdingInstrument.id !== instrumentId) {
    return false;
  }
  if (instrumentAdmin) {
    if (!holdingInstrument.admin) {
      return instrumentId === 'Amulet' && isHoldingTemplateId(templateId);
    }
    if (holdingInstrument.admin !== instrumentAdmin) {
      return false;
    }
  }
  return true;
}

function isTransferRelatedTemplateId(templateId: string): boolean {
  return templateId.includes('TransferInstruction')
    || templateId.includes('TransferOffer')
    || templateId.includes('TransferFactory')
    || templateId.includes('Factory');
}

function extractHoldingInterfaceViewPayload(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const view = asObject(item);
    if (!view || !isHoldingInterfaceId(asString(view.interfaceId))) continue;
    const viewValue = asObject(view.viewValue);
    if (viewValue) return viewValue;
  }
  return null;
}

function extractContractPayload(entry: Record<string, unknown>): {
  payload: Record<string, unknown>;
  hasHoldingInterfaceView: boolean;
} {
  const holdingViewPayload = extractHoldingInterfaceViewPayload(entry.interfaceViews);
  if (holdingViewPayload) {
    return {
      payload: holdingViewPayload,
      hasHoldingInterfaceView: true,
    };
  }

  return {
    payload: asObject(entry.payload)
      || asObject(entry.createArgument)
      || asObject(entry.createArguments)
      || {},
    hasHoldingInterfaceView: false,
  };
}

function extractCreatedEventFromActiveContractEntry(entry: Record<string, unknown>): Record<string, unknown> | null {
  const contractEntry = asObject(entry.contractEntry);
  const activeContract = asObject(entry.activeContract);
  const activeContractEntry = asObject(activeContract?.contractEntry);

  return asObject(asObject(contractEntry?.JsActiveContract)?.createdEvent)
    || asObject(asObject(activeContractEntry?.JsActiveContract)?.createdEvent)
    || asObject(asObject(entry.JsActiveContract)?.createdEvent)
    || asObject(entry.createdEvent);
}

function extractActiveContractPartsFromEntry(entryValue: unknown): ActiveContractParts | null {
  const entry = asObject(entryValue);
  if (!entry) return null;

  const createdEvent = extractCreatedEventFromActiveContractEntry(entry);
  if (createdEvent) {
    const contractId = asString(createdEvent.contractId);
    const templateId = asString(createdEvent.templateId);
    if (!contractId) return null;
    const { payload, hasHoldingInterfaceView } = extractContractPayload(createdEvent);
    return {
      contractId,
      templateId,
      interfaceId: hasHoldingInterfaceView ? HOLDING_INTERFACE_ID : asString(createdEvent.interfaceId),
      payload,
      hasHoldingInterfaceView,
    };
  }

  const contractEntry =
    asObject(entry.contractEntry)
    || asObject(asObject(entry.activeContract)?.contractEntry)
    || entry;
  const contractId = asString(contractEntry.contractId);
  if (!contractId) return null;

  const { payload, hasHoldingInterfaceView } = extractContractPayload(contractEntry);
  return {
    contractId,
    templateId: asString(contractEntry.templateId),
    interfaceId: asString(contractEntry.interfaceId),
    payload,
    hasHoldingInterfaceView,
  };
}

function extractActiveContractParts(payload: unknown): ActiveContractParts[] {
  const payloadObject = asObject(payload);
  const entries: unknown[] = Array.isArray(payload)
    ? payload
    : (Array.isArray(payloadObject?.activeContracts) ? payloadObject.activeContracts : []);
  return entries
    .map((entry) => extractActiveContractPartsFromEntry(entry))
    .filter((entry): entry is ActiveContractParts => entry !== null);
}

function summarizeActiveContractsPayload(payload: unknown): Record<string, unknown> {
  if (Array.isArray(payload)) {
    return {
      shape: 'array',
      returnedEntries: payload.length,
    };
  }

  const obj = asObject(payload);
  if (!obj) {
    return {
      shape: typeof payload,
      returnedEntries: 0,
    };
  }

  const activeContracts = Array.isArray(obj.activeContracts) ? obj.activeContracts : null;
  return {
    shape: 'object',
    keys: Object.keys(obj).slice(0, 8),
    returnedEntries: activeContracts?.length ?? 0,
  };
}

function isHoldingContractParts(parts: ActiveContractParts): boolean {
  if (isTransferRelatedTemplateId(parts.templateId)) return false;
  if (parts.hasHoldingInterfaceView || isHoldingInterfaceId(parts.interfaceId) || isHoldingTemplateId(parts.templateId)) {
    return true;
  }
  return Boolean(
    extractOwnerFromPayload(parts.payload)
    && extractInstrumentIdFromPayload(parts.payload)
    && extractAmountFromPayload(parts.payload),
  );
}

function instrumentSummaryKey(instrument: { admin: string; id: string } | null): string {
  if (!instrument) return 'unknown';
  return instrument.admin ? `${instrument.admin}:${instrument.id}` : instrument.id;
}

function incrementSummary(summary: Record<string, number>, key: string): void {
  summary[key] = (summary[key] ?? 0) + 1;
}

function shortContractId(contractId: string): string {
  if (contractId.length <= 22) return contractId;
  return `${contractId.slice(0, 10)}...${contractId.slice(-10)}`;
}

function openUserUrl(userUrl: string): void {
  appendLog('INFO', 'Opening userUrl', { userUrl });
  // Keep opener reference so /dapp/login can postMessage the exchanged dApp token back.
  try {
    walletPopup.open(userUrl);
  } catch (err) {
    appendLog('ERR', 'Popup was blocked by browser', { userUrl, reason: normalizeError(err).message });
  }
}

function isSafariBrowser(): boolean {
  const userAgent = navigator.userAgent;
  const vendor = navigator.vendor || '';
  return (
    /Safari/i.test(userAgent)
    && /Apple/i.test(vendor)
    && !/(Chrome|Chromium|CriOS|FxiOS|Edg|EdgiOS|OPR|OPiOS|Android)/i.test(userAgent)
  );
}

function isMacOSSafariBrowser(): boolean {
  const userAgent = navigator.userAgent;
  const platform = navigator.platform || '';
  const isIPadOSDesktopMode = platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isSafariBrowser() && !isIPadOSDesktopMode && (/Mac/i.test(platform) || /Mac OS X/i.test(userAgent));
}

function shouldPrimeWalletPopupForSafari(): boolean {
  const discovery = loadKernelDiscoveryState();
  const activeRemoteGatewayUrl = discovery?.walletType === 'remote' ? asString(discovery.url) : '';
  return isMacOSSafariBrowser() && Boolean(els.remoteUrl.value.trim() || activeRemoteGatewayUrl);
}

function primeWalletPopupForSafari(action: string): void {
  if (!shouldPrimeWalletPopupForSafari()) return;

  try {
    const popupWindow = walletPopup.open('about:blank');
    try {
      popupWindow.document.title = 'Canton Wallet';
      popupWindow.document.body.innerHTML =
        '<div style="font-family: system-ui, sans-serif; padding: 16px;">Continue in the wallet window.</div>';
    } catch {
      // Existing wallet windows can be cross-origin until the SDK navigates them.
    }
    appendLog('INFO', `${action} -> wallet popup primed for Safari`);
  } catch (err) {
    appendLog('INFO', `${action} -> Safari popup prime skipped`, { reason: normalizeError(err).message });
  }
}

function shouldUseSafariDirectRemoteConnect(): boolean {
  return isMacOSSafariBrowser() && Boolean(els.remoteUrl.value.trim());
}

function setSDKSingletonClientForSafariRemote(client: DappClient | null): void {
  // 2026-04-24: SDK 1.1.0 has no supported direct-remote connect API
  // that both bypasses the picker and preserves module-level helpers like
  // status(), listAccounts(), and open(). Keep this isolated so it can be
  // removed when upstream exposes a public equivalent.
  (dappSDK as unknown as DappSDKWithInternalClient).client = client;
}

async function connectSafariRemoteDirect(): Promise<SDKConnectResult> {
  const preferredGatewayUrl = els.remoteUrl.value.trim();
  if (!preferredGatewayUrl) {
    throw new Error('Remote wallet gateway URL is required for Safari remote connect.');
  }

  const parsedPreferredGatewayUrl = parseUrl(preferredGatewayUrl);
  if (!parsedPreferredGatewayUrl) {
    throw new Error('Preferred wallet gateway URL must be an absolute URL.');
  }

  const rpcUrl = parsedPreferredGatewayUrl.toString();
  clearPersistedWalletSessionState();

  const adapter = new RemoteAdapter({
    name: buildRemotePickerEntryLabel(rpcUrl),
    rpcUrl,
  });
  appendLog('INFO', 'connect -> Safari direct remote gateway', { rpcUrl });
  const provider = adapter.provider();
  const client = new DappClient(provider, { providerType: 'remote' });
  setSDKSingletonClientForSafariRemote(client);

  try {
    const result = await client.connect();
    if (result.isConnected) {
      localStorage.setItem(KERNEL_DISCOVERY_KEY, JSON.stringify({ walletType: 'remote', url: rpcUrl }));
    }
    return result;
  } catch (err) {
    setSDKSingletonClientForSafariRemote(null);
    clearPersistedWalletSessionState();
    try {
      walletPopup.close();
    } catch {
      // Best-effort cleanup for the synchronously reserved Safari popup.
    }
    throw err;
  }
}

async function connectWithSDKPicker(): Promise<SDKConnectResult> {
  await init(buildPickerConnectOptions());
  return connect();
}

function maybeOpenUserUrl(err: unknown): void {
  if (!err || typeof err !== 'object') return;
  const data = (err as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return;
  const userUrl = (data as { userUrl?: unknown }).userUrl;
  if (typeof userUrl === 'string' && userUrl.length > 0) {
    openUserUrl(userUrl);
  }
}

async function run(action: string, fn: () => Promise<unknown>): Promise<void> {
  appendLog('INFO', `${action} -> started`);
  try {
    const result = await fn();
    appendLog('OK', `${action} -> success`, result);
  } catch (err) {
    const normalized = normalizeError(err);
    appendLog('ERR', `${action} -> ${normalized.message}`, normalized.details);
    maybeOpenUserUrl(err);
  }
}

function getInjectedProvider(): RequestingProvider | null {
  return (window as Window & { canton?: RequestingProvider }).canton ?? null;
}

function ensureProvider(): RequestingProvider {
  const provider = getInjectedProvider();
  if (!provider) {
    throw new Error('No active wallet provider. Click connect() to open the wallet picker first.');
  }
  return provider;
}

function loadKernelDiscoveryState(): KernelDiscoveryState | null {
  const raw = localStorage.getItem(KERNEL_DISCOVERY_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return asObject(parsed) as KernelDiscoveryState;
  } catch {
    return null;
  }
}

function clearPersistedWalletSessionState(): void {
  localStorage.removeItem(KERNEL_DISCOVERY_KEY);
  localStorage.removeItem(KERNEL_SESSION_KEY);
  localStorage.removeItem(DISCOVERY_SESSION_STORAGE_KEY);
  (window as Window & { canton?: RequestingProvider }).canton = undefined;
}

function buildRemotePickerEntryLabel(rpcUrl: string): string {
  const trimmedRpcUrl = rpcUrl.trim();
  if (!trimmedRpcUrl) {
    return 'No configured gateway';
  }

  const parsedRpcUrl = parseUrl(trimmedRpcUrl);
  if (!parsedRpcUrl) {
    return 'Configured Gateway (invalid URL)';
  }

  return `Configured Gateway (${parsedRpcUrl.host})`;
}

function getWalletSourceLabel(): string {
  const discovery = loadKernelDiscoveryState();
  if (discovery?.walletType === 'extension') {
    return 'Browser extension';
  }
  if (discovery?.walletType === 'remote') {
    const parsedRemoteUrl = parseUrl(asString(discovery.url));
    return parsedRemoteUrl ? `Remote gateway ${parsedRemoteUrl.host}` : 'Remote gateway';
  }
  return 'No active wallet';
}

function renderConnectedAccount(summary: AccountConnectionSummary | null): void {
  if (!summary?.primaryAccount.partyId) {
    els.connectedAccountLabel.textContent = 'Not connected';
    els.connectedAccountLabel.removeAttribute('title');
    els.connectedAccountMeta.textContent = 'Connect to resolve the active party/account identity.';
    return;
  }

  const accountLabel = summary.primaryAccount.hint || summary.primaryAccount.partyId;
  const accountMetaParts = [
    getWalletSourceLabel(),
    getNetworkPreset(summary.primaryAccount.networkId || getSelectedNetworkId()).label,
    summary.accountCount > 0
      ? `${summary.accountCount} account${summary.accountCount === 1 ? '' : 's'}`
      : 'account count unavailable',
  ];

  els.connectedAccountLabel.textContent = accountLabel;
  els.connectedAccountLabel.title = summary.primaryAccount.partyId;
  els.connectedAccountMeta.textContent = accountMetaParts.join(' • ');
}

function syncWalletIdentityPreview(): void {
  const remoteUrl = els.remoteUrl.value.trim();
  els.remotePickerLabel.textContent = buildRemotePickerEntryLabel(remoteUrl);
  if (remoteUrl) {
    els.remotePickerLabel.setAttribute('title', remoteUrl);
  } else {
    els.remotePickerLabel.removeAttribute('title');
  }
}

async function refreshConnectedAccountPreview(): Promise<void> {
  const provider = getInjectedProvider();
  if (!provider) {
    renderConnectedAccount(null);
    return;
  }

  try {
    renderConnectedAccount(await getAccountConnectionSummary(provider));
  } catch (err) {
    appendLog('INFO', 'connected account preview -> refresh skipped', { reason: normalizeError(err).message });
    renderConnectedAccount(null);
  }
}

function getCurrentProviderKind(): 'remote' | 'extension' | 'unknown' {
  const discovery = loadKernelDiscoveryState();
  if (discovery?.walletType === 'remote') {
    return 'remote';
  }
  if (discovery?.walletType === 'extension') {
    return 'extension';
  }
  return 'unknown';
}

function buildPickerConnectOptions(): {
  defaultAdapters: ExtensionAdapter[];
  additionalAdapters?: RemoteAdapter[];
} {
  const defaultAdapters = [new ExtensionAdapter()];
  const preferredGatewayUrl = els.remoteUrl.value.trim();
  if (!preferredGatewayUrl) {
    return { defaultAdapters };
  }

  const parsedPreferredGatewayUrl = parseUrl(preferredGatewayUrl);
  if (!parsedPreferredGatewayUrl) {
    throw new Error('Preferred wallet gateway URL must be an absolute URL.');
  }

  return {
    defaultAdapters,
    additionalAdapters: [
      new RemoteAdapter({
        name: buildRemotePickerEntryLabel(parsedPreferredGatewayUrl.toString()),
        rpcUrl: parsedPreferredGatewayUrl.toString(),
      }),
    ],
  };
}

async function getCurrentRemoteGatewayContext(): Promise<{ rpcUrl: string; accessToken: string }> {
  const discovery = loadKernelDiscoveryState();
  const rpcUrl = discovery?.walletType === 'remote' ? asString(discovery.url) : '';
  if (!rpcUrl) {
    throw new Error('Active wallet is not a remote gateway. Choose a remote gateway in connect().');
  }

  const statusResult = await getSDKStatus();
  const accessToken = asString(statusResult?.session?.accessToken);
  if (!accessToken) {
    throw new Error('Connected remote session is missing accessToken. Reconnect via connect().');
  }

  return { rpcUrl, accessToken };
}

async function rpcRequest<T>(method: string, params?: Record<string, unknown> | unknown[]): Promise<T> {
  const { rpcUrl, accessToken } = await getCurrentRemoteGatewayContext();
  const headers = new Headers({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  });
  const requestBody: Record<string, unknown> = {
    jsonrpc: '2.0',
    id: crypto.randomUUID(),
    method,
  };
  if (params !== undefined) {
    requestBody.params = params;
  }

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) {
    const body = await response.text();
    throw {
      message: `HTTP ${response.status} ${response.statusText}`,
      code: response.status,
      data: body,
    } satisfies ErrorLike;
  }

  const payload = (await response.json()) as JSONRPCResponsePayload<T>;
  if (payload.error) {
    if (payload.error.code === 4100) {
      throw new Error('Session expired or unauthorized. Click connect() to re-authenticate.');
    }
    throw {
      message: payload.error.message || 'RPC error',
      code: payload.error.code,
      data: payload.error.data,
    } satisfies ErrorLike;
  }
  if (!('result' in payload)) {
    throw new Error('Invalid JSON-RPC response: missing result');
  }

  return payload.result as T;
}

async function getSDKStatus(): Promise<SDKStatusSnapshot | null> {
  try {
    return await status();
  } catch {
    return null;
  }
}

function getNetworkIdFromStatusSnapshot(statusResult: SDKStatusSnapshot | null): string | null {
  return asString(statusResult?.network?.networkId);
}

function parseCommandParamsInput(): Record<string, unknown> {
  const parsed = JSON.parse(els.commandsJson.value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('commands JSON must be an object');
  }
  const out = { ...(parsed as Record<string, unknown>) };
  const placeholder = findPlaceholderTemplateId(out);
  if (placeholder) {
    throw new Error(
      `commands JSON still contains placeholder templateId "${placeholder}". Click "Prefill prepareExecute transfer" before submitting.`,
    );
  }
  return out;
}

function toPrepareExecuteParams(params: Record<string, unknown>): SDKPrepareExecuteInput {
  const commandsRaw = Array.isArray(params.commands) ? params.commands : [];
  if (commandsRaw.length === 0) {
    throw new Error('commands JSON must contain a non-empty commands array');
  }

  const commands = commandsRaw.map((command) => asObject(command) ?? {}) as unknown as SDKPrepareExecuteParams['commands'];
  const prepared: SDKPrepareExecuteInput = { commands };

  const commandId = asString(params.commandId);
  if (commandId) {
    prepared.commandId = commandId;
  }

  const actAsValues = Array.isArray(params.actAs) ? params.actAs.map((value) => asString(value)) : [];
  const actAs = uniqueStrings(actAsValues);
  if (actAs.length > 0) {
    prepared.actAs = actAs;
  }

  const readAsValues = Array.isArray(params.readAs) ? params.readAs.map((value) => asString(value)) : [];
  const readAs = uniqueStrings(readAsValues);
  if (readAs.length > 0) {
    prepared.readAs = readAs;
  }

  const disclosedContractsRaw = Array.isArray(params.disclosedContracts) ? params.disclosedContracts : [];
  const disclosedContracts = disclosedContractsRaw
    .map((entry) => asObject(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null);
  if (disclosedContracts.length > 0) {
    prepared.disclosedContracts = disclosedContracts as unknown as NonNullable<SDKPrepareExecuteParams['disclosedContracts']>;
  }

  const synchronizerId = asString(params.synchronizerId);
  if (synchronizerId) {
    prepared.synchronizerId = synchronizerId;
  }

  const packageIdSelectionPreferenceValues = Array.isArray(params.packageIdSelectionPreference)
    ? params.packageIdSelectionPreference.map((value) => asString(value))
    : [];
  const packageIdSelectionPreference = uniqueStrings(packageIdSelectionPreferenceValues);
  if (packageIdSelectionPreference.length > 0) {
    prepared.packageIdSelectionPreference = packageIdSelectionPreference;
  }

  const estimateTrafficCost = asObject(params.estimateTrafficCost);
  if (estimateTrafficCost) {
    prepared.estimateTrafficCost = estimateTrafficCost;
  }

  return prepared;
}

function findPlaceholderTemplateId(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findPlaceholderTemplateId(item);
      if (found) return found;
    }
    return null;
  }

  const obj = asObject(value);
  if (!obj) return null;

  const templateId = asString(obj.templateId);
  if (templateId && PLACEHOLDER_TEMPLATE_IDS.has(templateId.trim())) {
    return templateId.trim();
  }

  for (const nested of Object.values(obj)) {
    const found = findPlaceholderTemplateId(nested);
    if (found) return found;
  }
  return null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseLedgerApiJSONResponse(result: unknown): unknown {
  const obj = asObject(result);
  const responseText = asString(obj?.response);
  if (!responseText) {
    throw new Error('ledgerApi returned an empty response payload');
  }
  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error('ledgerApi returned non-JSON response');
  }
}

async function dappLedgerApiJSON(
  p: RequestingProvider,
  requestMethod: 'GET' | 'POST',
  resource: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const result = await p.request<LedgerApiRPCResult>({
    method: 'ledgerApi',
    params: {
      requestMethod,
      resource,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
  });
  return parseLedgerApiJSONResponse(result);
}

function extractHoldingContractIdsFromActiveContracts(
  payload: unknown,
  ownerPartyId: string,
  instrumentId = '',
  instrumentAdmin = '',
): HoldingLookupResult {
  const ids: string[] = [];
  const instruments: Record<string, number> = {};
  const templates: Record<string, number> = {};
  const contracts = extractActiveContractParts(payload);
  let holdingCandidates = 0;

  for (const contract of contracts) {
    if (!isHoldingContractParts(contract)) continue;

    const owner = extractOwnerFromPayload(contract.payload);
    if (owner && owner !== ownerPartyId) continue;

    holdingCandidates += 1;
    const holdingInstrument = extractInstrumentIdFromPayload(contract.payload);
    incrementSummary(instruments, instrumentSummaryKey(holdingInstrument));
    if (contract.templateId) {
      incrementSummary(templates, contract.templateId);
    }

    if (!holdingMatchesInstrument(contract.templateId, contract.payload, instrumentId, instrumentAdmin)) continue;
    ids.push(contract.contractId);
  }

  return {
    contractIds: uniqueStrings(ids),
    scannedContracts: contracts.length,
    holdingCandidates,
    instruments,
    templates,
  };
}

function buildActiveContractsBody(
  ownerPartyId: string,
  offset: number,
  mode: 'holding-interface' | 'wildcard',
): Record<string, unknown> {
  const identifierFilter =
    mode === 'holding-interface'
      ? {
          InterfaceFilter: {
            value: {
              interfaceId: HOLDING_INTERFACE_ID,
              includeInterfaceView: true,
              includeCreatedEventBlob: false,
            },
          },
        }
      : {
          WildcardFilter: {
            value: {
              includeCreatedEventBlob: false,
            },
          },
        };

  return {
    filter: {
      filtersByParty: {
        [ownerPartyId]: {
          cumulative: [
            {
              identifierFilter,
            },
          ],
        },
      },
    },
    verbose: true,
    activeAtOffset: offset,
  };
}

function mergeHoldingLookupResults(results: HoldingLookupResult[]): HoldingLookupResult {
  const merged: HoldingLookupResult = {
    contractIds: [],
    scannedContracts: 0,
    holdingCandidates: 0,
    instruments: {},
    templates: {},
  };

  for (const result of results) {
    merged.contractIds.push(...result.contractIds);
    merged.scannedContracts += result.scannedContracts;
    merged.holdingCandidates += result.holdingCandidates;
    for (const [instrument, count] of Object.entries(result.instruments)) {
      merged.instruments[instrument] = (merged.instruments[instrument] ?? 0) + count;
    }
    for (const [template, count] of Object.entries(result.templates)) {
      merged.templates[template] = (merged.templates[template] ?? 0) + count;
    }
  }

  merged.contractIds = uniqueStrings(merged.contractIds);
  return merged;
}

function firstSummaryKeys(summary: Record<string, number>, max = 5): string[] {
  return Object.entries(summary)
    .sort(([, left], [, right]) => right - left)
    .slice(0, max)
    .map(([key, count]) => `${key} (${count})`);
}

async function getPrimaryHoldingContractIds(
  p: RequestingProvider,
  ownerPartyId: string,
  instrumentId = '',
  instrumentAdmin = '',
): Promise<string[]> {
  const ledgerEndPayload = await dappLedgerApiJSON(p, 'GET', '/v2/state/ledger-end');
  const offset = asInt(asObject(ledgerEndPayload)?.offset);
  if (offset === null || offset < 0) {
    throw new Error('Could not resolve ledger-end offset for holdings lookup');
  }

  appendDiagnosticsLog('INFO', 'holdings lookup -> probing active contracts', {
    senderPartyId: ownerPartyId,
    instrumentId: instrumentId || undefined,
    instrumentAdmin: instrumentAdmin || undefined,
    ledgerEndOffset: offset,
  });

  const lookupResults: HoldingLookupResult[] = [];
  for (const mode of ['holding-interface', 'wildcard'] as const) {
    try {
      const activeContractsPayload = await dappLedgerApiJSON(
        p,
        'POST',
        '/v2/state/active-contracts',
        buildActiveContractsBody(ownerPartyId, offset, mode),
      );
      const lookupResult = extractHoldingContractIdsFromActiveContracts(
        activeContractsPayload,
        ownerPartyId,
        instrumentId,
        instrumentAdmin,
      );
      appendDiagnosticsLog('INFO', 'holdings lookup -> active-contracts response', {
        mode,
        ...summarizeActiveContractsPayload(activeContractsPayload),
        extractedContracts: lookupResult.scannedContracts,
        holdingCandidates: lookupResult.holdingCandidates,
      });
      lookupResults.push(lookupResult);
      if (lookupResult.contractIds.length > 0) {
        appendLog('INFO', 'holdings lookup -> selected sender holdings', {
          instrumentId: instrumentId || undefined,
          count: lookupResult.contractIds.length,
        });
        appendDiagnosticsLog('INFO', 'holdings lookup -> selected sender holding details', {
          mode,
          sample: lookupResult.contractIds.slice(0, 3).map(shortContractId),
        });
        return lookupResult.contractIds;
      }
    } catch (err) {
      const normalized = normalizeError(err);
      appendDiagnosticsLog('INFO', 'holdings lookup -> active-contracts query failed', {
        mode,
        message: normalized.message,
      });
    }
  }

  const merged = mergeHoldingLookupResults(lookupResults);
  const assetLabel = instrumentId ? ` for ${instrumentId}` : '';
  const foundInstruments = firstSummaryKeys(merged.instruments).join(', ');
  appendLog('INFO', 'holdings lookup -> no matching sender holdings', {
    instrumentId: instrumentId || undefined,
    scannedContracts: merged.scannedContracts,
    holdingCandidates: merged.holdingCandidates,
    foundInstruments: foundInstruments || undefined,
  });
  appendDiagnosticsLog('INFO', 'holdings lookup -> no matching sender holding details', {
    instrumentId: instrumentId || undefined,
    instrumentAdmin: instrumentAdmin || undefined,
    instruments: merged.instruments,
    templates: merged.templates,
  });

  const detail = foundInstruments
    ? ` Visible holdings were for: ${foundInstruments}.`
    : (merged.scannedContracts === 0
        ? ' dApp ledgerApi returned zero active contracts for the sender party; check party selection, funding, or the wallet gateway ledgerApi proxy.'
        : ' No matching Holding contracts were visible through ledgerApi.');
  throw new Error(
    `No sender holdings${assetLabel} found.${detail} Fund the sender wallet before preparing TransferFactory_Transfer.`,
  );
}

async function getActiveNetworkId(p: RequestingProvider): Promise<string> {
  const statusResult = await getSDKStatus();
  const networkIdFromStatus = getNetworkIdFromStatusSnapshot(statusResult);
  if (networkIdFromStatus) {
    return networkIdFromStatus;
  }

  if (getCurrentProviderKind() === 'remote') {
    const remoteStatusResult = await rpcRequest<SDKStatusSnapshot>('status');
    const remoteNetworkId = getNetworkIdFromStatusSnapshot(remoteStatusResult);
    if (!remoteNetworkId) {
      throw new Error('Could not resolve networkId from remote gateway status');
    }
    return remoteNetworkId;
  }

  const network = await p.request<NetworkInfo>({ method: 'getActiveNetwork' });
  const networkId = asString(network?.networkId);
  if (!networkId) {
    throw new Error('Could not resolve networkId from getActiveNetwork');
  }
  return networkId;
}

function resetTransferFactoryDiscoveryUI(): void {
  if (!els.transferFactoryManualOverride.checked) {
    els.transferFactoryContractId.value = '';
  }
  setTransferFactoryStatus('Connect wallet, then resolve transfer context from registry.', 'info');
}

function joinUrl(base: string, path: string): string {
  const normalizedBase = base.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function isRegistryProxyEndpoint(endpoint: string): boolean {
  const normalizedEndpoint = endpoint.trim();
  if (!normalizedEndpoint) {
    return false;
  }
  if (normalizedEndpoint.startsWith(DEFAULT_REGISTRY_PROXY_BASE_PATH)) {
    return true;
  }
  const parsedEndpoint = parseUrl(normalizedEndpoint);
  if (!parsedEndpoint) {
    return false;
  }
  return parsedEndpoint.origin === window.location.origin
    && parsedEndpoint.pathname.startsWith(DEFAULT_REGISTRY_PROXY_BASE_PATH);
}

function isTokenStandardEndpoint(endpoint: string): boolean {
  const normalizedEndpoint = endpoint.trim();
  if (!normalizedEndpoint) {
    return false;
  }
  if (normalizedEndpoint.startsWith(DEFAULT_TOKEN_STANDARD_PROXY_BASE_PATH)) {
    return true;
  }
  const parsedEndpoint = parseUrl(normalizedEndpoint);
  if (!parsedEndpoint) {
    return false;
  }
  if (parsedEndpoint.origin === window.location.origin
    && parsedEndpoint.pathname.startsWith(DEFAULT_TOKEN_STANDARD_PROXY_BASE_PATH)) {
    return true;
  }
  return parsedEndpoint.hostname.endsWith('utilities.digitalasset-staging.com')
    || parsedEndpoint.hostname.endsWith('utilities.digitalasset-dev.com')
    || parsedEndpoint.hostname.endsWith('utilities.digitalasset.com')
    || parsedEndpoint.pathname.includes('/api/token-standard/');
}

function getRequiredRegistryAPIKey(): string {
  const key = els.registryApiKey.value.trim();
  if (!key) {
    throw new Error('Registry / scan API key is required. Set it in Settings before resolving transfer context.');
  }
  return key;
}

async function fetchWithAPIKey(endpoint: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  if (!isTokenStandardEndpoint(endpoint)) {
    headers.set('X-API-Key', getRequiredRegistryAPIKey());
  }
  return fetch(endpoint, {
    ...init,
    headers,
  });
}

async function fetchForRegistryDiscovery(endpoint: string, init: RequestInit): Promise<Response> {
  const normalizedEndpoint = endpoint.trim();
  const isAbsoluteEndpoint = parseUrl(normalizedEndpoint) !== null;
  if (!isAbsoluteEndpoint
    && !isRegistryProxyEndpoint(normalizedEndpoint)
    && !isTokenStandardEndpoint(normalizedEndpoint)) {
    throw new Error(
      'Relative Registry / Scan endpoints must use /api/registry-proxy or /api/token-standard. Use an absolute URL for direct endpoints.',
    );
  }
  return fetchWithAPIKey(normalizedEndpoint, init);
}

function applyResolvedTransferContext(result: ResolvedTransferContext): void {
  if (!els.transferFactoryManualOverride.checked) {
    els.transferFactoryContractId.value = result.factoryId;
  }
  els.transferContextJson.value = JSON.stringify(result.choiceContextData, null, 2);
  els.transferDisclosedJson.value = JSON.stringify(result.disclosedContracts, null, 2);
  setTransferFactoryStatus(
    `Transfer context resolved (${result.source}) via ${result.registryUrl} (${shortContractId(result.factoryId)})`,
    'ok',
  );
}

function transferContextSummary(result: ResolvedTransferContext): Record<string, unknown> {
  return {
    source: result.source,
    networkId: result.networkId,
    partyId: result.partyId,
    registryUrl: result.registryUrl,
    transferFactoryContractId: result.factoryId,
    transferKind: result.transferKind || 'unknown',
    inputHoldingCidsCount: result.inputHoldingCids.length,
    disclosedContractsCount: result.disclosedContracts.length,
  };
}

function parseTransferChoiceContext(raw: unknown): TransferChoiceContext {
  const contextObj = asObject(raw);
  if (!contextObj) {
    return { choiceContextData: { values: {} }, disclosedContracts: [] };
  }

  const choiceContextData = asObject(contextObj.choiceContextData) ?? { values: {} };
  const disclosedContractsRaw = Array.isArray(contextObj.disclosedContracts) ? contextObj.disclosedContracts : [];
  const disclosedContracts = disclosedContractsRaw
    .map((entry) => asObject(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null);
  return { choiceContextData, disclosedContracts };
}

async function discoverRegistryUrlsFromCns(scanUrl: string, adminPartyId: string): Promise<string[]> {
  const endpoint = buildScanAnsEntriesEndpoint(scanUrl, adminPartyId);
  const response = await fetchForRegistryDiscovery(endpoint, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`CNS lookup failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  const root = asObject(payload) ?? {};
  const nestedEntry = asObject(root.entry) ?? asObject(root.ansEntry) ?? {};
  const description = asString(root.description) || asString(nestedEntry.description);
  if (!description) {
    throw new Error('CNS entry description is missing');
  }

  let parsedDescription: unknown;
  try {
    parsedDescription = JSON.parse(description);
  } catch {
    throw new Error('CNS entry description is not valid JSON metadata');
  }
  const descriptionObj = asObject(parsedDescription);
  const meta = asObject(descriptionObj?.meta);
  const registryUrlsRaw = asString(meta?.[REGISTRY_URLS_META_KEY]);
  if (!registryUrlsRaw) {
    throw new Error(`CNS metadata key ${REGISTRY_URLS_META_KEY} not found`);
  }

  return registryUrlsRaw
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
}

async function resolveRegistryUrl(
  networkId: string,
  instrumentAdmin: string,
  instrumentId: string,
): Promise<RegistryResolution> {
  const fromInput = els.registryUrl.value.trim();
  if (fromInput) {
    rememberRegistryUrlForNetwork(networkId, fromInput, instrumentAdmin, instrumentId);
    return {
      registryUrl: fromInput,
      source: 'manual',
    };
  }

  const configured = getConfiguredRegistryUrl(networkId, instrumentAdmin, { instrumentId });
  if (configured) {
    els.registryUrl.value = configured;
    rememberRegistryUrlForNetwork(networkId, configured, instrumentAdmin, instrumentId);
    return {
      registryUrl: configured,
      source: findAssetPreset(networkId, instrumentAdmin, instrumentId) ? 'asset-config' : 'network-config',
    };
  }

  const scanUrl = els.scanUrl.value.trim();
  if (scanUrl && instrumentAdmin) {
    const discovered = await discoverRegistryUrlsFromCns(scanUrl, instrumentAdmin);
    if (discovered.length > 0) {
      els.registryUrl.value = discovered[0];
      rememberRegistryUrlForNetwork(networkId, discovered[0], instrumentAdmin, instrumentId);
      return {
        registryUrl: discovered[0],
        source: 'cns',
      };
    }
  }

  throw new Error(
    'Registry URL is required. Set Registry URL directly, configure VITE_REGISTRY_URLS_JSON/VITE_TOKEN_REGISTRY_URL, or provide Scan URL + Instrument Admin for CNS lookup.',
  );
}

function buildTransferFactoryChoiceArguments(
  senderPartyId: string,
  transferInput: {
    toParty: string;
    amount: string;
    inputHoldingCids: string[];
    instrumentId: string;
    instrumentAdmin: string;
    expectedAdmin: string;
  },
): Record<string, unknown> {
  const requestedAtISO = new Date().toISOString();
  const executeBeforeISO = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  return {
    expectedAdmin: transferInput.expectedAdmin,
    transfer: {
      sender: senderPartyId,
      receiver: transferInput.toParty,
      amount: transferInput.amount,
      instrumentId: {
        admin: transferInput.instrumentAdmin,
        id: transferInput.instrumentId,
      },
      requestedAt: requestedAtISO,
      executeBefore: executeBeforeISO,
      inputHoldingCids: transferInput.inputHoldingCids,
      meta: {
        values: {},
      },
    },
    extraArgs: {
      context: {
        values: {},
      },
      meta: {
        values: {},
      },
    },
  };
}

async function fetchRegistryAdminId(registryUrl: string): Promise<string> {
  const endpoint = joinUrl(registryUrl, '/registry/metadata/v1/info');
  let response: Response;
  try {
    response = await fetchForRegistryDiscovery(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes('failed to fetch')) {
      throw new Error(
        `Registry fetch failed at network layer for ${endpoint}. Ensure /api/registry-proxy is active and SCAN_PROXY_BACKEND_URL is reachable (default https://sp-lat-dn.cddev.site).`,
      );
    }
    throw err;
  }
  if (!response.ok) {
    const body = await response.text();
    throw {
      message: `Registry info lookup failed: HTTP ${response.status}`,
      code: response.status,
      data: body,
    } satisfies ErrorLike;
  }
  const payload = (await response.json()) as unknown;
  const obj = asObject(payload);
  const adminId = asString(obj?.adminId);
  if (!adminId) {
    throw new Error('Registry info response missing adminId');
  }
  return adminId;
}

async function fetchTransferContextFromRegistry(
  registryUrl: string,
  choiceArguments: Record<string, unknown>,
): Promise<{ factoryId: string; transferKind?: string; context: TransferChoiceContext }> {
  const endpoint = joinUrl(registryUrl, '/registry/transfer-instruction/v1/transfer-factory');
  let response: Response;
  try {
    response = await fetchForRegistryDiscovery(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        choiceArguments,
        excludeDebugFields: true,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes('failed to fetch')) {
      throw new Error(
        `Registry fetch failed at network layer for ${endpoint}. Ensure /api/registry-proxy is active, SCAN_PROXY_BACKEND_URL is reachable, and your Registry / Scan API key is correct.`,
      );
    }
    throw err;
  }

  if (!response.ok) {
    const body = await response.text();
    throw {
      message: `Registry transfer-factory lookup failed: HTTP ${response.status}`,
      code: response.status,
      data: body,
    } satisfies ErrorLike;
  }

  const payload = (await response.json()) as TransferFactoryRegistryResponse;
  const factoryId = asString(payload.factoryId);
  if (!factoryId) {
    throw new Error('Registry response missing factoryId');
  }
  const transferKind = asString(payload.transferKind) || undefined;
  const context = parseTransferChoiceContext(payload.choiceContext);
  return { factoryId, transferKind, context };
}

async function resolveTransferFactoryContext(
  p: RequestingProvider,
  transferInput: Pick<
    TransferHelperInput,
    'toParty' | 'amount' | 'inputHoldingCids' | 'instrumentId' | 'instrumentAdmin' | 'expectedAdmin'
  >,
  forceRefresh: boolean,
): Promise<ResolvedTransferContext> {
  const networkId = await getActiveNetworkId(p);
  const partyId = await getPrimaryAccountPartyId(p);
  const senderPartyId = partyId;
  const requestedInstrumentAdmin = transferInput.instrumentAdmin || transferInput.expectedAdmin || '';
  const inputHoldingCids =
    transferInput.inputHoldingCids.length > 0
      ? uniqueStrings(transferInput.inputHoldingCids)
      : await getPrimaryHoldingContractIds(
        p,
        senderPartyId,
        transferInput.instrumentId,
        requestedInstrumentAdmin,
      );
  const { registryUrl } = await resolveRegistryUrl(networkId, requestedInstrumentAdmin, transferInput.instrumentId);

  let expectedAdmin = transferInput.expectedAdmin || '';
  let instrumentAdmin = transferInput.instrumentAdmin || '';
  if (!expectedAdmin || !instrumentAdmin) {
    const adminId = await fetchRegistryAdminId(registryUrl);
    expectedAdmin = expectedAdmin || adminId;
    instrumentAdmin = instrumentAdmin || adminId;
    if (!els.transferExpectedAdmin.value.trim()) {
      els.transferExpectedAdmin.value = expectedAdmin;
    }
    if (!els.transferInstrumentAdmin.value.trim()) {
      els.transferInstrumentAdmin.value = instrumentAdmin;
    }
  }

  if (!expectedAdmin || !instrumentAdmin) {
    throw new Error('Could not resolve expected admin/instrument admin from input or registry info.');
  }

  const cacheKey = transferContextCacheKey(
    networkId,
    partyId,
    registryUrl,
    senderPartyId,
    transferInput.toParty,
    transferInput.amount,
    instrumentAdmin,
    transferInput.instrumentId,
  );

  if (!forceRefresh) {
    const cached = loadTransferContextCacheEntry(cacheKey);
    if (cached) {
      const cacheResult: ResolvedTransferContext = {
        ...cached,
        inputHoldingCids,
        source: 'cache',
      };
      applyResolvedTransferContext(cacheResult);
      return cacheResult;
    }
  }

  const choiceArguments = buildTransferFactoryChoiceArguments(senderPartyId, {
    toParty: transferInput.toParty,
    amount: transferInput.amount,
    inputHoldingCids,
    instrumentId: transferInput.instrumentId,
    instrumentAdmin,
    expectedAdmin,
  });
  const registryResult = await fetchTransferContextFromRegistry(registryUrl, choiceArguments);
  const result: ResolvedTransferContext = {
    source: 'registry',
    networkId,
    partyId,
    registryUrl,
    factoryId: registryResult.factoryId,
    ...(registryResult.transferKind ? { transferKind: registryResult.transferKind } : {}),
    inputHoldingCids,
    choiceContextData: registryResult.context.choiceContextData,
    disclosedContracts: registryResult.context.disclosedContracts,
  };

  saveTransferContextCacheEntry(cacheKey, {
    ...result,
    updatedAt: Date.now(),
  });

  applyResolvedTransferContext(result);
  return result;
}

async function tryAutoConfigureRegistryUrl(p: RequestingProvider): Promise<void> {
  try {
    const networkId = await getActiveNetworkId(p);
    const normalizedNetworkId = normalizeNetworkId(networkId);
    if (els.networkPreset.value !== normalizedNetworkId) {
      applyNetworkPreset(normalizedNetworkId, true);
    }
    const asset = getSelectedAssetPreset();
    const configured = getConfiguredRegistryUrl(
      normalizedNetworkId,
      asset?.instrumentAdmin || els.transferInstrumentAdmin.value.trim(),
      { instrumentId: asset?.instrumentId || els.transferInstrumentId.value.trim() },
    );
    if (!configured) {
      setTransferFactoryStatus(
        'No configured registry URL for this network. Set Registry URL or provide Scan URL + Instrument Admin.',
        'warn',
      );
      return;
    }
    els.registryUrl.value = configured;
    rememberRegistryUrlForNetwork(
      normalizedNetworkId,
      configured,
      asset?.instrumentAdmin || els.transferInstrumentAdmin.value.trim(),
      asset?.instrumentId || els.transferInstrumentId.value.trim(),
    );
    setTransferFactoryStatus(`Registry URL configured for ${normalizedNetworkId}: ${configured}`, 'ok');
    appendLog('INFO', 'connect -> registry URL configured', { networkId: normalizedNetworkId, registryUrl: configured });
  } catch (err) {
    const normalized = normalizeError(err);
    setTransferFactoryStatus(normalized.message, 'warn');
    appendLog('INFO', 'connect -> registry URL auto-config skipped', { reason: normalized.message });
  }
}

type TransferHelperInput = {
  toParty: string;
  amount: string;
  inputHoldingCids: string[];
  instrumentId: string;
  instrumentAdmin?: string;
  factoryContractId?: string;
  factoryTemplateId: string;
  expectedAdmin?: string;
  contextData: Record<string, unknown>;
  disclosedContracts: Record<string, unknown>[];
};

function parseContextJSONInput(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return { values: {} };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('extraArgs.context JSON must be valid JSON');
  }
  const obj = asObject(parsed);
  if (!obj) {
    throw new Error('extraArgs.context JSON must be an object');
  }
  return obj;
}

function parseDisclosedContractsJSONInput(raw: string): Record<string, unknown>[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('disclosedContracts JSON must be valid JSON');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('disclosedContracts JSON must be an array');
  }
  return parsed
    .map((entry) => asObject(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null);
}

function normalizeTemplateIdForExercise(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('#')) return trimmed;

  // Package-name identifiers in JSON API commands should be prefixed with '#'.
  if (trimmed.startsWith('splice-')) {
    return `#${trimmed}`;
  }

  // Full package hash identifiers can be used directly.
  return trimmed;
}

function parseTransferHelperInput(): TransferHelperInput {
  const toParty = els.transferToParty.value.trim();
  if (!toParty) {
    throw new Error('Recipient party ID is required');
  }

  const amount = els.transferAmount.value.trim();
  if (!/^\d+(\.\d+)?$/.test(amount) || Number.parseFloat(amount) <= 0) {
    throw new Error('Amount must be a positive decimal value');
  }
  const factoryContractId = els.transferFactoryContractId.value.trim() || undefined;
  const factoryTemplateId = normalizeTemplateIdForExercise(
    els.transferFactoryTemplateId.value.trim() || TRANSFER_FACTORY_TEMPLATE_ID,
  );
  if (!factoryTemplateId) {
    throw new Error('Transfer factory template ID is required');
  }
  els.transferFactoryTemplateId.value = factoryTemplateId;

  const expectedAdmin = els.transferExpectedAdmin.value.trim() || els.transferInstrumentAdmin.value.trim() || undefined;
  const instrumentId = els.transferInstrumentId.value.trim() || 'Amulet';
  const instrumentAdmin = els.transferInstrumentAdmin.value.trim() || expectedAdmin;
  const contextData = parseContextJSONInput(els.transferContextJson.value);
  const disclosedContracts = parseDisclosedContractsJSONInput(els.transferDisclosedJson.value);

  return {
    toParty,
    amount,
    inputHoldingCids: [],
    instrumentId,
    ...(instrumentAdmin ? { instrumentAdmin } : {}),
    factoryContractId,
    factoryTemplateId,
    ...(expectedAdmin ? { expectedAdmin } : {}),
    contextData,
    disclosedContracts,
  };
}

async function getPrimaryAccountPartyId(p: RequestingProvider): Promise<string> {
  const account = await getPrimaryAccount(p);
  const partyId = account.partyId;
  if (!partyId) {
    throw new Error('Could not resolve partyId from getPrimaryAccount');
  }
  return partyId;
}

async function getPrimaryAccount(p: RequestingProvider): Promise<AccountSummary> {
  const account = await p.request<Record<string, unknown>>({ method: 'getPrimaryAccount' });
  return summarizeAccount(account);
}

function summarizeAccount(value: unknown): AccountSummary {
  const account = asObject(value) ?? {};
  const summary: AccountSummary = {
    partyId: asString(account.partyId),
  };
  if (typeof account.primary === 'boolean') {
    summary.primary = account.primary;
  }
  const hint = asString(account.hint);
  if (hint) {
    summary.hint = hint;
  }
  const networkId = asString(account.networkId);
  if (networkId) {
    summary.networkId = networkId;
  }
  const signingProviderId = asString(account.signingProviderId);
  if (signingProviderId) {
    summary.signingProviderId = signingProviderId;
  }
  return summary;
}

function summarizeAccounts(value: unknown): AccountSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(summarizeAccount).filter((account) => account.partyId);
}

async function getAccountConnectionSummary(p: RequestingProvider): Promise<AccountConnectionSummary> {
  const primaryAccount = await getPrimaryAccount(p);
  let accounts: AccountSummary[] = [];
  try {
    accounts = summarizeAccounts(await listAccounts());
  } catch (err) {
    appendLog('INFO', 'connect -> listAccounts summary skipped', { reason: normalizeError(err).message });
  }
  return {
    primaryAccount,
    accountCount: accounts.length,
    accountPartyIds: accounts.map((account) => account.partyId),
  };
}

function buildTransferPrepareExecutePayload(
  senderPartyId: string,
  transferInput: TransferHelperInput,
  transferFactoryContractId: string,
): Record<string, unknown> {
  const requestedAtISO = new Date().toISOString();
  const executeBeforeISO = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  return {
    commandId: crypto.randomUUID(),
    commands: [
      {
        ExerciseCommand: {
          templateId: transferInput.factoryTemplateId,
          contractId: transferFactoryContractId,
          choice: 'TransferFactory_Transfer',
          choiceArgument: {
            expectedAdmin: transferInput.expectedAdmin,
            transfer: {
              sender: senderPartyId,
              receiver: transferInput.toParty,
              amount: transferInput.amount,
              instrumentId: {
                admin: transferInput.instrumentAdmin,
                id: transferInput.instrumentId,
              },
              requestedAt: requestedAtISO,
              executeBefore: executeBeforeISO,
              inputHoldingCids: transferInput.inputHoldingCids,
              meta: {
                values: {},
              },
            },
            extraArgs: {
              context: transferInput.contextData,
              meta: {
                values: {},
              },
            },
          },
        },
      },
    ],
    disclosedContracts: transferInput.disclosedContracts,
  };
}

function isTransferFactoryCommandPayload(params: Record<string, unknown>): boolean {
  const commandsValue = params.commands;
  if (!Array.isArray(commandsValue)) return false;
  return commandsValue.some((command) => {
    const commandObj = asObject(command);
    if (!commandObj) return false;
    const exercise = asObject(commandObj.ExerciseCommand);
    if (!exercise) return false;
    return asString(exercise.choice) === 'TransferFactory_Transfer';
  });
}

function normalizeTransferFactoryTemplateInParams(params: Record<string, unknown>): void {
  const commandsValue = params.commands;
  if (!Array.isArray(commandsValue)) return;
  let changed = false;

  for (const command of commandsValue) {
    const commandObj = asObject(command);
    if (!commandObj) continue;
    const exercise = asObject(commandObj.ExerciseCommand);
    if (!exercise) continue;
    if (asString(exercise.choice) !== 'TransferFactory_Transfer') continue;
    const rawTemplateId = asString(exercise.templateId);
    const normalizedTemplateId = normalizeTemplateIdForExercise(rawTemplateId);
    if (!normalizedTemplateId || normalizedTemplateId === rawTemplateId) continue;
    exercise.templateId = normalizedTemplateId;
    changed = true;
  }

  if (changed) {
    els.commandsJson.value = JSON.stringify(params, null, 2);
    appendLog('INFO', 'prepareExecute -> normalized TransferFactory templateId in commands JSON');
  }
}

async function ensureTransferFactoryInputHoldingCids(
  p: RequestingProvider,
  params: Record<string, unknown>,
): Promise<void> {
  const commandsValue = params.commands;
  if (!Array.isArray(commandsValue)) return;

  const transferPayloadsNeedingHoldings: Record<string, unknown>[] = [];

  for (const command of commandsValue) {
    const commandObj = asObject(command);
    if (!commandObj) continue;
    const exercise = asObject(commandObj.ExerciseCommand);
    if (!exercise || asString(exercise.choice) !== 'TransferFactory_Transfer') continue;
    const choiceArgument = asObject(exercise.choiceArgument);
    const transfer = asObject(choiceArgument?.transfer);
    if (!transfer) continue;

    const rawHoldingCids = Array.isArray(transfer.inputHoldingCids) ? transfer.inputHoldingCids : [];
    const existingHoldingCids = uniqueStrings(rawHoldingCids.map((value) => asString(value)));
    if (existingHoldingCids.length > 0) {
      transfer.inputHoldingCids = existingHoldingCids;
      continue;
    }

    transferPayloadsNeedingHoldings.push(transfer);
  }

  if (transferPayloadsNeedingHoldings.length === 0) {
    return;
  }

  const senderPartyId = await getPrimaryAccountPartyId(p);
  let injectedCount = 0;
  const sampleHoldingCids: string[] = [];
  for (const transfer of transferPayloadsNeedingHoldings) {
    const transferInstrument = asObject(transfer.instrumentId);
    const holdingContractIds = await getPrimaryHoldingContractIds(
      p,
      senderPartyId,
      asString(transferInstrument?.id),
      asString(transferInstrument?.admin),
    );
    transfer.inputHoldingCids = holdingContractIds;
    injectedCount += holdingContractIds.length;
    sampleHoldingCids.push(...holdingContractIds.slice(0, 3));
  }

  els.commandsJson.value = JSON.stringify(params, null, 2);
  appendLog('INFO', 'prepareExecute -> injected sender inputHoldingCids', {
    senderPartyId,
    count: injectedCount,
    sample: sampleHoldingCids.slice(0, 3),
  });
}

function isLikelyStaleTransferFactoryError(err: unknown): boolean {
  const normalized = normalizeError(err);
  const body = `${normalized.message}\n${stringify(normalized.details)}`.toLowerCase();
  return (
    body.includes('contract') &&
    (body.includes('not found') ||
      body.includes('unknown') ||
      body.includes('archiv') ||
      body.includes('inactive') ||
      body.includes('no such'))
  );
}

async function maybeRefreshTransferFactoryAfterFailure(
  p: RequestingProvider,
  params: Record<string, unknown>,
  err: unknown,
): Promise<boolean> {
  if (!isTransferFactoryCommandPayload(params)) return false;
  if (!isLikelyStaleTransferFactoryError(err)) return false;
  if (els.transferFactoryManualOverride.checked) return false;

  const senderPartyId = await getPrimaryAccountPartyId(p);
  const transferInput = parseTransferHelperInput();
  const resolved = await resolveTransferFactoryContext(p, transferInput, true);
  const payload = buildTransferPrepareExecutePayload(senderPartyId, {
    ...transferInput,
    inputHoldingCids: resolved.inputHoldingCids,
    contextData: resolved.choiceContextData,
    disclosedContracts: resolved.disclosedContracts,
  }, resolved.factoryId);
  const existingCommandId = asString(params.commandId);
  if (existingCommandId) {
    payload.commandId = existingCommandId;
  }

  params.commandId = payload.commandId;
  params.commands = payload.commands;
  params.disclosedContracts = payload.disclosedContracts;
  els.commandsJson.value = JSON.stringify(params, null, 2);

  appendLog('INFO', 'prepareExecute -> refreshed transfer context after stale contract error', transferContextSummary(resolved));
  return true;
}

function parsePendingApprovalData(data: unknown): { userUrl?: string; status?: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }
  const obj = data as Record<string, unknown>;
  const userUrl = typeof obj.userUrl === 'string' ? obj.userUrl : undefined;
  const status = typeof obj.status === 'string' ? obj.status : undefined;
  return { userUrl, status };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function ensureCommandId(params: Record<string, unknown>): string {
  const existingCommandId = asString(params.commandId);
  if (existingCommandId) {
    return existingCommandId;
  }

  const generatedCommandId = crypto.randomUUID();
  params.commandId = generatedCommandId;
  els.commandsJson.value = JSON.stringify(params, null, 2);
  return generatedCommandId;
}

function waitForTxResult(
  p: RequestingProvider,
  commandId: string,
  timeoutMs: number = TX_WAIT_TIMEOUT_MS,
): { promise: Promise<{ tx: TxChangedEvent }>; cleanup: () => void } {
  let settled = false;
  let resolvePromise: (value: { tx: TxChangedEvent }) => void = () => {};
  let rejectPromise: (reason?: unknown) => void = () => {};

  const listener = (event: TxChangedEvent): void => {
    if (settled) return;
    if (!event || typeof event !== 'object') return;
    if (event.commandId !== commandId) return;

    if (event.status === 'failed') {
      settled = true;
      cleanup();
      rejectPromise({
        message: `Transaction ${commandId} failed`,
        code: -32003,
        data: event,
      } satisfies ErrorLike);
      return;
    }

    if (event.status === 'executed') {
      settled = true;
      cleanup();
      resolvePromise({ tx: event });
    }
  };

  const timeout = window.setTimeout(() => {
    if (settled) return;
    settled = true;
    cleanup();
    rejectPromise(new Error(`Timed out waiting for txChanged for commandId ${commandId}`));
  }, timeoutMs);

  const cleanup = (): void => {
    clearTimeout(timeout);
    p.removeListener('txChanged', listener);
  };

  const promise = new Promise<{ tx: TxChangedEvent }>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  p.on('txChanged', listener);

  return { promise, cleanup };
}

async function prepareExecuteAndWaitRemote(
  p: RequestingProvider,
  params: Record<string, unknown>,
): Promise<{ tx: TxChangedEvent }> {
  const commandId = ensureCommandId(params);
  const waiter = waitForTxResult(p, commandId);

  try {
    await prepareExecute(toPrepareExecuteParams(params));
    return await waiter.promise;
  } catch (err) {
    waiter.cleanup();
    throw err;
  }
}

async function prepareExecuteRemoteWithLogging(
  params: Record<string, unknown>,
): Promise<null> {
  try {
    const response = await rpcRequest<unknown>('prepareExecute', params);
    appendLog('INFO', 'prepareExecute -> raw remote response', response);
    if (response && typeof response === 'object' && !Array.isArray(response)) {
      const userUrl = asString((response as Record<string, unknown>).userUrl);
      if (userUrl) {
        openUserUrl(userUrl);
      }
    }
    return null;
  } catch (err) {
    appendLog('INFO', 'prepareExecute -> raw remote error', err);
    throw err;
  }
}

async function signMessageRemoteWithApproval(message: string): Promise<Record<string, unknown>> {
  // The SDK exposes signMessage(), but the remote provider path does not surface
  // pending-approval userUrl data, so the sandbox still bridges directly here.
  try {
    return await rpcRequest<Record<string, unknown>>('signMessage', { message });
  } catch (initialErr) {
    const first = initialErr as ErrorLike;
    const firstPending = parsePendingApprovalData(first.data);
    const isPendingApproval = first.code === -32002 && firstPending.status === 'pending';
    if (!isPendingApproval || !firstPending.userUrl) {
      throw initialErr;
    }

    openUserUrl(firstPending.userUrl);
    const deadline = Date.now() + SIGN_MESSAGE_WAIT_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await sleep(SIGN_MESSAGE_POLL_INTERVAL_MS);
      try {
        return await rpcRequest<Record<string, unknown>>('signMessage', { message });
      } catch (pollErr) {
        const poll = pollErr as ErrorLike;
        const pollPending = parsePendingApprovalData(poll.data);
        if (poll.code === -32002 && pollPending.status === 'pending') {
          continue;
        }
        throw pollErr;
      }
    }

    throw new Error('Timed out waiting for signMessage approval');
  }
}

els.networkPreset.addEventListener('change', () => {
  try {
    applyNetworkPreset(els.networkPreset.value, true);
    appendLog('OK', 'settings -> applied network preset', {
      networkId: getSelectedNetworkId(),
      asset: els.transferAsset.value,
      remoteUrl: els.remoteUrl.value.trim(),
      registryUrl: els.registryUrl.value.trim(),
      scanUrl: els.scanUrl.value.trim(),
    });
  } catch (err) {
    const normalized = normalizeError(err);
    appendLog('ERR', 'settings -> failed to apply network preset', normalized);
  }
});

els.walletDomain.addEventListener('change', applyDomainSettingsFromInputs);
els.devnetRegistryDomain.addEventListener('change', applyDomainSettingsFromInputs);
els.remoteUrl.addEventListener('change', syncWalletIdentityPreview);
els.remoteUrl.addEventListener('input', syncWalletIdentityPreview);

els.transferAsset.addEventListener('change', () => {
  applySelectedAssetPreset({ overwriteRegistryUrl: true });
  const asset = getSelectedAssetPreset();
  appendLog('INFO', 'transfer helper -> asset selected', {
    networkId: getSelectedNetworkId(),
    asset: asset?.assetId,
    instrumentId: asset?.instrumentId,
    instrumentAdmin: asset?.instrumentAdmin || undefined,
    registryUrl: els.registryUrl.value.trim(),
  });
});

els.openWallet.addEventListener('click', () => {
  if (getCurrentProviderKind() === 'remote') {
    primeWalletPopupForSafari('open');
  }
  void run('open', async () => {
    ensureProvider();
    await open();
    return { opened: true, via: 'sdk-open' };
  });
});

els.connect.addEventListener('click', () => {
  const useSafariDirectRemoteConnect = shouldUseSafariDirectRemoteConnect();
  if (useSafariDirectRemoteConnect) {
    primeWalletPopupForSafari('connect');
  }
  void run('connect', async () => {
    if (getCurrentProviderKind() === 'remote' || useSafariDirectRemoteConnect) {
      (window as Window & { canton?: RequestingProvider }).canton = undefined;
    }
    const result = useSafariDirectRemoteConnect
      ? await connectSafariRemoteDirect()
      : await connectWithSDKPicker();
    const p = ensureProvider();
    eventsSubscribed = false;
    resetTransferFactoryDiscoveryUI();
    await tryAutoConfigureRegistryUrl(p);
    const accountSummary = await getAccountConnectionSummary(p);
    renderConnectedAccount(accountSummary);
    appendLog('INFO', 'connect -> active account', accountSummary);
    return {
      ...(asObject(result) ?? {}),
      picker: !useSafariDirectRemoteConnect,
      connectFlow: useSafariDirectRemoteConnect ? 'safari-direct-remote' : 'sdk-picker',
      preferredGateway: els.remoteUrl.value.trim() || undefined,
      activePartyId: accountSummary.primaryAccount.partyId,
      accountCount: accountSummary.accountCount,
    };
  });
});

els.disconnect.addEventListener('click', () => {
  void run('disconnect', async () => {
    try {
      return await disconnect();
    } finally {
      setSDKSingletonClientForSafariRemote(null);
      clearPersistedWalletSessionState();
      eventsSubscribed = false;
      resetTransferFactoryDiscoveryUI();
      renderConnectedAccount(null);
    }
  });
});

els.status.addEventListener('click', () => {
  void run('status', async () => {
    ensureProvider();
    return status();
  });
});

els.listAccounts.addEventListener('click', () => {
  void run('listAccounts', async () => {
    ensureProvider();
    return listAccounts();
  });
});

els.getPrimaryAccount.addEventListener('click', () => {
  void run('getPrimaryAccount', async () => {
    const provider = ensureProvider();
    const account = await getPrimaryAccount(provider);
    renderConnectedAccount({
      primaryAccount: account,
      accountCount: 0,
      accountPartyIds: account.partyId ? [account.partyId] : [],
    });
    return account;
  });
});

els.signMessage.addEventListener('click', () => {
  if (getCurrentProviderKind() === 'remote') {
    primeWalletPopupForSafari('signMessage');
  }
  void run('signMessage', async () => {
    const provider = ensureProvider();
    const message = els.message.value;
    if (getCurrentProviderKind() === 'remote') {
      return signMessageRemoteWithApproval(message);
    }
    return provider.request({
      method: 'signMessage',
      params: { message },
    });
  });
});

els.transferFactoryManualOverride.addEventListener('change', () => {
  setTransferFactoryManualMode(els.transferFactoryManualOverride.checked);
});

els.discoverTransferFactory.addEventListener('click', () => {
  void run('discoverTransferFactory', async () => {
    const p = ensureProvider();
    const transferInput = parseTransferHelperInput();
    const resolved = await resolveTransferFactoryContext(p, transferInput, false);
    return transferContextSummary(resolved);
  });
});

els.refreshTransferFactory.addEventListener('click', () => {
  void run('refreshTransferFactory', async () => {
    const p = ensureProvider();
    const transferInput = parseTransferHelperInput();
    const resolved = await resolveTransferFactoryContext(p, transferInput, true);
    return transferContextSummary(resolved);
  });
});

els.prefillTransferCommand.addEventListener('click', () => {
  void run('prefillTransferCommand', async () => {
    const p = ensureProvider();
    const senderPartyId = await getPrimaryAccountPartyId(p);
    const transferInput = parseTransferHelperInput();
    transferInput.inputHoldingCids = await getPrimaryHoldingContractIds(
      p,
      senderPartyId,
      transferInput.instrumentId,
      transferInput.instrumentAdmin || transferInput.expectedAdmin || '',
    );
    let resolved: ResolvedTransferContext | null = null;

    if (!els.transferFactoryManualOverride.checked) {
      resolved = await resolveTransferFactoryContext(p, transferInput, false);
      transferInput.factoryContractId = resolved.factoryId;
      transferInput.inputHoldingCids = resolved.inputHoldingCids;
      transferInput.contextData = resolved.choiceContextData;
      transferInput.disclosedContracts = resolved.disclosedContracts;
    }

    const transferFactoryContractId = transferInput.factoryContractId;
    if (!transferFactoryContractId) {
      throw new Error(
        'Transfer factory contract ID is required. Resolve context first, or enable manual mode and enter it explicitly.',
      );
    }

    const payload = buildTransferPrepareExecutePayload(senderPartyId, transferInput, transferFactoryContractId);
    els.commandsJson.value = JSON.stringify(payload, null, 2);
    return {
      senderPartyId,
      transferFactoryContractId,
      expectedAdmin: transferInput.expectedAdmin,
      inputHoldingCidsCount: transferInput.inputHoldingCids.length,
      disclosedContractsCount: transferInput.disclosedContracts.length,
      ...(resolved ? { registryUrl: resolved.registryUrl, transferKind: resolved.transferKind || 'unknown' } : {}),
      commandId: payload.commandId,
    };
  });
});

els.prepareExecute.addEventListener('click', () => {
  if (getCurrentProviderKind() === 'remote') {
    primeWalletPopupForSafari('prepareExecute');
  }
  void run('prepareExecute', async () => {
    const p = ensureProvider();
    const params = parseCommandParamsInput();
    normalizeTransferFactoryTemplateInParams(params);
    await ensureTransferFactoryInputHoldingCids(p, params);
    try {
      if (getCurrentProviderKind() === 'remote') {
        return await prepareExecuteRemoteWithLogging(params);
      }
      return await prepareExecute(toPrepareExecuteParams(params));
    } catch (err) {
      const refreshed = await maybeRefreshTransferFactoryAfterFailure(p, params, err);
      if (!refreshed) throw err;
      if (getCurrentProviderKind() === 'remote') {
        return prepareExecuteRemoteWithLogging(params);
      }
      return prepareExecute(toPrepareExecuteParams(params));
    }
  });
});

els.prepareExecuteAndWait.addEventListener('click', () => {
  if (getCurrentProviderKind() === 'remote') {
    primeWalletPopupForSafari('prepareExecuteAndWait');
  }
  void run('prepareExecuteAndWait', async () => {
    const p = ensureProvider();
    const params = parseCommandParamsInput();
    normalizeTransferFactoryTemplateInParams(params);
    await ensureTransferFactoryInputHoldingCids(p, params);
    try {
      if (getCurrentProviderKind() === 'remote') {
        return await prepareExecuteAndWaitRemote(p, params);
      }
      return await prepareExecuteAndWait(toPrepareExecuteParams(params));
    } catch (err) {
      const refreshed = await maybeRefreshTransferFactoryAfterFailure(p, params, err);
      if (!refreshed) throw err;
      if (getCurrentProviderKind() === 'remote') {
        return prepareExecuteAndWaitRemote(p, params);
      }
      return prepareExecuteAndWait(toPrepareExecuteParams(params));
    }
  });
});

els.ledgerVersion.addEventListener('click', () => {
  void run('ledgerApi(/v2/version)', async () => {
    ensureProvider();
    const result = await ledgerApi({
      requestMethod: 'get',
      resource: '/v2/version',
    });

    try {
      return {
        raw: result,
        parsed: JSON.parse(result.response),
      };
    } catch {
      return result;
    }
  });
});

els.subscribeEvents.addEventListener('click', () => {
  if (eventsSubscribed) {
    appendLog('INFO', 'Event listeners already registered');
    return;
  }

  void run('subscribeEvents', async () => {
    ensureProvider();

    await onStatusChanged((event) => {
      appendLog('INFO', 'event: statusChanged', event);
      void refreshConnectedAccountPreview();
    });
    await onAccountsChanged((event) => {
      appendLog('INFO', 'event: accountsChanged', event);
      void refreshConnectedAccountPreview();
    });
    await onTxChanged((event) => {
      appendLog('INFO', 'event: txChanged', event);
    });

    eventsSubscribed = true;
    return { subscribed: true };
  });
});

els.clearLog.addEventListener('click', () => {
  logEntries.length = 0;
  els.log.textContent = '';
});

setTransferFactoryManualMode(false);
resetTransferFactoryDiscoveryUI();
els.transferAdvanced.open = false;
setupPaneHeightSync();
syncWalletIdentityPreview();
void refreshConnectedAccountPreview();

appendLog('INFO', 'Ready. Click connect() to open the wallet picker.', {
  defaultRemoteUrl,
  preferredGateway: els.remoteUrl.value.trim(),
});
