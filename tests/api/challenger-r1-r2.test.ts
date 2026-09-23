import { describe, it, expect, beforeEach } from "vitest";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { POST as createIncident } from "@/app/api/incidents/route";
import { GET as getIncident } from "@/app/api/incidents/[id]/route";
import { POST as ingestTurn } from "@/app/api/incidents/[id]/turn/route";
import { POST as extractFacts } from "@/app/api/incidents/[id]/extract/route";
import { POST as submitAttestation } from "@/app/api/incidents/[id]/attestation/route";
import { POST as evaluateIncident } from "@/app/api/incidents/[id]/evaluate/route";
import { evaluateReadiness } from "@/lib/domain/readiness-engine";
import { evaluateAgreement } from "@/lib/domain/agreement-engine";
import { repository } from "@/lib/repository";
import { AttestationPosition } from "@/lib/types";

describe("Challenger 1 Empirical Suite: R1 (Session Integrity) & R2 (Readiness & Silence Invariants)", () => {
  let incidentA: string;
  let incidentB: string;

  beforeEach(async () => {
    // Session 1 creation
    const reqA = new Request("http://localhost:3000/api/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shipmentId: "shipment-po44891",
        status: "CAPTURING",
      }),
    });
    const resA = await createIncident(reqA);
    expect(resA.status).toBe(201);
    const dataA = await resA.json();
    incidentA = dataA.id;

    // Session 2 creation (simulating Reset operation)
    const reqB = new Request("http://localhost:3000/api/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shipmentId: "shipment-po44891",
        status: "CAPTURING",
      }),
    });
    const resB = await createIncident(reqB);
    expect(resB.status).toBe(201);
    const dataB = await resB.json();
    incidentB = dataB.id;
  });

  // =========================================================================
  // R1: COCKPIT SESSION INTEGRITY & ISOLATION
  // =========================================================================
  describe("R1: Cockpit Session Integrity & Isolation", () => {
    it("generates distinct persisted incidents on mount and reset", async () => {
      expect(incidentA).toBeDefined();
      expect(incidentB).toBeDefined();
      expect(incidentA).not.toBe(incidentB);

      const recordA = await repository.getIncident(incidentA);
      const recordB = await repository.getIncident(incidentB);

      expect(recordA).not.toBeNull();
      expect(recordB).not.toBeNull();
      expect(recordA!.id).toBe(incidentA);
      expect(recordB!.id).toBe(incidentB);
      expect(recordA!.status).toBe("CAPTURING");
      expect(recordB!.status).toBe("CAPTURING");
      expect(recordA!.incidentNumber).not.toBe(recordB!.incidentNumber);
    });

    it("strictly isolates state between reset sessions (no cross-incident leakage)", async () => {
      // Ingest turn and extract in Session A
      const turnReq = new Request(`http://localhost:3000/api/incidents/${incidentA}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speakerRole: "RECEIVER",
          text: "I counted forty-seven cartons, and carton thirty-one is crushed.",
          isFinal: true,
        }),
      });
      const turnRes = await ingestTurn(turnReq, { params: Promise.resolve({ id: incidentA }) });
      expect(turnRes.status).toBe(201);

      const extReq = new Request(`http://localhost:3000/api/incidents/${incidentA}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "I counted forty-seven cartons, and carton thirty-one is crushed.",
          speakerRole: "RECEIVER",
        }),
      });
      const extRes = await extractFacts(extReq, { params: Promise.resolve({ id: incidentA }) });
      expect(extRes.status).toBe(200);

      // Verify Session A has turns, observations, and exceptions
      const turnsA = await repository.getTurns(incidentA);
      const obsA = await repository.getObservations(incidentA);
      const excA = await repository.getExceptions(incidentA);

      expect(turnsA.length).toBeGreaterThanOrEqual(1);
      expect(obsA.length).toBeGreaterThanOrEqual(1);
      expect(excA.length).toBeGreaterThanOrEqual(1);

      // Verify Session B (the reset session) is completely empty and unpolluted
      const turnsB = await repository.getTurns(incidentB);
      const obsB = await repository.getObservations(incidentB);
      const excB = await repository.getExceptions(incidentB);

      expect(turnsB.length).toBe(0);
      expect(obsB.length).toBe(0);
      expect(excB.length).toBe(0);
    });

    it("attestation referencing real exception ID records attestation and evaluates agreement", async () => {
      // 1. Receiver speech extraction creates exception
      const extReq = new Request(`http://localhost:3000/api/incidents/${incidentA}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "We received forty-seven cartons instead of forty-eight.",
          speakerRole: "RECEIVER",
        }),
      });
      const extRes = await extractFacts(extReq, { params: Promise.resolve({ id: incidentA }) });
      expect(extRes.status).toBe(200);
      const extData = await extRes.json();

      expect(extData.exceptions).toBeDefined();
      expect(extData.exceptions.length).toBeGreaterThanOrEqual(1);
      const realException = extData.exceptions[0];
      expect(realException.id).toMatch(/^exc-/);

      // 2. Receiver confirms shortage
      const rxAttReq = new Request(`http://localhost:3000/api/incidents/${incidentA}/attestation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exceptionId: realException.id,
          partyRole: "RECEIVER",
          position: "CONFIRM",
        }),
      });
      const rxAttRes = await submitAttestation(rxAttReq, { params: Promise.resolve({ id: incidentA }) });
      expect(rxAttRes.status).toBe(201);

      // 3. Driver disputes shortage
      const drvAttReq = new Request(`http://localhost:3000/api/incidents/${incidentA}/attestation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exceptionId: realException.id,
          partyRole: "DRIVER",
          position: "DISPUTE",
        }),
      });
      const drvAttRes = await submitAttestation(drvAttReq, { params: Promise.resolve({ id: incidentA }) });
      expect(drvAttRes.status).toBe(201);
      const evalData = await drvAttRes.json();

      // 4. Verify exception agreement status in repository evaluates to DISPUTED
      const updatedExceptions = await repository.getExceptions(incidentA);
      const updatedExc = updatedExceptions.find((e) => e.id === realException.id);
      expect(updatedExc).toBeDefined();
      expect(updatedExc!.agreementStatus).toBe("DISPUTED");
    }, 20000);

    it("rejects attestation with nonexistent exception ID with HTTP 404", async () => {
      const attReq = new Request(`http://localhost:3000/api/incidents/${incidentA}/attestation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exceptionId: "nonexistent-synthetic-exc-99999",
          partyRole: "DRIVER",
          position: "CONFIRM",
        }),
      });
      const attRes = await submitAttestation(attReq, { params: Promise.resolve({ id: incidentA }) });
      expect(attRes.status).toBe(404);
      const attData = await attRes.json();
      expect(attData.error).toContain("not found in incident");
    });

    it("rejects cross-incident exception attestation injection with HTTP 404", async () => {
      // Create exception in Incident A
      const extReq = new Request(`http://localhost:3000/api/incidents/${incidentA}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "We received forty-seven cartons instead of forty-eight.",
          speakerRole: "RECEIVER",
        }),
      });
      const extRes = await extractFacts(extReq, { params: Promise.resolve({ id: incidentA }) });
      const extData = await extRes.json();
      const excA = extData.exceptions[0];

      // Malicious request: submit attestation to Incident B referencing Exception A
      const crossReq = new Request(`http://localhost:3000/api/incidents/${incidentB}/attestation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exceptionId: excA.id,
          partyRole: "DRIVER",
          position: "CONFIRM",
        }),
      });
      const crossRes = await submitAttestation(crossReq, { params: Promise.resolve({ id: incidentB }) });
      expect(crossRes.status).toBe(404);
      const crossData = await crossRes.json();
      expect(crossData.error).toContain("not found in incident");

      // Verify Incident A's exception was untouched
      const excAList = await repository.getExceptions(incidentA);
      const untouchedExcA = excAList.find((e) => e.id === excA.id);
      expect(untouchedExcA?.agreementStatus).toBe("PENDING_REVIEW");
    });
  });

  // =========================================================================
  // R2: DETERMINISTIC STATE CORRECTNESS & SILENCE INVARIANTS
  // =========================================================================
  describe("R2: Deterministic State Invariants & Silence Invariants", () => {
    it("untouched session evaluated via domain engine MUST NEVER be READY_FOR_OPS_REVIEW", () => {
      const untouchedInput = {
        hasDamage: false,
        hasPhotos: false,
        hasDiscrepancy: false,
        driverAttested: false,
      };

      const result = evaluateReadiness(untouchedInput);
      expect(result.readyForReview).toBe(false);
      expect(result.status).toBe("AWAITING_INSPECTION");
      expect(result.status).not.toBe("READY_FOR_OPS_REVIEW");
      expect(result.missingRequirements).toContain(
        "Receiver count inspection required before review"
      );
    });

    it("untouched session evaluated via /api/incidents/[id]/evaluate API returns AWAITING_INSPECTION", async () => {
      const evalReq = new Request(`http://localhost:3000/api/incidents/${incidentB}/evaluate`, {
        method: "POST",
      });
      const evalRes = await evaluateIncident(evalReq, { params: Promise.resolve({ id: incidentB }) });
      expect(evalRes.status).toBe(200);
      const evalData = await evalRes.json();

      expect(evalData.readiness).toBeDefined();
      expect(evalData.readiness.readyForReview).toBe(false);
      expect(evalData.readiness.status).toBe("AWAITING_INSPECTION");
      expect(evalData.readiness.missingRequirements).toContain(
        "Receiver count inspection required before review"
      );
    });

    it("receiver inspection without quote provenance MUST NEVER be READY_FOR_OPS_REVIEW", () => {
      const inspectedNoProvenance = {
        hasDamage: false,
        hasPhotos: false,
        hasDiscrepancy: false,
        driverAttested: false,
        receiverInspected: true,
        observedQuantity: 48,
        hasQuoteProvenance: false,
      };

      const result = evaluateReadiness(inspectedNoProvenance);
      expect(result.readyForReview).toBe(false);
      expect(result.status).toBe("AWAITING_INSPECTION");
      expect(result.missingRequirements).toContain(
        "Verbatim transcript quote provenance required"
      );
    });

    it("packaging silence (hasDamage = false) MUST NEVER produce CONFIRMED_BY_BOTH", () => {
      const positions: AttestationPosition[] = ["CONFIRM", "DISPUTE", "NO_KNOWLEDGE", "NOT_ASKED"];

      for (const driverPos of positions) {
        const agreementStatus = evaluateAgreement("NOT_ASKED", driverPos);
        expect(agreementStatus).not.toBe("CONFIRMED_BY_BOTH");
      }
    });

    it("silence or lack of knowledge from driver NEVER produces CONFIRMED_BY_BOTH", () => {
      const positions: AttestationPosition[] = ["CONFIRM", "DISPUTE", "NO_KNOWLEDGE", "NOT_ASKED"];

      for (const rxPos of positions) {
        // Driver silent:
        expect(evaluateAgreement(rxPos, "NOT_ASKED")).not.toBe("CONFIRMED_BY_BOTH");
        // Driver NO_KNOWLEDGE:
        expect(evaluateAgreement(rxPos, "NO_KNOWLEDGE")).not.toBe("CONFIRMED_BY_BOTH");
      }
    });

    it("exhaustive combinatorial verification of evaluateReadiness", () => {
      const booleans = [false, true];
      let validReadyCount = 0;

      for (const hasDamage of booleans) {
        for (const hasPhotos of booleans) {
          for (const hasDiscrepancy of booleans) {
            for (const driverAttested of booleans) {
              for (const rxInspected of [undefined, false, true]) {
                for (const hasQuoteProvenance of booleans) {
                  for (const obsQty of [null, 48]) {
                    const isInspected = rxInspected ?? (obsQty !== null);

                    const res = evaluateReadiness({
                      hasDamage,
                      hasPhotos,
                      hasDiscrepancy,
                      driverAttested,
                      receiverInspected: rxInspected,
                      observedQuantity: obsQty,
                      hasQuoteProvenance,
                    });

                    if (!isInspected || !hasQuoteProvenance) {
                      expect(res.readyForReview).toBe(false);
                      expect(res.status).toBe("AWAITING_INSPECTION");
                    } else if (hasDamage && !hasPhotos) {
                      expect(res.readyForReview).toBe(false);
                      expect(res.status).toBe("BLOCKED_PHOTO_REQUIRED");
                    } else if (hasDiscrepancy && !driverAttested) {
                      expect(res.readyForReview).toBe(false);
                      expect(res.status).toBe("PENDING_DRIVER_ATTESTATION");
                    } else {
                      expect(res.readyForReview).toBe(true);
                      expect(res.status).toBe("READY_FOR_OPS_REVIEW");
                      expect(res.missingRequirements.length).toBe(0);
                      validReadyCount++;
                    }
                  }
                }
              }
            }
          }
        }
      }

      expect(validReadyCount).toBeGreaterThan(0);
    });
  });
});
