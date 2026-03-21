declare module "@walletconnect/ethereum-provider" {
  export const EthereumProvider: {
    init(options: Record<string, unknown>): Promise<any>;
  };

  export default EthereumProvider;
}

declare module "https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider/+esm" {
  export const EthereumProvider: {
    init(options: Record<string, unknown>): Promise<any>;
  };
}
