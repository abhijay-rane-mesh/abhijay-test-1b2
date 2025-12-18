import { NextRequest, NextResponse } from "next/server";
import { getDepositAddress, getDepositAddresses } from "@/lib/meshClient";

// Helper function to extract actual token from stored value (might be JSON string or object)
function extractToken(storedToken: string | object | null | undefined): string | null {
  if (!storedToken) return null;
  
  // Handle object format (new format from Mesh Link)
  if (typeof storedToken === "object" && storedToken !== null) {
    const obj = storedToken as any;
    // Check for accountTokens[0].accessToken (new format)
    if (obj?.accountTokens?.[0]?.accessToken) {
      return String(obj.accountTokens[0].accessToken);
    }
    // Check for accountTokens[0].authToken (fallback)
    if (obj?.accountTokens?.[0]?.authToken) {
      return String(obj.accountTokens[0].authToken);
    }
    // Check for direct authToken
    if (obj?.authToken) {
      return String(obj.authToken);
    }
    // Check for direct accessToken
    if (obj?.accessToken && typeof obj.accessToken === "string") {
      return obj.accessToken;
    }
    return null;
  }
  
  // Handle string format
  if (typeof storedToken === "string") {
    // If it's a JSON string, parse it
    if (storedToken.startsWith("{") || storedToken.startsWith("[")) {
      try {
        const parsed = JSON.parse(storedToken);
        // Check for accountTokens[0].accessToken
        if (parsed?.accountTokens?.[0]?.accessToken) {
          return String(parsed.accountTokens[0].accessToken);
        }
        // Check for accountTokens[0].authToken
        if (parsed?.accountTokens?.[0]?.authToken) {
          return String(parsed.accountTokens[0].authToken);
        }
        // Check for direct authToken
        if (parsed?.authToken) {
          return String(parsed.authToken);
        }
        return storedToken;
      } catch (e) {
        return storedToken;
      }
    }
    // Plain string token
    return storedToken;
  }
  
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { authToken, type, symbol, networkId } = body;

    if (!authToken || !type) {
      return NextResponse.json(
        { error: "Missing required fields: authToken, type" },
        { status: 400 }
      );
    }

    const extractedToken = extractToken(authToken);
    if (!extractedToken) {
      return NextResponse.json(
        { error: "Invalid auth token format" },
        { status: 400 }
      );
    }

    // For DeFi wallets, try to get all addresses using the list endpoint first
    // This is more reliable than trying to get a specific address
    if (type === "deFiWallet" || type === "metamask") {
      try {
        const addressesResult = await getDepositAddresses(extractedToken, type, {
          symbol: symbol || "ETH",
          networks: networkId ? [{ networkId }] : undefined,
        });
        console.log("[Wallet Address API] List endpoint response:", {
          hasContent: !!addressesResult.content,
          contentKeys: addressesResult.content ? Object.keys(addressesResult.content) : [],
          hasAddresses: !!addressesResult.content?.addresses,
          addressesCount: addressesResult.content?.addresses?.length || 0,
          fullResponse: JSON.stringify(addressesResult).substring(0, 500),
        });
        
        // The response structure might vary - check multiple possible paths
        const addresses = 
          addressesResult.content?.addresses || 
          addressesResult.content?.items ||
          addressesResult.addresses || 
          addressesResult.items ||
          [];
          
        if (addresses.length > 0) {
          console.log("[Wallet Address API] Found addresses:", addresses.length);
          // Return the first Ethereum address (starts with 0x and is 42 chars)
          const ethAddress = addresses.find((addr: any) => {
            const addrStr = addr.address || addr;
            return addrStr && typeof addrStr === "string" && addrStr.startsWith("0x") && addrStr.length === 42;
          });
          if (ethAddress) {
            const address = ethAddress.address || ethAddress;
            return NextResponse.json({
              content: {
                address,
                networkId: ethAddress.networkId,
                symbol: ethAddress.symbol,
              },
              status: "ok",
            });
          }
          // If no Ethereum address found, return the first address
          const firstAddr = addresses[0];
          const address = firstAddr?.address || firstAddr;
          if (address) {
            return NextResponse.json({
              content: {
                address,
                networkId: firstAddr?.networkId,
                symbol: firstAddr?.symbol,
              },
              status: "ok",
            });
          }
        } else {
          console.warn("[Wallet Address API] No addresses found in list response");
        }
      } catch (listError: any) {
        console.error("[Wallet Address API] List endpoint failed:", {
          error: listError.message,
          status: listError.status,
          response: listError.response?.data || listError.response?.text || "N/A",
        });
        // DeFi wallets often do not support deposit address lookups via server-side endpoints.
        // Returning 200 with a null address keeps the client flow resilient (it can fall back to portfolio/holdings).
        return NextResponse.json({
          status: "ok",
          content: { address: null },
          message:
            "Wallet address lookup is not available for this DeFi wallet via server-side API. " +
            "The client can fall back to the wallet's own address (if available) or portfolio extraction.",
        });
      }
      
      // If we get here, no addresses were found
      return NextResponse.json({
        status: "ok",
        content: { address: null },
        message:
          "No wallet addresses were returned for this DeFi wallet. " +
          "The client can fall back to portfolio extraction when positions exist.",
      });
    }

    const result = await getDepositAddress(extractedToken, type, {
      symbol: symbol || "ETH",
      networkId: networkId,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error fetching wallet address";
    console.error("[Wallet Address API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

