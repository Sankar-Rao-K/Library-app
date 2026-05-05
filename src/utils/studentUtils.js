export function getStudentInfo(pin) {
  if (!pin || typeof pin !== "string") {
    return { yearLabel: "Unknown", sem: "—", isOld: false, studyYear: 0 };
  }
  const joinYearShort = parseInt(pin.substring(0, 2), 10);
  if (isNaN(joinYearShort)) {
    return { yearLabel: "Unknown", sem: "—", isOld: false, studyYear: 0 };
  }
  const joinYear = 2000 + joinYearShort;
  const now = new Date();
  const month = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const academicYearStart = month >= 7 ? currentYear : currentYear - 1;
  const yearsElapsed = academicYearStart - joinYear;
  const studyYear = yearsElapsed + 1;

  if (studyYear > 3) {
    return { yearLabel: "Passed Out", sem: "—", isOld: true, studyYear };
  }
  if (studyYear < 1) {
    return { yearLabel: "Not Yet Joined", sem: "—", isOld: false, studyYear };
  }

  let sem, semNum;
  if (studyYear === 1) {
    sem = "Sem 1"; semNum = 1;
  } else if (studyYear === 2) {
    if (month >= 7) { sem = "Sem 3"; semNum = 3; }
    else { sem = "Sem 4"; semNum = 4; }
  } else {
    if (month >= 7) { sem = "Sem 5"; semNum = 5; }
    else { sem = "Sem 6"; semNum = 6; }
  }

  const yearLabel = ["I Year", "II Year", "III Year"][studyYear - 1];
  return { yearLabel, sem, semNum, isOld: false, studyYear };
}

export function getBranchFromPin(pin) {
  if (!pin) return "CME";
  if (String(pin).includes("-EC-")) return "ECE";
  return "CME";
}

export function groupStudentsBySem(students) {
  const groups = {
    "I Year — Sem 1":   [],
    "II Year — Sem 3":  [],
    "II Year — Sem 4":  [],
    "III Year — Sem 5": [],
    "III Year — Sem 6": [],
    "Passed Out":       [],
    "Unknown":          [],
  };
  students.forEach((s) => {
    const { yearLabel, sem, isOld } = getStudentInfo(s.pin);
    if (isOld) { groups["Passed Out"].push(s); return; }
    const key = `${yearLabel} — ${sem}`;
    if (groups[key]) groups[key].push(s);
    else groups["Unknown"].push(s);
  });
  return groups;
}