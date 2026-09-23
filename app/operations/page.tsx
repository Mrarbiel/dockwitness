"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Truck,
  AlertCircle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Layers,
  ArrowUpDown,
  FileText,
  Camera,
  User,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SEED_SHIPMENTS } from "@/lib/seeds/shipments";
import { Shipment, Incident, AgreementStatus } from "@/lib/types";

interface EnrichedManifest {
  shipment: Shipment;
  incidentId: string | null;
  incidentNumber: string | null;
  expectedQty: number;
  observedQty: number | null;
  delta: number | null;
  discrepancyType: "SHORTAGE" | "OVERAGE" | "MATCH" | "PENDING";
  hasDamage: boolean;
  damageDescription: string | null;
  agreementStatus: AgreementStatus;
  driverPosition: string;
  photoCount: number;
  readinessStatus: "READY_FOR_OPS_REVIEW" | "BLOCKED_PHOTO_REQUIRED" | "IN_PROGRESS" | "CLEAN" | "AWAITING_INSPECTION";
  lastUpdated: string;
}

export default function OperationsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [carrierFilter, setCarrierFilter] = useState<string>("ALL");
  const [manifestsData, setManifestsData] = useState<EnrichedManifest[]>([]);
  const [kpisData, setKpisData] = useState<{
    totalActiveExceptions: number;
    totalDisputedRecords: number;
    totalReadyForReview: number;
    totalCartonsHandled: number;
    totalScheduledVolume?: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Fetch dynamic aggregated operations data from API
  useEffect(() => {
    let mounted = true;
    async function loadOperations() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/operations?t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          if (mounted && Array.isArray(data.manifests)) {
            setManifestsData(data.manifests);
            if (data.kpis) setKpisData(data.kpis);
            return;
          }
        }
      } catch (e) {
        // Fallback gracefully to dynamic calculation below
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    loadOperations();
    return () => {
      mounted = false;
    };
  }, [refreshTrigger]);

  // Aggregate enriched manifests dynamically from API response or seed fallback
  const enrichedManifests: EnrichedManifest[] = useMemo(() => {
    if (manifestsData.length > 0) return manifestsData;

    return SEED_SHIPMENTS.map((shipment) => {
      const expected = shipment.items?.[0]?.expectedQty ?? 48;

      return {
        shipment,
        incidentId: null,
        incidentNumber: null,
        expectedQty: expected,
        observedQty: null,
        delta: null,
        discrepancyType: "PENDING",
        hasDamage: false,
        damageDescription: null,
        agreementStatus: "PENDING_REVIEW",
        driverPosition: "NOT_ASKED",
        photoCount: 0,
        readinessStatus: "AWAITING_INSPECTION",
        lastUpdated: "Not Inspected",
      };
    });
  }, [manifestsData]);

  // Operational KPI calculations
  const totalActiveExceptions =
    kpisData?.totalActiveExceptions ??
    enrichedManifests.filter((m) => (m.delta !== null && m.delta !== 0) || m.hasDamage).length;

  const totalDisputedRecords =
    kpisData?.totalDisputedRecords ??
    enrichedManifests.filter((m) => m.agreementStatus === "DISPUTED").length;

  const totalReadyForReview =
    kpisData?.totalReadyForReview ??
    enrichedManifests.filter(
      (m) => m.readinessStatus === "READY_FOR_OPS_REVIEW" || m.readinessStatus === "CLEAN"
    ).length;

  // Real observed throughput: count only observed cartons
  const totalCartonsHandled =
    kpisData?.totalCartonsHandled ??
    enrichedManifests.reduce((acc, m) => acc + (m.observedQty ?? 0), 0);

  const totalScheduledVolume =
    kpisData?.totalScheduledVolume ??
    enrichedManifests.reduce((acc, m) => acc + m.expectedQty, 0);

  const uniqueCarriers = useMemo(() => {
    return Array.from(new Set(enrichedManifests.map((m) => m.shipment?.carrierName))).filter(Boolean).sort();
  }, [enrichedManifests]);

  const disputedManifests = useMemo(() => {
    return enrichedManifests.filter((m) => m.agreementStatus === "DISPUTED");
  }, [enrichedManifests]);

  // Filter and search
  const filteredManifests = useMemo(() => {
    return enrichedManifests.filter((m) => {
      const matchesSearch =
        m.shipment.poNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.shipment.bolNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.shipment.carrierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.shipment.trailerNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.shipment.items?.[0]?.sku || "").toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "ALL"
          ? true
          : statusFilter === "DISPUTED"
          ? m.agreementStatus === "DISPUTED"
          : statusFilter === "EXCEPTIONS"
          ? (m.delta !== null && m.delta !== 0) || m.hasDamage
          : statusFilter === "READY"
          ? m.readinessStatus === "READY_FOR_OPS_REVIEW"
          : statusFilter === "CLEAN"
          ? m.delta === 0 && !m.hasDamage
          : true;

      const matchesCarrier =
        carrierFilter === "ALL" ? true : m.shipment.carrierName === carrierFilter;

      return matchesSearch && matchesStatus && matchesCarrier;
    });
  }, [enrichedManifests, searchQuery, statusFilter, carrierFilter]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Header & Terminal Status Bar */}
      <div className="flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">
              Operations Control Terminal
            </span>
            <span className="text-slate-600">&bull;</span>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              POSTGRES / DB SYNCED
            </span>
            <span className="text-slate-600">&bull;</span>
            <span className="text-[10px] font-mono text-slate-400">
              5 ACTIVE RECEIVING BAYS
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white md:text-3xl mt-1">
            Operations Manager Dashboard
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setRefreshTrigger((c) => c + 1)}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/90 px-3.5 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-600 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh State</span>
          </button>
          <Link
            href="/receive/shipment-po44891"
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-400 shadow-md shadow-amber-500/20"
          >
            <Truck className="h-3.5 w-3.5 fill-slate-950" />
            <span>Launch Receiving Cockpit</span>
          </Link>
        </div>
      </div>

      {/* KPI Metrics Summary Cards */}
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Active Exceptions */}
        <div className="rounded-xl border border-amber-500/30 bg-slate-900/60 p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
              Active Exceptions
            </span>
            <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/20">
              ATTENTION
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{totalActiveExceptions}</span>
            <span className="text-xs text-slate-400 font-mono">manifests with delta</span>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Shortages, overages, or visible carton damages detected at bays.
          </p>
        </div>

        {/* KPI 2: Disputed Records */}
        <div className="rounded-xl border border-rose-500/30 bg-slate-900/60 p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
              Disputed Records
            </span>
            <span className="rounded bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-400 border border-rose-500/20">
              YARD HOLD
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-rose-400">{totalDisputedRecords}</span>
            <span className="text-xs text-slate-400 font-mono">carrier disputes</span>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Receiver and Driver positions in direct bilateral disagreement.
          </p>
        </div>

        {/* KPI 3: Ready for Review */}
        <div className="rounded-xl border border-emerald-500/30 bg-slate-900/60 p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
              Ready for Review
            </span>
            <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
              GATED PASS
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-400">{totalReadyForReview}</span>
            <span className="text-xs text-slate-400 font-mono">evidence complete</span>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Photos verified & driver statements captured. Ready for sign-off.
          </p>
        </div>

        {/* KPI 4: Total Volume */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
              Dock Throughput
            </span>
            <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-slate-300">
              TODAY
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{totalCartonsHandled}</span>
            <span className="text-xs text-slate-400 font-mono">
              cartons handled ({totalScheduledVolume} scheduled)
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Real observed volume handled across active dock manifests.
          </p>
        </div>
      </div>

      {/* Disputed Yard Alert Banner */}
      {totalDisputedRecords > 0 && (
        <div className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-white">
                  Active Yard Disagreement: {disputedManifests.map((m) => `PO #${m.shipment.poNumber}`).join(" & ") || "Disputed Manifests"} Require Manager Review
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Drivers contested counted shortages prior to departure. Bilateral quotes and physical evidence are locked in the ledger.
                </p>
              </div>
            </div>
            <Link
              href={disputedManifests[0] ? `/incident/${disputedManifests[0].incidentId}` : "/receive/shipment-po44891"}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-400 hover:text-rose-300 shrink-0"
            >
              <span>Inspect {disputedManifests[0] ? `PO ${disputedManifests[0].shipment.poNumber}` : "Active"} Audit Ledger</span>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-4">
        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "ALL", label: "All Manifests" },
            { id: "DISPUTED", label: "Disputed Records" },
            { id: "EXCEPTIONS", label: "Exceptions Only" },
            { id: "READY", label: "Ready for Review" },
            { id: "CLEAN", label: "Clean Receipts" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                statusFilter === tab.id
                  ? "bg-amber-500 text-slate-950 shadow"
                  : "bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search and Carrier Filter */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Filter PO, Carrier, BOL..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48 sm:w-64 rounded-lg border border-slate-800 bg-slate-900/90 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <select
            value={carrierFilter}
            onChange={(e) => setCarrierFilter(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-300 focus:border-amber-500 focus:outline-none"
          >
            <option value="ALL">All Carriers ({enrichedManifests.length})</option>
            {uniqueCarriers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Desktop & Tablet Manifests Table */}
      <div className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/80 font-mono text-[11px] text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">PO & Manifest</th>
                <th className="px-5 py-3.5">Carrier & Trailer</th>
                <th className="px-5 py-3.5">Quantity (Exp / Obs)</th>
                <th className="px-5 py-3.5">Discrepancy State</th>
                <th className="px-5 py-3.5">Damage & Photos</th>
                <th className="px-5 py-3.5">Agreement Matrix</th>
                <th className="px-5 py-3.5">Readiness Gate</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filteredManifests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <p className="font-mono text-sm">No manifests match the active filter criteria.</p>
                  </td>
                </tr>
              ) : (
                filteredManifests.map((row) => (
                  <tr
                    key={row.shipment.id}
                    className="hover:bg-slate-800/40 transition-colors group"
                  >
                    {/* PO & Manifest */}
                    <td className="px-5 py-4">
                      <div className="font-bold text-white text-sm">
                        PO #{row.shipment.poNumber}
                      </div>
                      <div className="font-mono text-[11px] text-slate-400">
                        BOL: {row.shipment.bolNumber}
                      </div>
                    </td>

                    {/* Carrier & Trailer */}
                    <td className="px-5 py-4">
                      <div className="font-medium text-slate-200">
                        {row.shipment.carrierName}
                      </div>
                      <div className="font-mono text-[11px] text-slate-400">
                        TRL: {row.shipment.trailerNumber}
                      </div>
                    </td>

                    {/* Quantity (Exp / Obs) */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-slate-400">Exp: {row.expectedQty}</span>
                        <span className="text-slate-600">/</span>
                        <span className="font-bold text-white">
                          Obs: {row.observedQty !== null ? row.observedQty : "--"}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {row.shipment.items?.[0]?.description || "Freight items"}
                      </div>
                    </td>

                    {/* Discrepancy State */}
                    <td className="px-5 py-4">
                      {row.delta === null ? (
                        <Badge variant="outline" className="border-slate-700 text-slate-400">
                          PENDING COUNT
                        </Badge>
                      ) : row.delta < 0 ? (
                        <Badge className="bg-rose-500/20 text-rose-400 border border-rose-500/40 font-mono font-bold">
                          SHORTAGE ({row.delta})
                        </Badge>
                      ) : row.delta > 0 ? (
                        <Badge className="bg-sky-500/20 text-sky-400 border border-sky-500/40 font-mono font-bold">
                          OVERAGE (+{row.delta})
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">
                          MATCH (0)
                        </Badge>
                      )}
                    </td>

                    {/* Damage & Photos */}
                    <td className="px-5 py-4">
                      {row.hasDamage ? (
                        <div>
                          <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/30">
                            DAMAGE RECORDED
                          </span>
                          <div className="mt-1 flex items-center gap-1 text-[11px] font-mono text-slate-400">
                            <Camera className="h-3 w-3 text-slate-400" />
                            <span>{row.photoCount} Photo Verified</span>
                          </div>
                        </div>
                      ) : row.observedQty === null ? (
                        <span className="text-slate-500 font-mono text-[11px]">
                          Not Inspected
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono text-[11px]">
                          Zero Visible Damage
                        </span>
                      )}
                    </td>

                    {/* Agreement Matrix */}
                    <td className="px-5 py-4">
                      {row.agreementStatus === "DISPUTED" ? (
                        <div>
                          <Badge className="bg-rose-500/20 text-rose-400 border border-rose-500/40 font-bold">
                            DISPUTED
                          </Badge>
                          <div className="mt-0.5 text-[10px] font-mono text-slate-400">
                            Driver: Contested
                          </div>
                        </div>
                      ) : row.agreementStatus === "CONFIRMED_BY_BOTH" ? (
                        <div>
                          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold">
                            CONFIRMED BOTH
                          </Badge>
                          <div className="mt-0.5 text-[10px] font-mono text-slate-400">
                            Driver: Attested
                          </div>
                        </div>
                      ) : (
                        <Badge variant="outline" className="border-slate-700 text-slate-400">
                          {row.agreementStatus}
                        </Badge>
                      )}
                    </td>

                    {/* Readiness Gate */}
                    <td className="px-5 py-4">
                      {row.readinessStatus === "READY_FOR_OPS_REVIEW" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="h-3 w-3" />
                          READY FOR REVIEW
                        </span>
                      ) : row.readinessStatus === "CLEAN" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-[10px] font-mono text-slate-300 border border-slate-700">
                          CLEAN HANDSHAKE
                        </span>
                      ) : row.readinessStatus === "AWAITING_INSPECTION" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/80 px-2.5 py-1 text-[10px] font-mono text-slate-400 border border-slate-700/60">
                          AWAITING INTAKE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-400 border border-amber-500/20">
                          IN PROGRESS
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/receive/${row.shipment.id}`}
                          className="rounded bg-slate-800 px-2.5 py-1 text-xs font-bold text-amber-400 hover:bg-amber-500 hover:text-slate-950 transition-colors"
                        >
                          Cockpit
                        </Link>
                        {row.incidentId ? (
                          <Link
                            href={`/incident/${row.incidentId}`}
                            className="rounded border border-slate-700 bg-slate-900/60 p-1 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
                            title="View Append-Only Audit Ledger"
                          >
                            <FileText className="h-4 w-4" />
                          </Link>
                        ) : (
                          <span
                            className="rounded border border-slate-800/60 bg-slate-950/40 p-1 text-slate-600 cursor-not-allowed opacity-40"
                            title="No incident recorded yet"
                          >
                            <FileText className="h-4 w-4" />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Terminal Ledger Verification Strip */}
      <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/40 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-500/10 p-2 border border-emerald-500/20 text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
              Database Ledger Integrity Status
            </h4>
            <p className="text-xs text-slate-400">
              Audit events protected by PostgreSQL BEFORE UPDATE/DELETE immutability triggers. Append-only enforcement active.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
          <span>STORAGE: APPEND_ONLY</span>
          <span className="text-slate-700">|</span>
          <span className="text-emerald-400 font-bold">100% AUDITABLE</span>
        </div>
      </div>
    </div>
  );
}