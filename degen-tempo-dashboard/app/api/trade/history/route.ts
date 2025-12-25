import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { publicClient } from '@/lib/viem';
import { Hex } from 'viem';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fid = searchParams.get('fid');

  if (!fid) {
    return NextResponse.json({ error: 'FID is required' }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { fid: String(fid) },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const transactions = await prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    // Update status based on Real Chain Data
    const updatedTransactions = await Promise.all(transactions.map(async (tx: typeof transactions[0]) => {
        if ((tx.status === 'PENDING' || tx.status === 'INIT' || tx.status === 'BRIDGING') && tx.baseTxHash) {
            try {
                // Check on-chain status
                const receipt = await publicClient.getTransactionReceipt({ 
                    hash: tx.baseTxHash as Hex 
                });

                if (receipt.status === 'success') {
                    return await prisma.transaction.update({
                        where: { id: tx.id },
                        data: { status: 'COMPLETED' }
                    });
                } else if (receipt.status === 'reverted') {
                    return await prisma.transaction.update({
                        where: { id: tx.id },
                        data: { status: 'FAILED' }
                    });
                }
            } catch (e) {
                // Transaction might be pending or not found yet
                // console.log("Tx receipt not found yet for", tx.baseTxHash);
            }
        }
        return tx;
    }));

    return NextResponse.json(updatedTransactions);
  } catch (error) {
    console.error('History error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
