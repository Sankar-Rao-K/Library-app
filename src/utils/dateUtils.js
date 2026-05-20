/** Today's date as YYYY-MM-DD string */
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** Minimum allowed date in the system: 2008-01-01 */
export const MIN_DATE = "2008-01-01";

/**
 * Returns the minimum "To" date given a "From" date.
 * If fromDate is set, minimum To = fromDate; else MIN_DATE.
 */
export function minToDate(fromDate) {
  return fromDate || MIN_DATE;
}

/**
 * Clamp a date string to [MIN_DATE, today].
 * Returns the clamped value.
 */
export function clampDate(dateStr) {
  if (!dateStr) return "";
  const today = todayStr();
  if (dateStr < MIN_DATE) return MIN_DATE;
  if (dateStr > today)    return today;
  return dateStr;
}