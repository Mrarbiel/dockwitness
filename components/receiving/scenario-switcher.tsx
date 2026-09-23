"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export const CANONICAL_SCENARIOS = [
  {
    po: "44880",
    id: "shipment-po44880",
    label: "Clean Receipt",
    expectedQty: 50,
    unit: "cartons",
  },
  {
    po: "44891",
    id: "shipment-po44891",
    label: "Golden Shortage",
    expectedQty: 48,
    unit: "cartons",
  },
  {
    po: "44902",
    id: "shipment-po44902",
    label: "Overage",
    expectedQty: 30,
    unit: "cartons",
  },
  {
    po: "44913",
    id: "shipment-po44913",
    label: "Damage Inspection",
    expectedQty: 60,
    unit: "cartons",
  },
  {
    po: "44924",
    id: "shipment-po44924",
    label: "Two-Party Dispute",
    expectedQty: 25,
    unit: "cartons",
  },
];

interface ScenarioSwitcherProps {
  currentShipmentId: string;
}

export function ScenarioSwitcher({ currentShipmentId }: ScenarioSwitcherProps) {
  const cleanCurrent = currentShipmentId
    .toLowerCase()
    .replace(/^shipment-/, "")
    .replace(/^po-?/, "");

  return (
    <div
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      className="flex items-center gap-1.5 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/80 p-1.5 scrollbar-none max-w-full"
    >
      <span className="shrink-0 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        Demo Scenarios:
      </span>
      <div className="flex items-center gap-1 shrink-0">
        {CANONICAL_SCENARIOS.map((sc) => {
          const isActive =
            currentShipmentId.toLowerCase() === sc.id.toLowerCase() ||
            cleanCurrent === sc.po;

          return (
            <Link
              key={sc.id}
              href={`/receive/${sc.id}`}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                  : "text-slate-400 hover:bg-slate-850 hover:text-slate-200 border border-transparent"
              }`}
              title={`${sc.label} (${sc.expectedQty} ${sc.unit})`}
            >
              <span>PO {sc.po}</span>
              <span className={`text-[10px] font-mono ${isActive ? "text-amber-400/80" : "text-slate-500"}`}>
                ({sc.expectedQty})
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
