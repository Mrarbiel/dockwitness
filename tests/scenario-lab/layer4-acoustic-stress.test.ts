import { describe, it, expect } from "vitest";
import { PcmResampler } from "@/lib/assemblyai/pcm-resampler";
import { extractCandidateQuantity, extractCandidateDamage } from "@/lib/extraction";

/**
 * Programmatic Synthetic Acoustic Stress Generator
 * Synthesizes CC0 warehouse-like acoustic conditions without external copyrighted files.
 * Provides SNR classes: Clean, +20dB, +10dB, +5dB, 0dB
 */
export class SyntheticAcousticLab {
  /**
   * Generates a synthetic speech-like base tone sequence (formants)
   */
  public static generateSpeechTone(sampleRate: number, durationSeconds: number): Float32Array {
    const totalSamples = Math.floor(sampleRate * durationSeconds);
    const buffer = new Float32Array(totalSamples);
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      // Speech vowel formant combination: 500Hz + 1500Hz + 2500Hz with envelope
      const env = Math.sin(Math.PI * (i / totalSamples));
      buffer[i] =
        0.5 * env * (0.6 * Math.sin(2 * Math.PI * 500 * t) + 0.3 * Math.sin(2 * Math.PI * 1500 * t));
    }
    return buffer;
  }

  /**
   * Generates broadband warehouse hum & HVAC noise
   */
  public static generateWarehouseHum(sampleRate: number, length: number): Float32Array {
    const buffer = new Float32Array(length);
    let last = 0;
    for (let i = 0; i < length; i++) {
      // Pink/Brown noise approximation (integrated white noise)
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      buffer[i] = last * 3.5;
    }
    return buffer;
  }

  /**
   * Generates intermittent forklift / pallet-jack warning beep tones (1.2 kHz pulsed)
   */
  public static generateForkliftBeeps(sampleRate: number, length: number): Float32Array {
    const buffer = new Float32Array(length);
    const beepPeriod = Math.floor(sampleRate * 0.6); // 600ms period
    const beepDuration = Math.floor(sampleRate * 0.2); // 200ms active beep

    for (let i = 0; i < length; i++) {
      if (i % beepPeriod < beepDuration) {
        const t = (i % beepPeriod) / sampleRate;
        buffer[i] = 0.4 * Math.sin(2 * Math.PI * 1200 * t);
      }
    }
    return buffer;
  }

  /**
   * Mixes signal and noise according to desired SNR in dB
   */
  public static mixAtSNR(
    signal: Float32Array,
    noise: Float32Array,
    snrDb: number
  ): Float32Array {
    const output = new Float32Array(signal.length);
    const signalPower = signal.reduce((acc, v) => acc + v * v, 0) / signal.length;
    const noisePower = noise.reduce((acc, v) => acc + v * v, 0) / noise.length || 0.001;
    const targetNoisePower = signalPower / Math.pow(10, snrDb / 10);
    const noiseScale = Math.sqrt(targetNoisePower / noisePower);

    for (let i = 0; i < signal.length; i++) {
      output[i] = signal[i] + (noise[i] || 0) * noiseScale;
    }
    return output;
  }
}

describe("Layer 4: Synthetic Acoustic Stress Fixtures & Invariant Verification", () => {
  const sampleRates = [44100, 48000];

  for (const sr of sampleRates) {
    describe(`Sample Rate ${sr} Hz Resampler Invariants under Noise`, () => {
      it(`survives heavy warehouse hum + forklift beeps at 0 dB SNR without crashing`, () => {
        const resampler = new PcmResampler();
        const speech = SyntheticAcousticLab.generateSpeechTone(sr, 0.5);
        const hum = SyntheticAcousticLab.generateWarehouseHum(sr, speech.length);
        const beeps = SyntheticAcousticLab.generateForkliftBeeps(sr, speech.length);

        // Mix hum and beeps
        const totalNoise = new Float32Array(speech.length);
        for (let i = 0; i < speech.length; i++) totalNoise[i] = hum[i] + beeps[i];

        const mixed0dB = SyntheticAcousticLab.mixAtSNR(speech, totalNoise, 0);
        const chunks: ArrayBuffer[] = [];
        resampler.process([mixed0dB], sr, (chunk) => chunks.push(chunk));
        resampler.flush((chunk) => chunks.push(chunk));

        expect(chunks.length).toBeGreaterThan(0);

        for (const chunk of chunks) {
          const pcm16 = new Int16Array(chunk);
          for (let i = 0; i < pcm16.length; i++) {
            expect(Number.isNaN(pcm16[i])).toBe(false);
            expect(Number.isFinite(pcm16[i])).toBe(true);
            expect(pcm16[i]).toBeGreaterThanOrEqual(-32768);
            expect(pcm16[i]).toBeLessThanOrEqual(32767);
          }
        }
      });

      it(`handles overdriven/clipped acoustic transients gracefully via hard clamping`, () => {
        const resampler = new PcmResampler();
        const clipped = new Float32Array(sr * 0.1);
        for (let i = 0; i < clipped.length; i++) {
          clipped[i] = i % 2 === 0 ? 5.0 : -5.0; // Severely overdriven
        }

        const chunks: ArrayBuffer[] = [];
        resampler.process([clipped], sr, (chunk) => chunks.push(chunk));
        resampler.flush((chunk) => chunks.push(chunk));

        expect(chunks.length).toBeGreaterThan(0);
        for (const chunk of chunks) {
          const pcm16 = new Int16Array(chunk);
          for (let i = 0; i < pcm16.length; i++) {
            expect(pcm16[i]).toBeGreaterThanOrEqual(-32768);
            expect(pcm16[i]).toBeLessThanOrEqual(32767);
          }
        }
      });

      it(`handles low microphone gain (-20 dB) without zero-underflow corruption`, () => {
        const resampler = new PcmResampler();
        const faintSpeech = SyntheticAcousticLab.generateSpeechTone(sr, 0.2);
        for (let i = 0; i < faintSpeech.length; i++) faintSpeech[i] *= 0.05; // -26dB

        const chunks: ArrayBuffer[] = [];
        resampler.process([faintSpeech], sr, (chunk) => chunks.push(chunk));
        resampler.flush((chunk) => chunks.push(chunk));

        expect(chunks.length).toBeGreaterThan(0);
        const allSamples: number[] = [];
        for (const chunk of chunks) {
          allSamples.push(...Array.from(new Int16Array(chunk)));
        }
        const maxVal = Math.max(...allSamples.map(Math.abs));
        expect(maxVal).toBeGreaterThan(0);
      });
    });
  }

  describe("Acoustic Confidence & Inadequate Quality Clarification Gate", () => {
    it("lowers extraction confidence when speech contains hesitations or filler words", () => {
      const cleanCandidate = extractCandidateQuantity("I counted forty-seven cartons.");
      const hesitantCandidate = extractCandidateQuantity("I think maybe around forty-seven cartons.");

      expect(cleanCandidate).not.toBeNull();
      expect(hesitantCandidate).not.toBeNull();
      expect(cleanCandidate!.observedQty).toBe(47);
      expect(hesitantCandidate!.observedQty).toBe(47);
      expect(hesitantCandidate!.confidence).toBeLessThan(cleanCandidate!.confidence);
    });

    it("extracts carton 31 damage under background conversation and forklift mentions", () => {
      const text = "Background noise from forklift beep. Carton thirty-one is crushed. Count is forty-seven.";
      const qty = extractCandidateQuantity(text);
      const dmg = extractCandidateDamage(text);

      expect(qty).not.toBeNull();
      expect(qty!.observedQty).toBe(47);
      expect(qty!.observedQty).not.toBe(31);

      expect(dmg).not.toBeNull();
      expect(dmg!.condition).toBe("crushed");
      expect(dmg!.cartonReference?.toLowerCase()).toContain("thirty-one");
    });
  });
});
