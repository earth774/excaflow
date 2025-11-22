import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-11-17.clover' as any, // Cast to any to avoid strict type checking if types are slightly off
  typescript: true,
});
