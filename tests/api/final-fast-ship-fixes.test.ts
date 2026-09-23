import { describe, it, expect } from "vitest";
import { POST as observationPost } from "@/app/api/incidents/[id]/observation/route";
import { repository } from "@/lib/repository";
import { VoiceAgentClient } from "@/lib/assemblyai/voice-agent-client";

describe("Final Fast Ship Fixes — Regression Suite", () => {
  it("rejects negative manual count with exact validation message", async () => {
    const inc = await repository.createIncident({
      id: `inc-val-neg-${Date.now()}`,
      shipmentId: "shipment-po44891",
      incidentNumber: "INC-VAL-NEG",
      status: "CAPTURING",
      startedAt: new Date().toISOString(),
    });

    const req = new Request(`http://localhost:3000/api/incidents/${inc.id}/observation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "origin": "http://localhost:3000",
        "host": "localhost:3000"
      },
      body: JSON.stringify({
        observedQty: -5,
        reason: "Test negative",
      }),
    });

    const res = await observationPost(req, { params: Promise.resolve({ id: inc.id }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Quantity cannot be negative.");
  });

  it("rejects decimal manual count with exact validation message", async () => {
    const inc = await repository.createIncident({
      id: `inc-val-dec-${Date.now()}`,
      shipmentId: "shipment-po44891",
      incidentNumber: "INC-VAL-DEC",
      status: "CAPTURING",
      startedAt: new Date().toISOString(),
    });

    const req = new Request(`http://localhost:3000/api/incidents/${inc.id}/observation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "origin": "http://localhost:3000",
        "host": "localhost:3000"
      },
      body: JSON.stringify({
        observedQty: 47.5,
        reason: "Test decimal",
      }),
    });

    const res = await observationPost(req, { params: Promise.resolve({ id: inc.id }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Quantity must be a whole number.");
  });

  it("rejects huge manual count exceeding 100000 receiving limit", async () => {
    const inc = await repository.createIncident({
      id: `inc-val-huge-${Date.now()}`,
      shipmentId: "shipment-po44891",
      incidentNumber: "INC-VAL-HUGE",
      status: "CAPTURING",
      startedAt: new Date().toISOString(),
    });

    const req = new Request(`http://localhost:3000/api/incidents/${inc.id}/observation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "origin": "http://localhost:3000",
        "host": "localhost:3000"
      },
      body: JSON.stringify({
        observedQty: 999999,
        reason: "Test huge",
      }),
    });

    const res = await observationPost(req, { params: Promise.resolve({ id: inc.id }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Quantity exceeds the supported receiving limit.");
  });

  it("accepts valid integer count <= 100000", async () => {
    const inc = await repository.createIncident({
      id: `inc-val-valid-${Date.now()}`,
      shipmentId: "shipment-po44891",
      incidentNumber: "INC-VAL-VALID",
      status: "CAPTURING",
      startedAt: new Date().toISOString(),
    });

    const req = new Request(`http://localhost:3000/api/incidents/${inc.id}/observation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "origin": "http://localhost:3000",
        "host": "localhost:3000"
      },
      body: JSON.stringify({
        observedQty: 47,
        reason: "Valid count",
      }),
    });

    const res = await observationPost(req, { params: Promise.resolve({ id: inc.id }) });
    expect(res.status).toBe(201);
  });
});
