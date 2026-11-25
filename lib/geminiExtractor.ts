import { GoogleGenAI, Type, Schema } from '@google/genai';

export type MaintenanceStatus =
  | 'fait_avec_facture'
  | 'fait_declare'
  | 'a_prevoir'
  | 'defaut_signale';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface MaintenanceMention {
  element:
    | 'distribution'
    | 'courroie'
    | 'chaine'
    | 'crepine'
    | 'adblue'
    | 'injecteur'
    | 'embrayage'
    | 'turbo'
    | 'autre';
  statut: MaintenanceStatus;
  detail?: string;
}

export interface UtacDefect {
  code?: string;
  libelle: string;
  gravite: 'mineure' | 'majeure' | 'critique';
}

export interface MileageReading {
  source: 'histovec' | 'ct' | 'annonce' | 'facture' | 'autre';
  date: string | null; // Format privilégié YYYY-MM-DD ou MM/YYYY
  km: number;
}

export interface VehicleExtraction {
  marque: string | null;
  modele: string | null;
  motorisation_texte: string | null;
  cnit: string | null;
  vin: string | null;
  mois_mec: number | null;
  annee_mec: number | null;
  kilometrage_km: number | null;
  norme_euro: string | null;
  releves_kilometrage: MileageReading[];
  entretien_mentions: MaintenanceMention[];
  defauts_utac: UtacDefect[];
  confidence: {
    motorisation: ConfidenceLevel;
    cnit: ConfidenceLevel;
    vin: ConfidenceLevel;
    date_mec: ConfidenceLevel;
    kilometrage: ConfidenceLevel;
  };
}

const extractionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    marque: { type: Type.STRING, nullable: true },
    modele: { type: Type.STRING, nullable: true },
    motorisation_texte: { type: Type.STRING, nullable: true },
    cnit: { type: Type.STRING, nullable: true },
    vin: { type: Type.STRING, nullable: true },
    mois_mec: { type: Type.INTEGER, nullable: true },
    annee_mec: { type: Type.INTEGER, nullable: true },
    kilometrage_km: { type: Type.INTEGER, nullable: true },
    norme_euro: { type: Type.STRING, nullable: true },
    releves_kilometrage: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          source: {
            type: Type.STRING,
            enum: ['histovec', 'ct', 'annonce', 'facture', 'autre'],
          },
          date: { type: Type.STRING, nullable: true },
          km: { type: Type.INTEGER },
        },
        required: ['source', 'km'],
      },
    },
    entretien_mentions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          element: {
            type: Type.STRING,
            enum: [
              'distribution',
              'courroie',
              'chaine',
              'crepine',
              'adblue',
              'injecteur',
              'embrayage',
              'turbo',
              'autre',
            ],
          },
          statut: {
            type: Type.STRING,
            enum: ['fait_avec_facture', 'fait_declare', 'a_prevoir', 'defaut_signale'],
          },
          detail: { type: Type.STRING, nullable: true },
        },
        required: ['element', 'statut'],
      },
    },
    defauts_utac: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          code: { type: Type.STRING, nullable: true },
          libelle: { type: Type.STRING },
          gravite: {
            type: Type.STRING,
            enum: ['mineure', 'majeure', 'critique'],
          },
        },
        required: ['libelle', 'gravite'],
      },
    },
    confidence: {
      type: Type.OBJECT,
      properties: {
        motorisation: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
        cnit: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
        vin: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
        date_mec: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
        kilometrage: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
      },
      required: ['motorisation', 'cnit', 'vin', 'date_mec', 'kilometrage'],
    },
  },
  required: ['releves_kilometrage', 'entretien_mentions', 'defauts_utac', 'confidence'],
};

const SYSTEM_INSTRUCTION = `Tu es un extracteur de données techniques automobiles strict et déterministe.
Extrais UNIQUEMENT ce qui est explicitement présent dans le document ou l'image fournie. N'invente jamais rien.

Règles critiques :
1. Entretien : ne marque "fait_avec_facture" que si une facture/remplacement effectif est prouvé ou explicitement facturé. Si l'annonce dit "distribution à prévoir" ou "courroie à faire", utilise "a_prevoir". Si un voyant ou une panne est signalée, utilise "defaut_signale".
2. Norme Euro : cherche la rubrique V.9 (carte grise / Histovec) ou toute mention explicite de norme Euro (ex. EURO5, EURO6). Sinon laisse null.
3. Date de première mise en circulation : sépare mois_mec (1-12) et annee_mec (4 chiffres).
4. Relevés kilométriques : extrais chaque relevé daté visible dans Histovec, les contrôles techniques ou les factures dans releves_kilometrage (date au format YYYY-MM-DD si possible).
5. Confiance : évalue honnêtement la lisibilité (confidence: high / medium / low) pour motorisation, cnit, vin, date_mec et kilometrage. Si un champ est absent ou illisible sur une photo floue, utilise "low".`;

export async function extractVehicleData(input: {
  imageDataUrl?: string;
  pdfText?: string;
  extraNotes?: string;
}): Promise<VehicleExtraction> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY manquante dans .env.local');
  }

  const ai = new GoogleGenAI({ apiKey });

  const contents: Array<string | { inlineData: { data: string; mimeType: string } }> = [];

  if (input.imageDataUrl) {
    const match = input.imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (match) {
      contents.push({
        inlineData: {
          mimeType: match[1],
          data: match[2],
        },
      });
    }
  }

  let promptText = 'Analyse ce document/visuel automobile et retourne le JSON structuré.';
  if (input.pdfText) {
    promptText += `\n\nTexte extrait du PDF :\n${input.pdfText.slice(0, 25000)}`;
  }
  if (input.extraNotes) {
    promptText += `\n\nTexte d'annonce ou notes utilisateur :\n${input.extraNotes.slice(0, 5000)}`;
  }

  contents.push(promptText);

  const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const fallbackModels = ['gemini-3.5-flash-lite', 'gemini-3.5-flash'].filter(
    (m) => m !== primaryModel
  );
  const modelsToTry = [primaryModel, ...fallbackModels];

  let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
  let lastError: unknown = null;

  for (const currentModel of modelsToTry) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await ai.models.generateContent({
          model: currentModel,
          contents,
          config: {
            temperature: 0.0,
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: extractionSchema,
          },
        });
        break;
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isOverloaded = msg.includes('503') || msg.includes('UNAVAILABLE');
        if (!isOverloaded || attempt === 1) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }
    if (response) break;
  }

  if (!response) {
    throw lastError instanceof Error
      ? lastError
      : new Error('Tous les modèles Gemini ont échoué.');
  }

  const rawText = response.text;
  if (!rawText) {
    throw new Error('Réponse vide de Gemini.');
  }

  return JSON.parse(rawText) as VehicleExtraction;
}