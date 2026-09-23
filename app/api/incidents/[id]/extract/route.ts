import { NextResponse } from "next/server";
import { repository } from "@/lib/repository";
import {
  extractCandidateQuantity,
  extractCandidateDamage,
} from "@/lib/extraction";
import { calculateDiscrepancy } from "@/lib/domain/quantity-engine";
import { DiscrepancyException } from "@/lib/types";
import { z } from "zod";
import { validateSameOrigin, createOriginForbiddenResponse } from "@/lib/auth/origin-validation";

const ExtractRequestBodySchema = z.object({
  text: z.string().min(1, "Text cannot be empty"),
  turnId: z.string().nullable().optional(),
  speakerRole: z.enum(["RECEIVER", "DRIVER", "SYSTEM", "OPS"]).nullable().optional(),
  words: z
    .array(
      z.object({
        text: z.string(),
        start: z.number().optional(),
        end: z.number().optional(),
        confidence: z.number().optional(),
      })
    )
    .optional(),
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
    const body = ExtractRequestBodySchema.parse(json);

    // 1. Fetch incident
    const incident = await repository.getIncident(id);
    if (!incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    // 2. Fetch shipment manifest for expected quantity
    const shipment = await repository.getShipment(incident.shipmentId);
    const expectedQty = shipment?.items?.[0]?.expectedQty;

    // 3. Extract candidate facts
    // INVARIANT: Extraction produces candidate observedQty and source quotes ONLY. NEVER computes delta math.
    const candidateQty = extractCandidateQuantity(body.text, {
      sourceTurnId: body.turnId || undefined,
      speakerRole: body.speakerRole || undefined,
      words: body.words,
    });

    const candidateDamage = extractCandidateDamage(body.text, {
      sourceTurnId: body.turnId || undefined,
      speakerRole: body.speakerRole || undefined,
    });

    const candidates: Array<Record<string, unknown>> = [];
    let discrepancyResult = null;
    const createdExceptions: DiscrepancyException[] = [];

    if (candidateQty) {
      candidates.push({
        type: "OBSERVED_QUANTITY",
        value: candidateQty.observedQty,
        unit: candidateQty.unit,
        sourceQuote: candidateQty.sourceQuote,
        startIndex: candidateQty.startIndex,
        endIndex: candidateQty.endIndex,
        confidence: candidateQty.confidence,
        sourceTurnId: candidateQty.sourceTurnId,
        speakerRole: candidateQty.speakerRole,
        extractor: candidateQty.extractor,
      });

      // 4. Deterministic discrepancy calculation (pure TypeScript math in domain engine)
      if (typeof expectedQty === "number") {
        discrepancyResult = calculateDiscrepancy(expectedQty, candidateQty.observedQty);
      }

      // 5. Persist observation provenance
      let resolvedTurnId: string | null = null;
      if (candidateQty.sourceTurnId) {
        const turns = await repository.getTurns(id);
        const matched = turns.find((t) => t.id === candidateQty.sourceTurnId);
        resolvedTurnId = matched ? matched.id : null;
      }

      await repository.saveObservation({
        id: `obs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        incidentId: id,
        fieldKey: "observed_qty",
        valueJson: {
          observedQty: candidateQty.observedQty,
          unit: candidateQty.unit,
        },
        sourceTurnId: resolvedTurnId,
        sourceQuote: candidateQty.sourceQuote,
        speakerRole: candidateQty.speakerRole || "RECEIVER",
        confidence: candidateQty.confidence,
        confirmed: true,
        createdAt: new Date().toISOString(),
      });

    // 6. If discrepancy detected, persist exception
    if (
      discrepancyResult &&
      discrepancyResult.type !== null &&
      shipment?.items?.[0] &&
      typeof expectedQty === "number"
    ) {
      const exc = await repository.createException({
        id: `exc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        incidentId: id,
        shipmentItemId: shipment.items[0].id,
        type: discrepancyResult.type,
        expectedQty,
        observedQty: candidateQty.observedQty,
        delta: discrepancyResult.delta,
        damageDescription: candidateDamage?.condition || null,
        agreementStatus: "PENDING_REVIEW",
        createdAt: new Date().toISOString(),
      });
      createdExceptions.push(exc);
    }
  }

  if (candidateDamage) {
    candidates.push({
      type: "DAMAGE_REPORT",
      cartonReference: candidateDamage.cartonReference,
      condition: candidateDamage.condition,
      sourceQuote: candidateDamage.sourceQuote,
      startIndex: candidateDamage.startIndex,
      endIndex: candidateDamage.endIndex,
      confidence: candidateDamage.confidence,
      sourceTurnId: candidateDamage.sourceTurnId,
      speakerRole: candidateDamage.speakerRole,
    });

    // Milestone 3: Wire damage extraction to create exception
    if (shipment?.items?.[0] && typeof expectedQty === "number") {
      const exc = await repository.createException({
        id: `exc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        incidentId: id,
        shipmentItemId: shipment.items[0].id,
        type: "DAMAGE",
        expectedQty,
        observedQty: expectedQty, // Unchanged quantity for purely damage exceptions
        delta: 0,
        damageDescription: candidateDamage.condition,
        agreementStatus: "PENDING_REVIEW",
        createdAt: new Date().toISOString(),
      });
      createdExceptions.push(exc);
    }
  }

  return NextResponse.json({
    incidentId: id,
    candidates,
    discrepancy: discrepancyResult,
    exceptions: createdExceptions,
    processedText: body.text,
    timestamp: new Date().toISOString(),
  });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.errors[0]?.message || "Validation failed" },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

