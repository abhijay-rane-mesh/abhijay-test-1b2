const MESH_API_URL = process.env.MESH_API_URL!;
const MESH_CLIENT_ID = process.env.MESH_CLIENT_ID!;
const MESH_CLIENT_SECRET = process.env.MESH_CLIENT_SECRET!;

if (!MESH_API_URL || !MESH_CLIENT_ID || !MESH_CLIENT_SECRET) {
  // Server-side log only
  console.warn(
    "[MeshClient] Missing env vars. Check MESH_API_URL, MESH_CLIENT_ID, MESH_CLIENT_SECRET"
  );
}

type TransferToAddress = {
  networkId: string;
  symbol: string;
  address: string;
  amount?: number;
};

type LinkTokenRequestBody = {
  userId: string;
  integrationId?: string;
  transferOptions?: {
    toAddresses: TransferToAddress[];
    amountInFiat?: number;
    transferType?: "payment" | "deposit";
    fundingOptions?: {
      enabled: boolean;
    };
    transactionId?: string;
  };
};

export async function createMeshLinkToken(body: LinkTokenRequestBody) {
  // Log configuration (without exposing secrets)
  console.log("[MeshClient] Creating linkToken:", {
    apiUrl: MESH_API_URL,
    clientId: MESH_CLIENT_ID,
    clientSecretPrefix: MESH_CLIENT_SECRET?.substring(0, 10) + "...",
    isSandboxKey: MESH_CLIENT_SECRET?.startsWith("sk_sand_"),
  });

  const res = await fetch(`${MESH_API_URL}/api/v1/linktoken`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Client-Id": MESH_CLIENT_ID,
      "X-Client-Secret": MESH_CLIENT_SECRET,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    const errorMessage = errorBody || res.statusText;
    
    if (res.status === 401) {
      console.error("[MeshClient] 401 Unauthorized - Check your API keys:");
      console.error("  - MESH_API_URL:", MESH_API_URL);
      console.error("  - MESH_CLIENT_ID:", MESH_CLIENT_ID);
      console.error("  - Client Secret starts with:", MESH_CLIENT_SECRET?.substring(0, 10));
      console.error("  - Is sandbox key?", MESH_CLIENT_SECRET?.startsWith("sk_sand_"));
      console.error("  - Using production URL?", MESH_API_URL?.includes("integration-api.meshconnect.com"));
      
      if (MESH_CLIENT_SECRET?.startsWith("sk_sand_") && MESH_API_URL?.includes("integration-api.meshconnect.com")) {
        throw new Error(
          `❌ Mismatch: You're using SANDBOX keys (sk_sand_...) with PRODUCTION URL. ` +
          `Get production keys from Mesh Dashboard > Account > API keys > Production`
        );
      }
    }
    
    throw new Error(
      `Mesh linktoken failed (${res.status}): ${errorMessage}`
    );
  }

  const json = (await res.json()) as any;
  const linkToken: string | undefined =
    json.linkToken ?? json.content?.linkToken ?? json.data?.linkToken;

  if (!linkToken) {
    throw new Error("Mesh did not return a linkToken");
  }

  return linkToken;
}

// Managed Transfers API - Core 1B1 requirement
// These endpoints work with the Link accessToken we get from onIntegrationConnected

export async function getNetworks() {
  const res = await fetch(`${MESH_API_URL}/api/v1/transfers/managed/networks`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Client-Id": MESH_CLIENT_ID,
      "X-Client-Secret": MESH_CLIENT_SECRET,
    },
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(
      `Mesh networks failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}

export async function configureTransfer(
  fromAuthToken: string,
  params: {
    fromAccountId: string;
    toAddress: string;
    symbol: string;
    networkId: string;
    amount: number;
  }
) {
  const res = await fetch(`${MESH_API_URL}/api/v1/transfers/managed/configure`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Client-Id": MESH_CLIENT_ID,
      "X-Client-Secret": MESH_CLIENT_SECRET,
      Authorization: `Bearer ${fromAuthToken}`,
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(
      `Mesh configure failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}

export async function previewTransfer(
  fromAuthToken: string,
  transferId: string
) {
  const res = await fetch(`${MESH_API_URL}/api/v1/transfers/managed/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Client-Id": MESH_CLIENT_ID,
      "X-Client-Secret": MESH_CLIENT_SECRET,
      Authorization: `Bearer ${fromAuthToken}`,
    },
    body: JSON.stringify({ transferId }),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(
      `Mesh preview failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}

export async function executeTransfer(
  fromAuthToken: string,
  transferId: string,
  mfaCode?: string
) {
  const body: any = { transferId };
  if (mfaCode) {
    body.mfaCode = mfaCode;
  }

  const res = await fetch(`${MESH_API_URL}/api/v1/transfers/managed/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Client-Id": MESH_CLIENT_ID,
      "X-Client-Secret": MESH_CLIENT_SECRET,
      Authorization: `Bearer ${fromAuthToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(
      `Mesh execute failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}

// Portfolio API functions - Using correct Mesh API endpoints
export async function getAccounts(fromAuthToken: string) {
  // Try /api/v1/accounts (plural) first, fallback to /api/v1/account if needed
  let res = await fetch(`${MESH_API_URL}/api/v1/accounts`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Client-Id": MESH_CLIENT_ID,
      "X-Client-Secret": MESH_CLIENT_SECRET,
      Authorization: `Bearer ${fromAuthToken}`,
    },
  });

  // If 404, try singular form
  if (res.status === 404) {
    res = await fetch(`${MESH_API_URL}/api/v1/account`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Client-Id": MESH_CLIENT_ID,
        "X-Client-Secret": MESH_CLIENT_SECRET,
        Authorization: `Bearer ${fromAuthToken}`,
      },
    });
  }

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(
      `Mesh accounts failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}

// Get holdings using /api/v1/holdings/get
export async function getHoldings(fromAuthToken: string, accountId?: string) {
  const res = await fetch(`${MESH_API_URL}/api/v1/holdings/get`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Client-Id": MESH_CLIENT_ID,
      "X-Client-Secret": MESH_CLIENT_SECRET,
      Authorization: `Bearer ${fromAuthToken}`,
    },
    body: JSON.stringify(accountId ? { accountId } : {}),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(
      `Mesh holdings failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}

// Get portfolio holdings using /api/v1/holdings/portfolio
export async function getPortfolioHoldings(fromAuthToken: string) {
  const res = await fetch(`${MESH_API_URL}/api/v1/holdings/portfolio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Client-Id": MESH_CLIENT_ID,
      "X-Client-Secret": MESH_CLIENT_SECRET,
      Authorization: `Bearer ${fromAuthToken}`,
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(
      `Mesh portfolio holdings failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}

// Get balance using /api/v1/balance/get
export async function getBalance(
  fromAuthToken: string,
  accountId: string,
  symbol?: string
) {
  const res = await fetch(`${MESH_API_URL}/api/v1/balance/get`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Client-Id": MESH_CLIENT_ID,
      "X-Client-Secret": MESH_CLIENT_SECRET,
      Authorization: `Bearer ${fromAuthToken}`,
    },
    body: JSON.stringify({
      accountId,
      ...(symbol && { symbol }),
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(
      `Mesh balance failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}

// Get portfolio balance using /api/v1/balance/portfolio
export async function getPortfolioBalance(fromAuthToken: string) {
  const res = await fetch(`${MESH_API_URL}/api/v1/balance/portfolio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Client-Id": MESH_CLIENT_ID,
      "X-Client-Secret": MESH_CLIENT_SECRET,
      Authorization: `Bearer ${fromAuthToken}`,
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(
      `Mesh portfolio balance failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}

// Legacy function for backward compatibility
export async function getAccountBalances(
  fromAuthToken: string,
  accountId: string
) {
  // Use the new balance/get endpoint
  return getBalance(fromAuthToken, accountId);
}

// Additional Mesh API endpoints

// Get account status using /api/v1/status
export async function getAccountStatus(fromAuthToken: string) {
  const res = await fetch(`${MESH_API_URL}/api/v1/status`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Client-Id": MESH_CLIENT_ID,
      "X-Client-Secret": MESH_CLIENT_SECRET,
      Authorization: `Bearer ${fromAuthToken}`,
    },
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(
      `Mesh status failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}

// Get integrations using /api/v1/integrations
export async function getIntegrations() {
  const res = await fetch(`${MESH_API_URL}/api/v1/integrations`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Client-Id": MESH_CLIENT_ID,
      "X-Client-Secret": MESH_CLIENT_SECRET,
    },
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(
      `Mesh integrations failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}

// Get managed transfer integrations using /api/v1/transfers/managed/integrations
export async function getManagedTransferIntegrations() {
  const res = await fetch(
    `${MESH_API_URL}/api/v1/transfers/managed/integrations`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Client-Id": MESH_CLIENT_ID,
        "X-Client-Secret": MESH_CLIENT_SECRET,
      },
    }
  );

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(
      `Mesh managed transfer integrations failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}

// Get managed transfer tokens using /api/v1/transfers/managed/tokens
export async function getManagedTransferTokens(networkId?: string) {
  const res = await fetch(`${MESH_API_URL}/api/v1/transfers/managed/tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Client-Id": MESH_CLIENT_ID,
      "X-Client-Secret": MESH_CLIENT_SECRET,
    },
    body: JSON.stringify(networkId ? { networkId } : {}),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(
      `Mesh managed transfer tokens failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}

// Get transfer address using /api/v1/transfers/managed/address/get
export async function getTransferAddress(
  fromAuthToken: string,
  params: {
    accountId: string;
    networkId: string;
    symbol: string;
  }
) {
  const res = await fetch(
    `${MESH_API_URL}/api/v1/transfers/managed/address/get`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Client-Id": MESH_CLIENT_ID,
        "X-Client-Secret": MESH_CLIENT_SECRET,
        Authorization: `Bearer ${fromAuthToken}`,
      },
      body: JSON.stringify(params),
    }
  );

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(
      `Mesh transfer address failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}

// Get transfers list using /api/v1/transfers/list
export async function getTransfersList(fromAuthToken: string) {
  const res = await fetch(`${MESH_API_URL}/api/v1/transfers/list`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Client-Id": MESH_CLIENT_ID,
      "X-Client-Secret": MESH_CLIENT_SECRET,
      Authorization: `Bearer ${fromAuthToken}`,
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(
      `Mesh transfers list failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}

// Get transfer details using /api/v1/transfers/details
export async function getTransferDetails(
  fromAuthToken: string,
  transferId: string
) {
  const res = await fetch(`${MESH_API_URL}/api/v1/transfers/details`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Client-Id": MESH_CLIENT_ID,
      "X-Client-Secret": MESH_CLIENT_SECRET,
      Authorization: `Bearer ${fromAuthToken}`,
    },
    body: JSON.stringify({ transferId }),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(
      `Mesh transfer details failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}

// Refresh token using /api/v1/token/refresh
export async function refreshToken(refreshToken: string) {
  const res = await fetch(`${MESH_API_URL}/api/v1/token/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Client-Id": MESH_CLIENT_ID,
      "X-Client-Secret": MESH_CLIENT_SECRET,
    },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(
      `Mesh token refresh failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}
