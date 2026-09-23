import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { VoiceAgentClient } from "@/lib/assemblyai/voice-agent-client";

// Ensure atob / btoa exist in test environment
if (typeof globalThis.btoa === "undefined") {
  globalThis.btoa = (str: string) => Buffer.from(str, "binary").toString("base64");
}
if (typeof globalThis.atob === "undefined") {
  globalThis.atob = (b64: string) => Buffer.from(b64, "base64").toString("binary");
}

// Mock WebSocket implementation for adversarial testing
class MockWebSocket {
  public url: string;
  public readyState: number = 0;
  public sentMessages: string[] = [];

  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public onerror: ((event: unknown) => void) | null = null;
  public onclose: ((event: { code: number; reason?: string }) => void) | null = null;

  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  static instances: MockWebSocket[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    });
  }

  public send(data: string) {
    this.sentMessages.push(data);
  }

  public close(code = 1000, reason = "") {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  public simulateMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

// Mock Web Audio API
class MockAudioBuffer {
  duration = 0.05;
  length: number;
  sampleRate: number;
  numberOfChannels = 1;
  private channelData: Float32Array;

  constructor(options: { numberOfChannels?: number; length: number; sampleRate: number }) {
    this.length = options.length;
    this.sampleRate = options.sampleRate;
    this.channelData = new Float32Array(options.length);
  }

  getChannelData(_channel: number) {
    return this.channelData;
  }
}

class MockAudioBufferSourceNode {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  started = false;
  stopped = false;

  connect(_dest: unknown) {}
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
    this.onended?.();
  }
}

class MockAudioWorkletPort {
  messages: Array<{ data: any; transferables?: unknown[] }> = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;

  postMessage(data: any, transferables?: unknown[]) {
    this.messages.push({ data, transferables });
    this.onmessage?.({ data });
  }
}

class MockAudioWorkletNode {
  port = new MockAudioWorkletPort();
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockAudioContext {
  state = "running";
  sampleRate = 48000;
  destination = {};
  audioWorklet = {
    addModule: vi.fn().mockResolvedValue(undefined),
  };

  createBuffer(channels: number, length: number, sampleRate: number) {
    return new MockAudioBuffer({ numberOfChannels: channels, length, sampleRate });
  }

  createBufferSource() {
    return new MockAudioBufferSourceNode();
  }

  createMediaStreamSource(_stream: unknown) {
    return {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }

  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
}

describe("Adversarial Stress Testing: Voice Agent 24kHz Pipeline & Protocol (Milestone 1)", () => {
  let registeredProcessors: Record<string, any> = {};

  beforeEach(() => {
    registeredProcessors = {};
    MockWebSocket.instances = [];

    (global as any).WebSocket = MockWebSocket;
    (global as any).AudioContext = MockAudioContext;
    (global as any).AudioWorkletNode = MockAudioWorkletNode;

    const mockMediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
      }),
    };

    try {
      Object.defineProperty(globalThis, "navigator", {
        value: { mediaDevices: mockMediaDevices },
        configurable: true,
        writable: true,
      });
    } catch {
      (globalThis as any).navigator = { mediaDevices: mockMediaDevices };
    }

    (global as any).window = {
      AudioContext: MockAudioContext,
      navigator: (globalThis as any).navigator,
    };

    class MockAudioWorkletProcessor {
      port = {
        messages: [] as any[],
        onmessage: null as ((event: any) => void) | null,
        postMessage(data: any, transferables?: any[]) {
          this.messages.push({ data, transferables });
        },
      };
    }
    (global as any).AudioWorkletProcessor = MockAudioWorkletProcessor;
    (global as any).registerProcessor = (name: string, cls: any) => {
      registeredProcessors[name] = cls;
    };
    (global as any).sampleRate = 48000;

    const workletPath = path.resolve(__dirname, "../../public/worklets/pcm-24k-processor.js");
    const workletCode = fs.readFileSync(workletPath, "utf8");
    new Function(workletCode)();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: "adversarial-test-token" }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Stress Scenario 1: 44.1kHz and 96kHz Input Sample Rates
  // =========================================================================
  describe("Stress Scenario 1: 44.1kHz and 96kHz Input Sample Rates into 24kHz Processor", () => {
    it("processes 5,000 blocks @ 44.1kHz with zero drift, no buffer overflow, and exact 2,400-byte chunks", () => {
      (global as any).sampleRate = 44100;
      const ProcClass = registeredProcessors["pcm-24k-processor"];
      const proc = new ProcClass();

      const numBlocks = 5000;
      const blockSize = 128;
      const totalInputSamples = numBlocks * blockSize; // 640,000 samples @ 44.1kHz
      const ratio = 44100 / 24000; // 1.8375

      // Process 5,000 consecutive render quanta
      for (let b = 0; b < numBlocks; b++) {
        const ch = new Float32Array(blockSize);
        for (let i = 0; i < blockSize; i++) {
          ch[i] = Math.sin((2 * Math.PI * 1000 * (b * blockSize + i)) / 44100);
        }
        proc.process([[ch]], [], {});

        // Invariant: bufferIndex must NEVER exceed 1200
        expect(proc.bufferIndex).toBeLessThan(1200);
        expect(proc.bufferIndex).toBeGreaterThanOrEqual(0);
      }

      // Verify chunk sizes: every single emitted message must be exactly 2,400 bytes (1,200 Int16 samples)
      expect(proc.port.messages.length).toBeGreaterThan(0);
      for (const msg of proc.port.messages) {
        expect(msg.data.event).toBe("chunk");
        expect(msg.data.buffer.byteLength).toBe(2400);
        expect(msg.transferables?.[0]?.byteLength).toBe(2400);
      }

      // Verify zero cumulative phase drift:
      // Total samples generated across emitted chunks + remaining in buffer:
      const totalOutputSamples = proc.port.messages.length * 1200 + proc.bufferIndex;
      const expectedOutputSamples = Math.round(totalInputSamples / ratio);
      
      // Absolute drift must be <= 1 sample over 640,000 hardware samples
      const drift = Math.abs(totalOutputSamples - expectedOutputSamples);
      expect(drift).toBeLessThanOrEqual(1);

      // Phase accumulator must stay strictly within [0, ratio)
      expect(proc.phase).toBeGreaterThanOrEqual(0);
      expect(proc.phase).toBeLessThan(ratio);
    });

    it("processes 5,000 blocks @ 96kHz with zero drift, no buffer overflow, and exact 2,400-byte chunks", () => {
      (global as any).sampleRate = 96000;
      const ProcClass = registeredProcessors["pcm-24k-processor"];
      const proc = new ProcClass();

      const numBlocks = 5000;
      const blockSize = 128;
      const totalInputSamples = numBlocks * blockSize; // 640,000 samples @ 96kHz
      const ratio = 96000 / 24000; // Exact 4.0 integer decimation

      for (let b = 0; b < numBlocks; b++) {
        const ch = new Float32Array(blockSize);
        for (let i = 0; i < blockSize; i++) {
          ch[i] = Math.cos((2 * Math.PI * 440 * (b * blockSize + i)) / 96000);
        }
        proc.process([[ch]], [], {});

        expect(proc.bufferIndex).toBeLessThan(1200);
        expect(proc.bufferIndex).toBeGreaterThanOrEqual(0);
      }

      // Expected output samples: exactly 640,000 / 4 = 160,000 samples
      // 160,000 / 1,200 = 133 full chunks of 2,400 bytes (159,600 samples) + 400 remainder
      expect(proc.port.messages.length).toBe(133);
      for (const msg of proc.port.messages) {
        expect(msg.data.event).toBe("chunk");
        expect(msg.data.buffer.byteLength).toBe(2400);
      }
      expect(proc.bufferIndex).toBe(400);
      expect(proc.phase).toBe(0); // Phase is exactly 0 for integer factor
    });

    it("handles non-standard irregular block sizes (e.g. 77, 255, 512 samples) without overflow", () => {
      (global as any).sampleRate = 44100;
      const ProcClass = registeredProcessors["pcm-24k-processor"];
      const proc = new ProcClass();

      const irregularSizes = [77, 255, 13, 512, 1, 1024, 63];
      for (const size of irregularSizes) {
        const ch = new Float32Array(size).fill(0.25);
        proc.process([[ch]], [], {});
        expect(proc.bufferIndex).toBeLessThan(1200);
        expect(proc.bufferIndex).toBeGreaterThanOrEqual(0);
      }

      // Flush remainder
      proc.port.onmessage?.({ data: { command: "flush" } });
      const lastMsg = proc.port.messages[proc.port.messages.length - 1];
      expect(lastMsg.data.isFinal).toBe(true);
      expect(proc.bufferIndex).toBe(0);
    });
  });

  // =========================================================================
  // Stress Scenario 2: Floats Exceeding [-1.0, 1.0] (Clipping Check)
  // =========================================================================
  describe("Stress Scenario 2: Floats Exceeding [-1.0, 1.0] (Clipping & Numeric Safety)", () => {
    it("rigorously clamps extreme positive and negative floats without wrap-around", () => {
      (global as any).sampleRate = 48000;
      const ProcClass = registeredProcessors["pcm-24k-processor"];
      const proc = new ProcClass();

      // Test extreme positive floats: 1.0001, 1.5, 10.0, 1e6, Infinity
      const extremePos = new Float32Array([1.0001, 1.5, 2.0, 10.0, 1000.0, 1e9, Infinity]);
      proc.process([[extremePos]], [], {});

      // All positive overflows MUST clamp to exactly 32767 (0x7fff)
      for (let i = 0; i < proc.bufferIndex; i++) {
        // Sample at Infinity is non-finite so clamped to 0; others clamped to 32767
        const val = proc.buffer[i];
        expect(val).toBeLessThanOrEqual(32767);
        expect(val).toBeGreaterThanOrEqual(0);
      }

      // Flush to clear
      proc.port.onmessage?.({ data: { command: "flush" } });

      // Test extreme negative floats: -1.0001, -1.5, -10.0, -1e6, -Infinity
      const extremeNeg = new Float32Array([-1.0001, -1.5, -2.0, -10.0, -1000.0, -1e9, -Infinity]);
      proc.process([[extremeNeg]], [], {});

      for (let i = 0; i < proc.bufferIndex; i++) {
        const val = proc.buffer[i];
        expect(val).toBeGreaterThanOrEqual(-32768);
        expect(val).toBeLessThanOrEqual(0);
      }
    });

    it("safely sanitizes non-finite IEEE-754 floats (NaN, +Infinity, -Infinity, subnormals)", () => {
      (global as any).sampleRate = 48000;
      const ProcClass = registeredProcessors["pcm-24k-processor"];
      const proc = new ProcClass();

      const nonFinites = new Float32Array([
        NaN,
        Infinity,
        -Infinity,
        Number.MIN_VALUE,
        -0,
        1e-35,
        -1e-35,
      ]);

      proc.process([[nonFinites]], [], {});

      // NaN and infinities must be sanitized to 0
      expect(proc.buffer[0]).toBe(0); // NaN -> 0
      expect(proc.buffer[1]).toBe(0); // +Infinity -> 0
      expect(proc.buffer[2]).toBe(0); // -Infinity -> 0
      // Subnormals close to 0 round to 0
      expect(proc.buffer[3]).toBe(0);
      expect(proc.buffer[4]).toBe(0);
    });

    it("verifies stereo downmixing with conflicting clipping across channels", () => {
      (global as any).sampleRate = 48000;
      const ProcClass = registeredProcessors["pcm-24k-processor"];
      const proc = new ProcClass();

      // Channel 0 is +5.0, Channel 1 is -5.0 -> Average is 0.0
      const ch0 = new Float32Array([5.0, 5.0, 5.0, 5.0]);
      const ch1 = new Float32Array([-5.0, -5.0, -5.0, -5.0]);
      proc.process([[ch0, ch1]], [], {});
      expect(proc.buffer[0]).toBe(0);

      // Channel 0 is +10.0, Channel 1 is +4.0 -> Average is +7.0 -> Clamps to +1.0 -> 32767
      const ch2 = new Float32Array([10.0, 10.0]);
      const ch3 = new Float32Array([4.0, 4.0]);
      proc.process([[ch2, ch3]], [], {});
      expect(proc.buffer[proc.bufferIndex - 1]).toBe(32767);
    });
  });

  // =========================================================================
  // Stress Scenario 3: Massive Bursts of reply.audio During isInterrupted Toggling
  // =========================================================================
  describe("Stress Scenario 3: Massive Bursts of reply.audio During isInterrupted Toggles", () => {
    it("discards 1,000 rapid reply.audio chunks arriving while interrupted without queue bloat", async () => {
      const client = new VoiceAgentClient({
        shipmentId: "po-123",
        incidentId: "inc-123",
      });
      await client.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateMessage({ type: "session.ready" });

      const pcm16Chunk = new Int16Array(1200).fill(1234);
      const base64Audio = Buffer.from(pcm16Chunk.buffer).toString("base64");

      // 1. Send normal audio
      ws.simulateMessage({ type: "reply.started" });
      ws.simulateMessage({ type: "reply.audio", data: base64Audio });
      expect((client as any).isPlayingAudio).toBe(true);

      // 2. User interrupts: input.speech.started
      ws.simulateMessage({ type: "input.speech.started" });
      expect(client.isInterrupted).toBe(true);
      expect((client as any).audioQueue.length).toBe(0);
      expect((client as any).isPlayingAudio).toBe(false);

      // 3. Massive burst: 1,000 reply.audio chunks arrive while isInterrupted === true
      for (let i = 0; i < 1000; i++) {
        ws.simulateMessage({ type: "reply.audio", data: base64Audio });
      }

      // Invariant: audioQueue MUST remain empty; zero audio packets queued or played
      expect((client as any).audioQueue.length).toBe(0);
      expect((client as any).isPlayingAudio).toBe(false);
      expect(client.isInterrupted).toBe(true);

      // 4. Agent begins new turn: reply.started
      ws.simulateMessage({ type: "reply.started" });
      expect(client.isInterrupted).toBe(false);

      // 5. Subsequent chunks are queued normally
      ws.simulateMessage({ type: "reply.audio", data: base64Audio });
      expect((client as any).isPlayingAudio).toBe(true);
    });

    it("survives rapid chaotic toggling between reply.audio bursts and user interruptions", async () => {
      const client = new VoiceAgentClient({
        shipmentId: "po-123",
        incidentId: "inc-123",
      });
      await client.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateMessage({ type: "session.ready" });

      const pcm16 = new Int16Array([10, 20, 30]);
      const base64Audio = Buffer.from(pcm16.buffer).toString("base64");

      // Chaotic loop: 200 cycles of random interruption, audio burst, and reply.started
      for (let cycle = 0; cycle < 200; cycle++) {
        if (cycle % 3 === 0) {
          ws.simulateMessage({ type: "interruption" });
          expect(client.isInterrupted).toBe(true);
        } else if (cycle % 3 === 1) {
          ws.simulateMessage({ type: "reply.started" });
          expect(client.isInterrupted).toBe(false);
        } else {
          ws.simulateMessage({ type: "transcript.user", text: "Stop talking" });
          expect(client.isInterrupted).toBe(true);
        }

        // Send 5 rapid reply.audio chunks in each iteration
        for (let j = 0; j < 5; j++) {
          ws.simulateMessage({ type: "reply.audio", data: base64Audio });
        }

        // If interrupted, audioQueue must never retain packets
        if (client.isInterrupted) {
          expect((client as any).audioQueue.length).toBe(0);
        }
      }

      client.disconnect();
      expect(client.getState()).toBe("DISCONNECTED");
    });

    it("safely handles corrupted base64 or invalid audio payloads without crashing client", async () => {
      const client = new VoiceAgentClient({
        shipmentId: "po-123",
        incidentId: "inc-123",
      });
      await client.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateMessage({ type: "session.ready" });

      // Malformed base64 strings and odd byte buffers
      const malformedPayloads = [
        "not-a-valid-base64!@#$%",
        Buffer.from(new Uint8Array([1, 2, 3])).toString("base64"), // Odd byte length (3 bytes)
        "",
        "====",
      ];

      for (const badPayload of malformedPayloads) {
        expect(() => {
          ws.simulateMessage({ type: "reply.audio", data: badPayload });
        }).not.toThrow();
      }

      expect(client.getState()).not.toBe("ERROR");
    });
  });

  // =========================================================================
  // Stress Scenario 4: Rapid Succession of tool.call and reply.done
  // =========================================================================
  describe("Stress Scenario 4: Rapid Succession of tool.call and reply.done", () => {
    it("handles multiple concurrent asynchronous tool calls with premature reply.done", async () => {
      const client = new VoiceAgentClient({
        shipmentId: "po-123",
        incidentId: "inc-123",
      });
      await client.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateMessage({ type: "session.ready" });

      const toolResolvers: Record<string, (val: any) => void> = {};
      const toolPromises: Record<string, Promise<any>> = {};

      ["call-A", "call-B", "call-C"].forEach((id) => {
        toolPromises[id] = new Promise((resolve) => {
          toolResolvers[id] = resolve;
        });
      });

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/api/shipments/")) {
          // Identify call by matching
          return {
            ok: true,
            json: async () => ({ id: "po-123", items: [] }),
          };
        }
        return { ok: true, json: async () => ({}) };
      });

      // Dispatch 3 concurrent tool calls
      const p1 = (client as any).handleIncomingMessage({
        type: "tool.call",
        call_id: "call-A",
        name: "get_shipment",
        arguments: { shipmentId: "po-123" },
      });
      const p2 = (client as any).handleIncomingMessage({
        type: "tool.call",
        call_id: "call-B",
        name: "get_shipment",
        arguments: { shipmentId: "po-123" },
      });
      const p3 = (client as any).handleIncomingMessage({
        type: "tool.call",
        call_id: "call-C",
        name: "get_shipment",
        arguments: { shipmentId: "po-123" },
      });

      expect(client.activeToolCount).toBe(3);
      expect(client.getState()).toBe("TOOL_EXECUTING");

      // Server immediately sends reply.done before any tool finishes!
      ws.simulateMessage({ type: "reply.done" });

      // State MUST remain TOOL_EXECUTING (NOT prematurely set to IDLE)
      expect(client.getState()).toBe("TOOL_EXECUTING");
      expect((client as any).pendingReplyDone).toBe(true);

      // Wait for all 3 tool calls to resolve
      await Promise.all([p1, p2, p3]);

      // All tools completed: activeToolCount is 0, results flushed, client transitions to THINKING
      expect(client.activeToolCount).toBe(0);
      expect(client.getState()).toBe("THINKING");
      expect((client as any).pendingReplyDone).toBe(false);

      // Verify all 3 tool.result frames were transmitted
      const toolResults = ws.sentMessages
        .map((m) => {
          try {
            return JSON.parse(m);
          } catch {
            return null;
          }
        })
        .filter((m) => m?.type === "tool.result");

      expect(toolResults.length).toBe(3);
      const callIds = toolResults.map((r) => r.call_id);
      expect(callIds).toContain("call-A");
      expect(callIds).toContain("call-B");
      expect(callIds).toContain("call-C");
    });

    it("recovers gracefully and preserves activeToolCount decrement when a tool throws an error", async () => {
      const client = new VoiceAgentClient({
        shipmentId: "po-123",
        incidentId: "inc-123",
      });
      await client.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateMessage({ type: "session.ready" });

      // Mock tool error
      global.fetch = vi.fn().mockRejectedValue(new Error("Database connection timed out"));

      const toolPromise = (client as any).handleIncomingMessage({
        type: "tool.call",
        call_id: "call-fail-1",
        name: "get_shipment",
        arguments: { shipmentId: "po-123" },
      });

      expect(client.activeToolCount).toBe(1);
      expect(client.getState()).toBe("TOOL_EXECUTING");

      ws.simulateMessage({ type: "reply.done" });
      await toolPromise;

      // Invariant: activeToolCount must decrement to 0 even on failure and flush result
      expect(client.activeToolCount).toBe(0);
      expect(client.getState()).toBe("THINKING");


      // Verify tool.result error payload was sent
      const errResult = ws.sentMessages
        .map((m) => {
          try {
            return JSON.parse(m);
          } catch {
            return null;
          }
        })
        .find((m) => m?.call_id === "call-fail-1");

      expect(errResult).toBeDefined();
      expect(errResult.is_error).toBe(true);
      expect(errResult.result).toContain("Database connection timed out");
    });

    it("verifies activeToolCount cannot become negative under rapid erratic reply.done frames", async () => {
      const client = new VoiceAgentClient({
        shipmentId: "po-123",
        incidentId: "inc-123",
      });
      await client.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateMessage({ type: "session.ready" });

      // Send 50 unsolicited reply.done frames when activeToolCount is 0
      for (let i = 0; i < 50; i++) {
        ws.simulateMessage({ type: "reply.done" });
      }

      expect(client.activeToolCount).toBe(0);
      expect(client.getState()).toBe("IDLE");
    });
  });
});
