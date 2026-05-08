import { db } from "./config";
import {
  collection, addDoc, getDocs, getDoc,
  doc, updateDoc, deleteDoc, query, where,
  onSnapshot, serverTimestamp, writeBatch,
} from "firebase/firestore";

// ── BOOKS ───────────────────────────────────────────────────────────────

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

// ── STUDENTS ────────────────────────────────────────────────────────────

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

export const deleteStudent = (id) => deleteDoc(doc(db, "students", id));

// Auto-delete passed-out students who have no active issues
export const autoDeletePassedOutStudents = async () => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const academicYearStart = month >= 7 ? currentYear : currentYear - 1;

  const snap = await getDocs(collection(db, "students"));
  const allStudents = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const deleted = [];

  for (const student of allStudents) {
    if (!student.pin) continue;
    const joinYearShort = parseInt(String(student.pin).substring(0, 2), 10);
    if (isNaN(joinYearShort)) continue;
    const joinYear = 2000 + joinYearShort;
    const studyYear = (academicYearStart - joinYear) + 1;
    if (studyYear <= 3) continue; // Not passed out yet

    // Check for active (unreturned) issues
    const txnQ = query(
      collection(db, "transactions"),
      where("studentId", "==", student.id),
      where("status", "==", "issued")
    );
    const txnSnap = await getDocs(txnQ);

    if (txnSnap.empty) {
      // No active issues — safe to delete
      await deleteDoc(doc(db, "students", student.id));
      deleted.push(student.name);
    }
  }

  return deleted;
};

// ── TRANSACTIONS ────────────────────────────────────────────────────────

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

export const getActiveTransaction = async (studentId, bookId) => {
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

export const getTransactionsByStudent = async (studentId) => {
  const q = query(
    collection(db, "transactions"),
    where("studentId", "==", studentId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// ── REAL-TIME LISTENERS ─────────────────────────────────────────────────

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