import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import AdminDashboard from "./pages/admin/Dashboard";
import Books from "./pages/admin/Books";
import Students from "./pages/admin/Students";
import IssueBook from "./pages/admin/IssueBook";
import ReturnBook from "./pages/admin/ReturnBook";
import Settings from "./pages/admin/Settings";
import StudentDashboard from "./pages/student/Dashboard";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="text-4xl mb-3">📚</div>
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children, allowedRole }) {
  const { user, role, studentData, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  const isLoggedIn = user || studentData;
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  if (allowedRole && role !== allowedRole) return <Navigate to="/login" replace />;
  return children;
}

function AuthRoute({ children }) {
  const { user, role, studentData, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user && role === "admin") return <Navigate to="/admin" replace />;
  if (studentData && role === "student") return <Navigate to="/student" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthRoute><Login /></AuthRoute>} />

        <Route path="/admin" element={<ProtectedRoute allowedRole="admin"><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/books" element={<ProtectedRoute allowedRole="admin"><Books /></ProtectedRoute>} />
        <Route path="/admin/students" element={<ProtectedRoute allowedRole="admin"><Students /></ProtectedRoute>} />
        <Route path="/admin/issue" element={<ProtectedRoute allowedRole="admin"><IssueBook /></ProtectedRoute>} />
        <Route path="/admin/return" element={<ProtectedRoute allowedRole="admin"><ReturnBook /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute allowedRole="admin"><Settings /></ProtectedRoute>} />

        <Route path="/student" element={<ProtectedRoute allowedRole="student"><StudentDashboard /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}