import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { getCurrentUserFromRequest } from '@/lib/supabaseServer';
import Stripe from 'stripe';

/**
 * Helper function to get current period end date
 * If subscription has current_period_end, use it
 * Otherwise, default to +1 month from now
 */
function getCurrentPeriodEnd(subscription: Stripe.Subscription | null): Date {
  if (subscription?.current_period_end) {
    return new Date(subscription.current_period_end * 1000);
  }
  // Default to +1 month from now if not provided
  const oneMonthFromNow = new Date();
  oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
  return oneMonthFromNow;
}

/**
 * Confirm checkout session and update user subscription
 * This is a fallback mechanism when webhook might not have fired yet
 * Called from the dashboard after successful checkout redirect
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUserFromRequest();

    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = await req.json();

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    console.log(`Confirming checkout session ${sessionId} for user ${user.id}`);

    // Retrieve the checkout session with subscription expanded
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription'],
      });
    } catch (error: any) {
      console.error('Error retrieving checkout session:', error);
      return NextResponse.json({ error: 'Failed to retrieve checkout session' }, { status: 400 });
    }

    // Verify the session belongs to this user
    const sessionUserId = session.metadata?.userId;
    const sessionCustomerId = typeof session.customer === 'string' 
      ? session.customer 
      : session.customer?.id;

    // Check if session belongs to current user
    let dbUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify ownership: session metadata userId should match, or customer should match
    if (sessionUserId && sessionUserId !== user.id) {
      console.error(`Session userId mismatch: ${sessionUserId} !== ${user.id}`);
      return NextResponse.json({ error: 'Session does not belong to this user' }, { status: 403 });
    }

    if (sessionCustomerId && dbUser.stripeCustomerId && sessionCustomerId !== dbUser.stripeCustomerId) {
      console.error(`Session customer mismatch: ${sessionCustomerId} !== ${dbUser.stripeCustomerId}`);
      return NextResponse.json({ error: 'Session does not belong to this user' }, { status: 403 });
    }

    // Check if session is completed
    if (session.payment_status !== 'paid') {
      return NextResponse.json({ 
        error: 'Session not paid yet', 
        payment_status: session.payment_status 
      }, { status: 400 });
    }

    // If session has a subscription, update user with subscription data
    if (session.subscription) {
      const subscriptionId = typeof session.subscription === 'string' 
        ? session.subscription 
        : session.subscription.id;

      console.log(`Retrieving subscription ${subscriptionId}`);

      let subscription: Stripe.Subscription;
      try {
        subscription = await stripe.subscriptions.retrieve(subscriptionId);
      } catch (error: any) {
        console.error('Error retrieving subscription:', error);
        return NextResponse.json({ error: 'Failed to retrieve subscription' }, { status: 400 });
      }

      console.log(`Updating user ${user.id} with subscription data`);

      // Update user with subscription information
      await prisma.user.update({
        where: { id: user.id },
        data: {
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: typeof subscription.customer === 'string' 
            ? subscription.customer 
            : subscription.customer.id,
          stripePriceId: subscription.items.data[0]?.price?.id || null,
          stripeCurrentPeriodEnd: getCurrentPeriodEnd(subscription),
        },
      });

      console.log(`Successfully confirmed session and updated user ${user.id}`);

      return NextResponse.json({ 
        success: true, 
        message: 'Session confirmed and subscription updated',
        subscriptionId: subscription.id,
      });
    } else {
      // Session completed but no subscription (shouldn't happen for subscription mode, but handle gracefully)
      console.warn(`Session ${sessionId} completed but has no subscription`);
      return NextResponse.json({ 
        success: false, 
        message: 'Session completed but no subscription found',
      }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Error confirming session:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

