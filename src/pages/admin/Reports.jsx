import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { listenToTransactions } from "../../firebase/firestore";

const MIN_DATE = "2008-01-01";
function todayStr() { return new Date().toISOString().slice(0, 10); }

const PERIODS = [
  { key: "today",   label: "Today"       },
  { key: "week",    label: "This Week"   },
  { key: "month",   label: "This Month"  },
  { key: "6months", label: "6 Months"   },
  { key: "year",    label: "This Year"   },
  { key: "3years",  label: "3 Years"    },
  { key: "custom",  label: "Custom"      },
];

function getDateRange(period, customStart, customEnd, specificDate) {
  if (specificDate) {
    return {
      start: new Date(specificDate + "T00:00:00"),
      end:   new Date(specificDate + "T23:59:59"),
    };
  }
  const now = new Date();
  const end = customEnd ? new Date(customEnd + "T23:59:59") : new Date();
  let start;
  switch (period) {
    case "today":   start = new Date(); start.setHours(0,0,0,0); break;
    case "week":    start = new Date(now - 7   * 86400000); break;
    case "month":   start = new Date(now - 30  * 86400000); break;
    case "6months": start = new Date(now - 180 * 86400000); break;
    case "year":    start = new Date(now - 365 * 86400000); break;
    case "3years":  start = new Date(now - 3 * 365 * 86400000); break;
    case "custom":  start = customStart ? new Date(customStart + "T00:00:00") : null; break;
    default:        start = null;
  }
  return { start, end };
}

function getDaysHeld(t) {
  if (!t.issueDate?.toDate) return null;
  const issue  = t.issueDate.toDate();
  const ret    = t.returnDate?.toDate ? t.returnDate.toDate() : new Date();
  return Math.floor((ret - issue) / 86400000);
}

function downloadCSV(data, filename) {
  const headers = ["#","Book","Accession","Borrower","ID","Type","Issued","Returned","Status","Days"];
  const rows = data.map((t, i) => {
    const issueDate  = t.issueDate?.toDate  ? t.issueDate.toDate()  : null;
    const returnDate = t.returnDate?.toDate ? t.returnDate.toDate() : null;
    const days = issueDate ? Math.floor(((returnDate || new Date()) - issueDate) / 86400000) : "";
    return [i+1, t.bookTitle||"", t.barcode||"", t.studentName||t.borrowerName||"", t.studentPin||t.borrowerId||"",
      t.borrowerType||"student", issueDate?issueDate.toLocaleDateString("en-IN"):"",
      returnDate?returnDate.toLocaleDateString("en-IN"):"", t.status||"", days];
  });
  const csv = [headers,...rows].map((r)=>r.map((c)=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
}

// Active filter count for badge
function countActiveFilters(statusFilter, typeFilter, daysFilter, searchTerm, specificDate) {
  let n = 0;
  if (statusFilter !== "all") n++;
  if (typeFilter   !== "all") n++;
  if (daysFilter   !== "all") n++;
  if (searchTerm.trim())      n++;
  if (specificDate)           n++;
  return n;
}

export default function Reports() {
  const [allTxns, setAllTxns]           = useState([]);
  const [period, setPeriod]             = useState("month");
  const [customStart, setCustomStart]   = useState("");
  const [customEnd, setCustomEnd]       = useState("");
  const [specificDate, setSpecificDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter]     = useState("all");
  const [daysFilter, setDaysFilter]     = useState("all");
  const [searchTerm, setSearchTerm]     = useState("");
  const [showFilters, setShowFilters]   = useState(false);

  useEffect(() => {
    const unsub = listenToTransactions(setAllTxns);
    return () => unsub();
  }, []);

  const { start, end } = getDateRange(period, customStart, customEnd, specificDate);

  let filtered = allTxns.filter((t) => {
    if (!t.issueDate?.toDate) return false;
    const d = t.issueDate.toDate();
    if (start && d < start) return false;
    if (d > end) return false;
    return true;
  });

  if (statusFilter !== "all") filtered = filtered.filter((t) => t.status === statusFilter);
  if (typeFilter   !== "all") filtered = filtered.filter((t) => (t.borrowerType || "student") === typeFilter);
  if (daysFilter   !== "all") {
    filtered = filtered.filter((t) => {
      const days = getDaysHeld(t);
      if (days === null) return false;
      switch (daysFilter) {
        case "0-7":   return days >= 0  && days <= 7;
        case "8-14":  return days >= 8  && days <= 14;
        case "15-30": return days >= 15 && days <= 30;
        case "30+":   return days > 30;
        default:      return true;
      }
    });
  }
  if (searchTerm.trim()) {
    const q = searchTerm.toLowerCase();
    filtered = filtered.filter((t) =>
      t.bookTitle?.toLowerCase().includes(q) ||
      (t.studentName||t.borrowerName||"").toLowerCase().includes(q) ||
      (t.studentPin||t.borrowerId||"").toLowerCase().includes(q) ||
      t.barcode?.toLowerCase().includes(q)
    );
  }

  filtered = filtered.sort((a, b) => (b.issueDate?.seconds || 0) - (a.issueDate?.seconds || 0));

  const totalIssued   = filtered.filter((t) => t.status === "issued").length;
  const totalReturned = filtered.filter((t) => t.status === "returned").length;
  const totalOverdue  = filtered.filter((t) => {
    if (t.status !== "issued" || !t.issueDate?.toDate) return false;
    return Math.floor((Date.now() - t.issueDate.toDate()) / 86400000) > 14;
  }).length;

  const activeFilters = countActiveFilters(statusFilter, typeFilter, daysFilter, searchTerm, specificDate);
  const filename = `Library_Report_${period}_${new Date().toISOString().slice(0,10)}.csv`;

  const clearAllFilters = () => {
    setStatusFilter("all"); setTypeFilter("all");
    setDaysFilter("all"); setSearchTerm(""); setSpecificDate("");
  };

  const handlePrint = () => {
    const w = window.open("", "_blank", "width=1100,height=700");
    const rows = filtered.map((t, i) => {
      const id = t.issueDate?.toDate ? t.issueDate.toDate() : null;
      const rd = t.returnDate?.toDate ? t.returnDate.toDate() : null;
      const days = id ? Math.floor(((rd||new Date())-id)/86400000) : null;
      return `<tr>
        <td>${i+1}</td><td>${t.bookTitle||""}</td>
        <td style="font-family:monospace;font-size:11px">${t.barcode||""}</td>
        <td>${t.studentName||t.borrowerName||""}</td>
        <td style="font-family:monospace;font-size:11px">${t.studentPin||t.borrowerId||""}</td>
        <td>${t.borrowerType||"student"}</td>
        <td>${id?id.toLocaleDateString("en-IN"):"—"}</td>
        <td>${rd?rd.toLocaleDateString("en-IN"):"—"}</td>
        <td><span style="padding:2px 8px;border-radius:20px;font-size:11px;background:${t.status==="issued"?"#fef9c3":"#dcfce7"};color:${t.status==="issued"?"#854d0e":"#166534"}">${t.status}</span></td>
        <td>${days!==null?`${days}d${days>14&&t.status==="issued"?" ⚠️":""}`:"—"}</td>
      </tr>`;
    }).join("");
    w.document.write(`<!DOCTYPE html><html><head><title>Library Report</title><style>
      body{font-family:Arial,sans-serif;margin:0;padding:20px;font-size:12px}
      h2{margin:0 0 4px;font-size:16px;color:#0D1F4E}.meta{color:#666;font-size:11px;margin-bottom:12px}
      .stats{display:flex;gap:20px;margin-bottom:16px;padding:10px;background:#f9fafb;border-radius:8px}
      .stat{text-align:center}.stat strong{display:block;font-size:18px;font-weight:700}.stat span{font-size:10px;color:#6b7280}
      table{width:100%;border-collapse:collapse}
      th{background:#f3f4f6;padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e5e7eb}
      td{padding:5px 8px;border-bottom:1px solid #f3f4f6;vertical-align:middle}
    </style></head><body>
    <h2>📚 Library — Transaction Report</h2>
    <div class="meta">Printed: ${new Date().toLocaleDateString("en-IN")} · ${filtered.length} records</div>
    <div class="stats">
      <div class="stat"><strong>${filtered.length}</strong><span>Total</span></div>
      <div class="stat"><strong style="color:#854d0e">${totalIssued}</strong><span>Issued</span></div>
      <div class="stat"><strong style="color:#166534">${totalReturned}</strong><span>Returned</span></div>
      <div class="stat"><strong style="color:#dc2626">${totalOverdue}</strong><span>Overdue</span></div>
    </div>
    <table><thead><tr><th>#</th><th>Book</th><th>Accession</th><th>Borrower</th><th>ID/PIN</th><th>Type</th><th>Issued</th><th>Returned</th><th>Status</th><th>Days</th></tr></thead>
    <tbody>${rows}</tbody></table></body></html>`);
    w.document.close(); w.focus();
    setTimeout(() => { w.print(); w.close(); }, 500);
  };

  // ── Pill button style ──────────────────────────────────────────────
  const pill = (active, danger = false) =>
    `px-3.5 py-1.5 rounded-full text-xs font-semibold transition border ${
      active
        ? danger
          ? "bg-red-600 text-white border-red-600"
          : "text-white border-transparent"
        : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
    }`;
  const activeStyle    = { background: "linear-gradient(135deg, #0D1F4E, #1B4332)" };
  const activeDanger   = {};

  return (
    <AdminLayout>
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Transaction Reports</h1>
          <p className="text-gray-500 text-sm mt-1">
            Showing <span className="font-semibold text-gray-700">{filtered.length}</span> transactions
            {specificDate
              ? ` on ${new Date(specificDate).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })}`
              : ` · ${PERIODS.find(p=>p.key===period)?.label}`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => downloadCSV(filtered, filename)}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium transition">
            ⬇️ CSV
          </button>
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
            style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
            🖨️ Print
          </button>
        </div>
      </div>

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Total",    value: filtered.length,  color: "text-blue-700",  bg: "bg-blue-50",  border: "border-blue-100"  },
          { label: "Issued",   value: totalIssued,       color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-100" },
          { label: "Returned", value: totalReturned,     color: "text-green-700", bg: "bg-green-50", border: "border-green-100" },
          { label: "Overdue",  value: totalOverdue,      color: "text-red-700",   bg: "bg-red-50",   border: "border-red-100"   },
        ].map(({ label, value, color, bg, border }) => (
          <div key={label} className={`${bg} border ${border} rounded-xl p-4 flex items-center gap-3`}>
            <div>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Period Selector (always visible, compact) ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wide mr-1">Period:</span>
          {PERIODS.map((p) => (
            <button key={p.key}
              onClick={() => { setPeriod(p.key); setSpecificDate(""); }}
              className={pill(period === p.key && !specificDate)}
              style={period === p.key && !specificDate ? activeStyle : {}}>
              {p.label}
            </button>
          ))}

          {/* Specific Date inline */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-gray-400 hidden sm:block">Date:</span>
            <input type="date" value={specificDate} min={MIN_DATE} max={todayStr()}
              onChange={(e) => setSpecificDate(e.target.value)}
              className={`border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                specificDate ? "border-blue-400 bg-blue-50 font-semibold text-blue-700" : "border-gray-200 text-gray-600"
              }`} />
            {specificDate && (
              <button onClick={() => setSpecificDate("")}
                className="text-xs text-red-500 hover:underline font-medium">
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Custom range (shown inline when custom selected) */}
        {period === "custom" && !specificDate && (
          <div className="flex flex-col sm:flex-row gap-3 mt-3 pt-3 border-t border-gray-100">
            <div className="flex-1 flex items-center gap-2">
              <label className="text-xs text-gray-500 w-8 flex-shrink-0">From</label>
              <input type="date" value={customStart} min={MIN_DATE} max={todayStr()}
                onChange={(e) => { setCustomStart(e.target.value); if (customEnd && customEnd < e.target.value) setCustomEnd(e.target.value); }}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex-1 flex items-center gap-2">
              <label className="text-xs text-gray-500 w-8 flex-shrink-0">To</label>
              <input type="date" value={customEnd} min={customStart || MIN_DATE} max={todayStr()}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        )}
      </div>

      {/* ── Filters toggle row ── */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition border ${
            showFilters || activeFilters > 0
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"
          }`}>
          <span>{showFilters ? "▲" : "▼"}</span>
          <span>Filters</span>
          {activeFilters > 0 && (
            <span className="ml-1 bg-white/25 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
              {activeFilters}
            </span>
          )}
        </button>

        {/* Active filter chips */}
        {statusFilter !== "all" && (
          <span className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full font-medium">
            {statusFilter === "issued" ? "📤 Issued" : "📥 Returned"}
            <button onClick={() => setStatusFilter("all")} className="ml-1 hover:text-blue-900">✕</button>
          </span>
        )}
        {typeFilter !== "all" && (
          <span className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full font-medium">
            {typeFilter === "student" ? "🎓 Students" : "👩‍🏫 Staff"}
            <button onClick={() => setTypeFilter("all")} className="ml-1 hover:text-indigo-900">✕</button>
          </span>
        )}
        {daysFilter !== "all" && (
          <span className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full font-medium">
            ⏱ {daysFilter} days
            <button onClick={() => setDaysFilter("all")} className="ml-1 hover:text-amber-900">✕</button>
          </span>
        )}
        {activeFilters > 0 && (
          <button onClick={clearAllFilters}
            className="text-xs text-red-500 hover:underline font-medium ml-auto">
            Clear all
          </button>
        )}
      </div>

      {/* ── Expanded Filters ── */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-5 space-y-4">

          {/* Row 1: Status + Type side by side */}
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Status</p>
              <div className="flex gap-2">
                {[
                  { key: "all",      label: "All"        },
                  { key: "issued",   label: "📤 Issued"  },
                  { key: "returned", label: "📥 Returned" },
                ].map(({ key, label }) => (
                  <button key={key} onClick={() => setStatusFilter(key)}
                    className={pill(statusFilter === key)}
                    style={statusFilter === key ? activeStyle : {}}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Borrower Type</p>
              <div className="flex gap-2">
                {[
                  { key: "all",     label: "All"         },
                  { key: "student", label: "🎓 Students" },
                  { key: "staff",   label: "👩‍🏫 Staff"   },
                ].map(({ key, label }) => (
                  <button key={key} onClick={() => setTypeFilter(key)}
                    className={pill(typeFilter === key)}
                    style={typeFilter === key ? activeStyle : {}}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Duration */}
          <div className="pt-3 border-t border-gray-50">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Duration Held</p>
            <div className="flex flex-wrap gap-2">
              {[
                { key: "all",   label: "Any"          },
                { key: "0-7",   label: "0–7 days"     },
                { key: "8-14",  label: "8–14 days"    },
                { key: "15-30", label: "15–30 days ⚠️", danger: true },
                { key: "30+",   label: "30+ days 🚨",  danger: true },
              ].map(({ key, label, danger }) => (
                <button key={key}
                  onClick={() => setDaysFilter(key)}
                  className={danger && daysFilter === key
                    ? "px-3.5 py-1.5 rounded-full text-xs font-semibold bg-red-600 text-white border border-red-600"
                    : pill(daysFilter === key)}
                  style={!danger && daysFilter === key ? activeStyle : {}}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Row 3: Search */}
          <div className="pt-3 border-t border-gray-50">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Search</p>
            <div className="relative max-w-md">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Book title, borrower name, ID, or accession..."
                className="w-full border border-gray-200 rounded-xl pl-8 pr-8 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              {searchTerm && (
                <button onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-gray-500 font-medium text-sm">No transactions found</p>
            <p className="text-gray-400 text-xs mt-1">Try adjusting the period or filters.</p>
            {activeFilters > 0 && (
              <button onClick={clearAllFilters}
                className="mt-3 text-xs text-blue-600 hover:underline font-medium">
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: "#f8f9fa" }}>
                <tr className="text-left border-b border-gray-100">
                  {["#", "Book", "Accession", "Borrower", "Type", "Issued", "Days", "Status"].map((h) => (
                    <th key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((t, i) => {
                  const issueDate  = t.issueDate?.toDate  ? t.issueDate.toDate()  : null;
                  const returnDate = t.returnDate?.toDate ? t.returnDate.toDate() : null;
                  const days    = issueDate ? Math.floor(((returnDate || new Date()) - issueDate) / 86400000) : null;
                  const isOverdue = days !== null && days > 14 && t.status === "issued";
                  return (
                    <tr key={t.id} className={`transition ${isOverdue ? "bg-red-50/40" : "hover:bg-gray-50"}`}>
                      <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-800 max-w-xs">
                        <p className="truncate">{t.bookTitle}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 hidden sm:table-cell">{t.barcode}</td>
                      <td className="px-4 py-3">
                        <p className="text-gray-700 truncate max-w-[120px]">{t.studentName || t.borrowerName}</p>
                        <p className="text-xs text-gray-400 font-mono hidden sm:block">{t.studentPin || t.borrowerId}</p>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          (t.borrowerType || "student") === "staff"
                            ? "bg-indigo-100 text-indigo-700"
                            : "bg-blue-50 text-blue-700"
                        }`}>
                          {(t.borrowerType || "student") === "staff" ? "Staff" : "Student"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {issueDate ? issueDate.toLocaleDateString("en-IN") : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {days !== null ? (
                          <span className={isOverdue ? "text-red-600 font-bold" : "text-gray-500"}>
                            {days}d{isOverdue ? " ⚠️" : ""}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          t.status === "issued"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-green-100 text-green-700"
                        }`}>
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}