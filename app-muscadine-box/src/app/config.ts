import { createConfig, createStorage, cookieStorage, http, fallback } from 'wagmi'
import { base } from 'wagmi/chains'
import { coinbaseWallet, metaMask } from 'wagmi/connectors'

const alchemyApiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;

const alchemyUrl = alchemyApiKey 
  ? `https://base-mainnet.g.alchemy.com/v2/${alchemyApiKey}`
  : 'https://base-mainnet.g.alchemy.com/v2/demo';

export const config = createConfig({
  chains: [base],
  connectors: [
    coinbaseWallet({
      appName: 'Muscadine',
      preference: 'smartWalletOnly',
      version: '4',
    }),
    metaMask(),
  ],
  // REPLACEMENT: Use standard cookieStorage. 
  // This automatically handles client-side persistence (via document.cookie)
  // and server-side reading.
  storage: createStorage({
    storage: cookieStorage, 
  }),
  ssr: true,
  transports: {
    [base.id]: fallback([
        http(alchemyUrl),
        http('https://base.blockpi.network/v1/rpc/public'),
        http('https://1rpc.io/base'),
        http('https://mainnet.base.org'), 
    ]),
  },
  batch: {
    multicall: true 
  }
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}