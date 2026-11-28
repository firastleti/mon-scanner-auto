'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { processUploadedFile, ProcessedUpload } from '@/lib/fileProcessor';
import type { VehicleExtraction } from '@/lib/geminiExtractor';
import type { EngineEvaluationResult, HingeStatus } from '@/lib/engineRules';
import {
  buildFullReport,
  FullVehicleReport,
  SellerMessageTone,
} from '@/lib/reportGenerator';

type ReportTab = 'diagnostic' | 'budget' | 'inspection' | 'achat';
type CheckStatus = 'pending' | 'ok' | 'defect' | 'verify';

const DEMO_SCENARIO: {
  label: string;
  notes: string;
  mockExtraction: VehicleExtraction;
} = {
  label: 'Exemple : Peugeot 208 1.2 PureTech (06/2019 — 88 000 km — 8 900 €)',
  notes: 'Peugeot 208 1.2 PureTech 06/2019, 88 000 km, 8 900 €, courroie à prévoir.',
  mockExtraction: {
    marque: 'Peugeot',
    modele: '208',
    motorisation_texte: '1.2 PureTech 110',
    cnit: null,
    vin: null,
    mois_mec: 6,
    annee_mec: 2019,
    kilometrage_km: 88000,
    norme_euro: 'EURO6',
    releves_kilometrage: [
      { source: 'ct', date: '2023-06-12', km: 62400 },
      { source: 'ct', date: '2025-06-10', km: 84100 },
    ],
    entretien_mentions: [
      {
        element: 'courroie',
        statut: 'a_prevoir',
        detail: 'Mentionné dans l’annonce',
      },
    ],
    defauts_utac: [],
    confidence: {
      motorisation: 'high',
      cnit: 'high',
      vin: 'high',
      date_mec: 'high',
      kilometrage: 'high',
    },
  },
};

function getHingeBadge(status: HingeStatus): { label: string; className: string } | null {
  if (status === 'critical_before_fix') {
    return {
      label: 'Alerte millésime à risque',
      className: 'bg-red-950 text-red-300 border-red-700',
    };
  }
  if (status === 'hinge_to_verify') {
    return {
      label: 'Millésime charnière — vérifier référence pièce',
      className: 'bg-amber-950 text-amber-300 border-amber-700',
    };
  }
  if (status === 'fixed_after_fix') {
    return {
      label: 'Version corrigée en usine',
      className: 'bg-emerald-950 text-emerald-300 border-emerald-700',
    };
  }
  return null;
}

function formatCritAirSource(rawSource: string): string {
  if (rawSource === 'norme_euro_v9') {
    return 'Selon la norme Euro inscrite sur le document';
  }
  if (rawSource === 'estimation_annee') {
    return 'Estimation selon l’année de mise en circulation';
  }
  return 'Estimation indicative';
}

function formatVerdictLabel(verdict: EngineEvaluationResult['verdict']): string {
  if (verdict === 'DONNEES_INCOMPLETES') return 'Données incomplètes';
  if (verdict === 'RISQUE_ELEVE') return 'Risque élevé';
  if (verdict === 'VIGILANCE') return 'Vigilance';
  return 'Favorable';
}

function formatFieldLabel(field: string): string {
  if (field === 'motorisation') return 'motorisation';
  if (field === 'date_mec') return 'date de mise en circulation';
  if (field === 'kilometrage') return 'kilométrage';
  if (field === 'cnit') return 'code CNIT';
  return field;
}

function slugifyFileName(value: string): string {
  const clean = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || 'vehicule';
}

export default function HomePage() {
  const [loadingFile, setLoadingFile] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessedUpload | null>(null);
  const [extraNotes, setExtraNotes] = useState('');
  const [extraction, setExtraction] = useState<VehicleExtraction | null>(null);
  const [evaluation, setEvaluation] = useState<EngineEvaluationResult | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isLocalHost, setIsLocalHost] = useState(false);
  const [showDebugJson, setShowDebugJson] = useState(false);
  const [showLbcGuide, setShowLbcGuide] = useState(false);

  const [manualMotor, setManualMotor] = useState('');
  const [manualYear, setManualYear] = useState('');
  const [manualMonth, setManualMonth] = useState('');
  const [manualKm, setManualKm] = useState('');

  const [includeCerfaBump, setIncludeCerfaBump] = useState(false);
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [restoredAccess, setRestoredAccess] = useState(false);
  const [activeTab, setActiveTab] = useState<ReportTab>('diagnostic');
  const [expandLetter, setExpandLetter] = useState(false);
  const [messageTone, setMessageTone] = useState<SellerMessageTone>('courtois');
  const [checklistStates, setChecklistStates] = useState<Record<number, CheckStatus>>({});
  const [fieldNote, setFieldNote] = useState('');
  const [copiedKey, setCopiedKey] = useState<'seller' | 'rar' | 'magic' | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const [hunterEmail, setHunterEmail] = useState('');
  const [hunterVehicle, setHunterVehicle] = useState('');
  const [loadingMagic, setLoadingMagic] = useState(false);
  const [magicUrl, setMagicUrl] = useState<string | null>(null);
  const [magicEmailSent, setMagicEmailSent] = useState(false);
  const [magicEmailError, setMagicEmailError] = useState<string | null>(null);
  const [restoredBanner, setRestoredBanner] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const local =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    setIsLocalHost(local);

    const params = new URLSearchParams(window.location.search);
    setShowDebugJson(local || params.get('debug') === '1');

    const mlToken = params.get('ml');
    if (mlToken) {
      fetch(`/api/magic-link?token=${encodeURIComponent(mlToken)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.payload) {
            const restoredText = data.payload.notes
              ? `${data.payload.vehicleHint} — ${data.payload.notes}`
              : data.payload.vehicleHint;
            setExtraNotes(restoredText);
            setHunterEmail(data.payload.email || '');
            setHunterVehicle(data.payload.vehicleHint || '');

            const hasPass = Boolean(data.payload.passUnlocked);
            if (hasPass) {
              setRestoredAccess(true);
              setIsUnlocked(true);
              setWaiverAccepted(true);
              if (typeof data.payload.includeCerfa === 'boolean') {
                setIncludeCerfaBump(data.payload.includeCerfa);
              }
            }

            setRestoredBanner(
              hasPass
                ? `Dossier et accès rapport débloqué repris via Magic Link pour ${data.payload.email} (${data.payload.vehicleHint}). Ajoute maintenant le PDF/photo du CT ou de l’Histovec.`
                : `Dossier repris via Magic Link pour ${data.payload.email} (${data.payload.vehicleHint}). Ajoute maintenant le PDF/photo du CT ou de l’Histovec.`
            );
          }
        })
        .catch(() => {});
    }
  }, []);

  const totalPrice = useMemo(() => {
    const base = 19.9;
    const bump = includeCerfaBump ? 9.9 : 0;
    return (base + bump).toFixed(2).replace('.', ',');
  }, [includeCerfaBump]);

  const fullReport: FullVehicleReport | null = useMemo(() => {
    if (!extraction || !evaluation) return null;
    return buildFullReport(extraction, evaluation, extraNotes);
  }, [extraction, evaluation, extraNotes]);

  const visitStorageKey = useMemo(() => {
    if (!fullReport) return null;
    return `scanner_auto_visit_${fullReport.vehicleTitle}`;
  }, [fullReport]);

  useEffect(() => {
    if (!visitStorageKey || typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(visitStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          states?: Record<number, CheckStatus>;
          note?: string;
        };
        setChecklistStates(parsed.states ?? {});
        setFieldNote(parsed.note ?? '');
      } else {
        setChecklistStates({});
        setFieldNote('');
      }
    } catch {
      setChecklistStates({});
      setFieldNote('');
    }
  }, [visitStorageKey]);

  function saveVisitState(nextStates: Record<number, CheckStatus>, nextNote: string) {
    if (!visitStorageKey || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        visitStorageKey,
        JSON.stringify({ states: nextStates, note: nextNote })
      );
    } catch {
      // Ignore storage quota errors
    }
  }

  function updateCheckStatus(idx: number, status: CheckStatus) {
    setChecklistStates((prev) => {
      const nextStatus: CheckStatus = prev[idx] === status ? 'pending' : status;
      const next = { ...prev, [idx]: nextStatus };
      saveVisitState(next, fieldNote);
      return next;
    });
  }

  function handleFieldNoteChange(value: string) {
    setFieldNote(value);
    saveVisitState(checklistStates, value);
  }

  const checklistProgress = useMemo(() => {
    const total = fullReport?.inspectionChecklist.length ?? 0;
    if (total === 0) return { completed: 0, total: 0, percent: 0 };
    const completed = Object.values(checklistStates).filter((s) => s && s !== 'pending').length;
    return {
      completed,
      total,
      percent: Math.round((completed / total) * 100),
    };
  }, [fullReport, checklistStates]);

  const confidenceMeter = useMemo(() => {
    if (!evaluation) return null;
    if (evaluation.incompleteData) {
      return {
        percent: 15,
        label: 'Confiance : 15 % — Données incomplètes (ajoutez motorisation, année et km)',
        barClass: 'bg-slate-500',
      };
    }
    if (isDemoMode) {
      return {
        percent: 65,
        label: 'Confiance : 65 % — Simulation d’exemple (Peugeot 208)',
        barClass: 'bg-indigo-400',
      };
    }
    if (!result) {
      return {
        percent: 35,
        label: 'Confiance : 35 % — Texte seul (ajoutez CT + Histovec pour atteindre 90 %+)',
        barClass: 'bg-amber-400',
      };
    }
    return {
      percent: 85,
      label: 'Confiance : 85 % — Document analysé (croisez avec Histovec & factures)',
      barClass: 'bg-emerald-400',
    };
  }, [evaluation, isDemoMode, result]);

  const targetPriceRange = useMemo(() => {
    if (!fullReport || fullReport.listedPriceEur === null) return null;
    const low = Math.max(
      500,
      fullReport.listedPriceEur - fullReport.negotiationAdvice.suggestedDiscountDealer
    );
    const high = Math.max(
      500,
      fullReport.listedPriceEur - fullReport.negotiationAdvice.suggestedDiscountIndep
    );
    return { low, high };
  }, [fullReport]);

  const documentCrossChecks = useMemo(() => {
    if (!extraction || !result) return [];
    const items: string[] = [];

    if (extraction.releves_kilometrage.length > 0) {
      const formattedReadings = extraction.releves_kilometrage
        .map((r) => `${r.km.toLocaleString('fr-FR')} km (${r.source}${r.date ? `, ${r.date}` : ''})`)
        .join(' → ');
      items.push(`Relevés kilométriques détectés : ${formattedReadings}.`);
    }

    if (extraction.defauts_utac.length > 0) {
      const defectLabels = extraction.defauts_utac
        .slice(0, 3)
        .map((d) => `${d.libelle} (${d.gravite})`)
        .join(' ; ');
      items.push(`Contrôle technique : ${defectLabels}.`);
    }

    if (extraction.vin || extraction.cnit || extraction.norme_euro) {
      const metaParts = [
        extraction.vin ? `VIN : ${extraction.vin}` : null,
        extraction.cnit ? `CNIT : ${extraction.cnit}` : null,
        extraction.norme_euro ? `Norme : ${extraction.norme_euro}` : null,
      ].filter(Boolean);
      items.push(`Identification documentaire : ${metaParts.join(' • ')}.`);
    }

    if (items.length === 0) {
      items.push(
        `Document ${result.fileName} pris en compte : vérifiez que le rapport Histovec complet et le contrôle technique sont joints pour croiser l’historique et le kilométrage.`
      );
    }

    return items;
  }, [extraction, result]);

  function syncManualInputs(ext: VehicleExtraction) {
    setManualMotor(ext.motorisation_texte ?? '');
    setManualYear(ext.annee_mec ? String(ext.annee_mec) : '');
    setManualMonth(ext.mois_mec ? String(ext.mois_mec) : '');
    setManualKm(typeof ext.kilometrage_km === 'number' ? String(ext.kilometrage_km) : '');
  }

  function resetAnalysisStates() {
    setError(null);
    setExtraction(null);
    setEvaluation(null);
    setIsDemoMode(false);
    setExpandLetter(false);
    setActiveTab('diagnostic');
    setShareFeedback(null);
    if (!restoredAccess) {
      setIsUnlocked(false);
    }
    setCopiedKey(null);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    resetAnalysisStates();
    setResult(null);
    setLoadingFile(true);

    try {
      const processed = await processUploadedFile(file);
      setResult(processed);
    } catch (err) {
      const message =
        err instanceof Error
          ? `${err.message} Si le document est partiel ou flou, ajoutez le texte de l’annonce ou une photo plus nette.`
          : 'Erreur lors du traitement du fichier. Ajoutez le texte de l’annonce ou une photo plus nette.';
      setError(message);
    } finally {
      setLoadingFile(false);
    }
  }

  async function runEvaluationOnExtraction(extractedVehicle: VehicleExtraction) {
    const evalRes = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extraction: extractedVehicle }),
    });

    const rawEvalText = await evalRes.text();
    const evalData = rawEvalText ? JSON.parse(rawEvalText) : {};
    if (!evalRes.ok) {
      throw new Error(
        evalData.error || `Erreur /api/evaluate (HTTP ${evalRes.status})`
      );
    }

    setEvaluation(evalData.evaluation);
  }

  async function handleAnalyze() {
    resetAnalysisStates();
    setLoadingAi(true);

    try {
      const extractRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl: result?.kind === 'image' ? result.imageDataUrl : undefined,
          pdfText: result?.kind === 'pdf' ? result.pdfText : undefined,
          extraNotes: extraNotes.trim() || undefined,
        }),
      });

      const rawExtractText = await extractRes.text();
      const extractData = rawExtractText ? JSON.parse(rawExtractText) : {};
      if (!extractRes.ok) {
        throw new Error(
          extractData.error || `Erreur /api/extract (HTTP ${extractRes.status})`
        );
      }

      const extractedVehicle: VehicleExtraction = extractData.extraction;
      setExtraction(extractedVehicle);
      syncManualInputs(extractedVehicle);
      await runEvaluationOnExtraction(extractedVehicle);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur réseau.';
      setError(message);
    } finally {
      setLoadingAi(false);
    }
  }

  async function handleApplyManualCorrection(e: React.FormEvent) {
    e.preventDefault();
    if (!extraction) return;

    setError(null);
    setLoadingAi(true);

    try {
      const updatedExtraction: VehicleExtraction = {
        ...extraction,
        motorisation_texte: manualMotor.trim() || extraction.motorisation_texte,
        annee_mec: manualYear ? Number(manualYear) : extraction.annee_mec,
        mois_mec: manualMonth ? Number(manualMonth) : extraction.mois_mec,
        kilometrage_km: manualKm ? Number(manualKm) : extraction.kilometrage_km,
        confidence: {
          ...extraction.confidence,
          motorisation: 'high',
          cnit: 'high',
          date_mec: 'high',
          kilometrage: 'high',
        },
      };

      setExtraction(updatedExtraction);
      await runEvaluationOnExtraction(updatedExtraction);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors du recalcul.';
      setError(message);
    } finally {
      setLoadingAi(false);
    }
  }

  async function handleRunDemo() {
    resetAnalysisStates();
    setResult(null);
    setIsDemoMode(true);
    setExtraNotes(DEMO_SCENARIO.notes);
    setLoadingAi(true);

    try {
      setExtraction(DEMO_SCENARIO.mockExtraction);
      syncManualInputs(DEMO_SCENARIO.mockExtraction);
      await runEvaluationOnExtraction(DEMO_SCENARIO.mockExtraction);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la démo.';
      setError(message);
    } finally {
      setLoadingAi(false);
    }
  }

  async function handleGenerateMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMagicUrl(null);
    setMagicEmailSent(false);
    setMagicEmailError(null);
    setLoadingMagic(true);

    try {
      const hint = hunterVehicle.trim() || extraNotes.trim();
      const res = await fetch('/api/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: hunterEmail.trim(),
          vehicleHint: hint,
          notes: extraNotes.trim() || undefined,
          passUnlocked: isUnlocked || restoredAccess,
          includeCerfa: includeCerfaBump,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Impossible de créer le Magic Link.');
      }

      setMagicUrl(data.magicUrl);
      setMagicEmailSent(Boolean(data.emailSent));
      setMagicEmailError(typeof data.emailError === 'string' ? data.emailError : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur réseau.';
      setError(message);
    } finally {
      setLoadingMagic(false);
    }
  }

  function handleLocalTestUnlock() {
    if (!waiverAccepted) {
      setError(
        'Merci de cocher la case de renonciation au droit de rétractation (Art. L. 221-28 13°) pour débloquer le rapport.'
      );
      return;
    }

    setError(null);
    setIsUnlocked(true);
    setActiveTab('diagnostic');
  }

  async function handleCopyText(text: string, key: 'seller' | 'rar' | 'magic') {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  async function handleShareReport() {
    if (!fullReport || !evaluation || typeof window === 'undefined') return;
    const summaryShare = `${fullReport.vehicleTitle} — Verdict : ${formatVerdictLabel(
      evaluation.verdict
    )} (${evaluation.scoreRisque}/100). ${fullReport.executiveSummary}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Scanner Auto — ${fullReport.vehicleTitle}`,
          text: summaryShare,
          url: window.location.href,
        });
        setShareFeedback('Partagé ✓');
        setTimeout(() => setShareFeedback(null), 2000);
        return;
      } catch {
        // Fallback to clipboard if user cancels or share fails
      }
    }

    await navigator.clipboard.writeText(summaryShare);
    setShareFeedback('Copié ✓');
    setTimeout(() => setShareFeedback(null), 2000);
  }

  function handlePrintReport() {
    if (typeof window === 'undefined') return;
    setExpandLetter(true);
    setTimeout(() => {
      window.print();
    }, 100);
  }

  function handleDownloadPdf() {
    if (!fullReport || !evaluation) return;

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const maxLineWidth = pageWidth - margin * 2;
    let y = 18;

    const addSectionTitle = (title: string) => {
      if (y > pageHeight - 25) {
        doc.addPage();
        y = 18;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(title, margin, y);
      y += 5.5;
    };

    const addParagraph = (text: string, fontSize = 9.5, isBold = false) => {
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');
      doc.setFontSize(fontSize);
      doc.setTextColor(30, 41, 59);
      const lines = doc.splitTextToSize(text, maxLineWidth) as string[];
      for (const line of lines) {
        if (y > pageHeight - 16) {
          doc.addPage();
          y = 18;
        }
        doc.text(line, margin, y);
        y += fontSize * 0.45;
      }
      y += 2.5;
    };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(6, 95, 70);
    doc.text('Scanner Auto — Dossier d’aide à l’achat', margin, y);
    y += 7;

    addParagraph(fullReport.vehicleTitle, 11, true);
    addParagraph(
      `Verdict : ${formatVerdictLabel(evaluation.verdict)} | Score de risque : ${
        evaluation.incompleteData ? 'À compléter' : `${evaluation.scoreRisque} / 100`
      } | Vignette : ${evaluation.critAir.vignette}`,
      9.5,
      true
    );

    addSectionTitle('1. Synthèse & Budget prévisionnel');
    addParagraph(fullReport.executiveSummary);
    addParagraph(
      `Travaux préventifs indicatifs : ${evaluation.estimatedRepairCost.independant.toLocaleString(
        'fr-FR'
      )} € (garagiste indépendant) à ${evaluation.estimatedRepairCost.concession.toLocaleString(
        'fr-FR'
      )} € (concession), hors casse moteur ou turbo.`
    );

    if (
      fullReport.listedPriceEur !== null &&
      fullReport.truePurchaseCostIndep !== null &&
      fullReport.truePurchaseCostDealer !== null &&
      targetPriceRange
    ) {
      addParagraph(
        `Coût réel estimé : ${fullReport.truePurchaseCostIndep.toLocaleString(
          'fr-FR'
        )} € à ${fullReport.truePurchaseCostDealer.toLocaleString(
          'fr-FR'
        )} € | Prix cible recommandé : ${targetPriceRange.low.toLocaleString(
          'fr-FR'
        )} € – ${targetPriceRange.high.toLocaleString('fr-FR')} €.`,
        9.5,
        true
      );
    }

    addSectionTitle('2. Stratégie de négociation');
    addParagraph(fullReport.negotiationAdvice.argumentSummary);

    if (evaluation.alerts.length > 0) {
      addSectionTitle('3. Points d’attention détectés');
      for (const alert of evaluation.alerts) {
        addParagraph(`• ${alert}`);
      }
    }

    addSectionTitle('4. Check-list terrain (à cocher devant le véhicule)');
    fullReport.inspectionChecklist.forEach((item, idx) => {
      const st = checklistStates[idx];
      const prefix =
        st === 'ok' ? '[OK] ' : st === 'defect' ? '[DÉFAUT] ' : st === 'verify' ? '[À VÉRIFIER] ' : '[  ] ';
      addParagraph(`${prefix}${item}`);
    });

    if (fieldNote.trim()) {
      addParagraph(`Notes de visite : ${fieldNote.trim()}`, 9, true);
    }

    addSectionTitle('5. Message vendeur sélectionné');
    addParagraph(fullReport.sellerMessages[messageTone]);

    if (includeCerfaBump) {
      addSectionTitle('6. Pack Achat Serein — Démarches & Modèle LRAR');
      for (let i = 0; i < fullReport.cerfaAndLitigationPack.cessionAndRegistrationSteps.length; i++) {
        addParagraph(
          `${i + 1}. ${fullReport.cerfaAndLitigationPack.cessionAndRegistrationSteps[i]}`
        );
      }
      y += 2;
      addParagraph(fullReport.cerfaAndLitigationPack.registeredMailTemplate, 8.8, false);
    }

    y += 2;
    addParagraph(fullReport.legalDisclaimers.notAnExpertNotice, 8, false);

    const modelSlug = slugifyFileName(
      `${extraction?.marque ?? ''} ${extraction?.modele ?? fullReport.vehicleTitle}`
    );
    doc.save(`rapport-${modelSlug}.pdf`);
  }

  const verdictBadgeClass =
    evaluation?.verdict === 'RISQUE_ELEVE'
      ? 'bg-red-950 text-red-300 border-red-700'
      : evaluation?.verdict === 'VIGILANCE'
        ? 'bg-amber-950 text-amber-300 border-amber-700'
        : evaluation?.verdict === 'DONNEES_INCOMPLETES'
          ? 'bg-slate-800 text-slate-300 border-slate-600'
          : 'bg-emerald-950 text-emerald-300 border-emerald-700';

  const gaugeBarClass =
    evaluation?.verdict === 'RISQUE_ELEVE'
      ? 'bg-red-500'
      : evaluation?.verdict === 'VIGILANCE'
        ? 'bg-amber-400'
        : 'bg-emerald-500';

  const hingeBadge = evaluation?.matchedEngine
    ? getHingeBadge(evaluation.matchedEngine.hingeStatus)
    : null;

  const unlockButtonLabel = isLocalHost
    ? `Débloquer le rapport complet (${totalPrice} € — mode test)`
    : `Débloquer le rapport complet — ${totalPrice} €`;

  const isLowRiskHealthy =
    evaluation &&
    !evaluation.incompleteData &&
    evaluation.verdict === 'FAVORABLE' &&
    evaluation.scoreRisque < 30;

  const roiAnchorText = !fullReport
    ? ''
    : isLowRiskHealthy
      ? `Véhicule globalement fiable, mais sécurisez les 5 points qui piègent 80 % des acheteurs (kilométrage réel, historique, papiers) pour ${totalPrice} €.`
      : fullReport.negotiationAdvice.suggestedDiscountDealer > 0
        ? `Investissez ${totalPrice} € pour sécuriser votre achat et économiser jusqu’à ${fullReport.negotiationAdvice.suggestedDiscountDealer.toLocaleString(
            'fr-FR'
          )} € en négociation.`
        : `Investissez ${totalPrice} € pour obtenir la check-list terrain, la stratégie de négociation et les messages vendeur prêts à l’envoi.`;

  const isPassActive = isUnlocked || restoredAccess;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 pb-28 flex flex-col items-center justify-center print:bg-white print:text-black print:p-0">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 space-y-5 print:border-none print:bg-white print:max-w-none print:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-xl font-bold">Scanner Auto</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Collez le texte d’une annonce (Leboncoin, La Centrale…) ou importez un document/photo pour estimer les risques.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunDemo}
            disabled={loadingFile || loadingAi}
            className="shrink-0 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 px-3.5 py-2 text-xs font-semibold text-emerald-300 transition cursor-pointer"
          >
            Exemple Démo 1-clic
          </button>
        </div>

        {restoredBanner && (
          <div className="rounded-xl bg-emerald-950/50 border border-emerald-700/60 p-3 text-xs text-emerald-200 print:hidden">
            {restoredBanner}
          </div>
        )}

        <label className="block cursor-pointer rounded-xl border border-dashed border-slate-600 hover:border-emerald-400 transition p-5 text-center print:hidden">
          <span className="text-sm font-medium text-emerald-400">
            Choisir un fichier (Image, HEIC, PDF)
          </span>
          <p className="text-xs text-slate-400 mt-1">
            Carte grise, rapport Histovec, contrôle technique ou photo
          </p>
          <p className="text-[11px] text-slate-500 mt-1.5">
            🔒 Confidentialité : vos documents sont traités instantanément et ne sont jamais conservés sur nos serveurs.
          </p>
          <input
            type="file"
            accept="image/*,.heic,.heif,application/pdf,.pdf"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>

        <div className="space-y-1.5 print:hidden">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-xs text-slate-400">
              Copiez-collez le texte de l’annonce ou vos notes (optionnel)
            </label>
            <button
              type="button"
              onClick={() => setShowLbcGuide((prev) => !prev)}
              className="text-[11px] text-emerald-400 hover:underline cursor-pointer shrink-0"
            >
              {showLbcGuide ? 'Masquer l’aide' : 'Comment importer depuis Leboncoin ?'}
            </button>
          </div>

          {showLbcGuide && (
            <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 text-xs text-slate-300 space-y-1">
              <p className="font-semibold text-emerald-300">2 façons rapides sur mobile :</p>
              <p>1. <strong>Capture d’écran :</strong> prenez une capture de l’annonce ou du CT et importez l’image ci-dessus.</p>
              <p>2. <strong>Copier-coller :</strong> sélectionnez le titre, le prix, le kilométrage et la description de l’annonce, puis collez ici.</p>
            </div>
          )}

          <textarea
            rows={3}
            value={extraNotes}
            onChange={(e) => setExtraNotes(e.target.value)}
            placeholder="Ex. Peugeot 208 1.2 PureTech 06/2019, 88 000 km, 8 900 €, courroie à prévoir..."
            className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3 text-sm text-slate-100 focus:outline-none focus:border-emerald-400"
          />
        </div>

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={loadingFile || loadingAi || (!result && !extraNotes.trim())}
          className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-semibold py-2.5 text-sm transition cursor-pointer print:hidden"
        >
          {loadingAi ? 'Analyse IA + Moteur en cours...' : 'Analyser le véhicule'}
        </button>

        {loadingFile && (
          <p className="text-sm text-amber-300">Traitement du fichier en cours...</p>
        )}

        {error && (
          <div className="rounded-lg bg-red-950/60 border border-red-700 p-3 text-sm text-red-200 break-words">
            {error}
          </div>
        )}

        {result && (
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-2 text-sm print:hidden">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">Fichier :</span>
              <span className="font-mono text-xs sm:text-sm truncate">
                {result.fileName} ({result.sizeKb} Ko)
              </span>
            </div>
            {result.kind === 'pdf' && (
              <p className="text-xs text-slate-400">
                PDF analysé : {result.pdfPageCount ?? 1} page(s)
              </p>
            )}
          </div>
        )}

        {evaluation && (
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-4 print:bg-white print:border-slate-300 print:text-black">
            {isDemoMode && (
              <div className="rounded-lg bg-indigo-950/50 border border-indigo-700/60 px-3 py-2 text-xs text-indigo-200 flex items-center justify-between print:hidden">
                <span>💡 Ceci est une simulation d’exemple (Peugeot 208 — 8 900 €).</span>
                <button
                  type="button"
                  onClick={() => {
                    resetAnalysisStates();
                    setExtraNotes('');
                  }}
                  className="underline hover:text-white ml-2 shrink-0 cursor-pointer"
                >
                  Effacer
                </button>
              </div>
            )}

            {/* SCORE + JAUGE DE RISQUE */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`px-3 py-1 rounded-full border text-xs font-bold ${verdictBadgeClass}`}
                >
                  {formatVerdictLabel(evaluation.verdict)}
                </span>
                <span className="text-sm font-mono text-slate-300 whitespace-nowrap print:text-black">
                  {evaluation.incompleteData ? (
                    <>
                      Score de risque : <strong>À compléter</strong>
                    </>
                  ) : (
                    <>
                      Score de risque : <strong>{evaluation.scoreRisque} / 100</strong>
                    </>
                  )}
                </span>
              </div>

              {!evaluation.incompleteData && (
                <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden print:bg-slate-200">
                  <div
                    className={`h-full transition-all duration-300 ${gaugeBarClass}`}
                    style={{ width: `${evaluation.scoreRisque}%` }}
                  />
                </div>
              )}
            </div>

            {/* JAUGE VISUELLE DE CONFIANCE DE L'ANALYSE */}
            {confidenceMeter && (
              <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 space-y-1.5 print:bg-slate-100 print:border-slate-300">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-300 print:text-black">{confidenceMeter.label}</span>
                  <span className="font-mono font-semibold text-slate-200 shrink-0 print:text-black">
                    {confidenceMeter.percent}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden print:bg-slate-200">
                  <div
                    className={`h-full transition-all duration-300 ${confidenceMeter.barClass}`}
                    style={{ width: `${confidenceMeter.percent}%` }}
                  />
                </div>
              </div>
            )}

            {evaluation.postOcrValidation.needsManualConfirmation && (
              <form
                onSubmit={handleApplyManualCorrection}
                className="rounded-xl bg-amber-950/40 border border-amber-600/60 p-4 space-y-3 print:hidden"
              >
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    Vérification manuelle recommandée (Garde-fou OCR)
                  </p>
                  {evaluation.postOcrValidation.anomalieDetail && (
                    <p className="text-xs text-red-200 mt-1">
                      {evaluation.postOcrValidation.anomalieDetail}
                    </p>
                  )}
                  {evaluation.postOcrValidation.lowConfidenceFields.length > 0 && (
                    <p className="text-xs text-amber-200 mt-1">
                      Champs à vérifier :{' '}
                      <strong>
                        {evaluation.postOcrValidation.lowConfidenceFields
                          .map(formatFieldLabel)
                          .join(', ')}
                      </strong>
                      . Confirme ou corrige les valeurs ci-dessous :
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={manualMotor}
                    onChange={(e) => setManualMotor(e.target.value)}
                    placeholder="Motorisation (ex. 1.2 PureTech 110)"
                    className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100"
                  />
                  <input
                    type="number"
                    value={manualKm}
                    onChange={(e) => setManualKm(e.target.value)}
                    placeholder="Kilométrage exact (km)"
                    className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100"
                  />
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={manualMonth}
                    onChange={(e) => setManualMonth(e.target.value)}
                    placeholder="Mois de mise en circulation (1-12)"
                    className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100"
                  />
                  <input
                    type="number"
                    min={1980}
                    max={2030}
                    value={manualYear}
                    onChange={(e) => setManualYear(e.target.value)}
                    placeholder="Année de mise en circulation (ex. 2019)"
                    className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loadingAi}
                  className="w-full rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold py-2 text-xs transition cursor-pointer"
                >
                  Recalculer avec mes valeurs vérifiées
                </button>
              </form>
            )}

            {/* VUE GRATUITE + PAYWALL (SI NON DÉBLOQUÉ) */}
            {!isUnlocked && fullReport && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-slate-900 p-3 border border-slate-800">
                    <p className="text-xs text-slate-400">Niveau de coût potentiel</p>
                    <p className="mt-1 font-semibold">{evaluation.costTierLabel}</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Montant détaillé (indépendant vs concession) inclus dans le rapport complet.
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-900 p-3 border border-slate-800">
                    <p className="text-xs text-slate-400">Vignette Crit’Air</p>
                    <p className="mt-1 font-semibold">{evaluation.critAir.vignette}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formatCritAirSource(evaluation.critAir.source)}
                    </p>
                  </div>
                </div>

                {evaluation.matchedEngine && (
                  <div className="rounded-lg bg-slate-900 p-3 border border-slate-800 text-xs space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-slate-400">Motorisation identifiée :</p>
                        <p className="font-semibold text-slate-100">
                          {evaluation.matchedEngine.label}
                        </p>
                      </div>
                      {hingeBadge && (
                        <span
                          className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${hingeBadge.className}`}
                        >
                          {hingeBadge.label}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {evaluation.alerts.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-amber-300">Points d’attention :</p>
                    <ul className="list-disc list-inside text-xs text-slate-200 space-y-1">
                      {evaluation.alerts.map((alert, idx) => (
                        <li key={idx}>{alert}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div
                  id="paywall-card"
                  className="rounded-xl bg-slate-900 border border-emerald-700/50 p-4 space-y-4 print:hidden"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-emerald-300">
                        Pass 30 jours — Rapport complet & Négociation
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Valable 30 jours (analyses multiples incluses). Montants détaillés, prix cible, check-list terrain et messages vendeur.
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-lg font-bold text-white whitespace-nowrap block">
                        {totalPrice} €
                      </span>
                      {includeCerfaBump && (
                        <span className="text-[11px] text-emerald-300 block">
                          19,90 € + 9,90 € = 29,80 €
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs font-medium text-emerald-200 bg-emerald-950/30 border border-emerald-800/40 rounded-lg px-3 py-2">
                    {roiAnchorText}
                  </p>

                  <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-3 space-y-2 relative overflow-hidden">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Aperçu du rapport complet :
                    </p>
                    <ul className="list-disc list-inside text-xs text-slate-200 space-y-1">
                      {fullReport.inspectionChecklist.slice(0, 2).map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                    <div className="text-xs text-slate-400 blur-[5px] select-none pt-1">
                      • Estimation détaillée indépendant / concession et calcul du prix cible recommandé...
                      <br />• 3 modèles de messages vendeur (courtois, technique, négociation) et check-list interactive sur place.
                    </div>
                  </div>

                  <label className="flex items-start gap-2.5 text-xs text-slate-200 bg-slate-950 p-3 rounded-lg border border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeCerfaBump}
                      onChange={(e) => setIncludeCerfaBump(e.target.checked)}
                      className="mt-0.5 accent-emerald-500 shrink-0"
                    />
                    <div className="space-y-1 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-amber-300">
                          Pack Achat Serein (+9,90 €) : Sécurité le jour J + Protection litige
                        </p>
                        {includeCerfaBump && (
                          <span className="text-[11px] font-semibold text-emerald-300">
                            Total : 29,80 €
                          </span>
                        )}
                      </div>
                      <ul className="list-disc list-inside text-[11px] text-slate-300 space-y-0.5">
                        <li><strong>Avant & jour de l’achat :</strong> Vérification des papiers, cession (Cerfa 15776*02) & ANTS.</li>
                        <li><strong>En cas de litige :</strong> Modèle de Lettre Recommandée (LRAR) pour vice caché.</li>
                      </ul>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={waiverAccepted}
                      onChange={(e) => setWaiverAccepted(e.target.checked)}
                      className="mt-0.5 accent-emerald-500 shrink-0"
                    />
                    <span>{fullReport.legalDisclaimers.withdrawalWaiverText}</span>
                  </label>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleLocalTestUnlock}
                      className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2.5 text-sm transition cursor-pointer"
                    >
                      {unlockButtonLabel}
                    </button>
                    <p className="text-[11px] text-center text-slate-400">
                      Paiement sécurisé Stripe / Apple Pay • Accès instantané • Sans abonnement (aucun renouvellement automatique)
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* RAPPORT DÉBLOQUÉ EN 4 ONGLETS CHRONOLOGIQUES */}
            {isUnlocked && fullReport && (
              <div className="rounded-xl bg-slate-900 border border-emerald-600/60 p-4 space-y-4 text-sm print:bg-white print:border-slate-300 print:text-black">
                {/* EN-TÊTE EMPILÉ EN PLEINE LARGEUR */}
                <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 print:border-slate-300">
                  <div className="w-full">
                    <p className="text-[11px] uppercase tracking-wider text-emerald-400 font-semibold print:text-black">
                      Pass 30 jours actif — Rapport complet
                      {includeCerfaBump ? ' & Pack Achat Serein' : ''}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5 print:text-slate-700">
                      Valable 30 jours • analyses multiples incluses • Expire dans 30 jours
                    </p>
                    <p className="text-base font-semibold mt-1.5 text-slate-100 print:text-black">
                      {fullReport.vehicleTitle}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 print:hidden">
                    <button
                      type="button"
                      onClick={handleShareReport}
                      className="text-xs px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-100 cursor-pointer"
                    >
                      {shareFeedback ?? 'Partager'}
                    </button>
                    <button
                      type="button"
                      onClick={handlePrintReport}
                      className="text-xs px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-100 cursor-pointer"
                    >
                      Imprimer
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadPdf}
                      className="text-xs px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-emerald-700/60 text-emerald-300 font-medium cursor-pointer"
                    >
                      Télécharger PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setResult(null);
                        setExtraNotes('');
                        resetAnalysisStates();
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 cursor-pointer"
                    >
                      + Analyser un autre véhicule
                    </button>
                  </div>
                </div>

                {/* BARRE DES 4 ONGLETS */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 print:hidden">
                  <button
                    type="button"
                    onClick={() => setActiveTab('diagnostic')}
                    className={`rounded-lg px-2.5 py-2 text-xs font-semibold border transition cursor-pointer ${
                      activeTab === 'diagnostic'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    1. Diagnostic
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('budget')}
                    className={`rounded-lg px-2.5 py-2 text-xs font-semibold border transition cursor-pointer ${
                      activeTab === 'budget'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    2. Budget & Négo
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('inspection')}
                    className={`rounded-lg px-2.5 py-2 text-xs font-semibold border transition cursor-pointer ${
                      activeTab === 'inspection'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    3. Terrain ({checklistProgress.completed}/{checklistProgress.total})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('achat')}
                    className={`rounded-lg px-2.5 py-2 text-xs font-semibold border transition cursor-pointer ${
                      activeTab === 'achat'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    4. Achat & LRAR
                  </button>
                </div>

                {/* ONGLET 1 : DIAGNOSTIC & RISQUES */}
                {activeTab === 'diagnostic' && (
                  <div className="space-y-4">
                    <p className="text-xs text-slate-300 print:text-black">
                      {fullReport.executiveSummary}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 print:bg-slate-100 print:border-slate-300">
                        <p className="text-xs text-slate-400 print:text-slate-700">
                          Travaux préventifs estimés
                        </p>
                        <p className="mt-1 font-semibold">
                          Indépendant : {evaluation.estimatedRepairCost.independant.toLocaleString('fr-FR')} €
                        </p>
                        <p className="text-xs text-slate-300 print:text-black">
                          Concession : {evaluation.estimatedRepairCost.concession.toLocaleString('fr-FR')} €
                        </p>
                      </div>

                      <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 print:bg-slate-100 print:border-slate-300">
                        <p className="text-xs text-slate-400 print:text-slate-700">Vignette Crit’Air</p>
                        <p className="mt-1 font-semibold">{evaluation.critAir.vignette}</p>
                        <p className="text-xs text-slate-400 mt-0.5 print:text-slate-700">
                          {formatCritAirSource(evaluation.critAir.source)}
                        </p>
                      </div>
                    </div>

                    {evaluation.matchedEngine && (
                      <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 text-xs space-y-2 print:bg-slate-100 print:border-slate-300">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-slate-400 print:text-slate-700">Motorisation identifiée :</p>
                            <p className="font-semibold text-slate-100 print:text-black">
                              {evaluation.matchedEngine.label}
                            </p>
                          </div>
                          {hingeBadge && (
                            <span
                              className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${hingeBadge.className}`}
                            >
                              {hingeBadge.label}
                            </span>
                          )}
                        </div>
                        {evaluation.matchedEngine.hingeNote && (
                          <p className="text-amber-300 print:text-amber-900">
                            {evaluation.matchedEngine.hingeNote}
                          </p>
                        )}
                      </div>
                    )}

                    {evaluation.mileageCheck.note && (
                      <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 text-xs print:bg-slate-100 print:border-slate-300">
                        <p className="text-slate-400 print:text-slate-700">Cohérence kilométrique :</p>
                        <p className="text-slate-200 mt-0.5 print:text-black">
                          {evaluation.mileageCheck.note}
                        </p>
                      </div>
                    )}

                    {documentCrossChecks.length > 0 && (
                      <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 text-xs space-y-1.5 print:bg-slate-100 print:border-slate-300">
                        <p className="font-semibold text-emerald-300 print:text-black">
                          Contrôles & recoupements sur le document analysé
                        </p>
                        <ul className="list-disc list-inside text-slate-200 space-y-1 print:text-black">
                          {documentCrossChecks.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {evaluation.alerts.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-amber-300 print:text-amber-900">
                          Points d’attention :
                        </p>
                        <ul className="list-disc list-inside text-xs text-slate-200 space-y-1 print:text-black">
                          {evaluation.alerts.map((alert, idx) => (
                            <li key={idx}>{alert}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* ONGLET 2 : BUDGET & NÉGOCIATION */}
                {activeTab === 'budget' && (
                  <div className="space-y-4">
                    {fullReport.listedPriceEur !== null &&
                      fullReport.truePurchaseCostIndep !== null &&
                      fullReport.truePurchaseCostDealer !== null &&
                      targetPriceRange && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="rounded-lg bg-slate-950 p-3 border border-amber-700/50 space-y-1 print:bg-slate-100 print:border-slate-300">
                            <p className="text-xs font-semibold text-amber-300 print:text-black">
                              Coût réel estimé
                            </p>
                            <p className="text-sm font-bold text-white print:text-black">
                              {fullReport.truePurchaseCostIndep.toLocaleString('fr-FR')} € –{' '}
                              {fullReport.truePurchaseCostDealer.toLocaleString('fr-FR')} €
                            </p>
                            <p className="text-[11px] text-slate-400 print:text-slate-700">
                              Prix affiché ({fullReport.listedPriceEur.toLocaleString('fr-FR')} €) + travaux préventifs.
                            </p>
                          </div>

                          <div className="rounded-lg bg-slate-950 p-3 border border-emerald-700/50 space-y-1 print:bg-slate-100 print:border-slate-300">
                            <p className="text-xs font-semibold text-emerald-300 print:text-black">
                              Prix cible recommandé
                            </p>
                            <p className="text-sm font-bold text-white print:text-black">
                              {targetPriceRange.low.toLocaleString('fr-FR')} € –{' '}
                              {targetPriceRange.high.toLocaleString('fr-FR')} €
                            </p>
                            <p className="text-[11px] text-slate-400 print:text-slate-700">
                              Prix affiché moins le budget travaux à déduire.
                            </p>
                          </div>
                        </div>
                      )}

                    <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 space-y-1 print:bg-slate-100 print:border-slate-300">
                      <p className="text-xs font-semibold text-emerald-400 print:text-black">
                        Stratégie de négociation
                      </p>
                      <p className="text-xs text-slate-200 print:text-black">
                        {fullReport.negotiationAdvice.argumentSummary}
                      </p>
                      <p className="text-[11px] text-slate-400 print:text-slate-700">
                        {fullReport.negotiationAdvice.repairScopeDetail}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-emerald-400 print:text-black">
                          Message prêt à envoyer au vendeur
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyText(fullReport.sellerMessages[messageTone], 'seller')
                          }
                          className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 cursor-pointer shrink-0 print:hidden"
                        >
                          {copiedKey === 'seller' ? 'Copié ✓' : 'Copier'}
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5 print:hidden">
                        <button
                          type="button"
                          onClick={() => setMessageTone('courtois')}
                          className={`text-xs px-2.5 py-1 rounded-lg border cursor-pointer ${
                            messageTone === 'courtois'
                              ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-semibold'
                              : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          Courtois & curieux
                        </button>
                        <button
                          type="button"
                          onClick={() => setMessageTone('technique')}
                          className={`text-xs px-2.5 py-1 rounded-lg border cursor-pointer ${
                            messageTone === 'technique'
                              ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-semibold'
                              : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          Factuel & technique
                        </button>
                        <button
                          type="button"
                          onClick={() => setMessageTone('negotiation')}
                          className={`text-xs px-2.5 py-1 rounded-lg border cursor-pointer ${
                            messageTone === 'negotiation'
                              ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-semibold'
                              : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          Négociation douce
                        </button>
                      </div>

                      <pre className="rounded-lg bg-slate-950 border border-slate-800 p-3 text-xs text-slate-200 whitespace-pre-wrap print:bg-slate-100 print:text-black print:border-slate-300">
                        {fullReport.sellerMessages[messageTone]}
                      </pre>
                    </div>
                  </div>
                )}

                {/* ONGLET 3 : INSPECTION TERRAIN (3 ÉTATS + PROGRESSION + NOTES) */}
                {activeTab === 'inspection' && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200 print:text-black">
                          Progression de la visite
                        </span>
                        <span className="font-mono text-emerald-300 print:text-black">
                          {checklistProgress.completed} / {checklistProgress.total} points vérifiés
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden print:bg-slate-200">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{ width: `${checklistProgress.percent}%` }}
                        />
                      </div>
                    </div>

                    <ul className="space-y-2.5 text-xs">
                      {fullReport.inspectionChecklist.map((item, idx) => {
                        const status = checklistStates[idx] ?? 'pending';
                        return (
                          <li
                            key={idx}
                            className="rounded-lg bg-slate-950 border border-slate-800 p-3 space-y-2 print:bg-slate-100 print:border-slate-300"
                          >
                            <p
                              className={
                                status === 'ok'
                                  ? 'text-slate-400 line-through print:text-black'
                                  : 'text-slate-200 print:text-black'
                              }
                            >
                              {item}
                            </p>
                            <div className="flex flex-wrap gap-1.5 print:hidden">
                              <button
                                type="button"
                                onClick={() => updateCheckStatus(idx, 'ok')}
                                className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold cursor-pointer ${
                                  status === 'ok'
                                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                                }`}
                              >
                                OK ✓
                              </button>
                              <button
                                type="button"
                                onClick={() => updateCheckStatus(idx, 'defect')}
                                className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold cursor-pointer ${
                                  status === 'defect'
                                    ? 'bg-red-500 text-slate-950 border-red-400'
                                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                                }`}
                              >
                                Défaut ✕
                              </button>
                              <button
                                type="button"
                                onClick={() => updateCheckStatus(idx, 'verify')}
                                className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold cursor-pointer ${
                                  status === 'verify'
                                    ? 'bg-amber-400 text-slate-950 border-amber-300'
                                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                                }`}
                              >
                                À vérifier ?
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-200 print:text-black">
                        Note rapide de visite (sauvegardée automatiquement sur ce téléphone)
                      </label>
                      <textarea
                        rows={3}
                        value={fieldNote}
                        onChange={(e) => handleFieldNoteChange(e.target.value)}
                        placeholder="Ex. Pneus avant à 40 %, petit bruit à froid, carnet complet jusqu'à 72 000 km..."
                        className="w-full rounded-lg bg-slate-950 border border-slate-800 p-3 text-xs text-slate-100 focus:outline-none focus:border-emerald-400 print:bg-slate-100 print:text-black print:border-slate-300"
                      />
                    </div>
                  </div>
                )}

                {/* ONGLET 4 : ACHAT & PROTECTION */}
                {activeTab === 'achat' && (
                  <div className="space-y-4">
                    {includeCerfaBump ? (
                      <div className="rounded-xl bg-slate-950 border border-amber-600/50 p-4 space-y-3 print:bg-white print:border-slate-300 print:text-black">
                        <p className="text-xs font-bold uppercase tracking-wider text-amber-300 print:text-black">
                          Pack Achat Serein & Lettre Recommandée (LRAR)
                        </p>

                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-slate-200 print:text-black">
                            1. Démarches cession (Cerfa 15776*02) & immatriculation
                          </p>
                          <ol className="list-decimal list-inside text-xs text-slate-300 space-y-1 print:text-black">
                            {fullReport.cerfaAndLitigationPack.cessionAndRegistrationSteps.map(
                              (step, idx) => (
                                <li key={idx}>{step}</li>
                              )
                            )}
                          </ol>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-slate-800 print:border-slate-300">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-amber-300 print:text-black">
                              2. Modèle de Lettre Recommandée (LRAR — Litige / Vice caché)
                            </p>
                            <div className="flex items-center gap-2 shrink-0 print:hidden">
                              <button
                                type="button"
                                onClick={() => setExpandLetter((prev) => !prev)}
                                className="text-xs px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer"
                              >
                                {expandLetter ? 'Réduire' : 'Afficher tout'}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopyText(
                                    fullReport.cerfaAndLitigationPack.registeredMailTemplate,
                                    'rar'
                                  )
                                }
                                className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 cursor-pointer"
                              >
                                {copiedKey === 'rar' ? 'Copié ✓' : 'Copier la lettre'}
                              </button>
                            </div>
                          </div>
                          <p className="text-[11px] text-amber-200/80 bg-amber-950/30 p-2 rounded border border-amber-800/40 print:bg-slate-100 print:text-black print:border-slate-300">
                            ⚠️ <strong>Information documentaire & preuves :</strong> Remplacez tous les champs entre crochets <code>[...]</code> et adaptez le délai à votre situation. En cas de litige (notamment vice caché), la réunion de preuves objectives (factures, diagnostic, expertise) est déterminante. Ce modèle ne remplace pas l’avis d’un avocat ou d’une protection juridique.
                          </p>
                          <pre
                            style={{ colorScheme: 'dark' }}
                            className={`rounded-lg bg-slate-900 border border-slate-800 p-3 text-xs text-slate-200 whitespace-pre-wrap break-words print:bg-slate-100 print:text-black print:border-slate-300 print:overflow-visible ${
                              expandLetter
                                ? 'overflow-visible'
                                : 'max-h-64 overflow-y-auto overflow-x-hidden'
                            }`}
                          >
                            {fullReport.cerfaAndLitigationPack.registeredMailTemplate}
                          </pre>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
                          Pack Achat Serein non inclus
                        </p>
                        <p className="text-xs text-slate-300">
                          Ajoutez le guide pas-à-pas cession (Cerfa 15776*02 / ANTS) et le modèle de Lettre Recommandée (LRAR) pour sécuriser la remise des clés et vous protéger en cas de vice caché.
                        </p>
                        <button
                          type="button"
                          onClick={() => setIncludeCerfaBump(true)}
                          className="rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold px-3.5 py-2 text-xs transition cursor-pointer"
                        >
                          Activer le Pack Achat Serein (+9,90 €)
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* CHASSEUR DE CT : UNIQUEMENT APRÈS UNE ANALYSE ET SI LE PASS N'EST PAS ACTIF */}
        {evaluation && !isPassActive && (
          <form
            onSubmit={handleGenerateMagicLink}
            className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3 print:hidden"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Chasseur de CT — Revenir quand le vendeur répond
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Pas encore le rapport Histovec ou le contrôle technique ? Recevez un lien par email pour relancer l’analyse dès que le vendeur vous les envoie.
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                🔒 Votre adresse e-mail et le rappel du véhicule servent uniquement à vous envoyer le lien de reprise et ne sont pas utilisés à d’autres fins.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="email"
                value={hunterEmail}
                onChange={(e) => setHunterEmail(e.target.value)}
                placeholder="ton.email@exemple.fr"
                className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-400"
              />
              <input
                type="text"
                value={hunterVehicle}
                onChange={(e) => setHunterVehicle(e.target.value)}
                placeholder="Véhicule visé (ex. Clio 4 0.9 TCe 2018)"
                className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-400"
              />
            </div>

            <button
              type="submit"
              disabled={loadingMagic}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 py-2 text-xs font-semibold text-emerald-300 transition cursor-pointer"
            >
              {loadingMagic ? 'Création du lien...' : 'Recevoir mon Magic Link de reprise'}
            </button>

            {magicUrl && (
              <div className="rounded-lg bg-slate-900 border border-emerald-700/50 p-3 space-y-2 text-xs">
                {magicEmailSent ? (
                  <p className="text-emerald-300 font-semibold">
                    Email envoyé à {hunterEmail} avec ton Magic Link.
                  </p>
                ) : (
                  <p className="text-emerald-300 font-semibold">Magic Link prêt :</p>
                )}
                {magicEmailError && (
                  <p className="text-amber-300">
                    Envoi email non effectué ({magicEmailError}). Tu peux utiliser le lien direct ci-dessous :
                  </p>
                )}
                <p className="font-mono break-all text-slate-200">{magicUrl}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyText(magicUrl, 'magic')}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 cursor-pointer"
                  >
                    {copiedKey === 'magic' ? 'Lien copié ✓' : 'Copier le lien'}
                  </button>
                  <a
                    href={magicUrl}
                    className="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold"
                  >
                    Tester l’ouverture du lien
                  </a>
                </div>
              </div>
            )}
          </form>
        )}

        {extraction && showDebugJson && (
          <details className="rounded-xl bg-slate-950 border border-slate-800 p-3 print:hidden">
            <summary className="text-xs font-semibold text-slate-400 cursor-pointer">
              Voir les données techniques extraites (JSON — mode debug)
            </summary>
            <pre
              style={{ colorScheme: 'dark' }}
              className="mt-2 max-h-72 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-200"
            >
              {JSON.stringify(extraction, null, 2)}
            </pre>
          </details>
        )}

        <footer className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 print:text-black print:border-slate-300">
          {fullReport?.legalDisclaimers.notAnExpertNotice ??
            'Outil d’aide à la décision basé sur l’analyse automatisée de données et documents fournis. Ne constitue pas une expertise automobile au sens de l’article L. 326-1 du Code de la route.'}
        </footer>
      </div>

      {/* BARRE STICKY MOBILE SI NON DÉBLOQUÉ */}
      {evaluation && !isUnlocked && fullReport && (
        <div className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-slate-950/95 border-t border-slate-800 px-4 py-2.5 flex items-center justify-between gap-3 print:hidden">
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400 truncate">Pass 30 jours</p>
            <p className="text-sm font-bold text-white">{totalPrice} €</p>
          </div>
          <a
            href="#paywall-card"
            className="shrink-0 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold px-4 py-2 text-xs transition"
          >
            Débloquer le rapport — {totalPrice} €
          </a>
        </div>
      )}

      {/* BARRE D'ACTIONS FLOTTANTE QUAND LE RAPPORT EST DÉBLOQUÉ */}
      {evaluation && isUnlocked && fullReport && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-slate-950/95 backdrop-blur border-t border-slate-800 px-4 py-2.5 print:hidden">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-100 truncate">
                {fullReport.vehicleTitle}
              </p>
              <p className="text-[11px] text-slate-400">
                Score : <strong>{evaluation.incompleteData ? 'À compléter' : `${evaluation.scoreRisque}/100`}</strong>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold px-3 py-1.5 text-xs transition cursor-pointer"
              >
                PDF
              </button>
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setExtraNotes('');
                  resetAnalysisStates();
                }}
                className="rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 font-semibold px-3 py-1.5 text-xs transition cursor-pointer"
              >
                + Autre
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}