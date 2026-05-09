import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { listenToBooks, listenToTransactions } from "../../firebase/firestore";

export default function StaffDashboard() {
  const { studentData: staffData, logout } = useAuth();
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

  const myTxns = transactions.filter(
    (t) => (t.borrowerId === staffData?.id || t.studentId === staffData?.id)
  );
  const issuedTxns   = myTxns.filter((t) => t.status === "issued");
  const availableBooks = allBooks.filter((b) => b.available);

  const filteredAvailable = availableBooks.filter(
    (b) =>
      b.title?.toLowerCase().includes(search.toLowerCase()) ||
      b.author?.toLowerCase().includes(search.toLowerCase()) ||
      b.subject?.toLowerCase().includes(search.toLowerCase())
  );

  const sectionColor = {
    ECE: "bg-blue-600", CME: "bg-green-600",
    GENERAL: "bg-purple-600", OFFICE: "bg-yellow-600",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📚</span>
          <div>
            <h1 className="text-lg font-bold text-gray-800">LibraryOS</h1>
            <p className="text-xs text-gray-400">Staff Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-gray-700">{staffData?.name}</p>
            <p className="text-xs text-gray-400">
              {staffData?.designation} · {staffData?.section} · ID: {staffData?.staffId}
            </p>
          </div>
          <div className={`w-9 h-9 rounded-full ${sectionColor[staffData?.section] || "bg-indigo-600"} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
            {staffData?.name?.charAt(0)}
          </div>
          <button onClick={handleLogout}
            className="text-sm bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-lg font-medium transition">
            Logout
          </button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Welcome */}
        <div className="mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800">
            Welcome, {staffData?.name?.split(" ")[0]} 👋
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            {staffData?.designation} · {staffData?.section} Section
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-8">
          {[
            { icon: "📤", label: "Issued to me", value: issuedTxns.length, bg: "bg-yellow-50" },
            { icon: "✅", label: "Available",    value: availableBooks.length, bg: "bg-green-50" },
            { icon: "📚", label: "Total books",  value: allBooks.length, bg: "bg-blue-50" },
          ].map(({ icon, label, value, bg }) => (
            <div key={label} className={`${bg} rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5 flex items-center gap-3`}>
              <span className="text-2xl">{icon}</span>
              <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-gray-800">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          {[{ key: "issued", label: "My Issued Books" }, { key: "available", label: "Available Books" }].map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                activeTab === t.key ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Issued Books */}
        {activeTab === "issued" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {issuedTxns.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-3">📭</div>
                <p className="text-gray-500 font-medium">No books currently issued</p>
                <p className="text-gray-400 text-sm mt-1">Ask the librarian to issue a book.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr className="text-left text-gray-500">
                    <th className="px-5 py-3">Book Title</th>
                    <th className="px-5 py-3 hidden sm:table-cell">Accession No.</th>
                    <th className="px-5 py-3">Issued On</th>
                    <th className="px-5 py-3">Days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {issuedTxns.map((t) => {
                    const days = t.issueDate?.toDate
                      ? Math.floor((Date.now() - t.issueDate.toDate()) / 86400000) : null;
                    return (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-800">{t.bookTitle}</td>
                        <td className="px-5 py-3 font-mono text-xs text-gray-400 hidden sm:table-cell">{t.barcode}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">
                          {t.issueDate?.toDate ? t.issueDate.toDate().toLocaleDateString("en-IN") : "—"}
                        </td>
                        <td className="px-5 py-3 text-xs">
                          {days !== null && (
                            <span className={days > 14 ? "text-red-500 font-bold" : "text-gray-400"}>
                              {days}d {days > 14 ? "⚠️" : ""}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Available Books */}
        {activeTab === "available" && (
          <>
            <div className="mb-4">
              <input type="text" placeholder="Search by title, author, subject..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {filteredAvailable.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-5xl mb-3">🔍</div>
                  <p className="text-gray-500">No books found.</p>
                </div>
              ) : (
                <>
                  <table className="hidden sm:table w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr className="text-left text-gray-500">
                        <th className="px-5 py-3">Title</th>
                        <th className="px-5 py-3">Author</th>
                        <th className="px-5 py-3">Subject</th>
                        <th className="px-5 py-3">Accession</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredAvailable.map((b) => (
                        <tr key={b.id} className="hover:bg-gray-50">
                          <td className="px-5 py-3 font-medium text-gray-800">{b.title}</td>
                          <td className="px-5 py-3 text-gray-500">{b.author}</td>
                          <td className="px-5 py-3 text-gray-500">{b.subject || b.genre}</td>
                          <td className="px-5 py-3 font-mono text-xs text-gray-400">{b.accessionNo || b.barcode}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="sm:hidden divide-y divide-gray-100">
                    {filteredAvailable.map((b) => (
                      <div key={b.id} className="px-5 py-4">
                        <p className="font-semibold text-gray-800 text-sm">{b.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{b.author}</p>
                        <p className="text-xs text-gray-400 font-mono mt-1">{b.accessionNo || b.barcode}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}