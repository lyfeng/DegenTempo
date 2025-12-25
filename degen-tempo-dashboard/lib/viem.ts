import { createPublicClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';

// Determine the chain based on environment variable
export const chain = process.env.NEXT_PUBLIC_CHAIN_ID === '84532' ? baseSepolia : base;

const alchemyNetwork = chain.id === 84532 ? 'base-sepolia' : 'base-mainnet';
export const rpcUrl = process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL || `https://${alchemyNetwork}.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`;

export const publicClient = createPublicClient({
  chain: chain,
  transport: http(rpcUrl)
});

// Addresses
if (!process.env.NEXT_PUBLIC_DEGEN_TOKEN_ADDRESS) throw new Error('Missing NEXT_PUBLIC_DEGEN_TOKEN_ADDRESS');
if (!process.env.NEXT_PUBLIC_USDC_ADDRESS) throw new Error('Missing NEXT_PUBLIC_USDC_ADDRESS');
if (!process.env.NEXT_PUBLIC_USDC_ON_TEMPO_ADDRESS) throw new Error('Missing NEXT_PUBLIC_USDC_ON_TEMPO_ADDRESS');

export const DEGEN_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_DEGEN_TOKEN_ADDRESS as string;
export const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as string;
export const USDC_ON_TEMPO_ADDRESS = process.env.NEXT_PUBLIC_USDC_ON_TEMPO_ADDRESS as string;

// Token Configuration
export const APP_TOKEN = {
    symbol: 'DEGEN',
    address: DEGEN_TOKEN_ADDRESS,
    decimals: 18,
    isNative: false
};
