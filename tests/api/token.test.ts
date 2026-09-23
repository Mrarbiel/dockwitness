import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as aaiRoute from "@/app/api/aai/token/route";

describe("Server Token Minting Route: /api/aai/token", () => {
  const originalEnv = process.env.ASSEMBLYAI_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.ASSEMBLYAI_API_KEY = "mock-secret-assemblyai-key";
  });

  afterEach(() => {
    process.env.ASSEMBLYAI_API_KEY = originalEnv;
  });

  it("mints ephemeral token via upstream GET with 60s TTL and 600s max session", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          token: "ephemeral-token-abc123xyz",
          expires_in_seconds: 60,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const req = new Request("http://localhost:3000/api/aai/token", { method: "POST" });
    const response = await aaiRoute.POST(req);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.token).toBe("ephemeral-token-abc123xyz");
    expect(typeof data.expires_at).toBe("number");
    expect(data.expires_at).toBeGreaterThan(Date.now());

    // Verify upstream call semantics
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];

    // Method must be GET per upstream protocol
    expect(init?.method).toBe("GET");
    expect(init?.headers).toEqual(
      expect.objectContaining({
        Authorization: "mock-secret-assemblyai-key",
      })
    );

    // Verify query parameters
    const parsedUrl = new URL(url as string);
    expect(parsedUrl.origin + parsedUrl.pathname).toBe("https://streaming.assemblyai.com/v3/token");
    expect(parsedUrl.searchParams.get("expires_in_seconds")).toBe("60");
    expect(parsedUrl.searchParams.get("max_session_duration_seconds")).toBe("600");
  });

  it("strictly disallows GET requests (POST only endpoint enforcement)", () => {
    // In accordance with P0 hardening, GET is unexported
    expect((aaiRoute as any).GET).toBeUndefined();
  });

  it("returns 500 if ASSEMBLYAI_API_KEY is not configured", async () => {
    delete process.env.ASSEMBLYAI_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const req = new Request("http://localhost:3000/api/aai/token", { method: "POST" });
    const response = await aaiRoute.POST(req);
    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data.error).toMatch(/credentials not configured/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 502 with sanitized error if upstream AssemblyAI returns error status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Invalid credentials or quota exceeded", {
        status: 401,
        statusText: "Unauthorized",
      })
    );

    const req = new Request("http://localhost:3000/api/aai/token", { method: "POST" });
    const response = await aaiRoute.POST(req);
    expect(response.status).toBe(502);

    const data = await response.json();
    expect(data.error).toMatch(/rejected token minting/i);
    expect(data.error).not.toContain("mock-secret-assemblyai-key"); // Never leak key
  });

  it("returns 500 if upstream fetch throws network exception", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("DNS lookup failure (ENOTFOUND)")
    );

    const req = new Request("http://localhost:3000/api/aai/token", { method: "POST" });
    const response = await aaiRoute.POST(req);
    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data.error).toMatch(/Failed to connect to speech streaming service/i);
  });
});
