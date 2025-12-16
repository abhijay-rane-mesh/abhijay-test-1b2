import { NextRequest, NextResponse } from "next/server";
import {
  getAccounts,
  getPortfolioHoldings,
  getPortfolioBalance,
} from "@/lib/meshClient";
import { getAccountDisplayName } from "@/lib/accountUtils";

export async function POST(request: NextRequest) {
  try {
    const { accessToken } = await request.json();

    if (!accessToken) {
      return NextResponse.json(
        { error: "accessToken is required" },
        { status: 400 }
      );
    }

    // Get portfolio holdings using /api/v1/holdings/portfolio
    let holdings: any[] = [];
    let totalValue = 0;
    let accounts: any[] = [];

    try {
      const portfolioData = await getPortfolioHoldings(accessToken);
      holdings =
        portfolioData.content?.holdings ||
        portfolioData.holdings ||
        portfolioData.content ||
        [];

      // Calculate total value from holdings
      for (const holding of holdings) {
        const value =
          parseFloat(holding.value || holding.marketValue || "0") ||
          parseFloat(holding.amount || "0") *
            parseFloat(holding.price || "0");
        totalValue += value;
      }

      // Extract unique accounts from holdings
      const accountMap = new Map();
      for (const holding of holdings) {
        if (holding.accountId && !accountMap.has(holding.accountId)) {
          accountMap.set(holding.accountId, {
            accountId: holding.accountId,
            brokerType: holding.brokerType,
            name: getAccountDisplayName(holding.brokerType, holding),
          });
        }
      }
      accounts = Array.from(accountMap.values());
    } catch (err) {
      console.error("[Portfolio] Error fetching portfolio holdings:", err);
      
      // Fallback: try to get accounts separately
      try {
        const accountsData = await getAccounts(accessToken);
        accounts =
          accountsData.content?.accounts ||
          accountsData.accounts ||
          accountsData.content ||
          [];
      } catch (accountsErr) {
        console.error("[Portfolio] Error fetching accounts:", accountsErr);
      }

      // Fallback: try to get balance/portfolio
      try {
        const balanceData = await getPortfolioBalance(accessToken);
        totalValue =
          parseFloat(balanceData.content?.totalValue || balanceData.totalValue || "0") || 0;
      } catch (balanceErr) {
        console.error("[Portfolio] Error fetching portfolio balance:", balanceErr);
      }
    }

    return NextResponse.json({
      totalValue,
      totalAccounts: accounts.length,
      totalAssets: holdings.length,
      holdings: holdings.map((holding: any) => ({
        symbol: holding.symbol || holding.assetSymbol || "UNKNOWN",
        name: holding.name || holding.assetName,
        amount: parseFloat(holding.amount || holding.quantity || "0"),
        price: parseFloat(holding.price || "0"),
        value:
          parseFloat(holding.value || holding.marketValue || "0") ||
          parseFloat(holding.amount || "0") * parseFloat(holding.price || "0"),
        accountId: holding.accountId,
        accountName: getAccountDisplayName(holding.brokerType, holding),
        source:
          holding.brokerType === "metamask" || holding.brokerType === "wallet"
            ? "MetaMask"
            : "Exchange",
      })),
      accounts: accounts.map((acc: any) => ({
        accountId: acc.accountId || acc.id || acc.meshAccountId,
        name: getAccountDisplayName(acc.brokerType, acc),
        brokerType: acc.brokerType,
        integrationId: acc.integrationId,
      })),
    });
  } catch (error) {
    console.error("[Portfolio API] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch portfolio: ${message}` },
      { status: 500 }
    );
  }
}