import { NextRequest, NextResponse } from "next/server";
import { getAccounts, getAccountBalances, getHoldingsWithType } from "@/lib/meshClient";
import { getAccountDisplayName } from "@/lib/accountUtils";

export async function POST(request: NextRequest) {
  try {
    const { accessToken, connectedAccounts } = await request.json();

    if (!accessToken) {
      return NextResponse.json(
        { error: "accessToken is required" },
        { status: 400 }
      );
    }

           const holdings: any[] = [];
           let totalValue = 0;
           let accounts: any[] = [];
           const walletAddressesByAccount: Record<string, string> = {}; // Map accountId -> walletAddress

    // Use Mesh holdings API for each connected account
    // According to Mesh docs: POST /api/v1/holdings/get requires authToken + type per account
    if (connectedAccounts && Array.isArray(connectedAccounts) && connectedAccounts.length > 0) {
      console.log("[Portfolio] Using Mesh holdings API for", connectedAccounts.length, "accounts");
      
      // Helper function to extract actual token from stored value (might be JSON string)
      const extractToken = (storedToken: string | null | undefined): string | null => {
        if (!storedToken) return null;
        
        // If it's a JSON string, parse it and extract the token
        if (typeof storedToken === "string" && (storedToken.startsWith("{") || storedToken.startsWith("["))) {
          try {
            const parsed = JSON.parse(storedToken);
            
            // Log the structure for debugging
            console.log("[Portfolio] Parsed token structure:", {
              hasAccountTokens: !!parsed?.accountTokens,
              accountTokensLength: parsed?.accountTokens?.length,
              firstAccountTokenKeys: parsed?.accountTokens?.[0] ? Object.keys(parsed.accountTokens[0]) : [],
              hasDirectAuthToken: !!parsed?.authToken,
              hasDirectIntegrationToken: !!parsed?.integrationToken,
            });
            
            // Check for accountTokens structure (from Mesh Link payload)
            // Structure: {"accountTokens":[{"authToken":"...", "account": {...}}]}
            if (parsed?.accountTokens && Array.isArray(parsed.accountTokens) && parsed.accountTokens.length > 0) {
              const firstToken = parsed.accountTokens[0];
              
              // Try multiple possible paths for authToken
              const token = 
                firstToken?.authToken ||
                firstToken?.accessToken ||
                firstToken?.token ||
                firstToken?.integrationToken;
              
              if (token && typeof token === "string" && token.length > 20) {
                console.log("[Portfolio] Found token in accountTokens[0]:", token.substring(0, 20) + "...");
                return token;
              }
            }
            
            // Check for direct authToken at root level
            if (parsed?.authToken && typeof parsed.authToken === "string" && parsed.authToken.length > 20) {
              console.log("[Portfolio] Found token at root authToken:", parsed.authToken.substring(0, 20) + "...");
              return parsed.authToken;
            }
            
            // Check for integrationToken at root level
            if (parsed?.integrationToken && typeof parsed.integrationToken === "string" && parsed.integrationToken.length > 20) {
              console.log("[Portfolio] Found token at root integrationToken:", parsed.integrationToken.substring(0, 20) + "...");
              return parsed.integrationToken;
            }
            
            // If parsing succeeded but no token found, return null
            console.warn("[Portfolio] Parsed JSON but no valid token found");
            return null;
          } catch (e) {
            // Not valid JSON, return as-is if it looks like a token
            if (storedToken.length > 20 && !storedToken.includes('"') && !storedToken.includes('{')) {
              return storedToken;
            }
            console.warn("[Portfolio] Failed to parse token JSON:", e);
            return null;
          }
        }
        
        // If it's a normal token string (not JSON), return as-is
        if (storedToken.length > 20 && !storedToken.includes('"') && !storedToken.includes('{')) {
          return storedToken;
        }
        return null;
      };

      // Fetch holdings for each account in parallel
      const holdingsPromises = connectedAccounts.map(async (account: any) => {
        // Each account should have authToken and type for holdings API
        // For DeFi wallets: accountTokens array may contain multiple tokens (one per network)
        // We need to try ALL tokens to get holdings from all networks
        
        console.log("[Portfolio] Processing account:", {
          name: account.name,
          hasAuthToken: !!account.authToken,
          hasIntegrationToken: !!account.integrationToken,
          hasAccessToken: !!account.accessToken,
          integrationTokenPreview: account.integrationToken?.substring?.(0, 100),
          brokerType: account.brokerType,
        });
        
        // For DeFi wallets, extract ALL tokens from accountTokens array (network-specific tokens)
        const isDeFiWallet = account.brokerType === "deFiWallet" || account.brokerType === "metamask";
        let tokensToTry: string[] = [];
        
        if (isDeFiWallet && account.integrationToken) {
          // Parse the integrationToken JSON to get all accountTokens
          try {
            const parsed = typeof account.integrationToken === "string" && account.integrationToken.startsWith("{")
              ? JSON.parse(account.integrationToken)
              : account.integrationToken;
            
            if (parsed?.accountTokens && Array.isArray(parsed.accountTokens)) {
              // Extract all tokens from all networks
              for (const tokenEntry of parsed.accountTokens) {
                const token = tokenEntry?.authToken || tokenEntry?.accessToken || tokenEntry?.token;
                if (token && typeof token === "string" && token.length > 20) {
                  tokensToTry.push(token);
                  console.log(`[Portfolio] Found network-specific token for ${account.name}:`, {
                    tokenPrefix: token.substring(0, 20) + "...",
                    network: tokenEntry?.account?.networkId || tokenEntry?.networkId || "unknown",
                    meshAccountId: tokenEntry?.account?.meshAccountId,
                  });
                }
              }
            }
          } catch (e) {
            console.warn(`[Portfolio] Failed to parse accountTokens for ${account.name}:`, e);
          }
        }
        
        // If no network-specific tokens found, try the standard extraction
        if (tokensToTry.length === 0) {
          const extractedToken = 
            extractToken(account.authToken) ||
            extractToken(account.integrationToken) ||
            extractToken(account.accessToken);
          
          if (extractedToken) {
            tokensToTry.push(extractedToken);
          }
        }
        
        console.log("[Portfolio] Tokens to try for", account.name, ":", tokensToTry.length);
        
        // If still no token, log what we have for debugging
        if (tokensToTry.length === 0) {
          console.warn("[Portfolio] No valid token found for account:", {
            name: account.name,
            hasAuthToken: !!account.authToken,
            hasIntegrationToken: !!account.integrationToken,
            hasAccessToken: !!account.accessToken,
            authTokenType: typeof account.authToken,
            integrationTokenType: typeof account.integrationToken,
            authTokenPreview: account.authToken?.substring?.(0, 100),
            integrationTokenPreview: account.integrationToken?.substring?.(0, 100),
            allAccountKeys: Object.keys(account),
          });
          return null;
        }
        
        // Map providerType to Mesh API type
        let accountType = account.type || account.providerType || account.brokerType;
        // Normalize type: "metamask" -> "deFiWallet", "coinbase" -> "coinbase", etc.
        if (accountType === "metamask" || accountType === "wallet") {
          accountType = "deFiWallet";
        }
        
        if (!accountType || accountType === "unknown") {
          console.warn("[Portfolio] Skipping account - missing type:", {
            name: account.name,
            type: accountType,
            accountKeys: Object.keys(account),
          });
          return null;
        }

        // For DeFi wallets: Try ALL tokens (one per network) and aggregate results
        // For exchanges: Use the first token
        const tokensToUse = isDeFiWallet ? tokensToTry : [tokensToTry[0]].filter(Boolean);
        
        if (tokensToUse.length === 0) {
          console.warn("[Portfolio] No valid tokens to try for", account.name);
          return null;
        }

        try {
          console.log("[Portfolio] Fetching holdings for", account.name, "with", tokensToUse.length, "token(s)");
          
          // Try all tokens and aggregate results
          const holdingsPromisesForAccount = tokensToUse.map(async (token, tokenIndex) => {
            console.log(`[Portfolio] Trying token ${tokenIndex + 1}/${tokensToUse.length} for ${account.name}:`, {
              tokenPrefix: token.substring(0, 20) + "...",
              tokenLength: token.length,
            });
            
            try {
              const holdingsData = await getHoldingsWithType(token, accountType, true);
              return { tokenIndex, holdingsData, success: true };
            } catch (err: any) {
              const errorMsg = err?.message || String(err);
              console.warn(`[Portfolio] Token ${tokenIndex + 1} failed for ${account.name}:`, errorMsg);
              return { tokenIndex, error: errorMsg, success: false };
            }
          });
          
          const tokenResults = await Promise.all(holdingsPromisesForAccount);
          
          // For DeFi wallets: Aggregate results from ALL successful token calls (different networks)
          // For exchanges: Use the first successful response
          const successfulResults = tokenResults.filter((r) => r.success && r.holdingsData);
          
          if (successfulResults.length === 0) {
            console.warn(`[Portfolio] All tokens failed for ${account.name}`);
            return { account, error: "All tokens failed", success: false };
          }
          
          console.log(`[Portfolio] ${successfulResults.length} token(s) succeeded for ${account.name}`);
          
          // Aggregate cryptocurrency positions from all successful responses
          let aggregatedContent: any = {
            status: "succeeded",
            cryptocurrencyPositions: [],
            equityPositions: [],
            notSupportedCryptocurrencyPositions: [],
            accountId: null,
            institutionName: null,
            type: accountType,
          };
          
          for (const result of successfulResults) {
            const resultContent = result.holdingsData?.content || result.holdingsData;
            if (resultContent) {
              // Merge cryptocurrency positions
              if (resultContent.cryptocurrencyPositions) {
                aggregatedContent.cryptocurrencyPositions.push(...resultContent.cryptocurrencyPositions);
              }
              // Merge equity positions
              if (resultContent.equityPositions) {
                aggregatedContent.equityPositions.push(...resultContent.equityPositions);
              }
              // Merge not-supported positions
              if (resultContent.notSupportedCryptocurrencyPositions) {
                aggregatedContent.notSupportedCryptocurrencyPositions.push(...resultContent.notSupportedCryptocurrencyPositions);
              }
              // Use account info from first successful response
              if (!aggregatedContent.accountId && resultContent.accountId) {
                aggregatedContent.accountId = resultContent.accountId;
              }
              if (!aggregatedContent.institutionName && resultContent.institutionName) {
                aggregatedContent.institutionName = resultContent.institutionName;
              }
            }
          }
          
          // Deduplicate positions by symbol (in case same asset appears in multiple networks)
          const seenSymbols = new Set<string>();
          aggregatedContent.cryptocurrencyPositions = aggregatedContent.cryptocurrencyPositions.filter((pos: any) => {
            const symbol = pos.symbol;
            if (seenSymbols.has(symbol)) {
              // If duplicate, merge amounts (for same symbol across networks)
              const existing = aggregatedContent.cryptocurrencyPositions.find((p: any) => p.symbol === symbol);
              if (existing) {
                existing.amount = (parseFloat(existing.amount || "0") + parseFloat(pos.amount || "0")).toString();
                // Recalculate value
                const amount = parseFloat(existing.amount);
                const price = parseFloat(existing.lastPrice || "0");
                existing.marketValue = amount * price;
              }
              return false;
            }
            seenSymbols.add(symbol);
            return true;
          });
          
          const content = aggregatedContent;
          
          // Log detailed response, especially for DeFi wallets
          const isDeFiWallet = account.brokerType === "deFiWallet" || content.type === "deFiWallet";
          
          console.log("[Portfolio] Holdings response for", account.name, ":", {
            status: content.status,
            hasCryptoPositions: !!content.cryptocurrencyPositions,
            cryptoPositionsCount: content.cryptocurrencyPositions?.length || 0,
            hasEquityPositions: !!content.equityPositions,
            equityPositionsCount: content.equityPositions?.length || 0,
            hasNotSupportedCrypto: !!content.notSupportedCryptocurrencyPositions,
            notSupportedCryptoCount: content.notSupportedCryptocurrencyPositions?.length || 0,
            accountId: content.accountId,
            institutionName: content.institutionName,
            type: content.type,
            tokensUsed: successfulResults.length,
          });
          
          // For DeFi wallets, log the full response structure to debug missing USDC
          if (isDeFiWallet) {
            console.log(`[Portfolio] Full response for ${account.name} (DeFi Wallet):`, {
              status: content.status,
              errorMessage: content.errorMessage,
              displayMessage: content.displayMessage,
              cryptocurrencyPositions: content.cryptocurrencyPositions,
              notSupportedCryptocurrencyPositions: content.notSupportedCryptocurrencyPositions,
              nftPositions: content.nftPositions,
              allKeys: Object.keys(content),
              // Log first 2000 chars of full response for detailed inspection
              fullResponsePreview: JSON.stringify(content, null, 2).substring(0, 2000),
            });
          }
          
          // Check if response indicates success
          // According to docs, status can be "succeeded", "failed", or "notAuthorized"
          if (content.status === "succeeded" || content.cryptocurrencyPositions || content.equityPositions) {
            return {
              account,
              content,
              success: true,
            };
          } else if (content.status === "failed" || content.status === "notAuthorized") {
            console.warn("[Portfolio] Holdings API returned error status:", {
              status: content.status,
              errorMessage: content.errorMessage,
              displayMessage: content.displayMessage,
              account: account.name,
            });
            return { account, content, success: false };
          } else {
            console.warn("[Portfolio] Holdings API returned unexpected status:", {
              status: content.status,
              account: account.name,
              contentKeys: Object.keys(content),
            });
            return { account, content, success: false };
          }
        } catch (err: any) {
          const errorMsg = err?.message || String(err);
          console.error(`[Portfolio] Holdings API failed for ${account.name}:`, {
            error: errorMsg,
            type: accountType,
            tokensTried: tokensToUse.length,
            firstTokenPrefix: tokensToUse[0]?.substring(0, 20),
          });
          return { account, error: errorMsg, success: false };
        }
      });

      const holdingsResults = await Promise.all(holdingsPromises);
      
      // Process successful holdings responses
      for (const result of holdingsResults) {
        if (!result || !result.success) continue;
        
        const { account, content } = result;
        
        // Add account info
        // Prioritize account.name from connected accounts (e.g., "Coinbase Wallet", "MetaMask") 
        // over content.institutionName (which is "DeFiWallet" for DeFi wallets)
        if (content.accountId) {
          accounts.push({
            accountId: content.accountId || account.accountId || account.meshAccountId,
            brokerType: content.type || account.brokerType || account.providerType,
            name: account.name || account.brokerName || content.accountName || content.institutionName || getAccountDisplayName(content.type || account.brokerType, content),
            integrationId: content.integrationId || account.integrationId,
          });
        } else {
          // Fallback to account info from connected accounts
          accounts.push({
            accountId: account.accountId || account.meshAccountId,
            brokerType: account.brokerType || account.providerType,
            name: account.name || account.brokerName || getAccountDisplayName(account.brokerType, account),
            integrationId: account.integrationId,
          });
        }

        // Process cryptocurrency positions
        // According to Mesh API docs, positions have: symbol, amount, lastPrice, marketValue, name, costBasis, distribution
        const cryptoPositions = content.cryptocurrencyPositions || [];
        const notSupportedCryptoPositions = content.notSupportedCryptocurrencyPositions || [];
        
        console.log(`[Portfolio] Processing ${cryptoPositions.length} crypto positions for ${account.name}`);
        if (notSupportedCryptoPositions.length > 0) {
          console.log(`[Portfolio] Found ${notSupportedCryptoPositions.length} not-supported crypto positions for ${account.name}:`, 
            notSupportedCryptoPositions.map((p: any) => ({ symbol: p.symbol, amount: p.amount }))
          );
        }
        
        // Log the full response structure for debugging if no positions found
        if (cryptoPositions.length === 0 && account.brokerType === "deFiWallet") {
          console.log(`[Portfolio] No crypto positions found for ${account.name}. Full response structure:`, {
            status: content.status,
            errorMessage: content.errorMessage,
            displayMessage: content.displayMessage,
            hasDistribution: cryptoPositions.some((p: any) => p.distribution),
            allContentKeys: Object.keys(content),
            cryptocurrencyPositionsType: typeof content.cryptocurrencyPositions,
            cryptocurrencyPositionsLength: content.cryptocurrencyPositions?.length,
            notSupportedCryptoCount: notSupportedCryptoPositions.length,
            notSupportedCrypto: notSupportedCryptoPositions,
            rawCryptocurrencyPositions: content.cryptocurrencyPositions,
          });
        }
        
        // Also process not-supported positions (they might have amount but no price/value)
        // These are positions Mesh recognizes but can't fully support (might be missing price data)
        for (const pos of notSupportedCryptoPositions) {
          const amount = parseFloat(String(pos.amount || "0"));
          if (amount > 0) {
            console.log(`[Portfolio] Found not-supported crypto position:`, {
              symbol: pos.symbol,
              amount,
              name: pos.name,
            });
            // We can still show these positions, but without price/value
            holdings.push({
              symbol: pos.symbol || "UNKNOWN",
              name: pos.name || pos.symbol,
              amount,
              price: 0, // No price data available
              value: 0, // No value data available
              accountId: content.accountId || account.accountId || account.meshAccountId,
              accountName: content.institutionName || content.accountName || account.name,
              brokerType: content.type || account.brokerType,
              source: content.type === "deFiWallet" || content.type === "metamask" || account.brokerType === "deFiWallet" || account.brokerType === "metamask" ? "MetaMask" : "Exchange",
              notSupported: true, // Flag to indicate this position is not fully supported
            });
          }
        }
          
        for (const pos of cryptoPositions) {
          const amount = parseFloat(String(pos.amount || "0"));
          const price = parseFloat(String(pos.lastPrice || pos.marketValue || "0"));
          // According to docs, marketValue is "amount of asset multiplied by last asset value"
          const value = parseFloat(String(pos.marketValue || "0")) || (amount * price);

          // Log distribution if present (for DeFi wallets, positions might be split across networks)
          // Extract wallet address from distribution if available (for DeFi wallets)
          let extractedWalletAddress: string | null = null;
          if (pos.distribution && Array.isArray(pos.distribution)) {
            console.log(`[Portfolio] Crypto position has distribution across networks:`, {
              symbol: pos.symbol,
              totalAmount: amount,
              distribution: pos.distribution.map((d: any) => ({
                network: d.caipNetworkId,
                address: d.address?.substring(0, 10) + "...",
                amount: d.amount,
              })),
            });
            
            // Extract the first valid Ethereum address from distribution (for EVM networks)
            for (const dist of pos.distribution) {
              if (dist.address && typeof dist.address === "string" && dist.address.startsWith("0x") && dist.address.length === 42) {
                extractedWalletAddress = dist.address;
                console.log(`[Portfolio] Extracted wallet address from distribution:`, extractedWalletAddress);
                // Store the wallet address for this account
                const accId = content.accountId || account.accountId || account.meshAccountId;
                if (accId && extractedWalletAddress) {
                  walletAddressesByAccount[accId] = extractedWalletAddress;
                }
                break; // Use first valid Ethereum address found
              }
            }
          }

          if (amount > 0 || value > 0) {
            console.log(`[Portfolio] Adding crypto position:`, {
              symbol: pos.symbol,
              amount,
              price,
              value,
              marketValue: pos.marketValue,
              lastPrice: pos.lastPrice,
              hasDistribution: !!pos.distribution,
            });

            holdings.push({
              symbol: pos.symbol || "UNKNOWN",
              name: pos.name || pos.symbol,
              amount,
              price,
              value,
              accountId: content.accountId || account.accountId || account.meshAccountId,
              accountName: content.institutionName || content.accountName || account.name,
              brokerType: content.type || account.brokerType,
              source: content.type === "deFiWallet" || content.type === "metamask" || account.brokerType === "deFiWallet" || account.brokerType === "metamask" ? "MetaMask" : "Exchange",
            });
            totalValue += value;
          } else {
            console.warn(`[Portfolio] Skipping crypto position with zero amount/value:`, pos);
          }
        }

        // Process equity positions
        const equityPositions = content.equityPositions || [];
        for (const pos of equityPositions) {
          const amount = parseFloat(pos.amount || "0");
          const price = parseFloat(pos.lastPrice || "0");
          const value = parseFloat(pos.marketValue || "0") || amount * price;

          holdings.push({
            symbol: pos.symbol || "UNKNOWN",
            name: pos.name,
            amount,
            price,
            value,
            accountId: content.accountId || account.accountId || account.meshAccountId,
            accountName: content.institutionName || content.accountName || account.name,
            brokerType: content.type || account.brokerType,
            source: "Exchange",
          });
          totalValue += value;
        }
      }

      // If we got any holdings, return them
      if (holdings.length > 0 || accounts.length > 0) {
        return NextResponse.json({
          totalValue,
          totalAccounts: accounts.length,
          totalAssets: holdings.length,
          holdings,
          accounts,
          walletAddresses: walletAddressesByAccount, // Include extracted wallet addresses for DeFi wallets
        });
      }
    }

    // Fallback: Use accounts + balances approach
    console.log("[Portfolio] Using accounts + balances approach (fallback)");
    
    // If we have connected accounts but holdings API failed, use them as account list
    if (connectedAccounts && Array.isArray(connectedAccounts) && connectedAccounts.length > 0) {
      accounts = connectedAccounts.map((acc: any) => ({
        accountId: acc.accountId || acc.meshAccountId,
        brokerType: acc.brokerType || acc.providerType,
        name: acc.name,
        integrationId: acc.integrationId,
      }));
    } else {
      // Try to get accounts from Mesh API
      try {
        const accountsRes = await getAccounts(accessToken);
        accounts =
          accountsRes.content?.accounts ||
          accountsRes.accounts ||
          accountsRes.content ||
          [];
      } catch (err) {
        console.error("[Portfolio] getAccounts failed, continuing with empty list", err);
        accounts = [];
      }
    }

    // Helper function to extract token (same as above)
    const extractToken = (storedToken: string | null | undefined): string | null => {
      if (!storedToken) return null;
      if (typeof storedToken === "string" && (storedToken.startsWith("{") || storedToken.startsWith("["))) {
        try {
          const parsed = JSON.parse(storedToken);
          return parsed?.accountTokens?.[0]?.authToken || parsed?.authToken || storedToken;
        } catch (e) {
          return storedToken;
        }
      }
      return storedToken;
    };

    // Extract token from accessToken
    const extractedAccessToken = extractToken(accessToken) || accessToken;

    const balancesList = await Promise.all(
      accounts.map(async (acc: any) => {
        const accountId = acc.accountId || acc.id || acc.meshAccountId;
        if (!accountId) return { accountId: null, brokerType: acc.brokerType, balances: [] };
        
        // Find the matching connected account to get the type
        const connectedAccount = connectedAccounts?.find((ca: any) => 
          (ca.accountId === accountId || ca.meshAccountId === accountId)
        );
        const accountType = connectedAccount?.type || connectedAccount?.providerType || connectedAccount?.brokerType || acc.brokerType;
        
        try {
          // Try with account type first (for POST /api/v1/balance/get)
          const balancesRes = accountType 
            ? await getAccountBalances(extractedAccessToken, accountId, accountType)
            : await getAccountBalances(extractedAccessToken, accountId);
          const balances =
            balancesRes.content?.balances ||
            balancesRes.balances ||
            balancesRes.content ||
            [];
          return { accountId, brokerType: acc.brokerType, balances };
        } catch (err) {
          console.error("[Portfolio] balances error", accountId, err);
          return { accountId, brokerType: acc.brokerType, balances: [] };
        }
      })
    );

    for (const entry of balancesList) {
      for (const bal of entry.balances) {
        const amount = parseFloat(bal.amount || bal.quantity || "0");
        const price = parseFloat(bal.price || bal.usdPrice || "0");
        const value =
          parseFloat(bal.value || bal.marketValue || "0") || amount * price;

        holdings.push({
          symbol: bal.symbol || bal.assetSymbol || "UNKNOWN",
          name: bal.name || bal.assetName,
          amount,
          price,
          value,
          accountId: entry.accountId,
          accountName: getAccountDisplayName(entry.brokerType, bal),
          brokerType: entry.brokerType,
          source:
            entry.brokerType === "metamask" || entry.brokerType === "wallet"
              ? "MetaMask"
              : "Exchange",
        });
        totalValue += value;
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
        name: acc.name || getAccountDisplayName(acc.brokerType, acc),
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
