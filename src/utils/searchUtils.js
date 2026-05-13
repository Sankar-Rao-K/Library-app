/**
 * Smart search utility — handles:
 * - Extra spaces between words ("Ravi  Kumar" → ["Ravi","Kumar"])
 * - Partial word matches
 * - Any-word matching (if you type 2 of 3 words, still shows)
 * - Relevance scoring (exact > starts-with > contains)
 */

// Normalize: lowercase, collapse multiple spaces, trim
export function normalize(str) {
  if (!str) return "";
  return String(str).toLowerCase().replace(/\s+/g, " ").trim();
}

// Split query into meaningful tokens
export function tokenize(query) {
  return normalize(query).split(" ").filter(Boolean);
}

/**
 * Score a single field value against all tokens.
 * Higher score = more relevant.
 */
function scoreField(fieldValue, tokens) {
  const val = normalize(fieldValue);
  if (!val || tokens.length === 0) return 0;

  let score = 0;
  let matchedTokens = 0;

  for (const token of tokens) {
    if (val === token) {
      score += 100;      // exact full match
      matchedTokens++;
    } else if (val.startsWith(token)) {
      score += 60;       // starts with token
      matchedTokens++;
    } else if (val.includes(token)) {
      score += 30;       // contains token anywhere
      matchedTokens++;
    } else {
      // Partial: check if field words start with token
      const fieldWords = val.split(" ");
      const partialMatch = fieldWords.some(
        (w) => w.startsWith(token) || token.startsWith(w)
      );
      if (partialMatch) {
        score += 15;
        matchedTokens++;
      }
    }
  }

  // Bonus: all tokens matched
  if (matchedTokens === tokens.length) score += 50;

  // Penalty: very few tokens matched out of many
  const matchRatio = matchedTokens / tokens.length;
  if (matchRatio < 0.5 && tokens.length > 1) score = 0; // less than half matched = irrelevant

  return score;
}

/**
 * Score an item against a list of fields.
 * Returns total relevance score.
 */
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
 * Smart filter + sort by relevance.
 * items: array of objects
 * query: string typed by user
 * fields: array of field names or functions (item) => string
 * minScore: minimum score to include (default 15 = at least partial match)
 */
export function smartSearch(items, query, fields, minScore = 15) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return items;

  return items
    .map((item) => ({ item, score: scoreItem(item, fields, tokens) }))
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}