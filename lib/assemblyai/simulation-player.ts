import { TranscriptTurn } from "./types";

export interface SimulationOptions {
  scenario: "receiver" | "driver";
  onPartialText?: (text: string) => void;
  onTurnCommitted?: (turn: TranscriptTurn) => void;
  onAudioChunk?: (chunk: ArrayBuffer) => void;
  onEnded?: () => void;
  onError?: (err: Error) => void;
  forceOffline?: boolean;
}

export interface GoldenScript {
  wavPath: string;
  speakerRole: "RECEIVER" | "DRIVER";
  fullText: string;
  words: string[];
  durationMs: number;
}

export const GOLDEN_SCENARIO_SCRIPTS: Record<"receiver" | "driver", GoldenScript> = {
  receiver: {
    wavPath: "/audio/scenario-po44891-receiver.wav",
    speakerRole: "RECEIVER" as const,
    fullText:
      "I have forty-seven cartons. Carton thirty-one is crushed underneath and wet on the right side.",
    words: [
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
    ],
    durationMs: 6540,
  },
  driver: {
    wavPath: "/audio/scenario-po44891-driver.wav",
    speakerRole: "DRIVER" as const,
    fullText:
      "I confirm the damaged carton, but I dispute the shortage. The seal was intact.",
    words: [
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
    ],
    durationMs: 6660,
  },
};

export class ScenarioAudioSimulator {
  private activeAudio: HTMLAudioElement | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private isRunning = false;

  public isSimulating(): boolean {
    return this.isRunning;
  }

  public getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode;
  }

  /**
   * Run the simulation (online streaming or offline fallback).
   */
  public async run(options: SimulationOptions): Promise<void> {
    this.stop();
    this.isRunning = true;

    const script = GOLDEN_SCENARIO_SCRIPTS[options.scenario];
    if (!script) {
      throw new Error(`Unknown scenario: ${options.scenario}`);
    }

    try {
      if (options.forceOffline) {
        await this.runOfflineSimulation(script, options);
      } else {
        await this.runOnlineSimulation(script, options);
      }
    } catch (err) {
      this.stop();
      const error = err instanceof Error ? err : new Error(String(err));
      options.onError?.(error);
      throw error;
    }
  }

  /**
   * Mode A: Online streaming - slices WAV into 1600-byte PCM chunks every 50ms and sends to WebSocket.
   * Plays audio through browser speakers and visualizer.
   */
  private async runOnlineSimulation(
    script: GoldenScript,
    options: SimulationOptions
  ): Promise<void> {
    // 1. Fetch WAV asset
    const res = await fetch(script.wavPath);
    if (!res.ok) {
      throw new Error(`Failed to load audio asset: ${script.wavPath} (${res.status})`);
    }
    const arrayBuffer = await res.arrayBuffer();

    // 2. Play aloud through Web Audio and attach analyser for visualizer
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioContext = new AudioCtx();
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    let decodedAudio: AudioBuffer | null = null;
    try {
      decodedAudio = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));
    } catch {
      // Fallback: manually construct AudioBuffer from known PCM16 chunk
      try {
        const rawPcm = extractPcm16FromWav(arrayBuffer);
        const int16Array = new Int16Array(rawPcm);
        decodedAudio = this.audioContext.createBuffer(1, int16Array.length, 16000);
        const channelData = decodedAudio.getChannelData(0);
        for (let i = 0; i < int16Array.length; i++) {
          channelData[i] = int16Array[i] / 32768;
        }
      } catch (pcmErr) {
        console.warn("[SimulationPlayer] Manual PCM AudioBuffer creation fallback failed:", pcmErr);
      }
    }

    if (decodedAudio) {
      this.sourceNode = this.audioContext.createBufferSource();
      this.sourceNode.buffer = decodedAudio;

      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 64;

      this.sourceNode.connect(this.analyserNode);
      this.analyserNode.connect(this.audioContext.destination);
      this.sourceNode.start();
    }

    // 3. Extract raw 16kHz PCM16 samples (skip WAV header, locate 'data' chunk)
    const pcmBuffer = extractPcm16FromWav(arrayBuffer);
    const chunkSize = 1600; // 50ms = 800 samples = 1,600 bytes
    let offset = 0;

    // 4. Stream 1,600-byte chunks at 50ms intervals
    await new Promise<void>((resolve) => {
      this.timer = setInterval(() => {
        if (!this.isRunning) {
          resolve();
          return;
        }

        if (offset < pcmBuffer.byteLength) {
          const chunk = pcmBuffer.slice(offset, Math.min(offset + chunkSize, pcmBuffer.byteLength));
          options.onAudioChunk?.(chunk);
          offset += chunkSize;
        } else {
          if (this.timer) clearInterval(this.timer);
          this.timer = null;
          this.isRunning = false;
          options.onEnded?.();
          resolve();
        }
      }, 50);
    });
  }

  /**
   * Mode B: Offline fallback - plays audio aloud and emits synthetic progressive turns.
   */
  private async runOfflineSimulation(
    script: GoldenScript,
    options: SimulationOptions
  ): Promise<void> {
    // Play audio aloud via HTML5 Audio
    try {
      this.activeAudio = new Audio(script.wavPath);
      await this.activeAudio.play().catch(() => {});
    } catch {
      // Audio playback might be prevented by browser policy if no user gesture
    }

    const words = script.words;
    let wordIndex = 0;
    const intervalMs = Math.max(150, Math.floor(script.durationMs / (words.length + 1)));

    await new Promise<void>((resolve) => {
      this.timer = setInterval(() => {
        if (!this.isRunning) {
          resolve();
          return;
        }

        if (wordIndex < words.length) {
          const partial = words.slice(0, wordIndex + 1).join(" ");
          options.onPartialText?.(partial);
          wordIndex++;
        } else {
          if (this.timer) clearInterval(this.timer);
          this.timer = null;

          // Emit final committed turn
          const now = new Date();
          const turn: TranscriptTurn = {
            id: `turn-sim-${Date.now()}`,
            speakerRole: script.speakerRole,
            text: script.fullText,
            timestamp: now.toTimeString().split(" ")[0] || "00:00:00",
            endOfTurn: true,
            confidence: 0.98,
          };

          options.onTurnCommitted?.(turn);
          this.isRunning = false;
          options.onEnded?.();
          resolve();
        }
      }, intervalMs);
    });
  }

  /**
   * Stop any active simulation and release resources.
   */
  public stop(): void {
    this.isRunning = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.activeAudio) {
      this.activeAudio.pause();
      this.activeAudio = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }

    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }

    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}

/**
 * Helper to extract raw PCM bytes from a 16-bit Mono WAV file.
 */
function extractPcm16FromWav(wavBuffer: ArrayBuffer): ArrayBuffer {
  const view = new DataView(wavBuffer);
  // Scan for 'data' subchunk (0x64617461)
  let offset = 12;
  while (offset < view.byteLength - 8) {
    const chunkId =
      String.fromCharCode(view.getUint8(offset)) +
      String.fromCharCode(view.getUint8(offset + 1)) +
      String.fromCharCode(view.getUint8(offset + 2)) +
      String.fromCharCode(view.getUint8(offset + 3));
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === "data") {
      return wavBuffer.slice(offset + 8, offset + 8 + chunkSize);
    }
    offset += 8 + chunkSize;
  }

  // Fallback: standard 44-byte WAV header offset
  return wavBuffer.slice(44);
}
