/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";
import { getAccountDisplayName } from "@/lib/accountUtils";

const clientId = process.env.NEXT_PUBLIC_MESH_CLIENT_ID!;

export default function Home() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meshLink, setMeshLink] = useState<ReturnType<any> | null>(null);
  const [connectedAccounts, setConnectedAccounts] = useState<any[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [providerType, setProviderType] = useState<string | null>(null);
  const [meshAccountId, setMeshAccountId] = useState<string | null>(null);

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

            // Extract auth token
            const rawToken =
              payload.accessToken ?? payload.token ?? payload.authToken ?? null;

            if (!rawToken) {
              console.warn("[Mesh] Missing access token in payload");
              return;
            }

            let fromAuthToken: string = "";
            let extractedMeshAccountId: string | null = null;
            let parsedToken: any = null;

            try {
              parsedToken = rawToken;
              if (typeof rawToken === "string") {
                try {
                  parsedToken = JSON.parse(rawToken);
                } catch {
                  parsedToken = rawToken;
                }
              }

              if (parsedToken?.accountTokens?.[0]?.authToken) {
                fromAuthToken = String(parsedToken.accountTokens[0].authToken);
                extractedMeshAccountId =
                  parsedToken.accountTokens[0]?.account?.meshAccountId ?? null;
              } else if (
                payload.accessToken &&
                typeof payload.accessToken === "string" &&
                payload.accessToken.length > 20
              ) {
                fromAuthToken = payload.accessToken;
              } else if (
                typeof rawToken === "string" &&
                rawToken.length > 20 &&
                !rawToken.startsWith("{")
              ) {
                fromAuthToken = rawToken;
              } else {
                fromAuthToken =
                  typeof rawToken === "string"
                    ? rawToken
                    : JSON.stringify(rawToken);
              }
            } catch (err) {
              console.error("[Mesh] Error parsing token:", err);
              fromAuthToken =
                typeof rawToken === "string"
                  ? rawToken
                  : JSON.stringify(rawToken);
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
                payload.meshAccountId ??
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
              extractedMeshAccountId ??
              null;
            
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

            // Log for debugging - show full payload structure
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
            });

            // Store in state
            setAccessToken(fromAuthToken);
            setProviderType(meshProviderType || "unknown");
            setMeshAccountId(extractedMeshAccountId);

            // Store in localStorage
            try {
              window.localStorage.setItem("mesh_access_token", fromAuthToken);
              window.localStorage.setItem("mesh_provider_type", meshProviderType || "unknown");
              if (extractedMeshAccountId) {
                window.localStorage.setItem(
                  "mesh_account_id",
                  extractedMeshAccountId
                );
              }

              // Add to connected accounts
              const newAccount = {
                accountId: accountId || extractedMeshAccountId,
                meshAccountId: extractedMeshAccountId,
                integrationId,
                providerType: meshProviderType || "unknown",
                name: displayName,
                brokerType: meshProviderType || "unknown", // Store the actual brokerType
                brokerName, // Store brokerName for reference (e.g., "Coinbase", "MetaMask")
                accountName: accountData.accountName, // Store account name (e.g., "SOL wallets")
              };

              const existing = JSON.parse(
                window.localStorage.getItem("mesh_connected_accounts") || "[]"
              );
              const updated = [...existing, newAccount];
              window.localStorage.setItem(
                "mesh_connected_accounts",
                JSON.stringify(updated)
              );
              setConnectedAccounts(updated);
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

      const response = await fetch("/api/linktoken", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: "user-local-1",
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
        <h1 className="text-3xl font-bold mb-6">Mesh API Demo</h1>
        <Navigation />

        <div className="bg-blue-600/20 border border-blue-500/50 rounded-lg p-4 mb-6">
          <p className="text-sm">
            <strong>Dynamic Connection System.</strong> Connect any exchange or wallet using Mesh Link SDK. Connections are stored in Zustand and persisted to localStorage. Click the button below to open Mesh Link and select which account to connect.
          </p>
        </div>

        <div className="text-center mb-8">
          <button
            type="button"
            onClick={handleConnectExchange}
            disabled={isConnecting}
            className="inline-flex items-center justify-center rounded-lg bg-purple-600 px-6 py-3 text-lg font-medium text-white hover:bg-purple-700 disabled:opacity-60"
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
                    Account: {account.accountId?.substring(0, 20)}...
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
                      className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm"
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
                        <td className="py-2 px-4 text-zinc-400 text-xs">
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
