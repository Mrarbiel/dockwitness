import { describe, it, expect, beforeEach } from "vitest";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { POST as createIncident } from "@/app/api/incidents/route";
import { POST as recordObservation } from "@/app/api/incidents/[id]/observation/route";
import { executeVoiceAgentTool } from "@/lib/assemblyai/voice-agent-tools";
import { repository } from "@/lib/repository";

describe("Adversarial Combined Damage & Shortage Persistence Suite (Finding 1 - P0)", () => {
  let incidentId: string;

  beforeEach(async () => {
    const req = new Request("http://localhost:3000/api/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shipmentId: "shipment-po44891",
        status: "CAPTURING",
      }),
    });
    const res = await createIncident(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    incidentId = data.id;
  });

  it("atomically persists BOTH SHORTAGE and DAMAGE exceptions from a combined spoken utterance", async () => {
    const combinedUtterance = "I have forty-seven cartons. Carton thirty-one is crushed underneath and wet on the right side.";

    const obsReq = new Request(`http://localhost:3000/api/incidents/${incidentId}/observation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        observedQty: 47,
        reason: "Receiver voice statement via Voice Agent",
        actor: "RECEIVER",
        sourceQuote: combinedUtterance,
      }),
    });

    const obsRes = await recordObservation(obsReq, { params: Promise.resolve({ id: incidentId }) });
    expect(obsRes.status).toBe(201);
    const data = await obsRes.json();

    // 1. Verify response structure
    expect(data.observation).toBeDefined();
    expect(data.observation.fieldKey).toBe("observed_qty");
    expect(data.discrepancy).toBeDefined();
    expect(data.discrepancy.type).toBe("SHORTAGE");
    expect(data.discrepancy.delta).toBe(-1);

    expect(data.damageObservation).toBeDefined();
    expect(data.damageObservation.fieldKey).toBe("damage_reported");
    expect(data.damageException).toBeDefined();
    expect(data.damageException.type).toBe("DAMAGE");

    // 2. Query repository directly to verify zero clobbering in persistent storage
    const storedExceptions = await repository.getExceptions(incidentId);
    expect(storedExceptions).toHaveLength(2);

    const shortageExc = storedExceptions.find((e) => e.type === "SHORTAGE");
    const damageExc = storedExceptions.find((e) => e.type === "DAMAGE");

    expect(shortageExc).toBeDefined();
    expect(shortageExc!.expectedQty).toBe(48);
    expect(shortageExc!.observedQty).toBe(47);
    expect(shortageExc!.delta).toBe(-1);
    expect(shortageExc!.agreementStatus).toBe("PENDING_REVIEW");

    expect(damageExc).toBeDefined();
    expect(damageExc!.expectedQty).toBe(48);
    expect(damageExc!.delta).toBe(0);
    expect(damageExc!.damageDescription).toMatch(/crushed.*wet/i);
    expect(damageExc!.agreementStatus).toBe("PENDING_REVIEW");

    // 3. Verify observations provenance
    const storedObservations = await repository.getObservations(incidentId);
    expect(storedObservations.length).toBeGreaterThanOrEqual(2);

    const countObs = storedObservations.find((o) => o.fieldKey === "observed_qty");
    const dmgObs = storedObservations.find((o) => o.fieldKey === "damage_reported");

    expect(countObs).toBeDefined();
    expect((countObs!.valueJson as Record<string, any>).observedQty).toBe(47);
    expect(countObs!.speakerRole).toBe("RECEIVER");

    expect(dmgObs).toBeDefined();
    expect((dmgObs!.valueJson as Record<string, any>).damageDescription).toMatch(/crushed.*wet/i);
    expect(dmgObs!.speakerRole).toBe("RECEIVER");

    // 4. Verify immutable audit events ledger
    const auditEvents = await repository.getAuditEvents(incidentId);
    expect(auditEvents.length).toBeGreaterThanOrEqual(2);
  });

  it("handles standalone damage observation without count and creates DAMAGE exception", async () => {
    const damageUtterance = "Carton twelve is punctured and leaking fluid.";

    const obsReq = new Request(`http://localhost:3000/api/incidents/${incidentId}/observation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "Damage reported by receiver",
        actor: "RECEIVER",
        sourceQuote: damageUtterance,
        fieldKey: "damage_reported",
      }),
    });

    const obsRes = await recordObservation(obsReq, { params: Promise.resolve({ id: incidentId }) });
    expect(obsRes.status).toBe(201);
    const data = await obsRes.json();

    expect(data.damageObservation).toBeDefined();
    expect(data.damageException).toBeDefined();
    expect(data.damageException.type).toBe("DAMAGE");

    const storedExceptions = await repository.getExceptions(incidentId);
    const damageExc = storedExceptions.find((e) => e.type === "DAMAGE");
    expect(damageExc).toBeDefined();
    expect(damageExc!.damageDescription).toMatch(/punctured/i);
  });

  it("executes voice agent tool and preserves both exceptions via tool dispatcher", async () => {
    // Mock fetch for executeVoiceAgentTool
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = url.toString();
      if (urlStr.includes(`/api/incidents/${incidentId}/observation`)) {
        const fullUrl = urlStr.startsWith("http") ? urlStr : `http://localhost:3000${urlStr}`;
        const req = new Request(fullUrl, init);
        return recordObservation(req, { params: Promise.resolve({ id: incidentId }) });
      }
      return originalFetch(url, init);
    };

    try {
      const toolResult = await executeVoiceAgentTool(
        "record_candidate_observation",
        {
          incidentId,
          fieldKey: "observed_qty",
          value: 47,
          quote: "I have forty-seven cartons. Carton thirty-one is crushed underneath and wet on the right side.",
        },
        ""
      );

      expect(toolResult.recorded).toBe(true);
      expect(toolResult.observedQuantity).toBe(47);
      expect(toolResult.exceptions).toBeDefined();
      expect((toolResult.exceptions as any[]).length).toBe(2);

      const storedExceptions = await repository.getExceptions(incidentId);
      expect(storedExceptions).toHaveLength(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("enforces fail-closed validation: negative quantity is rejected without partial writes", async () => {
    const beforeObs = await repository.getObservations(incidentId);
    const beforeExc = await repository.getExceptions(incidentId);
    const beforeAudit = await repository.getAuditEvents(incidentId);

    const badReq = new Request(`http://localhost:3000/api/incidents/${incidentId}/observation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        observedQty: -5,
        reason: "Invalid negative count",
      }),
    });

    const badRes = await recordObservation(badReq, { params: Promise.resolve({ id: incidentId }) });
    expect(badRes.status).toBe(400);

    const afterObs = await repository.getObservations(incidentId);
    const afterExc = await repository.getExceptions(incidentId);
    const afterAudit = await repository.getAuditEvents(incidentId);

    expect(afterObs.length).toBe(beforeObs.length);
    expect(afterExc.length).toBe(beforeExc.length);
    expect(afterAudit.length).toBe(beforeAudit.length);
  });
});
