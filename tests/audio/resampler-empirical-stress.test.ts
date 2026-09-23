import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { PcmResampler } from "@/lib/assemblyai/pcm-resampler";

describe("Milestone 1 Empirical Stress Suite: Resampler & AudioWorklet", () => {
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

    const workletCode = fs.readFileSync(
      path.resolve(__dirname, "../../public/worklets/pcm-processor.js"),
      "utf8"
    );
    new Function(workletCode)();
  });

  // =========================================================================
  // 1. 10,000 CONTINUOUS BLOCKS STRESS TESTS (44.1, 48, 96 kHz)
  // =========================================================================
  describe("10,000 continuous 128-sample blocks phase drift & cumulative count", () => {
    it("preserves zero phase drift across 10,000 blocks at 44.1 kHz", () => {
      (global as any).sampleRate = 44100;
      const ProcClass = registeredProcessors["pcm-processor"];
      const proc = new ProcClass();

      const numBlocks = 10000;
      const blockSize = 128;
      const totalInputSamples = numBlocks * blockSize; // 1,280,000 samples
      const ratio = 44100 / 16000; // 2.75625
      const theoreticalTargetSamples = Math.floor((totalInputSamples * 16000) / 44100); // 464,421

      // Track checkpoints to ensure continuous stability
      const checkpoints = [100, 500, 1000, 5000, 10000];
      const checkpointErrors: { block: number; expected: number; actual: number; diff: number }[] = [];

      for (let b = 0; b < numBlocks; b++) {
        const channel = new Float32Array(blockSize);
        // Multi-frequency synthetic audio signal
        for (let i = 0; i < blockSize; i++) {
          const t = (b * blockSize + i) / 44100;
          channel[i] = 0.5 * Math.sin(2 * Math.PI * 440 * t) + 0.3 * Math.cos(2 * Math.PI * 1200 * t);
        }

        proc.process([[channel]], [], {});

        // Check phase bounds at every block: phase must remain in [0, ratio)
        expect(proc.phase).toBeGreaterThanOrEqual(0);
        expect(proc.phase).toBeLessThan(ratio);

        if (checkpoints.includes(b + 1)) {
          const currentInputSamples = (b + 1) * blockSize;
          const expected = Math.floor((currentInputSamples * 16000) / 44100);
          const actual = proc.port.messages.length * 800 + proc.bufferIndex;
          checkpointErrors.push({
            block: b + 1,
            expected,
            actual,
            diff: Math.abs(actual - expected),
          });
        }
      }

      // Checkpoints must all be within theoretical expectation +/- 1 sample
      for (const cp of checkpointErrors) {
        expect(cp.diff).toBeLessThanOrEqual(1);
      }

      const totalProducedSamples = proc.port.messages.length * 800 + proc.bufferIndex;
      expect(Math.abs(totalProducedSamples - theoreticalTargetSamples)).toBeLessThanOrEqual(1);

      // Verify chunks emitted are strictly 1,600 bytes
      const expectedChunks = Math.floor(totalProducedSamples / 800);
      expect(proc.port.messages.length).toBe(expectedChunks);
      for (let c = 0; c < proc.port.messages.length; c++) {
        const msg = proc.port.messages[c];
        expect(msg.data.event).toBe("chunk");
        expect(msg.data.buffer.byteLength).toBe(1600);
      }

      // Flush remaining samples and verify conservation
      const remainderBeforeFlush = proc.bufferIndex;
      proc.port.onmessage?.({ data: { command: "flush" } });

      if (remainderBeforeFlush > 0) {
        const flushMsg = proc.port.messages[proc.port.messages.length - 1];
        expect(flushMsg.data.isFinal).toBe(true);
        expect(flushMsg.data.buffer.byteLength).toBe(remainderBeforeFlush * 2);
      }

      // Total samples across all messages must equal totalProducedSamples
      let sumSamples = 0;
      for (const msg of proc.port.messages) {
        sumSamples += msg.data.buffer.byteLength / 2;
      }
      expect(sumSamples).toBe(totalProducedSamples);
    });

    it("preserves zero phase drift across 10,000 blocks at 48.0 kHz", () => {
      (global as any).sampleRate = 48000;
      const ProcClass = registeredProcessors["pcm-processor"];
      const proc = new ProcClass();

      const numBlocks = 10000;
      const blockSize = 128;
      const totalInputSamples = numBlocks * blockSize; // 1,280,000 samples
      const ratio = 48000 / 16000; // 3.0
      const theoreticalTargetSamples = Math.floor((totalInputSamples * 16000) / 48000); // 426,666

      for (let b = 0; b < numBlocks; b++) {
        const channel = new Float32Array(blockSize);
        for (let i = 0; i < blockSize; i++) {
          channel[i] = Math.sin((2 * Math.PI * 440 * (b * blockSize + i)) / 48000);
        }
        proc.process([[channel]], [], {});
        expect(proc.phase).toBeGreaterThanOrEqual(0);
        expect(proc.phase).toBeLessThan(ratio);
      }

      const totalProducedSamples = proc.port.messages.length * 800 + proc.bufferIndex;
      expect(Math.abs(totalProducedSamples - theoreticalTargetSamples)).toBeLessThanOrEqual(1);

      // Verify every emitted chunk is 1,600 bytes
      for (const msg of proc.port.messages) {
        expect(msg.data.buffer.byteLength).toBe(1600);
      }
    });

    it("preserves zero phase drift across 10,000 blocks at 96.0 kHz", () => {
      (global as any).sampleRate = 96000;
      const ProcClass = registeredProcessors["pcm-processor"];
      const proc = new ProcClass();

      const numBlocks = 10000;
      const blockSize = 128;
      const totalInputSamples = numBlocks * blockSize; // 1,280,000 samples
      const ratio = 96000 / 16000; // 6.0
      const theoreticalTargetSamples = Math.floor((totalInputSamples * 16000) / 96000); // 213,333

      for (let b = 0; b < numBlocks; b++) {
        const channel = new Float32Array(blockSize);
        for (let i = 0; i < blockSize; i++) {
          channel[i] = Math.sin((2 * Math.PI * 440 * (b * blockSize + i)) / 96000);
        }
        proc.process([[channel]], [], {});
        expect(proc.phase).toBeGreaterThanOrEqual(0);
        expect(proc.phase).toBeLessThan(ratio);
      }

      const totalProducedSamples = proc.port.messages.length * 800 + proc.bufferIndex;
      expect(Math.abs(totalProducedSamples - theoreticalTargetSamples)).toBeLessThanOrEqual(1);

      // Verify every emitted chunk is 1,600 bytes
      for (const msg of proc.port.messages) {
        expect(msg.data.buffer.byteLength).toBe(1600);
      }
    });
  });

  // =========================================================================
  // 2. FRAME SIZE INTEGRITY & BUFFER FORMAT INVARIANTS
  // =========================================================================
  describe("Frame size & buffer invariants", () => {
    it("ensures every regular chunk is exactly 1,600 bytes containing valid Int16 values", () => {
      (global as any).sampleRate = 48000;
      const ProcClass = registeredProcessors["pcm-processor"];
      const proc = new ProcClass();

      // Run 200 blocks (8,533 samples @ 16kHz -> 10 chunks of 800)
      for (let b = 0; b < 200; b++) {
        const channel = new Float32Array(128).fill(0.25);
        proc.process([[channel]], [], {});
      }

      expect(proc.port.messages.length).toBe(10);

      for (const msg of proc.port.messages) {
        expect(msg.data.event).toBe("chunk");
        expect(msg.data.isFinal).toBeUndefined();
        expect(msg.data.buffer).toBeInstanceOf(ArrayBuffer);
        expect(msg.data.buffer.byteLength).toBe(1600);

        const int16View = new Int16Array(msg.data.buffer);
        expect(int16View.length).toBe(800);

        for (let i = 0; i < int16View.length; i++) {
          const val = int16View[i];
          expect(Number.isInteger(val)).toBe(true);
          expect(val).toBeGreaterThanOrEqual(-32768);
          expect(val).toBeLessThanOrEqual(32767);
          // 0.25 * 32767 = 8192
          expect(val).toBe(8192);
        }
      }
    });
  });

  // =========================================================================
  // 3. MULTI-CHANNEL DOWNMIXING (STEREO AND 4-CHANNEL ARRAY)
  // =========================================================================
  describe("Multi-channel downmixing precision", () => {
    it("averages stereo channels properly without amplitude distortion or bias", () => {
      (global as any).sampleRate = 48000;
      const ProcClass = registeredProcessors["pcm-processor"];
      const proc = new ProcClass();

      // Test 1: Ch0 = 0.2, Ch1 = 0.8 -> Expected Average = 0.5 -> Int16: 16384
      const ch0 = new Float32Array(128).fill(0.2);
      const ch1 = new Float32Array(128).fill(0.8);
      proc.process([[ch0, ch1]], [], {});

      expect(proc.bufferIndex).toBe(43);
      for (let i = 0; i < proc.bufferIndex; i++) {
        expect(proc.buffer[i]).toBe(16384);
      }
    });

    it("correctly handles complete phase cancellation in stereo", () => {
      (global as any).sampleRate = 48000;
      const ProcClass = registeredProcessors["pcm-processor"];
      const proc = new ProcClass();

      // Equal and opposite signals -> Average = 0.0 -> Int16: 0
      const ch0 = new Float32Array(128).fill(0.75);
      const ch1 = new Float32Array(128).fill(-0.75);
      proc.process([[ch0, ch1]], [], {});

      for (let i = 0; i < proc.bufferIndex; i++) {
        expect(proc.buffer[i]).toBe(0);
      }
    });

    it("correctly handles 4-channel microphone array downmixing with equal weight", () => {
      (global as any).sampleRate = 48000;
      const ProcClass = registeredProcessors["pcm-processor"];
      const proc = new ProcClass();

      // Ch0: 0.1, Ch1: 0.2, Ch2: 0.3, Ch3: 0.4 -> Average = (1.0 / 4) = 0.25 -> 8192
      const ch0 = new Float32Array(128).fill(0.1);
      const ch1 = new Float32Array(128).fill(0.2);
      const ch2 = new Float32Array(128).fill(0.3);
      const ch3 = new Float32Array(128).fill(0.4);

      proc.process([[ch0, ch1, ch2, ch3]], [], {});

      expect(proc.bufferIndex).toBe(43);
      for (let i = 0; i < proc.bufferIndex; i++) {
        expect(proc.buffer[i]).toBe(8192);
      }
    });

    it("handles hot microphone on single channel without clipping or dropping", () => {
      (global as any).sampleRate = 48000;
      const ProcClass = registeredProcessors["pcm-processor"];
      const proc = new ProcClass();

      // 4-ch array: 3 channels quiet (0.0), 1 channel active (0.8) -> Average = 0.2 -> 6553
      const ch0 = new Float32Array(128).fill(0.8);
      const ch1 = new Float32Array(128).fill(0.0);
      const ch2 = new Float32Array(128).fill(0.0);
      const ch3 = new Float32Array(128).fill(0.0);

      proc.process([[ch0, ch1, ch2, ch3]], [], {});

      const expected = Math.round(0.2 * 32767); // 6553
      for (let i = 0; i < proc.bufferIndex; i++) {
        expect(proc.buffer[i]).toBe(expected);
      }
    });
  });

  // =========================================================================
  // 4. PORT FLUSH BEHAVIOR & SAMPLE RETENTION
  // =========================================================================
  describe("Port flush command & trailing sample emission", () => {
    it("emits remainder buffer with isFinal flag on flush", () => {
      (global as any).sampleRate = 48000;
      const ProcClass = registeredProcessors["pcm-processor"];
      const proc = new ProcClass();

      // Process 3 blocks at 48kHz -> 128 samples total (< 800)
      for (let b = 0; b < 3; b++) {
        proc.process([[new Float32Array(128).fill(0.5)]], [], {});
      }

      const remainderCount = proc.bufferIndex;
      expect(remainderCount).toBe(128);
      expect(proc.port.messages.length).toBe(0);

      // Trigger flush
      proc.port.onmessage?.({ data: { command: "flush" } });

      expect(proc.port.messages.length).toBe(1);
      const msg = proc.port.messages[0];
      expect(msg.data.event).toBe("chunk");
      expect(msg.data.isFinal).toBe(true);
      expect(msg.data.buffer.byteLength).toBe(128 * 2); // 256 bytes
      expect(proc.bufferIndex).toBe(0);
    });

    it("does not emit spurious messages when flush is called on empty buffer", () => {
      (global as any).sampleRate = 48000;
      const ProcClass = registeredProcessors["pcm-processor"];
      const proc = new ProcClass();

      expect(proc.bufferIndex).toBe(0);
      proc.port.onmessage?.({ data: { command: "flush" } });

      expect(proc.port.messages.length).toBe(0);
      expect(proc.bufferIndex).toBe(0);
    });

    it("is idempotent on repeated flush calls", () => {
      (global as any).sampleRate = 48000;
      const ProcClass = registeredProcessors["pcm-processor"];
      const proc = new ProcClass();

      proc.process([[new Float32Array(128).fill(0.1)]], [], {});
      expect(proc.bufferIndex).toBe(43);

      // Flush 1
      proc.port.onmessage?.({ data: { command: "flush" } });
      expect(proc.port.messages.length).toBe(1);
      expect(proc.bufferIndex).toBe(0);

      // Flush 2
      proc.port.onmessage?.({ data: { command: "flush" } });
      expect(proc.port.messages.length).toBe(1); // No new message
      expect(proc.bufferIndex).toBe(0);
    });
  });

  // =========================================================================
  // 5. VALUE CLAMPING, BIT-DEPTH SAFETY & NON-FINITE FILTERING
  // =========================================================================
  describe("Value clamping & numerical edge cases", () => {
    it("strictly clamps positive and negative out-of-range floats to [-32768, 32767]", () => {
      (global as any).sampleRate = 48000;
      const ProcClass = registeredProcessors["pcm-processor"];
      const proc = new ProcClass();

      const extremeChannel = new Float32Array(128);
      extremeChannel[0] = 2.0; // Positive overflow
      extremeChannel[3] = -2.0; // Negative overflow
      extremeChannel[6] = 50.0; // Extreme positive
      extremeChannel[9] = -100.0; // Extreme negative
      extremeChannel[12] = 1.00001; // Just over 1.0
      extremeChannel[15] = -1.00001; // Just under -1.0

      proc.process([[extremeChannel]], [], {});

      // Sample 0: +2.0 -> clamped to 1.0 -> 32767
      expect(proc.buffer[0]).toBe(32767);
      // Sample 1: -2.0 -> clamped to -1.0 -> -32768
      expect(proc.buffer[1]).toBe(-32768);
      // Sample 2: +50.0 -> clamped to 1.0 -> 32767
      expect(proc.buffer[2]).toBe(32767);
      // Sample 3: -100.0 -> clamped to -1.0 -> -32768
      expect(proc.buffer[3]).toBe(-32768);
      // Sample 4: +1.00001 -> clamped to 1.0 -> 32767
      expect(proc.buffer[4]).toBe(32767);
      // Sample 5: -1.00001 -> clamped to -1.0 -> -32768
      expect(proc.buffer[5]).toBe(-32768);
    });

    it("replaces NaN, +Infinity, and -Infinity with 0 without throwing or overflowing", () => {
      (global as any).sampleRate = 48000;
      const ProcClass = registeredProcessors["pcm-processor"];
      const proc = new ProcClass();

      const nanChannel = new Float32Array(128);
      nanChannel[0] = NaN;
      nanChannel[3] = Infinity;
      nanChannel[6] = -Infinity;

      proc.process([[nanChannel]], [], {});

      expect(proc.buffer[0]).toBe(0);
      expect(proc.buffer[1]).toBe(0);
      expect(proc.buffer[2]).toBe(0);
    });

    it("survives 1,000 blocks of adversarial torture stream (NaN, Inf, Overflow)", () => {
      (global as any).sampleRate = 44100;
      const ProcClass = registeredProcessors["pcm-processor"];
      const proc = new ProcClass();

      const tortureValues = [
        NaN,
        Infinity,
        -Infinity,
        2.5,
        -3.5,
        1e20,
        -1e20,
        1e-45, // Denormal
        0.0,
        1.0,
        -1.0,
      ];

      for (let b = 0; b < 1000; b++) {
        const channel = new Float32Array(128);
        for (let i = 0; i < 128; i++) {
          channel[i] = tortureValues[(b * 128 + i) % tortureValues.length];
        }
        // Should not throw or crash
        expect(() => proc.process([[channel]], [], {})).not.toThrow();
      }

      // Verify all emitted chunks contain valid signed 16-bit integers
      for (const msg of proc.port.messages) {
        const int16View = new Int16Array(msg.data.buffer);
        for (let i = 0; i < int16View.length; i++) {
          const val = int16View[i];
          expect(Number.isInteger(val)).toBe(true);
          expect(Number.isFinite(val)).toBe(true);
          expect(val).toBeGreaterThanOrEqual(-32768);
          expect(val).toBeLessThanOrEqual(32767);
        }
      }

      // Verify internal buffer
      for (let i = 0; i < proc.bufferIndex; i++) {
        const val = proc.buffer[i];
        expect(Number.isInteger(val)).toBe(true);
        expect(Number.isFinite(val)).toBe(true);
        expect(val).toBeGreaterThanOrEqual(-32768);
        expect(val).toBeLessThanOrEqual(32767);
      }
    });
  });

  // =========================================================================
  // 6. CROSS-VERIFICATION: WORKLET VS TYPESCRIPT RESAMPLER
  // =========================================================================
  describe("Cross-verification: AudioWorklet vs TypeScript PcmResampler", () => {
    it("yields identical output samples across 500 blocks at 44.1 kHz", () => {
      (global as any).sampleRate = 44100;
      const ProcClass = registeredProcessors["pcm-processor"];
      const proc = new ProcClass();
      const tsResampler = new PcmResampler();

      const tsChunks: ArrayBuffer[] = [];

      for (let b = 0; b < 500; b++) {
        const channel = new Float32Array(128);
        for (let i = 0; i < 128; i++) {
          channel[i] = Math.sin((2 * Math.PI * 300 * (b * 128 + i)) / 44100);
        }

        proc.process([[channel]], [], {});
        tsResampler.process([channel], 44100, (chunk) => {
          tsChunks.push(chunk);
        });
      }

      // Both should have emitted identical number of chunks
      expect(proc.port.messages.length).toBe(tsChunks.length);
      expect(proc.bufferIndex).toBe(tsResampler.getBufferIndex());

      // Bit-for-bit comparison across all chunks
      for (let c = 0; c < tsChunks.length; c++) {
        const workletView = new Int16Array(proc.port.messages[c].data.buffer);
        const tsView = new Int16Array(tsChunks[c]);
        expect(workletView.length).toBe(tsView.length);
        for (let i = 0; i < workletView.length; i++) {
          expect(workletView[i]).toBe(tsView[i]);
        }
      }

      // Compare remaining internal buffer
      for (let i = 0; i < proc.bufferIndex; i++) {
        expect(proc.buffer[i]).toBe((tsResampler as any).buffer[i]);
      }
    });
  });
});
