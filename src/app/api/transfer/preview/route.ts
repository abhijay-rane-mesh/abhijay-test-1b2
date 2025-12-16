import { NextRequest, NextResponse } from "next/server";
import { previewTransfer } from "@/lib/meshClient";

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

    const result = await previewTransfer(accessToken, transferId);

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error previewing transfer";
    console.error("[transfer/preview] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

