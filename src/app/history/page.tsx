"use client";

import Navigation from "@/components/Navigation";

export default function HistoryPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Mesh API Demo</h1>
        <Navigation />

        <div className="bg-zinc-900 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Transfer History</h2>
          <p className="text-zinc-400">
            Transfer history will be displayed here. Use the Mesh API to fetch
            past transfers.
          </p>
        </div>
      </div>
    </div>
  );
}

