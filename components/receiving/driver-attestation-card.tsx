"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Truck, Check, X, HelpCircle, Lock, Volume2, Send, RefreshCw, AlertCircle } from "lucide-react";
import { AttestationPosition } from "@/lib/types";

export interface DriverAttestationCardProps {
  hasDiscrepancy: boolean;
  delta: number | null;
  discrepancyType: "SHORTAGE" | "OVERAGE" | null;
  hasDamage: boolean;
  damageDescription?: string | null;
  isLocked: boolean;
  disabled?: boolean;
  currentDriverQtyPos: AttestationPosition;
  currentDriverDmgPos: AttestationPosition;
  driverStatement?: string | null;
  driverSourceTurnId?: string | null;
  driverSourceQuote?: string | null;
  isSubmitting?: boolean;
  onPositionChange: (qtyPos: AttestationPosition, dmgPos: AttestationPosition, statement?: string) => void;
  onSubmitAttestation: (qtyPos: AttestationPosition, dmgPos: AttestationPosition, statement?: string) => Promise<void>;
  onTriggerDriverSimulation?: () => Promise<void>;
}

export function DriverAttestationCard({
  hasDiscrepancy,
  delta,
  discrepancyType,
  hasDamage,
  damageDescription,
  isLocked,
  disabled = false,
  currentDriverQtyPos,
  currentDriverDmgPos,
  driverStatement,
  driverSourceTurnId,
  driverSourceQuote,
  isSubmitting = false,
  onPositionChange,
  onSubmitAttestation,
  onTriggerDriverSimulation,
}: DriverAttestationCardProps) {
  const [statementText, setStatementText] = useState(driverStatement || "");
  const [isSimulatingDriver, setIsSimulatingDriver] = useState(false);
  const isEffectivelyLocked = isLocked || disabled;

  const handleQtyClick = (pos: AttestationPosition) => {
    onPositionChange(pos, currentDriverDmgPos, statementText);
  };

  const handleDmgClick = (pos: AttestationPosition) => {
    onPositionChange(currentDriverQtyPos, pos, statementText);
  };

  const handleSimulate = async () => {
    if (!onTriggerDriverSimulation) return;
    setIsSimulatingDriver(true);
    try {
      await onTriggerDriverSimulation();
    } finally {
      setIsSimulatingDriver(false);
    }
  };

  const handleSubmit = async () => {
    await onSubmitAttestation(currentDriverQtyPos, currentDriverDmgPos, statementText);
  };

  return (
    <div
      data-testid="driver-attestation-panel"
      className={`rounded-xl border p-5 shadow-lg flex flex-col gap-4.5 transition-all ${
        isEffectivelyLocked
          ? "border-slate-800 bg-slate-950/40 opacity-70"
          : "border-sky-500/40 bg-slate-900/90 ring-1 ring-sky-500/20"
      }`}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
            <Truck className="h-4 w-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
              Two-Party Step 02
            </span>
            <h3 className="text-sm font-black tracking-tight text-white">
              Carrier Driver Attestation Cockpit
            </h3>
          </div>
        </div>

        <div>
          {isEffectivelyLocked ? (
            <Badge variant="outline" className="border-slate-700 bg-slate-800 text-[10px] text-slate-400 flex items-center gap-1">
              <Lock className="h-3 w-3" /> Step 1 Required
            </Badge>
          ) : (
            <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/40 text-[10px] font-bold">
              Driver Action Unlocked
            </Badge>
          )}
        </div>
      </div>

      {/* Lockout Notice */}
      {isEffectivelyLocked && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 flex items-start gap-2 text-xs text-slate-400">
          <AlertCircle className="h-4 w-4 shrink-0 text-slate-500 mt-0.5" />
          <span>
            <strong>Waiting for Receiver Statement:</strong> The warehouse receiver must provide initial count and damage observations in Step 1 before carrier driver attestation can proceed.
          </span>
        </div>
      )}

      {/* Dedicated Driver Audio Trigger */}
      {!isEffectivelyLocked && (
        <div className="rounded-lg border border-sky-500/20 bg-sky-950/30 p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
          <div className="text-xs">
            <span className="font-bold text-sky-300 flex items-center gap-1.5">
              <Volume2 className="h-3.5 w-3.5 text-sky-400" /> Driver Speech Turn (Golden WAV)
            </span>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Plays driver verbal statement aloud and parses attestation positions automatically.
            </p>
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isSimulatingDriver || isSubmitting}
            onClick={handleSimulate}
            className="shrink-0 border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 text-xs font-bold"
          >
            {isSimulatingDriver ? (
              <>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin text-sky-400" />
                Simulating Driver...
              </>
            ) : (
              <>▶️ Step 2: Simulate Driver Audio</>
            )}
          </Button>
        </div>
      )}

      {/* Structured Position Buttons */}
      {!isEffectivelyLocked && (
        <div className="flex flex-col gap-4">
          {/* Quantity Discrepancy Attestation */}
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3.5 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300">
                1. Attestation on Quantity ({discrepancyType || "SHORTAGE"} Δ = {delta ?? 0})
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] font-mono ${
                  currentDriverQtyPos === "DISPUTE"
                    ? "border-rose-500/40 text-rose-400 bg-rose-500/10"
                    : currentDriverQtyPos === "CONFIRM"
                    ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                    : "border-slate-700 text-slate-400"
                }`}
              >
                Current: {currentDriverQtyPos}
              </Badge>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => handleQtyClick("CONFIRM")}
                className={`flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg border py-2 px-1 sm:px-2 text-[11px] sm:text-xs font-bold transition min-h-[38px] ${
                  currentDriverQtyPos === "CONFIRM"
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">Confirm</span>
              </button>

              <button
                type="button"
                onClick={() => handleQtyClick("DISPUTE")}
                className={`flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg border py-2 px-1 sm:px-2 text-[11px] sm:text-xs font-bold transition min-h-[38px] ${
                  currentDriverQtyPos === "DISPUTE"
                    ? "border-rose-500 bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <X className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                <span className="truncate">Dispute</span>
              </button>

              <button
                type="button"
                onClick={() => handleQtyClick("NO_KNOWLEDGE")}
                className={`flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg border py-2 px-1 sm:px-2 text-[10px] sm:text-xs font-bold transition min-h-[38px] ${
                  currentDriverQtyPos === "NO_KNOWLEDGE"
                    ? "border-amber-500 bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
                title="Driver has no personal knowledge of pre-load count"
              >
                <HelpCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span className="truncate">No Know.</span>
              </button>

              <button
                type="button"
                onClick={() => handleQtyClick("REFUSED_TO_ATTEST")}
                className={`flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg border py-2 px-1 sm:px-2 text-[10px] sm:text-xs font-bold transition min-h-[38px] ${
                  currentDriverQtyPos === "REFUSED_TO_ATTEST"
                    ? "border-purple-500 bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/40"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
                title="Driver actively refused to attest or sign"
              >
                <AlertCircle className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                <span className="truncate">Refused</span>
              </button>

              <button
                type="button"
                onClick={() => handleQtyClick("DRIVER_UNAVAILABLE")}
                className={`flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg border py-2 px-1 sm:px-2 text-[10px] sm:text-xs font-bold transition min-h-[38px] ${
                  currentDriverQtyPos === "DRIVER_UNAVAILABLE"
                    ? "border-indigo-500 bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
                title="Post-delivery or driver departed"
              >
                <Lock className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">Departed</span>
              </button>
            </div>
          </div>

          {/* Damage Attestation (when damage present) */}
          {hasDamage && (
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">
                  2. Attestation on Damage ({damageDescription || "Carton Damage"})
                </span>
                <Badge
                  variant="outline"
                  className={`text-[10px] font-mono ${
                    currentDriverDmgPos === "CONFIRM"
                      ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                      : currentDriverDmgPos === "DISPUTE"
                      ? "border-rose-500/40 text-rose-400 bg-rose-500/10"
                      : currentDriverDmgPos === "REFUSED_TO_ATTEST"
                      ? "border-purple-500/40 text-purple-400 bg-purple-500/10"
                      : currentDriverDmgPos === "DRIVER_UNAVAILABLE"
                      ? "border-indigo-500/40 text-indigo-400 bg-indigo-500/10"
                      : "border-slate-700 text-slate-400"
                  }`}
                >
                  Current: {currentDriverDmgPos}
                </Badge>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => handleDmgClick("CONFIRM")}
                  className={`flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg border py-2 px-1 sm:px-2 text-[11px] sm:text-xs font-bold transition min-h-[38px] ${
                    currentDriverDmgPos === "CONFIRM"
                      ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  }`}
                >
                  <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">Confirm</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDmgClick("DISPUTE")}
                  className={`flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg border py-2 px-1 sm:px-2 text-[11px] sm:text-xs font-bold transition min-h-[38px] ${
                    currentDriverDmgPos === "DISPUTE"
                      ? "border-rose-500 bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  }`}
                >
                  <X className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                  <span className="truncate">Dispute</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDmgClick("NO_KNOWLEDGE")}
                  className={`flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg border py-2 px-1 sm:px-2 text-[10px] sm:text-xs font-bold transition min-h-[38px] ${
                    currentDriverDmgPos === "NO_KNOWLEDGE"
                      ? "border-amber-500 bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  }`}
                  title="Driver has no personal knowledge of damage"
                >
                  <HelpCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">No Know.</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDmgClick("REFUSED_TO_ATTEST")}
                  className={`flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg border py-2 px-1 sm:px-2 text-[10px] sm:text-xs font-bold transition min-h-[38px] ${
                    currentDriverDmgPos === "REFUSED_TO_ATTEST"
                      ? "border-purple-500 bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/40"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  }`}
                  title="Driver actively refused to attest or sign"
                >
                  <AlertCircle className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                  <span className="truncate">Refused</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDmgClick("DRIVER_UNAVAILABLE")}
                  className={`flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg border py-2 px-1 sm:px-2 text-[10px] sm:text-xs font-bold transition min-h-[38px] ${
                    currentDriverDmgPos === "DRIVER_UNAVAILABLE"
                      ? "border-indigo-500 bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  }`}
                  title="Post-delivery or driver departed"
                >
                  <Lock className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                  <span className="truncate">Departed</span>
                </button>
              </div>
            </div>
          )}

          {/* Operational Overrides: Quick Refusal / Unavailable Actions */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Operational Actions:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={async () => {
                  const stmt = "Carrier driver explicitly refused to sign or attest to exception notation.";
                  setStatementText(stmt);
                  onPositionChange("REFUSED_TO_ATTEST", hasDamage ? "REFUSED_TO_ATTEST" : "NOT_ASKED", stmt);
                  await onSubmitAttestation("REFUSED_TO_ATTEST", hasDamage ? "REFUSED_TO_ATTEST" : "NOT_ASKED", stmt);
                }}
                disabled={isSubmitting}
                className="h-7 text-[11px] font-bold border-purple-500/40 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 px-2"
              >
                <AlertCircle className="mr-1 h-3 w-3 text-purple-400" />
                Record Refusal (Unblock Review)
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={async () => {
                  const stmt = "Exception discovered post-departure; carrier driver unavailable.";
                  setStatementText(stmt);
                  onPositionChange("DRIVER_UNAVAILABLE", hasDamage ? "DRIVER_UNAVAILABLE" : "NOT_ASKED", stmt);
                  await onSubmitAttestation("DRIVER_UNAVAILABLE", hasDamage ? "DRIVER_UNAVAILABLE" : "NOT_ASKED", stmt);
                }}
                disabled={isSubmitting}
                className="h-7 text-[11px] font-bold border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 px-2"
              >
                <Lock className="mr-1 h-3 w-3 text-indigo-400" />
                Record Driver Unavailable
              </Button>
            </div>
          </div>

          {/* Statement / Remarks Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Carrier Driver Justification / Statement:
            </label>
            <input
              type="text"
              value={statementText}
              onChange={(e) => setStatementText(e.target.value)}
              placeholder="e.g., I confirm the damaged carton, but I can't confirm the shortage. The seal was intact."
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
            />
          </div>

          {/* Explicit Turn Provenance Citation */}
          {driverSourceTurnId && (
            <div className="rounded border border-slate-800 bg-slate-950/60 p-2 text-[11px] text-slate-400 flex items-center justify-between font-mono">
              <span>Speech Source Turn:</span>
              <span className="text-sky-400 font-bold">{driverSourceTurnId}</span>
            </div>
          )}

          {/* Dedicated Submit Button */}
          <Button
            type="button"
            data-testid="submit-driver-attestation"
            onClick={handleSubmit}
            disabled={isSubmitting || (currentDriverQtyPos === "NOT_ASKED" && currentDriverDmgPos === "NOT_ASKED")}
            className="w-full bg-sky-600 hover:bg-sky-500 text-white font-black text-xs py-2.5 shadow-lg shadow-sky-600/20"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Committing Attestation...
              </>
            ) : (
              <>
                <Send className="mr-2 h-3.5 w-3.5" /> Submit Driver Attestation (Commit Turn)
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
