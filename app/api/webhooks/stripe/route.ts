import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!secretKey || !webhookSecret) {
    return NextResponse.json(
      { error: 'Configuration Stripe webhook incomplète.' },
      { status: 500 }
    );
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json(
      { error: 'En-tête stripe-signature manquant.' },
      { status: 400 }
    );
  }

  try {
    const rawBody = await req.text();
    const stripe = new Stripe(secretKey);
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      // Ici tu pourras déclencher l'envoi email / journalisation de commande payée
      console.log('Paiement Stripe confirmé :', {
        sessionId: session.id,
        amountTotal: session.amount_total,
        includeCerfaBump: session.metadata?.includeCerfaBump === 'true',
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Signature webhook invalide.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}