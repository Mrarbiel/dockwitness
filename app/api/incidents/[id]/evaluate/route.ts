import { NextResponse } from "next/server";
import { repository } from "@/lib/repository";
import { evaluateReadiness } from "@/lib/domain/readiness-engine";
import { validateSameOrigin, createOriginForbiddenResponse } from "@/lib/auth/origin-validation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = validateSameOrigin(request);
  if (!originCheck.isValid) {
    return createOriginForbiddenResponse(originCheck.error);
  }

  try {
    const { id } = await params;
    const incidentId = id;
    const [incident, exceptions, evidence, attestations, observations] = await Promise.all([
      repository.getIncident(incidentId),
      repository.getExceptions(incidentId),
      repository.getEvidence(incidentId),
      repository.getAttestations(incidentId),
      repository.getObservations(incidentId),
    ]);

    if (!incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    const hasDamage = exceptions.some(e => e.type === "DAMAGE");
    const hasPhotos = evidence.some(e => e.type === "PHOTO");
    const hasDiscrepancy = exceptions.some(e => e.type === "SHORTAGE" || e.type === "OVERAGE");
    const driverAttested = attestations.some(a => a.partyRole === "DRIVER");

    let observedQuantity: number | null = null;
    let hasProvenance = false;
    const qtyObs = observations.find((o) => o.fieldKey === "observed_qty");
    if (qtyObs?.valueJson && typeof (qtyObs.valueJson as { observedQty?: number }).observedQty === "number") {
      observedQuantity = (qtyObs.valueJson as { observedQty: number }).observedQty;
      hasProvenance = Boolean(qtyObs.sourceQuote || (qtyObs.valueJson as { overrideReason?: string }).overrideReason);
    }

    const readiness = evaluateReadiness({
      hasDamage,
      hasPhotos,
      hasDiscrepancy,
      driverAttested,
      receiverInspected: observedQuantity !== null,
      observedQuantity,
      hasQuoteProvenance: hasProvenance,
    });

    // Deduplicate audit events: only append when readiness status or material missing requirements changed
    const existingAudits = await repository.getAuditEvents(incidentId);
    const lastReadinessAudit = existingAudits
      .filter((a) => a.eventType === "READINESS_EVALUATED")
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];

    const lastPayload = lastReadinessAudit?.payloadJson as { readiness?: { status?: string; missingRequirements?: string[] } } | undefined;
    const isSameStatus =
      Boolean(lastPayload?.readiness?.status) &&
      lastPayload?.readiness?.status === readiness.status &&
      JSON.stringify(lastPayload?.readiness?.missingRequirements?.slice().sort() || []) ===
        JSON.stringify(readiness.missingRequirements.slice().sort());

    if (!isSameStatus) {
      await repository.appendAuditEvent({
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        incidentId,
        actor: "SYSTEM",
        eventType: "READINESS_EVALUATED",
        payloadJson: { readiness },
        createdAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      incidentId,
      readiness,
      evaluated: true,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: "Failed to evaluate" }, { status: 500 });
  }
}
