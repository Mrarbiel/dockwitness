"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertOctagon, HelpCircle, Clock, ShieldCheck, User, Truck, Camera } from "lucide-react";
import { AttestationPosition, AgreementStatus } from "@/lib/types";

export interface TwoPartyAgreementCardProps {
  hasDiscrepancy: boolean;
  expectedQty: number;
  observedQty: number | null;
  delta: number | null;
  discrepancyType: "SHORTAGE" | "OVERAGE" | null;
  receiverQtyPos: AttestationPosition;
  driverQtyPos: AttestationPosition;
  quantityAgreementStatus: AgreementStatus;
  receiverQtyTurnId?: string | null;
  receiverQtyQuote?: string | null;
  driverQtyTurnId?: string | null;
  driverQtyQuote?: string | null;

  hasDamage: boolean;
  damageDescription?: string | null;
  receiverDmgPos: AttestationPosition;
  driverDmgPos: AttestationPosition;
  damageAgreementStatus: AgreementStatus | null;
  receiverDmgTurnId?: string | null;
  receiverDmgQuote?: string | null;
  driverDmgTurnId?: string | null;
  driverDmgQuote?: string | null;
  photoCount: number;
}

function renderAgreementBadge(status: AgreementStatus) {
  switch (status) {
    case "CONFIRMED_BY_BOTH":
      return (
        <Badge
          title="CONFIRMED_BY_BOTH"
          aria-label="CONFIRMED_BY_BOTH"
          className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-xs font-black tracking-wide flex items-center gap-1.5 py-1 px-2.5 max-w-full min-w-0"
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span className="truncate">CONFIRMED_BY_BOTH</span>
        </Badge>
      );
    case "DISPUTED":
      return (
        <Badge
          title="DISPUTED"
          aria-label="DISPUTED"
          className="bg-rose-500/20 text-rose-300 border-rose-500/40 text-xs font-black tracking-wide flex items-center gap-1.5 py-1 px-2.5 max-w-full min-w-0"
        >
          <AlertOctagon className="h-3.5 w-3.5 text-rose-400 shrink-0" />
          <span className="truncate">DISPUTED</span>
        </Badge>
      );
    case "DISPUTED_OR_UNCONFIRMED":
      return (
        <Badge
          title="DISPUTED_OR_UNCONFIRMED"
          aria-label="DISPUTED_OR_UNCONFIRMED"
          className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs font-black tracking-wide flex items-center gap-1.5 py-1 px-2.5 max-w-full min-w-0"
        >
          <HelpCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="truncate">UNRESOLVED</span>
        </Badge>
      );
    case "RECEIVER_ONLY":
      return (
        <Badge
          title="RECEIVER_ONLY (AWAITING DRIVER)"
          aria-label="RECEIVER_ONLY (AWAITING DRIVER)"
          className="bg-sky-500/20 text-sky-300 border-sky-500/40 text-xs font-bold tracking-wide flex items-center gap-1.5 py-1 px-2.5 max-w-full min-w-0"
        >
          <Clock className="h-3.5 w-3.5 text-sky-400 shrink-0" />
          <span className="truncate">AWAITING DRIVER</span>
        </Badge>
      );
    case "DRIVER_ONLY":
      return (
        <Badge
          title="DRIVER_ONLY"
          aria-label="DRIVER_ONLY"
          className="bg-slate-700/50 text-slate-300 border-slate-600 text-xs font-bold tracking-wide flex items-center gap-1.5 py-1 px-2.5 max-w-full min-w-0"
        >
          <span className="truncate">DRIVER_ONLY</span>
        </Badge>
      );
    case "DRIVER_REFUSED":
      return (
        <Badge
          title="DRIVER_REFUSED_TO_ATTEST"
          aria-label="DRIVER_REFUSED_TO_ATTEST"
          className="bg-purple-500/20 text-purple-300 border-purple-500/40 text-xs font-black tracking-wide flex items-center gap-1.5 py-1 px-2.5 max-w-full min-w-0"
        >
          <AlertOctagon className="h-3.5 w-3.5 text-purple-400 shrink-0" />
          <span className="truncate">DRIVER REFUSED</span>
        </Badge>
      );
    case "DRIVER_UNAVAILABLE":
      return (
        <Badge
          title="DRIVER_UNAVAILABLE (POST-DELIVERY)"
          aria-label="DRIVER_UNAVAILABLE (POST-DELIVERY)"
          className="bg-indigo-500/20 text-indigo-300 border-indigo-500/40 text-xs font-bold tracking-wide flex items-center gap-1.5 py-1 px-2.5 max-w-full min-w-0"
        >
          <Clock className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
          <span className="truncate">DRIVER UNAVAILABLE</span>
        </Badge>
      );
    case "PENDING_REVIEW":
    default:
      return (
        <Badge
          title="PENDING_REVIEW"
          aria-label="PENDING_REVIEW"
          className="bg-slate-800 text-slate-400 border-slate-700 text-xs font-medium tracking-wide flex items-center gap-1.5 py-1 px-2.5 max-w-full min-w-0"
        >
          <span className="truncate">PENDING_REVIEW</span>
        </Badge>
      );
  }
}

export function TwoPartyAgreementCard({
  hasDiscrepancy,
  expectedQty,
  observedQty,
  delta,
  discrepancyType,
  receiverQtyPos,
  driverQtyPos,
  quantityAgreementStatus,
  receiverQtyTurnId,
  receiverQtyQuote,
  driverQtyTurnId,
  driverQtyQuote,
  hasDamage,
  damageDescription,
  receiverDmgPos,
  driverDmgPos,
  damageAgreementStatus,
  receiverDmgTurnId,
  receiverDmgQuote,
  driverDmgTurnId,
  driverDmgQuote,
  photoCount,
}: TwoPartyAgreementCardProps) {
  return (
    <div
      data-testid="two-party-agreement-card"
      className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg flex flex-col gap-5"
    >
      {/* Header & Pure Domain Invariant Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3.5">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Deterministic Agreement Engine
          </span>
          <h3 className="text-base font-black tracking-tight text-white">
            Two-Party Consensus Positions
          </h3>
        </div>
        <div className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
          Invariant: Silence ≠ Consent
        </div>
      </div>

      {/* 1. Quantity Consensus Section */}
      <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-4 flex flex-col gap-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-2.5">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
              1. Quantity Discrepancy Consensus
            </span>
            <div className="font-mono text-xs text-slate-400 mt-0.5">
              BOL Expected: <strong className="text-white">{expectedQty}</strong> | Observed:{" "}
              <strong className="text-amber-400">{observedQty !== null ? observedQty : "—"}</strong>
              {delta !== null && delta !== 0 && (
                <span className={delta < 0 ? " text-amber-400 font-bold ml-1.5" : " text-purple-400 font-bold ml-1.5"}>
                  (Δ = {delta} {discrepancyType})
                </span>
              )}
            </div>
          </div>
          <div>{renderAgreementBadge(quantityAgreementStatus)}</div>
        </div>

        {/* Side-by-Side Party Turns for Quantity */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          {/* Receiver Quantity Turn */}
          <div className="rounded border border-amber-500/20 bg-amber-500/5 p-3 flex flex-col justify-between text-xs">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  <User className="h-3 w-3" /> Party 1: Receiver
                </span>
                <Badge variant="outline" className="border-amber-500/30 text-amber-300 text-[10px] font-mono">
                  {receiverQtyPos}
                </Badge>
              </div>
              <p className="text-slate-300 italic text-[11px] leading-relaxed">
                {receiverQtyQuote ? `“${receiverQtyQuote}”` : "Pending receiver count statement"}
              </p>
            </div>
            {receiverQtyTurnId && (
              <div className="mt-2 pt-2 border-t border-amber-500/10 flex items-center justify-between text-[10px] font-mono text-slate-500">
                <span>Source:</span>
                <span className="text-amber-400/80 underline font-semibold">{receiverQtyTurnId}</span>
              </div>
            )}
          </div>

          {/* Driver Quantity Turn */}
          <div className="rounded border border-sky-500/20 bg-sky-500/5 p-3 flex flex-col justify-between text-xs">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-sky-400">
                  <Truck className="h-3 w-3" /> Party 2: Driver
                </span>
                <Badge
                  variant="outline"
                  className={`text-[10px] font-mono ${
                    driverQtyPos === "DISPUTE"
                      ? "border-rose-500/40 text-rose-300 bg-rose-500/10"
                      : driverQtyPos === "CONFIRM"
                      ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
                      : "border-slate-700 text-slate-400"
                  }`}
                >
                  {driverQtyPos}
                </Badge>
              </div>
              <p className="text-slate-300 italic text-[11px] leading-relaxed">
                {driverQtyQuote ? `“${driverQtyQuote}”` : "Pending carrier driver attestation"}
              </p>
            </div>
            {driverQtyTurnId && (
              <div className="mt-2 pt-2 border-t border-sky-500/10 flex items-center justify-between text-[10px] font-mono text-slate-500">
                <span>Source:</span>
                <span className="text-sky-400/80 underline font-semibold">{driverQtyTurnId}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Damage Consensus Section */}
      <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-4 flex flex-col gap-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-2.5">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
              2. Packaging & Defect Consensus
            </span>
            <div className="font-mono text-xs text-slate-400 mt-0.5 flex items-center gap-2">
              {hasDamage ? (
                <>
                  <span className="text-amber-400 font-semibold">{damageDescription || "Physical Damage Detected"}</span>
                  <span className="text-slate-600">•</span>
                  <span className="flex items-center gap-1 text-[11px] text-slate-400">
                    <Camera className="h-3 w-3" /> {photoCount} photo{photoCount !== 1 ? "s" : ""}
                  </span>
                </>
              ) : observedQty === null ? (
                <span className="text-slate-400">Packaging uninspected • Pending count</span>
              ) : (
                <span className="text-emerald-400">No damage reported during receiver count</span>
              )}
            </div>
          </div>
          <div>
            {hasDamage
              ? renderAgreementBadge(damageAgreementStatus || "PENDING_REVIEW")
              : observedQty === null
              ? (
                <Badge variant="outline" className="border-slate-700 text-slate-400 text-xs flex items-center gap-1.5 py-1 px-2.5 max-w-full min-w-0">
                  <Clock className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  <span className="truncate">AWAITING INSPECTION</span>
                </Badge>
              )
              : (
                <Badge className="bg-slate-800 text-slate-300 border border-slate-700 text-xs font-medium flex items-center gap-1.5 py-1 px-2.5 max-w-full min-w-0">
                  <ShieldCheck className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">NO DAMAGE REPORTED (PENDING)</span>
                </Badge>
              )}
          </div>
        </div>

        {hasDamage ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {/* Receiver Damage Turn */}
            <div className="rounded border border-amber-500/20 bg-amber-500/5 p-3 flex flex-col justify-between text-xs">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    <User className="h-3 w-3" /> Party 1: Receiver
                  </span>
                  <Badge variant="outline" className="border-amber-500/30 text-amber-300 text-[10px] font-mono">
                    {receiverDmgPos}
                  </Badge>
                </div>
                <p className="text-slate-300 italic text-[11px] leading-relaxed">
                  {receiverDmgQuote ? `“${receiverDmgQuote}”` : "Pending damage citation"}
                </p>
              </div>
              {receiverDmgTurnId && (
                <div className="mt-2 pt-2 border-t border-amber-500/10 flex items-center justify-between text-[10px] font-mono text-slate-500">
                  <span>Source:</span>
                  <span className="text-amber-400/80 underline font-semibold">{receiverDmgTurnId}</span>
                </div>
              )}
            </div>

            {/* Driver Damage Turn */}
            <div className="rounded border border-sky-500/20 bg-sky-500/5 p-3 flex flex-col justify-between text-xs">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-sky-400">
                    <Truck className="h-3 w-3" /> Party 2: Driver
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-mono ${
                      driverDmgPos === "CONFIRM"
                        ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
                        : driverDmgPos === "DISPUTE"
                        ? "border-rose-500/40 text-rose-300 bg-rose-500/10"
                        : "border-slate-700 text-slate-400"
                    }`}
                  >
                    {driverDmgPos}
                  </Badge>
                </div>
                <p className="text-slate-300 italic text-[11px] leading-relaxed">
                  {driverDmgQuote ? `“${driverDmgQuote}”` : "Pending driver damage confirmation"}
                </p>
              </div>
              {driverDmgTurnId && (
                <div className="mt-2 pt-2 border-t border-sky-500/10 flex items-center justify-between text-[10px] font-mono text-slate-500">
                  <span>Source:</span>
                  <span className="text-sky-400/80 underline font-semibold">{driverDmgTurnId}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic">
            No packaging defects or crushed cartons identified in manifest inspection.
          </p>
        )}
      </div>
    </div>
  );
}
