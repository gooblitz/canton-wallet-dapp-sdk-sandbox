import {
  connect,
  injectProvider,
  ledgerApi,
  listAccounts,
  onAccountsChanged,
  onStatusChanged,
  onTxChanged,
  open,
  prepareExecute,
  prepareExecuteAndWait,
  status,
} from '@canton-network/dapp-sdk';
import './styles.css';

type RequestingProvider = {
  request<T>(payload: { method: string; params?: Record<string, unknown> | unknown[] }): Promise<T>;
  on<T>(event: string, listener: (event: T) => void): RequestingProvider;
  removeListener<T>(event: string, listener: (event: T) => void): RequestingProvider;
};

type ErrorLike = {
  message?: string;
  code?: number;
  data?: unknown;
  cause?: unknown;
};

type KernelSession = {
  session?: {
    accessToken?: string;
  };
  accessToken?: string;
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

type RegistryDiscoverySource = 'manual' | 'network-config' | 'cns';

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
  // Legacy key kept for backward compatibility with existing localStorage.
  devnetRegistryDomain?: string;
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

function qs<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

const els = {
  walletType: qs<HTMLSelectElement>('#walletType'),
  walletDomain: qs<HTMLInputElement>('#walletDomain'),
  devnetRegistryDomain: qs<HTMLInputElement>('#devnetRegistryDomain'),
  registryApiKey: qs<HTMLInputElement>('#registryApiKey'),
  remoteUrl: qs<HTMLInputElement>('#remoteUrl'),
  message: qs<HTMLInputElement>('#message'),
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
  injectProvider: qs<HTMLButtonElement>('#injectProvider'),
  openWallet: qs<HTMLButtonElement>('#openWallet'),
  connect: qs<HTMLButtonElement>('#connect'),
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
const DEFAULT_DEVNET_REGISTRY_DOMAIN = 'https://sp-lat-dn.cddev.site';
const DEFAULT_SCAN_PROXY_BASE_PATH = '/v0/scan-proxy';
const DEFAULT_REGISTRY_PROXY_BASE_PATH = '/api/registry-proxy';
const DOMAIN_SETTINGS_STORAGE_KEY = 'local_dapp_domain_settings_v1';
const REGISTRY_URLS_STORAGE_KEY = 'local_dapp_registry_urls_v1';
const REGISTRY_URLS_META_KEY = 'splice.lfdecentralizedtrust.org/registryUrls';
const TRANSFER_CONTEXT_CACHE_STORAGE_KEY = 'local_dapp_transfer_context_cache_v1';
const TRANSFER_CONTEXT_CACHE_TTL_MS = 90 * 1000;
const PLACEHOLDER_TEMPLATE_IDS = new Set(['pkg:Module:Template', '#pkg:Module:Template']);
const ENV_REGISTRY_URLS = parseEnvRegistryUrlMap(import.meta.env.VITE_REGISTRY_URLS_JSON?.toString().trim() || '');
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
  import.meta.env.VITE_TOKEN_REGISTRY_URL?.toString().trim() || DEFAULT_REGISTRY_PROXY_BASE_PATH;
const ENV_SCAN_URL = import.meta.env.VITE_SCAN_URL?.toString().trim() || DEFAULT_REGISTRY_PROXY_BASE_PATH;
const ENV_REGISTRY_API_KEY = import.meta.env.VITE_REGISTRY_API_KEY?.toString().trim() || '';

els.walletDomain.value = initialWalletDomain;
els.devnetRegistryDomain.value = initialDevnetRegistryDomain;
els.registryApiKey.value = ENV_REGISTRY_API_KEY;
const defaultRemoteUrl =
  import.meta.env.VITE_WALLET_RPC_URL?.toString().trim() ||
  joinUrl(initialWalletDomain, '/api/v1/dapp');
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

let provider: RequestingProvider | null = null;
let eventsSubscribed = false;
const KERNEL_DISCOVERY_KEY = 'splice_wallet_kernel_discovery';
const KERNEL_SESSION_KEY = 'splice_wallet_kernel_session';
const TX_WAIT_TIMEOUT_MS = 5 * 60 * 1000;
const SIGN_MESSAGE_WAIT_TIMEOUT_MS = 5 * 60 * 1000;
const SIGN_MESSAGE_POLL_INTERVAL_MS = 1200;
const CONNECT_WAIT_TIMEOUT_MS = 60 * 1000;
const CONNECT_TIMEOUT_MESSAGE = 'Connect is waiting for wallet approval. Complete the popup and retry.';
const TRANSFER_FACTORY_TEMPLATE_ID =
  '#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferFactory';
const HOLDING_TEMPLATE_ID = 'Splice.Amulet:Amulet';
const MOBILE_LAYOUT_MEDIA_QUERY = '(max-width: 860px)';
const MAX_LOG_ENTRIES = 400;

let remoteConnectInFlight: Promise<void> | null = null;
const logEntries: string[] = [];

els.transferFactoryTemplateId.value = els.transferFactoryTemplateId.value.trim() || TRANSFER_FACTORY_TEMPLATE_ID;
els.scanUrl.value = ENV_SCAN_URL;
if (!els.registryUrl.value.trim()) {
  const bootstrapRegistryUrl =
    ENV_SINGLE_REGISTRY_URL || ENV_REGISTRY_URLS.devnet || loadRegistryUrlStore().devnet || '';
  if (bootstrapRegistryUrl) {
    els.registryUrl.value = bootstrapRegistryUrl;
  }
}

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
    const message = e.message || 'Unknown error';
    const details: Record<string, unknown> = {};

    if (typeof e.code === 'number') {
      details.code = e.code;
    }
    if (e.data !== undefined) {
      details.data = e.data;
    }
    if (e.cause !== undefined) {
      details.cause = e.cause;
    }

    return { message, details };
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

function buildRegistryBaseURL(domain: string): string {
  return joinUrl(normalizeDomainValue(domain, ENV_REGISTRY_DOMAIN), DEFAULT_SCAN_PROXY_BASE_PATH);
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
  const walletDomain = normalizeDomainValue(els.walletDomain.value, ENV_WALLET_DOMAIN);
  const devnetRegistryDomain = normalizeDomainValue(els.devnetRegistryDomain.value, ENV_REGISTRY_DOMAIN);
  const derivedRegistryURL = buildRegistryBaseURL(devnetRegistryDomain);
  els.walletDomain.value = walletDomain;
  els.devnetRegistryDomain.value = devnetRegistryDomain;
  els.remoteUrl.value = joinUrl(walletDomain, '/api/v1/dapp');
  els.registryUrl.value = derivedRegistryURL;
  els.scanUrl.value = derivedRegistryURL;
  rememberRegistryUrlForNetwork('devnet', derivedRegistryURL);
  if (persist) {
    saveDomainSettingsStore({
      walletDomain,
      registryDomain: devnetRegistryDomain,
      devnetRegistryDomain,
    });
  }
}

function applyDomainSettingsFromInputs(): void {
  try {
    applyDomainSettings(true);
    appendLog('OK', 'settings -> applied domain defaults', {
      walletDomain: els.walletDomain.value.trim(),
      registryDomain: els.devnetRegistryDomain.value.trim(),
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

function getConfiguredRegistryUrl(networkId: string): string {
  const fromInput = els.registryUrl.value.trim();
  if (fromInput) return fromInput;

  const local = loadRegistryUrlStore()[networkId];
  if (local) return local;

  const envMapped = ENV_REGISTRY_URLS[networkId];
  if (envMapped) return envMapped;

  if (networkId === 'devnet' && ENV_SINGLE_REGISTRY_URL) {
    return ENV_SINGLE_REGISTRY_URL;
  }

  return '';
}

function rememberRegistryUrlForNetwork(networkId: string, registryUrl: string): void {
  const normalized = registryUrl.trim();
  if (!normalized) return;
  const store = loadRegistryUrlStore();
  store[networkId] = normalized;
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
  return templateId === HOLDING_TEMPLATE_ID || templateId.endsWith(`:${HOLDING_TEMPLATE_ID}`);
}

function shortContractId(contractId: string): string {
  if (contractId.length <= 22) return contractId;
  return `${contractId.slice(0, 10)}...${contractId.slice(-10)}`;
}

function openUserUrl(userUrl: string): void {
  appendLog('INFO', 'Opening userUrl', { userUrl });
  // Keep opener reference so /dapp/login can postMessage the exchanged dApp token back.
  const popup = window.open(userUrl, 'canton-wallet-connect', 'popup,width=460,height=720');
  if (!popup) {
    appendLog('ERR', 'Popup was blocked by browser', { userUrl });
  }
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

function isMissingOpenSessionError(err: unknown): boolean {
  const message = normalizeError(err).message;
  return (
    message.includes('No previous discovery found') ||
    message.includes('No previous session found') ||
    message.includes('User URL not found in session')
  );
}

async function fetchRemoteConnectUserUrl(): Promise<string> {
  const url = els.remoteUrl.value.trim();
  if (!url) {
    throw new Error('Remote URL is required');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'connect',
    }),
  });
  if (!response.ok) {
    throw new Error(`connect probe failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as JSONRPCResponsePayload<Record<string, unknown>>;
  if (payload.result) {
    const result = asObject(payload.result);
    const userUrl = asString(result?.userUrl);
    if (userUrl) {
      return userUrl;
    }
  }
  if (payload.error?.data) {
    const errorData = asObject(payload.error.data);
    const userUrl = asString(errorData?.userUrl);
    if (userUrl) {
      return userUrl;
    }
  }

  throw new Error('Remote connect did not return a userUrl');
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

function ensureProvider(): RequestingProvider {
  if (!provider) {
    throw new Error('Provider not injected. Click "Inject Provider" first.');
  }
  return provider;
}

function resetSDKProviderState(): void {
  localStorage.removeItem(KERNEL_DISCOVERY_KEY);
  localStorage.removeItem(KERNEL_SESSION_KEY);
  try {
    delete (window as Window & { canton?: unknown }).canton;
  } catch {
    // ignore
  }
}

function getKernelSessionAccessToken(): string | null {
  const raw = localStorage.getItem(KERNEL_SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as KernelSession;
    if (typeof parsed.session?.accessToken === 'string' && parsed.session.accessToken.length > 0) {
      return parsed.session.accessToken;
    }
    if (typeof parsed.accessToken === 'string' && parsed.accessToken.length > 0) {
      return parsed.accessToken;
    }
  } catch {
    // Ignore malformed session cache.
  }

  return null;
}

function persistKernelSessionAccessToken(accessToken: string): void {
  if (!accessToken) return;

  const raw = localStorage.getItem(KERNEL_SESSION_KEY);
  let existing: Record<string, unknown> = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>;
      }
    } catch {
      // ignore malformed cache and overwrite below
    }
  }

  const session =
    existing.session && typeof existing.session === 'object' && !Array.isArray(existing.session)
      ? (existing.session as Record<string, unknown>)
      : {};

  const next: Record<string, unknown> = {
    ...existing,
    accessToken,
    session: {
      ...session,
      accessToken,
    },
  };
  localStorage.setItem(KERNEL_SESSION_KEY, JSON.stringify(next));
}

function extractAccessToken(candidate: unknown): string | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const obj = candidate as Record<string, unknown>;
  const direct = obj.accessToken;
  if (typeof direct === 'string' && direct.length > 0) return direct;

  const session = obj.session;
  if (session && typeof session === 'object' && !Array.isArray(session)) {
    const nested = (session as Record<string, unknown>).accessToken;
    if (typeof nested === 'string' && nested.length > 0) return nested;
  }

  return null;
}

async function syncSessionFromSDKStatus(): Promise<string | null> {
  try {
    const result = await status();
    const token = extractAccessToken(result);
    if (token) {
      persistKernelSessionAccessToken(token);
      return token;
    }
  } catch {
    // ignore and fall through
  }
  return null;
}

async function rpcRequest<T>(method: string, params?: Record<string, unknown> | unknown[]): Promise<T> {
  return rpcRequestWithReconnect<T>(method, params, false);
}

async function ensureRemoteSession(forceRefresh = false): Promise<string> {
  if (forceRefresh) {
    localStorage.removeItem(KERNEL_SESSION_KEY);
    remoteConnectInFlight = null;
  }

  if (!forceRefresh) {
    const existing = getKernelSessionAccessToken();
    if (existing) {
      return existing;
    }

    // SDK may hold token in memory while local cache is empty/stale.
    const statusToken = await syncSessionFromSDKStatus();
    if (statusToken) {
      return statusToken;
    }
  }

  const url = els.remoteUrl.value.trim();
  if (!url) {
    throw new Error('Remote URL is required');
  }

  // Ensure provider is injected before attempting connect.
  ensureProvider();

  if (!remoteConnectInFlight) {
    remoteConnectInFlight = connect({
      defaultGateways: [],
      additionalGateways: [
        {
          name: 'Local Canton Wallet',
          rpcUrl: url,
        },
      ],
    })
      .then((result) => {
        const token = extractAccessToken(result);
        if (token) {
          persistKernelSessionAccessToken(token);
        }
      })
      .finally(() => {
        remoteConnectInFlight = null;
      });
  }

  try {
    await Promise.race([
      remoteConnectInFlight,
      sleep(CONNECT_WAIT_TIMEOUT_MS).then(() => {
        throw new Error(CONNECT_TIMEOUT_MESSAGE);
      }),
    ]);
  } catch (err) {
    // Allow user to start a fresh connect attempt after timeout.
    if (err instanceof Error && err.message === CONNECT_TIMEOUT_MESSAGE) {
      remoteConnectInFlight = null;
    }
    throw err;
  }

  const refreshed = getKernelSessionAccessToken() ?? (await syncSessionFromSDKStatus());
  if (!refreshed) {
    throw new Error('Connected, but no session token is available yet. Complete wallet auth and retry.');
  }

  return refreshed;
}

async function rpcRequestWithReconnect<T>(
  method: string,
  params?: Record<string, unknown> | unknown[],
  retriedAfterReconnect = false,
): Promise<T> {
  const url = els.remoteUrl.value.trim();
  if (!url) {
    throw new Error('Remote URL is required');
  }

  const token = getKernelSessionAccessToken();
  if (!token) {
    throw new Error('Not connected. Click connect() and complete wallet approval first.');
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  headers.Authorization = `Bearer ${token}`;

  const requestBody: Record<string, unknown> = {
    jsonrpc: '2.0',
    id: crypto.randomUUID(),
    method,
  };
  if (params !== undefined) {
    requestBody.params = params;
  }

  const response = await fetch(url, {
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
    if (payload.error.code === 4100 && !retriedAfterReconnect) {
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
  if (els.walletType.value === 'remote') {
    const result = await rpcRequest<LedgerApiRPCResult>('ledgerApi', {
      requestMethod,
      resource,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return parseLedgerApiJSONResponse(result);
  }

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

function extractHoldingContractIdsFromActiveContracts(payload: unknown, ownerPartyId: string): string[] {
  const ids: string[] = [];

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const createdEvent = asObject(asObject(asObject(item)?.contractEntry)?.JsActiveContract)?.createdEvent;
      const created = asObject(createdEvent);
      if (!created) continue;
      const contractId = asString(created.contractId);
      const templateId = asString(created.templateId);
      const owner = asString(asObject(created.createArgument)?.owner);
      if (!contractId || !isHoldingTemplateId(templateId)) continue;
      if (owner && owner !== ownerPartyId) continue;
      ids.push(contractId);
    }
  }

  const obj = asObject(payload);
  const activeContracts = Array.isArray(obj?.activeContracts) ? obj.activeContracts : [];
  for (const item of activeContracts) {
    const contract = asObject(item);
    if (!contract) continue;
    const contractId = asString(contract.contractId);
    const templateId = asString(contract.templateId);
    const owner = asString(asObject(contract.payload)?.owner);
    if (!contractId || !isHoldingTemplateId(templateId)) continue;
    if (owner && owner !== ownerPartyId) continue;
    ids.push(contractId);
  }

  return uniqueStrings(ids);
}

async function getPrimaryHoldingContractIds(p: RequestingProvider, ownerPartyId: string): Promise<string[]> {
  const ledgerEndPayload = await dappLedgerApiJSON(p, 'GET', '/v2/state/ledger-end');
  const offset = asInt(asObject(ledgerEndPayload)?.offset);
  if (offset === null || offset < 0) {
    throw new Error('Could not resolve ledger-end offset for holdings lookup');
  }

  const activeContractsPayload = await dappLedgerApiJSON(p, 'POST', '/v2/state/active-contracts', {
    filter: {
      filtersByParty: {
        [ownerPartyId]: {
          cumulative: [
            {
              identifierFilter: {
                WildcardFilter: {
                  value: {
                    includeCreatedEventBlob: false,
                  },
                },
              },
            },
          ],
        },
      },
    },
    verbose: true,
    activeAtOffset: offset,
  });

  const holdingContractIds = extractHoldingContractIdsFromActiveContracts(activeContractsPayload, ownerPartyId);
  if (holdingContractIds.length === 0) {
    throw new Error(
      'No sender holdings found. Fund the sender wallet first (e.g. faucet) before preparing TransferFactory_Transfer.',
    );
  }
  return holdingContractIds;
}

async function getActiveNetworkId(p: RequestingProvider): Promise<string> {
  let network: NetworkInfo | null = null;
  if (els.walletType.value === 'remote') {
    network = await rpcRequest<NetworkInfo>('getActiveNetwork');
  } else {
    network = await p.request<NetworkInfo>({ method: 'getActiveNetwork' });
  }
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

function getRequiredRegistryAPIKey(): string {
  const key = els.registryApiKey.value.trim();
  if (!key) {
    throw new Error('Registry / scan API key is required. Set it in Settings before resolving transfer context.');
  }
  return key;
}

async function fetchWithAPIKey(endpoint: string, init: RequestInit): Promise<Response> {
  const apiKey = getRequiredRegistryAPIKey();
  const headers = new Headers(init.headers ?? {});
  headers.set('X-API-Key', apiKey);
  return fetch(endpoint, {
    ...init,
    headers,
  });
}

async function fetchForRegistryDiscovery(endpoint: string, init: RequestInit): Promise<Response> {
  return fetchWithAPIKey(endpoint, init);
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

async function resolveRegistryUrl(networkId: string, instrumentAdmin: string): Promise<RegistryResolution> {
  const fromInput = els.registryUrl.value.trim();
  if (fromInput) {
    rememberRegistryUrlForNetwork(networkId, fromInput);
    return {
      registryUrl: fromInput,
      source: 'manual',
    };
  }

  const configured = getConfiguredRegistryUrl(networkId);
  if (configured) {
    els.registryUrl.value = configured;
    rememberRegistryUrlForNetwork(networkId, configured);
    return {
      registryUrl: configured,
      source: 'network-config',
    };
  }

  const scanUrl = els.scanUrl.value.trim();
  if (scanUrl && instrumentAdmin) {
    const discovered = await discoverRegistryUrlsFromCns(scanUrl, instrumentAdmin);
    if (discovered.length > 0) {
      els.registryUrl.value = discovered[0];
      rememberRegistryUrlForNetwork(networkId, discovered[0]);
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
        'Registry fetch failed at network layer. If using default /api/registry-proxy, ensure scan-proxy-backend is running at http://127.0.0.1:8086; otherwise use a browser-accessible registry endpoint (CORS).',
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
        'Registry fetch failed at network layer. If using default /api/registry-proxy, ensure scan-proxy-backend is running at http://127.0.0.1:8086. Also verify your API key.',
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
  const inputHoldingCids =
    transferInput.inputHoldingCids.length > 0
      ? uniqueStrings(transferInput.inputHoldingCids)
      : await getPrimaryHoldingContractIds(p, senderPartyId);
  const { registryUrl } = await resolveRegistryUrl(networkId, transferInput.instrumentAdmin || '');

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
    const configured = getConfiguredRegistryUrl(networkId);
    if (!configured) {
      setTransferFactoryStatus(
        'No configured registry URL for this network. Set Registry URL or provide Scan URL + Instrument Admin.',
        'warn',
      );
      return;
    }
    els.registryUrl.value = configured;
    rememberRegistryUrlForNetwork(networkId, configured);
    setTransferFactoryStatus(`Registry URL configured for ${networkId}: ${configured}`, 'ok');
    appendLog('INFO', 'connect -> registry URL configured', { networkId, registryUrl: configured });
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
  const account =
    els.walletType.value === 'remote'
      ? await rpcRequest<Record<string, unknown>>('getPrimaryAccount')
      : await p.request<Record<string, unknown>>({ method: 'getPrimaryAccount' });

  const partyId = typeof account.partyId === 'string' ? account.partyId.trim() : '';
  if (!partyId) {
    throw new Error('Could not resolve partyId from getPrimaryAccount');
  }
  return partyId;
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
  const holdingContractIds = await getPrimaryHoldingContractIds(p, senderPartyId);
  for (const transfer of transferPayloadsNeedingHoldings) {
    transfer.inputHoldingCids = holdingContractIds;
  }

  els.commandsJson.value = JSON.stringify(params, null, 2);
  appendLog('INFO', 'prepareExecute -> injected sender inputHoldingCids', {
    senderPartyId,
    count: holdingContractIds.length,
    sample: holdingContractIds.slice(0, 3),
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

async function signMessageRemoteWithApproval(message: string): Promise<Record<string, unknown>> {
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

els.walletDomain.addEventListener('change', applyDomainSettingsFromInputs);
els.devnetRegistryDomain.addEventListener('change', applyDomainSettingsFromInputs);

els.injectProvider.addEventListener('click', () => {
  const walletType = els.walletType.value;
  if (walletType === 'remote') {
    const url = els.remoteUrl.value.trim();
    if (!url) {
      appendLog('ERR', 'injectProvider -> remote URL is required');
      return;
    }
    // Force SDK to use the selected remote URL, not any stale injected provider/session.
    resetSDKProviderState();
    provider = injectProvider({ walletType: 'remote', url }) as RequestingProvider;
    resetTransferFactoryDiscoveryUI();
    appendLog('OK', 'injectProvider(remote) -> success', { url });
    return;
  }

  provider = injectProvider({ walletType: 'extension' }) as RequestingProvider;
  resetTransferFactoryDiscoveryUI();
  appendLog('OK', 'injectProvider(extension) -> success');
});

els.openWallet.addEventListener('click', () => {
  void run('open', async () => {
    try {
      await open();
      return { opened: true, via: 'sdk-open' };
    } catch (err) {
      if (els.walletType.value !== 'remote' || !isMissingOpenSessionError(err)) {
        throw err;
      }
      const userUrl = await fetchRemoteConnectUserUrl();
      openUserUrl(userUrl);
      return { opened: true, via: 'remote-connect-userUrl', userUrl };
    }
  });
});

els.connect.addEventListener('click', () => {
  void run('connect', async () => {
    const p = ensureProvider();
    let result: unknown;
    if (els.walletType.value === 'remote') {
      await ensureRemoteSession(false);
      result = await rpcRequest<Record<string, unknown>>('status');
    } else {
      result = await connect();
    }
    await tryAutoConfigureRegistryUrl(p);
    return result;
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
    ensureProvider();
    if (els.walletType.value === 'remote') {
      return rpcRequest<Record<string, unknown>>('getPrimaryAccount');
    }
    return ensureProvider().request({ method: 'getPrimaryAccount' });
  });
});

els.signMessage.addEventListener('click', () => {
  void run('signMessage', async () => {
    ensureProvider();
    const message = els.message.value;
    if (els.walletType.value === 'remote') {
      return signMessageRemoteWithApproval(message);
    }
    return ensureProvider().request({
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
    transferInput.inputHoldingCids = await getPrimaryHoldingContractIds(p, senderPartyId);
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
  void run('prepareExecute', async () => {
    const p = ensureProvider();
    const params = parseCommandParamsInput();
    normalizeTransferFactoryTemplateInParams(params);
    await ensureTransferFactoryInputHoldingCids(p, params);
    if (els.walletType.value === 'remote') {
      try {
        const result = await rpcRequest<{ userUrl?: string }>('prepareExecute', params);
        if (typeof result?.userUrl === 'string' && result.userUrl.length > 0) {
          openUserUrl(result.userUrl);
        }
        return result;
      } catch (err) {
        const refreshed = await maybeRefreshTransferFactoryAfterFailure(p, params, err);
        if (!refreshed) throw err;
        const result = await rpcRequest<{ userUrl?: string }>('prepareExecute', params);
        if (typeof result?.userUrl === 'string' && result.userUrl.length > 0) {
          openUserUrl(result.userUrl);
        }
        return result;
      }
    }

    const parsed = params as { commands: unknown };
    return prepareExecute({
      commands: parsed.commands as Record<string, unknown>,
    });
  });
});

els.prepareExecuteAndWait.addEventListener('click', () => {
  void run('prepareExecuteAndWait', async () => {
    const p = ensureProvider();
    if (els.walletType.value === 'remote') {
      const params = parseCommandParamsInput();
      normalizeTransferFactoryTemplateInParams(params);
      await ensureTransferFactoryInputHoldingCids(p, params);
      const commandIdRaw = params.commandId;
      const commandId =
        typeof commandIdRaw === 'string' && commandIdRaw.trim().length > 0 ? commandIdRaw : crypto.randomUUID();
      params.commandId = commandId;

      const waiter = waitForTxResult(p, commandId);
      try {
        let result: { userUrl?: string };
        try {
          result = await rpcRequest<{ userUrl?: string }>('prepareExecute', params);
        } catch (err) {
          const refreshed = await maybeRefreshTransferFactoryAfterFailure(p, params, err);
          if (!refreshed) throw err;
          result = await rpcRequest<{ userUrl?: string }>('prepareExecute', params);
        }
        if (typeof result?.userUrl === 'string' && result.userUrl.length > 0) {
          openUserUrl(result.userUrl);
        }
        return await waiter.promise;
      } catch (err) {
        waiter.cleanup();
        throw err;
      }
    }

    const parsed = parseCommandParamsInput();
    normalizeTransferFactoryTemplateInParams(parsed);
    await ensureTransferFactoryInputHoldingCids(p, parsed);
    return prepareExecuteAndWait({
      commands: parsed.commands as Record<string, unknown>,
    });
  });
});

els.ledgerVersion.addEventListener('click', () => {
  void run('ledgerApi(/v2/version)', async () => {
    ensureProvider();
    const result = await ledgerApi({
      requestMethod: 'GET',
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
    });
    await onAccountsChanged((event) => {
      appendLog('INFO', 'event: accountsChanged', event);
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

appendLog('INFO', 'Ready. Inject a provider to begin.', {
  defaultRemoteUrl,
});
