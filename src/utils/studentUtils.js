/**
 * studentUtils.js
 *
 * Semester schedule — Government Polytechnic Anakapalli:
 *
 *  1st Year  (July joinYear → May joinYear+1)
 *    Sem 1 : July     – December  (joinYear)
 *    Sem 2 : January  – May       (joinYear+1)
 *
 *  2nd Year
 *    Sem 3 : June     – November  (joinYear+1)
 *    Sem 4 : December (joinYear+1) – May (joinYear+2)
 *
 *  3rd Year
 *    Sem 5 : June     – November  (joinYear+2)
 *    Sem 6 : December (joinYear+2) – May (joinYear+3)
 *
 *  Passed Out : June (joinYear+3) onwards
 *
 * PIN format  : YY173-CM-NNN  →  first 2 digits = short join year
 *               e.g. "23173-CM-001" → joinYear = 2023
 */

// ── Semester labels ────────────────────────────────────────────────────
export const SEM_LABELS = {
  1: "I Year · Sem 1",
  2: "I Year · Sem 2",
  3: "II Year · Sem 3",
  4: "II Year · Sem 4",
  5: "III Year · Sem 5",
  6: "III Year · Sem 6",
};

// ── Display order for group headers ───────────────────────────────────
export const SEM_ORDER = [1, 2, 3, 4, 5, 6, "passed"];

// ── Core function ──────────────────────────────────────────────────────
/**
 * getStudentInfo(pin)
 *
 * Returns:
 *   semNum      : 1–6 | null (passed out / unknown)
 *   year        : 1, 2, 3 | null
 *   label       : human-readable group label
 *   isPassedOut : boolean — true when past May of 3rd year
 *   joinYear    : full 4-digit join year (e.g. 2023)
 */
export function getStudentInfo(pin) {
  const UNKNOWN = { semNum: null, year: null, label: "Unknown", isPassedOut: false, joinYear: null };
  if (!pin) return UNKNOWN;

  const short = parseInt(String(pin).trim().substring(0, 2), 10);
  if (isNaN(short)) return UNKNOWN;

  const joinYear = 2000 + short;
  const now      = new Date();
  const cy       = now.getFullYear();   // current year
  const cm       = now.getMonth() + 1;  // 1–12

  let semNum      = null;
  let isPassedOut = false;

  // ── Year 1 ───────────────────────────────────────────────────────────
  if (cy === joinYear && cm >= 7 && cm <= 12)
    semNum = 1;                         // Jul–Dec of join year → Sem 1

  else if (cy === joinYear + 1 && cm >= 1 && cm <= 5)
    semNum = 2;                         // Jan–May of joinYear+1 → Sem 2

  // ── Year 2 ───────────────────────────────────────────────────────────
  else if (cy === joinYear + 1 && cm >= 6 && cm <= 11)
    semNum = 3;                         // Jun–Nov of joinYear+1 → Sem 3

  else if ((cy === joinYear + 1 && cm === 12) ||
           (cy === joinYear + 2 && cm >= 1 && cm <= 5))
    semNum = 4;                         // Dec(joinYear+1)–May(joinYear+2) → Sem 4

  // ── Year 3 ───────────────────────────────────────────────────────────
  else if (cy === joinYear + 2 && cm >= 6 && cm <= 11)
    semNum = 5;                         // Jun–Nov of joinYear+2 → Sem 5

  else if ((cy === joinYear + 2 && cm === 12) ||
           (cy === joinYear + 3 && cm >= 1 && cm <= 5))
    semNum = 6;                         // Dec(joinYear+2)–May(joinYear+3) → Sem 6

  // ── Passed Out ────────────────────────────────────────────────────────
  else if (cy > joinYear + 3 || (cy === joinYear + 3 && cm >= 6))
    isPassedOut = true;                 // June (joinYear+3) onwards

  const yearNum = semNum ? Math.ceil(semNum / 2) : null;

  return {
    semNum,
    year:        yearNum,
    label:       isPassedOut ? "Passed Out" : (SEM_LABELS[semNum] ?? "Unknown"),
    isPassedOut,
    joinYear,
  };
}

// ── Convenience: group label for a student record ─────────────────────
export function getSemGroupKey(student) {
  const { semNum, isPassedOut } = getStudentInfo(student.pin);
  return isPassedOut ? "passed" : (semNum ?? "unknown");
}