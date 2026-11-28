import type { VehicleExtraction } from './geminiExtractor';
import type { EngineEvaluationResult } from './engineRules';

export interface CerfaAndLitigationPack {
  cessionAndRegistrationSteps: string[];
  registeredMailTemplate: string;
}

export interface FullVehicleReport {
  vehicleTitle: string;
  generatedAt: string;
  executiveSummary: string;
  negotiationAdvice: {
    suggestedDiscountIndep: number;
    suggestedDiscountDealer: number;
    argumentSummary: string;
  };
  inspectionChecklist: string[];
  sellerMessageScript: string;
  cerfaAndLitigationPack: CerfaAndLitigationPack;
  legalDisclaimers: {
    notAnExpertNotice: string;
    withdrawalWaiverText: string;
  };
}

export function buildFullReport(
  extraction: VehicleExtraction,
  evaluation: EngineEvaluationResult
): FullVehicleReport {
  const marque = extraction.marque ?? 'Véhicule';
  const modele = extraction.modele ?? '';
  const motor = extraction.motorisation_texte ?? 'Motorisation non précisée';
  const mec = extraction.annee_mec
    ? extraction.mois_mec
      ? `${String(extraction.mois_mec).padStart(2, '0')}/${extraction.annee_mec}`
      : `${extraction.annee_mec}`
    : 'Date inconnue';
  const kmText =
    typeof extraction.kilometrage_km === 'number'
      ? `${extraction.kilometrage_km.toLocaleString('fr-FR')} km`
      : 'Kilométrage non précisé';

  const vehicleTitle = `${marque} ${modele} — ${motor} (${mec}, ${kmText})`.trim();

  const executiveSummary =
    evaluation.verdict === 'RISQUE_ELEVE'
      ? `Dossier à fort niveau de vigilance (score ${evaluation.scoreRisque}/100). Des éléments techniques ou documentaires nécessitent une vérification stricte des preuves d’entretien et une marge de négociation avant tout engagement.`
      : evaluation.verdict === 'VIGILANCE'
        ? `Dossier nécessitant de la vigilance (score ${evaluation.scoreRisque}/100). Le véhicule présente des points à contrôler ou à chiffrer avant achat, particulièrement sur la remise à niveau estimée.`
        : `Dossier globalement favorable (score ${evaluation.scoreRisque}/100) sur les éléments analysés, sous réserve de vérifier les documents officiels et l’historique d’entretien.`;

  const suggestedDiscountIndep = evaluation.estimatedRepairCost.independant;
  const suggestedDiscountDealer = evaluation.estimatedRepairCost.concession;

  const argumentSummary =
    suggestedDiscountIndep > 0
      ? `Base de négociation suggérée : entre ${suggestedDiscountIndep} € (réseau indépendant) et ${suggestedDiscountDealer} € (réseau constructeur) de remise ou prise en charge avant achat pour la remise à niveau préventive identifiée (hors casse moteur/turbo), selon justificatifs fournis.`
      : `Aucun poste de réparation majeur chiffré automatiquement à ce stade ; base négociation sur l’état réel constaté lors de l’essai et l’historique des factures.`;

  const inspectionChecklist: string[] = [
    'Vérifier la concordance stricte entre le VIN / numéro de série sur le pare-brise ou châssis, la carte grise et le rapport Histovec.',
    'Demander l’intégralité des factures d’entretien datées et kilométrées (pièces et main-d’œuvre) ainsi que les procès-verbaux de contrôle technique.',
    'À froid (moteur non démarré avant votre arrivée), contrôler le niveau et l’aspect de l’huile (jauge) ainsi que l’absence de fumée ou bruit suspect au démarrage.',
    'Lors de l’essai routier : tester le freinage en ligne droite, l’absence de vibrations au volant, le passage des rapports et l’absence de voyant moteur/antipollution.',
  ];

  if (evaluation.matchedEngine?.id === 'psa_1_2_puretech_eb2') {
    inspectionChecklist.push(
      'Spécifique 1.2 PureTech : vérifier à froid le niveau d’huile exact, demander le carnet et les factures datées/kilométrées prouvant le respect de la périodicité d’entretien et de l’huile préconisée, ainsi que tout contrôle ou remplacement de courroie/crépine.'
    );
  }

  if (evaluation.mileageCheck.status === 'suspicious_low') {
    inspectionChecklist.push(
      'Cohérence kilométrique : croiser chaque relevé kilométrique avec les dates des contrôles techniques et factures d’entretien.'
    );
  }

  const questionsBlock =
    evaluation.sellerQuestions.length > 0
      ? evaluation.sellerQuestions.map((q) => `- ${q}`).join('\n')
      : '- Pouvez-vous me transmettre le rapport Histovec complet ainsi que le dernier contrôle technique ?\n- Avez-vous l’historique des factures d’entretien ?';

  const sellerMessageScript = `Bonjour, je suis intéressé par votre annonce (${vehicleTitle}). Avant de me déplacer, pourriez-vous me préciser :\n${questionsBlock}\nMerci d’avance pour votre retour.`;

  const cessionAndRegistrationSteps: string[] = [
    '1. Avant le paiement : exiger un certificat de non-gage / situation administrative récent et vérifier l’identité du vendeur sur la carte grise.',
    '2. Le jour de la vente : remplir ensemble le formulaire Cerfa n° 15776*02 (déclaration de cession) en deux exemplaires, barrer la carte grise avec la mention "Vendu le [date] à [heure]" et signer.',
    '3. Code de cession : demander au vendeur le code de cession remis après l’enregistrement de la cession (ou vérifier l’enregistrement sur France Titres / ANTS).',
    '4. Immatriculation : effectuer la demande de certificat d’immatriculation à votre nom dans un délai d’1 mois maximum avec justificatif d’identité, justificatif de domicile, assurance et contrôle technique valide.',
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

---
Note informative : Ce modèle est fourni à titre purement documentaire et ne constitue pas un conseil juridique personnalisé. En matière de vice caché, la charge de la preuve (constat, diagnostic ou expertise contradictoire) est déterminante ; rapprochez-vous de votre protection juridique ou d’un avocat avant envoi.`;

  return {
    vehicleTitle,
    generatedAt: new Date().toISOString(),
    executiveSummary,
    negotiationAdvice: {
      suggestedDiscountIndep,
      suggestedDiscountDealer,
      argumentSummary,
    },
    inspectionChecklist,
    sellerMessageScript,
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