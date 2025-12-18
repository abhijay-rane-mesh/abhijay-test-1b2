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
  symbol?: string;
  address?: string;
  addressTag?: string;
  amount?: number;
  displayAmountInFiat?: number;
  minAmount?: number;
  minAmountInFiat?: number;
};

// Types for Mesh Transfer API responses (based on API documentation)
export type TransferStatus = "pending" | "succeeded" | "failed";
export type TransferType = "deposit" | "payment" | "onramp";
export type BrokerType = 
  | "robinhood" | "coinbase" | "kraken" | "cryptoCom" | "binanceUs" | "gemini"
  | "okCoin" | "kuCoin" | "cexIo" | "binanceInternational" | "bitstamp"
  | "gateIo" | "okx" | "bitFlyer" | "coinlist" | "huobi" | "bitfinex"
  | "deFiWallet" | "krakenDirect" | "binanceInternationalDirect"
  | "bitfinexDirect" | "bybit" | "paxos" | "coinbasePrime" | "btcTurkDirect"
  | "kuCoinDirect" | "okxOAuth" | "paribuDirect" | "robinhoodConnect"
  | "blockchainCom" | "bitsoDirect" | "binanceConnect" | "binanceOAuth"
  | "revolutConnect" | "binancePay" | "bybitDirect" | "paribuOAuth"
  | "payPalConnect" | "binanceTrDirect" | "coinbaseRamp" | "bybitDirectMobile"
  | "sandbox" | "cryptoComPay" | "bybitEuDirect" | "uphold"
  | "binancePayOnchain" | "sandboxCoinbase" | "bybitPay";

export type TransferFee = {
  fee: number;
  feeCurrency?: string;
  feeInFiat: number;
  feeInTransferCurrency: number;
};

export type TransferFundingMethod = {
  type: "existingCryptocurrencyBalance" | "buyingPowerPurchase" | "paymentMethodDepositUsage" | "cryptocurrencyConversion" | "stableCoinNoFeeConversion" | "cryptocurrencyBuyingPowerConversion" | "cryptocurrencyMultiStepConversion";
  amount: number;
  amountInFiat: number;
  toSymbol?: string;
  fromAmount: number;
  fromSymbol?: string;
  paymentMethodType?: "card" | "bankAccount" | "digitalWallet" | "unknown";
  fee?: TransferFee;
};

export type TransferIntegration = {
  id: string;
  type: BrokerType;
  name?: string;
  logoUrl?: string;
};

export type TransferModel = {
  id: string;
  clientTransactionId?: string;
  institutionTransactionId?: string;
  status: TransferStatus;
  amountInFiat: number;
  amountToReceiveInFiat: number;
  amountInFiatCurrencyCode?: string;
  amount: number;
  symbol?: string;
  tokenAddress?: string;
  networkName?: string;
  createdTimestamp: number;
  hash?: string;
  subClientId?: string;
  clientId?: string;
  companyName?: string;
  gasFee?: TransferFee;
  withdrawalFee?: TransferFee;
  processingFee?: TransferFee;
  executedTimestamp?: number;
  transferType?: TransferType;
  isFeeIncluded: boolean;
  destinationAddress?: string;
  addressTag?: string;
  isSmartFundingTransfer: boolean;
  unitPrice: number;
  requestedTransferAmount: number;
  refundAddress?: string;
  isBridgingTransfer: boolean;
  userId?: string;
  amountToReceive: number;
  networkId: string;
  networkLogoUrl?: string;
  infoUrl?: string;
  from?: TransferIntegration;
  sourceAmount?: number;
  destinationAmount?: number;
  destinationAmountInFiat?: number;
  totalFeesAmountInFiat: number;
  totalTransactionAmountInFiat: number;
  fundingMethods?: TransferFundingMethod[];
  bridgingDetails?: any; // Complex type, can be expanded if needed
};

export type TransferModelPaginationResponse = {
  items: TransferModel[];
  total: number;
};

export type TransferModelPaginationResponseApiResult = {
  status: "ok" | "serverFailure" | "permissionDenied" | "badRequest" | "notFound" | "conflict" | "tooManyRequest" | "locked" | "unavailableForLegalReasons";
  message?: string;
  displayMessage?: string;
  errorHash?: string;
  errorType?: string;
  content?: TransferModelPaginationResponse;
};

type LinkTokenRequestBody = {
  userId: string; // Required: 1-300 characters, unique user ID
  integrationId?: string; // Optional: UUID of specific integration
  configurationId?: string; // Optional: UUID for custom configuration
  restrictMultipleAccounts?: boolean; // Optional: Hide "Link another account" button
  disableApiKeyGeneration?: boolean; // Optional: Disable API key generation option
  subClientId?: string; // Optional: UUID for B2B2B clients
  transferOptions?: {
    toAddresses?: TransferToAddress[];
    amountInFiat?: number;
    transactionId?: string;
    clientFee?: number; // 0-1, percentage fee as ratio (e.g., 0.025 = 2.5%)
    transferType?: "deposit" | "payment" | "onramp";
    isInclusiveFeeEnabled?: boolean;
    description?: string; // Max 256 chars, for Binance Pay
    goodsDetails?: Array<{
      goodsType?: string; // "01" (Tangible) or "02" (Virtual)
      goodsCategory?: string;
      referenceGoodsId?: string;
      goodsName?: string;
      goodsDetail?: string;
    }>;
    generatePayLink?: boolean;
  };
  verifyWalletOptions?: {
    message?: string;
    verificationMethods?: Array<"signedMessage">;
    addresses?: string[];
    networkId?: string;
    networkType?: "unknown" | "evm" | "solana" | "bitcoin" | "cardano" | "tron" | "avalancheX" | "tezos" | "dogecoin" | "ripple" | "stellar" | "litecoin" | "sui" | "aptos" | "tvm" | "injective";
  };
  brokerType?: string; // Deprecated: Use integrationId instead
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
  
  // According to Mesh API docs, response structure is:
  // { content: { linkToken: "...", paymentLink?: "..." }, status: "ok", ... }
  const linkToken: string | undefined =
    json.content?.linkToken ?? json.linkToken ?? json.data?.linkToken;

  if (!linkToken) {
    console.error("[MeshClient] Unexpected response structure:", JSON.stringify(json, null, 2));
    throw new Error("Mesh did not return a linkToken in the expected format");
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
    fromType?: string; // Broker type (e.g., "coinbase", "robinhood") - required by Mesh API
    toAddress: string;
    symbol: string;
    networkId: string;
    amount?: number; // Token amount (optional if amountInFiat is provided)
    amountInFiat?: number; // USD amount (optional if amount is provided)
    amountInFiatCurrencyCode?: string; // Currency code, default "USD"
  }
) {
  // Mesh Managed Transfers API requires fromAuthToken in request body
  // Log for debugging
  console.log("[MeshClient] configureTransfer:", {
    fromAccountId: params.fromAccountId,
    tokenLength: fromAuthToken?.length,
    tokenPrefix: fromAuthToken?.substring(0, 20),
  });

  // Build request body
  // CRITICAL: Mesh Managed Transfers API requires both fromAuthToken and fromType
  // CRITICAL: Mesh API expects toAddresses as an array, not separate toAddress/symbol/networkId
  const requestBody: any = {
    fromAccountId: params.fromAccountId,
    fromAuthToken, // Required by Mesh API in request body
    toAddresses: [
      {
        networkId: params.networkId,
        symbol: params.symbol,
        address: params.toAddress,
      },
    ],
  };
  
  // Add fromType if provided (required by Mesh API for Managed Transfers)
  if (params.fromType) {
    requestBody.fromType = params.fromType;
  }
  
  // Add amount or amountInFiat
  if (params.amountInFiat !== undefined) {
    requestBody.amountInFiat = params.amountInFiat;
    requestBody.amountInFiatCurrencyCode = params.amountInFiatCurrencyCode || "USD";
  } else if (params.amount !== undefined) {
    requestBody.amount = params.amount;
  }

  // Log the full request for debugging (without exposing secrets)
  console.log("[MeshClient] configureTransfer request:", {
    url: `${MESH_API_URL}/api/v1/transfers/managed/configure`,
    fromAccountId: params.fromAccountId,
    fromType: params.fromType,
    toAddresses: requestBody.toAddresses,
    amount: params.amount,
    amountInFiat: params.amountInFiat,
    amountInFiatCurrencyCode: params.amountInFiatCurrencyCode,
    fromAuthTokenLength: fromAuthToken?.length,
    fromAuthTokenPrefix: fromAuthToken?.substring(0, 30),
    fromAuthTokenSuffix: fromAuthToken?.substring(fromAuthToken.length - 10),
    requestBodyKeys: Object.keys(requestBody),
  });

  // CRITICAL: For Managed Transfers, Mesh API expects fromAuthToken ONLY in the request body,
  // NOT in the Authorization header. The Authorization header is not used for Managed Transfers.
  // Only X-Client-Id and X-Client-Secret are used for authentication.
  const res = await fetch(`${MESH_API_URL}/api/v1/transfers/managed/configure`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Client-Id": MESH_CLIENT_ID,
      "X-Client-Secret": MESH_CLIENT_SECRET,
      // NOTE: Do NOT include Authorization header for Managed Transfers
      // The fromAuthToken is only sent in the request body
    },
    body: JSON.stringify(requestBody),
  });
  
  // Log the actual request body structure (without the full token for security)
  console.log("[MeshClient] Actual request body structure:", {
    hasFromAuthToken: !!requestBody.fromAuthToken,
    fromAuthTokenType: typeof requestBody.fromAuthToken,
    fromAuthTokenLength: requestBody.fromAuthToken?.length,
    fromAccountId: requestBody.fromAccountId,
    fromType: requestBody.fromType,
    toAddresses: requestBody.toAddresses,
    hasAmount: requestBody.amount !== undefined,
    hasAmountInFiat: requestBody.amountInFiat !== undefined,
    allKeys: Object.keys(requestBody),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    const errorMessage = errorBody || res.statusText;
    
    // Log detailed error information for debugging
    console.error("[MeshClient] configureTransfer failed:", {
      status: res.status,
      statusText: res.statusText,
      errorBody,
      fromAccountId: params.fromAccountId,
      tokenLength: fromAuthToken?.length,
      tokenPrefix: fromAuthToken?.substring(0, 30),
      requestBody: {
        fromAccountId: requestBody.fromAccountId,
        fromType: requestBody.fromType,
        toAddresses: requestBody.toAddresses,
        amount: requestBody.amount,
        amountInFiat: requestBody.amountInFiat,
        amountInFiatCurrencyCode: requestBody.amountInFiatCurrencyCode,
        fromAuthTokenLength: fromAuthToken?.length,
      },
    });
    
    throw new Error(
      `Mesh configure failed (${res.status}): ${errorMessage}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}

export async function previewTransfer(
  fromAuthToken: string,
  input:
    | string
    | {
        transferId?: string;
        fromAccountId?: string;
        fromType?: string;
        toAddress?: string;
        symbol?: string;
        networkId?: string;
        amount?: number;
        amountInFiat?: number;
        amountInFiatCurrencyCode?: string;
        fundingMethods?: any[];
      }
) {
  const body: any = { fromAuthToken };
  if (typeof input === "string") {
    body.transferId = input;
  } else {
    if (input.transferId) body.transferId = input.transferId;
    if (input.fromAccountId) body.fromAccountId = input.fromAccountId;
    if (input.fromType) body.fromType = input.fromType;

    // NOTE: Mesh preview expects ToAddress/toAddress (and optionally ToType/ToAuthToken for account destinations).
    // In some flows, configure uses toAddresses[], but preview errors if only toAddresses is provided.
    if (input.toAddress) {
      body.toAddress = input.toAddress;
      body.ToAddress = input.toAddress; // compatibility with docs/error capitalization
    }
    if (input.symbol) body.symbol = input.symbol;
    if (input.networkId) body.networkId = input.networkId;

    if (input.amountInFiat !== undefined) {
      body.amountInFiat = input.amountInFiat;
      body.amountInFiatCurrencyCode = input.amountInFiatCurrencyCode || "USD";
    } else if (input.amount !== undefined) {
      body.amount = input.amount;
    }

    if (input.fundingMethods) body.fundingMethods = input.fundingMethods;
  }

  // CRITICAL: For Managed Transfers, Mesh API expects fromAuthToken in the request body,
  // and X-Client-Id / X-Client-Secret headers for authentication.
  const res = await fetch(`${MESH_API_URL}/api/v1/transfers/managed/preview`, {
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
    throw new Error(
      `Mesh preview failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}

export async function executeTransfer(
  fromAuthToken: string,
  previewId: string,
  options?: { mfaCode?: string; fromType?: string }
) {
  const body: any = { 
    // Managed Transfers execute expects previewId (and returns transferId)
    previewId,
    fromAuthToken,
  };
  if (options?.fromType) body.fromType = options.fromType;
  if (options?.mfaCode) body.mfaCode = options.mfaCode;

  // CRITICAL: For Managed Transfers, Mesh API expects fromAuthToken ONLY in the request body,
  // NOT in the Authorization header. Only X-Client-Id and X-Client-Secret are used for authentication.
  const res = await fetch(`${MESH_API_URL}/api/v1/transfers/managed/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Client-Id": MESH_CLIENT_ID,
      "X-Client-Secret": MESH_CLIENT_SECRET,
      // NOTE: Do NOT include Authorization header for Managed Transfers
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

// Portfolio API functions - Accounts + balances (production paths)
export async function getAccounts(fromAuthToken: string) {
  const attempts: Array<{ url: string; method: "GET" | "POST"; body?: any }> = [
    { url: `${MESH_API_URL}/v1/accounts`, method: "GET" },
    { url: `${MESH_API_URL}/api/v1/accounts`, method: "GET" },
    { url: `${MESH_API_URL}/api/v1/account`, method: "GET" },
    { url: `${MESH_API_URL}/v1/account`, method: "GET" },
    { url: `${MESH_API_URL}/api/v1/accounts/get`, method: "POST", body: {} },
  ];

  let lastError = "";

  for (const attempt of attempts) {
    const res = await fetch(attempt.url, {
      method: attempt.method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Client-Id": MESH_CLIENT_ID,
        "X-Client-Secret": MESH_CLIENT_SECRET,
        Authorization: `Bearer ${fromAuthToken}`,
      },
      body: attempt.method === "POST" ? JSON.stringify(attempt.body ?? {}) : undefined,
    });

    if (res.ok) {
      return (await res.json()) as any;
    }

    lastError = (await res.text().catch(() => "")) || res.statusText || `status ${res.status}`;

    if (res.status !== 404 && res.status !== 405) {
      break;
    }
  }

  throw new Error(`Mesh accounts failed: ${lastError}`);
}

// Get holdings using /api/v1/holdings/get
// Holdings using integration token + type (recommended by Mesh docs)
export async function getHoldingsWithType(
  authToken: string,
  providerType: string,
  includeMarketValue = true
) {
  const res = await fetch(`${MESH_API_URL}/api/v1/holdings/get`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Client-Id": MESH_CLIENT_ID,
      "X-Client-Secret": MESH_CLIENT_SECRET,
    },
    body: JSON.stringify({
      authToken,
      type: providerType,
      includeMarketValue,
    }),
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

// Legacy signature (best-effort with managed token)
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

// Get aggregated portfolio using GET /api/v1/holdings/portfolio
// According to Mesh API docs: GET with UserId query parameter (required)
export async function getAggregatedPortfolio(userId: string, timezoneOffset?: number) {
  const params = new URLSearchParams({ UserId: userId });
  if (timezoneOffset !== undefined) {
    params.append("TimezoneOffset", String(timezoneOffset));
  }
  
  const res = await fetch(`${MESH_API_URL}/api/v1/holdings/portfolio?${params.toString()}`, {
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
      `Mesh aggregated portfolio failed (${res.status}): ${errorBody || res.statusText}`
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

// Get aggregated portfolio fiat balances using GET /api/v1/balance/portfolio
// According to Mesh API docs: GET with optional UserId query parameter
export async function getAggregatedPortfolioBalance(userId?: string) {
  const params = new URLSearchParams();
  if (userId) {
    params.append("UserId", userId);
  }
  
  const url = userId 
    ? `${MESH_API_URL}/api/v1/balance/portfolio?${params.toString()}`
    : `${MESH_API_URL}/api/v1/balance/portfolio`;
  
  const res = await fetch(url, {
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
      `Mesh aggregated portfolio balance failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}

// Get account balances
// According to Mesh API docs: POST /api/v1/balance/get requires authToken + type + accountId
// Also supports GET /api/v1/accounts/{accountId}/balances with Authorization header
export async function getAccountBalances(
  fromAuthToken: string,
  accountId: string,
  accountType?: string
) {
  // Helper to extract actual token from potentially JSON-encoded string
  const extractToken = (token: string): string => {
    if (typeof token === "string" && (token.startsWith("{") || token.startsWith("["))) {
      try {
        const parsed = JSON.parse(token);
        return parsed?.accountTokens?.[0]?.authToken || parsed?.authToken || token;
      } catch (e) {
        return token;
      }
    }
    return token;
  };

  const extractedToken = extractToken(fromAuthToken);

  // Try POST /api/v1/balance/get first (requires authToken + type in body)
  if (accountType) {
    try {
      const res = await fetch(`${MESH_API_URL}/api/v1/balance/get`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Client-Id": MESH_CLIENT_ID,
          "X-Client-Secret": MESH_CLIENT_SECRET,
        },
        body: JSON.stringify({
          authToken: extractedToken,
          type: accountType,
          accountId,
        }),
      });

      if (res.ok) {
        return (await res.json()) as any;
      }
    } catch (err) {
      // Continue to fallback methods
    }
  }

  // Fallback: Try GET endpoints with Authorization header
  const attempts: Array<{ url: string; method: "GET" | "POST"; body?: any }> = [
    { url: `${MESH_API_URL}/api/v1/accounts/${accountId}/balances`, method: "GET" },
    { url: `${MESH_API_URL}/v1/accounts/${accountId}/balances`, method: "GET" },
  ];

  let lastError = "";

  for (const attempt of attempts) {
    const res = await fetch(attempt.url, {
      method: attempt.method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Client-Id": MESH_CLIENT_ID,
        "X-Client-Secret": MESH_CLIENT_SECRET,
        Authorization: `Bearer ${extractedToken}`,
      },
    });

    if (res.ok) {
      return (await res.json()) as any;
    }

    lastError = (await res.text().catch(() => "")) || res.statusText || `status ${res.status}`;

    if (res.status !== 404 && res.status !== 405) {
      break;
    }
  }

  throw new Error(`Mesh account balances failed: ${lastError}`);
}

// Additional Mesh API endpoints

// Get health status using GET /api/v1/status
// According to Mesh API docs: Returns list of supported institutions and their health statuses
// Only requires client credentials, no auth token needed
export async function getHealthStatus() {
  const res = await fetch(`${MESH_API_URL}/api/v1/status`, {
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
      `Mesh health status failed (${res.status}): ${errorBody || res.statusText}`
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

// Get supported tokens list using GET /api/v1/transfers/managed/tokens
export async function getManagedTransferTokens() {
  const res = await fetch(`${MESH_API_URL}/api/v1/transfers/managed/tokens`, {
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
      `Mesh managed transfer tokens failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}

// Get deposit address using POST /api/v1/transfers/managed/address/get
// Requires authToken + type (integration token), not managed transfer token
export async function getDepositAddress(
  authToken: string,
  providerType: string,
  params: {
    symbol: string;
    networkId: string;
    mfaCode?: string;
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
      },
      body: JSON.stringify({
        authToken,
        type: providerType,
        ...params,
      }),
    }
  );

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(
      `Mesh deposit address failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}

// Get deposit addresses (plural) using POST /api/v1/transfers/managed/address/list
export async function getDepositAddresses(
  authToken: string,
  providerType: string,
  params: {
    symbol: string;
    networks?: Array<{ networkId?: string; caipId?: string }>;
    mfaCode?: string;
  }
) {
  const res = await fetch(
    `${MESH_API_URL}/api/v1/transfers/managed/address/list`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Client-Id": MESH_CLIENT_ID,
        "X-Client-Secret": MESH_CLIENT_SECRET,
      },
      body: JSON.stringify({
        authToken,
        type: providerType,
        ...params,
      }),
    }
  );

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(
      `Mesh deposit addresses failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}

// Get transfers initiated by Mesh using GET /api/v1/transfers/managed/mesh
// This endpoint doesn't require authentication tokens, only client credentials
export async function getTransfersInitiatedByMesh(params?: {
  count?: number;
  offset?: number;
  id?: string;
  clientTransactionId?: string;
  userId?: string;
  integrationIds?: string[];
  statuses?: ("pending" | "succeeded" | "failed")[];
  fromTimestamp?: number;
  toTimestamp?: number;
  minAmountInFiat?: number;
  maxAmountInFiat?: number;
  orderBy?: "id" | "clientTransferId" | "userId" | "fromType" | "amountInFiat" | "status" | "createdTimestamp" | "symbol" | "networkName";
  hash?: string;
  subClientId?: string;
  descendingOrder?: boolean;
  isSandBox?: boolean;
}) {
  // Build query string
  const queryParams = new URLSearchParams();
  if (params?.count !== undefined) queryParams.append("Count", String(params.count));
  if (params?.offset !== undefined) queryParams.append("Offset", String(params.offset));
  if (params?.id) queryParams.append("Id", params.id);
  if (params?.clientTransactionId) queryParams.append("ClientTransactionId", params.clientTransactionId);
  if (params?.userId) queryParams.append("UserId", params.userId);
  if (params?.integrationIds && params.integrationIds.length > 0) {
    params.integrationIds.forEach(id => queryParams.append("IntegrationIds", id));
  }
  if (params?.statuses && params.statuses.length > 0) {
    params.statuses.forEach(status => queryParams.append("Statuses", status));
  }
  if (params?.fromTimestamp !== undefined) queryParams.append("FromTimestamp", String(params.fromTimestamp));
  if (params?.toTimestamp !== undefined) queryParams.append("ToTimestamp", String(params.toTimestamp));
  if (params?.minAmountInFiat !== undefined) queryParams.append("MinAmountInFiat", String(params.minAmountInFiat));
  if (params?.maxAmountInFiat !== undefined) queryParams.append("MaxAmountInFiat", String(params.maxAmountInFiat));
  if (params?.orderBy) queryParams.append("OrderBy", params.orderBy);
  if (params?.hash) queryParams.append("Hash", params.hash);
  if (params?.subClientId) queryParams.append("SubClientId", params.subClientId);
  if (params?.descendingOrder !== undefined) queryParams.append("DescendingOrder", String(params.descendingOrder));
  if (params?.isSandBox !== undefined) queryParams.append("IsSandBox", String(params.isSandBox));

  const queryString = queryParams.toString();
  const url = `${MESH_API_URL}/api/v1/transfers/managed/mesh${queryString ? `?${queryString}` : ""}`;

  const res = await fetch(url, {
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
      `Mesh transfers initiated by Mesh failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as TransferModelPaginationResponseApiResult;
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

// Refresh token using POST /api/v1/token/refresh
// According to Mesh API docs: requires refreshToken and type
export async function refreshToken(
  refreshToken: string,
  type: string,
  options?: {
    accessToken?: string; // Required for WeBull and Vanguard
    tradeToken?: string; // For WeBull
    mfaCode?: string; // For Vanguard if MFA is triggered
    createNewRefreshToken?: boolean; // For TD Ameritrade
    metadata?: Record<string, string | null>;
  }
) {
  const body: any = {
    refreshToken,
    type,
  };

  if (options?.accessToken) body.accessToken = options.accessToken;
  if (options?.tradeToken) body.tradeToken = options.tradeToken;
  if (options?.mfaCode) body.mfaCode = options.mfaCode;
  if (options?.createNewRefreshToken !== undefined) body.createNewRefreshToken = options.createNewRefreshToken;
  if (options?.metadata) body.metadata = options.metadata;

  const res = await fetch(`${MESH_API_URL}/api/v1/token/refresh`, {
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
    throw new Error(
      `Mesh token refresh failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}

// Remove connection using DELETE /api/v1/account
// According to Mesh API docs: requires authToken and type
export async function removeConnection(authToken: string, type: string) {
  const res = await fetch(`${MESH_API_URL}/api/v1/account`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Client-Id": MESH_CLIENT_ID,
      "X-Client-Secret": MESH_CLIENT_SECRET,
    },
    body: JSON.stringify({
      authToken,
      type,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(
      `Mesh remove connection failed (${res.status}): ${errorBody || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  return json;
}
