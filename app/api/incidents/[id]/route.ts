import { NextResponse } from "next/server";
import { repository } from "@/lib/repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const incident = await repository.getIncident(id);
  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  const [turns, exceptions, observations, evidence, attestations, auditEvents] = await Promise.all([
    repository.getTurns(id),
    repository.getExceptions(id),
    repository.getObservations(id),
    repository.getEvidence(id),
    repository.getAttestations(id),
    repository.getAuditEvents(id),
  ]);

  return NextResponse.json({
    ...incident,
    turns,
    exceptions,
    observations,
    evidence,
    attestations,
    auditEvents,
  });
}

