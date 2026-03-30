import { getCurrentNetworkConfig } from '@/providers/network-config-provider';
import { Signer, Builder, type Command } from '@nillion/nuc';
import { NucCmd, SecretVaultBuilderClient } from '@nillion/secretvaults';
import { createWalletClient, custom } from 'viem';
import { mainnet, sepolia } from 'viem/chains';

declare global {
  interface Window {
    ethereum?: any & {
      providers?: any[];
      isMetaMask?: boolean;
    };
  }
}

interface FetchOptions extends RequestInit {
  includeConfig?: boolean;
}

export interface ClientCollectionSummary {
  _id: string;
  name: string;
  type: string;
  createdAt: string;
}

export interface WalletAuthCacheStatus {
  hasCache: boolean;
  expiresAt: number | null;
  remainingMs: number;
}

interface WalletSession {
  address: string;
  chainId: number;
  signer: Signer;
  client: SecretVaultBuilderClient;
  invocations: Record<string, string> | null;
  expiresAt: number;
  profileReady: boolean;
}

let walletSession: WalletSession | null = null;
let walletSessionInitPromise: Promise<WalletSession> | null = null;
let walletReauthPromise: Promise<void> | null = null;
const COLLECTION_REGISTRY_PREFIX = 'nillion-wallet-collections';

export async function apiFetch(url: string, options: FetchOptions = {}) {
  const { includeConfig = true, ...fetchOptions } = options;
  
  const headers = new Headers(fetchOptions.headers);
  
  // Include network config in headers if requested
  if (includeConfig) {
    const config = getCurrentNetworkConfig();
    if (config.SIGNER_MODE === 'web3' && config.WALLET_ADDRESS && isWalletHandledRoute(url)) {
      return handleWalletModeRequest(url, fetchOptions, config);
    }
    headers.set('x-nillion-config', JSON.stringify(config));
    const auth = await getNillionAuthContext(
      config,
      url,
      (fetchOptions.method || 'GET').toUpperCase()
    );
    if (auth) {
      headers.set('x-nillion-auth', JSON.stringify(auth));
    }
  }
  
  return fetch(url, {
    ...fetchOptions,
    headers,
  });
}

function isWalletHandledRoute(url: string): boolean {
  return url.startsWith('/api/collections') || url.startsWith('/api/data/') || url === '/api/setup';
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(sanitizeForJson(payload)), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sanitizeForJson(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(sanitizeForJson);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeForJson(v);
    }
    return out;
  }
  return value;
}

const hasAllotValue = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasAllotValue);
  if ('%allot' in (value as Record<string, unknown>)) return true;
  return Object.values(value as Record<string, unknown>).some(hasAllotValue);
};

async function handleWalletModeRequest(
  url: string,
  fetchOptions: RequestInit,
  config: ReturnType<typeof getCurrentNetworkConfig>,
  allowAuthRetry = true
): Promise<Response> {
  try {
    const method = (fetchOptions.method || 'GET').toUpperCase();
    const session = await getWalletSession(config);
    const needsBlindfold =
      url.includes('reveal=1') ||
      url.includes('reveal=true');
    const rootAuth = { invocations: session.invocations || {} };
    const client = needsBlindfold
      ? await SecretVaultBuilderClient.from({
          signer: session.signer,
          dbs: [...config.NILDB_NODES],
          blindfold: {
            operation: 'store',
          },
        })
      : session.client;

    // /api/setup
    if (url === '/api/setup' && method === 'POST') {
      try {
        const profile = await client.readProfile({ auth: rootAuth });
        return jsonResponse({ success: true, message: 'Builder is already registered', profile: profile.data });
      } catch {
        return jsonResponse({ success: true, message: 'Builder setup complete (auto-registered)', profile: null });
      }
    }

    if (url.startsWith('/api/collections')) {
      const collectionId = getPathTail(url, '/api/collections/');
      if (!collectionId) {
        if (method === 'GET') {
          const registry = getWalletCollectionRegistry(config);
          try {
            const collectionsResponse = await client.readCollections({ auth: rootAuth } as any);
            const collections = (collectionsResponse.data || []).map((collection: any) => {
              const id = collection.id;
              const name = collection.name || registry[id]?.name || `Collection ${id.slice(0, 8)}`;
              const type = collection.type || registry[id]?.type || 'standard';
              setWalletCollectionRegistryItem(config, id, { name, type });
              return {
                _id: id,
                name,
                type,
                createdAt: new Date().toISOString(),
              };
            });
            return jsonResponse({ success: true, collections });
          } catch {
            // Fallback: profile IDs + metadata lookup for environments where readCollections may fail.
            const profile = await client.readProfile({ auth: rootAuth });
            const collectionIds = profile.data?.collections || [];
            const collections = await Promise.all(
              collectionIds.map(async (id: string) => {
                const registered = registry[id];
                if (registered?.name) {
                  return {
                    _id: id,
                    name: registered.name,
                    type: registered.type || 'standard',
                    createdAt: new Date().toISOString(),
                  };
                }

                try {
                  const metadataResponse = await client.readCollection(id as any, {
                    auth: rootAuth,
                  });
                  const metadata = metadataResponse?.data as {
                    name?: string;
                    type?: string;
                  } | null;
                  const resolvedName =
                    metadata?.name?.trim() || `Collection ${id.slice(0, 8)}`;
                  const resolvedType = metadata?.type || 'standard';
                  setWalletCollectionRegistryItem(config, id, {
                    name: resolvedName,
                    type: resolvedType,
                  });
                  return {
                    _id: id,
                    name: resolvedName,
                    type: resolvedType,
                    createdAt: new Date().toISOString(),
                  };
                } catch {
                  return {
                    _id: id,
                    name: `Collection ${id.slice(0, 8)}`,
                    type: 'standard',
                    createdAt: new Date().toISOString(),
                  };
                }
              })
            );
            return jsonResponse({ success: true, collections });
          }
        }
        if (method === 'POST') {
          const body = parseBody(fetchOptions.body);
          const collectionDefinition = {
            _id: crypto.randomUUID(),
            type: body.type,
            name: body.name,
            schema: body.schema,
          };
          await client.createCollection(collectionDefinition, { auth: rootAuth });
          setWalletCollectionRegistryItem(config, collectionDefinition._id, {
            name: collectionDefinition.name,
            type: collectionDefinition.type,
          });
          return jsonResponse({
            success: true,
            collection: {
              _id: collectionDefinition._id,
              type: collectionDefinition.type,
              name: collectionDefinition.name,
              schema: body.schema,
              description: body.description,
              createdAt: new Date().toISOString(),
            },
          });
        }
      } else {
        if (method === 'GET') {
          const metadataResponse = await client.readCollection(collectionId as any, { auth: rootAuth });
          const registry = getWalletCollectionRegistry(config);
          const collection = registry[collectionId];
          return jsonResponse({
            success: true,
            metadata: metadataResponse.data,
            schema: metadataResponse.data.schema,
            collectionInfo: {
              name: collection?.name || `Collection ${collectionId.slice(0, 8)}`,
              type: collection?.type || 'standard',
            },
            fullResponse: metadataResponse.data,
          });
        }
        if (method === 'DELETE') {
          await client.deleteCollection(collectionId as any, { auth: rootAuth });
          removeWalletCollectionRegistryItem(config, collectionId);
          return jsonResponse({ success: true, message: 'Collection deleted successfully' });
        }
      }
    }

    if (url.startsWith('/api/data/')) {
      const collectionId = getPathTail(url, '/api/data/');
      const parsedUrl = new URL(url, 'http://localhost');
      if (method === 'GET') {
        const filter = parsedUrl.searchParams.get('filter');
        const limitParam = parsedUrl.searchParams.get('limit');
        const reveal = parsedUrl.searchParams.get('reveal');
        const dataClient =
          reveal === '1' || reveal === 'true'
            ? await SecretVaultBuilderClient.from({
                signer: session.signer,
                dbs: [...config.NILDB_NODES],
                blindfold: { operation: 'store' },
              })
            : client;
        const result = await dataClient.findData({
          collection: collectionId,
          filter: filter ? JSON.parse(filter) : {},
          ...(limitParam ? { limit: Number(limitParam) } : {}),
        }, { auth: rootAuth });
        return jsonResponse({ success: true, data: result.data });
      }

      if (method === 'POST') {
        const body = parseBody(fetchOptions.body);
        const rawData = body.data;
        const dataArray = Array.isArray(rawData) ? rawData : [rawData];
        const processedData = dataArray.map((record: Record<string, unknown>) => ({
          _id: (record._id as string) || crypto.randomUUID(),
          ...record,
        }));
        const useBlindfold = processedData.some((record) => hasAllotValue(record));
        const dataClient = useBlindfold
          ? await SecretVaultBuilderClient.from({
              signer: session.signer,
              dbs: [...config.NILDB_NODES],
              blindfold: { operation: 'store' },
            })
          : client;
        await dataClient.createStandardData({ collection: collectionId, data: processedData }, { auth: rootAuth });
        return jsonResponse({
          success: true,
          message: `Added ${processedData.length} record(s)`,
          data: processedData,
        });
      }

      if (method === 'PUT') {
        const body = parseBody(fetchOptions.body);
        const useBlindfold = hasAllotValue(body.update);
        const dataClient = useBlindfold
          ? await SecretVaultBuilderClient.from({
              signer: session.signer,
              dbs: [...config.NILDB_NODES],
              blindfold: { operation: 'store' },
            })
          : client;
        try {
          await dataClient.deleteData(
            { collection: collectionId, filter: body.filter },
            { auth: rootAuth }
          );
          await dataClient.createStandardData({
            collection: collectionId,
            data: [{ ...body.update, _id: body.filter._id }],
          }, { auth: rootAuth });
        } catch {
          await dataClient.updateData({
            collection: collectionId,
            filter: body.filter,
            update: body.update,
          }, { auth: rootAuth });
        }
        return jsonResponse({ success: true, message: 'Data updated successfully' });
      }

      if (method === 'DELETE') {
        const filterParam = parsedUrl.searchParams.get('filter');
        if (!filterParam) {
          return jsonResponse({ success: false, error: 'Missing filter parameter' }, 400);
        }
        await client.deleteData({
          collection: collectionId,
          filter: JSON.parse(filterParam),
        }, { auth: rootAuth });
        return jsonResponse({ success: true, message: 'Data deleted successfully' });
      }
    }

    return jsonResponse({ success: false, error: 'Unsupported wallet mode request' }, 400);
  } catch (error) {
    if (allowAuthRetry && isUnauthorizedError(error)) {
      try {
        await ensureWalletReauth(config);
        return handleWalletModeRequest(url, fetchOptions, config, false);
      } catch {
        // Fall through to normal error response.
      }
    }
    const details = error instanceof Error ? error.message : String(error);
    if (url.startsWith('/api/collections')) {
      return jsonResponse({ success: false, error: 'Failed to fetch collections', details }, 500);
    }
    if (url.startsWith('/api/data/')) {
      return jsonResponse({ success: false, error: 'Failed to process data request', details }, 500);
    }
    return jsonResponse({ success: false, error: 'Wallet mode request failed', details }, 500);
  }
}

function isUnauthorizedError(error: unknown): boolean {
  const text = (() => {
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  })().toLowerCase();

  return text.includes('401') || text.includes('unauthorized');
}

function getPathTail(url: string, prefix: string): string {
  if (!url.startsWith(prefix)) return '';
  const value = url.split('?')[0].slice(prefix.length);
  return value || '';
}

function parseBody(body: BodyInit | null | undefined): any {
  if (!body) return {};
  if (typeof body === 'string') return JSON.parse(body);
  return {};
}

export async function readCollectionsDirectFromWallet(): Promise<ClientCollectionSummary[]> {
  const config = getCurrentNetworkConfig();
  if (config.SIGNER_MODE !== 'web3' || !config.WALLET_ADDRESS) {
    throw new Error('Wallet mode is not enabled.');
  }
  const session = await getWalletSession(config);
  const response = await session.client.readProfile({
    auth: { invocations: session.invocations || {} },
  });
  const registry = getWalletCollectionRegistry(config);
  const collections = response.data?.collections || [];
  return collections.map((id: string) => ({
    _id: id,
    name: registry[id]?.name || `Collection ${id.slice(0, 8)}`,
    type: registry[id]?.type || 'standard',
    createdAt: new Date().toISOString(),
  }));
}

export function getWalletAuthCacheStatus(): WalletAuthCacheStatus {
  if (typeof window === 'undefined' || !walletSession) {
    return { hasCache: false, expiresAt: null, remainingMs: 0 };
  }
  const config = getCurrentNetworkConfig();
  if (config.SIGNER_MODE !== 'web3' || !config.WALLET_ADDRESS) {
    return { hasCache: false, expiresAt: null, remainingMs: 0 };
  }
  const address = config.WALLET_ADDRESS.toLowerCase();
  if (
    walletSession.address !== address ||
    walletSession.chainId !== config.WALLET_CHAIN_ID
  ) {
    return { hasCache: false, expiresAt: null, remainingMs: 0 };
  }
  const remainingMs = Math.max(0, walletSession.expiresAt - Date.now());
  return {
    hasCache: !!walletSession.invocations && remainingMs > 0,
    expiresAt: walletSession.expiresAt || null,
    remainingMs,
  };
}

export async function refreshWalletAuthCache(): Promise<void> {
  if (typeof window === 'undefined') return;
  const config = getCurrentNetworkConfig();
  if (config.SIGNER_MODE !== 'web3' || !config.WALLET_ADDRESS) return;

  const address = config.WALLET_ADDRESS.toLowerCase();
  await forceWalletReSign(config);
}

async function getNillionAuthContext(
  config: ReturnType<typeof getCurrentNetworkConfig>,
  url: string,
  method: string
) {
  if (typeof window === 'undefined') {
    return undefined;
  }
  if (config.SIGNER_MODE !== 'web3' || !config.WALLET_ADDRESS) {
    return undefined;
  }
  const cacheKey = `nillion-auth-invocations:${config.WALLET_ADDRESS}:${config.WALLET_CHAIN_ID}:root`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { expiresAt: number; invocations: Record<string, string> };
      if (parsed.expiresAt > Date.now() && parsed.invocations) {
        return { invocations: parsed.invocations };
      }
    } catch {
      // Ignore parse failures and remint.
    }
  }

  const signer = await createWalletSigner(config.WALLET_CHAIN_ID, config.WALLET_ADDRESS);
  const nillionClient = await SecretVaultBuilderClient.from({
    signer,
    dbs: [...config.NILDB_NODES],
  });
  const invocations: Record<string, string> = {};
  const did = await nillionClient.getDid();
  for (const node of nillionClient.nodes) {
    invocations[node.id.didString] = await Builder.invocation()
      .subject(did)
      .audience(node.id)
      .command(NucCmd.nil.db.root as Command)
      .expiresIn(3600)
      .signAndSerialize(signer);
  }

  localStorage.setItem(
    cacheKey,
    JSON.stringify({
      expiresAt: Date.now() + 55 * 60 * 1000,
      invocations,
    })
  );
  return { invocations };
}

async function getWalletRootAuth(
  config: ReturnType<typeof getCurrentNetworkConfig>,
  signer: Signer,
  nillionClient: SecretVaultBuilderClient
): Promise<{ invocations: Record<string, string> }> {
  const invocations: Record<string, string> = {};
  const subjectDid = await nillionClient.getDid();
  for (const node of nillionClient.nodes) {
    invocations[node.id.didString] = await Builder.invocation()
      .subject(subjectDid)
      .audience(node.id)
      .command(NucCmd.nil.db.root as Command)
      .expiresIn(86400)
      .signAndSerialize(signer);
  }
  return { invocations };
}

async function getWalletSession(
  config: ReturnType<typeof getCurrentNetworkConfig>,
  forceRefreshTokens = false
): Promise<WalletSession> {
  if (walletSessionInitPromise && !forceRefreshTokens) {
    return walletSessionInitPromise;
  }

  walletSessionInitPromise = (async () => {
  const address = config.WALLET_ADDRESS.toLowerCase();
  const chainId = config.WALLET_CHAIN_ID;

  if (
    !walletSession ||
    walletSession.address !== address ||
    walletSession.chainId !== chainId
  ) {
    const signer = await createWalletSigner(chainId, config.WALLET_ADDRESS);
    const client = await SecretVaultBuilderClient.from({
      signer,
      dbs: [...config.NILDB_NODES],
    });
    walletSession = {
      address,
      chainId,
      signer,
      client,
      invocations: null,
      expiresAt: 0,
      profileReady: false,
    };
  }

  const hasValidTokens =
    !forceRefreshTokens &&
    walletSession.invocations &&
    walletSession.expiresAt > Date.now();
  if (!hasValidTokens) {
    const rootAuth = await getWalletRootAuth(config, walletSession.signer, walletSession.client);
    walletSession.invocations = rootAuth.invocations;
    walletSession.expiresAt = Date.now() + 55 * 60 * 1000;
    walletSession.profileReady = false;
  }

  if (!walletSession.profileReady && walletSession.invocations) {
    await ensureWalletProfileInitialized(walletSession.client, walletSession.signer, walletSession.invocations);
    walletSession.profileReady = true;
  }

  return walletSession;
  })();

  try {
    return await walletSessionInitPromise;
  } finally {
    walletSessionInitPromise = null;
  }
}

async function forceWalletReSign(config: ReturnType<typeof getCurrentNetworkConfig>) {
  // Drop in-memory session so next init always remints tokens (prompts signatures again).
  walletSession = null;
  walletSessionInitPromise = null;
  await getWalletSession(config, true);
}

async function ensureWalletReauth(config: ReturnType<typeof getCurrentNetworkConfig>) {
  if (walletReauthPromise) {
    return walletReauthPromise;
  }

  walletReauthPromise = (async () => {
    await forceWalletReSign(config);
  })();

  try {
    await walletReauthPromise;
  } finally {
    walletReauthPromise = null;
  }
}

async function ensureWalletProfileInitialized(
  client: SecretVaultBuilderClient,
  _signer: Signer,
  invocations: Record<string, string>
) {
  try {
    await client.readProfile({ auth: { invocations } });
    return;
  } catch {
    // Continue to register fallback.
  }

  try {
    const did = await client.getDid();
    await client.register({
      did: did.didString,
      name: 'Demo Wallet Builder',
    });
  } catch (registerError: unknown) {
    const message = registerError instanceof Error ? registerError.message : String(registerError);
    const errorString = JSON.stringify(registerError);
    const errorsArray = (registerError as any)?.errors || [];
    const hasDuplicateError =
      message.includes('DuplicateEntryError') ||
      message.includes('duplicate') ||
      errorString.includes('DuplicateEntryError') ||
      errorsArray.some((e: unknown) => String(e).includes('DuplicateEntryError'));

    if (!hasDuplicateError) {
      throw registerError;
    }
  }

  // Strictly require profile read to work after registration path.
  await client.readProfile({ auth: { invocations } });
}

function getWalletCollectionRegistryKey(config: ReturnType<typeof getCurrentNetworkConfig>) {
  return `${COLLECTION_REGISTRY_PREFIX}:${config.WALLET_ADDRESS.toLowerCase()}:${config.WALLET_CHAIN_ID}`;
}

function getWalletCollectionRegistry(
  config: ReturnType<typeof getCurrentNetworkConfig>
): Record<string, { name: string; type: string }> {
  if (typeof window === 'undefined' || !config.WALLET_ADDRESS) return {};
  const raw = localStorage.getItem(getWalletCollectionRegistryKey(config));
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, { name: string; type: string }>;
  } catch {
    return {};
  }
}

function setWalletCollectionRegistryItem(
  config: ReturnType<typeof getCurrentNetworkConfig>,
  collectionId: string,
  item: { name: string; type: string }
) {
  if (typeof window === 'undefined' || !config.WALLET_ADDRESS) return;
  const registry = getWalletCollectionRegistry(config);
  registry[collectionId] = item;
  localStorage.setItem(getWalletCollectionRegistryKey(config), JSON.stringify(registry));
}

function removeWalletCollectionRegistryItem(
  config: ReturnType<typeof getCurrentNetworkConfig>,
  collectionId: string
) {
  if (typeof window === 'undefined' || !config.WALLET_ADDRESS) return;
  const registry = getWalletCollectionRegistry(config);
  delete registry[collectionId];
  localStorage.setItem(getWalletCollectionRegistryKey(config), JSON.stringify(registry));
}

async function createWalletSigner(chainId: number, walletAddress: string) {
  const eth: any = window.ethereum;
  if (!eth) {
    throw new Error('Wallet not available. Install MetaMask.');
  }

  const provider = (eth?.providers?.find((p: any) => p?.isMetaMask) ?? eth) as any;
  const targetChainId = Number(chainId) || 11155111;
  const targetChainHex = `0x${targetChainId.toString(16)}`;
  const chain = targetChainId === 1 ? mainnet : sepolia;

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetChainHex }],
    });
  } catch {
    // Chain switch may fail if already on correct chain.
  }

  const existingAccounts = (await provider.request({
    method: 'eth_accounts',
  })) as string[];
  const [rawAccount] = existingAccounts?.length
    ? existingAccounts
    : ((await provider.request({
        method: 'eth_requestAccounts',
      })) as string[]);
  if (!rawAccount) {
    throw new Error('No wallet account available.');
  }

  const account = rawAccount as `0x${string}`;
  if (account.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error('Connected wallet does not match saved wallet address. Reconnect wallet in settings.');
  }

  const walletClient = createWalletClient({
    chain,
    transport: custom(provider),
  });

  return Signer.fromWeb3(
    {
      getAddress: async () => account,
      signTypedData: async (params) =>
        walletClient.signTypedData({ ...params, account }),
    },
    { chainId: targetChainId }
  );
}