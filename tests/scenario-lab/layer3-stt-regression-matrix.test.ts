import { describe, it, expect } from "vitest";
import dotenv from "dotenv";
import {
  extractCandidateQuantity,
  extractCandidateDamage,
  extractCandidates,
} from "@/lib/extraction";
import { extractDriverAttestations } from "@/lib/extraction/driver-attestation-extractor";

dotenv.config({ path: ".env.local" });

describe("Layer 3: AssemblyAI Streaming STT Utterance & Semantic Extraction Matrix", () => {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;

  describe("Real AssemblyAI Account Integration Smoke", () => {
    it("mints genuine ephemeral streaming WebSocket token via real AssemblyAI API", async (ctx) => {
      if (!apiKey || apiKey === "mock-assemblyai-key-for-test") {
        console.log("BLOCKED / SKIPPED: Live ASSEMBLYAI_API_KEY not configured — live token mint cannot execute without real credentials");
        ctx.skip();
        return;
      }

      async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
        let lastError: unknown;
        for (let attempt = 0; attempt <= retries; attempt++) {
          try {
            return await fetch(url, options);
          } catch (err) {
            lastError = err;
            if (attempt < retries) {
              await new Promise((resolve) => setTimeout(resolve, 600));
            }
          }
        }
        throw lastError;
      }

      const streamUrl = "https://streaming.assemblyai.com/v3/token?expires_in_seconds=60&max_session_duration_seconds=600";
      let res: Response;
      try {
        res = await fetchWithRetry(streamUrl, {
          method: "GET",
          headers: {
            authorization: apiKey.trim(),
            accept: "application/json",
          },
        });
      } catch (networkErr: unknown) {
        console.log("BLOCKED / SKIPPED: Live AssemblyAI streaming endpoint unreachable:", networkErr);
        ctx.skip();
        return;
      }

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("token");
      expect(typeof data.token).toBe("string");
      expect(data.token.length).toBeGreaterThan(20);

      // Also test Voice Agent token minting endpoint
      let agentRes: Response;
      try {
        agentRes = await fetchWithRetry("https://agents.assemblyai.com/v1/token?expires_in_seconds=60", {
          method: "GET",
          headers: {
            authorization: `Bearer ${apiKey.trim()}`,
            accept: "application/json",
          },
        });
      } catch (networkErr: unknown) {
        console.log("BLOCKED / SKIPPED: Live AssemblyAI agent endpoint unreachable:", networkErr);
        ctx.skip();
        return;
      }
      expect(agentRes.status).toBe(200);
      const agentData = await agentRes.json();
      expect(agentData).toHaveProperty("token");
      expect(typeof agentData.token).toBe("string");
    });
  });

  describe("Semantic Utterance Regression Corpus (Mandatory Prompt Variants)", () => {
    const speechVariants = [
      {
        utterance: "I have forty-seven cartons.",
        expectedQty: 47,
        expectedCondition: null,
      },
      {
        utterance: "47 cartons.",
        expectedQty: 47,
        expectedCondition: null,
      },
      {
        utterance: "I received forty-seven of forty-eight.",
        expectedQty: 47,
        expectedCondition: null,
      },
      {
        utterance: "I have 47, we're short one.",
        expectedQty: 47,
        expectedCondition: null,
      },
      {
        utterance: "Forty-seven cartons; carton thirty-one is damaged.",
        expectedQty: 47,
        expectedCondition: "damaged",
        cartonRef: "carton thirty-one",
      },
      {
        utterance: "Carton thirty-one is damaged. My count is forty-seven.",
        expectedQty: 47,
        expectedCondition: "damaged",
        cartonRef: "Carton thirty-one",
      },
      {
        utterance: "I counted forty-seven. The shortage is one.",
        expectedQty: 47,
        expectedCondition: null,
      },
      {
        utterance: "Unloaded 47 boxes. Carton 31 is crushed and wet.",
        expectedQty: 47,
        expectedCondition: "crushed",
        cartonRef: "Carton 31",
      },
    ];

    speechVariants.forEach((testCase, index) => {
      it(`[Utterance Variant ${index + 1}] "${testCase.utterance}" extracts qty=${testCase.expectedQty} and NEVER confuses carton 31`, () => {
        const qty = extractCandidateQuantity(testCase.utterance, { speakerRole: "RECEIVER" });
        expect(qty).not.toBeNull();
        expect(qty!.observedQty).toBe(testCase.expectedQty);

        // STRICT INVARIANT: Must NEVER extract carton number 31 as observed shipment quantity
        expect(qty!.observedQty).not.toBe(31);

        if (testCase.expectedCondition) {
          const dmg = extractCandidateDamage(testCase.utterance, { speakerRole: "RECEIVER" });
          expect(dmg).not.toBeNull();
          expect(dmg!.condition.toLowerCase()).toContain(testCase.expectedCondition);
          if (testCase.cartonRef) {
            expect(dmg!.cartonReference?.toLowerCase()).toMatch(/(?:31|thirty-one)/);
          }
        }
      });
    });
  });

  describe("Manifest Domain Keyterm Robustness", () => {
    const domainManifestUtterances = [
      "Purchase order 44891 for NorthStar Freight arrived with forty-seven cartons.",
      "BOL NS-90283 has forty-seven cartons of Industrial Filter Cartons SKU NST-2208.",
      "Item AX-17 in carton thirty-one is damaged; forty-seven cartons total received.",
    ];

    for (const text of domainManifestUtterances) {
      it(`Successfully extracts quantity 47 while ignoring PO/BOL/SKU numbers: "${text}"`, () => {
        const result = extractCandidates(text, { speakerRole: "RECEIVER" });
        expect(result.observedQty).toBe(47);
        expect(result.observedQty).not.toBe(44891);
        expect(result.observedQty).not.toBe(90283);
        expect(result.observedQty).not.toBe(2208);
        expect(result.observedQty).not.toBe(17);
        expect(result.observedQty).not.toBe(31);
      });
    }
  });

  describe("Driver Speech Attestation Semantic Mapping", () => {
    it("maps canonical Golden Driver 'I confirm the damaged carton, but I dispute the shortage. The seal was intact.' to Damage: CONFIRM, Shortage: DISPUTE", () => {
      const text = "I confirm the damaged carton, but I dispute the shortage. The seal was intact.";
      const att = extractDriverAttestations(text);
      expect(att.damagePosition).toBe("CONFIRM");
      expect(att.quantityPosition).toBe("DISPUTE");
    });

    it("maps 'I confirm the damage, but I can't confirm the shortage. The seal was intact.' to Damage: CONFIRM, Shortage: NO_KNOWLEDGE", () => {
      const text = "I confirm the damage, but I can't confirm the shortage. The seal was intact.";
      const att = extractDriverAttestations(text);
      expect(att.damagePosition).toBe("CONFIRM");
      expect(att.quantityPosition).toBe("NO_KNOWLEDGE");
    });

    it("maps driver refusal 'I'm not signing that' to REFUSED_TO_ATTEST", () => {
      const text = "I'm not signing that. It's not my problem.";
      const att = extractDriverAttestations(text);
      expect(att.quantityPosition).toBe("REFUSED_TO_ATTEST");
      expect(att.damagePosition).toBe("REFUSED_TO_ATTEST");
    });

    it("maps 'Driver left dock, post-delivery exception' to DRIVER_UNAVAILABLE", () => {
      const text = "The driver is gone and unavailable. This is a post-delivery exception.";
      const att = extractDriverAttestations(text);
      expect(att.quantityPosition).toBe("DRIVER_UNAVAILABLE");
      expect(att.damagePosition).toBe("DRIVER_UNAVAILABLE");
    });

    it("maps 'I don't know, trailer was sealed' to NO_KNOWLEDGE or DISPUTE on shortage", () => {
      const text = "I don't know, I just hauled it.";
      const att = extractDriverAttestations(text);
      expect(att.quantityPosition).toBe("NO_KNOWLEDGE");
    });
  });
});
