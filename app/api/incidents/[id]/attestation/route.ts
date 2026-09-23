import { NextResponse } from "next/server";
import { z } from "zod";
import { repository } from "@/lib/repository";
import { evaluateAgreement, resolveReceiverPosition } from "@/lib/domain/agreement-engine";
import { AttestationPosition, AttestationRecord, AuditEventRecord } from "@/lib/types";
import { validateSameOrigin, createOriginForbiddenResponse } from "@/lib/auth/origin-validation";

const AttestationSchema = z.object({
  exceptionId: z.string().min(1, "exceptionId is required"),
  partyRole: z.enum(["RECEIVER", "DRIVER", "SYSTEM", "OPS"]),
  position: z.enum([
    "CONFIRM",
    "DISPUTE",
    "NO_KNOWLEDGE",
    "NOT_ASKED",
    "REFUSED_TO_ATTEST",
    "DRIVER_UNAVAILABLE",
  ]),
  sourceTurnId: z.string().nullable().optional(),
});

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
    const json = await request.json();
    const body = AttestationSchema.parse(json);

    const incident = await repository.getIncident(id);
    if (!incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    // Validate that exception exists and belongs to this incident
    const exceptions = await repository.getExceptions(id);
    const targetException = exceptions.find((e) => e.id === body.exceptionId);
    if (!targetException) {
      return NextResponse.json(
        { error: `Exception '${body.exceptionId}' not found in incident '${id}'` },
        { status: 404 }
      );
    }

    let resolvedSourceTurnId: string | null = null;
    let provenanceType = "MANUAL_ENTRY";

    if (body.sourceTurnId && body.sourceTurnId.trim()) {
      const turns = await repository.getTurns(id);
      const matchedTurn = turns.find((t) => t.id === body.sourceTurnId);
      resolvedSourceTurnId = matchedTurn ? matchedTurn.id : body.sourceTurnId;
      provenanceType = matchedTurn ? "SPOKEN_TRANSCRIPT" : "REFERENCE_ID";
    }

    // 1. Fetch all existing observations and attestations
    const allObservations = await repository.getObservations(id);
    const allAttestations = await repository.getAttestations(id);

    // Reconstruct Receiver Position grounded in genuine receiver provenance
    let receiverPos: AttestationPosition = resolveReceiverPosition(
      targetException,
      allAttestations,
      allObservations
    );
    if (body.partyRole === "RECEIVER") {
      receiverPos = body.position as AttestationPosition;
    }

    // Reconstruct Driver Position
    const driverAtt = allAttestations
      .filter((a) => a.exceptionId === body.exceptionId && a.partyRole === "DRIVER")
      .pop();
    let driverPos: AttestationPosition = driverAtt ? driverAtt.position : "NOT_ASKED";
    if (body.partyRole === "DRIVER") {
      driverPos = body.position as AttestationPosition;
    }

    const newStatus = evaluateAgreement(receiverPos, driverPos);

    // 2. Prepare atomic persistence records
    const attestationId = `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();

    const attestationRecord: AttestationRecord = {
      id: attestationId,
      incidentId: id,
      exceptionId: body.exceptionId,
      partyRole: body.partyRole,
      position: body.position as AttestationPosition,
      sourceTurnId: resolvedSourceTurnId || undefined,
      createdAt: nowIso,
    };

    const auditEventRecord: AuditEventRecord = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      incidentId: id,
      actor: body.partyRole,
      eventType: "ATTESTATION_RECORDED",
      payloadJson: {
        exceptionId: body.exceptionId,
        position: body.position,
        resultingStatus: newStatus,
        sourceTurnId: resolvedSourceTurnId,
        provenance: provenanceType,
      },
      createdAt: nowIso,
    };

    // 3. Execute atomic transaction (Attestation + Exception Agreement Status + Audit Event)
    const atomicResult = await repository.recordAttestationAtomic({
      attestation: attestationRecord,
      exceptionId: body.exceptionId,
      newAgreementStatus: newStatus,
      auditEvent: auditEventRecord,
    });

    const attestation = atomicResult.attestation;

    // Unified API response contract: { ...attestation, attestation, agreementStatus }
    return NextResponse.json(
      {
        ...attestation,
        attestation,
        agreementStatus: newStatus,
        id: attestation.id, // For backward compatibility with callers reading data.id
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0]?.message || "Validation failed" }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
