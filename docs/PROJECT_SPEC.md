# DockWitness — Product & Build Specification

## 1. Product

DockWitness is a voice-first evidence system for freight receiving exceptions at warehouse docks.

It does not replace a WMS, ERP, TMS, POD system, or carrier claims platform.

It focuses on the time-sensitive handoff when:

1. the physical shipment does not match the expected shipment;
2. the receiver is inspecting freight;
3. the driver is still present;
4. important statements, counts, visible damage, and disagreement must be captured before the truck leaves.

## 2. Primary users

### Receiver / receiving clerk
Needs to capture an exception quickly while working physically around freight.

### Operations / claims manager
Needs a trustworthy incident record with source evidence and missing-evidence flags.

### Driver
May confirm, dispute, or decline knowledge of a specific observation.

## 3. Supported exception types

P0:

- `SHORTAGE`
- `OVERAGE`
- `DAMAGE`

Do not add additional exception categories until P0 is complete.

## 4. Product modes

### Guided Mode — required and reliable

Receiver and Driver statements are captured in explicit workflow steps.

Role identity is known from the step. The demo must work with one person using one laptop.

### Joint Mode — advanced showcase

Two people speak during one streaming session.

Use AssemblyAI streaming speaker labels/diarization. This is a showcase, not a dependency of the core golden path.

## 5. Golden workflow

1. User opens a seeded shipment.
2. Clicks `Start Exception`.
3. Browser obtains a short-lived AssemblyAI token from the server.
4. User speaks observed quantity and damage.
5. AssemblyAI streams partial/final transcript.
6. Final turn is stored.
7. Extraction layer proposes candidate facts plus exact supporting evidence.
8. Zod validates extraction.
9. Deterministic domain engine calculates quantity discrepancy.
10. UI displays missing evidence.
11. User uploads damage photos.
12. Driver statement is captured.
13. Driver position is represented as one of:
   - `CONFIRM`
   - `DISPUTE`
   - `NO_KNOWLEDGE`
   - `NOT_ASKED`
14. Domain engine computes agreement state.
15. Evidence readiness is evaluated.
16. Incident moves to `READY_FOR_OPS_REVIEW`.
17. Incident page shows timeline and source-linked facts.

## 6. Product invariants

1. Never infer consent from silence.
2. Never infer agreement from one person's statement.
3. Never convert "I can't confirm" into confirmation.
4. Never infer liability.
5. Never let an LLM directly set final agreement state.
6. Never let an LLM perform quantity arithmetic when deterministic code can do it.
7. Every important extracted fact must have a source turn and exact supporting quote.
8. Original evidence is append-only; corrections create new audit events.
9. The AssemblyAI secret key is server-only.
10. The main demo uses real AssemblyAI processing.

## 7. State machine

Primary states:

- `DRAFT`
- `CAPTURING`
- `EXCEPTION_DETECTED`
- `EVIDENCE_REQUIRED`
- `PARTY_REVIEW`
- `READY_FOR_OPS_REVIEW`
- `CLOSED`

Secondary/exception state:

- `NEEDS_CLARIFICATION`

Forbidden automated states:

- `CLAIM_APPROVED`
- `CARRIER_LIABLE`
- `SHIPPER_LIABLE`
- `FAULT_CONFIRMED`
- `SAFE_TO_FILE`

## 8. Seed scenarios

### Clean receipt
PO 44880 — Expected 24 / Observed 24 / No damage.

### Shortage
PO 44891 — Expected 48 / Observed 47.

### Overage
PO 44902 — Expected 20 / Observed 22.

### Damage
PO 44913 — Expected 36 / Observed 36 / Carton 8 crushed.

### Combined dispute
PO 44924 — Expected 60 / Observed 59 / pallet wrapping torn / receiver reports shortage / driver disputes shortage / driver confirms visible damage.

## 9. Required pages

### `/`
Landing page:
- DockWitness
- "Proof before the truck leaves."
- short product explanation
- `Run Live Demo`
- `Technology`
- concise problem/solution/technology/business sections

### `/receive/[shipmentId]`
Primary receiving cockpit:
- shipment identifiers
- expected / observed / difference
- live transcript (with explicitly labeled UI fallback: "▶️ Simulate Scenario Audio" to play pre-recorded sample audio through the real AssemblyAI pipeline for stable demos)
- exception status
- evidence checklist
- receiver/driver workflow
- photo upload (include a fast "Attach Sample Dock Photos" button for rapid video demos)
- readiness state

### `/incident/[incidentId]`
Evidence record:
- exception summary
- agreement/disagreement
- evidence timeline
- transcript-source links
- photos
- audit events

### `/operations`
Manager dashboard:
- open exceptions
- missing evidence
- disputed
- ready for review
- incident table

### `/technology`
Architecture and AssemblyAI usage.

## 10. UI direction

Industrial operating software, not a chatbot.

Use:
- large quantities;
- strong hierarchy;
- status chips;
- tablet-friendly layout;
- evidence timeline;
- visible failure states;
- restrained safety amber/red/green semantics.

Avoid:
- glassmorphism;
- generic purple AI gradients;
- long marketing copy;
- chat bubbles as the primary product metaphor.

## 11. P0 scope

Required:
- live AssemblyAI transcription;
- temp token route;
- seeded shipment loading;
- quantity extraction;
- deterministic shortage/overage;
- damage description extraction;
- photo upload;
- receiver statement;
- driver statement;
- confirm/dispute/no-knowledge;
- evidence timeline;
- incident record;
- public deploy;
- tests.

## 12. P1 scope

After P0 is fully green:
- Joint Mode speaker labels;
- far-field Voice Focus;
- shipment-specific prompt/keyterms/context;
- guided Voice Agent follow-up;
- reconnect/resume;
- tablet/mobile polish;
- incident export (Printable OS&D Exception Summary - operational summary, not a legal determination).

## 13. P2 — do not start until P0+P1 are stable

- real WMS integration;
- real ERP/TMS;
- real carrier API;
- billing;
- full multi-tenant auth;
- OCR-heavy flows;
- computer-vision damage scoring;
- real freight claim submission;
- e-signature;
- native mobile app.

## 14. Success message

A judge should understand the product in under 30 seconds:

**"When a shipment arrives wrong, DockWitness captures what the receiver and driver actually said before the truck leaves."**
