import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { randomUUID } from 'crypto';

const FEE_RATE = 0.015;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fid, amount, userOpHash, outputAmount } = body;

    if (!fid || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { fid: String(fid) },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const inputAmount = parseFloat(amount);
    
    // In Aggregator Model, fee is taken on-chain by the Router contract.
    // Backend just records the "Expected" values for history display.
    const feeAmount = inputAmount * FEE_RATE;
    
    // Use provided output amount or default to 0
    const finalOutputAmount = outputAmount ? parseFloat(outputAmount) : 0; 

    const transaction = await prisma.transaction.create({
      data: {
        bizId: randomUUID(),
        userId: user.id,
        inputAmount: inputAmount,
        feeAmount: feeAmount,
        outputAmount: finalOutputAmount,
        status: 'PENDING',
        baseTxHash: userOpHash || null,
      },
    });

    return NextResponse.json(transaction);
  } catch (error) {
    console.error('Trade submit error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
