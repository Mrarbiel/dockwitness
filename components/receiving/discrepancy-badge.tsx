"use client";

import { Badge } from "@/components/ui/badge";
import { DiscrepancyResult } from "@/lib/types";
import { CheckCircle2, AlertTriangle, PlusCircle, Clock } from "lucide-react";

interface DiscrepancyBadgeProps {
  discrepancy: DiscrepancyResult | null;
  unit?: string;
  isOverridden?: boolean;
}

export function DiscrepancyBadge({
  discrepancy,
  unit = "cartons",
  isOverridden = false,
}: DiscrepancyBadgeProps) {
  if (!discrepancy) {
    return (
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className="flex items-center gap-1.5 border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-semibold text-slate-400"
        >
          <Clock className="h-3.5 w-3.5 text-slate-400" />
          AWAITING RECEIVER COUNT
        </Badge>
      </div>
    );
  }

  if (discrepancy.type === null || discrepancy.delta === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="confirmed"
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold uppercase tracking-wider"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          CONFIRMED MATCH (0)
        </Badge>
        {isOverridden && (
          <Badge
            variant="outline"
            className="border-amber-500/40 bg-amber-500/10 text-[10px] font-bold text-amber-400"
          >
            CLERK OVERRIDDEN
          </Badge>
        )}
      </div>
    );
  }

  if (discrepancy.type === "SHORTAGE") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="shortage"
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold uppercase tracking-wider"
        >
          <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
          SHORTAGE: {Math.abs(discrepancy.delta)} {unit}
        </Badge>
        {isOverridden && (
          <Badge
            variant="outline"
            className="border-amber-500/40 bg-amber-500/10 text-[10px] font-bold text-amber-400"
          >
            CLERK OVERRIDDEN
          </Badge>
        )}
      </div>
    );
  }

  if (discrepancy.type === "OVERAGE") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="overage"
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold uppercase tracking-wider"
        >
          <PlusCircle className="h-3.5 w-3.5 text-blue-400" />
          OVERAGE: {discrepancy.delta} {unit}
        </Badge>
        {isOverridden && (
          <Badge
            variant="outline"
            className="border-amber-500/40 bg-amber-500/10 text-[10px] font-bold text-amber-400"
          >
            CLERK OVERRIDDEN
          </Badge>
        )}
      </div>
    );
  }

  return null;
}
