"use client";

import { Shipment } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Truck, FileText, Hash, Warehouse } from "lucide-react";

interface ManifestCardProps {
  shipment: Shipment;
  dockDoor?: string;
}

export function ManifestCard({ shipment, dockDoor = "Dock Door #4" }: ManifestCardProps) {
  const item = shipment.items[0];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-md">
      {/* Header Info */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3.5">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
            Shipment Manifest
          </span>
          <h2 className="text-xl font-bold text-white tracking-tight">
            PO #{shipment.poNumber}
          </h2>
        </div>
        <Badge
          variant="outline"
          className="border-slate-700 bg-slate-800 text-xs font-semibold text-slate-300 uppercase"
        >
          {shipment.status}
        </Badge>
      </div>

      {/* Carrier & Equipment Metadata Grid */}
      <div className="mt-3.5 grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-2 rounded bg-slate-950/50 p-2 border border-slate-800/80">
          <Truck className="h-3.5 w-3.5 text-slate-400" />
          <div className="truncate">
            <div className="text-[10px] text-slate-500 uppercase">Carrier</div>
            <div className="font-semibold text-slate-200 truncate">{shipment.carrierName}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded bg-slate-950/50 p-2 border border-slate-800/80">
          <FileText className="h-3.5 w-3.5 text-slate-400" />
          <div className="truncate">
            <div className="text-[10px] text-slate-500 uppercase">BOL #</div>
            <div className="font-mono font-semibold text-slate-200">{shipment.bolNumber}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded bg-slate-950/50 p-2 border border-slate-800/80">
          <Hash className="h-3.5 w-3.5 text-slate-400" />
          <div className="truncate">
            <div className="text-[10px] text-slate-500 uppercase">Trailer #</div>
            <div className="font-mono font-semibold text-slate-200">{shipment.trailerNumber}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded bg-slate-950/50 p-2 border border-slate-800/80">
          <Warehouse className="h-3.5 w-3.5 text-emerald-400" />
          <div className="truncate">
            <div className="text-[10px] text-slate-500 uppercase">Location</div>
            <div className="font-semibold text-emerald-400">{dockDoor}</div>
          </div>
        </div>
      </div>

      {/* Manifest Line Item */}
      {item && (
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono font-bold text-amber-400">
              SKU: {item.sku}
            </span>
            <Badge
              variant="outline"
              className="border-slate-700 bg-slate-800 text-[10px] text-slate-400"
            >
              MANIFEST EXPECTED
            </Badge>
          </div>

          <p className="mt-1 text-xs text-slate-300">{item.description}</p>

          <div className="mt-3 flex items-baseline gap-2 border-t border-slate-900 pt-3">
            <span className="text-3xl font-black tracking-tight text-white font-mono">
              {item.expectedQty}
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {item.unit}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
