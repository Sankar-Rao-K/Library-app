import { useEffect, useState, useRef } from "react";
import * as XLSX from "xlsx";
import AdminLayout from "../../components/AdminLayout";
import {
  listenToStudents,
  addStudent,
  addStudentsBatch,
  getTransactionsByStudent,
} from "../../firebase/firestore";
import { getStudentInfo, getBranchFromPin } from "../../utils/studentUtils";

const EMPTY = { name: "", email: "", pin: "", branch: "CME" };

// ── Parse students from workbook ──────────────────────────────────────
function parseStudents(workbook) {
  const results = [];
  workbook.SheetNames.forEach((sheetName) => {
    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    // Find header row with "Pin"
    let headerIdx = -1;
    let cols = { pin: 1, name: 2 };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].map((c) => (c ? String(c).trim().toLowerCase() : ""));
      const pinCol = row.findIndex((c) => c.includes("pin"));
      const nameCol = row.findIndex((c) => c.includes("name"));
      if (pinCol !== -1 && nameCol !== -1) {
        headerIdx = i;
        cols = { pin: pinCol, name: nameCol };
        break;
      }
    }

    const dataStart = headerIdx !== -1 ? headerIdx + 1 : 0;

    for (let i = dataStart; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((c) => !c)) continue;

      const pin = row[cols.pin];
      const name = row[cols.name];

      if (!pin || !name) continue;
      if (String(pin).toLowerCase().includes("pin")) continue;

      const pinStr = String(pin).trim();
      const nameStr = String(name).trim();
      const branch = getBranchFromPin(pinStr);
      const { yearLabel, sem, isOld } = getStudentInfo(pinStr);

      results.push({
        pin: pinStr,
        name: nameStr,
        branch,
        year: yearLabel,
        currentSem: sem,
        isOld,
        email: "",
      });
    }
  });
  return results;
}

// ── Semester badge ────────────────────────────────────────────────────
function SemBadge({ pin }) {
  const { yearLabel, sem, isOld } = getStudentInfo(pin);
  if (isOld)
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
        Passed Out
      </span>
    );
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
      {yearLabel} · {sem}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────
export default function Students() {
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [studentTxns, setStudentTxns] = useState([]);
  const [search, setSearch] = useState("");

  // Import state
  const [showImport, setShowImport] = useState(false);
  const [preview, setPreview] = useState(null);
  const [importFile, setImportFile] = useState("");
  const [importError, setImportError] = useState("");
  const [importSaving, setImportSaving] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const fileRef = useRef();

  useEffect(() => {
    const unsub = listenToStudents(setStudents);
    return () => unsub();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const branch = getBranchFromPin(form.pin) || form.branch;
      const { yearLabel, sem, isOld } = getStudentInfo(form.pin);
      await addStudent({
        ...form,
        branch,
        year: yearLabel,
        currentSem: sem,
        isOld,
      });
      setForm(EMPTY);
      setShowForm(false);
    } catch (err) {
      alert("Error: " + err.message);
    }
    setLoading(false);
  };

  const handleSelectStudent = async (student) => {
    setSelected(student);
    const txns = await getTransactionsByStudent(student.id);
    setStudentTxns(txns.filter((t) => t.status === "issued"));
  };

  // ── File import handlers ─────────────────────────────────────────
  const resetImport = () => {
    setPreview(null); setImportFile(""); setImportError("");
    setImportDone(false); setEditIdx(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportError(""); setPreview(null); setImportDone(false);
    setImportFile(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array" });
        const rows = parseStudents(wb);
        if (rows.length === 0) {
          setImportError("No valid records found. Check your file format.");
          return;
        }
        setPreview(rows);
      } catch (err) {
        setImportError("Failed to parse file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleConfirmImport = async () => {
    setImportSaving(true);
    try {
      await addStudentsBatch(preview);
      setImportDone(true);
      setPreview(null);
    } catch (err) {
      setImportError("Import failed: " + err.message);
    }
    setImportSaving(false);
  };

  const filtered = students.filter(
    (s) =>
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.pin?.includes(search) ||
      s.branch?.toLowerCase().includes(search.toLowerCase())
  );

  const previewCols = ["pin", "name", "branch", "year", "currentSem", "isOld"];

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Students</h1>
          <p className="text-gray-500 text-sm mt-1">
            {students.length} registered students
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowImport(!showImport); setShowForm(false); resetImport(); }}
            className="border border-blue-600 text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            {showImport ? "Cancel Import" : "📂 Import from File"}
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setShowImport(false); }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            {showForm ? "Cancel" : "+ Add Student"}
          </button>
        </div>
      </div>

      {/* ── Manual Add Form ── */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Add New Student</h2>
          <p className="text-xs text-gray-400 mb-4">
            Year &amp; semester are auto-detected from the PIN number.
          </p>
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input
                type="text" required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Ravi Kumar"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PIN Number
              </label>
              <input
                type="text" required
                value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value })}
                placeholder="e.g. 23173-CM-001"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {/* Live preview of detected year/sem */}
              {form.pin.length >= 2 && (() => {
                const { yearLabel, sem, isOld } = getStudentInfo(form.pin);
                return (
                  <p className="text-xs mt-1 text-blue-600">
                    {isOld
                      ? "⚠️ Passed out student"
                      : `📅 Detected: ${yearLabel} · ${sem}`}
                  </p>
                );
              })()}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Branch
              </label>
              <select
                value={getBranchFromPin(form.pin) || form.branch}
                onChange={(e) => setForm({ ...form, branch: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option>CME</option>
                <option>ECE</option>
              </select>
              <p className="text-xs mt-1 text-gray-400">Auto-detected from PIN if CM/EC present</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email (optional)
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="e.g. ravi@school.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit" disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg text-sm font-medium transition"
              >
                {loading ? "Saving..." : "Save Student"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Bulk Import Section ── */}
      {showImport && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Import Students from File</h2>
          <p className="text-xs text-gray-400 mb-4">
            Supports <span className="font-mono">.xlsx</span> ·{" "}
            <span className="font-mono">.csv</span> ·{" "}
            <span className="font-mono">.json</span> — Year &amp; semester
            auto-calculated from PIN.
          </p>

          {importError && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
              {importError}
            </div>
          )}

          {importDone && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 mb-4">
              ✅ Import successful! All students have been added.
              <button onClick={resetImport} className="ml-3 underline text-green-700 text-xs">
                Import more
              </button>
            </div>
          )}

          {!preview && !importDone && (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl py-8 cursor-pointer transition">
              <span className="text-3xl mb-2">📂</span>
              <span className="text-sm font-medium text-gray-600">
                Click to choose file
              </span>
              <span className="text-xs text-gray-400 mt-1">
                Expected: Sl.No | Pin Number | Name of the Student
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,.json"
                onChange={handleFile}
                className="hidden"
              />
            </label>
          )}

          {importFile && !importDone && (
            <p className="text-xs text-gray-400 mt-2">📄 {importFile}</p>
          )}

          {/* Preview Table */}
          {preview && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700">
                  {preview.length} students ready to import
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={resetImport}
                    className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmImport}
                    disabled={importSaving}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-1.5 rounded-lg text-xs font-semibold transition"
                  >
                    {importSaving ? "Importing..." : `✓ Import ${preview.length} Students`}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-72 overflow-y-auto border border-gray-100 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-left text-gray-500">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">PIN</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Branch</th>
                      <th className="px-3 py-2">Year</th>
                      <th className="px-3 py-2">Sem</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.map((row, idx) => (
                      <tr key={idx} className={editIdx === idx ? "bg-blue-50" : "hover:bg-gray-50"}>
                        <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                        {editIdx === idx ? (
                          <>
                            <td className="px-3 py-2">
                              <input
                                value={row.pin}
                                onChange={(e) =>
                                  setPreview((p) => p.map((r, i) => i === idx ? { ...r, pin: e.target.value, ...getStudentInfo(e.target.value), branch: getBranchFromPin(e.target.value) } : r))
                                }
                                className="w-full border border-blue-300 rounded px-1 py-0.5 text-xs font-mono"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                value={row.name}
                                onChange={(e) =>
                                  setPreview((p) => p.map((r, i) => i === idx ? { ...r, name: e.target.value } : r))
                                }
                                className="w-full border border-blue-300 rounded px-1 py-0.5 text-xs"
                              />
                            </td>
                            <td className="px-3 py-2 text-gray-600">{row.branch}</td>
                            <td className="px-3 py-2 text-gray-600">{row.year}</td>
                            <td className="px-3 py-2 text-gray-600">{row.currentSem}</td>
                            <td className="px-3 py-2">
                              {row.isOld
                                ? <span className="text-gray-400">Passed Out</span>
                                : <span className="text-green-600">Active</span>}
                            </td>
                            <td className="px-3 py-2">
                              <button onClick={() => setEditIdx(null)} className="text-green-600 font-medium hover:underline">Done</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 font-mono text-gray-600">{row.pin}</td>
                            <td className="px-3 py-2 font-medium text-gray-800">{row.name}</td>
                            <td className="px-3 py-2 text-gray-500">{row.branch}</td>
                            <td className="px-3 py-2 text-gray-500">{row.year}</td>
                            <td className="px-3 py-2 text-gray-500">{row.currentSem}</td>
                            <td className="px-3 py-2">
                              {row.isOld
                                ? <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Passed Out</span>
                                : <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Active</span>}
                            </td>
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

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name, PIN, or branch..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex gap-6">
        {/* Students Table */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-left text-gray-500">
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">PIN</th>
                <th className="px-6 py-3">Branch</th>
                <th className="px-6 py-3">Year / Sem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                    No students found.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => handleSelectStudent(s)}
                    className={`cursor-pointer transition ${
                      selected?.id === s.id ? "bg-blue-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="px-6 py-3 font-medium text-gray-800">{s.name}</td>
                    <td className="px-6 py-3 font-mono text-xs text-gray-500">{s.pin}</td>
                    <td className="px-6 py-3 text-gray-500">{s.branch}</td>
                    <td className="px-6 py-3">
                      <SemBadge pin={s.pin} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Student Detail Panel */}
        {selected && (() => {
          const { yearLabel, sem, isOld } = getStudentInfo(selected.pin);
          return (
            <div className="w-72 bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex-shrink-0">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800">{selected.name}</h3>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
              <div className="text-sm text-gray-500 space-y-1.5 mb-4">
                <p>📌 PIN: <span className="font-mono font-bold text-gray-700">{selected.pin}</span></p>
                <p>🏫 Branch: <span className="text-gray-700">{selected.branch}</span></p>
                <p>📅 {isOld ? <span className="text-gray-400">Passed Out</span> : <span className="text-blue-600 font-medium">{yearLabel} · {sem}</span>}</p>
                {selected.email && <p>📧 {selected.email}</p>}
              </div>
              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Currently Issued</p>
                {studentTxns.length === 0 ? (
                  <p className="text-sm text-gray-400">No books currently issued.</p>
                ) : (
                  studentTxns.map((t) => (
                    <div key={t.id} className="bg-yellow-50 rounded-lg p-2 mb-2">
                      <p className="text-sm font-medium text-gray-700">{t.bookTitle}</p>
                      <p className="text-xs text-gray-400 font-mono">{t.barcode}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </AdminLayout>
  );
}