import { NextRequest, NextResponse } from 'next/server';
import { extractVehicleData } from '@/lib/geminiExtractor';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageDataUrl, pdfText, extraNotes } = body ?? {};

    if (!imageDataUrl && !pdfText && !extraNotes) {
      return NextResponse.json(
        { error: 'Aucune donnée à analyser (image, PDF ou texte requis).' },
        { status: 400 }
      );
    }

    const extraction = await extractVehicleData({
      imageDataUrl,
      pdfText,
      extraNotes,
    });

    return NextResponse.json({ extraction });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Erreur serveur lors de l’extraction.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}