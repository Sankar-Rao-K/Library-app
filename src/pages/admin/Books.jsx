import { useEffect, useState, useRef } from "react";
import * as XLSX from "xlsx";
import AdminLayout from "../../components/AdminLayout";
import QRDisplayModal from "../../components/QRDisplayModal";
import { smartSearch } from "../../utils/searchUtils";
import { listenToBooks, addBook, addBooksBatch } from "../../firebase/firestore";

const EMPTY = { title: "", author: "", barcode: "", subject: "", totalCopies: 1 };

function parseBooks(workbook) {
  const results = [];
  workbook.SheetNames.forEach((sheetName) => {
    if (sheetName === "Sheet3") return;
    const isBB = sheetName.toLowerCase().includes("bb");
    const ws   = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    let cols = { accession: -1, author: -1, title: -1, subject: -1 };
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].map((c) => (c ? String(c).trim() : ""));
      const accCol   = row.findIndex((c) => c.toLowerCase().includes("accession"));
      const titleCol = row.findIndex((c) => c.toLowerCase().includes("title"));
      const authorCol = row.findIndex((c) => c.toLowerCase().includes("author"));
      const subjCol   = row.findIndex((c) => c.toLowerCase().includes("subject") || c.toLowerCase().includes("branch"));
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
      const title     = row[cols.title];
      const author    = cols.author  !== -1 ? row[cols.author]  : "";
      const subject   = cols.subject !== -1 ? row[cols.subject] : "";
      if (!title || String(title).trim().length <= 1) continue;
      if (!accession) continue;
      const barcode = String(accession).trim();
      results.push({
        accessionNo: barcode, barcode, title: String(title).trim(),
        author: author  ? String(author).trim()  : "Unknown",
        subject: subject ? String(subject).trim() : "General",
        genre:   subject ? String(subject).trim() : "General",
        available: true, totalCopies: 1, isBB,
        catalogue: isBB ? "BB Catalogue" : "Main Catalogue",
      });
    }
  });
  return results;
}

function groupBooks(books) {
  const bbBooks   = books.filter((b) => b.isBB);
  const mainBooks = books.filter((b) => !b.isBB);
  const bySubject = {};
  mainBooks.forEach((b) => {
    const key = b.subject || "General";
    if (!bySubject[key]) bySubject[key] = [];
    bySubject[key].push(b);
  });
  return { bySubject, bbBooks };
}

export default function Books() {
  const [books, setBooks]         = useState([]);
  const [form, setForm]           = useState(EMPTY);
  const [showForm, setShowForm]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [search, setSearch]       = useState("");
  const [showBB, setShowBB]       = useState(true);
  const [newBookQR, setNewBookQR] = useState(null); // auto QR

  const [showImport, setShowImport]     = useState(false);
  const [preview, setPreview]           = useState(null);
  const [importFile, setImportFile]     = useState("");
  const [importError, setImportError]   = useState("");
  const [importSaving, setImportSaving] = useState(false);
  const [importDone, setImportDone]     = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    const unsub = listenToBooks(setBooks);
    return () => unsub();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addBook({
        ...form,
        totalCopies: Number(form.totalCopies),
        available: true, isBB: false, catalogue: "Main Catalogue",
      });
      setNewBookQR({ ...form, accessionNo: form.barcode }); // trigger QR modal
      setForm(EMPTY);
      setShowForm(false);
    } catch (err) { alert("Error: " + err.message); }
    setLoading(false);
  };

  const resetImport = () => {
    setPreview(null); setImportFile(""); setImportError(""); setImportDone(false);
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
        const rows = parseBooks(wb);
        if (rows.length === 0) { setImportError("No valid records found."); return; }
        setPreview(rows);
      } catch (err) { setImportError("Failed to parse: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleConfirmImport = async () => {
    setImportSaving(true);
    try {
      await addBooksBatch(preview);
      setImportDone(true); setPreview(null);
    } catch (err) { setImportError("Import failed: " + err.message); }
    setImportSaving(false);
  };

  const filtered = smartSearch(
  books,
  search,
  ["title", "author", "accessionNo", "barcode", "subject", "genre"]
);
  const { bySubject, bbBooks } = groupBooks(filtered);
  const subjectKeys = Object.keys(bySubject).sort();
  const hasAnyBooks = subjectKeys.some((k) => bySubject[k].length > 0) || bbBooks.length > 0;

  return (
    <AdminLayout>
      {/* Auto QR modal */}
      {newBookQR && (
        <QRDisplayModal item={newBookQR} type="book" onClose={() => setNewBookQR(null)} />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Books</h1>
          <p className="text-gray-500 text-sm mt-1">{books.length} total books</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => { setShowImport(!showImport); setShowForm(false); resetImport(); }}
            className="border border-blue-600 text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg text-sm font-medium transition">
            {showImport ? "✕ Cancel" : "📂 Import File"}
          </button>
          <button onClick={() => { setShowForm(!showForm); setShowImport(false); }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
            {showForm ? "✕ Cancel" : "+ Add Book"}
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Add New Book</h2>
          <p className="text-xs text-gray-400 mb-4">A QR code will be generated automatically after saving.</p>
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: "Book Title",          key: "title",   placeholder: "e.g. The Alchemist" },
              { label: "Author",              key: "author",  placeholder: "e.g. Paulo Coelho" },
              { label: "Accession / Barcode", key: "barcode", placeholder: "e.g. 1234 or BB-001" },
              { label: "Subject / Branch",    key: "subject", placeholder: "e.g. CME / General" },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input type="text" required value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total Copies</label>
              <input type="number" min="1" required value={form.totalCopies}
                onChange={(e) => setForm({ ...form, totalCopies: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg text-sm font-medium transition">
                {loading ? "Saving..." : "Save Book & Generate QR"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Import */}
      {showImport && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Import Books from File</h2>
          <p className="text-xs text-gray-400 mb-3">Supports .xlsx · .csv · .json</p>
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-4 font-mono">
            Expected: Accession No. | Author / Editor | Title | Subject / Branch
          </p>
          {importError && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-3">{importError}</div>}
          {importDone && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 mb-3">
              ✅ Import successful! Go to QR Codes page to print all book QR codes.
              <button onClick={resetImport} className="ml-3 underline text-xs">Import more</button>
            </div>
          )}
          {!preview && !importDone && (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl py-8 cursor-pointer transition">
              <span className="text-3xl mb-2">📂</span>
              <span className="text-sm font-medium text-gray-600">Click to choose file</span>
              <span className="text-xs text-gray-400 mt-1">.xlsx · .csv · .json</span>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.json" onChange={handleFile} className="hidden" />
            </label>
          )}
          {importFile && !importDone && <p className="text-xs text-gray-400 mt-2">📄 {importFile}</p>}
          {preview && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <p className="text-sm font-semibold text-gray-700">{preview.length} books ready</p>
                <div className="flex gap-2">
                  <button onClick={resetImport} className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs">Cancel</button>
                  <button onClick={handleConfirmImport} disabled={importSaving}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-1.5 rounded-lg text-xs font-semibold">
                    {importSaving ? "Importing..." : `✓ Import ${preview.length} Books`}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto border border-gray-100 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-left text-gray-500">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Accession</th>
                      <th className="px-3 py-2">Title</th>
                      <th className="px-3 py-2">Author</th>
                      <th className="px-3 py-2">Subject</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                        <td className="px-3 py-2 font-mono text-gray-600">{row.accessionNo}</td>
                        <td className="px-3 py-2 font-medium text-gray-800 truncate max-w-xs">{row.title}</td>
                        <td className="px-3 py-2 text-gray-500 truncate">{row.author}</td>
                        <td className="px-3 py-2 text-gray-500">{row.subject}</td>
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
      <div className="mb-5">
        <input type="text" placeholder="Search by title, author, barcode, or subject..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Empty state */}
      {!hasAnyBooks ? (
        <div className="bg-white rounded-xl border border-gray-100 py-20 text-center">
          <p className="text-5xl mb-4">📭</p>
          <p className="text-gray-600 font-semibold text-base">No records found</p>
          <p className="text-gray-400 text-sm mt-1">
            {search
              ? `No books match "${search}". Try a different search term.`
              : "No books have been added yet. Click '+ Add Book' to get started."}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Main catalogue by subject */}
          {subjectKeys.map((subject) => {
            const group = bySubject[subject];
            if (!group || group.length === 0) return null;
            return (
              <div key={subject}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest px-2">
                    📖 {subject}
                    <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium normal-case">{group.length}</span>
                  </span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>

                <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr className="text-left text-gray-500 text-xs uppercase">
                        <th className="px-5 py-3">Accession</th>
                        <th className="px-5 py-3">Title</th>
                        <th className="px-5 py-3">Author</th>
                        <th className="px-5 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {group.map((b) => (
                        <tr key={b.id} className="hover:bg-gray-50 transition">
                          <td className="px-5 py-3 font-mono text-xs text-gray-400">{b.accessionNo || b.barcode}</td>
                          <td className="px-5 py-3 font-medium text-gray-800">{b.title}</td>
                          <td className="px-5 py-3 text-gray-500">{b.author}</td>
                          <td className="px-5 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${b.available ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                              {b.available ? "Available" : "Issued"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="md:hidden space-y-2">
                  {group.map((b) => (
                    <div key={b.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-gray-800 text-sm leading-tight">{b.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{b.author}</p>
                          <p className="text-xs text-gray-400 font-mono mt-1">{b.accessionNo || b.barcode}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${b.available ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {b.available ? "✓" : "Issued"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* BB Catalogue */}
          {bbBooks.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-purple-200" />
                <span className="flex items-center gap-2 text-xs font-bold text-purple-600 uppercase tracking-widest px-2">
                  📘 BB Catalogue
                  <span className="bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-medium normal-case">{bbBooks.length}</span>
                  <button onClick={() => setShowBB(!showBB)}
                    className="bg-purple-100 hover:bg-purple-200 text-purple-700 px-2 py-0.5 rounded text-xs normal-case font-medium transition">
                    {showBB ? "Hide" : "Show"}
                  </button>
                </span>
                <div className="h-px flex-1 bg-purple-200" />
              </div>

              {showBB && (
                <div className="hidden md:block bg-white rounded-xl shadow-sm border border-purple-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-purple-50 border-b border-purple-100">
                      <tr className="text-left text-purple-400 text-xs uppercase">
                        <th className="px-5 py-3">Accession</th>
                        <th className="px-5 py-3">Title</th>
                        <th className="px-5 py-3">Author</th>
                        <th className="px-5 py-3">Subject</th>
                        <th className="px-5 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-50">
                      {bbBooks.map((b) => (
                        <tr key={b.id} className="hover:bg-purple-50 transition">
                          <td className="px-5 py-3 font-mono text-xs text-gray-400">{b.accessionNo || b.barcode}</td>
                          <td className="px-5 py-3 font-medium text-gray-800">{b.title}</td>
                          <td className="px-5 py-3 text-gray-500">{b.author}</td>
                          <td className="px-5 py-3 text-gray-500">{b.subject}</td>
                          <td className="px-5 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${b.available ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                              {b.available ? "Available" : "Issued"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}