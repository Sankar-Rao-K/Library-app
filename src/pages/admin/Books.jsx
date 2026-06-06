import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import AdminLayout from "../../components/AdminLayout";
import QRDisplayModal from "../../components/QRDisplayModal";
import {
  listenToBooks, addBook, addBooksBatch, updateBook,
  deleteBook, listenToTransactions,
} from "../../firebase/firestore";
import {
  smartSearch, getHighlightSegments, isIdQuery, debounce,
} from "../../utils/searchUtils";

const EMPTY = { title: "", author: "", barcode: "", subject: "", totalCopies: 1 };

// ── Excel parser ───────────────────────────────────────────────────────
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

// ── Highlight component ────────────────────────────────────────────────
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

// ── Inline Edit Row (desktop) ──────────────────────────────────────────
function EditRow({ book, onSave, onCancel }) {
  const [form, setForm] = useState({
    title:       book.title       || "",
    author:      book.author      || "",
    barcode:     book.barcode     || book.accessionNo || "",
    subject:     book.subject     || book.genre || "",
    totalCopies: book.totalCopies || 1,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.title.trim() || !form.barcode.trim()) return;
    setSaving(true);
    try { await onSave(form); }
    catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  };

  const inp = "w-full border border-blue-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-blue-50";

  return (
    <tr className="bg-blue-50 border-l-4 border-blue-500">
      <td className="px-3 py-2">
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Title" className={inp} autoFocus />
      </td>
      <td className="px-3 py-2">
        <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })}
          placeholder="Author" className={inp} />
      </td>
      <td className="px-3 py-2">
        <input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })}
          placeholder="Accession No." className={`${inp} font-mono`} />
      </td>
      <td className="px-3 py-2">
        <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
          placeholder="Subject" className={inp} />
      </td>
      <td className="px-3 py-2">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          book.available ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
        }`}>
          {book.available ? "Available" : "Issued"}
        </span>
      </td>
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

// ── Inline Edit Card (mobile) ──────────────────────────────────────────
function EditCard({ book, onSave, onCancel }) {
  const [form, setForm] = useState({
    title:       book.title       || "",
    author:      book.author      || "",
    barcode:     book.barcode     || book.accessionNo || "",
    subject:     book.subject     || book.genre || "",
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
          { label: "Title",            key: "title",   placeholder: "Book title",    mono: false },
          { label: "Author",           key: "author",  placeholder: "Author name",   mono: false },
          { label: "Accession / Code", key: "barcode", placeholder: "Accession no.", mono: true  },
          { label: "Subject",          key: "subject", placeholder: "Subject",       mono: false },
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

// ── Delete Confirm (mobile card) ───────────────────────────────────────
function DeleteConfirm({ book, onConfirm, onCancel }) {
  const [deleting, setDeleting] = useState(false);
  const handle = async () => {
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
            <button onClick={handle} disabled={deleting}
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

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function Books() {
  const [books, setBooks]               = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [form, setForm]                 = useState(EMPTY);
  const [showForm, setShowForm]         = useState(false);
  const [loading, setLoading]           = useState(false);
  const [showBB, setShowBB]             = useState(true);
  const [newBookQR, setNewBookQR]       = useState(null);

  // ── Search state — rawSearch drives input, search is debounced ──────
  const [rawSearch, setRawSearch] = useState("");
  const [search,    setSearch]    = useState("");

  // ── Category tab ────────────────────────────────────────────────────
  const [catTab, setCatTab] = useState("all");

  // Edit / delete
  const [editingId,  setEditingId]  = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Import
  const [showImport,    setShowImport]    = useState(false);
  const [preview,       setPreview]       = useState(null);
  const [importFile,    setImportFile]    = useState("");
  const [importError,   setImportError]   = useState("");
  const [importSaving,  setImportSaving]  = useState(false);
  const [importDone,    setImportDone]    = useState(false);
  const [dupRows,       setDupRows]       = useState(new Set());
  const [showDupCleanup, setShowDupCleanup] = useState(false);
  const [deletingDupId,  setDeletingDupId]  = useState(null);

  const fileRef = useRef();

  // ── Debounced search — 200ms ─────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSet = useCallback(debounce((v) => setSearch(v), 200), []);

  const handleSearchChange = (v) => {
    setRawSearch(v);
    debouncedSet(v);
  };

  useEffect(() => {
    const u1 = listenToBooks(setBooks);
    const u2 = listenToTransactions(setTransactions);
    return () => { u1(); u2(); };
  }, []);

  // ── Who has this book issued ─────────────────────────────────────────
  const issuedTo = (book) => {
    const txn = transactions.find(
      (t) =>
        (t.bookId === book.id || t.barcode === (book.barcode || book.accessionNo)) &&
        t.status === "issued"
    );
    return txn ? (txn.studentName || txn.borrowerName || txn.studentPin || null) : null;
  };

  // ── Catalogue classifier ─────────────────────────────────────────────
  const getCatalogue = (b) => {
    const acc = (b.accessionNo || b.barcode || "").toUpperCase();
    if (b.isBB || acc.startsWith("BB")) return "BB";
    if (acc.startsWith("DD") || (b.subject || "").toLowerCase().includes("donat")) return "DD";
    return (b.subject || b.genre || "General").trim();
  };

  // ── Dynamic category list ─────────────────────────────────────────────
  const allCategories = useMemo(() => {
    const cats = new Set();
    books.forEach((b) => cats.add(getCatalogue(b)));
    const pinned = ["BB", "DD"].filter((c) => cats.has(c));
    const rest   = [...cats].filter((c) => c !== "BB" && c !== "DD").sort();
    return ["all", ...pinned, ...rest];
  }, [books]);

  // ── DB duplicates ─────────────────────────────────────────────────────
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

  // ── Demo CSV ──────────────────────────────────────────────────────────
  const downloadDemoCSV = () => {
    const csv = [
      "Accession No.,Title,Author / Editor,Subject / Branch",
      "1001,Engineering Mathematics,B.S. Grewal,CME",
      "1002,Basic Electrical Engineering,D.C. Kulshreshtha,ECE",
      "1003,Workshop Technology,Hajra Choudhary,CME",
      "BB-001,Programming in C,Dennis Ritchie,Computer Science",
      "BB-002,Data Structures,Seymour Lipschutz,Computer Science",
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "demo_books_import_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Add book ──────────────────────────────────────────────────────────
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
      setForm(EMPTY); setShowForm(false);
    } catch (err) { alert("Error: " + err.message); }
    setLoading(false);
  };

  // ── Save edit ─────────────────────────────────────────────────────────
  const handleSaveEdit = async (bookId, fd) => {
    await updateBook(bookId, {
      title:       fd.title.trim(),
      author:      fd.author.trim(),
      barcode:     fd.barcode.trim(),
      accessionNo: fd.barcode.trim(),
      subject:     fd.subject.trim(),
      genre:       fd.subject.trim(),
      totalCopies: Number(fd.totalCopies) || 1,
    });
    setEditingId(null);
  };

  // ── Delete ────────────────────────────────────────────────────────────
  const handleDeleteBook = async (bookId) => { await deleteBook(bookId); setDeletingId(null); };
  const handleDeleteDup  = async (bookId) => {
    setDeletingDupId(bookId);
    try { await deleteBook(bookId); }
    catch (err) { alert("Error: " + err.message); }
    setDeletingDupId(null);
  };

  const openEdit   = (id, e) => { e?.stopPropagation(); setEditingId(id);  setDeletingId(null); };
  const openDelete = (id, e) => { e?.stopPropagation(); setDeletingId(id); setEditingId(null);  };
  const closeAll   = ()       => { setEditingId(null); setDeletingId(null); };

  // ── Import ────────────────────────────────────────────────────────────
  const resetImport = () => {
    setPreview(null); setImportFile(""); setImportError(""); setImportDone(false); setDupRows(new Set());
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setImportError(""); setPreview(null); setImportDone(false); setDupRows(new Set());
    setImportFile(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb   = XLSX.read(ev.target.result, { type: "array" });
        const rows = parseBooks(wb);
        if (rows.length === 0) { setImportError("No valid records found."); return; }
        const seenInFile = {};
        rows.forEach((r, i) => {
          const key = (r.accessionNo || "").trim();
          if (!seenInFile[key]) seenInFile[key] = [];
          seenInFile[key].push(i);
        });
        const existingCodes = new Set(books.map((b) => (b.accessionNo || b.barcode || "").trim()));
        const dups = new Set();
        Object.values(seenInFile).forEach((indices) => { if (indices.length > 1) indices.forEach((i) => dups.add(i)); });
        rows.forEach((r, i) => { if (existingCodes.has((r.accessionNo || "").trim())) dups.add(i); });
        setDupRows(dups); setPreview(rows);
      } catch (err) { setImportError("Failed to parse: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleConfirmImport = async () => {
    setImportSaving(true);
    try { await addBooksBatch(preview); setImportDone(true); setPreview(null); }
    catch (err) { setImportError("Import failed: " + err.message); }
    setImportSaving(false);
  };

  // ── Search pipeline ───────────────────────────────────────────────────
  const searchActive = search.trim().length >= 2;
  const isId         = isIdQuery(search.trim());

  // 1. Smart search (empty query → all books)
  const afterSearch = searchActive
    ? smartSearch(books, search, ["title", "author", "accessionNo", "barcode", "subject", "genre"], 20, [], 50)
    : books;

  // 2. Category filter
  const catFiltered = catTab === "all"
    ? afterSearch
    : afterSearch.filter((b) => getCatalogue(b) === catTab);

  // 3. Sort by accession number (natural)
  const sortedFiltered = [...catFiltered].sort((a, b) => {
    const aA = (a.accessionNo || a.barcode || "").trim();
    const bA = (b.accessionNo || b.barcode || "").trim();
    return aA.localeCompare(bA, undefined, { numeric: true, sensitivity: "base" });
  });

  // Category counts from search results (live)
  const catCounts = useMemo(() => {
    const counts = {};
    afterSearch.forEach((b) => {
      const cat = getCatalogue(b);
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [afterSearch]);

  // For grouped view (no search)
  const { bySubject, bbBooks } = groupBooks(sortedFiltered);
  const subjectKeys = Object.keys(bySubject).sort();
  const hasAnyBooks = sortedFiltered.length > 0;

  // ── Action buttons ────────────────────────────────────────────────────
  const ActionButtons = ({ book }) => (
    <div className="flex items-center gap-1">
      <button title="Edit" onClick={(e) => openEdit(book.id, e)}
        className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition text-sm">
        ✏️
      </button>
      <button title="Delete" onClick={(e) => openDelete(book.id, e)}
        className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-red-400 hover:text-red-600 hover:bg-red-50 transition text-sm">
        🗑️
      </button>
    </div>
  );

  // ── Status cell ───────────────────────────────────────────────────────
  const StatusCell = ({ book }) => {
    const who = issuedTo(book);
    return book.available ? (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">✓ Available</span>
    ) : (
      <div className="flex flex-col gap-0.5">
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 w-fit">Issued</span>
        {who && <span className="text-xs text-gray-400 font-medium truncate max-w-[130px]" title={who}>→ {who}</span>}
      </div>
    );
  };

  // ── Delete confirm row (desktop) ──────────────────────────────────────
  const renderDeleteRow = (b) => {
    if (deletingId !== b.id) return null;
    return (
      <tr key={`del-${b.id}`} className="bg-red-50 border-l-4 border-red-500">
        <td colSpan={6} className="px-5 py-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1">
              <p className="text-sm font-bold text-red-700">
                Delete "<span className="font-bold">{b.title}</span>"?
              </p>
              <p className="text-xs text-red-400 font-mono mt-0.5">{b.accessionNo || b.barcode}</p>
              {!b.available && <p className="text-xs text-amber-600 font-semibold mt-1">⚠️ This book is currently issued.</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleDeleteBook(b.id)}
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

  // ── Shared table body for a list of books ─────────────────────────────
  const renderTableRows = (group, isBB = false) =>
    group.map((b) => (
      <>
        {editingId === b.id ? (
          <EditRow key={`edit-${b.id}`} book={b}
            onSave={(fd) => handleSaveEdit(b.id, fd)} onCancel={closeAll} />
        ) : (
          <tr key={b.id} className={`transition ${isBB ? "hover:bg-purple-50" : "hover:bg-gray-50"}`}>
            <td className="px-5 py-3 font-medium text-gray-800 max-w-xs">
              <HL text={b.title}  query={search} />
            </td>
            <td className="px-5 py-3 text-gray-500">
              <HL text={b.author} query={search} />
            </td>
            <td className="px-5 py-3 font-mono text-xs text-gray-400">
              <HL text={b.accessionNo || b.barcode} query={search} />
            </td>
            <td className="px-5 py-3 text-gray-500">{b.subject || b.genre}</td>
            <td className="px-5 py-3"><StatusCell book={b} /></td>
            <td className="px-3 py-3"><ActionButtons book={b} /></td>
          </tr>
        )}
        {renderDeleteRow(b)}
      </>
    ));

  const renderMobileCards = (group, isBB = false) =>
    group.map((b) => {
      if (editingId === b.id)
        return <EditCard key={`medit-${b.id}`} book={b}
          onSave={(fd) => handleSaveEdit(b.id, fd)} onCancel={closeAll} />;
      if (deletingId === b.id)
        return <DeleteConfirm key={`mdel-${b.id}`} book={b}
          onConfirm={() => handleDeleteBook(b.id)} onCancel={closeAll} />;
      const who = issuedTo(b);
      return (
        <div key={b.id} className={`bg-white rounded-xl shadow-sm p-4 ${isBB ? "border border-purple-100" : "border border-gray-100"}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-800 text-sm leading-tight">
                <HL text={b.title}  query={search} />
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                <HL text={b.author} query={search} />
              </p>
              <p className="text-xs text-gray-400 font-mono mt-1">{b.accessionNo || b.barcode}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {b.available
                ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">✓</span>
                : <>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Issued</span>
                    {who && <span className="text-xs text-gray-400 text-right">→ {who}</span>}
                  </>}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
            <ActionButtons book={b} />
          </div>
        </div>
      );
    });

  const tableHeader = (isBB = false) => (
    <thead className={isBB ? "bg-purple-50 border-b border-purple-100" : "bg-gray-50 border-b border-gray-100"}>
      <tr className={`text-left text-xs uppercase ${isBB ? "text-purple-400" : "text-gray-500"}`}>
        <th className="px-5 py-3">Title</th>
        <th className="px-5 py-3">Author</th>
        <th className="px-5 py-3">Accession</th>
        <th className="px-5 py-3">Subject</th>
        <th className="px-5 py-3">Status</th>
        <th className="px-3 py-3"></th>
      </tr>
    </thead>
  );

  // ─────────────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      {newBookQR && (
        <QRDisplayModal item={newBookQR} type="book" onClose={() => setNewBookQR(null)} />
      )}

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Books</h1>
          <p className="text-gray-500 text-sm mt-1">{books.length} total books</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {dbDuplicates.length > 0 && (
            <button onClick={() => { setShowDupCleanup(!showDupCleanup); setShowForm(false); setShowImport(false); }}
              className="border border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100 px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5">
              ⚠️ {dbDuplicates.length} Duplicate{dbDuplicates.length > 1 ? "s" : ""}
            </button>
          )}
          <button onClick={() => { setShowImport(!showImport); setShowForm(false); setShowDupCleanup(false); resetImport(); }}
            className="border border-blue-600 text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg text-sm font-medium transition">
            {showImport ? "✕ Cancel" : "📂 Import File"}
          </button>
          <button onClick={() => { setShowForm(!showForm); setShowImport(false); setShowDupCleanup(false); }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
            {showForm ? "✕ Cancel" : "+ Add Book"}
          </button>
        </div>
      </div>

      {/* ── Duplicate cleanup panel ── */}
      {showDupCleanup && dbDuplicates.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">⚠️</span>
            <h2 className="text-sm font-bold text-amber-800">Duplicate Accession Numbers ({dbDuplicates.length} groups)</h2>
          </div>
          <div className="space-y-3">
            {dbDuplicates.map(({ code, group }) => (
              <div key={code} className="bg-white border border-amber-200 rounded-lg p-3">
                <p className="text-xs font-bold text-amber-700 font-mono mb-2">Accession: {code}</p>
                <div className="space-y-2">
                  {group.map((b) => (
                    <div key={b.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{b.title}</p>
                        <p className="text-xs text-gray-400">{b.author}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteDup(b.id)}
                        disabled={deletingDupId === b.id}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 transition flex-shrink-0">
                        {deletingDupId === b.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Add Form ── */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Add New Book</h2>
          <p className="text-xs text-gray-400 mb-4">A QR code will be generated automatically after saving.</p>
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: "Book Title",          key: "title",   placeholder: "e.g. Engineering Mathematics", mono: false },
              { label: "Author",              key: "author",  placeholder: "e.g. B.S. Grewal",             mono: false },
              { label: "Accession / Barcode", key: "barcode", placeholder: "e.g. 1001 or BB-001",          mono: true  },
              { label: "Subject / Branch",    key: "subject", placeholder: "e.g. CME / ECE / General",     mono: false },
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

      {/* ── Import Section ── */}
      {showImport && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Import Books from File</h2>
          <p className="text-xs text-gray-400 mb-4">Supports .xlsx · .csv · .json</p>

          {/* Demo download banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
            <span className="text-xl flex-shrink-0">📄</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">New to importing?</p>
              <p className="text-xs text-amber-600 mt-0.5 mb-3 leading-relaxed">
                Download the demo template, fill in your data, and upload it here.
                <br />
                <span className="font-semibold">Columns:</span> Accession No. · Title · Author / Editor · Subject / Branch
              </p>
              <button onClick={downloadDemoCSV}
                className="text-xs font-bold px-4 py-2 rounded-lg text-white transition"
                style={{ background: "linear-gradient(135deg, #b45309, #d97706)" }}>
                ⬇️ Download Books Template (.csv)
              </button>
            </div>
          </div>

          {importError && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-3">{importError}</div>}
          {importDone  && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 mb-3">
              ✅ Import successful! Go to QR Codes page to print labels.
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
                <p className="text-sm font-semibold text-gray-700">
                  {preview.length} books ready
                  {dupRows.size > 0 && (
                    <span className="ml-2 text-amber-600 text-xs font-medium">
                      ⚠️ {dupRows.size} duplicate accession code(s) highlighted
                    </span>
                  )}
                </p>
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
                    {preview.map((row, idx) => (
                      <tr key={idx} className={`${dupRows.has(idx) ? "bg-amber-50" : "hover:bg-gray-50"}`}>
                        <td className="px-3 py-2 text-gray-400">{idx + 1} {dupRows.has(idx) && <span title="Duplicate accession">⚠️</span>}</td>
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

      {/* ── Category tabs ── */}
      <div className="flex flex-wrap gap-2 mb-3">
        {allCategories.map((cat) => {
          const count = cat === "all"
            ? (searchActive ? afterSearch.length : books.length)
            : (searchActive ? (catCounts[cat] || 0) : books.filter((b) => getCatalogue(b) === cat).length);
          const label = cat === "all" ? "All" : cat;
          return (
            <button key={cat} onClick={() => setCatTab(cat)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition border ${
                catTab === cat ? "text-white border-transparent" : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"
              }`}
              style={catTab === cat ? { background: "linear-gradient(135deg, #0D1F4E, #1B4332)" } : {}}>
              {label}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold leading-none ${
                  catTab === cat ? "bg-white/25 text-white" : "bg-gray-100 text-gray-500"
                }`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Search input ── */}
      <div className="relative mb-5">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg className={`w-4 h-4 transition-colors ${rawSearch ? "text-blue-500" : "text-gray-400"}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
        </span>
        <input
          type="text"
          value={rawSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by title, author, accession, or subject… (min. 2 chars)"
          className="w-full border border-gray-200 rounded-xl pl-10 pr-28 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300 shadow-sm transition"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {searchActive && (
            <span className="text-xs text-gray-400 font-medium tabular-nums">
              {sortedFiltered.length}{sortedFiltered.length >= 50 ? "+" : ""}/{books.length}
            </span>
          )}
          {rawSearch ? (
            <button
              onClick={() => { setRawSearch(""); setSearch(""); }}
              className="w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-500 transition">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : (
            <span className="text-xs text-gray-300 hidden sm:block select-none">Smart search</span>
          )}
        </div>
      </div>

      {/* Search hints */}
      {rawSearch.trim().length === 1 && (
        <p className="text-xs text-blue-500 text-center mb-4 font-medium">
          Type at least 2 characters to search…
        </p>
      )}
      {searchActive && isId && (
        <p className="text-xs text-amber-600 mb-4 font-medium pl-1">
          🔑 ID / accession search — showing exact matches only
        </p>
      )}
      {searchActive && !isId && sortedFiltered.length >= 50 && (
        <p className="text-xs text-amber-600 text-center mb-4 font-medium">
          Showing top 50 results — type more to narrow down
        </p>
      )}

      {/* ── Empty state ── */}
      {!hasAnyBooks ? (
        <div className="bg-white rounded-xl border border-gray-100 py-20 text-center">
          <p className="text-5xl mb-4">📭</p>
          <p className="text-gray-600 font-semibold text-base">
            {searchActive ? `No books found for "${rawSearch}"` : "No books added yet"}
          </p>
          <p className="text-gray-400 text-sm mt-1">
            {searchActive
              ? isId
                ? "Accession number must match exactly."
                : "Try different keywords or fewer words."
              : "Click '+ Add Book' to get started."}
          </p>
          {(rawSearch || catTab !== "all") && (
            <div className="flex justify-center gap-4 mt-4">
              {rawSearch && (
                <button onClick={() => { setRawSearch(""); setSearch(""); }}
                  className="text-xs text-blue-600 hover:underline font-medium">
                  Clear search
                </button>
              )}
              {catTab !== "all" && (
                <button onClick={() => setCatTab("all")}
                  className="text-xs text-blue-600 hover:underline font-medium">
                  Show all categories
                </button>
              )}
            </div>
          )}
        </div>

      ) : searchActive ? (
        /* ── FLAT LIST when search is active ── */
        <div>
          <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              {tableHeader(false)}
              <tbody className="divide-y divide-gray-50">
                {renderTableRows(sortedFiltered, false)}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-2">
            {renderMobileCards(sortedFiltered, false)}
          </div>
        </div>

      ) : (
        /* ── GROUPED layout when no search ── */
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
                <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    {tableHeader(false)}
                    <tbody className="divide-y divide-gray-50">
                      {renderTableRows(group, false)}
                    </tbody>
                  </table>
                </div>
                <div className="md:hidden space-y-2">{renderMobileCards(group, false)}</div>
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
                  <div className="hidden md:block bg-white rounded-xl shadow-sm border border-purple-100 overflow-hidden">
                    <table className="w-full text-sm">
                      {tableHeader(true)}
                      <tbody className="divide-y divide-purple-50">
                        {renderTableRows(bbBooks, true)}
                      </tbody>
                    </table>
                  </div>
                  <div className="md:hidden space-y-2">{renderMobileCards(bbBooks, true)}</div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}