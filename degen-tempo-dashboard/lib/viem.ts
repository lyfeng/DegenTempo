import { createPublicClient, http, defineChain } from 'viem';
import { base, baseSepolia, optimism, optimismSepolia, arbitrumSepolia } from 'viem/chains';

export const tempoTestnet = defineChain({
  id: 42429,
  name: 'Tempo Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'USDC',
    symbol: 'USDC',
  },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.tempo.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Tempo Explorer', url: 'https://testnet.tempo.xyz' },
  },
  testnet: true,
});

// Helper to get chain from ID
const getChain = (chainId: number) => {
    switch (chainId) {
        case 8453: return base;
        case 84532: return baseSepolia;
        case 10: return optimism;
        case 11155420: return optimismSepolia;
        case 421614: return arbitrumSepolia;
        case 42429: return tempoTestnet;
        default: return baseSepolia; // Default fallback
    }
};

// --- Source Chain Configuration ---
const sourceChainId = process.env.NEXT_PUBLIC_SOURCE_CHAIN_ID ? parseInt(process.env.NEXT_PUBLIC_SOURCE_CHAIN_ID) : 84532;
export const SOURCE_CHAIN = getChain(sourceChainId);

// --- Destination Chain Configuration ---
const destinationChainId = process.env.NEXT_PUBLIC_DESTINATION_CHAIN_ID ? parseInt(process.env.NEXT_PUBLIC_DESTINATION_CHAIN_ID) : 11155420;
export const DESTINATION_CHAIN = getChain(destinationChainId);

// --- RPC Configuration ---
// Map Chain ID to Alchemy Network string
const getAlchemyNetwork = (chainId: number) => {
    switch (chainId) {
        case 8453: return 'base-mainnet';
        case 84532: return 'base-sepolia';
        case 10: return 'opt-mainnet';
        case 11155420: return 'opt-sepolia';
        case 421614: return 'arb-sepolia';
        default: return 'base-sepolia';
    }
};

const alchemyNetwork = getAlchemyNetwork(SOURCE_CHAIN.id);

// Allow overriding RPC URL via env, otherwise fallback to Alchemy/Default
export const rpcUrl = process.env.NEXT_PUBLIC_SOURCE_RPC_URL || 
    (process.env.NEXT_PUBLIC_ALCHEMY_API_KEY ? `https://${alchemyNetwork}.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}` : SOURCE_CHAIN.rpcUrls.default.http[0]);

export const publicClient = createPublicClient({
  chain: SOURCE_CHAIN,
  transport: http(rpcUrl)
});

// --- Token Configuration ---
if (!process.env.NEXT_PUBLIC_SOURCE_TOKEN_ADDRESS) throw new Error('Missing NEXT_PUBLIC_SOURCE_TOKEN_ADDRESS');
if (!process.env.NEXT_PUBLIC_DESTINATION_TOKEN_ADDRESS) throw new Error('Missing NEXT_PUBLIC_DESTINATION_TOKEN_ADDRESS');

export const SOURCE_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_SOURCE_TOKEN_ADDRESS as string;
export const DESTINATION_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_DESTINATION_TOKEN_ADDRESS as string;

// Export generic "APP_TOKEN" for UI (Source Token)
export const APP_TOKEN = {
    symbol: 'USDC', // This could also be parameterized if needed
    address: SOURCE_TOKEN_ADDRESS,
    decimals: 6,
    isNative: false
};

// Deprecated aliases (to be removed after refactoring app/page.tsx)
// export const DEGEN_TOKEN_ADDRESS = SOURCE_TOKEN_ADDRESS; // Removed to force refactor
// export const USDC_ADDRESS = SOURCE_TOKEN_ADDRESS; // Removed to force refactor
// export const USDC_ON_TEMPO_ADDRESS = DESTINATION_TOKEN_ADDRESS; // Removed to force refactor
// export const chain = SOURCE_CHAIN; // Keeping alias for now but should be updated
export const chain = SOURCE_CHAIN; 

