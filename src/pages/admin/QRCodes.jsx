import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import AdminLayout from "../../components/AdminLayout";
import { listenToBooks, listenToStudents } from "../../firebase/firestore";

export default function QRCodes() {
  const [books, setBooks] = useState([]);
  const [students, setStudents] = useState([]);
  const [tab, setTab] = useState("books");
  const [search, setSearch] = useState("");
  const printRef = useRef();

  useEffect(() => {
    const u1 = listenToBooks(setBooks);
    const u2 = listenToStudents(setStudents);
    return () => { u1(); u2(); };
  }, []);

  const q = search.toLowerCase();

  const filteredBooks = books.filter(
    (b) =>
      b.title?.toLowerCase().includes(q) ||
      String(b.accessionNo || b.barcode || "").toLowerCase().includes(q) ||
      b.author?.toLowerCase().includes(q)
  );

  const filteredStudents = [...students]
    .sort((a, b) => (a.pin || "").localeCompare(b.pin || ""))
    .filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.pin?.toLowerCase().includes(q) ||
        s.branch?.toLowerCase().includes(q)
    );

  const handlePrint = () => window.print();

  return (
    <AdminLayout>
      <style>{`
        @media print {
          body > *:not(#print-area) { display: none !important; }
          #print-area { display: block !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">QR Code Generator</h1>
          <p className="text-gray-500 text-sm mt-1">
            Generate and print QR codes for books and students.
          </p>
        </div>
        <button
          onClick={handlePrint}
          className="bg-gray-800 hover:bg-gray-900 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition flex items-center gap-2"
        >
          🖨️ Print All
        </button>
      </div>

      {/* Tabs */}
      <div className="no-print flex gap-2 mb-5">
        {[
          { key: "books",    label: "📚 Book QR Codes" },
          { key: "students", label: "🎓 Student Name QR Codes" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSearch(""); }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
              tab === t.key
                ? "bg-blue-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Info box */}
      <div className="no-print bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-5 text-xs text-blue-700">
        {tab === "books" ? (
          <span>📌 Each QR code contains the book's <strong>Accession Number</strong>. Scanning it auto-fills the access code field during issue/return.</span>
        ) : (
          <span>📌 Each QR code contains the student's <strong>Full Name</strong>. Scanning it auto-fills the name verification field during issue/return.</span>
        )}
      </div>

      {/* Search */}
      <div className="no-print mb-6">
        <input
          type="text"
          placeholder={tab === "books" ? "Search by title, accession, author..." : "Search by name, PIN, branch..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* QR Grid */}
      <div id="print-area" ref={printRef}>
        {/* Print header */}
        <div className="hidden print:block mb-6 text-center border-b pb-4">
          <h2 className="text-xl font-bold">LibraryOS — {tab === "books" ? "Book QR Codes" : "Student Name QR Codes"}</h2>
          <p className="text-sm text-gray-500 mt-1">Printed on {new Date().toLocaleDateString("en-IN")}</p>
        </div>

        {tab === "books" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredBooks.length === 0 ? (
              <div className="col-span-full text-center py-16 text-gray-400">No books found.</div>
            ) : (
              filteredBooks.map((b) => {
                const code = b.accessionNo || b.barcode || b.id;
                return (
                  <div
                    key={b.id}
                    className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col items-center gap-2 shadow-sm hover:shadow-md transition break-inside-avoid"
                  >
                    <QRCodeSVG value={code} size={110} level="M" />
                    <p className="text-xs text-center text-gray-800 font-semibold leading-tight line-clamp-2 mt-1">
                      {b.title}
                    </p>
                    <p className="text-xs text-center text-gray-400 font-mono">{code}</p>
                    <p className="text-xs text-center text-gray-400">{b.author}</p>
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === "students" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredStudents.length === 0 ? (
              <div className="col-span-full text-center py-16 text-gray-400">No students found.</div>
            ) : (
              filteredStudents.map((s) => (
                <div
                  key={s.id}
                  className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col items-center gap-2 shadow-sm hover:shadow-md transition break-inside-avoid"
                >
                  <QRCodeSVG value={s.name} size={110} level="M" />
                  <p className="text-xs text-center text-gray-800 font-semibold leading-tight mt-1">
                    {s.name}
                  </p>
                  <p className="text-xs text-center text-gray-400 font-mono">{s.pin}</p>
                  <p className="text-xs text-center text-gray-400">{s.branch}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}