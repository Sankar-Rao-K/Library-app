import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import AdminLayout from "../../components/AdminLayout";
import SearchBar from "../../components/SearchBar";
import DoubleConfirmModal from "../../components/DoubleConfirmModal";
import {
  listenToBooks, listenToStudents, listenToStaff,
  listenToQRCodes, saveQRCode, deleteQRCode,
} from "../../firebase/firestore";
import { smartSearch } from "../../utils/searchUtils";

// ── Time filter helpers ───────────────────────────────────────────────
const TIME_FILTERS = [
  { key: "all",       label: "All Time"      },
  { key: "1h",        label: "Last 1 Hour"   },
  { key: "6h",        label: "Last 6 Hours"  },
  { key: "today",     label: "Today"         },
  { key: "yesterday", label: "Yesterday"     },
  { key: "week",      label: "This Week"     },
  { key: "custom",    label: "Custom Range"  },
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

const DEFAULT_SIZE = { books: 90, students: 120, staff: 120, saved: 120, instant: 160 };
const MIN_SIZE = 60;
const MAX_SIZE = 200;

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

  // QR size per tab
  const [qrSize, setQrSize] = useState({ ...DEFAULT_SIZE });
  const [printCols, setPrintCols] = useState(5);

  // ── Instant QR Generator state ────────────────────────────────────────
  const [instantValue, setInstantValue] = useState("");
  const [instantLabel, setInstantLabel] = useState("");
  const [saving, setSaving]             = useState(false);
  const [savedMsg, setSavedMsg]         = useState("");

  // ── Delete confirm ────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState(null); // saved QR to delete
  const [deleting, setDeleting]         = useState(false);

  useEffect(() => {
    const u1 = listenToBooks(setBooks);
    const u2 = listenToStudents(setStudents);
    const u3 = listenToStaff(setStaff);
    const u4 = listenToQRCodes(setSavedQRs);
    return () => { u1(); u2(); u3(); u4(); };
  }, []);

  const currentSize = qrSize[tab] || 100;

  // ── Filtered lists ────────────────────────────────────────────────────
  const q = search.trim();

  const searchedBooks = q
    ? smartSearch(books, q, ["title", "author", "accessionNo", "barcode"])
    : books;
  const searchedStudents = q
    ? smartSearch([...students].sort((a, b) => (a.pin||"").localeCompare(b.pin||"")), q, ["name", "pin", "branch"])
    : [...students].sort((a, b) => (a.pin||"").localeCompare(b.pin||""));
  const searchedStaff = q
    ? smartSearch([...staffList].sort((a, b) => (a.name||"").localeCompare(b.name||"")), q, ["name", "staffId", "section"])
    : [...staffList].sort((a, b) => (a.name||"").localeCompare(b.name||""));
  const searchedSaved = q
    ? savedQRs.filter((qr) =>
        qr.value?.toLowerCase().includes(q.toLowerCase()) ||
        qr.label?.toLowerCase().includes(q.toLowerCase())
      )
    : savedQRs;

  const filteredBooks    = applyTimeFilter(searchedBooks,    timeFilter, customStart, customEnd);
  const filteredStudents = applyTimeFilter(searchedStudents, timeFilter, customStart, customEnd);
  const filteredStaff    = applyTimeFilter(searchedStaff,    timeFilter, customStart, customEnd);
  const filteredSaved    = applyTimeFilter(searchedSaved,    timeFilter, customStart, customEnd);

  const currentList = tab === "books" ? filteredBooks
    : tab === "students" ? filteredStudents
    : tab === "staff"    ? filteredStaff
    : tab === "saved"    ? filteredSaved
    : [];

  // ── Save instant QR ───────────────────────────────────────────────────
  const handleSaveQR = async () => {
    if (!instantValue.trim()) return;
    setSaving(true);
    try {
      await saveQRCode({
        value:    instantValue.trim(),
        label:    instantLabel.trim() || instantValue.trim(),
        type:     "custom",
        linkedId: null,
      });
      setSavedMsg("✅ QR code saved! Find it in the Saved QRs tab.");
      setTimeout(() => setSavedMsg(""), 4000);
    } catch (err) {
      alert("Error saving: " + err.message);
    }
    setSaving(false);
  };

  // ── Delete saved QR ───────────────────────────────────────────────────
  const handleDeleteSaved = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteQRCode(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      alert("Error: " + err.message);
    }
    setDeleting(false);
  };

  // ── Download SVG ──────────────────────────────────────────────────────
  const downloadSVG = (value, filename) => {
    const tempDiv = document.createElement("div");
    const { createRoot } = require("react-dom/client");
    // Simpler: just use outerHTML from screen
    const svgEl = document.querySelector(`[data-qrval="${value}"] svg`);
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgData], { type: "image/svg+xml" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = filename + ".svg"; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Real print using cloned SVGs from screen ──────────────────────────
  const handleRealPrint = () => {
    const cards = document.querySelectorAll("#qr-screen-grid .qr-card-item");
    if (!cards.length && tab !== "instant") return;

    const gap   = Math.round(currentSize * 0.4);
    const cardW = currentSize + 56;

    const cardsHTML = Array.from(cards).map((el) => {
      const svg   = el.querySelector("svg");
      const title = el.querySelector(".qr-title")?.textContent || "";
      const sub   = el.querySelector(".qr-sub")?.textContent   || "";
      const code  = el.querySelector(".qr-code")?.textContent  || "";
      return `
        <div class="card">
          ${svg ? svg.outerHTML : ""}
          <div class="title">${title}</div>
          <div class="sub">${sub}</div>
          <div class="code">${code}</div>
        </div>`;
    }).join("");

    const fontSize = Math.max(9, Math.round(currentSize * 0.12));
    const subSize  = Math.max(8, Math.round(currentSize * 0.1));
    const w = window.open("", "_blank", "width=1100,height=800");

    w.document.write(`
      <!DOCTYPE html><html><head>
      <title>GP Anakapalli Library — QR Codes</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; padding: 20px; }
        .header { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #C9A227; padding-bottom: 12px; }
        .header h2 { font-size: 15px; color: #0D1F4E; }
        .header p  { font-size: 11px; color: #666; margin-top: 3px; }
        .meta { display: flex; justify-content: center; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
        .meta span { font-size: 10px; color: #888; background: #f3f4f6; padding: 3px 10px; border-radius: 20px; }
        .grid { display: grid; grid-template-columns: repeat(${printCols}, auto); gap: ${gap}px; justify-content: center; }
        .card { border: 1.5px solid #e5e7eb; border-radius: 10px; padding: 14px 10px 10px;
          text-align: center; width: ${cardW}px; page-break-inside: avoid; background: white; }
        .card svg { display: block; margin: 0 auto 8px; width: ${currentSize}px !important; height: ${currentSize}px !important; }
        .title { font-size: ${fontSize}px; font-weight: 700; color: #111; line-height: 1.3; margin-bottom: 3px; word-break: break-word; }
        .sub   { font-size: ${subSize}px; color: #666; margin-bottom: 2px; }
        .code  { font-family: monospace; font-size: ${subSize}px; font-weight: 700; color: #333;
          background: #f3f4f6; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-top: 4px; }
        @media print { body { padding: 8px; } .grid { gap: ${Math.max(gap, 16)}px; } }
      </style></head><body>
      <div class="header">
        <h2>📚 Govt. Polytechnic Anakapalli — Library QR Codes</h2>
        <p>${tab === "books" ? "Book Access Codes" : tab === "students" ? "Student PIN QR Cards" : tab === "staff" ? "Staff CMS ID QR Cards" : "Saved QR Codes"} · ${currentList.length} codes · ${new Date().toLocaleDateString("en-IN")}</p>
      </div>
      <div class="meta">
        <span>${tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
        <span>Size: ${currentSize}px</span>
        <span>Columns: ${printCols}</span>
        <span>${TIME_FILTERS.find(f => f.key === timeFilter)?.label || "All Time"}</span>
      </div>
      <div class="grid">${cardsHTML}</div>
      </body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 700);
  };

  // ── QR Card ────────────────────────────────────────────────────────────
  const QRCard = ({ item }) => {
    const qrVal = tab === "books"
      ? (item.accessionNo || item.barcode || item.id)
      : tab === "students" ? item.pin
      : tab === "staff"    ? item.staffId
      : item.value; // saved

    const title = tab === "books" ? item.title
      : tab === "saved" ? (item.label || item.value)
      : item.name;

    const sub = tab === "books"
      ? (item.author || "")
      : tab === "students"
        ? `${item.branch || ""} · ${item.year || ""}`
        : tab === "staff"
          ? `${item.designation || ""} · ${item.section || ""}`
          : item.value;

    const code = tab === "books"
      ? qrVal
      : tab === "students" ? `PIN: ${item.pin}`
      : tab === "staff"    ? `ID: ${item.staffId}`
      : qrVal;

    const ago = timeAgo(item);

    return (
      <div className="qr-card-item bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition flex flex-col items-center relative"
        style={{ padding: "14px 10px 10px" }}
        data-qrval={qrVal}>

        {ago === "Just now" && (
          <span className="absolute top-2 right-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">New</span>
        )}

        {/* Delete button for saved QRs */}
        {tab === "saved" && (
          <button
            onClick={() => setDeleteTarget(item)}
            className="absolute top-2 left-2 w-5 h-5 rounded-full bg-red-100 hover:bg-red-200 text-red-500 flex items-center justify-center text-xs transition">
            ✕
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

  // ─────────────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      {/* Delete confirmation */}
      {deleteTarget && (
        <DoubleConfirmModal
          title={`Delete saved QR code?`}
          description={`This will permanently delete the saved QR code for "${deleteTarget.label || deleteTarget.value}". This cannot be undone.`}
          confirmWord={deleteTarget.label || deleteTarget.value}
          askReason={false}
          onConfirm={handleDeleteSaved}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">QR Code Generator</h1>
          <p className="text-gray-500 text-sm mt-1">Filter, generate, save, and print QR codes.</p>
        </div>
        {tab !== "instant" && (
          <button onClick={handleRealPrint}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold transition"
            style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
            🖨️ Print {currentList.length > 0 ? `(${currentList.length})` : ""} QR Codes
          </button>
        )}
      </div>

      {/* ── Type Tabs ── */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { key: "books",    label: "📚 Books",      hint: "Accession No." },
          { key: "students", label: "🎓 Students",   hint: "PIN"           },
          { key: "staff",    label: "👩‍🏫 Staff",     hint: "CMS ID"        },
          { key: "saved",    label: `💾 Saved QRs`,  hint: `${savedQRs.length} saved` },
          { key: "instant",  label: "⚡ Instant",    hint: "Generate any QR" },
        ].map((t) => (
          <button key={t.key}
            onClick={() => { setTab(t.key); setSearch(""); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
              tab === t.key ? "text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
            style={tab === t.key ? { background: "linear-gradient(135deg, #0D1F4E, #1B4332)" } : {}}>
            {t.label}
            <span className="text-xs opacity-60 font-normal hidden sm:inline">({t.hint})</span>
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════ */}
      {/* ── INSTANT QR GENERATOR TAB ── */}
      {/* ══════════════════════════════════════════════════════ */}
      {tab === "instant" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-bold text-gray-800 mb-1">⚡ Instant QR Code Generator</h2>
            <p className="text-xs text-gray-400 mb-5">
              Type any value below to generate a QR code instantly. Optionally save it to the database for future use.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                  QR Value <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={instantValue}
                  onChange={(e) => setInstantValue(e.target.value)}
                  placeholder="e.g. 23173-CM-001 or any text/number"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                />
                <p className="text-xs text-gray-400 mt-1">This is what gets encoded into the QR code.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                  Label / Description <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={instantLabel}
                  onChange={(e) => setInstantLabel(e.target.value)}
                  placeholder="e.g. K. Sankar Rao — CME"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
                <p className="text-xs text-gray-400 mt-1">Shown on the QR card, not encoded.</p>
              </div>
            </div>

            {/* Live QR Preview */}
            {instantValue.trim() ? (
              <div className="flex flex-col sm:flex-row items-start gap-6 p-5 bg-gray-50 rounded-xl border border-gray-100">
                {/* QR Preview */}
                <div className="flex flex-col items-center gap-2 flex-shrink-0">
                  <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <QRCodeSVG value={instantValue.trim()} size={qrSize.instant} level="M" />
                  </div>
                  <p className="text-xs text-gray-400">Preview at {qrSize.instant}px</p>
                  <input
                    type="range" min={60} max={250} step={10}
                    value={qrSize.instant}
                    onChange={(e) => setQrSize((s) => ({ ...s, instant: Number(e.target.value) }))}
                    className="w-32 accent-blue-600"
                  />
                </div>

                {/* Info & Actions */}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 text-sm">{instantLabel || instantValue}</p>
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
                      {saving ? "Saving…" : "💾 Save to Database"}
                    </button>
                    <button
                      onClick={() => {
                        const svg = document.querySelector("#instant-qr-preview svg");
                        if (!svg) return;
                        const svgData = new XMLSerializer().serializeToString(svg);
                        const blob = new Blob([svgData], { type: "image/svg+xml" });
                        const url  = URL.createObjectURL(blob);
                        const a    = document.createElement("a");
                        a.href = url;
                        a.download = `QR_${instantValue.replace(/[^a-zA-Z0-9]/g, "_")}.svg`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="text-sm font-bold px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
                      ⬇️ Download SVG
                    </button>
                    <button
                      onClick={() => {
                        const svg = document.querySelector("#instant-qr-preview svg");
                        if (!svg) return;
                        const w = window.open("", "_blank", "width=400,height=500");
                        w.document.write(`
                          <!DOCTYPE html><html><head><title>QR — ${instantValue}</title>
                          <style>body{font-family:Arial;text-align:center;padding:30px}
                          svg{display:block;margin:0 auto}
                          h3{font-size:14px;font-weight:700;margin-top:12px;color:#111}
                          p{font-size:11px;color:#666;margin-top:4px;font-family:monospace}
                          </style></head><body>
                          ${svg.outerHTML}
                          <h3>${instantLabel || instantValue}</h3>
                          <p>${instantValue}</p>
                          </body></html>`);
                        w.document.close();
                        w.focus();
                        setTimeout(() => { w.print(); w.close(); }, 400);
                      }}
                      className="text-sm font-bold px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
                      🖨️ Print This QR
                    </button>
                  </div>

                  <div id="instant-qr-preview" className="hidden">
                    <QRCodeSVG value={instantValue.trim()} size={qrSize.instant} level="M" />
                  </div>

                  <p className="text-xs text-gray-400 mt-3 bg-blue-50 rounded-lg px-3 py-2">
                    💡 Saving stores this QR in the database permanently under the <strong>Saved QRs</strong> tab.
                    If linked to a student, it will be auto-deleted when the student is removed.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                <div className="text-5xl mb-3 opacity-30">🔲</div>
                <p className="text-gray-400 text-sm font-medium">Type any value above to generate a QR code</p>
                <p className="text-gray-300 text-xs mt-1">Student PIN, accession number, custom text — anything works</p>
              </div>
            )}
          </div>

          {/* Recently saved */}
          {savedQRs.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest px-2">
                  💾 Recently Saved ({savedQRs.length})
                </span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {[...savedQRs]
                  .sort((a, b) => (getTs(b) || 0) - (getTs(a) || 0))
                  .slice(0, 10)
                  .map((qr) => (
                    <div key={qr.id}
                      className="bg-white border border-gray-100 rounded-xl p-3 flex flex-col items-center shadow-sm relative">
                      <button onClick={() => setDeleteTarget(qr)}
                        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-red-100 hover:bg-red-200 text-red-500 flex items-center justify-center text-xs transition">
                        ✕
                      </button>
                      <QRCodeSVG value={qr.value || "unknown"} size={80} level="M" />
                      <p className="text-xs font-bold text-gray-700 text-center mt-2 truncate w-full">{qr.label || qr.value}</p>
                      <p className="text-xs text-gray-400 font-mono truncate w-full text-center">{qr.value}</p>
                      <p className="text-xs text-gray-300 mt-0.5">{timeAgo(qr)}</p>
                    </div>
                  ))}
              </div>
              {savedQRs.length > 10 && (
                <p className="text-center text-xs text-blue-600 mt-3 cursor-pointer hover:underline"
                  onClick={() => setTab("saved")}>
                  View all {savedQRs.length} saved QR codes in Saved QRs tab →
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* ── All other tabs (Books / Students / Staff / Saved) ── */}
      {/* ══════════════════════════════════════════════════════ */}
      {tab !== "instant" && (
        <>
          {/* Controls Panel */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6 space-y-5">

            {/* Time filter */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">🕐 Filter by Added Time</p>
              <div className="flex flex-wrap gap-2">
                {TIME_FILTERS.map((f) => {
                  const list = tab === "books" ? books : tab === "students" ? students : tab === "staff" ? staffList : savedQRs;
                  const cnt = f.key === "all" ? list.length : applyTimeFilter(list, f.key, "", "").length;
                  return (
                    <button key={f.key}
                      onClick={() => setTimeFilter(f.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                        timeFilter === f.key ? "text-white border-transparent" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}
                      style={timeFilter === f.key ? { background: "linear-gradient(135deg, #0D1F4E, #1B4332)" } : {}}>
                      {f.label}
                      {f.key !== "custom" && cnt > 0 && (
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
            </div>

            {/* QR Size + Columns */}
            <div className="flex flex-col sm:flex-row gap-5 pt-4 border-t border-gray-100">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">🔲 QR Code Size</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setQrSize((s) => ({ ...s, [tab]: DEFAULT_SIZE[tab] }))}
                      className="text-xs text-blue-600 hover:underline">Reset</button>
                    <span className="text-sm font-bold text-gray-700 w-12 text-right">{currentSize}px</span>
                  </div>
                </div>
                <input type="range" min={MIN_SIZE} max={MAX_SIZE} step={10} value={currentSize}
                  onChange={(e) => setQrSize((s) => ({ ...s, [tab]: Number(e.target.value) }))}
                  className="w-full accent-blue-600" />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>{MIN_SIZE}px</span>
                  <span className="text-blue-600 font-medium">
                    {tab === "books" ? "Books: 90px default" : "Members: 120px default"}
                  </span>
                  <span>{MAX_SIZE}px</span>
                </div>
              </div>

              <div className="sm:w-48">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">📐 Print Columns</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {[3, 4, 5, 6].map((n) => (
                    <button key={n} onClick={() => setPrintCols(n)}
                      className={`py-2 rounded-lg text-sm font-bold transition border ${
                        printCols === n ? "text-white border-transparent" : "bg-gray-50 text-gray-600 border-gray-200"
                      }`}
                      style={printCols === n ? { background: "linear-gradient(135deg, #0D1F4E, #1B4332)" } : {}}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Search */}
            <div className="pt-4 border-t border-gray-100">
              <SearchBar
                value={search}
                onChange={setSearch}
                placeholder={`Search ${tab}...`}
                resultCount={currentList.length}
                totalCount={tab === "books" ? books.length : tab === "students" ? students.length : tab === "staff" ? staffList.length : savedQRs.length}
              />
            </div>
          </div>

          {/* Info banner */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-5 text-xs text-blue-700 flex items-start gap-2">
            <span className="flex-shrink-0 mt-0.5">ℹ️</span>
            <span>
              {tab === "books"
                ? "QR contains Accession No. — scan during Issue/Return to auto-fill book code."
                : tab === "students"
                  ? "QR contains Student PIN — scan during Issue/Return to auto-identify student."
                  : tab === "staff"
                    ? "QR contains Staff CMS ID — scan during Issue/Return to auto-identify staff."
                    : "These are your manually saved custom QR codes. Delete with ✕ button on each card."}
              {timeFilter !== "all" && (
                <span className="ml-2 font-semibold text-blue-800">
                  Showing {currentList.length} record{currentList.length !== 1 ? "s" : ""} for: {TIME_FILTERS.find(f => f.key === timeFilter)?.label}
                </span>
              )}
            </span>
          </div>

          {/* Empty state */}
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
                      ? "No QR codes saved yet. Use the ⚡ Instant tab to generate and save one."
                      : `No ${tab} have been added yet.`}
              </p>
              {(search || timeFilter !== "all") && (
                <div className="flex justify-center gap-3 mt-4">
                  {search && <button onClick={() => setSearch("")} className="text-xs text-blue-600 hover:underline font-medium">Clear search</button>}
                  {timeFilter !== "all" && <button onClick={() => setTimeFilter("all")} className="text-xs text-blue-600 hover:underline font-medium">Show all time</button>}
                </div>
              )}
            </div>
          ) : (
            <div id="qr-screen-grid"
              className="grid gap-4"
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