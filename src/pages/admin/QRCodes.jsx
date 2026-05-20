import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import AdminLayout from "../../components/AdminLayout";
import {
  listenToBooks, listenToStudents, listenToStaff,
  listenToQRCodes, saveQRCode, deleteQRCode,
  addBook, addStudent, addStaff,
} from "../../firebase/firestore";
import { smartSearch } from "../../utils/searchUtils";

// ── Time filter helpers ────────────────────────────────────────────────
const TIME_FILTERS = [
  { key: "all",       label: "All Time"     },
  { key: "1h",        label: "Last 1 Hour"  },
  { key: "6h",        label: "Last 6 Hours" },
  { key: "today",     label: "Today"        },
  { key: "yesterday", label: "Yesterday"    },
  { key: "week",      label: "This Week"    },
  { key: "custom",    label: "Custom Range" },
];

const MIN_DATE = "2008-01-01";
function todayStr() { return new Date().toISOString().slice(0, 10); }

function getTimeRange(key, customStart, customEnd) {
  const now = Date.now();
  const MS = { h: 3600000, d: 86400000 };
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart - MS.d);
  const yesterdayEnd   = new Date(todayStart - 1);
  switch (key) {
    case "1h":        return { start: now - MS.h, end: now };
    case "6h":        return { start: now - 6 * MS.h, end: now };
    case "today":     return { start: todayStart.getTime(), end: now };
    case "yesterday": return { start: yesterdayStart.getTime(), end: yesterdayEnd.getTime() };
    case "week":      return { start: now - 7 * MS.d, end: now };
    case "custom":    return {
      start: customStart ? new Date(customStart + "T00:00:00").getTime() : null,
      end:   customEnd   ? new Date(customEnd   + "T23:59:59").getTime() : now,
    };
    default: return { start: null, end: null };
  }
}

function getTs(item) {
  const ts = item.createdAt;
  if (!ts) return null;
  if (ts.toDate) return ts.toDate().getTime();
  if (ts.seconds) return ts.seconds * 1000;
  return null;
}

function applyTimeFilter(items, key, customStart, customEnd) {
  if (key === "all") return items;
  const { start, end } = getTimeRange(key, customStart, customEnd);
  if (!start && !end) return items;
  return items.filter((item) => {
    const t = getTs(item);
    if (t === null) return false;
    if (start && t < start) return false;
    if (end   && t > end)   return false;
    return true;
  });
}

function timeAgo(item) {
  const t = getTs(item);
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

// QR is "new" if added within last 7 days
function isNew(item) {
  const t = getTs(item);
  if (!t) return false;
  return (Date.now() - t) < 7 * 86400000;
}

// Default sizes
const DEFAULT_SIZE   = { books: 90, students: 120, staff: 120 };
const DEFAULT_COLS   = 5;
const MIN_SIZE       = 60;
const MAX_SIZE       = 200;
const LS_SIZE_KEY    = "qr_pref_size";
const LS_COLS_KEY    = "qr_pref_cols";

function loadPrefs() {
  try {
    const size = JSON.parse(localStorage.getItem(LS_SIZE_KEY) || "null");
    const cols = parseInt(localStorage.getItem(LS_COLS_KEY) || "5", 10);
    return {
      size: size || { ...DEFAULT_SIZE },
      cols: isNaN(cols) ? DEFAULT_COLS : cols,
    };
  } catch { return { size: { ...DEFAULT_SIZE }, cols: DEFAULT_COLS }; }
}

function savePrefs(size, cols) {
  try {
    localStorage.setItem(LS_SIZE_KEY, JSON.stringify(size));
    localStorage.setItem(LS_COLS_KEY, String(cols));
  } catch {}
}

export default function QRCodes() {
  const [books, setBooks]       = useState([]);
  const [students, setStudents] = useState([]);
  const [staffList, setStaff]   = useState([]);
  const [savedQRs, setSavedQRs] = useState([]);
  const [tab, setTab]           = useState("books");
  const [search, setSearch]     = useState("");

  // Time filter
  const [timeFilter, setTimeFilter]   = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd]     = useState("");

  // Load persisted prefs
  const prefs = loadPrefs();
  const [qrSize, setQrSize]     = useState(prefs.size);
  const [printCols, setPrintCols] = useState(prefs.cols);

  // Edit panel visibility
  const [showEdit, setShowEdit] = useState(false);

  // Instant QR
  const [instantValue, setInstantValue] = useState("");
  const [instantLabel, setInstantLabel] = useState("");
  const [saving, setSaving]             = useState(false);
  const [savedMsg, setSavedMsg]         = useState("");

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteTyped, setDeleteTyped]   = useState("");
  const [deleting, setDeleting]         = useState(false);

  useEffect(() => {
    const u1 = listenToBooks(setBooks);
    const u2 = listenToStudents(setStudents);
    const u3 = listenToStaff(setStaff);
    const u4 = listenToQRCodes(setSavedQRs);
    return () => { u1(); u2(); u3(); u4(); };
  }, []);

  // Persist prefs whenever they change
  useEffect(() => { savePrefs(qrSize, printCols); }, [qrSize, printCols]);

  const currentSize = qrSize[tab] || 100;

  // ── Filtered lists ─────────────────────────────────────────────────
  const q = search.trim();

  const baseBooks    = q ? smartSearch(books, q, ["title", "author", "accessionNo", "barcode"]) : books;
  const baseStudents = q ? smartSearch([...students].sort((a,b)=>(a.pin||"").localeCompare(b.pin||"")), q, ["name","pin","branch"]) : [...students].sort((a,b)=>(a.pin||"").localeCompare(b.pin||""));
  const baseStaff    = q ? smartSearch([...staffList].sort((a,b)=>(a.name||"").localeCompare(b.name||"")), q, ["name","staffId","section"]) : [...staffList].sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  const baseSaved    = q ? savedQRs.filter((qr) => qr.value?.toLowerCase().includes(q.toLowerCase()) || qr.label?.toLowerCase().includes(q.toLowerCase())) : savedQRs;

  const filteredBooks    = applyTimeFilter(baseBooks,    timeFilter, customStart, customEnd);
  const filteredStudents = applyTimeFilter(baseStudents, timeFilter, customStart, customEnd);
  const filteredStaff    = applyTimeFilter(baseStaff,    timeFilter, customStart, customEnd);
  const filteredSaved    = applyTimeFilter(baseSaved,    timeFilter, customStart, customEnd);

  // Sort saved: new (< 7 days) first by timestamp, then rest alphabetically
  const sortedSaved = [...filteredSaved].sort((a, b) => {
    const aNew = isNew(a), bNew = isNew(b);
    if (aNew && !bNew) return -1;
    if (!aNew && bNew) return 1;
    if (aNew && bNew) return (getTs(b) || 0) - (getTs(a) || 0); // newest first within new
    // Both old: alphabetical by label/value
    const aLabel = (a.label || a.value || "").toLowerCase();
    const bLabel = (b.label || b.value || "").toLowerCase();
    return aLabel.localeCompare(bLabel);
  });

  const currentList = tab === "books"    ? filteredBooks
    : tab === "students" ? filteredStudents
    : tab === "staff"    ? filteredStaff
    : tab === "saved"    ? sortedSaved
    : [];

  // ── Save instant QR ────────────────────────────────────────────────
  const handleSaveQR = async () => {
    if (!instantValue.trim()) return;
    setSaving(true);
    try {
      await saveQRCode({ value: instantValue.trim(), label: instantLabel.trim() || instantValue.trim(), type: "custom", linkedId: null });
      setSavedMsg("✅ Saved! Find it in the Saved QRs tab.");
      setTimeout(() => setSavedMsg(""), 4000);
    } catch (err) { alert("Error saving: " + err.message); }
    setSaving(false);
  };

  // ── Delete saved QR ────────────────────────────────────────────────
  const handleDeleteSaved = async () => {
    if (!deleteTarget) return;
    const expected = (deleteTarget.label || deleteTarget.value || "").trim().toLowerCase();
    if (deleteTyped.trim().toLowerCase() !== expected) return;
    setDeleting(true);
    try { await deleteQRCode(deleteTarget.id); setDeleteTarget(null); setDeleteTyped(""); }
    catch (err) { alert("Error: " + err.message); }
    setDeleting(false);
  };

  // ── Print ──────────────────────────────────────────────────────────
  const handlePrint = () => {
    const cards = document.querySelectorAll("#qr-screen-grid .qr-card-item");
    if (!cards.length) return;
    const gap   = Math.round(currentSize * 0.4);
    const cardW = currentSize + 56;
    const cardsHTML = Array.from(cards).map((el) => {
      const svg   = el.querySelector("svg");
      const title = el.querySelector(".qr-title")?.textContent || "";
      const sub   = el.querySelector(".qr-sub")?.textContent   || "";
      const code  = el.querySelector(".qr-code")?.textContent  || "";
      return `<div class="card">${svg ? svg.outerHTML : ""}<div class="title">${title}</div><div class="sub">${sub}</div><div class="code">${code}</div></div>`;
    }).join("");
    const fs = Math.max(9, Math.round(currentSize * 0.12));
    const ss = Math.max(8, Math.round(currentSize * 0.1));
    const w  = window.open("", "_blank", "width=1100,height=800");
    w.document.write(`<!DOCTYPE html><html><head><title>GP Anakapalli — QR Codes</title><style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;padding:20px}
      .header{text-align:center;margin-bottom:16px;border-bottom:2px solid #C9A227;padding-bottom:12px}
      .header h2{font-size:15px;color:#0D1F4E} .header p{font-size:11px;color:#666;margin-top:3px}
      .meta{display:flex;justify-content:center;gap:16px;margin-bottom:16px;flex-wrap:wrap}
      .meta span{font-size:10px;color:#888;background:#f3f4f6;padding:3px 10px;border-radius:20px}
      .grid{display:grid;grid-template-columns:repeat(${printCols},auto);gap:${gap}px;justify-content:center}
      .card{border:1.5px solid #e5e7eb;border-radius:10px;padding:14px 10px 10px;text-align:center;width:${cardW}px;page-break-inside:avoid;background:white}
      .card svg{display:block;margin:0 auto 8px;width:${currentSize}px!important;height:${currentSize}px!important}
      .title{font-size:${fs}px;font-weight:700;color:#111;line-height:1.3;margin-bottom:3px;word-break:break-word}
      .sub{font-size:${ss}px;color:#666;margin-bottom:2px}
      .code{font-family:monospace;font-size:${ss}px;font-weight:700;color:#333;background:#f3f4f6;padding:2px 6px;border-radius:4px;display:inline-block;margin-top:4px}
      @media print{body{padding:8px}.grid{gap:${Math.max(gap,16)}px}}
    </style></head><body>
    <div class="header"><h2>📚 Govt. Polytechnic Anakapalli — Library QR Codes</h2>
    <p>${tab === "books" ? "Book Access Codes" : tab === "students" ? "Student PIN QR Cards" : tab === "staff" ? "Staff CMS ID QR Cards" : "Saved QR Codes"} · ${currentList.length} codes · ${new Date().toLocaleDateString("en-IN")}</p></div>
    <div class="meta"><span>${tab.charAt(0).toUpperCase()+tab.slice(1)}</span><span>Size: ${currentSize}px</span><span>Columns: ${printCols}</span></div>
    <div class="grid">${cardsHTML}</div></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 700);
  };

  // ── QR Card ────────────────────────────────────────────────────────
  const QRCard = ({ item }) => {
    const qrVal = tab === "books"
      ? (item.accessionNo || item.barcode || item.id)
      : tab === "students" ? item.pin
      : tab === "staff"    ? item.staffId
      : item.value;
    const title = tab === "books" ? item.title
      : tab === "saved" ? (item.label || item.value)
      : item.name;
    const sub = tab === "books"
      ? (item.author || "")
      : tab === "students" ? `${item.branch || ""} · ${item.year || ""}`
      : tab === "staff"    ? `${item.designation || ""} · ${item.section || ""}`
      : item.value;
    const code = tab === "books" ? qrVal
      : tab === "students" ? `PIN: ${item.pin}`
      : tab === "staff"    ? `ID: ${item.staffId}`
      : qrVal;
    const ago      = timeAgo(item);
    const itemIsNew = isNew(item);

    return (
      <div className="qr-card-item bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition flex flex-col items-center relative"
        style={{ padding: "14px 10px 10px" }}>

        {/* New badge */}
        {itemIsNew && (
          <span className="absolute top-1.5 right-1.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold leading-none">
            New
          </span>
        )}

        {/* Delete button for saved QRs */}
        {tab === "saved" && (
          <button onClick={() => { setDeleteTarget(item); setDeleteTyped(""); }}
            className="absolute top-1.5 left-1.5 text-xs bg-red-50 hover:bg-red-100 text-red-500 px-1.5 py-0.5 rounded font-medium transition">
            Delete
          </button>
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
        <p className="qr-code text-center font-mono font-bold text-gray-600 mt-1 bg-gray-50 px-2 py-0.5 rounded w-full truncate"
          style={{ fontSize: Math.max(8, Math.round(currentSize * 0.1)) + "px" }}>
          {code}
        </p>
        {ago && timeFilter !== "all" && (
          <p className="text-center mt-1 text-gray-300" style={{ fontSize: "9px" }}>{ago}</p>
        )}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-red-600 px-5 py-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-lg">🗑️</div>
              <div>
                <p className="font-bold text-white text-sm">Delete QR Code?</p>
                <p className="text-red-200 text-xs">This cannot be undone</p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-600">
                Type <span className="font-mono font-bold bg-gray-100 px-1 rounded">{deleteTarget.label || deleteTarget.value}</span> to confirm deletion.
              </p>
              <input type="text" value={deleteTyped} onChange={(e) => setDeleteTyped(e.target.value)}
                placeholder="Type to confirm..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              <div className="flex gap-2">
                <button onClick={() => { setDeleteTarget(null); setDeleteTyped(""); }}
                  className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm font-medium">
                  Cancel
                </button>
                <button
                  onClick={handleDeleteSaved}
                  disabled={deleteTyped.trim().toLowerCase() !== (deleteTarget.label || deleteTarget.value || "").trim().toLowerCase() || deleting}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:text-gray-400 text-white py-2 rounded-lg text-sm font-bold transition">
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">QR Code Generator</h1>
          <p className="text-gray-500 text-sm mt-1">Generate, filter, and print QR codes.</p>
        </div>
        <div className="flex gap-2">
          {tab !== "instant" && (
            <button
              onClick={() => setShowEdit(!showEdit)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition border ${
                showEdit
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-200 hover:border-blue-400 hover:text-blue-600"
              }`}>
              {showEdit ? "✓ Done Editing" : "⚙️ Edit Settings"}
            </button>
          )}
          {tab !== "instant" && (
            <button onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold transition"
              style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
              🖨️ Print {currentList.length > 0 ? `(${currentList.length})` : ""}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { key: "books",    label: "📚 Books",     hint: `${books.length}`    },
          { key: "students", label: "🎓 Students",  hint: `${students.length}` },
          { key: "staff",    label: "👩‍🏫 Staff",    hint: `${staffList.length}` },
          { key: "saved",    label: "💾 Saved QRs", hint: `${savedQRs.length}`  },
          { key: "instant",  label: "⚡ Instant",   hint: "Generate any QR"   },
        ].map((t) => (
          <button key={t.key}
            onClick={() => { setTab(t.key); setSearch(""); setShowEdit(false); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
              tab === t.key ? "text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
            style={tab === t.key ? { background: "linear-gradient(135deg, #0D1F4E, #1B4332)" } : {}}>
            {t.label}
            <span className="text-xs opacity-60 font-normal hidden sm:inline">({t.hint})</span>
          </button>
        ))}
      </div>

      {/* ── EDIT SETTINGS PANEL (collapsible) ── */}
      {showEdit && tab !== "instant" && (
        <div className="bg-white rounded-xl shadow-sm border border-blue-100 p-5 mb-5 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">⚙️</span>
            <h3 className="text-sm font-bold text-gray-800">QR Display Settings</h3>
            <span className="text-xs text-gray-400 ml-1">— settings are saved automatically</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-6">
            {/* QR Size slider */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">QR Code Size</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setQrSize((s) => ({ ...s, [tab]: DEFAULT_SIZE[tab] || 100 }))}
                    className="text-xs text-blue-600 hover:underline">Reset</button>
                  <span className="text-sm font-bold text-gray-700 tabular-nums w-12 text-right">{currentSize}px</span>
                </div>
              </div>
              <input type="range" min={MIN_SIZE} max={MAX_SIZE} step={10} value={currentSize}
                onChange={(e) => setQrSize((s) => ({ ...s, [tab]: Number(e.target.value) }))}
                className="w-full accent-blue-600" />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>Small ({MIN_SIZE}px)</span>
                <span className="text-blue-500 font-medium">
                  {tab === "books" ? "Default 90px" : "Default 120px"}
                </span>
                <span>Large ({MAX_SIZE}px)</span>
              </div>

              {/* Live mini preview */}
              <div className="mt-3 flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                <div className="border border-gray-200 rounded-lg p-1.5 bg-white flex-shrink-0">
                  <QRCodeSVG value="preview" size={Math.round(currentSize * 0.35)} level="L" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-700">Preview at {currentSize}px</p>
                  <p className="text-xs text-gray-400">Card ~{currentSize + 48}px wide · Gap ~{Math.round(currentSize * 0.4)}px</p>
                </div>
              </div>
            </div>

            {/* Print columns */}
            <div className="sm:w-52">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Print Columns</p>
              <div className="grid grid-cols-4 gap-2">
                {[3, 4, 5, 6].map((n) => (
                  <button key={n} onClick={() => setPrintCols(n)}
                    className={`py-2.5 rounded-lg text-sm font-bold transition border ${
                      printCols === n ? "text-white border-transparent" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-400"
                    }`}
                    style={printCols === n ? { background: "linear-gradient(135deg, #0D1F4E, #1B4332)" } : {}}>
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">columns per row when printing</p>
            </div>
          </div>

          {/* Time filter */}
          <div className="pt-4 border-t border-gray-100">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Filter by Time Added</p>
            <div className="flex flex-wrap gap-2">
              {TIME_FILTERS.map((f) => {
                const listForCount = tab === "books" ? books : tab === "students" ? students : tab === "staff" ? staffList : savedQRs;
                const cnt = f.key === "all" ? listForCount.length : applyTimeFilter(listForCount, f.key, "", "").length;
                return (
                  <button key={f.key} onClick={() => setTimeFilter(f.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                      timeFilter === f.key ? "text-white border-transparent" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-400"
                    }`}
                    style={timeFilter === f.key ? { background: "linear-gradient(135deg, #0D1F4E, #1B4332)" } : {}}>
                    {f.label}
                    {cnt > 0 && (
                      <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${
                        timeFilter === f.key ? "bg-white/20 text-white" : "bg-gray-200 text-gray-500"
                      }`}>{cnt}</span>
                    )}
                  </button>
                );
              })}
            </div>
            {timeFilter === "custom" && (
              <div className="flex gap-3 mt-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">From</label>
                  <input type="date" value={customStart} min={MIN_DATE} max={todayStr()}
                    onChange={(e) => { setCustomStart(e.target.value); if (customEnd && customEnd < e.target.value) setCustomEnd(e.target.value); }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">To</label>
                  <input type="date" value={customEnd} min={customStart || MIN_DATE} max={todayStr()}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            )}
          </div>

          {/* Search */}
          <div className="pt-4 border-t border-gray-100">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${tab}...`}
                className="w-full border border-gray-200 rounded-lg pl-8 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {search && (
                <button onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">✕</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Info bar (always visible when not in edit mode, not instant) */}
      {!showEdit && tab !== "instant" && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-5 flex items-center justify-between gap-3">
          <div className="flex items-start gap-2 text-xs text-blue-700">
            <span className="flex-shrink-0 mt-0.5">ℹ️</span>
            <span>
              {tab === "books"
                ? "QR encodes Accession No. — scan during Issue/Return."
                : tab === "students"
                  ? "QR encodes Student PIN — scan during Issue/Return."
                  : tab === "staff"
                    ? "QR encodes Staff CMS ID — scan during Issue/Return."
                    : "Custom saved QR codes. Newly added codes appear at top for 7 days."}
              {timeFilter !== "all" && (
                <span className="ml-2 font-semibold text-blue-800">
                  · {currentList.length} record{currentList.length !== 1 ? "s" : ""} for "{TIME_FILTERS.find(f => f.key === timeFilter)?.label}"
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400 flex-shrink-0">
            <span>{currentSize}px</span>
            <span>·</span>
            <span>{printCols} cols</span>
          </div>
        </div>
      )}

      {/* ── INSTANT TAB ── */}
      {tab === "instant" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-bold text-gray-800 mb-1">⚡ Instant QR Generator</h2>
            <p className="text-xs text-gray-400 mb-5">
              Type any value to generate a QR code instantly. Save to database if needed.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                  QR Value <span className="text-red-500">*</span>
                </label>
                <input type="text" value={instantValue} onChange={(e) => setInstantValue(e.target.value)}
                  placeholder="e.g. 23173-CM-001 or any text"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                  Label <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input type="text" value={instantLabel} onChange={(e) => setInstantLabel(e.target.value)}
                  placeholder="e.g. K. Sankar Rao — CME"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
              </div>
            </div>

            {instantValue.trim() ? (
              <div className="flex flex-col sm:flex-row items-start gap-6 p-5 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex flex-col items-center gap-2 flex-shrink-0" id="instant-qr-preview">
                  <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <QRCodeSVG value={instantValue.trim()} size={qrSize.instant || 160} level="M" />
                  </div>
                  <p className="text-xs text-gray-400">Size: {qrSize.instant || 160}px</p>
                  <input type="range" min={60} max={250} step={10}
                    value={qrSize.instant || 160}
                    onChange={(e) => setQrSize((s) => ({ ...s, instant: Number(e.target.value) }))}
                    className="w-32 accent-blue-600" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800">{instantLabel || instantValue}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{instantValue}</p>

                  {savedMsg && (
                    <div className="mt-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      {savedMsg}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3 mt-4">
                    <button onClick={handleSaveQR} disabled={saving}
                      className="text-sm font-bold px-5 py-2.5 rounded-xl text-white transition disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
                      {saving ? "Saving…" : "💾 Save to Saved QRs"}
                    </button>
                    <button
                      onClick={() => {
                        const svg = document.querySelector("#instant-qr-preview svg");
                        if (!svg) return;
                        const w = window.open("", "_blank", "width=400,height=500");
                        w.document.write(`<!DOCTYPE html><html><head><title>QR — ${instantValue}</title>
                          <style>body{font-family:Arial;text-align:center;padding:30px}svg{display:block;margin:0 auto}
                          h3{font-size:14px;font-weight:700;margin-top:12px;color:#111}p{font-size:11px;color:#666;margin-top:4px;font-family:monospace}
                          </style></head><body>${svg.outerHTML}<h3>${instantLabel || instantValue}</h3><p>${instantValue}</p></body></html>`);
                        w.document.close(); w.focus();
                        setTimeout(() => { w.print(); w.close(); }, 400);
                      }}
                      className="text-sm font-bold px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
                      🖨️ Print
                    </button>
                  </div>

                  <p className="text-xs text-gray-400 mt-3 bg-blue-50 rounded-lg px-3 py-2">
                    💡 Saving adds this to the <strong>Saved QRs</strong> tab for future use.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                <div className="text-5xl mb-3 opacity-30">🔲</div>
                <p className="text-gray-400 text-sm font-medium">Type a value above to generate a QR code</p>
              </div>
            )}
          </div>

          {/* Recent saved */}
          {savedQRs.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest px-2">
                  💾 Saved QRs ({savedQRs.length})
                </span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {sortedSaved.slice(0, 10).map((qr) => (
                  <div key={qr.id} className="bg-white border border-gray-100 rounded-xl p-3 flex flex-col items-center shadow-sm relative">
                    {isNew(qr) && (
                      <span className="absolute top-1.5 right-1.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">New</span>
                    )}
                    <button onClick={() => { setDeleteTarget(qr); setDeleteTyped(""); }}
                      className="absolute top-1.5 left-1.5 text-xs bg-red-50 hover:bg-red-100 text-red-500 px-1.5 py-0.5 rounded font-medium transition">
                      Delete
                    </button>
                    <div className="mt-4">
                      <QRCodeSVG value={qr.value || "unknown"} size={80} level="M" />
                    </div>
                    <p className="text-xs font-bold text-gray-700 text-center mt-2 truncate w-full">{qr.label || qr.value}</p>
                    <p className="text-xs text-gray-400 font-mono truncate w-full text-center">{qr.value}</p>
                    <p className="text-xs text-gray-300 mt-0.5">{timeAgo(qr)}</p>
                  </div>
                ))}
              </div>
              {savedQRs.length > 10 && (
                <p className="text-center text-xs text-blue-600 mt-3 cursor-pointer hover:underline"
                  onClick={() => setTab("saved")}>
                  View all {savedQRs.length} saved QR codes →
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ALL OTHER TABS ── */}
      {tab !== "instant" && (
        <>
          {currentList.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 py-20 text-center">
              <p className="text-5xl mb-4">{timeFilter !== "all" ? "🕐" : "🔍"}</p>
              <p className="text-gray-600 font-semibold text-base">No records found</p>
              <p className="text-gray-400 text-sm mt-1">
                {search
                  ? `No ${tab} match "${search}".`
                  : timeFilter !== "all"
                    ? `No ${tab} were added in the selected time period.`
                    : tab === "saved"
                      ? "No QR codes saved yet. Use ⚡ Instant to generate and save one."
                      : `No ${tab} have been added yet.`}
              </p>
              {(search || timeFilter !== "all") && (
                <div className="flex justify-center gap-3 mt-4">
                  {search && <button onClick={() => setSearch("")} className="text-xs text-blue-600 hover:underline">Clear search</button>}
                  {timeFilter !== "all" && <button onClick={() => setTimeFilter("all")} className="text-xs text-blue-600 hover:underline">Show all time</button>}
                </div>
              )}
            </div>
          ) : (
            <div id="qr-screen-grid" className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${currentSize + 48}px, 1fr))` }}>
              {currentList.map((item) => (
                <QRCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}