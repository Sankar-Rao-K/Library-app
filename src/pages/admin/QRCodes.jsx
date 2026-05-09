import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import AdminLayout from "../../components/AdminLayout";
import { listenToBooks, listenToStudents, listenToStaff } from "../../firebase/firestore";

export default function QRCodes() {
  const [books, setBooks]       = useState([]);
  const [students, setStudents] = useState([]);
  const [staffList, setStaff]   = useState([]);
  const [tab, setTab]           = useState("books");
  const [search, setSearch]     = useState("");

  useEffect(() => {
    const u1 = listenToBooks(setBooks);
    const u2 = listenToStudents(setStudents);
    const u3 = listenToStaff(setStaff);
    return () => { u1(); u2(); u3(); };
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
    .filter((s) =>
      s.name?.toLowerCase().includes(q) ||
      s.pin?.toLowerCase().includes(q) ||
      s.branch?.toLowerCase().includes(q)
    );

  const filteredStaff = [...staffList]
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .filter((s) =>
      s.name?.toLowerCase().includes(q) ||
      s.staffId?.toLowerCase().includes(q) ||
      s.section?.toLowerCase().includes(q)
    );

  const handlePrint = () => {
    const printContent = document.getElementById("qr-print-content");
    const printWindow  = window.open("", "_blank", "width=900,height=700");
    printWindow.document.write(`
      <!DOCTYPE html><html><head>
      <title>LibraryOS — QR Codes</title>
      <style>
        body { font-family: sans-serif; margin: 0; padding: 16px; }
        h2 { text-align: center; font-size: 18px; margin-bottom: 4px; }
        p.sub { text-align: center; font-size: 12px; color: #666; margin-bottom: 16px; }
        .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
        .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; text-align: center; page-break-inside: avoid; }
        .card p { margin: 4px 0 0; font-size: 11px; color: #374151; font-weight: 600; }
        .card .sub { font-size: 10px; color: #9ca3af; margin-top: 2px; font-weight: 400; }
        svg { display: block; margin: 0 auto; }
      </style></head><body>
      <h2>LibraryOS — ${tab === "books" ? "Book QR Codes" : tab === "students" ? "Student Name QR Codes" : "Staff QR Codes"}</h2>
      <p class="sub">Printed: ${new Date().toLocaleDateString("en-IN")}</p>
      <div class="grid">${printContent.innerHTML}</div>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  };

  const renderCard = (id, qrValue, line1, line2, line3) => (
    <div key={id} style={{border:"1px solid #e5e7eb",borderRadius:10,padding:12,textAlign:"center"}}>
      <QRCodeSVG value={qrValue} size={100} level="M" />
      <p style={{margin:"6px 0 0",fontSize:11,fontWeight:600,color:"#374151",lineHeight:1.3}}>{line1}</p>
      {line2 && <p style={{fontSize:10,color:"#9ca3af",marginTop:2}}>{line2}</p>}
      {line3 && <p style={{fontSize:10,color:"#9ca3af"}}>{line3}</p>}
    </div>
  );

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">QR Code Generator</h1>
          <p className="text-gray-500 text-sm mt-1">Generate and print QR codes for books, students, and staff.</p>
        </div>
        <button onClick={handlePrint}
          className="bg-gray-800 hover:bg-gray-900 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition flex items-center gap-2">
          🖨️ Print QR Codes
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { key: "books",    label: "📚 Books" },
          { key: "students", label: "🎓 Students" },
          { key: "staff",    label: "👩‍🏫 Staff" },
        ].map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setSearch(""); }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
              tab === t.key ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-5 text-xs text-blue-700">
        {tab === "books"
          ? "📌 QR contains Accession Number. Scan to auto-fill the book access code field."
          : tab === "students"
          ? "📌 QR contains Student Full Name. Scan to auto-fill the name verification field."
          : "📌 QR contains Staff Full Name. Scan to auto-fill the name verification field."}
      </div>

      {/* Search */}
      <div className="mb-6">
        <input type="text"
          placeholder={`Search ${tab}...`}
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Hidden print content */}
      <div id="qr-print-content" style={{ display: "none" }}>
        {tab === "books" && filteredBooks.map((b) => {
          const code = b.accessionNo || b.barcode || b.id;
          return renderCard(b.id, code, b.title, code, b.author);
        })}
        {tab === "students" && filteredStudents.map((s) =>
          renderCard(s.id, s.name, s.name, s.pin, s.branch)
        )}
        {tab === "staff" && filteredStaff.map((s) =>
          renderCard(s.id, s.name, s.name, s.staffId, s.section)
        )}
      </div>

      {/* Screen display */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {tab === "books" && (filteredBooks.length === 0
          ? <div className="col-span-full text-center py-16 text-gray-400">No books found.</div>
          : filteredBooks.map((b) => {
              const code = b.accessionNo || b.barcode || b.id;
              return (
                <div key={b.id} className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col items-center gap-2 shadow-sm hover:shadow-md transition">
                  <QRCodeSVG value={code} size={110} level="M" />
                  <p className="text-xs text-center text-gray-800 font-semibold leading-tight line-clamp-2 mt-1">{b.title}</p>
                  <p className="text-xs text-center text-gray-400 font-mono">{code}</p>
                  <p className="text-xs text-center text-gray-400">{b.author}</p>
                </div>
              );
            })
        )}

        {tab === "students" && (filteredStudents.length === 0
          ? <div className="col-span-full text-center py-16 text-gray-400">No students found.</div>
          : filteredStudents.map((s) => (
              <div key={s.id} className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col items-center gap-2 shadow-sm hover:shadow-md transition">
                <QRCodeSVG value={s.name} size={110} level="M" />
                <p className="text-xs text-center text-gray-800 font-semibold leading-tight mt-1">{s.name}</p>
                <p className="text-xs text-center text-gray-400 font-mono">{s.pin}</p>
                <p className="text-xs text-center text-gray-400">{s.branch}</p>
              </div>
            ))
        )}

        {tab === "staff" && (filteredStaff.length === 0
          ? <div className="col-span-full text-center py-16 text-gray-400">No staff found.</div>
          : filteredStaff.map((s) => (
              <div key={s.id} className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col items-center gap-2 shadow-sm hover:shadow-md transition">
                <QRCodeSVG value={s.name} size={110} level="M" />
                <p className="text-xs text-center text-gray-800 font-semibold leading-tight mt-1">{s.name}</p>
                <p className="text-xs text-center text-gray-400 font-mono">{s.staffId}</p>
                <p className="text-xs text-center text-gray-400">{s.section}</p>
              </div>
            ))
        )}
      </div>
    </AdminLayout>
  );
}