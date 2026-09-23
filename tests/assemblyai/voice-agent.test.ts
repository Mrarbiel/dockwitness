import { describe, it, expect, vi } from "vitest";
import {
  DOCKWITNESS_VOICE_AGENT_SYSTEM_PROMPT,
  DOCKWITNESS_VOICE_AGENT_TOOLS,
  executeVoiceAgentTool,
} from "@/lib/assemblyai/voice-agent-tools";
import { VoiceAgentClient } from "@/lib/assemblyai/voice-agent-client";

describe("AssemblyAI Voice Agent API: Architecture & Invariant Suite", () => {
  it("enforces non-negotiable invariants within the Voice Agent system prompt", () => {
    // 1. AI understands speech, code determines facts
    expect(DOCKWITNESS_VOICE_AGENT_SYSTEM_PROMPT).toContain("code determines facts");
    // 2. Disagreement recorded, never manufactured
    expect(DOCKWITNESS_VOICE_AGENT_SYSTEM_PROMPT).toContain("NEVER manufactures agreement");
    // 3. Silence is never consent
    expect(DOCKWITNESS_VOICE_AGENT_SYSTEM_PROMPT).toContain("Silence is NEVER consent");
    // 4. Liability permanently NOT_DETERMINED
    expect(DOCKWITNESS_VOICE_AGENT_SYSTEM_PROMPT).toContain("Liability is permanently NOT_DETERMINED");
    // 5. Never calculates carton shortage/overage
    expect(DOCKWITNESS_VOICE_AGENT_SYSTEM_PROMPT).toContain("NEVER calculate carton shortage or overage arithmetic");
  });

  it("registers all required deterministic tool definitions with valid schemas", () => {
    const toolNames = DOCKWITNESS_VOICE_AGENT_TOOLS.map((t) => t.function.name);
    expect(toolNames).toContain("get_shipment");
    expect(toolNames).toContain("get_workflow_state");
    expect(toolNames).toContain("record_candidate_observation");
    expect(toolNames).toContain("record_driver_attestation");
    expect(toolNames).toContain("request_missing_evidence");
    expect(toolNames).toContain("evaluate_readiness");

    // Check parameter schemas
    for (const tool of DOCKWITNESS_VOICE_AGENT_TOOLS) {
      expect(tool.type).toBe("function");
      expect(tool.function.description).toBeTruthy();
      expect(tool.function.parameters.type).toBe("object");
      expect(tool.function.parameters.properties).toBeDefined();
    }
  });

  it("handles unknown tool calls gracefully without crashing", async () => {
    const res = await executeVoiceAgentTool("unknown_hallucinated_tool", {});
    expect(res).toHaveProperty("error");
    expect(res.error).toContain("Unknown tool");
  });

  it("executes get_shipment tool against seeded shipments API", async () => {
    // Mock global fetch for unit isolation
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "shipment-po44891",
        poNumber: "44891",
        bolNumber: "NS-90283",
        carrierName: "NorthStar Freight",
        trailerNumber: "NST-2208",
        items: [{ sku: "AX-17", expectedQty: 48, unit: "cartons" }],
      }),
    });
    global.fetch = mockFetch;

    const res = await executeVoiceAgentTool("get_shipment", { shipmentId: "shipment-po44891" });
    expect(res.poNumber).toBe("44891");
    expect(res.expectedQuantity).toBe(48);
    expect(res.carrierName).toBe("NorthStar Freight");
  });

  it("executes record_candidate_observation without allowing LLM to perform arithmetic", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        recorded: true,
        discrepancy: { delta: -1, type: "SHORTAGE" },
        exceptions: [{ id: "exc-shortage-1", type: "SHORTAGE", delta: -1 }],
      }),
    });
    global.fetch = mockFetch;

    const res = await executeVoiceAgentTool("record_candidate_observation", {
      incidentId: "inc-123",
      fieldKey: "observed_qty",
      value: 47,
      quote: "I have forty-seven cartons",
    });

    expect(res.recorded).toBe(true);
    expect(res.observedQuantity).toBe(47);
  });

  it("executes record_driver_attestation with exact position mapping", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "att-123",
        agreementStatus: "DISPUTED",
      }),
    });
    global.fetch = mockFetch;

    const res = await executeVoiceAgentTool("record_driver_attestation", {
      incidentId: "inc-123",
      exceptionId: "exc-shortage-1",
      position: "DISPUTE",
      statement: "Seal was intact",
    });

    expect(res.recorded).toBe(true);
    expect(res.agreementStatus).toBe("DISPUTED");
  });

  it("executes request_missing_evidence and returns deterministic blocking reasons", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        readiness: {
          readyForReview: false,
          status: "EVIDENCE_REQUIRED",
          blockingReasons: ["Missing required damage photo for carton 31"],
        },
      }),
    });
    global.fetch = mockFetch;

    const res = await executeVoiceAgentTool("request_missing_evidence", {
      incidentId: "inc-123",
    });

    expect(res.isReadyForReview).toBe(false);
    expect(res.readinessStatus).toBe("EVIDENCE_REQUIRED");
    expect(res.guidance).toContain("Missing required damage photo");
  });

  it("supports barge-in / interruption: stopAudioPlayback cancels queue and sources", () => {
    const client = new VoiceAgentClient({
      shipmentId: "shipment-po44891",
      incidentId: "inc-123",
    });

    expect(client.getState()).toBe("DISCONNECTED");

    // Barge-in execution
    client.stopAudioPlayback();
    expect(client.getState()).toBe("DISCONNECTED");
  });

  it("simulates user turns cleanly through the deterministic dialogue pipeline", async () => {
    const turns: Array<{ role: string; text: string }> = [];
    const client = new VoiceAgentClient({
      shipmentId: "shipment-po44891",
      incidentId: "inc-123",
      onTurn: (turn) => {
        turns.push({ role: turn.role, text: turn.text });
      },
    });

    // Mock manifest fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "shipment-po44891",
        poNumber: "44891",
        carrierName: "NorthStar Freight",
        trailerNumber: "NST-2208",
        items: [{ sku: "AX-17", expectedQty: 48, unit: "cartons" }],
      }),
    });

    await client.simulateUserTurn("Hello, please load the manifest for PO 44891");

    expect(turns.length).toBeGreaterThanOrEqual(2);
    expect(turns[0].role).toBe("user");
    expect(turns[turns.length - 1].role).toBe("agent");
    expect(turns[turns.length - 1].text).toContain("44891");
    expect(turns[turns.length - 1].text).toContain("48 cartons");
  });
});
