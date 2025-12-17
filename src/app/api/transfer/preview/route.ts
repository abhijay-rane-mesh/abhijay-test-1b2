import { NextRequest, NextResponse } from "next/server";
import { previewTransfer } from "@/lib/meshClient";

function extractTransferId(result: any): string | null {
  if (!result || typeof result !== "object") return null;

  const candidates: Array<any> = [
    result.transferId,
    result.content?.transferId,
    // Mesh preview commonly returns previewResult.previewId (use as transferId for execute)
    result.content?.previewResult?.previewId,
    result.content?.id,
    result.id,
    result.transfer?.id,
    result.transfer?.transferId,
    result.content?.transfer?.id,
    result.content?.transfer?.transferId,
    result.content?.transfers?.[0]?.id,
    result.content?.transfers?.[0]?.transferId,
    result.content?.items?.[0]?.id,
    result.content?.items?.[0]?.transferId,
  ];
  for (const v of candidates) {
    if (typeof v === "string" && v.length > 10) return v;
  }

  // Deep search for transferId key
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

function parseMeshPreviewError(message: string): { statusCode: number; payload: any } | null {
  // Example: Mesh preview failed (400): {"status":"badRequest","message":"...","displayMessage":"...","errorType":"missingField"}
  const m = message.match(/Mesh preview failed \((\d+)\):\s*([\s\S]*)$/);
  if (!m) return null;
  const statusCode = Number(m[1]);
  const raw = (m[2] || "").trim();
  try {
    return { statusCode, payload: JSON.parse(raw) };
  } catch {
    return { statusCode, payload: { message: raw } };
  }
}

// Helper function to extract actual token from stored value (might be JSON string)
function extractToken(storedToken: string | null): string | null {
  if (!storedToken) return null;
  
  if (storedToken.startsWith("{") || storedToken.startsWith("[")) {
    try {
      const parsed = JSON.parse(storedToken);
      // Managed transfers uses fromAuthToken = accountTokens[0].accessToken
      if (parsed?.accountTokens?.[0]?.accessToken) {
        return String(parsed.accountTokens[0].accessToken);
      }
      if (parsed?.accountTokens?.[0]?.authToken) {
        return String(parsed.accountTokens[0].authToken);
      }
      if (parsed?.authToken) {
        return String(parsed.authToken);
      }
      if (parsed?.integrationToken) {
        return String(parsed.integrationToken);
      }
      if (parsed?.accessToken) {
        return String(parsed.accessToken);
      }
      return storedToken;
    } catch (e) {
      return storedToken;
    }
  }
  
  return storedToken;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      accessToken,
      transferId,
      // Optional: allow calling preview without transferId (same params as configure)
      fromAccountId,
      fromType,
      toAddress,
      symbol,
      networkId,
      amount,
      amountInFiat,
      amountInFiatCurrencyCode,
      fundingMethods,
    } = body;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Missing required field: accessToken" },
        { status: 400 }
      );
    }

    const extractedToken = extractToken(accessToken);
    if (!extractedToken || extractedToken.length < 20) {
      return NextResponse.json(
        { error: "Invalid or malformed access token provided." },
        { status: 400 }
      );
    }

    // If we have a transferId, use the simple preview call.
    // Otherwise, call preview with the transfer params (Mesh can create the transferId here).
    if (!transferId) {
      if (!toAddress || !networkId) {
        return NextResponse.json(
          { error: "Missing required fields when transferId is not provided: toAddress, networkId" },
          { status: 400 }
        );
      }
    }

    try {
      const result = await previewTransfer(
        extractedToken,
        transferId
          ? String(transferId)
          : {
              fromAccountId,
              fromType,
              toAddress,
              symbol,
              networkId,
              amount: amount !== undefined ? Number(amount) : undefined,
              amountInFiat: amountInFiat !== undefined ? Number(amountInFiat) : undefined,
              amountInFiatCurrencyCode,
              fundingMethods,
            }
      );
      const extractedTransferId = extractTransferId(result);

      console.log("[transfer/preview] Mesh preview response keys:", {
        topLevelKeys: result && typeof result === "object" ? Object.keys(result) : [],
        contentKeys:
          result?.content && typeof result.content === "object" ? Object.keys(result.content) : [],
        transferId: extractedTransferId,
      });

      return NextResponse.json({ ...result, transferId: extractedTransferId });
    } catch (e: any) {
      const msg = e?.message || "Unknown error";
      const parsed = parseMeshPreviewError(msg);
      if (parsed) {
        const payload = parsed.payload || {};
        return NextResponse.json(
          { error: payload.displayMessage || payload.message || msg, details: payload },
          { status: parsed.statusCode || 400 }
        );
      }
      throw e;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error previewing transfer";
    console.error("[transfer/preview] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

