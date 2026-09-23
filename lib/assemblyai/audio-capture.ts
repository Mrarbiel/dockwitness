/**
 * Browser Audio Capture Manager for AssemblyAI Streaming.
 * Manages getUserMedia, AudioContext, AudioWorklet lifecycle, AnalyserNode, and safe teardown.
 */

export interface AudioCaptureCallbacks {
  onAudioChunk: (chunk: ArrayBuffer) => void;
  onError?: (error: Error) => void;
  onStateChange?: (state: AudioCaptureState) => void;
}

export type AudioCaptureState = "idle" | "requesting" | "recording" | "error";

export class BrowserAudioCaptureManager {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private callbacks: AudioCaptureCallbacks;
  private state: AudioCaptureState = "idle";

  constructor(callbacks: AudioCaptureCallbacks) {
    this.callbacks = callbacks;
  }

  public getState(): AudioCaptureState {
    return this.state;
  }

  public getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode;
  }

  private setState(state: AudioCaptureState) {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  /**
   * Start microphone capture and stream 16kHz PCM16 chunks via AudioWorklet.
   */
  public async start(): Promise<void> {
    if (this.state === "recording" || this.state === "requesting") return;

    this.setState("requesting");

    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia is not supported in this browser environment");
      }

      // 1. Acquire microphone with warehouse dock DSP constraints
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });

      // 2. Initialize AudioContext at native hardware sample rate
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();

      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      // 3. Load AudioWorkletProcessor module from public/worklets
      await this.audioContext.audioWorklet.addModule("/worklets/pcm-processor.js");

      // 4. Create graph nodes
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.workletNode = new AudioWorkletNode(this.audioContext, "pcm-processor");

      // 5. Create AnalyserNode for LED/VU visualizer
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 64;
      this.analyserNode.smoothingTimeConstant = 0.8;

      // 6. Handle audio chunks from audio thread
      this.workletNode.port.onmessage = (event: MessageEvent) => {
        if (event.data?.event === "chunk" && event.data?.buffer) {
          this.callbacks.onAudioChunk(event.data.buffer as ArrayBuffer);
        }
      };

      // 7. Connect source -> worklet & source -> analyser
      // CRITICAL: NEVER connect worklet to audioContext.destination (prevents acoustic howl)
      this.sourceNode.connect(this.workletNode);
      this.sourceNode.connect(this.analyserNode);

      this.setState("recording");
    } catch (err: unknown) {
      await this.stop();
      this.setState("error");
      const userError = this.formatAudioError(err);
      this.callbacks.onError?.(userError);
      throw userError;
    }
  }

  /**
   * Safe 5-step teardown: flushes remaining buffer, stops hardware tracks, closes AudioContext.
   * Completely eradicates zombie red microphone indicators in browser.
   */
  public async stop(): Promise<void> {
    try {
      // 1. Flush any remaining buffer in worklet and disconnect
      if (this.workletNode) {
        try {
          this.workletNode.port.postMessage({ command: "flush" });
        } catch {
          // Ignore
        }
        this.workletNode.port.onmessage = null;
        this.workletNode.disconnect();
      }

      // 2. Disconnect source node and analyser
      if (this.sourceNode) {
        this.sourceNode.disconnect();
      }
      if (this.analyserNode) {
        this.analyserNode.disconnect();
      }

      // 3. STOP ALL TRACKS (This turns off the browser red mic icon)
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
      }

      // 4. Close AudioContext
      if (this.audioContext && this.audioContext.state !== "closed") {
        await this.audioContext.close();
      }
    } catch (err) {
      console.warn("Error during audio pipeline teardown:", err);
    } finally {
      this.audioContext = null;
      this.mediaStream = null;
      this.sourceNode = null;
      this.workletNode = null;
      this.analyserNode = null;
      this.setState("idle");
    }
  }

  private formatAudioError(err: unknown): Error {
    const errorObj = err as { name?: string; message?: string };
    if (errorObj?.name === "NotAllowedError" || errorObj?.name === "PermissionDeniedError") {
      return new Error(
        "Microphone permission was denied. Please allow microphone access in your browser address bar or use 'Simulate Scenario Audio'."
      );
    }
    if (errorObj?.name === "NotFoundError" || errorObj?.name === "DevicesNotFoundError") {
      return new Error("No microphone was detected on this device. Please connect an audio input.");
    }
    if (errorObj?.name === "NotReadableError" || errorObj?.name === "TrackStartError") {
      return new Error("Microphone is currently in use by another application.");
    }
    return err instanceof Error ? err : new Error(String(err));
  }
}
