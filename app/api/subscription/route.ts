import { NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/supabaseServer';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUserFromRequest();

    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!dbUser) {
      return NextResponse.json({ isPro: false });
    }

    // User is Pro only if they have a Stripe price ID and their subscription period hasn't expired yet
    const isPro = 
      dbUser.stripePriceId && 
      dbUser.stripeCurrentPeriodEnd && 
      dbUser.stripeCurrentPeriodEnd.getTime() > Date.now();

    return NextResponse.json({
      isPro: !!isPro,
      stripeCustomerId: dbUser.stripeCustomerId,
      stripeSubscriptionId: dbUser.stripeSubscriptionId,
      stripeCurrentPeriodEnd: dbUser.stripeCurrentPeriodEnd,
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
