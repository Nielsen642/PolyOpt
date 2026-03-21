import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { polygon } from "@reown/appkit/networks";
import { cookieStorage, createStorage } from "wagmi";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

if (!projectId) {
  // eslint-disable-next-line no-console
  console.warn(
    "Reown AppKit: VITE_WALLETCONNECT_PROJECT_ID is not set; wallet modal will not work.",
  );
}

export const networks = [polygon];

export const wagmiAdapter = new WagmiAdapter({
  projectId: projectId || "",
  networks: networks as any,
  storage: createStorage({
    storage: cookieStorage as any,
  }) as any,
});

export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks: networks as any,
  projectId: projectId || "",
  features: {
    analytics: true,
  },
});

