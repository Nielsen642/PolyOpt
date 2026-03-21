
export type OrderSide = "BUY" | "SELL";

/** Unsigned order fields required by Polymarket CLOB (SendOrder.order) */
export interface PolymarketOrderFields {
  maker: string;
  signer: string;
  taker: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  side: OrderSide;
  expiration: string;
  nonce: string;
  feeRateBps: string;
  signature: string;
  salt: number;
  signatureType: number;
}

/** Full payload for POST /order (relay or CLOB) */
export interface SendOrderPayload {
  order: PolymarketOrderFields;
  owner: string;
  orderType?: "GTC" | "FOK" | "GTD" | "FAK";
  deferExec?: boolean;
}

export function buildLimitOrder(
  tokenId: string,
  side: OrderSide,
  size: number,
  price: number,
  walletAddress: string,
): Omit<PolymarketOrderFields, "signature"> {
  const maker = walletAddress;
  const signer = walletAddress;
  const taker = "0x0000000000000000000000000000000000000000";
  const priceClamped = Math.max(0.01, Math.min(0.99, price));
  const sizeWei = Math.round(size * 1e6).toString();
  const takerAmountWei = Math.round(size * priceClamped * 1e6).toString();
  const expiration = String(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365); // 1 year
  const nonce = "0";
  const feeRateBps = "30";
  const salt = Math.floor(Math.random() * 1e9);

  return {
    maker,
    signer,
    taker,
    tokenId,
    makerAmount: sizeWei,
    takerAmount: takerAmountWei,
    side,
    expiration,
    nonce,
    feeRateBps,
    salt,
    signatureType: 0, // EOA
  };
}

export async function signOrderWithWalletClient(
  order: Omit<PolymarketOrderFields, "signature">,
  walletClient: {
    account?: { address: string };
    chain?: { id: number };
    signTypedData: (args: unknown) => Promise<string>;
  } | null | undefined,
): Promise<PolymarketOrderFields> {
  if (!walletClient || !walletClient.account) {
    throw new Error("Wallet client is not available for signing.");
  }

  const signature = await walletClient.signTypedData({

    account: walletClient.account,
    domain: {
      name: "Polymarket CLOB",
      version: "1",
      chainId: walletClient.chain?.id ?? 137,
    },
    types: {
      Order: [
        { name: "maker", type: "address" },
        { name: "signer", type: "address" },
        { name: "taker", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "makerAmount", type: "uint256" },
        { name: "takerAmount", type: "uint256" },
        { name: "side", type: "string" },
        { name: "expiration", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "feeRateBps", type: "uint256" },
        { name: "salt", type: "uint256" },
        { name: "signatureType", type: "uint8" },
      ],
    },
    primaryType: "Order",
    message: order,
  } as any);

  return { ...order, signature };
}

/**
 * Submit a signed order via backend relay (forwards to CLOB with your POLY_* headers).
 * Alternatively POST directly to https://clob.polymarket.com/order with your API key headers.
 */
export type PolyRelayHeaders = Partial<
  Record<
    "POLY_API_KEY" | "POLY_ADDRESS" | "POLY_SIGNATURE" | "POLY_PASSPHRASE" | "POLY_TIMESTAMP",
    string
  >
>;

export async function submitOrderRelay(
  payload: SendOrderPayload,
  polyHeaders: PolyRelayHeaders,
): Promise<{ success: boolean; orderID?: string; status?: string; errorMsg?: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  for (const [k, v] of Object.entries(polyHeaders)) {
    if (v && String(v).trim()) headers[k] = v;
  }
  const res = await fetch("/api/polymarket/order", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(payload),
  });
  return res.json();
}
