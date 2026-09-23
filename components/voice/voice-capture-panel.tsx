"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mic, Square, RefreshCw, AlertTriangle, User, Truck } from "lucide-react";
import { LiveTranscript } from "./live-transcript";
import { AudioVisualizer } from "./audio-visualizer";
import { AudioSimulator } from "./audio-simulator";
import { useAssemblyAIRealtime } from "./use-assemblyai-realtime";
import { TranscriptTurn } from "@/lib/assemblyai";

export interface VoiceCapturePanelProps {
  expectedKeyterms?: string[];
  incidentId?: string;
  onTurnCommitted?: (turn: TranscriptTurn) => void;
  disabled?: boolean;
  isStep1Complete?: boolean;
  externalRole?: "RECEIVER" | "DRIVER";
  onRoleChange?: (role: "RECEIVER" | "DRIVER") => void;
  simulateTriggerRef?: React.MutableRefObject<((scenario: "receiver" | "driver", forceOffline?: boolean) => Promise<void>) | null>;
}

export function VoiceCapturePanel({
  expectedKeyterms,
  incidentId,
  onTurnCommitted,
  disabled = false,
  isStep1Complete = false,
  externalRole,
  onRoleChange,
  simulateTriggerRef,
}: VoiceCapturePanelProps) {
  const [internalRole, setInternalRole] = useState<"RECEIVER" | "DRIVER">("RECEIVER");
  const activeRole = externalRole !== undefined ? externalRole : internalRole;

  const handleRoleSelect = (role: "RECEIVER" | "DRIVER") => {
    if (externalRole !== undefined) {
      onRoleChange?.(role);
    } else {
      setInternalRole(role);
    }
  };

  const {
    status,
    isStreaming,
    isSimulating,
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
  } = useAssemblyAIRealtime({
    activeRole,
    expectedKeyterms,
    incidentId,
    onTurnCommitted,
  });

  if (simulateTriggerRef) {
    simulateTriggerRef.current = simulateAudio;
  }

  return (
    <div
      data-testid="voice-capture-panel"
      className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 flex flex-col gap-5"
    >
      {/* Header & Status */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
            Realtime Voice Cockpit
          </span>
          <h2 className="text-lg font-bold text-white">AssemblyAI Audio Pipeline</h2>
        </div>

        {/* Status Chip */}
        <div>
          {isReconnecting && (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/20 text-amber-300 animate-pulse flex items-center gap-1.5"
            >
              <RefreshCw className="h-3 w-3 animate-spin" />
              Reconnecting ({reconnectAttempts}/3)...
            </Badge>
          )}
          {!isReconnecting && status === "idle" && (
            <Badge variant="outline" className="border-slate-700 bg-slate-800 text-slate-300">
              Mic Ready
            </Badge>
          )}
          {!isReconnecting && status === "connecting" && (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/20 text-amber-300 animate-pulse"
            >
              Connecting...
            </Badge>
          )}
          {!isReconnecting && status === "streaming" && (
            <Badge
              variant="outline"
              className="border-emerald-500/40 bg-emerald-500/20 text-emerald-400 font-bold"
            >
              <span className="mr-1.5 h-2 w-2 animate-ping rounded-full bg-emerald-400" />
              LIVE: 16 kHz PCM
            </Badge>
          )}
          {status === "simulating" && (
            <Badge
              variant="outline"
              className="border-cyan-500/40 bg-cyan-500/20 text-cyan-300 font-bold"
            >
              <span className="mr-1.5 h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
              SIMULATING AUDIO
            </Badge>
          )}
          {status === "error" && (
            <Badge
              variant="outline"
              className="border-red-500/40 bg-red-500/20 text-red-400 font-bold"
            >
              Stream Error
            </Badge>
          )}
        </div>
      </div>

      {/* Role Selection Stepper */}
      <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-2">
        <span className="text-xs font-medium text-slate-400 pl-2">Active Speaker Role:</span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => handleRoleSelect("RECEIVER")}
            disabled={disabled || isStreaming || isSimulating || isReconnecting}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition ${
              activeRole === "RECEIVER"
                ? "bg-amber-500 text-slate-950"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <User className="h-3.5 w-3.5" />
            1. Receiver
          </button>
          <button
            type="button"
            onClick={() => handleRoleSelect("DRIVER")}
            disabled={disabled || !isStep1Complete || isStreaming || isSimulating || isReconnecting}
            title={!isStep1Complete ? "Complete Step 1 (Receiver count) first" : "Switch to Driver role"}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition ${
              activeRole === "DRIVER"
                ? "bg-sky-500 text-slate-950"
                : !isStep1Complete
                ? "text-slate-600 cursor-not-allowed opacity-50"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Truck className="h-3.5 w-3.5" />
            2. Driver {!isStep1Complete && "(Locked)"}
          </button>
        </div>
      </div>

      {/* Disabled Session Initializing Notice */}
      {disabled && (
        <div className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-400 flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-400" />
          <span>Initializing dock receiving session in database... Controls unlocked once session is ready.</span>
        </div>
      )}

      {/* Primary Capture Controls & Visualizer */}
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {status !== "streaming" ? (
            <Button
              type="button"
              variant="amber"
              size="lg"
              disabled={disabled || status === "connecting" || isSimulating || isReconnecting}
              onClick={startCapture}
              className="w-full text-sm font-bold shadow-lg shadow-amber-500/10 min-h-[44px]"
            >
              {status === "connecting" ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Connecting to AssemblyAI...
                </>
              ) : (
                <>
                  <Mic className="mr-2 h-4 w-4" />
                  {activeRole === "RECEIVER" ? "🎙️ Record Receiver (Step 1)" : "🎙️ Record Driver (Step 2)"}
                </>
              )}
            </Button>
          ) : (
            <Button
              type="button"
              variant="destructive"
              size="lg"
              onClick={stopCapture}
              className="w-full text-sm font-bold animate-pulse min-h-[44px]"
            >
              <Square className="mr-2 h-4 w-4" />
              ⏹️ Stop Capture
            </Button>
          )}

          <div className="flex flex-col justify-center">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Audio Input Activity:
            </span>
            <AudioVisualizer
              analyserNode={analyserNode}
              isActive={isStreaming || isSimulating}
            />
          </div>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={clearError}
              className="text-xs underline hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Live Transcript Container */}
      <LiveTranscript
        turns={turns}
        partialText={partialText}
        activeRole={activeRole}
        isStreaming={isStreaming}
        isSimulating={isSimulating}
        onClear={clearTranscript}
      />

      {/* Simulation Fallback */}
      <AudioSimulator
        isSimulating={isSimulating}
        onSimulate={simulateAudio}
        onStop={stopSimulation}
        disabled={disabled || isStreaming || isReconnecting}
        driverSimulationDisabled={!isStep1Complete}
      />
    </div>
  );
}
