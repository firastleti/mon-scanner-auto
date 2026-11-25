import { NextRequest, NextResponse } from 'next/server';
import { createMagicToken, verifyMagicToken } from '@/lib/magicLink';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const vehicleHint =
      typeof body?.vehicleHint === 'string' ? body.vehicleHint.trim() : '';
    const notes = typeof body?.notes === 'string' ? body.notes.trim() : undefined;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Merci d’indiquer une adresse email valide.' },
        { status: 400 }
      );
    }

    if (!vehicleHint) {
      return NextResponse.json(
        { error: 'Merci d’indiquer le véhicule ou la référence de l’annonce.' },
        { status: 400 }
      );
    }

    const token = createMagicToken({
      email,
      vehicleHint,
      notes,
      createdAt: new Date().toISOString(),
    });

    const origin = req.nextUrl.origin;
    const magicUrl = `${origin}/?ml=${encodeURIComponent(token)}`;

    // En local / sans fournisseur email configuré : on retourne directement le lien de test
    // En production, tu pourras brancher ici Resend / Postmark avec `email` et `magicUrl`.
    return NextResponse.json({
      ok: true,
      email,
      magicUrl,
      emailPreview: {
        subject: `Ton dossier Scanner Auto : ${vehicleHint}`,
        body: `Dès que le vendeur t’envoie le rapport Histovec ou le Contrôle Technique, ouvre ton dossier ici : ${magicUrl}`,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erreur lors de la génération du Magic Link.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  const payload = verifyMagicToken(token);

  if (!payload) {
    return NextResponse.json(
      { error: 'Lien magique invalide ou corrompu.' },
      { status: 400 }
    );
  }

  return NextResponse.json({ payload });
}