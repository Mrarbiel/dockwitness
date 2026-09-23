/**
 * Pure TypeScript PCM downsampling engine.
 * Downsamples any input sample rate (e.g. 44.1, 48, 96 kHz) to 16,000 Hz mono signed 16-bit PCM (LE)
 * with zero cumulative phase drift and 800-sample (1,600-byte) chunking.
 */
export class PcmResampler {
  public readonly targetSampleRate: number = 16000;
  private phase: number = 0.0;
  private buffer: Int16Array = new Int16Array(800);
  private bufferIndex: number = 0;

  public getPhase(): number {
    return this.phase;
  }

  public getBufferIndex(): number {
    return this.bufferIndex;
  }

  public reset(): void {
    this.phase = 0.0;
    this.bufferIndex = 0;
  }

  /**
   * Process a quantum of multi-channel or mono audio data.
   * Emits complete 800-sample (1,600-byte) chunks.
   */
  public process(
    channels: Float32Array[],
    inputSampleRate: number,
    onChunk: (chunk: ArrayBuffer, isFinal?: boolean) => void
  ): void {
    if (!channels || channels.length === 0 || !channels[0] || channels[0].length === 0) {
      return;
    }

    const numChannels = channels.length;
    const inputLength = channels[0].length;
    const ratio = inputSampleRate / this.targetSampleRate;
    if (ratio <= 0) return;

    let i = this.phase;
    while (i < inputLength) {
      const idx = Math.floor(i);
      const frac = i - idx;
      const nextIdx = idx + 1 < inputLength ? idx + 1 : idx;

      // Multi-channel downmix to mono with linear interpolation
      let s0 = 0;
      let s1 = 0;
      for (let c = 0; c < numChannels; c++) {
        const ch = channels[c];
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
        const chunk = this.buffer.slice().buffer;
        onChunk(chunk, false);
        this.bufferIndex = 0;
      }

      i += ratio;
    }

    // Persist fractional phase across render quanta
    this.phase = i - inputLength;
  }

  /**
   * Flush any remaining partial buffer.
   */
  public flush(onChunk: (chunk: ArrayBuffer, isFinal?: boolean) => void): void {
    if (this.bufferIndex > 0) {
      const remainder = this.buffer.slice(0, this.bufferIndex).buffer;
      onChunk(remainder, true);
      this.bufferIndex = 0;
    }
  }
}
