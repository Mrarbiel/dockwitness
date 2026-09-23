/**
 * DockWitness Domain Damage Extractor
 * Extracts carton references and physical damage conditions from verbatim transcript text.
 * Pure deterministic domain logic.
 */

export interface ExtractedDamage {
  condition: string;
  cartonReference: string | null;
  sourceQuote: string;
  confidence: number;
}

const DAMAGE_KEYWORDS = [
  "crushed",
  "punctured",
  "torn",
  "wet",
  "damaged",
  "broken",
  "dented",
  "leaking",
  "smashed",
  "cracked",
  "severed",
  "open",
];

const DAMAGE_KEYWORDS_REGEX = DAMAGE_KEYWORDS.join("|");

export class DamageExtractor {
  extractDamage(text: string): ExtractedDamage | null {
    if (!text || typeof text !== "string" || !text.trim()) {
      return null;
    }

    const cleanText = text.trim();

    // Check if any damage keyword is present
    const hasDamageKeyword = new RegExp(`\\b(${DAMAGE_KEYWORDS_REGEX})\\b`, "i").test(cleanText);
    if (!hasDamageKeyword) {
      return null;
    }

    // Pattern 1: Carton reference followed by damage condition in same clause
    // e.g. "Carton thirty-one is crushed underneath and wet on the right side."
    // e.g. "Carton 31 is crushed underneath and wet on the right side."
    const cartonWithConditionRegex = new RegExp(
      `\\b(?<carton>(?:carton|box|unit|item|case|pallet)\\s+(?:#|number\\s+)?[a-z0-9-]+(?:\\s+[a-z0-9-]+)?)\\b(?:\\s+(?:is|was|looks|appeared)?\\s+)?(?<condition>(?:(?:and|or|,|\\s+)*\\b(?:${DAMAGE_KEYWORDS_REGEX}|underneath|on the right side|on top|all over)\\b[^.?!;]*))`,
      "i"
    );

    const matchCarton = cartonWithConditionRegex.exec(cleanText);
    if (matchCarton && matchCarton.groups) {
      const carton = matchCarton.groups.carton?.trim() || null;
      let condition = matchCarton.groups.condition?.trim() || "damaged";

      // Clean condition trailing punctuation
      condition = condition.replace(/[.?!;]+$/, "").trim();

      return {
        condition,
        cartonReference: carton,
        sourceQuote: matchCarton[0].trim(),
        confidence: 0.95,
      };
    }

    // Pattern 2: Standalone carton reference anywhere in utterance + damage clause
    const cartonRegex = /\b(?:carton|box|unit|item|case|pallet)\s+(?:#|number\s+)?[a-z0-9-]+(?:\s+[a-z0-9-]+)?\b/i;
    const cartonMatch = cartonRegex.exec(cleanText);
    const cartonReference = cartonMatch ? cartonMatch[0].trim() : null;

    // Extract clause containing the damage keyword
    const clauses = cleanText.split(/[.?!;]/).map((c) => c.trim()).filter(Boolean);
    const damageClause = clauses.find((c) => new RegExp(`\\b(${DAMAGE_KEYWORDS_REGEX})\\b`, "i").test(c));

    const selectedClause = damageClause || cleanText;

    // Find the specific condition phrase
    const condRegex = new RegExp(`\\b(?:${DAMAGE_KEYWORDS_REGEX})\\b[^,;.]*`, "i");
    const condMatch = condRegex.exec(selectedClause);
    const condition = condMatch ? condMatch[0].trim() : "damaged";

    return {
      condition,
      cartonReference,
      sourceQuote: selectedClause,
      confidence: 0.9,
    };
  }
}

export const damageExtractor = new DamageExtractor();

export function extractDamage(text: string): ExtractedDamage | null {
  return damageExtractor.extractDamage(text);
}
