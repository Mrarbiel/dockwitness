import { describe, it, expect } from "vitest";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
const WS = globalThis.WebSocket;
import {
  DOCKWITNESS_VOICE_AGENT_SYSTEM_PROMPT,
  DOCKWITNESS_VOICE_AGENT_TOOLS,
  executeVoiceAgentTool,
} from "@/lib/assemblyai/voice-agent-tools";
import { VoiceAgentClient } from "@/lib/assemblyai/voice-agent-client";
import { repository } from "@/lib/repository";
import { calculateDiscrepancy } from "@/lib/domain/quantity-engine";

dotenv.config({ path: ".env.local" });
process.env.USE_MOCK_STORE = "true";

describe("Layer 5 & 6: AssemblyAI Voice Agent Protocol & Barge-In Invariant Verification", () => {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;

  describe("Layer 5: Real Live Voice Agent Protocol Handshake & Full Turn Acceptance (Real AssemblyAI Server)", () => {
    it("executes full live provider acceptance turn: token -> socket -> session.update -> session.ready -> 24kHz audio -> transcript -> reply -> tool.call -> queued result -> reply.done -> tool.result", async (ctx) => {
      if (!apiKey || apiKey === "mock-assemblyai-key-for-test") {
        console.log("BLOCKED / SKIPPED: Live ASSEMBLYAI_API_KEY not configured — live provider test cannot execute without real credentials");
        ctx.skip();
        return;
      }

      // 1. Mint ephemeral token from AssemblyAI Voice Agent token service (with resilient retry for transient network hiccups)
      let tokenRes: Response | undefined;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          tokenRes = await fetch("https://agents.assemblyai.com/v1/token?expires_in_seconds=60", {
            method: "GET",
            headers: {
              authorization: `Bearer ${apiKey.trim()}`,
              accept: "application/json",
            },
          });
          if (tokenRes.ok) break;
        } catch (err) {
          if (attempt === 3) {
            console.log("BLOCKED / SKIPPED: Upstream speech provider unreachable after 3 attempts — live test blocked:", err);
            ctx.skip();
            return;
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      if (!tokenRes || !tokenRes.ok) {
        console.log("BLOCKED / SKIPPED: Ephemeral token service returned non-200 or unreachable — live test blocked");
        ctx.skip();
        return;
      }

      expect(tokenRes.status).toBe(200);
      const { token } = await tokenRes.json();
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(20);

      // 2. Provision unique test incident in repository for genuine tool write verification
      const testIncidentId = `incident-live-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await repository.createIncident({
        id: testIncidentId,
        shipmentId: "shipment-po44891",
        incidentNumber: `INC-LIVE-${Date.now().toString().slice(-4)}`,
        status: "DRAFT",
        startedAt: new Date().toISOString(),
      });

      // 3. Open live WebSocket to AssemblyAI Voice Agent API
      const wsUrl = `wss://agents.assemblyai.com/v1/ws?token=${encodeURIComponent(token)}`;
      const ws = new WS(wsUrl);

      const eventsObserved: string[] = [];
      const toolCallsObserved: any[] = [];
      const toolResultsDispatched: Array<{ call_id: string; result: string }> = [];
      let sessionReadyReceived = false;
      let transcriptUserReceived = false;
      let replyStartedReceived = false;
      let toolCallReceived = false;
      let replyDoneReceived = false;
      let toolResultSent = false;
      let nextTurnReceived = false;

      // Prepare 24 kHz PCM16 audio from scenario-po44891-receiver.wav
      const wavPath = path.resolve(__dirname, "../../public/audio/scenario-po44891-receiver.wav");
      let audioFrames24k: string[] = [];

      if (fs.existsSync(wavPath)) {
        const buf = fs.readFileSync(wavPath);
        // 16 kHz 16-bit mono PCM starting after 44-byte WAV header
        const pcm16 = new Int16Array(buf.buffer, buf.byteOffset + 44, (buf.length - 44) / 2);
        // Linear resample 16kHz -> 24kHz (1.5x)
        const outLength = Math.floor(pcm16.length * 1.5);
        const out24k = new Int16Array(outLength);
        for (let i = 0; i < outLength; i++) {
          const pos = i / 1.5;
          const idx = Math.floor(pos);
          const frac = pos - idx;
          const s1 = pcm16[idx] || 0;
          const s2 = pcm16[idx + 1] || s1;
          out24k[i] = Math.round((1 - frac) * s1 + frac * s2);
        }

        // Slice into 50ms frames (1,200 samples = 2,400 bytes)
        const frameSize = 1200;
        for (let offset = 0; offset < out24k.length; offset += frameSize) {
          const chunk = out24k.subarray(offset, Math.min(offset + frameSize, out24k.length));
          const base64 = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength).toString("base64");
          audioFrames24k.push(base64);
        }
      }

      await new Promise<void>((resolve, reject) => {
        let streamInterval: NodeJS.Timeout | null = null;
        const timeout = setTimeout(() => {
          if (streamInterval) clearInterval(streamInterval);
          try { ws.close(); } catch {}
          resolve();
        }, 35000);

        let queuedToolResults: Array<{ call_id: string; result: string }> = [];
        let activeToolCount = 0;
        let pendingReplyDone = false;
        let replyDoneStatus = "completed";

        const checkAndFlush = () => {
          if (activeToolCount === 0 && pendingReplyDone) {
            pendingReplyDone = false;
            if (replyDoneStatus !== "interrupted" && queuedToolResults.length > 0) {
              for (const item of queuedToolResults) {
                ws.send(
                  JSON.stringify({
                    type: "tool.result",
                    call_id: item.call_id,
                    result: item.result,
                  })
                );
                toolResultSent = true;
                eventsObserved.push("tool.result.sent");
                toolResultsDispatched.push(item);
              }
              queuedToolResults = [];
            }
          }
        };

        ws.onopen = () => {
          eventsObserved.push("open");
          // Send session.update conforming to AssemblyAI Voice Agent specification
          // Note: Omit greeting so the agent immediately enters listening mode without speaking over the incoming utterance
          ws.send(
            JSON.stringify({
              type: "session.update",
              session: {
                system_prompt: `${DOCKWITNESS_VOICE_AGENT_SYSTEM_PROMPT}\nAlways acknowledge user observation by executing record_candidate_observation tool immediately.`,
                output: {
                  voice: "alba",
                  format: { encoding: "audio/pcm" },
                },
                tools: DOCKWITNESS_VOICE_AGENT_TOOLS.map((t) => ({
                  type: "function",
                  name: (t as any).name || t.function?.name,
                  description: (t as any).description || t.function?.description,
                  parameters: (t as any).parameters || t.function?.parameters,
                })),
              },
            })
          );
        };

        ws.onmessage = async (event: any) => {
          try {
            const raw = typeof event.data === "string" ? event.data : event.data.toString();
            const msg = JSON.parse(raw);
            eventsObserved.push(msg.type);

            if (msg.type === "session.ready" || msg.type === "session.updated") {
              sessionReadyReceived = true;

              // Once session is ready, stream 24 kHz audio chunks in 50ms intervals
              if (audioFrames24k.length > 0 && !streamInterval) {
                let frameIndex = 0;
                streamInterval = setInterval(() => {
                  if (frameIndex >= audioFrames24k.length || ws.readyState !== WebSocket.OPEN) {
                    if (streamInterval) clearInterval(streamInterval);
                    return;
                  }
                  ws.send(
                    JSON.stringify({
                      type: "input.audio",
                      audio: audioFrames24k[frameIndex],
                    })
                  );
                  frameIndex++;
                }, 50);
              }
            }

            if (msg.type === "transcript.user" || msg.type === "transcript.user.delta") {
              transcriptUserReceived = true;
            }

            if (msg.type === "reply.started" || msg.type === "reply.audio") {
              replyStartedReceived = true;
            }

            if (msg.type === "tool.call") {
              toolCallReceived = true;
              toolCallsObserved.push(msg);
              activeToolCount++;

              try {
                const args = { ...(msg.arguments || {}), incidentId: testIncidentId };
                const toolResult = await executeVoiceAgentTool(msg.name, args);
                queuedToolResults.push({
                  call_id: msg.call_id,
                  result: JSON.stringify(toolResult),
                });
              } catch (err: any) {
                queuedToolResults.push({
                  call_id: msg.call_id,
                  result: JSON.stringify({ error: String(err?.message || err) }),
                });
              } finally {
                activeToolCount = Math.max(0, activeToolCount - 1);
                checkAndFlush();
              }
            }

            if (msg.type === "reply.done") {
              replyDoneReceived = true;
              replyDoneStatus = msg.status || "completed";
              pendingReplyDone = true;
              checkAndFlush();
            }

            if (toolResultSent && (msg.type === "reply.started" || msg.type === "transcript.agent")) {
              nextTurnReceived = true;
              if (streamInterval) clearInterval(streamInterval);
              clearTimeout(timeout);
              try { ws.close(); } catch {}
              resolve();
            }
          } catch (e) {
            // Ignore non-json
          }
        };

        ws.onclose = () => {
          eventsObserved.push("close");
          if (streamInterval) clearInterval(streamInterval);
          clearTimeout(timeout);
          resolve();
        };

        ws.onerror = (err: any) => {
          eventsObserved.push("error");
          if (streamInterval) clearInterval(streamInterval);
          clearTimeout(timeout);
          try { ws.close(); } catch {}
          resolve();
        };
      });

      // INVARIANT: Acceptance test MUST NOT pass merely because session.ready occurred or socket closed.
      // Require explicit assertions that the live session observed session.ready, user transcript,
      // agent reply/audio, tool.call, reply.done, tool.result round trip, and subsequent agent turn.
      const fullTurnCompleted =
        sessionReadyReceived &&
        transcriptUserReceived &&
        replyStartedReceived &&
        toolCallReceived &&
        replyDoneReceived &&
        toolResultSent &&
        nextTurnReceived;

      if (!fullTurnCompleted) {
        const missing: string[] = [];
        if (!sessionReadyReceived) missing.push("session.ready");
        if (!transcriptUserReceived) missing.push("transcript.user");
        if (!replyStartedReceived) missing.push("reply.started/audio");
        if (!toolCallReceived) missing.push("tool.call");
        if (!replyDoneReceived) missing.push("reply.done");
        if (!toolResultSent) missing.push("tool.result round trip");
        if (!nextTurnReceived) missing.push("subsequent agent turn (reply.started/transcript.agent post tool.result)");

        const failureDetail =
          `Real Voice Agent live session failed to complete required full turn cycle. ` +
          `Observed: [${eventsObserved.join(", ")}]. Missing: [${missing.join(", ")}].`;
        console.error(failureDetail);
        expect(fullTurnCompleted, failureDetail).toBe(true);
      }

      // Explicit assertions for verified live PASS
      expect(sessionReadyReceived).toBe(true);
      expect(transcriptUserReceived).toBe(true);
      expect(replyStartedReceived).toBe(true);
      expect(toolCallReceived).toBe(true);
      expect(replyDoneReceived).toBe(true);
      expect(toolResultSent).toBe(true);
      expect(nextTurnReceived).toBe(true);

      // Verify tool execution produced NO error
      expect(toolResultsDispatched.length).toBeGreaterThan(0);
      for (const item of toolResultsDispatched) {
        const parsed = JSON.parse(item.result);
        expect(parsed.error).toBeUndefined();
        expect(parsed.recorded).toBe(true);
      }

      // Verify genuine persistence in repository
      const observations = await repository.getObservations(testIncidentId);
      expect(observations.length).toBeGreaterThan(0);
      const qtyObs = observations.find((o) => o.fieldKey === "observed_qty");
      expect(qtyObs).toBeDefined();
      expect((qtyObs?.valueJson as any)?.observedQty).toBe(47);
      expect(qtyObs?.sourceQuote).toBeTruthy();

      const exceptions = await repository.getExceptions(testIncidentId);
      const shortage = exceptions.find((e) => e.type === "SHORTAGE");
      expect(shortage).toBeDefined();
      expect(shortage?.expectedQty).toBe(48);
      expect(shortage?.observedQty).toBe(47);
      expect(shortage?.delta).toBe(-1);

      const audits = await repository.getAuditEvents(testIncidentId);
      expect(audits.some((a) => a.eventType === "OBSERVATION_RECORDED")).toBe(true);
    }, 75000);
  });

  describe("Layer 6: Automated Barge-In & Audio Interruption Queue Verification", () => {
    it("immediately cancels active agent speech playback when incoming user speech is detected", async () => {
      let stateChanges: string[] = [];
      let turnsCaptured: any[] = [];

      const client = new VoiceAgentClient({
        shipmentId: "shipment-po44891",
        incidentId: "inc-test-bargein",
        onStateChange: (state) => stateChanges.push(state),
        onTurn: (turn) => turnsCaptured.push(turn),
      });

      const handleMessage = (client as any).handleIncomingMessage.bind(client);

      // 1. Simulate Agent starts speaking (transcript.agent)
      await handleMessage({
        type: "transcript.agent",
        text: "Driver, the receiver recorded one carton short and visible damage.",
      });

      expect(client.getState()).toBe("SPEAKING");
      expect(turnsCaptured.some((t) => t.role === "agent")).toBe(true);

      // 2. Simulate chunks arriving and being queued for audio playback
      const dummyAudioBase64 = Buffer.from(new Int16Array(960).buffer).toString("base64");
      await handleMessage({
        type: "audio.chunk",
        audio: dummyAudioBase64,
      });

      // 3. User barge-in! User speaks while agent is speaking
      await handleMessage({
        type: "transcript.user",
        text: "I confirm the damage, but I dispute the shortage!",
      });

      // Assert barge-in invariants:
      // State MUST immediately switch from SPEAKING to LISTENING
      expect(client.getState()).toBe("LISTENING");
      expect(client.isInterrupted).toBe(true);

      // User turn is captured
      const userTurn = turnsCaptured.find((t) => t.role === "user");
      expect(userTurn).toBeDefined();
      expect(userTurn.text).toContain("dispute the shortage");

      // Audio queue must be empty
      expect((client as any).audioQueue.length).toBe(0);
      expect((client as any).isPlayingAudio).toBe(false);
    });

    it("ensures interrupted reply.done purges queued tool results without sending corrupt state", async () => {
      const client = new VoiceAgentClient({
        shipmentId: "shipment-po44891",
        incidentId: "inc-test-bargein",
      });

      // Queue a pending tool result
      client.pendingToolResults.push({
        call_id: "interrupted-call-1",
        result: JSON.stringify({ status: "OBSERVED" }),
      });
      expect(client.pendingToolResults.length).toBe(1);

      // Server emits reply.done with status interrupted
      await (client as any).handleIncomingMessage({
        type: "reply.done",
        status: "interrupted",
      });

      // Queued tool results must be purged
      expect(client.pendingToolResults.length).toBe(0);
      expect(client.isInterrupted).toBe(true);
      expect(client.getState()).toBe("IDLE");
    });
  });
});
