import { NextResponse } from "next/server";
import { z } from "zod";
import { repository } from "@/lib/repository";
import { calculateDiscrepancy } from "@/lib/domain/quantity-engine";
import { damageExtractor } from "@/lib/domain/damage-extractor";
import { SEED_SHIPMENTS } from "@/lib/seeds/shipments";
import { DiscrepancyException, ObservationRecord } from "@/lib/types";
import { validateSameOrigin, createOriginForbiddenResponse } from "@/lib/auth/origin-validation";

const ObservationSchema = z.object({
  observedQty: z
    .number({
      invalid_type_error: "Quantity must be a valid number.",
    })
    .refine((v) => Number.isInteger(v), {
      message: "Quantity must be a whole number.",
    })
    .refine((v) => v >= 0, {
      message: "Quantity cannot be negative.",
    })
    .refine((v) => v <= 100000, {
      message: "Quantity exceeds the supported receiving limit.",
    })
    .optional(),
  reason: z.string().default("Observation recorded"),
  actor: z.enum(["RECEIVER", "OPS", "SYSTEM"]).default("RECEIVER"),
  isOverridden: z.boolean().default(false),
  sourceQuote: z.string().optional(),
  originalSpokenQuantity: z.number().int().nullable().optional(),
  fieldKey: z.string().optional(),
  damageDescription: z.string().optional(),
  cartonReference: z.string().optional(),
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
    const body = ObservationSchema.parse(json);

    const incident = await repository.getIncident(id);
    if (!incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    // Resolve shipment to get expectedQty and valid shipmentItemId
    let expectedQty = 48;
    let shipmentItemId: string | undefined;
    try {
      const shipment = await repository.getShipment(incident.shipmentId);
      if (shipment?.items?.[0]) {
        expectedQty = shipment.items[0].expectedQty;
        shipmentItemId = shipment.items[0].id;
      } else {
        const seed = SEED_SHIPMENTS.find((s) => s.id === incident.shipmentId || s.poNumber === incident.shipmentId);
        if (seed?.items?.[0]) {
          expectedQty = seed.items[0].expectedQty;
          shipmentItemId = seed.items[0].id;
        }
      }
    } catch {
      // Use fallback
    }

    let countObservation: ObservationRecord | null = null;
    let discrepancyResult: ReturnType<typeof calculateDiscrepancy> | null = null;
    let qtyExceptionRecord: DiscrepancyException | null = null;

    // 1. Process Count Observation & Shortage/Overage Exception
    if (typeof body.observedQty === "number") {
      discrepancyResult = calculateDiscrepancy(expectedQty, body.observedQty);
      const obsId = `obs-count-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const nowIso = new Date().toISOString();

      let excParam = null;
      if (discrepancyResult.type) {
        excParam = {
          id: `exc-qty-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          incidentId: id,
          shipmentItemId: shipmentItemId || undefined,
          type: discrepancyResult.type,
          expectedQty,
          observedQty: body.observedQty,
          delta: discrepancyResult.delta,
          agreementStatus: "PENDING_REVIEW" as const,
          createdAt: nowIso,
        };
      }

      const countAtomic = await repository.recordObservationAtomic({
        observation: {
          id: obsId,
          incidentId: id,
          fieldKey: "observed_qty",
          valueJson: {
            observedQty: body.observedQty,
            overrideReason: body.reason,
            isOverridden: body.isOverridden,
            originalSpokenQuantity: body.originalSpokenQuantity ?? null,
          },
          sourceQuote: body.sourceQuote || `Count adjustment to ${body.observedQty} (${body.reason})`,
          speakerRole: (body.actor === "OPS" ? "OPS" : "RECEIVER") as "OPS" | "RECEIVER",
          confidence: 1.0,
          confirmed: true,
          createdAt: nowIso,
        },
        exception: excParam,
        actor: body.actor,
        auditEvent: {
          id: `audit-count-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          incidentId: id,
          actor: body.actor,
          eventType: body.isOverridden ? "OBSERVATION_CORRECTED" : "OBSERVATION_RECORDED",
          payloadJson: {
            fieldKey: "observed_qty",
            observedQty: body.observedQty,
            expectedQty,
            delta: discrepancyResult.delta,
            discrepancyType: discrepancyResult.type,
            reason: body.reason,
            previousSpokenQuantity: body.originalSpokenQuantity ?? null,
          },
          createdAt: nowIso,
        },
      });

      countObservation = countAtomic.observation;
      qtyExceptionRecord = countAtomic.exception;
    }

    // 2. Process Damage Observation & Exception (Atomically Preserving Both)
    let damageResult: {
      observation: ObservationRecord;
      exception: DiscrepancyException;
      auditEvent: any;
    } | null = null;

    const damageInfo = body.sourceQuote ? damageExtractor.extractDamage(body.sourceQuote) : null;
    const hasDamage = Boolean(damageInfo || body.damageDescription || body.fieldKey === "damage_reported");

    if (hasDamage) {
      const condition = damageInfo?.condition || body.damageDescription || "damaged";
      const cartonRef = damageInfo?.cartonReference || body.cartonReference || null;
      const dmgQuote = damageInfo?.sourceQuote || body.sourceQuote || `Damage: ${condition}`;

      damageResult = await repository.recordDamageObservationAtomic({
        observationId: `obs-dmg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        incidentId: id,
        damageDescription: condition,
        cartonReference: cartonRef,
        sourceTurnId: null,
        sourceQuote: dmgQuote,
        speakerRole: body.actor === "OPS" ? "OPS" : "RECEIVER",
        confidence: damageInfo?.confidence ?? 1.0,
        confirmed: true,
        exceptionId: `exc-dmg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        shipmentItemId: shipmentItemId || "item-default",
        auditId: `audit-dmg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        actor: body.actor,
        eventType: "OBSERVATION_RECORDED",
        auditPayload: {
          fieldKey: "damage_reported",
          damageDescription: condition,
          cartonReference: cartonRef,
          sourceQuote: dmgQuote,
        },
      });
    }

    if (!countObservation && !damageResult) {
      return NextResponse.json(
        { error: "Observation must include observedQty or damage report" },
        { status: 400 }
      );
    }

    const allExceptions = await repository.getExceptions(id);

    return NextResponse.json(
      {
        observation: countObservation || damageResult?.observation,
        discrepancy: discrepancyResult,
        exception: qtyExceptionRecord || damageResult?.exception,
        damageObservation: damageResult?.observation || null,
        damageException: damageResult?.exception || null,
        exceptions: allExceptions,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0]?.message || "Validation failed" }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
