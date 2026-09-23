"use client";

import { Badge } from "@/components/ui/badge";
import { PartyRole } from "@/lib/types";

interface VerbatimQuoteChipProps {
  sourceQuote: string;
  speakerRole?: PartyRole | null;
  sourceTurnId?: string | null;
  confidence?: number;
  timestamp?: string;
  onClick?: () => void;
}

export function VerbatimQuoteChip({
  sourceQuote,
  speakerRole = "RECEIVER",
  sourceTurnId,
  confidence,
  timestamp,
  onClick,
}: VerbatimQuoteChipProps) {
  if (!sourceQuote) return null;

  return (
    <div
      onClick={onClick}
      className={`group relative mt-3 rounded-lg border-l-4 border-amber-500 bg-slate-950/80 p-3.5 shadow-inner transition-all ${
        onClick ? "cursor-pointer hover:border-amber-400 hover:bg-slate-900/90" : ""
      }`}
    >
      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
        <div className="flex items-center gap-2">
          <span className="font-bold text-amber-400 uppercase tracking-wider text-[10px]">
            Verbatim Provenance Quote
          </span>
          <span className="text-slate-600">•</span>
          <Badge
            variant="outline"
            className="border-amber-500/30 bg-amber-500/10 text-amber-300 text-[10px] px-1.5 py-0 font-mono"
          >
            {speakerRole || "SPEECH"}
          </Badge>
        </div>
        {timestamp && (
          <span className="font-mono text-[10px] text-slate-500">{timestamp}</span>
        )}
      </div>

      <p className="text-sm font-medium italic text-slate-200">
        &ldquo;{sourceQuote}&rdquo;
      </p>

      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 font-mono">
        {sourceTurnId && <span>Turn ID: {sourceTurnId}</span>}
        {typeof confidence === "number" && (
          <span className="text-emerald-400 font-semibold">
            Confidence: {(confidence * 100).toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}
