import { NextRequest, NextResponse } from "next/server";
import { createMeshLinkToken } from "@/lib/meshClient";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    
    // Required field: userId (1-300 characters)
    const userId = body.userId ?? "user-local-1";
    if (!userId || userId.length === 0 || userId.length > 300) {
      return NextResponse.json(
        { error: "userId is required and must be 1-300 characters" },
        { status: 400 }
      );
    }

    // Build payload according to Mesh API spec
    const payload: any = { userId };

    // Optional: integrationId (UUID)
    if (body.integrationId && typeof body.integrationId === "string" && body.integrationId.trim().length > 0) {
      payload.integrationId = body.integrationId.trim();
    }

    // Optional: configurationId (UUID)
    if (body.configurationId && typeof body.configurationId === "string") {
      payload.configurationId = body.configurationId;
    }

    // Optional: restrictMultipleAccounts (boolean)
    if (typeof body.restrictMultipleAccounts === "boolean") {
      payload.restrictMultipleAccounts = body.restrictMultipleAccounts;
    }

    // Optional: disableApiKeyGeneration (boolean)
    if (typeof body.disableApiKeyGeneration === "boolean") {
      payload.disableApiKeyGeneration = body.disableApiKeyGeneration;
    }

    // Optional: subClientId (UUID)
    if (body.subClientId && typeof body.subClientId === "string") {
      payload.subClientId = body.subClientId;
    }

    // Optional: transferOptions
    if (body.transferOptions && typeof body.transferOptions === "object") {
      payload.transferOptions = body.transferOptions;
    }

    // Optional: verifyWalletOptions
    if (body.verifyWalletOptions && typeof body.verifyWalletOptions === "object") {
      payload.verifyWalletOptions = body.verifyWalletOptions;
    }

    const linkToken = await createMeshLinkToken(payload);

    return NextResponse.json({ linkToken });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error creating linkToken";

    console.error("[linktoken] Error:", message);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}


