/**
 * Spoken Word to Number Lexer & Parser
 * Converts English spoken numbers ("forty-seven", "two dozen", "50") to integers.
 */

const ONES: Readonly<Record<string, number>> = {
  zero: 0,
  none: 0,
  nil: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
};

const TEENS: Readonly<Record<string, number>> = {
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Readonly<Record<string, number>> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/**
 * Parses a spoken number phrase or numeric string into an integer.
 * Returns null if the phrase cannot be resolved to a valid non-negative integer.
 */
export function parseSpokenNumber(phrase: string): number | null {
  if (!phrase || typeof phrase !== "string") return null;
  const cleaned = phrase.trim().toLowerCase().replace(/[,.]/g, "");
  if (!cleaned) return null;

  // 1. Direct numeric digits: "47", "50", "0"
  if (/^\d+$/.test(cleaned)) {
    const val = parseInt(cleaned, 10);
    return Number.isSafeInteger(val) && val >= 0 ? val : null;
  }

  // 2. Dozen expressions ("two dozen", "half a dozen", "a dozen", "one dozen")
  if (cleaned.includes("dozen")) {
    if (cleaned === "a dozen" || cleaned === "one dozen" || cleaned === "dozen") return 12;
    if (cleaned === "half a dozen" || cleaned === "half dozen") return 6;
    const dozenPrefix = cleaned.replace(/\s*dozen.*$/, "").trim();
    if (dozenPrefix === "a" || dozenPrefix === "one") return 12;
    const count = parseSpokenNumber(dozenPrefix);
    if (count !== null) return count * 12;
  }

  // 3. Simple single-token numbers
  if (cleaned in ONES) return ONES[cleaned];
  if (cleaned in TEENS) return TEENS[cleaned];
  if (cleaned in TENS) return TENS[cleaned];

  // 4. Compound tens + units: "forty-seven", "forty seven"
  const parts = cleaned.split(/[\s-]+/).filter(Boolean);
  if (parts.length === 2) {
    const [tenWord, unitWord] = parts;
    if (tenWord in TENS && unitWord in ONES) {
      return TENS[tenWord] + ONES[unitWord];
    }
  }

  // 5. Hundreds: "one hundred", "two hundred forty-seven", "one hundred and twenty-five"
  if (parts.includes("hundred")) {
    const hundredIdx = parts.indexOf("hundred");
    const multWord = parts.slice(0, hundredIdx).join(" ");
    const mult = multWord === "" || multWord === "a" || multWord === "one" ? 1 : parseSpokenNumber(multWord);
    if (mult === null) return null;

    let total = mult * 100;
    const remainderParts = parts.slice(hundredIdx + 1).filter((w) => w !== "and");
    if (remainderParts.length > 0) {
      const remVal = parseSpokenNumber(remainderParts.join(" "));
      if (remVal === null) return null;
      total += remVal;
    }
    return total;
  }

  // 6. Thousands: "one thousand", "two thousand five hundred"
  if (parts.includes("thousand")) {
    const thousandIdx = parts.indexOf("thousand");
    const multWord = parts.slice(0, thousandIdx).join(" ");
    const mult = multWord === "" || multWord === "a" || multWord === "one" ? 1 : parseSpokenNumber(multWord);
    if (mult === null) return null;

    let total = mult * 1000;
    const remainderParts = parts.slice(thousandIdx + 1).filter((w) => w !== "and");
    if (remainderParts.length > 0) {
      const remVal = parseSpokenNumber(remainderParts.join(" "));
      if (remVal === null) return null;
      total += remVal;
    }
    return total;
  }

  return null;
}
