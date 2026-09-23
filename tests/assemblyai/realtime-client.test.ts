import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AssemblyAIRealtimeClient } from "@/lib/assemblyai/realtime-client";

// Mock WebSocket implementation for Node.js Vitest environment
class MockWebSocket {
  public url: string;
  public readyState: number = 0; // 0 = CONNECTING, 1 = OPEN, 2 = CLOSING, 3 = CLOSED
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

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    });
  }

  static instances: MockWebSocket[] = [];

  public send(data: any) {
    this.sentMessages.push(data);
  }

  public close(code = 1000, reason = "") {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  // Helper to simulate incoming server message
  public simulateMessage(payload: any) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

describe("AssemblyAIRealtimeClient WebSocket Manager", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    (global as any).WebSocket = MockWebSocket;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("constructs correct v3 WebSocket URL with required query parameters", async () => {
    const client = new AssemblyAIRealtimeClient({
      token: "test-ephemeral-token",
      speechModel: "universal-3-5-pro",
      sampleRate: 16000,
    });

    await client.connect();

    expect(MockWebSocket.instances.length).toBe(1);
    const ws = MockWebSocket.instances[0];

    const parsed = new URL(ws.url);
    expect(parsed.origin + parsed.pathname).toBe("wss://streaming.assemblyai.com/v3/ws");
    expect(parsed.searchParams.get("token")).toBe("test-ephemeral-token");
    expect(parsed.searchParams.get("speech_model")).toBe("universal-3-5-pro");
    expect(parsed.searchParams.get("sample_rate")).toBe("16000");
    expect(parsed.searchParams.get("encoding")).toBe("pcm_s16le");
  });

  it("transitions to connected upon receiving 'Begin' event and triggers onSessionBegin", async () => {
    const onSessionBegin = vi.fn();
    const onStateChange = vi.fn();

    const client = new AssemblyAIRealtimeClient({
      token: "test-token",
      onSessionBegin,
      onStateChange,
    });

    await client.connect();
    const ws = MockWebSocket.instances[0];

    ws.simulateMessage({
      type: "Begin",
      id: "session-uuid-999",
      configuration: { model: "universal-3-5-pro" },
    });

    expect(client.getState()).toBe("connected");
    expect(onSessionBegin).toHaveBeenCalledWith("session-uuid-999");
    expect(onStateChange).toHaveBeenCalledWith("connected");
  });

  it("dispatches partial and committed final transcript turns correctly", async () => {
    const onPartialTranscript = vi.fn();
    const onFinalTranscript = vi.fn();

    const client = new AssemblyAIRealtimeClient({
      token: "test-token",
      onPartialTranscript,
      onFinalTranscript,
    });

    await client.connect();
    const ws = MockWebSocket.instances[0];

    // Emit partial turn
    ws.simulateMessage({
      type: "Turn",
      end_of_turn: false,
      transcript: "I have forty-seven",
      words: [{ text: "I", start: 0, end: 100, confidence: 0.99 }],
    });

    expect(onPartialTranscript).toHaveBeenCalledWith("I have forty-seven", [
      expect.objectContaining({ text: "I" }),
    ], undefined);
    expect(onFinalTranscript).not.toHaveBeenCalled();

    // Emit final turn
    ws.simulateMessage({
      type: "Turn",
      end_of_turn: true,
      transcript: "I have forty-seven cartons.",
      words: [
        { text: "I", start: 0, end: 100, confidence: 0.99 },
        { text: "have", start: 110, end: 200, confidence: 0.98 },
      ],
    });

    expect(onFinalTranscript).toHaveBeenCalledWith("I have forty-seven cartons.", [
      expect.objectContaining({ text: "I" }),
      expect.objectContaining({ text: "have" }),
    ], undefined);
  });

  it("sends binary audio chunks when WebSocket is open", async () => {
    const client = new AssemblyAIRealtimeClient({
      token: "test-token",
    });

    await client.connect();
    const ws = MockWebSocket.instances[0];

    const audioChunk = new ArrayBuffer(1600);
    client.sendAudio(audioChunk);

    expect(ws.sentMessages.length).toBe(1);
    expect(ws.sentMessages[0]).toBe(audioChunk);
  });

  it("sends graceful 'Terminate' message and handles 'Termination' event", async () => {
    const onSessionTerminated = vi.fn();

    const client = new AssemblyAIRealtimeClient({
      token: "test-token",
      onSessionTerminated,
    });

    await client.connect();
    const ws = MockWebSocket.instances[0];

    await client.stop();

    // Verify Terminate message was dispatched
    expect(ws.sentMessages).toContain(JSON.stringify({ type: "Terminate" }));

    // Simulate server termination response
    ws.simulateMessage({
      type: "Termination",
      audio_duration_seconds: 14,
      session_duration_seconds: 16,
    });

    expect(onSessionTerminated).toHaveBeenCalledWith({
      audioDurationSeconds: 14,
      sessionDurationSeconds: 16,
    });
  });

  it("triggers inactivity watchdog after 120 seconds of silence", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();

    const client = new AssemblyAIRealtimeClient({
      token: "test-token",
      inactivityTimeoutMs: 120000,
      onError,
    });

    await client.connect();
    const ws = MockWebSocket.instances[0];

    // Fast-forward 120,001 ms without activity
    vi.advanceTimersByTime(120001);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Inactivity watchdog triggered"),
      })
    );

    // Watchdog sends graceful Terminate
    expect(ws.sentMessages).toContain(JSON.stringify({ type: "Terminate" }));
  });
});
