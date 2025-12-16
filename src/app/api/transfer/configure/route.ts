import { NextRequest, NextResponse } from "next/server";
import { configureTransfer } from "@/lib/meshClient";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { accessToken, fromAccountId, toAddress, symbol, networkId, amount } = body;

    if (!accessToken || !fromAccountId || !toAddress || !symbol || !networkId || amount === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: accessToken, fromAccountId, toAddress, symbol, networkId, amount" },
        { status: 400 }
      );
    }

    const result = await configureTransfer(accessToken, {
      fromAccountId,
      toAddress,
      symbol,
      networkId,
      amount: Number(amount),
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error configuring transfer";
    console.error("[transfer/configure] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

