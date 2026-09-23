# DockWitness — Live Judge Demo Guide

## One-Sentence Pitch
When a shipment arrives wrong, DockWitness captures what the receiver and driver actually said before the truck leaves.

## Product Tagline
**Proof before the truck leaves.**

## Core Invariant
**AI understands speech. Code determines facts. Humans determine responsibility.**  
*Liability remains `NOT_DETERMINED` until claims/ops adjudication.*

---

## 60–90 Second Golden Path Demo

### Step 1: Open the Active Receiving Session
1. Navigate to `/receive/po-44891` (or click **PO 44891** on the landing page).
2. Note **Gate 1: Session Hygiene** is active. Ground truth: 48 cartons of SKU AX-17 expected on BOL NS-90283.

### Step 2: Receiver Spoken Observation (Voice Intake)
1. Turn on microphone or play scenario audio:
   > *"I have forty-seven cartons. Carton thirty-one is crushed underneath and wet on the right side."*
2. **Observe Deterministic Evaluation (Gate 2 & Gate 3):**
   - Expected: `48`
   - Observed: `47`
   - Delta ($Observed - Expected$): `-1` (Shortage of 1 carton recorded)
   - Damage: Carton 31 flagged as crushed + wet.
   - Zero LLM math: code evaluates arithmetic deterministically.

### Step 3: Photo Evidence Mandate (Gate 4)
1. Notice workflow state updates to: `BLOCKED_PHOTO_REQUIRED`.
2. Click **Attach Sample Dock Photos** (or upload verified JPEG/PNG).
3. Magic bytes are validated server-side (`[FF D8 FF]`).
4. Gate 4 unlocks.

### Step 4: Bilateral Driver Attestation (Gate 5)
1. Driver Dave Miller is presented with exceptions.
2. Turn on microphone or play driver audio:
   > *"I confirm the damaged carton, but I dispute the shortage. The seal was intact."*
3. **Observe Bilateral Outcomes:**
   - Damage Agreement: `CONFIRMED_BY_BOTH ✓`
   - Shortage Agreement: `DISPUTED ⚠️`
   - Liability: `NOT_DETERMINED` (preserved with verbatim quotes for claims)
   - Workflow reaches: `READY_FOR_OPS_REVIEW`.

---

## Realtime AssemblyAI Verification
- **16 kHz AudioWorklet**: Streams continuous PCM to AssemblyAI Universal-3.5 Pro Realtime STT with far-field Voice Focus.
- **24 kHz Full-Duplex Voice Agent**: Evaluates driver response with 6 registered deterministic tools and barge-in interruption.
- **Fail-Closed Persistence**: Atomic Supabase RPC ledger guarantees zero partial state writes.
