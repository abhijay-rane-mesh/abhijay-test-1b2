type ProviderType = "exchange" | "wallet" | string;

export type StoredAuth = {
  userId: string;
  providerType: ProviderType;
  accessToken: string;
  accountId?: string;
  integrationId?: string;
  rawPayload?: unknown;
  createdAt: string;
};

const store = new Map<string, StoredAuth>();

function makeKey(userId: string, providerType: ProviderType) {
  return `${userId}::${providerType}`;
}

export function saveAuth(entry: StoredAuth) {
  const key = makeKey(entry.userId, entry.providerType);
  store.set(key, entry);
}

export function getAuth(userId: string, providerType: ProviderType) {
  const key = makeKey(userId, providerType);
  return store.get(key) ?? null;
}

export function getAnyAuth(userId: string) {
  for (const entry of store.values()) {
    if (entry.userId === userId) {
      return entry;
    }
  }
  return null;
}


