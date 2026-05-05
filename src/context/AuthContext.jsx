import { createContext, useContext, useEffect, useState } from "react";
import { onAuthChange, getUserRole } from "../firebase/auth";

const AuthContext = createContext(null);

const STUDENT_SESSION_KEY = "library_student_session";

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);         // Firebase Auth user (admin)
  const [role, setRole] = useState(null);          // "admin" | "student"
  const [studentData, setStudentData] = useState(null); // Firestore student doc
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore student session from localStorage
    const saved = localStorage.getItem(STUDENT_SESSION_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setStudentData(parsed);
        setRole("student");
      } catch {}
    }

    // Firebase Auth listener (admin only)
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        const userRole = await getUserRole(firebaseUser.uid);
        setUser(firebaseUser);
        setRole(userRole);
        setStudentData(null);
        localStorage.removeItem(STUDENT_SESSION_KEY);
      } else {
        // Only clear admin — don't touch student session
        const savedStudent = localStorage.getItem(STUDENT_SESSION_KEY);
        if (!savedStudent) {
          setUser(null);
          setRole(null);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Called after student PIN+branch login succeeds
  const loginStudent = (studentDoc) => {
    setStudentData(studentDoc);
    setRole("student");
    setUser(null);
    localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(studentDoc));
  };

  // Logout for both types
  const logout = async () => {
    const { logoutUser } = await import("../firebase/auth");
    await logoutUser().catch(() => {});
    setUser(null);
    setRole(null);
    setStudentData(null);
    localStorage.removeItem(STUDENT_SESSION_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, role, studentData, loading, loginStudent, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);