import { createConfig, createStorage, cookieStorage, http, fallback } from 'wagmi'
import { base } from 'wagmi/chains'
import { coinbaseWallet, metaMask } from 'wagmi/connectors'

const alchemyApiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;

// Custom storage (Kept your existing logic)
function createHybridStorage() {
  return createStorage({
    storage: {
      async getItem(key) {
        if (typeof window !== 'undefined') {
          const localValue = localStorage.getItem(key)
          if (localValue) return localValue
        }
        return cookieStorage.getItem(key)
      },
      async setItem(key, value) {
        if (typeof window !== 'undefined') {
          localStorage.setItem(key, value)
        }
        cookieStorage.setItem(key, value)
      },
      async removeItem(key) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(key)
        }
        cookieStorage.removeItem(key)
      },
    },
  })
}

// 1. Prepare the RPC URL
// Ideally, use your specific key. Fallback to demo only if necessary (demo is also rate limited)
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
    // Only initialize MetaMask on client side to avoid SSR errors
    ...(typeof window !== 'undefined' ? [metaMask()] : []),
    // Note: WalletConnect is handled by OnchainKit, so we don't add it here to avoid duplicate initialization
  ],
  storage: createHybridStorage(),
  ssr: true,
  transports: {
    [base.id]: fallback([
        // 2. CRITICAL FIX: Alchemy MUST be first. 
        // The Morpho SDK needs a premium/private RPC to handle simulation gas calls.
        http(alchemyUrl),
        
        // 3. Fallbacks
        // base.org is deliberately placed last because it fails simulations often
        http('https://base.blockpi.network/v1/rpc/public'),
        http('https://1rpc.io/base'),
        http('https://mainnet.base.org'), 
    ]),
  },
  // 4. OPTIMIZATION: Enable batching. 
  // This groups multiple RPC calls into one HTTP request, reducing 429 chances.
  batch: {
    multicall: true 
  }
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}