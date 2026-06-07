import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import {
  listenToBooks, listenToStudents, listenToTransactions, listenToStaff,
} from "../../firebase/firestore";
import { fixBookAvailability } from "../../firebase/firestore";
import {
  smartSearch, isIdQuery, getHighlightSegments, debounce,
} from "../../utils/searchUtils";

// ── Highlight ─────────────────────────────────────────────────────────
function HL({ text, query }) {
  const segs = getHighlightSegments(String(text || ""), query);
  return (
    <span>
      {segs.map((s, i) =>
        s.match
          ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5 not-italic font-semibold">{s.text}</mark>
          : <span key={i}>{s.text}</span>
      )}
    </span>
  );
}

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
function QuickViewModal({ title, icon, items, columns, onClose }) {
  const [search, setSearch] = useState("");
  const filtered = items.filter((item) =>
    columns.some((col) =>
      String(item[col.key] || "").toLowerCase().includes(search.toLowerCase())
    )
  );
  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(13,31,78,0.5)", backdropFilter: "blur(3px)" }} onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 sm:inset-auto sm:right-4 sm:top-4 sm:bottom-4 sm:w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
          <div className="flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            <h2 className="font-bold text-white text-base">{title}</h2>
            <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">{filtered.length}</span>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10">✕</button>
        </div>
        <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0 bg-gray-50">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." autoFocus
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-16"><p className="text-4xl mb-3">🔍</p><p className="text-gray-500 text-sm font-medium">No records found</p></div>
          ) : (
            <table className="w-full text-sm hidden sm:table">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                <tr className="text-left">
                  {columns.map((col) => (
                    <th key={col.key} className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-gray-400">{col.label}</th>
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
          )}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// DATA INTEGRITY WARNING BANNER
// ═══════════════════════════════════════════════════════════════════════
function DataIntegrityBanner({ books, issuedTxns, onFixed }) {
  const [fixing,   setFixing]   = useState(false);
  const [done,     setDone]     = useState(false);
  const [fixCount, setFixCount] = useState(0);

  // Compute ghost books: available=false but NOT in any issued transaction
  const issuedBookIds  = new Set(issuedTxns.map((t) => t.bookId).filter(Boolean));
  const issuedBarcodes = new Set(issuedTxns.map((t) => t.barcode).filter(Boolean));

  const ghostBooks = books.filter((b) => {
    if (b.available) return false;
    return !issuedBookIds.has(b.id) && !issuedBarcodes.has(b.barcode) && !issuedBarcodes.has(b.accessionNo);
  });

  if (ghostBooks.length === 0 || done) return null;

  const handleFix = async () => {
    setFixing(true);
    try {
      const result = await fixBookAvailability();
      setFixCount(result.fixed);
      setDone(true);
      onFixed?.();
    } catch (err) {
      alert("Fix failed: " + err.message);
    }
    setFixing(false);
  };

  return (
    <div className="rounded-xl border px-4 py-4 mb-5 flex flex-col sm:flex-row sm:items-center gap-3"
      style={{ background: "#FFFBEB", borderColor: "#FCD34D" }}>
      <div className="flex items-start gap-3 flex-1">
        <span className="text-2xl flex-shrink-0 mt-0.5">⚠️</span>
        <div>
          <p className="font-bold text-amber-800 text-sm">
            Data integrity issue detected
          </p>
          <p className="text-amber-700 text-xs mt-0.5 leading-relaxed">
            <strong>{ghostBooks.length} book{ghostBooks.length !== 1 ? "s" : ""}</strong> marked as
            <span className="mx-1 px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-mono text-xs">available: false</span>
            in the database but have <strong>no active issued transaction</strong>.
            This causes the Available count ({books.filter((b) => b.available).length}) to differ from
            Total ({books.length}) − Issued ({issuedTxns.length}) = {books.length - issuedTxns.length}.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {ghostBooks.slice(0, 5).map((b) => (
              <span key={b.id} className="text-xs bg-white border border-amber-200 text-amber-700 px-2 py-0.5 rounded font-mono">
                {b.accessionNo || b.barcode}
              </span>
            ))}
            {ghostBooks.length > 5 && (
              <span className="text-xs text-amber-600">+{ghostBooks.length - 5} more</span>
            )}
          </div>
        </div>
      </div>
      <button onClick={handleFix} disabled={fixing}
        className="flex-shrink-0 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition disabled:opacity-60 whitespace-nowrap"
        style={{ background: fixing ? "#9CA3AF" : "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
        {fixing ? "Fixing…" : `🔧 Fix ${ghostBooks.length} Book${ghostBooks.length !== 1 ? "s" : ""}`}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// UNIVERSAL SEARCH
// ═══════════════════════════════════════════════════════════════════════
const SEARCH_TABS = ["all", "books", "students", "staff", "transactions"];

function UniversalSearch({ students, staff, books, transactions, onNavigate }) {
  const [rawQuery, setRawQuery]   = useState("");
  const [query,    setQuery]      = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [open,  setOpen]  = useState(false);
  const [ready, setReady] = useState(false);
  const containerRef = useRef(null);
  const inputRef     = useRef(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSet = useCallback(debounce((v) => setQuery(v), 200), []);

  const handleInput = (v) => {
    setRawQuery(v);
    debouncedSet(v);
    if (v.trim().length >= 2) { setOpen(true); requestAnimationFrame(() => setReady(true)); }
    else { setReady(false); setTimeout(() => setOpen(false), 200); }
  };

  const handleClear = () => {
    setRawQuery(""); setQuery(""); setActiveTab("all");
    setReady(false); setTimeout(() => setOpen(false), 200);
    inputRef.current?.focus();
  };

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") handleClear(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    const h = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setReady(false); setTimeout(() => setOpen(false), 200);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const q     = query.trim();
  const idMode = isIdQuery(q);

  const bookResults    = q.length >= 2 ? smartSearch(books,        q, ["title","author","accessionNo","barcode","subject"], 20, [], 50) : [];
  const studentResults = q.length >= 2 ? smartSearch(students,     q, ["name","pin","branch","year"],                       20, [], 50) : [];
  const staffResults   = q.length >= 2 ? smartSearch(staff,        q, ["name","staffId","section","designation"],           20, [], 50) : [];
  const txnResults     = q.length >= 2 ? smartSearch(transactions, q, ["bookTitle","studentName","borrowerName","studentPin","borrowerId"], 20, [], 30) : [];

  const counts = { books: bookResults.length, students: studentResults.length, staff: staffResults.length, transactions: txnResults.length };
  const totalCount = counts.books + counts.students + counts.staff + counts.transactions;
  const hasResults = totalCount > 0;

  const duesFor = (id) => transactions.filter((t) => (t.borrowerId === id || t.studentId === id) && t.status === "issued").length;

  const handleNavigate = (path, state) => {
    handleClear();
    onNavigate(path, state);
  };

  const TabBtn = ({ tab, label }) => {
    const count = tab === "all" ? totalCount : counts[tab];
    return (
      <button
        onMouseDown={(e) => { e.preventDefault(); setActiveTab(tab); }}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
          activeTab === tab ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-blue-50 hover:text-blue-700"
        }`}>
        {label}
        {count > 0 && (
          <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold leading-none ${
            activeTab === tab ? "bg-white/25 text-white" : "bg-gray-100 text-gray-500"
          }`}>{count > 50 ? "50+" : count}</span>
        )}
      </button>
    );
  };

  const SectionLabel = ({ icon, label, count }) => (
    <div className="px-4 py-1.5 flex items-center justify-between sticky top-0"
      style={{ background: "rgba(219,234,254,0.6)", backdropFilter: "blur(4px)" }}>
      <span className="flex items-center gap-1.5">
        <span className="text-sm">{icon}</span>
        <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">{label}</span>
      </span>
      <span className="text-xs text-blue-500 font-medium">{count} result{count !== 1 ? "s" : ""}</span>
    </div>
  );

  const BookRow = ({ b }) => (
    <button onMouseDown={(e) => { e.preventDefault(); handleNavigate("/admin/books", { highlightId: b.id }); }}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-blue-50 last:border-0 transition-colors"
      onMouseEnter={(e) => e.currentTarget.style.background = "rgba(191,219,254,0.45)"}
      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
        style={{ background: b.available ? "#ECFDF5" : "#FEF2F2" }}>{b.available ? "📗" : "📕"}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate"><HL text={b.title} query={q} /></p>
        <p className="text-xs text-gray-400 truncate"><HL text={b.author||""} query={q} /> · {b.accessionNo || b.barcode}</p>
      </div>
      <span className={`flex-shrink-0 px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${b.available ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
        {b.available ? "✓ Available" : "✗ Issued"}
      </span>
    </button>
  );

  const StudentRow = ({ s }) => {
    const dues = duesFor(s.id);
    return (
      <button onMouseDown={(e) => { e.preventDefault(); handleNavigate("/admin/students", { highlightId: s.id }); }}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-blue-50 last:border-0 transition-colors"
        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(191,219,254,0.45)"}
        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 text-white"
          style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>{s.name?.charAt(0)}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate"><HL text={s.name} query={q} /></p>
          <p className="text-xs text-gray-400 font-mono"><HL text={s.pin} query={q} /> · {s.branch}</p>
        </div>
        <span className={`flex-shrink-0 px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${dues > 0 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
          {dues > 0 ? `⚠️ ${dues} Due${dues > 1 ? "s" : ""}` : "✓ No Dues"}
        </span>
      </button>
    );
  };

  const StaffRow = ({ s }) => {
    const dues = duesFor(s.id);
    return (
      <button onMouseDown={(e) => { e.preventDefault(); handleNavigate("/admin/staff", { highlightId: s.id }); }}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-blue-50 last:border-0 transition-colors"
        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(191,219,254,0.45)"}
        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 text-indigo-200"
          style={{ background: "linear-gradient(135deg, #312e81, #1e3a5f)" }}>{s.name?.charAt(0)}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate"><HL text={s.name} query={q} /></p>
          <p className="text-xs text-gray-400">{s.designation} · <span className="font-mono"><HL text={s.staffId} query={q} /></span></p>
        </div>
        <span className={`flex-shrink-0 px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${dues > 0 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
          {dues > 0 ? `⚠️ ${dues} Due${dues > 1 ? "s" : ""}` : "✓ No Dues"}
        </span>
      </button>
    );
  };

  const TxnRow = ({ t }) => {
    const days = t.issueDate?.toDate ? Math.floor((Date.now() - t.issueDate.toDate()) / 86400000) : null;
    const isOverdue = days !== null && days > 14 && t.status === "issued";
    return (
      <button onMouseDown={(e) => { e.preventDefault(); handleNavigate("/admin/reports"); }}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-blue-50 last:border-0 transition-colors"
        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(191,219,254,0.45)"}
        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
          style={{ background: t.status === "issued" ? "#FFFBEB" : "#F0FDF4", border: `1px solid ${t.status === "issued" ? "#fde68a" : "#bbf7d0"}` }}>
          {t.status === "issued" ? "📤" : "📥"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate"><HL text={t.bookTitle} query={q} /></p>
          <p className="text-xs text-gray-400 truncate"><HL text={t.studentName || t.borrowerName || ""} query={q} />{days !== null ? ` · ${days}d ago` : ""}</p>
        </div>
        <span className={`flex-shrink-0 px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${isOverdue ? "bg-red-100 text-red-700" : t.status === "issued" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
          {isOverdue ? "⚠️ Overdue" : t.status === "issued" ? "Issued" : "Returned"}
        </span>
      </button>
    );
  };

  const AllResults = () => {
    const sections = [
      { key: "books", label: "📚 Books", results: bookResults, Row: ({ item }) => <BookRow b={item} /> },
      { key: "students", label: "🎓 Students", results: studentResults, Row: ({ item }) => <StudentRow s={item} /> },
      { key: "staff", label: "👩‍🏫 Staff", results: staffResults, Row: ({ item }) => <StaffRow s={item} /> },
      { key: "transactions", label: "📋 Transactions", results: txnResults, Row: ({ item }) => <TxnRow t={item} /> },
    ].filter((s) => s.results.length > 0);

    return (
      <div>
        {sections.map(({ key, label, results, Row }) => (
          <div key={key}>
            <SectionLabel icon={label.split(" ")[0]} label={label.slice(3)} count={results.length} />
            {results.slice(0, 3).map((item) => <Row key={item.id} item={item} />)}
            {results.length > 3 && (
              <button onMouseDown={(e) => { e.preventDefault(); setActiveTab(key); }}
                className="w-full px-4 py-2 text-xs text-blue-600 font-semibold text-center hover:bg-blue-50 transition border-b border-blue-50">
                +{results.length - 3} more in {label} →
              </button>
            )}
          </div>
        ))}
      </div>
    );
  };

  const CategoryResults = () => {
    const map = {
      books:        { results: bookResults,    Row: ({ item }) => <BookRow    b={item} />, empty: "No books"        },
      students:     { results: studentResults, Row: ({ item }) => <StudentRow s={item} />, empty: "No students"     },
      staff:        { results: staffResults,   Row: ({ item }) => <StaffRow   s={item} />, empty: "No staff"        },
      transactions: { results: txnResults,     Row: ({ item }) => <TxnRow     t={item} />, empty: "No transactions" },
    };
    const { results, Row, empty } = map[activeTab];
    if (results.length === 0) return (
      <div className="px-4 py-8 text-center">
        <p className="text-2xl mb-2">🔍</p>
        <p className="text-sm font-semibold text-gray-600">{empty} found for "{q}"</p>
        <p className="text-xs text-gray-400 mt-1">{idMode ? "ID must match exactly" : "Try different keywords"}</p>
      </div>
    );
    return (
      <div>
        {results.map((item) => <Row key={item.id} item={item} />)}
        {results.length >= 50 && (
          <div className="px-4 py-2 text-center border-t border-blue-100" style={{ background: "rgba(219,234,254,0.3)" }}>
            <p className="text-xs text-blue-500">Showing top 50 — type more to narrow down</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={containerRef} className="relative mb-6">
      <div className={`bg-white transition-all duration-200 ${open ? "rounded-t-2xl shadow-lg" : "rounded-2xl shadow-sm"} border ${open ? "border-blue-400 border-b-0 ring-2 ring-blue-100" : "border-gray-200"}`}>
        <div className="flex items-center gap-3 px-5 py-3.5">
          <svg className={`w-5 h-5 flex-shrink-0 transition-colors ${open ? "text-blue-500" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input ref={inputRef} type="text" value={rawQuery} onChange={(e) => handleInput(e.target.value)}
            onFocus={() => { if (rawQuery.trim().length >= 2) { setOpen(true); requestAnimationFrame(() => setReady(true)); } }}
            placeholder="Search students, staff, books, transactions…"
            className="flex-1 text-sm text-gray-800 placeholder-gray-400 focus:outline-none bg-transparent" />
          <div className="flex items-center gap-2 flex-shrink-0">
            {open && totalCount > 0 && <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full tabular-nums">{totalCount > 150 ? "150+" : totalCount}</span>}
            {idMode && rawQuery && <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full hidden sm:block">ID</span>}
            {rawQuery ? (
              <button onMouseDown={(e) => { e.preventDefault(); handleClear(); }}
                className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition text-gray-500 text-xs">✕</button>
            ) : (
              <span className="text-xs text-gray-300 hidden sm:block select-none">min. 2 chars</span>
            )}
          </div>
        </div>
      </div>

      {rawQuery.trim().length === 1 && (
        <div className="absolute left-0 right-0 z-50 border border-t-0 border-blue-300 rounded-b-2xl bg-blue-50 px-4 py-3 text-center" style={{ boxShadow: "0 8px 24px rgba(59,130,246,0.12)" }}>
          <p className="text-xs text-blue-500 font-medium">Type at least 2 characters to search…</p>
        </div>
      )}

      {open && rawQuery.trim().length >= 2 && (
        <div className="absolute left-0 right-0 z-50 border border-t-0 border-blue-400 rounded-b-2xl overflow-hidden"
          style={{ background: "linear-gradient(180deg, #EFF6FF 0%, #EDF5FF 100%)", boxShadow: "0 12px 40px rgba(59,130,246,0.15), 0 4px 12px rgba(0,0,0,0.08)", opacity: ready ? 1 : 0, transform: ready ? "translateY(0)" : "translateY(-8px)", transition: "opacity 0.18s ease, transform 0.18s ease" }}>
          <div className="flex items-center gap-1 px-3 py-2 border-b border-blue-100 overflow-x-auto" style={{ background: "rgba(219,234,254,0.6)" }}>
            <TabBtn tab="all"          label="All"          />
            <TabBtn tab="books"        label="📚 Books"     />
            <TabBtn tab="students"     label="🎓 Students"  />
            <TabBtn tab="staff"        label="👩‍🏫 Staff"    />
            <TabBtn tab="transactions" label="📋 Txns"      />
            <div className="ml-auto flex-shrink-0">
              <button onMouseDown={(e) => { e.preventDefault(); setReady(false); setTimeout(() => setOpen(false), 200); }}
                className="text-xs text-blue-400 hover:text-blue-600 px-2 py-1 transition">Esc ✕</button>
            </div>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {!hasResults ? (
              <div className="px-4 py-8 text-center">
                <p className="text-3xl mb-2">🔍</p>
                <p className="text-sm font-semibold text-gray-600">{idMode ? `No exact match for "${q}"` : `No results for "${q}"`}</p>
                <p className="text-xs text-gray-400 mt-1">{idMode ? "PIN or Staff ID must match exactly" : "Try different keywords or check spelling"}</p>
              </div>
            ) : activeTab === "all" ? <AllResults /> : <CategoryResults />}
          </div>
          <div className="px-4 py-2 text-center border-t border-blue-100" style={{ background: "rgba(219,234,254,0.3)" }}>
            <p className="text-xs text-blue-400">Click a result to navigate · Esc to close</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TRANSACTION TABLE
// ═══════════════════════════════════════════════════════════════════════
function TransactionTable({ transactions, onViewIssued }) {
  const [typeFilter,   setTypeFilter]   = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [limit,        setLimit]        = useState(20);

  let filtered = [...transactions].sort((a, b) => (b.issueDate?.seconds || 0) - (a.issueDate?.seconds || 0));
  if (typeFilter   !== "all") filtered = filtered.filter((t) => (t.borrowerType || "student") === typeFilter);
  if (statusFilter !== "all") filtered = filtered.filter((t) => t.status === statusFilter);

  const shown   = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;

  const ACTIVE = { background: "linear-gradient(135deg, #0D1F4E, #1B4332)", color: "white" };
  const pill = (active) => `px-2.5 py-1 rounded-md text-xs font-semibold transition ${active ? "" : "text-gray-500 hover:text-gray-700"}`;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex flex-col gap-3 px-5 py-4 border-b border-gray-100" style={{ background: "linear-gradient(135deg, #0D1F4E08, #1B433208)" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">
            Recent Transactions
            <span className="ml-2 text-xs font-normal text-gray-400">{shown.length} of {filtered.length}</span>
          </h2>
          <button onClick={onViewIssued} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ color: "#0D1F4E", background: "#EEF2FF" }}>View All Issued →</button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-0.5">
            {[{ key:"all",label:"All Types"},{ key:"student",label:"🎓 Students"},{ key:"staff",label:"👩‍🏫 Staff"}].map(({ key, label }) => (
              <button key={key} onClick={() => { setTypeFilter(key); setLimit(20); }} className={pill(typeFilter === key)} style={typeFilter === key ? ACTIVE : {}}>{label}</button>
            ))}
          </div>
          <span className="text-gray-300 text-lg select-none hidden sm:block">·</span>
          <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-0.5">
            {[{ key:"all",label:"All Status"},{ key:"issued",label:"📤 Issued"},{ key:"returned",label:"📥 Returned"}].map(({ key, label }) => (
              <button key={key} onClick={() => { setStatusFilter(key); setLimit(20); }} className={pill(statusFilter === key)} style={statusFilter === key ? ACTIVE : {}}>{label}</button>
            ))}
          </div>
          {(typeFilter !== "all" || statusFilter !== "all") && (
            <button onClick={() => { setTypeFilter("all"); setStatusFilter("all"); setLimit(20); }} className="text-xs text-red-500 hover:underline font-medium px-2">Clear</button>
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-gray-500 font-medium text-sm">No transactions found</p>
          {(typeFilter !== "all" || statusFilter !== "all") && (
            <button onClick={() => { setTypeFilter("all"); setStatusFilter("all"); }} className="mt-2 text-xs text-blue-600 hover:underline">Clear filters</button>
          )}
        </div>
      ) : (
        <>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: "#f8f9fa" }}>
                <tr className="text-left border-b border-gray-100">
                  {["Book","Borrower","Type","Status","Date","Days"].map((h) => (
                    <th key={h} className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {shown.map((t) => {
                  const days = t.issueDate?.toDate ? Math.floor((Date.now() - t.issueDate.toDate()) / 86400000) : null;
                  const isOverdue = days !== null && days > 14 && t.status === "issued";
                  return (
                    <tr key={t.id} className={`transition ${isOverdue ? "bg-red-50/40" : "hover:bg-gray-50"}`}>
                      <td className="px-5 py-3 font-medium text-gray-800 max-w-xs truncate">{t.bookTitle}</td>
                      <td className="px-5 py-3 text-gray-600">{t.studentName || t.borrowerName}</td>
                      <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${(t.borrowerType||"student")==="staff"?"bg-indigo-100 text-indigo-700":"bg-blue-50 text-blue-700"}`}>{(t.borrowerType||"student")==="staff"?"Staff":"Student"}</span></td>
                      <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${t.status==="issued"?"bg-amber-100 text-amber-700":"bg-green-100 text-green-700"}`}>{t.status}</span></td>
                      <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap">{t.issueDate?.toDate ? t.issueDate.toDate().toLocaleDateString("en-IN") : "—"}</td>
                      <td className="px-5 py-3 text-xs">{days !== null ? <span className={isOverdue ? "text-red-600 font-bold" : "text-gray-400"}>{days}d {isOverdue ? "⚠️" : ""}</span> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="sm:hidden divide-y divide-gray-100">
            {shown.map((t) => {
              const days = t.issueDate?.toDate ? Math.floor((Date.now() - t.issueDate.toDate()) / 86400000) : null;
              return (
                <div key={t.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">{t.bookTitle}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t.studentName || t.borrowerName}{days !== null ? ` · ${days}d` : ""}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 whitespace-nowrap ${t.status==="issued"?"bg-amber-100 text-amber-700":"bg-green-100 text-green-700"}`}>{t.status}</span>
                </div>
              );
            })}
          </div>
          {hasMore && (
            <div className="px-5 py-4 border-t border-gray-100 text-center" style={{ background: "#fafbff" }}>
              <button onClick={() => setLimit((l) => l + 20)}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold border border-blue-200 text-blue-700 hover:bg-blue-50 transition">
                View more transactions
                <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold">{filtered.length - limit} remaining</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════
export default function AdminDashboard() {
  const [books,        setBooks]        = useState([]);
  const [students,     setStudents]     = useState([]);
  const [staff,        setStaff]        = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [modal,        setModal]        = useState(null);
  const [refreshKey,   setRefreshKey]   = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const u1 = listenToBooks(setBooks);
    const u2 = listenToStudents(setStudents);
    const u3 = listenToTransactions(setTransactions);
    const u4 = listenToStaff(setStaff);
    return () => { u1(); u2(); u3(); u4(); };
  }, [refreshKey]);

  const issuedTxns     = transactions.filter((t) => t.status === "issued");
  const returnedTxns   = transactions.filter((t) => t.status === "returned");
  const availableBooks = books.filter((b) => b.available);

  // Computed "true available" = total - currently issued (for display consistency)
  const trueAvailable  = books.length - issuedTxns.length;
  const hasIntegrityIssue = availableBooks.length !== trueAvailable && trueAvailable >= 0;

  const MODALS = {
    totalBooks: { title: "All Books", icon: "📚",
      items: [...books].sort((a, b) => (a.title||"").localeCompare(b.title||"")),
      columns: [
        { key: "accessionNo", label: "Accession", mono: true },
        { key: "title",       label: "Title" },
        { key: "author",      label: "Author" },
        { key: "available",   label: "Status", render: (b) => (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${b.available?"bg-green-100 text-green-700":"bg-red-100 text-red-700"}`}>
            {b.available ? "Available" : "Issued"}
          </span>
        )},
      ],
    },
    available: { title: "Available Books", icon: "✅",
      items: availableBooks,
      columns: [
        { key: "accessionNo", label: "Accession", mono: true },
        { key: "title",       label: "Title" },
        { key: "author",      label: "Author" },
        { key: "subject",     label: "Subject" },
      ],
    },
    issued: { title: "Currently Issued", icon: "📤",
      items: issuedTxns,
      columns: [
        { key: "bookTitle",  label: "Book" },
        { key: "studentName",label: "Borrower" },
        { key: "studentPin", label: "ID/PIN", mono: true },
        { key: "issueDate",  label: "Issued", render: (t) => t.issueDate?.toDate ? t.issueDate.toDate().toLocaleDateString("en-IN") : "—" },
        { key: "days",       label: "Days",   render: (t) => {
          if (!t.issueDate?.toDate) return "—";
          const d = Math.floor((Date.now() - t.issueDate.toDate()) / 86400000);
          return <span className={d > 14 ? "text-red-600 font-bold" : "text-gray-600"}>{d}d {d > 14 ? "⚠️" : ""}</span>;
        }},
      ],
    },
    returned: { title: "Returned Books", icon: "📥",
      items: returnedTxns,
      columns: [
        { key: "bookTitle",  label: "Book" },
        { key: "studentName",label: "Borrower" },
        { key: "issueDate",  label: "Issued",   render: (t) => t.issueDate?.toDate  ? t.issueDate.toDate().toLocaleDateString("en-IN")  : "—" },
        { key: "returnDate", label: "Returned", render: (t) => t.returnDate?.toDate ? t.returnDate.toDate().toLocaleDateString("en-IN") : "—" },
      ],
    },
    students: { title: "All Students", icon: "🎓",
      items: [...students].sort((a, b) => (a.pin||"").localeCompare(b.pin||"")),
      columns: [
        { key: "pin",    label: "PIN",    mono: true },
        { key: "name",   label: "Name" },
        { key: "branch", label: "Branch" },
        { key: "year",   label: "Year" },
      ],
    },
    staff: { title: "All Staff", icon: "👩‍🏫",
      items: [...staff].sort((a, b) => (a.name||"").localeCompare(b.name||"")),
      columns: [
        { key: "staffId",     label: "CMS ID",      mono: true },
        { key: "name",        label: "Name" },
        { key: "designation", label: "Designation" },
        { key: "section",     label: "Section" },
      ],
    },
  };

  const activeModal = modal ? MODALS[modal] : null;
  const ACTIVE_STYLE = { background: "linear-gradient(135deg, #0D1F4E, #1B4332)", boxShadow: "0 4px 15px rgba(13,31,78,0.2)" };

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" className="w-10 h-10 rounded-full object-cover border-2 hidden sm:block" style={{ borderColor: "#C9A227" }} />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Library Dashboard</h1>
            <p className="text-gray-400 text-xs mt-0.5">
              Govt. Polytechnic Anakapalli ·{" "}
              {new Date().toLocaleDateString("en-IN", { weekday:"long", year:"numeric", month:"long", day:"numeric" })}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate("/admin/issue")} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold transition" style={ACTIVE_STYLE}>➕ Issue Book</button>
          <button onClick={() => navigate("/admin/return")} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold transition" style={{ background: "linear-gradient(135deg, #b45309, #d97706)", boxShadow: "0 4px 15px rgba(180,83,9,0.2)" }}>↩️ Return</button>
        </div>
      </div>

      {/* ── Data Integrity Warning ── */}
      {hasIntegrityIssue && (
        <DataIntegrityBanner
          books={books}
          issuedTxns={issuedTxns}
          onFixed={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard icon="📚" label="Total Books"  value={books.length}         subtitle={`${trueAvailable} available`}  accent="blue"   onClick={() => setModal("totalBooks")} />
        <StatCard icon="✅" label="Available"     value={trueAvailable}        subtitle="Total − Issued"                 accent="green"  onClick={() => setModal("available")}  />
        <StatCard icon="📤" label="Issued"        value={issuedTxns.length}    subtitle="Currently out"                  accent="gold"   onClick={() => setModal("issued")}     />
        <StatCard icon="📥" label="Returned"      value={returnedTxns.length}  subtitle="All time"                       accent="indigo" onClick={() => setModal("returned")}   />
        <StatCard icon="🎓" label="Students"      value={students.length}      subtitle="Registered"                     accent="green"  onClick={() => setModal("students")}   />
        <StatCard icon="👩‍🏫" label="Staff"        value={staff.length}         subtitle="Members"                        accent="blue"   onClick={() => setModal("staff")}      />
      </div>

      {/* Universal Search */}
      <UniversalSearch
        students={students} staff={staff} books={books} transactions={transactions}
        onNavigate={(path, state) => navigate(path, { state })}
      />

      {/* Transactions */}
      <TransactionTable transactions={transactions} onViewIssued={() => setModal("issued")} />

      {activeModal && <QuickViewModal {...activeModal} onClose={() => setModal(null)} />}
    </AdminLayout>
  );
}