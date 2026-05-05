import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../firebase/auth";
import { getStudentByPinAndBranch } from "../firebase/firestore";
import { useAuth } from "../context/AuthContext";

const BRANCHES = ["CME", "ECE"];

export default function Login() {
  const [tab, setTab] = useState("student"); // "student" | "admin"
  const { loginStudent } = useAuth();
  const navigate = useNavigate();

  // Admin state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Student state
  const [pin, setPin] = useState("");
  const [branch, setBranch] = useState("CME");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await loginUser(email, password);
      navigate("/admin");
    } catch {
      setError("Invalid email or password.");
    }
    setLoading(false);
  };

  const handleStudentLogin = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const student = await getStudentByPinAndBranch(pin.trim(), branch);
      if (!student) {
        setError("No student found with this PIN and Branch. Please check and try again.");
      } else {
        loginStudent(student);
        navigate("/student");
      }
    } catch (err) {
      setError("Error: " + err.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📚</div>
          <h1 className="text-2xl font-bold text-gray-800">LibraryOS</h1>
          <p className="text-gray-500 mt-1 text-sm">Sign in to continue</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-8">
          {[
            { key: "student", label: "🎓 Student" },
            { key: "admin", label: "🛠️ Admin" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setError(""); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                tab === t.key
                  ? "bg-white shadow text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-5">
            {error}
          </div>
        )}

        {/* ── STUDENT LOGIN ── */}
        {tab === "student" && (
          <form onSubmit={handleStudentLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PIN Number
              </label>
              <input
                type="text"
                required
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="e.g. 23173-CM-001"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Branch
              </label>
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {BRANCHES.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-lg transition text-sm"
            >
              {loading ? "Signing in..." : "Sign In as Student"}
            </button>
          </form>
        )}

        {/* ── ADMIN LOGIN ── */}
        {tab === "admin" && (
          <form onSubmit={handleAdminLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@library.com"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-800 hover:bg-gray-900 disabled:bg-gray-500 text-white font-semibold py-2.5 rounded-lg transition text-sm"
            >
              {loading ? "Signing in..." : "Sign In as Admin"}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-gray-400 mt-8">
          Students: use your PIN number and branch to sign in.
        </p>
      </div>
    </div>
  );
}