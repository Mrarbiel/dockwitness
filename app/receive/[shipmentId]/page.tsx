"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { VoiceCapturePanel, VoiceAgentCockpit } from "@/components/voice";
import { TranscriptTurn } from "@/lib/assemblyai";
import {
  Shipment,
  Incident,
  DiscrepancyException,
  DiscrepancyResult,
  AttestationPosition,
  AgreementStatus,
  DockOperatingMode,
  CleanReceiptPolicy,
} from "@/lib/types";
import { SEED_SHIPMENTS } from "@/lib/seeds/shipments";
import {
  extractCandidateQuantity,
  extractCandidateDamage,
  extractDriverAttestations,
} from "@/lib/extraction";
import { calculateDiscrepancy } from "@/lib/domain/quantity-engine";
import { evaluateReadiness } from "@/lib/domain/readiness-engine";
import { evaluateAgreement } from "@/lib/domain/agreement-engine";
import {
  ManifestCard,
  ObservedQuantityCounter,
  ScenarioSwitcher,
  ObservedQuantityState,
  TwoPartyStepper,
  TwoPartyAgreementCard,
  DriverAttestationCard,
  DriverAttestationState,
} from "@/components/receiving";
import {
  PhotoEvidenceCard,
  ReadinessChecklist,
  WorkflowSummary,
  AuditTimeline,
  FactProvenanceModal,
  FactProvenance,
  EvidenceItem,
  DamageReport,
  DomainReadiness,
} from "@/components/evidence";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Volume2,
  AlertCircle,
  FileCheck,
  Building,
  User,
  Truck,
  CheckCircle2,
  RefreshCw,
  FileText,
  Camera,
  ShieldCheck,
} from "lucide-react";

interface PageProps {
  params: Promise<{
    shipmentId: string;
  }>;
}

export default function ReceivePage({ params }: PageProps) {
  const routeParams = useParams();
  const rawShipmentId =
    (typeof routeParams?.shipmentId === "string" ? routeParams.shipmentId : "") || "";
  const [resolvedShipmentId, setResolvedShipmentId] = useState<string>(rawShipmentId);

  useEffect(() => {
    if (rawShipmentId) {
      setResolvedShipmentId(rawShipmentId);
    } else if (params && typeof (params as any).then === "function") {
      params.then((p) => {
        if (p?.shipmentId) setResolvedShipmentId(p.shipmentId);
      });
    }
  }, [rawShipmentId, params]);

  const shipmentId = resolvedShipmentId || rawShipmentId;

  // Immediate seed match so the UI renders instantly without waiting for network round-trips
  const initialSeed = useMemo(() => {
    if (!shipmentId) return null;
    const cleanKey = shipmentId
      .toLowerCase()
      .replace(/^shipment-/, "")
      .replace(/^po-?/, "");
    return (
      SEED_SHIPMENTS.find(
        (s) =>
          s.id.toLowerCase() === shipmentId.toLowerCase() ||
          s.poNumber.toLowerCase() === shipmentId.toLowerCase() ||
          s.poNumber.toLowerCase() === cleanKey ||
          s.id.toLowerCase().includes(cleanKey)
      ) || null
    );
  }, [shipmentId]);

  const [shipment, setShipment] = useState<Shipment | null>(initialSeed);
  const [loading, setLoading] = useState<boolean>(!initialSeed);
  const [capturedTurns, setCapturedTurns] = useState<TranscriptTurn[]>([]);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [incidentLoading, setIncidentLoading] = useState<boolean>(true);
  const [incidentInitError, setIncidentInitError] = useState<string | null>(null);
  const [persistenceStatus, setPersistenceStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [persistedExceptions, setPersistedExceptions] = useState<DiscrepancyException[]>([]);
  const [damageReport, setDamageReport] = useState<DamageReport | null>(null);
  const [uploadedPhotos, setUploadedPhotos] = useState<EvidenceItem[]>([]);
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<1 | 2>(1);
  const [selectedFact, setSelectedFact] = useState<FactProvenance | null>(null);
  const [auditRefreshCounter, setAuditRefreshCounter] = useState<number>(0);
  const [isSubmittingAttestation, setIsSubmittingAttestation] = useState<boolean>(false);
  const [activeCockpitTab, setActiveCockpitTab] = useState<"all" | "intake" | "driver" | "audit">("all");
  const [dockOperatingMode, setDockOperatingMode] = useState<DockOperatingMode>("SHARED_DOCK");
  const [cleanReceiptPolicy, setCleanReceiptPolicy] = useState<CleanReceiptPolicy>("FAST_PATH");

  const simulateAudioRef = useRef<((scenario: "receiver" | "driver", forceOffline?: boolean) => Promise<void>) | null>(null);

  const [driverAttestation, setDriverAttestation] = useState<DriverAttestationState>({
    quantityPosition: "NOT_ASKED",
    damagePosition: "NOT_ASKED",
    quantityQuote: null,
    quantityTurnId: null,
    damageQuote: null,
    damageTurnId: null,
    statement: null,
    sourceTurnId: null,
    isCommitted: false,
  });
  const [serverReadiness, setServerReadiness] = useState<DomainReadiness | null>(null);

  const activeIncidentId = incident?.id || "";
  const expectedQty = shipment?.items?.[0]?.expectedQty ?? 48;
  const unit = shipment?.items?.[0]?.unit ?? "cartons";
  const storageKey = `dockwitness_incident_${shipmentId}`;

  // State for observed quantity and extraction
  const [observedState, setObservedState] = useState<ObservedQuantityState>({
    quantity: null,
    expectedQuantity: expectedQty,
    unit: unit,
    sourceQuote: null,
    sourceTurnId: null,
    speakerRole: null,
    confidence: 1.0,
    isOverridden: false,
    originalSpokenQuantity: null,
  });

  // Resolve shipment dynamically with API fetch and seed fallback
  useEffect(() => {
    let isMounted = true;
    async function loadShipment() {
      try {
        const res = await fetch(`/api/shipments/${shipmentId}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setShipment(data);
            setLoading(false);
            return;
          }
        }
      } catch {
        // Fall back to initial seed
      }

      if (isMounted && !initialSeed) {
        setLoading(false);
      }
    }

    loadShipment();
    return () => {
      isMounted = false;
    };
  }, [shipmentId, initialSeed]);

  // Create or resume genuine incident session on mount
  const initIncidentSession = useCallback(async () => {
    setIncidentLoading(true);
    setIncidentInitError(null);

    // 1. Check if an active incident ID is already stored in sessionStorage
    const savedIncidentId = typeof window !== "undefined" ? sessionStorage.getItem(storageKey) : null;
    if (savedIncidentId) {
      try {
        const res = await fetch(`/api/incidents/${savedIncidentId}`);
        if (res.ok) {
          const fullData = await res.json();
          setIncident(fullData);

          // Restore turns
          if (fullData.turns && Array.isArray(fullData.turns) && fullData.turns.length > 0) {
            setCapturedTurns(fullData.turns);
          }

          // Restore observations
          let restoredQuantity: number | null = null;
          if (fullData.observations && Array.isArray(fullData.observations)) {
            const qtyObs = fullData.observations.find((o: { fieldKey?: string }) => o.fieldKey === "observed_qty");
            if (qtyObs?.valueJson && typeof qtyObs.valueJson.observedQty === "number") {
              restoredQuantity = qtyObs.valueJson.observedQty;
              setObservedState((prev) => ({
                ...prev,
                quantity: qtyObs.valueJson.observedQty,
                sourceQuote: qtyObs.sourceQuote || null,
                isOverridden: Boolean(qtyObs.valueJson.isOverridden),
                overrideReason: qtyObs.valueJson.overrideReason,
                originalSpokenQuantity: qtyObs.valueJson.originalSpokenQuantity ?? null,
              }));
              setActiveWorkflowStep(2);
            }
          }

          // Restore exceptions
          if (fullData.exceptions && Array.isArray(fullData.exceptions) && fullData.exceptions.length > 0) {
            setPersistedExceptions(fullData.exceptions);
            const dmgExc = fullData.exceptions.find((e: { type?: string }) => e.type === "DAMAGE");
            if (dmgExc) {
              setDamageReport({
                condition: dmgExc.damageDescription || "Crushed / Wet",
                cartonReference: "Carton 31",
                sourceQuote: "Carton thirty-one is crushed underneath and wet on the right side.",
                confidence: 0.95,
              });
            }

            // Defensive reload restoration: if no observed_qty observation was stored,
            // safely reconstruct quantity from the persisted exception's observed_qty
            if (restoredQuantity === null) {
              const qtyExc = fullData.exceptions.find((e: { type?: string; observedQty?: number }) =>
                (e.type === "SHORTAGE" || e.type === "OVERAGE") && typeof e.observedQty === "number"
              );
              if (qtyExc && typeof qtyExc.observedQty === "number") {
                restoredQuantity = qtyExc.observedQty;
                setObservedState((prev) => ({
                  ...prev,
                  quantity: qtyExc.observedQty,
                  sourceQuote: `Persisted ${qtyExc.type} exception record (delta ${qtyExc.delta > 0 ? `+${qtyExc.delta}` : qtyExc.delta})`,
                  isOverridden: false,
                  overrideReason: "Restored from persisted discrepancy exception",
                }));
                setActiveWorkflowStep(2);
              }
            }
          }

          // Restore evidence
          if (fullData.evidence && Array.isArray(fullData.evidence)) {
            setUploadedPhotos(
              fullData.evidence.map((ev: { id: string; incidentId: string; type: string; storagePath: string; description?: string; capturedBy?: string; createdAt?: string }) => ({
                id: ev.id,
                incidentId: ev.incidentId,
                type: "PHOTO",
                storagePath: ev.storagePath,
                description: ev.description,
                capturedBy: ev.capturedBy || "RECEIVER",
                createdAt: ev.createdAt || new Date().toISOString(),
                previewUrl: `/api/evidence/${ev.id}`,
              }))
            );
          }

          // Restore attestations
          if (fullData.attestations && Array.isArray(fullData.attestations) && fullData.attestations.length > 0) {
            const drvAtts = fullData.attestations.filter((a: { partyRole?: string }) => a.partyRole === "DRIVER");
            if (drvAtts.length > 0) {
              const qtyAtt = drvAtts.find((a: { exceptionId?: string }) => {
                if (!a.exceptionId) return false;
                const matchedExc = fullData.exceptions?.find((e: { id: string }) => e.id === a.exceptionId);
                return matchedExc ? (matchedExc.type === "SHORTAGE" || matchedExc.type === "OVERAGE") : a.exceptionId.includes("shortage");
              });
              const dmgAtt = drvAtts.find((a: { exceptionId?: string }) => {
                if (!a.exceptionId) return false;
                const matchedExc = fullData.exceptions?.find((e: { id: string }) => e.id === a.exceptionId);
                return matchedExc ? matchedExc.type === "DAMAGE" : (a.exceptionId.includes("damage") || a.exceptionId.includes("dmg"));
              });
              setDriverAttestation((prev) => ({
                ...prev,
                quantityPosition: qtyAtt?.position || "NOT_ASKED",
                damagePosition: dmgAtt?.position || "NOT_ASKED",
                isCommitted: Boolean(qtyAtt || dmgAtt),
              }));
            }
          }

          setIncidentLoading(false);
          return;
        }
      } catch {
        // Fall through to mint a fresh incident
      }
    }

    // 2. Mint fresh persisted incident in Supabase
    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipmentId: shipmentId,
          status: "CAPTURING",
        }),
      });

      if (res.ok) {
        const newInc: Incident = await res.json();
        setIncident(newInc);
        if (typeof window !== "undefined") {
          sessionStorage.setItem(storageKey, newInc.id);
        }
        setIncidentInitError(null);
        setIncidentLoading(false);
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Database error ${res.status}`);
      }
    } catch (err: unknown) {
      setIncident(null);
      setIncidentInitError(
        err instanceof Error
          ? err.message
          : "Database incident initialization failed. Please retry connection."
      );
      setIncidentLoading(false);
    }
  }, [shipmentId, storageKey]);

  useEffect(() => {
    initIncidentSession();
  }, [initIncidentSession]);

  // Start New Demo Session / Reset handler with confirmation
  const handleResetDemoSession = async () => {
    const hasActiveWork =
      capturedTurns.length > 0 ||
      observedState.quantity !== null ||
      uploadedPhotos.length > 0 ||
      driverAttestation.isCommitted;

    if (hasActiveWork && typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Active receiving evidence exists in this intake session. Discard current state and start a fresh incident session?"
      );
      if (!confirmed) return;
    }

    setIncidentLoading(true);
    setIncidentInitError(null);

    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipmentId: shipmentId,
          status: "CAPTURING",
        }),
      });

      if (res.ok) {
        const freshInc: Incident = await res.json();
        setIncident(freshInc);
        if (typeof window !== "undefined") {
          sessionStorage.setItem(storageKey, freshInc.id);
        }

        // Wipe all local workflow state cleanly
        setCapturedTurns([]);
        setObservedState({
          quantity: null,
          expectedQuantity: expectedQty,
          unit: unit,
          sourceQuote: null,
          sourceTurnId: null,
          speakerRole: null,
          confidence: 1.0,
          isOverridden: false,
          originalSpokenQuantity: null,
        });
        setDamageReport(null);
        setUploadedPhotos([]);
        setDriverAttestation({
          quantityPosition: "NOT_ASKED",
          damagePosition: "NOT_ASKED",
          quantityQuote: null,
          quantityTurnId: null,
          damageQuote: null,
          damageTurnId: null,
          statement: null,
          sourceTurnId: null,
          isCommitted: false,
        });
        setPersistedExceptions([]);
        setActiveWorkflowStep(1);
        setServerReadiness(null);
        setSelectedFact(null);
        setAuditRefreshCounter((c) => c + 1);
        setPersistenceStatus("idle");
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Reset failed with HTTP ${res.status}`);
      }
    } catch (err: unknown) {
      setIncidentInitError(
        err instanceof Error ? err.message : "Failed to reset session in database."
      );
    } finally {
      setIncidentLoading(false);
    }
  };

  const expectedKeyterms = useMemo(() => {
    const terms = new Set<string>();
    if (shipment?.poNumber) terms.add(shipment.poNumber);
    if (shipment?.carrierName) terms.add(shipment.carrierName);
    if (shipment?.trailerNumber) terms.add(shipment.trailerNumber);
    if (shipment?.bolNumber) terms.add(shipment.bolNumber);

    if (shipment?.items) {
      for (const item of shipment.items) {
        if (item.sku) terms.add(item.sku);
        if (item.description) terms.add(item.description);
        if (typeof item.expectedQty === "number") terms.add(String(item.expectedQty));
        if (item.unit) terms.add(item.unit);
      }
    }

    const dockVocab = [
      "carton", "cartons", "damaged", "damage", "shortage", "overage",
      "crushed", "wet", "seal", "intact", "Carton 31", "unit", "units",
      "box", "boxes", "pallet", "pallets", "count", "received", "discrepancy"
    ];
    for (const v of dockVocab) terms.add(v);

    return Array.from(terms).filter(Boolean);
  }, [shipment]);

  // Keep expectedQuantity and unit synchronized with loaded shipment
  useEffect(() => {
    if (shipment?.items?.[0]) {
      setObservedState((prev) => ({
        ...prev,
        expectedQuantity: shipment.items[0].expectedQty,
        unit: shipment.items[0].unit,
      }));
    }
  }, [shipment]);

  // Deterministic Discrepancy Calculation: Δ = Q_obs - Q_exp
  // NON-NEGOTIABLE INVARIANT: Code determines discrepancy facts. Never an LLM.
  const discrepancy: DiscrepancyResult | null = useMemo(() => {
    if (observedState.quantity === null || !shipment?.items?.[0]) {
      return null;
    }
    return calculateDiscrepancy(shipment.items[0].expectedQty, observedState.quantity);
  }, [observedState.quantity, shipment]);

  // Deterministic Agreement Engine Evaluations
  const receiverQtyPos: AttestationPosition = observedState.quantity !== null ? "CONFIRM" : "NOT_ASKED";
  const driverQtyPos: AttestationPosition = driverAttestation.quantityPosition;
  const quantityAgreementStatus: AgreementStatus = useMemo(() => {
    return evaluateAgreement(receiverQtyPos, driverQtyPos);
  }, [receiverQtyPos, driverQtyPos]);

  const hasDamage = Boolean(damageReport);
  const receiverDmgPos: AttestationPosition = hasDamage ? "CONFIRM" : "NOT_ASKED";
  const driverDmgPos: AttestationPosition = driverAttestation.damagePosition || "NOT_ASKED";
  const damageAgreementStatus: AgreementStatus | null = useMemo(() => {
    if (!hasDamage) return null;
    return evaluateAgreement(receiverDmgPos, driverDmgPos);
  }, [hasDamage, receiverDmgPos, driverDmgPos]);

  // Deterministic readiness evaluation
  const hasPhotos = uploadedPhotos.length > 0;
  const hasDiscrepancy = discrepancy !== null && discrepancy.type !== null;
  const driverAttested = driverAttestation.isCommitted || driverAttestation.quantityPosition !== "NOT_ASKED";
  const driverRefused = driverAttestation.quantityPosition === "REFUSED_TO_ATTEST" || driverAttestation.damagePosition === "REFUSED_TO_ATTEST";
  const driverUnavailable = driverAttestation.quantityPosition === "DRIVER_UNAVAILABLE" || driverAttestation.damagePosition === "DRIVER_UNAVAILABLE";
  const isStep1Complete = observedState.quantity !== null;
  const isCleanReceipt = Boolean(isStep1Complete && !hasDamage && !hasDiscrepancy);

  const localReadiness: DomainReadiness = useMemo(() => {
    return evaluateReadiness({
      hasDamage,
      hasPhotos,
      hasDiscrepancy,
      driverAttested,
      driverRefused,
      driverUnavailable,
      receiverInspected: isStep1Complete,
      observedQuantity: observedState.quantity,
      hasQuoteProvenance: Boolean(observedState.sourceQuote),
      cleanReceiptPolicy,
    });
  }, [hasDamage, hasPhotos, hasDiscrepancy, driverAttested, driverRefused, driverUnavailable, isStep1Complete, observedState.quantity, observedState.sourceQuote, cleanReceiptPolicy]);

  const refreshServerReadiness = useCallback(async () => {
    if (!activeIncidentId) return;
    try {
      const res = await fetch(`/api/incidents/${activeIncidentId}/evaluate`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.readiness) {
          setServerReadiness(data.readiness);
        }
      }
    } catch {
      // Non-fatal
    }
  }, [activeIncidentId]);

  const activeReadiness: DomainReadiness = serverReadiness || localReadiness;

  // Handle committed speech turn from VoiceCapturePanel
  const handleTurnCommitted = async (turn: TranscriptTurn) => {
    setCapturedTurns((prev) => [...prev, turn]);
    setAuditRefreshCounter((c) => c + 1);
    setPersistenceStatus("saving");

    // Asynchronously persist turn to API/repository
    let persistedTurnId: string | null = null;
    if (activeIncidentId) {
      try {
        const turnRes = await fetch(`/api/incidents/${activeIncidentId}/turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            speakerRole: turn.speakerRole,
            text: turn.text,
            isFinal: turn.endOfTurn ?? true,
            confidence: turn.confidence ?? 0.95,
            words: turn.words,
          }),
        });
        if (turnRes.ok) {
          const savedTurn = await turnRes.json();
          persistedTurnId = savedTurn.id;
          setPersistenceStatus("saved");
        } else {
          setPersistenceStatus("error");
        }
      } catch {
        setPersistenceStatus("error");
      }
    }

    // Extract candidate observed quantity for RECEIVER turns
    if (turn.speakerRole === "RECEIVER") {
      const candidate = extractCandidateQuantity(turn.text, {
        sourceTurnId: persistedTurnId || turn.id,
        speakerRole: turn.speakerRole,
        words: turn.words,
      });

      if (candidate) {
        // Invalidate stale driver attestation if receiver corrected count
        if (observedState.quantity !== null && observedState.quantity !== candidate.observedQty) {
          setDriverAttestation((prev) => ({
            ...prev,
            quantityPosition: "NOT_ASKED",
            quantityQuote: null,
            quantityTurnId: null,
            statement: null,
            sourceTurnId: null,
            isCommitted: false,
          }));
        }

        setObservedState((prev) => ({
          ...prev,
          quantity: candidate.observedQty,
          sourceQuote: candidate.sourceQuote,
          sourceTurnId: persistedTurnId || turn.id,
          speakerRole: turn.speakerRole || "RECEIVER",
          confidence: candidate.confidence,
          originalSpokenQuantity: candidate.observedQty,
          isOverridden: false,
        }));

        if (activeIncidentId) {
          try {
            const extRes = await fetch(`/api/incidents/${activeIncidentId}/extract`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: turn.text,
                turnId: persistedTurnId || turn.id,
                speakerRole: turn.speakerRole,
                words: turn.words,
              }),
            });
            if (extRes.ok) {
              const extData = await extRes.json();
              if (extData.exceptions && Array.isArray(extData.exceptions)) {
                setPersistedExceptions((prev) => {
                  const map = new Map(prev.map((e) => [e.id, e]));
                  for (const exc of extData.exceptions) {
                    map.set(exc.id, exc);
                  }
                  return Array.from(map.values());
                });
              }
            }
            await refreshServerReadiness();
          } catch {
            // Non-fatal
          }
        }
      }

      // Extract candidate damage
      const candidateDmg = extractCandidateDamage(turn.text, {
        sourceTurnId: turn.id,
        speakerRole: turn.speakerRole,
      });

      if (candidateDmg) {
        setDamageReport({
          cartonReference: candidateDmg.cartonReference,
          condition: candidateDmg.condition,
          sourceQuote: candidateDmg.sourceQuote,
          sourceTurnId: persistedTurnId || turn.id,
          speakerRole: turn.speakerRole,
          confidence: candidateDmg.confidence,
        });

        if (!candidate && activeIncidentId) {
          try {
            const dmgRes = await fetch(`/api/incidents/${activeIncidentId}/extract`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: turn.text,
                turnId: persistedTurnId || turn.id,
                speakerRole: turn.speakerRole,
                words: turn.words,
              }),
            });
            if (dmgRes.ok) {
              const dmgData = await dmgRes.json();
              if (dmgData.exceptions && Array.isArray(dmgData.exceptions)) {
                setPersistedExceptions((prev) => {
                  const map = new Map(prev.map((e) => [e.id, e]));
                  for (const exc of dmgData.exceptions) {
                    map.set(exc.id, exc);
                  }
                  return Array.from(map.values());
                });
              }
            }
          } catch {
            // Non-fatal
          }
        }
        await refreshServerReadiness();
      }

      // Promote to Step 2 when count is established
      setActiveWorkflowStep(2);
    }

    if (turn.speakerRole === "DRIVER") {
      const extracted = extractDriverAttestations(turn.text);

      // INVARIANT: Never manufacture driver positions. Preserves NOT_ASKED / NO_KNOWLEDGE.
      const newQtyPos: AttestationPosition = extracted.quantityPosition || "NOT_ASKED";
      const newDmgPos: AttestationPosition = extracted.damagePosition || "NOT_ASKED";

      setDriverAttestation((prev) => ({
        ...prev,
        quantityPosition: newQtyPos,
        damagePosition: newDmgPos,
        quantityQuote: extracted.quantityQuote || prev.quantityQuote,
        quantityTurnId: persistedTurnId || turn.id,
        damageQuote: extracted.damageQuote || prev.damageQuote,
        damageTurnId: persistedTurnId || turn.id,
        statement: turn.text,
        sourceTurnId: persistedTurnId || turn.id,
        isCommitted: true,
      }));

      // Post attestations to API referencing real exception IDs
      if (activeIncidentId) {
        try {
          let currentExceptions = persistedExceptions;
          if (currentExceptions.length === 0 && (hasDiscrepancy || hasDamage)) {
            const incRes = await fetch(`/api/incidents/${activeIncidentId}`);
            if (incRes.ok) {
              const incData = await incRes.json();
              if (incData.exceptions && Array.isArray(incData.exceptions)) {
                currentExceptions = incData.exceptions;
                setPersistedExceptions(currentExceptions);
              }
            }
          }

          const qtyException =
            currentExceptions.find((e) => e.type === "SHORTAGE" || e.type === "OVERAGE") ||
            (hasDiscrepancy ? currentExceptions[0] : null);
          const dmgException = currentExceptions.find((e) => e.type === "DAMAGE");

          if (hasDiscrepancy && qtyException?.id && newQtyPos !== "NOT_ASKED") {
            await fetch(`/api/incidents/${activeIncidentId}/attestation`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                exceptionId: qtyException.id,
                partyRole: "DRIVER",
                position: newQtyPos,
                sourceTurnId: persistedTurnId || turn.id,
              }),
            });
          }

          if (hasDamage && dmgException?.id && newDmgPos !== "NOT_ASKED") {
            await fetch(`/api/incidents/${activeIncidentId}/attestation`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                exceptionId: dmgException.id,
                partyRole: "DRIVER",
                position: newDmgPos,
                sourceTurnId: persistedTurnId || turn.id,
              }),
            });
          }
        } catch {
          // Non-fatal
        }

        await refreshServerReadiness();
      }
    }
  };

  // Structured driver attestation submission
  const handleSubmitDriverAttestation = async (
    qtyPos: AttestationPosition,
    dmgPos: AttestationPosition,
    statement?: string
  ) => {
    if (!activeIncidentId) return;
    setIsSubmittingAttestation(true);
    setPersistenceStatus("saving");

    try {
      let currentExceptions = persistedExceptions;
      if (currentExceptions.length === 0 && (hasDiscrepancy || hasDamage)) {
        try {
          const incRes = await fetch(`/api/incidents/${activeIncidentId}`);
          if (incRes.ok) {
            const incData = await incRes.json();
            if (incData.exceptions && Array.isArray(incData.exceptions)) {
              currentExceptions = incData.exceptions;
              setPersistedExceptions(currentExceptions);
            }
          }
        } catch {
          // Non-fatal
        }
      }

      const qtyException =
        currentExceptions.find((e) => e.type === "SHORTAGE" || e.type === "OVERAGE") ||
        (hasDiscrepancy ? currentExceptions[0] : null);
      const dmgException = currentExceptions.find((e) => e.type === "DAMAGE");

      if (hasDiscrepancy && qtyException?.id && qtyPos !== "NOT_ASKED") {
        await fetch(`/api/incidents/${activeIncidentId}/attestation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exceptionId: qtyException.id,
            partyRole: "DRIVER",
            position: qtyPos,
            sourceTurnId: driverAttestation.sourceTurnId || null,
          }),
        });
      }

      if (hasDamage && dmgException?.id && dmgPos !== "NOT_ASKED") {
        await fetch(`/api/incidents/${activeIncidentId}/attestation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exceptionId: dmgException.id,
            partyRole: "DRIVER",
            position: dmgPos,
            sourceTurnId: driverAttestation.sourceTurnId || null,
          }),
        });
      }

      setDriverAttestation((prev) => ({
        ...prev,
        quantityPosition: qtyPos,
        damagePosition: dmgPos,
        statement: statement || prev.statement,
        isCommitted: true,
      }));

      setPersistenceStatus("saved");
      setAuditRefreshCounter((c) => c + 1);
      await refreshServerReadiness();
    } catch {
      setPersistenceStatus("error");
    } finally {
      setIsSubmittingAttestation(false);
    }
  };

  // Clerical count adjustment / manual entry handlers with server persistence
  const handleConfirmOverride = async (newQty: number, reason: string) => {
    if (!activeIncidentId) return;
    setPersistenceStatus("saving");

    try {
      const res = await fetch(`/api/incidents/${activeIncidentId}/observation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          observedQty: newQty,
          reason,
          actor: "RECEIVER",
          isOverridden: true,
          originalSpokenQuantity: observedState.originalSpokenQuantity,
          sourceQuote: `Count adjustment: ${newQty} ${unit} (${reason})`,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setObservedState((prev) => ({
          ...prev,
          quantity: newQty,
          isOverridden: true,
          overrideReason: reason,
          overrideTimestamp: new Date().toISOString(),
          sourceQuote: data.observation?.sourceQuote || prev.sourceQuote,
        }));

        if (data.exception) {
          setPersistedExceptions((prev) => [
            ...prev.filter((e) => e.id !== data.exception.id),
            data.exception,
          ]);
        }

        // Invalidate previous driver attestation because count changed
        if (driverAttestation.quantityPosition !== "NOT_ASKED") {
          setDriverAttestation((prev) => ({
            ...prev,
            quantityPosition: "NOT_ASKED",
            isCommitted: false,
          }));
        }

        setPersistenceStatus("saved");
        setAuditRefreshCounter((c) => c + 1);
        setActiveWorkflowStep(2);
        await refreshServerReadiness();
      } else {
        setPersistenceStatus("error");
      }
    } catch {
      setPersistenceStatus("error");
    }
  };

  const handleResetToSpoken = async () => {
    if (!activeIncidentId || observedState.originalSpokenQuantity === null) return;
    const spoken = observedState.originalSpokenQuantity;
    setPersistenceStatus("saving");

    try {
      const res = await fetch(`/api/incidents/${activeIncidentId}/observation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          observedQty: spoken,
          reason: "Reset to verbatim spoken count from audio",
          actor: "RECEIVER",
          isOverridden: false,
          originalSpokenQuantity: spoken,
          sourceQuote: observedState.sourceQuote || `Spoken count: ${spoken}`,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setObservedState((prev) => ({
          ...prev,
          quantity: spoken,
          isOverridden: false,
          overrideReason: undefined,
          overrideTimestamp: undefined,
        }));

        if (data.exception) {
          setPersistedExceptions((prev) => [
            ...prev.filter((e) => e.id !== data.exception.id),
            data.exception,
          ]);
        }

        setPersistenceStatus("saved");
        setAuditRefreshCounter((c) => c + 1);
        await refreshServerReadiness();
      } else {
        setPersistenceStatus("error");
      }
    } catch {
      setPersistenceStatus("error");
    }
  };

  const receiverStepStatus: "PENDING" | "RECORDING" | "COMPLETED" =
    isStep1Complete ? "COMPLETED" : "PENDING";

  const driverStepStatus: "AWAITING_RECEIVER" | "PENDING_REVIEW" | "RECORDING" | "COMPLETED" =
    !isStep1Complete
      ? "AWAITING_RECEIVER"
      : driverAttested
      ? "COMPLETED"
      : "PENDING_REVIEW";

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center px-6 py-12">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="mt-4 font-mono text-sm text-slate-400">
            Loading Shipment Manifest #{shipmentId}...
          </p>
        </div>
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
          <h2 className="mt-4 text-xl font-bold text-white">Shipment Not Found</h2>
          <p className="mt-2 text-sm text-slate-400">
            Unable to locate manifest for identifier: <span className="font-mono text-amber-400">{shipmentId}</span>
          </p>
          <div className="mt-6 flex justify-center">
            <ScenarioSwitcher currentShipmentId={shipmentId} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 w-full max-w-full overflow-x-hidden">
      {/* Top Header Bar */}
      <div className="flex flex-col gap-4 border-b border-slate-800 pb-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 shrink-0">
              Dock Receiving Cockpit
            </span>
            <span className="text-slate-600">•</span>
            {incident ? (
              <Badge variant="outline" className="border-sky-500/30 text-[10px] text-sky-400 bg-sky-500/10 shrink-0">
                Incident #{incident.incidentNumber}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-slate-700 text-[10px] text-slate-400 shrink-0">
                INITIALIZING...
              </Badge>
            )}
            <span className="text-slate-600">•</span>
            {persistenceStatus === "saving" && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-400 shrink-0">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Ledger Saving...
              </span>
            )}
            {persistenceStatus === "saved" && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 shrink-0">
                <CheckCircle2 className="h-3 w-3" />
                Ledger Synced
              </span>
            )}
            {persistenceStatus === "error" && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-rose-400 shrink-0">
                <AlertCircle className="h-3 w-3" />
                Save Error
              </span>
            )}
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white md:text-3xl mt-1 break-words">
            Receiving Manifest PO #{shipment.poNumber}
          </h1>
        </div>

        {/* Canonical Scenario Switcher Pill Bar & Reset Demo Session */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full xl:w-auto max-w-full">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetDemoSession}
            disabled={incidentLoading}
            className="border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm h-9 shrink-0 whitespace-nowrap"
            title="Reset current database session and start fresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${incidentLoading ? "animate-spin" : ""}`} />
            Reset Demo Session
          </Button>
          <div className="w-full xl:w-auto max-w-full overflow-hidden">
            <ScenarioSwitcher currentShipmentId={shipmentId} />
          </div>
        </div>
      </div>

      {/* Database Incident Initialization Error Recovery Banner */}
      {incidentInitError && (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
            <div>
              <p className="font-bold text-white text-sm">Database Session Initialization Failed</p>
              <p className="text-xs text-red-300/80 mt-0.5">{incidentInitError}</p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => initIncidentSession()}
            disabled={incidentLoading}
            className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold shrink-0"
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${incidentLoading ? "animate-spin" : ""}`} />
            Retry Initialization
          </Button>
        </div>
      )}

      {/* Real-World Dock Hardware Operating Mode Selector */}
      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/40 text-[10px] font-bold">
            Hardware Mode
          </Badge>
          <span className="text-slate-300 font-medium">
            {dockOperatingMode === "SHARED_DOCK" && "Shared Dock Mode (Primary Default: Rugged Tablet Mic/Cam/Speaker — No Driver Headset Needed • Industrial Ambient Audio)"}
            {dockOperatingMode === "RECEIVER_HEADSET" && "Receiver Headset Mode (Warehouse Headset + Tablet — Driver Uses Shared Device)"}
            {dockOperatingMode === "MOUNTED_KIOSK" && "Mounted Terminal/Kiosk Mode (Far-Field Terminal Geometry)"}
            {dockOperatingMode === "DEMO" && "Judge Demo Mode (Real AssemblyAI Universal-3.5 + Voice Agent APIs)"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900 p-0.5">
            <button
              type="button"
              onClick={() => setDockOperatingMode("SHARED_DOCK")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition ${
                dockOperatingMode === "SHARED_DOCK"
                  ? "bg-sky-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Shared Tablet (Default)
            </button>
            <button
              type="button"
              onClick={() => setDockOperatingMode("RECEIVER_HEADSET")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition ${
                dockOperatingMode === "RECEIVER_HEADSET"
                  ? "bg-sky-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Receiver Headset
            </button>
            <button
              type="button"
              onClick={() => setDockOperatingMode("MOUNTED_KIOSK")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition ${
                dockOperatingMode === "MOUNTED_KIOSK"
                  ? "bg-sky-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Mounted Kiosk
            </button>
            <button
              type="button"
              onClick={() => setDockOperatingMode("DEMO")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition ${
                dockOperatingMode === "DEMO"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Judge Demo
            </button>
          </div>

          <div className="flex items-center gap-1.5 border-l border-slate-800 pl-2">
            <button
              type="button"
              onClick={() => setCleanReceiptPolicy((p) => (p === "FAST_PATH" ? "REQUIRE_BILATERAL" : "FAST_PATH"))}
              className={`rounded border px-2 py-1 text-[10px] font-mono transition ${
                cleanReceiptPolicy === "FAST_PATH"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-slate-700 bg-slate-800 text-slate-300"
              }`}
              title="Toggle whether clean receipts require bilateral driver sign-off"
            >
              {cleanReceiptPolicy === "FAST_PATH" ? "Fast-Path (No Dispute on Clean)" : "Require Bilateral Sign-Off"}
            </button>
          </div>
        </div>
      </div>

      {/* Severe Packaging Damage Operational Notice */}
      {hasDamage && damageReport?.condition && /crushed|smashed|punctured|severe|broken/i.test(damageReport.condition) && (
        <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>
              <strong>Severe Damage Detected ({damageReport.condition}):</strong> Dock operations review recommended before completing remainder of delivery. DockWitness records verifiable evidence and does NOT determine legal liability or unilaterally reject freight.
            </span>
          </div>
          <Badge variant="outline" className="border-rose-500/40 text-rose-400 text-[10px] font-mono shrink-0">
            LIABILITY: NOT_DETERMINED
          </Badge>
        </div>
      )}

      {/* Prominent Contextual NEXT ACTION Area */}
      <div className="mt-4 rounded-xl border border-amber-500/40 bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/30 p-5 shadow-lg relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {observedState.quantity === null ? (
                <User className="h-5 w-5" />
              ) : hasDamage && uploadedPhotos.length === 0 ? (
                <AlertCircle className="h-5 w-5 text-amber-400 animate-pulse" />
              ) : isCleanReceipt && cleanReceiptPolicy === "FAST_PATH" ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              ) : hasDiscrepancy && !driverAttested ? (
                <Truck className="h-5 w-5 text-sky-400" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">
                  {observedState.quantity === null
                    ? "Step 1: Receiver Intake"
                    : hasDamage && uploadedPhotos.length === 0
                    ? "Step 1.5: Photo Evidence Required"
                    : isCleanReceipt && cleanReceiptPolicy === "FAST_PATH"
                    ? "Clean Receipt Fast-Path"
                    : hasDiscrepancy && !driverAttested
                    ? "Step 2: Driver Attestation"
                    : "Intake Verified"}
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-xs font-bold text-slate-300">Recommended Next Action</span>
              </div>
              <h2 className="text-base font-black text-white mt-0.5">
                {observedState.quantity === null
                  ? "Receiver count inspection required"
                  : hasDamage && uploadedPhotos.length === 0
                  ? `Photo required for ${damageReport?.cartonReference || "Carton 31"}`
                  : isCleanReceipt && cleanReceiptPolicy === "FAST_PATH"
                  ? `Clean receipt: all ${observedState.quantity} cartons accounted for, zero damage`
                  : hasDiscrepancy && !driverAttested
                  ? "Carrier driver review required before truck departs"
                  : "Receiving verified — ready for operations sign-off"}
              </h2>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                {observedState.quantity === null
                  ? "Speak incoming carton count and visible damage state aloud, or enter manual recount."
                  : hasDamage && uploadedPhotos.length === 0
                  ? "Reported packaging defect blocks completion until evidence photo is captured and sealed in the ledger."
                  : isCleanReceipt && cleanReceiptPolicy === "FAST_PATH"
                  ? "Delivery matches purchase order manifest. No exceptions detected; truck driver can be released immediately without dispute."
                  : hasDiscrepancy && !driverAttested
                  ? "Review recorded quantity delta and damage with carrier driver to capture bilateral confirmation or dispute."
                  : "All observations, verbatim speech turns, photos, and bilateral attestations are immutably sealed in PostgreSQL."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {observedState.quantity === null ? (
              <Button
                type="button"
                variant="amber"
                size="sm"
                disabled={incidentLoading || !incident}
                onClick={async () => {
                  if (simulateAudioRef.current) {
                    await simulateAudioRef.current("receiver");
                  }
                }}
                className="font-bold text-xs shadow-md h-10 px-4 whitespace-nowrap"
              >
                Run Golden Demo Audio
              </Button>
            ) : hasDamage && uploadedPhotos.length === 0 ? (
              <Button
                type="button"
                variant="amber"
                size="sm"
                disabled={incidentLoading || !incident}
                onClick={() => {
                  const fileInput = document.querySelector<HTMLInputElement>("input[type='file']");
                  if (fileInput) {
                    fileInput.click();
                  }
                }}
                className="font-bold text-xs shadow-md h-10 px-4 whitespace-nowrap"
              >
                📸 Capture Evidence Photo
              </Button>
            ) : isCleanReceipt && cleanReceiptPolicy === "FAST_PATH" ? (
              <Link
                href={incident ? `/incident/${incident.id}` : "#"}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 transition shadow-sm h-10 whitespace-nowrap"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Complete Clean Receiving</span>
              </Link>
            ) : hasDiscrepancy && !driverAttested ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={incidentLoading || !incident}
                onClick={async () => {
                  setActiveWorkflowStep(2);
                  if (simulateAudioRef.current) {
                    await simulateAudioRef.current("driver");
                  }
                }}
                className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-md h-10 px-4 whitespace-nowrap"
              >
                🚚 Run Driver Demo Audio
              </Button>
            ) : (
              <Link
                href={incident ? `/incident/${incident.id}` : "#"}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 transition shadow-sm h-10 whitespace-nowrap"
              >
                <FileText className="h-4 w-4" />
                <span>View Evidence Record</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Guided Two-Party Stepper Banner */}
      <div className="mt-6">
        <TwoPartyStepper
          currentStep={activeWorkflowStep}
          receiverStatus={receiverStepStatus}
          driverStatus={driverStepStatus}
          hasDiscrepancy={hasDiscrepancy}
          hasDamage={hasDamage}
          observedQty={observedState.quantity}
          expectedQty={expectedQty}
          driverQtyPos={driverQtyPos}
          driverDmgPos={driverDmgPos}
          onSelectStep={(step) => setActiveWorkflowStep(step)}
        />
      </div>

      {/* AssemblyAI Voice Agent Co-Pilot (P1 Guided Workflow) */}
      <div className="mt-6">
        <VoiceAgentCockpit
          shipmentId={shipmentId}
          incidentId={activeIncidentId}
          onWorkflowAdvance={async () => {
            setAuditRefreshCounter((c) => c + 1);
            await refreshServerReadiness();
            if (activeIncidentId) {
              try {
                const incRes = await fetch(`/api/incidents/${activeIncidentId}`);
                if (incRes.ok) {
                  const incData = await incRes.json();
                  let restoredQty: number | null = null;
                  if (incData.observations && Array.isArray(incData.observations)) {
                    const qtyObs = incData.observations.find((o: { fieldKey: string }) => o.fieldKey === "observed_qty");
                    if (qtyObs?.valueJson && typeof qtyObs.valueJson.observedQty === "number") {
                      restoredQty = qtyObs.valueJson.observedQty;
                      setObservedState((prev) => ({
                        ...prev,
                        quantity: qtyObs.valueJson.observedQty,
                        sourceQuote: qtyObs.sourceQuote || null,
                        isOverridden: Boolean(qtyObs.valueJson.isOverridden),
                      }));
                    }
                  }
                  if (incData.exceptions && Array.isArray(incData.exceptions)) {
                    setPersistedExceptions(incData.exceptions);
                    const dmg = incData.exceptions.find((e: { type: string }) => e.type === "DAMAGE");
                    if (dmg) {
                      setDamageReport({
                        cartonReference: "Carton 31",
                        condition: dmg.damageDescription || "crushed underneath and wet",
                        sourceQuote: dmg.damageDescription || "crushed underneath and wet",
                        sourceTurnId: null,
                        speakerRole: "RECEIVER",
                        confidence: 0.98,
                      });
                    }
                    if (restoredQty === null) {
                      const qtyExc = incData.exceptions.find((e: { type?: string; observedQty?: number }) =>
                        (e.type === "SHORTAGE" || e.type === "OVERAGE") && typeof e.observedQty === "number"
                      );
                      if (qtyExc && typeof qtyExc.observedQty === "number") {
                        setObservedState((prev) => ({
                          ...prev,
                          quantity: qtyExc.observedQty,
                          sourceQuote: `Persisted ${qtyExc.type} exception record (delta ${qtyExc.delta > 0 ? `+${qtyExc.delta}` : qtyExc.delta})`,
                          isOverridden: false,
                        }));
                      }
                    }
                  }
                  if (incData.attestations && Array.isArray(incData.attestations)) {
                    const drvAtts = incData.attestations.filter((a: { partyRole?: string }) => a.partyRole === "DRIVER");
                    if (drvAtts.length > 0) {
                      const qtyAtt = drvAtts.find((a: { exceptionId?: string }) => {
                        if (!a.exceptionId) return false;
                        const matchedExc = incData.exceptions?.find((e: { id: string }) => e.id === a.exceptionId);
                        return matchedExc ? (matchedExc.type === "SHORTAGE" || matchedExc.type === "OVERAGE") : a.exceptionId.includes("shortage");
                      });
                      const dmgAtt = drvAtts.find((a: { exceptionId?: string }) => {
                        if (!a.exceptionId) return false;
                        const matchedExc = incData.exceptions?.find((e: { id: string }) => e.id === a.exceptionId);
                        return matchedExc ? matchedExc.type === "DAMAGE" : (a.exceptionId.includes("damage") || a.exceptionId.includes("dmg"));
                      });
                      setDriverAttestation((prev) => ({
                        ...prev,
                        quantityPosition: qtyAtt?.position || prev.quantityPosition,
                        damagePosition: dmgAtt?.position || prev.damagePosition,
                        isCommitted: Boolean(qtyAtt || dmgAtt),
                      }));
                    }
                  }
                }
              } catch {
                // Non-fatal sync
              }
            }
          }}
        />
      </div>

      {/* Cockpit Stage Navigator Bar */}
      <div className="mt-8 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
            Cockpit Layout:
          </span>
          <span className="text-slate-600 hidden xl:inline">•</span>
          <span className="text-xs text-slate-300 font-medium truncate">
            {activeCockpitTab === "all"
              ? <><span className="hidden xl:inline">All 3 Columns (Complete Industrial Control)</span><span className="xl:hidden">Overview</span></>
              : activeCockpitTab === "intake"
              ? <><span className="hidden xl:inline">Stage 1 Focus: Receiver Intake & Audio Pipeline</span><span className="xl:hidden">Intake</span></>
              : activeCockpitTab === "driver"
              ? <><span className="hidden xl:inline">Stage 2 Focus: Carrier Driver Review & Positions</span><span className="xl:hidden">Driver</span></>
              : <><span className="hidden xl:inline">Stage 3 Focus: Bilateral Consensus & Audit Trail</span><span className="xl:hidden">Audit</span></>}
          </span>
        </div>

        <div
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          className="flex items-center gap-1 p-1 bg-slate-950/90 rounded-lg border border-slate-800 text-xs overflow-x-auto max-w-full scrollbar-none"
        >
          <button
            type="button"
            onClick={() => setActiveCockpitTab("all")}
            title="All Columns (Complete Industrial Control)"
            aria-label="Overview (All Columns)"
            className={`px-3 py-1.5 rounded-md font-bold transition-all whitespace-nowrap min-w-0 ${
              activeCockpitTab === "all"
                ? "bg-amber-500 text-slate-950 shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveCockpitTab("intake")}
            title="Stage 1: Receiver Intake"
            aria-label="Stage 1: Receiver Intake"
            className={`px-3 py-1.5 rounded-md font-bold transition-all whitespace-nowrap min-w-0 ${
              activeCockpitTab === "intake"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                : "text-slate-400 hover:text-white border border-transparent"
            }`}
          >
            Intake
          </button>
          <button
            type="button"
            onClick={() => setActiveCockpitTab("driver")}
            title="Stage 2: Driver Attestation"
            aria-label="Stage 2: Driver Attestation"
            className={`px-3 py-1.5 rounded-md font-bold transition-all whitespace-nowrap min-w-0 ${
              activeCockpitTab === "driver"
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm"
                : "text-slate-400 hover:text-white border border-transparent"
            }`}
          >
            Driver
          </button>
          <button
            type="button"
            onClick={() => setActiveCockpitTab("audit")}
            title="Stage 3: Ledger & Audit"
            aria-label="Stage 3: Ledger & Audit"
            className={`px-3 py-1.5 rounded-md font-bold transition-all whitespace-nowrap min-w-0 ${
              activeCockpitTab === "audit"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                : "text-slate-400 hover:text-white border border-transparent"
            }`}
          >
            Audit
          </button>
        </div>
      </div>

      {/* 3-Column Industrial Cockpit Layout */}
      <div className={`mt-6 grid grid-cols-1 gap-6 xl:gap-8 ${
        activeCockpitTab === "all"
          ? "lg:grid-cols-2 2xl:grid-cols-3"
          : activeCockpitTab === "intake"
          ? "lg:grid-cols-2"
          : activeCockpitTab === "driver"
          ? "lg:grid-cols-2"
          : "grid-cols-1"
      }`}>
        {/* Column 1: Manifest & Live Observed Quantity Counter */}
        {(activeCockpitTab === "all" || activeCockpitTab === "intake") && (
        <div className="flex flex-col gap-6 lg:col-span-1 min-w-0">
          <ManifestCard shipment={shipment} />

          <ObservedQuantityCounter
            observedQty={observedState.quantity}
            expectedQty={expectedQty}
            unit={unit}
            discrepancy={discrepancy}
            sourceQuote={observedState.sourceQuote}
            sourceTurnId={observedState.sourceTurnId}
            speakerRole={observedState.speakerRole}
            confidence={observedState.confidence}
            isOverridden={observedState.isOverridden}
            spokenQty={observedState.originalSpokenQuantity}
            onConfirmOverride={handleConfirmOverride}
            onResetToSpoken={handleResetToSpoken}
          />

          <PhotoEvidenceCard
            incidentId={activeIncidentId}
            damageReport={damageReport}
            uploadedPhotos={uploadedPhotos}
            disabled={incidentLoading || !incident}
            onPhotoUploaded={(item) => {
              setUploadedPhotos((prev) => [...prev, item]);
              refreshServerReadiness();
            }}
          />
        </div>
        )}

        {/* Column 2: Voice Capture Pipeline & Golden Simulator */}
        {(activeCockpitTab === "all" || activeCockpitTab === "intake" || activeCockpitTab === "driver") && (
        <div className="flex flex-col gap-6 lg:col-span-1 min-w-0">
          <VoiceCapturePanel
            incidentId={activeIncidentId}
            expectedKeyterms={expectedKeyterms}
            disabled={incidentLoading || !incident}
            isStep1Complete={isStep1Complete}
            onTurnCommitted={handleTurnCommitted}
            simulateTriggerRef={simulateAudioRef}
          />

          <DriverAttestationCard
            hasDiscrepancy={hasDiscrepancy}
            delta={discrepancy?.delta ?? null}
            discrepancyType={discrepancy?.type ?? null}
            hasDamage={hasDamage}
            damageDescription={damageReport?.condition}
            isLocked={!isStep1Complete}
            disabled={incidentLoading || !incident}
            currentDriverQtyPos={driverAttestation.quantityPosition}
            currentDriverDmgPos={driverAttestation.damagePosition || "NOT_ASKED"}
            driverStatement={driverAttestation.statement}
            driverSourceTurnId={driverAttestation.sourceTurnId}
            isSubmitting={isSubmittingAttestation}
            onPositionChange={(qtyPos, dmgPos, statement) =>
              setDriverAttestation((prev) => ({
                ...prev,
                quantityPosition: qtyPos,
                damagePosition: dmgPos,
                statement: statement,
              }))
            }
            onSubmitAttestation={handleSubmitDriverAttestation}
            onTriggerDriverSimulation={async () => {
              if (simulateAudioRef.current) {
                await simulateAudioRef.current("driver");
              }
            }}
          />
        </div>
        )}

        {/* Column 3: Evidence Checklist, Invariants & Transcript Stream */}
        {(activeCockpitTab === "all" || activeCockpitTab === "driver" || activeCockpitTab === "audit") && (
        <div className={`flex flex-col gap-6 min-w-0 ${
          activeCockpitTab === "all"
            ? "lg:col-span-2 2xl:col-span-1"
            : activeCockpitTab === "audit"
            ? "max-w-4xl mx-auto w-full"
            : "lg:col-span-1"
        }`}>
          <TwoPartyAgreementCard
            hasDiscrepancy={hasDiscrepancy}
            expectedQty={expectedQty}
            observedQty={observedState.quantity}
            delta={discrepancy?.delta ?? null}
            discrepancyType={discrepancy?.type ?? null}
            receiverQtyPos={receiverQtyPos}
            driverQtyPos={driverQtyPos}
            quantityAgreementStatus={quantityAgreementStatus}
            receiverQtyTurnId={observedState.sourceTurnId}
            receiverQtyQuote={observedState.sourceQuote}
            driverQtyTurnId={driverAttestation.quantityTurnId}
            driverQtyQuote={driverAttestation.quantityQuote}
            hasDamage={hasDamage}
            damageDescription={damageReport?.condition}
            receiverDmgPos={receiverDmgPos}
            driverDmgPos={driverDmgPos}
            damageAgreementStatus={damageAgreementStatus}
            receiverDmgTurnId={damageReport?.sourceTurnId}
            receiverDmgQuote={damageReport?.sourceQuote}
            driverDmgTurnId={driverAttestation.damageTurnId}
            driverDmgQuote={driverAttestation.damageQuote}
            photoCount={uploadedPhotos.length}
          />

          <ReadinessChecklist
            speechExtracted={observedState.quantity !== null}
            observedQty={observedState.quantity}
            discrepancyComputed={discrepancy !== null}
            delta={discrepancy?.delta ?? null}
            quoteProvenance={Boolean(observedState.sourceQuote)}
            hasDamage={hasDamage}
            hasPhotos={hasPhotos}
            photoCount={uploadedPhotos.length}
            hasDiscrepancy={hasDiscrepancy}
            driverAttested={driverAttested}
            driverPosition={driverAttestation.quantityPosition}
            readiness={activeReadiness}
          />

          {/* Live Workflow Progress Summary (Client derived milestones) */}
          <WorkflowSummary
            turns={capturedTurns}
            discrepancy={discrepancy}
            damageReport={damageReport}
            photoCount={uploadedPhotos.length}
            driverAttestation={driverAttestation}
            readiness={activeReadiness}
          />

          {/* Append-Only Audit Timeline & Evidence Graph (Strict server ledger) */}
          <AuditTimeline
            incidentId={activeIncidentId}
            refreshTrigger={auditRefreshCounter}
            onSelectFact={(fact) => setSelectedFact(fact)}
          />
        </div>
        )}
      </div>

      {/* Clickable Fact Provenance Inspector Modal */}
      {selectedFact && (
        <FactProvenanceModal
          fact={selectedFact}
          onClose={() => setSelectedFact(null)}
        />
      )}
    </div>
  );
}
