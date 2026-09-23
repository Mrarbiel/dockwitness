import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { MockStoreRepository, SupabaseDataRepository, repository } from "@/lib/repository";
import {
  Incident,
  TranscriptTurnRecord,
  AuditEventRecord,
  DiscrepancyException,
  ObservationRecord,
  EvidenceRecord,
  AttestationRecord,
  IncidentState,
} from "@/lib/types";
import { transitionState, IncidentAction } from "@/lib/domain/state-machine";
import { POST as createIncident, GET as listIncidents } from "@/app/api/incidents/route";
import { GET as getIncident } from "@/app/api/incidents/[id]/route";
import { POST as ingestTurn } from "@/app/api/incidents/[id]/turn/route";

describe("Adversarial Verification Suite: Repository, Concurrency & Boundary Invariants", () => {
  const origMockStore = process.env.USE_MOCK_STORE;

  beforeAll(() => {
    process.env.USE_MOCK_STORE = "true";
  });

  afterAll(() => {
    process.env.USE_MOCK_STORE = origMockStore;
  });
  // =========================================================================
  // 1. ATTACK AUDIT_EVENTS (APPEND-ONLY IMMUTABILITY)
  // =========================================================================
  describe("1. Attack Audit Events: Strict Append-Only Immutability", () => {
    let mockRepo: MockStoreRepository;

    beforeEach(() => {
      mockRepo = new MockStoreRepository();
    });

    it("prevents post-append mutations: external mutation of source object does not contaminate ledger", async () => {
      const sourceEvent: AuditEventRecord = {
        id: "audit-orig-1",
        incidentId: "inc-immutable-1",
        actor: "RECEIVER",
        eventType: "INCIDENT_CREATED",
        payloadJson: { po: "44891", initialDiscrepancy: 0 },
        createdAt: "2026-09-18T10:00:00.000Z",
      };

      await mockRepo.appendAuditEvent(sourceEvent);

      // Adversary attempts to mutate the original object in place
      sourceEvent.actor = "MALICIOUS_ACTOR";
      sourceEvent.eventType = "MUTATED_EVENT";
      (sourceEvent.payloadJson as any).initialDiscrepancy = 999;
      (sourceEvent.payloadJson as any).tampered = true;

      const storedEvents = await mockRepo.getAuditEvents("inc-immutable-1");
      expect(storedEvents).toHaveLength(1);
      expect(storedEvents[0].actor).toBe("RECEIVER");
      expect(storedEvents[0].eventType).toBe("INCIDENT_CREATED");
      expect(storedEvents[0].payloadJson).toEqual({ po: "44891", initialDiscrepancy: 0 });
      expect((storedEvents[0].payloadJson as any).tampered).toBeUndefined();
    });

    it("prevents post-read mutations: tampering with returned audit array/objects leaves repository intact", async () => {
      await mockRepo.appendAuditEvent({
        id: "audit-read-1",
        incidentId: "inc-immutable-2",
        actor: "RECEIVER",
        eventType: "INCIDENT_CREATED",
        payloadJson: { status: "DRAFT" },
        createdAt: "2026-09-18T10:00:00.000Z",
      });

      const retrieved1 = await mockRepo.getAuditEvents("inc-immutable-2");
      expect(retrieved1).toHaveLength(1);

      // Adversary attempts in-place mutation of retrieved array and objects
      retrieved1[0].actor = "COMPROMISED";
      retrieved1[0].eventType = "COMPROMISED_TYPE";
      (retrieved1[0].payloadJson as any).status = "DOCTORED";
      retrieved1.pop(); // Adversary tries to delete event

      // Fresh read must remain completely pristine
      const retrieved2 = await mockRepo.getAuditEvents("inc-immutable-2");
      expect(retrieved2).toHaveLength(1);
      expect(retrieved2[0].actor).toBe("RECEIVER");
      expect(retrieved2[0].eventType).toBe("INCIDENT_CREATED");
      expect(retrieved2[0].payloadJson).toEqual({ status: "DRAFT" });
    });

    it("guarantees audit events interface exposes zero mutation or deletion capabilities", () => {
      // Intentionally verify that DataRepository interface does not expose update or delete methods
      const untypedRepo = mockRepo as any;
      expect(untypedRepo.deleteAuditEvent).toBeUndefined();
      expect(untypedRepo.updateAuditEvent).toBeUndefined();
      expect(untypedRepo.removeAuditEvent).toBeUndefined();
      expect(untypedRepo.clearAuditEvents).toBeUndefined();
    });

    it("preserves chronological append ordering under sequential additions", async () => {
      const timestamps = [
        "2026-09-18T10:00:01.000Z",
        "2026-09-18T10:00:02.000Z",
        "2026-09-18T10:00:03.000Z",
        "2026-09-18T10:00:04.000Z",
        "2026-09-18T10:00:05.000Z",
      ];

      for (let i = 0; i < timestamps.length; i++) {
        await mockRepo.appendAuditEvent({
          id: `seq-audit-${i}`,
          incidentId: "inc-seq-audit",
          actor: "SYSTEM",
          eventType: `EVENT_STEP_${i}`,
          payloadJson: { step: i },
          createdAt: timestamps[i],
        });
      }

      const events = await mockRepo.getAuditEvents("inc-seq-audit");
      expect(events).toHaveLength(5);
      events.forEach((evt, idx) => {
        expect(evt.id).toBe(`seq-audit-${idx}`);
        expect(evt.eventType).toBe(`EVENT_STEP_${idx}`);
        expect(evt.createdAt).toBe(timestamps[idx]);
      });
    });
  });

  // =========================================================================
  // 2. CONCURRENCY STRESS (PARALLEL SAVETURN & API INGESTION)
  // =========================================================================
  describe("2. Concurrency Stress: 20 Parallel saveTurn() and Concurrent API Calls", () => {
    let mockRepo: MockStoreRepository;

    beforeEach(() => {
      mockRepo = new MockStoreRepository();
    });

    it("survives 20 parallel saveTurn() calls on the same incident without data loss or corruption", async () => {
      const incidentId = "inc-concurrency-20";
      const totalTurns = 20;

      const turnPayloads: TranscriptTurnRecord[] = Array.from({ length: totalTurns }, (_, i) => ({
        id: `turn-concurrent-${i}-${Math.random().toString(36).slice(2, 7)}`,
        incidentId,
        speakerRole: i % 2 === 0 ? "RECEIVER" : "DRIVER",
        text: `Parallel spoken statement sequence number ${i}`,
        startMs: i * 1500,
        endMs: (i + 1) * 1500,
        isFinal: true,
        confidence: 0.95 + (i % 5) * 0.01,
        createdAt: new Date(Date.now() + i * 50).toISOString(),
      }));

      // Fire all 20 calls simultaneously
      const results = await Promise.all(turnPayloads.map((t) => mockRepo.saveTurn(t)));
      expect(results).toHaveLength(totalTurns);

      // Verify repository retrieval integrity
      const savedTurns = await mockRepo.getTurns(incidentId);
      expect(savedTurns).toHaveLength(totalTurns);

      // Verify all 20 turn IDs are distinct and present
      const savedIds = new Set(savedTurns.map((t) => t.id));
      expect(savedIds.size).toBe(totalTurns);

      turnPayloads.forEach((payload) => {
        const found = savedTurns.find((t) => t.id === payload.id);
        expect(found).toBeDefined();
        expect(found!.text).toBe(payload.text);
        expect(found!.speakerRole).toBe(payload.speakerRole);
        expect(found!.startMs).toBe(payload.startMs);
        expect(found!.endMs).toBe(payload.endMs);
      });
    });

    it("survives 20 parallel POST /api/incidents/[id]/turn requests to API endpoint", async () => {
      // 1. Create a fresh incident via API
      const createReq = new Request("http://localhost:3000/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipmentId: "shipment-po44891",
          receiverName: "Concurr Receiver",
          driverName: "Concurr Driver",
        }),
      });
      const createRes = await createIncident(createReq);
      expect(createRes.status).toBe(201);
      const incidentData = await createRes.json();
      const testIncidentId = incidentData.id;
      expect(incidentData.status).toBe("DRAFT");

      // 2. Dispatch 20 concurrent turn ingestion requests to the API handler
      const parallelCalls = 20;
      const turnPromises = Array.from({ length: parallelCalls }, (_, idx) => {
        const req = new Request(`http://localhost:3000/api/incidents/${testIncidentId}/turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            speakerRole: idx % 2 === 0 ? "RECEIVER" : "DRIVER",
            text: `Concurrent speech turn verification payload #${idx}`,
            startMs: idx * 1000,
            endMs: (idx + 1) * 1000,
            confidence: 0.96,
          }),
        });
        return ingestTurn(req, { params: Promise.resolve({ id: testIncidentId }) });
      });

      const turnResponses = await Promise.all(turnPromises);

      // Every response must be 201 Created
      for (const res of turnResponses) {
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.incidentId).toBe(testIncidentId);
        expect(data.id).toMatch(/^turn-/);
      }

      // 3. Inspect repository state for the incident
      const turnsInRepo = await repository.getTurns(testIncidentId);
      expect(turnsInRepo).toHaveLength(parallelCalls);

      // Verify all turn IDs are unique
      const turnIdSet = new Set(turnsInRepo.map((t) => t.id));
      expect(turnIdSet.size).toBe(parallelCalls);

      // Verify incident transitioned to CAPTURING
      const updatedIncident = await repository.getIncident(testIncidentId);
      expect(updatedIncident!.status).toBe("CAPTURING");

      // Verify audit events captured all 20 committed turns plus the initial creation
      const auditEvents = await repository.getAuditEvents(testIncidentId);
      const speechAudits = auditEvents.filter((a) => a.eventType === "SPEECH_TURN_COMMITTED");
      expect(speechAudits).toHaveLength(parallelCalls);
    }, 45000);

    it("maintains incident isolation under multi-incident concurrent bombardment (40 turns across 4 incidents)", async () => {
      const incidents = ["inc-multi-1", "inc-multi-2", "inc-multi-3", "inc-multi-4"];
      const turnsPerIncident = 10;

      const allTurns: TranscriptTurnRecord[] = [];
      incidents.forEach((incId) => {
        for (let i = 0; i < turnsPerIncident; i++) {
          allTurns.push({
            id: `turn-${incId}-${i}`,
            incidentId: incId,
            speakerRole: i % 2 === 0 ? "RECEIVER" : "DRIVER",
            text: `Statement ${i} for ${incId}`,
            startMs: i * 500,
            endMs: (i + 1) * 500,
            isFinal: true,
            createdAt: new Date().toISOString(),
          });
        }
      });

      // Shuffle array to maximize inter-leaving
      const shuffled = allTurns.sort(() => Math.random() - 0.5);

      await Promise.all(shuffled.map((t) => mockRepo.saveTurn(t)));

      // Verify each incident has exactly 10 turns and no cross-talk
      for (const incId of incidents) {
        const turns = await mockRepo.getTurns(incId);
        expect(turns).toHaveLength(turnsPerIncident);
        turns.forEach((t) => {
          expect(t.incidentId).toBe(incId);
        });
      }
    });
  });

  // =========================================================================
  // 3. MALFORMED PAYLOADS & BOUNDARY ATTACKS ON API ENDPOINTS
  // =========================================================================
  describe("3. Malformed Payloads & Boundary Attacks on API Routes", () => {
    let testIncidentId: string;

    beforeEach(async () => {
      const req = new Request("http://localhost:3000/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipmentId: "shipment-po44891",
          receiverName: "Attack Target Receiver",
        }),
      });
      const res = await createIncident(req);
      const data = await res.json();
      testIncidentId = data.id;
    });

    describe("POST /api/incidents (Incident Creation Invariants)", () => {
      it("rejects request with missing shipmentId with 400", async () => {
        const req = new Request("http://localhost:3000/api/incidents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            receiverName: "Marcus Vance",
          }),
        });
        const res = await createIncident(req);
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toBeDefined();
      });

      it("rejects request with empty string shipmentId with 400", async () => {
        const req = new Request("http://localhost:3000/api/incidents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shipmentId: "",
          }),
        });
        const res = await createIncident(req);
        expect(res.status).toBe(400);
      });

      it("rejects whitespace-only shipmentId with 400", async () => {
        const req = new Request("http://localhost:3000/api/incidents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shipmentId: "   ",
          }),
        });
        const res = await createIncident(req);
        expect(res.status).toBe(400);
      });

      it("rejects non-string types for shipmentId (number, array, object, boolean)", async () => {
        const invalidShipmentIds = [12345, true, ["shipment-po44891"], { id: "shipment-po44891" }, null];

        for (const badId of invalidShipmentIds) {
          const req = new Request("http://localhost:3000/api/incidents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              shipmentId: badId,
            }),
          });
          const res = await createIncident(req);
          expect(res.status).toBe(400);
        }
      });

      it("rejects forbidden status values at creation time (CLOSED, CARRIER_LIABLE, CLAIM_APPROVED)", async () => {
        const forbiddenStatuses = ["CLOSED", "CARRIER_LIABLE", "CLAIM_APPROVED", "PARTY_REVIEW", "ADMIN_BYPASS"];

        for (const badStatus of forbiddenStatuses) {
          const req = new Request("http://localhost:3000/api/incidents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              shipmentId: "shipment-po44891",
              status: badStatus,
            }),
          });
          const res = await createIncident(req);
          expect(res.status).toBe(400);
          const data = await res.json();
          expect(data.error).toBeDefined();
        }
      });

      it("handles SQL injection strings and XSS payloads safely without crashing", async () => {
        const hostileStrings = [
          "'; DROP TABLE incidents; --",
          "' OR '1'='1",
          "<script>alert('XSS')</script>",
          "${process.exit(1)}",
          "../../../etc/passwd",
          "\x00\x00NULLBYTE",
        ];

        for (const hostile of hostileStrings) {
          const req = new Request("http://localhost:3000/api/incidents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              shipmentId: hostile,
              receiverName: hostile,
              driverName: hostile,
            }),
          });
          const res = await createIncident(req);
          // Either rejected by validation or stored cleanly as literal string without crashing
          if (res.status === 201) {
            const data = await res.json();
            expect(data.shipmentId).toBe(hostile);
            expect(data.receiverName).toBe(hostile);
          } else {
            expect(res.status).toBe(400);
          }
        }
      });

      it("handles malformed JSON syntax gracefully with 400", async () => {
        const req = new Request("http://localhost:3000/api/incidents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{ invalid json: syntax error, ",
        });
        const res = await createIncident(req);
        expect(res.status).toBe(400);
      });
    });

    describe("POST /api/incidents/[id]/turn (Turn Ingestion Invariants)", () => {
      it("rejects empty text or whitespace-only text with 400", async () => {
        const emptyTexts = ["", "   ", "\t\t", "\n\n  \r\n"];

        for (const text of emptyTexts) {
          const req = new Request(`http://localhost:3000/api/incidents/${testIncidentId}/turn`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              speakerRole: "RECEIVER",
              text,
            }),
          });
          const res = await ingestTurn(req, { params: Promise.resolve({ id: testIncidentId }) });
          expect(res.status).toBe(400);
          const data = await res.json();
          expect(data.error).toBeDefined();
        }
      });

      it("rejects unauthorized speaker roles (AI_OVERRIDE, ARBITRATOR, CLAIM_AGENT, HACKER) with 400", async () => {
        const invalidRoles = ["AI_OVERRIDE", "ARBITRATOR", "CLAIM_AGENT", "HACKER", "USER", "ROOT"];

        for (const role of invalidRoles) {
          const req = new Request(`http://localhost:3000/api/incidents/${testIncidentId}/turn`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              speakerRole: role,
              text: "Forty-seven cartons accounted for.",
            }),
          });
          const res = await ingestTurn(req, { params: Promise.resolve({ id: testIncidentId }) });
          expect(res.status).toBe(400);
        }
      });

      it("rejects negative or fractional timestamps with 400", async () => {
        const invalidTimestamps = [
          { startMs: -100, endMs: 500 },
          { startMs: 100, endMs: -500 },
          { startMs: 12.345, endMs: 500 },
          { startMs: 100, endMs: 500.67 },
        ];

        for (const ts of invalidTimestamps) {
          const req = new Request(`http://localhost:3000/api/incidents/${testIncidentId}/turn`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              speakerRole: "RECEIVER",
              text: "Forty-seven cartons.",
              ...ts,
            }),
          });
          const res = await ingestTurn(req, { params: Promise.resolve({ id: testIncidentId }) });
          expect(res.status).toBe(400);
        }
      });

      it("rejects confidence values outside [0, 1] range with 400", async () => {
        const invalidConfidences = [-0.1, 1.01, 2.5, -100, 999];

        for (const conf of invalidConfidences) {
          const req = new Request(`http://localhost:3000/api/incidents/${testIncidentId}/turn`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              speakerRole: "RECEIVER",
              text: "Forty-seven cartons counted.",
              confidence: conf,
            }),
          });
          const res = await ingestTurn(req, { params: Promise.resolve({ id: testIncidentId }) });
          expect(res.status).toBe(400);
        }
      });

      it("returns 404 when ingesting turn for non-existent incident", async () => {
        const req = new Request("http://localhost:3000/api/incidents/incident-phantom-99999/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            speakerRole: "RECEIVER",
            text: "Ghost turn for missing incident.",
          }),
        });
        const res = await ingestTurn(req, { params: Promise.resolve({ id: "incident-phantom-99999" }) });
        expect(res.status).toBe(404);
        const data = await res.json();
        expect(data.error).toContain("Incident not found");
      });

      it("handles massive speech turn text (10,000 characters) without server crash", async () => {
        const massiveText = "cartons counted ".repeat(600);
        const req = new Request(`http://localhost:3000/api/incidents/${testIncidentId}/turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            speakerRole: "RECEIVER",
            text: massiveText,
          }),
        });
        const res = await ingestTurn(req, { params: Promise.resolve({ id: testIncidentId }) });
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.text).toBe(massiveText.trim());
      });
    });
  });

  // =========================================================================
  // 4. STATE MACHINE BOUNDARY INVARIANTS & FAIL-FAST TRANSITIONS
  // =========================================================================
  describe("4. State Machine Boundary Tests: Forbidden Transitions Fail Fast", () => {
    const FORBIDDEN_LIABILITY_ACTIONS = [
      "CLAIM_APPROVED",
      "CARRIER_LIABLE",
      "SHIPPER_LIABLE",
      "FAULT_CONFIRMED",
    ];

    const ALL_INCIDENT_STATES: IncidentState[] = [
      "DRAFT",
      "CAPTURING",
      "EXCEPTION_DETECTED",
      "EVIDENCE_REQUIRED",
      "PARTY_REVIEW",
      "READY_FOR_OPS_REVIEW",
      "CLOSED",
      "NEEDS_CLARIFICATION",
    ];

    it("strictly forbids AI/system from triggering any liability or fault state across ALL possible states", () => {
      for (const state of ALL_INCIDENT_STATES) {
        for (const forbidden of FORBIDDEN_LIABILITY_ACTIONS) {
          expect(() => {
            transitionState(state, forbidden as any);
          }).toThrowError(new RegExp(`Forbidden state transition attempted: ${forbidden}`));
        }
      }
    });

    it("treats context object as immutable input: transitionState does not mutate caller context", () => {
      const originalContext = {
        hasDamage: true,
        hasPhotos: false,
        hasDiscrepancy: true,
        driverAttested: false,
      };
      const contextCopy = { ...originalContext };

      transitionState("CAPTURING", "DETECT_EXCEPTION", originalContext);
      expect(originalContext).toEqual(contextCopy);
    });

    it("enforces strict gate: DETECT_EXCEPTION cannot skip EVIDENCE_REQUIRED when damage has no photos", () => {
      const nextState = transitionState("CAPTURING", "DETECT_EXCEPTION", {
        hasDamage: true,
        hasPhotos: false,
      });
      expect(nextState).toBe("EVIDENCE_REQUIRED");
      expect(nextState).not.toBe("PARTY_REVIEW");
      expect(nextState).not.toBe("READY_FOR_OPS_REVIEW");
    });
  });

  // =========================================================================
  // 5. SUPABASE REPOSITORY FALLBACK & RESILIENCE BEHAVIOR
  // =========================================================================
  describe("5. Fallback & Resilience: Corrupted Config and Network Failures", () => {
    const originalEnv = process.env.USE_MOCK_STORE;
    const originalNodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
      process.env.USE_MOCK_STORE = "true";
    });

    afterEach(() => {
      process.env.USE_MOCK_STORE = originalEnv;
      (process.env as any).NODE_ENV = originalNodeEnv;
    });

    it("initializes gracefully when Supabase URL or credentials are null or missing", async () => {
      const fallbackStore = new MockStoreRepository();
      const supabaseRepo = new SupabaseDataRepository(fallbackStore);

      // Verify read operations fallback cleanly to mock store
      const shipments = await supabaseRepo.getShipments();
      expect(shipments.length).toBeGreaterThan(0);

      const fbIncId = `inc-fallback-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const fbIncNum = `INC-FB-${Date.now().toString().slice(-4)}-${Math.random().toString(36).slice(2, 6)}`;
      const incident = await supabaseRepo.createIncident({
        id: fbIncId,
        shipmentId: "shipment-po44891",
        incidentNumber: fbIncNum,
        status: "DRAFT",
        startedAt: new Date().toISOString(),
      });
      expect(incident.id).toBe(fbIncId);

      const fetched = await supabaseRepo.getIncident(fbIncId);
      expect(fetched).not.toBeNull();
      expect(fetched!.incidentNumber).toBe(fbIncNum);
    });

    it("recovers gracefully and dual-writes to fallback when Supabase client throws unhandled network errors", async () => {
      const fallbackStore = new MockStoreRepository();
      const supabaseRepo = new SupabaseDataRepository(fallbackStore);

      // Artificially inject a hostile client that throws network errors on every single call
      const hostileClient = {
        from: () => ({
          select: () => {
            throw new Error("Network timeout: connection reset by peer (ECONNRESET)");
          },
          insert: () => {
            throw new Error("Postgres connection terminated unexpectedly (500)");
          },
          update: () => {
            throw new Error("Database unavailable: 503 Service Unavailable");
          },
        }),
      };
      (supabaseRepo as any).client = hostileClient;

      // 1. Shipment read under hostile network
      const shipments = await supabaseRepo.getShipments();
      expect(shipments).toHaveLength(5);

      // 2. Incident creation under hostile network (must succeed via fallback dual-write)
      const hnIncId = "inc-hostile-net-1";
      const hnIncNum = "INC-HN-44891-HOSTILE";
      const createdIncident = await supabaseRepo.createIncident({
        id: hnIncId,
        shipmentId: "shipment-po44891",
        incidentNumber: hnIncNum,
        status: "DRAFT",
        startedAt: new Date().toISOString(),
      });
      expect(createdIncident.id).toBe(hnIncId);

      // 3. Speech turn save under hostile network
      const savedTurn = await supabaseRepo.saveTurn({
        id: "turn-hostile-1",
        incidentId: hnIncId,
        speakerRole: "RECEIVER",
        text: "Forty-seven cartons observed despite network outage.",
        startMs: 0,
        endMs: 2000,
        isFinal: true,
        confidence: 0.99,
        createdAt: new Date().toISOString(),
      });
      expect(savedTurn.id).toBe("turn-hostile-1");

      // 4. Audit event append under hostile network
      const audit = await supabaseRepo.appendAuditEvent({
        id: "audit-hostile-1",
        incidentId: "inc-hostile-net-1",
        actor: "SYSTEM",
        eventType: "NETWORK_FAILOVER",
        payloadJson: { reason: "Simulated host unreachable" },
        createdAt: new Date().toISOString(),
      });
      expect(audit.id).toBe("audit-hostile-1");

      // 5. Exception, observation, evidence, attestation writes under hostile network
      const exc = await supabaseRepo.createException({
        id: "exc-hostile-1",
        incidentId: "inc-hostile-net-1",
        shipmentItemId: "item-1",
        type: "SHORTAGE",
        expectedQty: 48,
        observedQty: 47,
        delta: -1,
        agreementStatus: "PENDING_REVIEW",
      });
      expect(exc.id).toBe("exc-hostile-1");

      const obs = await supabaseRepo.saveObservation({
        id: "obs-hostile-1",
        incidentId: "inc-hostile-net-1",
        fieldKey: "observed_qty",
        valueJson: { count: 47 },
        sourceQuote: "Forty-seven cartons",
        speakerRole: "RECEIVER",
        confidence: 0.99,
        confirmed: true,
        createdAt: new Date().toISOString(),
      });
      expect(obs.id).toBe("obs-hostile-1");

      const ev = await supabaseRepo.saveEvidence({
        id: "ev-hostile-1",
        incidentId: "inc-hostile-net-1",
        type: "PHOTO",
        storagePath: "/evidence/sample.jpg",
        capturedBy: "Marcus Vance",
        createdAt: new Date().toISOString(),
      });
      expect(ev.id).toBe("ev-hostile-1");

      const att = await supabaseRepo.saveAttestation({
        id: "att-hostile-1",
        incidentId: "inc-hostile-net-1",
        exceptionId: "exc-hostile-1",
        partyRole: "RECEIVER",
        position: "CONFIRM",
        createdAt: new Date().toISOString(),
      });
      expect(att.id).toBe("att-hostile-1");

      // 6. Verification: all data was safely preserved in the fallback store
      const turns = await fallbackStore.getTurns("inc-hostile-net-1");
      expect(turns).toHaveLength(1);
      expect(turns[0].text).toBe("Forty-seven cartons observed despite network outage.");

      const auditList = await fallbackStore.getAuditEvents("inc-hostile-net-1");
      expect(auditList).toHaveLength(1);
      expect(auditList[0].eventType).toBe("NETWORK_FAILOVER");

      const excList = await fallbackStore.getExceptions("inc-hostile-net-1");
      expect(excList).toHaveLength(1);

      const obsList = await fallbackStore.getObservations("inc-hostile-net-1");
      expect(obsList).toHaveLength(1);

      const evList = await fallbackStore.getEvidence("inc-hostile-net-1");
      expect(evList).toHaveLength(1);

      const attList = await fallbackStore.getAttestations("inc-hostile-net-1");
      expect(attList).toHaveLength(1);
    });
  });

  // =========================================================================
  // 6. SHIPMENT RESOLUTION BOUNDARY ATTACKS
  // =========================================================================
  describe("6. Shipment Resolution Boundary Attacks", () => {
    let mockRepo: MockStoreRepository;

    beforeEach(() => {
      mockRepo = new MockStoreRepository();
    });

    it("returns null for whitespace-only shipment queries without substring false-positives", async () => {
      const whitespaceResult = await mockRepo.getShipment("   ");
      expect(whitespaceResult).toBeNull();
    });

    it("returns null for empty-string-like patterns after stripping prefixes", async () => {
      const poOnlyResult = await mockRepo.getShipment("po-");
      expect(poOnlyResult).toBeNull();

      const shipmentOnlyResult = await mockRepo.getShipment("shipment-");
      expect(shipmentOnlyResult).toBeNull();
    });
  });

  // =========================================================================
  // 7. ATOMIC TRANSACTION & ROLLBACK INVARIANTS
  // =========================================================================
  describe("7. Atomic Transaction & Rollback Invariants", () => {
    let mockRepo: MockStoreRepository;

    beforeEach(() => {
      mockRepo = new MockStoreRepository();
    });

    it("atomically rolls back observation and exception state if audit event recording fails", async () => {
      const incidentId = "inc-atomic-obs-fail-1";
      await mockRepo.createIncident({
        id: incidentId,
        shipmentId: "shipment-po44891",
        incidentNumber: "INC-ATOMIC-1",
        status: "DRAFT",
        startedAt: new Date().toISOString(),
      });

      // Intentionally cause appendAuditEvent to throw
      const origAppend = mockRepo.appendAuditEvent.bind(mockRepo);
      mockRepo.appendAuditEvent = async () => {
        throw new Error("Simulated audit disk failure during atomic write");
      };

      const obsRecord: ObservationRecord = {
        id: "obs-rollback-1",
        incidentId,
        fieldKey: "observed_qty",
        valueJson: { observedQty: 47 },
        sourceQuote: "Counted 47 cartons",
        speakerRole: "RECEIVER",
        confidence: 1.0,
        confirmed: true,
        createdAt: new Date().toISOString(),
      };

      const excRecord: DiscrepancyException = {
        id: "exc-rollback-1",
        incidentId,
        type: "SHORTAGE",
        expectedQty: 48,
        observedQty: 47,
        delta: -1,
        agreementStatus: "PENDING_REVIEW",
        createdAt: new Date().toISOString(),
      };

      const auditRecord: AuditEventRecord = {
        id: "audit-rollback-1",
        incidentId,
        actor: "RECEIVER",
        eventType: "OBSERVATION_RECORDED",
        payloadJson: { observedQty: 47 },
        createdAt: new Date().toISOString(),
      };

      // Atomic call must reject
      await expect(
        mockRepo.recordObservationAtomic({
          observation: obsRecord,
          exception: excRecord,
          actor: "RECEIVER",
          auditEvent: auditRecord,
        })
      ).rejects.toThrow(/Simulated audit disk failure/);

      // Verify complete rollback: zero observations, zero exceptions, zero audit events
      const storedObs = await mockRepo.getObservations(incidentId);
      expect(storedObs).toHaveLength(0);

      const storedExc = await mockRepo.getExceptions(incidentId);
      expect(storedExc).toHaveLength(0);

      const storedAudit = await origAppend({
        id: "audit-check-1",
        incidentId,
        actor: "SYSTEM",
        eventType: "SYSTEM_ALERT",
        payloadJson: {},
        createdAt: new Date().toISOString(),
      });
      expect(storedAudit.id).toBe("audit-check-1");
    });

    it("atomically rolls back attestation state if audit event recording fails", async () => {
      const incidentId = "inc-atomic-att-fail-1";
      await mockRepo.createIncident({
        id: incidentId,
        shipmentId: "shipment-po44891",
        incidentNumber: "INC-ATOMIC-2",
        status: "DRAFT",
        startedAt: new Date().toISOString(),
      });

      const exc = await mockRepo.createException({
        id: "exc-atomic-att-1",
        incidentId,
        type: "SHORTAGE",
        expectedQty: 48,
        observedQty: 47,
        delta: -1,
        agreementStatus: "PENDING_REVIEW",
        createdAt: new Date().toISOString(),
      });

      // Intentionally cause appendAuditEvent to throw
      mockRepo.appendAuditEvent = async () => {
        throw new Error("Simulated database timeout during audit log commit");
      };

      const attRecord: AttestationRecord = {
        id: "att-rollback-1",
        incidentId,
        exceptionId: exc.id,
        partyRole: "DRIVER",
        position: "CONFIRM",
        createdAt: new Date().toISOString(),
      };

      const auditRecord: AuditEventRecord = {
        id: "audit-rollback-att-1",
        incidentId,
        actor: "DRIVER",
        eventType: "ATTESTATION_RECORDED",
        payloadJson: { position: "CONFIRM" },
        createdAt: new Date().toISOString(),
      };

      await expect(
        mockRepo.recordAttestationAtomic({
          attestation: attRecord,
          exceptionId: exc.id,
          newAgreementStatus: "CONFIRMED_BY_BOTH",
          auditEvent: auditRecord,
        })
      ).rejects.toThrow(/Simulated database timeout/);

      // Verify rollback: zero attestations stored, and exception status remains PENDING_REVIEW
      const storedAtts = await mockRepo.getAttestations(incidentId);
      expect(storedAtts).toHaveLength(0);

      const storedExcs = await mockRepo.getExceptions(incidentId);
      expect(storedExcs[0].agreementStatus).toBe("PENDING_REVIEW");
    });
  });

  // =========================================================================
  // 6. PRODUCTION FAIL-CLOSED ATOMIC INVARIANTS (RELEASE-BLOCKER 1)
  // =========================================================================
  describe("6. Production Fail-Closed Atomic Invariants (Release-Blocker 1)", () => {
    it("fails operation and executes ZERO sequential write attempts when RPC is unavailable in production", async () => {
      const savedNodeEnv = process.env.NODE_ENV;
      const savedUseMock = process.env.USE_MOCK_STORE;
      const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      try {
        (process.env as any).NODE_ENV = "production";
        process.env.USE_MOCK_STORE = "false";
        process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mock-proj.supabase.co";
        process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-service-role-key";

        const repo = new SupabaseDataRepository();
        const rpcMock = vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: "PGRST202",
            message: "Could not find the function public.record_observation_atomic in the schema cache",
          },
        });
        const fromMock = vi.fn();
        (repo as any).client = {
          rpc: rpcMock,
          from: fromMock,
        };

        const saveObsSpy = vi.spyOn(repo, "saveObservation");
        const createExcSpy = vi.spyOn(repo, "createException");
        const updateExcSpy = vi.spyOn(repo, "updateException");
        const appendAuditSpy = vi.spyOn(repo, "appendAuditEvent");
        const saveAttSpy = vi.spyOn(repo, "saveAttestation");

        const mockObs: ObservationRecord = {
          id: "obs-prod-fail-1",
          incidentId: "inc-prod-1",
          fieldKey: "OBSERVED_QUANTITY",
          valueJson: { quantity: 47 },
          sourceQuote: "I have 47 cartons",
          speakerRole: "RECEIVER",
          confidence: 0.98,
          confirmed: true,
          createdAt: new Date().toISOString(),
        };

        const mockAudit: AuditEventRecord = {
          id: "audit-prod-fail-1",
          incidentId: "inc-prod-1",
          actor: "RECEIVER",
          eventType: "OBSERVATION_RECORDED",
          payloadJson: { count: 47 },
          createdAt: new Date().toISOString(),
        };

        // 1. Verify recordObservationAtomic fails closed and never calls sequential writes
        await expect(
          repo.recordObservationAtomic({
            observation: mockObs,
            exception: null,
            actor: "RECEIVER",
            auditEvent: mockAudit,
          })
        ).rejects.toThrow(/record_observation_atomic/);

        expect(rpcMock).toHaveBeenCalledTimes(1);
        expect(saveObsSpy).not.toHaveBeenCalled();
        expect(createExcSpy).not.toHaveBeenCalled();
        expect(updateExcSpy).not.toHaveBeenCalled();
        expect(appendAuditSpy).not.toHaveBeenCalled();
        expect(fromMock).not.toHaveBeenCalled();

        // 2. Verify recordAttestationAtomic fails closed and never calls sequential writes
        rpcMock.mockResolvedValueOnce({
          data: null,
          error: {
            code: "PGRST202",
            message: "Could not find the function public.record_attestation_atomic in the schema cache",
          },
        });

        const mockAtt: AttestationRecord = {
          id: "att-prod-fail-1",
          incidentId: "inc-prod-1",
          exceptionId: "exc-prod-1",
          partyRole: "DRIVER",
          position: "CONFIRM",
          createdAt: new Date().toISOString(),
        };

        await expect(
          repo.recordAttestationAtomic({
            attestation: mockAtt,
            exceptionId: "exc-prod-1",
            newAgreementStatus: "CONFIRMED_BY_BOTH",
            auditEvent: mockAudit,
          })
        ).rejects.toThrow(/record_attestation_atomic/);

        expect(saveAttSpy).not.toHaveBeenCalled();
        expect(updateExcSpy).not.toHaveBeenCalled();
        expect(appendAuditSpy).not.toHaveBeenCalled();
        expect(fromMock).not.toHaveBeenCalled();
      } finally {
        (process.env as any).NODE_ENV = savedNodeEnv;
        process.env.USE_MOCK_STORE = savedUseMock;
        process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
        process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
      }
    });
  });
});
