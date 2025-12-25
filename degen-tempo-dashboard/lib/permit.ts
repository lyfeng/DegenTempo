import { WalletClient, PublicClient, maxUint256 } from 'viem';
import { degenTokenAbi } from './abi/DegenToken';

export interface PermitSignature {
  r: `0x${string}`;
  s: `0x${string}`;
  v: number;
  deadline: bigint;
}

export async function getPermitSignature(
  walletClient: any,
  publicClient: any,
  tokenAddress: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}`,
  value: bigint,
  deadline?: bigint
): Promise<PermitSignature> {
  // 1. Get Nonce
  const nonce = await publicClient.readContract({
    address: tokenAddress,
    abi: degenTokenAbi,
    functionName: 'nonces',
    args: [owner],
  });

  // 2. Get Domain Separator Info (Name & Version)
  const name = await publicClient.readContract({
    address: tokenAddress,
    abi: degenTokenAbi,
    functionName: 'name',
  });
  
  // Try to fetch version, default to "1" if fails
  let version = "1";
  try {
      version = await publicClient.readContract({
        address: tokenAddress,
        abi: degenTokenAbi,
        functionName: 'version',
      }) as string;
  } catch (e) {
      console.warn("Could not fetch token version, defaulting to '1'", e);
  }

  const chainId = await publicClient.getChainId();

  // 3. Define Typed Data
  const domain = {
    name: name,
    version: version,
    chainId: chainId,
    verifyingContract: tokenAddress,
  } as const;

  const types = {
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  } as const;

  // Default deadline to 1 hour if not provided
  const finalDeadline = deadline || BigInt(Math.floor(Date.now() / 1000) + 3600);

  // 4. Sign Typed Data
  // We use signTypedData from viem which handles EIP-712
  const signatureHex = await walletClient.signTypedData({
    account: owner,
    domain,
    types,
    primaryType: 'Permit',
    message: {
      owner,
      spender,
      value,
      nonce,
      deadline: finalDeadline,
    },
  });

  // 5. Split Signature
  // signature is a hex string, we need to split it into r, s, v
  const signature = parseSignature(signatureHex);

  return {
    r: signature.r,
    s: signature.s,
    v: Number(signature.v),
    deadline: finalDeadline,
  };
}

function parseSignature(signature: `0x${string}`) {
  const r = signature.slice(0, 66) as `0x${string}`;
  const s = ('0x' + signature.slice(66, 130)) as `0x${string}`;
  const v = BigInt('0x' + signature.slice(130, 132));
  return { r, s, v };
}
