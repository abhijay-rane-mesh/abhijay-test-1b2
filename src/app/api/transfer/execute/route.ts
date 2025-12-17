import { NextRequest, NextResponse } from "next/server";
import { executeTransfer } from "@/lib/meshClient";

function parseMeshExecuteError(message: string): { statusCode: number; payload: any } | null {
  // Example: Mesh execute failed (400): {"status":"badRequest","message":"...","displayMessage":"...","errorType":"..."}
  const m = message.match(/Mesh execute failed \((\d+)\):\s*([\s\S]*)$/);
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
      if (parsed?.accountTokens?.[0]?.accessToken) return String(parsed.accountTokens[0].accessToken);
      if (parsed?.accountTokens?.[0]?.authToken) return String(parsed.accountTokens[0].authToken);
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
    const { accessToken, transferId, fromType, mfaCode } = body;

    if (!accessToken || !transferId) {
      return NextResponse.json(
        { error: "Missing required fields: accessToken, transferId" },
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

    try {
      // NOTE: Mesh Managed Transfers execute expects previewId (we store it in transferId on the FE for simplicity)
      const result = await executeTransfer(extractedToken, String(transferId), {
        fromType: fromType ? String(fromType) : undefined,
        mfaCode: mfaCode ? String(mfaCode) : undefined,
      });
      return NextResponse.json(result);
    } catch (e: any) {
      const msg = e?.message || "Unknown error";
      const parsed = parseMeshExecuteError(msg);
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
    const message = error instanceof Error ? error.message : "Unknown error executing transfer";
    console.error("[transfer/execute] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

