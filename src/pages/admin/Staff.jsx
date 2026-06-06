import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import * as XLSX from "xlsx";
import AdminLayout from "../../components/AdminLayout";
import SearchBar from "../../components/SearchBar";
import StaffDetailModal from "../../components/StaffDetailModal";
import QRDisplayModal from "../../components/QRDisplayModal";
import {
  listenToStaff, addStaff, addStaffBatch, getExistingStaffIds, updateStaff,
} from "../../firebase/firestore";
import {
  smartSearch, isIdQuery, getHighlightSegments, debounce,
} from "../../utils/searchUtils";

const EMPTY    = { name: "", staffId: "", designation: "", section: "ECE", email: "" };
const SECTIONS = ["ECE", "CME", "GENERAL", "OFFICE", "OTHER"];

// ── Highlight component ───────────────────────────────────────────────
function HL({ text, query }) {
  const segs = getHighlightSegments(String(text || ""), query);
  return (
    <span>
      {segs.map((s, i) =>
        s.match
          ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5 not-italic">{s.text}</mark>
          : <span key={i}>{s.text}</span>
      )}
    </span>
  );
}

function SectionBadge({ section }) {
  const colors = {
    ECE:     "bg-blue-50 text-blue-700",
    CME:     "bg-green-50 text-green-700",
    GENERAL: "bg-purple-50 text-purple-700",
    OFFICE:  "bg-yellow-50 text-yellow-700",
    OTHER:   "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[section] || colors.OTHER}`}>
      {section}
    </span>
  );
}

function parseStaffFromWorkbook(workbook) {
  const results = [];
  workbook.SheetNames.forEach((sheetName) => {
    const ws   = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    let headerIdx = -1;
    let cols = { name: 1, designation: 2, staffId: 3 };
    let currentSection = "GENERAL";

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].map((c) => (c ? String(c).trim() : ""));
      const nameCol  = row.findIndex((c) => c.toLowerCase().includes("name"));
      const desigCol = row.findIndex((c) => c.toLowerCase().includes("desig"));
      const idCol    = row.findIndex((c) => c.toLowerCase().includes("cms") || c.toLowerCase().includes("id"));
      if (nameCol !== -1 && idCol !== -1) {
        headerIdx = i;
        cols = { name: nameCol, designation: desigCol !== -1 ? desigCol : 2, staffId: idCol };
        break;
      }
    }
    if (headerIdx === -1) return;

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((c) => !c)) continue;
      const rawName  = row[cols.name];
      const rawId    = row[cols.staffId];
      const rawDesig = row[cols.designation];

      if (rawName && !rawId) {
        const n = String(rawName).toUpperCase();
        if (n.includes("ECE"))     { currentSection = "ECE";     continue; }
        if (n.includes("CME"))     { currentSection = "CME";     continue; }
        if (n.includes("GENERAL")) { currentSection = "GENERAL"; continue; }
        if (n.includes("OFFICE"))  { currentSection = "OFFICE";  continue; }
        continue;
      }
      if (!rawName || !rawId) continue;
      const name    = String(rawName).trim();
      const staffId = String(rawId).trim();
      const desig   = rawDesig ? String(rawDesig).trim() : "";
      if (name.toLowerCase().includes("vacant")) continue;
      results.push({ name, staffId, designation: desig, section: currentSection, email: "", borrowerType: "staff" });
    }
  });
  return results;
}

const SECTION_ORDER = ["ECE", "CME", "GENERAL", "OFFICE", "OTHER"];

export default function Staff() {
  const [staffList, setStaffList]         = useState([]);
  const [form, setForm]                   = useState(EMPTY);
  const [showForm, setShowForm]           = useState(false);
  const [loading, setLoading]             = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [editingStaff, setEditingStaff]   = useState(null);
  const [newStaffQR, setNewStaffQR]       = useState(null);

  // ── Debounced search ─────────────────────────────────────────────────
  const [rawSearch, setRawSearch] = useState("");
  const [search,    setSearch]    = useState("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSet = useCallback(debounce((v) => setSearch(v), 200), []);
  const handleSearch = (v) => { setRawSearch(v); debouncedSet(v); };

  // Import
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
    const unsub = listenToStaff(setStaffList);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!pendingHighlightRef.current || staffList.length === 0) return;
    const found = staffList.find((s) => s.id === pendingHighlightRef.current);
    if (found) { pendingHighlightRef.current = null; window.history.replaceState({}, ""); setSelectedStaff(found); }
  }, [staffList]);

  const downloadDemoCSV = () => {
    const csv = [
      "S.No,Name of the Staff Member,Designation,CMS ID",
      "ECE SECTION,,,",
      "1,P V S Srinivasa Rao,Principal,14023738",
      "2,J P Srinivas,HECES,14002318",
      "CME SECTION,,,",
      "3,B Narasimha Murthy,Sr. Lecturer,14001234",
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "demo_staff_import_template.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const handleAdd = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      await addStaff({ ...form, borrowerType: "staff" });
      setNewStaffQR({ ...form });
      setForm(EMPTY); setShowForm(false);
    } catch (err) { alert("Error: " + err.message); }
    setLoading(false);
  };

  const openEdit = (s) => { setEditingStaff({ ...s }); setShowForm(false); setShowImport(false); };

  const handleUpdate = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      await updateStaff(editingStaff.id, {
        name: editingStaff.name, staffId: editingStaff.staffId,
        designation: editingStaff.designation, section: editingStaff.section, email: editingStaff.email || "",
      });
      setEditingStaff(null);
    } catch (err) { alert("Error: " + err.message); }
    setLoading(false);
  };

  const resetImport = () => { setPreview(null); setImportFile(""); setImportError(""); setImportSummary(""); setImportDone(false); setEditIdx(null); if (fileRef.current) fileRef.current.value = ""; };
  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setImportError(""); setPreview(null); setImportDone(false); setImportSummary(""); setImportFile(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => { try { const wb = XLSX.read(ev.target.result, { type: "array" }); const rows = parseStaffFromWorkbook(wb); if (rows.length === 0) { setImportError("No valid records found."); return; } setPreview(rows); } catch (err) { setImportError("Failed: " + err.message); } };
    reader.readAsArrayBuffer(file);
  };
  const handleConfirmImport = async () => {
    setImportSaving(true); setImportError(""); setImportSummary("");
    try {
      const existingIds = await getExistingStaffIds();
      const dupes   = preview.filter((s) => existingIds.has(s.staffId));
      const newOnes = preview.filter((s) => !existingIds.has(s.staffId));
      if (dupes.length > 0 && newOnes.length === 0) { setImportError(`All ${dupes.length} record(s) already exist.`); setImportSaving(false); return; }
      if (newOnes.length > 0) await addStaffBatch(newOnes);
      setImportDone(true); setPreview(null);
      setImportSummary(dupes.length > 0 ? `✅ ${newOnes.length} imported. ⚠️ ${dupes.length} skipped.` : `✅ ${newOnes.length} staff members imported.`);
    } catch (err) { setImportError("Import failed: " + err.message); }
    setImportSaving(false);
  };

  // ── Search pipeline ──────────────────────────────────────────────────
  const searchActive = search.trim().length >= 2;
  const isId         = isIdQuery(search.trim());

  const filtered = searchActive
    ? smartSearch(staffList, search, ["name", "staffId", "designation", "section"])
        .sort((a, b) => {
          const si = SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section);
          return si !== 0 ? si : (a.name || "").localeCompare(b.name || "");
        })
    : [...staffList].sort((a, b) => {
        const si = SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section);
        return si !== 0 ? si : (a.name || "").localeCompare(b.name || "");
      });

  // Group by section
  const grouped = {};
  SECTION_ORDER.forEach((s) => { grouped[s] = []; });
  filtered.forEach((s) => {
    const key = s.section || "OTHER";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  });

  // Dropdown — top 6
  const dropdownResults = rawSearch.trim().length >= 2
    ? smartSearch(staffList, rawSearch.trim(), ["name", "staffId", "section", "designation"]).slice(0, 6)
    : null;

  const renderDropdownResult = (s) => (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-indigo-200 text-xs flex-shrink-0"
        style={{ background: "linear-gradient(135deg, #312e81, #1e3a5f)" }}>
        {s.name?.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">
          <HL text={s.name} query={rawSearch} />
        </p>
        <p className="text-xs text-gray-400">
          {s.designation} · <span className="font-mono"><HL text={s.staffId} query={rawSearch} /></span>
        </p>
      </div>
      <SectionBadge section={s.section} />
    </div>
  );

  const ACTIVE = { background: "linear-gradient(135deg, #0D1F4E, #1B4332)" };

  return (
    <AdminLayout>
      {newStaffQR && <QRDisplayModal item={newStaffQR} type="staff" onClose={() => setNewStaffQR(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Staff</h1>
          <p className="text-gray-500 text-sm mt-1">{staffList.length} staff members</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => { setShowImport(!showImport); setShowForm(false); setEditingStaff(null); resetImport(); }}
            className="border border-blue-600 text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg text-sm font-medium transition">
            {showImport ? "✕ Cancel" : "📂 Import File"}
          </button>
          <button onClick={() => { setShowForm(!showForm); setShowImport(false); setEditingStaff(null); }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
            {showForm ? "✕ Cancel" : "+ Add Staff"}
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Add New Staff Member</h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: "Full Name",      key: "name",        placeholder: "e.g. P V S Srinivasa Rao",  mono: false },
              { label: "Staff ID (CMS)", key: "staffId",     placeholder: "e.g. 14023738",              mono: true  },
              { label: "Designation",    key: "designation", placeholder: "e.g. Lecturer, Principal",   mono: false },
            ].map(({ label, key, placeholder, mono }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input type="text" required value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder}
                  className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500${mono ? " font-mono" : ""}`} />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
              <select value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {SECTIONS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email (optional)</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="e.g. staff@college.edu"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg text-sm font-medium transition">
                {loading ? "Saving…" : "Save Staff Member & Generate QR"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Form */}
      {editingStaff && (
        <div className="bg-white rounded-xl shadow-sm border-l-4 border-blue-500 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">✏️ Edit: {editingStaff.name}</h2>
            <button onClick={() => setEditingStaff(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
          </div>
          <form onSubmit={handleUpdate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: "Full Name",      key: "name",        mono: false },
              { label: "Staff ID (CMS)", key: "staffId",     mono: true  },
              { label: "Designation",    key: "designation", mono: false },
            ].map(({ label, key, mono }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input type="text" required value={editingStaff[key]}
                  onChange={(e) => setEditingStaff({ ...editingStaff, [key]: e.target.value })}
                  className={`w-full border border-blue-300 bg-blue-50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500${mono ? " font-mono" : ""}`} />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
              <select value={editingStaff.section} onChange={(e) => setEditingStaff({ ...editingStaff, section: e.target.value })}
                className="w-full border border-blue-300 bg-blue-50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {SECTIONS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={editingStaff.email || ""} onChange={(e) => setEditingStaff({ ...editingStaff, email: e.target.value })}
                className="w-full border border-blue-300 bg-blue-50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="sm:col-span-2 flex gap-3">
              <button type="submit" disabled={loading} className="text-white px-6 py-2 rounded-lg text-sm font-bold disabled:opacity-50" style={ACTIVE}>
                {loading ? "Saving…" : "✓ Save Changes"}
              </button>
              <button type="button" onClick={() => setEditingStaff(null)} className="border border-gray-300 text-gray-600 px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Import */}
      {showImport && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Import Staff</h2>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
            <span className="text-xl flex-shrink-0">📄</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">New to importing?</p>
              <p className="text-xs text-amber-600 mt-0.5 mb-3">Write section names (e.g. ECE SECTION) as row headers — auto-detected.</p>
              <button onClick={downloadDemoCSV} className="text-xs font-bold px-4 py-2 rounded-lg text-white" style={{ background: "linear-gradient(135deg, #b45309, #d97706)" }}>⬇️ Download Template</button>
            </div>
          </div>
          {importError && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-3">{importError}</div>}
          {importDone  && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 mb-3">{importSummary} <button onClick={resetImport} className="ml-3 underline text-xs">Import more</button></div>}
          {!preview && !importDone && (
            <label className="flex flex-col items-center border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl py-8 cursor-pointer transition">
              <span className="text-3xl mb-2">📂</span><span className="text-sm font-medium text-gray-600">Click to choose file</span>
              <span className="text-xs text-gray-400 mt-1">.xlsx · .csv</span>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
            </label>
          )}
          {preview && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <p className="text-sm font-semibold text-gray-700">{preview.length} staff ready</p>
                <div className="flex gap-2">
                  <button onClick={resetImport} className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs">Cancel</button>
                  <button onClick={handleConfirmImport} disabled={importSaving} className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-1.5 rounded-lg text-xs font-semibold">
                    {importSaving ? "Importing…" : `✓ Import ${preview.length}`}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto border border-gray-100 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-left text-gray-500"><th className="px-3 py-2">#</th><th className="px-3 py-2">Staff ID</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Designation</th><th className="px-3 py-2">Section</th><th className="px-3 py-2">Act</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.map((row, idx) => (
                      <tr key={idx} className={editIdx === idx ? "bg-blue-50" : "hover:bg-gray-50"}>
                        <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                        {editIdx === idx ? (
                          <>
                            <td className="px-3 py-2"><input value={row.staffId} onChange={(e) => setPreview((p) => p.map((r, i) => i === idx ? { ...r, staffId: e.target.value } : r))} className="w-full border border-blue-300 rounded px-1 py-0.5 font-mono" /></td>
                            <td className="px-3 py-2"><input value={row.name} onChange={(e) => setPreview((p) => p.map((r, i) => i === idx ? { ...r, name: e.target.value } : r))} className="w-full border border-blue-300 rounded px-1 py-0.5" /></td>
                            <td className="px-3 py-2"><input value={row.designation} onChange={(e) => setPreview((p) => p.map((r, i) => i === idx ? { ...r, designation: e.target.value } : r))} className="w-full border border-blue-300 rounded px-1 py-0.5" /></td>
                            <td className="px-3 py-2"><select value={row.section} onChange={(e) => setPreview((p) => p.map((r, i) => i === idx ? { ...r, section: e.target.value } : r))} className="border border-blue-300 rounded px-1 py-0.5 bg-white text-xs">{SECTIONS.map((s) => <option key={s}>{s}</option>)}</select></td>
                            <td className="px-3 py-2"><button onClick={() => setEditIdx(null)} className="text-green-600 font-medium">Done</button></td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 font-mono text-gray-600">{row.staffId}</td><td className="px-3 py-2 font-medium text-gray-800">{row.name}</td>
                            <td className="px-3 py-2 text-gray-500">{row.designation}</td><td className="px-3 py-2"><SectionBadge section={row.section} /></td>
                            <td className="px-3 py-2 flex gap-2"><button onClick={() => setEditIdx(idx)} className="text-blue-600 hover:underline">Edit</button><button onClick={() => setPreview((p) => p.filter((_, i) => i !== idx))} className="text-red-500 hover:underline">Del</button></td>
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
      <SearchBar
        value={rawSearch}
        onChange={handleSearch}
        placeholder="Search by name, staff ID, designation, or section… (min. 2 chars)"
        resultCount={filtered.length}
        totalCount={staffList.length}
        minChars={2}
        isIdSearch={isId}
        results={dropdownResults}
        renderResult={renderDropdownResult}
        onResultClick={(s) => { setRawSearch(""); setSearch(""); setSelectedStaff(s); }}
        emptyMessage={isId ? `No staff with ID "${rawSearch}"` : "No staff found"}
        className="mb-2"
      />
      {rawSearch.trim().length >= 2 && (
        <p className="text-xs mb-4 pl-1">
          {isId
            ? <span className="text-amber-600 font-medium">🔑 ID search — exact matches only · {filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
            : <span className="text-gray-400">🔍 Smart search · {filtered.length} of {staffList.length} staff</span>}
        </p>
      )}

      {/* Empty */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
          <p className="text-4xl mb-3">{isId ? "🔑" : "🔍"}</p>
          <p className="text-gray-500 font-medium text-sm">{searchActive ? `No match for "${rawSearch}"` : "No staff added yet"}</p>
          {rawSearch && <button onClick={() => { setRawSearch(""); setSearch(""); }} className="mt-3 text-xs text-blue-600 hover:underline font-medium">Clear search</button>}
        </div>
      ) : (
        <div className="space-y-8">
          {SECTION_ORDER.map((section) => {
            const group = grouped[section];
            if (!group || group.length === 0) return null;
            return (
              <div key={section}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest px-2">
                    🏛️ {section} SECTION
                    <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium normal-case">{group.length}</span>
                  </span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>

                {/* Desktop */}
                <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr className="text-left text-gray-500 text-xs uppercase">
                        <th className="px-5 py-3">Name</th><th className="px-5 py-3">Staff ID</th>
                        <th className="px-5 py-3">Designation</th><th className="px-5 py-3">Section</th>
                        <th className="px-5 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {group.map((s) => (
                        <tr key={s.id} className="hover:bg-blue-50 transition">
                          <td className="px-5 py-3 font-medium text-gray-800 cursor-pointer" onClick={() => setSelectedStaff(s)}>
                            <HL text={s.name} query={search} />
                          </td>
                          <td className="px-5 py-3 font-mono text-xs text-gray-500">
                            <HL text={s.staffId} query={search} />
                          </td>
                          <td className="px-5 py-3 text-gray-500">
                            <HL text={s.designation} query={search} />
                          </td>
                          <td className="px-5 py-3"><SectionBadge section={s.section} /></td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <button onClick={() => setSelectedStaff(s)}
                                className="text-xs font-medium px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition">View</button>
                              <button onClick={() => openEdit(s)}
                                className="text-xs font-medium px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-green-400 hover:text-green-600 hover:bg-green-50 transition">✏️ Edit</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile */}
                <div className="md:hidden space-y-2">
                  {group.map((s) => (
                    <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between cursor-pointer active:bg-blue-50" onClick={() => setSelectedStaff(s)}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-base flex-shrink-0">{s.name?.charAt(0)}</div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-800 text-sm truncate"><HL text={s.name} query={search} /></p>
                          <p className="text-xs text-gray-400 font-mono"><HL text={s.staffId} query={search} /></p>
                          <p className="text-xs text-gray-500 mt-0.5">{s.designation}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-gray-400 text-lg">›</span>
                        <button onClick={(e) => { e.stopPropagation(); openEdit(s); }} className="text-xs text-green-600 font-medium hover:underline">✏️ Edit</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedStaff && <StaffDetailModal staff={selectedStaff} onClose={() => setSelectedStaff(null)} onDeleted={() => setSelectedStaff(null)} />}
    </AdminLayout>
  );
}