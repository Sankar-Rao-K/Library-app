import { auth, db } from "./config";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

// Login function
export const loginUser = async (email, password) => {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
};

// Logout function
export const logoutUser = () => signOut(auth);

// Get user role from Firestore
export const getUserRole = async (uid) => {
  const docRef = doc(db, "users", uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data().role;
  }
  return null;
};

// Listen to auth state changes
export const onAuthChange = (callback) => {
  return onAuthStateChanged(auth, callback);
};

// Find student record by matching email to students collection
import { collection, query, where, getDocs } from "firebase/firestore";

export const linkStudentToUser = async (uid, email) => {
  const q = query(collection(db, "students"), where("email", "==", email));
  const snap = await getDocs(q);
  if (!snap.empty) {
    const studentDoc = snap.docs[0];
    await import("firebase/firestore").then(({ updateDoc, doc }) =>
      updateDoc(doc(db, "users", uid), { studentId: studentDoc.id })
    );
    return studentDoc.id;
  }
  return null;
};