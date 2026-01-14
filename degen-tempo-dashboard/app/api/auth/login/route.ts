import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fid, walletAddress, eoaAddress } = body;

    if (!fid && !eoaAddress) {
      return NextResponse.json({ error: 'FID or EOA Address is required' }, { status: 400 });
    }

    let user;

    if (fid) {
      user = await prisma.user.upsert({
        where: { fid: String(fid) },
        update: { 
          walletAddress: walletAddress,
          eoaAddress: eoaAddress || undefined,
          updatedAt: new Date()
        },
        create: {
          fid: String(fid),
          walletAddress: walletAddress,
          eoaAddress: eoaAddress,
        },
      });
    } else {
      user = await prisma.user.upsert({
        where: { eoaAddress: String(eoaAddress) },
        update: { 
          walletAddress: walletAddress,
          updatedAt: new Date()
        },
        create: {
          eoaAddress: String(eoaAddress),
          walletAddress: walletAddress,
        },
      });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
