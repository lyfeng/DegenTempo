import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useEffect, useState } from 'react';
import { createPublicClient, http, custom, createWalletClient } from 'viem';
import { chain, rpcUrl } from '@/lib/viem';
import { createSmartAccountClient } from 'permissionless';
import { toSimpleSmartAccount } from 'permissionless/accounts';

export function useSmartAccount() {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const [smartAccountAddress, setSmartAccountAddress] = useState<string>('');
  const [smartAccountClient, setSmartAccountClient] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (!user) return;
      
      // Log for debugging
      // console.log("Initializing Smart Account...", { user, wallets });

      if (wallets.length === 0) {
        console.log("No wallets found yet.");
        return;
      }
      
      // Try to find embedded wallet first
      // We strictly require the Privy embedded wallet for Smart Account ownership
      // to ensure the user doesn't need to manually sign via external wallets (like MetaMask).
      const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
      
      if (!embeddedWallet) {
        // If no embedded wallet, try to use the first available wallet (e.g. MetaMask)
        // This allows the app to work for users who login with external wallets
        const externalWallet = wallets[0];
        if (externalWallet) {
             console.log("Embedded wallet not found, falling back to external wallet:", externalWallet.walletClientType);
        } else {
             console.log("No wallets found for Smart Account.");
             return;
        }
      }
      
      const targetWallet = embeddedWallet || wallets[0];

      // console.log("Using wallet for Smart Account Signer:", { 
      //     type: targetWallet.walletClientType, 
      //     address: targetWallet.address 
      // });

      // console.log("Smart Account Config:", {
      //   chainId: chain.id,
      //   rpcUrl: rpcUrl,
      //   policyId: process.env.NEXT_PUBLIC_ALCHEMY_POLICY_ID,
      //   enablePaymaster: process.env.NEXT_PUBLIC_ENABLE_PAYMASTER
      // });

      setLoading(true);

      try {
        const provider = await targetWallet.getEthereumProvider();
        
        const walletClient = createWalletClient({
          account: targetWallet.address as `0x${string}`,
          chain: chain,
          transport: custom(provider)
        });
        
        const publicClient = createPublicClient({
          transport: http(rpcUrl),
          chain: chain,
        });

        const simpleSmartAccount = await toSimpleSmartAccount({
          client: publicClient,
          owner: walletClient,
          entryPoint: {
            address: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
            version: "0.6"
          },
          factoryAddress: "0x9406Cc6185a346906296840746125a0E44976454",
        });

        const policyId = process.env.NEXT_PUBLIC_ALCHEMY_POLICY_ID;
        // In Production, we enforce Paymaster usage for best UX.
        // Self-pay is only for advanced debugging when explicitly disabled.
        const enablePaymaster = process.env.NEXT_PUBLIC_ENABLE_PAYMASTER !== 'false';
        
        if (enablePaymaster && !policyId) {
            console.warn("Paymaster is enabled but NEXT_PUBLIC_ALCHEMY_POLICY_ID is missing. Transactions may fail.");
        }

        // ... existing sponsorUserOperation definition ...
        const sponsorUserOperation = async (parameters: any) => {
           // ... (keep as is)
           const userOperation = {
             sender: parameters.sender,
             nonce: parameters.nonce ? `0x${BigInt(parameters.nonce).toString(16)}` : "0x0",
             initCode: parameters.initCode || "0x",
             callData: parameters.callData || "0x",
             callGasLimit: parameters.callGasLimit ? `0x${BigInt(parameters.callGasLimit).toString(16)}` : "0x0",
             verificationGasLimit: parameters.verificationGasLimit ? `0x${BigInt(parameters.verificationGasLimit).toString(16)}` : "0x0",
             preVerificationGas: parameters.preVerificationGas ? `0x${BigInt(parameters.preVerificationGas).toString(16)}` : "0x0",
             maxFeePerGas: parameters.maxFeePerGas ? `0x${BigInt(parameters.maxFeePerGas).toString(16)}` : "0x0",
             maxPriorityFeePerGas: parameters.maxPriorityFeePerGas ? `0x${BigInt(parameters.maxPriorityFeePerGas).toString(16)}` : "0x0",
             signature: (parameters.signature && parameters.signature !== "0x") ? parameters.signature : "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c",
           };

           console.log("Requesting Paymaster Sponsorship (Input):", { rpcUrl, userOperation, policyId });

           const response = await fetch(rpcUrl, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
               id: 1,
               jsonrpc: '2.0',
               method: 'pm_sponsorUserOperation',
               params: [
                 userOperation,
                 { policyId: policyId, entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789" }
               ]
             })
           });
           
           const json = await response.json();
           if (json.error) {
               console.error("Paymaster Error:", json.error);
               throw new Error(json.error.message);
           }

           console.log("Paymaster Response (Output):", json.result);
           
           return {
             paymasterAndData: json.result.paymasterAndData,
             preVerificationGas: BigInt(json.result.preVerificationGas),
             verificationGasLimit: BigInt(json.result.verificationGasLimit),
             callGasLimit: BigInt(json.result.callGasLimit),
             maxFeePerGas: json.result.maxFeePerGas ? BigInt(json.result.maxFeePerGas) : undefined,
             maxPriorityFeePerGas: json.result.maxPriorityFeePerGas ? BigInt(json.result.maxPriorityFeePerGas) : undefined,
           };
        };

        const client = createSmartAccountClient({
          account: simpleSmartAccount,
          chain: chain,
          bundlerTransport: http(rpcUrl),
          // @ts-ignore
          middleware: enablePaymaster ? {
             sponsorUserOperation: async (args: any) => {
                 const { userOperation } = args;
                 const response = await sponsorUserOperation(userOperation);
                 return { 
                     ...userOperation,
                     paymasterAndData: response.paymasterAndData,
                     preVerificationGas: response.preVerificationGas,
                     verificationGasLimit: response.verificationGasLimit,
                     callGasLimit: response.callGasLimit,
                     maxFeePerGas: response.maxFeePerGas,
                     maxPriorityFeePerGas: response.maxPriorityFeePerGas,
                 };
             }
          } : undefined
        });

        setSmartAccountAddress(simpleSmartAccount.address);
        setSmartAccountClient(client);
        
        // Persist to DB
        await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fid: user.farcaster?.fid?.toString() || user.id,
            walletAddress: simpleSmartAccount.address,
          })
        });

      } catch (e) {
        console.error("Error initializing smart account", e);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [user, wallets]);

  return { smartAccountAddress, smartAccountClient, loading };
}
