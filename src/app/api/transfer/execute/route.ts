import { NextRequest, NextResponse } from "next/server";
import { executeTransfer } from "@/lib/meshClient";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { accessToken, transferId } = body;

    if (!accessToken || !transferId) {
      return NextResponse.json(
        { error: "Missing required fields: accessToken, transferId" },
        { status: 400 }
      );
    }

    const { mfaCode } = body;
    const result = await executeTransfer(accessToken, transferId, mfaCode);

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error executing transfer";
    console.error("[transfer/execute] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

