"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Square, Volume2, Info } from "lucide-react";

export interface AudioSimulatorProps {
  isSimulating: boolean;
  onSimulate: (scenario: "receiver" | "driver", forceOffline?: boolean) => Promise<void>;
  onStop: () => void;
  disabled?: boolean;
  driverSimulationDisabled?: boolean;
}

export function AudioSimulator({
  isSimulating,
  onSimulate,
  onStop,
  disabled,
  driverSimulationDisabled = false,
}: AudioSimulatorProps) {
  const [offlineMode, setOfflineMode] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeScenario, setActiveScenario] = useState<"receiver" | "driver">("receiver");

  const handleRun = async (scenario: "receiver" | "driver") => {
    setActiveScenario(scenario);
    await onSimulate(scenario, offlineMode);
  };

  return (
    <div
      data-testid="audio-simulator"
      className="rounded-lg border border-slate-800 bg-slate-950/60 p-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
            <Volume2 className="h-3.5 w-3.5" />
            Judge / Audio Simulator (Universal-3.5 Pro)
          </span>
          {offlineMode && (
            <span className="rounded bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 text-[9px] font-mono font-bold text-rose-300 animate-pulse">
              OFFLINE — NOT ASSEMBLYAI
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-[10px] text-slate-500 hover:text-slate-300 underline"
        >
          {showAdvanced ? "Hide Dev Mode" : "Dev Options"}
        </button>
      </div>

      {showAdvanced && (
        <div className="mt-2 rounded border border-slate-800 bg-slate-900/60 p-2 flex items-center justify-between text-[11px]">
          <span className="text-slate-400">Force Offline Dev Replay (bypass AssemblyAI WebSocket):</span>
          <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer font-bold">
            <input
              type="checkbox"
              checked={offlineMode}
              onChange={(e) => setOfflineMode(e.target.checked)}
              className="rounded border-slate-700 bg-slate-900 text-amber-500"
            />
            Offline Fallback
          </label>
        </div>
      )}

      <p className="mt-1 text-xs text-slate-400">
        Pipes pre-recorded golden WAV audio through the 16 kHz AssemblyAI pipeline. No microphone required.
      </p>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          variant={isSimulating && activeScenario === "receiver" ? "destructive" : "amber"}
          disabled={disabled || (isSimulating && activeScenario !== "receiver")}
          onClick={() => (isSimulating ? onStop() : handleRun("receiver"))}
          className="w-full text-xs font-bold"
        >
          {isSimulating && activeScenario === "receiver" ? (
            <>
              <Square className="mr-1.5 h-3.5 w-3.5" /> Stop Receiver Audio
            </>
          ) : (
            <>
              <Play className="mr-1.5 h-3.5 w-3.5" /> ▶️ Step 1: Simulate Receiver
            </>
          )}
        </Button>

        <Button
          type="button"
          size="sm"
          variant={isSimulating && activeScenario === "driver" ? "destructive" : "outline"}
          disabled={disabled || driverSimulationDisabled || (isSimulating && activeScenario !== "driver")}
          onClick={() => (isSimulating ? onStop() : handleRun("driver"))}
          className="w-full text-xs font-bold border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-40"
          title={driverSimulationDisabled ? "Receiver Step 1 count must be completed first" : "Simulate carrier driver statement"}
        >
          {isSimulating && activeScenario === "driver" ? (
            <>
              <Square className="mr-1.5 h-3.5 w-3.5" /> Stop Driver Audio
            </>
          ) : (
            <>
              <Play className="mr-1.5 h-3.5 w-3.5" /> ▶️ Step 2: Simulate Driver
            </>
          )}
        </Button>
      </div>

      <div className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-500">
        <Info className="h-3 w-3 mt-0.5 shrink-0 text-slate-400" />
        <span>Plays spoken audio aloud and streams real 16 kHz PCM frames to AssemblyAI STT.</span>
      </div>
    </div>
  );
}
