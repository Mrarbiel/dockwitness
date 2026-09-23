import Link from "next/link";
import {
  Mic,
  ShieldCheck,
  Cpu,
  Truck,
  ArrowRight,
  Play,
  FileCheck,
  AlertTriangle,
  Lock,
  Layers,
  CheckCircle2,
  Terminal,
  Clock,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { SEED_SHIPMENTS } from "@/lib/seeds/shipments";

export default function HomePage() {
  const seedList = [
    {
      po: "44891",
      id: "shipment-po44891",
      title: "Scenario 1: Golden Demo (PO 44891)",
      scenarioBadge: "RECOMMENDED DEMO",
      badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/40",
      description: "Shortage (-1 carton) + Visible Damage (Carton 31) + Driver Disputes Shortage.",
      expected: 48,
      carrier: "NorthStar Freight",
      trailer: "NST-2208",
      status: "DISPUTED",
    },
    {
      po: "44880",
      id: "shipment-po44880",
      title: "Scenario 2: Clean Receipt (PO 44880)",
      scenarioBadge: "CLEAN HANDSHAKE",
      badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
      description: "Expected 50, Observed 50. Zero damage. Clean bilateral agreement.",
      expected: 50,
      carrier: "NorthStar Freight",
      trailer: "NST-2100",
      status: "AGREED_MATCH",
    },
    {
      po: "44902",
      id: "shipment-po44902",
      title: "Scenario 3: Overage Receipt (PO 44902)",
      scenarioBadge: "OVERAGE (+2)",
      badgeColor: "bg-sky-500/20 text-sky-300 border-sky-500/40",
      description: "Expected 30, Observed 32 cartons. Driver confirms extra freight.",
      expected: 30,
      carrier: "Midwest Express",
      trailer: "MWE-4411",
      status: "CONFIRMED_OVERAGE",
    },
    {
      po: "44913",
      id: "shipment-po44913",
      title: "Scenario 4: Damage Photo Gate (PO 44913)",
      scenarioBadge: "PHOTO GATE",
      badgeColor: "bg-purple-500/20 text-purple-300 border-purple-500/40",
      description: "Carton 14 punctured. Hard evidence gate blocks review until photo attached.",
      expected: 60,
      carrier: "Apex Logistics",
      trailer: "APX-8820",
      status: "BLOCKED_PHOTO_REQ",
    },
    {
      po: "44924",
      id: "shipment-po44924",
      title: "Scenario 5: Two-Party Dispute (PO 44924)",
      scenarioBadge: "TWO-PARTY DISPUTE",
      badgeColor: "bg-rose-500/20 text-rose-300 border-rose-500/40",
      description: "Expected 25, Observed 24. Driver disputes count citing intact door seal.",
      expected: 25,
      carrier: "Eagle Freight",
      trailer: "EAG-1090",
      status: "DISPUTED",
    },
  ];

  return (
    <div className="relative overflow-hidden">
      {/* Background Industrial Grid Texture */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#1e293b12_1px,transparent_1px),linear-gradient(to_bottom,#1e293b12_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

      {/* Top Industrial Telemetry Strip */}
      <div className="border-b border-slate-800/80 bg-slate-900/40 px-4 py-2 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-slate-300 font-bold uppercase tracking-wider">
              ASSEMBLYAI REALTIME AUDIO WORKLET (16 KHZ PCM16)
            </span>
            <span className="text-slate-700 hidden sm:inline">|</span>
            <span className="text-slate-400 hidden sm:inline">UNIVERSAL-3.5 PRO WEBSOCKET</span>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <span className="text-amber-400">INVARIANT: SILENCE IS NEVER CONSENT</span>
            <span className="text-slate-700 hidden md:inline">|</span>
            <span className="text-slate-400 hidden md:inline">POSTGRESQL APPEND-ONLY LEDGER</span>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="mx-auto max-w-6xl px-4 pt-12 pb-16 sm:px-6 lg:px-8 text-center">
        {/* Hackathon Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-semibold text-amber-400 shadow-inner">
          <Sparkles className="h-3.5 w-3.5" />
          <span>AssemblyAI Voice Agent Hackathon &bull; Production Cockpit</span>
        </div>

        {/* Primary Headline */}
        <h1 className="mt-6 text-4xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl">
          Proof before the truck leaves.
        </h1>

        {/* Subtitle / 30-second Judge Pitch */}
        <p className="mx-auto mt-6 max-w-3xl text-base text-slate-300 sm:text-xl font-normal leading-relaxed">
          DockWitness is a voice-first freight receiving evidence system that captures shortages,
          overages, visible damage, and two-party disagreements between receiver and driver in real time.
        </p>

        <p className="mx-auto mt-3 max-w-2xl text-xs sm:text-sm text-slate-400 font-mono">
          AI transcribes speech via AssemblyAI Universal-3.5 Pro. Pure code computes quantities and evaluates consensus.
          Verifiable facts are locked before the driver exits the dock gate.
        </p>

        {/* Action Buttons */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/receive/shipment-po44891"
            className="group relative inline-flex items-center gap-3 rounded-lg bg-amber-500 px-7 py-4 text-base font-black text-slate-950 shadow-xl shadow-amber-500/25 transition-all hover:bg-amber-400 hover:shadow-amber-500/40 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <Play className="h-5 w-5 fill-slate-950 transition-transform group-hover:scale-110" />
            <span>Run Live Demo (PO 44891)</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>

          <Link
            href="/operations"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/80 px-6 py-4 text-sm font-bold text-white transition hover:border-slate-600 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            <Truck className="h-4 w-4 text-amber-400" />
            <span>Operations Dashboard</span>
          </Link>

          <Link
            href="/technology"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/80 px-6 py-4 text-sm font-bold text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            <Cpu className="h-4 w-4 text-slate-400" />
            <span>Technology & Invariants</span>
          </Link>
        </div>

        {/* Quick Launch Scenario Selector Bar */}
        <div className="mt-16 text-left">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-2">
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">
                1-Click Interactive Evaluation
              </span>
              <h2 className="text-xl font-black text-white">
                Launch Seed Scenarios in Live Cockpit
              </h2>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Pure deterministic evaluation &bull; Real warehouse audio
            </span>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {seedList.map((seed, idx) => (
              <Link
                key={seed.id}
                href={`/receive/${seed.id}`}
                className={`group relative flex flex-col justify-between rounded-xl border p-5 transition-all hover:-translate-y-1 hover:shadow-lg ${
                  idx === 0
                    ? "border-amber-500/50 bg-gradient-to-br from-amber-500/10 via-slate-900/90 to-slate-950 shadow-amber-500/10"
                    : "border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-slate-400">
                      PO #{seed.po}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase border ${seed.badgeColor}`}
                    >
                      {seed.scenarioBadge}
                    </span>
                  </div>

                  <h3 className="mt-3 text-base font-bold text-white group-hover:text-amber-400 transition-colors">
                    {seed.title}
                  </h3>

                  <p className="mt-2 text-xs text-slate-400 line-clamp-2">
                    {seed.description}
                  </p>
                </div>

                <div className="mt-5 border-t border-slate-800/80 pt-3 flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>{seed.carrier}</span>
                  <span className="inline-flex items-center gap-1 font-bold text-amber-400 group-hover:underline">
                    Launch Bay &rarr;
                  </span>
                </div>
              </Link>
            ))}

            {/* View Full Operations Center Card */}
            <Link
              href="/operations"
              className="group relative flex flex-col justify-between rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-5 hover:border-amber-500/50 hover:bg-slate-900/70 transition-all"
            >
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                  Operations Terminal
                </span>
                <h3 className="mt-3 text-base font-bold text-white group-hover:text-amber-400">
                  Dock Manager Overview
                </h3>
                <p className="mt-2 text-xs text-slate-400">
                  View aggregated exception analytics, active yard holds, carrier dispute rates, and append-only audit manifests.
                </p>
              </div>

              <div className="mt-5 border-t border-slate-800/80 pt-3 flex items-center justify-between text-[11px] font-mono text-emerald-400">
                <span>5 ACTIVE BAYS</span>
                <span className="inline-flex items-center gap-1 font-bold">
                  Open Dashboard &rarr;
                </span>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* 3 Core Architectural Pillars */}
      <div className="border-t border-slate-800/80 bg-slate-900/30 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
              System Architecture
            </span>
            <h2 className="mt-2 text-3xl font-black text-white sm:text-4xl">
              Built for industrial reliability, not chatbot pleasantries.
            </h2>
            <p className="mt-3 text-sm text-slate-400">
              Freight docks are noisy, fast-moving, and litigious. DockWitness separates acoustic recognition from truth adjudication.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
            {/* Pillar 1: AssemblyAI Voice */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-xl flex flex-col justify-between">
              <div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Mic className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-white">
                  Realtime AssemblyAI Voice
                </h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  Raw microphone audio is captured and downsampled via browser <code className="text-amber-300 font-mono text-xs">AudioWorklet</code> to 16 kHz mono linear PCM (50ms frames, 800 samples) and streamed over WebSocket to AssemblyAI Universal-3.5 Pro.
                </p>
              </div>
              <ul className="mt-6 space-y-2 border-t border-slate-800/80 pt-4 text-xs font-mono text-slate-400">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Sub-second streaming transcripts</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Keyterm prompting for SKUs & POs</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>60-second temporary session tokens</span>
                </li>
              </ul>
            </div>

            {/* Pillar 2: Deterministic Invariants */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-xl flex flex-col justify-between">
              <div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  <Cpu className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-white">
                  Deterministic Invariants
                </h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  Speech models transcribe verbatim words, but pure code computes math. Shortage calculations (<code className="text-sky-300 font-mono text-xs">&Delta; = Q_obs - Q_exp</code>) and the 13-row agreement matrix run in pure deterministic TypeScript.
                </p>
              </div>
              <ul className="mt-6 space-y-2 border-t border-slate-800/80 pt-4 text-xs font-mono text-slate-400">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-sky-400 shrink-0" />
                  <span>Zero LLM hallucinations in quantities</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-sky-400 shrink-0" />
                  <span>Silence is never consent invariant</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-sky-400 shrink-0" />
                  <span>Clerical override audit tracking</span>
                </li>
              </ul>
            </div>

            {/* Pillar 3: Immutable Evidence */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-xl flex flex-col justify-between">
              <div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-white">
                  Immutable Evidence Ledger
                </h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  Every speech turn, photograph, calculation, and driver attestation is immutably recorded in an append-only audit trail. Physical carton damage triggers a mandatory photo evidence gate.
                </p>
              </div>
              <ul className="mt-6 space-y-2 border-t border-slate-800/80 pt-4 text-xs font-mono text-slate-400">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Clickable verbatim quote provenance</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Damage requires photographic proof</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Append-only audit chain of custody</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* 5-Step Ingestion Pipeline Walkthrough */}
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="border border-slate-800 rounded-2xl bg-slate-900/50 p-8">
          <div className="max-w-3xl">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
              End-to-End Dock Workflow
            </span>
            <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
              From Pallet Unload to Verified Handoff Evidence
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              How DockWitness captures bilateral verification and records disagreement before the driver pulls away from the bay:
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-5">
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
              <span className="text-[10px] font-mono font-bold text-amber-400 uppercase">Step 01</span>
              <h4 className="mt-1 text-sm font-bold text-white">Acoustic Stream</h4>
              <p className="mt-1 text-xs text-slate-400">
                Receiver counts aloud while inspecting cartons at the trailer door.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
              <span className="text-[10px] font-mono font-bold text-amber-400 uppercase">Step 02</span>
              <h4 className="mt-1 text-sm font-bold text-white">AssemblyAI Ingestion</h4>
              <p className="mt-1 text-xs text-slate-400">
                16 kHz PCM16 frames parsed with keyterm boosting for numbers and freight codes.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
              <span className="text-[10px] font-mono font-bold text-amber-400 uppercase">Step 03</span>
              <h4 className="mt-1 text-sm font-bold text-white">Deterministic Fact</h4>
              <p className="mt-1 text-xs text-slate-400">
                Spoken quantity is extracted and compared against PO manifest. Discrepancy computed.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
              <span className="text-[10px] font-mono font-bold text-amber-400 uppercase">Step 04</span>
              <h4 className="mt-1 text-sm font-bold text-white">Two-Party Check</h4>
              <p className="mt-1 text-xs text-slate-400">
                Driver provides voice or touch attestation (Confirm / Dispute). Silence is preserved.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
              <span className="text-[10px] font-mono font-bold text-amber-400 uppercase">Step 05</span>
              <h4 className="mt-1 text-sm font-bold text-white">Verifiable Ledger</h4>
              <p className="mt-1 text-xs text-slate-400">
                Photo evidence gated, audit events immutably recorded, and ops manager notified instantly.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Non-Negotiable Disclosures Callout */}
      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider">
                System Invariant
              </span>
            </div>
            <p className="text-base font-bold text-white sm:text-lg">
              &ldquo;DockWitness records disagreement. It never manufactures agreement.&rdquo;
            </p>
            <p className="text-xs text-slate-400 max-w-2xl">
              The system protects carriers and receivers alike. Disputed counts are recorded verbatim with quote provenance so claims can be resolved on objective facts rather than unverified paperwork.
            </p>
          </div>

          <div className="shrink-0 flex gap-3">
            <Link
              href="/technology"
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition-colors"
            >
              Read Invariants &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}