import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

let _provider: Aptos | undefined;
export const getAptos = () => {
  if (_provider) return _provider;
  const aptosConfig = new AptosConfig({
    network: Network.MAINNET,
  });
  _provider = new Aptos(aptosConfig); // DEVNET
  return _provider;
};
