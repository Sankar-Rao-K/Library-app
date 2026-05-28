/**
 * Smart search engine
 * ─────────────────────────────────────────────────────────
 * PIN / numeric ID → 100% starts-with match (no fuzzy)
 * Names, titles, authors → fuzzy with ≥60% token coverage
 * Extra spaces collapsed, case-insensitive, relevance scored
 */

export function normalize(str) {
  if (!str) return "";
  return String(str).toLowerCase().replace(/\s+/g, " ").trim();
}

export function tokenize(query) {
  return normalize(query).split(" ").filter(Boolean);
}

// Detect PIN (23173-CM-001) or numeric CFMS ID (≥6 digits) → exact only
export function isIdQuery(query) {
  const q = query.trim();
  if (/^\d{2,5}-[A-Za-z]{2}-\d{0,3}$/.test(q)) return true; // full or partial PIN
  if (/^\d{2,5}-/.test(q))  return true;                      // starts like PIN
  if (/^\d{6,}$/.test(q))   return true;                      // CFMS numeric ID
  return false;
}

function scoreField(fieldValue, tokens) {
  const val = normalize(fieldValue);
  if (!val || tokens.length === 0) return 0;

  let score = 0, matchedTokens = 0;

  for (const token of tokens) {
    if (val === token) {
      score += 100; matchedTokens++;
    } else if (val.startsWith(token)) {
      score += 70; matchedTokens++;
    } else if (val.includes(token)) {
      score += 35; matchedTokens++;
    } else {
      const anyWordMatch = val.split(" ").some(
        (w) => w.startsWith(token) || (token.length >= 3 && token.startsWith(w))
      );
      if (anyWordMatch) { score += 18; matchedTokens++; }
    }
  }

  if (matchedTokens === tokens.length) score += 50;

  // Require ≥60% of tokens to match
  if (tokens.length > 1 && matchedTokens / tokens.length < 0.6) return 0;

  return score;
}

export function scoreItem(item, fields, tokens) {
  if (tokens.length === 0) return 0;
  let total = 0;
  for (const field of fields) {
    const val = typeof field === "function" ? field(item) : item[field];
    total += scoreField(val, tokens);
  }
  return total;
}

/**
 * Main search function.
 * Handles PIN/ID exact matching automatically.
 * idFields – which fields to test for exact PIN/ID match
 * fuzzyFields – which fields to score for fuzzy
 */
export function smartSearch(
  items,
  query,
  fuzzyFields,
  minScore = 15,
  idFields = []
) {
  const q = query.trim();
  if (!q) return items;

  // ── PIN / ID mode ─────────────────────────────────────────────────
  if (isIdQuery(q)) {
    const qn = normalize(q);
    const checkFields = idFields.length > 0 ? idFields : fuzzyFields;
    return items.filter((item) =>
      checkFields.some((f) => {
        const val = normalize(typeof f === "function" ? f(item) : item[f]);
        return val === qn || val.startsWith(qn);
      })
    );
  }

  // ── Fuzzy mode ────────────────────────────────────────────────────
  const tokens = tokenize(q);
  return items
    .map((item) => ({ item, score: scoreItem(item, fuzzyFields, tokens) }))
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}