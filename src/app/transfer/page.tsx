"use client";

import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";

type TransferStep = "configure" | "preview" | "execute" | "success";

export default function TransferPage() {
  const [step, setStep] = useState<TransferStep>("configure");
  const [networks, setNetworks] = useState<any[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [connectedAccounts, setConnectedAccounts] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [walletAddresses, setWalletAddresses] = useState<any[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<string>("");
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [selectedSymbol, setSelectedSymbol] = useState<string>("");
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [toAddress, setToAddress] = useState<string>("");
  const [toAddressMode, setToAddressMode] = useState<"select" | "manual">("select");
  const [amountMode, setAmountMode] = useState<"usd" | "token">("usd"); // USD or token amount
  const [amount, setAmount] = useState<string>("0");
  const [tokenPrice, setTokenPrice] = useState<number | null>(null); // Current token price in USD
  const [transferId, setTransferId] = useState<string>("");
  const [previewData, setPreviewData] = useState<any>(null);
  const [configureData, setConfigureData] = useState<any>(null);
  const [mfaCode, setMfaCode] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferResult, setTransferResult] = useState<any>(null);

  // Address helpers
  const isHex40 = (v: string) => /^[0-9a-fA-F]{40}$/.test(v);
  const isEvmAddress = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v) || isHex40(v);
  const normalizeEvmAddress = (v: string) => (isHex40(v) ? `0x${v}` : v);
  // Base58 (no 0/O/I/l) + typical Solana pubkey length
  const isSolanaAddress = (v: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
  const getNetworkKind = (network: any): "solana" | "evm" | "unknown" => {
    const n = String(
      network?.networkType ??
        network?.type ??
        network?.chain ??
        network?.name ??
        network?.networkName ??
        ""
    ).toLowerCase();
    if (n.includes("solana")) return "solana";
    // Heuristic: most other managed networks in Mesh are EVM-like
    if (n.includes("ethereum") || n.includes("polygon") || n.includes("base") || n.includes("optimism") || n.includes("arbitrum") || n.includes("evm")) {
      return "evm";
    }
    return "unknown";
  };

  const selectedNetworkObj = networks.find((n: any) => n.id === selectedNetwork);
  const selectedNetworkKind = getNetworkKind(selectedNetworkObj);
  const filteredWalletAddresses = walletAddresses.filter((w: any) => {
    const addr = String(w?.address || "").trim();
    if (!addr) return false;
    if (selectedNetworkKind === "solana") return isSolanaAddress(addr);
    if (selectedNetworkKind === "evm") return isEvmAddress(addr);
    return true;
  });

  // Helper function to extract actual token from stored value (might be JSON string)
  // For Managed Transfers, we need the authToken from accountTokens[0].authToken
  const extractToken = (storedToken: string | null): string | null => {
    if (!storedToken) return null;
    
    // If it's a JSON string, parse it and extract the token
    if (typeof storedToken === "string" && (storedToken.startsWith("{") || storedToken.startsWith("["))) {
      try {
        const parsed = JSON.parse(storedToken);
        
        // Check for accountTokens structure (from Mesh Link payload)
        // Structure: {"accountTokens":[{"authToken":"...", "account": {...}}]}
        if (parsed?.accountTokens && Array.isArray(parsed.accountTokens) && parsed.accountTokens.length > 0) {
          const firstToken = parsed.accountTokens[0];
          // Priority: authToken > accessToken > integrationToken
          const token = firstToken?.authToken || firstToken?.accessToken || firstToken?.integrationToken;
          if (token && typeof token === "string" && token.length > 20) {
            return token;
          }
        }
        
        // Check for direct authToken at root level
        if (parsed?.authToken && typeof parsed.authToken === "string" && parsed.authToken.length > 20) {
          return parsed.authToken;
        }
        
        // Check for direct integrationToken at root level
        if (parsed?.integrationToken && typeof parsed.integrationToken === "string" && parsed.integrationToken.length > 20) {
          return parsed.integrationToken;
        }
        
        // Check for direct accessToken at root level
        if (parsed?.accessToken && typeof parsed.accessToken === "string" && parsed.accessToken.length > 20) {
          return parsed.accessToken;
        }
        
        // If parsing succeeded but no valid token found, return original
        console.warn("[Transfer] Parsed JSON but no valid token found:", Object.keys(parsed));
        return storedToken;
      } catch (e) {
        // Not valid JSON, return as-is
        return storedToken;
      }
    }
    
    // If it's a normal token string (not JSON), return as-is
    // But validate it's a reasonable length
    if (typeof storedToken === "string" && storedToken.length > 20) {
      return storedToken;
    }
    
    return null;
  };

  useEffect(() => {
    // Load wallet address from localStorage
    const stored = window.localStorage.getItem("app_wallet_address");
    if (stored) {
      setToAddress(stored);
    }

    // Load networks
    fetch("/api/networks")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Networks API failed: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        // According to API docs: response.content.networks
        const networksList = data.content?.networks || data.networks || [];
        console.log("[Transfer] Loaded networks:", networksList.length);
        setNetworks(networksList);
        
        // Auto-select first network if available
        if (networksList.length > 0 && !selectedNetwork) {
          setSelectedNetwork(networksList[0].id);
        }
      })
      .catch((err) => {
        console.error("[Transfer] Failed to load networks:", err);
        setError(`Failed to load networks: ${err.message}`);
      });

    // Load integrations
    fetch("/api/integrations")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Integrations API failed: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        // According to API docs: response.content.integrations
        const integrationsList = data.content?.integrations || data.integrations || [];
        console.log("[Transfer] Loaded integrations:", integrationsList.length);
        setIntegrations(integrationsList);
      })
      .catch((err) => {
        console.error("[Transfer] Failed to load integrations:", err);
        setError(`Failed to load integrations: ${err.message}`);
      });

    // Load connected accounts from localStorage
    const connectedAccountsStr = window.localStorage.getItem("mesh_connected_accounts");
    if (connectedAccountsStr) {
      try {
        const parsed = JSON.parse(connectedAccountsStr);
        setConnectedAccounts(parsed);
      } catch (e) {
        console.error("[Transfer] Failed to parse connected accounts", e);
      }
    }

    // Load wallet addresses for "To Address" dropdown
    if (connectedAccountsStr) {
      try {
        const parsed = JSON.parse(connectedAccountsStr);
        const wallets = parsed
          .filter((acc: any) => 
            acc.brokerType === "metamask" || 
            acc.brokerType === "deFiWallet" || 
            acc.walletAddress ||
            (acc.accountId && acc.accountId.startsWith("0x"))
          )
          .map((acc: any) => ({
            // Normalize EVM-style wallet addresses (MetaMask accountId is often missing 0x)
            address: normalizeEvmAddress(String(acc.walletAddress || acc.accountId || "").trim()),
            name: acc.name || acc.brokerName || "Wallet",
            brokerType: acc.brokerType,
            accountId: acc.accountId,
          }));
        setWalletAddresses(wallets);
        
        if (wallets.length > 0 && !toAddress) {
          setToAddress(wallets[0].address);
          window.localStorage.setItem("app_wallet_address", wallets[0].address);
        }
      } catch (e) {
        console.error("[Transfer] Failed to parse connected accounts for wallet addresses", e);
      }
    }
  }, []);

  // Keep destination address consistent with selected network (Solana vs EVM)
  useEffect(() => {
    if (!selectedNetwork) return;

    const current = String(toAddress || "").trim();
    const isCurrentOk =
      selectedNetworkKind === "solana"
        ? isSolanaAddress(current)
        : selectedNetworkKind === "evm"
          ? isEvmAddress(current)
          : !!current;

    // If current destination is incompatible, try to auto-pick a compatible one from dropdown.
    if (!isCurrentOk) {
      if (filteredWalletAddresses.length > 0) {
        const next = String(filteredWalletAddresses[0].address || "").trim();
        if (next) {
          setToAddress(next);
          window.localStorage.setItem("app_wallet_address", next);
          setToAddressMode("select");
          return;
        }
      }
      // Otherwise force manual entry with an empty value.
      setToAddress("");
      window.localStorage.setItem("app_wallet_address", "");
      setToAddressMode("manual");
    }
  }, [selectedNetwork, selectedNetworkKind, walletAddresses]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update available symbols when network changes
  useEffect(() => {
    if (!selectedNetwork) {
      setAvailableSymbols([]);
      setSelectedSymbol("");
      return;
    }

    const network = networks.find((n: any) => n.id === selectedNetwork);
    if (network) {
      // Get supported tokens from network
      const symbols = network.supportedTokens || network.tokens?.map((t: any) => t.symbol) || [];
      setAvailableSymbols(symbols);
      
      // Auto-select first symbol if available
      if (symbols.length > 0 && !selectedSymbol) {
        setSelectedSymbol(symbols[0]);
      } else if (!symbols.includes(selectedSymbol)) {
        setSelectedSymbol("");
      }
    }
  }, [selectedNetwork, networks]);

  // Fetch token price from portfolio when symbol is selected
  useEffect(() => {
    if (!selectedSymbol || !selectedAccount) {
      setTokenPrice(null);
      return;
    }

    // Try to get token price from portfolio data
    const fetchTokenPrice = async () => {
      try {
        const token = window.localStorage.getItem("mesh_access_token");
        if (!token) return;

        const connectedAccountsStr = window.localStorage.getItem("mesh_connected_accounts");
        const accountsToSend = connectedAccountsStr ? JSON.parse(connectedAccountsStr) : [];

        const res = await fetch("/api/portfolio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            accessToken: token,
            connectedAccounts: accountsToSend,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          // Find the price for the selected symbol
          const holding = data.holdings?.find((h: any) => h.symbol === selectedSymbol);
          if (holding && holding.price > 0) {
            setTokenPrice(holding.price);
          }
        }
      } catch (e) {
        console.warn("[Transfer] Failed to fetch token price:", e);
      }
    };

    fetchTokenPrice();
  }, [selectedSymbol, selectedAccount]);

  // Filter accounts based on selected network and integration support
  useEffect(() => {
    if (!selectedNetwork || integrations.length === 0 || connectedAccounts.length === 0) {
      setAccounts([]);
      return;
    }

    // Find the selected network
    const network = networks.find((n: any) => n.id === selectedNetwork);
    if (!network) {
      setAccounts([]);
      return;
    }

    // Get supported broker types for this network
    const supportedBrokerTypes = network.supportedBrokerTypes || [];

    // Find integrations that:
    // 1. Support outgoing transfers
    // 2. Match the supported broker types for this network
    const supportedIntegrations = integrations.filter((integration: any) => {
      if (!integration.supportsOutgoingTransfers) return false;
      
      // Check if integration type is supported by the network
      return supportedBrokerTypes.includes(integration.type);
    });

    // Match connected accounts with supported integrations
    const availableAccounts = connectedAccounts
      .filter((connectedAccount: any) => {
        // Normalize brokerType for comparison
        const accountType = connectedAccount.brokerType || connectedAccount.providerType;
        
        // Find matching integration
        const matchingIntegration = supportedIntegrations.find(
          (integration: any) => integration.type === accountType
        );
        
        return !!matchingIntegration;
      })
      .map((connectedAccount: any) => {
        const accountType = connectedAccount.brokerType || connectedAccount.providerType;
        const matchingIntegration = supportedIntegrations.find(
          (integration: any) => integration.type === accountType
        );
        
        return {
          ...connectedAccount,
          integrationId: matchingIntegration?.id || connectedAccount.integrationId,
          integrationName: matchingIntegration?.name || connectedAccount.name,
        };
      });

    setAccounts(availableAccounts);
    
    // Auto-select first available account if current selection is not available
    if (availableAccounts.length > 0) {
      const currentAccountExists = availableAccounts.some(
        (acc: any) => acc.accountId === selectedAccount || acc.meshAccountId === selectedAccount
      );
      if (!currentAccountExists) {
        const firstAccount = availableAccounts[0];
        setSelectedAccount(firstAccount.meshAccountId || firstAccount.accountId);
      }
    } else {
      setSelectedAccount("");
    }
  }, [selectedNetwork, integrations, connectedAccounts, networks, selectedAccount]);

  const handleConfigure = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (!selectedAccount) {
        throw new Error("Please select a source account");
      }
      if (!toAddress) {
        throw new Error("Please enter a destination address");
      }
      if (!selectedSymbol) {
        throw new Error("Please select a token symbol");
      }
      if (!selectedNetwork) {
        throw new Error("Please select a network");
      }
      if (!amount || parseFloat(amount) <= 0) {
        throw new Error(`Please enter a valid ${amountMode === "usd" ? "USD" : selectedSymbol} amount`);
      }

      // Get the selected account
      const selectedAcc = accounts.find((acc: any) => 
        acc.accountId === selectedAccount || 
        acc.meshAccountId === selectedAccount
      );
      
      if (!selectedAcc) {
        throw new Error("Selected account not found");
      }
      
      // CRITICAL: For Managed Transfers, fromAccountId MUST be the meshAccountId or frontAccountId that matches the token
      // The token is tied to a specific account ID, and using the wrong account ID will cause "Invalid integration token provided"
      // Priority: meshAccountId > frontAccountId (these are the Mesh internal account IDs that the token is valid for)
      // Note: meshAccountId and frontAccountId are usually the same, but we check both for compatibility
      const fromAccountId = selectedAcc.meshAccountId || selectedAcc.frontAccountId;
      
      if (!fromAccountId) {
        // If we don't have meshAccountId, we can't proceed - the token won't work
        console.error("[Transfer] CRITICAL: Account missing meshAccountId. Token requires meshAccountId to be valid.", {
          accountId: selectedAcc.accountId,
          meshAccountId: selectedAcc.meshAccountId,
          name: selectedAcc.name,
        });
        throw new Error(
          `Account ${selectedAcc.name} is missing the required account identifier. ` +
          `Please disconnect and reconnect this account on the Accounts page.`
        );
      }
      
      // Validate that the account ID matches what we expect
      if (selectedAcc.accountId && selectedAcc.accountId !== fromAccountId && !selectedAcc.accountId.startsWith("0x")) {
        console.warn("[Transfer] Account ID mismatch:", {
          accountId: selectedAcc.accountId,
          meshAccountId: selectedAcc.meshAccountId,
          fromAccountId,
          name: selectedAcc.name,
        });
      }

      // Debug: Log the full account object to see what tokens are available
      console.log("[Transfer] Selected account details:", {
        accountId: selectedAcc.accountId,
        meshAccountId: selectedAcc.meshAccountId,
        selectedAccountValue: selectedAccount,
        name: selectedAcc.name,
        hasFromAuthToken: !!selectedAcc.fromAuthToken,
        hasAuthToken: !!selectedAcc.authToken,
        hasIntegrationToken: !!selectedAcc.integrationToken,
        fromAuthTokenLength: selectedAcc.fromAuthToken?.length,
        authTokenLength: selectedAcc.authToken?.length,
        integrationTokenLength: selectedAcc.integrationToken?.length,
        fromAuthTokenPrefix: selectedAcc.fromAuthToken?.substring(0, 30),
        authTokenPrefix: selectedAcc.authToken?.substring(0, 30),
        integrationTokenPrefix: selectedAcc.integrationToken?.substring(0, 30),
        // CRITICAL: Log which account ID we'll use for the transfer
        fromAccountIdToUse: fromAccountId,
      });
      
      // CRITICAL: Verify that the token and account ID are from the same connection
      // If they don't match, the token won't work
      if (selectedAcc.meshAccountId && selectedAcc.meshAccountId !== fromAccountId) {
        console.error("[Transfer] CRITICAL: meshAccountId mismatch!", {
          storedMeshAccountId: selectedAcc.meshAccountId,
          fromAccountId,
          accountName: selectedAcc.name,
        });
        throw new Error(
          `Account ${selectedAcc.name} has a mismatched account identifier. ` +
          `Please disconnect and reconnect this account on the Accounts page.`
        );
      }

      // Get account-specific token for Managed Transfers
      // CRITICAL: Managed Transfers API requires fromAuthToken which is the accessToken from accountTokens[0].accessToken
      // This is DIFFERENT from integrationToken (which is used for holdings API)
      // Priority: fromAuthToken > authToken (for Managed Transfers, we MUST use fromAuthToken)
      let rawToken = selectedAcc.fromAuthToken || selectedAcc.authToken;
      
      // CRITICAL: Verify token and account ID match
      if (rawToken) {
        console.log("[Transfer] Token verification:", {
          tokenMatchesAccount: selectedAcc.fromAuthToken === rawToken || selectedAcc.authToken === rawToken,
          tokenSource: selectedAcc.fromAuthToken === rawToken ? "fromAuthToken" : "authToken",
        });
      }
      
      // If no account-specific token in filtered account, try to get from localStorage
      if (!rawToken) {
        const connectedAccountsStr = window.localStorage.getItem("mesh_connected_accounts");
        if (connectedAccountsStr) {
          try {
            const connectedAccounts = JSON.parse(connectedAccountsStr);
            const storedAccount = connectedAccounts.find((acc: any) => 
              acc.accountId === selectedAcc.accountId || 
              acc.meshAccountId === selectedAcc.meshAccountId ||
              acc.accountId === fromAccountId ||
              acc.meshAccountId === fromAccountId
            );
            if (storedAccount) {
              // CRITICAL: For Managed Transfers, we MUST use fromAuthToken (NOT integrationToken)
              // Priority: fromAuthToken > authToken (do NOT use integrationToken for transfers)
              rawToken = storedAccount.fromAuthToken || storedAccount.authToken;
              
              // If we only have integrationToken, that's a problem - log a warning
              if (!rawToken && storedAccount.integrationToken) {
                console.error("[Transfer] CRITICAL: Account only has integrationToken, not fromAuthToken. This will fail for Managed Transfers. Please reconnect the account.");
                throw new Error(
                  `Account ${selectedAcc.name} is missing the required authentication token for transfers. ` +
                  `Please disconnect and reconnect this account on the Accounts page to get a fresh token.`
                );
              }
              
              // If the stored token is a JSON string (old format), extract it now
              if (rawToken && (rawToken.startsWith("{") || rawToken.startsWith("["))) {
                console.warn("[Transfer] Stored token is JSON format, extracting...");
                const extracted = extractToken(rawToken);
                if (extracted && extracted.length > 20) {
                  rawToken = extracted;
                  // Update the stored account with the extracted token for future use
                  storedAccount.fromAuthToken = extracted;
                  storedAccount.authToken = extracted;
                  try {
                    const connectedAccounts = JSON.parse(window.localStorage.getItem("mesh_connected_accounts") || "[]");
                    const accountIndex = connectedAccounts.findIndex((acc: any) => 
                      acc.accountId === storedAccount.accountId || acc.meshAccountId === storedAccount.meshAccountId
                    );
                    if (accountIndex >= 0) {
                      connectedAccounts[accountIndex].fromAuthToken = extracted;
                      connectedAccounts[accountIndex].authToken = extracted;
                      window.localStorage.setItem("mesh_connected_accounts", JSON.stringify(connectedAccounts));
                      console.log("[Transfer] Updated stored account with extracted token");
                    }
                  } catch (e) {
                    console.warn("[Transfer] Failed to update stored account token", e);
                  }
                }
              }
              
              console.log("[Transfer] Found token in localStorage account:", {
                hasFromAuthToken: !!storedAccount.fromAuthToken,
                hasAuthToken: !!storedAccount.authToken,
                hasIntegrationToken: !!storedAccount.integrationToken,
                hasAccessToken: !!storedAccount.accessToken,
                tokenType: storedAccount.fromAuthToken ? "fromAuthToken" : storedAccount.authToken ? "authToken" : storedAccount.integrationToken ? "integrationToken" : "accessToken",
                tokenLength: rawToken?.length,
                tokenIsJson: rawToken?.startsWith("{") || rawToken?.startsWith("["),
                tokenPrefix: rawToken?.substring(0, 50),
              });
            }
          } catch (e) {
            console.warn("[Transfer] Failed to parse connected accounts for token lookup", e);
          }
        }
      }
      
      // Fallback to global token (this should be the fromAuthToken stored during connection)
      // For accounts connected before we started storing fromAuthToken explicitly, use the global token
      if (!rawToken) {
        rawToken = window.localStorage.getItem("mesh_access_token");
        console.log("[Transfer] Using global mesh_access_token:", {
          hasToken: !!rawToken,
          tokenLength: rawToken?.length,
          tokenIsJson: rawToken?.startsWith("{") || rawToken?.startsWith("["),
        });
      }
      
      // If still no token, the account might need to be reconnected
      if (!rawToken) {
        throw new Error(
          `No authentication token found for ${selectedAcc.name}. Please reconnect this account on the Accounts page.`
        );
      }
      
      // Extract actual token (handles JSON-encoded tokens)
      const token = extractToken(rawToken);
      
      console.log("[Transfer] Token extraction result:", {
        rawTokenLength: rawToken?.length,
        rawTokenPrefix: rawToken?.substring(0, 30),
        extractedTokenLength: token?.length,
        extractedTokenPrefix: token?.substring(0, 30),
        accountName: selectedAcc.name,
        accountId: fromAccountId,
        hasFromAuthToken: !!selectedAcc.fromAuthToken,
        hasAuthToken: !!selectedAcc.authToken,
        hasIntegrationToken: !!selectedAcc.integrationToken,
        tokenSource: selectedAcc.fromAuthToken ? "fromAuthToken" : selectedAcc.authToken ? "authToken" : selectedAcc.integrationToken ? "integrationToken" : "other",
      });
      
      if (!token || token.length < 20) {
        throw new Error(
          `Invalid or missing authentication token for ${selectedAcc.name}. ` +
          `Token length: ${token?.length || 0}. ` +
          `Please reconnect this account on the Accounts page to get a fresh token.`
        );
      }
      
      // CRITICAL: For Managed Transfers, we MUST use fromAuthToken (accessToken from accountTokens[0].accessToken)
      // If we're using integrationToken or a different token, it will fail with "Invalid integration token provided"
      // Check if we're accidentally using integrationToken instead of fromAuthToken
      if (token && (selectedAcc.integrationToken === token && !selectedAcc.fromAuthToken)) {
        console.error("[Transfer] ERROR: Using integrationToken for Managed Transfer. This will fail. Account needs fromAuthToken.");
        throw new Error(
          `Account ${selectedAcc.name} is using the wrong token type for transfers. ` +
          `Please disconnect and reconnect this account on the Accounts page to get the correct transfer token.`
        );
      }
      
      // Log which token we're using
      if (token) {
        const tokenSource = selectedAcc.fromAuthToken === token ? "fromAuthToken" : 
                           selectedAcc.authToken === token ? "authToken" : 
                           selectedAcc.integrationToken === token ? "integrationToken" : "unknown";
        console.log("[Transfer] Using token for transfer:", {
          tokenSource,
          tokenLength: token.length,
          tokenPrefix: token.substring(0, 30),
          fromAccountId,
          accountMatches: fromAccountId === selectedAcc.meshAccountId || fromAccountId === selectedAcc.accountId,
        });
      }

      // Validate/normalize destination address vs selected network
      const networkObj = networks.find((n: any) => n.id === selectedNetwork);
      const networkKind = getNetworkKind(networkObj);
      const trimmedToAddress = String(toAddress || "").trim();
      const normalizedToAddress =
        networkKind === "evm" ? normalizeEvmAddress(trimmedToAddress) : trimmedToAddress;

      if (!normalizedToAddress) {
        throw new Error("Destination address is required.");
      }

      // Solana transfers require a Solana address; EVM addresses will fail validation
      if (networkKind === "solana") {
        if (isEvmAddress(normalizedToAddress)) {
          throw new Error(
            `You're sending on Solana, but the destination looks like an EVM/MetaMask address (${normalizedToAddress}). ` +
              `For SOL on Solana, enter a Solana address (base58), or switch to an EVM network + token.`
          );
        }
        if (!isSolanaAddress(normalizedToAddress)) {
          throw new Error(
            `Destination address doesn't look like a valid Solana address for the selected network. ` +
              `Please paste a Solana address (base58).`
          );
        }
      }

      // Prepare request body - support both USD and token amount
      // CRITICAL: Mesh Managed Transfers API requires fromType (broker type)
      const requestBody: any = {
        accessToken: token,
        fromAccountId,
        fromType: selectedAcc.brokerType || selectedAcc.type || selectedAcc.providerType, // Required by Mesh API
        toAddress: normalizedToAddress,
        symbol: selectedSymbol,
        networkId: selectedNetwork,
      };

      if (amountMode === "usd") {
        // Use amountInFiat for USD transfers
        requestBody.amountInFiat = parseFloat(amount);
        requestBody.amountInFiatCurrencyCode = "USD";
      } else {
        // Use amount for token transfers
        requestBody.amount = parseFloat(amount);
      }

      console.log("[Transfer] Configuring transfer:", {
        fromAccountId,
        toAddress,
        symbol: selectedSymbol,
        networkId: selectedNetwork,
        amountMode,
        ...(amountMode === "usd" 
          ? { amountInFiat: parseFloat(amount), amountInFiatCurrencyCode: "USD" }
          : { amount: parseFloat(amount) }
        ),
        accountName: selectedAcc.name,
      });

      const res = await fetch("/api/transfer/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const errorMessage = body.error || `Failed to configure transfer: ${res.status}`;
        
        // Check if it's a token-related error
        if (errorMessage.includes("Invalid integration token") || errorMessage.includes("invalidIntegrationToken")) {
          throw new Error(
            `Authentication token is invalid or expired. ` +
            `Please disconnect and reconnect your ${selectedAcc.name} account on the Accounts page to get a fresh token.`
          );
        }
        
        throw new Error(errorMessage);
      }

      const data = await res.json();
      setConfigureData(data);

      const transferIdValue =
        data?.transferId ||
        data?.content?.transferId ||
        data?.content?.id ||
        data?.transfer?.id ||
        data?.content?.transfer?.id ||
        data?.id;

      // Some Mesh flows do NOT return transferId on configure; that's OK.
      // We'll fetch/confirm transferId during /preview.
      if (transferIdValue) {
        setTransferId(transferIdValue);
      } else {
        setTransferId("");
      }

      setStep("preview");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(message);
      console.error("[Transfer] Configure error:", message);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get token from selected account
      const selectedAcc = accounts.find((acc: any) => 
        acc.accountId === selectedAccount || 
        acc.meshAccountId === selectedAccount
      );
      
      // Prefer fromAuthToken for Managed Transfers
      let rawToken = selectedAcc?.fromAuthToken || selectedAcc?.authToken || selectedAcc?.integrationToken;
      if (!rawToken) {
        rawToken = window.localStorage.getItem("mesh_access_token");
      }
      
      const token = extractToken(rawToken);
      if (!token) {
        throw new Error("No access token available");
      }

      const res = await fetch("/api/transfer/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          transferId
            ? { accessToken: token, transferId }
            : {
                accessToken: token,
                // preview can create/return transferId based on the transfer params
                fromAccountId: selectedAcc?.meshAccountId || selectedAcc?.frontAccountId || selectedAcc?.accountId,
                fromType: selectedAcc?.brokerType || selectedAcc?.type || selectedAcc?.providerType,
                toAddress,
                symbol: selectedSymbol,
                networkId: selectedNetwork,
                ...(amountMode === "usd"
                  ? { amountInFiat: parseFloat(amount), amountInFiatCurrencyCode: "USD" }
                  : { amount: parseFloat(amount) }),
              }
        ),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to preview transfer: ${res.status}`);
      }

      const data = await res.json();
      setPreviewData(data);

      // If preview returns/contains transferId, store it for execute.
      const previewTransferId =
        data?.transferId ||
        data?.content?.transferId ||
        data?.content?.previewResult?.previewId ||
        data?.content?.id ||
        data?.transfer?.id ||
        data?.content?.transfer?.id ||
        data?.id;
      if (previewTransferId) {
        setTransferId(previewTransferId);
        setStep("execute");
      } else {
        console.error("[Transfer] Preview response missing transferId:", {
          topLevelKeys: data && typeof data === "object" ? Object.keys(data) : [],
          contentKeys:
            data?.content && typeof data.content === "object" ? Object.keys(data.content) : [],
        });
        setStep("preview");
        throw new Error(
          "Preview succeeded but did not return a transferId. " +
            "This likely means Mesh needs additional fields (e.g., funding selection)."
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(message);
      console.error("[Transfer] Preview error:", message);
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (!transferId) {
        throw new Error("No transfer ID available");
      }

      // Get token from selected account
      const selectedAcc = accounts.find((acc: any) => 
        acc.accountId === selectedAccount || 
        acc.meshAccountId === selectedAccount
      );
      
      // Prefer fromAuthToken for Managed Transfers
      let rawToken = selectedAcc?.fromAuthToken || selectedAcc?.authToken || selectedAcc?.integrationToken;
      if (!rawToken) {
        rawToken = window.localStorage.getItem("mesh_access_token");
      }
      
      const token = extractToken(rawToken);
      if (!token) {
        throw new Error("No access token available");
      }

      const res = await fetch("/api/transfer/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: token,
          transferId,
          // Mesh execute requires fromType along with previewId
          fromType: selectedAcc?.brokerType || selectedAcc?.type || selectedAcc?.providerType,
          mfaCode: mfaCode || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        
        // Check if MFA is required
        if (body.mfaRequired || body.error?.includes("MFA") || body.error?.includes("mfa")) {
          setError("MFA code required. Please enter your MFA code and try again.");
          return;
        }
        
        throw new Error(body.error || `Failed to execute transfer: ${res.status}`);
      }

      const data = await res.json();
      setTransferResult(data);
      setStep("success");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(message);
      console.error("[Transfer] Execute error:", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Mesh API Demo</h1>
        <Navigation />

        <div className="bg-blue-600/20 border border-blue-500/50 rounded-lg p-4 mb-6">
          <p className="text-sm">
            <strong>Managed Transfer APIs</strong> Using server-side APIs:{" "}
            <span className={step === "configure" ? "text-blue-400 font-bold" : "text-zinc-400"}>
              /configure
            </span>{" "}
            →{" "}
            <span className={step === "preview" ? "text-blue-400 font-bold" : "text-zinc-400"}>
              /preview
            </span>{" "}
            →{" "}
            <span className={step === "execute" ? "text-blue-400 font-bold" : "text-zinc-400"}>
              /execute
            </span>
          </p>
        </div>

        <div className="bg-zinc-900 rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-6">Transfer Crypto</h2>

          {error && (
            <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-6">
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {step === "configure" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Network</label>
                <select
                  value={selectedNetwork}
                  onChange={(e) => {
                    setSelectedNetwork(e.target.value);
                    setSelectedSymbol(""); // Reset symbol when network changes
                  }}
                  className="w-full bg-zinc-800 rounded-lg px-4 py-2 text-zinc-100"
                >
                  <option value="">Select a network...</option>
                  {networks.map((net) => (
                    <option key={net.id} value={net.id}>
                      {net.name} ({net.networkType || "unknown"})
                    </option>
                  ))}
                </select>
                {!selectedNetwork && networks.length === 0 && (
                  <p className="text-xs text-zinc-500 mt-1">Loading networks...</p>
                )}
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">Token Symbol</label>
                <select
                  value={selectedSymbol}
                  onChange={(e) => setSelectedSymbol(e.target.value)}
                  disabled={!selectedNetwork || availableSymbols.length === 0}
                  className="w-full bg-zinc-800 rounded-lg px-4 py-2 text-zinc-100 disabled:opacity-50"
                >
                  <option value="">Select a token...</option>
                  {availableSymbols.map((symbol) => (
                    <option key={symbol} value={symbol}>
                      {symbol}
                    </option>
                  ))}
                </select>
                {selectedNetwork && availableSymbols.length === 0 && (
                  <p className="text-xs text-zinc-500 mt-1">No tokens available for this network</p>
                )}
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">From Account</label>
                <select
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                  className="w-full bg-zinc-800 rounded-lg px-4 py-2 text-zinc-100"
                >
                  <option value="">Select an account...</option>
                  {accounts.length === 0 ? (
                    <option value="" disabled>
                      {selectedNetwork ? "No accounts available for this network" : "Select a network first"}
                    </option>
                  ) : (
                    accounts.map((acc) => (
                      <option 
                        key={acc.accountId || acc.meshAccountId} 
                        value={acc.meshAccountId || acc.accountId}
                      >
                        {acc.integrationName || acc.name || acc.brokerName} ({acc.brokerType || acc.providerType})
                      </option>
                    ))
                  )}
                </select>
                {selectedNetwork && accounts.length === 0 && (
                  <p className="text-xs text-zinc-500 mt-1">
                    No connected accounts support transfers on this network
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm text-zinc-400">
                    To Address
                  </label>
                  {walletAddresses.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setToAddressMode(toAddressMode === "select" ? "manual" : "select");
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300 underline"
                    >
                      {toAddressMode === "select" ? "Enter manually" : "Select from wallets"}
                    </button>
                  )}
                </div>
                
                {toAddressMode === "select" && filteredWalletAddresses.length > 0 ? (
                  <select
                    value={toAddress}
                    onChange={(e) => {
                      const addr = e.target.value;
                      setToAddress(addr);
                      window.localStorage.setItem("app_wallet_address", addr);
                    }}
                    className="w-full bg-zinc-800 rounded-lg px-4 py-2 text-zinc-100"
                  >
                    <option value="">Select a wallet address...</option>
                    {filteredWalletAddresses.map((wallet, idx) => (
                      <option key={idx} value={wallet.address}>
                        {wallet.name} - {wallet.address.substring(0, 10)}...{wallet.address.substring(wallet.address.length - 8)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={toAddress}
                    onChange={(e) => {
                      const addr = e.target.value;
                      setToAddress(addr);
                      window.localStorage.setItem("app_wallet_address", addr);
                    }}
                    placeholder={selectedNetworkKind === "solana" ? "Solana address (base58)" : "0x..."}
                    className="w-full bg-zinc-800 rounded-lg px-4 py-2 text-zinc-100"
                  />
                )}
                {toAddressMode === "select" && walletAddresses.length === 0 && (
                  <p className="text-xs text-zinc-500 mt-1">
                    No connected wallet addresses found. Connect a wallet first or enter an address manually.
                  </p>
                )}
                {toAddressMode === "select" && walletAddresses.length > 0 && filteredWalletAddresses.length === 0 && (
                  <p className="text-xs text-zinc-500 mt-1">
                    No connected wallet addresses match this network. Switch network or enter an address manually.
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm text-zinc-400">Amount</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAmountMode("usd")}
                      className={`text-xs px-2 py-1 rounded ${
                        amountMode === "usd"
                          ? "bg-blue-600 text-white"
                          : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                      }`}
                    >
                      USD
                    </button>
                    <button
                      type="button"
                      onClick={() => setAmountMode("token")}
                      className={`text-xs px-2 py-1 rounded ${
                        amountMode === "token"
                          ? "bg-blue-600 text-white"
                          : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                      }`}
                    >
                      {selectedSymbol || "Token"}
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  step={amountMode === "usd" ? "0.01" : "0.000001"}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={amountMode === "usd" ? "0.00" : "0.000000"}
                  className="w-full bg-zinc-800 rounded-lg px-4 py-2 text-zinc-100"
                />
                {amountMode === "usd" && selectedSymbol && tokenPrice && parseFloat(amount) > 0 && (
                  <p className="text-xs text-zinc-500 mt-1">
                    ≈ {(parseFloat(amount) / tokenPrice).toFixed(6)} {selectedSymbol}
                  </p>
                )}
                {amountMode === "token" && selectedSymbol && tokenPrice && parseFloat(amount) > 0 && (
                  <p className="text-xs text-zinc-500 mt-1">
                    ≈ ${(parseFloat(amount) * tokenPrice).toFixed(2)} USD
                  </p>
                )}
              </div>

              <button
                onClick={handleConfigure}
                disabled={loading || !selectedAccount || !toAddress || !selectedSymbol || !selectedNetwork || !amount || parseFloat(amount) <= 0}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg px-4 py-2 font-medium"
              >
                {loading ? "Configuring..." : "Configure Transfer"}
              </button>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              <p className="text-zinc-400">Review transfer details before executing</p>
              {configureData && !previewData && (
                <div className="bg-zinc-800 rounded-lg p-4">
                  <p className="text-xs text-zinc-400 mb-2">
                    Configure response (Mesh may return quote/options here; transferId can be created in Preview):
                  </p>
                  <pre className="text-xs overflow-auto">
                    {JSON.stringify(configureData, null, 2)}
                  </pre>
                </div>
              )}
              <button
                onClick={handlePreview}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg px-4 py-2 font-medium"
              >
                {loading ? "Loading preview..." : "Preview Transfer"}
              </button>
              {previewData && (
                <div className="bg-zinc-800 rounded-lg p-4">
                  <pre className="text-xs overflow-auto">
                    {JSON.stringify(previewData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {step === "execute" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">
                  MFA Code (if required)
                </label>
                <input
                  type="text"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  placeholder="Enter 6-8 digit code"
                  className="w-full bg-zinc-800 rounded-lg px-4 py-2 text-zinc-100"
                />
                <p className="text-xs text-zinc-500 mt-1">
                  Some exchanges require MFA codes for transfers
                </p>
              </div>
              <button
                onClick={handleExecute}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg px-4 py-2 font-medium"
              >
                {loading ? "Executing..." : "Execute Transfer"}
              </button>
            </div>
          )}

          {step === "success" && (
            <div className="text-center space-y-4">
              <div className="text-6xl">✅</div>
              <h3 className="text-2xl font-bold">Transfer Successful!</h3>
              {transferResult && (
                <div className="bg-zinc-800 rounded-lg p-4 text-left">
                  <pre className="text-xs overflow-auto">
                    {JSON.stringify(transferResult, null, 2)}
                  </pre>
                </div>
              )}
              <button
                onClick={() => {
                  setStep("configure");
                  setTransferId("");
                  setPreviewData(null);
                  setMfaCode("");
                  setTransferResult(null);
                  setError(null);
                }}
                className="bg-blue-600 hover:bg-blue-700 rounded-lg px-6 py-2 font-medium"
              >
                New Transfer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
