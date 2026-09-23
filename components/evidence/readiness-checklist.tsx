"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Clock, ShieldCheck } from "lucide-react";
import { DomainReadiness } from "./types";

export interface ReadinessChecklistProps {
  speechExtracted: boolean;
  observedQty: number | null;
  discrepancyComputed: boolean;
  delta: number | null;
  quoteProvenance: boolean;
  hasDamage: boolean;
  hasPhotos: boolean;
  photoCount: number;
  hasDiscrepancy: boolean;
  driverAttested: boolean;
  driverPosition?: string | null;
  readiness: DomainReadiness;
}

export function ReadinessChecklist({
  speechExtracted,
  observedQty,
  discrepancyComputed,
  delta,
  quoteProvenance,
  hasDamage,
  hasPhotos,
  photoCount,
  hasDiscrepancy,
  driverAttested,
  driverPosition,
  readiness,
}: ReadinessChecklistProps) {
  return (
    <div
      data-testid="readiness-checklist"
      className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-md"
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
            Evidence Integrity & Compliance Gates
          </span>
          <h3 className="text-xs font-bold text-white">Deterministic Invariants</h3>
        </div>
        <Badge
          variant={readiness.readyForReview ? "default" : "destructive"}
          className={`text-[10px] uppercase font-bold ${readiness.readyForReview ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-emerald-500/50" : ""}`}
        >
          {readiness.readyForReview ? "READY FOR REVIEW" : "GATES BLOCKED"}
        </Badge>
      </div>

      <div className="mt-4 space-y-2.5 text-xs">
        <div className="flex items-center justify-between rounded bg-slate-950/60 p-2.5 border border-slate-800/80">
          <span className="text-slate-300">1. Speech Fact Extraction</span>
          {speechExtracted ? (
            <span className="flex items-center gap-1 font-bold text-emerald-400 font-mono text-[11px]">
              <CheckCircle2 className="h-3.5 w-3.5" /> Extracted ({observedQty})
            </span>
          ) : (
            <span className="flex items-center gap-1 font-mono text-slate-500 text-[11px]">
              <Clock className="h-3 w-3" /> Pending Speech
            </span>
          )}
        </div>

        <div className="flex items-center justify-between rounded bg-slate-950/60 p-2.5 border border-slate-800/80">
          <span className="text-slate-300">2. Deterministic Discrepancy</span>
          {discrepancyComputed && delta !== null ? (
            <span className="flex items-center gap-1 font-bold text-emerald-400 font-mono text-[11px]">
              <CheckCircle2 className="h-3.5 w-3.5" /> Computed (Δ = {delta})
            </span>
          ) : (
            <span className="flex items-center gap-1 font-mono text-slate-500 text-[11px]">
              <Clock className="h-3 w-3" /> Awaiting Math
            </span>
          )}
        </div>

        <div className="flex items-center justify-between rounded bg-slate-950/60 p-2.5 border border-slate-800/80">
          <span className="text-slate-300">3. Verbatim STT Provenance</span>
          {quoteProvenance ? (
            <span className="flex items-center gap-1 font-bold text-emerald-400 font-mono text-[11px]">
              <ShieldCheck className="h-3.5 w-3.5" /> Linked to Audio
            </span>
          ) : (
            <span className="font-mono text-slate-500 text-[11px]">No Quote Citation</span>
          )}
        </div>

        <div
          className={`flex items-center justify-between rounded p-2.5 border transition-colors ${
            hasDamage && !hasPhotos
              ? "bg-amber-950/40 border-amber-500/60 text-amber-200"
              : "bg-slate-950/60 border-slate-800/80"
          }`}
        >
          <span className={hasDamage && !hasPhotos ? "text-amber-300 font-semibold" : "text-slate-300"}>
            4. Photo Evidence Gate
          </span>
          {hasDamage ? (
            hasPhotos ? (
              <span className="flex items-center gap-1 font-bold text-emerald-400 font-mono text-[11px]">
                <CheckCircle2 className="h-3.5 w-3.5" /> Verified ({photoCount} photo{photoCount !== 1 ? "s" : ""})
              </span>
            ) : (
              <span className="flex items-center gap-1 font-bold text-amber-400 font-mono text-[11px] animate-pulse">
                <AlertCircle className="h-3.5 w-3.5" /> MISSING: Damage Photo
              </span>
            )
          ) : (
            <span className="font-mono text-slate-500 text-[11px]">N/A (No Damage)</span>
          )}
        </div>

        <div
          className={`flex items-center justify-between rounded p-2.5 border transition-colors ${
            hasDiscrepancy && !driverAttested
              ? "bg-amber-950/30 border-amber-500/40"
              : "bg-slate-950/60 border-slate-800/80"
          }`}
        >
          <span className="text-slate-300">5. Driver Attestation Gate</span>
          {hasDiscrepancy ? (
            driverAttested ? (
              <span className="flex items-center gap-1 font-bold text-emerald-400 font-mono text-[11px]">
                <CheckCircle2 className="h-3.5 w-3.5" /> Attested ({driverPosition || "RECORDED"})
              </span>
            ) : (
              <span className="flex items-center gap-1 font-bold text-amber-400 font-mono text-[11px]">
                <Clock className="h-3.5 w-3.5" /> Awaiting Driver
              </span>
            )
          ) : (
            <span className="font-mono text-slate-500 text-[11px]">N/A (Clean Manifest)</span>
          )}
        </div>

        <div className="flex items-center justify-between rounded bg-slate-950/60 p-2.5 border border-slate-800/80">
          <span className="text-slate-300">6. Legal Liability Assessment</span>
          <Badge variant="outline" className="border-slate-700 text-[10px] text-slate-400 font-mono">
            INSULATED (Never by AI)
          </Badge>
        </div>
      </div>

      {readiness.missingRequirements.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            Blocking Readiness ({readiness.missingRequirements.length}):
          </span>
          <ul className="mt-1.5 space-y-1 text-xs text-amber-200/90 pl-4 list-disc font-mono">
            {readiness.missingRequirements.map((req, i) => (
              <li key={i}>{req}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
