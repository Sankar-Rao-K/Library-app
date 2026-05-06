import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import { listenToBooks, listenToStudents, listenToTransactions } from "../../firebase/firestore";

function StatCard({ icon, label, value, color, bgColor, onClick, subtitle }) {
  return (
    <button
      onClick={onClick}
      className={`${bgColor} rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4 w-full text-left hover:shadow-md hover:-translate-y-0.5 transition-all active:scale-95 group`}
    >
      <div className={`text-3xl p-3 rounded-xl ${color} group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-800">{value}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>}
      </div>
      <span className="text-gray-300 group-hover:text-gray-500 transition text-lg flex-shrink-0">›</span>
    </button>
  );
}

function QuickViewModal({ title, icon, items, columns, onClose, emptyMsg }) {
  const [search, setSearch] = useState("");
  const filtered = items.filter((item) =>
    columns.some((col) =>
      String(item[col.key] || "").toLowerCase().includes(search.toLowerCase())
    )
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 sm:inset-auto sm:right-4 sm:top-4 sm:bottom-4 sm:w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            <h2 className="font-bold text-gray-800 text-base">{title}</h2>
            <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-medium">
              {filtered.length}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            autoFocus
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-400 text-sm">{emptyMsg || "No items found."}</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-left text-gray-500 text-xs uppercase">
                      {columns.map((col) => (
                        <th key={col.key} className="px-5 py-3">{col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((item, i) => (
                      <tr key={item.id || i} className="hover:bg-gray-50">
                        {columns.map((col) => (
                          <td key={col.key} className="px-5 py-3">
                            {col.render ? col.render(item) : (
                              <span className={col.mono ? "font-mono text-xs" : ""}>
                                {item[col.key] ?? "—"}
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-gray-100">
                {filtered.map((item, i) => (
                  <div key={item.id || i} className="px-5 py-3">
                    {columns.map((col) => (
                      <div key={col.key} className="flex justify-between items-center py-0.5">
                        <span className="text-xs text-gray-400">{col.label}</span>
                        <span className={`text-sm font-medium text-gray-700 ${col.mono ? "font-mono text-xs" : ""}`}>
                          {col.render ? col.render(item) : (item[col.key] ?? "—")}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default function AdminDashboard() {
  const [books, setBooks] = useState([]);
  const [students, setStudents] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [modal, setModal] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const u1 = listenToBooks(setBooks);
    const u2 = listenToStudents(setStudents);
    const u3 = listenToTransactions(setTransactions);
    return () => { u1(); u2(); u3(); };
  }, []);

  const issuedTxns     = transactions.filter((t) => t.status === "issued");
  const returnedTxns   = transactions.filter((t) => t.status === "returned");
  const availableBooks = books.filter((b) => b.available);

  const MODALS = {
    totalBooks: {
      title: "All Books", icon: "📚",
      items: [...books].sort((a, b) => (a.title || "").localeCompare(b.title || "")),
      columns: [
        { key: "accessionNo", label: "Accession", mono: true },
        { key: "title",       label: "Title" },
        { key: "author",      label: "Author" },
        {
          key: "available", label: "Status",
          render: (b) => (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${b.available ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {b.available ? "Available" : "Issued"}
            </span>
          ),
        },
      ],
      emptyMsg: "No books in library.",
    },
    available: {
      title: "Available Books", icon: "✅",
      items: availableBooks,
      columns: [
        { key: "accessionNo", label: "Accession", mono: true },
        { key: "title",       label: "Title" },
        { key: "author",      label: "Author" },
        { key: "subject",     label: "Subject" },
      ],
      emptyMsg: "No books available right now.",
    },
    issued: {
      title: "Currently Issued Books", icon: "📤",
      items: issuedTxns,
      columns: [
        { key: "bookTitle",   label: "Book" },
        { key: "studentName", label: "Student" },
        { key: "studentPin",  label: "PIN", mono: true },
        {
          key: "issueDate", label: "Issued On",
          render: (t) => t.issueDate?.toDate
            ? t.issueDate.toDate().toLocaleDateString("en-IN") : "—",
        },
        {
          key: "days", label: "Days Out",
          render: (t) => {
            if (!t.issueDate?.toDate) return "—";
            const d = Math.floor((Date.now() - t.issueDate.toDate()) / 86400000);
            return (
              <span className={d > 14 ? "text-red-500 font-bold" : "text-gray-600"}>
                {d}d {d > 14 ? "⚠️" : ""}
              </span>
            );
          },
        },
      ],
      emptyMsg: "No books currently issued.",
    },
    returned: {
      title: "Returned Books", icon: "📥",
      items: returnedTxns,
      columns: [
        { key: "bookTitle",   label: "Book" },
        { key: "studentName", label: "Student" },
        {
          key: "issueDate", label: "Issued",
          render: (t) => t.issueDate?.toDate ? t.issueDate.toDate().toLocaleDateString("en-IN") : "—",
        },
        {
          key: "returnDate", label: "Returned",
          render: (t) => t.returnDate?.toDate ? t.returnDate.toDate().toLocaleDateString("en-IN") : "—",
        },
      ],
      emptyMsg: "No returned transactions yet.",
    },
    students: {
      title: "All Students", icon: "🎓",
      items: [...students].sort((a, b) => (a.pin || "").localeCompare(b.pin || "")),
      columns: [
        { key: "pin",    label: "PIN", mono: true },
        { key: "name",   label: "Name" },
        { key: "branch", label: "Branch" },
        { key: "year",   label: "Year" },
      ],
      emptyMsg: "No students registered.",
    },
  };

  const activeModal = modal ? MODALS[modal] : null;
  const recent = [...transactions]
    .sort((a, b) => (b.issueDate?.seconds || 0) - (a.issueDate?.seconds || 0))
    .slice(0, 8);

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Click any card to view details.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        <StatCard icon="📚" label="Total Books" value={books.length}
          bgColor="bg-white" color="bg-blue-50"
          subtitle={`${availableBooks.length} available`}
          onClick={() => setModal("totalBooks")} />
        <StatCard icon="✅" label="Available" value={availableBooks.length}
          bgColor="bg-white" color="bg-green-50"
          subtitle="Ready to issue"
          onClick={() => setModal("available")} />
        <StatCard icon="📤" label="Issued" value={issuedTxns.length}
          bgColor="bg-white" color="bg-yellow-50"
          subtitle="Currently out"
          onClick={() => setModal("issued")} />
        <StatCard icon="📥" label="Returned" value={returnedTxns.length}
          bgColor="bg-white" color="bg-indigo-50"
          subtitle="Total returns"
          onClick={() => setModal("returned")} />
        <StatCard icon="🎓" label="Students" value={students.length}
          bgColor="bg-white" color="bg-purple-50"
          subtitle="Registered"
          onClick={() => setModal("students")} />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <button onClick={() => navigate("/admin/issue")}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl p-4 flex items-center gap-3 transition active:scale-95">
          <span className="text-2xl">➕</span>
          <div className="text-left">
            <p className="font-semibold text-sm">Issue Book</p>
            <p className="text-blue-200 text-xs">Scan & assign</p>
          </div>
        </button>
        <button onClick={() => navigate("/admin/return")}
          className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl p-4 flex items-center gap-3 transition active:scale-95">
          <span className="text-2xl">↩️</span>
          <div className="text-left">
            <p className="font-semibold text-sm">Return Book</p>
            <p className="text-orange-100 text-xs">Process return</p>
          </div>
        </button>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Recent Transactions</h2>
          <button onClick={() => setModal("issued")} className="text-xs text-blue-600 hover:underline">
            View issued →
          </button>
        </div>

        {recent.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-2">📋</div>
            <p className="text-gray-400 text-sm">No transactions yet.</p>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-5 py-3">Book</th>
                    <th className="px-5 py-3">Student</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recent.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-800 max-w-xs truncate">{t.bookTitle}</td>
                      <td className="px-5 py-3 text-gray-500">{t.studentName || t.studentPin}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          t.status === "issued"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-green-100 text-green-700"
                        }`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-400 text-xs">
                        {t.issueDate?.toDate ? t.issueDate.toDate().toLocaleDateString("en-IN") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="sm:hidden divide-y divide-gray-100">
              {recent.map((t) => (
                <div key={t.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{t.bookTitle}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t.studentName || t.studentPin} ·{" "}
                      {t.issueDate?.toDate ? t.issueDate.toDate().toLocaleDateString("en-IN") : ""}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                    t.status === "issued"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-green-100 text-green-700"
                  }`}>
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Quick View Modal */}
      {activeModal && (
        <QuickViewModal {...activeModal} onClose={() => setModal(null)} />
      )}
    </AdminLayout>
  );
}