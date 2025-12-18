import { NextRequest, NextResponse } from "next/server";
import { getTransfersList } from "@/lib/meshClient";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const fromAuthToken = String(body.fromAuthToken || body.authToken || "").trim();
    const type = String(body.type || body.brokerType || body.providerType || "").trim();

    if (!fromAuthToken || !type) {
      return NextResponse.json(
        { error: "fromAuthToken and type are required" },
        { status: 400 }
      );
    }

    const result = await getTransfersList(fromAuthToken);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error fetching transfers list";
    console.error("[transfers/list] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


