import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import AdminLayout from "../../components/AdminLayout";
import SearchBar from "../../components/SearchBar";
import {
  listenToBooks, listenToStudents, listenToStaff,
  listenToQRCodes, saveQRCode, deleteQRCode,
} from "../../firebase/firestore";
import { smartSearch } from "../../utils/searchUtils";
import { getCatalogueFromBook, sortByAccession } from "../../utils/searchUtils";

// ── Constants ─────────────────────────────────────────────────────────
const MIN_DATE  = "2008-01-01";
const LS_COLS   = "qr_pref_cols";
const COLS_DEF  = 5;

function todayStr() { return new Date().toISOString().slice(0, 10); }
function loadCols() { try { return parseInt(localStorage.getItem(LS_COLS) || COLS_DEF, 10) || COLS_DEF; } catch { return COLS_DEF; } }
function saveCols(n) { try { localStorage.setItem(LS_COLS, String(n)); } catch {} }

// ── Time filter helpers ───────────────────────────────────────────────
const TIME_FILTERS = [
  { key: "all",       label: "All Time"  },
  { key: "today",     label: "Today"     },
  { key: "yesterday", label: "Yesterday" },
  { key: "week",      label: "This Week" },
  { key: "custom",    label: "Custom"    },
];

function getTs(item) {
  const ts = item?.createdAt;
  if (!ts) return null;
  if (ts.toDate) return ts.toDate().getTime();
  if (ts.seconds) return ts.seconds * 1000;
  return null;
}
function applyTimeFilter(items, key, cs, ce) {
  if (key === "all") return items;
  const now = Date.now(); const MS = { h: 3600000, d: 86400000 };
  const ts = new Date(); ts.setHours(0,0,0,0);
  const ys = new Date(ts - MS.d);
  let start = null, end = now;
  if (key === "today")     { start = ts.getTime(); }
  if (key === "yesterday") { start = ys.getTime(); end = ts.getTime() - 1; }
  if (key === "week")      { start = now - 7 * MS.d; }
  if (key === "custom")    { start = cs ? new Date(cs + "T00:00:00").getTime() : null; end = ce ? new Date(ce + "T23:59:59").getTime() : now; }
  return items.filter((i) => { const t = getTs(i); if (!t) return false; if (start && t < start) return false; if (t > end) return false; return true; });
}
function timeAgo(item) {
  const t = getTs(item); if (!t) return null;
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
  if (m < 1) return "Just now"; if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`; if (d < 7) return `${d}d ago`;
  return new Date(t).toLocaleDateString("en-IN");
}
function isNew(item) { const t = getTs(item); return t ? Date.now() - t < 7 * 86400000 : false; }

// ── Category helpers ──────────────────────────────────────────────────
function getBookCatGroups(books) {
  const groups = {};
  books.forEach((b) => {
    const cat = getCatalogueFromBook(b);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(b);
  });
  return groups;
}
function getStudentCatGroups(students) {
  const g = { all: students, CME: [], ECE: [] };
  students.forEach((s) => {
    const br = (s.branch || "").toUpperCase();
    if (br.includes("CME")) g.CME.push(s); else g.ECE.push(s);
  });
  return g;
}
function getStaffCatGroups(staff) {
  const secs = ["ECE","CME","GENERAL","OFFICE","OTHER"];
  const g = { all: staff };
  secs.forEach((s) => { g[s] = []; });
  staff.forEach((s) => {
    const sec = (s.section || "OTHER").toUpperCase();
    if (g[sec]) g[sec].push(s); else g.OTHER.push(s);
  });
  return g;
}

// ═══════════════════════════════════════════════════════════════════════
// A4-24 LABEL PRINT  —  exact measurements
// ═══════════════════════════════════════════════════════════════════════
// A4 label sheet specification:
//   Box Width:        6.467 cm
//   Box Height:       3.4625 cm
//   Horizontal Gap:   0.3 cm  (between columns)
//   Vertical Gap:     0 cm    (rows touch)
//   Page margins:     Top 1cm · Bottom 1cm · Left 0.5cm · Right 0.5cm
//   Layout:           3 columns × 8 rows = 24 labels per A4 page
//   Math check:
//     Width:  3 × 6.467 + 2 × 0.3 = 19.401 + 0.6 = 20.001 cm ≈ 20 cm (21cm - 2×0.5cm) ✓
//     Height: 8 × 3.4625 = 27.7 cm (29.7cm - 2×1cm) ✓
function printA4Labels(items, tab, catLabel) {
  const labelHtmlArr = items.map((item) => {
    const qrVal = tab === "books"
      ? (item.accessionNo || item.barcode || item.id)
      : tab === "students" ? item.pin
      : tab === "staff"    ? item.staffId
      : item.value;

    const name = tab === "books"    ? (item.title || "")
               : tab === "students" ? (item.name  || "")
               : tab === "staff"    ? (item.name  || "")
               : (item.label || item.value || "");

    const sub = tab === "books"
      ? (item.author || "")
      : tab === "students"
        ? `${item.branch || ""} · ${item.year || ""}`
        : tab === "staff"
          ? `${item.designation || ""} · ${item.section || ""}`
          : "";

    const code = tab === "books"
      ? (item.accessionNo || item.barcode || "")
      : tab === "students" ? `PIN: ${item.pin}`
      : tab === "staff"    ? `ID: ${item.staffId}`
      : qrVal;

    // Grab rendered SVG from screen DOM
    const escaped = CSS.escape(String(qrVal));
    const svgEl   = document.querySelector(`[data-qrval="${escaped}"] svg`);
    const svgStr  = svgEl ? svgEl.outerHTML
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" fill="#eee"/><text x="50" y="55" text-anchor="middle" font-size="10" fill="#999">QR</text></svg>`;

    return `<div class="label">
      <div class="qr-col">${svgStr}</div>
      <div class="text-col">
        <div class="lname" title="${name}">${name}</div>
        ${sub ? `<div class="lsub" title="${sub}">${sub}</div>` : ""}
        <div class="lcode" title="${code}">${code}</div>
      </div>
    </div>`;
  });

  const typeLabel = tab === "books"    ? `Books — ${catLabel}`
                  : tab === "students" ? `Students — ${catLabel}`
                  : tab === "staff"    ? `Staff — ${catLabel}`
                  : "Saved QR Codes";

  const w = window.open("", "_blank", "width=960,height=720");
  w.document.write(`<!DOCTYPE html><html><head>
  <meta charset="UTF-8">
  <title>QR Labels — Govt. Polytechnic Anakapalli</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: white; }

    /* ── Screen header (hidden when printing) ── */
    .screen-header {
      text-align: center; padding: 8mm 8mm 4mm;
      border-bottom: 1pt solid #C9A227; margin-bottom: 5mm;
    }
    .screen-header h2 { font-size: 13pt; color: #0D1F4E; font-weight: 700; }
    .screen-header p  { font-size: 9pt; color: #555; margin-top: 2pt; }
    .btn-row { text-align: center; padding: 5mm 0 4mm; }
    .btn { padding: 7pt 24pt; font-size: 11pt; font-weight: 700; cursor: pointer;
           background: #0D1F4E; color: white; border: none; border-radius: 6pt; }
    @media print { .screen-header, .btn-row { display: none; } }

    /* ── Page layout ── */
    @page {
      size: A4 portrait;
      margin: 1cm 0.5cm;   /* top/bottom 1cm · left/right 0.5cm */
    }

    /* ── Label grid ── */
    .sheet {
      display: grid;
      grid-template-columns: repeat(3, 6.467cm);
      grid-auto-rows: 3.4625cm;
      column-gap: 0.3cm;
      row-gap: 0;
      width: 20.001cm;   /* 3×6.467 + 2×0.3 = 20.001 cm */
    }

    /* ── Individual label ── */
    .label {
      width: 6.467cm;
      height: 3.4625cm;
      border: 0.3pt solid #ccc;
      box-sizing: border-box;
      display: flex;
      flex-direction: row;
      align-items: center;
      padding: 4mm;           /* 4mm padding on all 4 sides */
      gap: 3mm;
      overflow: hidden;
      page-break-inside: avoid;
    }

    /* ── QR column (left) ── */
    .qr-col {
      flex-shrink: 0;
      width: 25mm;
      height: 25mm;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qr-col svg {
      width: 25mm !important;
      height: 25mm !important;
      display: block;
    }

    /* ── Text column (right) ── */
    .text-col {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 1mm;
    }

    /* Name / Title — bigger */
    .lname {
      font-size: 9pt;
      font-weight: 700;
      color: #111;
      line-height: 1.3;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    /* Sub-info (author / branch) */
    .lsub {
      font-size: 8pt;
      color: #444;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Code / accession / PIN — bigger + bg */
    .lcode {
      font-family: 'Courier New', Courier, monospace;
      font-size: 8.5pt;
      font-weight: 700;
      color: #111;
      background: #f0f0f0;
      padding: 1mm 2mm;
      border-radius: 1.5mm;
      display: inline-block;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  </style></head><body>

  <div class="screen-header">
    <h2>Govt. Polytechnic Anakapalli — Library QR Labels</h2>
    <p>${typeLabel} &nbsp;·&nbsp; ${items.length} labels
       &nbsp;·&nbsp; 3 cols × 8 rows = 24 per A4
       &nbsp;·&nbsp; 6.467 cm × 3.4625 cm each
       &nbsp;·&nbsp; ${new Date().toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" })}
    </p>
  </div>
  <div class="btn-row"><button class="btn" onclick="window.print()">🖨️ Print Labels</button></div>

  <div class="sheet">
    ${labelHtmlArr.join("")}
    ${Array(Math.ceil(items.length / 24) * 24 - items.length)
        .fill('<div class="label"></div>').join("")}
  </div>

  </body></html>`);
  w.document.close();
  w.focus();
}

// ── Standard grid print ───────────────────────────────────────────────
function printStandardGrid(items, tab, catLabel, printCols) {
  const cards = document.querySelectorAll("#qr-screen-grid .qr-card-item");
  if (!cards.length) return;
  const cardsHTML = Array.from(cards).map((el) => {
    const svg  = el.querySelector("svg");
    const name = el.querySelector(".qr-title")?.textContent || "";
    const sub  = el.querySelector(".qr-sub")?.textContent   || "";
    const code = el.querySelector(".qr-code")?.textContent  || "";
    return `<div class="card">${svg ? svg.outerHTML : ""}
      <div class="title">${name}</div>
      <div class="sub">${sub}</div>
      <div class="code">${code}</div>
    </div>`;
  }).join("");
  const typeLabel = tab === "books"    ? `Books — ${catLabel}`
                  : tab === "students" ? `Students — ${catLabel}`
                  : tab === "staff"    ? `Staff — ${catLabel}`
                  : "Saved QR Codes";
  const w = window.open("", "_blank", "width=1100,height=800");
  w.document.write(`<!DOCTYPE html><html><head><title>QR Codes — Govt. Polytechnic Anakapalli</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial;padding:20px}
    .header{text-align:center;border-bottom:2px solid #C9A227;margin-bottom:14px;padding-bottom:10px}
    .header h2{font-size:14px;font-weight:700;color:#0D1F4E}
    .header p{font-size:10px;color:#666;margin-top:2px}
    .grid{display:grid;grid-template-columns:repeat(${printCols},auto);gap:12px;justify-content:center}
    .card{border:1.5px solid #e5e7eb;border-radius:10px;padding:14px 10px 10px;text-align:center;page-break-inside:avoid;background:white}
    .card svg{display:block;margin:0 auto 8px}
    .title{font-size:11px;font-weight:700;color:#111;line-height:1.3;margin-bottom:3px;word-break:break-word}
    .sub{font-size:10px;color:#666;margin-bottom:2px}
    .code{font-family:monospace;font-size:10px;font-weight:700;color:#333;background:#f3f4f6;padding:2px 8px;border-radius:4px;display:inline-block;margin-top:4px}
    @media print{body{padding:8px}}
  </style></head><body>
  <div class="header">
    <h2>Govt. Polytechnic Anakapalli — Library QR Codes</h2>
    <p>${typeLabel} · ${items.length} codes · ${new Date().toLocaleDateString("en-IN")}</p>
  </div>
  <div class="grid">${cardsHTML}</div>
  </body></html>`);
  w.document.close(); w.focus();
  setTimeout(() => { w.print(); w.close(); }, 600);
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function QRCodes() {
  const [books,    setBooks]    = useState([]);
  const [students, setStudents] = useState([]);
  const [staffList, setStaff]   = useState([]);
  const [savedQRs, setSavedQRs] = useState([]);

  const [tab,         setTab]         = useState("books");
  const [search,      setSearch]      = useState("");
  const [catFilter,   setCatFilter]   = useState("all");
  const [printFormat, setPrintFormat] = useState("labels");
  const [timeFilter,  setTimeFilter]  = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd,   setCustomEnd]   = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [printCols,   setPrintCols]   = useState(loadCols);

  // Instant QR
  const [instantValue, setInstantValue] = useState("");
  const [instantLabel, setInstantLabel] = useState("");
  const [saving,       setSaving]       = useState(false);
  const [savedMsg,     setSavedMsg]     = useState("");

  // Delete
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteTyped,  setDeleteTyped]  = useState("");
  const [deleting,     setDeleting]     = useState(false);

  useEffect(() => {
    const u1 = listenToBooks(setBooks);
    const u2 = listenToStudents(setStudents);
    const u3 = listenToStaff(setStaff);
    const u4 = listenToQRCodes(setSavedQRs);
    return () => { u1(); u2(); u3(); u4(); };
  }, []);

  useEffect(() => { saveCols(printCols); }, [printCols]);
  useEffect(() => { setCatFilter("all"); }, [tab]);

  // ── Category groups ──────────────────────────────────────────────────
  const bookGroups    = getBookCatGroups(books);
  const studentGroups = getStudentCatGroups(students);
  const staffGroups   = getStaffCatGroups(staffList);

  // ── Base list for current tab + category ────────────────────────────
  const q = search.trim();

  const getBaseForTab = () => {
    if (tab === "books") {
      const pool = catFilter === "all" ? books : (bookGroups[catFilter] || []);
      const searched = q ? smartSearch(pool, q, ["title","author","accessionNo","barcode","subject"]) : pool;
      return sortByAccession(searched);
    }
    if (tab === "students") {
      const pool = catFilter === "all" ? students : (studentGroups[catFilter] || []);
      const searched = q ? smartSearch(pool, q, ["name","pin","branch"]) : pool;
      return [...searched].sort((a, b) => (a.pin||"").localeCompare(b.pin||""));
    }
    if (tab === "staff") {
      const pool = catFilter === "all" ? staffList : (staffGroups[catFilter] || []);
      const ORDER = ["ECE","CME","GENERAL","OFFICE","OTHER"];
      const searched = q ? smartSearch(pool, q, ["name","staffId","section"]) : pool;
      return [...searched].sort((a, b) => {
        const si = ORDER.indexOf(a.section) - ORDER.indexOf(b.section);
        return si !== 0 ? si : (a.name||"").localeCompare(b.name||"");
      });
    }
    if (tab === "saved") {
      const base = q ? savedQRs.filter((r) => r.value?.toLowerCase().includes(q.toLowerCase()) || r.label?.toLowerCase().includes(q.toLowerCase())) : savedQRs;
      return [...base].sort((a, b) => {
        const aN = isNew(a), bN = isNew(b);
        if (aN && !bN) return -1; if (!aN && bN) return 1;
        if (aN && bN) return (getTs(b)||0) - (getTs(a)||0);
        return (a.label||a.value||"").localeCompare(b.label||b.value||"");
      });
    }
    return [];
  };

  const currentList = applyTimeFilter(getBaseForTab(), timeFilter, customStart, customEnd);
  const catLabel    = catFilter === "all" ? "All" : catFilter;

  // ── Category buttons ─────────────────────────────────────────────────
  const getCatButtons = () => {
    if (tab === "books") {
      const allCats = Object.keys(bookGroups).sort((a, b) => {
        const pri = { "BB Catalogue": 50, "Donated Books": 40 };
        return (pri[a] ?? 0) - (pri[b] ?? 0) || a.localeCompare(b);
      });
      return [{ key: "all", label: "All", count: books.length }, ...allCats.map((c) => ({ key: c, label: c, count: bookGroups[c].length }))];
    }
    if (tab === "students") return [
      { key: "all", label: "All",         count: students.length        },
      { key: "CME", label: "🎓 CME",      count: studentGroups.CME.length },
      { key: "ECE", label: "🎓 ECE",      count: studentGroups.ECE.length },
    ];
    if (tab === "staff") return [
      { key: "all",     label: "All",            count: staffList.length        },
      { key: "ECE",     label: "🏛 ECE Section", count: staffGroups.ECE.length  },
      { key: "CME",     label: "🏛 CME Section", count: staffGroups.CME.length  },
      { key: "GENERAL", label: "🏛 General",     count: staffGroups.GENERAL.length },
      { key: "OFFICE",  label: "🏛 Office",      count: staffGroups.OFFICE.length  },
    ];
    return [];
  };

  const handleSaveQR = async () => {
    if (!instantValue.trim()) return;
    setSaving(true);
    try {
      await saveQRCode({ value: instantValue.trim(), label: instantLabel.trim() || instantValue.trim(), type: "custom", linkedId: null });
      setSavedMsg("✅ Saved to Saved QRs tab.");
      setTimeout(() => setSavedMsg(""), 4000);
    } catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  };

  const handleDeleteSaved = async () => {
    if (!deleteTarget) return;
    const exp = (deleteTarget.label || deleteTarget.value || "").trim().toLowerCase();
    if (deleteTyped.trim().toLowerCase() !== exp) return;
    setDeleting(true);
    try { await deleteQRCode(deleteTarget.id); setDeleteTarget(null); setDeleteTyped(""); }
    catch (err) { alert("Error: " + err.message); }
    setDeleting(false);
  };

  const handlePrint = () => {
    if (currentList.length === 0) return;
    if (printFormat === "labels") printA4Labels(currentList, tab, catLabel);
    else                          printStandardGrid(currentList, tab, catLabel, printCols);
  };

  // ── Screen label card (proportional preview of 6.467:3.4625 ≈ 1.87:1) ──
  // Preview width 252px → height = 252/1.87 ≈ 135px
  const PREVIEW_W = 252;
  const PREVIEW_H = 135;
  const QR_SCREEN = 66;   // ≈ 25mm at screen scale

  const QRCard = ({ item }) => {
    const qrVal = tab === "books"
      ? (item.accessionNo || item.barcode || item.id)
      : tab === "students" ? item.pin
      : tab === "staff"    ? item.staffId
      : item.value;

    const name  = tab === "books"    ? item.title
                : tab === "saved"    ? (item.label || item.value)
                : item.name;
    const sub   = tab === "books"
      ? (item.author || "")
      : tab === "students" ? `${item.branch||""} · ${item.year||""}`
      : tab === "staff"    ? `${item.designation||""} · ${item.section||""}`
      : item.value;
    const code  = tab === "books"
      ? (item.accessionNo || item.barcode || "")
      : tab === "students" ? `PIN: ${item.pin}`
      : tab === "staff"    ? `ID: ${item.staffId}`
      : qrVal;

    const ago    = timeAgo(item);
    const newBdg = isNew(item);

    if (printFormat === "labels") {
      return (
        <div
          className="qr-card-item bg-white border border-gray-200 rounded-lg shadow-sm flex flex-row items-center relative overflow-hidden"
          style={{ width: PREVIEW_W, height: PREVIEW_H, padding: "10px", gap: "8px", flexShrink: 0 }}
          data-qrval={qrVal}
        >
          {newBdg && <span className="absolute top-1 right-1 text-xs bg-green-100 text-green-700 px-1 py-0.5 rounded-full font-bold" style={{ fontSize:"9px" }}>New</span>}
          {tab === "saved" && (
            <button onClick={() => { setDeleteTarget(item); setDeleteTyped(""); }}
              className="absolute top-1 left-1 text-xs bg-red-50 hover:bg-red-100 text-red-500 px-1 py-0.5 rounded font-medium transition" style={{ fontSize:"9px" }}>
              Delete
            </button>
          )}
          {/* QR left */}
          <div className="flex-shrink-0 flex items-center justify-center" style={{ width: QR_SCREEN, height: QR_SCREEN }}>
            <QRCodeSVG value={qrVal || "unknown"} size={QR_SCREEN} level="M" />
          </div>
          {/* Text right */}
          <div className="flex-1 min-w-0 flex flex-col justify-center" style={{ gap: "3px" }}>
            <p className="font-bold text-gray-800 leading-tight line-clamp-2" style={{ fontSize: "11px" }}>{name}</p>
            {sub && <p className="text-gray-500 truncate" style={{ fontSize: "10px" }}>{sub}</p>}
            <p className="font-mono font-bold text-gray-800 bg-gray-100 px-1.5 py-0.5 rounded inline-block w-fit" style={{ fontSize: "10px" }}>{code}</p>
          </div>
        </div>
      );
    }

    // Standard vertical card
    const sz = 100;
    return (
      <div
        className="qr-card-item bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition flex flex-col items-center relative"
        style={{ padding: "14px 10px 10px" }}
        data-qrval={qrVal}
      >
        {newBdg && <span className="absolute top-1.5 right-1.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold leading-none">New</span>}
        {tab === "saved" && (
          <button onClick={() => { setDeleteTarget(item); setDeleteTyped(""); }}
            className="absolute top-1.5 left-1.5 text-xs bg-red-50 hover:bg-red-100 text-red-500 px-1.5 py-0.5 rounded font-medium transition">
            Delete
          </button>
        )}
        <QRCodeSVG value={qrVal || "unknown"} size={sz} level="M" />
        <p className="qr-title text-center font-bold text-gray-800 leading-tight mt-2 line-clamp-2 w-full" style={{ fontSize:"11px" }}>{name}</p>
        <p className="qr-sub text-center text-gray-400 mt-0.5 truncate w-full" style={{ fontSize:"10px" }}>{sub}</p>
        <p className="qr-code text-center font-mono font-bold text-gray-600 mt-1 bg-gray-50 px-2 py-0.5 rounded w-full truncate" style={{ fontSize:"10px" }}>{code}</p>
        {ago && timeFilter !== "all" && <p className="text-center mt-1 text-gray-300" style={{ fontSize:"9px" }}>{ago}</p>}
      </div>
    );
  };

  const ACTIVE = { background: "linear-gradient(135deg, #0D1F4E, #1B4332)" };

  return (
    <AdminLayout>

      {/* Delete modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-red-600 px-5 py-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-lg">🗑️</div>
              <div><p className="font-bold text-white text-sm">Delete QR Code?</p><p className="text-red-200 text-xs">Cannot be undone</p></div>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-600">
                Type <span className="font-mono font-bold bg-gray-100 px-1 rounded">{deleteTarget.label || deleteTarget.value}</span> to confirm.
              </p>
              <input type="text" value={deleteTyped} onChange={(e) => setDeleteTyped(e.target.value)} placeholder="Type to confirm..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              <div className="flex gap-2">
                <button onClick={() => { setDeleteTarget(null); setDeleteTyped(""); }}
                  className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm">Cancel</button>
                <button onClick={handleDeleteSaved}
                  disabled={deleteTyped.trim().toLowerCase() !== (deleteTarget.label||deleteTarget.value||"").trim().toLowerCase() || deleting}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white py-2 rounded-lg text-sm font-bold transition">
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">QR Code Generator</h1>
          <p className="text-gray-500 text-sm mt-1">Generate, filter by category, and print QR labels.</p>
        </div>

        {tab !== "instant" && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 flex-wrap">
            {/* Format toggle */}
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
              <button onClick={() => setPrintFormat("labels")}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition ${printFormat === "labels" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}>
                📋 A4-24 Labels
                <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full text-xs font-bold leading-none">
                  6.47×3.46 cm
                </span>
              </button>
              <button onClick={() => setPrintFormat("grid")}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition ${printFormat === "grid" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}>
                ⊞ Standard Grid
              </button>
            </div>
            <button onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold" style={ACTIVE}>
              🖨️ Print {currentList.length > 0 ? `(${currentList.length})` : ""}
            </button>
            <button onClick={() => setShowSettings(!showSettings)}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold border transition ${showSettings ? "bg-blue-600 text-white border-blue-600" : "bg-white border-gray-200 text-gray-600"}`}>
              ⚙️ Settings
            </button>
          </div>
        )}
      </div>

      {/* Label format info */}
      {tab !== "instant" && printFormat === "labels" && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 text-xs text-blue-800 flex items-start gap-2">
          <span className="flex-shrink-0 mt-0.5">📐</span>
          <span>
            <strong>A4-24 Label Sheet</strong> — 3 columns × 8 rows = 24 labels per page.
            Each label <strong>6.467 cm × 3.4625 cm</strong> · Gap 0.3 cm · Margins 1 cm top/bottom, 0.5 cm left/right.
            QR on <strong>left</strong> (25mm) · Name, sub-info, code on <strong>right</strong> · 4 mm padding all sides.
          </span>
        </div>
      )}

      {/* Type tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { key: "books",    label: "📚 Books",     hint: `${books.length}`     },
          { key: "students", label: "🎓 Students",  hint: `${students.length}`  },
          { key: "staff",    label: "👩‍🏫 Staff",    hint: `${staffList.length}` },
          { key: "saved",    label: "💾 Saved QRs", hint: `${savedQRs.length}`   },
          { key: "instant",  label: "⚡ Instant",   hint: "Generate"            },
        ].map((t) => (
          <button key={t.key}
            onClick={() => { setTab(t.key); setSearch(""); setCatFilter("all"); setShowSettings(false); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${tab === t.key ? "text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
            style={tab === t.key ? ACTIVE : {}}>
            {t.label}
            <span className="text-xs opacity-60 font-normal hidden sm:inline">({t.hint})</span>
          </button>
        ))}
      </div>

      {/* Category filter buttons */}
      {(tab === "books" || tab === "students" || tab === "staff") && (
        <div className="flex gap-2 mb-4 flex-wrap items-center">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wide mr-1">Category:</span>
          {getCatButtons().map(({ key, label, count }) => (
            <button key={key} onClick={() => setCatFilter(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${catFilter === key ? "text-white border-transparent" : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"}`}
              style={catFilter === key ? ACTIVE : {}}>
              {label}
              {count > 0 && <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold leading-none ${catFilter === key ? "bg-white/25 text-white" : "bg-gray-100 text-gray-500"}`}>{count}</span>}
            </button>
          ))}
        </div>
      )}

      {/* ── INSTANT TAB ── */}
      {tab === "instant" && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-bold text-gray-800 mb-1">⚡ Instant QR Generator</h2>
            <p className="text-xs text-gray-400 mb-5">Type any value to generate a QR instantly. Save to database if needed.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">QR Value <span className="text-red-500">*</span></label>
                <input type="text" value={instantValue} onChange={(e) => setInstantValue(e.target.value)} placeholder="e.g. 23173-CM-001 or any text"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">Label <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="text" value={instantLabel} onChange={(e) => setInstantLabel(e.target.value)} placeholder="e.g. K. Sankar Rao"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {instantValue.trim() ? (
              <div className="flex flex-col sm:flex-row items-start gap-6 p-5 bg-gray-50 rounded-xl border border-gray-100">
                {/* Label preview at exact proportions */}
                <div>
                  <p className="text-xs text-gray-400 mb-2 text-center">Label preview (6.467×3.4625 cm)</p>
                  <div className="bg-white border border-gray-300 rounded-lg flex flex-row items-center overflow-hidden"
                    style={{ width: PREVIEW_W, height: PREVIEW_H, padding: "10px", gap: "8px" }}>
                    <div className="flex-shrink-0 flex items-center justify-center" style={{ width: QR_SCREEN, height: QR_SCREEN }}>
                      <QRCodeSVG value={instantValue.trim()} size={QR_SCREEN} level="M" />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center" style={{ gap: "3px" }}>
                      <p className="font-bold text-gray-800 leading-tight line-clamp-2" style={{ fontSize:"11px" }}>{instantLabel || instantValue}</p>
                      <p className="font-mono font-bold text-gray-800 bg-gray-100 px-1.5 py-0.5 rounded inline-block" style={{ fontSize:"10px" }}>{instantValue}</p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  {savedMsg && <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">{savedMsg}</div>}
                  <div className="flex flex-wrap gap-3 mt-2">
                    <button onClick={handleSaveQR} disabled={saving}
                      className="text-sm font-bold px-5 py-2.5 rounded-xl text-white disabled:opacity-50" style={ACTIVE}>
                      {saving ? "Saving…" : "💾 Save to Database"}
                    </button>
                    <button onClick={() => printA4Labels([{
                      value: instantValue.trim(), label: instantLabel.trim() || instantValue.trim(),
                      accessionNo: instantValue, barcode: instantValue, pin: instantValue,
                      staffId: instantValue, title: instantLabel || instantValue,
                      name: instantLabel || instantValue, author: "", id: "instant",
                    }], "instant", "Instant")}
                      className="text-sm font-bold px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50">
                      🖨️ Print Label
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-3 bg-blue-50 rounded-lg px-3 py-2">
                    💡 Saving stores this QR permanently in the <strong>Saved QRs</strong> tab.
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
        </div>
      )}

      {/* ── ALL OTHER TABS ── */}
      {tab !== "instant" && (
        <>
          {/* Settings panel */}
          {showSettings && (
            <div className="bg-white rounded-xl shadow-sm border border-blue-100 p-5 mb-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <span>⚙️</span>
                <h3 className="text-sm font-bold text-gray-800">Print Settings</h3>
                <span className="text-xs text-gray-400 ml-1">— auto-saved</span>
              </div>

              {printFormat === "grid" && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Print Columns (Standard Grid)</p>
                  <div className="flex gap-2">
                    {[3,4,5,6].map((n) => (
                      <button key={n} onClick={() => setPrintCols(n)}
                        className={`w-10 h-10 rounded-lg text-sm font-bold border transition ${printCols === n ? "text-white border-transparent" : "bg-gray-50 text-gray-600 border-gray-200"}`}
                        style={printCols === n ? ACTIVE : {}}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Filter by Time Added</p>
                <div className="flex flex-wrap gap-2">
                  {TIME_FILTERS.map((f) => (
                    <button key={f.key} onClick={() => setTimeFilter(f.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${timeFilter === f.key ? "text-white border-transparent" : "bg-gray-50 text-gray-600 border-gray-200"}`}
                      style={timeFilter === f.key ? ACTIVE : {}}>
                      {f.label}
                    </button>
                  ))}
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

              <div className="pt-3 border-t border-gray-100">
                <SearchBar value={search} onChange={setSearch} placeholder={`Search ${tab}...`}
                  resultCount={currentList.length}
                  totalCount={tab==="books"?books.length:tab==="students"?students.length:tab==="staff"?staffList.length:savedQRs.length} />
              </div>
            </div>
          )}

          {!showSettings && (
            <SearchBar value={search} onChange={setSearch} placeholder={`Search ${tab}...`}
              resultCount={currentList.length}
              totalCount={tab==="books"?books.length:tab==="students"?students.length:tab==="staff"?staffList.length:savedQRs.length}
              className="mb-4" />
          )}

          {/* Sort info */}
          {currentList.length > 0 && (
            <p className="text-xs text-gray-400 mb-3">
              {currentList.length} {tab}
              {catFilter !== "all" ? ` in "${catLabel}"` : ""}
              {" · sorted by "}
              {tab === "books" ? "accession number ↑" : tab === "students" ? "PIN ↑" : "name A–Z"}
              {" · "}
              {printFormat === "labels"
                ? `A4-24 labels (6.467×3.4625 cm · 24 per sheet)`
                : `Standard grid · ${printCols} cols`}
            </p>
          )}

          {/* Empty state */}
          {currentList.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 py-20 text-center">
              <p className="text-5xl mb-4">🔍</p>
              <p className="text-gray-600 font-semibold text-base">No records found</p>
              <p className="text-gray-400 text-sm mt-1">
                {search ? `No ${tab} match "${search}".` : `No ${tab} in "${catLabel}".`}
              </p>
              <div className="flex justify-center gap-3 mt-4">
                {search && <button onClick={() => setSearch("")} className="text-xs text-blue-600 hover:underline">Clear search</button>}
                {catFilter !== "all" && <button onClick={() => setCatFilter("all")} className="text-xs text-blue-600 hover:underline">Show all</button>}
              </div>
            </div>
          ) : (
            <>
              <div
                id="qr-screen-grid"
                className="grid gap-3"
                style={printFormat === "labels"
                  ? { gridTemplateColumns: `repeat(auto-fill, minmax(${PREVIEW_W}px, 1fr))` }
                  : { gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }
                }>
                {currentList.map((item) => <QRCard key={item.id} item={item} />)}
              </div>

              {/* Print bar */}
              <div className="mt-5 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-xs text-blue-700">
                  {printFormat === "labels"
                    ? `${Math.ceil(currentList.length/24)} A4 sheet${Math.ceil(currentList.length/24)>1?"s":""} · ${currentList.length} labels · 6.467 cm × 3.4625 cm`
                    : `${currentList.length} QR codes in standard grid`}
                </p>
                <button onClick={handlePrint}
                  className="text-xs font-bold px-4 py-2 rounded-lg text-white flex-shrink-0" style={ACTIVE}>
                  🖨️ Print Now
                </button>
              </div>
            </>
          )}
        </>
      )}
    </AdminLayout>
  );
}