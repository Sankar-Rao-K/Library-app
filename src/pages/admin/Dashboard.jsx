import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import {
  listenToBooks, listenToStudents, listenToTransactions, listenToStaff,
} from "../../firebase/firestore";
import { smartSearch, isIdQuery } from "../../utils/searchUtils";

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
    columns.some((col) =>
      String(item[col.key] || "").toLowerCase().includes(search.toLowerCase())
    )
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
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">🔍</p>
              <p className="text-gray-500 font-medium text-sm">No records found</p>
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

// ── Universal Search (Google-style dropdown) ──────────────────────────
function UniversalSearch({ students, staff, books, transactions, onNavigate }) {
  const [query, setQuery]       = useState("");
  const [open, setOpen]         = useState(false);
  const [ready, setReady]       = useState(false);
  const containerRef            = useRef(null);
  const inputRef                = useRef(null);
  const q       = query.trim();
  const idMode  = isIdQuery(q);

  // ── Compute results ────────────────────────────────────────────────
  const studentResults = q.length >= 1
    ? smartSearch(students, q, ["name", "pin", "branch", "year"]).slice(0, 5)
    : [];
  const staffResults = q.length >= 1
    ? smartSearch(staff, q, ["name", "staffId", "section", "designation"]).slice(0, 5)
    : [];
  const bookResults = q.length >= 1
    ? smartSearch(books, q, ["title", "author", "accessionNo", "barcode", "subject"]).slice(0, 5)
    : [];
  const txnResults = q.length >= 1
    ? smartSearch(
        transactions, q,
        ["bookTitle", "studentName", "borrowerName", "studentPin", "borrowerId", "barcode"]
      ).slice(0, 4)
    : [];

  const hasResults = studentResults.length > 0 || staffResults.length > 0 ||
                     bookResults.length > 0    || txnResults.length > 0;
  const totalCount = studentResults.length + staffResults.length + bookResults.length + txnResults.length;

  const duesFor = (id) =>
    transactions.filter(
      (t) => (t.borrowerId === id || t.studentId === id) && t.status === "issued"
    ).length;

  // ── Animation helpers ─────────────────────────────────────────────
  const openDropdown = () => {
    if (q.length < 1) return;
    setOpen(true);
    requestAnimationFrame(() => setReady(true));
  };

  const closeDropdown = () => {
    setReady(false);
    setTimeout(() => setOpen(false), 200);
  };

  useEffect(() => {
    if (q.length >= 1) openDropdown();
    else closeDropdown();
  }, [q]);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) closeDropdown();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleNavigate = (path, state) => {
    setQuery("");
    closeDropdown();
    onNavigate(path, state);
  };

  // ── Section header for dropdown ───────────────────────────────────
  const SectionLabel = ({ icon, label, count }) => (
    <div className="px-4 py-1.5 flex items-center gap-2 sticky top-0"
      style={{ background: "rgba(219,234,254,0.6)", backdropFilter: "blur(4px)" }}>
      <span className="text-sm">{icon}</span>
      <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">{label}</span>
      <span className="text-xs text-blue-500 ml-1">({count})</span>
    </div>
  );

  return (
    <div ref={containerRef} className="relative mb-6">
      {/* ── Search Input ── */}
      <div className={`bg-white transition-all duration-200 ${
        open ? "rounded-t-2xl shadow-lg" : "rounded-2xl shadow-sm"
      } border ${open ? "border-blue-400 border-b-0 ring-2 ring-blue-100" : "border-gray-200"}`}>
        <div className="flex items-center gap-3 px-5 py-3.5">
          <svg className={`w-5 h-5 flex-shrink-0 transition-colors duration-200 ${open ? "text-blue-500" : "text-gray-400"}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={openDropdown}
            placeholder="Search students, staff, books, transactions…"
            className="flex-1 text-sm text-gray-800 placeholder-gray-400 focus:outline-none bg-transparent"
          />
          <div className="flex items-center gap-2 flex-shrink-0">
            {query && open && totalCount > 0 && (
              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                {totalCount}
              </span>
            )}
            {idMode && query && (
              <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full hidden sm:block">
                ID
              </span>
            )}
            {query ? (
              <button
                onMouseDown={(e) => { e.preventDefault(); setQuery(""); closeDropdown(); }}
                className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition text-gray-500 text-xs">
                ✕
              </button>
            ) : (
              <span className="text-xs text-gray-300 hidden sm:block select-none">Smart search</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Dropdown ── */}
      {open && (
        <div
          className="absolute left-0 right-0 z-50 border border-t-0 border-blue-400 rounded-b-2xl overflow-hidden"
          style={{
            background: "linear-gradient(180deg, #EFF6FF 0%, #EDF5FF 100%)",
            boxShadow: "0 12px 40px rgba(59,130,246,0.15), 0 4px 12px rgba(0,0,0,0.08)",
            opacity:    ready ? 1 : 0,
            transform:  ready ? "translateY(0)" : "translateY(-10px)",
            transition: "opacity 0.2s ease, transform 0.2s ease",
          }}>

          {/* Results or empty state */}
          {!hasResults ? (
            <div className="px-4 py-8 text-center">
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-sm font-semibold text-gray-600">
                {idMode
                  ? `No exact match for "${query}"`
                  : `No results for "${query}"`}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {idMode
                  ? "PIN or Staff ID must match exactly"
                  : "Try a different name, PIN, or accession number"}
              </p>
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">

              {/* ── Books ── */}
              {bookResults.length > 0 && (
                <div>
                  <SectionLabel icon="📚" label="Books" count={bookResults.length} />
                  {bookResults.map((b) => (
                    <button key={b.id}
                      onMouseDown={(e) => { e.preventDefault(); handleNavigate("/admin/books", { highlightId: b.id }); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100 border-b border-blue-50 last:border-0"
                      onMouseEnter={(e) => e.currentTarget.style.background = "rgba(191,219,254,0.5)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                        style={{ background: b.available ? "#ECFDF5" : "#FEF2F2" }}>
                        {b.available ? "📗" : "📕"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{b.title}</p>
                        <p className="text-xs text-gray-500 truncate">{b.author} · {b.accessionNo || b.barcode}</p>
                      </div>
                      <span className={`flex-shrink-0 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        b.available ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}>
                        {b.available ? "✓ Available" : "✗ Issued"}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* ── Students ── */}
              {studentResults.length > 0 && (
                <div>
                  <SectionLabel icon="🎓" label="Students" count={studentResults.length} />
                  {studentResults.map((s) => {
                    const dues = duesFor(s.id);
                    return (
                      <button key={s.id}
                        onMouseDown={(e) => { e.preventDefault(); handleNavigate("/admin/students", { highlightId: s.id }); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100 border-b border-blue-50 last:border-0"
                        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(191,219,254,0.5)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 text-white"
                          style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
                          {s.name?.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{s.name}</p>
                          <p className="text-xs text-gray-500 font-mono">{s.pin} · {s.branch} · {s.year}</p>
                        </div>
                        <span className={`flex-shrink-0 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          dues > 0 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                        }`}>
                          {dues > 0 ? `⚠️ ${dues} Due${dues > 1 ? "s" : ""}` : "✓ No Dues"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ── Staff ── */}
              {staffResults.length > 0 && (
                <div>
                  <SectionLabel icon="👩‍🏫" label="Staff" count={staffResults.length} />
                  {staffResults.map((s) => {
                    const dues = duesFor(s.id);
                    return (
                      <button key={s.id}
                        onMouseDown={(e) => { e.preventDefault(); handleNavigate("/admin/staff", { highlightId: s.id }); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100 border-b border-blue-50 last:border-0"
                        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(191,219,254,0.5)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 text-indigo-200"
                          style={{ background: "linear-gradient(135deg, #312e81, #1e3a5f)" }}>
                          {s.name?.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{s.name}</p>
                          <p className="text-xs text-gray-500">{s.designation} · {s.section} · <span className="font-mono">{s.staffId}</span></p>
                        </div>
                        <span className={`flex-shrink-0 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          dues > 0 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                        }`}>
                          {dues > 0 ? `⚠️ ${dues} Due${dues > 1 ? "s" : ""}` : "✓ No Dues"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ── Transactions ── */}
              {txnResults.length > 0 && (
                <div>
                  <SectionLabel icon="📋" label="Transactions" count={txnResults.length} />
                  {txnResults.map((t) => {
                    const days = t.issueDate?.toDate
                      ? Math.floor((Date.now() - t.issueDate.toDate()) / 86400000) : null;
                    const isOverdue = days !== null && days > 14 && t.status === "issued";
                    return (
                      <button key={t.id}
                        onMouseDown={(e) => { e.preventDefault(); handleNavigate("/admin/reports"); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100 border-b border-blue-50 last:border-0"
                        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(191,219,254,0.5)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                          style={{ background: t.status === "issued" ? "#FFFBEB" : "#F0FDF4", border: `1px solid ${t.status === "issued" ? "#fde68a" : "#bbf7d0"}` }}>
                          {t.status === "issued" ? "📤" : "📥"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{t.bookTitle}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {t.studentName || t.borrowerName}
                            {days !== null ? ` · ${days}d ago` : ""}
                          </p>
                        </div>
                        <span className={`flex-shrink-0 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          isOverdue ? "bg-red-100 text-red-700"
                          : t.status === "issued" ? "bg-amber-100 text-amber-700"
                          : "bg-green-100 text-green-700"
                        }`}>
                          {isOverdue ? "⚠️ Overdue" : t.status === "issued" ? "Issued" : "Returned"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Footer hint */}
              <div className="px-4 py-2 text-center border-t border-blue-100"
                style={{ background: "rgba(219,234,254,0.3)" }}>
                <p className="text-xs text-blue-400">
                  Click any result to navigate · Press Esc to close
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Transaction Table (20 limit + view more, no "today" clutter) ──────
function TransactionTable({ transactions, onViewIssued }) {
  const [typeFilter, setTypeFilter]     = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [txnSearch, setTxnSearch]       = useState("");
  const [limit, setLimit]               = useState(20);

  let filtered = [...transactions]
    .sort((a, b) => (b.issueDate?.seconds || 0) - (a.issueDate?.seconds || 0));

  if (typeFilter   !== "all") filtered = filtered.filter((t) => (t.borrowerType || "student") === typeFilter);
  if (statusFilter !== "all") filtered = filtered.filter((t) => t.status === statusFilter);

  if (txnSearch.trim()) {
    const q = txnSearch.toLowerCase();
    filtered = filtered.filter((t) =>
      t.bookTitle?.toLowerCase().includes(q) ||
      (t.studentName || t.borrowerName || "").toLowerCase().includes(q) ||
      (t.studentPin  || t.borrowerId   || "").toLowerCase().includes(q)
    );
  }

  const shown   = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;

  const FILTER_ACTIVE = { background: "linear-gradient(135deg, #0D1F4E, #1B4332)", color: "white" };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100"
        style={{ background: "linear-gradient(135deg, #0D1F4E08, #1B433208)" }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-bold text-gray-800">
            Recent Transactions
            <span className="ml-2 text-xs font-normal text-gray-400">
              — {shown.length} of {filtered.length}
            </span>
          </h2>
          <button onClick={onViewIssued}
            className="text-xs font-bold px-3 py-1.5 rounded-lg transition self-start sm:self-auto"
            style={{ color: "#0D1F4E", background: "#EEF2FF" }}>
            View All Issued →
          </button>
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-2">
          {/* Type */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {[
              { key: "all",     label: "All"        },
              { key: "student", label: "🎓 Students" },
              { key: "staff",   label: "👩‍🏫 Staff"   },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setTypeFilter(key)}
                className="px-2.5 py-1 rounded-md text-xs font-semibold transition"
                style={typeFilter === key ? FILTER_ACTIVE : { color: "#6b7280" }}>
                {label}
              </button>
            ))}
          </div>

          {/* Status */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {[
              { key: "all",      label: "All"        },
              { key: "issued",   label: "📤 Issued"   },
              { key: "returned", label: "📥 Returned" },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setStatusFilter(key)}
                className="px-2.5 py-1 rounded-md text-xs font-semibold transition"
                style={statusFilter === key ? FILTER_ACTIVE : { color: "#6b7280" }}>
                {label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[160px]">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
            <input type="text" value={txnSearch}
              onChange={(e) => { setTxnSearch(e.target.value); setLimit(20); }}
              placeholder="Search transactions..."
              className="w-full border border-gray-200 rounded-lg pl-7 pr-7 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white" />
            {txnSearch && (
              <button onClick={() => setTxnSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {shown.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-gray-500 font-medium text-sm">No transactions found</p>
          {(txnSearch || typeFilter !== "all" || statusFilter !== "all") && (
            <button
              onClick={() => { setTxnSearch(""); setTypeFilter("all"); setStatusFilter("all"); }}
              className="mt-2 text-xs text-blue-600 hover:underline font-medium">
              Clear filters
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
                  {["Book", "Borrower", "Type", "Status", "Date", "Days"].map((h) => (
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
                    <tr key={t.id} className={`transition ${isOverdue ? "bg-red-50/40" : "hover:bg-gray-50"}`}>
                      <td className="px-5 py-3 font-medium text-gray-800 max-w-xs truncate">{t.bookTitle}</td>
                      <td className="px-5 py-3 text-gray-600">{t.studentName || t.borrowerName}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          (t.borrowerType || "student") === "staff" ? "bg-indigo-100 text-indigo-700" : "bg-blue-50 text-blue-700"
                        }`}>
                          {(t.borrowerType || "student") === "staff" ? "Staff" : "Student"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          t.status === "issued" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
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

          {/* Mobile cards */}
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

          {/* View more button */}
          {hasMore && (
            <div className="px-5 py-4 border-t border-gray-100 text-center"
              style={{ background: "#fafbff" }}>
              <button
                onClick={() => setLimit((l) => l + 20)}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition border border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-400">
                <span>View more transactions</span>
                <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold">
                  {filtered.length - limit} remaining
                </span>
              </button>
            </div>
          )}
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

      {/* Transactions */}
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