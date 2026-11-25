'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { processUploadedFile, ProcessedUpload } from '@/lib/fileProcessor';
import type { VehicleExtraction } from '@/lib/geminiExtractor';
import type { EngineEvaluationResult, HingeStatus } from '@/lib/engineRules';
import { buildFullReport, FullVehicleReport } from '@/lib/reportGenerator';

const DEMO_SCENARIO: {
  label: string;
  notes: string;
  mockExtraction: VehicleExtraction;
} = {
  label: 'Démo 1-clic : Peugeot 208 1.2 PureTech (06/2019 — 88 000 km)',
  notes: 'Peugeot 208 1.2 PureTech 06/2019, 88 000 km, courroie à prévoir, CT vierge.',
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

export default function HomePage() {
  const [loadingFile, setLoadingFile] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessedUpload | null>(null);
  const [extraNotes, setExtraNotes] = useState('');
  const [extraction, setExtraction] = useState<VehicleExtraction | null>(null);
  const [evaluation, setEvaluation] = useState<EngineEvaluationResult | null>(null);

  const [manualMotor, setManualMotor] = useState('');
  const [manualYear, setManualYear] = useState('');
  const [manualMonth, setManualMonth] = useState('');
  const [manualKm, setManualKm] = useState('');

  const [includeCerfaBump, setIncludeCerfaBump] = useState(false);
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [copiedKey, setCopiedKey] = useState<'seller' | 'rar' | 'magic' | null>(null);

  const [hunterEmail, setHunterEmail] = useState('');
  const [hunterVehicle, setHunterVehicle] = useState('');
  const [loadingMagic, setLoadingMagic] = useState(false);
  const [magicUrl, setMagicUrl] = useState<string | null>(null);
  const [magicEmailSent, setMagicEmailSent] = useState(false);
  const [magicEmailError, setMagicEmailError] = useState<string | null>(null);
  const [restoredBanner, setRestoredBanner] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);

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
            setRestoredBanner(
              `Dossier repris via Magic Link pour ${data.payload.email} (${data.payload.vehicleHint}). Ajoute maintenant le PDF/photo du CT ou de l’Histovec.`
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
    return buildFullReport(extraction, evaluation);
  }, [extraction, evaluation]);

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
    setIsUnlocked(false);
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
        err instanceof Error ? err.message : 'Erreur inconnue lors du traitement.';
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
  }

  async function handleCopyText(text: string, key: 'seller' | 'rar' | 'magic') {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  const verdictBadgeClass =
    evaluation?.verdict === 'RISQUE_ELEVE'
      ? 'bg-red-950 text-red-300 border-red-700'
      : evaluation?.verdict === 'VIGILANCE'
        ? 'bg-amber-950 text-amber-300 border-amber-700'
        : 'bg-emerald-950 text-emerald-300 border-emerald-700';

  const hingeBadge = evaluation?.matchedEngine
    ? getHingeBadge(evaluation.matchedEngine.hingeStatus)
    : null;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 flex flex-col items-center justify-center">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Scanner Auto</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Importe un document/photo ou colle une annonce pour estimer les risques et réparations.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunDemo}
            disabled={loadingFile || loadingAi}
            className="shrink-0 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 px-3.5 py-2 text-xs font-semibold text-emerald-300 transition cursor-pointer"
          >
            Démo 1-clic
          </button>
        </div>

        {restoredBanner && (
          <div className="rounded-xl bg-emerald-950/50 border border-emerald-700/60 p-3 text-xs text-emerald-200">
            {restoredBanner}
          </div>
        )}

        <label className="block cursor-pointer rounded-xl border border-dashed border-slate-600 hover:border-emerald-400 transition p-5 text-center">
          <span className="text-sm font-medium text-emerald-400">
            Choisir un fichier (Image, HEIC, PDF)
          </span>
          <p className="text-xs text-slate-400 mt-1">
            Carte grise, rapport Histovec, contrôle technique ou photo
          </p>
          <input
            type="file"
            accept="image/*,.heic,.heif,application/pdf,.pdf"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>

        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Texte d’annonce / notes (optionnel)
          </label>
          <textarea
            rows={3}
            value={extraNotes}
            onChange={(e) => setExtraNotes(e.target.value)}
            placeholder="Ex. Peugeot 208 1.2 PureTech 06/2019, 88 000 km, courroie à prévoir..."
            className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3 text-sm text-slate-100 focus:outline-none focus:border-emerald-400"
          />
        </div>

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={loadingFile || loadingAi || (!result && !extraNotes.trim())}
          className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-semibold py-2.5 text-sm transition cursor-pointer"
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
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-2 text-sm">
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
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className={`px-3 py-1 rounded-full border text-xs font-bold ${verdictBadgeClass}`}
              >
                {evaluation.verdict}
              </span>
              <span className="text-sm font-mono text-slate-300 whitespace-nowrap">
                Score de risque : <strong>{evaluation.scoreRisque} / 100</strong>
              </span>
            </div>

            {evaluation.postOcrValidation.needsManualConfirmation && (
              <form
                onSubmit={handleApplyManualCorrection}
                className="rounded-xl bg-amber-950/40 border border-amber-600/60 p-4 space-y-3"
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
                      Champs à lisibilité faible :{' '}
                      <strong>
                        {evaluation.postOcrValidation.lowConfidenceFields.join(', ')}
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
                    placeholder="Mois MEC (1-12)"
                    className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100"
                  />
                  <input
                    type="number"
                    min={1980}
                    max={2030}
                    value={manualYear}
                    onChange={(e) => setManualYear(e.target.value)}
                    placeholder="Année MEC (ex. 2019)"
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-slate-900 p-3 border border-slate-800">
                <p className="text-xs text-slate-400">Estimation réparations</p>
                <p className="mt-1 font-semibold">
                  Indépendant : {evaluation.estimatedRepairCost.independant} €
                </p>
                <p className="text-xs text-slate-300">
                  Concession : {evaluation.estimatedRepairCost.concession} €
                </p>
              </div>

              <div className="rounded-lg bg-slate-900 p-3 border border-slate-800">
                <p className="text-xs text-slate-400">Vignette Crit’Air</p>
                <p className="mt-1 font-semibold">{evaluation.critAir.vignette}</p>
                <p className="text-xs text-slate-400">Source : {evaluation.critAir.source}</p>
              </div>
            </div>

            {evaluation.matchedEngine && (
              <div className="rounded-lg bg-slate-900 p-3 border border-slate-800 text-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-slate-400">Motorisation identifiée :</p>
                    <p className="font-semibold text-slate-100">{evaluation.matchedEngine.label}</p>
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
                  <p className="text-amber-300">{evaluation.matchedEngine.hingeNote}</p>
                )}
              </div>
            )}

            {evaluation.mileageCheck.note && (
              <div className="rounded-lg bg-slate-900 p-3 border border-slate-800 text-xs">
                <p className="text-slate-400">Cohérence kilométrique :</p>
                <p className="text-slate-200 mt-0.5">{evaluation.mileageCheck.note}</p>
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

            {!isUnlocked && fullReport && (
              <div className="rounded-xl bg-slate-900 border border-emerald-700/50 p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-emerald-300">
                      Pass 30 jours — Rapport complet & Négociation
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Inclut la check-list d’inspection, la marge de négociation et le message vendeur prêt à envoyer.
                    </p>
                  </div>
                  <span className="text-lg font-bold text-white whitespace-nowrap shrink-0">
                    {totalPrice} €
                  </span>
                </div>

                <label className="flex items-start gap-2.5 text-xs text-slate-200 bg-slate-950 p-3 rounded-lg border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeCerfaBump}
                    onChange={(e) => setIncludeCerfaBump(e.target.checked)}
                    className="mt-0.5 accent-emerald-500 shrink-0"
                  />
                  <span>
                    <strong>Option (+9,90 €) :</strong> Pack démarches & recours (guide Cerfa + trame courrier recommandé RAR).
                  </span>
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

                <button
                  type="button"
                  onClick={handleLocalTestUnlock}
                  className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2.5 text-sm transition cursor-pointer"
                >
                  Débloquer le rapport complet ({totalPrice} € — mode test)
                </button>
              </div>
            )}

            {isUnlocked && fullReport && (
              <div className="rounded-xl bg-slate-900 border border-emerald-600/60 p-4 space-y-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
                    Rapport détaillé débloqué
                    {includeCerfaBump ? ' + Pack Cerfa / RAR' : ''}
                  </p>
                  <p className="font-semibold mt-1">{fullReport.vehicleTitle}</p>
                  <p className="text-xs text-slate-300 mt-1">{fullReport.executiveSummary}</p>
                </div>

                <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 space-y-1">
                  <p className="text-xs font-semibold text-emerald-400">Stratégie de négociation</p>
                  <p className="text-xs text-slate-200">
                    {fullReport.negotiationAdvice.argumentSummary}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-200">
                    Check-list avant déplacement & essai
                  </p>
                  <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
                    {fullReport.inspectionChecklist.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-emerald-400">
                      Message prêt à envoyer au vendeur
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCopyText(fullReport.sellerMessageScript, 'seller')}
                      className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 cursor-pointer shrink-0"
                    >
                      {copiedKey === 'seller' ? 'Copié !' : 'Copier'}
                    </button>
                  </div>
                  <pre className="rounded-lg bg-slate-950 border border-slate-800 p-3 text-xs text-slate-200 whitespace-pre-wrap">
                    {fullReport.sellerMessageScript}
                  </pre>
                </div>

                {includeCerfaBump && (
                  <div className="rounded-xl bg-slate-950 border border-amber-600/50 p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
                      Pack Cerfa & Recours (RAR)
                    </p>

                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-slate-200">
                        Démarches cession (Cerfa 15776*02) & immatriculation
                      </p>
                      <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
                        {fullReport.cerfaAndLitigationPack.cessionAndRegistrationSteps.map(
                          (step, idx) => (
                            <li key={idx}>{step}</li>
                          )
                        )}
                      </ul>
                    </div>

                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-amber-300">
                          Trame courrier recommandé (RAR — Litige / Vice caché)
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyText(
                              fullReport.cerfaAndLitigationPack.registeredMailTemplate,
                              'rar'
                            )
                          }
                          className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 cursor-pointer shrink-0"
                        >
                          {copiedKey === 'rar' ? 'Copié !' : 'Copier la trame'}
                        </button>
                      </div>
                      <pre className="rounded-lg bg-slate-900 border border-slate-800 p-3 text-xs text-slate-200 whitespace-pre-wrap max-h-64 overflow-auto">
                        {fullReport.cerfaAndLitigationPack.registeredMailTemplate}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <form
          onSubmit={handleGenerateMagicLink}
          className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3"
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Chasseur de CT — Revenir quand le vendeur répond
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Pas encore le rapport Histovec ou le CT ? Génère un lien de reprise pour rouvrir ce dossier dès réception.
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
            {loadingMagic ? 'Création du lien...' : 'Créer mon Magic Link de reprise'}
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
                  {copiedKey === 'magic' ? 'Lien copié !' : 'Copier le lien'}
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

        {extraction && (
          <details className="rounded-xl bg-slate-950 border border-slate-800 p-3">
            <summary className="text-xs font-semibold text-slate-400 cursor-pointer">
              Voir le JSON extrait par Gemini
            </summary>
            <pre className="mt-2 max-h-72 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-200">
              {JSON.stringify(extraction, null, 2)}
            </pre>
          </details>
        )}

        <footer className="pt-2 border-t border-slate-800 text-[11px] text-slate-400">
          {fullReport?.legalDisclaimers.notAnExpertNotice ??
            'Outil d’aide à la décision basé sur l’analyse automatisée de données et documents fournis. Ne constitue pas une expertise automobile au sens de l’article L. 326-1 du Code de la route.'}
        </footer>
      </div>
    </main>
  );
}