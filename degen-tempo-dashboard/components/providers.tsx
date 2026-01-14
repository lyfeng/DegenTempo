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
    
    // Debugging: Analyze the "ERROR: {}" log
    try {
        const msg = args.filter(arg => typeof arg === 'string').join(' ');
        const jsonArgs = args.map(a => {
            try { return JSON.stringify(a) } catch { return 'Circular' }
        });
        
        // Detect "ERROR: {}" pattern
        const isSuspicious = 
            (msg.replace(/\s+/g, '').includes('ERROR:')) && 
            jsonArgs.some(s => s === '{}');

        if (isSuspicious) {
            console.group("Captured Suspicious Error Analysis");
            console.log("Original Args:", args);
            args.forEach((arg, i) => {
                if (typeof arg === 'object' && arg !== null) {
                    console.log(`Arg ${i} Keys:`, Object.keys(arg));
                    console.log(`Arg ${i} Proto:`, Object.getPrototypeOf(arg));
                    if (arg instanceof Error) {
                        console.log(`Arg ${i} Message:`, arg.message);
                        console.log(`Arg ${i} Stack:`, arg.stack);
                    }
                }
            });
            // console.trace("Trace"); // Optional: Trace where it came from
            console.groupEnd();
        }
    } catch (e) {
        // ignore debug errors
    }

    // Helper to detect empty objects
    const isEmptyObject = (obj: any) => {
      if (typeof obj !== 'object' || obj === null) return false;
      // If it's a native Error, consider it empty only if it has no message
      if (obj instanceof Error) {
        return !obj.message || obj.message.trim() === '';
      }
      // Check for non-empty keys
      if (Object.keys(obj).length > 0) return false;
      // Check JSON stringification
      try {
        return JSON.stringify(obj) === '{}';
      } catch {
        return false;
      }
    };

    // Filter out unhelpful generic errors
    // Detects patterns like console.error("ERROR:", {}) or console.error("Error", {})
    const isGenericError = () => {
        // Check if all object arguments are effectively empty
        const allObjectsEmpty = args.every(arg => {
            if (typeof arg === 'object' && arg !== null) {
                return isEmptyObject(arg);
            }
            return true; // Non-objects are not "non-empty objects"
        });
        
        // Check the text content
        const text = args
          .filter(arg => typeof arg === 'string')
          .join('')
          .replace(/[:\s]+/g, '') // Remove colons and whitespace
          .toLowerCase();
        
        // If it's just "error" or empty, and all objects are empty -> Suppress
        // Also suppress if the text literally looks like "error{}" or "error:{}" which happens if "ERROR: {}" is passed as a string
        const match = (text === '' || text === 'error' || text === 'error{}') && allObjectsEmpty;

        if (match) {
        // Suppressed empty ERROR log
    }

    return match;
  };

  if (isGenericError()) {
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
        loginMethods: ['farcaster', 'wallet'],
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
