
import { createAcrossClient } from "@across-protocol/app-sdk";
import { base, baseSepolia, arbitrumSepolia, optimismSepolia, sepolia } from "viem/chains";
import { tempoTestnet, SOURCE_CHAIN } from "./viem";

// Initialize Across Client
// We include common testnets as "Tempo" might be one of them.
// In production, we should ensure only supported chains are here.
export const acrossClient = createAcrossClient({
  integratorId: "0xdead", // Placeholder Integrator ID
  chains: [base, baseSepolia, arbitrumSepolia, optimismSepolia, sepolia, tempoTestnet],
  useTestnet: SOURCE_CHAIN.testnet ?? false,
});

export async function checkRouteAvailability(originChainId: number, destinationChainId: number) {
  try {
    const routes = await acrossClient.getAvailableRoutes({
      originChainId,
      destinationChainId,
    });
    return routes.length > 0;
  } catch (error) {
    console.error("Error checking route availability:", error);
    return false;
  }
}

export async function getAcrossQuote(
  fromChainId: number,
  toChainId: number,
  fromToken: string,
  toToken: string,
  amount: string, // in wei
  userAddress: string,
  recipientAddress?: string
) {
  // Pre-check: Validate route support
  const isSupported = await checkRouteAvailability(fromChainId, toChainId);
  if (!isSupported) {
    console.warn(`[Warning] Route from ${fromChainId} to ${toChainId} reported as unsupported by checkRouteAvailability. Proceeding anyway to try getSwapQuote.`);
    // throw new Error(`Route from ${fromChainId} to ${toChainId} is not supported by Across Protocol.`);
  }

  const route = {
    originChainId: fromChainId,
    destinationChainId: toChainId,
    inputToken: fromToken as `0x${string}`,
    outputToken: toToken as `0x${string}`,
  };

  // console.log("Requesting Across Quote for:", route);

  try {
    const quote = await acrossClient.getSwapQuote({
        route,
        amount: BigInt(amount),
        depositor: userAddress as `0x${string}`,
        recipient: (recipientAddress || userAddress) as `0x${string}`,
    }) as any;
    
    // console.log("Across Quote Response:", quote);

    if (quote && quote.deposit) {
        // Flatten the response for the frontend to match expected structure
        // The SDK returns details inside a `deposit` object
        const flatQuote = { 
            ...quote, 
            ...quote.deposit, 
            destinationChainId: toChainId,
            timestamp: quote.deposit.quoteTimestamp
        };
        
        // Fix: Ensure outputAmount is correctly populated
        // 1. Try existing outputAmount
        // 2. Try expectedOutputAmount (standard in some SDK responses)
        // 3. Try minOutputAmount (conservative fallback)
        if (!flatQuote.outputAmount) {
            flatQuote.outputAmount = quote.outputAmount || quote.expectedOutputAmount || quote.minOutputAmount || "0";
        }

        // Fix: Ensure spokePoolAddress is a string (SDK v3 might return object)
        if (typeof flatQuote.spokePoolAddress === 'object' && flatQuote.spokePoolAddress !== null) {
            // @ts-ignore
            flatQuote.spokePoolAddress = flatQuote.spokePoolAddress.address || flatQuote.spokePoolAddress.contractAddress;
        }
        
        return flatQuote;
    }
    
    // Fallback for different SDK versions or response structures
    const fallbackQuote = { 
        ...quote, 
        destinationChainId: toChainId,
        // Try to find timestamp or use current time
        timestamp: quote.quoteTimestamp || quote.timestamp || Math.floor(Date.now() / 1000)
    };

    if (!fallbackQuote.outputAmount) {
        const fees = quote.totalRelayFee || quote.totalRelayerFee;
        const feeTotal = fees && typeof fees === 'object' ? fees.total : fees;
        
        if (feeTotal && quote.inputAmount) {
             try {
                fallbackQuote.outputAmount = (BigInt(quote.inputAmount) - BigInt(feeTotal)).toString();
             } catch (e) {
                console.warn("Failed to calculate outputAmount from inputAmount - totalRelayerFee", e);
             }
        }
        
        if (!fallbackQuote.outputAmount) {
            fallbackQuote.outputAmount = quote.outputAmount || quote.expectedOutputAmount || quote.minOutputAmount || "0";
        }
    }

    // Fix: Ensure spokePoolAddress is a string (SDK v3 might return object)
    if (typeof fallbackQuote.spokePoolAddress === 'object' && fallbackQuote.spokePoolAddress !== null) {
        // Try to extract address property
        // @ts-ignore
        fallbackQuote.spokePoolAddress = fallbackQuote.spokePoolAddress.address || fallbackQuote.spokePoolAddress.contractAddress;
    }
    
    // Fallback if still missing or invalid
    if (!fallbackQuote.spokePoolAddress || typeof fallbackQuote.spokePoolAddress !== 'string') {
        if (fromChainId === 84532) { // Base Sepolia
             fallbackQuote.spokePoolAddress = "0x82B564983aE7274c86695917BBf8C99ECb6F0F8F";
        } else if (fromChainId === 8453) { // Base Mainnet
             fallbackQuote.spokePoolAddress = "0x09aea4b2242abc8bb4bb78d537a67a245a7bec64";
        } else if (fromChainId === 11155420) { // Optimism Sepolia
             fallbackQuote.spokePoolAddress = "0x4e8E101924eDE233C13e2D8622DC8aED2872d505";
        }
    }

    return fallbackQuote;
  } catch (error) {
      console.error("Across SDK getSwapQuote failed:", error);
      throw error;
  }
}

// SpokePool ABI for depositV3
export const spokePoolAbi = [
  {
    inputs: [
      { internalType: "address", name: "depositor", type: "address" },
      { internalType: "address", name: "recipient", type: "address" },
      { internalType: "address", name: "inputToken", type: "address" },
      { internalType: "address", name: "outputToken", type: "address" },
      { internalType: "uint256", name: "inputAmount", type: "uint256" },
      { internalType: "uint256", name: "outputAmount", type: "uint256" },
      { internalType: "uint256", name: "destinationChainId", type: "uint256" },
      { internalType: "address", name: "exclusiveRelayer", type: "address" },
      { internalType: "uint32", name: "quoteTimestamp", type: "uint32" },
      { internalType: "uint32", name: "fillDeadline", type: "uint32" },
      { internalType: "uint32", name: "exclusivityDeadline", type: "uint32" },
      { internalType: "bytes", name: "message", type: "bytes" }
    ],
    name: "depositV3",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  }
] as const;
