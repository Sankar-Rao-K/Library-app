import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import AdminLayout from "../../components/AdminLayout";
import { listenToBooks, listenToStudents, listenToStaff } from "../../firebase/firestore";
import { smartSearch } from "../../utils/searchUtils";

// ── Time filter helpers ────────────────────────────────────────────────
const TIME_FILTERS = [
  { key: "all",      label: "All Time" },
  { key: "1h",       label: "Last 1 Hour" },
  { key: "6h",       label: "Last 6 Hours" },
  { key: "today",    label: "Today" },
  { key: "yesterday",label: "Yesterday" },
  { key: "week",     label: "This Week" },
  { key: "custom",   label: "Custom Range" },
];

function getTimeRange(key, customStart, customEnd) {
  const now = Date.now();
  const MS = { h: 3600000, d: 86400000 };
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const yesterdayStart = new Date(todayStart - MS.d);
  const yesterdayEnd   = new Date(todayStart - 1);

  switch (key) {
    case "1h":        return { start: now - MS.h,     end: now };
    case "6h":        return { start: now - 6*MS.h,   end: now };
    case "today":     return { start: todayStart.getTime(), end: now };
    case "yesterday": return { start: yesterdayStart.getTime(), end: yesterdayEnd.getTime() };
    case "week":      return { start: now - 7*MS.d,   end: now };
    case "custom":    return {
      start: customStart ? new Date(customStart + "T00:00:00").getTime() : null,
      end:   customEnd   ? new Date(customEnd   + "T23:59:59").getTime() : now,
    };
    default:          return { start: null, end: null };
  }
}

function getItemTimestamp(item) {
  const ts = item.createdAt;
  if (!ts) return null;
  if (ts.toDate) return ts.toDate().getTime();   // Firestore Timestamp
  if (ts.seconds) return ts.seconds * 1000;      // plain object
  return null;
}

function applyTimeFilter(items, key, customStart, customEnd) {
  if (key === "all") return items;
  const { start, end } = getTimeRange(key, customStart, customEnd);
  if (!start && !end) return items;
  return items.filter((item) => {
    const t = getItemTimestamp(item);
    if (t === null) return false;
    if (start && t < start) return false;
    if (end   && t > end)   return false;
    return true;
  });
}

function timeAgo(item) {
  const t = getItemTimestamp(item);
  if (!t) return null;
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1)  return "Just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7)  return `${d}d ago`;
  return new Date(t).toLocaleDateString("en-IN");
}

// ── Default QR sizes per type ─────────────────────────────────────────
const DEFAULT_SIZE = { books: 90, students: 120, staff: 120 };
const MIN_SIZE     = 60;
const MAX_SIZE     = 200;

export default function QRCodes() {
  const [books, setBooks]       = useState([]);
  const [students, setStudents] = useState([]);
  const [staffList, setStaff]   = useState([]);
  const [tab, setTab]           = useState("books");
  const [search, setSearch]     = useState("");

  // Time filter
  const [timeFilter, setTimeFilter]   = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd]     = useState("");

  // QR size per tab
  const [qrSize, setQrSize] = useState({ books: 90, students: 120, staff: 120 });

  // Print columns
  const [printCols, setPrintCols] = useState(5);

  useEffect(() => {
    const u1 = listenToBooks(setBooks);
    const u2 = listenToStudents(setStudents);
    const u3 = listenToStaff(setStaff);
    return () => { u1(); u2(); u3(); };
  }, []);

  const q = search.toLowerCase().trim();

  // Base list after search
  const searchedBooks = q
    ? smartSearch(books, q, ["title", "author", "accessionNo", "barcode"])
    : books;
  const searchedStudents = q
    ? smartSearch([...students].sort((a, b) => (a.pin||"").localeCompare(b.pin||"")), q, ["name", "pin", "branch"])
    : [...students].sort((a, b) => (a.pin||"").localeCompare(b.pin||""));
  const searchedStaff = q
    ? smartSearch([...staffList].sort((a, b) => (a.name||"").localeCompare(b.name||"")), q, ["name", "staffId", "section"])
    : [...staffList].sort((a, b) => (a.name||"").localeCompare(b.name||""));

  // Apply time filter
  const filteredBooks    = applyTimeFilter(searchedBooks,    timeFilter, customStart, customEnd);
  const filteredStudents = applyTimeFilter(searchedStudents, timeFilter, customStart, customEnd);
  const filteredStaff    = applyTimeFilter(searchedStaff,    timeFilter, customStart, customEnd);

  const currentList = tab === "books" ? filteredBooks : tab === "students" ? filteredStudents : filteredStaff;
  const currentSize = qrSize[tab];

  // ── Print handler ────────────────────────────────────────────────────
  const handlePrint = () => {
    const printContent = document.getElementById("qr-grid-print");
    if (!printContent) return;

    const w = window.open("", "_blank", "width=1100,height=800");
    const size  = currentSize;
    const gap   = Math.round(size * 0.35);          // proportional gap
    const cols  = printCols;
    const cardW = size + 48;                         // QR + padding

    w.document.write(`
      <!DOCTYPE html><html><head>
      <title>GP Anakapalli Library — QR Codes (${tab})</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; padding: 20px; background: white; }
        .header { text-align: center; margin-bottom: 18px; border-bottom: 2px solid #C9A227; padding-bottom: 12px; }
        .header h2 { font-size: 15px; color: #0D1F4E; margin-bottom: 2px; }
        .header p  { font-size: 11px; color: #666; }
        .meta { display: flex; justify-content: center; gap: 24px; margin-bottom: 16px; }
        .meta span { font-size: 10px; color: #888; background: #f3f4f6; padding: 3px 10px; border-radius: 20px; }
        .grid {
          display: grid;
          grid-template-columns: repeat(${cols}, 1fr);
          gap: ${gap}px;
          justify-items: center;
        }
        .card {
          border: 1.5px solid #e5e7eb;
          border-radius: 10px;
          padding: 14px 10px 10px;
          text-align: center;
          width: ${cardW}px;
          page-break-inside: avoid;
          background: white;
        }
        .card svg { display: block; margin: 0 auto 8px; }
        .card .title {
          font-size: ${Math.max(9, Math.round(size * 0.12))}px;
          font-weight: 700;
          color: #111;
          line-height: 1.3;
          margin-bottom: 3px;
          word-break: break-word;
        }
        .card .sub   { font-size: ${Math.max(8, Math.round(size * 0.1))}px; color: #666; margin-bottom: 2px; }
        .card .code  {
          font-family: monospace;
          font-size: ${Math.max(8, Math.round(size * 0.1))}px;
          font-weight: 700;
          color: #333;
          background: #f3f4f6;
          padding: 2px 8px;
          border-radius: 4px;
          display: inline-block;
          margin-top: 4px;
          word-break: break-all;
        }
        @media print {
          body { padding: 10px; }
          .grid { gap: ${Math.max(gap, 16)}px; }
        }
      </style></head><body>
      <div class="header">
        <h2>📚 Govt. Polytechnic Anakapalli — Library QR Codes</h2>
        <p>${tab === "books" ? "Book Access Codes (Accession No.)" : tab === "students" ? "Student PIN QR Cards" : "Staff CMS ID QR Cards"} &nbsp;·&nbsp; ${currentList.length} codes &nbsp;·&nbsp; Printed: ${new Date().toLocaleDateString("en-IN")}</p>
      </div>
      <div class="meta">
        <span>Tab: ${tab.charAt(0).toUpperCase()+tab.slice(1)}</span>
        <span>QR Size: ${size}px</span>
        <span>Columns: ${cols}</span>
        <span>Filter: ${TIME_FILTERS.find(f=>f.key===timeFilter)?.label || "All Time"}</span>
      </div>
      <div class="grid">${printContent.innerHTML}</div>
      </body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 700);
  };

  // ── Render a single QR card for the print grid ────────────────────────
  const printCard = (item) => {
    const qrVal = tab === "books"
      ? (item.accessionNo || item.barcode || item.id)
      : tab === "students" ? item.pin : item.staffId;
    const title = tab === "books" ? item.title : item.name;
    const sub   = tab === "books"
      ? (item.author || "")
      : tab === "students"
        ? `${item.branch || ""} · ${item.year || ""}`
        : `${item.designation || ""} · ${item.section || ""}`;
    const code  = tab === "books"
      ? qrVal
      : tab === "students" ? `PIN: ${item.pin}` : `ID: ${item.staffId}`;

    // Render QRCodeSVG to string using innerHTML of a temp div
    return `
      <div class="card">
        <svg xmlns="http://www.w3.org/2000/svg" width="${currentSize}" height="${currentSize}"
             viewBox="0 0 ${currentSize} ${currentSize}">
          <!-- placeholder — replaced by actual QR below -->
        </svg>
        <div class="title">${title || ""}</div>
        <div class="sub">${sub || ""}</div>
        <div class="code">${code || ""}</div>
      </div>`;
  };

  // Actual print uses injected SVG from the screen via cloneNode
  const handleRealPrint = () => {
    const cards = document.querySelectorAll("#qr-screen-grid .qr-card-item");
    if (!cards.length) return;

    const gap   = Math.round(currentSize * 0.35);
    const cols  = printCols;
    const cardW = currentSize + 48;

    const cardsHTML = Array.from(cards).map((el) => {
      const svg     = el.querySelector("svg");
      const title   = el.querySelector(".qr-title")?.textContent || "";
      const sub     = el.querySelector(".qr-sub")?.textContent   || "";
      const code    = el.querySelector(".qr-code")?.textContent  || "";
      const svgStr  = svg ? svg.outerHTML : "";
      return `
        <div class="card">
          ${svgStr}
          <div class="title">${title}</div>
          <div class="sub">${sub}</div>
          <div class="code">${code}</div>
        </div>`;
    }).join("");

    const w = window.open("", "_blank", "width=1100,height=800");
    const fontSize = Math.max(9, Math.round(currentSize * 0.12));
    const subSize  = Math.max(8, Math.round(currentSize * 0.1));

    w.document.write(`
      <!DOCTYPE html><html><head>
      <title>GP Anakapalli Library — QR Codes (${tab})</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; padding: 20px; background: white; }
        .header { text-align: center; margin-bottom: 18px; border-bottom: 2px solid #C9A227; padding-bottom: 12px; }
        .header h2 { font-size: 15px; color: #0D1F4E; margin-bottom: 2px; }
        .header p  { font-size: 11px; color: #666; }
        .meta { display: flex; justify-content: center; gap: 20px; margin-bottom: 16px; flex-wrap: wrap; }
        .meta span { font-size: 10px; color: #888; background: #f3f4f6; padding: 3px 10px; border-radius: 20px; }
        .grid {
          display: grid;
          grid-template-columns: repeat(${cols}, auto);
          gap: ${gap}px;
          justify-content: center;
        }
        .card {
          border: 1.5px solid #e5e7eb;
          border-radius: 10px;
          padding: 14px 10px 10px;
          text-align: center;
          width: ${cardW}px;
          page-break-inside: avoid;
          background: white;
        }
        .card svg { display: block; margin: 0 auto 8px; width: ${currentSize}px !important; height: ${currentSize}px !important; }
        .title { font-size: ${fontSize}px; font-weight: 700; color: #111; line-height: 1.3; margin-bottom: 3px; word-break: break-word; }
        .sub   { font-size: ${subSize}px; color: #666; margin-bottom: 2px; }
        .code  { font-family: monospace; font-size: ${subSize}px; font-weight: 700; color: #333; background: #f3f4f6; padding: 2px 8px; border-radius: 4px; display: inline-block; margin-top: 4px; }
        @media print { body { padding: 8px; } .grid { gap: ${Math.max(gap, 16)}px; } }
      </style></head><body>
      <div class="header">
        <h2>📚 Govt. Polytechnic Anakapalli — Library QR Codes</h2>
        <p>${tab === "books" ? "Book Access Codes" : tab === "students" ? "Student PIN QR Cards" : "Staff CMS ID QR Cards"} &nbsp;·&nbsp; ${currentList.length} codes &nbsp;·&nbsp; Printed: ${new Date().toLocaleDateString("en-IN")}</p>
      </div>
      <div class="meta">
        <span>Type: ${tab.charAt(0).toUpperCase()+tab.slice(1)}</span>
        <span>QR Size: ${currentSize}px</span>
        <span>Columns: ${cols}</span>
        <span>Filter: ${TIME_FILTERS.find(f=>f.key===timeFilter)?.label || "All Time"}</span>
        ${timeFilter==="custom" && customStart ? `<span>${customStart} → ${customEnd||"now"}</span>` : ""}
      </div>
      <div class="grid">${cardsHTML}</div>
      </body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 700);
  };

  // ── QR Card component ─────────────────────────────────────────────────
  const QRCard = ({ item }) => {
    const qrVal = tab === "books"
      ? (item.accessionNo || item.barcode || item.id)
      : tab === "students" ? item.pin : item.staffId;
    const title = tab === "books" ? item.title : item.name;
    const sub   = tab === "books"
      ? (item.author || "")
      : tab === "students"
        ? `${item.branch || ""} · ${item.year || ""}`
        : `${item.designation || ""} · ${item.section || ""}`;
    const code  = tab === "books"
      ? qrVal
      : tab === "students" ? `PIN: ${item.pin}` : `ID: ${item.staffId}`;
    const ago   = timeAgo(item);

    return (
      <div className="qr-card-item bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition flex flex-col items-center"
        style={{ padding: "14px 10px 10px", position: "relative" }}>

        {/* "Just added" badge */}
        {ago === "Just now" && (
          <span className="absolute top-2 right-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold leading-none">
            New
          </span>
        )}

        <QRCodeSVG value={qrVal || "unknown"} size={currentSize} level="M" />

        <p className="qr-title text-center font-bold text-gray-800 leading-tight mt-2 line-clamp-2 w-full"
          style={{ fontSize: Math.max(9, Math.round(currentSize * 0.12)) + "px" }}>
          {title}
        </p>
        <p className="qr-sub text-center text-gray-400 mt-0.5 truncate w-full"
          style={{ fontSize: Math.max(8, Math.round(currentSize * 0.1)) + "px" }}>
          {sub}
        </p>
        <p className="qr-code text-center font-mono font-bold text-gray-600 mt-1 bg-gray-50 px-2 py-0.5 rounded"
          style={{ fontSize: Math.max(8, Math.round(currentSize * 0.1)) + "px" }}>
          {code}
        </p>
        {ago && timeFilter !== "all" && (
          <p className="text-center mt-1 text-gray-300"
            style={{ fontSize: "9px" }}>
            {ago}
          </p>
        )}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">QR Code Generator</h1>
          <p className="text-gray-500 text-sm mt-1">
            Filter by time, adjust size, then print.
          </p>
        </div>
        <button onClick={handleRealPrint}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold transition"
          style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
          🖨️ Print {currentList.length > 0 ? `(${currentList.length})` : ""} QR Codes
        </button>
      </div>

      {/* ── Type Tabs ── */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { key: "books",    label: "📚 Books",    hint: "Accession No." },
          { key: "students", label: "🎓 Students", hint: "PIN" },
          { key: "staff",    label: "👩‍🏫 Staff",   hint: "CMS ID" },
        ].map((t) => (
          <button key={t.key}
            onClick={() => { setTab(t.key); setSearch(""); }}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition ${
              tab === t.key ? "text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
            style={tab === t.key ? { background: "linear-gradient(135deg, #0D1F4E, #1B4332)" } : {}}>
            {t.label}
            <span className="text-xs opacity-60 font-normal hidden sm:inline">({t.hint})</span>
          </button>
        ))}
      </div>

      {/* ── Controls Panel ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6 space-y-5">

        {/* Row 1: Time filter */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
            🕐 Filter by Added Time
          </p>
          <div className="flex flex-wrap gap-2">
            {TIME_FILTERS.map((f) => (
              <button key={f.key}
                onClick={() => setTimeFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                  timeFilter === f.key
                    ? "text-white border-transparent"
                    : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
                style={timeFilter === f.key
                  ? { background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }
                  : {}}>
                {f.label}
                {/* show count badge */}
                {f.key !== "custom" && (() => {
                  const list = tab === "books" ? books : tab === "students" ? students : staffList;
                  const cnt = f.key === "all" ? list.length : applyTimeFilter(list, f.key, "", "").length;
                  if (f.key !== "all" && cnt === 0) return null;
                  return (
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${
                      timeFilter === f.key ? "bg-white/20 text-white" : "bg-gray-200 text-gray-500"
                    }`}>
                      {cnt}
                    </span>
                  );
                })()}
              </button>
            ))}
          </div>

          {/* Custom date range */}
          {timeFilter === "custom" && (
            <div className="flex flex-col sm:flex-row gap-3 mt-3">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">From Date</label>
                <input type="date" value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">To Date</label>
                <input type="date" value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          )}
        </div>

        {/* Row 2: QR Size + Print columns */}
        <div className="flex flex-col sm:flex-row gap-5 pt-4 border-t border-gray-100">
          {/* QR Size slider */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                🔲 QR Code Size
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setQrSize((s) => ({ ...s, [tab]: DEFAULT_SIZE[tab] }))}
                  className="text-xs text-blue-600 hover:underline">
                  Reset
                </button>
                <span className="text-sm font-bold text-gray-700 w-12 text-right">
                  {currentSize}px
                </span>
              </div>
            </div>
            <input
              type="range"
              min={MIN_SIZE}
              max={MAX_SIZE}
              step={10}
              value={currentSize}
              onChange={(e) => setQrSize((s) => ({ ...s, [tab]: Number(e.target.value) }))}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{MIN_SIZE}px (small)</span>
              <span className="text-blue-600 font-medium">
                {tab === "books" ? "Books default: 90px" : "Members default: 120px"}
              </span>
              <span>{MAX_SIZE}px (large)</span>
            </div>
            {/* Live preview */}
            <div className="mt-3 flex items-center gap-3 bg-gray-50 rounded-lg p-3">
              <div className="flex-shrink-0 border border-gray-200 rounded-lg p-1.5 bg-white">
                <QRCodeSVG value="preview" size={Math.round(currentSize * 0.4)} level="L" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-700">Preview at {currentSize}px</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Card width will be ~{currentSize + 48}px · Gap ~{Math.round(currentSize * 0.35)}px
                </p>
              </div>
            </div>
          </div>

          {/* Print columns */}
          <div className="sm:w-48">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              📐 Print Columns
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {[3, 4, 5, 6].map((n) => (
                <button key={n}
                  onClick={() => setPrintCols(n)}
                  className={`py-2 rounded-lg text-sm font-bold transition border ${
                    printCols === n
                      ? "text-white border-transparent"
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-400"
                  }`}
                  style={printCols === n
                    ? { background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }
                    : {}}>
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">
              columns per row when printing
            </p>
          </div>
        </div>

        {/* Row 3: Search */}
        <div className="pt-4 border-t border-gray-100">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input type="text"
              placeholder={`Search ${tab}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {search && (
              <button onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Info banner ── */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-5 text-xs text-blue-700 flex items-start gap-2">
        <span className="flex-shrink-0 mt-0.5">ℹ️</span>
        <span>
          {tab === "books"
            ? "QR contains Accession No. — scan during Issue/Return to auto-fill book code."
            : tab === "students"
              ? "QR contains Student PIN — scan during Issue/Return to auto-identify student."
              : "QR contains Staff CMS ID — scan during Issue/Return to auto-identify staff."}
          {timeFilter !== "all" && (
            <span className="ml-2 font-semibold text-blue-800">
              Showing {currentList.length} record{currentList.length !== 1 ? "s" : ""} added in: {TIME_FILTERS.find(f=>f.key===timeFilter)?.label}
            </span>
          )}
        </span>
      </div>

      {/* ── QR Grid ── */}
      {currentList.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-20 text-center">
          <p className="text-5xl mb-4">
            {timeFilter !== "all" ? "🕐" : "🔍"}
          </p>
          <p className="text-gray-600 font-semibold text-base">No records found</p>
          <p className="text-gray-400 text-sm mt-1">
            {search
              ? `No ${tab} match "${search}".`
              : timeFilter !== "all"
                ? `No ${tab} were added in the selected time period.`
                : `No ${tab} have been added yet.`}
          </p>
          {(search || timeFilter !== "all") && (
            <div className="flex justify-center gap-3 mt-4">
              {search && (
                <button onClick={() => setSearch("")}
                  className="text-xs text-blue-600 hover:underline font-medium">
                  Clear search
                </button>
              )}
              {timeFilter !== "all" && (
                <button onClick={() => setTimeFilter("all")}
                  className="text-xs text-blue-600 hover:underline font-medium">
                  Show all time
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div
          id="qr-screen-grid"
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${currentSize + 48}px, 1fr))`,
          }}>
          {currentList.map((item) => (
            <QRCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </AdminLayout>
  );
}