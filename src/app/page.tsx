/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";
import { getAccountDisplayName } from "@/lib/accountUtils";

const STEPS = [
  {
    icon: "∞",
    label: "Connect",
    sub: "Link exchanges & wallets",
  },
  {
    icon: "₿",
    label: "Portfolio",
    sub: "See everything in one view",
  },
  {
    icon: "⇄",
    label: "Transfer",
    sub: "Move assets with Managed Transfers",
  },
  {
    icon: "☐",
    label: "History",
    sub: "Track every on-chain move",
  },
];

const clientId = process.env.NEXT_PUBLIC_MESH_CLIENT_ID!;

export default function Home() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meshLink, setMeshLink] = useState<ReturnType<any> | null>(null);
  const [connectedAccounts, setConnectedAccounts] = useState<any[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [providerType, setProviderType] = useState<string | null>(null);
  const [meshAccountId, setMeshAccountId] = useState<string | null>(null);
  // Network preference is fixed to "auto" in the UI.
  const [walletNetworkPreference] = useState<"auto" | "solana" | "evm">("auto");
  const [stepIndex, setStepIndex] = useState(0);
  const nextStepIndex = (stepIndex + 1) % STEPS.length;
  const currentStep = STEPS[stepIndex];
  const nextStep = STEPS[nextStepIndex];

  // Load stored accounts from localStorage and update display names
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("mesh_connected_accounts");
      if (stored) {
        try {
          const accounts = JSON.parse(stored);
          // Update display names for existing accounts
          const updatedAccounts = accounts.map((acc: any) => {
            // Use brokerName if available (most reliable), otherwise calculate
            const displayName = 
              acc.brokerName || 
              acc.name || 
              getAccountDisplayName(acc.brokerType || acc.providerType, acc);
            console.log("[Accounts] Updating account name:", {
              oldName: acc.name,
              brokerName: acc.brokerName,
              brokerType: acc.brokerType || acc.providerType,
              newName: displayName,
            });
            return {
              ...acc,
              name: displayName, // Always recalculate from brokerType/brokerName
              brokerName: acc.brokerName || displayName, // Ensure brokerName is set
            };
          });
          setConnectedAccounts(updatedAccounts);
          // Save updated names back to localStorage
          window.localStorage.setItem(
            "mesh_connected_accounts",
            JSON.stringify(updatedAccounts)
          );
        } catch {}
      }
      const token = window.localStorage.getItem("mesh_access_token");
      if (token) setAccessToken(token);
    }
  }, []);

  // Simple 1s step animation in the header banner
  useEffect(() => {
    const id = setInterval(
      () => setStepIndex((prev) => (prev + 1) % STEPS.length),
      1000
    );
    return () => clearInterval(id);
  }, []);

  // Dynamically import the Mesh SDK on the client
  useEffect(() => {
    let isMounted = true;

    async function initMesh() {
      try {
        const mod = await import("@meshconnect/web-link-sdk");
        if (!isMounted) return;

        const instance = mod.createLink({
          clientId,
          onIntegrationConnected: async (payload: any) => {
            console.log(
              "[Mesh] onIntegrationConnected - full payload:",
              JSON.stringify(payload, null, 2)
            );
            
            // Log top-level broker info immediately - check if payload is nested
            console.log("[Mesh] Top-level payload broker info:", {
              brokerType: payload.brokerType,
              brokerName: payload.brokerName,
              allKeys: Object.keys(payload),
              payloadType: typeof payload,
              hasAccessToken: !!payload.accessToken,
              accessTokenType: typeof payload.accessToken,
            });

            const userId = "user-local-1";

            // Extract auth token (for managed transfers)
            // NOTE: payload.accessToken can be either:
            // 1. An object: {accountTokens: [{accessToken: "...", account: {...}}], brokerType: "..."}
            // 2. A string: "token_string" (legacy format)
            const rawToken =
              payload.accessToken ?? payload.token ?? payload.authToken ?? null;

            if (!rawToken) {
              console.warn("[Mesh] Missing access token in payload");
              return;
            }

            let fromAuthToken: string = "";
            let integrationToken: string | null = null; // For holdings API
            let refreshToken: string | null = null; // For token refresh
            let extractedMeshAccountId: string | null = null;
            let parsedToken: any = null;

            try {
              // Handle case where payload.accessToken is already an object (new format)
              if (typeof rawToken === "object" && rawToken !== null) {
                parsedToken = rawToken;
                console.log("[Mesh] rawToken is already an object, using directly");
              } else if (typeof rawToken === "string") {
                // Try to parse if it's a JSON string
                if (rawToken.startsWith("{") || rawToken.startsWith("[")) {
                  try {
                    parsedToken = JSON.parse(rawToken);
                    console.log("[Mesh] Successfully parsed rawToken as JSON string");
                  } catch (parseErr) {
                    console.warn("[Mesh] Failed to parse rawToken as JSON:", parseErr);
                    parsedToken = rawToken;
                  }
                } else {
                  // Plain string token
                  parsedToken = rawToken;
                }
              } else {
                parsedToken = rawToken;
              }

              // CRITICAL: Extract token from accountTokens[0].accessToken OR accountTokens[0].authToken
              // Priority 1: payload.accessToken.accountTokens[0].accessToken (new format - accessToken field)
              if (payload.accessToken && typeof payload.accessToken === "object" && payload.accessToken.accountTokens?.[0]?.accessToken) {
                const extracted = String(payload.accessToken.accountTokens[0].accessToken);
                if (extracted.length > 20 && !extracted.startsWith("{") && !extracted.startsWith("[")) {
                  fromAuthToken = extracted;
                  integrationToken = fromAuthToken;
                  extractedMeshAccountId =
                    payload.accessToken.accountTokens[0]?.account?.meshAccountId ??
                    payload.accessToken.accountTokens[0]?.account?.frontAccountId ??
                    null;
                  // Also extract refreshToken if available
                  if (payload.accessToken.accountTokens[0]?.refreshToken) {
                    refreshToken = String(payload.accessToken.accountTokens[0].refreshToken);
                  }
                  console.log("[Mesh] Extracted token from payload.accessToken.accountTokens[0].accessToken", {
                    tokenLength: extracted.length,
                    tokenPrefix: extracted.substring(0, 30),
                    meshAccountId: extractedMeshAccountId,
                    accountId: payload.accessToken.accountTokens[0]?.account?.accountId,
                    accountName: payload.accessToken.accountTokens[0]?.account?.accountName,
                  });
                }
              }

              // Priority 2: parsedToken.accountTokens[0].accessToken (if parsedToken is the object)
              if ((!fromAuthToken || fromAuthToken.length < 20) && parsedToken?.accountTokens?.[0]?.accessToken) {
                const extracted = String(parsedToken.accountTokens[0].accessToken);
                if (extracted.length > 20 && !extracted.startsWith("{")) {
                  fromAuthToken = extracted;
                  integrationToken = fromAuthToken;
                  extractedMeshAccountId =
                    parsedToken.accountTokens[0]?.account?.meshAccountId ?? null;
                  // Also extract refreshToken if available
                  if (!refreshToken && parsedToken.accountTokens[0]?.refreshToken) {
                    refreshToken = String(parsedToken.accountTokens[0].refreshToken);
                  }
                  console.log("[Mesh] Extracted token from parsedToken.accountTokens[0].accessToken");
                }
              }

              // Priority 3: accountTokens[0].authToken (fallback - some formats use authToken instead)
              if ((!fromAuthToken || fromAuthToken.length < 20) && parsedToken?.accountTokens?.[0]?.authToken) {
                const extracted = String(parsedToken.accountTokens[0].authToken);
                if (extracted.length > 20 && !extracted.startsWith("{")) {
                  fromAuthToken = extracted;
                  integrationToken = fromAuthToken;
                  extractedMeshAccountId =
                    parsedToken.accountTokens[0]?.account?.meshAccountId ?? null;
                  console.log("[Mesh] Extracted token from parsedToken.accountTokens[0].authToken");
                }
              }
              
              // Priority 4: Check payload.accountTokens (if payload itself has the structure)
              if ((!fromAuthToken || fromAuthToken.length < 20) && payload?.accountTokens?.[0]?.accessToken) {
                const extracted = String(payload.accountTokens[0].accessToken);
                if (extracted.length > 20 && !extracted.startsWith("{")) {
                  fromAuthToken = extracted;
                  integrationToken = fromAuthToken;
                  extractedMeshAccountId =
                    payload.accountTokens[0]?.account?.meshAccountId ?? null;
                  console.log("[Mesh] Extracted token from payload.accountTokens[0].accessToken");
                }
              }

              // Priority 5: payload.accountTokens[0].authToken
              if ((!fromAuthToken || fromAuthToken.length < 20) && payload?.accountTokens?.[0]?.authToken) {
                const extracted = String(payload.accountTokens[0].authToken);
                if (extracted.length > 20 && !extracted.startsWith("{")) {
                  fromAuthToken = extracted;
                  integrationToken = fromAuthToken;
                  extractedMeshAccountId =
                    payload.accountTokens[0]?.account?.meshAccountId ?? null;
                  console.log("[Mesh] Extracted token from payload.accountTokens[0].authToken");
                }
              }

              // Priority 3: Direct authToken in parsedToken
              if ((!fromAuthToken || fromAuthToken.length < 20) && parsedToken?.authToken) {
                const extracted = String(parsedToken.authToken);
                if (extracted.length > 20 && !extracted.startsWith("{")) {
                  fromAuthToken = extracted;
                  integrationToken = fromAuthToken;
                  console.log("[Mesh] Extracted token from parsedToken.authToken");
                }
              }

              // Priority 4: Direct authToken in payload
              if ((!fromAuthToken || fromAuthToken.length < 20) && payload.authToken) {
                const extracted = String(payload.authToken);
                if (extracted.length > 20 && !extracted.startsWith("{")) {
                  fromAuthToken = extracted;
                  integrationToken = fromAuthToken;
                  console.log("[Mesh] Extracted token from payload.authToken");
                }
              }

              // Priority 5: Direct integrationToken in payload
              if ((!fromAuthToken || fromAuthToken.length < 20) && payload.integrationToken) {
                const extracted = String(payload.integrationToken);
                if (extracted.length > 20 && !extracted.startsWith("{")) {
                  fromAuthToken = extracted;
                  integrationToken = fromAuthToken;
                  console.log("[Mesh] Extracted token from payload.integrationToken");
                }
              }

              // Priority 6: accessToken if it's a plain string (not JSON)
              if ((!fromAuthToken || fromAuthToken.length < 20) && payload.accessToken) {
                const extracted = String(payload.accessToken);
                if (extracted.length > 20 && !extracted.startsWith("{") && !extracted.startsWith("[")) {
                  fromAuthToken = extracted;
                  integrationToken = fromAuthToken;
                  console.log("[Mesh] Extracted token from payload.accessToken (plain string)");
                }
              }

              // Priority 7: rawToken if it's a plain string (not JSON)
              if ((!fromAuthToken || fromAuthToken.length < 20) && typeof rawToken === "string") {
                if (rawToken.length > 20 && !rawToken.startsWith("{") && !rawToken.startsWith("[")) {
                  fromAuthToken = rawToken;
                  integrationToken = fromAuthToken;
                  console.log("[Mesh] Using rawToken as plain string");
                }
              }
              
              // Validate that we have a proper token
              if (!fromAuthToken || fromAuthToken.length < 20 || fromAuthToken.startsWith("{") || fromAuthToken.startsWith("[")) {
                console.error("[Mesh] Invalid fromAuthToken extracted:", {
                  fromAuthTokenLength: fromAuthToken?.length,
                  fromAuthTokenPrefix: fromAuthToken?.substring(0, 50),
                  hasAccountTokens: !!parsedToken?.accountTokens,
                  parsedTokenKeys: parsedToken && typeof parsedToken === "object" ? Object.keys(parsedToken) : "not an object",
                  payloadKeys: Object.keys(payload),
                  rawTokenType: typeof rawToken,
                  rawTokenLength: typeof rawToken === "string" ? rawToken.length : "not a string",
                  rawTokenPrefix: typeof rawToken === "string" ? rawToken.substring(0, 50) : "not a string",
                });
                throw new Error("Failed to extract valid authToken from connection payload");
              }
            } catch (err) {
              console.error("[Mesh] Error parsing token:", err);
              // Don't set fromAuthToken to rawToken if it's JSON - that will fail validation
              throw err; // Re-throw to prevent continuing with invalid token
            }

            if (!extractedMeshAccountId) {
              const accountData =
                parsedToken?.accountTokens?.[0]?.account ??
                payload.accountTokens?.[0]?.account ??
                payload.account ??
                {};

              extractedMeshAccountId =
                accountData.meshAccountId ??
                accountData.frontAccountId ??
                parsedToken?.accountTokens?.[0]?.account?.meshAccountId ??
                parsedToken?.accountTokens?.[0]?.account?.frontAccountId ??
                payload.meshAccountId ??
                payload.frontAccountId ??
                payload.accountId ??
                null;
            }

            // Extract account info - check both payload and parsedToken
            const accountData =
              parsedToken?.accountTokens?.[0]?.account ??
              payload.accountTokens?.[0]?.account ??
              payload.account ??
              {};

            const accountId = 
              accountData.accountId ??
              payload.accountId ??
              accountData.meshAccountId ??
              accountData.frontAccountId ??
              extractedMeshAccountId ??
              null;
            
            // Also extract frontAccountId if available (may be same as meshAccountId but stored separately for compatibility)
            const frontAccountId = 
              accountData.frontAccountId ??
              parsedToken?.accountTokens?.[0]?.account?.frontAccountId ??
              payload.frontAccountId ??
              extractedMeshAccountId; // Fallback to meshAccountId if frontAccountId not available
            
            const integrationId = payload.integrationId ?? null;
            
            // Extract provider type - check TOP LEVEL payload first (most reliable)
            // According to Mesh docs, brokerType and brokerName are at payload root
            const meshProviderType =
              payload.brokerType ??  // Top level: "deFiWallet", "coinbase", etc. - CHECK THIS FIRST
              payload.type ??
              payload.integrationType ??
              payload.providerType ??
              parsedToken?.brokerType ??
              parsedToken?.type ??
              accountData.brokerType ??
              null;

            // Extract wallet address for MetaMask/DeFi wallets (for "To Address" in transfers)
            // For DeFi wallets, we need to fetch the actual address from Mesh API
            // The accountId is NOT the wallet address - it's a Mesh internal ID
            let walletAddress = 
              accountData.address ??
              accountData.walletAddress ??
              payload.address ??
              payload.walletAddress ??
              null;
            
            // For DeFi wallets, if we don't have an address yet, we'll fetch it after connection.
            // Some providers (e.g., MetaMask) may return the EVM address without the 0x prefix.
            if (!walletAddress && accountId && typeof accountId === "string") {
              if (accountId.startsWith("0x") && accountId.length === 42) {
                walletAddress = accountId;
              } else if (/^[0-9a-fA-F]{40}$/.test(accountId)) {
                walletAddress = `0x${accountId}`;
              }
            }
            
            // For Coinbase Wallet and other DeFi wallets, we'll fetch the address via API
            // This will be done asynchronously after connection

            // Use brokerName if available (e.g., "MetaMask", "Coinbase") - TOP LEVEL FIRST
            // IMPORTANT: payload.brokerName is the broker name (e.g., "Coinbase")
            // accountData.accountName is the account name (e.g., "SOL wallets") - use this as fallback only
            const brokerName = 
              payload.brokerName ??  // Top level - CHECK THIS FIRST (e.g., "Coinbase", "MetaMask")
              parsedToken?.brokerName ??
              payload.account?.accountName ??
              accountData.accountName ??  // Fallback to account name (e.g., "SOL wallets") only if brokerName not available
              null;
            
            console.log("[Mesh] Extracted values:", {
              meshProviderType,
              brokerName,
              payloadHasBrokerType: !!payload.brokerType,
              payloadHasBrokerName: !!payload.brokerName,
            });

            // Create enhanced payload for display name extraction
            // Ensure brokerName is explicitly set even if we got it from payload
            const enhancedPayload = {
              ...payload,
              brokerType: meshProviderType || payload.brokerType, // Use extracted or fallback to payload
              brokerName: brokerName || payload.brokerName, // Use extracted or fallback to payload
              name: brokerName || payload.brokerName, // Use brokerName as name fallback
            };

            console.log("[Mesh] Calling getAccountDisplayName with:", {
              providerType: meshProviderType,
              brokerName: enhancedPayload.brokerName,
              enhancedPayloadKeys: Object.keys(enhancedPayload),
            });

            // Use brokerName directly if available (most reliable), otherwise use display name function
            // brokerName from payload is the broker name (e.g., "Coinbase"), not account name
            const displayName = 
              payload.brokerName ||  // Use payload.brokerName FIRST (e.g., "Coinbase")
              brokerName || 
              getAccountDisplayName(meshProviderType, enhancedPayload);
            
            console.log("[Mesh] Final display name:", {
              brokerName,
              payloadBrokerName: payload.brokerName,
              displayNameResult: displayName,
              meshProviderType,
            });

            // Log for debugging - show full payload structure, especially for wallet address extraction
            console.log("[Mesh] Account connection details:", {
              payloadKeys: Object.keys(payload),
              parsedTokenKeys: parsedToken ? Object.keys(parsedToken) : null,
              brokerType: payload.brokerType ?? parsedToken?.brokerType,
              brokerName: payload.brokerName ?? parsedToken?.brokerName,
              accountDataBrokerType: accountData.brokerType,
              accountDataAccountName: accountData.accountName,
              providerType: meshProviderType,
              displayName,
              integrationId,
              accountId,
              extractedMeshAccountId,
              // Log address-related fields for debugging
              accountDataAddress: accountData.address,
              accountDataWalletAddress: accountData.walletAddress,
              payloadAddress: payload.address,
              payloadWalletAddress: payload.walletAddress,
              accountTokensAddress: parsedToken?.accountTokens?.[0]?.account?.address,
              accountTokensWalletAddress: parsedToken?.accountTokens?.[0]?.account?.walletAddress,
              extractedWalletAddress: walletAddress,
              // Log full accountData structure for DeFi wallets
              accountDataFull: meshProviderType === "deFiWallet" || meshProviderType === "metamask" ? accountData : undefined,
            });

            // Store in state
            setAccessToken(fromAuthToken);
            setProviderType(meshProviderType || "unknown");
            setMeshAccountId(extractedMeshAccountId);

            // Store in localStorage
            try {
              window.localStorage.setItem("mesh_access_token", fromAuthToken);
              window.localStorage.setItem("mesh_provider_type", meshProviderType || "unknown");
              if (integrationToken) {
                window.localStorage.setItem("mesh_integration_token", integrationToken);
              }
              if (extractedMeshAccountId) {
                window.localStorage.setItem(
                  "mesh_account_id",
                  extractedMeshAccountId
                );
              }
              // Store wallet address for MetaMask/DeFi wallets (for transfer "To Address")
              if (walletAddress && (meshProviderType === "deFiWallet" || meshProviderType === "metamask")) {
                window.localStorage.setItem("app_wallet_address", walletAddress);
              }

              // Add to connected accounts
              // IMPORTANT: For Managed Transfers, we need fromAuthToken (authToken from accountTokens[0].authToken)
              // For Holdings API, we use integrationToken (which is the same as fromAuthToken for most cases)
              const newAccount = {
                accountId: accountId || extractedMeshAccountId,
                meshAccountId: extractedMeshAccountId,
                frontAccountId: frontAccountId || extractedMeshAccountId, // Store frontAccountId for compatibility
                integrationId,
                providerType: meshProviderType || "unknown",
                name: displayName,
                brokerType: meshProviderType || "unknown", // Store the actual brokerType
                brokerName, // Store brokerName for reference (e.g., "Coinbase", "MetaMask")
                accountName: accountData.accountName, // Store account name (e.g., "SOL wallets")
                integrationToken, // Store integration token for holdings API
                authToken: fromAuthToken, // Store fromAuthToken for Managed Transfers (this is the authToken from accountTokens[0].authToken)
                fromAuthToken, // Explicitly store for Managed Transfers API
                refreshToken, // Store refreshToken for token refresh if needed
                type: meshProviderType || "unknown", // Alias for holdings API (Mesh expects 'type')
                walletAddress, // Store wallet address for transfers (may be null initially for DeFi wallets)
              };

              // Log the stored account for debugging
              console.log("[Mesh] Storing account:", {
                name: displayName,
                meshAccountId: extractedMeshAccountId,
                accountId: accountId || extractedMeshAccountId,
                brokerType: meshProviderType,
                fromAuthTokenLength: fromAuthToken?.length,
                fromAuthTokenPrefix: fromAuthToken?.substring(0, 30),
                integrationTokenLength: integrationToken?.length,
                hasRefreshToken: !!refreshToken,
              });

              const existing = JSON.parse(
                window.localStorage.getItem("mesh_connected_accounts") || "[]"
              );
              const updated = [...existing, newAccount];
              window.localStorage.setItem(
                "mesh_connected_accounts",
                JSON.stringify(updated)
              );
              setConnectedAccounts(updated);

              // For DeFi wallets (Coinbase Wallet, MetaMask), try to fetch the actual wallet address
              // Try using the addresses/list endpoint which doesn't require networkId
              if ((meshProviderType === "deFiWallet" || meshProviderType === "metamask") && !walletAddress && integrationToken) {
                // Try to get wallet address using the list endpoint (no networkId required)
                fetch("/api/wallet-address", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    authToken: integrationToken,
                    type: meshProviderType,
                    // No networkId needed - will use list endpoint
                  }),
                })
                  .then((addrRes) => {
                    if (!addrRes.ok) {
                      throw new Error(`HTTP ${addrRes.status}`);
                    }
                    return addrRes.json();
                  })
                  .then((addrData) => {
                    const fetchedAddress = addrData.content?.address;
                    if (fetchedAddress && typeof fetchedAddress === "string" && fetchedAddress.startsWith("0x") && fetchedAddress.length === 42) {
                      // Update the account with the correct wallet address
                      const updatedAccounts = JSON.parse(
                        window.localStorage.getItem("mesh_connected_accounts") || "[]"
                      );
                      const accountIndex = updatedAccounts.findIndex(
                        (acc: any) => acc.accountId === newAccount.accountId || acc.meshAccountId === newAccount.meshAccountId
                      );
                      if (accountIndex >= 0) {
                        updatedAccounts[accountIndex].walletAddress = fetchedAddress;
                        window.localStorage.setItem(
                          "mesh_connected_accounts",
                          JSON.stringify(updatedAccounts)
                        );
                        setConnectedAccounts(updatedAccounts);
                        console.log("[Mesh] Fetched wallet address:", fetchedAddress);
                      }
                    } else {
                      console.warn("[Mesh] Invalid address format received:", fetchedAddress);
                    }
                  })
                  .catch((err) => {
                    console.warn("[Mesh] Failed to fetch wallet address (will try from portfolio later):", err.message);
                    // Don't show error to user - portfolio page will try to extract from holdings
                  });
              }
            } catch {}

            // Store in backend
            try {
              await fetch("/api/auth/store", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  userId,
                  providerType: meshProviderType || brokerName?.toLowerCase() || "unknown",
                  accessToken: fromAuthToken,
                  accountId,
                  integrationId,
                  rawPayload: payload,
                }),
              });
            } catch (err) {
              console.error("[Mesh] Failed to store auth", err);
            }
          },
          onExit: (err: any) => {
            console.log("[Mesh] onExit", err);
            setIsConnecting(false);
          },
        });

        setMeshLink(instance);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Failed to load Mesh SDK";
        console.error("[Mesh] init error:", message);
        setError(message);
      }
    }

    if (typeof window !== "undefined") {
      void initMesh();
    }

    return () => {
      isMounted = false;
    };
  }, []);

  const handleConnectExchange = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      // If user prefers Solana, try to include a Solana transfer context so Mesh Link routes Phantom to Solana
      // instead of defaulting to the EVM provider.
      let solanaTransferOptions: any = undefined;
      if (walletNetworkPreference === "solana") {
        try {
          const networksRes = await fetch("/api/networks");
          const networksJson = await networksRes.json().catch(() => ({}));
          const networksList =
            networksJson?.content?.networks || networksJson?.networks || [];
          const solanaNetwork =
            networksList.find((n: any) => n?.networkType === "solana") ||
            networksList.find((n: any) => String(n?.name || "").toLowerCase().includes("solana"));
          const solanaNetworkId = solanaNetwork?.id;
          if (solanaNetworkId) {
            solanaTransferOptions = {
              toAddresses: [
                {
                  networkId: solanaNetworkId,
                  symbol: "SOL",
                  // address is optional; Link can still use this to route the correct wallet network
                },
              ],
            };
          }
        } catch (e) {
          console.warn("[Connect Exchange] Failed to prefetch Solana network for Link token:", e);
        }
      }

      const response = await fetch("/api/linktoken", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: "user-local-1",
          // Hint Mesh Link which wallet network we want when connecting multi-chain wallets like Phantom.
          // This helps ensure Phantom connects as Solana (base58) vs EVM (0x...) when desired.
          ...(walletNetworkPreference === "auto"
            ? {}
            : {
                verifyWalletOptions: {
                  networkType: walletNetworkPreference,
                  verificationMethods: ["signedMessage"],
                  message:
                    walletNetworkPreference === "solana"
                      ? "Mesh Demo: verify your Solana wallet ownership"
                      : "Mesh Demo: verify your EVM wallet ownership",
                },
                ...(solanaTransferOptions ? { transferOptions: solanaTransferOptions } : {}),
              }),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create link token");
      }

      const { linkToken } = (await response.json()) as { linkToken: string };

      if (!meshLink) {
        throw new Error("Mesh Link SDK not initialised in browser");
      }

      meshLink.openLink(linkToken);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      console.error("[Connect Exchange] Error:", message);
      setError(message);
    } finally {
      setIsConnecting(false);
    }
  };

  const loadPortfolio = async () => {
    try {
      const token = accessToken || window.localStorage.getItem("mesh_access_token");
      if (!token) {
        throw new Error("No access token available. Connect via Mesh Link first.");
      }

      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accessToken: String(token),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load portfolio");
      }

      const data = await res.json();
      // Update accounts from portfolio data
      if (data.accounts) {
        setConnectedAccounts(data.accounts);
        window.localStorage.setItem(
          "mesh_connected_accounts",
          JSON.stringify(data.accounts)
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      console.error("[Portfolio] Error:", message);
      setError(message);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Mesh API</h1>
          <Navigation />
        </div>

        <div className="bg-zinc-950/60 border border-emerald-500/40 rounded-2xl p-5 mb-8 shadow-[0_0_40px_rgba(16,185,129,0.25)]">
          {/* Top step headers with progress bar */}
          <div className="flex items-center justify-between gap-6 mb-6">
            {STEPS.map((step, idx) => {
              const isActive = idx === stepIndex;
              const isCompleted = idx < stepIndex;
              return (
                <div
                  key={step.label}
                  className="flex-1 flex flex-col items-center text-center"
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
                      isActive || isCompleted
                        ? "border-emerald-400 bg-emerald-500/20"
                        : "border-emerald-800 bg-emerald-900/40"
                    }`}
                  >
                    <span className="text-lg">
                      {step.icon}
                    </span>
                  </div>
                  <p
                    className={`mt-2 text-[11px] font-medium ${
                      isActive || isCompleted
                        ? "text-emerald-100"
                        : "text-emerald-900/70"
                    }`}
                  >
                    {step.label}
                  </p>
                  <div className="mt-2 h-[3px] w-full rounded-full bg-emerald-900/60 overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        isCompleted || isActive
                          ? "bg-emerald-400"
                          : "bg-transparent"
                      }`}
                      style={{
                        width: isCompleted ? "100%" : isActive ? "60%" : "0%",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Main animated card showing current step only */}
          <div className="mt-1 rounded-2xl px-8 py-6 flex flex-col items-center justify-center gap-6 text-center">
            <div className="flex items-center justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-emerald-400 bg-emerald-500/15 shadow-[0_0_35px_rgba(16,185,129,0.7)]">
                <span className="text-3xl">
                  {currentStep.icon}
                </span>
              </div>
            </div>
            <div className="text-center max-w-md">
              <p className="text-xl md:text-2xl font-semibold text-emerald-50">
                {currentStep.label}
              </p>
              <p className="mt-1 text-sm text-emerald-100/90">
                {currentStep.sub}
              </p>
            </div>
          </div>

          {/* Dots pager */}
          <div className="flex justify-center gap-2 mt-4">
            {STEPS.map((_, idx) => (
              <span
                key={idx}
                className={`h-1.5 w-4 rounded-full transition-colors ${
                  idx === stepIndex ? "bg-emerald-400" : "bg-emerald-900"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="text-center mb-8">
          <button
            type="button"
            onClick={handleConnectExchange}
            disabled={isConnecting}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-6 py-3 text-lg font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {isConnecting ? "Opening Mesh Link..." : "+ Connect Account"}
          </button>
          <p className="mt-2 text-sm text-zinc-400">
            Opens Mesh Link to connect any supported exchange or wallet.
          </p>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-6">
            <p className="text-red-400">Error: {error}</p>
          </div>
        )}

        {connectedAccounts.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                Connected Accounts ({connectedAccounts.length})
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    // Reload accounts from portfolio API to get fresh data
                    loadPortfolio();
                  }}
                  className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-sm text-zinc-300"
                >
                  Refresh
                </button>
                <button
                  onClick={() => {
                    // Clear all connected accounts and reset state
                    if (confirm("Are you sure you want to clear all connected accounts? You'll need to reconnect them.")) {
                      window.localStorage.removeItem("mesh_connected_accounts");
                      window.localStorage.removeItem("mesh_access_token");
                      window.localStorage.removeItem("mesh_provider_type");
                      window.localStorage.removeItem("mesh_account_id");
                      setConnectedAccounts([]);
                      setAccessToken(null);
                      setProviderType(null);
                      setMeshAccountId(null);
                      setError(null);
                      console.log("[Accounts] Cleared all connected accounts");
                    }
                  }}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm text-white"
                >
                  Clear All
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {connectedAccounts.map((account) => (
                <div
                  key={account.accountId}
                  className="bg-zinc-900 rounded-lg p-4 border border-zinc-800"
                >
                  <div className="flex items-center gap-2 mb-2">
                    {account.brokerType === "metamask" ? (
                      <span className="text-2xl">🦊</span>
                    ) : (
                      <span className="text-2xl">🔵</span>
                    )}
                    <p className="font-semibold">{account.name}</p>
                    <span className="ml-auto px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                      Connected
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mb-2">
                    Account ID: {account.accountId || account.meshAccountId || "N/A"}
                  </p>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => {
                        // Remove this specific account
                        const updated = connectedAccounts.filter(
                          (acc) => acc.accountId !== account.accountId
                        );
                        setConnectedAccounts(updated);
                        window.localStorage.setItem(
                          "mesh_connected_accounts",
                          JSON.stringify(updated)
                        );
                        // If this was the last account, clear auth token too
                        if (updated.length === 0) {
                          window.localStorage.removeItem("mesh_access_token");
                          setAccessToken(null);
                        }
                      }}
                      className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-sm"
                    >
                      Disconnect
                    </button>
                    <button
                      onClick={() => {
                        // Navigate to transfer page with this account pre-selected
                        window.location.href = `/transfer?accountId=${account.accountId}`;
                      }}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-sm"
                    >
                      Transfer →
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-zinc-900 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-4">Connection Status</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left py-2 px-4">Integration</th>
                      <th className="text-left py-2 px-4">Status</th>
                      <th className="text-left py-2 px-4">Broker Type</th>
                      <th className="text-left py-2 px-4">Account ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {connectedAccounts.map((account) => (
                      <tr key={account.accountId} className="border-b border-zinc-800">
                        <td className="py-2 px-4">
                          <div className="flex items-center gap-2">
                            {account.brokerType === "metamask" ? (
                              <span>🦊</span>
                            ) : (
                              <span>🔵</span>
                            )}
                            {account.name}
                          </div>
                        </td>
                        <td className="py-2 px-4">
                          <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                            Connected
                          </span>
                        </td>
                        <td className="py-2 px-4 text-zinc-400">
                          {account.brokerType}
                        </td>
                        <td className="py-2 px-4 text-zinc-400 text-xs font-mono">
                          {account.accountId}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
