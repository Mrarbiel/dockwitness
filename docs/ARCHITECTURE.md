# DockWitness — Architecture Contract

## Stack

- Next.js + TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase PostgreSQL
- Supabase Storage
- Vercel
- AssemblyAI Universal-3.5 Pro Realtime for core streaming STT
- AssemblyAI Voice Agent API as P1 guided workflow
- Zod validation
- Vitest unit/integration tests
- Playwright browser/E2E tests

Use current stable package versions at implementation time. Do not hardcode versions from this document if newer compatible stable versions exist.

## Core flow

Browser microphone
→ server-minted short-lived AssemblyAI token
→ AssemblyAI realtime WebSocket
→ transcript turns
→ candidate fact extraction
→ Zod validation
→ deterministic rules engine
→ Supabase
→ evidence UI / audit timeline

### Critical boundary

The extraction model produces **candidate facts** only.

It does not:
- directly mutate final incident state;
- compute shortage/overage;
- determine agreement;
- determine claim readiness;
- determine liability.

## AssemblyAI integration

### Core realtime endpoint

- **Browser Audio Resampling**: Browser microphone audio must be converted to mono PCM16 signed little-endian at 16 kHz using an AudioWorklet (detect hardware sample rate at runtime and convert).
- **Note on Sample Rates**: The managed Voice Agent API uses different default rates (e.g., 24 kHz) than the Universal streaming STT path (16 kHz). Verify current official docs to ensure chunk sizing and rates match perfectly.


Use current official AssemblyAI v3 realtime streaming implementation with:

- `speech_model=universal-3-5-pro`
- `sample_rate=16000`
- `voice_focus=far-field` where appropriate
- `speaker_labels=true` only where Joint Mode requires it
- current contextual prompting/keyterm mechanism supported by the live API

Do not trust remembered SDK/API syntax. Verify current official AssemblyAI docs while implementing.

Official references:
- https://www.assemblyai.com/docs/
- https://www.assemblyai.com/blog/real-time-speech-to-text-for-voice-agents
- https://www.assemblyai.com/blog/how-to-build-with-voice-agent-api
- https://www.assemblyai.com/blog/build-a-voice-assistant-app-with-voice-agent-api

### Browser security

Never expose `ASSEMBLYAI_API_KEY`.

The browser must request a server-minted temporary token.

The token endpoint and TTL must follow current official AssemblyAI guidance.

### Session hygiene

- close WebSocket when session ends;
- clean AudioContext/AudioWorklet resources;
- stop mic tracks;
- recover from expired token;
- surface user-visible connection errors;
- prevent zombie sessions.

### AssemblyAI Voice Agent API (Guided Receiving Co-Pilot)

DockWitness implements the official AssemblyAI Voice Agent API as an interactive receiving co-pilot:

- **WebSocket Endpoint**: `wss://agents.assemblyai.com/v1/ws?token=${token}`
- **Server Token Minting**: `POST /api/voice-agent/token` (using server-side `ASSEMBLYAI_API_KEY` with bounded 6s timeout).
- **Audio Architecture**: Bi-directional 24 kHz / 16 kHz mono PCM16 streaming via Web Audio API.
- **Barge-in / Interruption**: When user speech is detected (`transcript.user`), queued audio chunks are immediately cancelled and the buffer is flushed.
- **Deterministic Tools Registered**:
  - `get_shipment`: Fetches manifest and expected carton count.
  - `get_workflow_state`: Inspects current exceptions, photos, and readiness blockers.
  - `record_candidate_observation`: Submits candidate counts to the deterministic quantity engine (which computes delta in code).
  - `record_driver_attestation`: Submits driver bilateral positions to the agreement engine.
  - `request_missing_evidence`: Checks mandatory evidence requirements (e.g. photos for damaged cartons).
  - `evaluate_readiness`: Evaluates review readiness without ever determining legal liability.
- **Invariant Guarantee**: The Voice Agent LLM never computes discrepancy math, never manufactures agreement, and never determines legal liability.

## Data model

### `shipments`
- id
- po_number
- bol_number
- carrier_name
- trailer_number
- status
- created_at

### `shipment_items`
- id
- shipment_id
- sku
- description
- expected_qty
- unit

### `incidents`
- id
- shipment_id
- incident_number
- status
- receiver_name
- driver_name
- started_at
- completed_at

### `exceptions`
- id
- incident_id
- shipment_item_id
- type (`SHORTAGE|OVERAGE|DAMAGE`)
- expected_qty
- observed_qty
- delta
- damage_description
- agreement_status

### `transcript_turns`
- id
- incident_id
- assembly_session_id
- speaker_label
- speaker_role
- text
- start_ms
- end_ms
- is_final
- created_at

### `observations`
- id
- incident_id
- field_key
- value_json
- source_turn_id
- source_quote
- speaker_role
- confidence
- confirmed
- created_at

### `evidence`
- id
- incident_id
- type (`PHOTO|TRANSCRIPT|DOCUMENT|AUDIO`)
- storage_path
- description
- captured_by
- created_at

### `attestations`
- id
- incident_id
- exception_id
- party_role
- position (`CONFIRM|DISPUTE|NO_KNOWLEDGE|NOT_ASKED`)
- source_turn_id
- created_at

### `audit_events`
- id
- incident_id
- actor
- event_type
- payload_json
- created_at

Audit rows are append-only.

## Deterministic rules

### Quantity

```
delta = observedQty - expectedQty

delta < 0  => SHORTAGE abs(delta)
delta > 0  => OVERAGE delta
delta == 0 => no quantity exception
```

### Damage evidence

If damage is reported and required photo evidence is absent:
`EVIDENCE_REQUIRED`.

### Agreement

For a specific exception:
- receiver CONFIRM + driver CONFIRM => `CONFIRMED_BY_BOTH`
- one CONFIRM + one DISPUTE => `DISPUTED`
- receiver CONFIRM + driver NO_KNOWLEDGE => `DISPUTED_OR_UNCONFIRMED` (choose one explicit enum and document)
- receiver only => `RECEIVER_ONLY`
- silence => never confirmation

The exact enum set may be refined by Architect, but must preserve the invariant.

## Suggested API routes

- `GET /api/aai/token`
- `GET /api/shipments/[id]`
- `POST /api/incidents`
- `GET /api/incidents/[id]`
- `POST /api/incidents/[id]/turn`
- `POST /api/incidents/[id]/extract`
- `POST /api/incidents/[id]/photo`
- `POST /api/incidents/[id]/attestation`
- `POST /api/incidents/[id]/evaluate`
- `GET /api/incidents`

No route that auto-approves a legal claim.

## Suggested repository shape

```
app/
  page.tsx
  receive/[shipmentId]/page.tsx
  incident/[incidentId]/page.tsx
  operations/page.tsx
  technology/page.tsx
  api/...

components/
  receiving/
  voice/
  evidence/
  operations/
  ui/

lib/
  assemblyai/
  domain/
  extraction/
  supabase/
  types/

supabase/
  migrations/
  seed.sql

tests/
  rules/
  extraction/
  e2e/

docs/
```

Architect may refine this structure if there is a concrete benefit, but must document the reason before changing core boundaries.
