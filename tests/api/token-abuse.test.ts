import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST as aaiPost } from "@/app/api/aai/token/route";
import { POST as voiceAgentPost } from "@/app/api/voice-agent/token/route";

describe("Public Token Endpoint Hardening & Abuse Protection", () => {
  const originalEnv = process.env.ASSEMBLYAI_API_KEY;
  const originalNodeEnv = process.env.NODE_ENV;
  const SECRET_KEY = "test-secret-assemblyai-key-99999-do-not-leak";

  beforeEach(() => {
    process.env.ASSEMBLYAI_API_KEY = SECRET_KEY;
    (process.env as any).NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://dockwitness.vercel.app";
  });

  afterEach(() => {
    process.env.ASSEMBLYAI_API_KEY = originalEnv;
    (process.env as any).NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it("strictly rejects cross-origin token minting requests with HTTP 403", async () => {
    const hostileOrigins = [
      "https://evil-attacker.com",
      "https://phishing-site.xyz",
      "http://rogue-client.net:8080",
      "https://evil-tenant.vercel.app",
    ];

    for (const origin of hostileOrigins) {
      const aaiReq = new Request("https://dockwitness.vercel.app/api/aai/token", {
        method: "POST",
        headers: {
          Origin: origin,
          "x-test-enforce-origin": "true",
        },
      });
      const aaiRes = await aaiPost(aaiReq);
      expect(aaiRes.status).toBe(403);
      const aaiBody = await aaiRes.json();
      expect(aaiBody.error).toMatch(/Forbidden/i);

      const vaReq = new Request("https://dockwitness.vercel.app/api/voice-agent/token", {
        method: "POST",
        headers: {
          Origin: origin,
          "x-test-enforce-origin": "true",
        },
      });
      const vaRes = await voiceAgentPost(vaReq);
      expect(vaRes.status).toBe(403);
      const vaBody = await vaRes.json();
      expect(vaBody.error).toMatch(/Forbidden/i);
    }
  });

  it("accepts same-origin production requests, returning Cache-Control: no-store and no leaked secrets", async () => {
    // Mock upstream fetch to return a mock token
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: "genuine-temporary-token-xyz-12345", expires_in_seconds: 60 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    // 1. Configured domain
    const req = new Request("https://dockwitness.vercel.app/api/aai/token", {
      method: "POST",
      headers: {
        Origin: "https://dockwitness.vercel.app",
        "x-test-enforce-origin": "true",
      },
    });

    const res = await aaiPost(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");

    const body = await res.json();
    expect(body.token).toBe("genuine-temporary-token-xyz-12345");

    // Verify the secret key is never leaked in the response body
    const jsonStr = JSON.stringify(body);
    expect(jsonStr).not.toContain(SECRET_KEY);
    expect(jsonStr).not.toContain("ASSEMBLYAI_API_KEY");

    // 2. Preview deployment where Origin matches request host
    const previewReq = new Request("https://dockwitness-preview.vercel.app/api/aai/token", {
      method: "POST",
      headers: {
        Origin: "https://dockwitness-preview.vercel.app",
        "x-test-enforce-origin": "true",
      },
    });
    const previewRes = await aaiPost(previewReq);
    expect(previewRes.status).toBe(200);
  });

  it("rejects mutating requests missing Origin or Referer in production", async () => {
    const req = new Request("https://dockwitness.vercel.app/api/aai/token", {
      method: "POST",
      headers: {
        "x-test-enforce-origin": "true",
      },
    });
    const res = await aaiPost(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Missing Origin or Referer/i);
  });

  it("sanitizes upstream provider 401/429/500 errors without proxying sensitive upstream body", async () => {
    // Mock upstream returning error containing sensitive internal details
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => `Invalid credentials for key ${SECRET_KEY} on internal server 10.0.0.5`,
    });
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("https://dockwitness.vercel.app/api/aai/token", {
      method: "POST",
      headers: {
        Origin: "https://dockwitness.vercel.app",
        "x-test-enforce-origin": "true",
      },
    });

    const res = await aaiPost(req);
    expect(res.status).toBe(502);

    const body = await res.json();
    expect(body.error).toBe("Upstream speech provider rejected token minting (401)");

    // Ensure raw upstream text was NOT proxied
    const jsonStr = JSON.stringify(body);
    expect(jsonStr).not.toContain(SECRET_KEY);
    expect(jsonStr).not.toContain("10.0.0.5");
  });

  it("fails safely with 500 when server provider credentials are not configured", async () => {
    process.env.ASSEMBLYAI_API_KEY = "";

    const req = new Request("https://dockwitness.vercel.app/api/voice-agent/token", {
      method: "POST",
      headers: {
        Origin: "https://dockwitness.vercel.app",
        "x-test-enforce-origin": "true",
      },
    });

    const res = await voiceAgentPost(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/credentials not configured/i);
    expect(JSON.stringify(body)).not.toContain(SECRET_KEY);
  });
});
