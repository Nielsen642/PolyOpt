import { useAppKit } from "@reown/appkit/react";
import { useAccount, useDisconnect, useWalletClient } from "wagmi";

type WalletContextValue = {
  walletAddress: string | null;
  connector: "appkit" | null;
  isConnecting: boolean;
  walletClient: ReturnType<typeof useWalletClient>["data"];
  connectWalletConnect: () => Promise<boolean>;
  connectInjectedWallet: () => Promise<boolean>;
  connectManualWallet: (address: string) => void;
  disconnectWallet: () => void;
};

export function useWallet(): WalletContextValue {
  const { address, isConnecting } = useAccount();
  const { disconnect } = useDisconnect();
  const { open } = useAppKit();
  const walletClientResult = useWalletClient();

  const connect = async () => {
    await open();
    return true;
  };

  return {
    walletAddress: address ?? null,
    connector: address ? "appkit" : null,
    isConnecting: isConnecting || walletClientResult.isPending,
    walletClient: walletClientResult.data ?? undefined,
    connectWalletConnect: connect,
    connectInjectedWallet: connect,
    connectManualWallet: () => undefined,
    disconnectWallet: () => disconnect(),
  };
}

