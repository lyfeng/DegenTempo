"use client"

import { useState, useEffect, useCallback } from "react"
import { RefreshCw, LayoutDashboard, History, Settings, Wallet, ArrowRight, Menu, X, LogIn, Copy, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { usePrivy, useWallets } from "@privy-io/react-auth"
import { useSmartAccount } from "@/hooks/use-smart-account"
import { loginUser, getUserStats, submitTrade, getTradeHistory, connectStripe, createPayout } from "@/lib/api"
import { toast } from "sonner"
import { getAcrossQuote, spokePoolAbi } from "@/lib/across"
import { encodeFunctionData, parseUnits, formatUnits, erc20Abi, getAddress, createWalletClient, custom } from "viem"

// Extended ERC20 ABI to include Permit
const erc20PermitAbi = [
    ...erc20Abi,
    {
        "inputs": [
            { "internalType": "address", "name": "owner", "type": "address" },
            { "internalType": "address", "name": "spender", "type": "address" },
            { "internalType": "uint256", "name": "value", "type": "uint256" },
            { "internalType": "uint256", "name": "deadline", "type": "uint256" },
            { "internalType": "uint8", "name": "v", "type": "uint8" },
            { "internalType": "bytes32", "name": "r", "type": "bytes32" },
            { "internalType": "bytes32", "name": "s", "type": "bytes32" }
        ],
        "name": "permit",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
] as const;
import { DESTINATION_TOKEN_ADDRESS, DESTINATION_CHAIN, chain, publicClient, APP_TOKEN } from "@/lib/viem"
import { degenTokenAbi } from "@/lib/abi/DegenToken"
import { getPermitSignature } from "@/lib/permit"

export default function DegenTempoDashboard() {
  const { login, logout, authenticated, ready, user } = usePrivy()
  const { wallets } = useWallets()
  const { smartAccountAddress, smartAccountClient } = useSmartAccount()
  
  const [activeTab, setActiveTab] = useState("dashboard")
  const [amount, setAmount] = useState("")
  const [quote, setQuote] = useState<any | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [stats, setStats] = useState<any>(null)
  const [transactions, setTransactions] = useState<any[]>([])
  const [loadingQuote, setLoadingQuote] = useState(false)
  const [signerBalance, setSignerBalance] = useState("0")
  const [usdcBalance, setUsdcBalance] = useState("0")
  const [isApproving, setIsApproving] = useState(false)
  const [needsApproval, setNeedsApproval] = useState(false)
  const [isSwapping, setIsSwapping] = useState(false)

  const [activeWallet, setActiveWallet] = useState<{address: string, type: string} | null>(null);

  // Determine Active Wallet for Transactions
  useEffect(() => {

    if (!wallets || wallets.length === 0) return;

    // 1. Try to find the embedded wallet (Priority for Smart Account Owner)
    const embedded = wallets.find(w => w.walletClientType === 'privy');
    
    // 2. If no embedded, use the user's primary connected wallet
    const primary = wallets.find(w => w.address.toLowerCase() === user?.wallet?.address?.toLowerCase());
    
    // 3. Fallback to first available
    // Prioritize primary (connected) wallet, then embedded, then any
    const target = primary || embedded || wallets[0];

    if (target) {
        setActiveWallet({
            address: target.address,
            type: target.walletClientType
        });
        console.log("Active Wallet set to:", target.address, target.walletClientType);
    }
  }, [wallets, user]);

  const totalBalance = (parseFloat(stats?.balance || "0") + parseFloat(signerBalance)).toFixed(APP_TOKEN.decimals === 18 ? 4 : 2);

  // Fetch User Stats on load
  useEffect(() => {
    if (authenticated && user?.id && smartAccountAddress) {
        // First login/sync user
        loginUser(user.id, smartAccountAddress).then((res) => {
            if (res.error) {
                console.error("Login failed:", res.error);
                return;
            }
                console.log("Login success:", res);
            fetchStats();
            fetchHistory();
        });
    }
  }, [authenticated, user, smartAccountAddress, activeWallet]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Address copied to clipboard");
  };

  const fetchStats = useCallback(async () => {
    if (!user?.id) return;
    setIsRefreshing(true);
    try {
        const data = await getUserStats(user.id);
        
        // Fetch Token Balance (Generic)
        let tokenBalance = "0";
        if (smartAccountAddress) {
            try {
                let balance = BigInt(0);
                if (APP_TOKEN.isNative) {
                     balance = await publicClient.getBalance({ 
                        address: smartAccountAddress as `0x${string}` 
                    });
                } else {
                    balance = await publicClient.readContract({
                        address: getAddress(APP_TOKEN.address),
                        abi: erc20Abi,
                        functionName: 'balanceOf',
                        args: [getAddress(smartAccountAddress)]
                    });
                }
                tokenBalance = formatUnits(balance, APP_TOKEN.decimals);
            } catch (err) {
                console.error("Error fetching token balance:", err);
            }
        }

        // Fetch Signer Balance (Active Wallet)
        if (activeWallet?.address) {
            try {
                console.log("Fetching balance for Active Wallet:", activeWallet.address);
                let balance = BigInt(0);
                if (APP_TOKEN.isNative) {
                     balance = await publicClient.getBalance({ 
                        address: activeWallet.address as `0x${string}` 
                    });
                } else {
                     console.log("Reading contract:", APP_TOKEN.address, "for", activeWallet.address);
                     balance = await publicClient.readContract({
                        address: getAddress(APP_TOKEN.address),
                        abi: erc20Abi,
                        functionName: 'balanceOf',
                        args: [getAddress(activeWallet.address)]
                    });
                    console.log("Raw Balance:", balance);
                }
                setSignerBalance(formatUnits(balance, APP_TOKEN.decimals));
            } catch (err) {
                console.error("Error fetching signer balance:", err);
            }
        } else {
             console.log("No active wallet to fetch balance for");
        }
        
        // Fetch USDC Balance
        if (smartAccountAddress && APP_TOKEN.address) {
             try {
                const balance = await publicClient.readContract({
                    address: getAddress(APP_TOKEN.address),
                    abi: erc20Abi,
                    functionName: 'balanceOf',
                    args: [getAddress(smartAccountAddress)]
                });
                setUsdcBalance(formatUnits(balance, APP_TOKEN.decimals)); 
             } catch (err) {
                 console.error("Error fetching USDC balance:", err);
             }
        }

        setStats({ ...data, balance: tokenBalance });
    } catch (e) {
        console.error("Fetch stats error:", e);
        // toast.error("Failed to fetch stats");
    } finally {
        setIsRefreshing(false);
    }
  }, [user?.id, smartAccountAddress, activeWallet]);

  useEffect(() => {
      fetchStats();
  }, [fetchStats]);

  const fetchHistory = async () => {
      if (!user?.id) return;
      try {
          const data = await getTradeHistory(user.id);
          setTransactions(data);
      } catch (e) {
          console.error(e);
      }
  };

  const handleConnectStripe = async () => {
    if (!user?.id) {
        console.error("User ID missing during Stripe connect");
        return;
    }
    try {
        const res = await connectStripe(user.id);
        
        if (res.success && res.url) {
            // Redirect to Stripe Onboarding
            window.location.href = res.url;
        } else if (res.success) {
            // Already connected (fallback)
            toast.success("Stripe account connected");
            fetchStats();
        } else {
            console.error("connectStripe failed:", JSON.stringify(res));
            toast.error("Failed to connect Stripe: " + (res.error || "Unknown error"));
        }
    } catch (e: any) {
        console.error("handleConnectStripe exception:", e);
        toast.error("Error connecting Stripe: " + e.message);
    }
  };

  const handleWithdraw = async () => {
     if (!amount) {
        toast.error("Amount missing");
        return;
    }
    
    // Check if Stripe is connected
    if (!stats?.stripeAccountId) {
        toast.error("Please connect your Stripe account first (bottom left)");
        return;
    }

    try {
         const amountBN = parseUnits(amount, APP_TOKEN.decimals);
         
         const TREASURY_ADDRESS = process.env.NEXT_PUBLIC_TREASURY_ADDRESS;
         if (!TREASURY_ADDRESS) {
             throw new Error("Treasury address not configured");
         }

         toast.info(`Preparing withdrawal...`);

         // Determine Funding Source
         let txHash;
         let usedSource = "";

         // 1. Check Smart Account Balance
         let smartAccountBal = BigInt(0);
         if (smartAccountAddress) {
            try {
                smartAccountBal = await publicClient.readContract({
                    address: getAddress(APP_TOKEN.address),
                    abi: erc20Abi,
                    functionName: 'balanceOf',
                    args: [getAddress(smartAccountAddress)]
                });
            } catch (e) {}
         }

         // 2. Check EOA Balance
         let eoaBal = BigInt(0);
         if (activeWallet?.address) {
             try {
                eoaBal = await publicClient.readContract({
                    address: getAddress(APP_TOKEN.address),
                    abi: erc20Abi,
                    functionName: 'balanceOf',
                    args: [getAddress(activeWallet.address)]
                });
             } catch (e) {}
         }

         console.log(`Withdraw Check - Smart Account: ${formatUnits(smartAccountBal, APP_TOKEN.decimals)}, EOA: ${formatUnits(eoaBal, APP_TOKEN.decimals)}, Needed: ${amount}`);

         // 3. Execute Transaction
         if (smartAccountAddress && smartAccountBal >= amountBN && smartAccountClient) {
             // Use Smart Account
             usedSource = "Smart Account";
             toast.info(`Sending funds from Smart Account...`);
             
             if (APP_TOKEN.isNative) {
                 txHash = await smartAccountClient.sendTransaction({
                     to: TREASURY_ADDRESS as `0x${string}`,
                     value: amountBN,
                     data: "0x"
                 });
             } else {
                 txHash = await smartAccountClient.sendTransaction({
                     to: APP_TOKEN.address as `0x${string}`,
                     data: encodeFunctionData({
                         abi: erc20Abi,
                         functionName: "transfer",
                         args: [TREASURY_ADDRESS as `0x${string}`, amountBN]
                     }),
                     value: BigInt(0)
                 });
             }
         } else if (activeWallet && eoaBal >= amountBN) {
             // Use EOA (Wallet)
             usedSource = "Wallet";
             toast.info(`Sending funds from Wallet (${activeWallet.address.slice(0,6)}...)...`);

             const wallet = wallets.find(w => w.address.toLowerCase() === activeWallet.address.toLowerCase());
             if (!wallet) throw new Error("Wallet provider not found");

             const provider = await wallet.getEthereumProvider();
             const walletClient = createWalletClient({
                account: activeWallet.address as `0x${string}`,
                chain: chain,
                transport: custom(provider)
             });

             if (APP_TOKEN.isNative) {
                 txHash = await walletClient.sendTransaction({
                     to: TREASURY_ADDRESS as `0x${string}`,
                     value: amountBN,
                     chain: chain
                 });
             } else {
                 txHash = await walletClient.writeContract({
                    address: getAddress(APP_TOKEN.address),
                    abi: erc20Abi,
                    functionName: 'transfer',
                    args: [TREASURY_ADDRESS as `0x${string}`, amountBN],
                    chain: chain
                 });
             }
         } else {
             throw new Error(`Insufficient balance. Needed: ${amount}, Available: SA=${formatUnits(smartAccountBal, APP_TOKEN.decimals)}, EOA=${formatUnits(eoaBal, APP_TOKEN.decimals)}`);
         }
         
         toast.info(`Transaction submitted (${txHash.slice(0,6)}...). Waiting for confirmation...`);

         // Wait for transaction to be mined
         await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });

         toast.success(`Funds sent from ${usedSource}! Processing Payout...`);

         // 4. Trigger Backend Payout
         const payoutRes = await createPayout(user?.id || "", amount, txHash);
         
         if (!payoutRes.success) {
             throw new Error(payoutRes.error || "Payout processing failed");
         }
         
         toast.success("Withdrawal Complete! Funds sent to Stripe.");
         fetchStats();
    } catch (e: any) {
        console.error(e);
        toast.error("Withdraw failed: " + e.message);
    }
  };

  const handleGetQuote = async () => {
    if (!amount || !user?.id) return;
    setLoadingQuote(true);
    setQuote(null);
    try {
        const targetChainId = DESTINATION_CHAIN.id;
        const targetTokenAddress = DESTINATION_TOKEN_ADDRESS;
        
        // Use Active Wallet (EOA) if available, otherwise Smart Account
        const quoteUserAddress = activeWallet?.address || smartAccountAddress || user?.wallet?.address;

        // Log params for debugging
        console.log("--- Quote Request Debug Info ---");
        console.log("1. Connected Wallet (EOA):", activeWallet?.address);
        console.log("2. Smart Account (Derived):", smartAccountAddress);
        console.log("3. Address sent to Across API:", quoteUserAddress);
        console.log("--------------------------------");

        const quoteData = await getAcrossQuote(
            chain.id, 
            targetChainId, 
            APP_TOKEN.address, 
            targetTokenAddress, // Pass explicit target token
            parseUnits(amount, APP_TOKEN.decimals).toString(), 
            quoteUserAddress as string,
            quoteUserAddress as string // recipient
        );
        console.log("Across Quote Result:", quoteData);
        setQuote(quoteData);

        // Check Allowance for EOA
        if (activeWallet?.address && quoteData?.spokePoolAddress) {
             try {
                let spender = quoteData.spokePoolAddress;
                // Double check if object
                if (typeof spender === 'object' && spender !== null) {
                     // @ts-ignore
                     spender = spender.address || spender.contractAddress;
                }

                if (typeof spender === 'string' && spender.startsWith('0x')) {
                    const allowance = await publicClient.readContract({
                        address: getAddress(APP_TOKEN.address),
                        abi: erc20Abi,
                        functionName: 'allowance',
                        args: [getAddress(activeWallet.address), getAddress(spender)]
                    });
                    
                    const amountBN = parseUnits(amount, APP_TOKEN.decimals);
                    console.log(`Checking allowance for ${activeWallet.address} -> ${spender}: ${allowance.toString()} (Needed: ${amountBN.toString()})`);
                    
                    if (allowance < amountBN) {
                        setNeedsApproval(true);
                    } else {
                        setNeedsApproval(false);
                    }
                }
             } catch (err) {
                 console.error("Error checking allowance:", err);
             }
        }
    } catch (e: any) {
        console.error(e);
        toast.error("Failed to get quote: " + (e.message || "Unknown error"));
    } finally {
        setLoadingQuote(false);
    }
  };

  const handleApprove = async () => {
    if (!activeWallet || !quote) return;
    setIsApproving(true);
    try {
        let approvalHash;

        // 1. Use Across provided approval transaction if available
        if (quote.approvalTxns?.[0]) {
            const approvalTx = quote.approvalTxns[0];
            toast.info("Please sign the approval transaction in your wallet...");
            
            // Find wallet object to get provider
            const wallet = wallets.find(w => w.address.toLowerCase() === activeWallet.address.toLowerCase());
            if (!wallet) throw new Error("Wallet provider not found");

            const provider = await wallet.getEthereumProvider();
            const walletClient = createWalletClient({
                account: activeWallet.address as `0x${string}`,
                chain: chain,
                transport: custom(provider)
            });

            approvalHash = await walletClient.sendTransaction({
                to: approvalTx.to as `0x${string}`,
                data: approvalTx.data as `0x${string}`,
                value: BigInt(0),
                chain: chain
            });
        } else {
             // 2. Fallback to manual ERC20 Approve
             console.log("Manual Approval Flow initiated");
             
             let spender = quote.spokePoolAddress;
             if (typeof spender === 'object' && spender !== null) {
                  // @ts-ignore
                  spender = spender.address || spender.contractAddress;
             }
             
             // Fallback logic similar to handleConvert
             if (!spender || typeof spender !== 'string' || !spender.startsWith('0x')) {
                 throw new Error("Invalid SpokePool Address for approval");
             }

             toast.info(`Approving USDC for ${spender.slice(0,6)}...`);
             
             const wallet = wallets.find(w => w.address.toLowerCase() === activeWallet.address.toLowerCase());
             if (!wallet) throw new Error("Wallet provider not found");

             const provider = await wallet.getEthereumProvider();
             const walletClient = createWalletClient({
                account: activeWallet.address as `0x${string}`,
                chain: chain,
                transport: custom(provider)
             });
             
             // Approve Amount (or slightly more to avoid precision issues)
             const amountBN = parseUnits(amount, APP_TOKEN.decimals);
             
             approvalHash = await walletClient.writeContract({
                address: getAddress(APP_TOKEN.address),
                abi: erc20Abi,
                functionName: 'approve',
                args: [getAddress(spender), amountBN],
                chain: chain
             });
        }

        toast.info("Approval submitted. Waiting for confirmation...");
        
        if (approvalHash) {
            await publicClient.waitForTransactionReceipt({ hash: approvalHash });
            toast.success("Approval successful! Refreshing quote...");
        }

        // Small delay to allow chains to sync
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Refresh quote to update allowance status
        await handleGetQuote();

    } catch (e: any) {
        console.error("Approval failed:", e);
        toast.error("Approval failed: " + e.message);
    } finally {
        setIsApproving(false);
    }
  };

  const handleConvert = async () => {
    if (!quote || !user?.id) return;
    setIsSwapping(true);
    toast.info("Initiating Swap...");

    try {
        const amountBN = parseUnits(amount, APP_TOKEN.decimals);
        // Destructure quote and allow re-assignment for fixes
        let { spokePoolAddress, outputAmount, exclusiveRelayer, timestamp, fillDeadline, exclusivityDeadline, message, outputToken, destinationChainId } = quote;

        // Fix: Ensure spokePoolAddress is a string (SDK v3 might return object)
        if (typeof spokePoolAddress === 'object' && spokePoolAddress !== null) {
            console.warn("DEBUG: spokePoolAddress is object, fixing...", spokePoolAddress);
            // @ts-ignore
            spokePoolAddress = spokePoolAddress.address || spokePoolAddress.contractAddress;
        }

        // Fallback for SpokePool Address if invalid
        if (!spokePoolAddress || typeof spokePoolAddress !== 'string' || !spokePoolAddress.startsWith('0x')) {
             throw new Error(`Invalid SpokePool Address: ${spokePoolAddress}`);
        }

        // Fix outputToken if object
        if (typeof outputToken === 'object' && outputToken !== null) {
             // @ts-ignore
             outputToken = outputToken.address || outputToken.tokenAddress;
        }
        
        // Fix exclusiveRelayer if object
        if (typeof exclusiveRelayer === 'object' && exclusiveRelayer !== null) {
             // @ts-ignore
             exclusiveRelayer = exclusiveRelayer.address || exclusiveRelayer.relayerAddress;
        }

        // Normalize exclusiveRelayer
        const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
        if (!exclusiveRelayer || exclusiveRelayer.toLowerCase() === ZERO_ADDRESS) {
            exclusiveRelayer = ZERO_ADDRESS;
        }

        // Prepare Safe Numbers for Contract Call
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const safeTimestamp = Number(timestamp) || currentTimestamp;
        const safeFillDeadline = Number(fillDeadline) || (safeTimestamp + 21600); // Default 6 hours
        
        // Fix: If exclusiveRelayer is zero address, exclusivityDeadline MUST be <= quoteTimestamp
        // We set it to 0 to be absolutely safe (0 <= any valid timestamp).
        // This indicates no exclusivity period.
        let safeExclusivityDeadline = Number(exclusivityDeadline);
        
        if (exclusiveRelayer === ZERO_ADDRESS) {
            safeExclusivityDeadline = 0; 
        } else {
            // Exclusive relayer set -> Ensure valid deadline
            safeExclusivityDeadline = safeExclusivityDeadline || (safeTimestamp + 7200); // Default 2 hours
        }
        
        const safeDestinationChainId = BigInt(destinationChainId || 0);

        console.log("DEBUG: Contract Args:", {
            outputAmount: outputAmount || 0,
            destinationChainId: safeDestinationChainId,
            timestamp: safeTimestamp,
            fillDeadline: safeFillDeadline,
            exclusivityDeadline: safeExclusivityDeadline,
            exclusiveRelayer: exclusiveRelayer
        });

        // EOA Direct Flow (Standard)
        if (activeWallet) {
            
            // 1. Identify Signer Wallet (Must match Active Wallet)
            const signerWallet = wallets.find((w) => w.address.toLowerCase() === activeWallet.address.toLowerCase());
            
            if (!signerWallet) {
                 // Should not happen if activeWallet is set
                 throw new Error(`Wallet instance not found for address: ${activeWallet.address}`);
            }

            const provider = await signerWallet.getEthereumProvider();
            const walletClient = createWalletClient({
                account: signerWallet.address as `0x${string}`,
                chain: chain,
                transport: custom(provider)
            });

            // 2. Check Balance
            if (APP_TOKEN.isNative) {
                // ... native logic if needed ...
            } else {
                 const eoaBalance = await publicClient.readContract({
                    address: getAddress(APP_TOKEN.address),
                    abi: erc20Abi,
                    functionName: 'balanceOf',
                    args: [getAddress(signerWallet.address)]
                });

                if (eoaBalance < amountBN) {
                    toast.error(`Insufficient balance in your wallet. Needed: ${amount}`);
                    setIsSwapping(false);
                    return;
                }
            }

            toast.info("Please sign the transaction in your wallet...");

            console.log("DEBUG: Preparing writeContract...");
            console.log("DEBUG: spokePoolAddress:", spokePoolAddress, typeof spokePoolAddress);
            console.log("DEBUG: activeWallet.address:", activeWallet.address, typeof activeWallet.address);
            console.log("DEBUG: APP_TOKEN.address:", APP_TOKEN.address, typeof APP_TOKEN.address);
            console.log("DEBUG: outputToken:", outputToken, typeof outputToken);
            console.log("DEBUG: exclusiveRelayer:", exclusiveRelayer, typeof exclusiveRelayer);
            console.log("DEBUG: message:", message, typeof message);

            const txHash = await walletClient.writeContract({
                address: spokePoolAddress as `0x${string}`,
                abi: spokePoolAbi,
                functionName: 'depositV3',
                args: [
                    activeWallet.address as `0x${string}`, // depositor
                    activeWallet.address as `0x${string}`, // recipient
                    APP_TOKEN.address as `0x${string}`, // inputToken
                    (outputToken || "0x0000000000000000000000000000000000000000") as `0x${string}`, // outputToken
                    amountBN, // inputAmount
                    BigInt(outputAmount || 0), // outputAmount
                    safeDestinationChainId, // destinationChainId
                    exclusiveRelayer as `0x${string}`,
                    safeTimestamp, // quoteTimestamp
                    safeFillDeadline, // fillDeadline
                    safeExclusivityDeadline, // exclusivityDeadline
                    (message || "0x") as `0x${string}` // message
                ],
                chain: chain,
                value: BigInt(0) // USDC is not native token
            });

            console.log("Transaction submitted:", txHash);

            // 6. Record Trade
            await submitTrade(user.id, amount, txHash, formatUnits(BigInt(outputAmount), 6));

            toast.success("Transaction Submitted! Funds are on the way.", {
                action: {
                    label: "View Explorer",
                    onClick: () => window.open(`${chain.blockExplorers?.default.url}/tx/${txHash}`, '_blank')
                }
            });
            setQuote(null);
            setAmount("");
            fetchHistory();
            
            // Delay fetch stats to allow RPC to index
            setTimeout(() => {
                fetchStats();
            }, 2000);
            return;
        }

        // Fallback if no active wallet found
        if (!activeWallet) {
             toast.error("No active wallet found. Please reconnect.");
             setIsSwapping(false);
             return;
        }


    } catch (e: any) {
        console.error("Swap failed:", e);
        toast.error("Swap failed: " + (e.message || "Unknown error"));
    } finally {
        setIsSwapping(false);
    }
  };

  if (!ready) {
      return <div className="flex h-screen items-center justify-center bg-slate-950 text-white">Loading...</div>;
  }

  if (!authenticated) {
      return (
          <div className="flex h-screen flex-col items-center justify-center bg-slate-950 text-white gap-4">
              <div className="flex items-center gap-2 mb-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700">
                  <Wallet className="h-7 w-7 text-white" />
                </div>
                <span className="text-3xl font-bold">DegenTempo</span>
              </div>
              <Card className="w-[350px] border-slate-800 bg-slate-900 text-slate-100">
                  <CardHeader>
                      <CardTitle>Welcome</CardTitle>
                      <CardDescription>Sign in to manage your Degen assets</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                      <Button className="w-full bg-purple-600 hover:bg-purple-700" onClick={() => login({ loginMethods: ['farcaster'] })}>
                          <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Farcaster_logo_transparent.png/240px-Farcaster_logo_transparent.png" alt="Farcaster" className="mr-2 h-4 w-4 invert brightness-0 saturate-100" /> 
                          Login with Farcaster
                      </Button>
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-slate-800" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-slate-950 px-2 text-slate-500">Or</span>
                        </div>
                      </div>
                      <Button variant="outline" className="w-full border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white" onClick={() => login({ loginMethods: ['wallet'] })}>
                          <Wallet className="mr-2 h-4 w-4" /> Connect Wallet (MetaMask)
                      </Button>
                  </CardContent>
              </Card>
          </div>
      );
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside className="hidden w-64 border-r border-slate-800 bg-slate-900/50 backdrop-blur-xl lg:block">
        <div className="flex h-16 items-center border-b border-slate-800 px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-700">
              <Wallet className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-semibold text-white">DegenTempo</span>
          </div>
        </div>
        <nav className="flex flex-col gap-1 p-4">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "dashboard"
                ? "bg-blue-600/20 text-blue-400 shadow-lg shadow-blue-500/10"
                : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
            }`}
          >
            <LayoutDashboard className="h-5 w-5" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "history"
                ? "bg-blue-600/20 text-blue-400 shadow-lg shadow-blue-500/10"
                : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
            }`}
          >
            <History className="h-5 w-5" />
            Transaction History
          </button>
        </nav>

        <div className="border-t border-slate-800 p-4">
           <div className="flex items-center gap-3 rounded-lg bg-slate-950/50 p-3">
             {user?.farcaster?.pfp ? (
                <img 
                  src={user.farcaster.pfp} 
                  alt={user.farcaster.displayName || "User"} 
                  className="h-10 w-10 rounded-full object-cover border border-slate-700"
                />
             ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-blue-500 text-sm font-bold text-white">
                  {user?.farcaster?.displayName?.charAt(0) || user?.wallet?.address?.slice(0, 2) || "U"}
                </div>
             )}
             <div className="overflow-hidden">
               <p className="truncate text-sm font-medium text-white flex items-center gap-1">
                 {user?.farcaster?.displayName || "Wallet User"}
                 {user?.farcaster ? (
                    <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Farcaster_logo_transparent.png/240px-Farcaster_logo_transparent.png" alt="Farcaster" className="h-3 w-3 inline-block opacity-80" />
                 ) : (
                    <Wallet className="h-3 w-3 inline-block opacity-80 text-slate-400" />
                 )}
               </p>
               <p className="truncate text-xs text-slate-500">
                   {user?.farcaster?.username ? `@${user.farcaster.username}` : (user?.wallet?.address ? `${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}` : "")}
               </p>
             </div>
           </div>
         </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-slate-950 p-4 lg:p-8">
          <div className="mx-auto max-w-6xl space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white">{activeTab === 'dashboard' ? 'Dashboard' : 'Transaction History'}</h1>
                <p className="text-slate-400">Manage your Degen assets and conversions</p>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => { fetchStats(); fetchHistory(); }}
                className={`border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white ${isRefreshing ? "animate-spin" : ""}`}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {/* Service Status Alert */}
            {stats && !stats.serviceEnabled && (
                <div className="bg-red-900/20 border border-red-900/50 p-4 rounded-lg text-red-200">
                    Warning: {stats.maintenanceMessage || "Service Paused"}
                </div>
            )}

            {/* Testnet Adapter Indicator */}
                    {chain.testnet && (
                 <div className="mb-6 rounded-lg border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-200">
                    <p className="font-bold mb-1">ℹ️ Testnet Adapter Active</p>
                    <p>
                        You are on <strong>Base Sepolia</strong>. 
                        The app is using <strong>Across Protocol</strong> for cross-chain transfers.
                        Real swaps will occur automatically on Mainnet.
                    </p>
                 </div>
            )}

            {activeTab === 'dashboard' ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {/* Balance Card */}
                  <Card className="col-span-1 md:col-span-2 lg:col-span-3 border-slate-800 bg-slate-900/50 backdrop-blur-xl">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-slate-400">Total Balance</CardTitle>
                      <div className="rounded-full bg-blue-500/10 p-2 text-blue-500">
                        <Wallet className="h-4 w-4" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <h2 className="text-3xl font-bold tracking-tight text-white">
                        {totalBalance} {APP_TOKEN.symbol}
                      </h2>
                      <p className="text-sm text-slate-400">
                        ≈ ${(parseFloat(totalBalance) * 3500).toFixed(2)} USD
                      </p>

                      {/* Address Details */}
                      <div className="mt-6 flex items-center justify-between rounded-lg bg-slate-950/30 p-3 border border-slate-800/50">
                        <span className="text-xs font-medium text-slate-500">Wallet Address</span>
                        <div className="flex items-center">
                            <code className="text-xs text-slate-400 font-mono truncate mr-2 max-w-[200px]">
                                {user?.wallet?.address}
                            </code>
                            <Button variant="ghost" size="icon" className="h-4 w-4 text-slate-600 hover:text-white" onClick={() => copyToClipboard(user?.wallet?.address || "")}>
                                <Copy className="h-3 w-3" />
                            </Button>
                        </div>
                      </div>

                      {/* Gas Status (Replaces Smart Account Details) */}
                      <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-950/30 p-3 border border-slate-800/50">
                        <span className="text-xs font-medium text-slate-500">Gas Status</span>
                        <div className="flex items-center">
                            <span className="text-xs font-bold text-green-400 mr-2">
                                Sponsored (Free)
                            </span>
                        </div>
                      </div>

                      {/* Logout Button */}
                      <div className="mt-2 text-right">
                          <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-xs text-red-400 hover:text-red-300 hover:bg-red-900/10 h-6 px-2"
                              onClick={() => {
                                  logout();
                                  toast.info("Logged out successfully");
                              }}
                          >
                              <LogOut className="h-3 w-3 mr-1" />
                              Logout
                          </Button>
                      </div>

                      {/* Stripe Connect Section */}
                      <div className="mt-4 border-t border-slate-800 pt-4">
                          <div className="flex items-center justify-between">
                              <div>
                                  <p className="text-sm font-medium text-slate-300">Fiat Payout (Stripe)</p>
                                  <p className="text-xs text-slate-500">
                                      {stats?.stripeAccountId 
                                          ? `Connected: ${stats.stripeAccountId}` 
                                          : "Connect Stripe to receive USD"}
                                  </p>
                              </div>
                              <Button 
                                  variant={stats?.stripeAccountId ? "outline" : "default"}
                                  size="sm"
                                  onClick={handleConnectStripe}
                                  disabled={!!stats?.stripeAccountId}
                                  className={stats?.stripeAccountId ? "border-green-900 text-green-500 bg-green-900/10" : "bg-blue-600 hover:bg-blue-700"}
                              >
                                  {stats?.stripeAccountId ? "Connected" : "Connect"}
                              </Button>
                          </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Conversion Section */}
                  <Card className="col-span-1 md:col-span-2 lg:col-span-3 border-slate-800 bg-slate-900/50 backdrop-blur-xl">
                      <CardHeader>
                          <CardTitle className="text-white">Convert to USD</CardTitle>
                          <CardDescription>Bridge {APP_TOKEN.symbol} to Tempo and withdraw to Stripe</CardDescription>
                      </CardHeader>
                      <CardContent>
                          <div className="space-y-4">
                              <div>
                                  <div className="mb-2 flex flex-col gap-1 text-sm">
                                      <div className="flex justify-between">
                                        <span className="text-slate-400">Amount ({APP_TOKEN.symbol})</span>
                                        <span className="text-slate-400 font-medium">Total: {totalBalance}</span>
                                      </div>
                                      
                                      <div className="flex flex-col gap-1 text-xs text-slate-500 items-end border-t border-slate-800/50 pt-2 mt-1">
                                            {/* Smart Account Info */}
                                            <div className="flex items-center gap-2">
                                                <span className="text-slate-400">Smart Account (Bridge):</span>
                                                <span 
                                                    className="font-mono text-blue-400 cursor-pointer hover:text-blue-300 transition-colors" 
                                                    onClick={() => copyToClipboard(smartAccountAddress || "")} 
                                                    title="Click to copy Smart Account Address"
                                                >
                                                    {smartAccountAddress ? `${smartAccountAddress.slice(0, 6)}...${smartAccountAddress.slice(-4)}` : "Loading..."}
                                                </span>
                                                <span className="text-slate-600">|</span>
                                                <span>Bal: {parseFloat(stats?.balance || "0").toFixed(4)}</span>
                                            </div>

                                            {/* EOA Info */}
                                            <div className="flex items-center gap-2">
                                                <span className="text-slate-400">Connected Wallet (EOA):</span>
                                                <span className="font-mono text-slate-300" title={activeWallet?.address}>
                                                    {activeWallet?.address ? `${activeWallet.address.slice(0, 6)}...${activeWallet.address.slice(-4)}` : "Not Connected"}
                                                </span>
                                                <span className="text-slate-600">|</span>
                                                <span>Bal: {parseFloat(signerBalance).toFixed(4)}</span>
                                            </div>
                                      </div>
                                  </div>
                                  <div className="flex gap-2">
                                      <Input 
                                          placeholder="0.00" 
                                          className="border-slate-800 bg-slate-950 text-white"
                                          value={amount}
                                          onChange={(e) => {
                                            setAmount(e.target.value);
                                            setQuote(null); // Reset quote on change
                                          }}
                                      />
                                      <Button variant="outline" className="border-slate-800 text-slate-400 hover:text-white" onClick={() => setAmount(signerBalance || "0")}>
                                          Max (Signer)
                                      </Button>
                                  </div>
                              </div>

                              {/* Dev Only: Direct Withdraw Button - HIDDEN
                              {stats?.stripeAccountId && (
                                  <div className="mb-4 pt-2">
                                       <Button 
                                          variant="outline" 
                                          className="w-full border-purple-900/50 text-purple-400 hover:bg-purple-900/20"
                                          onClick={handleWithdraw}
                                          disabled={!amount || parseFloat(amount) <= 0}
                                      >
                                          Test Withdraw to Stripe (Direct)
                                      </Button>
                                      <p className="text-[10px] text-slate-500 text-center mt-1">
                                           *Sends USDC directly to Treasury &rarr; Stripe Payout (Bypasses Bridge)
                                       </p>
                                  </div>
                              )}
                              */}
                              
                              {quote ? (
                                      <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 space-y-2">
                                          <div className="flex justify-between text-sm">
                                              <span className="text-slate-400">Receive (Estimated):</span>
                                              <span className="font-medium text-green-400">
                                                  {/* Fix: Prioritize expectedOutputAmount, fallback to outputAmount or 0 */}
                                                  {formatUnits(BigInt(quote.expectedOutputAmount || quote.outputAmount || 0), 6)} USDC
                                              </span>
                                          </div>
                                    <div className="flex justify-between text-xs text-slate-500">
                                        <span>Route:</span>
                                        <span>Across Protocol</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-slate-500">
                                        <span>Bridge Fee:</span>
                                        <span>
                                            {/* Fix: Check multiple fee fields (totalRelayerFee, fees.total, or calculate diff) */}
                                            {quote.totalRelayerFee ? formatUnits(BigInt(quote.totalRelayerFee), 6) : 
                                             (quote.fees?.total && (typeof quote.fees.total === 'string' || typeof quote.fees.total === 'number' || typeof quote.fees.total === 'bigint')) ? formatUnits(BigInt(quote.fees.total), 6) :
                                             quote.inputAmount && quote.expectedOutputAmount ? 
                                                formatUnits(BigInt(quote.inputAmount) - BigInt(quote.expectedOutputAmount), 6) :
                                             "Unknown"} USDC
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-xs text-slate-500">
                                        <span>Gas Cost:</span>
                                        <span className="text-green-500">Sponsored (Free)</span>
                                    </div>
                                    {BigInt(quote.expectedOutputAmount || quote.outputAmount || 0) === BigInt(0) && (
                                        <div className="mt-2 rounded bg-red-900/20 p-2 text-xs text-red-400 border border-red-900/50">
                                            Warning: Amount is too low to cover bridge fees. Please increase amount.
                                        </div>
                                    )}

                                    <Button 
                                      className="w-full mt-2 bg-blue-600 hover:bg-blue-700" 
                                      onClick={handleConvert}
                                      disabled={!stats?.serviceEnabled || isSwapping}
                                    >
                                      {isSwapping ? "Swapping..." : "Confirm Swap"}
                                      <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                    
                                    {/* Approval Button Logic */}
                                    {(needsApproval || (quote.approvalTxns && quote.approvalTxns.length > 0)) && (
                                        <div className="absolute inset-0 bg-slate-900/90 flex items-center justify-center p-4 rounded-lg">
                                            <div className="w-full space-y-3">
                                                <div className="text-center">
                                                    <p className="text-sm font-medium text-white mb-1">Approval Required</p>
                                                    <p className="text-xs text-slate-400">Please approve USDC to continue</p>
                                                </div>
                                                <Button 
                                                    className="w-full bg-yellow-600 hover:bg-yellow-700" 
                                                    onClick={handleApprove}
                                                    disabled={isApproving}
                                                >
                                                    {isApproving ? "Approving..." : "Approve USDC"}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                              ) : (
                                <Button 
                                    className="w-full bg-slate-800 hover:bg-slate-700" 
                                    onClick={handleGetQuote}
                                    disabled={!amount || parseFloat(amount) <= 0 || loadingQuote}
                                >
                                    {loadingQuote ? "Fetching Best Route..." : "Get Quote"} 
                                </Button>
                              )}
                          </div>
                      </CardContent>
                  </Card>
                </div>
            ) : (
                /* History Tab Content */
                <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-xl">
                    <CardHeader>
                        <CardTitle>Recent Transactions</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {transactions.length === 0 ? (
                            <p className="text-slate-400">No transactions yet.</p>
                        ) : (
                            <div className="space-y-4">
                                {transactions.map((tx) => (
                                    <div key={tx.id} className="flex items-center justify-between border-b border-slate-800 pb-4 last:border-0">
                                        <div>
                                            <p className="font-medium text-white">{tx.inputAmount} {APP_TOKEN.symbol}</p>
                                            <p className="text-sm text-slate-400">{new Date(tx.createdAt).toLocaleString()}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-medium ${
                                                tx.status === 'COMPLETED' ? 'text-green-500' : 
                                                tx.status === 'FAILED' ? 'text-red-500' : 'text-yellow-500'
                                            }`}>
                                                {tx.status}
                                            </p>
                                            <p className="text-xs text-slate-500">Fee: {tx.feeAmount} {APP_TOKEN.symbol}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
          </div>
      </main>
    </div>
  )
}
