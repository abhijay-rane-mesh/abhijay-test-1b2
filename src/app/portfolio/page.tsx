"use client";

import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";

export default function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPortfolio = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = window.localStorage.getItem("mesh_access_token");
      if (!token) {
        throw new Error("No access token. Connect an account first.");
      }

      // Get all connected accounts for Mesh holdings API
      // Each account should have authToken and type for holdings API
      const connectedAccountsStr = window.localStorage.getItem("mesh_connected_accounts");
      let connectedAccounts: any[] = [];
      
      if (connectedAccountsStr) {
        try {
          connectedAccounts = JSON.parse(connectedAccountsStr);
        } catch (e) {
          console.error("[Portfolio] Failed to parse connected accounts", e);
        }
      }

      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          accessToken: token,
          connectedAccounts: connectedAccounts.length > 0 ? connectedAccounts : undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load portfolio");
      }

          const data = await res.json();
          setPortfolio(data);
          
          // Update connected accounts with extracted wallet addresses
          if (data.walletAddresses && Object.keys(data.walletAddresses).length > 0) {
            const connectedAccountsStr = window.localStorage.getItem("mesh_connected_accounts");
            if (connectedAccountsStr) {
              try {
                const connectedAccounts = JSON.parse(connectedAccountsStr);
                let updated = false;
                for (const accountId in data.walletAddresses) {
                  const walletAddress = data.walletAddresses[accountId];
                  const accountIndex = connectedAccounts.findIndex(
                    (acc: any) => acc.accountId === accountId || acc.meshAccountId === accountId
                  );
                  if (accountIndex >= 0 && walletAddress && walletAddress.startsWith("0x")) {
                    if (connectedAccounts[accountIndex].walletAddress !== walletAddress) {
                      connectedAccounts[accountIndex].walletAddress = walletAddress;
                      updated = true;
                      console.log(`[Portfolio] Updated wallet address for account ${accountId}:`, walletAddress);
                    }
                  }
                }
                if (updated) {
                  window.localStorage.setItem("mesh_connected_accounts", JSON.stringify(connectedAccounts));
                }
              } catch (e) {
                console.error("Failed to update wallet addresses from portfolio", e);
              }
            }
          }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortfolio();
  }, []);

  const holdingsByAccount = portfolio?.holdings?.reduce((acc: any, holding: any) => {
    if (!acc[holding.accountId]) {
      acc[holding.accountId] = [];
    }
    acc[holding.accountId].push(holding);
    return acc;
  }, {}) || {};

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Mesh API Demo</h1>
        <Navigation />

        <div className="bg-blue-600/20 border border-blue-500/50 rounded-lg p-4 mb-6">
          <p className="text-sm">
            <strong>Portfolio API</strong> Fetches portfolio data for all connected accounts dynamically. Data is stored in Zustand and updated when you switch to this tab.
          </p>
        </div>

        {loading && <p className="text-zinc-400">Loading portfolio...</p>}
        {error && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-6">
            <p className="text-red-400">Error: {error}</p>
          </div>
        )}

        {portfolio && (
          <>
            <div className="bg-zinc-900 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Portfolio Overview</h2>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <p className="text-zinc-400 text-sm">Total Portfolio Value</p>
                  <p className="text-2xl font-bold text-blue-400">
                    ${portfolio.totalValue?.toFixed(2) || "0.00"}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-400 text-sm">Connected Accounts</p>
                  <p className="text-2xl font-bold">{portfolio.totalAccounts || 0}</p>
                </div>
                <div>
                  <p className="text-zinc-400 text-sm">Performance</p>
                  <p className="text-2xl font-bold text-green-400">+0.00%</p>
                </div>
                <div>
                  <p className="text-zinc-400 text-sm">Total Assets</p>
                  <p className="text-2xl font-bold">{portfolio.totalAssets || 0}</p>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">All Holdings</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left py-2 px-4">Asset</th>
                      <th className="text-right py-2 px-4">Amount</th>
                      <th className="text-right py-2 px-4">Price</th>
                      <th className="text-right py-2 px-4">Value</th>
                      <th className="text-left py-2 px-4">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.holdings?.map((holding: any, idx: number) => (
                      <tr key={idx} className="border-b border-zinc-800">
                        <td className="py-2 px-4">
                          <div>
                            <p className="font-medium">{holding.symbol}</p>
                            {holding.name && (
                              <p className="text-xs text-zinc-400">{holding.name}</p>
                            )}
                          </div>
                        </td>
                        <td className="text-right py-2 px-4">{holding.amount.toFixed(6)}</td>
                        <td className="text-right py-2 px-4">${holding.price.toFixed(2)}</td>
                        <td className="text-right py-2 px-4">${holding.value.toFixed(2)}</td>
                        <td className="py-2 px-4">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              holding.source === "MetaMask"
                                ? "bg-pink-500/20 text-pink-400"
                                : "bg-blue-500/20 text-blue-400"
                            }`}
                          >
                            {holding.source}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-zinc-900 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">By Account</h2>
              <div className="grid grid-cols-2 gap-4">
                {portfolio.accounts?.map((account: any) => {
                  const accountHoldings = holdingsByAccount[account.accountId] || [];
                  const accountValue = accountHoldings.reduce(
                    (sum: number, h: any) => sum + h.value,
                    0
                  );
                  return (
                    <div key={account.accountId} className="bg-zinc-800 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        {account.brokerType === "metamask" ? (
                          <span className="text-2xl">🦊</span>
                        ) : (
                          <span className="text-2xl">🔵</span>
                        )}
                        <p className="font-semibold">{account.name}</p>
                      </div>
                      <p className="text-2xl font-bold text-blue-400">${accountValue.toFixed(2)}</p>
                      {account.brokerType === "metamask" && (
                        <p className="text-xs text-zinc-400 mt-2">
                          Deposit Address (Base): {account.accountId?.substring(0, 20)}...
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

