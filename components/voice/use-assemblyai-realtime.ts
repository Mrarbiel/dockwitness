"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AssemblyAIRealtimeClient,
  BrowserAudioCaptureManager,
  ScenarioAudioSimulator,
  TranscriptTurn,
  WordTiming,
} from "@/lib/assemblyai";

export interface UseAssemblyAIOptions {
  expectedKeyterms?: string[];
  activeRole: "RECEIVER" | "DRIVER";
  incidentId?: string;
  onTurnCommitted?: (turn: TranscriptTurn) => void;
  onPartialTurn?: (text: string) => void;
  onError?: (error: string) => void;
}

export type RealtimeStatus = "idle" | "connecting" | "streaming" | "simulating" | "error";

export interface UseAssemblyAIReturn {
  latencyMs: number | null;
  status: RealtimeStatus;
  isStreaming: boolean;
  isSimulating: boolean;
  isReconnecting: boolean;
  reconnectAttempts: number;
  turns: TranscriptTurn[];
  partialText: string;
  errorMessage: string | null;
  analyserNode: AnalyserNode | null;
  startCapture: () => Promise<void>;
  stopCapture: () => Promise<void>;
  simulateAudio: (scenario: "receiver" | "driver", forceOffline?: boolean) => Promise<void>;
  stopSimulation: () => void;
  clearTranscript: () => void;
  clearError: () => void;
}

export function useAssemblyAIRealtime({
  activeRole,
  expectedKeyterms,
  onTurnCommitted,
  onPartialTurn,
  onError,
}: UseAssemblyAIOptions): UseAssemblyAIReturn {
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [partialText, setPartialText] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  const activeRoleRef = useRef(activeRole);
  activeRoleRef.current = activeRole;

  const onTurnCommittedRef = useRef(onTurnCommitted);
  onTurnCommittedRef.current = onTurnCommitted;

  const onPartialTurnRef = useRef(onPartialTurn);
  onPartialTurnRef.current = onPartialTurn;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const expectedKeytermsRef = useRef(expectedKeyterms);
  expectedKeytermsRef.current = expectedKeyterms;

  const clientRef = useRef<AssemblyAIRealtimeClient | null>(null);
  const captureRef = useRef<BrowserAudioCaptureManager | null>(null);
  const simulatorRef = useRef<ScenarioAudioSimulator | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  // Helper to append a committed turn
  const commitTurn = useCallback((text: string, words?: WordTiming[], confidence = 0.95) => {
    if (!text.trim()) return;

    const now = new Date();
    const timestampStr = now.toTimeString().split(" ")[0] || "00:00:00";

    const turn: TranscriptTurn = {
      id: `turn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      speakerRole: activeRoleRef.current,
      text: text.trim(),
      timestamp: timestampStr,
      endOfTurn: true,
      words,
      confidence,
    };

    setTurns((prev) => [...prev, turn]);
    setPartialText("");
    onTurnCommittedRef.current?.(turn);
  }, []);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  const clearTranscript = useCallback(() => {
    setTurns([]);
    setPartialText("");
  }, []);

  /**
   * Stop active microphone capture and clean up audio tracks.
   */
  const stopCapture = useCallback(async () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    setReconnectAttempts(0);
    setIsReconnecting(false);

    try {
      if (captureRef.current) {
        await captureRef.current.stop();
        captureRef.current = null;
      }
      if (clientRef.current) {
        await clientRef.current.stop();
        clientRef.current = null;
      }
    } catch (err) {
      console.warn("Error stopping capture:", err);
    } finally {
      setAnalyserNode(null);
      setPartialText("");
      setStatus("idle");
    }
  }, []);

  /**
   * Stop audio simulation.
   */
  const stopSimulation = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    setReconnectAttempts(0);
    setIsReconnecting(false);

    if (simulatorRef.current) {
      simulatorRef.current.stop();
      simulatorRef.current = null;
    }
    if (clientRef.current) {
      clientRef.current.stop();
      clientRef.current = null;
    }
    setAnalyserNode(null);
    setPartialText("");
    setStatus("idle");
  }, []);

  /**
   * Active reconnection with exponential backoff on connection errors
   */
  const attemptReconnect = useCallback(
    (attempt: number) => {
      if (attempt > 3) {
        setIsReconnecting(false);
        setReconnectAttempts(0);
        reconnectAttemptsRef.current = 0;
        setStatus("error");
        const msg = "AssemblyAI streaming connection lost. Maximum reconnection attempts reached.";
        setErrorMessage(msg);
        onErrorRef.current?.(msg);
        return;
      }

      setIsReconnecting(true);
      setReconnectAttempts(attempt);
      reconnectAttemptsRef.current = attempt;
      const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      reconnectTimeoutRef.current = setTimeout(async () => {
        try {
          if (clientRef.current) {
            await clientRef.current.stop().catch(() => {});
          }

          const client = new AssemblyAIRealtimeClient({
            voiceFocus: "far-field",
            keytermsPrompt: expectedKeytermsRef.current,
            onSessionBegin: () => {
              setIsReconnecting(false);
              setReconnectAttempts(0);
              reconnectAttemptsRef.current = 0;
              setStatus("streaming");
            },
            onPartialTranscript: (text, words, latency) => {
              if (latency) setLatencyMs(latency);
              setPartialText(text);
              onPartialTurnRef.current?.(text);
            },
            onFinalTranscript: (text, words, latency) => {
              if (latency) setLatencyMs(latency);
              commitTurn(text, words);
            },
            onError: (err) => {
              const msg = err instanceof Error ? err.message : String(err);
              console.warn(`AssemblyAI stream error during reconnect attempt ${attempt}:`, msg);
              attemptReconnect(attempt + 1);
            },
          });

          clientRef.current = client;
          await client.connect();
        } catch (err) {
          console.warn(`Reconnect attempt ${attempt} failed:`, err);
          attemptReconnect(attempt + 1);
        }
      }, delay);
    },
    [commitTurn]
  );

  /**
   * Start live microphone capture and stream to AssemblyAI Universal-3.5 Pro.
   */
  const startCapture = useCallback(async () => {
    // Teardown any existing sessions
    await stopCapture();
    stopSimulation();
    clearError();
    setStatus("connecting");

    try {
      // 1. Initialize AssemblyAI WebSocket client
      const client = new AssemblyAIRealtimeClient({
        voiceFocus: "far-field",
        keytermsPrompt: expectedKeytermsRef.current,
        onSessionBegin: () => {
          setStatus("streaming");
          setIsReconnecting(false);
          setReconnectAttempts(0);
          reconnectAttemptsRef.current = 0;
        },
        onPartialTranscript: (text, words, latency) => {
          if (latency) setLatencyMs(latency);
          setPartialText(text);
          onPartialTurnRef.current?.(text);
        },
        onFinalTranscript: (text, words, latency) => {
          if (latency) setLatencyMs(latency);
          commitTurn(text, words);
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          setErrorMessage(msg);
          onErrorRef.current?.(msg);
          attemptReconnect(1);
        },
      });
      clientRef.current = client;

      // 2. Connect client to get WebSocket handshake established
      await client.connect();

      // 3. Initialize Browser Audio Capture
      const capture = new BrowserAudioCaptureManager({
        onAudioChunk: (chunk) => {
          clientRef.current?.sendAudio(chunk);
        },
        onError: (err) => {
          const msg = err.message || "Microphone capture error";
          setErrorMessage(msg);
          onErrorRef.current?.(msg);
          setStatus("error");
        },
      });
      captureRef.current = capture;

      await capture.start();
      setAnalyserNode(capture.getAnalyserNode());
    } catch (err: unknown) {
      await stopCapture();
      setStatus("error");
      const msg = err instanceof Error ? err.message : "Failed to start voice capture";
      setErrorMessage(msg);
      onErrorRef.current?.(msg);
    }
  }, [attemptReconnect, clearError, commitTurn, stopCapture, stopSimulation]);

  /**
   * Run scenario audio simulation (WAV streaming or offline fallback).
   */
  const simulateAudio = useCallback(
    async (scenario: "receiver" | "driver", forceOffline = false) => {
      await stopCapture();
      stopSimulation();
      clearError();
      setStatus("simulating");

      const simulator = new ScenarioAudioSimulator();
      simulatorRef.current = simulator;

      if (forceOffline) {
        // Run completely offline without touching AssemblyAI WebSocket
        try {
          await simulator.run({
            scenario,
            forceOffline: true,
            onPartialText: (text) => {
              setPartialText(text);
              onPartialTurn?.(text);
            },
            onTurnCommitted: (turn) => {
              setTurns((prev) => [...prev, turn]);
              setPartialText("");
              onTurnCommittedRef.current?.(turn);
            },
            onEnded: () => {
              setStatus("idle");
              setAnalyserNode(null);
            },
            onError: (err) => {
              setErrorMessage(err.message);
              setStatus("error");
            },
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Simulation failed";
          setErrorMessage(msg);
          setStatus("error");
        }
        return;
      }

      // Online simulation attempt with automatic offline fail-safe
      try {
        const client = new AssemblyAIRealtimeClient({
          onSessionBegin: () => {
            // Socket ready
          },
          onPartialTranscript: (text) => {
            setPartialText(text);
            onPartialTurn?.(text);
          },
          onFinalTranscript: (text, words) => {
            commitTurn(text, words);
          },
          onError: (err) => {
            console.warn("AssemblyAI streaming error during simulation:", err);
          },
        });
        clientRef.current = client;

        await client.connect();

        await simulator.run({
          scenario,
          forceOffline: false,
          onAudioChunk: (chunk) => {
            client.sendAudio(chunk);
          },
          onEnded: async () => {
            await client.stop();
            setStatus("idle");
            setAnalyserNode(null);
          },
          onError: async (err) => {
            console.error("Online AssemblyAI simulation failed:", err);
            await client.stop();
            setStatus("error");
            const msg = err instanceof Error ? err.message : String(err);
            setErrorMessage(`AssemblyAI streaming error: ${msg}. Please retry or enable explicit offline dev mode.`);
            onErrorRef.current?.(msg);
          },
        });

        setAnalyserNode(simulator.getAnalyserNode());
      } catch (err) {
        console.error("Online AssemblyAI simulation connect failed:", err);
        if (clientRef.current) {
          await clientRef.current.stop().catch(() => {});
        }
        setStatus("error");
        const msg = err instanceof Error ? err.message : "Failed to connect to AssemblyAI";
        setErrorMessage(`AssemblyAI connection failed: ${msg}. Please retry or enable explicit offline dev mode.`);
        onErrorRef.current?.(msg);
      }
    },
    [clearError, commitTurn, onPartialTurn, stopCapture, stopSimulation]
  );

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (captureRef.current) {
        captureRef.current.stop().catch(() => {});
      }
      if (clientRef.current) {
        clientRef.current.stop().catch(() => {});
      }
      if (simulatorRef.current) {
        simulatorRef.current.stop();
      }
    };
  }, []);

  return {
    status,
    latencyMs,
    isStreaming: status === "streaming",
    isSimulating: status === "simulating",
    isReconnecting,
    reconnectAttempts,
    turns,
    partialText,
    errorMessage,
    analyserNode,
    startCapture,
    stopCapture,
    simulateAudio,
    stopSimulation,
    clearTranscript,
    clearError,
  };
}
