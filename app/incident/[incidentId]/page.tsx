"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { AuditTimeline, FactProvenanceModal, FactProvenance } from "@/components/evidence";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface PageProps {
  params: Promise<{
    incidentId: string;
  }>;
}

export default function IncidentPage({ params }: PageProps) {
  const routeParams = useParams();
  const rawId = typeof routeParams?.incidentId === "string" ? routeParams.incidentId : "";
  const [resolvedIncidentId, setResolvedIncidentId] = useState<string>(rawId);
  const [selectedFact, setSelectedFact] = useState<FactProvenance | null>(null);

  useEffect(() => {
    if (rawId) {
      setResolvedIncidentId(rawId);
    } else if (params && typeof (params as any).then === "function") {
      params.then((p) => {
        if (p?.incidentId) setResolvedIncidentId(p.incidentId);
      });
    }
  }, [rawId, params]);

  const incidentId = resolvedIncidentId || rawId;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Navigation and Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <Link
            href="/operations"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Operations
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
              Evidence Record & Append-Only Audit Ledger
            </span>
            <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
              APPEND-ONLY AUDIT
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-1">
            Incident: {incidentId}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Chronological Audit Timeline • Append-only database ledger
          </p>
        </div>

        <div className="text-right">
          <span className="text-[10px] font-mono text-slate-400 block">
            Database Append-Only Ledger State
          </span>
          <span className="text-xs font-mono font-bold text-emerald-400">
            POSTGRESQL APPEND_ONLY
          </span>
        </div>
      </div>

      {/* Main Timeline Display */}
      <div className="mt-8">
        <AuditTimeline
          incidentId={incidentId}
          showTitle={true}
          onSelectFact={(fact) => setSelectedFact(fact)}
        />
      </div>

      {/* Provenance Inspector Modal */}
      {selectedFact && (
        <FactProvenanceModal
          fact={selectedFact}
          onClose={() => setSelectedFact(null)}
        />
      )}
    </div>
  );
}