import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vaRoute from "@/app/api/voice-agent/token/route";

describe("Voice Agent Token Minting Route: /api/voice-agent/token", () => {
  const originalEnv = process.env.ASSEMBLYAI_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.ASSEMBLYAI_API_KEY = "mock-voice-agent-assemblyai-key";
  });

  afterEach(() => {
    process.env.ASSEMBLYAI_API_KEY = originalEnv;
  });

  it("mints voice agent ephemeral token via upstream GET with expires_in_seconds query", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          token: "voice-agent-ephemeral-token-xyz789",
          expires_in_seconds: 60,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const req = new Request("http://localhost:3000/api/voice-agent/token", { method: "POST" });
    const response = await vaRoute.POST(req);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.token).toBe("voice-agent-ephemeral-token-xyz789");
    expect(typeof data.expires_at).toBe("number");
    expect(data.expires_at).toBeGreaterThan(Date.now());

    // Verify upstream call semantics
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];

    // Method must be GET per upstream protocol
    expect(init?.method).toBe("GET");
    expect(init?.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer mock-voice-agent-assemblyai-key",
      })
    );

    // Verify query parameter exists: expires_in_seconds
    const parsedUrl = new URL(url as string);
    expect(parsedUrl.origin + parsedUrl.pathname).toBe("https://agents.assemblyai.com/v1/token");
    expect(parsedUrl.searchParams.get("expires_in_seconds")).toBe("60");
  });

  it("strictly disallows GET requests (POST only endpoint enforcement)", () => {
    expect((vaRoute as any).GET).toBeUndefined();
  });

  it("returns 500 if ASSEMBLYAI_API_KEY is not configured", async () => {
    delete process.env.ASSEMBLYAI_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const req = new Request("http://localhost:3000/api/voice-agent/token", { method: "POST" });
    const response = await vaRoute.POST(req);
    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data.error).toMatch(/credentials not configured/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 502 with sanitized error if upstream AssemblyAI returns error status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Invalid credentials or unauthorized", {
        status: 401,
        statusText: "Unauthorized",
      })
    );

    const req = new Request("http://localhost:3000/api/voice-agent/token", { method: "POST" });
    const response = await vaRoute.POST(req);
    expect(response.status).toBe(502);

    const data = await response.json();
    expect(data.error).toMatch(/rejected token minting/i);
    expect(data.error).not.toContain("mock-voice-agent-assemblyai-key");
  });

  it("returns 500 if upstream fetch throws network exception", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Voice Agent connection reset (ECONNRESET)")
    );

    const req = new Request("http://localhost:3000/api/voice-agent/token", { method: "POST" });
    const response = await vaRoute.POST(req);
    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data.error).toMatch(/Failed to connect to Voice Agent token service/i);
  });
});
