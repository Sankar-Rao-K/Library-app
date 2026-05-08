import { useEffect, useState, useRef } from "react";
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
    case "today":
      start = new Date(); start.setHours(0, 0, 0, 0); break;
    case "week":
      start = new Date(now - 7 * 86400000); break;
    case "month":
      start = new Date(now - 30 * 86400000); break;
    case "6months":
      start = new Date(now - 180 * 86400000); break;
    case "year":
      start = new Date(now - 365 * 86400000); break;
    case "3years":
      start = new Date(now - 3 * 365 * 86400000); break;
    case "custom":
      start = customStart ? new Date(customStart + "T00:00:00") : null;
      break;
    default:
      start = null;
  }
  return { start, end };
}

function fmtDate(ts) {
  if (!ts?.toDate) return "—";
  return ts.toDate().toLocaleDateString("en-IN");
}

function downloadCSV(data, filename) {
  const headers = ["#", "Book Title", "Accession No.", "Student Name", "Student PIN", "Branch", "Issue Date", "Return Date", "Status", "Days Out"];
  const rows = data.map((t, i) => {
    const issueDate = t.issueDate?.toDate ? t.issueDate.toDate() : null;
    const returnDate = t.returnDate?.toDate ? t.returnDate.toDate() : null;
    const days = issueDate
      ? Math.floor(((returnDate || new Date()) - issueDate) / 86400000)
      : "";
    return [
      i + 1,
      t.bookTitle || "",
      t.barcode || "",
      t.studentName || "",
      t.studentPin || "",
      t.studentBranch || "",
      issueDate ? issueDate.toLocaleDateString("en-IN") : "",
      returnDate ? returnDate.toLocaleDateString("en-IN") : "",
      t.status || "",
      days,
    ];
  });
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const [allTxns, setAllTxns] = useState([]);
  const [period, setPeriod] = useState("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const printRef = useRef();

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

  if (statusFilter !== "all") {
    filtered = filtered.filter((t) => t.status === statusFilter);
  }

  const q = searchTerm.toLowerCase();
  if (q) {
    filtered = filtered.filter(
      (t) =>
        t.bookTitle?.toLowerCase().includes(q) ||
        t.studentName?.toLowerCase().includes(q) ||
        t.studentPin?.toLowerCase().includes(q) ||
        t.barcode?.toLowerCase().includes(q)
    );
  }

  filtered = filtered.sort(
    (a, b) => (b.issueDate?.seconds || 0) - (a.issueDate?.seconds || 0)
  );

  const totalIssued   = filtered.filter((t) => t.status === "issued").length;
  const totalReturned = filtered.filter((t) => t.status === "returned").length;

  const handlePrint = () => window.print();

  const periodLabel = PERIODS.find((p) => p.key === period)?.label || "";
  const filename = `LibraryOS_Report_${period}_${new Date().toISOString().slice(0, 10)}.csv`;

  return (
    <AdminLayout>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-show { display: block !important; }
          body { font-size: 12px; }
        }
        .print-show { display: none; }
      `}</style>

      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Transaction Reports</h1>
          <p className="text-gray-500 text-sm mt-1">Filter, view, and export library transaction data.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => downloadCSV(filtered, filename)}
            className="border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
          >
            ⬇️ Download CSV
          </button>
          <button
            onClick={handlePrint}
            className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
          >
            🖨️ Print
          </button>
        </div>
      </div>

      {/* Period Selector */}
      <div className="no-print bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
        <p className="text-sm font-semibold text-gray-700 mb-3">Select Time Period</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                period === p.key
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period === "custom" && (
          <div className="flex flex-col sm:flex-row gap-3 mt-2">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">From</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">To</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {/* Filters row */}
        <div className="flex flex-col sm:flex-row gap-3 mt-4 pt-4 border-t border-gray-100">
          <input
            type="text"
            placeholder="Search by book, student, PIN..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="issued">Issued Only</option>
            <option value="returned">Returned Only</option>
          </select>
        </div>
      </div>

      {/* Print header (hidden on screen) */}
      <div className="print-show mb-6 border-b pb-4">
        <h2 className="text-xl font-bold">LibraryOS — Transaction Report</h2>
        <p className="text-sm">Period: {periodLabel} {customStart && customEnd ? `(${customStart} to ${customEnd})` : ""}</p>
        <p className="text-sm">Printed: {new Date().toLocaleDateString("en-IN")} · Total: {filtered.length} transactions</p>
      </div>

      {/* Summary Cards */}
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

      {/* Transactions Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" ref={printRef}>
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
                  <th className="px-4 py-3">Accession</th>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">PIN</th>
                  <th className="px-4 py-3">Issued</th>
                  <th className="px-4 py-3">Returned</th>
                  <th className="px-4 py-3">Days</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((t, i) => {
                  const issueDate = t.issueDate?.toDate ? t.issueDate.toDate() : null;
                  const returnDate = t.returnDate?.toDate ? t.returnDate.toDate() : null;
                  const days = issueDate
                    ? Math.floor(((returnDate || new Date()) - issueDate) / 86400000)
                    : null;
                  return (
                    <tr key={t.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-800 max-w-xs truncate">{t.bookTitle}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{t.barcode}</td>
                      <td className="px-4 py-3 text-gray-600">{t.studentName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{t.studentPin}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(t.issueDate)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(t.returnDate)}</td>
                      <td className="px-4 py-3 text-xs">
                        {days !== null && (
                          <span className={days > 14 ? "text-red-500 font-bold" : "text-gray-500"}>
                            {days}d {days > 14 && t.status === "issued" ? "⚠️" : ""}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          t.status === "issued"
                            ? "bg-yellow-100 text-yellow-700"
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