import { NextResponse } from "next/server";
import { repository } from "@/lib/repository";
import { z } from "zod";
import { validateSameOrigin, createOriginForbiddenResponse } from "@/lib/auth/origin-validation";

const CreateIncidentSchema = z.object({
  shipmentId: z.string().trim().min(1, "shipmentId is required"),
  receiverName: z.string().nullable().optional(),
  driverName: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "CAPTURING"]).optional().default("DRAFT"),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const shipmentId = searchParams.get("shipmentId") || undefined;
  const status = searchParams.get("status") || undefined;

  const incidents = await repository.getIncidents({ shipmentId, status });
  return NextResponse.json(incidents);
}

export async function POST(request: Request) {
  const originCheck = validateSameOrigin(request);
  if (!originCheck.isValid) {
    return createOriginForbiddenResponse(originCheck.error);
  }

  try {
    const json = await request.json();
    const body = CreateIncidentSchema.parse(json);

    const now = new Date().toISOString();
    const targetShipment = await repository.getShipment(body.shipmentId);
    if (!targetShipment) {
      return NextResponse.json(
        { error: `Shipment '${body.shipmentId}' not found.` },
        { status: 400 }
      );
    }
    const resolvedShipmentId = targetShipment.id;

    const newIncident = await repository.createIncident({
      id: `incident-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      shipmentId: resolvedShipmentId,
      incidentNumber: `INC-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      status: body.status || "DRAFT",
      receiverName: body.receiverName || null,
      driverName: body.driverName || null,
      startedAt: now,
    });

    // Record immutable audit event
    await repository.appendAuditEvent({
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      incidentId: newIncident.id,
      actor: newIncident.receiverName || "RECEIVER",
      eventType: "INCIDENT_CREATED",
      payloadJson: {
        shipmentId: newIncident.shipmentId,
        incidentNumber: newIncident.incidentNumber,
        status: newIncident.status,
      },
      createdAt: now,
    });

    return NextResponse.json(newIncident, { status: 201 });
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

