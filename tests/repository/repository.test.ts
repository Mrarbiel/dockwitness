import { describe, it, expect, beforeEach } from "vitest";
import { MockStoreRepository, SupabaseDataRepository } from "@/lib/repository";
import {
  Incident,
  TranscriptTurnRecord,
  DiscrepancyException,
  ObservationRecord,
  EvidenceRecord,
  AttestationRecord,
  AuditEventRecord,
} from "@/lib/types";

describe("DataRepository Implementation Suite", () => {
  let repo: MockStoreRepository;

  beforeEach(() => {
    repo = new MockStoreRepository();
  });

  describe("Shipments", () => {
    it("loads all 5 canonical seed shipments", async () => {
      const shipments = await repo.getShipments();
      expect(shipments).toHaveLength(5);
      const pos = shipments.map((s) => s.poNumber);
      expect(pos).toContain("44880");
      expect(pos).toContain("44891");
      expect(pos).toContain("44902");
      expect(pos).toContain("44913");
      expect(pos).toContain("44924");
    });

    it("fetches shipment by exact ID", async () => {
      const shipment = await repo.getShipment("shipment-po44891");
      expect(shipment).not.toBeNull();
      expect(shipment!.poNumber).toBe("44891");
      expect(shipment!.items[0].expectedQty).toBe(48);
    });

    it("fetches shipment by numeric PO number", async () => {
      const shipment = await repo.getShipment("44891");
      expect(shipment).not.toBeNull();
      expect(shipment!.id).toBe("shipment-po44891");
    });

    it("returns null for non-existent shipment", async () => {
      const shipment = await repo.getShipment("shipment-unknown-9999");
      expect(shipment).toBeNull();
    });
  });

  describe("Incidents CRUD", () => {
    it("creates, retrieves, and updates an incident", async () => {
      const incident: Incident = {
        id: "incident-test-1",
        shipmentId: "shipment-po44891",
        incidentNumber: "INC-99001",
        status: "DRAFT",
        receiverName: "Marcus Vance",
        driverName: "Dave Miller",
        startedAt: new Date().toISOString(),
      };

      const created = await repo.createIncident(incident);
      expect(created.id).toBe("incident-test-1");

      const fetched = await repo.getIncident("incident-test-1");
      expect(fetched).not.toBeNull();
      expect(fetched!.incidentNumber).toBe("INC-99001");

      const updated = await repo.updateIncident("incident-test-1", {
        status: "CAPTURING",
      });
      expect(updated!.status).toBe("CAPTURING");
    });

    it("filters incidents by shipmentId or status", async () => {
      await repo.createIncident({
        id: "inc-1",
        shipmentId: "shipment-po44891",
        incidentNumber: "INC-1",
        status: "DRAFT",
        startedAt: new Date().toISOString(),
      });
      await repo.createIncident({
        id: "inc-2",
        shipmentId: "shipment-po44880",
        incidentNumber: "INC-2",
        status: "CLOSED",
        startedAt: new Date().toISOString(),
      });

      const po44891List = await repo.getIncidents({ shipmentId: "shipment-po44891" });
      expect(po44891List).toHaveLength(1);
      expect(po44891List[0].id).toBe("inc-1");

      const closedList = await repo.getIncidents({ status: "CLOSED" });
      expect(closedList).toHaveLength(1);
      expect(closedList[0].id).toBe("inc-2");
    });
  });

  describe("Transcript Turns", () => {
    it("saves and retrieves turns for an incident", async () => {
      const turn: TranscriptTurnRecord = {
        id: "turn-1",
        incidentId: "inc-1",
        speakerRole: "RECEIVER",
        text: "I have forty-seven cartons.",
        isFinal: true,
        startMs: 0,
        endMs: 2500,
        confidence: 0.98,
        createdAt: new Date().toISOString(),
      };

      await repo.saveTurn(turn);
      const turns = await repo.getTurns("inc-1");
      expect(turns).toHaveLength(1);
      expect(turns[0].text).toBe("I have forty-seven cartons.");
    });
  });

  describe("Exceptions, Observations, Evidence, Attestations", () => {
    it("saves and updates exceptions", async () => {
      const exc: DiscrepancyException = {
        id: "exc-1",
        incidentId: "inc-1",
        shipmentItemId: "item-1",
        type: "SHORTAGE",
        expectedQty: 48,
        observedQty: 47,
        delta: -1,
        agreementStatus: "PENDING_REVIEW",
        createdAt: new Date().toISOString(),
      };

      await repo.createException(exc);
      const list = await repo.getExceptions("inc-1");
      expect(list).toHaveLength(1);
      expect(list[0].delta).toBe(-1);

      const updated = await repo.updateException("exc-1", {
        agreementStatus: "DISPUTED",
      });
      expect(updated!.agreementStatus).toBe("DISPUTED");
    });

    it("saves observations with verbatim provenance", async () => {
      const obs: ObservationRecord = {
        id: "obs-1",
        incidentId: "inc-1",
        fieldKey: "observed_qty",
        valueJson: { count: 47 },
        sourceQuote: "forty-seven cartons",
        speakerRole: "RECEIVER",
        confidence: 0.95,
        confirmed: true,
        createdAt: new Date().toISOString(),
      };

      await repo.saveObservation(obs);
      const observations = await repo.getObservations("inc-1");
      expect(observations).toHaveLength(1);
      expect(observations[0].sourceQuote).toBe("forty-seven cartons");
    });

    it("saves evidence records", async () => {
      const ev: EvidenceRecord = {
        id: "ev-1",
        incidentId: "inc-1",
        type: "PHOTO",
        storagePath: "/evidence/crushed-carton.jpg",
        description: "Crushed carton 31",
        capturedBy: "Marcus Vance",
        createdAt: new Date().toISOString(),
      };

      await repo.saveEvidence(ev);
      const list = await repo.getEvidence("inc-1");
      expect(list).toHaveLength(1);
      expect(list[0].storagePath).toBe("/evidence/crushed-carton.jpg");
    });

    it("saves attestation records", async () => {
      const att: AttestationRecord = {
        id: "att-1",
        incidentId: "inc-1",
        exceptionId: "exc-1",
        partyRole: "DRIVER",
        position: "DISPUTE",
        createdAt: new Date().toISOString(),
      };

      await repo.saveAttestation(att);
      const list = await repo.getAttestations("inc-1");
      expect(list).toHaveLength(1);
      expect(list[0].position).toBe("DISPUTE");
    });
  });

  describe("Audit Events Ledger (Append-Only)", () => {
    it("records chronological audit events and returns immutable copies", async () => {
      const event1: AuditEventRecord = {
        id: "audit-1",
        incidentId: "inc-1",
        actor: "RECEIVER",
        eventType: "INCIDENT_CREATED",
        payloadJson: { po: "44891" },
        createdAt: "2026-09-18T08:00:00.000Z",
      };
      const event2: AuditEventRecord = {
        id: "audit-2",
        incidentId: "inc-1",
        actor: "RECEIVER",
        eventType: "SPEECH_TURN_COMMITTED",
        payloadJson: { text: "forty-seven cartons" },
        createdAt: "2026-09-18T08:00:10.000Z",
      };

      await repo.appendAuditEvent(event1);
      await repo.appendAuditEvent(event2);

      const events = await repo.getAuditEvents("inc-1");
      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe("INCIDENT_CREATED");
      expect(events[1].eventType).toBe("SPEECH_TURN_COMMITTED");

      // Verify that modifying the returned array does not affect repository internal state
      events[0].eventType = "MUTATED";
      const eventsAfter = await repo.getAuditEvents("inc-1");
      expect(eventsAfter[0].eventType).toBe("INCIDENT_CREATED");
    });
  });

  describe("SupabaseDataRepository Fallback Mode", () => {
    it("gracefully falls back to mock store when Supabase client is unavailable", async () => {
      const fallbackStore = new MockStoreRepository();
      const supabaseRepo = new SupabaseDataRepository(fallbackStore);

      const shipments = await supabaseRepo.getShipments();
      expect(shipments).toHaveLength(5);

      const shipment = await supabaseRepo.getShipment("shipment-po44891");
      expect(shipment).not.toBeNull();
      expect(shipment!.poNumber).toBe("44891");
    });
  });
});
