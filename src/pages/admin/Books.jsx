import { useEffect, useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import AdminLayout from "../../components/AdminLayout";
import QRDisplayModal from "../../components/QRDisplayModal";
import {
  listenToBooks,
  addBook,
  addBooksBatch,
  updateBook,
  deleteBook,
  listenToTransactions
} from "../../firebase/firestore";
import { smartSearch } from "../../utils/searchUtils";


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
      const accCol    = row.findIndex((c) => c.toLowerCase().includes("accession"));
      const titleCol  = row.findIndex((c) => c.toLowerCase().includes("title"));
      const authorCol = row.findIndex((c) => c.toLowerCase().includes("author"));
      const subjCol   = row.findIndex((c) =>
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
      const title     = row[cols.title];
      const author    = cols.author  !== -1 ? row[cols.author]  : "";
      const subject   = cols.subject !== -1 ? row[cols.subject] : "";
      if (!title || String(title).trim().length <= 1) continue;
      if (!accession) continue;
      const barcode = String(accession).trim();
      results.push({
        accessionNo: barcode, barcode,
        title:   String(title).trim(),
        author:  author  ? String(author).trim()  : "Unknown",
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

// ── Inline Edit Row (desktop) ─────────────────────────────────────────
function EditRow({ book, onSave, onCancel }) {
  const [form, setForm] = useState({
    title:      book.title      || "",
    author:     book.author     || "",
    barcode:    book.barcode    || book.accessionNo || "",
    subject:    book.subject    || book.genre || "",
    totalCopies: book.totalCopies || 1,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.title.trim() || !form.barcode.trim()) return;
    setSaving(true);
    try {
      await onSave(form);
    } catch (err) {
      alert("Error: " + err.message);
    }
    setSaving(false);
  };

  const inp = "w-full border border-blue-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-blue-50";

  return (
    <tr className="bg-blue-50 border-l-4 border-blue-500">
      {/* Title */}
      <td className="px-3 py-2">
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Title" className={inp} autoFocus />
      </td>
      {/* Author */}
      <td className="px-3 py-2">
        <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })}
          placeholder="Author" className={inp} />
      </td>
      {/* Accession */}
      <td className="px-3 py-2">
        <input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })}
          placeholder="Accession No." className={`${inp} font-mono`} />
      </td>
      {/* Subject */}
      <td className="px-3 py-2">
        <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
          placeholder="Subject" className={inp} />
      </td>
      {/* Status — not editable */}
      <td className="px-3 py-2">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          book.available ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
        }`}>
          {book.available ? "Available" : "Issued"}
        </span>
      </td>
      {/* Actions */}
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={saving}
            className="text-xs font-bold px-3 py-1.5 rounded-lg text-white transition disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
            {saving ? "Saving…" : "✓ Save"}
          </button>
          <button onClick={onCancel}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition">
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Inline Edit Card (mobile) ─────────────────────────────────────────
function EditCard({ book, onSave, onCancel }) {
  const [form, setForm] = useState({
    title:      book.title      || "",
    author:     book.author     || "",
    barcode:    book.barcode    || book.accessionNo || "",
    subject:    book.subject    || book.genre || "",
    totalCopies: book.totalCopies || 1,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(form); }
    catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  };

  const inp = "w-full border border-blue-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-blue-50";

  return (
    <div className="bg-blue-50 border-l-4 border-blue-500 rounded-xl p-4 shadow-sm">
      <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-3">✏️ Editing Book</p>
      <div className="grid grid-cols-1 gap-3">
        {[
          { label: "Title",           key: "title",   placeholder: "Book title",    mono: false },
          { label: "Author",          key: "author",  placeholder: "Author name",   mono: false },
          { label: "Accession / Code", key: "barcode", placeholder: "Accession no.", mono: true  },
          { label: "Subject",         key: "subject", placeholder: "Subject",        mono: false },
        ].map(({ label, key, placeholder, mono }) => (
          <div key={key}>
            <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
            <input value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              placeholder={placeholder}
              className={`${inp}${mono ? " font-mono" : ""}`} />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={handleSave} disabled={saving}
          className="flex-1 text-sm font-bold py-2.5 rounded-xl text-white transition disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
          {saving ? "Saving…" : "✓ Save Changes"}
        </button>
        <button onClick={onCancel}
          className="flex-1 text-sm font-medium py-2.5 rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-100 transition">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Delete Confirm (inline) ───────────────────────────────────────────
function DeleteConfirm({ book, onConfirm, onCancel }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try { await onConfirm(); }
    catch (err) { alert("Error: " + err.message); setDeleting(false); }
  };

  return (
    <div className="bg-red-50 border-l-4 border-red-500 rounded-xl p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center text-xl flex-shrink-0">🗑️</div>
        <div className="flex-1">
          <p className="font-bold text-red-700 text-sm">Delete this book?</p>
          <p className="text-red-600 text-sm mt-0.5 font-medium">{book.title}</p>
          <p className="text-xs text-red-400 mt-0.5 font-mono">{book.accessionNo || book.barcode}</p>
          {!book.available && (
            <p className="text-xs text-amber-600 font-semibold mt-1.5">
              ⚠️ This book is currently issued — deleting it will not auto-return the transaction.
            </p>
          )}
          <div className="flex gap-2 mt-3">
            <button onClick={handleDelete} disabled={deleting}
              className="flex-1 text-xs font-bold py-2 rounded-lg text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition">
              {deleting ? "Deleting…" : "Yes, Delete"}
            </button>
            <button onClick={onCancel}
              className="flex-1 text-xs font-medium py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════
export default function Books() {
  const [books, setBooks]         = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [form, setForm]           = useState(EMPTY);
  const [showForm, setShowForm]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [search, setSearch]       = useState("");
  const [showBB, setShowBB]       = useState(true);
  const [newBookQR, setNewBookQR] = useState(null);
  const [catalogueFilter, setCatalogueFilter] = useState("All");

  // Edit / delete state
  const [editingId, setEditingId]   = useState(null); // book.id being edited
  const [deletingId, setDeletingId] = useState(null); // book.id pending delete

  // Import state
  const [showImport, setShowImport]     = useState(false);
  const [preview, setPreview]           = useState(null);
  const [importFile, setImportFile]     = useState("");
  const [importError, setImportError]   = useState("");
  const [importSaving, setImportSaving] = useState(false);
  const [importDone, setImportDone]     = useState(false);
  const [dupRows, setDupRows]           = useState(new Set()); // indices in preview that are duplicates
  const [showDupCleanup, setShowDupCleanup] = useState(false);
  const [deletingDupId, setDeletingDupId]   = useState(null);
  const fileRef = useRef();

  useEffect(() => {
    const unsub = listenToBooks(setBooks);
    return () => unsub();
  }, []);

  useEffect(() => {
  const unsub = listenToTransactions(setTransactions);
  return () => unsub();
}, []);

// Helper — find who has this book
const issuedTo = (book) => {
  const txn = transactions.find(
    (t) =>
      (t.bookId === book.id ||
        t.barcode === (book.barcode || book.accessionNo)) &&
      t.status === "issued"
  );

  return txn
    ? (txn.studentName || txn.borrowerName || txn.studentPin)
    : null;
};
  // Derived: duplicate accession codes already in Firestore
  const dbDuplicates = useMemo(() => {
    const byAcc = {};
    books.forEach((b) => {
      const key = (b.accessionNo || b.barcode || "").trim();
      if (!key) return;
      if (!byAcc[key]) byAcc[key] = [];
      byAcc[key].push(b);
    });
    return Object.entries(byAcc)
      .filter(([, g]) => g.length > 1)
      .map(([code, group]) => ({ code, group }));
  }, [books]);

  // ── Add new book ────────────────────────────────────────────────────
  const handleAdd = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addBook({
        ...form,
        accessionNo: form.barcode,
        totalCopies: Number(form.totalCopies),
        available: true, isBB: false, catalogue: "Main Catalogue",
      });
      setNewBookQR({ ...form, accessionNo: form.barcode });
      setForm(EMPTY);
      setShowForm(false);
    } catch (err) { alert("Error: " + err.message); }
    setLoading(false);
  };

  // ── Save edit ───────────────────────────────────────────────────────
  const handleSaveEdit = async (bookId, formData) => {
    await updateBook(bookId, {
      title:      formData.title.trim(),
      author:     formData.author.trim(),
      barcode:    formData.barcode.trim(),
      accessionNo: formData.barcode.trim(),
      subject:    formData.subject.trim(),
      genre:      formData.subject.trim(),
      totalCopies: Number(formData.totalCopies) || 1,
    });
    setEditingId(null);
  };

  // ── Delete book ─────────────────────────────────────────────────────
  const handleDeleteBook = async (bookId) => {
    await deleteBook(bookId);
    setDeletingId(null);
  };

  // ── Delete a specific duplicate book ────────────────────────────────
  const handleDeleteDup = async (bookId) => {
    setDeletingDupId(bookId);
    try { await deleteBook(bookId); }
    catch (err) { alert("Error: " + err.message); }
    setDeletingDupId(null);
  };

  // ── Close edit/delete when another row opens ────────────────────────
  const openEdit = (bookId, e) => {
    e?.stopPropagation();
    setEditingId(bookId);
    setDeletingId(null);
  };
  const openDelete = (bookId, e) => {
    e?.stopPropagation();
    setDeletingId(bookId);
    setEditingId(null);
  };
  const closeAll = () => { setEditingId(null); setDeletingId(null); };

  // ── Import helpers ──────────────────────────────────────────────────
  const resetImport = () => {
    setPreview(null); setImportFile(""); setImportError(""); setImportDone(false); setDupRows(new Set());
    if (fileRef.current) fileRef.current.value = "";
  };

  const downloadDemoCSV = (type) => {
  let csv = "";

  if (type === "books") {
    csv = [
      "Accession No.,Title,Author / Editor,Subject / Branch",
      "1001,Engineering Mathematics,B.S. Grewal,CME",
      "1002,Basic Electrical Engineering,D.C. Kulshreshtha,ECE",
      "1003,Workshop Technology,Hajra Choudhary,CME",
      "BB-001,Programming in C,Dennis Ritchie,Computer Science",
      "BB-002,Data Structures,Seymour Lipschutz,Computer Science",
    ].join("\n");
  } else {
    csv = [
      "Sl.No,Pin Number,Name of the Student",
      "1,23173-CM-001,K. Sankar Rao",
      "2,23173-CM-002,A. Revanth N. Kalyan",
      "3,23173-EC-001,M. Ravi Kumar",
      "4,22173-CM-010,B. Sai Prasad",
      "5,24173-CM-005,G. Lakshmi",
    ].join("\n");
  }

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `demo_${type}_import_template.csv`;
  a.click();

  URL.revokeObjectURL(url);
};

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportError(""); setPreview(null); setImportDone(false); setDupRows(new Set());
    setImportFile(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array" });
        const rows = parseBooks(wb);
        if (rows.length === 0) { setImportError("No valid records found."); return; }
        // Detect duplicate accession codes — within the file
        const seenInFile = {};
        rows.forEach((r, i) => {
          const key = (r.accessionNo || "").trim();
          if (!seenInFile[key]) seenInFile[key] = [];
          seenInFile[key].push(i);
        });
        // Also flag rows whose accession already exists in the current books DB
        const existingCodes = new Set(books.map((b) => (b.accessionNo || b.barcode || "").trim()));
        const dups = new Set();
        Object.values(seenInFile).forEach((indices) => {
          if (indices.length > 1) indices.forEach((i) => dups.add(i));
        });
        rows.forEach((r, i) => {
          if (existingCodes.has((r.accessionNo || "").trim())) dups.add(i);
        });
        setDupRows(dups);
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

  // ── Catalogue classifier ────────────────────────────────────────────
  const getCatalogue = (b) => {
    const acc = (b.accessionNo || b.barcode || "").toUpperCase();
    if (b.isBB || acc.startsWith("BB")) return "BB";
    if (acc.startsWith("DD") || (b.subject || "").toLowerCase().includes("donat")) return "DD";
    return (b.subject || b.genre || "General").trim();
  };

  // Available filter chips — fully dynamic from actual books data
  const allCategories = useMemo(() => {
    const cats = new Set();
    books.forEach((b) => cats.add(getCatalogue(b)));
    // BB and DD pinned first, then all other branches alphabetically
    const pinned = ["BB", "DD"].filter((c) => cats.has(c));
    const rest = [...cats].filter((c) => c !== "BB" && c !== "DD").sort();
    return ["All", ...pinned, ...rest];
  }, [books]);

  // ── Filter + sort ───────────────────────────────────────────────────
  const afterSearch = smartSearch(
    books, search,
    ["title", "author", "accessionNo", "barcode", "subject", "genre"]
  );
  const typeFiltered = catalogueFilter === "All"
    ? afterSearch
    : afterSearch.filter((b) => getCatalogue(b) === catalogueFilter);
  const sortedFiltered = [...typeFiltered].sort((a, b) => {
    const accA = (a.accessionNo || a.barcode || "").trim();
    const accB = (b.accessionNo || b.barcode || "").trim();
    // Natural sort: numeric parts compared as numbers
    return accA.localeCompare(accB, undefined, { numeric: true, sensitivity: "base" });
  });

  const { bySubject, bbBooks } = groupBooks(sortedFiltered);
  const subjectKeys = Object.keys(bySubject).sort();
  const hasAnyBooks = sortedFiltered.length > 0;

  // ── Shared action buttons — icon only ──────────────────────────────
  const ActionButtons = ({ book }) => (
    <div className="flex items-center gap-1">
      <button
        title="Edit"
        onClick={(e) => openEdit(book.id, e)}
        className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition text-sm"
      >✏️</button>
      <button
        title="Delete"
        onClick={(e) => openDelete(book.id, e)}
        className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-red-400 hover:text-red-600 hover:bg-red-50 transition text-sm"
      >🗑️</button>
    </div>
  );

  // ── Delete confirm row for desktop ─────────────────────────────────
  const renderDeleteRow = (b) => {
    if (deletingId !== b.id) return null;
    return (
      <tr key={`del-${b.id}`} className="bg-red-50 border-l-4 border-red-500">
        <td colSpan={6} className="px-5 py-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1">
              <p className="text-sm font-bold text-red-700">
                🗑️ Delete "<span className="font-bold">{b.title}</span>"?
              </p>
              <p className="text-xs text-red-400 font-mono mt-0.5">{b.accessionNo || b.barcode}</p>
              {!b.available && (
                <p className="text-xs text-amber-600 font-semibold mt-1">
                  ⚠️ This book is currently issued.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleDeleteBook(b.id)}
                className="text-xs font-bold px-4 py-2 rounded-lg text-white bg-red-600 hover:bg-red-700 transition">
                Yes, Delete
              </button>
              <button onClick={closeAll}
                className="text-xs font-medium px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition">
                Cancel
              </button>
            </div>
          </div>
        </td>
      </tr>
    );
  };

  // ── JSX ─────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
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
          {dbDuplicates.length > 0 && (
            <button
              onClick={() => { setShowDupCleanup(!showDupCleanup); setShowForm(false); setShowImport(false); }}
              className="border border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100 px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5">
              ⚠️ {dbDuplicates.length} Duplicate{dbDuplicates.length > 1 ? "s" : ""}
            </button>
          )}
          <button
            onClick={() => { setShowImport(!showImport); setShowForm(false); setShowDupCleanup(false); resetImport(); }}
            className="border border-blue-600 text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg text-sm font-medium transition">
            {showImport ? "✕ Cancel" : "📂 Import File"}
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setShowImport(false); setShowDupCleanup(false); }}
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
              { label: "Book Title",           key: "title",   placeholder: "e.g. The Alchemist",  mono: false },
              { label: "Author",               key: "author",  placeholder: "e.g. Paulo Coelho",   mono: false },
              { label: "Accession / Barcode",  key: "barcode", placeholder: "e.g. 1234 or BB-001", mono: true  },
              { label: "Subject / Branch",     key: "subject", placeholder: "e.g. CME / General",  mono: false },
            ].map(({ label, key, placeholder, mono }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input type="text" required value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder={placeholder}
                  className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500${mono ? " font-mono" : ""}`} />
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
                {loading ? "Saving…" : "Save Book & Generate QR"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Import Section */}
      {showImport && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Import Books from File</h2>
          <p className="text-xs text-gray-400 mb-3">Supports .xlsx · .csv · .json</p>
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-4 font-mono">
            Expected: Accession No. | Author / Editor | Title | Subject / Branch
          </p>
          {importError && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-3">
              {importError}
            </div>
          )}
          {importDone && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 mb-3">
              ✅ Import successful! Go to QR Codes page to print labels.
              <button onClick={resetImport} className="ml-3 underline text-xs">Import more</button>
            </div>
          )}
          {/* Demo template download */}
<div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
  <span className="text-xl flex-shrink-0">📄</span>

  <div className="flex-1">
    <p className="text-sm font-bold text-amber-800">
      New to importing?
    </p>

    <p className="text-xs text-amber-600 mt-0.5 mb-2">
      Download the demo template, fill in your data, and upload it here.
    </p>

    <button
      onClick={() => downloadDemoCSV("books")}
      className="text-xs font-bold px-4 py-2 rounded-lg text-white transition"
      style={{
        background: "linear-gradient(135deg, #b45309, #d97706)"
      }}
    >
      ⬇️ Download Books Template (.csv)
    </button>
  </div>
</div>
          {!preview && !importDone && (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl py-8 cursor-pointer transition">
              <span className="text-3xl mb-2">📂</span>
              <span className="text-sm font-medium text-gray-600">Click to choose file</span>
              <span className="text-xs text-gray-400 mt-1">.xlsx · .csv · .json</span>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.json"
                onChange={handleFile} className="hidden" />
            </label>
          )}
          {importFile && !importDone && (
            <p className="text-xs text-gray-400 mt-2">📄 {importFile}</p>
          )}
          {preview && (
            <div className="mt-4">
              {dupRows.size > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-4 py-2.5 mb-3 flex items-center gap-2">
                  <span className="text-base">⚠️</span>
                  <span>
                    <strong>{dupRows.size} row{dupRows.size > 1 ? "s" : ""}</strong> have accession codes that already exist in the database or appear more than once in this file. They are highlighted below. Import will still proceed — you can clean up duplicates afterward.
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <p className="text-sm font-semibold text-gray-700">{preview.length} books ready</p>
                <div className="flex gap-2">
                  <button onClick={resetImport}
                    className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-50">
                    Cancel
                  </button>
                  <button onClick={handleConfirmImport} disabled={importSaving}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-1.5 rounded-lg text-xs font-semibold">
                    {importSaving ? "Importing…" : `✓ Import ${preview.length} Books`}
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
                    {preview.map((row, idx) => {
                      const isDup = dupRows.has(idx);
                      return (
                        <tr key={idx} className={isDup ? "bg-amber-50" : "hover:bg-gray-50"}>
                          <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                          <td className="px-3 py-2 font-mono text-gray-600">
                            {row.accessionNo}
                            {isDup && <span className="ml-1.5 text-amber-600 font-bold">⚠️</span>}
                          </td>
                          <td className={`px-3 py-2 font-medium truncate max-w-xs ${isDup ? "text-amber-800" : "text-gray-800"}`}>{row.title}</td>
                          <td className="px-3 py-2 text-gray-500 truncate">{row.author}</td>
                          <td className="px-3 py-2 text-gray-500">{row.subject}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Duplicate Cleanup Panel */}
      {showDupCleanup && dbDuplicates.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-amber-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Duplicate Accession Codes</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {dbDuplicates.length} accession code{dbDuplicates.length > 1 ? "s have" : " has"} multiple entries. Delete the ones you don't need.
              </p>
            </div>
            <button onClick={() => setShowDupCleanup(false)}
              className="text-gray-400 hover:text-gray-600 text-xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">✕</button>
          </div>
          <div className="space-y-4">
            {dbDuplicates.map(({ code, group }) => (
              <div key={code} className="border border-amber-100 rounded-xl overflow-hidden">
                <div className="bg-amber-50 px-4 py-2 flex items-center gap-2">
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">Accession</span>
                  <span className="font-mono text-sm font-bold text-amber-800">{code}</span>
                  <span className="ml-auto bg-amber-200 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full">{group.length} copies</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {group.map((b) => (
                    <div key={b.id} className="px-4 py-3 flex items-center justify-between gap-3 bg-white">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{b.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{b.author} · <span className="text-gray-400">{b.subject || b.genre}</span></p>
                        <p className="text-xs font-mono text-gray-400 mt-0.5">{b.catalogue || "Main Catalogue"}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!b.available && (
                          <span className="text-xs text-red-500 font-medium">Issued</span>
                        )}
                        <button
                          onClick={() => handleDeleteDup(b.id)}
                          disabled={deletingDupId === b.id}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-400 disabled:opacity-50 transition">
                          {deletingDupId === b.id ? "Deleting…" : "🗑️ Delete"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {dbDuplicates.length === 0 && (
            <p className="text-center text-green-600 font-medium text-sm py-4">✅ All duplicates resolved!</p>
          )}
        </div>
      )}

      {/* Search */}
      <div className="mb-3">
        <input type="text" placeholder="Search by title, author, accession, or subject..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Catalogue filter chips */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {allCategories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCatalogueFilter(cat)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
              catalogueFilter === cat
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-600"
            }`}
          >
            {cat === "BB" ? "📘 Book Bank" : cat === "DD" ? "🎁 Donated" : cat}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {!hasAnyBooks ? (
        <div className="bg-white rounded-xl border border-gray-100 py-20 text-center">
          <p className="text-5xl mb-4">📭</p>
          <p className="text-gray-600 font-semibold text-base">No records found</p>
          <p className="text-gray-400 text-sm mt-1">
            {search || catalogueFilter !== "All"
              ? "No books match the current search or filter."
              : "No books have been added yet."}
          </p>
        </div>
      ) : catalogueFilter !== "All" ? (
        /* ── Flat sorted view for a specific catalogue filter ── */
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest px-2">
              {catalogueFilter === "BB" ? "📘 Book Bank" : catalogueFilter === "DD" ? "🎁 Donated" : `📖 ${catalogueFilter}`}
              <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium normal-case">
                {sortedFiltered.length}
              </span>
            </span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-gray-500 text-xs uppercase">
                  <th className="px-5 py-3">Title</th>
                  <th className="px-5 py-3">Author</th>
                  <th className="px-5 py-3">Accession</th>
                  <th className="px-5 py-3">Subject</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sortedFiltered.map((b) => (
                  <>
                    {editingId === b.id ? (
                      <EditRow key={`edit-${b.id}`} book={b}
                        onSave={(fd) => handleSaveEdit(b.id, fd)} onCancel={closeAll} />
                    ) : (
                      <tr key={b.id} className="hover:bg-gray-50 transition">
                        <td className="px-5 py-3 font-medium text-gray-800">{b.title}</td>
                        <td className="px-5 py-3 text-gray-500">{b.author}</td>
                        <td className="px-5 py-3 font-mono text-xs text-gray-400">{b.accessionNo || b.barcode}</td>
                        <td className="px-5 py-3 text-gray-500">{b.subject || b.genre}</td>
                        <td className="px-5 py-3">
  {b.available ? (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
      ✓ Available
    </span>
  ) : (
    <div className="flex flex-col gap-0.5">
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 w-fit">
        Issued
      </span>

      {(() => {
        const who = issuedTo(b);

        return who ? (
          <span
            className="text-xs text-gray-400 font-medium truncate max-w-[120px]"
            title={who}
          >
            → {who}
          </span>
        ) : null;
      })()}
    </div>
  )}
</td>
                        <td className="px-3 py-3"><ActionButtons book={b} /></td>
                      </tr>
                    )}
                    {deletingId === b.id && renderDeleteRow(b)}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {sortedFiltered.map((b) => {
              if (editingId === b.id) return <EditCard key={`medit-${b.id}`} book={b} onSave={(fd) => handleSaveEdit(b.id, fd)} onCancel={closeAll} />;
              if (deletingId === b.id) return <DeleteConfirm key={`mdel-${b.id}`} book={b} onConfirm={() => handleDeleteBook(b.id)} onCancel={closeAll} />;
              return (
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
                  <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
                    <ActionButtons book={b} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ── Grouped view for "All" ── */
        <div className="space-y-8">

          {/* Main Catalogue by subject */}
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

                {/* Desktop table */}
                <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr className="text-left text-gray-500 text-xs uppercase">
                        <th className="px-5 py-3">Title</th>
                        <th className="px-5 py-3">Author</th>
                        <th className="px-5 py-3">Accession</th>
                        <th className="px-5 py-3">Subject</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-3 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {group.map((b) => (
                        <>
                          {editingId === b.id ? (
                            <EditRow key={`edit-${b.id}`} book={b}
                              onSave={(fd) => handleSaveEdit(b.id, fd)} onCancel={closeAll} />
                          ) : (
                            <tr key={b.id} className="hover:bg-gray-50 transition">
                              <td className="px-5 py-3 font-medium text-gray-800">{b.title}</td>
                              <td className="px-5 py-3 text-gray-500">{b.author}</td>
                              <td className="px-5 py-3 font-mono text-xs text-gray-400">{b.accessionNo || b.barcode}</td>
                              <td className="px-5 py-3 text-gray-500">{b.subject || b.genre}</td>
                              <td className="px-5 py-3">
  {b.available ? (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
      ✓ Available
    </span>
  ) : (
    <div className="flex flex-col gap-0.5">
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 w-fit">
        Issued
      </span>

      {(() => {
        const who = issuedTo(b);

        return who ? (
          <span
            className="text-xs text-gray-400 font-medium truncate max-w-[120px]"
            title={who}
          >
            → {who}
          </span>
        ) : null;
      })()}
    </div>
  )}
</td>
                              <td className="px-3 py-3"><ActionButtons book={b} /></td>
                            </tr>
                          )}
                          {deletingId === b.id && renderDeleteRow(b)}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-2">
                  {group.map((b) => {
                    if (editingId === b.id) return <EditCard key={`medit-${b.id}`} book={b} onSave={(fd) => handleSaveEdit(b.id, fd)} onCancel={closeAll} />;
                    if (deletingId === b.id) return <DeleteConfirm key={`mdel-${b.id}`} book={b} onConfirm={() => handleDeleteBook(b.id)} onCancel={closeAll} />;
                    return (
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
                        <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
                          <ActionButtons book={b} />
                        </div>
                      </div>
                    );
                  })}
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
                  📘 Book Bank (BB)
                  <span className="bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-medium normal-case">{bbBooks.length}</span>
                  <button onClick={() => setShowBB(!showBB)}
                    className="bg-purple-100 hover:bg-purple-200 text-purple-700 px-2 py-0.5 rounded text-xs normal-case font-medium transition">
                    {showBB ? "Hide" : "Show"}
                  </button>
                </span>
                <div className="h-px flex-1 bg-purple-200" />
              </div>

              {showBB && (
                <>
                  {/* Desktop */}
                  <div className="hidden md:block bg-white rounded-xl shadow-sm border border-purple-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-purple-50 border-b border-purple-100">
                        <tr className="text-left text-purple-400 text-xs uppercase">
                          <th className="px-5 py-3">Title</th>
                          <th className="px-5 py-3">Author</th>
                          <th className="px-5 py-3">Accession</th>
                          <th className="px-5 py-3">Subject</th>
                          <th className="px-5 py-3">Status</th>
                          <th className="px-3 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-purple-50">
                        {bbBooks.map((b) => (
                          <>
                            {editingId === b.id ? (
                              <EditRow key={`edit-${b.id}`} book={b}
                                onSave={(fd) => handleSaveEdit(b.id, fd)} onCancel={closeAll} />
                            ) : (
                              <tr key={b.id} className="hover:bg-purple-50 transition">
                                <td className="px-5 py-3 font-medium text-gray-800">{b.title}</td>
                                <td className="px-5 py-3 text-gray-500">{b.author}</td>
                                <td className="px-5 py-3 font-mono text-xs text-gray-400">{b.accessionNo || b.barcode}</td>
                                <td className="px-5 py-3 text-gray-500">{b.subject}</td>
                                <td className="px-5 py-3">
  {b.available ? (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
      ✓ Available
    </span>
  ) : (
    <div className="flex flex-col gap-0.5">
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 w-fit">
        Issued
      </span>

      {(() => {
        const who = issuedTo(b);

        return who ? (
          <span
            className="text-xs text-gray-400 font-medium truncate max-w-[120px]"
            title={who}
          >
            → {who}
          </span>
        ) : null;
      })()}
    </div>
  )}
</td>
                                <td className="px-3 py-3"><ActionButtons book={b} /></td>
                              </tr>
                            )}
                            {deletingId === b.id && renderDeleteRow(b)}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile */}
                  <div className="md:hidden space-y-2">
                    {bbBooks.map((b) => {
                      if (editingId === b.id) return <EditCard key={`medit-${b.id}`} book={b} onSave={(fd) => handleSaveEdit(b.id, fd)} onCancel={closeAll} />;
                      if (deletingId === b.id) return <DeleteConfirm key={`mdel-${b.id}`} book={b} onConfirm={() => handleDeleteBook(b.id)} onCancel={closeAll} />;
                      return (
                        <div key={b.id} className="bg-white rounded-xl border border-purple-100 shadow-sm p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-gray-800 text-sm leading-tight">{b.title}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{b.author}</p>
                              <p className="text-xs text-gray-400 font-mono mt-1">{b.accessionNo || b.barcode}</p>
                              <p className="text-xs text-purple-400 mt-0.5">{b.subject}</p>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${b.available ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                              {b.available ? "✓" : "Issued"}
                            </span>
                          </div>
                          <div className="mt-3 pt-3 border-t border-purple-100 flex gap-2">
                            <ActionButtons book={b} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}