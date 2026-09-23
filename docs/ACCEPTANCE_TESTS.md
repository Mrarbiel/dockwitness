# DockWitness — Acceptance & Quality Gates

The orchestrator must not declare the project finished until all P0 gates pass.

## A. Security

- [ ] `ASSEMBLYAI_API_KEY` exists only server-side.
- [ ] no `NEXT_PUBLIC_ASSEMBLYAI_API_KEY`.
- [ ] no secret committed to git history.
- [ ] browser receives only a short-lived token.
- [ ] Supabase service role key is server-only.
- [ ] upload paths and API inputs are validated.
- [ ] no unsafe arbitrary command or path behavior added to app.

## B. Realtime voice

- [ ] browser microphone works.
- [ ] AssemblyAI realtime stream is genuine.
- [ ] partial/final transcript behavior is understandable.
- [ ] final transcript turns are stored.
- [ ] start/stop works repeatedly.
- [ ] mic track is stopped after session.
- [ ] websocket closes cleanly.
- [ ] expired token is recoverable.
- [ ] connection error appears in UI.
- [ ] no indefinite idle billing caused by forgotten sessions.

## C. Deterministic business rules

Automated tests must prove:

- [ ] expected 48 / observed 47 => shortage 1.
- [ ] expected 48 / observed 50 => overage 2.
- [ ] expected 48 / observed 48 => no quantity exception.
- [ ] receiver confirms + driver confirms => confirmed by both.
- [ ] receiver confirms + driver disputes => disputed.
- [ ] driver says "I only confirm damage" => shortage remains unconfirmed/disputed.
- [ ] driver silence => never confirmation.
- [ ] damage without required photo => evidence incomplete.
- [ ] LLM output claiming agreement cannot override source-backed attestations.
- [ ] LLM-provided shortage arithmetic is ignored in favor of deterministic math.
- [ ] "just mark it confirmed" cannot bypass the agreement engine.
- [ ] liability remains `NOT_DETERMINED`.

## D. Evidence traceability

- [ ] observed quantity links to source transcript.
- [ ] damage description links to source transcript.
- [ ] receiver position links to source transcript.
- [ ] driver position links to source transcript.
- [ ] evidence photos have timestamps.
- [ ] corrections do not erase historical audit events.
- [ ] incident timeline is chronological and understandable.

## E. Golden demo

Starting from a fresh browser:

1. [ ] Open public URL without login.
2. [ ] Click Run Live Demo.
3. [ ] Load PO 44891.
4. [ ] Start microphone.
5. [ ] Say "I have forty-seven cartons."
6. [ ] See real transcript.
7. [ ] See observed quantity = 47.
8. [ ] See expected quantity = 48.
9. [ ] See deterministic shortage = 1.
10. [ ] Say "Carton thirty-one is crushed underneath and wet on the right side."
11. [ ] See damage facts.
12. [ ] Upload required photos.
13. [ ] Enter/capture receiver statement.
14. [ ] Capture driver: "I confirm the damaged carton, but I dispute the shortage. The seal was intact."
15. [ ] See damage = confirmed by both.
16. [ ] See shortage = disputed.
17. [ ] Click a field and see exact transcript evidence.
18. [ ] Reach `READY_FOR_OPS_REVIEW`.
19. [ ] Open incident page and see timeline.
20. [ ] Refresh and confirm persisted state.

## F. Browser and build quality

- [ ] lint passes.
- [ ] typecheck passes.
- [ ] unit/integration tests pass.
- [ ] production build passes.
- [ ] Playwright golden path passes or is documented where microphone automation requires a fixture.
- [ ] desktop layout works.
- [ ] tablet layout works.
- [ ] no critical console errors.
- [ ] no unhandled promise rejections.
- [ ] no broken navigation.
- [ ] loading states exist.
- [ ] failure states are understandable.

## G. Submission readiness

- [ ] README is accurate.
- [ ] architecture diagram exists.
- [ ] limitations are explicit.
- [ ] no false "first ever" or unsupported market claims.
- [ ] video script exists.
- [ ] slide outline exists.
- [ ] demo URL exists.
- [ ] public repo exists.
- [ ] final screenshots exist.
- [ ] AssemblyAI usage is obvious to judges.

## Completion rule

If any unchecked item is P0 and solvable without human credentials/approval, continue working.

Do not stop because "most features are done."

Stop and ask the user only when a true external blocker exists.
