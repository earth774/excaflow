import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const { priceId } = await req.json();

    if (!priceId) {
      return NextResponse.json({ error: 'Price ID is required' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/?canceled=true`,
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (err: any) {
    console.error('Error creating checkout session:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
