import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { listenToTransactions } from "../../firebase/firestore";
import { smartSearch } from "../../utils/searchUtils";

const PERIODS = [
  { key: "today",   label: "Today"      },
  { key: "week",    label: "This Week"  },
  { key: "month",   label: "This Month" },
  { key: "6months", label: "6 Months"  },
  { key: "year",    label: "This Year"  },
  { key: "3years",  label: "3 Years"   },
  { key: "custom",  label: "Custom Range" },
];

const DAYS_FILTERS = [
  { key: "all",    label: "Any Duration" },
  { key: "today",  label: "Issued Today" },
  { key: "1-7",    label: "1–7 Days"    },
  { key: "8-14",   label: "8–14 Days"   },
  { key: "15-30",  label: "15–30 Days (Overdue)" },
  { key: "30+",    label: "30+ Days"    },
];

function getDateRange(period, customStart, customEnd) {
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
  const issueDate  = t.issueDate.toDate();
  const returnDate = t.returnDate?.toDate ? t.returnDate.toDate() : new Date();
  return Math.floor((returnDate - issueDate) / 86400000);
}

function matchesDaysFilter(t, daysFilter) {
  if (daysFilter === "all") return true;
  const days = getDaysHeld(t);
  if (days === null) return false;
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const issuedToday = t.issueDate?.toDate && t.issueDate.toDate() >= todayStart;
  switch (daysFilter) {
    case "today":  return issuedToday;
    case "1-7":    return days >= 1  && days <= 7;
    case "8-14":   return days >= 8  && days <= 14;
    case "15-30":  return days >= 15 && days <= 30;
    case "30+":    return days > 30;
    default:       return true;
  }
}

function downloadCSV(data, filename) {
  const headers = ["#", "Book", "Accession", "Borrower", "ID", "Type", "Issued", "Returned", "Status", "Days"];
  const rows = data.map((t, i) => {
    const issueDate  = t.issueDate?.toDate  ? t.issueDate.toDate()  : null;
    const returnDate = t.returnDate?.toDate ? t.returnDate.toDate() : null;
    const days = issueDate ? Math.floor(((returnDate || new Date()) - issueDate) / 86400000) : "";
    return [
      i + 1,
      t.bookTitle || "",
      t.barcode || "",
      t.studentName || t.borrowerName || "",
      t.studentPin  || t.borrowerId   || "",
      t.borrowerType || "student",
      issueDate  ? issueDate.toLocaleDateString("en-IN")  : "",
      returnDate ? returnDate.toLocaleDateString("en-IN") : "",
      t.status || "",
      days,
    ];
  });
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const [allTxns, setAllTxns]           = useState([]);
  const [period, setPeriod]             = useState("month");
  const [customStart, setCustomStart]   = useState("");
  const [customEnd, setCustomEnd]       = useState("");
  const [specificDate, setSpecificDate] = useState(""); // exact single date
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter]     = useState("all");
  const [daysFilter, setDaysFilter]     = useState("all");
  const [searchTerm, setSearchTerm]     = useState("");

  useEffect(() => {
    const unsub = listenToTransactions(setAllTxns);
    return () => unsub();
  }, []);

  // ── Apply period filter ───────────────────────────────────────────────
  const { start, end } = getDateRange(period, customStart, customEnd);

  let filtered = allTxns.filter((t) => {
    if (!t.issueDate?.toDate) return false;
    const d = t.issueDate.toDate();

    // If specific date is set, override period filter
    if (specificDate) {
      const sd = new Date(specificDate + "T00:00:00");
      const ed = new Date(specificDate + "T23:59:59");
      return d >= sd && d <= ed;
    }

    if (start && d < start) return false;
    if (d > end) return false;
    return true;
  });

  // ── Apply other filters ───────────────────────────────────────────────
  if (statusFilter !== "all") filtered = filtered.filter((t) => t.status === statusFilter);
  if (typeFilter   !== "all") filtered = filtered.filter((t) => (t.borrowerType || "student") === typeFilter);
  if (daysFilter   !== "all") filtered = filtered.filter((t) => matchesDaysFilter(t, daysFilter));

  // ── Smart search ──────────────────────────────────────────────────────
  if (searchTerm.trim()) {
    filtered = smartSearch(filtered, searchTerm, [
      "bookTitle", "studentName", "borrowerName", "studentPin", "borrowerId", "barcode",
    ]);
  }

  filtered = filtered.sort((a, b) => (b.issueDate?.seconds || 0) - (a.issueDate?.seconds || 0));

  const totalIssued   = filtered.filter((t) => t.status === "issued").length;
  const totalReturned = filtered.filter((t) => t.status === "returned").length;
  const totalOverdue  = filtered.filter((t) => {
    if (t.status !== "issued" || !t.issueDate?.toDate) return false;
    return Math.floor((Date.now() - t.issueDate.toDate()) / 86400000) > 14;
  }).length;

  const filename = `LibraryOS_Report_${period}_${new Date().toISOString().slice(0, 10)}.csv`;

  const handlePrint = () => {
    const printWindow = window.open("", "_blank", "width=1100,height=700");
    const tableRows = filtered.map((t, i) => {
      const issueDate  = t.issueDate?.toDate  ? t.issueDate.toDate()  : null;
      const returnDate = t.returnDate?.toDate ? t.returnDate.toDate() : null;
      const days = issueDate ? Math.floor(((returnDate || new Date()) - issueDate) / 86400000) : null;
      return `<tr>
        <td>${i + 1}</td>
        <td>${t.bookTitle || ""}</td>
        <td style="font-family:monospace;font-size:11px">${t.barcode || ""}</td>
        <td>${t.studentName || t.borrowerName || ""}</td>
        <td style="font-family:monospace;font-size:11px">${t.studentPin || t.borrowerId || ""}</td>
        <td>${t.borrowerType || "student"}</td>
        <td>${issueDate  ? issueDate.toLocaleDateString("en-IN")  : "—"}</td>
        <td>${returnDate ? returnDate.toLocaleDateString("en-IN") : "—"}</td>
        <td><span style="padding:2px 8px;border-radius:20px;font-size:11px;background:${t.status === "issued" ? "#fef9c3" : "#dcfce7"};color:${t.status === "issued" ? "#854d0e" : "#166534"}">${t.status}</span></td>
        <td>${days !== null ? `${days}d${days > 14 && t.status === "issued" ? " ⚠️" : ""}` : "—"}</td>
      </tr>`;
    }).join("");

    printWindow.document.write(`
      <!DOCTYPE html><html><head>
      <title>Library Report</title>
      <style>
        body{font-family:Arial,sans-serif;margin:0;padding:20px;font-size:12px}
        h2{margin:0 0 4px;font-size:16px;color:#0D1F4E}
        .meta{color:#666;font-size:11px;margin-bottom:12px}
        .stats{display:flex;gap:20px;margin-bottom:16px;padding:10px;background:#f9fafb;border-radius:8px}
        .stat{text-align:center} .stat strong{display:block;font-size:18px;font-weight:700}
        .stat span{font-size:10px;color:#6b7280}
        table{width:100%;border-collapse:collapse}
        th{background:#f3f4f6;padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e5e7eb}
        td{padding:5px 8px;border-bottom:1px solid #f3f4f6;vertical-align:middle}
        tr:hover td{background:#f9fafb}
      </style></head><body>
      <h2>📚 Library — Transaction Report</h2>
      <div class="meta">
        Printed: ${new Date().toLocaleDateString("en-IN")} &nbsp;|&nbsp; ${filtered.length} records
        ${specificDate ? ` | Date: ${specificDate}` : ""}
        ${daysFilter !== "all" ? ` | Duration: ${DAYS_FILTERS.find(d => d.key === daysFilter)?.label}` : ""}
      </div>
      <div class="stats">
        <div class="stat"><strong>${filtered.length}</strong><span>Total</span></div>
        <div class="stat"><strong style="color:#854d0e">${totalIssued}</strong><span>Issued</span></div>
        <div class="stat"><strong style="color:#166534">${totalReturned}</strong><span>Returned</span></div>
        <div class="stat"><strong style="color:#dc2626">${totalOverdue}</strong><span>Overdue</span></div>
      </div>
      <table>
        <thead><tr><th>#</th><th>Book</th><th>Accession</th><th>Borrower</th>
          <th>ID/PIN</th><th>Type</th><th>Issued</th><th>Returned</th><th>Status</th><th>Days</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  };

  const filterBtn = (active) =>
    `px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
      active ? "text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
    }`;
  const activeStyle = { background: "linear-gradient(135deg, #0D1F4E, #1B4332)" };

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Transaction Reports</h1>
          <p className="text-gray-500 text-sm mt-1">Filter, export, and print transaction data.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => downloadCSV(filtered, filename)}
            className="border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
            ⬇️ CSV
          </button>
          <button onClick={handlePrint}
            className="text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
            style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
            🖨️ Print
          </button>
        </div>
      </div>

      {/* ── Filters Panel ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6 space-y-5">

        {/* Row 1: Period */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">📅 Time Period</p>
            {specificDate && (
              <button onClick={() => setSpecificDate("")}
                className="text-xs text-red-500 hover:underline">
                ✕ Clear specific date
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {PERIODS.map((p) => (
              <button key={p.key}
                onClick={() => { setPeriod(p.key); setSpecificDate(""); }}
                className={filterBtn(period === p.key && !specificDate)}
                style={period === p.key && !specificDate ? activeStyle : {}}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom range */}
          {period === "custom" && !specificDate && (
            <div className="flex flex-col sm:flex-row gap-3 mb-3">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">From</label>
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">To</label>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          )}

          {/* Specific single date */}
          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            <span className="text-xs font-semibold text-gray-500 flex-shrink-0">📌 Specific Date:</span>
            <input type="date" value={specificDate}
              onChange={(e) => setSpecificDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {specificDate && (
              <span className="text-xs text-blue-600 font-medium">
                Showing transactions for {new Date(specificDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            )}
          </div>
        </div>

        {/* Row 2: Status + Type */}
        <div className="flex flex-wrap gap-4 pt-4 border-t border-gray-100">
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Status</p>
            <div className="flex gap-2">
              {[
                { key: "all",      label: "All"      },
                { key: "issued",   label: "📤 Issued"   },
                { key: "returned", label: "📥 Returned" },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setStatusFilter(key)}
                  className={filterBtn(statusFilter === key)}
                  style={statusFilter === key ? activeStyle : {}}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Type</p>
            <div className="flex gap-2">
              {[
                { key: "all",     label: "All"         },
                { key: "student", label: "🎓 Students" },
                { key: "staff",   label: "👩‍🏫 Staff"   },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setTypeFilter(key)}
                  className={filterBtn(typeFilter === key)}
                  style={typeFilter === key ? activeStyle : {}}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Row 3: Days held filter */}
        <div className="pt-4 border-t border-gray-100">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
            ⏱️ Duration (Days Held)
          </p>
          <div className="flex flex-wrap gap-2">
            {DAYS_FILTERS.map(({ key, label }) => (
              <button key={key} onClick={() => setDaysFilter(key)}
                className={filterBtn(daysFilter === key)}
                style={daysFilter === key
                  ? key === "15-30" || key === "30+"
                    ? { background: "linear-gradient(135deg, #dc2626, #b91c1c)" }
                    : activeStyle
                  : {}}>
                {label}
              </button>
            ))}
          </div>
          {daysFilter === "15-30" && (
            <p className="text-xs text-red-500 mt-1.5 font-medium">
              ⚠️ Showing overdue records (15–30 days)
            </p>
          )}
          {daysFilter === "30+" && (
            <p className="text-xs text-red-600 mt-1.5 font-bold">
              🚨 Showing severely overdue records (30+ days)
            </p>
          )}
        </div>

        {/* Row 4: Search */}
        <div className="pt-4 border-t border-gray-100">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input type="text" placeholder="Search by book, borrower, ID, or accession..."
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full border border-gray-200 rounded-lg pl-8 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total",    value: filtered.length,  color: "text-blue-600",  bg: "bg-blue-50"  },
          { label: "Issued",   value: totalIssued,       color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Returned", value: totalReturned,     color: "text-green-600", bg: "bg-green-50" },
          { label: "Overdue",  value: totalOverdue,      color: "text-red-600",   bg: "bg-red-50"   },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-xl p-4 text-center border border-gray-100`}>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-gray-500 font-medium text-sm">No records found</p>
            <p className="text-gray-400 text-xs mt-1">Try adjusting the filters above.</p>
            <button
              onClick={() => {
                setPeriod("month"); setStatusFilter("all"); setTypeFilter("all");
                setDaysFilter("all"); setSearchTerm(""); setSpecificDate("");
                setCustomStart(""); setCustomEnd("");
              }}
              className="mt-3 text-xs text-blue-600 hover:underline font-medium">
              Clear all filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: "#f8f9fa" }}>
                <tr className="text-left border-b border-gray-100">
                  {["#", "Book", "Accession", "Borrower", "ID/PIN", "Type", "Issued", "Returned", "Days", "Status"].map((h) => (
                    <th key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((t, i) => {
                  const issueDate  = t.issueDate?.toDate  ? t.issueDate.toDate()  : null;
                  const returnDate = t.returnDate?.toDate ? t.returnDate.toDate() : null;
                  const days = issueDate ? Math.floor(((returnDate || new Date()) - issueDate) / 86400000) : null;
                  const isOverdue = days !== null && days > 14 && t.status === "issued";
                  return (
                    <tr key={t.id} className={`transition ${isOverdue ? "bg-red-50/50" : "hover:bg-gray-50"}`}>
                      <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-800 max-w-xs truncate">{t.bookTitle}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{t.barcode}</td>
                      <td className="px-4 py-3 text-gray-600">{t.studentName || t.borrowerName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 hidden sm:table-cell">
                        {t.studentPin || t.borrowerId}
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
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {issueDate ? issueDate.toLocaleDateString("en-IN") : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 hidden sm:table-cell">
                        {returnDate ? returnDate.toLocaleDateString("en-IN") : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {days !== null ? (
                          <span className={isOverdue ? "text-red-600 font-bold" : "text-gray-500"}>
                            {days}d {isOverdue ? "⚠️" : ""}
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