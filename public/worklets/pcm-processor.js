/**
 * DockWitness AudioWorkletProcessor
 * Downsamples hardware microphone input to 16,000 Hz mono signed 16-bit PCM (LE)
 * Emits 50ms chunks (800 samples = 1,600 bytes) for AssemblyAI Universal-3.5 Pro Streaming.
 *
 * Features:
 * - Fractional phase accumulator ensuring zero cumulative phase/clock drift across 128-sample quanta
 * - Multi-channel mono downmix (handles mono, stereo, and mic arrays)
 * - Safe numeric clamping [-1.0, 1.0] with NaN/Infinity filtering
 * - Symmetric rounding for signed 16-bit PCM LE
 * - Flush command support on message port for zero audio truncation at session end
 */
class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.phase = 0.0; // Persistent fractional phase offset across render quanta
    this.buffer = new Int16Array(800); // 50ms frame @ 16kHz (1,600 bytes)
    this.bufferIndex = 0;

    this.port.onmessage = (event) => {
      if (event.data && event.data.command === "flush") {
        this.flush();
      }
    };
  }

  flush() {
    if (this.bufferIndex > 0) {
      // Transfer partial remainder buffer
      const remainder = this.buffer.slice(0, this.bufferIndex).buffer;
      this.port.postMessage({ event: "chunk", buffer: remainder, isFinal: true }, [remainder]);
      this.bufferIndex = 0;
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const numChannels = input.length;
    const channel0 = input[0];
    if (!channel0 || channel0.length === 0) return true;

    const inputLength = channel0.length;
    const currentSampleRate =
      typeof sampleRate !== "undefined" && sampleRate > 0 ? sampleRate : 48000;

    const ratio = currentSampleRate / this.targetSampleRate;
    if (ratio <= 0) return true;

    let i = this.phase;
    while (i < inputLength) {
      const idx = Math.floor(i);
      const frac = i - idx;
      const nextIdx = idx + 1 < inputLength ? idx + 1 : idx;

      // Multi-channel downmix to mono with linear interpolation
      let s0 = 0;
      let s1 = 0;
      for (let c = 0; c < numChannels; c++) {
        const ch = input[c];
        s0 += ch[idx] || 0;
        s1 += ch[nextIdx] || 0;
      }
      s0 /= numChannels;
      s1 /= numChannels;

      const floatSample = s0 + frac * (s1 - s0);

      // Clamp [-1.0, 1.0] and filter non-finite values
      const finiteSample = Number.isFinite(floatSample) ? floatSample : 0;
      const clamped = Math.max(-1, Math.min(1, finiteSample));

      // 16-bit signed PCM conversion with symmetric rounding
      const int16Sample = Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);

      this.buffer[this.bufferIndex++] = int16Sample;

      if (this.bufferIndex >= 800) {
        // Transfer 1,600-byte PCM16 buffer to main thread
        const chunk = this.buffer.slice().buffer;
        this.port.postMessage({ event: "chunk", buffer: chunk }, [chunk]);
        this.bufferIndex = 0;
      }

      i += ratio;
    }

    // Persist residual fractional phase for the next render quantum
    this.phase = i - inputLength;

    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
