import { NextRequest, NextResponse } from "next/server";
import { getManagedTransferIntegrations } from "@/lib/meshClient";

export async function GET(request: NextRequest) {
  try {
    const result = await getManagedTransferIntegrations();
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error fetching integrations";
    console.error("[Integrations API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

