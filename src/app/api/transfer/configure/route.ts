import { NextRequest, NextResponse } from "next/server";
import { configureTransfer } from "@/lib/meshClient";

function extractTransferId(result: any): string | null {
  if (!result || typeof result !== "object") return null;

  // Common shapes we’ve seen across Mesh endpoints / SDK wrappers
  const candidates: Array<any> = [
    result.transferId,
    result.content?.transferId,
    result.content?.id,
    result.id,
    result.transfer?.id,
    result.transfer?.transferId,
    result.content?.transfer?.id,
    result.content?.transfer?.transferId,
    result.content?.transferConfiguration?.transferId,
    result.content?.transferConfiguration?.id,
    result.content?.transfers?.[0]?.id,
    result.content?.transfers?.[0]?.transferId,
    result.content?.items?.[0]?.id,
    result.content?.items?.[0]?.transferId,
  ];
  for (const v of candidates) {
    if (typeof v === "string" && v.length > 10) return v;
  }

  // Last resort: deep search for a key named "transferId"
  const seen = new Set<any>();
  const stack: any[] = [result];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    if (typeof (cur as any).transferId === "string") return (cur as any).transferId;
    for (const value of Object.values(cur)) {
      if (value && typeof value === "object") stack.push(value);
    }
  }

  return null;
}

function parseMeshConfigureError(message: string): { statusCode: number; payload: any } | null {
  // Example: Mesh configure failed (400): {"status":"badRequest","message":"...","displayMessage":"...","errorType":"invalidField"}
  const m = message.match(/Mesh configure failed \((\d+)\):\s*([\s\S]*)$/);
  if (!m) return null;
  const statusCode = Number(m[1]);
  const raw = (m[2] || "").trim();
  try {
    return { statusCode, payload: JSON.parse(raw) };
  } catch {
    return { statusCode, payload: { message: raw } };
  }
}

// Helper function to extract actual token from stored value (might be JSON string or object)
// CRITICAL: For Managed Transfers, we need fromAuthToken which is accessToken from accountTokens[0].accessToken
// This is DIFFERENT from integrationToken (used for holdings API)
function extractToken(storedToken: string | object | null): string | null {
  if (!storedToken) return null;
  
  // Handle object format (new format from Mesh Link)
  if (typeof storedToken === "object" && storedToken !== null) {
    const obj = storedToken as any;
    // CRITICAL: For Managed Transfers, we need accessToken from accountTokens[0].accessToken
    if (obj?.accountTokens?.[0]?.accessToken) {
      return String(obj.accountTokens[0].accessToken);
    }
    // Fallback to authToken
    if (obj?.accountTokens?.[0]?.authToken) {
      return String(obj.accountTokens[0].authToken);
    }
    // Check for direct authToken
    if (obj?.authToken) {
      return String(obj.authToken);
    }
    // Check for direct accessToken (if it's a string)
    if (obj?.accessToken && typeof obj.accessToken === "string") {
      return obj.accessToken;
    }
    return null;
  }
  
  // Handle string format
  if (typeof storedToken === "string") {
    // If it's a JSON string, parse it and extract the token
    if (storedToken.startsWith("{") || storedToken.startsWith("[")) {
      try {
        const parsed = JSON.parse(storedToken);
        
        // CRITICAL: For Managed Transfers, we need accessToken from accountTokens[0].accessToken
        if (parsed?.accountTokens && Array.isArray(parsed.accountTokens) && parsed.accountTokens.length > 0) {
          const firstToken = parsed.accountTokens[0];
          // Priority: accessToken > authToken (for Managed Transfers, accessToken is correct)
          const token = firstToken?.accessToken || firstToken?.authToken;
          if (token && typeof token === "string" && token.length > 20) {
            return token;
          }
        }
        
        // Check for direct authToken at root level
        if (parsed?.authToken && typeof parsed.authToken === "string" && parsed.authToken.length > 20) {
          return parsed.authToken;
        }
        
        // Check for direct accessToken at root level
        if (parsed?.accessToken && typeof parsed.accessToken === "string" && parsed.accessToken.length > 20) {
          return parsed.accessToken;
        }
        
        // If parsing succeeded but no valid token found, return original
        console.warn("[transfer/configure] Parsed JSON but no valid token found:", Object.keys(parsed));
        return storedToken;
      } catch (e) {
        // Not valid JSON, return as-is
        return storedToken;
      }
    }
    
    // Plain string token - validate it's a reasonable length
    if (storedToken.length > 20) {
      return storedToken;
    }
  }
  
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    let { 
      accessToken, 
      fromAccountId, 
      fromType, // Broker type (e.g., "coinbase", "robinhood") - required by Mesh API
      toAddress, 
      symbol, 
      networkId, 
      amount, 
      amountInFiat, 
      amountInFiatCurrencyCode 
    } = body;

    // Either amount (token) or amountInFiat (USD) must be provided
    if (!accessToken || !fromAccountId || !toAddress || !symbol || !networkId) {
      return NextResponse.json(
        { error: "Missing required fields: accessToken, fromAccountId, toAddress, symbol, networkId" },
        { status: 400 }
      );
    }

    if (amount === undefined && amountInFiat === undefined) {
      return NextResponse.json(
        { error: "Either 'amount' (token amount) or 'amountInFiat' (USD amount) must be provided" },
        { status: 400 }
      );
    }

    // Extract actual token (handles JSON-encoded tokens)
    const extractedToken = extractToken(accessToken);
    
    // Log for debugging
    console.log("[transfer/configure] Token extraction:", {
      originalTokenLength: accessToken?.length,
      originalTokenPrefix: accessToken?.substring(0, 50),
      originalTokenIsJson: accessToken?.startsWith("{") || accessToken?.startsWith("["),
      extractedTokenLength: extractedToken?.length,
      extractedTokenPrefix: extractedToken?.substring(0, 50),
      fromAccountId,
      symbol,
      networkId,
      amount,
      amountInFiat,
      amountInFiatCurrencyCode,
    });
    
    if (!extractedToken || extractedToken.length < 20) {
      return NextResponse.json(
        { 
          error: "Invalid access token format",
          details: {
            originalLength: accessToken?.length,
            extractedLength: extractedToken?.length,
            originalIsJson: accessToken?.startsWith("{") || accessToken?.startsWith("["),
          }
        },
        { status: 400 }
      );
    }

    // Build configure parameters - support both amount and amountInFiat
    // CRITICAL: Mesh Managed Transfers API requires fromType (broker type)
    const configureParams: any = {
      fromAccountId,
      toAddress,
      symbol,
      networkId,
    };
    
    // Add fromType if provided (required by Mesh API)
    if (fromType) {
      configureParams.fromType = fromType;
    }

    if (amountInFiat !== undefined) {
      configureParams.amountInFiat = Number(amountInFiat);
      configureParams.amountInFiatCurrencyCode = amountInFiatCurrencyCode || "USD";
    } else {
      configureParams.amount = Number(amount);
    }

    try {
      const result = await configureTransfer(extractedToken, configureParams);
      const transferId = extractTransferId(result);

      // Helpful server log for debugging response shape (no secrets)
      console.log("[transfer/configure] Mesh configure response keys:", {
        topLevelKeys: result && typeof result === "object" ? Object.keys(result) : [],
        contentKeys:
          result?.content && typeof result.content === "object" ? Object.keys(result.content) : [],
        transferId,
      });

      // Always include a top-level transferId so the frontend can reliably proceed.
      return NextResponse.json({ ...result, transferId });
    } catch (configureError: any) {
      const errorMessage = configureError.message || "Unknown error";
      
      // Check if it's a token-related error
      if (errorMessage.includes("Invalid integration token") || errorMessage.includes("invalidIntegrationToken")) {
        console.error("[transfer/configure] Token validation failed:", {
          tokenLength: extractedToken?.length,
          tokenPrefix: extractedToken?.substring(0, 30),
          fromAccountId,
          symbol,
          networkId,
          errorMessage,
        });
        
        return NextResponse.json(
          { 
            error: "Authentication token is invalid or expired. Please disconnect and reconnect your account on the Accounts page to get a fresh token.",
            details: {
              tokenLength: extractedToken?.length,
              errorType: "invalidToken",
            }
          },
          { status: 400 }
        );
      }

      // Pass-through Mesh validation errors as a 400 instead of crashing the route (500)
      const parsed = parseMeshConfigureError(errorMessage);
      if (parsed) {
        const payload = parsed.payload || {};
        return NextResponse.json(
          {
            error: payload.displayMessage || payload.message || errorMessage,
            details: payload,
          },
          { status: parsed.statusCode || 400 }
        );
      }

      // Default to 400 with message for other configure failures
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error configuring transfer";
    console.error("[transfer/configure] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

