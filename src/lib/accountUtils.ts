/**
 * Maps provider types to display names
 * If using production keys, shows clean names (e.g., "Coinbase" instead of "Coinbase (Sandbox)")
 */
export function getAccountDisplayName(
  providerType: string | null | undefined,
  payload?: any
): string {
  // Check brokerName FIRST if available (most reliable source)
  // This should be "Coinbase", "MetaMask", etc. from the Mesh payload
  if (payload?.brokerName) {
    console.log("[getAccountDisplayName] Using brokerName:", payload.brokerName);
    return payload.brokerName;
  }
  
  // Also check if payload itself is a string (brokerName passed directly)
  if (typeof payload === "string" && payload.length > 0) {
    console.log("[getAccountDisplayName] Payload is string:", payload);
    return payload;
  }

  // First try to get from payload fields if provided
  if (payload) {
    const integrationName =
      payload.integrationName ||
      payload.name ||
      payload.account?.accountName ||  // e.g., "MetaMask", "SOL wallets"
      payload.integration?.name ||
      payload.account?.integrationName ||
      null;

    if (integrationName) return integrationName;
  }

  // Map common provider types to display names
  if (!providerType) return "Unknown";

  const lowerType = providerType.toLowerCase();

  // Special handling: if type contains "coinbase", always show "Coinbase"
  // (Even if it says "sandboxCoinbase", if using production keys, it's likely production)
  if (lowerType.includes("coinbase")) {
    return "Coinbase";
  }

  // Special handling: if type contains "metamask" or "defiwallet", show "MetaMask"
  if (lowerType.includes("metamask") || lowerType.includes("defiwallet")) {
    return "MetaMask";
  }

  const providerMap: Record<string, string> = {
    coinbase: "Coinbase",
    sandboxCoinbase: "Coinbase", // Show as Coinbase even if type says sandbox
    metamask: "MetaMask",
    wallet: "Wallet",
    binance: "Binance",
    sandboxBinance: "Binance",
  };

  // Check exact match first
  if (providerMap[providerType]) {
    return providerMap[providerType];
  }

  // Check case-insensitive match
  for (const [key, value] of Object.entries(providerMap)) {
    if (lowerType.includes(key.toLowerCase())) {
      return value;
    }
  }

  // Capitalize first letter if no match
  return providerType.charAt(0).toUpperCase() + providerType.slice(1);
}

