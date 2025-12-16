import { NextResponse } from "next/server";
import { getNetworks } from "@/lib/meshClient";

export async function GET() {
  try {
    const networks = await getNetworks();
    return NextResponse.json(networks);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error fetching networks";
    console.error("[networks] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

