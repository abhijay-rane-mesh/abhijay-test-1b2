import { NextRequest, NextResponse } from "next/server";
import { createMeshLinkToken } from "@/lib/meshClient";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = body.userId ?? "user-local-1";
    const rawIntegrationId = body.integrationId as string | undefined;
    const transferOptions = body.transferOptions;

    const payload: {
      userId: string;
      integrationId?: string;
      transferOptions?: any;
    } = { userId };

    if (rawIntegrationId && rawIntegrationId.trim().length > 0) {
      // Only send integrationId if it is a non-empty string; Mesh expects a GUID here.
      payload.integrationId = rawIntegrationId;
    }

    if (transferOptions) {
      payload.transferOptions = transferOptions;
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


