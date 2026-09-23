import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateSameOrigin } from "@/lib/auth/origin-validation";
import { POST as createIncident } from "@/app/api/incidents/route";

describe("Adversarial Origin & Boundary Verification (Release-Blocker 2)", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    (process.env as any).NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://dockwitness.example.com";
  });

  afterEach(() => {
    (process.env as any).NODE_ENV = originalNodeEnv;
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  });

  it("rejects x-test-client: 1 from evil origin with 403 (untrusted client-controlled bypass header)", async () => {
    // 1. Unit validation
    const req = new Request("https://dockwitness.example.com/api/incidents", {
      method: "POST",
      headers: {
        Origin: "https://evil-attacker.com",
        "x-test-client": "1",
      },
    });
    const result = validateSameOrigin(req);
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/Forbidden/i);

    // 2. Route handler validation
    const res = await createIncident(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Forbidden: Request origin 'evil-attacker.com' does not match authorized application domain/i);
  });

  it("rejects localhost.attacker.example with 403 (unsafe prefix prevention)", async () => {
    const req = new Request("https://dockwitness.example.com/api/incidents", {
      method: "POST",
      headers: {
        Origin: "https://localhost.attacker.example",
      },
    });
    const result = validateSameOrigin(req);
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/Forbidden/i);

    const res = await createIncident(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Forbidden: Request origin 'localhost.attacker.example' does not match authorized application domain/i);
  });

  it("rejects 127.0.0.1.attacker.example with 403 (unsafe prefix prevention)", async () => {
    const req = new Request("https://dockwitness.example.com/api/incidents", {
      method: "POST",
      headers: {
        Origin: "https://127.0.0.1.attacker.example",
      },
    });
    const result = validateSameOrigin(req);
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/Forbidden/i);

    const res = await createIncident(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Forbidden: Request origin '127.0.0.1.attacker.example' does not match authorized application domain/i);
  });

  it("allows legitimate configured origin", async () => {
    const req = new Request("https://dockwitness.example.com/api/incidents", {
      method: "POST",
      headers: {
        Origin: "https://dockwitness.example.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ shipmentId: "shipment-po44891" }),
    });
    const result = validateSameOrigin(req);
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("allows legitimate localhost test/dev request through exact expected host", async () => {
    (process.env as any).NODE_ENV = "development";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    const req = new Request("http://localhost:3000/api/incidents", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ shipmentId: "shipment-po44891" }),
    });
    const result = validateSameOrigin(req);
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
