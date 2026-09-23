import { describe, it, expect, vi } from "vitest";
import { VoiceAgentClient } from "@/lib/assemblyai/voice-agent-client";

describe("Layer 9: Chaos & Fault-Injection Invariant Testing", () => {
  describe("Network & HTTP Faults", () => {
    it("handles HTTP 401 Unauthorized gracefully when minting Voice Agent token", async () => {
      let reportedError: string | null = null;
      let stateTransitions: string[] = [];

      const client = new VoiceAgentClient({
        shipmentId: "shipment-chaos",
        incidentId: "inc-chaos",
        onError: (err) => {
          reportedError = err;
        },
        onStateChange: (st) => {
          stateTransitions.push(st);
        },
      });

      // Mock global fetch returning 401
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      });

      try {
        await client.connect();
        expect(client.getState()).toBe("ERROR");
        expect(reportedError).toContain("401");
        expect(stateTransitions).toContain("CONNECTING");
        expect(stateTransitions).toContain("ERROR");
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("handles HTTP 429 Rate Limit responses without crashing", async () => {
      let reportedError: string | null = null;

      const client = new VoiceAgentClient({
        shipmentId: "shipment-chaos",
        incidentId: "inc-chaos",
        onError: (err) => {
          reportedError = err;
        },
      });

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: "Too Many Requests" }),
      });

      try {
        await client.connect();
        expect(client.getState()).toBe("ERROR");
        expect(reportedError).toContain("429");
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("handles unexpected network throw / offline state during connect", async () => {
      let reportedError: string | null = null;

      const client = new VoiceAgentClient({
        shipmentId: "shipment-chaos",
        incidentId: "inc-chaos",
        onError: (err) => {
          reportedError = err;
        },
      });

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error("Network unreachable: ENETUNREACH"));

      try {
        await client.connect();
        expect(client.getState()).toBe("ERROR");
        expect(reportedError).toContain("Network unreachable");
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe("WebSocket Protocol Chaos & Corrupted Payloads", () => {
    it("handles malformed/corrupted non-JSON WebSocket payloads without crashing", () => {
      const client = new VoiceAgentClient({
        shipmentId: "shipment-chaos",
        incidentId: "inc-chaos",
      });

      // Directly dispatch malformed message
      const handleMessage = (client as any).handleIncomingMessage.bind(client);

      // Verify that strange messages or corrupted strings do not throw uncaught errors
      expect(() => {
        handleMessage({} as any);
        handleMessage({ type: "unknown.corrupt.event", garbage: 12345 } as any);
      }).not.toThrow();
    });

    it("handles server protocol error events (session.error) cleanly", () => {
      let reportedError: string | null = null;

      const client = new VoiceAgentClient({
        shipmentId: "shipment-chaos",
        incidentId: "inc-chaos",
        onError: (err) => {
          reportedError = err;
        },
      });

      const handleMessage = (client as any).handleIncomingMessage.bind(client);

      handleMessage({
        type: "session.error",
        code: "invalid_format",
        message: "Invalid session parameter format",
      });

      expect(reportedError).toBe("Invalid session parameter format");
    });
  });

  describe("Audio Stream Torture & Emergency Teardown", () => {
    it("safely clears playback and releases resources on disconnect even during active playback", () => {
      const client = new VoiceAgentClient({
        shipmentId: "shipment-chaos",
        incidentId: "inc-chaos",
      });

      (client as any).isPlayingAudio = true;
      (client as any).audioQueue = [{}, {}, {}]; // simulated pending audio

      // Disconnect client
      client.disconnect();

      expect(client.getState()).toBe("DISCONNECTED");
      expect((client as any).audioQueue.length).toBe(0);
      expect((client as any).isPlayingAudio).toBe(false);
    });
  });
});
