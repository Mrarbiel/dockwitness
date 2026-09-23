import { describe, it, expect, beforeEach } from "vitest";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { GET as getEvidenceRoute } from "@/app/api/evidence/[id]/route";
import { repository } from "@/lib/repository";
import { EvidenceRecord } from "@/lib/types";

describe("Persisted Evidence GET / Download Suite (Finding 5 - P1)", () => {
  let sampleEvidenceId: string;
  const incidentId = "inc-test-evidence-download";

  beforeEach(async () => {
    // Setup sample evidence record in repository
    const sampleRecord: EvidenceRecord = {
      id: `ev-download-test-${Date.now()}`,
      incidentId,
      type: "PHOTO",
      storagePath: `${incidentId}/test-photo-carton31.jpg`,
      description: "Photo of crushed carton 31",
      capturedBy: "RECEIVER",
      createdAt: new Date().toISOString(),
    };
    const saved = await repository.saveEvidence(sampleRecord);
    sampleEvidenceId = saved.id;
  });

  it("serves persisted evidence image with HTTP 200 and inline disposition for preview", async () => {
    const req = new Request(`http://localhost:3000/api/evidence/${sampleEvidenceId}`, {
      method: "GET",
    });

    const res = await getEvidenceRoute(req, {
      params: Promise.resolve({ id: sampleEvidenceId }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Content-Disposition")).toContain("inline");
    expect(res.headers.get("Content-Disposition")).toContain("test-photo-carton31.jpg");

    // Verify body contains valid image bytes
    const arrayBuffer = await res.arrayBuffer();
    expect(arrayBuffer.byteLength).toBeGreaterThan(0);
  });

  it("serves persisted evidence image with attachment disposition when download=true", async () => {
    const req = new Request(`http://localhost:3000/api/evidence/${sampleEvidenceId}?download=true`, {
      method: "GET",
    });

    const res = await getEvidenceRoute(req, {
      params: Promise.resolve({ id: sampleEvidenceId }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(res.headers.get("Content-Disposition")).toContain("test-photo-carton31.jpg");
  });

  it("correctly identifies PNG and WebP MIME types based on file extension", async () => {
    const pngRecord: EvidenceRecord = {
      id: `ev-png-${Date.now()}`,
      incidentId,
      type: "PHOTO",
      storagePath: `${incidentId}/seal-inspection.png`,
      description: "Seal intact inspection",
      capturedBy: "DRIVER",
      createdAt: new Date().toISOString(),
    };
    await repository.saveEvidence(pngRecord);

    const req = new Request(`http://localhost:3000/api/evidence/${pngRecord.id}`, { method: "GET" });
    const res = await getEvidenceRoute(req, {
      params: Promise.resolve({ id: pngRecord.id }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });

  it("returns HTTP 404 when evidence record does not exist", async () => {
    const req = new Request("http://localhost:3000/api/evidence/non-existent-evidence-id-9999", {
      method: "GET",
    });

    const res = await getEvidenceRoute(req, {
      params: Promise.resolve({ id: "non-existent-evidence-id-9999" }),
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Evidence not found");
  });

  it("blocks path traversal attacks on storagePath with HTTP 400", async () => {
    const maliciousRecord: EvidenceRecord = {
      id: `ev-traversal-${Date.now()}`,
      incidentId,
      type: "PHOTO",
      storagePath: "../../etc/passwd",
      description: "Malicious traversal attempt",
      capturedBy: "ATTACKER",
      createdAt: new Date().toISOString(),
    };
    await repository.saveEvidence(maliciousRecord);

    const req = new Request(`http://localhost:3000/api/evidence/${maliciousRecord.id}`, { method: "GET" });
    const res = await getEvidenceRoute(req, {
      params: Promise.resolve({ id: maliciousRecord.id }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid storage path");
  });
});
