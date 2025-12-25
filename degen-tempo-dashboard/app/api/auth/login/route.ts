import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fid, walletAddress } = body;

    if (!fid) {
      return NextResponse.json({ error: 'FID is required' }, { status: 400 });
    }

    const user = await prisma.user.upsert({
      where: { fid: String(fid) },
      update: { 
        walletAddress: walletAddress,
        updatedAt: new Date()
      },
      create: {
        fid: String(fid),
        walletAddress: walletAddress,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
