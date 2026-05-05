/**
 * Diploma Structure:
 *   Year 1 → Sem 1 only        (July – June)
 *   Year 2 → Sem 3 (Jul-Dec), Sem 4 (Jan-Jun)
 *   Year 3 → Sem 5 (Jul-Dec), Sem 6 (Jan-Jun)
 *   > 3 years → Old Student / Passed Out
 *
 * Academic year starts in July.
 * PIN format: YYXXX-CM-NNN  (YY = last 2 digits of join year)
 */

export function getStudentInfo(pin) {
  if (!pin || typeof pin !== "string") {
    return { yearLabel: "Unknown", sem: "—", isOld: false };
  }

  const joinYearShort = parseInt(pin.substring(0, 2), 10);
  if (isNaN(joinYearShort)) {
    return { yearLabel: "Unknown", sem: "—", isOld: false };
  }

  const joinYear = 2000 + joinYearShort;
  const now = new Date();
  const month = now.getMonth() + 1; // 1 = Jan, 12 = Dec
  const currentYear = now.getFullYear();

  // Academic year start: July of current year if month >= 7, else July of last year
  const academicYearStart = month >= 7 ? currentYear : currentYear - 1;

  // How many full academic years have passed since joining
  const yearsElapsed = academicYearStart - joinYear;
  const studyYear = yearsElapsed + 1; // 1st year = 0 elapsed

  if (studyYear > 3) {
    return { yearLabel: "Passed Out", sem: "—", isOld: true, studyYear };
  }
  if (studyYear < 1) {
    return { yearLabel: "Not Yet Joined", sem: "—", isOld: false, studyYear };
  }

  // Current semester
  let sem;
  if (studyYear === 1) {
    sem = "Sem 1";
  } else if (studyYear === 2) {
    sem = month >= 7 ? "Sem 3" : "Sem 4";
  } else {
    sem = month >= 7 ? "Sem 5" : "Sem 6";
  }

  const yearLabel = ["I Year", "II Year", "III Year"][studyYear - 1];

  return { yearLabel, sem, isOld: false, studyYear };
}

// Extract branch from PIN  (CM → CME, EC → ECE)
export function getBranchFromPin(pin) {
  if (!pin) return "CME";
  if (String(pin).includes("-EC-")) return "ECE";
  return "CME";
}