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

// Mock WebSocket implementation for unit test isolation
class MockWebSocket {
  public url: string;
  public readyState: number = 0; // 0 = CONNECTING, 1 = OPEN, 2 = CLOSING, 3 = CLOSED
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
    // Asynchronously trigger open on next microtask
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
  messages: Array<{ data: unknown; transferables?: unknown[] }> = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;

  postMessage(data: unknown, transferables?: unknown[]) {
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

describe("Voice Agent Protocol Hardening & 24kHz Pipeline (Milestone 1)", () => {
  let registeredProcessors: Record<string, any> = {};

  beforeEach(() => {
    registeredProcessors = {};
    MockWebSocket.instances = [];

    // Set up globals
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

    // Worklet sandbox globals
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

    // Load worklet code
    const workletPath = path.resolve(__dirname, "../../public/worklets/pcm-24k-processor.js");
    const workletCode = fs.readFileSync(workletPath, "utf8");
    new Function(workletCode)();

    // Default mock fetch for token minting
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: "test-ephemeral-voice-token" }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Dedicated 24kHz AudioWorklet Specification & Resampling Invariants
  // =========================================================================
  describe("1. Dedicated 24kHz AudioWorklet (pcm-24k-processor.js)", () => {
    it("registers processor with name 'pcm-24k-processor'", () => {
      expect(registeredProcessors["pcm-24k-processor"]).toBeDefined();
    });

    it("resamples 48kHz input to 24kHz mono PCM16 in exact 50ms (2,400-byte) chunks", () => {
      (global as any).sampleRate = 48000;
      const ProcClass = registeredProcessors["pcm-24k-processor"];
      const proc = new ProcClass();

      // 100 blocks of 128 samples = 12,800 samples @ 48kHz
      // Resampling ratio: 48000 / 24000 = 2.0 -> Exactly 6,400 samples @ 24kHz
      for (let b = 0; b < 100; b++) {
        const channel = new Float32Array(128);
        for (let i = 0; i < 128; i++) {
          channel[i] = Math.sin((2 * Math.PI * 440 * (b * 128 + i)) / 48000);
        }
        proc.process([[channel]], [], {});
      }

      // 5 chunks of 1,200 samples = 6,000 samples emitted
      expect(proc.port.messages.length).toBe(5);
      for (const msg of proc.port.messages) {
        expect(msg.data.event).toBe("chunk");
        expect(msg.data.buffer.byteLength).toBe(2400); // 1,200 samples * 2 bytes = 2,400 bytes
      }

      // Remainder in buffer: 400 samples
      expect(proc.bufferIndex).toBe(400);
    });

    it("preserves zero phase drift across 1,000 blocks at 44.1 kHz", () => {
      (global as any).sampleRate = 44100;
      const ProcClass = registeredProcessors["pcm-24k-processor"];
      const proc = new ProcClass();

      // 1,000 blocks of 128 samples = 128,000 samples @ 44.1kHz
      // Exact expected samples = round(128,000 / (44100 / 24000)) = 69,660 samples
      for (let b = 0; b < 1000; b++) {
        const channel = new Float32Array(128);
        for (let i = 0; i < 128; i++) {
          channel[i] = Math.sin((2 * Math.PI * 440 * (b * 128 + i)) / 44100);
        }
        proc.process([[channel]], [], {});
      }

      const totalSamples = proc.port.messages.length * 1200 + proc.bufferIndex;
      const expectedSamples = Math.round(128000 / (44100 / 24000));
      expect(totalSamples).toBe(expectedSamples); // Exact 69,660 samples
      expect(proc.phase).toBeGreaterThanOrEqual(0);
      expect(proc.phase).toBeLessThan(44100 / 24000);
    });

    it("downmixes multi-channel stereo input to mono and clamps values safely", () => {
      (global as any).sampleRate = 48000;
      const ProcClass = registeredProcessors["pcm-24k-processor"];
      const proc = new ProcClass();

      // Channel 0: 0.8, Channel 1: 0.4 -> average = 0.6
      const ch0 = new Float32Array(128).fill(0.8);
      const ch1 = new Float32Array(128).fill(0.4);

      proc.process([[ch0, ch1]], [], {});
      // 128 samples / 2 = 64 samples in buffer
      expect(proc.bufferIndex).toBe(64);
      // Value: round(0.6 * 32767) = 19660
      expect(proc.buffer[0]).toBe(Math.round(0.6 * 0x7fff));

      // Torture test: NaN, Infinity, and extreme overflow
      const bad0 = new Float32Array(128).fill(NaN);
      const bad1 = new Float32Array(128).fill(Infinity);
      proc.process([[bad0, bad1]], [], {});
      // Filtered to 0
      expect(proc.buffer[64]).toBe(0);

      const overflow0 = new Float32Array(128).fill(5.0);
      const overflow1 = new Float32Array(128).fill(10.0);
      proc.process([[overflow0, overflow1]], [], {});
      // Clamped to 1.0 -> 32767
      expect(proc.buffer[128]).toBe(32767);
    });

    it("supports flush command on message port for zero audio truncation", () => {
      const ProcClass = registeredProcessors["pcm-24k-processor"];
      const proc = new ProcClass();

      // Send 50 input samples
      const ch = new Float32Array(50).fill(0.5);
      proc.process([[ch]], [], {});
      expect(proc.bufferIndex).toBe(25); // 50 / 2 = 25 samples

      // Issue flush command
      proc.port.onmessage?.({ data: { command: "flush" } });

      expect(proc.port.messages.length).toBe(1);
      const flushed = proc.port.messages[0].data;
      expect(flushed.event).toBe("chunk");
      expect(flushed.isFinal).toBe(true);
      expect(flushed.buffer.byteLength).toBe(50); // 25 samples * 2 bytes = 50 bytes
      expect(proc.bufferIndex).toBe(0);
    });
  });

  // =========================================================================
  // 2. Complete Removal of Legacy ScriptProcessorNode
  // =========================================================================
  describe("2. Complete Removal of ScriptProcessorNode", () => {
    it("verifies VoiceAgentClient source code contains zero ScriptProcessor references", () => {
      const clientFilePath = path.resolve(__dirname, "../../lib/assemblyai/voice-agent-client.ts");
      const content = fs.readFileSync(clientFilePath, "utf8");

      expect(content).not.toContain("ScriptProcessorNode");
      expect(content).not.toContain("createScriptProcessor");
      expect(content).not.toContain("onaudioprocess");
    });

    it("verifies VoiceAgentClient instance has no audioProcessor property", () => {
      const client = new VoiceAgentClient({
        shipmentId: "po-123",
        incidentId: "inc-123",
      });
      expect((client as any).audioProcessor).toBeUndefined();
    });

    it("throws a clear error when AudioWorklet is not supported rather than falling back to ScriptProcessor", async () => {
      const client = new VoiceAgentClient({
        shipmentId: "po-123",
        incidentId: "inc-123",
      });

      // Override audioContext without audioWorklet support
      (global as any).window.AudioContext = class NoWorkletContext extends MockAudioContext {
        audioWorklet = undefined as any;
      };

      await expect(client.startMicrophone()).rejects.toThrow(/AudioWorklet is not supported/i);
    });
  });

  // =========================================================================
  // 3. session.ready Protocol Gating
  // =========================================================================
  describe("3. session.ready Protocol Gating", () => {
    it("strictly blocks input.audio transmission until session.ready frame is acknowledged", async () => {
      const client = new VoiceAgentClient({
        shipmentId: "po-123",
        incidentId: "inc-123",
      });

      // Connect
      await client.connect();
      const ws = MockWebSocket.instances[0];
      expect(ws).toBeDefined();

      // On open, session update was sent, but session is NOT ready yet
      expect(client.isSessionReady).toBe(false);
      expect(client.isReady()).toBe(false);

      // Start microphone
      await client.startMicrophone();
      const worklet = (client as any).workletNode as MockAudioWorkletNode;
      expect(worklet).toBeDefined();

      // Emit audio chunk from worklet before session.ready
      const dummyBuffer = new Int16Array(1200).buffer;
      worklet.port.postMessage({ event: "chunk", buffer: dummyBuffer });

      // Verify that NO input.audio message was transmitted
      const audioMessagesBefore = ws.sentMessages.filter((m) => {
        try {
          return JSON.parse(m).type === "input.audio";
        } catch {
          return false;
        }
      });
      expect(audioMessagesBefore.length).toBe(0);

      // Now server acknowledges session.ready
      ws.simulateMessage({ type: "session.ready", session_id: "sess-abc-123" });
      expect(client.isSessionReady).toBe(true);
      expect(client.isReady()).toBe(true);
      expect(client.getState()).toBe("IDLE");

      // Emit audio chunk after session.ready
      worklet.port.postMessage({ event: "chunk", buffer: dummyBuffer });

      // Verify that input.audio message WAS transmitted
      const audioMessagesAfter = ws.sentMessages.filter((m) => {
        try {
          return JSON.parse(m).type === "input.audio";
        } catch {
          return false;
        }
      });
      expect(audioMessagesAfter.length).toBe(1);
      const parsedAudio = JSON.parse(audioMessagesAfter[0]);
      expect(parsedAudio.type).toBe("input.audio");
      expect(parsedAudio.audio).toBeDefined();

      // Disconnect resets isSessionReady
      client.disconnect();
      expect(client.isSessionReady).toBe(false);
      expect(client.isReady()).toBe(false);
    });
  });

  // =========================================================================
  // 4. Robust reply.audio Payload Parsing ('data' and 'audio' attributes)
  // =========================================================================
  describe("4. Robust reply.audio Payload Parsing", () => {
    it("accepts base64 audio payload from standard AssemblyAI 'data' field", async () => {
      const client = new VoiceAgentClient({
        shipmentId: "po-123",
        incidentId: "inc-123",
      });
      await client.connect();
      const ws = MockWebSocket.instances[0];

      // Prepare a valid base64 PCM16 chunk
      const pcm16 = new Int16Array([1000, -2000, 3000]);
      const base64Audio = Buffer.from(pcm16.buffer).toString("base64");

      // Acknowledge session.ready
      ws.simulateMessage({ type: "session.ready" });

      // Incoming audio using official 'data' field
      ws.simulateMessage({
        type: "reply.audio",
        data: base64Audio,
      });

      // Verify playback started with decoded 3-sample buffer
      expect((client as any).isPlayingAudio).toBe(true);
      expect((client as any).currentAudioSource).toBeDefined();
      expect((client as any).currentAudioSource.buffer.length).toBe(3);
    });

    it("accepts base64 audio payload from alternate 'audio' field", async () => {
      const client = new VoiceAgentClient({
        shipmentId: "po-123",
        incidentId: "inc-123",
      });
      await client.connect();
      const ws = MockWebSocket.instances[0];

      const pcm16 = new Int16Array([500, -1000]);
      const base64Audio = Buffer.from(pcm16.buffer).toString("base64");

      ws.simulateMessage({ type: "session.ready" });

      // Incoming audio using 'audio' field
      ws.simulateMessage({
        type: "reply.audio",
        audio: base64Audio,
      });

      // Verify playback started with decoded 2-sample buffer
      expect((client as any).isPlayingAudio).toBe(true);
      expect((client as any).currentAudioSource).toBeDefined();
      expect((client as any).currentAudioSource.buffer.length).toBe(2);
    });
  });

  // =========================================================================
  // 5. Barge-in In-Flight Packet Discard & Playback Purge
  // =========================================================================
  describe("5. Barge-in In-Flight Playback Purge", () => {
    it("stops ongoing playback and purges queued buffers on input.speech.started", async () => {
      const client = new VoiceAgentClient({
        shipmentId: "po-123",
        incidentId: "inc-123",
      });
      await client.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateMessage({ type: "session.ready" });

      // Push 2 chunks to simulate ongoing speech (1 playing, 1 queued)
      const pcm16 = new Int16Array([100, 200]);
      const base64Audio = Buffer.from(pcm16.buffer).toString("base64");
      ws.simulateMessage({ type: "reply.audio", data: base64Audio });
      ws.simulateMessage({ type: "reply.audio", data: base64Audio });

      expect((client as any).isPlayingAudio).toBe(true);
      expect((client as any).audioQueue.length).toBe(1);

      // User interrupts: input.speech.started arrives
      ws.simulateMessage({ type: "input.speech.started" });

      expect(client.isInterrupted).toBe(true);
      expect(client.getIsInterrupted()).toBe(true);
      expect(client.getState()).toBe("LISTENING");
      expect((client as any).audioQueue.length).toBe(0);
      expect((client as any).isPlayingAudio).toBe(false);

      // In-flight network chunk arrives AFTER interruption
      ws.simulateMessage({ type: "reply.audio", data: base64Audio });

      // Must be DISCARDED, not queued or played
      expect((client as any).audioQueue.length).toBe(0);
      expect((client as any).isPlayingAudio).toBe(false);

      // Agent starts a new response: reply.started
      ws.simulateMessage({ type: "reply.started" });
      expect(client.isInterrupted).toBe(false);
      expect(client.getIsInterrupted()).toBe(false);
      expect(client.getState()).toBe("SPEAKING");

      // New chunks are now accepted and playback begins
      ws.simulateMessage({ type: "reply.audio", data: base64Audio });
      expect((client as any).isPlayingAudio).toBe(true);
      expect((client as any).currentAudioSource).toBeDefined();
    });

    it("triggers barge-in purge on user transcript message", async () => {
      const client = new VoiceAgentClient({
        shipmentId: "po-123",
        incidentId: "inc-123",
      });
      await client.connect();
      const ws = MockWebSocket.instances[0];

      ws.simulateMessage({ type: "session.ready" });
      const pcm16 = new Int16Array([100]);
      const base64Audio = Buffer.from(pcm16.buffer).toString("base64");
      ws.simulateMessage({ type: "reply.audio", data: base64Audio });

      // User speaks and transcript arrives
      ws.simulateMessage({ type: "transcript.user", text: "Hold on a second" });

      expect(client.isInterrupted).toBe(true);
      expect(client.getState()).toBe("LISTENING");
      expect((client as any).audioQueue.length).toBe(0);

      // Discard in-flight audio packet
      ws.simulateMessage({ type: "reply.audio", data: base64Audio });
      expect((client as any).audioQueue.length).toBe(0);
    });
  });

  // =========================================================================
  // 6. reply.done Lifecycle Sequencing & Tool Execution Race Resolution
  // =========================================================================
  describe("6. reply.done Lifecycle Sequencing", () => {
    it("resolves race condition where reply.done arrives while tool is still executing", async () => {
      const client = new VoiceAgentClient({
        shipmentId: "po-123",
        incidentId: "inc-123",
      });
      await client.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateMessage({ type: "session.ready" });

      // Mock executeVoiceAgentTool with a deferred promise to simulate async work
      let resolveTool: (val: unknown) => void;
      const deferredTool = new Promise((resolve) => {
        resolveTool = resolve;
      });

      // Mock tool execution in global fetch
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/api/shipments/")) {
          await deferredTool;
          return {
            ok: true,
            json: async () => ({
              id: "po-123",
              poNumber: "44891",
              items: [{ expectedQty: 48 }],
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      });

      // 1. Tool call arrives
      const toolCallPromise = (client as any).handleIncomingMessage({
        type: "tool.call",
        call_id: "call-99",
        name: "get_shipment",
        arguments: { shipmentId: "po-123" },
      });

      // Client transitions to TOOL_EXECUTING
      expect(client.getState()).toBe("TOOL_EXECUTING");
      expect(client.activeToolCount).toBe(1);
      expect(client.getActiveToolCount()).toBe(1);

      // 2. Server prematurely sends reply.done while tool is STILL executing
      ws.simulateMessage({ type: "reply.done" });

      // State MUST remain TOOL_EXECUTING (NOT prematurely set to IDLE)
      expect(client.getState()).toBe("TOOL_EXECUTING");
      expect(client.activeToolCount).toBe(1);

      // 3. Resolve the tool execution
      resolveTool!({ id: "po-123" });
      await toolCallPromise;

      // Tool has finished and pending reply.done flushes tool.result and transitions to THINKING
      expect(client.activeToolCount).toBe(0);
      expect(client.getState()).toBe("THINKING");

      // Verify tool.result was sent over WebSocket AFTER reply.done
      const toolResultMsgs = ws.sentMessages.filter((m) => {
        try {
          return JSON.parse(m).type === "tool.result";
        } catch {
          return false;
        }
      });
      expect(toolResultMsgs.length).toBe(1);
      const parsed = JSON.parse(toolResultMsgs[0]);
      expect(parsed.call_id).toBe("call-99");
    });

    it("queues tool results while tool executes and transmits them only upon reply.done", async () => {
      const client = new VoiceAgentClient({
        shipmentId: "po-123",
        incidentId: "inc-123",
      });
      await client.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateMessage({ type: "session.ready" });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "po-123", poNumber: "44891", items: [] }),
      });

      // Tool executes and finishes BEFORE reply.done
      await (client as any).handleIncomingMessage({
        type: "tool.call",
        call_id: "call-100",
        name: "get_shipment",
        arguments: { shipmentId: "po-123" },
      });

      // Result MUST be queued, NOT yet sent over WebSocket
      expect(client.pendingToolResults.length).toBe(1);
      const sentBeforeReplyDone = ws.sentMessages.filter((m) => {
        try {
          return JSON.parse(m).type === "tool.result";
        } catch {
          return false;
        }
      });
      expect(sentBeforeReplyDone.length).toBe(0);

      // Server now signals reply.done
      ws.simulateMessage({ type: "reply.done", status: "completed" });

      // Queued result is flushed and client enters THINKING
      expect(client.pendingToolResults.length).toBe(0);
      expect(client.getState()).toBe("THINKING");

      const sentAfterReplyDone = ws.sentMessages.filter((m) => {
        try {
          return JSON.parse(m).type === "tool.result";
        } catch {
          return false;
        }
      });
      expect(sentAfterReplyDone.length).toBe(1);
      expect(JSON.parse(sentAfterReplyDone[0]).call_id).toBe("call-100");
    });

    it("discards pending tool results if reply.done arrives with status interrupted", async () => {
      const client = new VoiceAgentClient({
        shipmentId: "po-123",
        incidentId: "inc-123",
      });
      await client.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateMessage({ type: "session.ready" });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "po-123", poNumber: "44891", items: [] }),
      });

      // Tool executes and queues result
      await (client as any).handleIncomingMessage({
        type: "tool.call",
        call_id: "call-discard",
        name: "get_shipment",
        arguments: { shipmentId: "po-123" },
      });
      expect(client.pendingToolResults.length).toBe(1);

      // Server indicates user interrupted the turn
      ws.simulateMessage({ type: "reply.done", status: "interrupted" });

      // Pending tool results MUST be discarded, NOT sent
      expect(client.pendingToolResults.length).toBe(0);
      expect(client.isInterrupted).toBe(true);
      expect(client.getState()).toBe("IDLE");

      const sentToolResults = ws.sentMessages.filter((m) => {
        try {
          return JSON.parse(m).type === "tool.result";
        } catch {
          return false;
        }
      });
      expect(sentToolResults.length).toBe(0);
    });
  });

  // =========================================================================
  // 7. session.end & session.ended & session.resume Lifecycle
  // =========================================================================
  describe("7. session.end Transmission, session.ended Handling & session.resume Lifecycle", () => {
    it("sends session.end frame when disconnect() is called on an open socket", async () => {
      const client = new VoiceAgentClient({
        shipmentId: "po-123",
        incidentId: "inc-123",
      });
      await client.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateMessage({ type: "session.ready" });

      client.disconnect();

      // Verify session.end frame was sent before close
      const endMsgs = ws.sentMessages.filter((m) => {
        try {
          return JSON.parse(m).type === "session.end";
        } catch {
          return false;
        }
      });
      expect(endMsgs.length).toBe(1);
      expect(ws.readyState).toBe(MockWebSocket.CLOSED);
      expect(client.getState()).toBe("DISCONNECTED");
      expect(client.isSessionReady).toBe(false);
    });

    it("handles incoming session.ended gracefully by cleaning up resources", async () => {
      const client = new VoiceAgentClient({
        shipmentId: "po-123",
        incidentId: "inc-123",
      });
      await client.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateMessage({ type: "session.ready" });

      expect(client.getState()).toBe("IDLE");
      expect(client.isSessionReady).toBe(true);

      // Server terminates session
      ws.simulateMessage({ type: "session.ended" });

      expect(client.getState()).toBe("DISCONNECTED");
      expect(client.isSessionReady).toBe(false);
    });

    it("emits session.resume with saved sessionId on reconnect and transitions to ready on session.resumed", async () => {
      const resumedClient = new VoiceAgentClient({
        shipmentId: "po-123",
        incidentId: "inc-123",
        sessionId: "sess-resumed-777",
      });
      expect(resumedClient.getSessionId()).toBe("sess-resumed-777");

      await resumedClient.connect();
      const resumedWs = MockWebSocket.instances[0];

      // Verify session.resume was sent with saved session_id
      const sessionResumeMsg = resumedWs.sentMessages.find((m) => {
        try {
          return JSON.parse(m).type === "session.resume";
        } catch {
          return false;
        }
      });
      expect(sessionResumeMsg).toBeDefined();
      const parsedResume = JSON.parse(sessionResumeMsg!);
      expect(parsedResume.session_id).toBe("sess-resumed-777");

      // Verify session.update was NOT sent as a substitute for session.resume
      const sessionUpdateMsg = resumedWs.sentMessages.find((m) => {
        try {
          return JSON.parse(m).type === "session.update";
        } catch {
          return false;
        }
      });
      expect(sessionUpdateMsg).toBeUndefined();

      // Server responds with session.resumed
      resumedWs.simulateMessage({ type: "session.resumed", session_id: "sess-resumed-777" });
      expect(resumedClient.isSessionReady).toBe(true);
      expect(resumedClient.getState()).toBe("IDLE");
    });

    it("falls back to fresh session.update when session.resume fails with session_not_found", async () => {
      const client = new VoiceAgentClient({
        shipmentId: "po-123",
        incidentId: "inc-123",
        sessionId: "sess-expired-999",
      });

      await client.connect();
      const ws = MockWebSocket.instances[0];

      // Session resume was emitted
      expect(ws.sentMessages.some((m) => JSON.parse(m).type === "session.resume")).toBe(true);

      // Server rejects resume with session_not_found error
      ws.simulateMessage({
        type: "session.error",
        code: "session_not_found",
        message: "Session sess-expired-999 not found or expired",
      });

      // Client must clear saved session ID and emit fresh session.update without session_id
      expect(client.sessionId).toBeNull();
      const updateMsg = ws.sentMessages.find((m) => {
        try {
          return JSON.parse(m).type === "session.update";
        } catch {
          return false;
        }
      });
      expect(updateMsg).toBeDefined();
      const parsedUpdate = JSON.parse(updateMsg!);
      expect(parsedUpdate.session.session_id).toBeUndefined();
    });
  });
});

