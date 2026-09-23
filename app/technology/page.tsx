import Link from "next/link";
import {
  Cpu,
  Mic,
  ShieldCheck,
  Code2,
  Lock,
  Layers,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Sparkles,
} from "lucide-react";

export default function TechnologyPage() {
  const agreementMatrixRows = [
    {
      receiver: "CONFIRM (47)",
      driver: "CONFIRM (47)",
      result: "CONFIRMED_BY_BOTH",
      meaning: "Bilateral agreement. Both parties agree on counted quantity.",
      badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
    },
    {
      receiver: "CONFIRM (47)",
      driver: "DISPUTE (Claims seal intact)",
      result: "DISPUTED",
      meaning: "Bilateral disagreement. Recorded verbatim without forcing consent.",
      badge: "bg-rose-500/20 text-rose-400 border-rose-500/40",
    },
    {
      receiver: "CONFIRM (47)",
      driver: "NO_KNOWLEDGE",
      result: "RECEIVER_ONLY",
      meaning: "Driver has no basis to confirm. Silence is never consent.",
      badge: "bg-amber-500/20 text-amber-400 border-amber-500/40",
    },
    {
      receiver: "CONFIRM (47)",
      driver: "NOT_ASKED",
      result: "RECEIVER_ONLY",
      meaning: "Unilateral receiver count pending driver review.",
      badge: "bg-slate-800 text-slate-300 border-slate-700",
    },
    {
      receiver: "NOT_ASKED",
      driver: "CONFIRM",
      result: "DRIVER_ONLY",
      meaning: "Driver attestation without receiver count.",
      badge: "bg-slate-800 text-slate-300 border-slate-700",
    },
    {
      receiver: "DISPUTE",
      driver: "DISPUTE",
      result: "DISPUTED",
      meaning: "Both parties contest manifest expectation.",
      badge: "bg-rose-500/20 text-rose-400 border-rose-500/40",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header & Breadcrumbs */}
      <div className="border-b border-slate-800 pb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Overview
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
            System Specifications & Architecture
          </span>
          <span className="text-slate-600">&bull;</span>
          <span className="rounded bg-sky-500/10 px-2 py-0.5 text-[10px] font-mono text-sky-400 border border-sky-500/20">
            ASSEMBLYAI UNIVERSAL-3.5 PRO
          </span>
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl mt-2">
          DockWitness System Technology
        </h1>
        <p className="mt-3 text-base text-slate-300 max-w-3xl">
          Technical specifications of the real-time audio pipeline, deterministic consensus invariants,
          and append-only evidence graph.
        </p>
      </div>

      <div className="mt-10 space-y-10">
        {/* Section 1: Core Principle */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 shadow-xl">
          <div className="flex items-center gap-2.5 text-amber-400">
            <ShieldCheck className="h-5 w-5" />
            <h2 className="text-xl font-black uppercase tracking-wider text-white">
              Core Principle
            </h2>
          </div>

          <blockquote className="mt-4 border-l-4 border-amber-500 bg-amber-500/10 pl-5 py-3.5 italic text-lg font-medium text-slate-200 rounded-r-lg">
            &ldquo;DockWitness records disagreement. It never manufactures agreement.&rdquo;
          </blockquote>

          <div className="mt-4 text-sm text-slate-300 font-mono bg-slate-950/80 p-4 rounded-xl border border-slate-800">
            AI understands speech. Code determines facts. Humans determine responsibility.
          </div>

          <p className="mt-4 text-sm text-slate-300 leading-relaxed">
            In freight operations, premature consensus creates liability. If a driver remains silent, DockWitness strictly refuses to infer agreement. The system acts as a neutral, append-only recording witness so insurance adjusters and terminal managers can resolve claims on verbatim proof rather than hearsay.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <span className="text-xs font-mono font-bold text-amber-400 uppercase">
                Invariant: Silence is Never Consent
              </span>
              <p className="mt-1.5 text-xs text-slate-400">
                When a party does not speak or refuses to attest, the system state preserves <code className="text-amber-300">RECEIVER_ONLY</code> or <code className="text-amber-300">PENDING_REVIEW</code>.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <span className="text-xs font-mono font-bold text-sky-400 uppercase">
                Invariant: Liability Insulation
              </span>
              <p className="mt-1.5 text-xs text-slate-400">
                DockWitness never declares fault, approves insurance claims, or assigns financial damages. It records facts with verbatim quotes.
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: Speech Pipeline */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 shadow-xl">
          <div className="flex items-center gap-2.5 text-sky-400">
            <Mic className="h-5 w-5" />
            <h2 className="text-xl font-black uppercase tracking-wider text-white">
              Speech Pipeline
            </h2>
          </div>

          <p className="mt-4 text-sm text-slate-300 leading-relaxed">
            Hardware microphone audio is downsampled in real time using a dedicated browser AudioWorklet
            to <strong className="text-white">16 kHz mono</strong> signed 16-bit PCM (50ms frames, 800 samples) and streamed over WebSocket to AssemblyAI <strong className="text-white">Universal-3.5 Pro</strong>.
            The AssemblyAI master API key is isolated server-side and only temporary 60-second tokens are minted.
          </p>

          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-5 font-mono text-xs text-slate-300 space-y-3">
            <div className="flex justify-between border-b border-slate-800/80 pb-2">
              <span className="text-slate-400">Sampling Rate & Format:</span>
              <span className="text-amber-400 font-bold">16 kHz mono &bull; Linear PCM16 Little-Endian</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/80 pb-2">
              <span className="text-slate-400">AudioWorklet Processor:</span>
              <span className="text-sky-400">/worklets/pcm-processor.js (50ms chunks, 800 samples)</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/80 pb-2">
              <span className="text-slate-400">Streaming Protocol:</span>
              <span className="text-emerald-400">AssemblyAI v3 Realtime WebSocket Protocol</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Security Invariant:</span>
              <span className="text-purple-400">Server-minted 60s ephemeral token via POST /api/aai/token</span>
            </div>
          </div>
        </section>

        {/* Section 3: Deterministic Agreement Engine & 13-Row Matrix */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 shadow-xl">
          <div className="flex items-center gap-2.5 text-emerald-400">
            <Cpu className="h-5 w-5" />
            <h2 className="text-xl font-black uppercase tracking-wider text-white">
              Deterministic Agreement Engine
            </h2>
          </div>

          <p className="mt-4 text-sm text-slate-300 leading-relaxed">
            LLMs are probabilistic; financial settlement math is strictly deterministic. DockWitness enforces a strict invariant:
            Speech recognition extracts candidates, but the disagreement delta (<code className="text-emerald-300 font-mono text-xs">&Delta; = Q_obs - Q_exp</code>) and bilateral positions are evaluated by pure functional code.
          </p>

          <div className="mt-6 overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950 font-mono text-[11px] text-slate-400 uppercase">
                <tr>
                  <th className="px-4 py-3">Receiver Position</th>
                  <th className="px-4 py-3">Driver Position</th>
                  <th className="px-4 py-3">Computed Agreement Status</th>
                  <th className="px-4 py-3">Deterministic Meaning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {agreementMatrixRows.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-mono text-slate-300">{row.receiver}</td>
                    <td className="px-4 py-3 font-mono text-slate-300">{row.driver}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold border ${row.badge}`}>
                        {row.result}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{row.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 4: Mandatory Evidence Gating */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 shadow-xl">
          <div className="flex items-center gap-2.5 text-purple-400">
            <Layers className="h-5 w-5" />
            <h2 className="text-xl font-black uppercase tracking-wider text-white">
              Evidence Readiness Gating
            </h2>
          </div>

          <p className="mt-4 text-sm text-slate-300 leading-relaxed">
            A manifest cannot be closed or submitted for operations manager review with unverified claims.
            If physical damage is spoken or observed, the system imposes a mandatory evidence gate:
          </p>

          <div className="mt-4 p-4 rounded-xl border border-slate-800 bg-slate-950 font-mono text-xs text-slate-300">
            <code>hasDamage === true &amp;&amp; photoCount === 0 &rArr; Readiness = BLOCKED_PHOTO_REQUIRED</code>
          </div>

          <p className="mt-4 text-sm text-slate-400 leading-relaxed">
            Only when physical camera evidence is attached and recorded in the append-only audit trail does the system elevate readiness to <strong className="text-emerald-400 font-mono">READY_FOR_OPS_REVIEW</strong>.
          </p>
        </section>
      </div>
    </div>
  );
}