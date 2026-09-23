"use client";

import React from "react";
import {
  Mic,
  Scale,
  Camera,
  Truck,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TranscriptTurn } from "@/lib/assemblyai";
import { DiscrepancyResult, AttestationPosition } from "@/lib/types";
import { DamageReport, DomainReadiness } from "./types";

export interface WorkflowSummaryProps {
  turns?: TranscriptTurn[];
  discrepancy?: DiscrepancyResult | null;
  damageReport?: DamageReport | null;
  photoCount?: number;
  driverAttestation?: {
    quantityPosition: AttestationPosition;
    damagePosition?: AttestationPosition;
    statement?: string | null;
    quantityQuote?: string | null;
    damageQuote?: string | null;
  } | null;
  readiness?: DomainReadiness | null;
  className?: string;
}

export function WorkflowSummary({
  turns = [],
  discrepancy,
  damageReport,
  photoCount = 0,
  driverAttestation,
  readiness,
  className = "",
}: WorkflowSummaryProps) {
  const receiverTurns = turns.filter((t) => t.speakerRole === "RECEIVER");
  const driverTurns = turns.filter((t) => t.speakerRole === "DRIVER");

  const steps = [
    {
      id: "speech",
      title: "Speech",
      fullTitle: "Speech Extraction",
      completed: receiverTurns.length > 0 || (discrepancy !== undefined && discrepancy !== null),
      icon: Mic,
      summary: receiverTurns.length > 0
        ? `${receiverTurns.length} spoken turn(s) parsed via AssemblyAI`
        : "Awaiting receiving voice intake",
      badge: receiverTurns.length > 0 ? "EXTRACTED" : "PENDING",
      variant: receiverTurns.length > 0 ? "secondary" : "outline",
    },
    {
      id: "discrepancy",
      title: "Discrepancy Math",
      fullTitle: "Deterministic Shortage Math",
      completed: Boolean(discrepancy && discrepancy.type !== null),
      icon: Scale,
      summary: discrepancy && discrepancy.type !== null
        ? `Δ ${discrepancy.delta} cartons (${discrepancy.type})`
        : "No count discrepancy registered",
      badge: discrepancy?.type ? String(discrepancy.type) : "NO DELTA",
      variant: discrepancy?.type === "SHORTAGE" ? "shortage" : "outline",
    },
    {
      id: "photos",
      title: "Photo Evidence",
      fullTitle: "Physical Photographic Evidence",
      completed: photoCount > 0,
      icon: Camera,
      summary: photoCount > 0
        ? `${photoCount} damage photograph(s) uploaded to storage`
        : damageReport?.condition
        ? `Damage reported ("${damageReport.condition}") — photo required`
        : "No damage reported",
      badge: photoCount > 0 ? `${photoCount} ATTACHED` : damageReport ? "PHOTO REQUIRED" : "OPTIONAL",
      variant: photoCount > 0 ? "confirmed" : damageReport ? "dispute" : "outline",
    },
    {
      id: "attestation",
      title: "Driver Position",
      fullTitle: "Bilateral Driver Attestation",
      completed: Boolean(driverAttestation && driverAttestation.quantityPosition !== "NOT_ASKED"),
      icon: Truck,
      summary: driverAttestation && driverAttestation.quantityPosition !== "NOT_ASKED"
        ? `Quantity: ${driverAttestation.quantityPosition} • Damage: ${driverAttestation.damagePosition}`
        : driverTurns.length > 0
        ? "Driver statement recorded, evaluating positions"
        : "Awaiting carrier driver attestation",
      badge: driverAttestation?.quantityPosition === "DISPUTE"
        ? "DISPUTED"
        : driverAttestation?.quantityPosition === "CONFIRM"
        ? "CONFIRMED"
        : "PENDING",
      variant: driverAttestation?.quantityPosition === "DISPUTE"
        ? "dispute"
        : driverAttestation?.quantityPosition === "CONFIRM"
        ? "confirmed"
        : "outline",
    },
    {
      id: "readiness",
      title: "Ops Readiness",
      fullTitle: "Operations Claim Readiness",
      completed: Boolean(readiness?.readyForReview),
      icon: ShieldCheck,
      summary: readiness?.readyForReview
        ? "All gate invariants verified — ready for ops claim review"
        : readiness?.missingRequirements && readiness.missingRequirements.length > 0
        ? `Missing: ${readiness.missingRequirements.join(", ")}`
        : "Evaluating compliance gates",
      badge: readiness?.readyForReview ? "READY" : "INCOMPLETE",
      variant: readiness?.readyForReview ? "confirmed" : "secondary",
    },
  ];

  return (
    <div
      data-testid="workflow-summary"
      className={`rounded-xl border border-slate-800 bg-slate-900/50 p-4 shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
            Workflow Summary
          </span>
          <span className="text-[9px] font-mono text-slate-500 hidden xl:inline">
            (Client Progress Tracker)
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 shrink-0">
          <Clock className="h-3 w-3 text-amber-400" />
          <span className="hidden sm:inline">Live Session Milestones</span>
          <span className="sm:hidden">Live</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {steps.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.id}
              className={`rounded-lg border p-2.5 transition-all min-w-0 overflow-hidden break-words ${
                s.completed
                  ? "border-slate-700 bg-slate-950/80"
                  : "border-slate-800/60 bg-slate-950/40 opacity-75"
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1.5 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${s.completed ? "text-amber-400" : "text-slate-500"}`} />
                  <span
                    className="text-[11px] font-bold text-white line-clamp-2 break-words"
                    title={s.fullTitle || s.title}
                  >
                    {s.title}
                  </span>
                </div>
                {s.completed && <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0 ml-1" />}
              </div>
              <p className="text-[10px] text-slate-400 leading-snug line-clamp-2 break-words">
                {s.summary}
              </p>
              <div className="mt-2 flex items-center justify-between min-w-0">
                <Badge variant={s.variant as any} className="text-[8px] font-mono px-1.5 py-0 max-w-full truncate">
                  {s.badge}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
