import { NextRequest, NextResponse } from "next/server";
import { saveAuth } from "@/lib/authStore";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      userId,
      providerType,
      accessToken,
      accountId,
      integrationId,
      rawPayload,
    } = body ?? {};

    if (!userId || !accessToken) {
      return NextResponse.json(
        { error: "userId and accessToken are required" },
        { status: 400 }
      );
    }

    // Use providerType or default to "unknown" if not provided
    const finalProviderType = providerType || "unknown";

    saveAuth({
      userId,
      providerType: finalProviderType,
      accessToken,
      accountId,
      integrationId,
      rawPayload,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error storing auth";

    console.error("[auth/store] Error:", message);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}


