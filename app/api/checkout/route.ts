import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const PASS_30J_CENTS = 1990; // 19,90 €
const CERFA_BUMP_CENTS = 990; // +9,90 €

export async function POST(req: NextRequest) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secretKey) {
      return NextResponse.json(
        {
          error:
            'STRIPE_SECRET_KEY non configurée dans .env.local. Ajoute ta clé test Stripe (sk_test_...) pour activer le paiement réel.',
        },
        { status: 500 }
      );
    }

    const body = await req.json();
    const includeCerfaBump = Boolean(body?.includeCerfaBump);
    const waiverAccepted = Boolean(body?.waiverAccepted);
    const vehicleTitle =
      typeof body?.vehicleTitle === 'string' && body.vehicleTitle.trim()
        ? body.vehicleTitle.trim()
        : 'Rapport Scanner Auto';

    if (!waiverAccepted) {
      return NextResponse.json(
        {
          error:
            'La renonciation expresse au droit de rétractation (Art. L. 221-28 13°) est obligatoire.',
        },
        { status: 400 }
      );
    }

    const stripe = new Stripe(secretKey);

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Pass 30 jours — Rapport complet & Négociation',
            description: `Analyse détaillée, check-list inspection & script vendeur (${vehicleTitle})`,
          },
          unit_amount: PASS_30J_CENTS,
        },
        quantity: 1,
      },
    ];

    if (includeCerfaBump) {
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Option — Pack démarches Cerfa & Recours RAR',
            description: 'Guide cession Cerfa 15776*02 + trame courrier recommandé',
          },
          unit_amount: CERFA_BUMP_CENTS,
        },
        quantity: 1,
      });
    }

    const origin = req.nextUrl.origin;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      metadata: {
        includeCerfaBump: includeCerfaBump ? 'true' : 'false',
        waiverAccepted: 'true',
      },
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}&cerfa=${
        includeCerfaBump ? '1' : '0'
      }`,
      cancel_url: `${origin}/?checkout=cancelled`,
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erreur lors de la création de la session Stripe.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}