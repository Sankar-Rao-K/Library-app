import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import AdminLayout from "../../components/AdminLayout";
import QRDisplayModal from "../../components/QRDisplayModal";
import {
  listenToBooks, addBook, addBooksBatch, updateBook,
  deleteBook, listenToTransactions,
} from "../../firebase/firestore";
import {
  smartSearch, isIdQuery, getHighlightSegments,
  debounce, getCatalogueFromBook, sortByAccession,
} from "../../utils/searchUtils";

const EMPTY = { title: "", author: "", barcode: "", subject: "", totalCopies: 1 };

// ── Clean author display ───────────────────────────────────────────────
function cleanAuthor(author) {
  if (!author) return "";
  const cleaned = String(author).trim();
  // Replace placeholder values like "------", "---", "N/A", "-"
  if (/^[-–—\s]+$/.test(cleaned) || cleaned.toLowerCase() === "n/a") return "";
  return cleaned;
}

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
      const authCol  = row.findIndex((c) => c.toLowerCase().includes("author"));
      const subjCol  = row.findIndex((c) => c.toLowerCase().includes("subject") || c.toLowerCase().includes("branch"));
      if (accCol !== -1 && titleCol !== -1) { headerIdx = i; cols = { accession: accCol, author: authCol, title: titleCol, subject: subjCol }; break; }
    }
    if (headerIdx === -1) return;
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((c) => !c)) continue;
      const accession = row[cols.accession];
      const title     = row[cols.title];
      const author    = cols.author  !== -1 ? row[cols.author]  : "";
      const subject   = cols.subject !== -1 ? row[cols.subject] : "";
      if (!title || String(title).trim().length <= 1 || !accession) continue;
      const barcode = String(accession).trim();
      results.push({
        accessionNo: barcode, barcode,
        title:    String(title).trim(),
        author:   cleanAuthor(author) || "Unknown",
        subject:  subject ? String(subject).trim() : "General",
        genre:    subject ? String(subject).trim() : "General",
        available: true, totalCopies: 1, isBB,
        catalogue: isBB ? "BB Catalogue" : "Main Catalogue",
      });
    }
  });
  return results;
}

// ── Highlight component ────────────────────────────────────────────────
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

// ── Matched field badge ────────────────────────────────────────────────
function MatchedFieldBadge({ book, query }) {
  if (!query || query.trim().length < 2) return null;
  const q = query.trim().toLowerCase();
  const fields = [
    { key: "title",       label: "Title"     },
    { key: "author",      label: "Author"    },
    { key: "subject",     label: "Subject"   },
    { key: "accessionNo", label: "Accession" },
    { key: "barcode",     label: "Accession" },
  ];
  const matched = fields.find(({ key }) => (book[key] || "").toLowerCase().includes(q));
  if (!matched || matched.key === "title") return null;
  return (
    <span className="ml-1.5 text-xs bg-purple-50 text-purple-600 border border-purple-200 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">
      matched: {matched.label}
    </span>
  );
}

// ── Status Badge ───────────────────────────────────────────────────────
function StatusBadge({ available }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
        available ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
      }`}
      style={{ minWidth: "85px", justifyContent: "center" }}
    >
      {available ? "✓ Available" : "✗ Issued"}
    </span>
  );
}

// ── Accession display ─────────────────────────────────────────────────
function AccessionDisplay({ value, query }) {
  return (
    <span className="font-mono font-medium text-xs" style={{ color: "#374151" }}>
      <HL text={value} query={query} />
    </span>
  );
}

// ── Inline Edit Row (desktop) ──────────────────────────────────────────
function EditRow({ book, onSave, onCancel }) {
  const [form, setForm] = useState({ title: book.title || "", author: book.author || "", barcode: book.barcode || book.accessionNo || "", subject: book.subject || book.genre || "", totalCopies: book.totalCopies || 1 });
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!form.title.trim() || !form.barcode.trim()) return;
    setSaving(true);
    try { await onSave(form); } catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  };
  const inp = "w-full border border-blue-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-blue-50";
  return (
    <tr className="bg-blue-50 border-l-4 border-blue-500">
      <td className="px-3 py-2"><input value={form.title}   onChange={(e) => setForm({ ...form, title:   e.target.value })} placeholder="Title"        className={inp} autoFocus /></td>
      <td className="px-3 py-2"><input value={form.author}  onChange={(e) => setForm({ ...form, author:  e.target.value })} placeholder="Author"       className={inp} /></td>
      <td className="px-3 py-2"><input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="Accession No." className={`${inp} font-mono`} /></td>
      <td className="px-3 py-2"><input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Subject"       className={inp} /></td>
      <td className="px-3 py-2"><StatusBadge available={book.available} /></td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={saving} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>{saving ? "Saving…" : "✓ Save"}</button>
          <button onClick={onCancel} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100">Cancel</button>
        </div>
      </td>
    </tr>
  );
}

// ── Inline Edit Card (mobile) ──────────────────────────────────────────
function EditCard({ book, onSave, onCancel }) {
  const [form, setForm] = useState({ title: book.title || "", author: book.author || "", barcode: book.barcode || book.accessionNo || "", subject: book.subject || book.genre || "", totalCopies: book.totalCopies || 1 });
  const [saving, setSaving] = useState(false);
  const handleSave = async () => { setSaving(true); try { await onSave(form); } catch (err) { alert("Error: " + err.message); } setSaving(false); };
  const inp = "w-full border border-blue-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-blue-50";
  return (
    <div className="bg-blue-50 border-l-4 border-blue-500 rounded-xl p-4 shadow-sm">
      <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-3">✏️ Editing Book</p>
      <div className="grid grid-cols-1 gap-3">
        {[["Title","title","Book title",false],["Author","author","Author name",false],["Accession","barcode","Accession no.",true],["Subject","subject","Subject / Branch",false]].map(([label,key,ph,mono]) => (
          <div key={key}>
            <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
            <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={ph} className={`${inp}${mono?" font-mono":""}`} />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={handleSave} disabled={saving} className="flex-1 text-sm font-bold py-2.5 rounded-xl text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>{saving ? "Saving…" : "✓ Save"}</button>
        <button onClick={onCancel} className="flex-1 text-sm font-medium py-2.5 rounded-xl border border-gray-300 text-gray-600">Cancel</button>
      </div>
    </div>
  );
}

// ── Delete Confirm (mobile) ────────────────────────────────────────────
function DeleteConfirm({ book, onConfirm, onCancel }) {
  const [deleting, setDeleting] = useState(false);
  const handle = async () => { setDeleting(true); try { await onConfirm(); } catch (err) { alert("Error: " + err.message); setDeleting(false); } };
  return (
    <div className="bg-red-50 border-l-4 border-red-500 rounded-xl p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center text-xl flex-shrink-0">🗑️</div>
        <div className="flex-1">
          <p className="font-bold text-red-700 text-sm">Delete this book?</p>
          <p className="text-red-600 text-sm mt-0.5 font-medium">{book.title}</p>
          <p className="font-mono font-medium text-xs mt-0.5" style={{ color: "#374151" }}>{book.accessionNo || book.barcode}</p>
          {!book.available && <p className="text-xs text-amber-600 font-semibold mt-1.5">⚠️ Currently issued — transaction not auto-returned.</p>}
          <div className="flex gap-2 mt-3">
            <button onClick={handle} disabled={deleting} className="flex-1 text-xs font-bold py-2 rounded-lg text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">{deleting ? "Deleting…" : "Yes, Delete"}</button>
            <button onClick={onCancel} className="flex-1 text-xs font-medium py-2 rounded-lg border border-gray-300 text-gray-600">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sort options ───────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { key: "accession",    label: "Accession ↑"  },
  { key: "title",        label: "Title A–Z"     },
  { key: "subject",      label: "Subject A–Z"   },
  { key: "availability", label: "Available First"},
];

function applySortOrder(books, sortKey) {
  const arr = [...books];
  switch (sortKey) {
    case "title":
      return arr.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    case "subject":
      return arr.sort((a, b) => (a.subject || "").localeCompare(b.subject || ""));
    case "availability":
      return arr.sort((a, b) => (b.available ? 1 : 0) - (a.available ? 1 : 0));
    case "accession":
    default:
      return sortByAccession(arr);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function Books() {
  const [books,        setBooks]        = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [form,         setForm]         = useState(EMPTY);
  const [showForm,     setShowForm]     = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [newBookQR,    setNewBookQR]    = useState(null);
  const [sortKey,      setSortKey]      = useState("accession");
  const [showSort,     setShowSort]     = useState(false);

  // Debounced search
  const [rawSearch, setRawSearch] = useState("");
  const [search,    setSearch]    = useState("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSet = useCallback(debounce((v) => setSearch(v), 200), []);
  const handleSearch = (v) => { setRawSearch(v); debouncedSet(v); };

  // Category tab
  const [catTab, setCatTab] = useState("all");

  // Edit / delete
  const [editingId,  setEditingId]  = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Import
  const [showImport,   setShowImport]   = useState(false);
  const [preview,      setPreview]      = useState(null);
  const [importFile,   setImportFile]   = useState("");
  const [importError,  setImportError]  = useState("");
  const [importSaving, setImportSaving] = useState(false);
  const [importDone,   setImportDone]   = useState(false);
  const [dupRows,      setDupRows]      = useState(new Set());
  const fileRef = useRef();

  useEffect(() => {
    const u1 = listenToBooks(setBooks);
    const u2 = listenToTransactions(setTransactions);
    return () => { u1(); u2(); };
  }, []);

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!showSort) return;
    const h = () => setShowSort(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showSort]);

  const issuedTo = (book) => {
    const t = transactions.find((t) => (t.bookId === book.id || t.barcode === (book.barcode || book.accessionNo)) && t.status === "issued");
    return t ? (t.studentName || t.borrowerName || t.studentPin || null) : null;
  };

  // All catalogues
  const allCatalogues = useMemo(() => {
    const cats = new Set();
    books.forEach((b) => cats.add(getCatalogueFromBook(b)));
    const special  = ["BB Catalogue", "Donated Books"];
    const regular  = [...cats].filter((c) => !special.includes(c)).sort();
    const present  = special.filter((c) => cats.has(c));
    return ["all", ...regular, ...present];
  }, [books]);

  const downloadDemoCSV = () => {
    const csv = ["Accession No.,Title,Author / Editor,Subject / Branch","1001,Engineering Mathematics,B.S. Grewal,CME","1002,Basic Electrical Engineering,D.C. Kulshreshtha,ECE","BB-001,Programming in C,Dennis Ritchie,Computer Science","DD-001,Wings of Fire,A.P.J. Abdul Kalam,General"].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "demo_books_import_template.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const handleAdd = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const acc  = form.barcode.trim().toUpperCase();
      const isBB = acc.startsWith("BB");
      await addBook({ ...form, accessionNo: form.barcode, totalCopies: Number(form.totalCopies), available: true, isBB, catalogue: isBB ? "BB Catalogue" : "Main Catalogue" });
      setNewBookQR({ ...form, accessionNo: form.barcode });
      setForm(EMPTY); setShowForm(false);
    } catch (err) { alert("Error: " + err.message); }
    setLoading(false);
  };

  const handleSaveEdit = async (bookId, fd) => {
    const acc  = fd.barcode.trim().toUpperCase();
    const isBB = acc.startsWith("BB");
    await updateBook(bookId, { title: fd.title.trim(), author: cleanAuthor(fd.author) || "Unknown", barcode: fd.barcode.trim(), accessionNo: fd.barcode.trim(), subject: fd.subject.trim(), genre: fd.subject.trim(), totalCopies: Number(fd.totalCopies) || 1, isBB });
    setEditingId(null);
  };

  const handleDeleteBook = async (id) => { await deleteBook(id); setDeletingId(null); };
  const openEdit   = (id, e) => { e?.stopPropagation(); setEditingId(id);  setDeletingId(null); };
  const openDelete = (id, e) => { e?.stopPropagation(); setDeletingId(id); setEditingId(null); };
  const closeAll   = ()       => { setEditingId(null); setDeletingId(null); };

  const resetImport = () => { setPreview(null); setImportFile(""); setImportError(""); setImportDone(false); setDupRows(new Set()); if (fileRef.current) fileRef.current.value = ""; };

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setImportError(""); setPreview(null); setImportDone(false); setDupRows(new Set()); setImportFile(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb   = XLSX.read(ev.target.result, { type: "array" });
        const rows = parseBooks(wb);
        if (rows.length === 0) { setImportError("No valid records found."); return; }
        const existingCodes = new Set(books.map((b) => (b.accessionNo || b.barcode || "").trim()));
        const seenInFile = {};
        rows.forEach((r, i) => { const k = (r.accessionNo || "").trim(); if (!seenInFile[k]) seenInFile[k] = []; seenInFile[k].push(i); });
        const dups = new Set();
        Object.values(seenInFile).forEach((idxs) => { if (idxs.length > 1) idxs.forEach((i) => dups.add(i)); });
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

  // ── Search + category + sort pipeline ─────────────────────────────────
  const searchActive = search.trim().length >= 2;
  const isId         = isIdQuery(search.trim());

  const afterSearch = searchActive
    ? smartSearch(books, search, ["title","author","accessionNo","barcode","subject","genre"], 20, [], 50)
    : books;

  const catFiltered = catTab === "all"
    ? afterSearch
    : afterSearch.filter((b) => getCatalogueFromBook(b) === catTab);

  const sortedFiltered = applySortOrder(catFiltered, sortKey);

  // Live counts per catalogue from search results
  const catCounts = useMemo(() => {
    const counts = {};
    afterSearch.forEach((b) => {
      const cat = getCatalogueFromBook(b);
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [afterSearch]);

  // Group for non-search view
  const grouped = useMemo(() => {
    const g = {};
    sortedFiltered.forEach((b) => {
      const cat = getCatalogueFromBook(b);
      if (!g[cat]) g[cat] = [];
      g[cat].push(b);
    });
    return g;
  }, [sortedFiltered]);

  const groupOrder = useMemo(() => {
    const special = ["BB Catalogue", "Donated Books"];
    const regular = Object.keys(grouped).filter((c) => !special.includes(c)).sort();
    return [...regular, ...special.filter((c) => grouped[c])];
  }, [grouped]);

  // How many distinct categories have results
  const matchedCatCount = Object.keys(grouped).length;

  // ── Render helpers ─────────────────────────────────────────────────────
  const ActionButtons = ({ book }) => (
    <div className="flex items-center gap-1">
      <button onClick={(e) => openEdit(book.id, e)} title="Edit" className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition text-sm">✏️</button>
      <button onClick={(e) => openDelete(book.id, e)} title="Delete" className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-red-400 hover:text-red-600 hover:bg-red-50 transition text-sm">🗑️</button>
    </div>
  );

  const StatusCell = ({ book }) => {
    const who = issuedTo(book);
    return (
      <div className="flex flex-col gap-0.5">
        <StatusBadge available={book.available} />
        {!book.available && who && <span className="text-xs text-gray-400 truncate max-w-[130px]" title={who}>→ {who}</span>}
      </div>
    );
  };

  const renderDeleteRow = (b) => deletingId !== b.id ? null : (
    <tr key={`del-${b.id}`} className="bg-red-50 border-l-4 border-red-500">
      <td colSpan={6} className="px-5 py-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1">
            <p className="text-sm font-bold text-red-700">Delete "{b.title}"?</p>
            <p className="font-mono font-medium text-xs mt-0.5" style={{ color: "#374151" }}>{b.accessionNo || b.barcode}</p>
            {!b.available && <p className="text-xs text-amber-600 font-semibold mt-1">⚠️ Currently issued.</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => handleDeleteBook(b.id)} className="text-xs font-bold px-4 py-2 rounded-lg text-white bg-red-600 hover:bg-red-700">Yes, Delete</button>
            <button onClick={closeAll} className="text-xs font-medium px-4 py-2 rounded-lg border border-gray-300 text-gray-600">Cancel</button>
          </div>
        </div>
      </td>
    </tr>
  );

  const TableHead = ({ isBB }) => (
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

  const renderRows = (group, isBB = false) =>
    group.map((b) => (
      <>
        {editingId === b.id ? (
          <EditRow key={`edit-${b.id}`} book={b} onSave={(fd) => handleSaveEdit(b.id, fd)} onCancel={closeAll} />
        ) : (
          <tr key={b.id} className={`transition ${isBB ? "hover:bg-purple-50" : "hover:bg-gray-50"}`}>
            <td className="px-5 py-3 max-w-xs">
              <div className="flex items-start flex-wrap gap-1">
                <span className="font-medium text-gray-800">
                  <HL text={b.title} query={search} />
                </span>
                <MatchedFieldBadge book={b} query={search} />
              </div>
            </td>
            <td className="px-5 py-3 text-gray-500 text-sm">
              <HL text={b.author || "Unknown"} query={search} />
            </td>
            <td className="px-5 py-3">
              <AccessionDisplay value={b.accessionNo || b.barcode} query={search} />
            </td>
            <td className="px-5 py-3 text-gray-500 text-sm">
              <HL text={b.subject || b.genre} query={search} />
            </td>
            <td className="px-5 py-3"><StatusCell book={b} /></td>
            <td className="px-3 py-3"><ActionButtons book={b} /></td>
          </tr>
        )}
        {renderDeleteRow(b)}
      </>
    ));

  const renderCards = (group) =>
    group.map((b) => {
      if (editingId  === b.id) return <EditCard key={`me-${b.id}`} book={b} onSave={(fd) => handleSaveEdit(b.id, fd)} onCancel={closeAll} />;
      if (deletingId === b.id) return <DeleteConfirm key={`md-${b.id}`} book={b} onConfirm={() => handleDeleteBook(b.id)} onCancel={closeAll} />;
      const who = issuedTo(b);
      return (
        <div key={b.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-start flex-wrap gap-1">
                <p className="font-semibold text-gray-800 text-sm"><HL text={b.title}  query={search} /></p>
                <MatchedFieldBadge book={b} query={search} />
              </div>
              <p className="text-xs text-gray-500 mt-0.5"><HL text={b.author || "Unknown"} query={search} /></p>
              <p className="mt-1"><AccessionDisplay value={b.accessionNo || b.barcode} query={search} /></p>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <StatusBadge available={b.available} />
              {!b.available && who && <span className="text-xs text-gray-400">→ {who}</span>}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2"><ActionButtons book={b} /></div>
        </div>
      );
    });

  const catColor = (cat) => {
    if (cat === "BB Catalogue")  return { divider: "bg-purple-200", text: "text-purple-600", badge: "bg-purple-100 text-purple-600", border: "border-purple-100" };
    if (cat === "Donated Books") return { divider: "bg-amber-200",  text: "text-amber-700",  badge: "bg-amber-100 text-amber-700",  border: "border-amber-100"  };
    return { divider: "bg-gray-200", text: "text-gray-500", badge: "bg-gray-100 text-gray-500", border: "border-gray-100" };
  };

  const ACTIVE = { background: "linear-gradient(135deg, #0D1F4E, #1B4332)" };
  const currentSortLabel = SORT_OPTIONS.find((s) => s.key === sortKey)?.label || "Sort";

  return (
    <AdminLayout>
      {newBookQR && <QRDisplayModal item={newBookQR} type="book" onClose={() => setNewBookQR(null)} />}

      {/* ── Header ── */}
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

      {/* ── Add Form ── */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Add New Book</h2>
          <p className="text-xs text-gray-400 mb-4">
            Accession prefix: <span className="font-semibold">BB-*</span> → BB Catalogue ·
            <span className="font-semibold"> DD-*</span> → Donated Books · Others → Subject category
          </p>
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[["Book Title","title","e.g. Engineering Mathematics",false],["Author","author","e.g. B.S. Grewal",false],["Accession / Barcode","barcode","e.g. 1001, BB-001, DD-001",true],["Subject / Branch","subject","e.g. CME / ECE / General",false]].map(([label,key,ph,mono]) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input type="text" required value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={ph}
                  className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500${mono?" font-mono":""}`} />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total Copies</label>
              <input type="number" min="1" required value={form.totalCopies} onChange={(e) => setForm({ ...form, totalCopies: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg text-sm font-medium transition">
                {loading ? "Saving…" : "Save Book & Generate QR"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Import ── */}
      {showImport && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Import Books from File</h2>
          <p className="text-xs text-gray-400 mb-4">Supports .xlsx · .csv · .json</p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
            <span className="text-xl flex-shrink-0">📄</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">New to importing?</p>
              <p className="text-xs text-amber-600 mt-0.5 mb-3 leading-relaxed">
                Download the template, fill in your data, and upload. <br />
                <span className="font-semibold">Columns required:</span> Accession No. · Title · Author · Subject
              </p>
              <button onClick={downloadDemoCSV} className="text-xs font-bold px-4 py-2 rounded-lg text-white" style={{ background: "linear-gradient(135deg, #b45309, #d97706)" }}>⬇️ Download Template (.csv)</button>
            </div>
          </div>
          {importError && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-3">{importError}</div>}
          {importDone  && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 mb-3">✅ Import successful! <button onClick={resetImport} className="ml-3 underline text-xs">Import more</button></div>}
          {!preview && !importDone && (
            <label className="flex flex-col items-center border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl py-8 cursor-pointer transition">
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
                  {dupRows.size > 0 && <span className="ml-2 text-amber-600 text-xs font-medium">⚠️ {dupRows.size} duplicate(s) highlighted</span>}
                </p>
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
                    <tr className="text-left text-gray-500"><th className="px-3 py-2">#</th><th className="px-3 py-2">Accession</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">Author</th><th className="px-3 py-2">Subject</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.map((row, idx) => (
                      <tr key={idx} className={dupRows.has(idx) ? "bg-amber-50" : "hover:bg-gray-50"}>
                        <td className="px-3 py-2 text-gray-400">{idx + 1} {dupRows.has(idx) && "⚠️"}</td>
                        <td className="px-3 py-2 font-mono font-medium" style={{ color: "#374151" }}>{row.accessionNo}</td>
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
        {allCatalogues.map((cat) => {
          const count = cat === "all"
            ? (searchActive ? afterSearch.length : books.length)
            : (searchActive ? (catCounts[cat] || 0) : books.filter((b) => getCatalogueFromBook(b) === cat).length);
          return (
            <button key={cat} onClick={() => setCatTab(cat)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition border ${catTab === cat ? "text-white border-transparent" : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"}`}
              style={catTab === cat ? ACTIVE : {}}>
              {cat === "all" ? "All" : cat}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold leading-none ${catTab === cat ? "bg-white/25 text-white" : "bg-gray-100 text-gray-500"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Search + Sort row ── */}
      <div className="flex gap-2 mb-2">
        {/* Search input */}
        <div className="relative flex-1">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg className={`w-4 h-4 transition-colors ${rawSearch ? "text-blue-500" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </span>
          <input
            type="text"
            value={rawSearch}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by Title, Author, Accession Number, or Subject…"
            className="w-full border border-gray-200 rounded-xl pl-10 pr-28 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300 shadow-sm"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {searchActive && (
              <span className="text-xs text-gray-500 font-medium tabular-nums whitespace-nowrap">
                {sortedFiltered.length}{sortedFiltered.length >= 50 ? "+" : ""} / {books.length}
              </span>
            )}
            {isId && rawSearch && (
              <span className="text-xs font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full hidden sm:block">ID</span>
            )}
            {rawSearch ? (
              <button onClick={() => { setRawSearch(""); setSearch(""); }}
                className="w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-500 transition">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            ) : (
              <span className="text-xs text-gray-300 hidden sm:block select-none">Smart search</span>
            )}
          </div>
        </div>

        {/* Sort dropdown */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowSort(!showSort)}
            className="flex items-center gap-1.5 border border-gray-200 bg-white text-gray-600 hover:border-gray-400 px-3 py-2.5 rounded-xl text-sm font-medium transition whitespace-nowrap"
          >
            <span>⇅</span>
            <span className="hidden sm:inline">{currentSortLabel}</span>
          </button>
          {showSort && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 overflow-hidden min-w-[170px]"
              onMouseDown={(e) => e.stopPropagation()}>
              {SORT_OPTIONS.map((opt) => (
                <button key={opt.key}
                  onClick={() => { setSortKey(opt.key); setShowSort(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition flex items-center justify-between ${sortKey === opt.key ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-700 hover:bg-gray-50"}`}>
                  {opt.label}
                  {sortKey === opt.key && <span className="text-blue-600">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Search hints & info ── */}
      {rawSearch.trim().length === 1 && (
        <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
          💡 Type at least <strong>2 characters</strong> to search.
          Searching in: <strong>Title · Author · Accession Number · Subject</strong>
        </div>
      )}

      {/* ── Search results banner ── */}
      {searchActive && sortedFiltered.length > 0 && (
        <div className="mb-4 px-4 py-3 rounded-xl border flex items-center justify-between flex-wrap gap-2"
          style={{ background: "#EFF6FF", borderColor: "#BFDBFE" }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-blue-800">
              Search results for "{rawSearch}"
            </span>
            <span className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-full font-bold">
              {sortedFiltered.length}{sortedFiltered.length >= 50 ? "+" : ""} book{sortedFiltered.length !== 1 ? "s" : ""} found
            </span>
            {matchedCatCount > 1 && (
              <span className="text-xs text-blue-600">
                in {matchedCatCount} categories
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-blue-500">
            <span>Searching in:</span>
            {["Title","Author","Accession","Subject"].map((f) => (
              <span key={f} className="bg-white border border-blue-200 text-blue-700 px-2 py-0.5 rounded-full font-medium">{f}</span>
            ))}
          </div>
        </div>
      )}

      {/* Top-50 cap warning */}
      {searchActive && !isId && sortedFiltered.length >= 50 && (
        <p className="text-xs text-amber-600 text-center mb-3 font-medium">
          Showing top 50 results — type more to narrow down
        </p>
      )}

      {/* ── Empty state ── */}
      {sortedFiltered.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center px-6">
          <p className="text-5xl mb-4">{searchActive ? "🔍" : "📭"}</p>
          {searchActive ? (
            <>
              <p className="text-gray-700 font-bold text-base">No books found matching your search</p>
              <p className="text-gray-400 text-sm mt-1 mb-4">
                No results for "<span className="font-semibold text-gray-600">{rawSearch}</span>"
              </p>
              <div className="inline-block text-left bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 text-sm text-gray-600">
                <p className="font-semibold text-gray-700 mb-2">Try searching by:</p>
                <ul className="space-y-1">
                  {["Title (e.g. Engineering Mathematics)", "Author (e.g. Grewal)", "Subject (e.g. CME, ECE)", "Accession Number (e.g. 1001, BB-001)"].map((t) => (
                    <li key={t} className="flex items-center gap-2">
                      <span className="text-blue-500">•</span> {t}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex justify-center gap-4 mt-5">
                <button onClick={() => { setRawSearch(""); setSearch(""); }}
                  className="text-xs text-blue-600 hover:underline font-medium">Clear search</button>
                {catTab !== "all" && (
                  <button onClick={() => setCatTab("all")} className="text-xs text-blue-600 hover:underline font-medium">Show all categories</button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-gray-600 font-semibold text-base">No books added yet</p>
              <p className="text-gray-400 text-sm mt-1">Click '+ Add Book' or import a file to get started.</p>
            </>
          )}
        </div>
      )}

      {/* ── Results ── */}
      {sortedFiltered.length > 0 && (
        <>
          {searchActive ? (
            /* Flat list when searching */
            <div>
              {/* Sorted sort info */}
              <p className="text-xs text-gray-400 mb-2 pl-1">
                Sorted by {currentSortLabel}
              </p>
              <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <TableHead isBB={false} />
                  <tbody className="divide-y divide-gray-50">{renderRows(sortedFiltered, false)}</tbody>
                </table>
              </div>
              <div className="md:hidden space-y-2">{renderCards(sortedFiltered)}</div>
            </div>
          ) : (
            /* Grouped by catalogue when not searching */
            <div className="space-y-8">
              {groupOrder.map((cat) => {
                const group = grouped[cat];
                if (!group || group.length === 0) return null;
                const c   = catColor(cat);
                const isBB = cat === "BB Catalogue";
                return (
                  <div key={cat}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`h-px flex-1 ${c.divider}`} />
                      <span className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest px-2 ${c.text}`}>
                        {isBB ? "📘" : cat === "Donated Books" ? "🎁" : "📖"} {cat}
                        {/* Count: shows as "(4 matching results)" when search is active */}
                        <span className={`px-1.5 py-0.5 rounded-full font-medium normal-case ${c.badge}`}>
                          {group.length} {searchActive ? "matching" : ""}
                        </span>
                      </span>
                      <div className={`h-px flex-1 ${c.divider}`} />
                    </div>
                    <div className={`hidden md:block bg-white rounded-xl shadow-sm overflow-hidden border ${c.border}`}>
                      <table className="w-full text-sm">
                        <TableHead isBB={isBB} />
                        <tbody className="divide-y divide-gray-50">{renderRows(group, isBB)}</tbody>
                      </table>
                    </div>
                    <div className="md:hidden space-y-2">{renderCards(group)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}