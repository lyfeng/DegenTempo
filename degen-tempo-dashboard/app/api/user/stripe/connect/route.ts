import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export async function POST(request: Request) {
  let fid: string | undefined;

  try {
    const body = await request.json();
    fid = body.fid;
    console.log("Stripe Connect API called with FID:", fid);

    if (!fid) {
      console.error("FID missing in request body");
      return NextResponse.json({ error: 'FID is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { fid: String(fid) },
    });
    console.log("User found:", user ? user.id : "Not found");

    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let accountId = user.stripeAccountId;

    // 1. Create a Stripe Account if not exists
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      accountId = account.id;

      // Save to DB
      await prisma.user.update({
        where: { fid: String(fid) },
        data: { 
          stripeAccountId: accountId,
          updatedAt: new Date()
        },
      });
    }

    // 2. Create an Account Link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/`,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?stripe_connect=success`,
      type: 'account_onboarding',
    });

    return NextResponse.json({ 
      success: true, 
      url: accountLink.url 
    });
  } catch (error: any) {
    console.error('Stripe connect error:', error);
    
    return NextResponse.json({ 
        error: error.message || 'Internal Server Error',
        details: error.type 
    }, { status: 500 });
  }
}
