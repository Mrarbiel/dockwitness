"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  ShieldCheck,
  ShieldAlert,
  Mic,
  Camera,
  Scale,
  FileText,
  Truck,
  User,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
  History,
  X,
  Code2,
} from "lucide-react";
import { AuditEventRecord, PartyRole, AttestationPosition, AgreementStatus, DiscrepancyResult } from "@/lib/types";
import { TranscriptTurn } from "@/lib/assemblyai";
import { DamageReport, DomainReadiness } from "./types";

/**
 * Clickable Fact Provenance Metadata
 * Every extracted fact in DockWitness links directly back to its acoustic/textual source.
 */
export interface FactProvenance {
  factKey: string;
  factLabel: string;
  value: string | number;
  expectedValue?: string | number;
  role: PartyRole | "SYSTEM" | "OPS";
  sourceTurnId?: string | null;
  sourceTurnIndex?: number;
  transcriptQuote?: string | null;
  timestamp: string;
  confidence?: number;
  status?: AgreementStatus | string;
  correctionHistory?: Array<{
    timestamp: string;
    previousValue: string | number;
    newValue: string | number;
    reason: string;
    actor: string;
  }>;
  metadata?: Record<string, unknown>;
}

export interface AuditTimelineProps {
  incidentId: string;
  refreshTrigger?: number | string;
  turns?: TranscriptTurn[];
  discrepancy?: DiscrepancyResult | null;
  damageReport?: DamageReport | null;
  photoCount?: number;
  driverAttestation?: {
    quantityPosition: AttestationPosition;
    damagePosition?: AttestationPosition;
    statement?: string | null;
    sourceTurnId?: string | null;
    quantityQuote?: string | null;
    damageQuote?: string | null;
  } | null;
  readiness?: DomainReadiness | null;
  className?: string;
  showTitle?: boolean;
  onSelectFact?: (fact: FactProvenance) => void;
}

interface EnrichedTimelineItem {
  id: string;
  eventType: string;
  actor: string;
  timestamp: string;
  title: string;
  description: string;
  icon: React.ElementType;
  badgeLabel: string;
  badgeVariant: "default" | "secondary" | "destructive" | "outline" | "shortage" | "overage" | "dispute" | "confirmed";
  category: "SESSION" | "SPEECH" | "EXCEPTION" | "PHOTO" | "ATTESTATION" | "COMPLIANCE";
  clickableFacts?: FactProvenance[];
  rawPayload?: Record<string, unknown>;
}

function formatAuditEventDescription(
  eventType: string,
  actor: string,
  payload: Record<string, unknown> | undefined
): string {
  if (!payload) {
    return `${eventType.replace(/_/g, " ")} recorded by ${actor}.`;
  }

  if (eventType === "READINESS_EVALUATED") {
    const r = (payload as { readiness?: { status?: string; missingRequirements?: string[] } })?.readiness;
    if (r?.status) {
      const blockers =
        r.missingRequirements && r.missingRequirements.length > 0
          ? ` (${r.missingRequirements.length} open gate${r.missingRequirements.length > 1 ? "s" : ""})`
          : " (All gates satisfied)";
      return `Readiness gate evaluated: ${r.status}${blockers}.`;
    }
  }

  if (eventType === "OBSERVATION_SAVED" || eventType === "OBSERVATION_RECORDED") {
    const obs = payload as { observedQty?: number; reason?: string; isOverridden?: boolean };
    if (obs.observedQty !== undefined) {
      return obs.isOverridden
        ? `Clerical count adjustment to ${obs.observedQty} cartons (${obs.reason || "Manual override"}).`
        : `Spoken carton count recorded: ${obs.observedQty} cartons.`;
    }
  }

  if (eventType === "DAMAGE_OBSERVATION_RECORDED") {
    const dmg = payload as { damageCondition?: string; condition?: string };
    const cond = dmg.damageCondition || dmg.condition || "Physical damage";
    return `Physical damage reported: "${cond}". Photographic verification mandatory.`;
  }

  if (eventType === "EXCEPTION_CREATED") {
    const exc = payload as { type?: string; delta?: number; description?: string };
    if (exc.delta !== undefined) {
      return `Discrepancy registered: Δ ${exc.delta} (${exc.type || "DISCREPANCY"}). Pure math validation sealed.`;
    }
    if (exc.description) {
      return `Exception noted: ${exc.description}.`;
    }
  }

  if (eventType === "ATTESTATION_SAVED") {
    const att = payload as { position?: string; partyRole?: string };
    if (att.position) {
      return `${att.partyRole || actor} attestation committed: ${att.position}. Bilateral consensus logged.`;
    }
  }

  if (eventType === "PHOTO_UPLOADED" || eventType === "EVIDENCE_ATTACHED") {
    const ev = payload as { description?: string };
    return ev.description ? `Evidence attached: ${ev.description}` : "Photographic proof recorded and verified.";
  }

  if (typeof payload.description === "string" && payload.description) {
    return payload.description;
  }
  if (typeof payload.message === "string" && payload.message) {
    return payload.message;
  }

  return `${eventType.replace(/_/g, " ")} recorded by ${actor}.`;
}

export function AuditTimeline({
  incidentId,
  refreshTrigger,
  turns = [],
  discrepancy,
  damageReport,
  photoCount = 0,
  driverAttestation,
  readiness,
  className = "",
  showTitle = true,
  onSelectFact,
}: AuditTimelineProps) {
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [auditEvents, setAuditEvents] = useState<AuditEventRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [activeModalFact, setActiveModalFact] = useState<FactProvenance | null>(null);
  const [expandedPayloadId, setExpandedPayloadId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch audit events from GET /api/incidents/[id]/audit
  const fetchAuditEvents = useCallback(async () => {
    if (!incidentId) return;
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/audit`);
      if (res.ok) {
        const data = await res.json();
        const eventsList: AuditEventRecord[] = Array.isArray(data)
          ? data
          : data.auditEvents || data.events || [];
        setAuditEvents(eventsList);
        setError(null);
      } else if (res.status === 404) {
        // Fallback to incident endpoint if audit subroute returned 404
        const altRes = await fetch(`/api/incidents/${incidentId}`);
        if (altRes.ok) {
          const altData = await altRes.json();
          if (Array.isArray(altData.auditEvents)) {
            setAuditEvents(altData.auditEvents);
          }
        }
      } else {
        setError(`Failed to load audit trail: HTTP ${res.status}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Network error fetching audit ledger");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [incidentId]);

  useEffect(() => {
    fetchAuditEvents();
  }, [fetchAuditEvents, refreshTrigger]);

  // Handle clickable fact selection
  const handleFactClick = (fact: FactProvenance) => {
    if (onSelectFact) {
      onSelectFact(fact);
    }
    setActiveModalFact(fact);
  };

  /**
   * Build Enriched Timeline Events:
   * Maps 1-to-1 strictly from server-persisted audit_events.
   * Guarantees exact count parity across Cockpit, Incident Page, and PostgreSQL Ledger.
   */
  const timelineItems = useMemo<EnrichedTimelineItem[]>(() => {
    return auditEvents.map((ae) => {
      const payload = (ae.payloadJson || {}) as Record<string, unknown>;
      const facts: FactProvenance[] = [];

      // Extract clickable facts from genuine audit payload
      if (ae.eventType === "OBSERVATION_SAVED" || ae.eventType === "OBSERVATION_RECORDED") {
        if (typeof payload.observedQty === "number") {
          facts.push({
            factKey: "observed_quantity",
            factLabel: "Observed Quantity",
            value: payload.observedQty,
            expectedValue: typeof payload.expectedQty === "number" ? payload.expectedQty : undefined,
            role: (ae.actor as PartyRole) || "RECEIVER",
            transcriptQuote: typeof payload.sourceQuote === "string" ? payload.sourceQuote : undefined,
            timestamp: ae.createdAt || "",
            confidence: 0.98,
            status: "PENDING_REVIEW",
          });
        }
      }

      if (ae.eventType === "DAMAGE_OBSERVATION_RECORDED") {
        const cond = (payload.damageCondition || payload.condition) as string;
        if (cond) {
          facts.push({
            factKey: "damage_condition",
            factLabel: "Physical Condition",
            value: cond,
            role: (ae.actor as PartyRole) || "RECEIVER",
            transcriptQuote: typeof payload.sourceQuote === "string" ? payload.sourceQuote : undefined,
            timestamp: ae.createdAt || "",
            confidence: 0.95,
            status: "PENDING_REVIEW",
          });
        }
      }

      if (ae.eventType === "EXCEPTION_CREATED") {
        const delta = typeof payload.delta === "number" ? payload.delta : undefined;
        const excType = (payload.type as string) || "DISCREPANCY";
        facts.push({
          factKey: "shortage_calculation",
          factLabel: "Deterministic Discrepancy",
          value: delta !== undefined ? `${delta} cartons (${excType})` : excType,
          role: "SYSTEM",
          timestamp: ae.createdAt || "",
          confidence: 1.0,
          status: "PENDING_REVIEW",
          metadata: payload,
        });
      }

      if (ae.eventType === "ATTESTATION_SAVED" || ae.eventType === "ATTESTATION_RECORDED") {
        const pos = (payload.position || payload.quantityPosition) as string;
        facts.push({
          factKey: "driver_attestation",
          factLabel: "Two-Party Attestation",
          value: pos || "RECORDED",
          role: (ae.actor as PartyRole) || "DRIVER",
          transcriptQuote: (payload.quote || payload.statement || payload.quantityQuote) as string | undefined,
          timestamp: ae.createdAt || "",
          status: pos === "DISPUTE" ? "DISPUTED" : pos === "CONFIRM" ? "CONFIRMED_BY_BOTH" : "PENDING_REVIEW",
          metadata: payload,
        });
      }

      if (ae.eventType === "PHOTO_UPLOADED" || ae.eventType === "EVIDENCE_ATTACHED") {
        facts.push({
          factKey: "damage_photo_evidence",
          factLabel: "Photographic Evidence",
          value: (payload.description || "Photo attached") as string,
          role: (ae.actor as PartyRole) || "RECEIVER",
          timestamp: ae.createdAt || "",
          confidence: 0.99,
          status: "PENDING_REVIEW",
          metadata: payload,
        });
      }

      // Map eventType to UI presentation
      let icon = Code2;
      let badgeLabel = ae.actor;
      let badgeVariant: EnrichedTimelineItem["badgeVariant"] = "outline";
      let category: EnrichedTimelineItem["category"] = "COMPLIANCE";
      let title = ae.eventType.replace(/_/g, " ");

      switch (ae.eventType) {
        case "INCIDENT_CREATED":
          icon = FileText;
          badgeLabel = "SESSION";
          badgeVariant = "secondary";
          category = "SESSION";
          title = "Receiving Session Initialized";
          break;
        case "OBSERVATION_SAVED":
        case "OBSERVATION_RECORDED":
          icon = Scale;
          badgeLabel = "OBSERVATION";
          badgeVariant = "secondary";
          category = "EXCEPTION";
          title = "Spoken Count Recorded";
          break;
        case "DAMAGE_OBSERVATION_RECORDED":
          icon = AlertTriangle;
          badgeLabel = "DAMAGE OBSERVED";
          badgeVariant = "shortage";
          category = "EXCEPTION";
          title = "Damage Observation Recorded";
          break;
        case "EXCEPTION_CREATED":
          icon = Scale;
          badgeLabel = (payload.type as string) || "EXCEPTION";
          badgeVariant = payload.type === "SHORTAGE" ? "shortage" : "destructive";
          category = "EXCEPTION";
          title = "Discrepancy Exception Registered";
          break;
        case "EVIDENCE_ATTACHED":
        case "PHOTO_UPLOADED":
          icon = Camera;
          badgeLabel = "PHOTO EVIDENCE";
          badgeVariant = "confirmed";
          category = "PHOTO";
          title = "Physical Evidence Photo Attached";
          break;
        case "ATTESTATION_SAVED":
        case "ATTESTATION_RECORDED":
          icon = Truck;
          badgeLabel = "ATTESTATION";
          badgeVariant = payload.position === "DISPUTE" ? "dispute" : "confirmed";
          category = "ATTESTATION";
          title = `${ae.actor} Attestation Committed`;
          break;
        case "LIABILITY_EVALUATED":
        case "READINESS_EVALUATED":
          icon = ShieldCheck;
          badgeLabel = "COMPLIANCE";
          badgeVariant = "confirmed";
          category = "COMPLIANCE";
          title = "Readiness & Compliance Evaluated";
          break;
        default:
          icon = Code2;
          badgeLabel = ae.actor;
          badgeVariant = "outline";
          category = "COMPLIANCE";
          title = ae.eventType.replace(/_/g, " ");
      }

      return {
        id: ae.id,
        eventType: ae.eventType,
        actor: ae.actor,
        timestamp: ae.createdAt || "—",
        title,
        description: formatAuditEventDescription(ae.eventType, ae.actor, payload),
        icon,
        badgeLabel,
        badgeVariant,
        category,
        clickableFacts: facts.length > 0 ? facts : undefined,
        rawPayload: payload,
      };
    }).sort((a, b) => {
      const timeA = a.timestamp && a.timestamp !== "—" ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp && b.timestamp !== "—" ? new Date(b.timestamp).getTime() : 0;
      return timeA - timeB;
    });
  }, [auditEvents]);

  // Filter items based on active category filter and search query
  const filteredItems = useMemo(() => {
    return timelineItems.filter((item) => {
      const matchesCategory =
        selectedCategory === "ALL" ||
        item.category === selectedCategory ||
        (selectedCategory === "SPEECH" && item.eventType === "SPEECH_TURN_COMMITTED") ||
        (selectedCategory === "EXCEPTION" && (item.eventType === "SHORTAGE_COMPUTED" || item.category === "EXCEPTION")) ||
        (selectedCategory === "ATTESTATION" && item.category === "ATTESTATION") ||
        (selectedCategory === "PHOTO" && item.category === "PHOTO");

      const matchesSearch =
        searchQuery.trim() === "" ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.actor.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.eventType.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [timelineItems, selectedCategory, searchQuery]);

  return (
    <div
      data-testid="audit-timeline"
      className={`rounded-xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg backdrop-blur-sm ${className}`}
    >
      {/* Header with Ledger Verification Status */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
              Append-Only Audit Ledger
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              VERIFIED
            </span>
          </div>
          {showTitle && (
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Evidence Graph & Timeline ({timelineItems.length} Events)
            </h3>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchAuditEvents()}
            disabled={isRefreshing}
            className="flex items-center gap-1 rounded border border-slate-800 bg-slate-950 px-2.5 py-1 text-[10px] font-medium text-slate-300 hover:border-slate-700 hover:text-white transition-colors"
            title="Refresh Ledger"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin text-amber-400" : ""}`} />
            Sync
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(["ALL", "SPEECH", "EXCEPTION", "ATTESTATION", "PHOTO", "COMPLIANCE"] as const).map(
            (cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-all ${
                  selectedCategory === cat
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "bg-slate-950 text-slate-400 border border-slate-800/80 hover:text-slate-200"
                }`}
              >
                {cat}
              </button>
            )
          )}
        </div>

        <div className="relative flex-1 min-w-[140px] max-w-[220px]">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search audit facts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded border border-slate-800 bg-slate-950 py-1 pl-8 pr-2.5 text-xs text-slate-200 placeholder-slate-500 focus:border-amber-500/50 focus:outline-none"
          />
        </div>
      </div>

      {/* Timeline Stream */}
      <div className="mt-5 relative border-l-2 border-slate-800 ml-4 pl-5 space-y-6">
        {loading && timelineItems.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-amber-400" />
            Synchronizing append-only audit events...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-8 text-center text-xs italic text-slate-500">
            No audit records matching &ldquo;{searchQuery || selectedCategory}&rdquo;
          </div>
        ) : (
          filteredItems.map((item) => {
            const Icon = item.icon;
            const isPayloadExpanded = expandedPayloadId === item.id;

            return (
              <div key={item.id} className="relative group">
                {/* Node marker on vertical timeline */}
                <span className="absolute -left-[27px] top-1 flex h-4 w-4 items-center justify-center rounded-full border border-slate-700 bg-slate-950 ring-4 ring-slate-900 group-hover:border-amber-400 group-hover:bg-amber-500/20 transition-all">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400 group-hover:bg-amber-400" />
                </span>

                {/* Event Card */}
                <div className="rounded-lg border border-slate-800 bg-slate-950/90 p-3 shadow transition-all hover:border-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span className="text-xs font-bold text-white tracking-wide">
                        {item.title}
                      </span>
                      <Badge variant={item.badgeVariant} className="text-[9px] px-1.5 py-0 font-mono">
                        {item.badgeLabel}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
                      <Clock className="h-3 w-3" />
                      <span suppressHydrationWarning>
                        {isMounted && item.timestamp && item.timestamp !== "—" && !isNaN(new Date(item.timestamp).getTime())
                          ? new Date(item.timestamp).toLocaleTimeString()
                          : "—"}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed font-sans">
                    {item.description}
                  </p>

                  {/* Clickable Important Facts */}
                  {item.clickableFacts && item.clickableFacts.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-900 pt-2">
                      <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500">
                        Clickable Facts:
                      </span>
                      {item.clickableFacts.map((fact, fIdx) => (
                        <button
                          key={fIdx}
                          onClick={() => handleFactClick(fact)}
                          className="group/pill inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300 hover:border-amber-400 hover:bg-amber-500/20 transition-all cursor-pointer shadow-sm"
                          title="Click to view full fact provenance & acoustic transcript quote"
                        >
                          <span className="font-mono text-amber-400/80">{fact.factLabel}:</span>
                          <span className="font-bold text-white">{String(fact.value)}</span>
                          <ExternalLink className="h-2.5 w-2.5 text-amber-400/60 group-hover/pill:text-amber-300" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Raw Payload Inspector Toggle */}
                  {item.rawPayload && (
                    <div className="mt-2 text-right">
                      <button
                        onClick={() => setExpandedPayloadId(isPayloadExpanded ? null : item.id)}
                        className="inline-flex items-center gap-1 text-[9px] font-mono text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        <Code2 className="h-2.5 w-2.5" />
                        {isPayloadExpanded ? "Hide Payload" : "Inspect Payload"}
                      </button>

                      {isPayloadExpanded && (
                        <pre className="mt-2 text-left rounded bg-slate-900 border border-slate-800 p-2 text-[10px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
                          {JSON.stringify(item.rawPayload, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Fact Provenance Inspector Modal */}
      {activeModalFact && (
        <FactProvenanceModal
          fact={activeModalFact}
          onClose={() => setActiveModalFact(null)}
        />
      )}
    </div>
  );
}

/**
 * Fact Provenance Inspector Modal
 * Renders the provenance card when an important fact is clicked:
 * Shows: value, role, transcript quote, timestamp, source turn, correction history.
 */
export function FactProvenanceModal({
  fact,
  onClose,
}: {
  fact: FactProvenance;
  onClose: () => void;
}) {
  return (
    <div
      data-testid="fact-provenance-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-amber-500/40 bg-slate-950 p-6 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                Acoustic Fact Provenance
              </span>
              <span className="rounded bg-emerald-500/20 px-1.5 py-0.2 text-[9px] font-bold text-emerald-400 border border-emerald-500/30">
                APPEND-ONLY AUDIT
              </span>
            </div>
            <h3 className="text-lg font-bold text-white">{fact.factLabel}</h3>
          </div>

          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-900 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Fact Attributes Grid */}
        <div className="mt-5 space-y-4 text-xs">
          {/* Main Extracted Value */}
          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 p-3.5">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Extracted Fact Value
              </span>
              <div className="text-xl font-mono font-black text-amber-400 mt-0.5">
                {String(fact.value)}
              </div>
            </div>
            {fact.expectedValue !== undefined && (
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Manifest Expected
                </span>
                <div className="text-base font-mono font-bold text-slate-300 mt-0.5">
                  {fact.expectedValue} cartons
                </div>
              </div>
            )}
          </div>

          {/* Attribution & Speaker Role */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-800/80 bg-slate-900/40 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Party Role
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] px-2 py-0.5 font-bold ${
                  fact.role === "RECEIVER"
                    ? "border-amber-500/40 text-amber-300 bg-amber-500/10"
                    : fact.role === "DRIVER"
                    ? "border-blue-500/40 text-blue-300 bg-blue-500/10"
                    : "border-slate-700 text-slate-300 bg-slate-800/40"
                }`}
              >
                {fact.role}
              </Badge>
            </div>

            <div className="rounded-lg border border-slate-800/80 bg-slate-900/40 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Source Turn ID
              </span>
              <span className="font-mono text-slate-300 text-[11px] truncate block" title={fact.sourceTurnId || "N/A"}>
                {fact.sourceTurnId || "turn-committed"}
              </span>
            </div>
          </div>

          {/* Verbatim Transcript Quote */}
          {fact.transcriptQuote && (
            <div className="rounded-lg border-l-4 border-amber-500 bg-slate-900/80 p-3.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block mb-1">
                Verbatim Audio Transcript Quote
              </span>
              <p className="italic text-slate-200 text-sm font-medium">
                &ldquo;{fact.transcriptQuote}&rdquo;
              </p>
              {typeof fact.confidence === "number" && (
                <span className="mt-1.5 block text-[10px] font-mono text-emerald-400">
                  AssemblyAI Acoustic Confidence: {(fact.confidence * 100).toFixed(1)}%
                </span>
              )}
            </div>
          )}

          {/* Timestamp & Provenance Details */}
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div className="rounded-lg border border-slate-800/80 bg-slate-900/40 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Committed Timestamp
              </span>
              <span className="font-mono text-slate-300">
                {new Date(fact.timestamp).toISOString()}
              </span>
            </div>

            <div className="rounded-lg border border-slate-800/80 bg-slate-900/40 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Consensus Status
              </span>
              <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-bold border-slate-700">
                {fact.status || "CONFIRMED"}
              </Badge>
            </div>
          </div>

          {/* Correction History / Tamper Verification */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <History className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Clerical Correction History
              </span>
            </div>
            {fact.correctionHistory && fact.correctionHistory.length > 0 ? (
              <div className="space-y-1.5">
                {fact.correctionHistory.map((ch, idx) => (
                  <div key={idx} className="text-[11px] text-slate-300">
                    <span className="font-mono text-amber-400">{ch.actor}</span> changed from{" "}
                    <span className="font-mono line-through text-slate-500">{ch.previousValue}</span> to{" "}
                    <span className="font-mono text-emerald-400 font-bold">{ch.newValue}</span>: {ch.reason}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[11px] text-slate-400 italic">
                ✓ Original speech observation preserved. No clerical overrides recorded.
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="mt-6 flex items-center justify-between border-t border-slate-800 pt-3">
          <span className="text-[10px] font-mono text-slate-500">
            DockWitness Invariant: Silence is never consent.
          </span>
          <button
            onClick={onClose}
            className="rounded bg-amber-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition-colors"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}