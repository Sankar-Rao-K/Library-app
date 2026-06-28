import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import AdminLayout from "../../components/AdminLayout";
import {
  listenToStudents, addStudent, addStudentsBatch,
  updateStudent, deleteStudent, autoDeletePassedOutStudents,
} from "../../firebase/firestore";
import {
  smartSearch, getHighlightSegments, debounce,
} from "../../utils/searchUtils";
import { getStudentInfo, SEM_LABELS, SEM_ORDER } from "../../utils/studentUtils";

const EMPTY_FORM = { name: "", pin: "", branch: "CME", year: "", email: "" };

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

// ── Semester badge ────────────────────────────────────────────────────
function SemBadge({ pin }) {
  const { label, isPassedOut } = getStudentInfo(pin);
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${
      isPassedOut
        ? "bg-red-100 text-red-600"
        : "bg-blue-50 text-blue-700"
    }`}>
      {label}
    </span>
  );
}

// ── Group header colour ───────────────────────────────────────────────
function groupStyle(semNum) {
  if (semNum === "passed") return { divider: "bg-red-200",    text: "text-red-600",    badge: "bg-red-100 text-red-600",    border: "border-red-100"    };
  if (semNum === 1 || semNum === 2) return { divider: "bg-green-200",  text: "text-green-700",  badge: "bg-green-100 text-green-700",  border: "border-green-100"  };
  if (semNum === 3 || semNum === 4) return { divider: "bg-blue-200",   text: "text-blue-700",   badge: "bg-blue-100 text-blue-700",    border: "border-blue-100"   };
  return                                   { divider: "bg-purple-200", text: "text-purple-700", badge: "bg-purple-100 text-purple-700", border: "border-purple-100" };
}

function groupLabel(semNum) {
  if (semNum === "passed") return { icon: "🎓", label: "Passed Out" };
  const L = SEM_LABELS[semNum] || `Sem ${semNum}`;
  const icons = { 1:"📗", 2:"📗", 3:"📘", 4:"📘", 5:"📙", 6:"📙" };
  return { icon: icons[semNum] || "📖", label: L };
}

// ── Parse Excel / CSV ─────────────────────────────────────────────────
function parseStudents(workbook) {
  const results = [];
  workbook.SheetNames.forEach((sheet) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, defval: null });
    let headerIdx = -1, cols = { pin: -1, name: -1, branch: -1, year: -1, email: -1 };
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = rows[i].map((c) => (c ? String(c).trim().toLowerCase() : ""));
      const pinCol  = row.findIndex((c) => c.includes("pin") || c.includes("roll") || c.includes("id"));
      const nameCol = row.findIndex((c) => c.includes("name"));
      if (pinCol !== -1 && nameCol !== -1) {
        headerIdx = i;
        cols = {
          pin:    pinCol,
          name:   nameCol,
          branch: row.findIndex((c) => c.includes("branch") || c.includes("dept")),
          year:   row.findIndex((c) => c.includes("year") || c.includes("sem")),
          email:  row.findIndex((c) => c.includes("email")),
        };
        break;
      }
    }
    if (headerIdx === -1) return;
    rows.slice(headerIdx + 1).forEach((row) => {
      if (!row || row.every((c) => !c)) return;
      const pin  = row[cols.pin]  ? String(row[cols.pin]).trim()  : "";
      const name = row[cols.name] ? String(row[cols.name]).trim() : "";
      if (!pin || !name) return;
      const branch = cols.branch !== -1 && row[cols.branch] ? String(row[cols.branch]).trim().toUpperCase() : "CME";
      const email  = cols.email  !== -1 && row[cols.email]  ? String(row[cols.email]).trim()  : "";
      results.push({ pin, name, branch, email, borrowerType: "student" });
    });
  });
  return results;
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function Students() {
  const [students,    setStudents]    = useState([]);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [showForm,    setShowForm]    = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [editingId,   setEditingId]   = useState(null);
  const [editForm,    setEditForm]    = useState({});
  const [deletingId,  setDeletingId]  = useState(null);
  const [deleting,    setDeleting]    = useState(false);
  const [autoDeleted, setAutoDeleted] = useState([]);

  // Import
  const [showImport,   setShowImport]   = useState(false);
  const [preview,      setPreview]      = useState(null);
  const [importFile,   setImportFile]   = useState("");
  const [importError,  setImportError]  = useState("");
  const [importSaving, setImportSaving] = useState(false);
  const [importDone,   setImportDone]   = useState(false);
  const [dupRows,      setDupRows]      = useState(new Set());
  const fileRef = useRef();

  // Search
  const [rawSearch, setRawSearch] = useState("");
  const [search,    setSearch]    = useState("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSet = useCallback(debounce((v) => setSearch(v), 200), []);
  const handleSearch = (v) => { setRawSearch(v); debouncedSet(v); };

  // ── Load students + auto-delete passed-out on mount ─────────────────
  useEffect(() => {
    const unsub = listenToStudents(setStudents);
    autoDeletePassedOutStudents()
      .then((names) => { if (names.length > 0) setAutoDeleted(names); })
      .catch(() => {});
    return unsub;
  }, []);

  // ── Group students using getStudentInfo ──────────────────────────────
  const grouped = useMemo(() => {
    const g = {};
    SEM_ORDER.forEach((k) => { g[k] = []; });
    students.forEach((s) => {
      const { semNum, isPassedOut } = getStudentInfo(s.pin);
      const key = isPassedOut ? "passed" : (semNum ?? "passed");
      if (!g[key]) g[key] = [];
      g[key].push(s);
    });
    // Sort each group by PIN
    Object.keys(g).forEach((k) => {
      g[k].sort((a, b) => (a.pin || "").localeCompare(b.pin || ""));
    });
    return g;
  }, [students]);

  // ── Active groups (non-empty) ────────────────────────────────────────
  const activeGroups = SEM_ORDER.filter((k) => grouped[k]?.length > 0);

  // ── Search ───────────────────────────────────────────────────────────
  const searchActive = search.trim().length >= 2;
  const searchResults = searchActive
    ? smartSearch(students, search, ["name", "pin", "branch"], 20, [], 50)
    : [];

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleAdd = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await addStudent({ ...form, borrowerType: "student" });
      setForm(EMPTY_FORM); setShowForm(false);
    } catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  };

  const handleEdit = (s) => {
    setEditingId(s.id);
    setEditForm({ name: s.name || "", pin: s.pin || "", branch: s.branch || "CME", email: s.email || "" });
    setDeletingId(null);
  };
  const handleSaveEdit = async () => {
    try { await updateStudent(editingId, editForm); setEditingId(null); }
    catch (err) { alert("Error: " + err.message); }
  };
  const handleDelete = async (id) => {
    setDeleting(true);
    try { await deleteStudent(id); setDeletingId(null); }
    catch (err) { alert("Error: " + err.message); }
    setDeleting(false);
  };

  const resetImport = () => {
    setPreview(null); setImportFile(""); setImportError("");
    setImportDone(false); setDupRows(new Set());
    if (fileRef.current) fileRef.current.value = "";
  };
  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setImportError(""); setPreview(null); setImportDone(false);
    setDupRows(new Set()); setImportFile(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb   = XLSX.read(ev.target.result, { type: "array" });
        const rows = parseStudents(wb);
        if (!rows.length) { setImportError("No valid records found."); return; }
        const existing = new Set(students.map((s) => s.pin));
        const dups = new Set(rows.map((r, i) => existing.has(r.pin) ? i : -1).filter((i) => i >= 0));
        setDupRows(dups); setPreview(rows);
      } catch (err) { setImportError("Parse error: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
  };
  const handleConfirmImport = async () => {
    setImportSaving(true);
    try { await addStudentsBatch(preview); setImportDone(true); setPreview(null); }
    catch (err) { setImportError("Import failed: " + err.message); }
    setImportSaving(false);
  };

  const ACTIVE = { background: "linear-gradient(135deg, #0D1F4E, #1B4332)" };
  const inp    = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  // ── Row render ────────────────────────────────────────────────────────
  const StudentRow = ({ s }) => {
    if (editingId === s.id) return (
      <tr className="bg-blue-50 border-l-4 border-blue-500">
        <td className="px-4 py-2"><input value={editForm.name}   onChange={(e) => setEditForm({...editForm, name:   e.target.value})} className={inp} placeholder="Name" autoFocus /></td>
        <td className="px-4 py-2"><input value={editForm.pin}    onChange={(e) => setEditForm({...editForm, pin:    e.target.value})} className={`${inp} font-mono`} placeholder="PIN" /></td>
        <td className="px-4 py-2">
          <select value={editForm.branch} onChange={(e) => setEditForm({...editForm, branch: e.target.value})} className={inp}>
            {["CME","ECE","ME","EE","CE"].map((b) => <option key={b}>{b}</option>)}
          </select>
        </td>
        <td className="px-4 py-2"><SemBadge pin={editForm.pin} /></td>
        <td className="px-4 py-2">
          <div className="flex gap-2">
            <button onClick={handleSaveEdit} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={ACTIVE}>✓ Save</button>
            <button onClick={() => setEditingId(null)} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600">Cancel</button>
          </div>
        </td>
      </tr>
    );
    if (deletingId === s.id) return (
      <tr className="bg-red-50 border-l-4 border-red-500">
        <td colSpan={5} className="px-5 py-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <p className="text-sm font-bold text-red-700">Delete {s.name}?</p>
              <p className="text-xs text-gray-400 font-mono">{s.pin}</p>
            </div>
            <div className="flex gap-2 ml-auto">
              <button onClick={() => handleDelete(s.id)} disabled={deleting}
                className="text-xs font-bold px-4 py-2 rounded-lg text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">
                {deleting ? "Deleting…" : "Yes, Delete"}
              </button>
              <button onClick={() => setDeletingId(null)} className="text-xs font-medium px-4 py-2 rounded-lg border border-gray-300 text-gray-600">Cancel</button>
            </div>
          </div>
        </td>
      </tr>
    );
    return (
      <tr className="hover:bg-gray-50 transition">
        <td className="px-4 py-3 font-medium text-gray-800"><HL text={s.name} query={search} /></td>
        <td className="px-4 py-3 font-mono text-sm" style={{ color: "#374151" }}><HL text={s.pin} query={search} /></td>
        <td className="px-4 py-3 text-gray-500 text-sm"><HL text={s.branch} query={search} /></td>
        <td className="px-4 py-3"><SemBadge pin={s.pin} /></td>
        <td className="px-4 py-3">
          <div className="flex gap-1">
            <button onClick={() => handleEdit(s)}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition text-sm">✏️</button>
            <button onClick={() => { setDeletingId(s.id); setEditingId(null); }}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-red-400 hover:text-red-600 hover:bg-red-50 transition text-sm">🗑️</button>
          </div>
        </td>
      </tr>
    );
  };

  // ── Mobile card ───────────────────────────────────────────────────────
  const StudentCard = ({ s }) => (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-800 text-sm"><HL text={s.name} query={search} /></p>
          <p className="text-xs text-gray-400 font-mono mt-0.5"><HL text={s.pin} query={search} /></p>
          <p className="text-xs text-gray-500 mt-0.5"><HL text={s.branch} query={search} /></p>
        </div>
        <SemBadge pin={s.pin} />
      </div>
      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
        <button onClick={() => handleEdit(s)}
          className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">✏️ Edit</button>
        <button onClick={() => { setDeletingId(s.id); setEditingId(null); }}
          className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">🗑️ Delete</button>
      </div>
    </div>
  );

  return (
    <AdminLayout>
      {/* Auto-deleted notice */}
      {autoDeleted.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-3">
          <span className="text-xl flex-shrink-0">🎓</span>
          <div className="flex-1">
            <p className="text-sm font-bold text-blue-800">
              {autoDeleted.length} passed-out student{autoDeleted.length > 1 ? "s" : ""} auto-removed
            </p>
            <p className="text-xs text-blue-600 mt-0.5">
              {autoDeleted.slice(0, 5).join(", ")}{autoDeleted.length > 5 ? ` +${autoDeleted.length - 5} more` : ""}
            </p>
          </div>
          <button onClick={() => setAutoDeleted([])} className="text-blue-400 hover:text-blue-600 text-sm flex-shrink-0">✕</button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Students</h1>
          <p className="text-gray-500 text-sm mt-1">{students.length} registered students</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => { setShowImport(!showImport); setShowForm(false); resetImport(); }}
            className="border border-blue-600 text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg text-sm font-medium transition">
            {showImport ? "✕ Cancel" : "📂 Import File"}
          </button>
          <button onClick={() => { setShowForm(!showForm); setShowImport(false); }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
            {showForm ? "✕ Cancel" : "+ Add Student"}
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Add New Student</h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input required value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="e.g. K. Sankar Rao" className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PIN</label>
              <input required value={form.pin} onChange={(e) => setForm({...form, pin: e.target.value})} placeholder="e.g. 25173-CM-001" className={`${inp} font-mono`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
              <select value={form.branch} onChange={(e) => setForm({...form, branch: e.target.value})} className={inp}>
                {["CME","ECE","ME","EE","CE"].map((b) => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email (optional)</label>
              <input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} placeholder="student@email.com" className={inp} />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg text-sm font-medium transition">
                {saving ? "Saving…" : "Save Student"}
              </button>
              {form.pin && (
                <p className="text-xs text-blue-600 mt-2 font-medium">
                  Semester: {getStudentInfo(form.pin).label}
                </p>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Import */}
      {showImport && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Import Students from File</h2>
          <p className="text-xs text-gray-400 mb-4">
            Supports .xlsx · .csv · Columns: PIN, Name, Branch (optional), Email (optional)
          </p>
          {importError && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-3">{importError}</div>}
          {importDone  && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 mb-3">✅ Import successful! <button onClick={resetImport} className="ml-3 underline text-xs">Import more</button></div>}
          {!preview && !importDone && (
            <label className="flex flex-col items-center border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl py-8 cursor-pointer transition">
              <span className="text-3xl mb-2">📂</span>
              <span className="text-sm font-medium text-gray-600">Click to choose file</span>
              <span className="text-xs text-gray-400 mt-1">.xlsx · .csv</span>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
            </label>
          )}
          {importFile && !importDone && <p className="text-xs text-gray-400 mt-2">📄 {importFile}</p>}
          {preview && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <p className="text-sm font-semibold text-gray-700">
                  {preview.length} students ready
                  {dupRows.size > 0 && <span className="ml-2 text-amber-600 text-xs">⚠️ {dupRows.size} duplicate PIN(s)</span>}
                </p>
                <div className="flex gap-2">
                  <button onClick={resetImport} className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs">Cancel</button>
                  <button onClick={handleConfirmImport} disabled={importSaving}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-1.5 rounded-lg text-xs font-semibold">
                    {importSaving ? "Importing…" : `✓ Import ${preview.length}`}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-56 border border-gray-100 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-left text-gray-500">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">PIN</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Branch</th>
                      <th className="px-3 py-2">Semester</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.map((row, idx) => (
                      <tr key={idx} className={dupRows.has(idx) ? "bg-amber-50" : "hover:bg-gray-50"}>
                        <td className="px-3 py-2 text-gray-400">{idx + 1} {dupRows.has(idx) && "⚠️"}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: "#374151" }}>{row.pin}</td>
                        <td className="px-3 py-2 font-medium text-gray-800">{row.name}</td>
                        <td className="px-3 py-2 text-gray-500">{row.branch}</td>
                        <td className="px-3 py-2">
                          <span className="text-xs text-blue-600 font-semibold">{getStudentInfo(row.pin).label}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-5">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg className={`w-4 h-4 ${rawSearch ? "text-blue-500" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
        </span>
        <input
          type="text" value={rawSearch} onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by name, PIN, or branch… (min. 2 chars)"
          className="w-full border border-gray-200 rounded-xl pl-10 pr-24 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300 shadow-sm"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {searchActive && <span className="text-xs text-gray-500 font-medium tabular-nums">{searchResults.length}/{students.length}</span>}
          {rawSearch
            ? <button onClick={() => { setRawSearch(""); setSearch(""); }}
                className="w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-500 transition">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            : <span className="text-xs text-gray-300 hidden sm:block select-none">Smart search</span>
          }
        </div>
      </div>
      {rawSearch.trim().length === 1 && (
        <p className="text-xs text-blue-500 text-center mb-4 font-medium">Type at least 2 characters…</p>
      )}

      {/* ── SEARCH RESULTS ── */}
      {searchActive ? (
        searchResults.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-gray-600 font-semibold">No students found for "{rawSearch}"</p>
            <button onClick={() => { setRawSearch(""); setSearch(""); }} className="mt-3 text-xs text-blue-600 hover:underline">Clear search</button>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-3 pl-1">
              {searchResults.length} student{searchResults.length !== 1 ? "s" : ""} found
            </p>
            <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr className="text-left text-xs uppercase text-gray-400">
                    <th className="px-4 py-3">Name</th><th className="px-4 py-3">PIN</th>
                    <th className="px-4 py-3">Branch</th><th className="px-4 py-3">Semester</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {searchResults.map((s) => <StudentRow key={s.id} s={s} />)}
                </tbody>
              </table>
            </div>
            <div className="md:hidden space-y-2">{searchResults.map((s) => <StudentCard key={s.id} s={s} />)}</div>
          </>
        )

      ) : (
        /* ── GROUPED VIEW ── */
        students.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-gray-600 font-semibold">No students added yet</p>
            <p className="text-gray-400 text-sm mt-1">Click '+ Add Student' or import a file to get started.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {activeGroups.map((semKey) => {
              const group = grouped[semKey];
              if (!group || group.length === 0) return null;
              const c = groupStyle(semKey);
              const { icon, label } = groupLabel(semKey);
              return (
                <div key={semKey}>
                  {/* Section divider */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`h-px flex-1 ${c.divider}`} />
                    <span className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest px-2 ${c.text}`}>
                      {icon} {label}
                      <span className={`px-1.5 py-0.5 rounded-full font-medium normal-case ${c.badge}`}>
                        {group.length}
                      </span>
                    </span>
                    <div className={`h-px flex-1 ${c.divider}`} />
                  </div>

                  {/* Desktop table */}
                  <div className={`hidden md:block bg-white rounded-xl shadow-sm overflow-hidden border ${c.border}`}>
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr className="text-left text-xs uppercase text-gray-400">
                          <th className="px-4 py-3">Name</th>
                          <th className="px-4 py-3">PIN</th>
                          <th className="px-4 py-3">Branch</th>
                          <th className="px-4 py-3">Year / Sem</th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {group.map((s) => <StudentRow key={s.id} s={s} />)}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="md:hidden space-y-2">
                    {group.map((s) => <StudentCard key={s.id} s={s} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </AdminLayout>
  );
}