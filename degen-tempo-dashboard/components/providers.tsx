'use client';

import {PrivyProvider} from '@privy-io/react-auth';
import {chain} from '@/lib/viem';

// Suppress "Invalid DOM property 'clip-path'" error from Privy
if (typeof window !== 'undefined') {
  const originalError = console.error;
  console.error = (...args) => {
    // Combine all string arguments to check for the error message
    // React often passes the message as a format string followed by arguments
    const msg = args.filter(arg => typeof arg === 'string').join(' ');
    if (msg.includes('Invalid DOM property') && msg.includes('clip-path')) {
      return;
    }
    originalError.apply(console, args);
  };
}

export default function Providers({children}: {children: React.ReactNode}) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ''}
      config={{
        // Customize Privy's appearance in your app
        appearance: {
          theme: 'dark',
          accentColor: '#676FFF',
          showWalletLoginFirst: false,
        },
        loginMethods: ['farcaster'],
        // Create embedded wallets for users who don't have a wallet
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'all-users',
          }
        },
        defaultChain: chain,
        supportedChains: [chain],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
