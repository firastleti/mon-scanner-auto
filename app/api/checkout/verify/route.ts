import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function GET(req: NextRequest) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secretKey) {
      return NextResponse.json(
        { error: 'STRIPE_SECRET_KEY non configurée.' },
        { status: 500 }
      );
    }

    const sessionId = req.nextUrl.searchParams.get('session_id')?.trim();
    if (!sessionId) {
      return NextResponse.json(
        { error: 'session_id manquant.' },
        { status: 400 }
      );
    }

    const stripe = new Stripe(secretKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const paid = session.payment_status === 'paid';
    const includeCerfaBump = session.metadata?.includeCerfaBump === 'true';

    return NextResponse.json({
      paid,
      includeCerfaBump,
      amountTotalCents: session.amount_total ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erreur lors de la vérification du paiement Stripe.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}