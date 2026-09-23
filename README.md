# DockWitness

> **Proof before the truck leaves.**  
> *A voice-first freight receiving evidence layer powered by AssemblyAI Realtime & Voice Agent.*  
> **Built for the AssemblyAI Hackathon 2026**

DockWitness captures shortages, overages, visible physical damage, and two-party disagreements between a warehouse receiving clerk and an over-the-road truck driver while both parties are still physically present at the dock door.

- **GitHub Release (v1.0.0-final):** [https://github.com/Mrarbiel/dockwitness/releases/tag/v1.0.0-final](https://github.com/Mrarbiel/dockwitness/releases/tag/v1.0.0-final) *(Contains Pitch Video, Pitch Deck PDF & PPTX, Technical Proof)*
- **Interactive Judge Demo Guide:** [`docs/DEMO.md`](docs/DEMO.md)
- **License:** No license specified.

---

## ⚡ The Core Invariant

```
AI understands speech. Code determines facts. Humans determine responsibility.
```

- **DockWitness records disagreement. It never manufactures agreement.**
- **Silence is never consent.** "Cannot confirm" is never confirmation.
- **Pure deterministic code** calculates quantity discrepancies and evaluates bilateral carrier/receiver agreement. AI does not determine quantity discrepancies; deterministic code computes and validates them.
- **Liability is permanently `NOT_DETERMINED`** — DockWitness is an evidence and attestation layer, not a claims court.

---

## 🎯 The Golden Demo (PO 44891)

1. **Receiver inspects freight:**
   > *"I have forty-seven cartons. Carton thirty-one is crushed underneath and wet on the right side."*
   - **AssemblyAI Realtime STT:** Transcribes speech in sub-second frames via AudioWorklet (16 kHz PCM16 mono) to Universal-3.5 Pro.
   - **Deterministic Domain Engine:** Computes Expected 48 -> Observed 47 -> **Shortage: 1 carton**.
   - **Evidence Gate:** Flags Carton 31 damage and triggers mandatory photo attachment requirement.

2. **Driver provides position:**
   > *"I confirm the damaged carton, but I dispute the shortage. The seal was intact."*
   - **Agreement Engine:** Evaluates bilateral positions:
     - Damage Agreement: `CONFIRMED_BY_BOTH`
     - Shortage Agreement: `DISPUTED`
   - **Append-Only Audit Ledger:** Records immutable, trigger-enforced audit events with clickable verbatim quote provenance.

---

## 🏗️ Architecture

```
[ Browser Microphone ]
         │
         ▼
[ AudioWorklet Resamplers ] ── (16 kHz for STT / 24 kHz for Voice Agent, zero drift)
         │
         ▼
[ AssemblyAI v3 WebSocket ] ── (Universal-3.5 Pro + Keyterm Boosting)
         │
         ▼
[ Realtime Transcript Turns ]
         │
         ▼
[ Candidate Fact Extraction ] ── (Spoken numbers, damage conditions, driver quotes)
         │
         ▼
[ Deterministic Rules Engine ] ── (Discrepancy math, bilateral agreement matrix, readiness gate)
         │
         ▼
[ Supabase PostgreSQL + RLS ] ── (Shipments, incidents, turns, audit ledger)
         │
         ▼
[ Industrial Receiving Cockpit ] ── (Clickable provenance, live counters, operations board)
```

---

## 🎙️ AssemblyAI Voice Agent Guided Workflow API

Beyond passive transcription, DockWitness integrates the official AssemblyAI Voice Agent API (`wss://agents.assemblyai.com/v1/ws`) as an active receiving co-pilot:
- **Server Token Minting**: `POST /api/voice-agent/token` generates short-lived ephemeral tokens (`https://agents.assemblyai.com/v1/token`) with bounded timeouts. The client never touches the master API key.
- **Barge-In / Interruption Handling**: Realtime bi-directional audio path supports immediate barge-in interruption, instantly truncating agent playback when receiver or driver speaks.
- **6 Deterministic Registered Tools**:
  1. `get_shipment`: Fetches expected manifest items, SKUs, and quantities.
  2. `get_workflow_state`: Retrieves current observed count, damage flags, photo counts, and attestation status.
  3. `record_candidate_observation`: Proposes spoken counts and damage observations with verbatim audio provenance.
  4. `record_driver_attestation`: Records driver position (`CONFIRM`, `DISPUTE`, `NO_KNOWLEDGE`, `REFUSED_TO_ATTEST`).
  5. `request_missing_evidence`: Prompts user when damage is reported without required physical photo proof.
  6. `evaluate_readiness`: Evaluates transition eligibility against the deterministic state machine.
- **Deterministic Invariant Guarantee**: The Voice Agent never computes quantity math, never determines liability, and never overrides the deterministic agreement engine. AI understands speech and guides the workflow; TypeScript code determines facts.

---

## 🚦 5 Readiness & Verification States

DockWitness governs receiving progression via an uncompromising 5-state deterministic machine:

1. **`AWAITING_INSPECTION`**: Initial state on dock door arrival. No observed counts or observations recorded yet. Review submission is blocked.
2. **`BLOCKED_PHOTO_REQUIRED`**: Visible damage reported on one or more cartons, but zero physical photos attached. Hard gate prevents ops review until camera proof is uploaded.
3. **`PENDING_DRIVER_ATTESTATION`**: Manifest discrepancies or damage confirmed by receiver, awaiting carrier driver attestation (`CONFIRM`, `DISPUTE`, `REFUSED_TO_ATTEST`, or `DRIVER_UNAVAILABLE`).
4. **`READY_FOR_OPS_REVIEW`**: All mandatory evidence gathered, discrepancy math verified, photo gates satisfied, and driver position recorded. Ready for terminal manager review.
5. **`OPS_ESCALATION_REQUIRED`**: Severe manifest mismatch, persistent discrepancy dispute, or hostile non-cooperation requiring supervisor intervention before truck release.

## 🚀 Quick Start

### 1. Prerequisites
- Node.js 18+ (tested on Node 22)
- pnpm 9+ or 10+

### 2. Installation
```bash
git clone https://github.com/Mrarbiel/dockwitness.git
cd dockwitness
pnpm install
```

### 3. Environment Setup
Copy `.env.example` to `.env.local` and configure your keys:
```bash
ASSEMBLYAI_API_KEY=your_assemblyai_api_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Run Locally
```bash
# Production server (fastest, pre-compiled chunks)
pnpm build
pnpm start

# Or development server
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing & Verification

DockWitness enforces strict automated quality gates across all domains:

```bash
# Run 715 unit and integration tests across 39 files (100% passing)
pnpm test

# Run 59 Playwright browser E2E tests across 8 spec files
pnpm test:e2e

# Run Scenario Lab browser test suite (4 scenarios, 10 viewports, a11y)
pnpm exec playwright test tests/e2e/scenario-lab-browser.spec.ts

# Typecheck TypeScript
pnpm typecheck

# Lint codebase
pnpm lint

# Master Automated Verification Gate (14-Layer Scenario Lab)
pnpm verify:all
```

### Test Suite Highlights (715 Vitest Tests across 39 Files)
- **Domain Engines:** 83 tests verifying shortage/overage math, boundary conditions, and bilateral agreement evaluation (`tests/domain/`, `tests/rules/`).
- **AssemblyAI Voice Agent & STT:** 24 kHz AudioWorklet DSP, `session.ready` gating, barge-in buffer purge, ephemeral token minting, WebSocket protocol, and 6 deterministic tool executions (`tests/assemblyai/`, `tests/audio/`, `tests/api/`).
- **Adversarial Extraction:** 40 tests torture-testing multi-hundred numbers, speech prepositions, and spoken shortage masking (`tests/nlp/`).
- **AudioWorklet Resamplers:** 15 empirical stress tests verifying zero phase drift across 10,000 continuous audio blocks and 44.1 kHz -> 16 kHz / 24 kHz conversions (`tests/audio/`).
- **Security & Watchdog:** 27 challenger tests verifying server-only API keys, 120s inactivity watchdog, PostgreSQL trigger immutability, and session isolation (`tests/security/`, `tests/redteam/`).
- **Persistence & Repository:** 40 tests verifying Supabase data persistence, relational foreign keys, and boundary inputs (`tests/repository/`).

### Browser & E2E Workflows (59 Playwright Tests across 8 Suites)
- **`scroll-preservation.spec.ts` (3 tests)**: Scroll isolation, container-only auto-scroll, and zero page jumping on voice simulation/mount.
- **`reset-session.spec.ts` (1 test)**: Session immutability, state isolation, and fresh incident regeneration.
- **`tier1-features.spec.ts` (18 tests)**: Core receiving workflows, counting, damage flags, photo gates.
- **`tier2-boundaries.spec.ts` (10 tests)**: Boundary values, zero counts, excessive overages, input sanitation.
- **`tier3-interactions.spec.ts` (5 tests)**: Audio simulation toggles, mic permissions, tab navigation.
- **`tier4-scenarios.spec.ts` (5 tests)**: End-to-end multi-party disputes and carrier refusal flows.
- **`scenario-lab-browser.spec.ts` (16 tests)**: 4 operational scenarios, 10 responsive device viewports (320px to 1920px), and automated accessibility audit.
- **`smoke.spec.ts` (1 test)**: Production smoke and landing page health check.

---

## 📜 Seed Scenarios for Interactive Demo

| PO # | Scenario | Expected | Observed | Outcome |
|:-----|:---------|:--------:|:--------:|:--------|
| **44891** | **Golden Demo** | 48 | 47 | Shortage (-1), Damage (Carton 31), Driver disputes count |
| **44880** | Clean Receipt | 50 | 50 | Agreed Match, Zero damage, Clean bilateral sign-off |
| **44902** | Overage Receipt | 30 | 32 | Overage (+2), Driver confirms extra freight |
| **44913** | Photo Gate | 60 | 60 | Carton 14 punctured, hard evidence gate blocks review |
| **44924** | Two-Party Dispute | 25 | 24 | Shortage disputed citing intact trailer seal |

---

## 🛡️ Hackathon Submission Details

- **Hackathon:** AssemblyAI Voice Agent Hackathon
- **Voice Agent Co-Pilot:** AssemblyAI Voice Agent Guided Workflow API (`wss://agents.assemblyai.com/v1/ws`) with 6 deterministic registered tools
- **Speech Processing:** AssemblyAI Universal-3.5 Pro Realtime STT via Ephemeral Server-Minted Tokens
- **Audio Pipeline:** Dedicated AudioWorklet resamplers (16 kHz mono for STT, 24 kHz mono for Voice Agent) with zero phase drift
- **Storage & Auth:** Supabase PostgreSQL with RLS and Append-Only Immutability Triggers
- **Frontend:** Next.js 15.5.25 App Router, Tailwind CSS, Lucide Icons
