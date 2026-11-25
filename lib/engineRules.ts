import type {
  MaintenanceMention,
  MileageReading,
  UtacDefect,
  VehicleExtraction,
} from './geminiExtractor';

export type OrganGroup =
  | 'distribution'
  | 'injection'
  | 'depollution'
  | 'transmission'
  | 'liaison_sol'
  | 'autre';

export type HingeStatus =
  | 'none'
  | 'critical_before_fix'
  | 'hinge_to_verify'
  | 'fixed_after_fix';

export interface MileageConsistencyResult {
  status: 'coherent' | 'suspicious_low' | 'high_mileage' | 'unknown';
  expectedAnnualKm: number | null;
  observedAnnualKm: number | null;
  note: string | null;
}

export interface PostOcrValidationResult {
  anomalieCompteurOuOcr: boolean;
  anomalieDetail: string | null;
  lowConfidenceFields: string[];
  cnitFallbackToManualEngine: boolean;
  needsManualConfirmation: boolean;
}

export interface EngineRule {
  id: string;
  label: string;
  organGroup: OrganGroup;
  matchKeywords: RegExp;
  excludeHybrid?: boolean;
  cnitPrefixes?: string[];
  fixYear: number;
  fixMonth: number;
  riskTitle: string;
  riskSummary: string;
  costIndep: number;
  costDealer: number;
  relatedElements: MaintenanceMention['element'][];
}

export interface EngineEvaluationResult {
  matchedEngine: {
    id: string;
    label: string;
    hingeStatus: HingeStatus;
    hingeNote: string | null;
  } | null;
  mileageCheck: MileageConsistencyResult;
  postOcrValidation: PostOcrValidationResult;
  scoreRisque: number;
  verdict: 'FAVORABLE' | 'VIGILANCE' | 'RISQUE_ELEVE';
  estimatedRepairCost: {
    independant: number;
    concession: number;
  };
  critAir: {
    vignette:
      | 'Crit’Air 0'
      | 'Crit’Air 1'
      | 'Crit’Air 2'
      | 'Crit’Air 3'
      | 'Crit’Air 4'
      | 'Crit’Air 5'
      | 'Non classé / Inconnu';
    source: 'norme_euro_v9' | 'estimation_annee' | 'inconnu';
  };
  alerts: string[];
  sellerQuestions: string[];
}

export const ENGINE_RULES: EngineRule[] = [
  {
    id: 'psa_1_2_puretech_eb2',
    label: '1.2 PureTech (EB2) — Courroie humide',
    organGroup: 'distribution',
    matchKeywords: /puretech|1\.2\s*eb2|110|130\s*ch/i,
    excludeHybrid: true,
    cnitPrefixes: ['M10PGTVP'],
    fixYear: 2023,
    fixMonth: 3,
    riskTitle: 'Dégradation courroie de distribution dans l’huile & encrassement crépine',
    riskSummary:
      'La courroie immergée peut se dégrader prématurément, boucher la crépine de pompe à huile et provoquer une casse moteur ou une baisse de pression d’huile.',
    costIndep: 950,
    costDealer: 1450,
    relatedElements: ['distribution', 'courroie', 'crepine'],
  },
  {
    id: 'psa_1_5_bluehdi_dv5',
    label: '1.5 BlueHDi (DV5) — Chaîne d’arbres à cames (7mm vs 8mm)',
    organGroup: 'distribution',
    matchKeywords: /bluehdi|1\.5\s*hdi|dv5|100\s*ch|130\s*ch\s*diesel/i,
    cnitPrefixes: ['M10PGTVD', 'M10PGTVL'],
    fixYear: 2023,
    fixMonth: 2,
    riskTitle: 'Usure prématurée de la chaîne d’arbres à cames (7 mm) / tendeur',
    riskSummary:
      'Sur les millésimes avant modification, la chaîne de liaison entre arbres à cames peut s’allonger ou casser, entraînant des dégâts culasse importants.',
    costIndep: 1150,
    costDealer: 1750,
    relatedElements: ['distribution', 'chaine'],
  },
  {
    id: 'psa_1_6_thp_ep6',
    label: '1.6 THP / PureTech 180+ (EP6) — Chaîne & encrassement',
    organGroup: 'distribution',
    matchKeywords: /\bthp\b|\bep6\b|1\.6\s*(thp|vti)/i,
    cnitPrefixes: ['M10PGTTH', 'M10PGTEP'],
    fixYear: 2016,
    fixMonth: 6,
    riskTitle: 'Allongement chaîne de distribution / tendeur & calamine admission',
    riskSummary:
      'Le tendeur de chaîne et l’encrassement de l’admission directe sont à surveiller particulièrement si l’entretien n’a pas été rapproché.',
    costIndep: 900,
    costDealer: 1400,
    relatedElements: ['distribution', 'chaine', 'turbo'],
  },
  {
    id: 'renault_1_2_tce_h5ft',
    label: '1.2 TCe (H5Ft) — Consommation d’huile & chaîne',
    organGroup: 'injection',
    matchKeywords: /1\.2\s*tce|h5ft|tce\s*(115|120|125|130)/i,
    cnitPrefixes: ['M10RNTCE', 'M10RNH5F'],
    fixYear: 2016,
    fixMonth: 7,
    riskTitle: 'Surconsommation d’huile moteur & usure chaîne de distribution',
    riskSummary:
      'Les blocs 1.2 TCe antérieurs à la fiabilisation nécessitent une vigilance accrue sur la consommation d’huile, les niveaux et la distribution.',
    costIndep: 1200,
    costDealer: 1850,
    relatedElements: ['chaine', 'turbo', 'autre'],
  },
  {
    id: 'renault_1_5_dci_k9k',
    label: '1.5 dCi (K9K) — Injection / coussinets / FAP',
    organGroup: 'injection',
    matchKeywords: /1\.5\s*dci|dci\s*(75|90|95|110|115)|k9k/i,
    cnitPrefixes: ['M10RNDCI', 'M10RNK9K'],
    fixYear: 2012,
    fixMonth: 1,
    riskTitle: 'Contrôle circuit d’injection, FAP et périodicité de distribution',
    riskSummary:
      'Vérifier la régularité des vidanges et le remplacement de la courroie de distribution selon l’âge et le kilométrage.',
    costIndep: 750,
    costDealer: 1150,
    relatedElements: ['courroie', 'distribution', 'injecteur'],
  },
  {
    id: 'vag_tdi_ea189_ea288',
    label: '1.6 / 2.0 TDI (EA189 / EA288) — EGR / FAP / Pompe à eau',
    organGroup: 'depollution',
    matchKeywords: /(1\.6|2\.0)\s*tdi|ea189|ea288/i,
    cnitPrefixes: ['M10VWTDI', 'M10VWEA2'],
    fixYear: 2016,
    fixMonth: 1,
    riskTitle: 'Encrassement vanne EGR / FAP et contrôle kit distribution + pompe à eau',
    riskSummary:
      'Sur les trajets courts ou urbains, la vanne EGR et le FAP peuvent s’encrasser ; vérifier également l’échéance distribution/pompe à eau.',
    costIndep: 800,
    costDealer: 1250,
    relatedElements: ['courroie', 'distribution', 'adblue'],
  },
  {
    id: 'adblue_scr_generic',
    label: 'Système antipollution SCR / AdBlue',
    organGroup: 'depollution',
    matchKeywords: /bluehdi|tdi|dci|hdi|diesel/i,
    fixYear: 2024,
    fixMonth: 12,
    riskTitle: 'Défaillance injecteur / réservoir / pompe AdBlue',
    riskSummary:
      'Les cristallisations d’urée ou pannes de module AdBlue peuvent entraîner un message d’anti-démarrage.',
    costIndep: 850,
    costDealer: 1350,
    relatedElements: ['adblue'],
  },
];

function isHybridText(text: string): boolean {
  return /\b(hybrid|mhev|phev|hybride|e-dcs6|136)\b/i.test(text);
}

function parseReadingDateToTimestamp(rawDate: string | null): number | null {
  if (!rawDate) return null;
  const trimmed = rawDate.trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const ts = Date.parse(trimmed);
    return Number.isNaN(ts) ? null : ts;
  }

  // YYYY-MM
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    const ts = Date.parse(`${trimmed}-01`);
    return Number.isNaN(ts) ? null : ts;
  }

  // DD/MM/YYYY
  const dmy = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy) {
    const ts = Date.parse(`${dmy[3]}-${dmy[2]}-${dmy[1]}`);
    return Number.isNaN(ts) ? null : ts;
  }

  // MM/YYYY
  const my = trimmed.match(/^(\d{2})\/(\d{4})$/);
  if (my) {
    const ts = Date.parse(`${my[2]}-${my[1]}-01`);
    return Number.isNaN(ts) ? null : ts;
  }

  // YYYY
  if (/^\d{4}$/.test(trimmed)) {
    const ts = Date.parse(`${trimmed}-06-01`);
    return Number.isNaN(ts) ? null : ts;
  }

  return null;
}

export function validatePostOcr(extraction: VehicleExtraction): PostOcrValidationResult {
  const readings: MileageReading[] = Array.isArray(extraction.releves_kilometrage)
    ? extraction.releves_kilometrage
    : [];

  const datedReadings = readings
    .map((r) => ({
      ...r,
      ts: parseReadingDateToTimestamp(r.date),
    }))
    .filter((r): r is MileageReading & { ts: number } => r.ts !== null && typeof r.km === 'number')
    .sort((a, b) => a.ts - b.ts);

  let anomalieCompteurOuOcr = false;
  let anomalieDetail: string | null = null;

  for (let i = 1; i < datedReadings.length; i++) {
    const prev = datedReadings[i - 1];
    const curr = datedReadings[i];
    if (curr.km < prev.km) {
      anomalieCompteurOuOcr = true;
      anomalieDetail = `ANOMALIE_COMPTEUR_OU_OCR : baisse de kilométrage détectée (${prev.km.toLocaleString(
        'fr-FR'
      )} km le ${prev.date} [${prev.source}] -> ${curr.km.toLocaleString(
        'fr-FR'
      )} km le ${curr.date} [${curr.source}]). Vérification visuelle indispensable.`;
      break;
    }
  }

  if (
    !anomalieCompteurOuOcr &&
    datedReadings.length > 0 &&
    typeof extraction.kilometrage_km === 'number'
  ) {
    const latest = datedReadings[datedReadings.length - 1];
    if (extraction.kilometrage_km < latest.km) {
      anomalieCompteurOuOcr = true;
      anomalieDetail = `ANOMALIE_COMPTEUR_OU_OCR : le kilométrage actuel déclaré (${extraction.kilometrage_km.toLocaleString(
        'fr-FR'
      )} km) est inférieur au relevé du ${latest.date} (${latest.km.toLocaleString(
        'fr-FR'
      )} km, ${latest.source}).`;
    }
  }

  const lowConfidenceFields: string[] = [];
  const conf = extraction.confidence;
  if (conf?.motorisation === 'low') lowConfidenceFields.push('motorisation');
  if (conf?.date_mec === 'low') lowConfidenceFields.push('date_mec');
  if (conf?.kilometrage === 'low') lowConfidenceFields.push('kilometrage');

  const cnitFallbackToManualEngine = Boolean(extraction.cnit && conf?.cnit === 'low');
  if (cnitFallbackToManualEngine) {
    lowConfidenceFields.push('cnit');
  }

  const needsManualConfirmation = anomalieCompteurOuOcr || lowConfidenceFields.length > 0;

  return {
    anomalieCompteurOuOcr,
    anomalieDetail,
    lowConfidenceFields,
    cnitFallbackToManualEngine,
    needsManualConfirmation,
  };
}

function evaluateHingeStatus(
  rule: EngineRule,
  anneeMec: number | null,
  moisMec: number | null
): { status: HingeStatus; note: string | null } {
  if (!anneeMec) {
    return { status: 'none', note: null };
  }

  if (anneeMec < rule.fixYear) {
    return { status: 'critical_before_fix', note: null };
  }

  if (anneeMec === rule.fixYear) {
    const month = moisMec ?? 6;
    if (month < rule.fixMonth) {
      return { status: 'critical_before_fix', note: null };
    }
    if (month <= Math.min(12, rule.fixMonth + 3)) {
      return {
        status: 'hinge_to_verify',
        note: `Millésime charnière (${month}/${anneeMec}) : vérifier le code moteur / la référence pièce sur facture ou certificat.`,
      };
    }
    return {
      status: 'fixed_after_fix',
      note: `Immatriculé après la période charnière (${month}/${anneeMec}) : version corrigée en usine (à confirmer sur facture).`,
    };
  }

  return { status: 'fixed_after_fix', note: null };
}

export function evaluateMileageConsistency(
  extraction: VehicleExtraction
): MileageConsistencyResult {
  const km = extraction.kilometrage_km;
  const year = extraction.annee_mec;

  if (typeof km !== 'number' || km <= 0 || !year) {
    return {
      status: 'unknown',
      expectedAnnualKm: null,
      observedAnnualKm: null,
      note: null,
    };
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const monthMec = extraction.mois_mec ?? 6;

  const ageMonths = Math.max(1, (currentYear - year) * 12 + (currentMonth - monthMec));
  const ageYears = ageMonths / 12;
  const observedAnnualKm = Math.round(km / ageYears);
  const expectedAnnualKm = 13500;

  if (ageYears >= 4 && observedAnnualKm < 4000) {
    return {
      status: 'suspicious_low',
      expectedAnnualKm,
      observedAnnualKm,
      note: `Kilométrage faible pour l’âge (${km.toLocaleString(
        'fr-FR'
      )} km sur ~${ageYears.toFixed(1)} ans, soit ~${observedAnnualKm.toLocaleString(
        'fr-FR'
      )} km/an) : vérifier la cohérence avec les rapports Histovec et CT.`,
    };
  }

  if (km >= 160000 || observedAnnualKm >= 28000) {
    return {
      status: 'high_mileage',
      expectedAnnualKm,
      observedAnnualKm,
      note: `Kilométrage élevé (${km.toLocaleString(
        'fr-FR'
      )} km, ~${observedAnnualKm.toLocaleString(
        'fr-FR'
      )} km/an) : anticiper l’usure des pièces d’usure (embrayage, amortisseurs, freins, turbo/FAP).`,
    };
  }

  return {
    status: 'coherent',
    expectedAnnualKm,
    observedAnnualKm,
    note: null,
  };
}

function hasPositiveMaintenanceProof(
  mentions: MaintenanceMention[],
  elements: MaintenanceMention['element'][]
): {
  hasInvoiceProof: boolean;
  hasDeclaredProof: boolean;
  hasToDo: boolean;
  hasDefect: boolean;
} {
  const relevant = mentions.filter((m) => elements.includes(m.element));
  return {
    hasInvoiceProof: relevant.some((m) => m.statut === 'fait_avec_facture'),
    hasDeclaredProof: relevant.some((m) => m.statut === 'fait_declare'),
    hasToDo: relevant.some((m) => m.statut === 'a_prevoir'),
    hasDefect: relevant.some((m) => m.statut === 'defaut_signale'),
  };
}

function mapUtacDefectToOrganAndCost(defect: UtacDefect): {
  organGroup: OrganGroup;
  costIndep: number;
  costDealer: number;
} {
  const txt = `${defect.code ?? ''} ${defect.libelle}`.toLowerCase();

  let organGroup: OrganGroup = 'autre';
  let baseIndep =
    defect.gravite === 'critique' ? 650 : defect.gravite === 'majeure' ? 350 : 120;
  let baseDealer =
    defect.gravite === 'critique' ? 950 : defect.gravite === 'majeure' ? 550 : 180;

  if (/courroie|distribution|cha[iî]ne|fuite.*huile|moteur/i.test(txt)) {
    organGroup = 'distribution';
    baseIndep = defect.gravite === 'mineure' ? 250 : 900;
    baseDealer = defect.gravite === 'mineure' ? 380 : 1350;
  } else if (/injecteur|carburant|admission|turbo/i.test(txt)) {
    organGroup = 'injection';
    baseIndep = defect.gravite === 'mineure' ? 220 : 750;
    baseDealer = defect.gravite === 'mineure' ? 350 : 1150;
  } else if (/échappement|echappement|opacité|fap|particule|adblue|nox/i.test(txt)) {
    organGroup = 'depollution';
    baseIndep = defect.gravite === 'mineure' ? 180 : 700;
    baseDealer = defect.gravite === 'mineure' ? 280 : 1100;
  } else if (/embrayage|bo[iî]te|transmission|cardan/i.test(txt)) {
    organGroup = 'transmission';
    baseIndep = defect.gravite === 'mineure' ? 200 : 800;
    baseDealer = defect.gravite === 'mineure' ? 320 : 1200;
  } else if (/frein|disque|plaquette|amortisseur|rotule|suspension|pneu/i.test(txt)) {
    organGroup = 'liaison_sol';
    baseIndep = defect.gravite === 'mineure' ? 150 : 450;
    baseDealer = defect.gravite === 'mineure' ? 240 : 680;
  }

  return { organGroup, costIndep: baseIndep, costDealer: baseDealer };
}

export function computeCritAir(
  extraction: VehicleExtraction
): EngineEvaluationResult['critAir'] {
  const motorText = `${extraction.motorisation_texte ?? ''} ${extraction.modele ?? ''}`.toLowerCase();
  const isDiesel = /diesel|hdi|bluehdi|tdi|dci|cdti|jtd|multijet|d-4d|skyactiv-d/i.test(
    motorText
  );
  const isElectricOrHydrogen =
    /\b(électrique|electrique|ev|100%\s*élec|hydrogène|hydrogene)\b/i.test(motorText);

  if (isElectricOrHydrogen) {
    return { vignette: 'Crit’Air 0', source: 'estimation_annee' };
  }

  if (extraction.norme_euro) {
    const euroMatch = extraction.norme_euro.match(/euro\s*([1-6])/i);
    if (euroMatch) {
      const euroNum = Number(euroMatch[1]);
      if (!isDiesel) {
        if (euroNum >= 5) return { vignette: 'Crit’Air 1', source: 'norme_euro_v9' };
        if (euroNum === 4) return { vignette: 'Crit’Air 2', source: 'norme_euro_v9' };
        if (euroNum === 2 || euroNum === 3) {
          return { vignette: 'Crit’Air 3', source: 'norme_euro_v9' };
        }
      } else {
        if (euroNum >= 5) return { vignette: 'Crit’Air 2', source: 'norme_euro_v9' };
        if (euroNum === 4) return { vignette: 'Crit’Air 3', source: 'norme_euro_v9' };
        if (euroNum === 3) return { vignette: 'Crit’Air 4', source: 'norme_euro_v9' };
        if (euroNum === 2) return { vignette: 'Crit’Air 5', source: 'norme_euro_v9' };
      }
    }
  }

  const year = extraction.annee_mec;
  if (!year) {
    return { vignette: 'Non classé / Inconnu', source: 'inconnu' };
  }

  if (!isDiesel) {
    if (year >= 2011) return { vignette: 'Crit’Air 1', source: 'estimation_annee' };
    if (year >= 2006) return { vignette: 'Crit’Air 2', source: 'estimation_annee' };
    if (year >= 1997) return { vignette: 'Crit’Air 3', source: 'estimation_annee' };
    return { vignette: 'Non classé / Inconnu', source: 'estimation_annee' };
  } else {
    if (year >= 2011) return { vignette: 'Crit’Air 2', source: 'estimation_annee' };
    if (year >= 2006) return { vignette: 'Crit’Air 3', source: 'estimation_annee' };
    if (year >= 2001) return { vignette: 'Crit’Air 4', source: 'estimation_annee' };
    if (year >= 1997) return { vignette: 'Crit’Air 5', source: 'estimation_annee' };
    return { vignette: 'Non classé / Inconnu', source: 'estimation_annee' };
  }
}

export function evaluateVehicle(extraction: VehicleExtraction): EngineEvaluationResult {
  const entretienMentions = Array.isArray(extraction.entretien_mentions)
    ? extraction.entretien_mentions
    : [];
  const defautsUtac = Array.isArray(extraction.defauts_utac) ? extraction.defauts_utac : [];

  const combinedEngineText = `${extraction.marque ?? ''} ${extraction.modele ?? ''} ${
    extraction.motorisation_texte ?? ''
  }`.trim();
  const cnitUpper = (extraction.cnit ?? '').toUpperCase();
  const hybridDetected = isHybridText(combinedEngineText);

  const alerts: string[] = [];
  const sellerQuestions: string[] = [];

  // Base 6 -> plancher à 10 / 100 pour un véhicule parfaitement sain
  let rawScore = 6;
  let matchedEngineResult: EngineEvaluationResult['matchedEngine'] = null;
  let intrinsicRisk: {
    organGroup: OrganGroup;
    costIndep: number;
    costDealer: number;
  } | null = null;

  // 1. Garde-fou Post-OCR (monotonie kilométrique + confiance)
  const postOcrValidation = validatePostOcr(extraction);
  if (postOcrValidation.anomalieCompteurOuOcr && postOcrValidation.anomalieDetail) {
    rawScore += 32;
    alerts.push(postOcrValidation.anomalieDetail);
    sellerQuestions.push(
      'Une incohérence chronologique de kilométrage apparaît dans les relevés : pouvez-vous fournir le rapport Histovec complet et l’explication ?'
    );
  }

  // 2. Cohérence kilométrique par rapport à l'âge
  const mileageCheck = evaluateMileageConsistency(extraction);
  if (mileageCheck.status === 'suspicious_low') {
    rawScore += 16;
    if (mileageCheck.note) alerts.push(mileageCheck.note);
    sellerQuestions.push(
      'Le kilométrage est faible par rapport à l’année du véhicule : pouvez-vous fournir l’historique complet des contrôles techniques et factures ?'
    );
  } else if (mileageCheck.status === 'high_mileage') {
    rawScore += 10;
    if (mileageCheck.note) alerts.push(mileageCheck.note);
  }

  // 3. Matrice Moteurs
  for (const rule of ENGINE_RULES) {
    if (rule.excludeHybrid && hybridDetected) {
      continue;
    }

    const matchesKeyword = combinedEngineText ? rule.matchKeywords.test(combinedEngineText) : false;
    const matchesCnit =
      !postOcrValidation.cnitFallbackToManualEngine && rule.cnitPrefixes
        ? rule.cnitPrefixes.some((prefix) => cnitUpper.startsWith(prefix))
        : false;

    if (matchesKeyword || matchesCnit) {
      const hinge = evaluateHingeStatus(rule, extraction.annee_mec, extraction.mois_mec);
      const proof = hasPositiveMaintenanceProof(entretienMentions, rule.relatedElements);

      matchedEngineResult = {
        id: rule.id,
        label: rule.label,
        hingeStatus: hinge.status,
        hingeNote: hinge.note,
      };

      if (hinge.note) {
        alerts.push(hinge.note);
      }

      if (proof.hasToDo || proof.hasDefect) {
        rawScore += 28;
        intrinsicRisk = {
          organGroup: rule.organGroup,
          costIndep: rule.costIndep,
          costDealer: rule.costDealer,
        };
        alerts.push(`${rule.label} : intervention ou défaut signalé (${rule.riskTitle}).`);
        sellerQuestions.push(
          `Pouvez-vous préciser l’historique et le devis/facture concernant : ${rule.label} ?`
        );
      } else if (proof.hasInvoiceProof) {
        rawScore += 4;
      } else if (proof.hasDeclaredProof) {
        rawScore += 14;
        intrinsicRisk = {
          organGroup: rule.organGroup,
          costIndep: Math.round(rule.costIndep * 0.5),
          costDealer: Math.round(rule.costDealer * 0.5),
        };
        sellerQuestions.push(
          `L’entretien lié à (${rule.label}) est mentionné : avez-vous la facture détaillée à transmettre ?`
        );
      } else if (hinge.status === 'critical_before_fix' || hinge.status === 'hinge_to_verify') {
        rawScore += 22;
        intrinsicRisk = {
          organGroup: rule.organGroup,
          costIndep: rule.costIndep,
          costDealer: rule.costDealer,
        };
        alerts.push(`${rule.riskTitle}.`);
        sellerQuestions.push(
          `Quel est l’historique d’entretien exact de ce moteur (${rule.label}) et y a-t-il des factures ?`
        );
      }

      break;
    }
  }

  // 4. Défauts UTAC avec déduplication de main-d'œuvre
  let totalIndep = intrinsicRisk ? intrinsicRisk.costIndep : 0;
  let totalDealer = intrinsicRisk ? intrinsicRisk.costDealer : 0;

  for (const defect of defautsUtac) {
    const mapped = mapUtacDefectToOrganAndCost(defect);
    const weight = defect.gravite === 'critique' ? 24 : defect.gravite === 'majeure' ? 14 : 5;
    rawScore += weight;

    if (defect.gravite !== 'mineure') {
      alerts.push(
        `Défaut CT (${defect.gravite}) : ${defect.libelle}${defect.code ? ` [${defect.code}]` : ''}.`
      );
    }

    if (intrinsicRisk && mapped.organGroup === intrinsicRisk.organGroup) {
      totalIndep =
        Math.max(totalIndep, mapped.costIndep) + Math.min(totalIndep, mapped.costIndep) * 0.2;
      totalDealer =
        Math.max(totalDealer, mapped.costDealer) + Math.min(totalDealer, mapped.costDealer) * 0.2;
    } else {
      totalIndep += mapped.costIndep;
      totalDealer += mapped.costDealer;
    }
  }

  // 5. Mentions d'entretien additionnelles
  for (const mention of entretienMentions) {
    if (mention.statut === 'defaut_signale') {
      rawScore += 18;
      alerts.push(
        `Défaut signalé sur l’élément : ${mention.element}${
          mention.detail ? ` (${mention.detail})` : ''
        }.`
      );
    } else if (mention.statut === 'a_prevoir') {
      rawScore += 10;
    }
  }

  // 6. Courbe asymptotique bornée entre 0 et 100
  const clampedRaw = Math.max(0, rawScore);
  const scoreRisque = Math.min(100, Math.round(100 * (1 - Math.exp(-clampedRaw / 55))));

  let verdict: EngineEvaluationResult['verdict'] = 'FAVORABLE';
  if (
    scoreRisque >= 60 ||
    postOcrValidation.anomalieCompteurOuOcr ||
    defautsUtac.some((d) => d.gravite === 'critique')
  ) {
    verdict = 'RISQUE_ELEVE';
  } else if (scoreRisque >= 30 || alerts.length > 0) {
    verdict = 'VIGILANCE';
  }

  return {
    matchedEngine: matchedEngineResult,
    mileageCheck,
    postOcrValidation,
    scoreRisque,
    verdict,
    estimatedRepairCost: {
      independant: Math.round(totalIndep / 10) * 10,
      concession: Math.round(totalDealer / 10) * 10,
    },
    critAir: computeCritAir(extraction),
    alerts,
    sellerQuestions,
  };
}