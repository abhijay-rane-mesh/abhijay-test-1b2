"use client";

import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";

export default function HistoryPage() {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const loadTransfers = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/transfers/mesh?count=50&descendingOrder=true");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load transfers");
      }

      const data = await res.json();
      setTransfers(data.content?.items || []);
      setTotal(data.content?.total || 0);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransfers();
  }, []);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "succeeded":
        return "text-green-400 bg-green-500/20";
      case "failed":
        return "text-red-400 bg-red-500/20";
      case "pending":
        return "text-yellow-400 bg-yellow-500/20";
      default:
        return "text-zinc-400 bg-zinc-500/20";
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Mesh API Demo</h1>
        <Navigation />

        <div className="bg-blue-600/20 border border-blue-500/50 rounded-lg p-4 mb-6">
          <p className="text-sm">
            <strong>Transfer History API</strong> Fetches transfers initiated by Mesh using{" "}
            <code className="text-blue-300">GET /api/v1/transfers/managed/mesh</code>
          </p>
        </div>

        <div className="bg-zinc-900 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Transfer History</h2>
            <button
              onClick={loadTransfers}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-4">
              <p className="text-red-400">Error: {error}</p>
            </div>
          )}

          {loading && <p className="text-zinc-400">Loading transfers...</p>}

          {!loading && !error && (
            <>
              <p className="text-zinc-400 mb-4">Total transfers: {total}</p>
              {transfers.length === 0 ? (
                <p className="text-zinc-400">No transfers found.</p>
              ) : (
                <div className="space-y-4">
                  {transfers.map((transfer) => (
                    <div
                      key={transfer.id}
                      className="bg-zinc-800 rounded-lg p-4 border border-zinc-700"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-lg">
                              {transfer.amount} {transfer.symbol}
                            </span>
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                                transfer.status
                              )}`}
                            >
                              {transfer.status}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-400">
                            {transfer.from?.name || transfer.from?.type || "Unknown"} →{" "}
                            {transfer.networkName || "Unknown Network"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            ${transfer.amountInFiat?.toFixed(2) || "0.00"}
                          </p>
                          <p className="text-xs text-zinc-400">
                            {formatDate(transfer.createdTimestamp)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                        <div>
                          <p className="text-zinc-400">Transfer Type</p>
                          <p className="font-medium capitalize">
                            {transfer.transferType || "N/A"}
                          </p>
                        </div>
                        <div>
                          <p className="text-zinc-400">Destination</p>
                          <p className="font-mono text-xs break-all">
                            {transfer.destinationAddress
                              ? `${transfer.destinationAddress.substring(0, 20)}...`
                              : "N/A"}
                          </p>
                        </div>
                        {transfer.hash && (
                          <div className="col-span-2">
                            <p className="text-zinc-400">Transaction Hash</p>
                            <a
                              href={transfer.infoUrl || "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-xs text-blue-400 hover:text-blue-300 break-all"
                            >
                              {transfer.hash}
                            </a>
                          </div>
                        )}
                        {transfer.totalFeesAmountInFiat > 0 && (
                          <div>
                            <p className="text-zinc-400">Total Fees</p>
                            <p className="font-medium">
                              ${transfer.totalFeesAmountInFiat.toFixed(2)}
                            </p>
                          </div>
                        )}
                        {transfer.executedTimestamp && (
                          <div>
                            <p className="text-zinc-400">Executed</p>
                            <p className="font-medium text-xs">
                              {formatDate(transfer.executedTimestamp)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}


