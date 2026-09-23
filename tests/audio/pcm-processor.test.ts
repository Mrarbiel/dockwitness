import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { PcmResampler } from "@/lib/assemblyai/pcm-resampler";

describe("AudioWorklet: public/worklets/pcm-processor.js", () => {
  let registeredProcessors: Record<string, any> = {};

  beforeEach(() => {
    registeredProcessors = {};

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

    const workletCode = fs.readFileSync(
      path.resolve(__dirname, "../../public/worklets/pcm-processor.js"),
      "utf8"
    );
    new Function(workletCode)();
  });

  it("registers processor with name 'pcm-processor'", () => {
    expect(registeredProcessors["pcm-processor"]).toBeDefined();
  });

  it("downsamples 48kHz input to 16kHz mono PCM16 in 50ms (1600-byte) chunks", () => {
    (global as any).sampleRate = 48000;
    const ProcClass = registeredProcessors["pcm-processor"];
    const proc = new ProcClass();

    // 100 blocks of 128 samples = 12,800 samples @ 48kHz (0.2667s)
    // Target 16kHz samples = 12,800 / 3 = 4,266.67 samples
    for (let b = 0; b < 100; b++) {
      const channel = new Float32Array(128);
      for (let i = 0; i < 128; i++) {
        channel[i] = Math.sin((2 * Math.PI * 440 * (b * 128 + i)) / 48000);
      }
      proc.process([[channel]], [], {});
    }

    // 5 chunks of 800 samples = 4,000 samples emitted
    expect(proc.port.messages.length).toBe(5);
    for (const msg of proc.port.messages) {
      expect(msg.data.event).toBe("chunk");
      expect(msg.data.buffer.byteLength).toBe(1600); // 800 * 2 bytes = 1600 bytes
    }

    // Remainder in internal buffer: 267 samples
    expect(proc.bufferIndex).toBe(267);
  });

  it("exhibits mathematically exact zero phase drift across 1,000 blocks at 44.1 kHz", () => {
    (global as any).sampleRate = 44100;
    const ProcClass = registeredProcessors["pcm-processor"];
    const proc = new ProcClass();

    // 1000 blocks of 128 samples = 128,000 samples @ 44.1kHz
    // Exact expected samples = round(128,000 / (44100 / 16000)) = 46,440
    for (let b = 0; b < 1000; b++) {
      const channel = new Float32Array(128);
      for (let i = 0; i < 128; i++) {
        channel[i] = Math.sin((2 * Math.PI * 440 * (b * 128 + i)) / 44100);
      }
      proc.process([[channel]], [], {});
    }

    const totalSamplesEmitted = proc.port.messages.length * 800 + proc.bufferIndex;
    const expectedSamples = Math.round(128000 / (44100 / 16000));
    expect(totalSamplesEmitted).toBe(expectedSamples); // Exact 46,440
    expect(proc.phase).toBeGreaterThanOrEqual(0);
    expect(proc.phase).toBeLessThan(44100 / 16000);
  });

  it("downmixes multi-channel stereo input to mono without dropping channels", () => {
    (global as any).sampleRate = 48000;
    const ProcClass = registeredProcessors["pcm-processor"];
    const proc = new ProcClass();

    // Channel 0: constant 0.4, Channel 1: constant 0.8 -> Average = 0.6
    const ch0 = new Float32Array(128).fill(0.4);
    const ch1 = new Float32Array(128).fill(0.8);

    // Run 7 blocks (~298 samples, < 800 so all in internal buffer)
    for (let b = 0; b < 6; b++) {
      proc.process([[ch0, ch1]], [], {});
    }

    // Check first sample in buffer: 0.6 * 32767 = ~19660
    const sample = proc.buffer[0];
    expect(sample).toBeGreaterThanOrEqual(19650);
    expect(sample).toBeLessThanOrEqual(19670);
  });

  it("handles port 'flush' command to transmit partial remainder buffer", () => {
    (global as any).sampleRate = 48000;
    const ProcClass = registeredProcessors["pcm-processor"];
    const proc = new ProcClass();

    // Send 1 block of 128 samples at 48kHz -> generates 43 samples in buffer (< 800)
    const ch = new Float32Array(128).fill(0.5);
    proc.process([[ch]], [], {});

    expect(proc.port.messages.length).toBe(0);
    expect(proc.bufferIndex).toBe(43);

    // Send flush command
    proc.port.onmessage?.({ data: { command: "flush" } });

    expect(proc.port.messages.length).toBe(1);
    expect(proc.port.messages[0].data.event).toBe("chunk");
    expect(proc.port.messages[0].data.isFinal).toBe(true);
    expect(proc.port.messages[0].data.buffer.byteLength).toBe(43 * 2); // 86 bytes
    expect(proc.bufferIndex).toBe(0);
  });

  it("clamps extreme audio values without numerical overflow", () => {
    (global as any).sampleRate = 48000;
    const ProcClass = registeredProcessors["pcm-processor"];
    const proc = new ProcClass();

    const extremeChannel = new Float32Array(128);
    extremeChannel[0] = 5.0; // Over +1.0 (sampled at i=0)
    extremeChannel[3] = -10.0; // Under -1.0 (sampled at i=3)
    extremeChannel[6] = NaN; // Non-finite (sampled at i=6)
    extremeChannel[9] = Infinity; // Non-finite (sampled at i=9)

    proc.process([[extremeChannel]], [], {});

    // First sample should be clamped to 32767
    expect(proc.buffer[0]).toBe(32767);
    // Second sample should be clamped to -32768
    expect(proc.buffer[1]).toBe(-32768);
    // NaN should convert to 0
    expect(proc.buffer[2]).toBe(0);
    // Infinity should convert to 0
    expect(proc.buffer[3]).toBe(0);
  });
});

describe("PcmResampler (Pure TypeScript Engine)", () => {
  it("downsamples 96kHz input to 16kHz with 6:1 decimation", () => {
    const resampler = new PcmResampler();
    const chunks: ArrayBuffer[] = [];

    // 96kHz -> 16kHz: ratio = 6.0
    // 600 blocks of 128 samples = 76,800 samples
    // 76,800 / 6 = 12,800 samples -> exactly 16 chunks of 800 samples
    for (let b = 0; b < 600; b++) {
      const ch = new Float32Array(128).fill(0.25);
      resampler.process([ch], 96000, (chunk) => {
        chunks.push(chunk);
      });
    }

    expect(chunks.length).toBe(16);
    for (const c of chunks) {
      expect(c.byteLength).toBe(1600);
    }
    expect(resampler.getBufferIndex()).toBe(0);
  });
});
