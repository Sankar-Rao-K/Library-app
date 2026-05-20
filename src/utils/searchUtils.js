/**
 * Smart search engine:
 * - PIN numbers (XX###-XX-###) → 100% exact match only
 * - CFMS / Staff IDs (pure numeric ≥6 digits) → 100% exact match only  
 * - Names, titles, authors → fuzzy with ≥60% token match threshold
 * - Extra spaces collapsed, case-insensitive
 * - Relevance scored and sorted
 */

export function normalize(str) {
  if (!str) return "";
  return String(str).toLowerCase().replace(/\s+/g, " ").trim();
}

export function tokenize(query) {
  return normalize(query).split(" ").filter(Boolean);
}

/** Detect if a query looks like a PIN or numeric ID → requires exact match */
function isIdQuery(query) {
  const q = query.trim();
  // PIN format: 23173-CM-001 or partial like 23173
  if (/^\d{2,5}-[A-Za-z]{2}-\d{3}$/.test(q)) return true;
  // Partial PIN starting with digits-dash
  if (/^\d{2,5}-/.test(q)) return true;
  // Pure numeric ≥ 6 digits (CFMS Staff ID)
  if (/^\d{6,}$/.test(q)) return true;
  return false;
}

/** Score a single text field against all fuzzy tokens */
function scoreField(fieldValue, tokens) {
  const val = normalize(fieldValue);
  if (!val || tokens.length === 0) return 0;

  let score = 0;
  let matchedTokens = 0;

  for (const token of tokens) {
    if (val === token) {
      score += 100; matchedTokens++;
    } else if (val.startsWith(token)) {
      score += 60; matchedTokens++;
    } else if (val.includes(token)) {
      score += 30; matchedTokens++;
    } else {
      const fieldWords = val.split(" ");
      const partialMatch = fieldWords.some(
        (w) => w.startsWith(token) || token.startsWith(w)
      );
      if (partialMatch) { score += 15; matchedTokens++; }
    }
  }

  if (matchedTokens === tokens.length) score += 50;

  // ≥ 60% of tokens must match (was 50% before)
  const matchRatio = matchedTokens / tokens.length;
  if (matchRatio < 0.6 && tokens.length > 1) return 0;

  return score;
}

/**
 * Smart search + filter.
 *
 * exactFields   – array of field names that require 100% match (pin, staffId, barcode, accessionNo)
 * fuzzyFields   – array of field names for fuzzy matching (name, title, author, etc.)
 *
 * If the query looks like a PIN or ID:
 *   - Only search exactFields, require startsWith match (partial PIN still works)
 *   - If nothing matches → return [] with isIdSearch=true flag
 *
 * Otherwise:
 *   - Search all fields, apply 60% threshold
 */
export function smartSearch(
  items,
  query,
  fields,             // legacy: array used as fuzzyFields
  _minScore = 15,     // kept for backward compat
  exactFields = []    // optional: fields requiring exact/starts-with match
) {
  const q = query.trim();
  if (!q) return items;

  const tokens = tokenize(q);

  // ── ID / PIN query → exact match only ────────────────────────────────
  if (isIdQuery(q)) {
    const qLower = normalize(q);
    // Determine which fields to check for exact match
    const idFields = exactFields.length > 0
      ? exactFields
      : fields.filter((f) =>
          typeof f === "string" &&
          ["pin", "staffId", "barcode", "accessionNo", "barcode"].includes(f)
        );
    const checkFields = idFields.length > 0 ? idFields : fields;

    const results = items.filter((item) =>
      checkFields.some((f) => {
        const val = normalize(typeof f === "function" ? f(item) : item[f]);
        return val === qLower || val.startsWith(qLower);
      })
    );
    return results; // empty array if nothing matches — caller shows "not found"
  }

  // ── Fuzzy query → score + 60% threshold ──────────────────────────────
  return items
    .map((item) => {
      let total = 0;
      for (const field of fields) {
        const val = typeof field === "function" ? field(item) : item[field];
        total += scoreField(val, tokens);
      }
      return { item, score: total };
    })
    .filter(({ score }) => score >= 15)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

/** Export tokenize so other files can use it */
export { isIdQuery };