import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';

/**
 * Helper function to get current period end date
 * If subscription has current_period_end, use it
 * Otherwise, default to +1 month from now
 */
function getCurrentPeriodEnd(subscription: Stripe.Subscription | null): Date {
  const sub = subscription as any;
  if (sub?.current_period_end) {
    return new Date(sub.current_period_end * 1000);
  }
  // Default to +1 month from now if not provided
  const oneMonthFromNow = new Date();
  oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
  return oneMonthFromNow;
}

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get('Stripe-Signature') as string;

  console.log('Webhook received');
  console.log('Signature present:', !!signature);
  console.log('Body length:', body.length);

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error: any) {
    console.error(`Webhook signature verification failed: ${error.message}`);
    return NextResponse.json({ error: `Webhook Error: ${error.message}` }, { status: 400 });
  }

  console.log(`Received webhook event: ${event.type}`);
  console.log(`Event ID: ${event.id}`);

  // Handle each event type separately with its own error handling
  // This prevents one failing event from breaking the entire handler

  if (event.type === 'checkout.session.completed') {
    try {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log(`Processing checkout.session.completed`);
      console.log(`Session ID: ${session.id}`);
      console.log(`Session metadata:`, session.metadata);
      console.log(`Session subscription: ${session.subscription}`);

      if (!session.subscription) {
        console.error('Webhook Error: No subscription found in checkout session', session.id);
        // Return 200 to prevent Stripe from retrying
        return NextResponse.json({ received: true, warning: 'No subscription in session' }, { status: 200 });
      }

      let subscription: Stripe.Subscription;
      try {
        subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        console.log(`Retrieved subscription ID: ${subscription.id}`);
        console.log(`Subscription customer: ${subscription.customer}`);
      } catch (subError: any) {
        console.error('Webhook Error: Failed to retrieve subscription', subError.message);
        return NextResponse.json({ received: true, warning: 'Failed to retrieve subscription' }, { status: 200 });
      }

      // Try to find user by metadata first
      let userId = session.metadata?.userId;
      let dbUser = null;

      if (userId) {
        console.log(`Looking up user by metadata userId: ${userId}`);
        dbUser = await prisma.user.findUnique({
          where: { id: userId },
        });
      }

      // Fallback: find user by customer ID if not found by metadata
      if (!dbUser && subscription.customer) {
        const customerId = typeof subscription.customer === 'string' 
          ? subscription.customer 
          : subscription.customer.id;
        console.log(`User not found by metadata, trying customer ID: ${customerId}`);
        dbUser = await prisma.user.findUnique({
          where: { stripeCustomerId: customerId },
        });
      }

      if (!dbUser) {
        console.error('Webhook Error: User not found for checkout session', {
          sessionId: session.id,
          metadataUserId: userId,
          customerId: subscription.customer,
        });
        return NextResponse.json({ received: true, warning: 'User not found' }, { status: 200 });
      }

      console.log(`Updating user ${dbUser.id} with subscription data`);
      await prisma.user.update({
        where: { id: dbUser.id },
        data: {
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: typeof subscription.customer === 'string' 
            ? subscription.customer 
            : subscription.customer.id,
          stripePriceId: subscription.items.data[0]?.price?.id || null,
          stripeCurrentPeriodEnd: getCurrentPeriodEnd(subscription),
        },
      });
      console.log(`Successfully updated user ${dbUser.id} subscription`);
    } catch (error: any) {
      console.error('Error processing checkout.session.completed:', error);
      // Return 200 to prevent infinite retries, but log the error
      return NextResponse.json({ received: true, error: error.message }, { status: 200 });
    }
  }

  if (event.type === 'invoice.payment_succeeded') {
    try {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = (invoice as any).subscription as string;
      
      if (!subscriptionId) {
        console.error('Webhook Error: No subscription ID in invoice', invoice.id);
        return NextResponse.json({ received: true, warning: 'No subscription in invoice' }, { status: 200 });
      }

      console.log(`Processing invoice.payment_succeeded for subscription: ${subscriptionId}`);
      let subscription: Stripe.Subscription;
      try {
        subscription = await stripe.subscriptions.retrieve(subscriptionId);
      } catch (subError: any) {
        console.error('Webhook Error: Failed to retrieve subscription', subError.message);
        return NextResponse.json({ received: true, warning: 'Failed to retrieve subscription' }, { status: 200 });
      }

      // 1. Try to find user by Subscription ID
      let user = await prisma.user.findUnique({
        where: { stripeSubscriptionId: subscription.id },
      });

      // 2. If not found, try to find by Customer ID (fallback)
      if (!user && subscription.customer) {
        const customerId = typeof subscription.customer === 'string' 
          ? subscription.customer 
          : subscription.customer.id;
        
        console.log(`User not found by subscription ID, trying customer ID: ${customerId}`);
        
        user = await prisma.user.findUnique({
          where: { stripeCustomerId: customerId },
        });
      }

      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
            stripePriceId: subscription.items.data[0]?.price?.id || null,
            stripeCurrentPeriodEnd: getCurrentPeriodEnd(subscription),
          },
        });
        console.log(`User subscription updated successfully via invoice.payment_succeeded for user ${user.id}`);
      } else {
        console.error(`User not found for subscription ID: ${subscription.id} or Customer ID`);
        return NextResponse.json({ received: true, warning: 'User not found' }, { status: 200 });
      }
    } catch (error: any) {
      console.error('Error processing invoice.payment_succeeded:', error);
      return NextResponse.json({ received: true, error: error.message }, { status: 200 });
    }
  }

  if (event.type === 'customer.subscription.updated') {
    try {
      const subscription = event.data.object as Stripe.Subscription;
      console.log(`Processing customer.subscription.updated for subscription: ${subscription.id}`);
      
      const user = await prisma.user.findUnique({
        where: { stripeSubscriptionId: subscription.id },
      });

      if (!user) {
        console.error(`User not found for subscription ID: ${subscription.id}`);
        return NextResponse.json({ received: true, warning: 'User not found' }, { status: 200 });
      }

      await prisma.user.update({
        where: { stripeSubscriptionId: subscription.id },
        data: {
          stripePriceId: subscription.items.data[0]?.price?.id || null,
          stripeCurrentPeriodEnd: getCurrentPeriodEnd(subscription),
        },
      });
      console.log(`Successfully updated subscription for user ${user.id}`);
    } catch (error: any) {
      console.error('Error processing customer.subscription.updated:', error);
      return NextResponse.json({ received: true, error: error.message }, { status: 200 });
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    try {
      const subscription = event.data.object as Stripe.Subscription;
      console.log(`Processing customer.subscription.deleted for subscription: ${subscription.id}`);
      
      const user = await prisma.user.findUnique({
        where: { stripeSubscriptionId: subscription.id },
      });

      if (!user) {
        console.error(`User not found for subscription ID: ${subscription.id}`);
        return NextResponse.json({ received: true, warning: 'User not found' }, { status: 200 });
      }

      await prisma.user.update({
        where: { stripeSubscriptionId: subscription.id },
        data: {
          stripeSubscriptionId: null,
          stripePriceId: null,
          stripeCurrentPeriodEnd: null,
        },
      });
      console.log(`Successfully deleted subscription for user ${user.id}`);
    } catch (error: any) {
      console.error('Error processing customer.subscription.deleted:', error);
      return NextResponse.json({ received: true, error: error.message }, { status: 200 });
    }
  }

  // Return success for unhandled event types (so Stripe doesn't retry)
  console.log(`Unhandled event type: ${event.type}`);
  return NextResponse.json({ received: true, message: `Event type ${event.type} not handled` }, { status: 200 });
}
