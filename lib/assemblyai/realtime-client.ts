import {
  AAI_STREAMING_WS_URL,
  ClientConnectionState,
  RealtimeClientOptions,
  WordTiming,
} from "./types";

export class AssemblyAIRealtimeClient {
  private ws: WebSocket | null = null;
  private state: ClientConnectionState = "idle";
  private options: RealtimeClientOptions;
  private lastAudioSentTime: number = 0;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private isTerminating = false;

  constructor(options: RealtimeClientOptions = {}) {
    this.options = {
      tokenUrl: "/api/aai/token",
      speechModel: "universal-3-5-pro",
      sampleRate: 16000,
      inactivityTimeoutMs: 120000,
      ...options,
    };
  }

  public getState(): ClientConnectionState {
    return this.state;
  }

  private setState(newState: ClientConnectionState) {
    if (this.state !== newState) {
      this.state = newState;
      this.options.onStateChange?.(newState);
    }
  }

  /**
   * Connect to AssemblyAI v3 Realtime WebSocket.
   */
  public async connect(): Promise<void> {
    if (this.state === "connecting" || this.state === "connected") {
      return;
    }

    this.isTerminating = false;
    this.setState("connecting");

    try {
      let token = this.options.token;

      // Mint ephemeral token if not explicitly provided
      if (!token) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        let tokenRes: Response;
        try {
          tokenRes = await fetch(this.options.tokenUrl || "/api/aai/token", {
            method: "POST",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (!tokenRes.ok) {
          const errData = await tokenRes.json().catch(() => ({ error: "Token fetch failed" }));
          throw new Error(errData.error || `HTTP ${tokenRes.status} fetching token`);
        }

        const data = (await tokenRes.json()) as { token: string };
        if (!data.token) {
          throw new Error("Received empty token from server");
        }
        token = data.token;
      }

      // Construct AssemblyAI v3 Streaming URL
      const wsUrl = new URL(AAI_STREAMING_WS_URL);
      wsUrl.searchParams.set("token", token);
      wsUrl.searchParams.set("speech_model", this.options.speechModel || "universal-3-5-pro");
      wsUrl.searchParams.set("sample_rate", String(this.options.sampleRate || 16000));
      wsUrl.searchParams.set("encoding", "pcm_s16le");

      if (this.options.voiceFocus) {
        wsUrl.searchParams.set("voice_focus", this.options.voiceFocus);
      }
      if (this.options.speakerLabels) {
        wsUrl.searchParams.set("speaker_labels", "true");
      }

      const keyterms = this.options.keytermsPrompt || this.options.wordBoost;
      if (keyterms && keyterms.length > 0) {
        const sanitized = Array.from(
          new Set(
            keyterms
              .map((t) => t.trim())
              .filter((t) => t.length > 0 && t.length <= 50)
          )
        ).slice(0, 100);
        if (sanitized.length > 0) {
          wsUrl.searchParams.set("keyterms_prompt", JSON.stringify(sanitized));
        }
      }

      const socket = new WebSocket(wsUrl.toString());
      socket.binaryType = "arraybuffer";
      this.ws = socket;

      await new Promise<void>((resolve, reject) => {
        let opened = false;
        const connectTimeout = setTimeout(() => {
          if (!opened) {
            try { socket.close(); } catch {}
            reject(new Error("WebSocket connection to AssemblyAI timed out (8s)"));
          }
        }, 8000);

        socket.onopen = () => {
          opened = true;
          clearTimeout(connectTimeout);
          this.resetWatchdog();
          resolve();
        };

        socket.onmessage = (event: MessageEvent) => {
          this.handleMessage(event.data);
        };

        socket.onerror = (event: Event) => {
          clearTimeout(connectTimeout);
          const errorMsg = (event as any).message || "WebSocket connection error";
          const err = new Error(errorMsg);
          this.options.onError?.(err);
          if (!opened) {
            reject(err);
          }
        };

        socket.onclose = (event: CloseEvent) => {
          clearTimeout(connectTimeout);
          this.clearWatchdog();
          this.ws = null;
          if (!this.isTerminating && this.state !== "idle") {
            if (event.code !== 1000) {
              const err = new Error(
                `WebSocket closed unexpectedly with code ${event.code}: ${event.reason || "no reason"}`
              );
              this.options.onError?.(err);
              this.setState("error");
              if (!opened) {
                reject(err);
              }
              return;
            }
          }
          this.setState("idle");
        };
      });
    } catch (err: unknown) {
      this.clearWatchdog();
      this.setState("error");
      const error = err instanceof Error ? err : new Error(String(err));
      this.options.onError?.(error);
      throw error;
    }
  }

  /**
   * Handle incoming WebSocket message (JSON text).
   */
  private handleMessage(data: any) {
    if (typeof data !== "string") return;

    try {
      const msg = JSON.parse(data);

      switch (msg.type) {
        case "Begin": {
          this.setState("connected");
          const sessionId = msg.id || msg.session_id || "";
          this.options.onSessionBegin?.(sessionId);
          this.resetWatchdog();
          break;
        }

        case "Turn": {
          this.resetWatchdog();
          const transcript = (msg.transcript || msg.text || "").trim();
          const words: WordTiming[] = Array.isArray(msg.words)
            ? msg.words.map((w: any) => ({
                text: w.text,
                start: w.start,
                end: w.end,
                confidence: w.confidence,
                word_is_final: w.word_is_final,
                speaker: w.speaker,
              }))
            : [];

          const latencyMs = this.lastAudioSentTime ? Date.now() - this.lastAudioSentTime : undefined;
          if (msg.end_of_turn) {
            this.options.onFinalTranscript?.(transcript, words, latencyMs);
          } else {
            this.options.onPartialTranscript?.(transcript, words, latencyMs);
          }
          break;
        }

        case "Termination": {
          this.clearWatchdog();
          this.options.onSessionTerminated?.({
            audioDurationSeconds: msg.audio_duration_seconds,
            sessionDurationSeconds: msg.session_duration_seconds,
          });
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close(1000, "Normal Closure");
          }
          break;
        }

        case "Error": {
          const errMsg = msg.error || "Unknown AssemblyAI error";
          this.options.onError?.(new Error(errMsg));
          break;
        }

        default:
          break;
      }
    } catch {
      // Non-JSON message, ignore
    }
  }

  /**
   * Stream raw 16kHz PCM16 ArrayBuffer chunk over WebSocket.
   */
  public sendAudio(chunk: ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.resetWatchdog();
    this.ws.send(chunk);
    this.lastAudioSentTime = Date.now();
  }

  /**
   * Stop session gracefully by sending {"type": "Terminate"}.
   */
  public async stop(): Promise<void> {
    this.isTerminating = true;
    this.clearWatchdog();

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        try {
          this.setState("terminating");
          this.ws.send(JSON.stringify({ type: "Terminate" }));
        } catch {
          // Socket write failed, force close
          this.ws.close(1000, "Terminated");
        }
      } else if (this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
    }

    this.setState("idle");
  }

  /**
   * 120-Second Inactivity Watchdog to prevent runaway billing.
   */
  private resetWatchdog() {
    this.clearWatchdog();
    const timeout = this.options.inactivityTimeoutMs || 120000;
    this.watchdogTimer = setTimeout(() => {
      this.options.onError?.(new Error("Inactivity watchdog triggered (120s without activity)"));
      this.stop();
    }, timeout);
  }

  private clearWatchdog() {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }
}
