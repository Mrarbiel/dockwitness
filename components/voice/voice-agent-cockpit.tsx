"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  VoiceAgentClient,
  VoiceAgentState,
  VoiceAgentTurn,
} from "@/lib/assemblyai";
import {
  Bot,
  Mic,
  MicOff,
  Radio,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  Volume2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface VoiceAgentCockpitProps {
  shipmentId: string;
  incidentId: string | null;
  onWorkflowAdvance?: () => void;
  className?: string;
}

export function VoiceAgentCockpit({
  shipmentId,
  incidentId,
  onWorkflowAdvance,
  className = "",
}: VoiceAgentCockpitProps) {
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [client, setClient] = useState<VoiceAgentClient | null>(null);
  const [agentState, setAgentState] = useState<VoiceAgentState>("DISCONNECTED");
  const [turns, setTurns] = useState<VoiceAgentTurn[]>([]);
  const [isMicActive, setIsMicActive] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTool, setActiveTool] = useState<{ name: string; args: Record<string, unknown>; result?: unknown } | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isGoldenDemo = Boolean(shipmentId && shipmentId.includes("44891"));

  const turnsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Initialize client
  useEffect(() => {
    const vaClient = new VoiceAgentClient({
      shipmentId,
      incidentId: incidentId || "",
      baseUrl: "",
      onStateChange: (state) => {
        setAgentState(state);
      },
      onTurn: (turn) => {
        setTurns((prev) => [...prev, turn]);
        if (turn.role === "tool" && onWorkflowAdvance) {
          onWorkflowAdvance();
        }
      },
      onError: (err) => {
        setErrorMessage(err);
      },
      onToolAction: (action) => {
        setActiveTool(action);
      },
    });

    setClient(vaClient);

    return () => {
      vaClient.disconnect();
    };
  }, [shipmentId, incidentId, onWorkflowAdvance]);

  // Auto-scroll turns stream only when new turns arrive
  useEffect(() => {
    if (turns.length > 0) {
      turnsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [turns]);

  const handleToggleConnect = useCallback(async () => {
    if (!client) return;
    setErrorMessage(null);

    if (agentState === "DISCONNECTED" || agentState === "ERROR") {
      await client.connect();
    } else {
      client.disconnect();
      setIsMicActive(false);
    }
  }, [client, agentState]);

  const handleToggleMic = useCallback(async () => {
    if (!client) return;
    if (isMicActive) {
      client.stopMicrophone();
      setIsMicActive(false);
    } else {
      try {
        await client.startMicrophone();
        setIsMicActive(true);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Microphone error";
        setErrorMessage(msg);
      }
    }
  }, [client, isMicActive]);

  const handleSimulateUtterance = useCallback(
    async (text: string) => {
      if (!client) return;
      setErrorMessage(null);
      await client.simulateUserTurn(text);
      if (onWorkflowAdvance) {
        onWorkflowAdvance();
      }
    },
    [client, onWorkflowAdvance]
  );

  const renderStateBadge = () => {
    switch (agentState) {
      case "SPEAKING":
        return (
          <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/40 animate-pulse flex items-center gap-1">
            <Volume2 className="h-3 w-3" /> SPEAKING
          </Badge>
        );
      case "LISTENING":
        return (
          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse flex items-center gap-1">
            <Radio className="h-3 w-3 text-emerald-400" /> LISTENING
          </Badge>
        );
      case "THINKING":
      case "TOOL_EXECUTING":
        return (
          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse flex items-center gap-1">
            <Wrench className="h-3 w-3 animate-spin" /> EXECUTING RULES
          </Badge>
        );
      case "IDLE":
        return (
          <Badge className="bg-slate-800 text-slate-300 border-slate-700 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" /> ONLINE / IDLE
          </Badge>
        );
      case "CONNECTING":
        return (
          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/40 animate-pulse">
            CONNECTING...
          </Badge>
        );
      case "ERROR":
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> ERROR
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="border-slate-800 text-slate-500">
            OFFLINE
          </Badge>
        );
    }
  };

  return (
    <div
      data-testid="voice-agent-cockpit"
      className={`rounded-xl border border-cyan-900/40 bg-slate-950/90 shadow-xl backdrop-blur-sm overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-950/60 bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/30 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-wide">
                AssemblyAI Voice Agent Co-Pilot
              </h3>
              <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-mono font-bold text-cyan-400 border border-cyan-500/20">
                P1 GUIDED WORKFLOW
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Interactive warehouse receiving assistant • Calls deterministic tools
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {renderStateBadge()}

          <Button
            size="sm"
            variant="outline"
            onClick={handleToggleConnect}
            className="border-slate-800 bg-slate-900 text-xs text-slate-300 hover:border-slate-700 hover:text-white"
          >
            {agentState === "DISCONNECTED" || agentState === "ERROR" ? "Connect WS" : "Disconnect"}
          </Button>

          <Button
            size="sm"
            variant={isMicActive ? "destructive" : "default"}
            onClick={handleToggleMic}
            disabled={agentState === "DISCONNECTED" || agentState === "ERROR" || agentState === "CONNECTING"}
            className={`min-h-[36px] text-xs gap-1.5 ${
              isMicActive
                ? ""
                : agentState === "DISCONNECTED" || agentState === "ERROR" || agentState === "CONNECTING"
                ? "bg-slate-800/80 text-slate-500 cursor-not-allowed border border-slate-700"
                : "bg-cyan-600 hover:bg-cyan-500 text-white"
            }`}
            title={
              agentState === "DISCONNECTED" || agentState === "ERROR" || agentState === "CONNECTING"
                ? "Connect WS before streaming microphone"
                : isMicActive
                ? "Mute Microphone"
                : "Start Voice Input"
            }
          >
            {isMicActive ? (
              <>
                <MicOff className="h-3.5 w-3.5" /> Stop Mic
              </>
            ) : (
              <>
                <Mic className="h-3.5 w-3.5" /> Stream Mic
              </>
            )}
          </Button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="rounded p-1 text-slate-400 hover:text-white transition-colors"
            aria-label={isExpanded ? "Collapse Agent" : "Expand Agent"}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-5 space-y-4">
          {/* Invariant Banner */}
          <div className="rounded-lg border border-slate-800/80 bg-slate-900/60 p-3 flex items-start gap-2.5 text-xs text-slate-400">
            <Sparkles className="h-4 w-4 text-cyan-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold text-slate-200">Voice Agent Invariant:</span>{" "}
              AI understands speech; code determines facts. The Voice Agent inspects workflow state and asks for missing evidence, but{" "}
              <strong className="text-amber-400">never calculates discrepancy math</strong> or manufactures driver agreement.
            </div>
          </div>

          {/* Active Tool Call Telemetry */}
          {activeTool && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs font-mono">
              <div className="flex items-center justify-between text-amber-400 font-bold">
                <span className="flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5 animate-spin" /> Tool Invocation: {activeTool.name}
                </span>
                <button
                  type="button"
                  onClick={() => setShowDiagnostics((prev) => !prev)}
                  className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300 hover:bg-amber-500/20 transition-colors"
                >
                  {showDiagnostics ? "Hide Diagnostics" : "Advanced Diagnostics"}
                  {showDiagnostics ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              </div>

              {showDiagnostics && (
                <div className="mt-2.5 pt-2 border-t border-amber-500/20 space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-sans">
                    Deterministic Backend Execution
                  </div>
                  <div className="text-[11px] text-slate-300">
                    Arguments: {JSON.stringify(activeTool.args)}
                  </div>
                  {Boolean(activeTool.result) && (
                    <div className="text-[11px] text-emerald-400">
                      Result: {JSON.stringify(activeTool.result)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300 flex items-center justify-between">
              <span>{errorMessage}</span>
              <button
                onClick={() => setErrorMessage(null)}
                className="text-rose-400 hover:text-white"
              >
                ✕
              </button>
            </div>
          )}

          {/* Spoken Dialogue Stream */}
          <div role="log" aria-label="Spoken Dialogue Stream" className="rounded-lg border border-slate-800 bg-slate-900/50 p-3.5 h-48 overflow-y-auto space-y-2.5 text-xs font-mono">
            {turns.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center space-y-1">
                <Bot className="h-6 w-6 text-slate-600 mb-1" />
                <p>Voice Agent ready. Speak via mic or trigger a prompt below.</p>
                <p className="text-[10px] text-slate-600">
                  Full 2-way audio with tool calling & barge-in support.
                </p>
              </div>
            ) : (
              turns.map((t) => (
                <div
                  key={t.id}
                  className={`p-2.5 rounded-lg ${
                    t.role === "agent"
                      ? "bg-cyan-950/30 border border-cyan-900/40 text-cyan-200"
                      : t.role === "tool"
                      ? "bg-slate-950/80 border border-slate-800 text-amber-300 text-[11px]"
                      : "bg-slate-800/60 border border-slate-700/60 text-slate-200 ml-6"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1 font-semibold uppercase">
                    <span>
                      {t.role === "agent"
                        ? "🤖 Voice Agent"
                        : t.role === "tool"
                        ? `⚙️ Tool [${t.toolName}]`
                        : "👤 Dock Operator / Driver"}
                    </span>
                    <span className="text-slate-500" suppressHydrationWarning>
                      {isMounted
                        ? new Date(t.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                        : ""}
                    </span>
                  </div>
                  <p className="leading-relaxed font-sans">{t.text}</p>
                </div>
              ))
            )}
            <div ref={turnsEndRef} />
          </div>

          {/* Fast Voice Agent Simulation Triggers */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Voice Agent Guided Scenarios (Click to Speak)
              </span>
              <button
                onClick={() => setTurns([])}
                className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1"
              >
                <RotateCcw className="h-2.5 w-2.5" /> Clear Log
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  handleSimulateUtterance(
                    isGoldenDemo
                      ? "Hello DockWitness, load the manifest for PO forty-four eight ninety-one and tell me expected quantity."
                      : `Hello DockWitness, load the manifest for ${shipmentId} and tell me expected quantity.`
                  )
                }
                className="group border-slate-800 bg-slate-900/90 text-left justify-start text-xs text-slate-300 hover:border-cyan-500/60 hover:bg-cyan-950/20 hover:text-cyan-200 h-auto py-2.5 px-3.5 transition-all shadow-sm rounded-lg"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-cyan-500/10 border border-cyan-500/30 group-hover:bg-cyan-500/20 mr-2.5 transition-colors">
                  <Play className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                </div>
                <div className="min-w-0">
                  <span className="font-bold block text-slate-100 group-hover:text-cyan-300">1. Inspect Manifest</span>
                  <span className="text-[10px] text-slate-400 block font-normal truncate">
                    {isGoldenDemo ? "“Load manifest for PO 44891...”" : "“Load manifest & check quantity...”"}
                  </span>
                </div>
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  handleSimulateUtterance(
                    isGoldenDemo
                      ? "I have forty-seven cartons. Carton thirty-one is crushed underneath and wet on the right side."
                      : "I have completed counting all delivered cartons on this shipment."
                  )
                }
                className="group border-slate-800 bg-slate-900/90 text-left justify-start text-xs text-slate-300 hover:border-amber-500/60 hover:bg-amber-950/20 hover:text-amber-200 h-auto py-2.5 px-3.5 transition-all shadow-sm rounded-lg"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 border border-amber-500/30 group-hover:bg-amber-500/20 mr-2.5 transition-colors">
                  <Play className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                </div>
                <div className="min-w-0">
                  <span className="font-bold block text-slate-100 group-hover:text-amber-300">2. Record Count & Damage</span>
                  <span className="text-[10px] text-slate-400 block font-normal truncate">
                    {isGoldenDemo ? "“47 cartons, carton 31 crushed...”" : "“Report counted cartons & status...”"}
                  </span>
                </div>
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  handleSimulateUtterance(
                    "Voice Agent, check if there is any missing evidence before I let the driver leave."
                  )
                }
                className="group border-slate-800 bg-slate-900/90 text-left justify-start text-xs text-slate-300 hover:border-purple-500/60 hover:bg-purple-950/20 hover:text-purple-200 h-auto py-2.5 px-3.5 transition-all shadow-sm rounded-lg"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-purple-500/10 border border-purple-500/30 group-hover:bg-purple-500/20 mr-2.5 transition-colors">
                  <Play className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                </div>
                <div className="min-w-0">
                  <span className="font-bold block text-slate-100 group-hover:text-purple-300">3. Check Missing Evidence</span>
                  <span className="text-[10px] text-slate-400 block font-normal truncate">
                    &ldquo;Check missing evidence before truck leaves...&rdquo;
                  </span>
                </div>
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  handleSimulateUtterance(
                    isGoldenDemo
                      ? "Driver statement: I confirm the damaged carton, but I dispute the shortage. The seal was intact."
                      : "Driver statement: I confirm the delivery count and intact trailer seal."
                  )
                }
                className="group border-slate-800 bg-slate-900/90 text-left justify-start text-xs text-slate-300 hover:border-emerald-500/60 hover:bg-emerald-950/20 hover:text-emerald-200 h-auto py-2.5 px-3.5 transition-all shadow-sm rounded-lg"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 border border-emerald-500/30 group-hover:bg-emerald-500/20 mr-2.5 transition-colors">
                  <Play className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                </div>
                <div className="min-w-0">
                  <span className="font-bold block text-slate-100 group-hover:text-emerald-300">4. Record Driver Attestation</span>
                  <span className="text-[10px] text-slate-400 block font-normal truncate">
                    {isGoldenDemo ? "“Confirm damage, dispute shortage...”" : "“Record driver response & position...”"}
                  </span>
                </div>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
