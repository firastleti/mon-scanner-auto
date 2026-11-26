import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createMagicToken, verifyMagicToken } from '@/lib/magicLink';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const vehicleHint =
      typeof body?.vehicleHint === 'string' ? body.vehicleHint.trim() : '';
    const notes = typeof body?.notes === 'string' ? body.notes.trim() : undefined;
    const passUnlocked = Boolean(body?.passUnlocked);
    const includeCerfa = Boolean(body?.includeCerfa);

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
      passUnlocked,
      includeCerfa,
      createdAt: new Date().toISOString(),
    });

    const origin = req.nextUrl.origin;
    const magicUrl = `${origin}/?ml=${encodeURIComponent(token)}`;

    const subject = `Ton dossier Scanner Auto : ${vehicleHint}`;
    const textBody = `Dès que le vendeur t’envoie le rapport Histovec ou le Contrôle Technique, ouvre ton dossier ici : ${magicUrl}`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
        <h2 style="margin-bottom: 8px;">Scanner Auto — Lien de reprise de dossier</h2>
        <p>Véhicule visé : <strong>${escapeHtml(vehicleHint)}</strong></p>
        <p>Dès que le vendeur t’envoie le rapport Histovec ou le Contrôle Technique, clique sur le bouton ci-dessous pour rouvrir ton dossier pré-rempli :</p>
        <p style="margin: 20px 0;">
          <a href="${escapeHtml(magicUrl)}" style="background: #10b981; color: #020617; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-weight: bold;">
            Ouvrir mon dossier Scanner Auto
          </a>
        </p>
        <p style="font-size: 12px; color: #475569;">Si le bouton ne s’affiche pas, copie ce lien : ${escapeHtml(magicUrl)}</p>
      </div>
    `;

    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const fromAddress =
      process.env.MAGIC_LINK_FROM?.trim() || 'Scanner Auto <onboarding@resend.dev>';

    let emailSent = false;
    let emailError: string | null = null;

    if (resendApiKey) {
      const resend = new Resend(resendApiKey);
      const { error } = await resend.emails.send({
        from: fromAddress,
        to: [email],
        subject,
        html: htmlBody,
        text: textBody,
      });

      if (error) {
        emailError = error.message;
      } else {
        emailSent = true;
      }
    }

    return NextResponse.json({
      ok: true,
      email,
      magicUrl,
      emailSent,
      emailError,
      emailPreview: {
        subject,
        body: textBody,
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