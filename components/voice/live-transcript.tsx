"use client";

import React, { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { User, Truck, Radio, Trash2 } from "lucide-react";
import { TranscriptTurn } from "@/lib/assemblyai";

export interface LiveTranscriptProps {
  turns: TranscriptTurn[];
  partialText: string;
  activeRole: "RECEIVER" | "DRIVER";
  isStreaming: boolean;
  isSimulating: boolean;
  onClear?: () => void;
}

export function LiveTranscript({
  turns,
  partialText,
  activeRole,
  isStreaming,
  isSimulating,
  onClear,
}: LiveTranscriptProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [turns, partialText]);

  return (
    <div
      data-testid="live-transcript"
      className="flex flex-col rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono"
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Live Stream Transcript
          </span>
          {(isStreaming || isSimulating) && (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400" />
              LIVE
            </span>
          )}
        </div>
        {turns.length > 0 && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition"
            title="Clear transcript"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Transcript Scroll Area */}
      <div
        ref={scrollContainerRef}
        role="log"
        aria-label="Live Stream Transcript Log"
        className="mt-3 flex max-h-[320px] min-h-[160px] flex-col gap-3 overflow-y-auto pr-1"
      >
        {turns.length === 0 && !partialText && (
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            <Radio className="h-8 w-8 text-slate-700 animate-pulse" />
            <p className="mt-2 text-xs text-slate-500">No statements captured yet.</p>
            <p className="text-[11px] text-slate-600">
              Click &apos;Start Voice Capture&apos; or &apos;Simulate Scenario Audio&apos; to begin.
            </p>
          </div>
        )}

        {/* Committed Turns */}
        {turns.map((turn) => (
          <div
            key={turn.id}
            data-turn-id={turn.id}
            className="group rounded-md border border-slate-800/80 bg-slate-900/50 p-3 transition hover:border-slate-700"
          >
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                {turn.speakerRole === "RECEIVER" ? (
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 bg-amber-500/10 text-amber-400 font-bold"
                  >
                    <User className="mr-1 h-3 w-3" />
                    RECEIVER
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-sky-500/40 bg-sky-500/10 text-sky-400 font-bold"
                  >
                    <Truck className="mr-1 h-3 w-3" />
                    DRIVER
                  </Badge>
                )}
                {turn.speakerLabel && (
                  <span className="text-[10px] text-slate-500">{turn.speakerLabel}</span>
                )}
              </div>
              <span className="text-[11px] text-slate-500">{turn.timestamp}</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-100 font-sans">
              &ldquo;{turn.text}&rdquo;
            </p>
          </div>
        ))}

        {/* Interim / Partial Speech */}
        {partialText && (
          <div className="rounded-md border border-dashed border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 text-amber-300">
                {activeRole === "RECEIVER" ? "RECEIVER" : "DRIVER"} (speaking...)
              </Badge>
              <span className="flex items-center gap-1 text-[10px] text-amber-400/80">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                streaming
              </span>
            </div>
            <p className="mt-2 text-sm italic leading-relaxed text-slate-300 font-sans">
              {partialText}
              <span className="ml-1 inline-block animate-pulse font-bold text-amber-400">▌</span>
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
