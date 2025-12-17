import { NextRequest, NextResponse } from "next/server";
import { getTransfersInitiatedByMesh } from "@/lib/meshClient";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // Parse query parameters
    const params: any = {};
    
    if (searchParams.has("count")) {
      params.count = parseInt(searchParams.get("count") || "10", 10);
    }
    if (searchParams.has("offset")) {
      params.offset = parseInt(searchParams.get("offset") || "0", 10);
    }
    if (searchParams.has("id")) {
      params.id = searchParams.get("id");
    }
    if (searchParams.has("clientTransactionId")) {
      params.clientTransactionId = searchParams.get("clientTransactionId");
    }
    if (searchParams.has("userId")) {
      params.userId = searchParams.get("userId");
    }
    if (searchParams.has("integrationIds")) {
      params.integrationIds = searchParams.getAll("integrationIds");
    }
    if (searchParams.has("statuses")) {
      params.statuses = searchParams.getAll("statuses") as ("pending" | "succeeded" | "failed")[];
    }
    if (searchParams.has("fromTimestamp")) {
      params.fromTimestamp = parseInt(searchParams.get("fromTimestamp") || "0", 10);
    }
    if (searchParams.has("toTimestamp")) {
      params.toTimestamp = parseInt(searchParams.get("toTimestamp") || "0", 10);
    }
    if (searchParams.has("minAmountInFiat")) {
      params.minAmountInFiat = parseFloat(searchParams.get("minAmountInFiat") || "0");
    }
    if (searchParams.has("maxAmountInFiat")) {
      params.maxAmountInFiat = parseFloat(searchParams.get("maxAmountInFiat") || "0");
    }
    if (searchParams.has("orderBy")) {
      params.orderBy = searchParams.get("orderBy");
    }
    if (searchParams.has("hash")) {
      params.hash = searchParams.get("hash");
    }
    if (searchParams.has("subClientId")) {
      params.subClientId = searchParams.get("subClientId");
    }
    if (searchParams.has("descendingOrder")) {
      params.descendingOrder = searchParams.get("descendingOrder") === "true";
    }
    if (searchParams.has("isSandBox")) {
      params.isSandBox = searchParams.get("isSandBox") === "true";
    }

    const result = await getTransfersInitiatedByMesh(Object.keys(params).length > 0 ? params : undefined);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error fetching transfers";
    console.error("[transfers/mesh] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

