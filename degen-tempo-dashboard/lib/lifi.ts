import { createConfig, getRoutes, type Route, type RoutesRequest } from '@lifi/sdk';
import { parseUnits, encodeFunctionData, erc20Abi } from 'viem';

// Initialize LI.FI SDK Config
createConfig({
  integrator: 'DegenTempo',
  preloadChains: false,
});

export type LifiQuote = Route;

export async function getLifiQuote(
  fromChain: number,
  toChain: number,
  fromToken: string,
  toToken: string,
  amount: string,
  userAddress: string,
  toAddress?: string
): Promise<LifiQuote> {
  // Check for Mock Mode
  // Only enable mock if explicitly set. Do not force mock on testnet to allow real testnet integrations.
  const enableMock = process.env.NEXT_PUBLIC_ENABLE_MOCK_QUOTE === 'true';

  if (enableMock) {
    console.log('Using Mock LI.FI Quote (Enabled via ENV)');
    return getMockQuote(fromChain, toChain, fromToken, toToken, amount, userAddress, toAddress);
  }

  const routesRequest: RoutesRequest = {
    fromChainId: fromChain,
    toChainId: toChain,
    fromTokenAddress: fromToken,
    toTokenAddress: toToken,
    fromAmount: amount, // input amount in atomic units (wei)
    fromAddress: userAddress,
    toAddress: toAddress || userAddress, // If toAddress is provided, funds go there (e.g. Treasury)
    options: {
      integrator: 'DegenTempo',
      fee: 0.015, // 1.5% fee
      slippage: 0.03, // 3% slippage as per doc
    },
  };

  const response = await getRoutes(routesRequest);

  if (!response.routes || response.routes.length === 0) {
    throw new Error('No routes found');
  }

  // Return the best route
  return response.routes[0];
}

function getMockQuote(
  fromChain: number,
  toChain: number,
  fromTokenAddress: string,
  toTokenAddress: string,
  amount: string,
  userAddress: string,
  toAddress?: string
): LifiQuote {
  const isNative = fromTokenAddress === '0x0000000000000000000000000000000000000000';
  
  // Simple Mock: 1 Input Token = 1 Output Token (scaled to 6 decimals for USDC)
  // Input (18 decimals usually) -> Output (6 decimals)
  // Example: 1 ETH (1e18) -> 3000 USDC (3000 * 1e6)
  
  const mockPrice = 3000;
  const toAmount = (BigInt(amount) * BigInt(mockPrice) / BigInt(1e12)).toString(); // 18 -> 6 decimals adjustment

  const mockTokenFrom = {
    address: fromTokenAddress,
    symbol: isNative ? 'ETH' : 'DEGEN',
    decimals: 18,
    chainId: fromChain,
    name: isNative ? 'Ether' : 'Degen',
    priceUSD: '3000',
  };

  const mockTokenTo = {
    address: toTokenAddress,
    symbol: 'USDC',
    decimals: 6,
    chainId: toChain,
    name: 'USDC',
    priceUSD: '1',
  };

  return {
    id: 'mock-route-' + Date.now(),
    fromChainId: fromChain,
    fromAmountUSD: '3000',
    fromAmount: amount,
    fromToken: mockTokenFrom as any,
    toChainId: toChain,
    toAmountUSD: '3000',
    toAmount: toAmount,
    toToken: mockTokenTo as any,
    steps: [
      {
        id: 'mock-step-' + Date.now(),
        type: 'swap',
        tool: 'mock-swap',
        toolDetails: { key: 'mock', name: 'Mock Swap', logoURI: '' },
        action: {
          fromChainId: fromChain,
          toChainId: toChain,
          fromToken: mockTokenFrom as any,
          toToken: mockTokenTo as any,
          fromAmount: amount,
          slippage: 0.03,
          fromAddress: userAddress,
          toAddress: toAddress || userAddress,
        },
        estimate: {
          approvalAddress: isNative ? '0x0000000000000000000000000000000000000000' : '0xMockRouterAddress',
          fromAmount: amount,
          toAmount: toAmount,
          executionDuration: 5,
          feeCosts: [],
          gasCosts: [],
          tool: 'mock-swap',
        },
        transactionRequest: {
          to: isNative ? (toAddress || userAddress) : fromTokenAddress, // Native: Send to Dest. ERC20: Call Token Contract
          data: isNative ? '0x' : encodeFunctionData({
              abi: erc20Abi,
              functionName: 'transfer',
              args: [(toAddress || userAddress) as `0x${string}`, BigInt(amount)]
          }),
          value: isNative ? amount : '0',
          gasLimit: '200000',
          gasPrice: '1000000000',
          chainId: fromChain,
          from: userAddress,
        }
      }
    ],
    insurance: { state: 'NOT_INSURABLE', feeAmountUsd: '0' },
  } as unknown as Route;
}
