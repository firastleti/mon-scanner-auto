import { NextRequest, NextResponse } from 'next/server';
import { evaluateVehicle } from '@/lib/engineRules';
import type { VehicleExtraction } from '@/lib/geminiExtractor';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const extraction = body?.extraction as VehicleExtraction | undefined;

    if (!extraction || typeof extraction !== 'object') {
      return NextResponse.json(
        { error: 'Objet extraction manquant ou invalide.' },
        { status: 400 }
      );
    }

    const evaluation = evaluateVehicle(extraction);
    return NextResponse.json({ evaluation });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Erreur lors de l’évaluation du véhicule.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}