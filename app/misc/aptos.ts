import { Aptos } from '@aptos-labs/ts-sdk'

let _provider: Aptos | undefined
export const getAptos = () => {
  if (_provider) return _provider
  _provider = new Aptos() // DEVNET
  return _provider
}
