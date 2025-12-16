import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ConnectedAccount = {
  accountId: string;
  meshAccountId?: string;
  integrationId: string;
  integrationName: string;
  brokerType: string;
  accessToken: string;
  providerType: string;
  portfolioValue?: number;
  assets?: string[];
};

export type Holding = {
  symbol: string;
  name?: string;
  amount: number;
  price: number;
  value: number;
  accountId: string;
  accountName: string;
  source: "Exchange" | "MetaMask" | string;
};

export type PortfolioData = {
  totalValue: number;
  totalAccounts: number;
  totalAssets: number;
  holdings: Holding[];
};

interface MeshStore {
  accounts: ConnectedAccount[];
  portfolio: PortfolioData | null;
  addAccount: (account: ConnectedAccount) => void;
  removeAccount: (accountId: string) => void;
  updateAccountPortfolio: (accountId: string, value: number) => void;
  setPortfolio: (portfolio: PortfolioData) => void;
  clearAll: () => void;
}

export const useMeshStore = create<MeshStore>()(
  persist(
    (set) => ({
      accounts: [],
      portfolio: null,
      addAccount: (account) =>
        set((state) => {
          const exists = state.accounts.find((a) => a.accountId === account.accountId);
          if (exists) {
            return state;
          }
          return { accounts: [...state.accounts, account] };
        }),
      removeAccount: (accountId) =>
        set((state) => ({
          accounts: state.accounts.filter((a) => a.accountId !== accountId),
        })),
      updateAccountPortfolio: (accountId, value) =>
        set((state) => ({
          accounts: state.accounts.map((a) =>
            a.accountId === accountId ? { ...a, portfolioValue: value } : a
          ),
        })),
      setPortfolio: (portfolio) => set({ portfolio }),
      clearAll: () => set({ accounts: [], portfolio: null }),
    }),
    {
      name: "mesh-storage",
    }
  )
);

