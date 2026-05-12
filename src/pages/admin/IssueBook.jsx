import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import QRScannerModal from "../../components/QRScannerModal";
import {
  getStudentByPin, getBookByBarcode,
  issueBook, updateBook, getStaffByStaffId,
} from "../../firebase/firestore";
import { getStudentInfo } from "../../utils/studentUtils";

const STEPS = { ID: "id", BOOK: "book", CONFIRM: "confirm", SUCCESS: "success" };

export default function IssueBook() {
  const location  = useLocation();
  const prefillId = location.state?.prefillPin || location.state?.prefillId || "";
  const bType     = location.state?.borrowerType || "";

  const [step, setStep]           = useState(STEPS.ID);
  const [idValue, setIdValue]     = useState(prefillId);
  const [accessCode, setAccessCode] = useState("");
  const [borrower, setBorrower]   = useState(null);  // student or staff
  const [book, setBook]           = useState(null);
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [scanner, setScanner]     = useState(null);  // "id" | "book" | null

  const accessRef = useRef(null);

  // Auto-fill from navigation state
  useEffect(() => {
    if (!prefillId) return;
    (async () => {
      setLoading(true);
      try {
        let found = null;
        if (bType === "staff") {
          found = await getStaffByStaffId(prefillId.trim());
          if (found) found.borrowerType = "staff";
        } else {
          found = await getStudentByPin(prefillId.trim());
          if (found) found.borrowerType = "student";
        }
        if (found) { setBorrower(found); setStep(STEPS.BOOK); }
        else { setStep(STEPS.ID); setIdValue(""); }
      } catch {}
      setLoading(false);
    })();
  }, [prefillId, bType]);

  useEffect(() => {
    if (step === STEPS.BOOK) setTimeout(() => accessRef.current?.focus(), 150);
  }, [step]);

  const reset = () => {
    setStep(STEPS.ID); setIdValue(""); setAccessCode("");
    setBorrower(null); setBook(null); setError(""); setScanner(null);
  };

  // ── Step 1: Resolve ID (student PIN or staff CMS ID) ───────────────
  const resolveId = async (value) => {
    setError(""); setLoading(true);
    try {
      const trimmed = value.trim();
      // Try student first
      let found = await getStudentByPin(trimmed);
      if (found) {
        found.borrowerType = "student";
      } else {
        // Try staff
        found = await getStaffByStaffId(trimmed);
        if (found) found.borrowerType = "staff";
      }
      if (!found) {
        setError("No student or staff found with this PIN / Staff ID. Please try again.");
        setIdValue("");
      } else {
        setBorrower(found);
        setStep(STEPS.BOOK);
      }
    } catch (err) { setError("Error: " + err.message); }
    setLoading(false);
  };

  const handleIdSubmit  = (e) => { e.preventDefault(); resolveId(idValue); };
  const handleIdQRScan  = (decoded) => { setScanner(null); setIdValue(decoded); setTimeout(() => resolveId(decoded), 100); };

  // ── Step 2: Resolve book ───────────────────────────────────────────
  const resolveBook = async (code) => {
    setError(""); setLoading(true);
    try {
      const found = await getBookByBarcode(code.trim());
      if (!found) {
        setError("No book found with this access code. Please try again.");
        setAccessCode("");
      } else if (!found.available) {
        setError(`"${found.title}" is already issued to another borrower.`);
        setAccessCode("");
      } else {
        setBook(found);
        setStep(STEPS.CONFIRM);
      }
    } catch (err) { setError("Error: " + err.message); }
    setLoading(false);
  };

  const handleBookSubmit  = (e) => { e.preventDefault(); resolveBook(accessCode); };
  const handleBookQRScan  = (decoded) => { setScanner(null); setAccessCode(decoded); setTimeout(() => resolveBook(decoded), 100); };

  // ── Step 3: Confirm ────────────────────────────────────────────────
  const handleConfirm = async () => {
    setLoading(true);
    try {
      const isStaff = borrower.borrowerType === "staff";
      const { semNum } = isStaff ? {} : (getStudentInfo(borrower.pin) || {});
      await issueBook({
        borrowerId:    borrower.id,
        borrowerName:  borrower.name,
        borrowerType:  borrower.borrowerType,
        studentId:     borrower.id,
        studentName:   borrower.name,
        studentPin:    borrower.pin    || borrower.staffId || "",
        studentBranch: borrower.branch || borrower.section || "",
        bookId:        book.id,
        bookTitle:     book.title,
        barcode:       book.barcode || book.accessionNo,
        semNum:        semNum || null,
      });
      await updateBook(book.id, { available: false });
      setStep(STEPS.SUCCESS);
    } catch (err) { setError("Error: " + err.message); }
    setLoading(false);
  };

  const allSteps = [
    { key: STEPS.ID,      label: "1. Scan / Enter ID" },
    { key: STEPS.BOOK,    label: "2. Book Code" },
    { key: STEPS.CONFIRM, label: "3. Confirm" },
  ];
  const currentIdx = allSteps.findIndex((s) => s.key === step);

  const borrowerSubtitle = borrower
    ? borrower.borrowerType === "staff"
      ? `${borrower.staffId} · ${borrower.designation} · ${borrower.section}`
      : `${borrower.pin} · ${borrower.branch} · ${borrower.year}`
    : "";

  return (
    <AdminLayout>
      {scanner === "id" && (
        <QRScannerModal
          title="Scan Student PIN / Staff ID QR"
          onScan={handleIdQRScan}
          onClose={() => setScanner(null)}
        />
      )}
      {scanner === "book" && (
        <QRScannerModal
          title="Scan Book QR Code"
          onScan={handleBookQRScan}
          onClose={() => setScanner(null)}
        />
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Issue Book</h1>
        <p className="text-gray-500 text-sm mt-1">Scan ID → Scan Book → Confirm</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-8 flex-wrap">
        {allSteps.map(({ key, label }, i) => (
          <div key={key} className="flex items-center gap-1">
            <span className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
              step === key
                ? "bg-blue-600 text-white"
                : step === STEPS.SUCCESS || currentIdx > i
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-400"
            }`}>{label}</span>
            {i < allSteps.length - 1 && <span className="text-gray-300 text-xs">→</span>}
          </div>
        ))}
      </div>

      <div className="max-w-lg space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 flex items-start gap-2">
            <span className="flex-shrink-0 mt-0.5">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* ── STEP 1: SCAN / ENTER ID ── */}
        {step === STEPS.ID && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Student PIN or Staff ID</h2>
            <p className="text-sm text-gray-400 mb-5">
              Scan their QR card or enter the PIN / CMS ID manually.
            </p>

            {/* QR Scan button */}
            <button
              type="button"
              onClick={() => { setError(""); setScanner("id"); }}
              className="w-full mb-4 py-5 border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 rounded-xl font-semibold text-blue-600 transition flex flex-col items-center gap-2 text-sm"
            >
              <span className="text-3xl">📷</span>
              <span>Scan QR Card</span>
              <span className="text-xs text-blue-400 font-normal">Student PIN card or Staff ID card</span>
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs text-gray-400">or enter manually</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <form onSubmit={handleIdSubmit} className="space-y-4">
              <input
                type="text"
                autoFocus
                required
                value={idValue}
                onChange={(e) => setIdValue(e.target.value)}
                placeholder="PIN: 23173-CM-001  or  Staff ID: 14023738"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base font-mono text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3 rounded-xl font-bold transition"
              >
                {loading ? "Searching..." : "Find Borrower →"}
              </button>
            </form>
          </div>
        )}

        {/* ── STEP 2: BOOK CODE ── */}
        {step === STEPS.BOOK && borrower && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            {/* Borrower confirmed */}
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-6">
              <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
                {borrower.name?.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-bold text-green-800">{borrower.name}</p>
                <p className="text-xs text-green-600 font-mono">{borrowerSubtitle}</p>
              </div>
              <span className="ml-auto text-green-500 text-xl">✓</span>
            </div>

            <h2 className="text-lg font-semibold text-gray-800 mb-1">Book Access Code</h2>
            <p className="text-sm text-gray-400 mb-5">
              Scan the QR on the book, or enter the accession number.
            </p>

            <button
              type="button"
              onClick={() => { setError(""); setScanner("book"); }}
              className="w-full mb-4 py-5 border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 rounded-xl font-semibold text-blue-600 transition flex flex-col items-center gap-2 text-sm"
            >
              <span className="text-3xl">📷</span>
              <span>Scan Book QR Code</span>
              <span className="text-xs text-blue-400 font-normal">QR sticker on the book</span>
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs text-gray-400">or enter manually</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <form onSubmit={handleBookSubmit} className="space-y-4">
              <input
                ref={accessRef}
                type="text"
                required
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="e.g. 1234 or BB-001"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-xl font-mono text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={reset}
                  className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl font-medium hover:bg-gray-50 transition"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3 rounded-xl font-bold transition"
                >
                  {loading ? "Searching..." : "Find Book →"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── STEP 3: CONFIRM ── */}
        {step === STEPS.CONFIRM && borrower && book && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-5">Confirm Issue</h2>

            <div className="bg-gray-50 rounded-xl p-5 mb-6 space-y-4">
              {/* Borrower */}
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
                  {borrower.name?.charAt(0)}
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase">
                    {borrower.borrowerType === "staff" ? "Staff Member" : "Student"}
                  </p>
                  <p className="font-bold text-gray-800">{borrower.name}</p>
                  <p className="text-xs text-gray-500 font-mono">{borrowerSubtitle}</p>
                </div>
              </div>

              <div className="border-t border-gray-200" />

              {/* Book */}
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-2xl flex-shrink-0">
                  📚
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase">Book</p>
                  <p className="font-bold text-gray-800">{book.title}</p>
                  <p className="text-xs text-gray-500">
                    {book.author} · <span className="font-mono">{book.barcode || book.accessionNo}</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setStep(STEPS.BOOK); setAccessCode(""); setBook(null); setError(""); }}
                className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl font-medium hover:bg-gray-50 transition"
              >
                ← Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-3 rounded-xl font-bold transition"
              >
                {loading ? "Saving..." : "✓ Confirm Issue"}
              </button>
            </div>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {step === STEPS.SUCCESS && borrower && book && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center text-4xl mx-auto mb-4">
              ✅
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Book Issued!</h2>
            <p className="text-gray-500 text-sm mb-1">
              <span className="font-bold text-gray-700">{book.title}</span>
            </p>
            <p className="text-gray-400 text-sm mb-6">
              issued to <span className="font-bold text-gray-700">{borrower.name}</span>
            </p>
            <p className="text-gray-400 text-xs mb-8">Transaction saved · Book marked as unavailable</p>
            <button
              onClick={reset}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition"
            >
              Issue Another Book
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}