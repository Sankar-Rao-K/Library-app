/**
 * Smart Search Engine — v4
 * ────────────────────────────────────────────────────────────────────
 * PIN / numeric IDs  → 100% starts-with exact match only
 * Names, titles      → fuzzy with ≥60% token coverage
 * 200ms debounce     → exported helper
 * getHighlightSegments → yellow text highlights
 * getCatalogueFromBook → accession-prefix catalogue classifier
 */

// ── Normalise / tokenise ─────────────────────────────────────────────
export function normalize(str) {
  if (!str) return "";
  return String(str).toLowerCase().replace(/\s+/g, " ").trim();
}

export function tokenize(query) {
  return normalize(query).split(" ").filter(Boolean);
}

// ── ID / PIN detection ────────────────────────────────────────────────
/** Returns true when the query looks like a PIN or numeric CFMS ID */
export function isIdQuery(query) {
  const q = query.trim();
  if (/^\d{2,5}-[A-Za-z]{2}-\d{0,3}$/.test(q)) return true;  // full/partial PIN
  if (/^\d{2,5}-/.test(q))  return true;                       // starts like PIN
  if (/^\d{6,}$/.test(q))   return true;                       // CFMS numeric ID
  return false;
}

// ── Scoring ───────────────────────────────────────────────────────────
function scoreField(fieldValue, tokens) {
  const val = normalize(fieldValue);
  if (!val || tokens.length === 0) return 0;

  let score = 0, matchedTokens = 0;

  for (const token of tokens) {
    if (val === token) {
      score += 120; matchedTokens++;
    } else if (val.startsWith(token)) {
      score += 80; matchedTokens++;
    } else {
      const fieldWords = val.split(" ");
      if (fieldWords.some((w) => w.startsWith(token))) {
        score += 50; matchedTokens++;
      } else if (token.length >= 3 && val.includes(token)) {
        score += 25; matchedTokens++;
      }
    }
  }

  if (matchedTokens === tokens.length) score += 40;
  if (tokens.length > 1 && matchedTokens / tokens.length < 0.6) return 0;
  if (tokens.length === 1 && matchedTokens === 0) return 0;

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

// ── Main search ───────────────────────────────────────────────────────
/**
 * smartSearch(items, query, fuzzyFields, minScore, idFields, maxResults)
 *
 * - If query looks like a PIN/ID → exact/startsWith on idFields (or fuzzyFields)
 * - Otherwise fuzzy score across fuzzyFields, require ≥60% token match
 */
export function smartSearch(
  items,
  query,
  fuzzyFields,
  minScore  = 20,
  idFields  = [],
  maxResults = 50
) {
  const q = query.trim();
  if (!q) return items;

  // ── PIN / ID exact mode ──────────────────────────────────────────
  if (isIdQuery(q)) {
    const qn = normalize(q);
    const checkFields = idFields.length > 0 ? idFields : fuzzyFields;
    return items
      .filter((item) =>
        checkFields.some((f) => {
          const val = normalize(typeof f === "function" ? f(item) : item[f]);
          return val === qn || val.startsWith(qn);
        })
      )
      .slice(0, maxResults);
  }

  // ── Fuzzy mode ───────────────────────────────────────────────────
  const tokens = tokenize(q);
  return items
    .map((item) => ({ item, score: scoreItem(item, fuzzyFields, tokens) }))
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item)
    .slice(0, maxResults);
}

// ── Highlight helper ──────────────────────────────────────────────────
/**
 * Returns [{text, match}] segments for yellow highlighting.
 * Usage: getHighlightSegments("Engineering Math", "math")
 *   → [{text:"Engineering ", match:false}, {text:"Math", match:true}, ...]
 */
export function getHighlightSegments(text, query) {
  const str = String(text || "");
  const q   = query.trim();
  if (!q || str.length === 0) return [{ text: str, match: false }];

  const tokens = tokenize(q);
  if (tokens.length === 0) return [{ text: str, match: false }];

  const lower = str.toLowerCase();
  let bestStart = -1, bestLen = 0;

  for (const token of tokens) {
    if (token.length < 2) continue;
    const idx = lower.indexOf(token);
    if (idx !== -1 && (bestStart === -1 || idx < bestStart)) {
      bestStart = idx;
      bestLen   = token.length;
    }
  }

  if (bestStart === -1) return [{ text: str, match: false }];

  const before  = str.slice(0, bestStart);
  const matched = str.slice(bestStart, bestStart + bestLen);
  const after   = str.slice(bestStart + bestLen);

  const result = [];
  if (before)  result.push({ text: before,  match: false });
                result.push({ text: matched, match: true  });
  if (after)   result.push({ text: after,   match: false });
  return result;
}

/**
 * getMatchedField — returns which secondary field matched (for badge display).
 * Returns null if the primary display field already explains the match.
 */
export function getMatchedField(item, query, primaryField, otherFields) {
  const q = query.trim().toLowerCase();
  if (!q || q.length < 2) return null;
  const primaryVal = normalize(item[primaryField] || "");
  if (primaryVal.includes(q)) return null;
  for (const { field, label } of otherFields) {
    const val = normalize(item[field] || "");
    if (val.includes(q)) return { label, value: item[field] };
  }
  return null;
}

// ── Debounce ──────────────────────────────────────────────────────────
/** Returns a debounced wrapper of fn that fires after `delay` ms of silence */
export function debounce(fn, delay = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ── Book catalogue classifier ─────────────────────────────────────────
/**
 * getCatalogueFromBook(book)
 *
 * Reads the accession number prefix to categorise books:
 *   BB-*  → "BB Catalogue"
 *   DD-*  → "Donated Books"
 *   Purely numeric (1234) → uses subject/genre field (CME, ECE, etc.)
 *   Otherwise → subject/genre field
 *
 * Used consistently in Books.jsx and QRCodes.jsx for both filtering and sorting.
 */
export function getCatalogueFromBook(book) {
  const acc = (book.accessionNo || book.barcode || "").trim().toUpperCase();

  // Explicit prefix detection — order matters
  if (book.isBB || acc.startsWith("BB")) return "BB Catalogue";
  if (acc.startsWith("DD")) return "Donated Books";

  // Fall back to subject/genre for numeric or other accessions
  const subj = (book.subject || book.genre || "General").trim();
  return subj || "General";
}

/**
 * sortByAccession(books)
 *
 * Sorts books by accession number using natural sort:
 * - Purely numeric: 1, 2, 3 … 99, 100
 * - Prefixed: BB-001, BB-002 … DD-001 … CME-001
 * Uses localeCompare with numeric:true for correct ordering.
 */
export function sortByAccession(books) {
  return [...books].sort((a, b) => {
    const aA = (a.accessionNo || a.barcode || "").trim();
    const bA = (b.accessionNo || b.barcode || "").trim();
    return aA.localeCompare(bA, undefined, { numeric: true, sensitivity: "base" });
  });
}

/**
 * CATALOGUE_ORDER — display priority for category tabs
 * Numeric/main catalogue first, then BB, then Donated, then others alphabetically.
 */
export const CATALOGUE_ORDER = (cats) => {
  const priority = { "BB Catalogue": 900, "Donated Books": 800 };
  return [...cats].sort((a, b) => {
    const pA = priority[a] ?? 0;
    const pB = priority[b] ?? 0;
    if (pA !== pB) return pA - pB; // lower priority first (main subject first)
    return a.localeCompare(b);
  });
};