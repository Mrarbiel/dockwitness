"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { User, Truck, CheckCircle2, Clock, ArrowRight, ShieldAlert } from "lucide-react";
import { AttestationPosition } from "@/lib/types";

export interface TwoPartyStepperProps {
  currentStep: 1 | 2;
  receiverStatus: "PENDING" | "RECORDING" | "COMPLETED";
  driverStatus: "AWAITING_RECEIVER" | "PENDING_REVIEW" | "RECORDING" | "COMPLETED";
  hasDiscrepancy: boolean;
  hasDamage: boolean;
  observedQty: number | null;
  expectedQty: number;
  driverQtyPos?: AttestationPosition;
  driverDmgPos?: AttestationPosition;
  onSelectStep?: (step: 1 | 2) => void;
}

export function TwoPartyStepper({
  currentStep,
  receiverStatus,
  driverStatus,
  hasDiscrepancy,
  hasDamage,
  observedQty,
  expectedQty,
  driverQtyPos,
  driverDmgPos,
  onSelectStep,
}: TwoPartyStepperProps) {
  return (
    <div
      data-testid="two-party-stepper"
      className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg backdrop-blur-sm"
    >
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Step 1: Receiver Turn */}
        <button
          type="button"
          onClick={() => onSelectStep?.(1)}
          className={`flex-1 flex items-center gap-3.5 rounded-lg border p-3.5 text-left transition-all ${
            currentStep === 1
              ? "border-amber-500/60 bg-amber-500/10 shadow-md shadow-amber-500/5 ring-1 ring-amber-500/30"
              : "border-slate-800/80 bg-slate-950/60 hover:border-slate-700"
          }`}
        >
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-bold text-sm ${
              receiverStatus === "COMPLETED"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : currentStep === 1
                ? "bg-amber-500 text-slate-950"
                : "bg-slate-800 text-slate-400"
            }`}
          >
            {receiverStatus === "COMPLETED" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            ) : (
              <User className="h-5 w-5" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                Step 01 • Party 1
              </span>
              {receiverStatus === "COMPLETED" && (
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-400 font-bold"
                >
                  Turn Committed
                </Badge>
              )}
              {receiverStatus === "RECORDING" && (
                <Badge
                  variant="outline"
                  className="border-amber-500/40 bg-amber-500/20 text-[9px] text-amber-300 animate-pulse font-bold"
                >
                  Recording...
                </Badge>
              )}
            </div>
            <h4 className="text-sm font-bold text-white truncate">Receiver Count & Inspection</h4>
            <p className="text-[11px] text-slate-400 truncate">
              {observedQty !== null ? (
                <span className="font-mono text-slate-300">
                  Observed: <strong className="text-amber-400">{observedQty}</strong> / {expectedQty} cartons
                  {hasDamage ? " • Damage Reported" : ""}
                </span>
              ) : (
                "Warehouse receiver states count and physical condition"
              )}
            </p>
          </div>
        </button>

        {/* Workflow Divider Arrow */}
        <div className="hidden md:flex items-center justify-center text-slate-600">
          <ArrowRight className="h-5 w-5" />
        </div>

        {/* Step 2: Driver Turn */}
        <button
          type="button"
          onClick={() => onSelectStep?.(2)}
          disabled={receiverStatus === "PENDING"}
          className={`flex-1 flex items-center gap-3.5 rounded-lg border p-3.5 text-left transition-all ${
            currentStep === 2
              ? "border-sky-500/60 bg-sky-500/10 shadow-md shadow-sky-500/5 ring-1 ring-sky-500/30"
              : receiverStatus === "PENDING"
              ? "border-slate-800/40 bg-slate-950/30 opacity-60 cursor-not-allowed"
              : "border-slate-800/80 bg-slate-950/60 hover:border-slate-700"
          }`}
        >
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-bold text-sm ${
              driverStatus === "COMPLETED"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : currentStep === 2
                ? "bg-sky-500 text-slate-950"
                : "bg-slate-800 text-slate-400"
            }`}
          >
            {driverStatus === "COMPLETED" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            ) : (
              <Truck className="h-5 w-5" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                Step 02 • Party 2
              </span>
              {driverStatus === "COMPLETED" && (
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-400 font-bold"
                >
                  Attestation Bound
                </Badge>
              )}
              {driverStatus === "PENDING_REVIEW" && (
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/10 text-[9px] text-amber-400 font-bold animate-pulse"
                >
                  Review Pending
                </Badge>
              )}
              {driverStatus === "AWAITING_RECEIVER" && (
                <Badge
                  variant="outline"
                  className="border-slate-700 bg-slate-800 text-[9px] text-slate-400"
                >
                  Awaiting Step 1
                </Badge>
              )}
            </div>
            <h4 className="text-sm font-bold text-white truncate">Driver Attestation & Review</h4>
            <p className="text-[11px] text-slate-400 truncate">
              {driverStatus === "COMPLETED" ? (
                <span className="font-mono text-slate-300">
                  Qty: <strong className={driverQtyPos === "DISPUTE" ? "text-rose-400" : "text-emerald-400"}>{driverQtyPos}</strong>
                  {driverDmgPos ? ` • Dmg: ${driverDmgPos}` : ""}
                </span>
              ) : driverStatus === "AWAITING_RECEIVER" ? (
                "Locked until receiver submits statement"
              ) : (
                "Carrier driver confirms or disputes exceptions"
              )}
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
