"use client";

import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";

type TransferStep = "configure" | "preview" | "execute" | "success";

export default function TransferPage() {
  const [step, setStep] = useState<TransferStep>("configure");
  const [networks, setNetworks] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<string>("");
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [toAddress, setToAddress] = useState<string>("");
  const [amount, setAmount] = useState<string>("0");
  const [transferId, setTransferId] = useState<string>("");
  const [previewData, setPreviewData] = useState<any>(null);
  const [mfaCode, setMfaCode] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferResult, setTransferResult] = useState<any>(null);

  useEffect(() => {
    // Load wallet address from localStorage
    const stored = window.localStorage.getItem("app_wallet_address");
    if (stored) {
      setToAddress(stored);
    }

    // Load networks
    fetch("/api/networks")
      .then((res) => res.json())
      .then((data) => {
        const networksList =
          data.content?.networks || data.content || data.networks || [];
        setNetworks(networksList);
        // Auto-select Base if available
        const base = networksList.find(
          (n: any) => n.name?.toLowerCase().includes("base")
        );
        if (base) setSelectedNetwork(base.id);
      })
      .catch(console.error);

    // Load accounts (simplified - in real app, fetch from portfolio API)
    const token = window.localStorage.getItem("mesh_access_token");
    if (token) {
      fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: token }),
      })
        .then((res) => res.json())
        .then((data) => {
          setAccounts(data.accounts || []);
          if (data.accounts?.length > 0) {
            setSelectedAccount(data.accounts[0].accountId);
          }
        })
        .catch(console.error);
    }
  }, []);

  const handleConfigure = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = window.localStorage.getItem("mesh_access_token");
      if (!token) throw new Error("No access token");

      const res = await fetch("/api/transfer/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: token,
          fromAccountId: selectedAccount,
          toAddress,
          symbol: "USDC",
          networkId: selectedNetwork,
          amount: parseFloat(amount),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to configure transfer");
      }

      const data = await res.json();
      setTransferId(data.transferId || data.content?.transferId);
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = window.localStorage.getItem("mesh_access_token");
      if (!token) throw new Error("No access token");

      const res = await fetch("/api/transfer/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: token,
          transferId,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to preview transfer");
      }

      const data = await res.json();
      setPreviewData(data);
      setStep("execute");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = window.localStorage.getItem("mesh_access_token");
      if (!token) throw new Error("No access token");

      const res = await fetch("/api/transfer/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: token,
          transferId,
          mfaCode: mfaCode || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Check if MFA is required
        if (body.error?.includes("MFA") || body.mfaRequired) {
          setError("MFA code required");
          return;
        }
        throw new Error(body.error || "Failed to execute transfer");
      }

      const data = await res.json();
      setTransferResult(data);
      setStep("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Mesh API Demo</h1>
        <Navigation />

        <div className="flex gap-2 mb-6">
          <button
            className={`px-4 py-2 rounded-lg font-medium ${
              step === "configure" || step === "preview" || step === "execute"
                ? "bg-purple-600 text-white"
                : "bg-zinc-800 text-zinc-400"
            }`}
          >
            Managed APIs
          </button>
          <button className="px-4 py-2 rounded-lg font-medium bg-zinc-800 text-zinc-400">
            SDK Transfer
          </button>
        </div>

        <div className="bg-blue-600/20 border border-blue-500/50 rounded-lg p-4 mb-6">
          <p className="text-sm">
            <strong>Managed Transfer APIs</strong> Using server-side APIs:{" "}
            <span
              className={
                step === "configure" ? "text-blue-400 font-bold" : "text-zinc-400"
              }
            >
              /configure
            </span>{" "}
            →{" "}
            <span
              className={
                step === "preview" ? "text-blue-400 font-bold" : "text-zinc-400"
              }
            >
              /preview
            </span>{" "}
            →{" "}
            <span
              className={
                step === "execute" ? "text-blue-400 font-bold" : "text-zinc-400"
              }
            >
              /execute
            </span>
          </p>
        </div>

        <div className="bg-zinc-900 rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-6">Transfer Crypto</h2>

          {error && (
            <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-6">
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {step === "configure" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">From Account</label>
                <select
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                  className="w-full bg-zinc-800 rounded-lg px-4 py-2 text-zinc-100"
                >
                  {accounts.map((acc) => (
                    <option key={acc.accountId} value={acc.accountId}>
                      {acc.name} ({acc.brokerType})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">
                  To Address
                </label>
                <input
                  type="text"
                  value={toAddress}
                  onChange={(e) => {
                    const addr = e.target.value;
                    setToAddress(addr);
                    window.localStorage.setItem("app_wallet_address", addr);
                  }}
                  placeholder="0x..."
                  className="w-full bg-zinc-800 rounded-lg px-4 py-2 text-zinc-100"
                />
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">Amount (USD)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-zinc-800 rounded-lg px-4 py-2 text-zinc-100"
                />
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">Network</label>
                <select
                  value={selectedNetwork}
                  onChange={(e) => setSelectedNetwork(e.target.value)}
                  className="w-full bg-zinc-800 rounded-lg px-4 py-2 text-zinc-100"
                >
                  {networks.map((net) => (
                    <option key={net.id} value={net.id}>
                      {net.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleConfigure}
                disabled={loading || !selectedAccount || !toAddress || !amount}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg px-4 py-2 font-medium"
              >
                {loading ? "Configuring..." : "Configure Transfer"}
              </button>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              <p className="text-zinc-400">Review transfer details</p>
              <button
                onClick={handlePreview}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg px-4 py-2 font-medium"
              >
                {loading ? "Loading preview..." : "Preview Transfer"}
              </button>
              {previewData && (
                <div className="bg-zinc-800 rounded-lg p-4">
                  <pre className="text-xs overflow-auto">
                    {JSON.stringify(previewData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {step === "execute" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">
                  MFA Code (if required)
                </label>
                <input
                  type="text"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  placeholder="Enter 6-8 digit code"
                  className="w-full bg-zinc-800 rounded-lg px-4 py-2 text-zinc-100"
                />
              </div>
              <button
                onClick={handleExecute}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg px-4 py-2 font-medium"
              >
                {loading ? "Executing..." : "Execute Transfer"}
              </button>
            </div>
          )}

          {step === "success" && (
            <div className="text-center space-y-4">
              <div className="text-6xl">✅</div>
              <h3 className="text-2xl font-bold">Success!</h3>
              {transferResult && (
                <div className="bg-zinc-800 rounded-lg p-4">
                  <pre className="text-xs overflow-auto text-left">
                    {JSON.stringify(transferResult, null, 2)}
                  </pre>
                </div>
              )}
              <button
                onClick={() => {
                  setStep("configure");
                  setTransferId("");
                  setPreviewData(null);
                  setMfaCode("");
                  setTransferResult(null);
                }}
                className="bg-blue-600 hover:bg-blue-700 rounded-lg px-6 py-2 font-medium"
              >
                New Transfer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

