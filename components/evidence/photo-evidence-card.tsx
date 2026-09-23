"use client";

import React, { useState } from "react";
import { AlertTriangle, ShieldCheck, Camera, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CameraCapture } from "./camera-capture";
import { EvidenceGallery } from "./evidence-gallery";
import { EvidenceItem, DamageReport } from "./types";

export interface PhotoEvidenceCardProps {
  incidentId: string;
  damageReport: DamageReport | null;
  uploadedPhotos: EvidenceItem[];
  onPhotoUploaded: (item: EvidenceItem) => void;
  disabled?: boolean;
}

export function PhotoEvidenceCard({
  incidentId,
  damageReport,
  uploadedPhotos,
  onPhotoUploaded,
  disabled = false,
}: PhotoEvidenceCardProps) {
  const [manualCaptureOpen, setManualCaptureOpen] = useState<boolean>(false);

  const hasDamage = Boolean(damageReport);
  const hasPhotos = uploadedPhotos.length > 0;
  const isRequirementSatisfied = !hasDamage || hasPhotos;

  // Auto-expand when damage is reported and photo is missing (mandatory requirement)
  // Or when receiver clicks to manually open the capture tool
  const isCaptureVisible = !isRequirementSatisfied || manualCaptureOpen;

  return (
    <div
      data-testid="photo-evidence-card"
      className={`rounded-xl border p-5 transition-all shadow-md ${
        !isRequirementSatisfied
          ? "border-amber-500/70 bg-amber-950/20 shadow-amber-950/20"
          : hasPhotos
          ? "border-emerald-500/40 bg-emerald-950/10 shadow-emerald-950/10"
          : "border-slate-800 bg-slate-900/60"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          {!isRequirementSatisfied ? (
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/20 text-amber-400">
              <AlertTriangle className="h-4 w-4 animate-pulse" />
            </div>
          ) : hasPhotos ? (
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-800 text-slate-400">
              <Camera className="h-4 w-4" />
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400">
                Gate 4: Physical Evidence
              </span>
              {!isRequirementSatisfied ? (
                <Badge variant="destructive" className="text-[9px] font-mono uppercase px-1.5 py-0 animate-pulse">
                  MANDATORY PHOTO REQUIRED
                </Badge>
              ) : hasPhotos ? (
                <Badge variant="default" className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-emerald-500/50 text-[9px] font-mono uppercase px-1.5 py-0">
                  PHOTO EVIDENCE VERIFIED
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[9px] font-mono uppercase px-1.5 py-0 text-slate-500">
                  AWAITING INSPECTION
                </Badge>
              )}
            </div>
            <h3 className="text-sm font-bold text-white">
              {!isRequirementSatisfied
                ? "Damaged Freight Photo Mandate"
                : hasPhotos
                ? "Attached Freight Evidence"
                : "Dock Photo Evidence"}
            </h3>
          </div>
        </div>

        {hasPhotos ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setManualCaptureOpen((prev) => !prev)}
            className="text-xs border-slate-700 text-slate-300 hover:bg-slate-800 h-7"
          >
            {manualCaptureOpen ? (
              "Hide Capture Tool"
            ) : (
              <>
                <Plus className="mr-1 h-3 w-3" /> Add Another Photo
              </>
            )}
          </Button>
        ) : !hasDamage ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setManualCaptureOpen((prev) => !prev)}
            className="text-xs border-slate-700 text-slate-300 hover:bg-slate-800 h-7"
          >
            {manualCaptureOpen ? (
              "Hide Photo Tool"
            ) : (
              <>
                <Camera className="mr-1 h-3 w-3" /> Attach Optional Photo
              </>
            )}
          </Button>
        ) : null}
      </div>

      {hasDamage && damageReport && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-950/30 p-3 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
              Reported Damage Specification:
            </span>
            <span className="font-mono text-[10px] text-amber-400 font-semibold">
              {damageReport.cartonReference || "General Carton"}
            </span>
          </div>

          <p className="text-slate-200 italic font-mono text-[11px]">
            &ldquo;{damageReport.sourceQuote}&rdquo;
          </p>

          <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
            <span className="rounded bg-slate-900/80 px-2 py-0.5 text-slate-300 border border-slate-700">
              Condition: <strong className="text-amber-300">{damageReport.condition}</strong>
            </span>
            <span className="rounded bg-slate-900/80 px-2 py-0.5 text-slate-300 border border-slate-700">
              Trigger: <strong className="text-amber-300">Visible Damage Exception Protocol</strong>
            </span>
          </div>
        </div>
      )}

      {!isRequirementSatisfied && (
        <div className="mt-3 flex items-start gap-2 text-xs text-amber-200/90 bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">
          <Camera className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <div>
            <span className="font-bold text-white">Dock Intake Blocked:</span> Damaged freight cannot be finalized without photographic proof. Snap or attach a photo of the affected item to satisfy this compliance gate.
          </div>
        </div>
      )}

      {!hasDamage && !hasPhotos && !manualCaptureOpen && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
          <span>No physical damage reported. Photo capture is optional.</span>
          <button
            type="button"
            onClick={() => setManualCaptureOpen(true)}
            className="text-amber-400 hover:text-amber-300 font-mono text-[11px] underline ml-2"
          >
            Open camera tool
          </button>
        </div>
      )}

      {isCaptureVisible && (
        <div className="mt-4">
          <CameraCapture
            incidentId={incidentId}
            damageContext={
              damageReport
                ? {
                    cartonReference: damageReport.cartonReference,
                    condition: damageReport.condition,
                    sourceQuote: damageReport.sourceQuote,
                  }
                : undefined
            }
            onPhotoUploaded={onPhotoUploaded}
            disabled={disabled}
          />
        </div>
      )}

      {hasPhotos && (
        <div className="mt-4">
          <EvidenceGallery photos={uploadedPhotos} incidentId={incidentId} />
        </div>
      )}
    </div>
  );
}
