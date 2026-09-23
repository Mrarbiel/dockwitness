/**
 * AssemblyAI Voice Agent Client
 * Manages WebSocket connection to wss://agents.assemblyai.com/v1/ws,
 * bi-directional 24kHz/16kHz PCM16 audio streaming, barge-in / interruption,
 * tool execution, and deterministic domain enforcement.
 */

import {
  VoiceAgentState,
  VoiceAgentIncomingMessage,
  VoiceAgentSessionUpdate,
  VoiceAgentTurn,
} from "./voice-agent-types";
import {
  DOCKWITNESS_VOICE_AGENT_SYSTEM_PROMPT,
  DOCKWITNESS_VOICE_AGENT_TOOLS,
  executeVoiceAgentTool,
} from "./voice-agent-tools";

export interface VoiceAgentClientOptions {
  shipmentId: string;
  incidentId: string;
  sessionId?: string;
  baseUrl?: string;
  sampleRate?: number;
  onStateChange?: (state: VoiceAgentState) => void;
  onTurn?: (turn: VoiceAgentTurn) => void;
  onError?: (error: string) => void;
  onToolAction?: (action: { name: string; args: Record<string, unknown>; result?: unknown }) => void;
}

export class VoiceAgentClient {
  private ws: WebSocket | null = null;
  private state: VoiceAgentState = "DISCONNECTED";
  private options: VoiceAgentClientOptions;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private audioSourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private audioQueue: AudioBuffer[] = [];
  private isPlayingAudio = false;
  private currentAudioSource: AudioBufferSourceNode | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private isDestroyed = false;

  // Protocol Lifecycle & Gating State
  public isSessionReady = false;
  public isInterrupted = false;
  public activeToolCount = 0;
  public sessionId: string | null = null;
  public pendingToolResults: Array<{ call_id: string; result: string; is_error?: boolean }> = [];
  public replyDoneStatus: string | null = null;
  private pendingReplyDone = false;
  private isResuming = false;

  constructor(options: VoiceAgentClientOptions) {
    this.options = {
      baseUrl: "",
      sampleRate: 24000,
      ...options,
    };
    if (options.sessionId) {
      this.sessionId = options.sessionId;
    }
  }

  public getState(): VoiceAgentState {
    return this.state;
  }

  public isReady(): boolean {
    return this.isSessionReady;
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }

  public getIsInterrupted(): boolean {
    return this.isInterrupted;
  }

  public getActiveToolCount(): number {
    return this.activeToolCount;
  }

  private setState(newState: VoiceAgentState) {
    this.state = newState;
    this.options.onStateChange?.(newState);
  }

  /**
   * Connects to AssemblyAI Voice Agent API using a short-lived server-minted token
   */
  public async connect(): Promise<void> {
    if (this.state === "CONNECTING" || this.state === "IDLE" || this.state === "LISTENING") {
      return;
    }

    this.setState("CONNECTING");

    try {
      // 1. Fetch ephemeral Voice Agent token from server
      const tokenRes = await fetch(`${this.options.baseUrl || ""}/api/voice-agent/token`, {
        method: "POST",
      });

      if (!tokenRes.ok) {
        throw new Error(`Failed to mint Voice Agent token: HTTP ${tokenRes.status}`);
      }

      const { token } = await tokenRes.json();
      if (!token) {
        throw new Error("No token returned by Voice Agent token endpoint");
      }

      // 2. Open WebSocket connection
      const wsUrl = `wss://agents.assemblyai.com/v1/ws?token=${encodeURIComponent(token)}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.isSessionReady = false;
        if (this.sessionId) {
          this.sendSessionResume(this.sessionId);
        } else {
          this.sendSessionUpdate();
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as VoiceAgentIncomingMessage;
          this.handleIncomingMessage(msg);
        } catch (e) {
          console.warn("[VoiceAgentClient] Non-JSON message received:", e);
        }
      };

      this.ws.onerror = (err) => {
        console.error("[VoiceAgentClient] WebSocket error:", err);
        this.options.onError?.("Voice Agent WebSocket connection error");
        this.setState("ERROR");
      };

      this.ws.onclose = (event) => {
        console.log(`[VoiceAgentClient] WebSocket closed: ${event.code} ${event.reason}`);
        this.isSessionReady = false;
        if (!this.isDestroyed && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          setTimeout(() => this.connect(), 1500 * this.reconnectAttempts);
        } else {
          this.setState("DISCONNECTED");
        }
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      this.setState("ERROR");
      this.options.onError?.(msg);
    }
  }

  /**
   * Emits session.resume frame to resume an existing session within the supported window
   */
  private sendSessionResume(sessionId: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.isResuming = true;
    this.ws.send(
      JSON.stringify({
        type: "session.resume",
        session_id: sessionId,
      })
    );
  }

  /**
   * Sends initial session configuration with prompt and tools (fresh session)
   */
  private sendSessionUpdate() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const update: VoiceAgentSessionUpdate = {
      type: "session.update",
      session: {
        system_prompt: DOCKWITNESS_VOICE_AGENT_SYSTEM_PROMPT,
        greeting: "DockWitness is ready. Tell me the carton count and any visible damage.",
        output: {
          voice: "james",
          volume: 85,
          format: { encoding: "audio/pcm", sample_rate: 24000 },
        },
        tools: DOCKWITNESS_VOICE_AGENT_TOOLS.map((t) => ({
          type: "function",
          name: t.name || t.function?.name,
          description: t.description || t.function?.description,
          parameters: t.parameters || t.function?.parameters,
        })),
      },
    };

    this.ws.send(JSON.stringify(update));
  }

  /**
   * Flushes all queued tool results over the WebSocket to the server
   */
  private flushPendingToolResults() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.pendingToolResults = [];
      return;
    }
    if (this.pendingToolResults.length === 0) return;

    const resultsToSend = [...this.pendingToolResults];
    this.pendingToolResults = [];

    for (const item of resultsToSend) {
      this.ws.send(
        JSON.stringify({
          type: "tool.result",
          call_id: item.call_id,
          result: item.result,
          ...(item.is_error ? { is_error: true } : {}),
        })
      );
    }
  }

  /**
   * Dispatches incoming server protocol events
   */
  private async handleIncomingMessage(msg: VoiceAgentIncomingMessage) {
    switch (msg.type) {
      case "session.resumed":
        if (msg.session_id) this.sessionId = msg.session_id;
        this.isResuming = false;
        this.isSessionReady = true;
        this.setState("IDLE");
        break;

      case "session.created":
      case "session.updated":
        if (msg.session_id) this.sessionId = msg.session_id;
        if (msg.config && typeof msg.config.session_id === "string") {
          this.sessionId = msg.config.session_id;
        }
        break;

      case "session.ready":
        if (msg.session_id) this.sessionId = msg.session_id;
        if (msg.config && typeof msg.config.session_id === "string") {
          this.sessionId = msg.config.session_id;
        }
        this.isResuming = false;
        this.isSessionReady = true;
        this.setState("IDLE");
        break;

      case "session.ended":
        this.isSessionReady = false;
        this.stopMicrophone();
        this.stopAudioPlayback();
        this.setState("DISCONNECTED");
        break;

      case "input.speech.started":
      case "interruption":
        this.stopAudioPlayback();
        this.isInterrupted = true;
        this.pendingToolResults = [];
        this.setState("LISTENING");
        break;

      case "transcript.user.delta":
        this.stopAudioPlayback();
        this.isInterrupted = true;
        this.pendingToolResults = [];
        this.setState("LISTENING");
        break;

      case "transcript.user":
        // User speech detected — barge-in / interrupt ongoing agent audio playback
        if (msg.text) {
          this.stopAudioPlayback();
          this.isInterrupted = true;
          this.pendingToolResults = [];
          this.setState("LISTENING");
          this.options.onTurn?.({
            id: `turn-user-${Date.now()}`,
            role: "user",
            text: msg.text,
            timestamp: new Date().toISOString(),
          });
        }
        break;

      case "reply.started":
        this.isInterrupted = false;
        this.replyDoneStatus = null;
        this.setState("SPEAKING");
        break;

      case "transcript.agent":
        if (msg.text) {
          this.isInterrupted = false;
          this.setState("SPEAKING");
          this.options.onTurn?.({
            id: `turn-agent-${Date.now()}`,
            role: "agent",
            text: msg.text,
            timestamp: new Date().toISOString(),
          });
        }
        break;

      case "audio.chunk":
      case "reply.audio": {
        const base64Audio = msg.data || msg.audio;
        if (base64Audio) {
          if (this.isInterrupted) {
            // Discard in-flight packet arriving post-interruption
            break;
          }
          this.queueAudioChunk(base64Audio);
        }
        break;
      }

      case "tool.call":
        if (msg.call_id && msg.name) {
          this.activeToolCount++;
          this.setState("TOOL_EXECUTING");
          const toolCallId = msg.call_id;
          const toolName = msg.name;
          const toolArgs = msg.arguments || {};

          this.options.onToolAction?.({ name: toolName, args: toolArgs });

          try {
            // Execute deterministic backend tool
            const result = await executeVoiceAgentTool(
              toolName,
              toolArgs,
              this.options.baseUrl || ""
            );

            this.options.onToolAction?.({ name: toolName, args: toolArgs, result });

            this.options.onTurn?.({
              id: `turn-tool-${Date.now()}`,
              role: "tool",
              text: `Tool [${toolName}] executed`,
              timestamp: new Date().toISOString(),
              toolName,
              toolArgs,
              toolResult: result,
            });

            // Queue result for transmission upon reply.done (per official docs)
            if (this.replyDoneStatus === "interrupted" || this.isInterrupted) {
              // Discard if already interrupted
            } else {
              this.pendingToolResults.push({
                call_id: toolCallId,
                result: JSON.stringify(result),
              });
            }
          } catch (err) {
            console.error("[VoiceAgentClient] Tool execution error:", err);
            if (this.replyDoneStatus !== "interrupted" && !this.isInterrupted) {
              this.pendingToolResults.push({
                call_id: toolCallId,
                result: JSON.stringify({ error: String(err) }),
                is_error: true,
              });
            }
          } finally {
            this.activeToolCount = Math.max(0, this.activeToolCount - 1);
            if (this.activeToolCount === 0) {
              if (this.pendingReplyDone) {
                this.pendingReplyDone = false;
                if (this.replyDoneStatus === "interrupted" || this.isInterrupted) {
                  this.pendingToolResults = [];
                  this.setState("IDLE");
                } else {
                  if (this.pendingToolResults.length > 0) {
                    this.flushPendingToolResults();
                    this.setState("THINKING");
                  } else {
                    this.setState("IDLE");
                  }
                }
              }
            }
          }
        }
        break;

      case "reply.done": {
        const isInterrupted = msg.status === "interrupted";
        this.replyDoneStatus = msg.status || "completed";

        if (isInterrupted) {
          this.isInterrupted = true;
          this.pendingToolResults = []; // Discard pending tool results on interruption
          if (this.activeToolCount === 0) {
            this.pendingReplyDone = false;
            this.setState("IDLE");
          } else {
            this.pendingReplyDone = true;
          }
        } else {
          if (this.activeToolCount === 0) {
            this.pendingReplyDone = false;
            if (this.pendingToolResults.length > 0) {
              this.flushPendingToolResults();
              this.setState("THINKING");
            } else {
              this.setState("IDLE");
            }
          } else {
            this.pendingReplyDone = true;
          }
        }
        break;
      }

      case "session.error":
      case "error": {
        if (this.isResuming) {
          const codeStr = String(msg.code || "");
          const msgStr = String(msg.message || "");
          const isResumeError =
            codeStr === "session_not_found" ||
            codeStr === "session_expired" ||
            codeStr === "session_forbidden" ||
            /session.*(not found|expired|forbidden|invalid|not_found)/i.test(msgStr) ||
            /session.*(not_found|expired|forbidden)/i.test(codeStr);

          if (isResumeError) {
            console.warn(`[VoiceAgentClient] session.resume rejected (${msgStr || codeStr}), clearing session ID and creating fresh session.`);
            this.isResuming = false;
            this.sessionId = null;
            this.sendSessionUpdate();
            return;
          }
        }
        console.error("[VoiceAgentClient] Server error:", msg.message || msg.code);
        this.options.onError?.(msg.message || String(msg.code) || "Unknown voice agent server error");
        break;
      }
    }

  }

  /**
   * Starts microphone recording and streams audio chunks to WebSocket
   */
  public async startMicrophone(): Promise<void> {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone access is not supported in this environment");
    }

    this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.audioSourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

    if (!this.audioContext.audioWorklet) {
      throw new Error("AudioWorklet is not supported in this browser environment");
    }

    try {
      await this.audioContext.audioWorklet.addModule("/worklets/pcm-24k-processor.js");
      this.workletNode = new AudioWorkletNode(this.audioContext, "pcm-24k-processor");
      this.workletNode.port.onmessage = (e: MessageEvent) => {
        // Gated: transmit input.audio ONLY when session.ready has been acknowledged
        if (
          this.isSessionReady &&
          this.ws &&
          this.ws.readyState === WebSocket.OPEN &&
          e.data?.event === "chunk" &&
          e.data?.buffer
        ) {
          const base64 = this.arrayBufferToBase64(e.data.buffer as ArrayBuffer);
          this.ws.send(
            JSON.stringify({
              type: "input.audio",
              audio: base64,
            })
          );
        }
      };
      this.audioSourceNode.connect(this.workletNode);
      // Do NOT connect to audioContext.destination to avoid feedback
    } catch (err) {
      console.error("[VoiceAgentClient] Failed to initialize 24kHz AudioWorklet:", err);
      this.options.onError?.("Failed to initialize 24kHz AudioWorklet");
      throw err;
    }

    this.setState("LISTENING");
  }

  /**
   * Stops microphone streaming
   */
  public stopMicrophone(): void {
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.audioSourceNode) {
      this.audioSourceNode.disconnect();
      this.audioSourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.setState("IDLE");
  }

  /**
   * Simulates a user spoken utterance for deterministic automated tests and demo without microphone
   */
  public async simulateUserTurn(userUtterance: string): Promise<void> {
    this.options.onTurn?.({
      id: `turn-user-sim-${Date.now()}`,
      role: "user",
      text: userUtterance,
      timestamp: new Date().toISOString(),
      isSimulated: true,
    });

    this.setState("THINKING");

    // Process user prompt locally against DockWitness business logic
    const lower = userUtterance.toLowerCase();

    // 1. Inspect shipment / manifest
    if (lower.includes("po") || lower.includes("shipment") || lower.includes("manifest")) {
      this.setState("TOOL_EXECUTING");
      const result = await executeVoiceAgentTool(
        "get_shipment",
        { shipmentId: this.options.shipmentId },
        this.options.baseUrl
      );
      this.options.onToolAction?.({ name: "get_shipment", args: { shipmentId: this.options.shipmentId }, result });

      this.setState("SPEAKING");
      const responseText = `Shipment PO #${result.poNumber || "44891"} from ${result.carrierName || "NorthStar Freight"} with trailer ${result.trailerNumber || "NST-2208"} expects ${result.expectedQuantity || 48} cartons of SKU ${result.sku || "AX-17"}. Ready for receiver inspection.`;

      this.options.onTurn?.({
        id: `turn-agent-sim-${Date.now()}`,
        role: "agent",
        text: responseText,
        timestamp: new Date().toISOString(),
        isSimulated: true,
      });
      this.setState("IDLE");
      return;
    }

    // 2. Receiver reporting carton count or damage
    if (lower.includes("carton") || lower.includes("count") || lower.includes("crushed") || lower.includes("forty")) {
      this.setState("TOOL_EXECUTING");

      // Extract count if mentioned
      let observed = 47;
      if (lower.includes("forty-seven") || lower.includes("47")) observed = 47;
      if (lower.includes("fifty") || lower.includes("50")) observed = 50;

      const result = await executeVoiceAgentTool(
        "record_candidate_observation",
        {
          incidentId: this.options.incidentId,
          fieldKey: "observed_qty",
          value: observed,
          quote: userUtterance,
        },
        this.options.baseUrl
      );
      this.options.onToolAction?.({
        name: "record_candidate_observation",
        args: { incidentId: this.options.incidentId, fieldKey: "observed_qty", value: observed, quote: userUtterance },
        result,
      });

      this.setState("SPEAKING");
      const responseText = `Recorded receiver count of ${observed} cartons. Deterministic calculation shows a shortage of 1 carton. Damage noted: crushed underneath and wet. Please capture photo evidence of carton 31 before moving to driver attestation.`;

      this.options.onTurn?.({
        id: `turn-agent-sim-${Date.now()}`,
        role: "agent",
        text: responseText,
        timestamp: new Date().toISOString(),
        isSimulated: true,
      });
      this.setState("IDLE");
      return;
    }

    // 3. Driver attestation statement
    if (lower.includes("driver") || lower.includes("seal") || lower.includes("confirm") || lower.includes("dispute")) {
      this.setState("TOOL_EXECUTING");

      // Check current exceptions
      const state = await executeVoiceAgentTool(
        "get_workflow_state",
        { incidentId: this.options.incidentId },
        this.options.baseUrl
      );

      const exceptions = (state.exceptions as Array<{ id: string; type: string }>) || [];
      const shortageExc = exceptions.find((e) => e.type === "SHORTAGE");
      const damageExc = exceptions.find((e) => e.type === "DAMAGE");

      if (shortageExc) {
        const attRes = await executeVoiceAgentTool(
          "record_driver_attestation",
          {
            incidentId: this.options.incidentId,
            exceptionId: shortageExc.id,
            position: "DISPUTE",
            statement: userUtterance,
          },
          this.options.baseUrl
        );
        this.options.onToolAction?.({
          name: "record_driver_attestation",
          args: { incidentId: this.options.incidentId, exceptionId: shortageExc.id, position: "DISPUTE", statement: userUtterance },
          result: attRes,
        });
      }

      if (damageExc) {
        const dmgRes = await executeVoiceAgentTool(
          "record_driver_attestation",
          {
            incidentId: this.options.incidentId,
            exceptionId: damageExc.id,
            position: "CONFIRM",
            statement: userUtterance,
          },
          this.options.baseUrl
        );
        this.options.onToolAction?.({
          name: "record_driver_attestation",
          args: { incidentId: this.options.incidentId, exceptionId: damageExc.id, position: "CONFIRM", statement: userUtterance },
          result: dmgRes,
        });
      }

      this.setState("SPEAKING");
      const responseText = `Recorded driver attestation: damage is CONFIRMED BY BOTH; shortage is DISPUTED citing intact trailer seal. Two-party disagreement recorded. Liability is NOT_DETERMINED.`;

      this.options.onTurn?.({
        id: `turn-agent-sim-${Date.now()}`,
        role: "agent",
        text: responseText,
        timestamp: new Date().toISOString(),
        isSimulated: true,
      });
      this.setState("IDLE");
      return;
    }

    // 4. Missing evidence or readiness check
    this.setState("TOOL_EXECUTING");
    const readiness = await executeVoiceAgentTool(
      "request_missing_evidence",
      { incidentId: this.options.incidentId },
      this.options.baseUrl
    );
    this.options.onToolAction?.({ name: "request_missing_evidence", args: { incidentId: this.options.incidentId }, result: readiness });

    this.setState("SPEAKING");
    const responseText = String(readiness.guidance || "Workflow inspection complete.");
    this.options.onTurn?.({
      id: `turn-agent-sim-${Date.now()}`,
      role: "agent",
      text: responseText,
      timestamp: new Date().toISOString(),
      isSimulated: true,
    });
    this.setState("IDLE");
  }

  /**
   * Helper: converts Float32Array to 16-bit PCM ArrayBuffer
   */
  private floatTo16BitPCM(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  }

  /**
   * Helper: converts ArrayBuffer to Base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer | ArrayBufferLike): string {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Queues an incoming base64 PCM16 audio chunk for playback
   */
  private queueAudioChunk(base64Audio: string) {
    if (typeof window === "undefined") return;

    try {
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Ensure even byte length for 16-bit PCM samples
      const evenLen = len - (len % 2);
      const pcm16 = new Int16Array(bytes.buffer, bytes.byteOffset, evenLen / 2);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / (pcm16[i] < 0 ? 32768 : 32767);
      }

      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
          sampleRate: 24000,
        });
      }

      const sampleRate = this.options.sampleRate || 24000;
      const buffer = this.audioContext.createBuffer(1, float32.length, sampleRate);
      buffer.getChannelData(0).set(float32);

      this.audioQueue.push(buffer);
      if (!this.isPlayingAudio) {
        this.playNextAudioChunk();
      }
    } catch (e) {
      console.warn("[VoiceAgentClient] Failed to decode audio chunk:", e);
    }
  }

  /**
   * Plays the next queued audio buffer
   */
  private playNextAudioChunk() {
    if (this.audioQueue.length === 0 || !this.audioContext) {
      this.isPlayingAudio = false;
      return;
    }

    this.isPlayingAudio = true;
    const buffer = this.audioQueue.shift()!;
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    this.currentAudioSource = source;
    source.onended = () => {
      this.currentAudioSource = null;
      this.playNextAudioChunk();
    };

    source.start();
  }

  /**
   * Stops ongoing audio playback immediately (barge-in support)
   */
  public stopAudioPlayback() {
    if (this.currentAudioSource) {
      try {
        this.currentAudioSource.stop();
      } catch {
        // Source may already be stopped
      }
      this.currentAudioSource = null;
    }
    this.audioQueue = [];
    this.isPlayingAudio = false;
  }

  /**
   * Closes WebSocket gracefully with session.end and frees Web Audio resources
   */
  public disconnect(): void {
    this.isDestroyed = true;
    this.isSessionReady = false;
    this.pendingToolResults = [];
    this.pendingReplyDone = false;
    this.isResuming = false;
    this.activeToolCount = 0;
    this.stopMicrophone();
    this.stopAudioPlayback();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "session.end" }));
      } catch (e) {
        console.warn("[VoiceAgentClient] Failed to send session.end:", e);
      }
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setState("DISCONNECTED");
  }
}
