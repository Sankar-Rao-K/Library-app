import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { listenToTransactions } from "../../firebase/firestore";

const PERIODS = [
  { key: "today",   label: "Today" },
  { key: "week",    label: "This Week" },
  { key: "month",   label: "This Month" },
  { key: "6months", label: "6 Months" },
  { key: "year",    label: "This Year" },
  { key: "3years",  label: "3 Years" },
  { key: "custom",  label: "Custom Range" },
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

function fmtDate(ts) {
  if (!ts?.toDate) return "—";
  return ts.toDate().toLocaleDateString("en-IN");
}

function downloadCSV(data, filename) {
  const headers = ["#","Book","Accession","Borrower","ID","Type","Issued","Returned","Status","Days"];
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
  const [allTxns, setAllTxns]         = useState([]);
  const [period, setPeriod]           = useState("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd]     = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter]   = useState("all");
  const [searchTerm, setSearchTerm]   = useState("");

  useEffect(() => {
    const unsub = listenToTransactions(setAllTxns);
    return () => unsub();
  }, []);

  const { start, end } = getDateRange(period, customStart, customEnd);

  let filtered = allTxns.filter((t) => {
    if (!t.issueDate?.toDate) return false;
    const d = t.issueDate.toDate();
    if (start && d < start) return false;
    if (d > end) return false;
    return true;
  });

  if (statusFilter !== "all") filtered = filtered.filter((t) => t.status === statusFilter);
  if (typeFilter   !== "all") filtered = filtered.filter((t) => (t.borrowerType || "student") === typeFilter);

  const q = searchTerm.toLowerCase();
  if (q) {
    filtered = filtered.filter(
      (t) =>
        t.bookTitle?.toLowerCase().includes(q)  ||
        (t.studentName || t.borrowerName || "").toLowerCase().includes(q) ||
        (t.studentPin  || t.borrowerId   || "").toLowerCase().includes(q) ||
        t.barcode?.toLowerCase().includes(q)
    );
  }

  filtered = filtered.sort((a, b) => (b.issueDate?.seconds || 0) - (a.issueDate?.seconds || 0));

  const totalIssued   = filtered.filter((t) => t.status === "issued").length;
  const totalReturned = filtered.filter((t) => t.status === "returned").length;
  const periodLabel   = PERIODS.find((p) => p.key === period)?.label || "";
  const filename      = `LibraryOS_Report_${period}_${new Date().toISOString().slice(0,10)}.csv`;

  const handlePrint = () => {
    const rows = filtered;
    const printWindow = window.open("", "_blank", "width=1100,height=700");
    const tableRows = rows.map((t, i) => {
      const issueDate  = t.issueDate?.toDate  ? t.issueDate.toDate()  : null;
      const returnDate = t.returnDate?.toDate ? t.returnDate.toDate() : null;
      const days = issueDate ? Math.floor(((returnDate || new Date()) - issueDate) / 86400000) : null;
      return `<tr>
        <td>${i+1}</td>
        <td>${t.bookTitle || ""}</td>
        <td style="font-family:monospace;font-size:11px">${t.barcode || ""}</td>
        <td>${t.studentName || t.borrowerName || ""}</td>
        <td style="font-family:monospace;font-size:11px">${t.studentPin || t.borrowerId || ""}</td>
        <td>${t.borrowerType || "student"}</td>
        <td>${issueDate  ? issueDate.toLocaleDateString("en-IN")  : "—"}</td>
        <td>${returnDate ? returnDate.toLocaleDateString("en-IN") : "—"}</td>
        <td><span style="padding:2px 8px;border-radius:20px;font-size:11px;background:${t.status==="issued"?"#fef9c3":"#dcfce7"};color:${t.status==="issued"?"#854d0e":"#166534"}">${t.status}</span></td>
        <td>${days !== null ? `${days}d${days>14&&t.status==="issued"?" ⚠️":""}` : "—"}</td>
      </tr>`;
    }).join("");

    printWindow.document.write(`
      <!DOCTYPE html><html><head>
      <title>LibraryOS Report</title>
      <style>
        body{font-family:sans-serif;margin:0;padding:20px;font-size:12px}
        h2{margin:0 0 4px;font-size:16px}
        .meta{color:#666;font-size:11px;margin-bottom:12px}
        .stats{display:flex;gap:20px;margin-bottom:16px;padding:10px;background:#f9fafb;border-radius:8px}
        .stat{text-align:center} .stat strong{display:block;font-size:18px;font-weight:700}
        .stat span{font-size:10px;color:#6b7280}
        table{width:100%;border-collapse:collapse}
        th{background:#f3f4f6;padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e5e7eb}
        td{padding:5px 8px;border-bottom:1px solid #f3f4f6;vertical-align:middle}
        tr:hover td{background:#f9fafb}
      </style></head><body>
      <h2>📚 LibraryOS — Transaction Report</h2>
      <div class="meta">
        Period: <strong>${periodLabel}</strong>
        ${customStart && customEnd ? ` (${customStart} to ${customEnd})` : ""}
        &nbsp;|&nbsp; Printed: ${new Date().toLocaleDateString("en-IN")}
        &nbsp;|&nbsp; Total: ${filtered.length} transactions
      </div>
      <div class="stats">
        <div class="stat"><strong>${filtered.length}</strong><span>Total</span></div>
        <div class="stat"><strong style="color:#854d0e">${totalIssued}</strong><span>Issued</span></div>
        <div class="stat"><strong style="color:#166534">${totalReturned}</strong><span>Returned</span></div>
      </div>
      <table>
        <thead><tr>
          <th>#</th><th>Book</th><th>Accession</th><th>Borrower</th>
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

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Transaction Reports</h1>
          <p className="text-gray-500 text-sm mt-1">Filter, view, export, and print transaction data.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => downloadCSV(filtered, filename)}
            className="border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
            ⬇️ Download CSV
          </button>
          <button onClick={handlePrint}
            className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
            🖨️ Print Report
          </button>
        </div>
      </div>

      {/* Period Selector */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
        <p className="text-sm font-semibold text-gray-700 mb-3">Select Time Period</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                period === p.key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}>
              {p.label}
            </button>
          ))}
        </div>

        {period === "custom" && (
          <div className="flex flex-col sm:flex-row gap-3 mt-2">
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

        <div className="flex flex-col sm:flex-row gap-3 mt-4 pt-4 border-t border-gray-100">
          <input type="text" placeholder="Search by book, borrower, ID..."
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">All Status</option>
            <option value="issued">Issued</option>
            <option value="returned">Returned</option>
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">All Types</option>
            <option value="student">Students Only</option>
            <option value="staff">Staff Only</option>
          </select>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total",    value: filtered.length, color: "text-blue-600",  bg: "bg-blue-50" },
          { label: "Issued",   value: totalIssued,     color: "text-yellow-600", bg: "bg-yellow-50" },
          { label: "Returned", value: totalReturned,   color: "text-green-600",  bg: "bg-green-50" },
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
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-500 font-medium">No transactions found for this period.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-gray-500 text-xs uppercase">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Book</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Accession</th>
                  <th className="px-4 py-3">Borrower</th>
                  <th className="px-4 py-3 hidden sm:table-cell">ID / PIN</th>
                  <th className="px-4 py-3 hidden md:table-cell">Type</th>
                  <th className="px-4 py-3">Issued</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Returned</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Days</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((t, i) => {
                  const issueDate  = t.issueDate?.toDate  ? t.issueDate.toDate()  : null;
                  const returnDate = t.returnDate?.toDate ? t.returnDate.toDate() : null;
                  const days = issueDate ? Math.floor(((returnDate || new Date()) - issueDate) / 86400000) : null;
                  const isStaff = (t.borrowerType === "staff");
                  return (
                    <tr key={t.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-800 max-w-xs truncate">{t.bookTitle}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 hidden sm:table-cell">{t.barcode}</td>
                      <td className="px-4 py-3 text-gray-600">{t.studentName || t.borrowerName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 hidden sm:table-cell">{t.studentPin || t.borrowerId}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          isStaff ? "bg-indigo-100 text-indigo-700" : "bg-blue-50 text-blue-700"
                        }`}>
                          {isStaff ? "Staff" : "Student"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{issueDate ? issueDate.toLocaleDateString("en-IN") : "—"}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">{returnDate ? returnDate.toLocaleDateString("en-IN") : "—"}</td>
                      <td className="px-4 py-3 text-xs hidden sm:table-cell">
                        {days !== null && (
                          <span className={days > 14 ? "text-red-500 font-bold" : "text-gray-500"}>
                            {days}d {days > 14 && t.status === "issued" ? "⚠️" : ""}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          t.status === "issued" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"
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