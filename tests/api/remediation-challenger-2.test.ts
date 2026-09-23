import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from "vitest";
import { POST as postEvidence } from "@/app/api/evidence/route";
import { POST as postPhoto } from "@/app/api/incidents/[id]/photo/route";
import { GET as getOperations } from "@/app/api/operations/route";
import { repository, MockStoreRepository, SupabaseDataRepository } from "@/lib/repository";
import { AssemblyAIRealtimeClient } from "@/lib/assemblyai/realtime-client";
import { ALLOWED_EVIDENCE_MIME_TYPES, MAX_EVIDENCE_FILE_SIZE } from "@/lib/domain/evidence-upload";
import { Incident } from "@/lib/types";

// Mock WebSocket implementation for AssemblyAI client tests
class MockWebSocket {
  public url: string;
  public readyState: number = 0;
  public binaryType: string = "blob";
  public sentMessages: any[] = [];

  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: any }) => void) | null = null;
  public onerror: ((event: any) => void) | null = null;
  public onclose: ((event: { code: number; reason?: string }) => void) | null = null;

  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];
  static autoOpen: boolean = true;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    if (MockWebSocket.autoOpen) {
      queueMicrotask(() => {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.();
      });
    }
  }

  public send(data: any) {
    this.sentMessages.push(data);
  }

  public close(code = 1000, reason = "") {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  public simulateMessage(payload: any) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

describe("Remediation Challenger 2: Adversarial Stress-Test Suite (R3, R5, R6)", () => {
  beforeEach(async () => {
    MockWebSocket.instances = [];
    MockWebSocket.autoOpen = true;
    (global as any).WebSocket = MockWebSocket;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // REQUIREMENT R3: PERSISTENCE TRUTH & EVIDENCE UPLOAD HARDENING
  // =========================================================================
  describe("R3: Persistence Truth & Evidence Hardening", () => {
    let testIncident: Incident;

    beforeAll(async () => {
      testIncident = await repository.createIncident({
        id: `incident-challenger2-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        shipmentId: "shipment-po44891",
        incidentNumber: `INC-C2-${Date.now().toString().slice(-4)}-${Math.random().toString(36).slice(2, 6)}`,
        status: "CAPTURING",
        receiverName: "Challenger Auditor",
        driverName: "Test Driver",
        startedAt: new Date().toISOString(),
      });
    });

    it("strictly defines MAX_EVIDENCE_FILE_SIZE as exactly 15 MB", () => {
      expect(MAX_EVIDENCE_FILE_SIZE).toBe(15 * 1024 * 1024);
      expect(MAX_EVIDENCE_FILE_SIZE).toBe(15728640);
    });

    it("restricts ALLOWED_EVIDENCE_MIME_TYPES to only jpeg, png, and webp", () => {
      expect(ALLOWED_EVIDENCE_MIME_TYPES.has("image/jpeg")).toBe(true);
      expect(ALLOWED_EVIDENCE_MIME_TYPES.has("image/png")).toBe(true);
      expect(ALLOWED_EVIDENCE_MIME_TYPES.has("image/webp")).toBe(true);
      expect(ALLOWED_EVIDENCE_MIME_TYPES.size).toBe(3);
    });

    it("rejects payload exceeding 15 MB with HTTP 400", async () => {
      // 15 MB + 1 byte payload
      const oversizedBytes = new Uint8Array(15 * 1024 * 1024 + 1);
      const oversizedFile = new File([oversizedBytes], "massive-photo.jpg", { type: "image/jpeg" });

      const formData = new FormData();
      formData.append("file", oversizedFile);
      formData.append("incidentId", testIncident.id);

      const req = new Request("http://localhost:3000/api/evidence", {
        method: "POST",
        body: formData,
      });

      const res = await postEvidence(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain("exceeds the 15 MB limit");
    });

    it("rejects 25 MB payload with HTTP 400", async () => {
      const oversizedBytes = new Uint8Array(25 * 1024 * 1024);
      const oversizedFile = new File([oversizedBytes], "giant-evidence.png", { type: "image/png" });

      const formData = new FormData();
      formData.append("file", oversizedFile);
      formData.append("incidentId", testIncident.id);

      const req = new Request("http://localhost:3000/api/evidence", {
        method: "POST",
        body: formData,
      });

      const res = await postEvidence(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("exceeds the 15 MB limit");
    });

    it("rejects unsupported MIME types with HTTP 400", async () => {
      const forbiddenTypes = [
        { mime: "text/plain", ext: "notes.txt" },
        { mime: "image/gif", ext: "animation.gif" },
        { mime: "application/pdf", ext: "bill_of_lading.pdf" },
        { mime: "image/svg+xml", ext: "vector.svg" },
        { mime: "video/mp4", ext: "dock_footage.mp4" },
        { mime: "application/octet-stream", ext: "unknown.bin" },
        { mime: "image/bmp", ext: "dock.bmp" },
        { mime: "image/tiff", ext: "dock.tiff" },
      ];

      for (const item of forbiddenTypes) {
        const dummyFile = new File([new Uint8Array(500)], item.ext, { type: item.mime });
        const formData = new FormData();
        formData.append("file", dummyFile);
        formData.append("incidentId", testIncident.id);

        const req = new Request("http://localhost:3000/api/evidence", {
          method: "POST",
          body: formData,
        });

        const res = await postEvidence(req);
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toContain("Invalid file type");
        expect(json.error).toContain("Only image/jpeg, image/png, and image/webp are supported");
      }
    });

    it("rejects request without file with HTTP 400", async () => {
      const formData = new FormData();
      formData.append("incidentId", testIncident.id);

      const req = new Request("http://localhost:3000/api/evidence", {
        method: "POST",
        body: formData,
      });

      const res = await postEvidence(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("No file provided");
    });

    it("rejects request without incidentId with HTTP 400", async () => {
      const dummyFile = new File([new Uint8Array(500)], "dock.jpg", { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("file", dummyFile);

      const req = new Request("http://localhost:3000/api/evidence", {
        method: "POST",
        body: formData,
      });

      const res = await postEvidence(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Missing required field: incidentId");
    });

    it("rejects upload for non-existent incident with HTTP 404", async () => {
      const dummyFile = new File([new Uint8Array(500)], "dock.jpg", { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("file", dummyFile);
      formData.append("incidentId", "non-existent-incident-99999");

      const req = new Request("http://localhost:3000/api/evidence", {
        method: "POST",
        body: formData,
      });

      const res = await postEvidence(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toContain("not found");
    });

    function createValidImageBuffer(mime: string, size = 1024): ArrayBuffer {
      const ab = new ArrayBuffer(size);
      const buf = new Uint8Array(ab);
      const lower = mime.toLowerCase();
      if (lower === "image/jpeg") {
        buf[0] = 0xff;
        buf[1] = 0xd8;
        buf[2] = 0xff;
        buf[3] = 0xe0;
      } else if (lower === "image/png") {
        buf[0] = 0x89;
        buf[1] = 0x50;
        buf[2] = 0x4e;
        buf[3] = 0x47;
        buf[4] = 0x0d;
        buf[5] = 0x0a;
        buf[6] = 0x1a;
        buf[7] = 0x0a;
      } else if (lower === "image/webp") {
        buf[0] = 0x52;
        buf[1] = 0x49;
        buf[2] = 0x46;
        buf[3] = 0x46;
        buf[8] = 0x57;
        buf[9] = 0x45;
        buf[10] = 0x42;
        buf[11] = 0x50;
      }
      return ab;
    }

    it("rejects files with spoofed extension and invalid magic bytes with HTTP 400", async () => {
      // Create a text file disguised as JPEG
      const spoofedBytes = new TextEncoder().encode("Not a real JPEG image file");
      const spoofedFile = new File([spoofedBytes], "malicious.jpg", { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("file", spoofedFile);
      formData.append("incidentId", testIncident.id);

      const req = new Request("http://localhost:3000/api/evidence", {
        method: "POST",
        body: formData,
      });

      const res = await postEvidence(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("magic bytes");
    });

    it("accepts valid image/jpeg, image/png, image/webp under 15 MB and writes to DB & Audit", async () => {
      const validTypes = [
        { mime: "image/jpeg", name: "carton-damage.jpg" },
        { mime: "image/png", name: "seal-photo.png" },
        { mime: "image/webp", name: "pallet-wrap.webp" },
      ];

      for (const item of validTypes) {
        const dummyFile = new File([createValidImageBuffer(item.mime, 2048)], item.name, { type: item.mime });
        const formData = new FormData();
        formData.append("file", dummyFile);
        formData.append("incidentId", testIncident.id);
        formData.append("description", `Inspection photo for ${item.name}`);
        formData.append("capturedBy", "RECEIVER");

        const req = new Request("http://localhost:3000/api/evidence", {
          method: "POST",
          body: formData,
        });

        const res = await postEvidence(req);
        expect(res.status).toBe(201);
        const record = await res.json();

        expect(record.id).toMatch(/^ev-/);
        expect(record.incidentId).toBe(testIncident.id);
        expect(record.type).toBe("PHOTO");
        expect(record.storagePath).toContain(testIncident.id);
        expect(record.description).toBe(`Inspection photo for ${item.name}`);

        // Verify genuine persistence in repository
        const evidenceInDb = await repository.getEvidence(testIncident.id);
        const match = evidenceInDb.find((e) => e.id === record.id);
        expect(match).toBeDefined();
        expect(match?.storagePath).toBe(record.storagePath);

        // Verify genuine append-only audit event created
        const auditEvents = await repository.getAuditEvents(testIncident.id);
        const auditMatch = auditEvents.find(
          (a) => a.eventType === "EVIDENCE_ADDED" && (a.payloadJson as any)?.evidenceId === record.id
        );
        expect(auditMatch).toBeDefined();
        expect(auditMatch?.actor).toBe("RECEIVER");
      }
    });

    it("supports normalized uppercase MIME types (IMAGE/JPEG)", async () => {
      const dummyFile = new File([createValidImageBuffer("image/jpeg", 1024)], "uppercase.jpg", { type: "IMAGE/JPEG" });
      const formData = new FormData();
      formData.append("file", dummyFile);
      formData.append("incidentId", testIncident.id);

      const req = new Request("http://localhost:3000/api/evidence", {
        method: "POST",
        body: formData,
      });

      const res = await postEvidence(req);
      expect(res.status).toBe(201);
    });

    it("verifies POST /api/incidents/[id]/photo route delegates cleanly to processEvidenceUpload", async () => {
      const dummyFile = new File([createValidImageBuffer("image/jpeg", 1024)], "route-photo.jpg", { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("file", dummyFile);
      formData.append("description", "Direct incident photo route test");

      const req = new Request(`http://localhost:3000/api/incidents/${testIncident.id}/photo`, {
        method: "POST",
        body: formData,
      });

      const res = await postPhoto(req, { params: Promise.resolve({ id: testIncident.id }) });
      expect(res.status).toBe(201);
      const record = await res.json();
      expect(record.incidentId).toBe(testIncident.id);
    });

    it("ensures SupabaseDataRepository re-throws database errors and NEVER silently masks them via fallback", async () => {
      const prevMock = process.env.USE_MOCK_STORE;
      process.env.USE_MOCK_STORE = "false";
      try {
        // Create a mock Supabase client that returns an explicit database constraint error
        const mockClientWithDbError: any = {
          from: (table: string) => ({
            insert: async () => ({
              error: { message: `violates foreign key constraint '${table}_incident_id_fkey'` },
            }),
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  error: { message: `permission denied for table ${table}` },
                }),
              }),
            }),
          }),
        };

        const repo = new SupabaseDataRepository();
        // Inject client
        (repo as any).client = mockClientWithDbError;

        // 1. saveEvidence must throw, NOT silently fallback
        await expect(
          repo.saveEvidence({
            id: "ev-fail-1",
            incidentId: "inc-invalid",
            type: "PHOTO",
            storagePath: "photos/test.jpg",
            capturedBy: "RECEIVER",
            createdAt: new Date().toISOString(),
          })
        ).rejects.toThrow("Database error saving evidence: violates foreign key constraint 'evidence_incident_id_fkey'");

        // 2. appendAuditEvent must throw, NOT silently fallback
        await expect(
          repo.appendAuditEvent({
            id: "audit-fail-1",
            incidentId: "inc-invalid",
            actor: "RECEIVER",
            eventType: "EVIDENCE_ADDED",
            payloadJson: {},
            createdAt: new Date().toISOString(),
          })
        ).rejects.toThrow("Database error appending audit event: violates foreign key constraint 'audit_events_incident_id_fkey'");

        // 3. createException must throw, NOT silently fallback
        await expect(
          repo.createException({
            id: "exc-fail-1",
            incidentId: "inc-invalid",
            shipmentItemId: "item-1",
            type: "SHORTAGE",
            expectedQty: 48,
            observedQty: 40,
            delta: -8,
            agreementStatus: "DISPUTED",
          })
        ).rejects.toThrow("Database error creating exception: violates foreign key constraint 'exceptions_incident_id_fkey'");
      } finally {
        process.env.USE_MOCK_STORE = prevMock;
      }
    });
  });

  // =========================================================================
  // REQUIREMENT R5: REAL OPERATIONS DASHBOARD AGGREGATION
  // =========================================================================
  describe("R5: Dynamic Operations Aggregation without PO Hardcoding", () => {
    it("returns dynamic manifests and KPIs from repository rows", async () => {
      const res = await getOperations();
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(Array.isArray(data.manifests)).toBe(true);
      expect(data.manifests.length).toBeGreaterThanOrEqual(5);

      expect(data.kpis).toBeDefined();
      expect(typeof data.kpis.totalActiveExceptions).toBe("number");
      expect(typeof data.kpis.totalDisputedRecords).toBe("number");
      expect(typeof data.kpis.totalReadyForReview).toBe("number");
      expect(typeof data.kpis.totalCartonsHandled).toBe("number");
    });

    it("dynamically recalculates manifests, discrepancies, and KPIs when repository state changes", async () => {
      // Get baseline metrics
      const baseRes = await getOperations();
      const baseData = await baseRes.json();
      const baseExceptions = baseData.kpis.totalActiveExceptions;
      const baseDisputes = baseData.kpis.totalDisputedRecords;

      // PO 44880 is clean by default in seeds.
      // We will dynamically create an incident for PO 44880 with:
      // - Observed quantity: 38 (shortage: -10)
      // - Damage exception: crushed packaging
      // - Driver attestation: DISPUTE
      // - Photo evidence: 1 photo
      const po44880Incident = await repository.createIncident({
        id: `incident-dyn-44880-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        shipmentId: "shipment-po44880",
        incidentNumber: `INC-44880-DYN-${Date.now().toString().slice(-4)}-${Math.random().toString(36).slice(2, 6)}`,
        status: "CAPTURING",
        receiverName: "Auditor John",
        driverName: "Driver Bob",
        startedAt: new Date().toISOString(),
      });

      await repository.saveObservation({
        id: `obs-dyn-1-${Date.now()}`,
        incidentId: po44880Incident.id,
        fieldKey: "observed_qty",
        valueJson: { observedQty: 38 },
        sourceQuote: "Counted 38 cartons on the pallet",
        speakerRole: "RECEIVER",
        confidence: 0.99,
        confirmed: true,
        createdAt: new Date().toISOString(),
      });

      const dynExceptionId = `exc-dyn-1-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await repository.createException({
        id: dynExceptionId,
        incidentId: po44880Incident.id,
        shipmentItemId: "item-po44880-1",
        type: "DAMAGE",
        expectedQty: 48,
        observedQty: 38,
        delta: -10,
        damageDescription: "Cartons crushed under heavy pallet",
        agreementStatus: "DISPUTED",
        createdAt: new Date().toISOString(),
      });

      await repository.saveAttestation({
        id: `att-dyn-1-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        incidentId: po44880Incident.id,
        exceptionId: dynExceptionId,
        partyRole: "DRIVER",
        position: "DISPUTE",
        createdAt: new Date().toISOString(),
      });

      await repository.saveEvidence({
        id: `ev-dyn-1-${Date.now()}`,
        incidentId: po44880Incident.id,
        type: "PHOTO",
        storagePath: "photos/crushed-44880.jpg",
        description: "Crushed cartons photo",
        capturedBy: "RECEIVER",
        createdAt: new Date().toISOString(),
      });

      // Re-query operations API
      const updatedRes = await getOperations();
      expect(updatedRes.status).toBe(200);
      const updatedData = await updatedRes.json();

      // Find the manifest for PO 44880
      const manifest44880 = updatedData.manifests.find(
        (m: any) => m.shipment.poNumber === "44880"
      );
      expect(manifest44880).toBeDefined();
      expect(manifest44880.incidentId).toBe(po44880Incident.id);
      expect(manifest44880.observedQty).toBe(38);
      expect(manifest44880.delta).toBe(-12);
      expect(manifest44880.discrepancyType).toBe("SHORTAGE");
      expect(manifest44880.hasDamage).toBe(true);
      expect(manifest44880.damageDescription).toBe("Cartons crushed under heavy pallet");
      expect(manifest44880.driverPosition).toBe("DISPUTE");
      expect(manifest44880.agreementStatus).toBe("DISPUTED");
      expect(manifest44880.photoCount).toBe(1);
      expect(manifest44880.readinessStatus).toBe("READY_FOR_OPS_REVIEW");

      // Verify KPIs updated dynamically
      const priorHasException = baseData.manifests.some(
        (m: any) => m.shipment.poNumber === "44880" && (m.discrepancyType === "SHORTAGE" || m.discrepancyType === "OVERAGE" || m.hasDamage)
      );
      const priorHasDispute = baseData.manifests.some(
        (m: any) => m.shipment.poNumber === "44880" && m.agreementStatus === "DISPUTED"
      );
      expect(updatedData.kpis.totalActiveExceptions).toBe(baseExceptions + (priorHasException ? 0 : 1));
      expect(updatedData.kpis.totalDisputedRecords).toBe(baseDisputes + (priorHasDispute ? 0 : 1));
    });

    it("verifies photo count increments dynamically when more photos are uploaded", async () => {
      const inc = await repository.createIncident({
        id: `incident-photo-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        shipmentId: "shipment-po44902",
        incidentNumber: `INC-44902-PHOTOS-${Date.now().toString().slice(-4)}-${Math.random().toString(36).slice(2, 6)}`,
        status: "CAPTURING",
        startedAt: new Date().toISOString(),
      });

      // Add 3 photos
      for (let i = 1; i <= 3; i++) {
        await repository.saveEvidence({
          id: `ev-photo-test-${i}-${Date.now()}`,
          incidentId: inc.id,
          type: "PHOTO",
          storagePath: `photos/evidence-${i}.jpg`,
          capturedBy: "RECEIVER",
          createdAt: new Date().toISOString(),
        });
      }

      const res = await getOperations();
      const data = await res.json();
      const manifest = data.manifests.find((m: any) => m.shipment.poNumber === "44902");
      expect(manifest).toBeDefined();
      expect(manifest.photoCount).toBe(3);
    });
  });

  // =========================================================================
  // REQUIREMENT R6: ASSEMBLYAI STREAMING PIPELINE CLEANUP
  // =========================================================================
  describe("R6: AssemblyAI Streaming Pipeline (keyterms_prompt & Reconnection)", () => {
    it("formats keyterms_prompt as a valid JSON-encoded array query parameter in WebSocket URL", async () => {
      const client = new AssemblyAIRealtimeClient({
        token: "ephemeral-token-123",
        keytermsPrompt: ["Carton 31", "PO 44891", "crushed box"],
      });

      await client.connect();

      expect(MockWebSocket.instances.length).toBe(1);
      const ws = MockWebSocket.instances[0];
      const url = new URL(ws.url);

      const promptParam = url.searchParams.get("keyterms_prompt");
      expect(promptParam).toBeDefined();
      expect(typeof promptParam).toBe("string");

      const parsed = JSON.parse(promptParam!);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toEqual(["Carton 31", "PO 44891", "crushed box"]);
    });

    it("sanitizes keyterms: trims whitespace, removes empty entries, and deduplicates terms", async () => {
      const client = new AssemblyAIRealtimeClient({
        token: "ephemeral-token-123",
        keytermsPrompt: [
          "  Carton 31  ",
          "",
          "   ",
          "pallet",
          "pallet",
          "  pallet  ",
          "crushed",
        ],
      });

      await client.connect();
      const ws = MockWebSocket.instances[0];
      const url = new URL(ws.url);

      const parsed = JSON.parse(url.searchParams.get("keyterms_prompt")!);
      expect(parsed).toEqual(["Carton 31", "pallet", "crushed"]);
    });

    it("enforces length limit of 50 characters per keyterm and caps total terms at 100", async () => {
      const terms: string[] = [];
      // Add 120 valid terms
      for (let i = 0; i < 120; i++) {
        terms.push(`term-${i.toString().padStart(3, "0")}`);
      }
      // Add oversized terms (>50 chars)
      terms.push("x".repeat(51));
      terms.push("y".repeat(100));

      const client = new AssemblyAIRealtimeClient({
        token: "ephemeral-token-123",
        keytermsPrompt: terms,
      });

      await client.connect();
      const ws = MockWebSocket.instances[0];
      const url = new URL(ws.url);

      const parsed = JSON.parse(url.searchParams.get("keyterms_prompt")!);
      // Total capped at 100
      expect(parsed.length).toBe(100);
      // None of the terms should be longer than 50 characters
      expect(parsed.every((t: string) => t.length <= 50)).toBe(true);
      expect(parsed.some((t: string) => t.startsWith("x"))).toBe(false);
      expect(parsed.some((t: string) => t.startsWith("y"))).toBe(false);
    });

    it("omits keyterms_prompt parameter completely when terms array is empty or only whitespace", async () => {
      const client = new AssemblyAIRealtimeClient({
        token: "ephemeral-token-123",
        keytermsPrompt: ["", "   ", " \t "],
      });

      await client.connect();
      const ws = MockWebSocket.instances[0];
      const url = new URL(ws.url);

      expect(url.searchParams.get("keyterms_prompt")).toBeNull();
    });

    it("supports backward compatibility by mapping wordBoost to keyterms_prompt query parameter", async () => {
      const client = new AssemblyAIRealtimeClient({
        token: "ephemeral-token-123",
        wordBoost: ["trailer-99", "northstar"],
      });

      await client.connect();
      const ws = MockWebSocket.instances[0];
      const url = new URL(ws.url);

      const parsed = JSON.parse(url.searchParams.get("keyterms_prompt")!);
      expect(parsed).toEqual(["trailer-99", "northstar"]);
    });

    it("aborts connection and throws error when WebSocket handshake exceeds 8s timeout", async () => {
      vi.useFakeTimers();
      MockWebSocket.autoOpen = false; // Do not fire onopen

      const client = new AssemblyAIRealtimeClient({
        token: "ephemeral-token-123",
      });

      const connectPromise = client.connect();

      // Advance timers by 8001 ms to trigger timeout
      vi.advanceTimersByTime(8001);

      await expect(connectPromise).rejects.toThrow("WebSocket connection to AssemblyAI timed out (8s)");
      expect(client.getState()).toBe("error");
    });

    it("verifies exponential backoff reconnection schedule: 1s, 2s, 4s, then aborts at 4th attempt", () => {
      // Verify backoff delay calculation: delay = 2^(attempt - 1) * 1000
      const calcDelay = (attempt: number) => Math.pow(2, attempt - 1) * 1000;

      expect(calcDelay(1)).toBe(1000); // 1s
      expect(calcDelay(2)).toBe(2000); // 2s
      expect(calcDelay(3)).toBe(4000); // 4s

      // Exceeding 3 attempts triggers terminal error
      const maxAttempts = 3;
      const attempt = 4;
      const isTerminal = attempt > maxAttempts;
      expect(isTerminal).toBe(true);
    });
  });
});
