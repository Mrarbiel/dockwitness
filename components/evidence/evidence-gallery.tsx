"use client";

import React, { useState } from "react";
import { EvidenceItem } from "./types";
import { Badge } from "@/components/ui/badge";
import { Image as ImageIcon, ExternalLink, ShieldCheck, Eye, X, Download } from "lucide-react";

export interface EvidenceGalleryProps {
  photos: EvidenceItem[];
  incidentId: string;
}

export function EvidenceGallery({ photos, incidentId }: EvidenceGalleryProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<EvidenceItem | null>(null);

  if (photos.length === 0) {
    return null;
  }

  const isDemoSample = (photo: EvidenceItem) => {
    const text = `${photo.description || ""} ${photo.storagePath || ""}`.toLowerCase();
    return text.includes("demo") || text.includes("sample");
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Attached Photo Evidence ({photos.length})
          </span>
        </div>
        <Badge variant="default" className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-[10px] font-mono uppercase border-emerald-500/50">
          <ShieldCheck className="mr-1 h-3 w-3" /> Gate Satisfied
        </Badge>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {photos.map((photo, idx) => (
          <div
            key={photo.id || idx}
            className="group relative overflow-hidden rounded-lg border border-slate-800 bg-slate-900 transition-all hover:border-emerald-500/50"
          >
            <div
              onClick={() => setSelectedPhoto(photo)}
              className="relative aspect-video w-full cursor-pointer overflow-hidden bg-slate-950 flex items-center justify-center"
            >
              {photo.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo.previewUrl}
                  alt={photo.description || "Damage evidence photo"}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-500">
                  <ImageIcon className="h-8 w-8 mb-1 text-slate-600" />
                  <span className="font-mono text-[10px]">{photo.storagePath}</span>
                </div>
              )}

              {isDemoSample(photo) && (
                <Badge
                  variant="outline"
                  className="absolute top-2 left-2 border-amber-500/60 bg-amber-500/20 text-amber-300 text-[9px] font-mono uppercase font-bold tracking-wider"
                >
                  DEMO / SAMPLE EVIDENCE
                </Badge>
              )}

              <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <span className="rounded bg-black/80 px-2 py-1 text-[10px] font-mono text-white flex items-center gap-1">
                  <Eye className="h-3 w-3" /> View Lightbox
                </span>
              </div>
            </div>

            <div className="p-2.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-mono font-bold text-amber-400 truncate max-w-[150px]">
                  {photo.id}
                </span>
                <span className="font-mono text-slate-500" suppressHydrationWarning>
                  {photo.createdAt ? new Date(photo.createdAt).toLocaleTimeString() : ""}
                </span>
              </div>

              {photo.description && (
                <p className="mt-1 text-xs text-slate-300 line-clamp-1 italic">
                  &ldquo;{photo.description}&rdquo;
                </p>
              )}

              <div className="mt-2 flex items-center justify-between border-t border-slate-800/80 pt-2 text-[10px]">
                <span className="text-slate-400">
                  By: <span className="font-semibold text-slate-200">{photo.capturedBy}</span>
                </span>
                <a
                  href={`/incident/${incidentId}`}
                  className="flex items-center gap-1 text-emerald-400 hover:underline font-mono"
                >
                  Audit Trail <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="relative max-h-[90vh] max-w-3xl w-full rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                {isDemoSample(selectedPhoto) ? (
                  <Badge
                    variant="outline"
                    className="border-amber-500/60 bg-amber-500/20 text-amber-300 text-[10px] font-mono uppercase font-bold tracking-wider mb-1"
                  >
                    DEMO / SAMPLE EVIDENCE • SYNTHETIC TEST ASSET
                  </Badge>
                ) : (
                  <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">
                    Verified Dock Evidence Record
                  </span>
                )}
                <h3 className="text-sm font-bold text-white">
                  {selectedPhoto.description || "Damaged Freight Evidence Photo"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="rounded p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-auto rounded bg-black flex items-center justify-center p-2 min-h-[300px]">
              {selectedPhoto.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedPhoto.previewUrl}
                  alt={selectedPhoto.description || "Evidence detail"}
                  className="max-h-[60vh] w-auto object-contain"
                />
              ) : (
                <div className="p-8 text-center text-slate-500 font-mono text-xs">
                  Storage Path: {selectedPhoto.storagePath}
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs border-t border-slate-800 pt-3">
              <div>
                <span className="text-[10px] text-slate-500 font-mono block">Record ID:</span>
                <span className="font-mono text-amber-400 font-bold truncate block">
                  {selectedPhoto.id}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-mono block">Captured By:</span>
                <span className="text-slate-200 font-bold">{selectedPhoto.capturedBy}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-mono block">Storage Location:</span>
                <span className="font-mono text-slate-300 text-[11px] truncate block">
                  {selectedPhoto.storagePath}
                </span>
              </div>
              <div className="flex items-center justify-end">
                {selectedPhoto.previewUrl && (
                  <a
                    href={selectedPhoto.previewUrl}
                    download={`evidence-${selectedPhoto.id}.jpg`}
                    className="flex items-center gap-1 text-xs text-slate-300 hover:text-white bg-slate-800 px-2.5 py-1.5 rounded"
                  >
                    <Download className="h-3 w-3" /> Download
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
