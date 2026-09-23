import { describe, it, expect, beforeEach } from "vitest";
import { POST as createIncident, GET as listIncidents } from "@/app/api/incidents/route";
import { GET as getIncident } from "@/app/api/incidents/[id]/route";
import { POST as ingestTurn } from "@/app/api/incidents/[id]/turn/route";
import { POST as extractFacts } from "@/app/api/incidents/[id]/extract/route";
import { repository } from "@/lib/repository";

describe("Incidents API Routes Integration Suite", () => {
  let incidentId: string;

  beforeEach(async () => {
    // Create a fresh incident for tests
    const req = new Request("http://localhost:3000/api/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shipmentId: "shipment-po44891",
        receiverName: "Marcus Vance",
        driverName: "Dave Miller",
      }),
    });
    const res = await createIncident(req);
    const data = await res.json();
    incidentId = data.id;
  });

  describe("POST & GET /api/incidents", () => {
    it("creates an incident in DRAFT state with an audit event", async () => {
      const req = new Request("http://localhost:3000/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipmentId: "shipment-po44891",
          receiverName: "Marcus Vance",
        }),
      });
      const res = await createIncident(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toMatch(/^incident-/);
      expect(data.status).toBe("DRAFT");
      expect(data.shipmentId).toBe("shipment-po44891");

      const auditEvents = await repository.getAuditEvents(data.id);
      expect(auditEvents.length).toBeGreaterThanOrEqual(1);
      expect(auditEvents[0].eventType).toBe("INCIDENT_CREATED");
    });

    it("rejects invalid payload without shipmentId", async () => {
      const req = new Request("http://localhost:3000/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiverName: "Marcus Vance" }),
      });
      const res = await createIncident(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    it("lists incidents with query filter", async () => {
      const req = new Request(`http://localhost:3000/api/incidents?shipmentId=shipment-po44891`);
      const res = await listIncidents(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("GET /api/incidents/[id]", () => {
    it("returns 404 for non-existent incident", async () => {
      const req = new Request("http://localhost:3000/api/incidents/incident-unknown-8888");
      const res = await getIncident(req, { params: Promise.resolve({ id: "incident-unknown-8888" }) });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("not found");
    });

    it("returns full incident with turns and audit events", async () => {
      const req = new Request(`http://localhost:3000/api/incidents/${incidentId}`);
      const res = await getIncident(req, { params: Promise.resolve({ id: incidentId }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe(incidentId);
      expect(Array.isArray(data.turns)).toBe(true);
      expect(Array.isArray(data.auditEvents)).toBe(true);
    });
  });

  describe("POST /api/incidents/[id]/turn", () => {
    it("persists speech turn and transitions incident status to CAPTURING", async () => {
      const req = new Request(`http://localhost:3000/api/incidents/${incidentId}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speakerRole: "RECEIVER",
          text: "I have forty-seven cartons.",
          isFinal: true,
        }),
      });

      const res = await ingestTurn(req, { params: Promise.resolve({ id: incidentId }) });
      expect(res.status).toBe(201);
      const turn = await res.json();
      expect(turn.incidentId).toBe(incidentId);
      expect(turn.speakerRole).toBe("RECEIVER");
      expect(turn.text).toBe("I have forty-seven cartons.");

      // Verify incident transitioned to CAPTURING
      const updatedInc = await repository.getIncident(incidentId);
      expect(updatedInc!.status).toBe("CAPTURING");

      // Verify SPEECH_TURN_COMMITTED audit event
      const audit = await repository.getAuditEvents(incidentId);
      expect(audit.some((a) => a.eventType === "SPEECH_TURN_COMMITTED")).toBe(true);
    });

    it("rejects empty text with 400", async () => {
      const req = new Request(`http://localhost:3000/api/incidents/${incidentId}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speakerRole: "RECEIVER",
          text: "   ",
        }),
      });
      const res = await ingestTurn(req, { params: Promise.resolve({ id: incidentId }) });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/incidents/[id]/extract", () => {
    it("extracts candidate quantity and deterministically computes discrepancy", async () => {
      // PO 44891 expectedQty is 48. Speech observed is 47.
      const req = new Request(`http://localhost:3000/api/incidents/${incidentId}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "I have forty-seven cartons. Carton thirty-one has crushed edges.",
          speakerRole: "RECEIVER",
        }),
      });

      const res = await extractFacts(req, { params: Promise.resolve({ id: incidentId }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.incidentId).toBe(incidentId);
      expect(data.candidates.length).toBeGreaterThanOrEqual(1);

      const qtyCandidate = data.candidates.find((c: any) => c.type === "OBSERVED_QUANTITY");
      expect(qtyCandidate).toBeDefined();
      expect(qtyCandidate.value).toBe(47);

      // Deterministic discrepancy calculation: 47 - 48 = -1 (SHORTAGE: 1)
      expect(data.discrepancy).toEqual({
        delta: -1,
        type: "SHORTAGE",
        magnitude: 1,
        observedQty: 47,
        expectedQty: 48,
      });

      // Damage candidate also captured
      const dmgCandidate = data.candidates.find((c: any) => c.type === "DAMAGE_REPORT");
      expect(dmgCandidate).toBeDefined();
      expect(dmgCandidate.condition).toBe("crushed");
    });
  });

  describe("Cross-Origin & Mutation Boundary Protection", () => {
    it("strictly rejects hostile cross-origin mutating calls on all incident routes", async () => {
      const endpoints = [
        {
          name: "POST /api/incidents",
          handler: () =>
            createIncident(
              new Request("http://localhost:3000/api/incidents", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Origin: "https://evil-tenant.vercel.app",
                  "x-test-enforce-origin": "true",
                },
                body: JSON.stringify({ shipmentId: "shipment-po44891" }),
              })
            ),
        },
        {
          name: "POST /api/incidents/[id]/turn",
          handler: () =>
            ingestTurn(
              new Request(`http://localhost:3000/api/incidents/${incidentId}/turn`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Origin: "https://evil-tenant.vercel.app",
                  "x-test-enforce-origin": "true",
                },
                body: JSON.stringify({ speakerRole: "RECEIVER", text: "count 47" }),
              }),
              { params: Promise.resolve({ id: incidentId }) }
            ),
        },
        {
          name: "POST /api/incidents/[id]/extract",
          handler: () =>
            extractFacts(
              new Request(`http://localhost:3000/api/incidents/${incidentId}/extract`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Origin: "https://evil-tenant.vercel.app",
                  "x-test-enforce-origin": "true",
                },
                body: JSON.stringify({ text: "forty-seven cartons" }),
              }),
              { params: Promise.resolve({ id: incidentId }) }
            ),
        },
      ];

      for (const ep of endpoints) {
        const res = await ep.handler();
        expect(res.status, `${ep.name} must return 403 Forbidden on hostile origin`).toBe(403);
        const data = await res.json();
        expect(data.error).toMatch(/Forbidden/i);
      }
    });

    it("rejects mutating calls missing Origin or Referer headers when origin validation is enforced", async () => {
      const req = new Request("http://localhost:3000/api/incidents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-enforce-origin": "true",
        },
        body: JSON.stringify({ shipmentId: "shipment-po44891" }),
      });

      const res = await createIncident(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Missing Origin or Referer/i);
    });
  });
});
