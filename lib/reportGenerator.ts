import type { VehicleExtraction } from './geminiExtractor';
import type { EngineEvaluationResult } from './engineRules';

export type SellerMessageTone = 'courtois' | 'technique' | 'negotiation';

export interface CerfaAndLitigationPack {
  cessionAndRegistrationSteps: string[];
  registeredMailTemplate: string;
}

export interface FullVehicleReport {
  vehicleTitle: string;
  generatedAt: string;
  executiveSummary: string;
  listedPriceEur: number | null;
  truePurchaseCostIndep: number | null;
  truePurchaseCostDealer: number | null;
  negotiationAdvice: {
    suggestedDiscountIndep: number;
    suggestedDiscountDealer: number;
    argumentSummary: string;
    repairScopeDetail: string;
  };
  inspectionChecklist: string[];
  sellerMessages: Record<SellerMessageTone, string>;
  cerfaAndLitigationPack: CerfaAndLitigationPack;
  legalDisclaimers: {
    notAnExpertNotice: string;
    withdrawalWaiverText: string;
  };
}

function extractPriceFromText(rawText?: string): number | null {
  if (!rawText) return null;
  const matches = Array.from(
    rawText.matchAll(/(\d{1,3}(?:[\s\u00a0]\d{3})+|\d{4,6})\s*(?:€|eur\b)/gi)
  );
  for (const m of matches) {
    const cleaned = Number(m[1].replace(/[\s\u00a0]/g, ''));
    if (!Number.isNaN(cleaned) && cleaned >= 800 && cleaned <= 250000) {
      return cleaned;
    }
  }
  return null;
}

export function buildFullReport(
  extraction: VehicleExtraction,
  evaluation: EngineEvaluationResult,
  sourceNotes?: string
): FullVehicleReport {
  const marque = extraction.marque ?? 'Véhicule';
  const modele = extraction.modele ?? '';
  const motor = extraction.motorisation_texte ?? 'motorisation indiquée';
  const mec = extraction.annee_mec
    ? extraction.mois_mec
      ? `${String(extraction.mois_mec).padStart(2, '0')}/${extraction.annee_mec}`
      : `${extraction.annee_mec}`
    : 'année indiquée';
  const kmText =
    typeof extraction.kilometrage_km === 'number'
      ? `${extraction.kilometrage_km.toLocaleString('fr-FR')} km`
      : 'kilométrage indiqué';

  const vehicleTitle = `${marque} ${modele} — ${motor} (${mec}, ${kmText})`.trim();
  const shortVehicleLabel = `${marque} ${modele} (${mec}, ${kmText})`.trim();

  const listedPriceEur = extractPriceFromText(sourceNotes);
  const suggestedDiscountIndep = evaluation.estimatedRepairCost.independant;
  const suggestedDiscountDealer = evaluation.estimatedRepairCost.concession;

  const truePurchaseCostIndep =
    listedPriceEur !== null ? listedPriceEur + suggestedDiscountIndep : null;
  const truePurchaseCostDealer =
    listedPriceEur !== null ? listedPriceEur + suggestedDiscountDealer : null;

  const executiveSummary =
    evaluation.verdict === 'DONNEES_INCOMPLETES'
      ? `Données trop partielles pour poser un diagnostic fiable. Ajoutez la motorisation, la date de mise en circulation, le kilométrage ou un document (carte grise, contrôle technique, Histovec) pour affiner l’analyse.`
      : evaluation.verdict === 'RISQUE_ELEVE'
        ? `Dossier à fort niveau de vigilance (score ${evaluation.scoreRisque}/100). Des éléments techniques ou documentaires nécessitent une vérification stricte des preuves d’entretien et une marge de négociation avant tout engagement.`
        : evaluation.verdict === 'VIGILANCE'
          ? `Dossier nécessitant de la vigilance (score ${evaluation.scoreRisque}/100). Le véhicule présente des points à contrôler ou à chiffrer avant achat, particulièrement sur la remise à niveau estimée.`
          : `Dossier globalement favorable (score ${evaluation.scoreRisque}/100) sur les éléments analysés, sous réserve de vérifier les documents officiels et l’historique d’entretien.`;

  const repairScopeDetail =
    suggestedDiscountIndep > 0
      ? `L’estimation couvre la remise à niveau préventive (réseau indépendant : ${suggestedDiscountIndep.toLocaleString(
          'fr-FR'
        )} € ; concession : ${suggestedDiscountDealer.toLocaleString(
          'fr-FR'
        )} €). En cas d’encrassement avancé ou de casse moteur/turbo, les frais réels peuvent être nettement supérieurs.`
      : `Aucun poste de réparation majeur chiffré automatiquement à ce stade ; basez votre offre sur l’essai routier, l’état des consommables et l’historique des factures.`;

  const argumentSummary =
    suggestedDiscountIndep > 0
      ? `Visez une remise ou prise en charge entre ${suggestedDiscountIndep.toLocaleString(
          'fr-FR'
        )} € (indépendant) et ${suggestedDiscountDealer.toLocaleString(
          'fr-FR'
        )} € (concession) pour couvrir les travaux préventifs à venir et sécuriser votre budget.`
      : `Aucun poste de réparation majeur chiffré automatiquement à ce stade ; base négociation sur l’état réel constaté lors de l’essai et l’historique des factures.`;

  const inspectionChecklist: string[] = [
    'Vérifier la concordance stricte entre le VIN / numéro de série sur le pare-brise ou châssis, la carte grise et le rapport Histovec.',
    'Exiger l’intégralité des factures d’entretien datées et kilométrées (pièces et main-d’œuvre) ainsi que les procès-verbaux de contrôle technique.',
    'À froid (moteur non démarré avant votre arrivée), tirer la jauge pour contrôler le niveau et l’aspect de l’huile, et écouter le démarrage sans fumée ni claquement.',
    'Lors de l’essai routier : tester le freinage en ligne droite, l’absence de vibrations au volant, le passage des rapports et l’absence de voyant moteur/antipollution.',
  ];

  if (evaluation.matchedEngine?.id === 'psa_1_2_puretech_eb2') {
    inspectionChecklist.push(
      '1.2 PureTech : ouvrir le bouchon de remplissage d’huile et observer la courroie à la lampe du téléphone — si elle est craquelée, gonflée ou effilochée, passez votre chemin. Contrôlez aussi le niveau d’huile à froid et les factures datées/kilométrées (norme d’huile et périodicité).'
    );
  }

  if (evaluation.mileageCheck.status === 'suspicious_low') {
    inspectionChecklist.push(
      'Cohérence kilométrique : croiser chaque relevé kilométrique avec les dates des contrôles techniques et factures d’entretien.'
    );
  }

  const hasMileageReadings =
    Array.isArray(extraction.releves_kilometrage) && extraction.releves_kilometrage.length > 0;
  const hasUtacDefects =
    Array.isArray(extraction.defauts_utac) && extraction.defauts_utac.length > 0;

  const docRequests: string[] = [];
  if (!hasMileageReadings) {
    docRequests.push('le rapport Histovec complet');
  }
  if (!hasUtacDefects) {
    docRequests.push('le dernier contrôle technique');
  }
  docRequests.push('les factures d’entretien');

  const docsPhrase = docRequests.join(', ').replace(/, ([^,]*)$/, ' et $1');

  const courtois = `Bonjour, je suis intéressé par votre ${shortVehicleLabel}. Avant de me déplacer pour voir le véhicule, pourriez-vous me transmettre ${docsPhrase} ? Merci beaucoup pour votre retour.`;

  const technique = `Bonjour, au sujet de votre ${shortVehicleLabel}, pouvez-vous me confirmer l’historique d’entretien complet (dates, kilométrages et factures détaillées), me partager ${
    !hasMileageReadings ? 'le rapport Histovec ainsi que ' : ''
  }le dernier contrôle technique, et me préciser si des interventions ou défauts sont à prévoir à court terme ?`;

  const negotiation =
    suggestedDiscountIndep > 0
      ? `Bonjour, après étude du dossier de votre ${shortVehicleLabel}, j’anticipe environ ${suggestedDiscountIndep.toLocaleString(
          'fr-FR'
        )} € à ${suggestedDiscountDealer.toLocaleString(
          'fr-FR'
        )} € de frais d’entretien/remise à niveau à prévoir. Seriez-vous ouvert à une proposition autour de ${
          listedPriceEur !== null
            ? `${Math.max(500, listedPriceEur - suggestedDiscountIndep).toLocaleString('fr-FR')} €`
            : 'un prix ajusté'
        } si la transaction se conclut rapidement ?`
      : `Bonjour, après revue des éléments disponibles pour votre ${shortVehicleLabel}, je souhaite m’assurer de l’absence de frais proches sur l’entretien courant. Seriez-vous disponible pour un échange rapide afin d’affiner ensemble une offre ferme ?`;

  const cessionAndRegistrationSteps: string[] = [
    'Avant le paiement : exiger un certificat de non-gage / situation administrative récent et vérifier l’identité du vendeur sur la carte grise.',
    'Le jour de la vente : remplir ensemble le formulaire Cerfa n° 15776*02 (déclaration de cession) en deux exemplaires, barrer la carte grise avec la mention "Vendu le [date] à [heure]" et signer.',
    'Code de cession : demander au vendeur le code de cession remis après l’enregistrement de la cession (ou vérifier l’enregistrement sur France Titres / ANTS).',
    'Immatriculation : effectuer la demande de certificat d’immatriculation à votre nom dans un délai d’1 mois maximum avec justificatif d’identité, justificatif de domicile, assurance et contrôle technique valide.',
  ];

  const registeredMailTemplate = `Objet : Réclamation relative à l’achat du véhicule ${vehicleTitle} — Lettre recommandée avec avis de réception

Madame, Monsieur [Nom du vendeur],

En date du [Date d’achat], je me suis porté(e) acquéreur auprès de vous du véhicule ${vehicleTitle} (immatriculé [Numéro d’immatriculation] / VIN : [VIN le cas échéant]), au prix de [Prix d’achat] €.

À la suite de l’achat / des contrôles effectués, j’ai constaté la situation suivante : [Décrire précisément le problème constaté, les symptômes, la date d’apparition et le kilométrage actuel].

Ces éléments n’avaient pas été portés à ma connaissance de manière claire avant la transaction et affectent l’usage normal ou la valeur du véhicule (notamment au regard des dispositions des articles 1641 et suivants du Code civil relatives à la garantie des vices cachés, ou de l’obligation de délivrance conforme).

Je vous joins à ce courrier : [Lister les pièces jointes : copie de la carte grise, certificat de cession Cerfa, devis/facture de diagnostic ou réparation, photos/relevés].

En conséquence, je vous mets en demeure de me faire connaître sous un délai de [15 jours — adapter selon la situation] votre proposition amiable (prise en charge des réparations estimées à [Montant] €, réduction du prix ou résolution de la vente). À défaut de retour satisfaisant dans ce délai, je me réserve le droit de saisir mon assurance protection juridique et les juridictions compétentes.

Veuillez agréer, Madame, Monsieur, l’expression de mes salutations distinguées.

[Prénom Nom]
[Adresse postale]
[Téléphone / Email]
[Signature]

Note informative : Ce modèle est fourni à titre purement documentaire et ne constitue pas un conseil juridique personnalisé. En matière de vice caché, la charge de la preuve (constat, diagnostic ou expertise contradictoire) est déterminante ; rapprochez-vous de votre protection juridique ou d’un avocat avant envoi.`;

  return {
    vehicleTitle,
    generatedAt: new Date().toISOString(),
    executiveSummary,
    listedPriceEur,
    truePurchaseCostIndep,
    truePurchaseCostDealer,
    negotiationAdvice: {
      suggestedDiscountIndep,
      suggestedDiscountDealer,
      argumentSummary,
      repairScopeDetail,
    },
    inspectionChecklist,
    sellerMessages: {
      courtois,
      technique,
      negotiation,
    },
    cerfaAndLitigationPack: {
      cessionAndRegistrationSteps,
      registeredMailTemplate,
    },
    legalDisclaimers: {
      notAnExpertNotice:
        'Outil d’aide à la décision fondé sur l’analyse automatisée de données et documents fournis. Ne constitue en aucun cas une expertise automobile réglementée au sens de l’article L. 326-1 du Code de la route.',
      withdrawalWaiverText:
        'Je demande l’exécution immédiate de la prestation numérique et renonce expressément à mon droit de rétractation de 14 jours conformément à l’article L. 221-28 13° du Code de la consommation.',
    },
  };
}