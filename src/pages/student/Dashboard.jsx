import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { listenToBooks, listenToTransactions } from "../../firebase/firestore";
import { getStudentInfo } from "../../utils/studentUtils";
import SearchBar from "../../components/SearchBar";

export default function StudentDashboard() {
  const { studentData, logout } = useAuth();
  const navigate = useNavigate();
  const [allBooks, setAllBooks]         = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [search, setSearch]             = useState("");
  const [activeTab, setActiveTab]       = useState("issued");

  useEffect(() => {
    const u1 = listenToBooks(setAllBooks);
    const u2 = listenToTransactions(setTransactions);
    return () => { u1(); u2(); };
  }, []);

  const handleLogout = async () => { await logout(); navigate("/login"); };

  const myTxns     = transactions.filter(
    (t) => t.borrowerId === studentData?.id || t.studentId === studentData?.id
  );
  const issued     = myTxns.filter((t) => t.status === "issued");
  const available  = allBooks.filter((b) => b.available);
  const { yearLabel, sem } = getStudentInfo(studentData?.pin || "");

  const filteredAvailable = available.filter((b) =>
    b.title?.toLowerCase().includes(search.toLowerCase()) ||
    b.author?.toLowerCase().includes(search.toLowerCase()) ||
    b.subject?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen" style={{ background: "#F0F4F8" }}>
      {/* Header */}
      <header style={{ background: "linear-gradient(135deg, #0D1F4E 0%, #1B4332 100%)" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between py-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="" className="w-9 h-9 rounded-full object-cover border-2"
                style={{ borderColor: "#C9A227" }} />
              <div>
                <p className="text-white text-xs font-bold leading-tight">Govt. Polytechnic Anakapalli</p>
                <p className="text-xs" style={{ color: "#C9A227" }}>Library Portal</p>
              </div>
            </div>
            <button onClick={handleLogout}
              className="text-xs text-white/70 hover:text-white border border-white/20 hover:border-white/40 px-3 py-1.5 rounded-lg transition">
              Sign Out
            </button>
          </div>

          <div className="py-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold flex-shrink-0 border-2"
              style={{ background: "#C9A227", borderColor: "rgba(255,255,255,0.3)", color: "#0D1F4E" }}>
              {studentData?.name?.charAt(0)}
            </div>
            <div>
              <h1 className="text-white text-xl font-bold">{studentData?.name}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: "rgba(201,162,39,0.2)", color: "#C9A227", border: "1px solid rgba(201,162,39,0.3)" }}>
                  {studentData?.branch}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-white/10 text-white/80">
                  {yearLabel} · {sem}
                </span>
                <span className="text-xs text-white/50 font-mono">PIN: {studentData?.pin}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 pb-5">
            {[
              { label: "Issued to me",  value: issued.length,   color: "#C9A227" },
              { label: "Available now", value: available.length, color: "#4ade80" },
              { label: "Total books",   value: allBooks.length,  color: "#93c5fd" },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center rounded-xl py-3"
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <p className="text-2xl font-bold" style={{ color }}>{value}</p>
                <p className="text-xs text-white/50 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-5 bg-white rounded-xl p-1 shadow-sm border border-gray-100 w-fit">
          {[{ key: "issued", label: "📤 My Issued Books" }, { key: "available", label: "📚 Available Books" }].map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className="px-5 py-2 rounded-lg text-sm font-bold transition"
              style={activeTab === t.key
                ? { background: "linear-gradient(135deg, #0D1F4E, #1B4332)", color: "white" }
                : { color: "#6b7280" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Issued */}
        {activeTab === "issued" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {issued.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-5xl mb-3">📭</p>
                <p className="text-gray-500 font-medium">No books currently issued</p>
                <p className="text-gray-400 text-sm mt-1">Visit the library counter to issue a book.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {issued.map((t) => {
                  const days = t.issueDate?.toDate
                    ? Math.floor((Date.now() - t.issueDate.toDate()) / 86400000) : null;
                  return (
                    <div key={t.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                            style={{ background: "#FFFBEB", border: "1px solid #fde68a" }}>📖</div>
                          <div className="min-w-0">
                            <p className="font-bold text-gray-800 text-sm">{t.bookTitle}</p>
                            <p className="text-xs text-gray-400 font-mono mt-0.5">{t.barcode}</p>
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 flex-wrap">
                              <span>Issued: {t.issueDate?.toDate ? t.issueDate.toDate().toLocaleDateString("en-IN") : "—"}</span>
                              {days !== null && (
                                <span className={days > 14 ? "text-red-600 font-bold" : "text-gray-400"}>
                                  {days} day{days !== 1 ? "s" : ""} ago {days > 14 ? "⚠️" : ""}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <span className="px-2 py-1 rounded-full text-xs font-bold flex-shrink-0"
                          style={{ background: "#FEF9C3", color: "#854D0E" }}>Issued</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Available */}
        {activeTab === "available" && (
          <>
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search by title, author, or subject..."
              resultCount={filteredAvailable.length}
              totalCount={available.length}
              className="mb-4"
            />
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {filteredAvailable.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-4xl mb-3">🔍</p>
                  <p className="text-gray-500 font-medium">No books found</p>
                  {search && (
                    <button onClick={() => setSearch("")}
                      className="mt-3 text-xs text-blue-600 hover:underline font-medium">
                      Clear search
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <table className="hidden sm:table w-full text-sm">
                    <thead style={{ background: "#f8f9fa" }}>
                      <tr className="text-left border-b border-gray-100">
                        {["Title", "Author", "Subject", "Accession"].map((h) => (
                          <th key={h} className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredAvailable.map((b) => (
                        <tr key={b.id} className="hover:bg-gray-50 transition">
                          <td className="px-5 py-3 font-semibold text-gray-800">{b.title}</td>
                          <td className="px-5 py-3 text-gray-500">{b.author}</td>
                          <td className="px-5 py-3 text-gray-500">{b.subject || b.genre}</td>
                          <td className="px-5 py-3 font-mono text-xs text-gray-400">{b.accessionNo || b.barcode}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="sm:hidden divide-y divide-gray-100">
                    {filteredAvailable.map((b) => (
                      <div key={b.id} className="px-5 py-4 flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                          style={{ background: "#ECFDF5", border: "1px solid #a7f3d0" }}>📗</div>
                        <div>
                          <p className="font-bold text-gray-800 text-sm">{b.title}</p>
                          <p className="text-xs text-gray-500">{b.author}</p>
                          <p className="text-xs text-gray-400 font-mono mt-1">{b.accessionNo || b.barcode}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <div className="text-center py-6 text-gray-400 text-xs">
        Government Polytechnic Anakapalli · Library Management System
      </div>
    </div>
  );
}