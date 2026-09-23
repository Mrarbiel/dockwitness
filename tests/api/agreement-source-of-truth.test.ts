import { describe, it, expect, beforeEach } from "vitest";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { POST as createIncident } from "@/app/api/incidents/route";
import { POST as recordObservation } from "@/app/api/incidents/[id]/observation/route";
import { POST as submitAttestation } from "@/app/api/incidents/[id]/attestation/route";
import { resolveReceiverPosition, evaluateAgreement } from "@/lib/domain/agreement-engine";
import { repository } from "@/lib/repository";
import { DiscrepancyException, ObservationRecord } from "@/lib/types";

describe("Agreement Source of Truth & Deterministic Provenance Suite (Finding 2 - P0)", () => {
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

  it("evaluates Shortage + Driver DISPUTE to DISPUTED based on genuine receiver count provenance", async () => {
    // 1. Receiver reports 47 cartons (Manifest expected 48)
    const obsReq = new Request(`http://localhost:3000/api/incidents/${incidentId}/observation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        observedQty: 47,
        reason: "Receiver incoming count",
        actor: "RECEIVER",
        sourceQuote: "I counted forty-seven cartons.",
      }),
    });
    const obsRes = await recordObservation(obsReq, { params: Promise.resolve({ id: incidentId }) });
    expect(obsRes.status).toBe(201);

    const exceptions = await repository.getExceptions(incidentId);
    const shortageExc = exceptions.find((e) => e.type === "SHORTAGE");
    expect(shortageExc).toBeDefined();
    expect(shortageExc!.agreementStatus).toBe("PENDING_REVIEW");

    // 2. Driver submits DISPUTE
    // Notice: NO synthetic receiver attestation is created.
    // The receiver's position is resolved deterministically from the recorded count observation.
    const drvAttReq = new Request(`http://localhost:3000/api/incidents/${incidentId}/attestation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exceptionId: shortageExc!.id,
        partyRole: "DRIVER",
        position: "DISPUTE",
        sourceTurnId: "turn-driver-dispute-shortage",
      }),
    });
    const drvAttRes = await submitAttestation(drvAttReq, { params: Promise.resolve({ id: incidentId }) });
    expect(drvAttRes.status).toBe(201);
    const drvAttData = await drvAttRes.json();

    expect(drvAttData.agreementStatus).toBe("DISPUTED");

    // 3. Verify direct repository state reflects DISPUTED
    const updatedExceptions = await repository.getExceptions(incidentId);
    const updatedShortage = updatedExceptions.find((e) => e.id === shortageExc!.id);
    expect(updatedShortage!.agreementStatus).toBe("DISPUTED");
  });

  it("evaluates Damage + Driver CONFIRM to CONFIRMED_BY_BOTH based on receiver damage provenance", async () => {
    // 1. Receiver reports carton damage
    const obsReq = new Request(`http://localhost:3000/api/incidents/${incidentId}/observation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "Receiver damage observation",
        actor: "RECEIVER",
        sourceQuote: "Carton thirty-one is crushed underneath and wet on the right side.",
        fieldKey: "damage_reported",
      }),
    });
    const obsRes = await recordObservation(obsReq, { params: Promise.resolve({ id: incidentId }) });
    expect(obsRes.status).toBe(201);

    const exceptions = await repository.getExceptions(incidentId);
    const damageExc = exceptions.find((e) => e.type === "DAMAGE");
    expect(damageExc).toBeDefined();

    // 2. Driver submits CONFIRM on damage
    const drvAttReq = new Request(`http://localhost:3000/api/incidents/${incidentId}/attestation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exceptionId: damageExc!.id,
        partyRole: "DRIVER",
        position: "CONFIRM",
        sourceTurnId: "turn-driver-confirm-damage",
      }),
    });
    const drvAttRes = await submitAttestation(drvAttReq, { params: Promise.resolve({ id: incidentId }) });
    expect(drvAttRes.status).toBe(201);
    const drvAttData = await drvAttRes.json();

    expect(drvAttData.agreementStatus).toBe("CONFIRMED_BY_BOTH");

    // 3. Verify database exception status is CONFIRMED_BY_BOTH
    const updatedExceptions = await repository.getExceptions(incidentId);
    const updatedDamage = updatedExceptions.find((e) => e.id === damageExc!.id);
    expect(updatedDamage!.agreementStatus).toBe("CONFIRMED_BY_BOTH");
  });

  it("preserves silence invariant: exception without receiver observation remains DRIVER_ONLY", async () => {
    // Manually create an exception in the incident without any receiver observation
    const syntheticExc = await repository.createException({
      id: `exc-synthetic-${Date.now()}`,
      incidentId,
      type: "SHORTAGE",
      expectedQty: 48,
      observedQty: 47,
      delta: -1,
      agreementStatus: "PENDING_REVIEW",
      createdAt: new Date().toISOString(),
    });

    // Driver submits DISPUTE
    const drvAttReq = new Request(`http://localhost:3000/api/incidents/${incidentId}/attestation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exceptionId: syntheticExc.id,
        partyRole: "DRIVER",
        position: "DISPUTE",
      }),
    });

    const drvAttRes = await submitAttestation(drvAttReq, { params: Promise.resolve({ id: incidentId }) });
    expect(drvAttRes.status).toBe(201);
    const drvAttData = await drvAttRes.json();

    // Silence is NEVER consent — without receiver observation, status is DRIVER_ONLY
    expect(drvAttData.agreementStatus).toBe("DRIVER_ONLY");

    const updatedExceptions = await repository.getExceptions(incidentId);
    const updatedExc = updatedExceptions.find((e) => e.id === syntheticExc.id);
    expect(updatedExc!.agreementStatus).toBe("DRIVER_ONLY");
  });

  it("pure domain unit test for resolveReceiverPosition edge cases", () => {
    const shortageException: DiscrepancyException = {
      id: "exc-1",
      incidentId: "inc-1",
      type: "SHORTAGE",
      expectedQty: 48,
      observedQty: 47,
      delta: -1,
      agreementStatus: "PENDING_REVIEW",
      createdAt: new Date().toISOString(),
    };

    const damageException: DiscrepancyException = {
      id: "exc-2",
      incidentId: "inc-1",
      type: "DAMAGE",
      expectedQty: 48,
      observedQty: 48,
      delta: 0,
      damageDescription: "Carton crushed",
      agreementStatus: "PENDING_REVIEW",
      createdAt: new Date().toISOString(),
    };

    const rxCountObs: ObservationRecord = {
      id: "obs-1",
      incidentId: "inc-1",
      fieldKey: "observed_qty",
      valueJson: { observedQty: 47 },
      sourceQuote: "I have 47",
      speakerRole: "RECEIVER",
      confidence: 1.0,
      confirmed: true,
      createdAt: new Date().toISOString(),
    };

    const rxDamageObs: ObservationRecord = {
      id: "obs-2",
      incidentId: "inc-1",
      fieldKey: "damage_reported",
      valueJson: { damageDescription: "Carton crushed" },
      sourceQuote: "Carton crushed",
      speakerRole: "RECEIVER",
      confidence: 1.0,
      confirmed: true,
      createdAt: new Date().toISOString(),
    };

    // 1. Matched count observation yields CONFIRM
    expect(resolveReceiverPosition(shortageException, [rxCountObs])).toBe("CONFIRM");

    // 2. Matched damage observation yields CONFIRM
    expect(resolveReceiverPosition(damageException, [rxDamageObs])).toBe("CONFIRM");

    // 3. Silence yields NOT_ASKED
    expect(resolveReceiverPosition(shortageException, [])).toBe("NOT_ASKED");

    // 4. Explicit receiver attestation takes precedence
    const explicitDispute = [
      {
        id: "att-1",
        incidentId: "inc-1",
        exceptionId: "exc-1",
        partyRole: "RECEIVER" as const,
        position: "DISPUTE" as const,
        createdAt: new Date().toISOString(),
      },
    ];
    expect(resolveReceiverPosition(shortageException, explicitDispute, [rxCountObs])).toBe("DISPUTE");
  });
});
