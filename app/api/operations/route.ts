import { NextResponse } from "next/server";
import { repository } from "@/lib/repository";
import { SEED_SHIPMENTS } from "@/lib/seeds/shipments";
import {
  Shipment,
  Incident,
  DiscrepancyException,
  ObservationRecord,
  EvidenceRecord,
  AttestationRecord,
  AgreementStatus,
  AttestationPosition,
} from "@/lib/types";
import { evaluateAgreement } from "@/lib/domain/agreement-engine";
import { evaluateReadiness } from "@/lib/domain/readiness-engine";
import { calculateDiscrepancy } from "@/lib/domain/quantity-engine";

export interface EnrichedManifest {
  shipment: Shipment;
  incidentId: string | null;
  incidentNumber: string | null;
  expectedQty: number;
  observedQty: number | null;
  delta: number | null;
  discrepancyType: "SHORTAGE" | "OVERAGE" | "MATCH" | "PENDING";
  hasDamage: boolean;
  damageDescription: string | null;
  agreementStatus: AgreementStatus;
  driverPosition: string;
  photoCount: number;
  readinessStatus: "READY_FOR_OPS_REVIEW" | "BLOCKED_PHOTO_REQUIRED" | "IN_PROGRESS" | "CLEAN" | "AWAITING_INSPECTION";
  lastUpdated: string;
}

export async function GET() {
  try {
    let shipments: Shipment[] = [];
    try {
      shipments = await repository.getShipments();
    } catch {
      // Fallback
    }

    if (!shipments || shipments.length === 0) {
      shipments = SEED_SHIPMENTS;
    }

    let allIncidents: Incident[] = [];
    try {
      allIncidents = await repository.getIncidents({});
    } catch {
      allIncidents = [];
    }

    const manifests: EnrichedManifest[] = await Promise.all(
      shipments.map(async (shipment) => {
        const cleanPo = shipment.poNumber;
        const expected = shipment.items?.[0]?.expectedQty ?? 48;

        // Find the most recent incident for this shipment by startedAt timestamp
        let matchingIncidents = allIncidents.filter(
          (i) =>
            i.shipmentId === shipment.id ||
            i.shipmentId === `shipment-po${cleanPo.toLowerCase()}` ||
            i.shipmentId.toLowerCase().includes(cleanPo.toLowerCase())
        );

        if (matchingIncidents.length === 0) {
          try {
            matchingIncidents = await repository.getIncidents({ shipmentId: shipment.id });
          } catch {
            matchingIncidents = [];
          }
        }

        matchingIncidents.sort((a, b) => {
          const timeA = a.startedAt ? new Date(a.startedAt).getTime() : 0;
          const timeB = b.startedAt ? new Date(b.startedAt).getTime() : 0;
          return timeB - timeA;
        });

        const latestIncident = matchingIncidents.length > 0 ? matchingIncidents[0] : null;
        const incidentId = latestIncident?.id || null;
        const incidentNumber = latestIncident?.incidentNumber || null;

        let exceptions: DiscrepancyException[] = [];
        let evidence: EvidenceRecord[] = [];
        let attestations: AttestationRecord[] = [];
        let observations: ObservationRecord[] = [];

        if (latestIncident) {
          try {
            [exceptions, evidence, attestations, observations] = await Promise.all([
              repository.getExceptions(latestIncident.id),
              repository.getEvidence(latestIncident.id),
              repository.getAttestations(latestIncident.id),
              repository.getObservations(latestIncident.id),
            ]);
          } catch {
            // Keep empty arrays
          }
        }

        // Determine observed quantity from observations or exceptions
        let observedQty: number | null = null;
        const qtyObs = observations.find((o) => o.fieldKey === "observed_qty");
        if (qtyObs?.valueJson && typeof (qtyObs.valueJson as { observedQty?: number }).observedQty === "number") {
          observedQty = (qtyObs.valueJson as { observedQty: number }).observedQty;
        } else if (exceptions.length > 0 && typeof exceptions[0].observedQty === "number") {
          observedQty = exceptions[0].observedQty;
        }

        // Damage detection
        const dmgException = exceptions.find((e) => e.type === "DAMAGE");
        const hasDamage = Boolean(dmgException);
        const damageDescription = dmgException?.damageDescription || null;

        // Calculate delta & discrepancy type
        let delta: number | null = null;
        let discrepancyType: "SHORTAGE" | "OVERAGE" | "MATCH" | "PENDING" = "PENDING";

        if (observedQty !== null) {
          const disc = calculateDiscrepancy(expected, observedQty);
          delta = disc.delta;
          if (disc.type === "SHORTAGE") discrepancyType = "SHORTAGE";
          else if (disc.type === "OVERAGE") discrepancyType = "OVERAGE";
          else discrepancyType = "MATCH";
        }

        // Driver and Receiver attestation positions
        const driverAtt = attestations.find((a) => a.partyRole === "DRIVER");
        const driverPosition: string = driverAtt?.position || "NOT_ASKED";
        const receiverPosition: AttestationPosition = observedQty !== null ? "CONFIRM" : "NOT_ASKED";
        const agreementStatus: AgreementStatus = evaluateAgreement(
          receiverPosition,
          (driverAtt?.position as AttestationPosition) || "NOT_ASKED"
        );

        const photoCount = evidence.length;
        const hasDiscrepancy = delta !== null && delta !== 0;
        const driverAttested = driverPosition !== "NOT_ASKED";
        const receiverInspected = observedQty !== null;
        const hasQuoteProvenance = Boolean(qtyObs?.sourceQuote);

        const domainReadiness = evaluateReadiness({
          hasDamage,
          hasPhotos: photoCount > 0,
          hasDiscrepancy,
          driverAttested,
          receiverInspected,
          hasQuoteProvenance,
        });

        let readinessStatus: "READY_FOR_OPS_REVIEW" | "BLOCKED_PHOTO_REQUIRED" | "IN_PROGRESS" | "CLEAN" | "AWAITING_INSPECTION" = "AWAITING_INSPECTION";
        if (observedQty === null) {
          readinessStatus = "AWAITING_INSPECTION";
        } else if (domainReadiness.readyForReview) {
          readinessStatus = !hasDamage && !hasDiscrepancy ? "CLEAN" : "READY_FOR_OPS_REVIEW";
        } else if (hasDamage && photoCount === 0) {
          readinessStatus = "BLOCKED_PHOTO_REQUIRED";
        } else {
          readinessStatus = "IN_PROGRESS";
        }

        return {
          shipment,
          incidentId,
          incidentNumber,
          expectedQty: expected,
          observedQty,
          delta,
          discrepancyType,
          hasDamage,
          damageDescription,
          agreementStatus,
          driverPosition,
          photoCount,
          readinessStatus,
          lastUpdated: latestIncident?.startedAt || new Date().toISOString(),
        };
      })
    );

    // Compute KPIs
    const totalActiveExceptions = manifests.filter(
      (m) => m.discrepancyType === "SHORTAGE" || m.discrepancyType === "OVERAGE" || m.hasDamage
    ).length;

    const totalDisputedRecords = manifests.filter((m) => m.agreementStatus === "DISPUTED").length;

    const totalReadyForReview = manifests.filter(
      (m) => m.readinessStatus === "READY_FOR_OPS_REVIEW" || m.readinessStatus === "CLEAN"
    ).length;

    // Real observed/completed throughput: counts observed cartons from completed/inspected manifests
    const totalCartonsHandled = manifests.reduce(
      (acc, m) => acc + (m.observedQty !== null ? m.observedQty : 0),
      0
    );

    const totalScheduledVolume = manifests.reduce(
      (acc, m) => acc + m.expectedQty,
      0
    );

    return NextResponse.json({
      manifests,
      kpis: {
        totalActiveExceptions,
        totalDisputedRecords,
        totalReadyForReview,
        totalCartonsHandled,
        totalScheduledVolume,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to aggregate operations data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
