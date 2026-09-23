import { NextResponse } from "next/server";
import { repository } from "@/lib/repository";
import { z } from "zod";
import { validateSameOrigin, createOriginForbiddenResponse } from "@/lib/auth/origin-validation";

const IngestTurnSchema = z.object({
  speakerRole: z.enum(["RECEIVER", "DRIVER", "SYSTEM", "OPS"]),
  text: z.string().trim().min(1, "text cannot be empty"),
  isFinal: z.boolean().optional().default(true),
  startMs: z.number().int().nonnegative().optional().default(0),
  endMs: z.number().int().nonnegative().optional().default(0),
  confidence: z.number().min(0).max(1).optional().default(0.95),
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
    const body = IngestTurnSchema.parse(json);

    const incident = await repository.getIncident(id);
    if (!incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const turnRecord = {
      id: `turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      incidentId: id,
      speakerRole: body.speakerRole,
      text: body.text,
      startMs: body.startMs ?? 0,
      endMs: body.endMs ?? 0,
      isFinal: body.isFinal ?? true,
      confidence: body.confidence ?? 0.95,
      createdAt: now,
    };

    const savedTurn = await repository.saveTurn(turnRecord);

    // Transition from DRAFT to CAPTURING on first committed turn
    if (incident.status === "DRAFT") {
      await repository.updateIncident(id, { status: "CAPTURING" });
    }

    // Record immutable audit event
    await repository.appendAuditEvent({
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      incidentId: id,
      actor: body.speakerRole,
      eventType: "SPEECH_TURN_COMMITTED",
      payloadJson: {
        turnId: savedTurn.id,
        speakerRole: body.speakerRole,
        textLength: body.text.length,
        isFinal: savedTurn.isFinal,
      },
      createdAt: now,
    });

    return NextResponse.json(savedTurn, { status: 201 });
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

