import { db } from "./config";
import {
  collection, addDoc, getDocs, getDoc,
  doc, updateDoc, deleteDoc, query, where,
  onSnapshot, serverTimestamp, writeBatch,
} from "firebase/firestore";

// ── BOOKS ────────────────────────────────────────────────────────────

export const addBook = (data) =>
  addDoc(collection(db, "books"), { ...data, createdAt: serverTimestamp() });

export const addBooksBatch = async (books) => {
  const batch = writeBatch(db);
  books.forEach((b) => {
    const ref = doc(collection(db, "books"));
    batch.set(ref, { ...b, createdAt: serverTimestamp() });
  });
  await batch.commit();
};

export const getBookByBarcode = async (barcode) => {
  const q = query(collection(db, "books"), where("barcode", "==", barcode));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
};

export const updateBook = (id, data) =>
  updateDoc(doc(db, "books", id), data);

export const deleteBook = (id) => deleteDoc(doc(db, "books", id));

// ── STUDENTS ──────────────────────────────────────────────────────────

export const addStudent = (data) =>
  addDoc(collection(db, "students"), { ...data, createdAt: serverTimestamp() });

export const addStudentsBatch = async (students) => {
  const batch = writeBatch(db);
  students.forEach((s) => {
    const ref = doc(collection(db, "students"));
    batch.set(ref, { ...s, createdAt: serverTimestamp() });
  });
  await batch.commit();
};

export const getExistingPins = async () => {
  const snap = await getDocs(collection(db, "students"));
  return new Set(snap.docs.map((d) => d.data().pin));
};

export const getStudentByPin = async (pin) => {
  const q = query(collection(db, "students"), where("pin", "==", pin));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
};

export const getStudentByPinAndBranch = async (pin, branch) => {
  const q = query(
    collection(db, "students"),
    where("pin", "==", pin),
    where("branch", "==", branch)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
};

export const deleteStudent = async (id) => {
  // Also delete any saved QR codes linked to this student
  const qrQ = query(collection(db, "qrCodes"), where("linkedId", "==", id));
  const qrSnap = await getDocs(qrQ);
  const batch = writeBatch(db);
  qrSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, "students", id));
  await batch.commit();
};

export const updateStudent = (id, data) =>
  updateDoc(doc(db, "students", id), data);

export const autoDeletePassedOutStudents = async () => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const academicYearStart = month >= 7 ? currentYear : currentYear - 1;
  const snap = await getDocs(collection(db, "students"));
  const deleted = [];
  for (const d of snap.docs) {
    const s = d.data();
    if (!s.pin) continue;
    const joinYearShort = parseInt(String(s.pin).substring(0, 2), 10);
    if (isNaN(joinYearShort)) continue;
    const studyYear = (academicYearStart - (2000 + joinYearShort)) + 1;
    if (studyYear <= 3) continue;
    const txnQ = query(
      collection(db, "transactions"),
      where("studentId", "==", d.id),
      where("status", "==", "issued")
    );
    const txnSnap = await getDocs(txnQ);
    if (txnSnap.empty) {
      // Also delete linked QR codes
      const qrQ = query(collection(db, "qrCodes"), where("linkedId", "==", d.id));
      const qrSnap = await getDocs(qrQ);
      const batch = writeBatch(db);
      qrSnap.docs.forEach((qd) => batch.delete(qd.ref));
      batch.delete(doc(db, "students", d.id));
      await batch.commit();
      deleted.push(s.name);
    }
  }
  return deleted;
};

// ── STAFF ─────────────────────────────────────────────────────────────

export const addStaff = (data) =>
  addDoc(collection(db, "staff"), { ...data, createdAt: serverTimestamp() });

export const addStaffBatch = async (staffList) => {
  const batch = writeBatch(db);
  staffList.forEach((s) => {
    const ref = doc(collection(db, "staff"));
    batch.set(ref, { ...s, createdAt: serverTimestamp() });
  });
  await batch.commit();
};

export const getExistingStaffIds = async () => {
  const snap = await getDocs(collection(db, "staff"));
  return new Set(snap.docs.map((d) => d.data().staffId));
};

export const getStaffByStaffId = async (staffId) => {
  const q = query(collection(db, "staff"), where("staffId", "==", staffId));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
};

export const getStaffByIdAndSection = async (staffId, section) => {
  const q = query(
    collection(db, "staff"),
    where("staffId", "==", staffId),
    where("section", "==", section)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
};

export const deleteStaff = (id) => deleteDoc(doc(db, "staff", id));
export const updateStaff = (id, data) => updateDoc(doc(db, "staff", id), data);

export const listenToStaff = (cb) =>
  onSnapshot(collection(db, "staff"), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );

// ── SAVED QR CODES ────────────────────────────────────────────────────

export const saveQRCode = (data) =>
  addDoc(collection(db, "qrCodes"), { ...data, createdAt: serverTimestamp() });

export const deleteQRCode = (id) => deleteDoc(doc(db, "qrCodes", id));

export const listenToQRCodes = (cb) =>
  onSnapshot(collection(db, "qrCodes"), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );

// ── TRANSACTIONS ──────────────────────────────────────────────────────

export const issueBook = (data) =>
  addDoc(collection(db, "transactions"), {
    ...data,
    issueDate: serverTimestamp(),
    returnDate: null,
    status: "issued",
  });

export const returnBook = (txnId) =>
  updateDoc(doc(db, "transactions", txnId), {
    status: "returned",
    returnDate: serverTimestamp(),
  });

export const getActiveTransaction = async (borrowerId, bookId) => {
  const q = query(
    collection(db, "transactions"),
    where("borrowerId", "==", borrowerId),
    where("bookId", "==", bookId),
    where("status", "==", "issued")
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
};

export const getActiveTransactionLegacy = async (studentId, bookId) => {
  const q = query(
    collection(db, "transactions"),
    where("studentId", "==", studentId),
    where("bookId", "==", bookId),
    where("status", "==", "issued")
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
};

export const getTransactionsByBorrower = async (borrowerId) => {
  const q1 = query(collection(db, "transactions"), where("borrowerId", "==", borrowerId));
  const q2 = query(collection(db, "transactions"), where("studentId", "==", borrowerId));
  const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
  const all = [...s1.docs, ...s2.docs];
  const seen = new Set();
  return all
    .filter((d) => { if (seen.has(d.id)) return false; seen.add(d.id); return true; })
    .map((d) => ({ id: d.id, ...d.data() }));
};

// ── REAL-TIME LISTENERS ───────────────────────────────────────────────

export const listenToBooks = (cb) =>
  onSnapshot(collection(db, "books"), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );

export const listenToStudents = (cb) =>
  onSnapshot(collection(db, "students"), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );

export const listenToTransactions = (cb) =>
  onSnapshot(collection(db, "transactions"), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );