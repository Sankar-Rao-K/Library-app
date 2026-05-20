import { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import * as XLSX from "xlsx";
import AdminLayout from "../../components/AdminLayout";
import SearchBar from "../../components/SearchBar";
import StudentDetailModal from "../../components/StudentDetailModal";
import {
  listenToStudents, addStudent, addStudentsBatch,
  getExistingPins, autoDeletePassedOutStudents, updateStudent,
} from "../../firebase/firestore";
import { getStudentInfo, getBranchFromPin, groupStudentsBySem } from "../../utils/studentUtils";
import { smartSearch, isIdQuery } from "../../utils/searchUtils";

// NOTE: add updateStudent to firestore.js if not present:
// export const updateStudent = (id, data) => updateDoc(doc(db, "students", id), data);

const EMPTY = { name: "", email: "", pin: "", branch: "CME" };

function parseStudentsFromWorkbook(workbook) {
  const results = [];
  workbook.SheetNames.forEach((sheetName) => {
    const ws   = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    let headerIdx = -1;
    let cols = { pin: 1, name: 2 };
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].map((c) => (c ? String(c).trim().toLowerCase() : ""));
      const pinCol  = row.findIndex((c) => c.includes("pin"));
      const nameCol = row.findIndex((c) => c.includes("name"));
      if (pinCol !== -1 && nameCol !== -1) { headerIdx = i; cols = { pin: pinCol, name: nameCol }; break; }
    }
    const dataStart = headerIdx !== -1 ? headerIdx + 1 : 0;
    for (let i = dataStart; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((c) => !c)) continue;
      const pin = row[cols.pin]; const name = row[cols.name];
      if (!pin || !name) continue;
      if (String(pin).toLowerCase().includes("pin")) continue;
      const pinStr = String(pin).trim(); const nameStr = String(name).trim();
      const branch = getBranchFromPin(pinStr);
      const { yearLabel, sem, semNum, isOld } = getStudentInfo(pinStr);
      results.push({ pin: pinStr, name: nameStr, branch, year: yearLabel, currentSem: sem, semNum, isOld, email: "" });
    }
  });
  return results;
}

function SemBadge({ pin }) {
  const { yearLabel, sem, isOld } = getStudentInfo(pin);
  if (isOld) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Passed Out</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{yearLabel} · {sem}</span>;
}

// ── Inline Edit Form ────────────────────────────────────────────────────
function StudentEditForm({ student, onSave, onCancel }) {
  const [form, setForm] = useState({
    name:  student.name  || "",
    pin:   student.pin   || "",
    email: student.email || "",
  });
  const [saving, setSaving] = useState(false);
  const { yearLabel, sem, isOld } = getStudentInfo(form.pin);
  const branch = getBranchFromPin(form.pin) || student.branch;

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave(form, branch, yearLabel, sem, isOld); }
    catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  };

  const inp = "w-full border border-blue-300 bg-blue-50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";

  return (
    <tr className="bg-blue-50 border-l-4 border-blue-500">
      <td colSpan={5} className="px-4 py-4">
        <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-3">
          ✏️ Editing: {student.name}
        </p>
        <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Full Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Full name" className={inp} autoFocus />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">PIN Number</label>
            <input required value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })}
              placeholder="e.g. 23173-CM-001" className={`${inp} font-mono`} />
            {form.pin.length >= 5 && (
              <p className={`text-xs mt-0.5 ${isOld ? "text-orange-500" : "text-blue-600"}`}>
                {isOld ? "⚠️ Passed Out" : `${branch} · ${yearLabel} · ${sem}`}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Email (optional)</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="email@example.com" className={inp} />
          </div>
          <div className="sm:col-span-3 flex gap-2 pt-1">
            <button type="submit" disabled={saving}
              className="text-xs font-bold px-4 py-2 rounded-lg text-white transition disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
              {saving ? "Saving…" : "✓ Save Changes"}
            </button>
            <button type="button" onClick={onCancel}
              className="text-xs font-medium px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition">
              Cancel
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}

// Mobile edit card
function StudentEditCard({ student, onSave, onCancel }) {
  const [form, setForm] = useState({ name: student.name || "", pin: student.pin || "", email: student.email || "" });
  const [saving, setSaving] = useState(false);
  const { yearLabel, sem, isOld } = getStudentInfo(form.pin);
  const branch = getBranchFromPin(form.pin) || student.branch;

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true);
    try { await onSave(form, branch, yearLabel, sem, isOld); }
    catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  };
  const inp = "w-full border border-blue-300 bg-blue-50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";
  return (
    <div className="bg-blue-50 border-l-4 border-blue-500 rounded-xl p-4 shadow-sm">
      <p className="text-xs font-bold text-blue-700 mb-3">✏️ Editing: {student.name}</p>
      <form onSubmit={handleSave} className="space-y-3">
        <div><label className="block text-xs font-semibold text-gray-600 mb-1">Full Name</label>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} /></div>
        <div><label className="block text-xs font-semibold text-gray-600 mb-1">PIN Number</label>
          <input required value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} className={`${inp} font-mono`} />
          {form.pin.length >= 5 && <p className={`text-xs mt-0.5 ${isOld ? "text-orange-500" : "text-blue-600"}`}>{isOld ? "⚠️ Passed Out" : `${branch} · ${yearLabel} · ${sem}`}</p>}
        </div>
        <div><label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inp} /></div>
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="flex-1 text-sm font-bold py-2.5 rounded-xl text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
            {saving ? "Saving…" : "✓ Save"}
          </button>
          <button type="button" onClick={onCancel} className="flex-1 text-sm font-medium py-2.5 rounded-xl border border-gray-300 text-gray-600">Cancel</button>
        </div>
      </form>
    </div>
  );
}

const SEM_GROUP_ORDER = ["I Year — Sem 1", "II Year — Sem 3", "II Year — Sem 4", "III Year — Sem 5", "III Year — Sem 6", "Passed Out", "Unknown"];

export default function Students() {
  const [students, setStudents]               = useState([]);
  const [form, setForm]                       = useState(EMPTY);
  const [showForm, setShowForm]               = useState(false);
  const [loading, setLoading]                 = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [search, setSearch]                   = useState("");
  const [autoDeleteMsg, setAutoDeleteMsg]     = useState("");
  const [editingId, setEditingId]             = useState(null);

  const [showImport, setShowImport]       = useState(false);
  const [preview, setPreview]             = useState(null);
  const [importFile, setImportFile]       = useState("");
  const [importError, setImportError]     = useState("");
  const [importSaving, setImportSaving]   = useState(false);
  const [importDone, setImportDone]       = useState(false);
  const [importSummary, setImportSummary] = useState("");
  const [editIdx, setEditIdx]             = useState(null);
  const fileRef = useRef();

  const location = useLocation();
  const pendingHighlightRef = useRef(location.state?.highlightId || null);

  useEffect(() => {
    const unsub = listenToStudents(setStudents);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!pendingHighlightRef.current || students.length === 0) return;
    const found = students.find((s) => s.id === pendingHighlightRef.current);
    if (found) { pendingHighlightRef.current = null; window.history.replaceState({}, ""); setSelectedStudent(found); }
  }, [students]);

  useEffect(() => {
    autoDeletePassedOutStudents().then((deleted) => {
      if (deleted?.length > 0) {
        setAutoDeleteMsg(`🗑️ ${deleted.length} passed-out student(s) auto-removed: ${deleted.join(", ")}`);
        setTimeout(() => setAutoDeleteMsg(""), 8000);
      }
    }).catch(() => {});
  }, []);

  // ── Demo CSV ─────────────────────────────────────────────────────────
  const downloadDemoCSV = () => {
    const csv = ["Sl.No,Pin Number,Name of the Student","1,23173-CM-001,K. Sankar Rao","2,23173-CM-002,A. Revanth N. Kalyan","3,23173-EC-001,M. Ravi Kumar","4,22173-CM-010,B. Sai Prasad","5,24173-CM-005,G. Lakshmi"].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "demo_students_import_template.csv"; a.click(); URL.revokeObjectURL(url);
  };

  // ── Add ──────────────────────────────────────────────────────────────
  const handleAdd = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const branch = getBranchFromPin(form.pin) || form.branch;
      const { yearLabel, sem, semNum, isOld } = getStudentInfo(form.pin);
      await addStudent({ ...form, branch, year: yearLabel, currentSem: sem, semNum, isOld });
      setForm(EMPTY); setShowForm(false);
    } catch (err) { alert("Error: " + err.message); }
    setLoading(false);
  };

  // ── Edit (inline in table) ────────────────────────────────────────────
  const handleSaveEdit = async (studentId, formData, branch, yearLabel, sem, isOld) => {
    const { semNum } = getStudentInfo(formData.pin);
    await updateStudent(studentId, {
      name:       formData.name.trim(),
      pin:        formData.pin.trim(),
      email:      formData.email.trim(),
      branch,
      year:       yearLabel,
      currentSem: sem,
      semNum,
      isOld,
    });
    setEditingId(null);
  };

  // ── Import ────────────────────────────────────────────────────────────
  const resetImport = () => { setPreview(null); setImportFile(""); setImportError(""); setImportSummary(""); setImportDone(false); setEditIdx(null); if (fileRef.current) fileRef.current.value = ""; };
  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setImportError(""); setPreview(null); setImportDone(false); setImportSummary(""); setImportFile(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => { try { const wb = XLSX.read(ev.target.result, { type: "array" }); const rows = parseStudentsFromWorkbook(wb); if (rows.length === 0) { setImportError("No valid records found."); return; } setPreview(rows); } catch (err) { setImportError("Failed: " + err.message); } };
    reader.readAsArrayBuffer(file);
  };
  const handleConfirmImport = async () => {
    setImportSaving(true); setImportError(""); setImportSummary("");
    try {
      const existingPins = await getExistingPins();
      const duplicates = preview.filter((s) => existingPins.has(s.pin));
      const newStudents = preview.filter((s) => !existingPins.has(s.pin));
      if (duplicates.length > 0 && newStudents.length === 0) { setImportError(`All ${duplicates.length} student(s) already exist.`); setImportSaving(false); return; }
      if (newStudents.length > 0) await addStudentsBatch(newStudents);
      setImportDone(true); setPreview(null);
      setImportSummary(duplicates.length > 0 ? `✅ ${newStudents.length} imported. ⚠️ ${duplicates.length} skipped.` : `✅ ${newStudents.length} students imported.`);
    } catch (err) { setImportError("Import failed: " + err.message); }
    setImportSaving(false);
  };

  // ── Search ────────────────────────────────────────────────────────────
  const isIdSearch = isIdQuery(search.trim());

  const filtered = search.trim()
    ? smartSearch(students, search, ["name", "pin", "branch", "year", "currentSem"])
        .sort((a, b) => (a.pin || "").localeCompare(b.pin || ""))
    : [...students].sort((a, b) => (a.pin || "").localeCompare(b.pin || ""));

  const grouped = groupStudentsBySem(filtered);

  // ── Dropdown results (top 8 for display) ─────────────────────────────
  const dropdownResults = search.trim().length >= 1
    ? smartSearch(students, search, ["name", "pin", "branch", "year"]).slice(0, 8)
    : null;

  const renderDropdownResult = (s) => {
    const { yearLabel, sem, isOld } = getStudentInfo(s.pin);
    return (
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
          {s.name?.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{s.name}</p>
          <p className="text-xs text-gray-400 font-mono">{s.pin} · {s.branch}</p>
        </div>
        <div className="flex-shrink-0">
          {isOld
            ? <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Passed Out</span>
            : <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{yearLabel}</span>}
        </div>
      </div>
    );
  };

  return (
    <AdminLayout>
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

      {autoDeleteMsg && (
        <div className="bg-orange-50 border border-orange-200 text-orange-700 text-sm rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
          <span className="flex-shrink-0">ℹ️</span><span>{autoDeleteMsg}</span>
        </div>
      )}

      {/* Add Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Add New Student</h2>
          <p className="text-xs text-gray-400 mb-4">Year & semester auto-detected from PIN.</p>
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Ravi Kumar" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PIN Number</label>
              <input type="text" required value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })}
                placeholder="e.g. 23173-CM-001" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {form.pin.length >= 2 && (() => { const { yearLabel, sem, isOld } = getStudentInfo(form.pin); return <p className={`text-xs mt-1 ${isOld ? "text-orange-500" : "text-blue-600"}`}>{isOld ? "⚠️ Passed Out" : `📅 ${yearLabel} · ${sem}`}</p>; })()}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
              <select value={getBranchFromPin(form.pin) || form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option>CME</option><option>ECE</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email (optional)</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="e.g. ravi@school.com" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg text-sm font-medium transition">
                {loading ? "Saving…" : "Save Student"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Import Section */}
      {showImport && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Import Students from File</h2>
          <p className="text-xs text-gray-400 mb-4">Supports .xlsx · .csv · .json</p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
            <span className="text-xl flex-shrink-0">📄</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">New to importing?</p>
              <p className="text-xs text-amber-600 mt-0.5 mb-3">Download the demo template, fill in your data, and upload it here.</p>
              <button onClick={downloadDemoCSV} className="text-xs font-bold px-4 py-2 rounded-lg text-white" style={{ background: "linear-gradient(135deg, #b45309, #d97706)" }}>
                ⬇️ Download Students Template (.csv)
              </button>
            </div>
          </div>
          {importError && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-3">{importError}</div>}
          {importDone && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 mb-3">{importSummary} <button onClick={resetImport} className="ml-3 underline text-xs">Import more</button></div>}
          {!preview && !importDone && (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl py-8 cursor-pointer transition">
              <span className="text-3xl mb-2">📂</span>
              <span className="text-sm font-medium text-gray-600">Click to choose file</span>
              <span className="text-xs text-gray-400 mt-1">.xlsx · .csv · .json</span>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.json" onChange={handleFile} className="hidden" />
            </label>
          )}
          {preview && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <p className="text-sm font-semibold text-gray-700">{preview.length} students ready</p>
                <div className="flex gap-2">
                  <button onClick={resetImport} className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs">Cancel</button>
                  <button onClick={handleConfirmImport} disabled={importSaving} className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-1.5 rounded-lg text-xs font-semibold">
                    {importSaving ? "Importing…" : `✓ Import ${preview.length}`}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto border border-gray-100 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0"><tr className="text-left text-gray-500"><th className="px-3 py-2">#</th><th className="px-3 py-2">PIN</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Branch</th><th className="px-3 py-2">Year</th><th className="px-3 py-2">Act</th></tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.map((row, idx) => (
                      <tr key={idx} className={editIdx === idx ? "bg-blue-50" : "hover:bg-gray-50"}>
                        <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                        {editIdx === idx ? (
                          <>
                            <td className="px-3 py-2"><input value={row.pin} onChange={(e) => setPreview((p) => p.map((r, i) => i === idx ? { ...r, pin: e.target.value, ...getStudentInfo(e.target.value), branch: getBranchFromPin(e.target.value) } : r))} className="w-full border border-blue-300 rounded px-1 py-0.5 font-mono" /></td>
                            <td className="px-3 py-2"><input value={row.name} onChange={(e) => setPreview((p) => p.map((r, i) => i === idx ? { ...r, name: e.target.value } : r))} className="w-full border border-blue-300 rounded px-1 py-0.5" /></td>
                            <td className="px-3 py-2 text-gray-600">{row.branch}</td>
                            <td className="px-3 py-2 text-gray-600">{row.year}</td>
                            <td className="px-3 py-2"><button onClick={() => setEditIdx(null)} className="text-green-600 font-medium">Done</button></td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 font-mono text-gray-600">{row.pin}</td>
                            <td className="px-3 py-2 font-medium text-gray-800">{row.name}</td>
                            <td className="px-3 py-2 text-gray-500">{row.branch}</td>
                            <td className="px-3 py-2 text-gray-500">{row.year}</td>
                            <td className="px-3 py-2 flex gap-2">
                              <button onClick={() => setEditIdx(idx)} className="text-blue-600 hover:underline">Edit</button>
                              <button onClick={() => setPreview((p) => p.filter((_, i) => i !== idx))} className="text-red-500 hover:underline">Del</button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Google-style Search ── */}
      <div className="mb-5">
        <SearchBar
          value={search}
          onChange={(v) => { setSearch(v); setEditingId(null); }}
          placeholder="Search by name, PIN number, or branch..."
          resultCount={filtered.length}
          totalCount={students.length}
          results={dropdownResults}
          renderResult={renderDropdownResult}
          onResultClick={(s) => { setSearch(""); setSelectedStudent(s); }}
          emptyMessage={isIdSearch ? `No student found with PIN "${search}"` : "No students found"}
          isIdSearch={isIdSearch}
          minChars={1}
        />
        {/* Search mode hint */}
        {search.trim() && (
          <p className="text-xs text-gray-400 mt-1.5 pl-1">
            {isIdSearch
              ? <span className="text-amber-600 font-medium">🔑 PIN search — showing exact matches only</span>
              : <span>🔍 Fuzzy search — showing closest matches (≥60% similarity)</span>}
            {" · "}{filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Students list */}
      {filtered.length === 0 && search.trim() ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
          <p className="text-4xl mb-3">{isIdSearch ? "🔑" : "🔍"}</p>
          <p className="font-medium text-gray-600 text-sm">
            {isIdSearch ? `No student with PIN "${search}"` : `No match for "${search}"`}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {isIdSearch ? "PIN must match exactly. Check the format: 23173-CM-001" : "Try a different name or fewer words."}
          </p>
          <button onClick={() => setSearch("")} className="mt-3 text-xs text-blue-600 hover:underline font-medium">Clear search</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center text-gray-400">
          <p className="text-4xl mb-3">👥</p>
          <p className="text-gray-500 text-sm">No students added yet.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {SEM_GROUP_ORDER.map((groupName) => {
            const group = grouped[groupName];
            if (!group || group.length === 0) return null;
            return (
              <div key={groupName}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest px-2">
                    <span>{groupName === "Passed Out" ? "🎓" : groupName === "Unknown" ? "❓" : "📅"}</span>
                    {groupName}
                    <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium normal-case">{group.length}</span>
                  </span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>

                {/* Desktop table */}
                <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr className="text-left text-gray-500 text-xs uppercase">
                        <th className="px-5 py-3">Name</th>
                        <th className="px-5 py-3">PIN</th>
                        <th className="px-5 py-3">Branch</th>
                        <th className="px-5 py-3">Year / Sem</th>
                        <th className="px-5 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {group.map((s) => (
                        <>
                          {editingId === s.id ? (
                            <StudentEditForm
                              key={`edit-${s.id}`}
                              student={s}
                              onSave={(fd, branch, yearLabel, sem, isOld) => handleSaveEdit(s.id, fd, branch, yearLabel, sem, isOld)}
                              onCancel={() => setEditingId(null)}
                            />
                          ) : (
                            <tr key={s.id} className="hover:bg-gray-50 transition">
                              <td className="px-5 py-3 font-medium text-gray-800 cursor-pointer hover:text-blue-600"
                                onClick={() => setSelectedStudent(s)}>{s.name}</td>
                              <td className="px-5 py-3 font-mono text-xs text-gray-500">{s.pin}</td>
                              <td className="px-5 py-3 text-gray-500">{s.branch}</td>
                              <td className="px-5 py-3"><SemBadge pin={s.pin} /></td>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2">
                                  <button onClick={() => setSelectedStudent(s)}
                                    className="text-xs font-medium px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition">
                                    View
                                  </button>
                                  <button onClick={() => { setEditingId(s.id); setShowForm(false); setShowImport(false); }}
                                    className="text-xs font-medium px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-green-400 hover:text-green-600 hover:bg-green-50 transition">
                                    ✏️ Edit
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-2">
                  {group.map((s) => {
                    if (editingId === s.id) {
                      return (
                        <StudentEditCard
                          key={`medit-${s.id}`}
                          student={s}
                          onSave={(fd, branch, yearLabel, sem, isOld) => handleSaveEdit(s.id, fd, branch, yearLabel, sem, isOld)}
                          onCancel={() => setEditingId(null)}
                        />
                      );
                    }
                    return (
                      <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                        <div className="flex items-center justify-between gap-3" onClick={() => setSelectedStudent(s)}>
                          <div className="flex items-center gap-3 min-w-0 cursor-pointer">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-base flex-shrink-0">
                              {s.name?.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-800 text-sm truncate">{s.name}</p>
                              <p className="text-xs text-gray-400 font-mono truncate">{s.pin}</p>
                              <div className="mt-1"><SemBadge pin={s.pin} /></div>
                            </div>
                          </div>
                          <span className="text-gray-400 text-lg flex-shrink-0">›</span>
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
                          <button onClick={() => setSelectedStudent(s)}
                            className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                            View
                          </button>
                          <button onClick={() => { setEditingId(s.id); setShowForm(false); }}
                            className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-green-200 text-green-700 hover:bg-green-50">
                            ✏️ Edit
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedStudent && (
        <StudentDetailModal
          student={selectedStudent}
          onClose={() => setSelectedStudent(null)}
          onDeleted={() => setSelectedStudent(null)}
        />
      )}
    </AdminLayout>
  );
}