"use client";

import { DiscrepancyResult, PartyRole } from "@/lib/types";
import { DiscrepancyBadge } from "./discrepancy-badge";
import { VerbatimQuoteChip } from "./verbatim-quote-chip";
import { ClericalOverridePanel } from "./clerical-override-panel";

interface ObservedQuantityCounterProps {
  observedQty: number | null;
  expectedQty: number;
  unit?: string;
  discrepancy: DiscrepancyResult | null;
  sourceQuote?: string | null;
  sourceTurnId?: string | null;
  speakerRole?: PartyRole | null;
  confidence?: number;
  isOverridden?: boolean;
  spokenQty?: number | null;
  onConfirmOverride: (newQty: number, reason: string) => void;
  onResetToSpoken: () => void;
}

export function ObservedQuantityCounter({
  observedQty,
  expectedQty,
  unit = "cartons",
  discrepancy,
  sourceQuote,
  sourceTurnId,
  speakerRole,
  confidence,
  isOverridden = false,
  spokenQty = null,
  onConfirmOverride,
  onResetToSpoken,
}: ObservedQuantityCounterProps) {
  const isAwaiting = observedQty === null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-md">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Physical Inventory Count
          </span>
          <h3 className="text-lg font-bold text-white">Observed Quantity</h3>
        </div>
        <DiscrepancyBadge
          discrepancy={discrepancy}
          unit={unit}
          isOverridden={isOverridden}
        />
      </div>

      {/* Main Counter Display */}
      <div className="mt-4 rounded-xl border border-slate-800/80 bg-slate-950 p-4">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span
              className={`font-mono text-4xl font-black tracking-tight ${
                isAwaiting
                  ? "text-slate-600"
                  : discrepancy?.type === "SHORTAGE"
                  ? "text-red-400"
                  : discrepancy?.type === "OVERAGE"
                  ? "text-blue-400"
                  : "text-emerald-400"
              }`}
            >
              {observedQty !== null ? observedQty : "—"}
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {unit}
            </span>
          </div>

          {/* Delta Pill */}
          {discrepancy && (
            <div className="flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-xs font-mono font-bold text-slate-300 border border-slate-800">
              <span>Δ =</span>
              <span
                className={
                  discrepancy.delta < 0
                    ? "text-red-400"
                    : discrepancy.delta > 0
                    ? "text-blue-400"
                    : "text-emerald-400"
                }
              >
                {discrepancy.delta > 0 ? `+${discrepancy.delta}` : discrepancy.delta}
              </span>
            </div>
          )}
        </div>

        {/* Expected comparison caption */}
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-900 pt-2">
          <span>Expected: {expectedQty} {unit}</span>
          {isOverridden && spokenQty !== null && (
            <span className="text-amber-400/80">Spoken in audio: {spokenQty}</span>
          )}
        </div>

        {/* Verbatim Quote Chip */}
        {sourceQuote && (
          <VerbatimQuoteChip
            sourceQuote={sourceQuote}
            speakerRole={speakerRole}
            sourceTurnId={sourceTurnId}
            confidence={confidence}
          />
        )}
      </div>

      {/* Clerical Override Controls */}
      <ClericalOverridePanel
        currentQty={observedQty}
        spokenQty={spokenQty ?? observedQty}
        isOverridden={isOverridden}
        onConfirmOverride={onConfirmOverride}
        onResetToSpoken={onResetToSpoken}
      />
    </div>
  );
}
