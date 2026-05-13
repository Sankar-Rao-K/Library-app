import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import AdminLayout from "../../components/AdminLayout";
import { smartSearch } from "../../utils/searchUtils";
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

const filteredBooks = smartSearch(books, search, ["title", "author", "accessionNo", "barcode"]);

 const filteredStudents = smartSearch(
  [...students].sort((a, b) => (a.pin || "").localeCompare(b.pin || "")),
  search,
  ["name", "pin", "branch"]
);

 const filteredStaff = smartSearch(
  [...staffList].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
  search,
  ["name", "staffId", "section", "designation"]
);

  // Current list for empty state check
  const currentList = tab === "books"
    ? filteredBooks
    : tab === "students"
      ? filteredStudents
      : filteredStaff;

  const handlePrint = () => {
    const cards = currentList.map((item) => {
      const qrVal = tab === "books"
        ? (item.accessionNo || item.barcode || item.id)
        : tab === "students"
          ? item.pin
          : item.staffId;

      const line1 = tab === "books" ? item.title : item.name;
      const line2 = tab === "books"
        ? qrVal
        : tab === "students"
          ? `PIN: ${item.pin} · ${item.branch}`
          : `ID: ${item.staffId} · ${item.section}`;

      return `
        <div class="card">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${128} ${128}" width="128" height="128">
            <!-- QR rendered server-side not possible; use placeholder text -->
          </svg>
          <p class="title">${line1}</p>
          <p class="sub">${line2}</p>
          <p class="code">${qrVal}</p>
        </div>
      `;
    }).join("");

    const w = window.open("", "_blank", "width=1000,height=700");
    const printContent = document.getElementById("qr-grid-print");

    w.document.write(`
      <!DOCTYPE html><html><head>
      <title>LibraryOS QR Codes — ${tab}</title>
      <style>
        body { font-family: sans-serif; margin: 0; padding: 20px; }
        h2 { text-align: center; font-size: 16px; margin-bottom: 4px; }
        .meta { text-align: center; font-size: 11px; color: #666; margin-bottom: 16px; }
        .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
        .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; text-align: center; page-break-inside: avoid; }
        .title { font-size: 11px; font-weight: 700; color: #111; margin: 6px 0 2px; line-height: 1.3; }
        .sub { font-size: 10px; color: #666; margin: 0; }
        .code { font-family: monospace; font-size: 10px; font-weight: 700; color: #333; margin: 4px 0 0; background: #f3f4f6; padding: 2px 6px; border-radius: 4px; display: inline-block; }
        svg { display: block; margin: 0 auto; }
      </style></head><body>
      <h2>📚 Govt. Polytechnic Anakapalli — Library QR Codes</h2>
      <p class="meta">${tab === "books" ? "Book Access Codes" : tab === "students" ? "Student PIN QR Cards" : "Staff ID QR Cards"} · Printed: ${new Date().toLocaleDateString("en-IN")}</p>
      <div class="grid">${printContent?.innerHTML || ""}</div>
      </body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 600);
  };

  const renderQRCard = (item) => {
    const qrVal = tab === "books"
      ? (item.accessionNo || item.barcode || item.id)
      : tab === "students"
        ? item.pin
        : item.staffId;

    const line1 = tab === "books" ? item.title : item.name;
    const line2 = tab === "books"
      ? (item.author || "")
      : tab === "students"
        ? `${item.branch} · ${item.year || ""}`
        : `${item.designation || ""} · ${item.section}`;
    const line3 = tab === "books"
      ? qrVal
      : tab === "students"
        ? `PIN: ${item.pin}`
        : `ID: ${item.staffId}`;

    return (
      <div key={item.id}
        className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col items-center gap-2 shadow-sm hover:shadow-md transition">
        <QRCodeSVG value={qrVal} size={110} level="M" />
        <p className="text-xs text-center text-gray-800 font-bold leading-tight line-clamp-2 mt-1">
          {line1}
        </p>
        <p className="text-xs text-center text-gray-400">{line2}</p>
        <p className="text-xs text-center font-mono font-bold text-gray-600 bg-gray-50 px-2 py-0.5 rounded">
          {line3}
        </p>
      </div>
    );
  };

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">QR Code Generator</h1>
          <p className="text-gray-500 text-sm mt-1">
            Generate and print QR codes for books (accession no.) and members (PIN / Staff ID).
          </p>
        </div>
        <button onClick={handlePrint}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold transition"
          style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
          🖨️ Print QR Codes
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { key: "books",    label: "📚 Books",    hint: "Accession No. QR" },
          { key: "students", label: "🎓 Students", hint: "PIN QR" },
          { key: "staff",    label: "👩‍🏫 Staff",   hint: "CMS ID QR" },
        ].map((t) => (
          <button key={t.key}
            onClick={() => { setTab(t.key); setSearch(""); }}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition ${
              tab === t.key
                ? "text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
            style={tab === t.key ? { background: "linear-gradient(135deg, #0D1F4E, #1B4332)" } : {}}>
            {t.label}
            <span className="text-xs opacity-70 font-normal hidden sm:inline">({t.hint})</span>
          </button>
        ))}
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-5 text-xs text-blue-700 flex items-start gap-2">
        <span className="flex-shrink-0 mt-0.5">ℹ️</span>
        <span>
          {tab === "books"
            ? "QR contains the Accession Number. Scan during issue/return to auto-fill the book access code field."
            : tab === "students"
              ? "QR contains the Student PIN. Scan during issue/return to auto-identify the student."
              : "QR contains the Staff CMS ID. Scan during issue/return to auto-identify the staff member."}
        </span>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input type="text"
          placeholder={`Search ${tab}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Empty state */}
      {currentList.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-20 text-center">
          <p className="text-5xl mb-4">🔍</p>
          <p className="text-gray-600 font-semibold text-base">No records found</p>
          <p className="text-gray-400 text-sm mt-1">
            {search
              ? `No ${tab} match "${search}". Try a different search term.`
              : `No ${tab} have been added yet.`}
          </p>
        </div>
      ) : (
        <>
          {/* Hidden print grid */}
          <div id="qr-grid-print" style={{ display: "none" }}>
            {currentList.map((item) => {
              const qrVal = tab === "books"
                ? (item.accessionNo || item.barcode || item.id)
                : tab === "students" ? item.pin : item.staffId;
              const line1 = tab === "books" ? item.title : item.name;
              const line2 = tab === "books"
                ? qrVal
                : tab === "students"
                  ? `PIN: ${item.pin} · ${item.branch}`
                  : `ID: ${item.staffId} · ${item.section}`;
              return (
                <div key={item.id}>
                  <QRCodeSVG value={qrVal} size={128} level="M" />
                  <p className="title">{line1}</p>
                  <p className="sub">{line2}</p>
                  <p className="code">{qrVal}</p>
                </div>
              );
            })}
          </div>

          {/* Screen grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {currentList.map(renderQRCard)}
          </div>
        </>
      )}
    </AdminLayout>
  );
}