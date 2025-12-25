"use client"

import { useState, useEffect } from "react"
import { RefreshCw, LayoutDashboard, History, Settings, Wallet, ArrowRight, Menu, X, LogIn, Copy, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { usePrivy, useWallets } from "@privy-io/react-auth"
import { useSmartAccount } from "@/hooks/use-smart-account"
import { loginUser, getUserStats, submitTrade, getTradeHistory, connectStripe, createPayout } from "@/lib/api"
import { toast } from "sonner"
import { getLifiQuote, type LifiQuote } from "@/lib/lifi"
import { encodeFunctionData, parseUnits, formatUnits, erc20Abi, createWalletClient, custom, maxUint256, getAddress } from "viem"
import { DEGEN_TOKEN_ADDRESS, USDC_ADDRESS, USDC_ON_TEMPO_ADDRESS, chain, publicClient, APP_TOKEN } from "@/lib/viem"
import { degenTokenAbi } from "@/lib/abi/DegenToken"
import { getPermitSignature } from "@/lib/permit"

export default function DegenTempoDashboard() {
  const { login, logout, authenticated, ready, user } = usePrivy()
  const { wallets } = useWallets()
  const { smartAccountAddress, smartAccountClient } = useSmartAccount()
  
  const [activeTab, setActiveTab] = useState("dashboard")
  const [amount, setAmount] = useState("")
  const [quote, setQuote] = useState<LifiQuote | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [stats, setStats] = useState<any>(null)
  const [transactions, setTransactions] = useState<any[]>([])
  const [loadingQuote, setLoadingQuote] = useState(false)
  const [signerBalance, setSignerBalance] = useState("0")
  const [usdcBalance, setUsdcBalance] = useState("0")
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
    const target = embedded || primary || wallets[0];

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

  const fetchStats = async () => {
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
                     balance = await publicClient.readContract({
                        address: getAddress(APP_TOKEN.address),
                        abi: erc20Abi,
                        functionName: 'balanceOf',
                        args: [getAddress(activeWallet.address)]
                    });
                }
                setSignerBalance(formatUnits(balance, APP_TOKEN.decimals));
            } catch (err) {
                console.error("Error fetching signer balance:", err);
            }
        }
        
        // Fetch USDC Balance
        if (smartAccountAddress && USDC_ADDRESS) {
             try {
                const balance = await publicClient.readContract({
                    address: getAddress(USDC_ADDRESS),
                    abi: erc20Abi,
                    functionName: 'balanceOf',
                    args: [getAddress(smartAccountAddress)]
                });
                setUsdcBalance(formatUnits(balance, 6)); // USDC usually 6 decimals
             } catch (err) {
                 console.error("Error fetching USDC balance:", err);
             }
        }

        setStats({ ...data, balance: tokenBalance });
    } catch (e) {
        toast.error("Failed to fetch stats");
    } finally {
        setIsRefreshing(false);
    }
  };

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
     if (!smartAccountAddress || !amount || !smartAccountClient) {
        toast.error("Smart Account not ready or Amount missing");
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

         toast.info(`Sending funds to Treasury (${TREASURY_ADDRESS.slice(0,6)}...)...`);
         
         // 1. Send Funds to Treasury
         let txHash;
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
         
         toast.success("Funds sent! Processing Payout...");

         // 2. Trigger Backend Payout
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
        if (!process.env.NEXT_PUBLIC_TEMPO_CHAIN_ID) {
            throw new Error("Configuration Error: NEXT_PUBLIC_TEMPO_CHAIN_ID is not set. Please configure the target Tempo Chain ID.");
        }
        const targetChainId = parseInt(process.env.NEXT_PUBLIC_TEMPO_CHAIN_ID);
            
        if (targetChainId === chain.id) {
            console.warn("Target chain is same as source chain. Ensure this is intended.");
        }

        const targetTokenAddress = targetChainId === chain.id ? USDC_ADDRESS : USDC_ON_TEMPO_ADDRESS;
        const treasuryAddress = process.env.NEXT_PUBLIC_TREASURY_ADDRESS;

        const quoteData = await getLifiQuote(
            chain.id, 
            targetChainId, 
            APP_TOKEN.address, 
            targetTokenAddress, 
            parseUnits(amount, APP_TOKEN.decimals).toString(), 
            smartAccountAddress || user.wallet?.address || "",
            smartAccountAddress || user.wallet?.address || "" // Send funds to User's Wallet on Destination Chain
        );
        setQuote(quoteData);
    } catch (e) {
        console.error(e);
        toast.error("Failed to get quote");
    } finally {
        setLoadingQuote(false);
    }
  };

  const handleConvert = async () => {
    if (!quote || !user?.id || !smartAccountClient || !smartAccountAddress) {
        toast.error("Smart Account not ready");
        return;
    }
    
    setIsSwapping(true);
    toast.info("Initiating Swap...");

    try {
        const amountBN = parseUnits(amount, APP_TOKEN.decimals);
        
        // 1. Identify Signer Wallet (Must match Active Wallet)
        if (!activeWallet) {
            toast.error("No active wallet found. Please reconnect.");
            setIsSwapping(false);
            return;
        }

        const signerWallet = wallets.find((w) => w.address.toLowerCase() === activeWallet.address.toLowerCase());
        
        if (!signerWallet) {
            throw new Error(`Wallet instance not found for address: ${activeWallet.address}`);
        }

        console.log("Using Signer Wallet:", { 
            type: signerWallet.walletClientType, 
            address: signerWallet.address,
            activeType: activeWallet.type 
        });

        // 2. Check EOA Balance (Not Smart Account Balance!)
        // We are pulling funds FROM the EOA.
        const provider = await signerWallet.getEthereumProvider();
        const walletClient = createWalletClient({
            account: signerWallet.address as `0x${string}`,
            chain: chain,
            transport: custom(provider)
        });

        if (APP_TOKEN.isNative) {
            throw new Error("Permit flow is not supported for Native ETH. Please use ERC20 token.");
        }

        const eoaBalance = await publicClient.readContract({
            address: getAddress(APP_TOKEN.address),
            abi: degenTokenAbi,
            functionName: 'balanceOf',
            args: [getAddress(signerWallet.address)]
        });

        if (eoaBalance < amountBN) {
            toast.error(`Insufficient balance in your wallet. Needed: ${amount}`);
            setIsSwapping(false);
            return;
        }

        toast.info("Step 1/2: Please sign the Permit request...");

        // 3. Generate Permit Signature (Gasless)
        // This allows the Smart Account to pull funds from EOA
        const permit = await getPermitSignature(
            walletClient,
            publicClient,
            APP_TOKEN.address as `0x${string}`,
            signerWallet.address as `0x${string}`, // Owner (EOA)
            smartAccountAddress as `0x${string}`,    // Spender (Smart Account)
            amountBN
        );

        toast.info(`Step 2/2: Executing Transaction...`);

        // 4. Construct Batch UserOperation
        // Batch = [Permit, TransferFrom, ApproveRouter, Swap]
        
        const step = quote.steps[0];
        if (!step.transactionRequest) {
             throw new Error("Invalid quote: missing transaction request");
        }
        const { to: routerAddress, data: swapData, value: swapValue } = step.transactionRequest;

        const batchCalls = [
            // Call 1: Permit (Token Contract)
            {
                to: APP_TOKEN.address as `0x${string}`,
                data: encodeFunctionData({
                    abi: degenTokenAbi,
                    functionName: 'permit',
                    args: [
                        signerWallet.address as `0x${string}`,
                        smartAccountAddress as `0x${string}`,
                        amountBN,
                        permit.deadline,
                        permit.v,
                        permit.r,
                        permit.s
                    ]
                }),
                value: BigInt(0)
            },
            // Call 2: TransferFrom EOA -> Smart Account
            {
                to: APP_TOKEN.address as `0x${string}`,
                data: encodeFunctionData({
                    abi: degenTokenAbi,
                    functionName: 'transferFrom',
                    args: [
                        signerWallet.address as `0x${string}`,
                        smartAccountAddress as `0x${string}`,
                        amountBN
                    ]
                }),
                value: BigInt(0)
            },
            // Call 3: Approve Router (Smart Account -> LI.FI Router)
            {
                to: APP_TOKEN.address as `0x${string}`,
                data: encodeFunctionData({
                    abi: degenTokenAbi,
                    functionName: 'approve',
                    args: [routerAddress as `0x${string}`, amountBN]
                }),
                value: BigInt(0)
            },
            // Call 4: Execute Swap (LI.FI Router)
            {
                to: routerAddress as `0x${string}`,
                data: swapData as `0x${string}`,
                value: BigInt(swapValue || 0)
            }
        ];

        // 5. Send UserOperation
        // @ts-ignore
        // For batch transactions, we must use sendUserOperation directly or use a method that supports 'calls'
        // Since sendTransaction (singular) only supports one call, we use sendUserOperation which uses the account to encode calls.
        
        const userOpHash = await smartAccountClient.sendUserOperation({
            calls: batchCalls
        });
        
        console.log("UserOp submitted:", userOpHash);
        
        const receipt = await smartAccountClient.waitForUserOperationReceipt({ hash: userOpHash });
        
        if (!receipt.success) {
            console.error("UserOp Receipt Failed:", receipt);
            throw new Error("Transaction Execution Reverted on chain. Please check block explorer for details.");
        }

        const txHash = receipt.receipt.transactionHash;

        console.log("Transaction submitted:", txHash);

        
        // 6. Record Trade
        await submitTrade(user.id, amount, txHash, formatUnits(BigInt(step.estimate.toAmount), 6));

        toast.success("Transaction Submitted! Funds are on the way.", {
            action: {
                label: "View Explorer",
                onClick: () => window.open(`https://sepolia.basescan.org/tx/${txHash}`, '_blank')
            }
        });
        setQuote(null);
        setAmount("");
        fetchHistory();
        
        // Delay fetch stats to allow RPC to index
        setTimeout(() => {
            fetchStats();
        }, 2000);

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
                  <CardContent>
                      <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={login}>
                          <LogIn className="mr-2 h-4 w-4" /> Login with Farcaster
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
                  {user?.farcaster?.displayName?.charAt(0) || "U"}
                </div>
             )}
             <div className="overflow-hidden">
               <p className="truncate text-sm font-medium text-white flex items-center gap-1">
                 {user?.farcaster?.displayName || "User"}
                 <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Farcaster_logo_transparent.png/240px-Farcaster_logo_transparent.png" alt="Farcaster" className="h-3 w-3 inline-block opacity-80" />
               </p>
               <p className="truncate text-xs text-slate-500">@{user?.farcaster?.username || user?.wallet?.address?.slice(0, 6)}</p>
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
                        You are on <strong>Base Sepolia</strong>. Since LI.FI (liquidity provider) does not support this testnet, 
                        the app is using a compatibility adapter to simulate the swap flow. 
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

                      {/* Address Details (Simplified) */}
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

                      <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-950/30 p-3 border border-slate-800/50">
                        <span className="text-xs font-medium text-slate-500">USDC Balance (Smart Account)</span>
                        <div className="flex items-center">
                            <span className="text-sm font-bold text-green-400 mr-2">
                                {parseFloat(usdcBalance).toFixed(2)} USDC
                            </span>
                        </div>
                      </div>

                      {/* Smart Account Address (Debug/Info) */}
                      <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-950/30 p-3 border border-slate-800/50">
                        <span className="text-xs font-medium text-slate-500">Smart Account</span>
                        <div className="flex items-center">
                            <code className="text-xs text-blue-400 font-mono truncate mr-2 max-w-[200px]">
                                {smartAccountAddress || "Loading..."}
                            </code>
                            <Button variant="ghost" size="icon" className="h-4 w-4 text-slate-600 hover:text-white" onClick={() => copyToClipboard(smartAccountAddress || "")}>
                                <Copy className="h-3 w-3" />
                            </Button>
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
                                      <div className="flex justify-end gap-3 text-xs text-slate-500">
                                          <span>Smart Acct: {parseFloat(stats?.balance || "0").toFixed(4)}</span>
                                          <span>Signer: {parseFloat(signerBalance).toFixed(4)}</span>
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
                                      <Button variant="outline" className="border-slate-800 text-slate-400 hover:text-white" onClick={() => setAmount(stats?.balance || "0")}>
                                          Max (Smart)
                                      </Button>
                                  </div>
                              </div>
                              
                              {quote ? (
                                <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-400">Receive (Estimated):</span>
                                        <span className="font-medium text-green-400">{formatUnits(BigInt(quote.toAmount), quote.toToken.decimals)} {quote.toToken.symbol}</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-slate-500">
                                        <span>Route:</span>
                                        <span>{quote.steps.map((s: any) => s.tool).join(' -> ')}</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-slate-500">
                                        <span>Gas Cost:</span>
                                        <span className="text-green-500">Sponsored (Free)</span>
                                    </div>
                                    <Button 
                                      className="w-full mt-2 bg-blue-600 hover:bg-blue-700" 
                                      onClick={handleConvert}
                                      disabled={!stats?.serviceEnabled}
                                    >
                                      Confirm Swap
                                      <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
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
                                            <p className="font-medium text-white">{tx.inputAmount} DEGEN</p>
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
