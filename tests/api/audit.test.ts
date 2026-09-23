import { describe, it, expect, beforeEach } from "vitest";
import { GET as getAudit, POST as postAudit } from "@/app/api/incidents/[id]/audit/route";
import { repository } from "@/lib/repository";

describe("Milestone 5: Incident Audit Ledger API Route Suite", () => {
  let testIncidentId: string;

  beforeEach(async () => {
    testIncidentId = `incident-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    // Seed initial incident
    await repository.createIncident({
      id: testIncidentId,
      shipmentId: "shipment-po44891",
      incidentNumber: `INC-TEST-${Date.now().toString().slice(-4)}-${Math.random().toString(36).slice(2, 6)}`,
      status: "DRAFT",
      receiverName: "Marcus Vance",
      driverName: "Dave Miller",
      startedAt: new Date().toISOString(),
    });
  });

  it("GET /api/incidents/[id]/audit returns auditEvents list", async () => {
    // Append initial event through server repository
    await repository.appendAuditEvent({
      id: `audit-evt-${Date.now()}`,
      incidentId: testIncidentId,
      actor: "RECEIVER",
      eventType: "INCIDENT_CREATED",
      payloadJson: { status: "DRAFT" },
      createdAt: new Date().toISOString(),
    });

    const req = new Request(`http://localhost:3000/api/incidents/${testIncidentId}/audit`);
    const res = await getAudit(req, { params: Promise.resolve({ id: testIncidentId }) });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.incidentId).toBe(testIncidentId);
    expect(Array.isArray(data.auditEvents)).toBe(true);
    expect(data.auditEvents.length).toBeGreaterThanOrEqual(1);
    expect(data.auditEvents[0].eventType).toBe("INCIDENT_CREATED");
  });

  it("strictly rejects direct client POST to /audit with HTTP 405 (No Client-Fabricated Audit)", async () => {
    // Attempting direct client injection of a fabricated audit event
    const req = new Request(`http://localhost:3000/api/incidents/${testIncidentId}/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actor: "DRIVER",
        eventType: "FABRICATED_EVENT",
        payloadJson: { fake: true },
        createdAt: "1999-01-01T00:00:00.000Z",
      }),
    });

    const res = await postAudit();
    expect(res.status).toBe(405);

    const body = await res.json();
    expect(body.error).toMatch(/Method Not Allowed/i);
    expect(body.error).toMatch(/Direct client append to audit ledger is forbidden/i);

    // Verify nothing was injected into repository
    const checkEvents = await repository.getAuditEvents(testIncidentId);
    expect(checkEvents.some((e) => e.eventType === "FABRICATED_EVENT")).toBe(false);
  });
});
