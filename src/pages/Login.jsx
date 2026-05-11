import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../firebase/auth";
import { getStudentByPinAndBranch, getStaffByIdAndSection } from "../firebase/firestore";
import { useAuth } from "../context/AuthContext";

const BRANCHES = ["CME", "ECE"];
const SECTIONS = ["ECE", "CME", "GENERAL", "OFFICE", "OTHER"];

export default function Login() {
  const [tab, setTab]           = useState("student");
  const { loginStudent }        = useAuth();
  const navigate                = useNavigate();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin]           = useState("");
  const [branch, setBranch]     = useState("CME");
  const [staffId, setStaffId]   = useState("");
  const [section, setSection]   = useState("ECE");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleAdmin = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      await loginUser(email, password);
      navigate("/admin");
    } catch { setError("Invalid email or password."); }
    setLoading(false);
  };

  const handleStudent = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const s = await getStudentByPinAndBranch(pin.trim(), branch);
      if (!s) { setError("No student found with this PIN and Branch."); }
      else { loginStudent({ ...s, borrowerType: "student" }); navigate("/student"); }
    } catch (err) { setError("Error: " + err.message); }
    setLoading(false);
  };

  const handleStaff = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const s = await getStaffByIdAndSection(staffId.trim(), section);
      if (!s) { setError("No staff found with this ID and Section."); }
      else { loginStudent({ ...s, borrowerType: "staff" }); navigate("/staff"); }
    } catch (err) { setError("Error: " + err.message); }
    setLoading(false);
  };

  const inputCls = "w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 bg-white transition";
  const focusColor = "focus:ring-[#1B6B35]/30 focus:border-[#1B6B35]";

  return (
    <div className="min-h-screen flex flex-col"
      style={{
        background: "linear-gradient(160deg, #0D1F4E 0%, #0f2d5e 40%, #1B4332 100%)",
      }}>

      {/* Top banner */}
      <div className="flex-shrink-0 text-center pt-10 pb-6 px-4">
        {/* Emblem */}
        <div className="flex justify-center mb-5">
          <div className="relative">
            <div className="w-28 h-28 rounded-full shadow-2xl overflow-hidden border-4 border-[#C9A227]"
              style={{ boxShadow: "0 0 0 4px rgba(201,162,39,0.2), 0 20px 60px rgba(0,0,0,0.5)" }}>
              <img src="/logo.png" alt="Govt. Polytechnic Anakapalli"
                className="w-full h-full object-cover" />
            </div>
          </div>
        </div>

        {/* Institution name */}
        <div className="space-y-1">
          <p className="text-[#C9A227] text-xs font-semibold tracking-[0.2em] uppercase">
             Estd. 2008 · Anakapalli
          </p>
          <h1 className="text-white text-2xl sm:text-3xl font-bold tracking-tight leading-tight">
            Government Polytechnic
          </h1>
          <h2 className="text-[#C9A227] text-xl sm:text-2xl font-bold tracking-widest uppercase">
            Anakapalli
          </h2>
          <p className="text-white/50 text-xs tracking-widest mt-1 uppercase">
            Knowledge Is Power · Est. 2008
          </p>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mt-5 max-w-xs mx-auto">
          <div className="flex-1 h-px bg-[#C9A227]/30" />
          <span className="text-[#C9A227]/70 text-xs tracking-widest uppercase">Library System</span>
          <div className="flex-1 h-px bg-[#C9A227]/30" />
        </div>
      </div>

      {/* Login card */}
      <div className="flex-1 flex items-start justify-center px-4 pb-10">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden"
            style={{ boxShadow: "0 25px 80px rgba(0,0,0,0.4)" }}>

            {/* Tab bar */}
            <div className="flex" style={{ background: "#f8f9fa", borderBottom: "2px solid #e9ecef" }}>
              {[
                { key: "student", label: "Student",    icon: "🎓" },
                { key: "staff",   label: "Staff",      icon: "👩‍🏫" },
                { key: "admin",   label: "Librarian",  icon: "🛠️" },
              ].map((t) => (
                <button key={t.key} onClick={() => { setTab(t.key); setError(""); }}
                  className="flex-1 py-3.5 text-xs font-bold tracking-wide uppercase transition relative"
                  style={{
                    color: tab === t.key ? "#0D1F4E" : "#9ca3af",
                    background: tab === t.key ? "white" : "transparent",
                    borderBottom: tab === t.key ? "2px solid #C9A227" : "2px solid transparent",
                    marginBottom: "-2px",
                  }}>
                  <span className="block text-base mb-0.5">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-6 sm:p-8">
              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-5">
                  <span>⚠️</span><span>{error}</span>
                </div>
              )}

              {/* Student */}
              {tab === "student" && (
                <form onSubmit={handleStudent} className="space-y-4">
                  <div className="text-center mb-5">
                    <p className="text-sm text-gray-500">Enter your credentials to access the library portal</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">PIN Number</label>
                    <input type="text" required autoFocus value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="e.g. 23173-CM-001"
                      className={`${inputCls} ${focusColor} font-mono`} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">Branch</label>
                    <select value={branch} onChange={(e) => setBranch(e.target.value)}
                      className={`${inputCls} ${focusColor}`}>
                      {BRANCHES.map((b) => <option key={b}>{b}</option>)}
                    </select>
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full py-3 rounded-xl font-bold text-sm text-white transition mt-2"
                    style={{
                      background: loading
                        ? "#9ca3af"
                        : "linear-gradient(135deg, #0D1F4E 0%, #1B4332 100%)",
                      boxShadow: loading ? "none" : "0 4px 20px rgba(13,31,78,0.3)",
                    }}>
                    {loading ? "Verifying..." : "Sign In as Student →"}
                  </button>
                </form>
              )}

              {/* Staff */}
              {tab === "staff" && (
                <form onSubmit={handleStaff} className="space-y-4">
                  <div className="text-center mb-5">
                    <p className="text-sm text-gray-500">Staff members sign in with CMS ID</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">CMS / Staff ID</label>
                    <input type="text" required autoFocus value={staffId}
                      onChange={(e) => setStaffId(e.target.value)}
                      placeholder="e.g. 14023738"
                      className={`${inputCls} ${focusColor} font-mono`} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">Section</label>
                    <select value={section} onChange={(e) => setSection(e.target.value)}
                      className={`${inputCls} ${focusColor}`}>
                      {SECTIONS.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full py-3 rounded-xl font-bold text-sm text-white transition mt-2"
                    style={{
                      background: loading
                        ? "#9ca3af"
                        : "linear-gradient(135deg, #1B4332 0%, #0D1F4E 100%)",
                      boxShadow: loading ? "none" : "0 4px 20px rgba(27,67,50,0.3)",
                    }}>
                    {loading ? "Verifying..." : "Sign In as Staff →"}
                  </button>
                </form>
              )}

              {/* Admin */}
              {tab === "admin" && (
                <form onSubmit={handleAdmin} className="space-y-4">
                  <div className="text-center mb-5">
                    <p className="text-sm text-gray-500">Librarian / Administrator access</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">Email Address</label>
                    <input type="email" required autoFocus value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="librarian@gpanakapalli.ac.in"
                      className={`${inputCls} ${focusColor}`} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">Password</label>
                    <input type="password" required value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`${inputCls} ${focusColor}`} />
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full py-3 rounded-xl font-bold text-sm text-white transition mt-2"
                    style={{
                      background: loading ? "#9ca3af" : "linear-gradient(135deg, #0D1F4E, #162e6a)",
                      boxShadow: loading ? "none" : "0 4px 20px rgba(13,31,78,0.3)",
                    }}>
                    {loading ? "Authenticating..." : "Sign In as Librarian →"}
                  </button>
                </form>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-5 text-center">
              <p className="text-xs text-gray-400">
                Library Management System · Govt. Polytechnic, Anakapalli
              </p>
              <p className="text-xs text-gray-300 mt-0.5">
                For assistance contact the library counter
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}