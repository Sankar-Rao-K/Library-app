import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import AdminLayout from "../../components/AdminLayout";
import { addBooksBatch, addStudentsBatch } from "../../firebase/firestore";

// ── Parsers ─────────────────────────────────────────────────────────

function parseBooks(workbook) {
  const results = [];

  workbook.SheetNames.forEach((sheetName) => {
    if (sheetName === "Sheet3") return;
    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    // Detect column positions from header row
    let headerIdx = -1;
    let cols = { accession: -1, author: -1, title: -1, subject: -1 };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].map((c) => (c ? String(c).trim() : ""));
      const accCol = row.findIndex((c) => c.includes("Accession"));
      const titleCol = row.findIndex((c) => c.toLowerCase().includes("title"));
      const authorCol = row.findIndex((c) => c.toLowerCase().includes("author"));
      const subjCol = row.findIndex((c) =>
        c.toLowerCase().includes("subject") || c.toLowerCase().includes("branch")
      );
      if (accCol !== -1 && titleCol !== -1) {
        headerIdx = i;
        cols = { accession: accCol, author: authorCol, title: titleCol, subject: subjCol };
        break;
      }
    }

    if (headerIdx === -1) return;

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((c) => !c)) continue;

      const accession = row[cols.accession];
      const title = row[cols.title];
      const author = cols.author !== -1 ? row[cols.author] : "";
      const subject = cols.subject !== -1 ? row[cols.subject] : "";

      // Skip section divider rows (single letter like "A", "B")
      if (!title || String(title).trim().length <= 1) continue;
      if (!accession) continue;

      const barcode = String(accession).trim();
      results.push({
        accessionNo: barcode,
        barcode,
        title: String(title).trim(),
        author: author ? String(author).trim() : "Unknown",
        subject: subject ? String(subject).trim() : "General",
        available: true,
        genre: subject ? String(subject).trim() : "General",
      });
    }
  });

  return results;
}

function parseStudents(workbook) {
  const results = [];

  workbook.SheetNames.forEach((sheetName) => {
    // Detect year from sheet name
    let year = "I-Yr";
    if (sheetName.includes("II")) year = "II-Yr";
    else if (sheetName.includes("III")) year = "III-Yr";

    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    // Find header row containing "Pin Number"
    let headerIdx = -1;
    let cols = { slno: 0, pin: 1, name: 2 };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].map((c) => (c ? String(c).trim().toLowerCase() : ""));
      const pinCol = row.findIndex((c) => c.includes("pin"));
      const nameCol = row.findIndex((c) => c.includes("name"));
      if (pinCol !== -1 && nameCol !== -1) {
        headerIdx = i;
        cols = { slno: 0, pin: pinCol, name: nameCol };
        break;
      }
    }

    // Some sheets (I-Yr) start directly with data (no labeled header)
    const dataStartIdx = headerIdx !== -1 ? headerIdx + 1 : 0;

    for (let i = dataStartIdx; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((c) => !c)) continue;

      const pin = row[cols.pin];
      const name = row[cols.name];

      if (!pin || !name) continue;
      if (String(pin).toLowerCase().includes("pin")) continue; // skip re-occurring headers

      const pinStr = String(pin).trim();

      // Extract branch from PIN (e.g., 22173-CM-001 → CME, 22173-EC-001 → ECE)
      let branch = "CME";
      if (pinStr.includes("-EC-")) branch = "ECE";
      else if (pinStr.includes("-CM-")) branch = "CME";

      results.push({
        pin: pinStr,
        name: String(name).trim(),
        branch,
        year,
        class: `${branch} ${year}`,
        email: "",
      });
    }
  });

  return results;
}

// ── Main Component ────────────────────────────────────────────────────

const TABS = ["books", "students"];

export default function Import() {
  const [tab, setTab] = useState("books");
  const [preview, setPreview] = useState(null);   // parsed rows
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [editIdx, setEditIdx] = useState(null);   // row being edited
  const fileRef = useRef();

  const reset = () => {
    setPreview(null); setFileName(""); setError("");
    setDone(false); setEditIdx(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError(""); setPreview(null); setDone(false);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        let rows = [];
        const ext = file.name.split(".").pop().toLowerCase();

        if (ext === "json") {
          rows = JSON.parse(ev.target.result);
          if (!Array.isArray(rows)) rows = [rows];
        } else if (ext === "csv") {
          const wb = XLSX.read(ev.target.result, { type: "string" });
          rows = tab === "books" ? parseBooks(wb) : parseStudents(wb);
        } else {
          // xlsx / xls
          const wb = XLSX.read(ev.target.result, { type: "array" });
          rows = tab === "books" ? parseBooks(wb) : parseStudents(wb);
        }

        if (rows.length === 0) {
          setError("No valid records found in this file. Check the format.");
          return;
        }
        setPreview(rows);
      } catch (err) {
        setError("Failed to parse file: " + err.message);
      }
    };

    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "json" || ext === "csv") {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  const handleDeleteRow = (idx) => {
    setPreview((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleEditSave = (idx, updated) => {
    setPreview((prev) => prev.map((r, i) => (i === idx ? updated : r)));
    setEditIdx(null);
  };

  const handleConfirmImport = async () => {
    setSaving(true);
    try {
      if (tab === "books") {
        await addBooksBatch(preview);
      } else {
        await addStudentsBatch(preview);
      }
      setDone(true);
      setPreview(null);
    } catch (err) {
      setError("Import failed: " + err.message);
    }
    setSaving(false);
  };

  const bookColumns = ["accessionNo", "title", "author", "subject", "available"];
  const studentColumns = ["pin", "name", "branch", "year", "class"];
  const columns = tab === "books" ? bookColumns : studentColumns;

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Bulk Import</h1>
        <p className="text-gray-500 text-sm mt-1">
          Upload Excel (.xlsx), CSV, or JSON to add multiple records at once.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); reset(); }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
              tab === t
                ? "bg-blue-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t === "books" ? "📚 Import Books" : "🎓 Import Students"}
          </button>
        ))}
      </div>

      {/* Upload Card */}
      {!preview && !done && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 max-w-2xl">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            Upload {tab === "books" ? "Books" : "Students"} File
          </h2>
          <p className="text-sm text-gray-400 mb-6">
            Supported formats: <span className="font-mono">.xlsx</span>,{" "}
            <span className="font-mono">.csv</span>,{" "}
            <span className="font-mono">.json</span>
          </p>

          {/* Expected format hint */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-xs text-gray-500 font-mono">
            {tab === "books" ? (
              <>
                <p className="font-semibold text-gray-600 mb-1">Expected columns (Books):</p>
                <p>Accession No. | Author / Editor | Title | Subject / Branch</p>
              </>
            ) : (
              <>
                <p className="font-semibold text-gray-600 mb-1">Expected columns (Students):</p>
                <p>Sl.No | Pin Number | Name of the Student</p>
                <p className="mt-1 text-gray-400">Branch auto-detected from PIN (CM→CME, EC→ECE)</p>
              </>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
              {error}
            </div>
          )}

          <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl py-10 cursor-pointer transition">
            <span className="text-4xl mb-3">📂</span>
            <span className="text-sm font-medium text-gray-600">
              Click to choose file or drag & drop
            </span>
            <span className="text-xs text-gray-400 mt-1">.xlsx · .csv · .json</span>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,.json"
              onChange={handleFile}
              className="hidden"
            />
          </label>
          {fileName && (
            <p className="text-center text-sm text-gray-500 mt-3">
              📄 {fileName}
            </p>
          )}
        </div>
      )}

      {/* Preview Table */}
      {preview && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden max-w-full">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="font-semibold text-gray-800">
                Preview — {preview.length} records from{" "}
                <span className="font-mono text-sm text-blue-600">{fileName}</span>
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Review the data below. You can edit or delete rows before importing.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={reset}
                className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={saving || preview.length === 0}
                className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-5 py-2 rounded-lg text-sm font-semibold transition"
              >
                {saving ? "Importing..." : `✓ Import ${preview.length} Records`}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border-b border-red-200 text-red-600 text-sm px-6 py-3">
              {error}
            </div>
          )}

          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-left text-gray-500 text-xs uppercase">
                  <th className="px-4 py-3">#</th>
                  {columns.map((c) => (
                    <th key={c} className="px-4 py-3">{c}</th>
                  ))}
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {preview.map((row, idx) => (
                  <tr key={idx} className={editIdx === idx ? "bg-blue-50" : "hover:bg-gray-50"}>
                    <td className="px-4 py-2 text-gray-400 text-xs">{idx + 1}</td>
                    {columns.map((col) => (
                      <td key={col} className="px-4 py-2">
                        {editIdx === idx ? (
                          <input
                            value={row[col] ?? ""}
                            onChange={(e) =>
                              setPreview((prev) =>
                                prev.map((r, i) =>
                                  i === idx ? { ...r, [col]: e.target.value } : r
                                )
                              )
                            }
                            className="w-full border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none"
                          />
                        ) : (
                          <span className="text-gray-700">
                            {col === "available"
                              ? row[col] ? "✅ Yes" : "❌ No"
                              : String(row[col] ?? "")}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-2">
                      <div className="flex gap-2">
                        {editIdx === idx ? (
                          <button
                            onClick={() => setEditIdx(null)}
                            className="text-xs text-green-600 hover:underline font-medium"
                          >
                            Done
                          </button>
                        ) : (
                          <button
                            onClick={() => setEditIdx(idx)}
                            className="text-xs text-blue-600 hover:underline font-medium"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteRow(idx)}
                          className="text-xs text-red-500 hover:underline font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Success */}
      {done && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center max-w-lg">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Import Successful!</h2>
          <p className="text-gray-500 text-sm mb-6">
            All records have been saved to the database.
          </p>
          <button
            onClick={reset}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold transition"
          >
            Import More
          </button>
        </div>
      )}
    </AdminLayout>
  );
}