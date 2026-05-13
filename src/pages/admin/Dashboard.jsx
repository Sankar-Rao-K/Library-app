import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import {
  listenToBooks, listenToStudents, listenToTransactions, listenToStaff,
} from "../../firebase/firestore";
import { smartSearch, tokenize } from "../../utils/searchUtils";

// ── Stat Card ─────────────────────────────────────────────────────────
function StatCard({ icon, label, value, subtitle, onClick, accent }) {
  const accents = {
    blue:   { bg: "#EEF2FF", border: "#0D1F4E" },
    green:  { bg: "#ECFDF5", border: "#1B6B35" },
    gold:   { bg: "#FFFBEB", border: "#C9A227" },
    indigo: { bg: "#EEF2FF", border: "#4F46E5" },
  };
  const a = accents[accent] || accents.blue;
  return (
    <button onClick={onClick}
      className="bg-white rounded-xl p-5 w-full text-left group transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:scale-95"
      style={{ border: `1px solid ${a.border}20`, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 transition-transform group-hover:scale-110"
          style={{ background: a.bg }}>{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 truncate">{subtitle}</p>}
        </div>
        <span className="text-gray-300 group-hover:text-gray-500 transition text-lg flex-shrink-0">›</span>
      </div>
    </button>
  );
}

// ── Quick View Modal ──────────────────────────────────────────────────
function QuickViewModal({ title, icon, items, columns, onClose, emptyMsg }) {
  const [search, setSearch] = useState("");
  const filtered = items.filter((item) =>
    columns.some((col) => {
      const val = col.render
        ? String(item[col.key] || "")
        : String(item[col.key] || "");
      return val.toLowerCase().includes(search.toLowerCase());
    })
  );
  return (
    <>
      <div className="fixed inset-0 z-40"
        style={{ background: "rgba(13,31,78,0.5)", backdropFilter: "blur(3px)" }}
        onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 sm:inset-auto sm:right-4 sm:top-4 sm:bottom-4 sm:w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b border-gray-100"
          style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
          <div className="flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            <h2 className="font-bold text-white text-base">{title}</h2>
            <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-medium">{filtered.length}</span>
          </div>
          <button onClick={onClose}
            className="text-white/70 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10">✕</button>
        </div>
        <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0" style={{ background: "#f8f9fa" }}>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..." autoFocus
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6B35]/30 focus:border-[#1B6B35]" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">🔍</p>
              <p className="text-gray-500 font-medium text-sm">No records found</p>
              <p className="text-gray-400 text-xs mt-1">Try a different search term</p>
            </div>
          ) : (
            <>
              <div className="hidden sm:block">
                <table className="w-full text-sm">
                  <thead className="sticky top-0" style={{ background: "#f8f9fa" }}>
                    <tr className="text-left border-b border-gray-100">
                      {columns.map((col) => (
                        <th key={col.key} className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-gray-500">{col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((item, i) => (
                      <tr key={item.id || i} className="hover:bg-gray-50">
                        {columns.map((col) => (
                          <td key={col.key} className="px-5 py-3">
                            {col.render ? col.render(item) : (
                              <span className={col.mono ? "font-mono text-xs text-gray-500" : "text-gray-700"}>
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
              <div className="sm:hidden divide-y divide-gray-100">
                {filtered.map((item, i) => (
                  <div key={item.id || i} className="px-5 py-3 space-y-1">
                    {columns.map((col) => (
                      <div key={col.key} className="flex justify-between items-center">
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

// ── Universal Search ──────────────────────────────────────────────────
function UniversalSearch({ students, staff, books, transactions, onNavigate }) {
  const [query, setQuery] = useState("");
  const q = query.trim();
  const tokens = tokenize(q);

  const studentResults = tokens.length >= 1
    ? smartSearch(students, q, ["name", "pin", "branch", "year"]).slice(0, 5)
    : [];
  const staffResults = tokens.length >= 1
    ? smartSearch(staff, q, ["name", "staffId", "section", "designation"]).slice(0, 5)
    : [];
  const bookResults = tokens.length >= 1
    ? smartSearch(books, q, ["title", "author", "accessionNo", "barcode", "subject"]).slice(0, 5)
    : [];
  const txnResults = tokens.length >= 1
    ? smartSearch(
        transactions, q,
        ["bookTitle", "studentName", "borrowerName", "studentPin", "borrowerId", "barcode"]
      ).slice(0, 4)
    : [];

  const hasResults = studentResults.length > 0 || staffResults.length > 0 ||
    bookResults.length > 0 || txnResults.length > 0;

  const duesFor = (id) =>
    transactions.filter(
      (t) => (t.borrowerId === id || t.studentId === id) && t.status === "issued"
    ).length;

  const handleNavigate = (path, state) => {
    setQuery("");
    onNavigate(path, state);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
      {/* Search bar */}
      <div className="flex items-center gap-3 px-5 py-4">
        <span className="text-xl text-gray-400 flex-shrink-0">🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search students, staff, books, transactions..."
          className="flex-1 text-sm text-gray-800 placeholder-gray-400 focus:outline-none bg-transparent"
        />
        {query ? (
          <button onClick={() => setQuery("")}
            className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 text-sm transition">
            ✕
          </button>
        ) : (
          <span className="text-xs text-gray-300 flex-shrink-0 hidden sm:block">
            Smart search — fuzzy match
          </span>
        )}
      </div>

      {q.length > 0 && <div className="border-t border-gray-100" />}

      {/* Results */}
      {q.length > 0 && (
        <div className="px-4 py-3 space-y-4 max-h-[420px] overflow-y-auto">
          {!hasResults ? (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">🔍</p>
              <p className="text-gray-600 font-semibold text-sm">No records found</p>
              <p className="text-gray-400 text-xs mt-1">
                Nothing matches "<strong>{query}</strong>". Try a different name, PIN, or accession number.
              </p>
            </div>
          ) : (
            <>
              {/* Books */}
              {bookResults.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">📚 Books</p>
                  <div className="space-y-1">
                    {bookResults.map((b) => (
                      <button key={b.id}
                        onClick={() => handleNavigate("/admin/books", { highlightId: b.id })}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition text-left group">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                          style={{ background: b.available ? "#ECFDF5" : "#FEF2F2" }}>
                          {b.available ? "📗" : "📕"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{b.title}</p>
                          <p className="text-xs text-gray-400 truncate">{b.author} · {b.accessionNo || b.barcode}</p>
                        </div>
                        <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${
                          b.available ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        }`}>
                          {b.available ? "✓ Available" : "✗ Issued"}
                        </span>
                        <span className="text-gray-300 group-hover:text-gray-500 text-sm flex-shrink-0">›</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Students */}
              {studentResults.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">🎓 Students</p>
                  <div className="space-y-1">
                    {studentResults.map((s) => {
                      const dues = duesFor(s.id);
                      return (
                        <button key={s.id}
                          onClick={() => handleNavigate("/admin/students", { highlightId: s.id })}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition text-left group">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 text-white"
                            style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
                            {s.name?.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{s.name}</p>
                            <p className="text-xs text-gray-400 font-mono">{s.pin} · {s.branch} · {s.year}</p>
                          </div>
                          <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${
                            dues > 0 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                          }`}>
                            {dues > 0 ? `⚠️ ${dues} Due${dues > 1 ? "s" : ""}` : "✓ No Dues"}
                          </span>
                          <span className="text-gray-300 group-hover:text-gray-500 text-sm flex-shrink-0">›</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Staff */}
              {staffResults.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">👩‍🏫 Staff</p>
                  <div className="space-y-1">
                    {staffResults.map((s) => {
                      const dues = duesFor(s.id);
                      return (
                        <button key={s.id}
                          onClick={() => handleNavigate("/admin/staff", { highlightId: s.id })}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition text-left group">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 text-indigo-200"
                            style={{ background: "linear-gradient(135deg, #312e81, #1e3a5f)" }}>
                            {s.name?.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{s.name}</p>
                            <p className="text-xs text-gray-400">{s.designation} · {s.section} · <span className="font-mono">{s.staffId}</span></p>
                          </div>
                          <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${
                            dues > 0 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                          }`}>
                            {dues > 0 ? `⚠️ ${dues} Due${dues > 1 ? "s" : ""}` : "✓ No Dues"}
                          </span>
                          <span className="text-gray-300 group-hover:text-gray-500 text-sm flex-shrink-0">›</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Transactions */}
              {txnResults.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">📋 Transactions</p>
                  <div className="space-y-1">
                    {txnResults.map((t) => {
                      const days = t.issueDate?.toDate
                        ? Math.floor((Date.now() - t.issueDate.toDate()) / 86400000) : null;
                      const isOverdue = days !== null && days > 14 && t.status === "issued";
                      return (
                        <button key={t.id}
                          onClick={() => handleNavigate("/admin/reports")}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition text-left group">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                            style={{
                              background: t.status === "issued" ? "#FFFBEB" : "#F0FDF4",
                              border: `1px solid ${t.status === "issued" ? "#fde68a" : "#bbf7d0"}`,
                            }}>
                            {t.status === "issued" ? "📤" : "📥"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{t.bookTitle}</p>
                            <p className="text-xs text-gray-400 truncate">
                              {t.studentName || t.borrowerName}
                              {days !== null ? ` · ${days}d ago` : ""}
                            </p>
                          </div>
                          <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${
                            isOverdue ? "bg-red-100 text-red-700"
                            : t.status === "issued" ? "bg-amber-100 text-amber-700"
                            : "bg-green-100 text-green-700"
                          }`}>
                            {isOverdue ? "⚠️ Overdue" : t.status === "issued" ? "Issued" : "Returned"}
                          </span>
                          <span className="text-gray-300 group-hover:text-gray-500 text-sm flex-shrink-0">›</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Transaction Filters + Table ───────────────────────────────────────
function TransactionTable({ transactions, onViewIssued }) {
  const [typeFilter, setTypeFilter]     = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [txnSearch, setTxnSearch]       = useState("");

  let filtered = [...transactions]
    .sort((a, b) => (b.issueDate?.seconds || 0) - (a.issueDate?.seconds || 0));

  // Apply type filter
  if (typeFilter !== "all") {
    filtered = filtered.filter((t) => (t.borrowerType || "student") === typeFilter);
  }

  // Apply status filter
  if (statusFilter !== "all") {
    filtered = filtered.filter((t) => t.status === statusFilter);
  }

  // Apply smart search
  if (txnSearch.trim()) {
    filtered = smartSearch(
      filtered, txnSearch,
      ["bookTitle", "studentName", "borrowerName", "studentPin", "borrowerId", "barcode"]
    );
  }

  const shown = filtered.slice(0, 10);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100"
        style={{ background: "linear-gradient(135deg, #0D1F4E08, #1B433208)" }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-gray-800">Recent Transactions</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Showing {shown.length} of {filtered.length} records
            </p>
          </div>
          <button onClick={onViewIssued}
            className="text-xs font-bold px-3 py-1.5 rounded-lg transition self-start sm:self-auto"
            style={{ color: "#0D1F4E", background: "#EEF2FF" }}>
            View All Issued →
          </button>
        </div>

        {/* Search within transactions */}
        <div className="mt-3 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            value={txnSearch}
            onChange={(e) => setTxnSearch(e.target.value)}
            placeholder="Search in transactions..."
            className="w-full border border-gray-200 rounded-lg pl-8 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6B35]/30 focus:border-[#1B6B35]"
          />
          {txnSearch && (
            <button onClick={() => setTxnSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Table / Empty */}
      {shown.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-gray-500 font-medium text-sm">No records found</p>
          <p className="text-gray-400 text-xs mt-1">
            {txnSearch || typeFilter !== "all" || statusFilter !== "all"
              ? "Try clearing some filters."
              : "No transactions yet."}
          </p>
          {(txnSearch || typeFilter !== "all" || statusFilter !== "all") && (
            <button
              onClick={() => { setTxnSearch(""); setTypeFilter("all"); setStatusFilter("all"); }}
              className="mt-3 text-xs text-blue-600 hover:underline font-medium">
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: "#f8f9fa" }}>
                <tr className="text-left border-b border-gray-100">
                  {["Book", "Borrower"].map((h) => (
                    <th key={h} className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-gray-500">{h}</th>
                  ))}
                  <th className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Type</span>
                      <div className="relative">
                        <select
                          value={typeFilter}
                          onChange={(e) => setTypeFilter(e.target.value)}
                          className="appearance-none pl-2 pr-5 py-0.5 text-xs font-semibold rounded border border-gray-200 bg-white text-gray-600 focus:outline-none focus:border-[#0D1F4E] cursor-pointer"
                        >
                          <option value="all">All</option>
                          <option value="student">Student</option>
                          <option value="staff">Staff</option>
                        </select>
                        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400" style={{ fontSize: "9px" }}>▾</span>
                      </div>
                    </div>
                  </th>
                  <th className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Status</span>
                      <div className="relative">
                        <select
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value)}
                          className="appearance-none pl-2 pr-5 py-0.5 text-xs font-semibold rounded border border-gray-200 bg-white text-gray-600 focus:outline-none focus:border-[#0D1F4E] cursor-pointer"
                        >
                          <option value="all">All</option>
                          <option value="issued">Issued</option>
                          <option value="returned">Returned</option>
                        </select>
                        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400" style={{ fontSize: "9px" }}>▾</span>
                      </div>
                    </div>
                  </th>
                  {["Date", "Days"].map((h) => (
                    <th key={h} className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {shown.map((t) => {
                  const days = t.issueDate?.toDate
                    ? Math.floor((Date.now() - t.issueDate.toDate()) / 86400000) : null;
                  const isOverdue = days !== null && days > 14 && t.status === "issued";
                  return (
                    <tr key={t.id} className="hover:bg-gray-50 transition">
                      <td className="px-5 py-3 font-medium text-gray-800 max-w-xs truncate">{t.bookTitle}</td>
                      <td className="px-5 py-3 text-gray-600">{t.studentName || t.borrowerName}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          (t.borrowerType || "student") === "staff"
                            ? "bg-indigo-100 text-indigo-700"
                            : "bg-blue-50 text-blue-700"
                        }`}>
                          {(t.borrowerType || "student") === "staff" ? "Staff" : "Student"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          t.status === "issued"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-green-100 text-green-700"
                        }`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-400">
                        {t.issueDate?.toDate ? t.issueDate.toDate().toLocaleDateString("en-IN") : "—"}
                      </td>
                      <td className="px-5 py-3 text-xs">
                        {days !== null ? (
                          <span className={isOverdue ? "text-red-600 font-bold" : "text-gray-400"}>
                            {days}d {isOverdue ? "⚠️" : ""}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="sm:hidden divide-y divide-gray-100">
            {shown.map((t) => {
              const days = t.issueDate?.toDate
                ? Math.floor((Date.now() - t.issueDate.toDate()) / 86400000) : null;
              return (
                <div key={t.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">{t.bookTitle}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t.studentName || t.borrowerName}
                      {days !== null ? ` · ${days}d` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.status === "issued" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                    }`}>
                      {t.status}
                    </span>
                    <span className={`text-xs ${(t.borrowerType || "student") === "staff" ? "text-indigo-500" : "text-blue-500"}`}>
                      {(t.borrowerType || "student") === "staff" ? "Staff" : "Student"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [books, setBooks]               = useState([]);
  const [students, setStudents]         = useState([]);
  const [staff, setStaff]               = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [modal, setModal]               = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const u1 = listenToBooks(setBooks);
    const u2 = listenToStudents(setStudents);
    const u3 = listenToTransactions(setTransactions);
    const u4 = listenToStaff(setStaff);
    return () => { u1(); u2(); u3(); u4(); };
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
        { key: "available",   label: "Status",
          render: (b) => (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${b.available ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {b.available ? "Available" : "Issued"}
            </span>
          )},
      ],
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
    },
    issued: {
      title: "Currently Issued", icon: "📤",
      items: issuedTxns,
      columns: [
        { key: "bookTitle",   label: "Book" },
        { key: "studentName", label: "Borrower" },
        { key: "studentPin",  label: "ID/PIN", mono: true },
        { key: "issueDate",   label: "Issued",
          render: (t) => t.issueDate?.toDate ? t.issueDate.toDate().toLocaleDateString("en-IN") : "—" },
        { key: "days",        label: "Days",
          render: (t) => {
            if (!t.issueDate?.toDate) return "—";
            const d = Math.floor((Date.now() - t.issueDate.toDate()) / 86400000);
            return <span className={d > 14 ? "text-red-600 font-bold" : "text-gray-600"}>{d}d {d > 14 ? "⚠️" : ""}</span>;
          }},
      ],
    },
    returned: {
      title: "Returned Books", icon: "📥",
      items: returnedTxns,
      columns: [
        { key: "bookTitle",   label: "Book" },
        { key: "studentName", label: "Borrower" },
        { key: "issueDate",   label: "Issued",
          render: (t) => t.issueDate?.toDate ? t.issueDate.toDate().toLocaleDateString("en-IN") : "—" },
        { key: "returnDate",  label: "Returned",
          render: (t) => t.returnDate?.toDate ? t.returnDate.toDate().toLocaleDateString("en-IN") : "—" },
      ],
    },
    students: {
      title: "All Students", icon: "🎓",
      items: [...students].sort((a, b) => (a.pin || "").localeCompare(b.pin || "")),
      columns: [
        { key: "pin",    label: "PIN",    mono: true },
        { key: "name",   label: "Name" },
        { key: "branch", label: "Branch" },
        { key: "year",   label: "Year" },
      ],
    },
    staff: {
      title: "All Staff", icon: "👩‍🏫",
      items: [...staff].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
      columns: [
        { key: "staffId",     label: "CMS ID",      mono: true },
        { key: "name",        label: "Name" },
        { key: "designation", label: "Designation" },
        { key: "section",     label: "Section" },
      ],
    },
  };

  const activeModal = modal ? MODALS[modal] : null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayTxns = transactions.filter(
    (t) => t.issueDate?.toDate && t.issueDate.toDate() >= today
  ).length;

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" className="w-10 h-10 rounded-full object-cover border-2 hidden sm:block"
            style={{ borderColor: "#C9A227" }} />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Library Dashboard</h1>
            <p className="text-gray-400 text-xs mt-0.5">
              Govt. Polytechnic Anakapalli ·{" "}
              {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate("/admin/issue")}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold transition"
            style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)", boxShadow: "0 4px 15px rgba(13,31,78,0.2)" }}>
            <span>➕</span> Issue Book
          </button>
          <button onClick={() => navigate("/admin/return")}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold transition"
            style={{ background: "linear-gradient(135deg, #b45309, #d97706)", boxShadow: "0 4px 15px rgba(180,83,9,0.2)" }}>
            <span>↩️</span> Return
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard icon="📚" label="Total Books"  value={books.length}          subtitle={`${availableBooks.length} available`} accent="blue"   onClick={() => setModal("totalBooks")} />
        <StatCard icon="✅" label="Available"     value={availableBooks.length} subtitle="Ready to issue"                      accent="green"  onClick={() => setModal("available")} />
        <StatCard icon="📤" label="Issued"        value={issuedTxns.length}     subtitle="Currently out"                       accent="gold"   onClick={() => setModal("issued")} />
        <StatCard icon="📥" label="Returned"      value={returnedTxns.length}   subtitle="All time"                            accent="indigo" onClick={() => setModal("returned")} />
        <StatCard icon="🎓" label="Students"      value={students.length}       subtitle="Registered"                          accent="green"  onClick={() => setModal("students")} />
        <StatCard icon="👩‍🏫" label="Staff"        value={staff.length}          subtitle="Members"                             accent="blue"   onClick={() => setModal("staff")} />
      </div>

      {/* Universal Search */}
      <UniversalSearch
        students={students}
        staff={staff}
        books={books}
        transactions={transactions}
        onNavigate={(path, state) => navigate(path, { state })}
      />

      {/* Transactions with filters */}
      <TransactionTable
        transactions={transactions}
        onViewIssued={() => setModal("issued")}
      />

      {activeModal && (
        <QuickViewModal {...activeModal} onClose={() => setModal(null)} emptyMsg="No records found." />
      )}
    </AdminLayout>
  );
}