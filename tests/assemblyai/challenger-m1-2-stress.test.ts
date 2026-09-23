import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { POST } from "@/app/api/aai/token/route";
import { AssemblyAIRealtimeClient } from "@/lib/assemblyai/realtime-client";
import {
  ScenarioAudioSimulator,
  GOLDEN_SCENARIO_SCRIPTS,
} from "@/lib/assemblyai/simulation-player";
import { TranscriptTurn } from "@/lib/assemblyai/types";

// ============================================================================
// Mock WebSocket for Realtime Client Tests
// ============================================================================
class MockWebSocket {
  public url: string;
  public readyState: number = 0; // 0 = CONNECTING, 1 = OPEN, 2 = CLOSING, 3 = CLOSED
  public binaryType: string = "blob";
  public sentMessages: any[] = [];
  public throwOnSend = false;

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
      if (this.readyState === MockWebSocket.CONNECTING) {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.();
      }
    });
  }

  static instances: MockWebSocket[] = [];

  public send(data: any) {
    if (this.throwOnSend) {
      throw new Error("Network socket write error (EPIPE)");
    }
    this.sentMessages.push(data);
  }

  public close(code = 1000, reason = "") {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  public simulateMessage(payload: any) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

// ============================================================================
// Challenge Suite 1: Token Security & Environment Isolation
// ============================================================================
describe("Empirical Challenge: Token Security & Environment Isolation", () => {
  const originalEnv = process.env.ASSEMBLYAI_API_KEY;
  const makeTokenReq = () => new Request("http://localhost:3000/api/aai/token", { method: "POST" });

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.ASSEMBLYAI_API_KEY = "test-secret-key-998877";
  });

  afterEach(() => {
    process.env.ASSEMBLYAI_API_KEY = originalEnv;
  });

  it("returns HTTP 500 when ASSEMBLYAI_API_KEY is unset (undefined)", async () => {
    delete process.env.ASSEMBLYAI_API_KEY;

    const resPost = await POST(makeTokenReq());
    expect(resPost.status).toBe(500);
    const bodyPost = await resPost.json();
    expect(bodyPost.error).toContain("credentials not configured");
  });

  it("returns HTTP 500 when ASSEMBLYAI_API_KEY is empty or whitespace only", async () => {
    process.env.ASSEMBLYAI_API_KEY = "   \t\n  ";

    const res = await POST(makeTokenReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("credentials not configured");
  });

  it("mints token with exact 60-second TTL window and sanitizes upstream query", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          token: "aai-live-ephemeral-tok-777",
          expires_in_seconds: 60,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const beforeTime = Date.now();
    const res = await POST(makeTokenReq());
    const afterTime = Date.now();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe("aai-live-ephemeral-tok-777");
    expect(typeof body.expires_at).toBe("number");

    // TTL window validation: expires_at must be Date.now() + 60s (within 2s tolerance)
    expect(body.expires_at).toBeGreaterThanOrEqual(beforeTime + 60000);
    expect(body.expires_at).toBeLessThanOrEqual(afterTime + 60000);

    // Upstream request validation
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [callUrl, callInit] = fetchSpy.mock.calls[0];
    const urlObj = new URL(callUrl as string);

    expect(urlObj.searchParams.get("expires_in_seconds")).toBe("60");
    expect(urlObj.searchParams.get("max_session_duration_seconds")).toBe("600");
    expect(callInit?.headers).toEqual(
      expect.objectContaining({
        Authorization: "test-secret-key-998877",
      })
    );
  });

  it("sanitizes upstream error responses (401/403/500) and NEVER leaks the API key", async () => {
    const sensitiveKey = "SUPER_SECRET_AAI_KEY_DO_NOT_LEAK";
    process.env.ASSEMBLYAI_API_KEY = sensitiveKey;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Invalid API Key provided in Authorization header", {
        status: 401,
        statusText: "Unauthorized",
      })
    );

    const res = await POST(makeTokenReq());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("Upstream speech provider rejected token minting (401)");
    expect(body.error).not.toContain(sensitiveKey);
  });

  it("handles upstream network rejection safely with HTTP 500 without crashing", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("ETIMEDOUT: Connection timed out to streaming.assemblyai.com")
    );

    const res = await POST(makeTokenReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Failed to connect to speech streaming service");
  });

  it("verifies production client bundle (.next/static) does NOT contain ASSEMBLYAI_API_KEY or secret values", () => {
    const staticDir = path.resolve(__dirname, "../../.next/static");
    if (!fs.existsSync(staticDir)) {
      console.warn(".next/static not found; build may need to be run");
      return;
    }

    const jsFiles: string[] = [];
    function scanDir(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
          jsFiles.push(fullPath);
        }
      }
    }
    scanDir(staticDir);
    expect(jsFiles.length).toBeGreaterThan(0);

    // Read real secret from .env.local if present
    const envLocalPath = path.resolve(__dirname, "../../.env.local");
    let actualSecret = "";
    if (fs.existsSync(envLocalPath)) {
      const content = fs.readFileSync(envLocalPath, "utf8");
      const match = content.match(/ASSEMBLYAI_API_KEY=([a-zA-Z0-9_-]+)/);
      if (match) {
        actualSecret = match[1];
      }
    }

    for (const filePath of jsFiles) {
      const content = fs.readFileSync(filePath, "utf8");
      // Must not contain environment variable identifier in code
      expect(content).not.toContain("ASSEMBLYAI_API_KEY");
      // Must not contain actual secret key value
      if (actualSecret && actualSecret.length > 8) {
        expect(content).not.toContain(actualSecret);
      }
    }
  });
});

// ============================================================================
// Challenge Suite 2: Inactivity Watchdog & Teardown Protocol
// ============================================================================
describe("Empirical Challenge: Inactivity Watchdog & Teardown Protocol", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    (global as any).WebSocket = MockWebSocket;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("watchdog triggers at exactly 120s of silence and dispatches Terminate message", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();

    const client = new AssemblyAIRealtimeClient({
      token: "test-token-watchdog",
      inactivityTimeoutMs: 120000,
      onError,
    });

    await client.connect();
    const ws = MockWebSocket.instances[0];

    // Fast-forward to 119.999s: should NOT trigger
    vi.advanceTimersByTime(119999);
    expect(onError).not.toHaveBeenCalled();
    expect(ws.sentMessages).not.toContain(JSON.stringify({ type: "Terminate" }));

    // Advance 2ms to 120.001s: should trigger immediately
    vi.advanceTimersByTime(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Inactivity watchdog triggered (120s without activity)"),
      })
    );
    expect(ws.sentMessages).toContain(JSON.stringify({ type: "Terminate" }));
  });

  it("streaming audio chunks repeatedly resets the 120s inactivity watchdog", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();

    const client = new AssemblyAIRealtimeClient({
      token: "test-token",
      inactivityTimeoutMs: 120000,
      onError,
    });

    await client.connect();
    const ws = MockWebSocket.instances[0];

    const dummyChunk = new ArrayBuffer(1600);

    // Stream audio chunk every 50 seconds for 3 cycles (150s elapsed)
    for (let cycle = 1; cycle <= 3; cycle++) {
      vi.advanceTimersByTime(50000);
      client.sendAudio(dummyChunk);
      expect(onError).not.toHaveBeenCalled();
    }

    // Advance 119s after last chunk: still alive (150s + 119s = 269s total)
    vi.advanceTimersByTime(119000);
    expect(onError).not.toHaveBeenCalled();

    // Advance 2s more: now 121s since last chunk, should trigger
    vi.advanceTimersByTime(2000);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(ws.sentMessages).toContain(JSON.stringify({ type: "Terminate" }));
  });

  it("incoming server Turn events reset the 120s inactivity watchdog", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();

    const client = new AssemblyAIRealtimeClient({
      token: "test-token",
      inactivityTimeoutMs: 120000,
      onError,
    });

    await client.connect();
    const ws = MockWebSocket.instances[0];

    // At t=80s, receive partial turn
    vi.advanceTimersByTime(80000);
    ws.simulateMessage({
      type: "Turn",
      end_of_turn: false,
      transcript: "Carton thirty-one",
      words: [],
    });
    expect(onError).not.toHaveBeenCalled();

    // At t=160s (80s since partial turn), receive committed turn
    vi.advanceTimersByTime(80000);
    ws.simulateMessage({
      type: "Turn",
      end_of_turn: true,
      transcript: "Carton thirty-one is crushed",
      words: [],
    });
    expect(onError).not.toHaveBeenCalled();

    // Advance 119s after committed turn (t=279s total)
    vi.advanceTimersByTime(119000);
    expect(onError).not.toHaveBeenCalled();

    // Advance 2s more (121s since last turn) -> triggers
    vi.advanceTimersByTime(2000);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("incoming Begin event resets the watchdog timer", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();

    const client = new AssemblyAIRealtimeClient({
      token: "test-token",
      inactivityTimeoutMs: 120000,
      onError,
    });

    await client.connect();
    const ws = MockWebSocket.instances[0];

    // Advance 40s
    vi.advanceTimersByTime(40000);
    // Begin event arrives
    ws.simulateMessage({ type: "Begin", session_id: "sess-abc" });

    // Advance 119s after Begin (total 159s)
    vi.advanceTimersByTime(119000);
    expect(onError).not.toHaveBeenCalled();

    // Advance 2s more (total 161s, 121s after Begin) -> triggers
    vi.advanceTimersByTime(2000);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("stop() cleans up timers and sends Terminate message without leaking errors", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const onSessionTerminated = vi.fn();

    const client = new AssemblyAIRealtimeClient({
      token: "test-token",
      inactivityTimeoutMs: 120000,
      onError,
      onSessionTerminated,
    });

    await client.connect();
    const ws = MockWebSocket.instances[0];

    // Call stop()
    await client.stop();
    expect(ws.sentMessages).toContain(JSON.stringify({ type: "Terminate" }));
    expect(client.getState()).toBe("idle");

    // Fast-forward 130s: watchdog should NOT fire because it was cleared
    vi.advanceTimersByTime(130000);
    expect(onError).not.toHaveBeenCalled();

    // Server sends Termination acknowledgment
    ws.simulateMessage({
      type: "Termination",
      audio_duration_seconds: 12.5,
      session_duration_seconds: 15.0,
    });

    expect(onSessionTerminated).toHaveBeenCalledWith({
      audioDurationSeconds: 12.5,
      sessionDurationSeconds: 15.0,
    });
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
  });

  it("stop() handles WebSocket write failure gracefully (socket throws on send)", async () => {
    const onError = vi.fn();

    const client = new AssemblyAIRealtimeClient({
      token: "test-token",
      onError,
    });

    await client.connect();
    const ws = MockWebSocket.instances[0];
    ws.throwOnSend = true;

    // stop() should catch socket error, force close, and transition to idle without throwing
    await expect(client.stop()).resolves.toBeUndefined();
    expect(client.getState()).toBe("idle");
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
  });

  it("stop() when socket is in CONNECTING state closes the socket directly", async () => {
    const client = new AssemblyAIRealtimeClient({
      token: "test-token",
    });

    // Create client but override socket readyState to CONNECTING
    const connectPromise = client.connect();
    const ws = MockWebSocket.instances[0];
    ws.readyState = MockWebSocket.CONNECTING;

    await client.stop();
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
    expect(client.getState()).toBe("idle");
  });
});

// ============================================================================
// Challenge Suite 3: Scenario Audio Simulation Fallback
// ============================================================================
describe("Empirical Challenge: Scenario Audio Simulation Fallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("verifies verbatim golden scenario scripts match PO 44891 specifications", () => {
    const receiver = GOLDEN_SCENARIO_SCRIPTS.receiver;
    expect(receiver.speakerRole).toBe("RECEIVER");
    expect(receiver.fullText).toBe(
      "I have forty-seven cartons. Carton thirty-one is crushed underneath and wet on the right side."
    );
    expect(receiver.words).toEqual([
      "I",
      "have",
      "forty-seven",
      "cartons.",
      "Carton",
      "thirty-one",
      "is",
      "crushed",
      "underneath",
      "and",
      "wet",
      "on",
      "the",
      "right",
      "side.",
    ]);

    const driver = GOLDEN_SCENARIO_SCRIPTS.driver;
    expect(driver.speakerRole).toBe("DRIVER");
    expect(driver.fullText).toBe(
      "I confirm the damaged carton, but I dispute the shortage. The seal was intact."
    );
    expect(driver.words).toEqual([
      "I",
      "confirm",
      "the",
      "damaged",
      "carton,",
      "but",
      "I",
      "dispute",
      "the",
      "shortage.",
      "The",
      "seal",
      "was",
      "intact.",
    ]);
  });

  it("offline simulation: emits progressive partial turns and final committed turn without network", async () => {
    const simulator = new ScenarioAudioSimulator();
    const partials: string[] = [];
    let committedTurn: TranscriptTurn | null = null;
    let ended = false;

    const runPromise = simulator.run({
      scenario: "receiver",
      forceOffline: true,
      onPartialText: (text) => partials.push(text),
      onTurnCommitted: (turn) => {
        committedTurn = turn;
      },
      onEnded: () => {
        ended = true;
      },
    });

    expect(simulator.isSimulating()).toBe(true);

    // Run timers through simulation
    await vi.runAllTimersAsync();
    await runPromise;

    expect(partials.length).toBe(15);
    expect(partials[0]).toBe("I");
    expect(partials[1]).toBe("I have");
    expect(partials[14]).toBe(GOLDEN_SCENARIO_SCRIPTS.receiver.fullText);

    expect(committedTurn).not.toBeNull();
    expect(committedTurn!.speakerRole).toBe("RECEIVER");
    expect(committedTurn!.text).toBe(GOLDEN_SCENARIO_SCRIPTS.receiver.fullText);
    expect(committedTurn!.endOfTurn).toBe(true);
    expect(committedTurn!.confidence).toBeGreaterThanOrEqual(0.95);
    expect(ended).toBe(true);
    expect(simulator.isSimulating()).toBe(false);
  });

  it("offline simulation: driver scenario commits verbatim driver statement", async () => {
    const simulator = new ScenarioAudioSimulator();
    let committedTurn: TranscriptTurn | null = null;

    const runPromise = simulator.run({
      scenario: "driver",
      forceOffline: true,
      onTurnCommitted: (turn) => {
        committedTurn = turn;
      },
    });

    await vi.runAllTimersAsync();
    await runPromise;

    expect(committedTurn).not.toBeNull();
    expect(committedTurn!.speakerRole).toBe("DRIVER");
    expect(committedTurn!.text).toBe(GOLDEN_SCENARIO_SCRIPTS.driver.fullText);
    expect(committedTurn!.endOfTurn).toBe(true);
  });

  it("offline simulation: stop() aborts simulation immediately and suppresses remaining callbacks", async () => {
    const simulator = new ScenarioAudioSimulator();
    let committed = false;
    let ended = false;

    simulator.run({
      scenario: "receiver",
      forceOffline: true,
      onTurnCommitted: () => {
        committed = true;
      },
      onEnded: () => {
        ended = true;
      },
    });

    expect(simulator.isSimulating()).toBe(true);
    // Advance partially
    vi.advanceTimersByTime(500);

    // Abort
    simulator.stop();
    expect(simulator.isSimulating()).toBe(false);

    // Advance remainder of time
    await vi.runAllTimersAsync();
    expect(committed).toBe(false);
    expect(ended).toBe(false);
  });

  it("online simulation: streams 1,600-byte buffers at 50ms intervals from real WAV files", async () => {
    vi.useRealTimers(); // Use real timers with small slice or synthetic audio context

    // Verify WAV files exist on disk
    const receiverWavPath = path.resolve(
      __dirname,
      "../../public/audio/scenario-po44891-receiver.wav"
    );
    const driverWavPath = path.resolve(
      __dirname,
      "../../public/audio/scenario-po44891-driver.wav"
    );

    expect(fs.existsSync(receiverWavPath)).toBe(true);
    expect(fs.existsSync(driverWavPath)).toBe(true);

    const receiverBuffer = fs.readFileSync(receiverWavPath);
    expect(receiverBuffer.byteLength).toBeGreaterThan(100000);

    // Mock Web Audio AudioContext and fetch for Node environment
    class MockAudioBufferSourceNode {
      buffer: any = null;
      connect = vi.fn();
      start = vi.fn();
      stop = vi.fn();
      disconnect = vi.fn();
    }

    class MockAnalyserNode {
      fftSize = 64;
      connect = vi.fn();
      disconnect = vi.fn();
    }

    class MockAudioContext {
      state = "running";
      destination = {};
      resume = vi.fn().mockResolvedValue(undefined);
      decodeAudioData = vi.fn().mockResolvedValue({});
      createBufferSource = vi.fn().mockReturnValue(new MockAudioBufferSourceNode());
      createAnalyser = vi.fn().mockReturnValue(new MockAnalyserNode());
      close = vi.fn().mockResolvedValue(undefined);
    }

    (global as any).window = global;
    (global as any).AudioContext = MockAudioContext;

    // Mock fetch to return real receiver WAV buffer
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => {
        const ab = new ArrayBuffer(receiverBuffer.byteLength);
        new Uint8Array(ab).set(receiverBuffer);
        return ab;
      },
    } as any);

    const simulator = new ScenarioAudioSimulator();
    const chunks: ArrayBuffer[] = [];
    let ended = false;

    // Use fake timers to step through 50ms intervals
    vi.useFakeTimers();

    let simulationError: Error | null = null;
    const runPromise = simulator.run({
      scenario: "receiver",
      forceOffline: false,
      onAudioChunk: (chunk) => {
        chunks.push(chunk);
      },
      onEnded: () => {
        ended = true;
      },
      onError: (err) => {
        simulationError = err;
      },
    }).catch((err) => {
      simulationError = err;
    });

    // Flush async setup steps (fetch, decodeAudioData, etc.)
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    if (simulationError) {
      throw simulationError;
    }

    // Advance timers step by step and inspect chunk timing
    // Check first 10 chunks
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(50);
      expect(chunks.length).toBe(i + 1);
      expect(chunks[i].byteLength).toBe(1600); // Exactly 1,600 bytes (50ms @ 16kHz PCM16)
    }

    // Fast-forward to the end of the simulation
    await vi.runAllTimersAsync();
    await runPromise;

    expect(ended).toBe(true);
    expect(chunks.length).toBeGreaterThan(100);

    // Verify all chunks except possibly the last remainder are exactly 1,600 bytes
    for (let i = 0; i < chunks.length - 1; i++) {
      expect(chunks[i].byteLength).toBe(1600);
    }
    // Last chunk must be <= 1600 bytes
    expect(chunks[chunks.length - 1].byteLength).toBeLessThanOrEqual(1600);

    // Total bytes streamed must equal total PCM data size in WAV
    const totalPcmBytes = chunks.reduce((acc, c) => acc + c.byteLength, 0);
    // 209,326 total file bytes minus header (~44 bytes) = ~209,282 bytes
    expect(totalPcmBytes).toBeGreaterThan(200000);
    expect(totalPcmBytes).toBeLessThanOrEqual(receiverBuffer.byteLength);
  });

  it("online simulation: streams driver WAV asset with identical 1,600-byte frame cadence", async () => {
    vi.useRealTimers();

    const driverWavPath = path.resolve(
      __dirname,
      "../../public/audio/scenario-po44891-driver.wav"
    );
    const driverBuffer = fs.readFileSync(driverWavPath);

    class MockAudioBufferSourceNode {
      connect = vi.fn();
      start = vi.fn();
      stop = vi.fn();
      disconnect = vi.fn();
    }
    class MockAnalyserNode {
      fftSize = 64;
      connect = vi.fn();
      disconnect = vi.fn();
    }
    class MockAudioContext {
      state = "running";
      destination = {};
      resume = vi.fn().mockResolvedValue(undefined);
      decodeAudioData = vi.fn().mockResolvedValue({});
      createBufferSource = vi.fn().mockReturnValue(new MockAudioBufferSourceNode());
      createAnalyser = vi.fn().mockReturnValue(new MockAnalyserNode());
      close = vi.fn().mockResolvedValue(undefined);
    }
    (global as any).window = global;
    (global as any).AudioContext = MockAudioContext;

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => {
        const ab = new ArrayBuffer(driverBuffer.byteLength);
        new Uint8Array(ab).set(driverBuffer);
        return ab;
      },
    } as any);

    const simulator = new ScenarioAudioSimulator();
    const chunks: ArrayBuffer[] = [];
    let ended = false;

    vi.useFakeTimers();

    const runPromise = simulator.run({
      scenario: "driver",
      forceOffline: false,
      onAudioChunk: (c) => chunks.push(c),
      onEnded: () => {
        ended = true;
      },
    });

    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }

    // Verify first 5 chunks are 1600 bytes
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(50);
      expect(chunks.length).toBe(i + 1);
      expect(chunks[i].byteLength).toBe(1600);
    }

    await vi.runAllTimersAsync();
    await runPromise;

    expect(ended).toBe(true);
    expect(chunks.length).toBeGreaterThan(100);
  });

  it("handles unknown scenario option by throwing descriptive error (uncovers isRunning leak)", async () => {
    const simulator = new ScenarioAudioSimulator();
    await expect(
      simulator.run({
        scenario: "invalid-scenario" as any,
        forceOffline: true,
      })
    ).rejects.toThrow("Unknown scenario: invalid-scenario");

    // Empirical Finding: In simulation-player.ts:93, this.isRunning = true is set
    // before checking if script exists. Because the throw occurs outside the try/catch block,
    // this.stop() is never called in catch, leaving isRunning === true.
    expect(simulator.isSimulating()).toBe(true);

    // Calling stop() manually clears it
    simulator.stop();
    expect(simulator.isSimulating()).toBe(false);
  });

  it("restarts cleanly when run() is invoked while already running", async () => {
    const simulator = new ScenarioAudioSimulator();
    let receiverTurns = 0;
    let driverTurns = 0;

    // Start receiver simulation
    simulator.run({
      scenario: "receiver",
      forceOffline: true,
      onTurnCommitted: () => {
        receiverTurns++;
      },
    });

    expect(simulator.isSimulating()).toBe(true);
    vi.advanceTimersByTime(200);

    // Immediately start driver simulation
    const driverPromise = simulator.run({
      scenario: "driver",
      forceOffline: true,
      onTurnCommitted: () => {
        driverTurns++;
      },
    });

    await vi.runAllTimersAsync();
    await driverPromise;

    // Receiver should have been canceled, only driver committed
    expect(receiverTurns).toBe(0);
    expect(driverTurns).toBe(1);
  });

  it("stop() is completely idempotent and safe to call repeatedly", () => {
    const simulator = new ScenarioAudioSimulator();
    expect(() => {
      simulator.stop();
      simulator.stop();
      simulator.stop();
    }).not.toThrow();
    expect(simulator.isSimulating()).toBe(false);
  });
});

// ============================================================================
// Challenge Suite 4: Adversarial WebSocket & Network Boundary Attacks
// ============================================================================
describe("Empirical Challenge: Adversarial WebSocket & Network Boundaries", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    (global as any).WebSocket = MockWebSocket;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("safely ignores malformed or corrupted JSON incoming frames without crashing", async () => {
    const onError = vi.fn();
    const onPartialTranscript = vi.fn();

    const client = new AssemblyAIRealtimeClient({
      token: "test-token",
      onError,
      onPartialTranscript,
    });

    await client.connect();
    const ws = MockWebSocket.instances[0];

    // Transition to connected via Begin
    ws.simulateMessage({ type: "Begin", id: "sess-valid-123" });
    expect(client.getState()).toBe("connected");

    // Corrupted non-JSON string
    ws.onmessage?.({ data: "<<MALFORMED_NON_JSON_DATA>>" });
    // Incomplete JSON
    ws.onmessage?.({ data: '{"type": "Turn", "transcript":' });
    // Binary or null data
    ws.onmessage?.({ data: null });
    ws.onmessage?.({ data: new ArrayBuffer(16) });

    // Client must stay connected and not trigger onError
    expect(client.getState()).toBe("connected");
    expect(onError).not.toHaveBeenCalled();
    expect(onPartialTranscript).not.toHaveBeenCalled();
  });

  it("handles AssemblyAI upstream Error frames by calling onError callback", async () => {
    const onError = vi.fn();

    const client = new AssemblyAIRealtimeClient({
      token: "test-token",
      onError,
    });

    await client.connect();
    const ws = MockWebSocket.instances[0];

    ws.simulateMessage({
      type: "Error",
      error: "Sample rate 48000 does not match handshake 16000",
    });

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Sample rate 48000 does not match handshake 16000",
      })
    );
  });

  it("drops audio chunks safely without error when socket is not OPEN", () => {
    const client = new AssemblyAIRealtimeClient({
      token: "test-token",
    });

    // Client not connected yet (socket is null)
    expect(() => {
      client.sendAudio(new ArrayBuffer(1600));
    }).not.toThrow();

    // Client state is still idle
    expect(client.getState()).toBe("idle");
  });

  it("handles unexpected WebSocket drop (code 1006 abnormal closure) by reporting error", async () => {
    const onError = vi.fn();
    const onStateChange = vi.fn();

    const client = new AssemblyAIRealtimeClient({
      token: "test-token",
      onError,
      onStateChange,
    });

    await client.connect();
    const ws = MockWebSocket.instances[0];

    // Simulate unexpected drop
    ws.close(1006, "Connection lost unexpectedly");

    expect(client.getState()).toBe("error");
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("WebSocket closed unexpectedly with code 1006"),
      })
    );
  });

  it("concurrent connect() calls do not create duplicate WebSockets", async () => {
    const client = new AssemblyAIRealtimeClient({
      token: "test-token",
    });

    // Invoke connect twice concurrently
    const p1 = client.connect();
    const p2 = client.connect();

    await Promise.all([p1, p2]);

    expect(MockWebSocket.instances.length).toBe(1);
  });
});

