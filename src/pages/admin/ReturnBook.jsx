import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import QRScannerModal from "../../components/QRScannerModal";
import {
  getStudentByPin, getBookByBarcode,
  returnBook, updateBook, getActiveTransaction,
  getStaffByStaffId, getTransactionsByBorrower,
} from "../../firebase/firestore";

const STEPS = { ID: "id", BOOK: "book", CONFIRM: "confirm", SUCCESS: "success" };

export default function ReturnBook() {
  const location  = useLocation();
  const prefillId = location.state?.prefillPin || location.state?.prefillId || "";
  const bType     = location.state?.borrowerType || "";

  const [step, setStep]               = useState(STEPS.ID);
  const [idValue, setIdValue]         = useState(prefillId);
  const [accessCode, setAccessCode]   = useState("");
  const [borrower, setBorrower]       = useState(null);
  const [book, setBook]               = useState(null);
  const [transaction, setTransaction] = useState(null);
  const [activeIssues, setActiveIssues] = useState([]); // books currently issued
  const [error, setError]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [scanner, setScanner]         = useState(null);
  const [notIssuedInfo, setNotIssuedInfo] = useState(null);

  const accessRef = useRef(null);

  // Pre-fill from navigation
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
        if (found) await confirmBorrower(found);
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
    setBorrower(null); setBook(null); setTransaction(null);
    setActiveIssues([]); setError(""); setScanner(null); setNotIssuedInfo(null);
  };

  // ── After finding borrower, check if they have active issues ────────
  const confirmBorrower = async (found) => {
    setBorrower(found);

    // Fetch all transactions for this borrower
    const txns = await getTransactionsByBorrower(found.id);
    const active = txns.filter((t) => t.status === "issued");
    setActiveIssues(active);

    if (active.length === 0) {
      // No active issues — stay on ID step, show message, block scan
      setStep(STEPS.ID);
    } else {
      setStep(STEPS.BOOK);
    }
  };

  // ── Step 1: Resolve ID ─────────────────────────────────────────────
  const resolveId = async (value) => {
    setError(""); setBorrower(null); setActiveIssues([]); setLoading(true);
    try {
      const trimmed = value.trim();
      let found = await getStudentByPin(trimmed);
      if (found) {
        found.borrowerType = "student";
      } else {
        found = await getStaffByStaffId(trimmed);
        if (found) found.borrowerType = "staff";
      }
      if (!found) {
        setError("No student or staff found with this PIN / Staff ID. Please try again.");
        setIdValue("");
      } else {
        await confirmBorrower(found);
      }
    } catch (err) { setError("Error: " + err.message); }
    setLoading(false);
  };

  const handleIdSubmit = (e) => { e.preventDefault(); resolveId(idValue); };
  const handleIdQRScan = (decoded) => {
    setScanner(null); setIdValue(decoded);
    setTimeout(() => resolveId(decoded), 100);
  };

  // ── Step 2: Resolve book ───────────────────────────────────────────
  const resolveBook = async (code) => {
    setError(""); setNotIssuedInfo(null); setLoading(true);
    try {
      const foundBook = await getBookByBarcode(code.trim());
      if (!foundBook) {
        setError("No book found with this access code. Please try again.");
        setAccessCode("");
      } else {
        const txn = await getActiveTransaction(borrower.id, foundBook.id);
        if (!txn) {
          setNotIssuedInfo({
            title:     foundBook.title,
            author:    foundBook.author,
            barcode:   foundBook.barcode || foundBook.accessionNo,
            available: foundBook.available,
          });
          setAccessCode("");
        } else {
          setBook(foundBook);
          setTransaction(txn);
          setStep(STEPS.CONFIRM);
        }
      }
    } catch (err) { setError("Error: " + err.message); }
    setLoading(false);
  };

  const handleBookSubmit = (e) => { e.preventDefault(); resolveBook(accessCode); };
  const handleBookQRScan = (decoded) => {
    setScanner(null); setAccessCode(decoded);
    setTimeout(() => resolveBook(decoded), 100);
  };

  // ── Step 3: Confirm ────────────────────────────────────────────────
  const handleConfirm = async () => {
    setLoading(true);
    try {
      await returnBook(transaction.id);
      await updateBook(book.id, { available: true });
      setStep(STEPS.SUCCESS);
    } catch (err) { setError("Error: " + err.message); }
    setLoading(false);
  };

  const issuedDate = transaction?.issueDate?.toDate
    ? transaction.issueDate.toDate().toLocaleDateString("en-IN") : "—";

  const allSteps = [
    { key: STEPS.ID,      label: "1. Scan / Enter ID" },
    { key: STEPS.BOOK,    label: "2. Book Code" },
    { key: STEPS.CONFIRM, label: "3. Confirm" },
  ];
  const currentIdx = allSteps.findIndex((s) => s.key === step);

  const borrowerSubtitle = borrower
    ? borrower.borrowerType === "staff"
      ? `${borrower.staffId} · ${borrower.designation} · ${borrower.section}`
      : `${borrower.pin} · ${borrower.branch}`
    : "";

  // Has borrower been identified but has no active books?
  const borrowerFoundNoBooks = borrower && activeIssues.length === 0 && step === STEPS.ID;

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
        <h1 className="text-2xl font-bold text-gray-800">Return Book</h1>
        <p className="text-gray-500 text-sm mt-1">Scan ID → Scan Book → Confirm</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-8 flex-wrap">
        {allSteps.map(({ key, label }, i) => (
          <div key={key} className="flex items-center gap-1">
            <span className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
              step === key
                ? "bg-orange-500 text-white"
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

        {/* ── STEP 1: ID INPUT ── */}
        {step === STEPS.ID && !borrowerFoundNoBooks && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Student PIN or Staff ID</h2>
            <p className="text-sm text-gray-400 mb-5">
              Scan their QR card or enter the PIN / CMS ID manually.
            </p>

            <button
              type="button"
              onClick={() => { setError(""); setBorrower(null); setActiveIssues([]); setScanner("id"); }}
              className="w-full mb-4 py-5 border-2 border-dashed border-orange-300 hover:border-orange-500 hover:bg-orange-50 rounded-xl font-semibold text-orange-600 transition flex flex-col items-center gap-2 text-sm"
            >
              <span className="text-3xl">📷</span>
              <span>Scan QR Card</span>
              <span className="text-xs text-orange-400 font-normal">Student PIN card or Staff ID card</span>
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
                onChange={(e) => { setIdValue(e.target.value); setBorrower(null); setActiveIssues([]); }}
                placeholder="PIN: 23173-CM-001  or  Staff ID: 14023738"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base font-mono text-center focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white py-3 rounded-xl font-bold transition"
              >
                {loading ? "Searching..." : "Find Borrower →"}
              </button>
            </form>
          </div>
        )}

        {/* ── NO BOOKS ISSUED — Block scan, show message ── */}
        {borrowerFoundNoBooks && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Borrower info bar */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100"
              style={{ background: "linear-gradient(135deg, #0D1F4E08, #1B433208)" }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
                {borrower.name?.charAt(0)}
              </div>
              <div>
                <p className="font-bold text-gray-800 text-sm">{borrower.name}</p>
                <p className="text-xs text-gray-500 font-mono">{borrowerSubtitle}</p>
              </div>
              <span className="ml-auto">
                <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full">
                  {borrower.borrowerType === "staff" ? "Staff" : "Student"}
                </span>
              </span>
            </div>

            {/* No books message */}
            <div className="p-8 text-center">
              <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center text-4xl mx-auto mb-4">
                📭
              </div>
              <h3 className="text-lg font-bold text-gray-800 mb-2">No Books Currently Issued</h3>
              <p className="text-gray-500 text-sm mb-1">
                <span className="font-semibold text-gray-700">{borrower.name}</span> has not taken any books from the library.
              </p>
              <p className="text-gray-400 text-xs mb-6">
                There is nothing to return at this time.
              </p>

              {/* Summary of all-time borrows if any */}
              <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                  Borrow History
                </p>
                <p className="text-sm text-gray-600">
                  Total books ever borrowed:{" "}
                  <span className="font-bold text-gray-800">
                    {/* We only have activeIssues here; history needs separate fetch */}
                    0 currently active
                  </span>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Check the Reports page for full transaction history.
                </p>
              </div>

              <button
                onClick={reset}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-bold transition"
              >
                ← Try a Different ID
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: BOOK CODE ── */}
        {step === STEPS.BOOK && borrower && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            {/* Borrower confirmed + active books list */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-3 mb-3">
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

              {/* List of currently issued books */}
              <div className="border-t border-green-100 pt-3">
                <p className="text-xs font-bold text-green-700 mb-2">
                  📚 {activeIssues.length} book{activeIssues.length > 1 ? "s" : ""} currently issued:
                </p>
                <div className="space-y-1.5">
                  {activeIssues.map((t) => (
                    <div key={t.id}
                      className="flex items-center justify-between bg-white/70 rounded-lg px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-800 truncate">{t.bookTitle}</p>
                        <p className="text-xs text-gray-400 font-mono">{t.barcode}</p>
                      </div>
                      {t.issueDate?.toDate && (() => {
                        const days = Math.floor((Date.now() - t.issueDate.toDate()) / 86400000);
                        return (
                          <span className={`text-xs ml-2 flex-shrink-0 font-medium ${
                            days > 14 ? "text-red-600" : "text-gray-400"
                          }`}>
                            {days}d {days > 14 ? "⚠️" : ""}
                          </span>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Not-issued error card */}
            {notIssuedInfo && (
              <div className="mb-5 bg-red-50 border-2 border-red-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-xl flex-shrink-0">🚫</div>
                  <div className="flex-1">
                    <p className="font-bold text-red-700 text-sm mb-1">
                      This book is NOT issued to {borrower.name}
                    </p>
                    <p className="text-red-600 font-semibold text-sm">{notIssuedInfo.title}</p>
                    <p className="text-xs text-red-400 mt-0.5">{notIssuedInfo.author} · {notIssuedInfo.barcode}</p>
                    <span className={`inline-block mt-2 px-2.5 py-1 rounded-full text-xs font-bold ${
                      notIssuedInfo.available
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {notIssuedInfo.available
                        ? "✓ This book is available (not issued to anyone)"
                        : "⚠️ Issued to a different borrower"}
                    </span>
                  </div>
                </div>
                <button onClick={() => setNotIssuedInfo(null)}
                  className="mt-3 w-full text-xs text-red-600 border border-red-200 hover:bg-red-100 py-2 rounded-lg transition font-medium">
                  Try a Different Book
                </button>
              </div>
            )}

            <h2 className="text-lg font-semibold text-gray-800 mb-1">Scan Book to Return</h2>
            <p className="text-sm text-gray-400 mb-5">
              Scan the QR on the book being returned, or enter the accession number.
            </p>

            <button type="button"
              onClick={() => { setError(""); setNotIssuedInfo(null); setScanner("book"); }}
              className="w-full mb-4 py-5 border-2 border-dashed border-orange-300 hover:border-orange-500 hover:bg-orange-50 rounded-xl font-semibold text-orange-600 transition flex flex-col items-center gap-2 text-sm">
              <span className="text-3xl">📷</span>
              <span>Scan Book QR Code</span>
              <span className="text-xs text-orange-400 font-normal">QR sticker on the book</span>
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs text-gray-400">or enter manually</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <form onSubmit={handleBookSubmit} className="space-y-4">
              <input ref={accessRef} type="text" required value={accessCode}
                onChange={(e) => { setAccessCode(e.target.value); setNotIssuedInfo(null); }}
                placeholder="e.g. 1234 or BB-001"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-xl font-mono text-center focus:outline-none focus:ring-2 focus:ring-orange-400" />
              <div className="flex gap-3">
                <button type="button" onClick={reset}
                  className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl font-medium hover:bg-gray-50 transition">
                  ← Back
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white py-3 rounded-xl font-bold transition">
                  {loading ? "Searching..." : "Find Book →"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── STEP 3: CONFIRM ── */}
        {step === STEPS.CONFIRM && borrower && book && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-5">Confirm Return</h2>
            <div className="bg-gray-50 rounded-xl p-5 mb-6 space-y-4">
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
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-orange-50 flex items-center justify-center text-2xl flex-shrink-0">📚</div>
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase">Returning</p>
                  <p className="font-bold text-gray-800">{book.title}</p>
                  <p className="text-xs text-gray-500">
                    {book.author} · <span className="font-mono">{book.barcode || book.accessionNo}</span>
                  </p>
                </div>
              </div>
              <div className="border-t border-gray-200" />
              <p className="text-sm text-gray-500">
                📅 Originally issued: <span className="font-semibold text-gray-700">{issuedDate}</span>
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setStep(STEPS.BOOK); setAccessCode(""); setBook(null); setTransaction(null); setError(""); setNotIssuedInfo(null); }}
                className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl font-medium hover:bg-gray-50 transition">
                ← Back
              </button>
              <button onClick={handleConfirm} disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-3 rounded-xl font-bold transition">
                {loading ? "Saving..." : "✓ Confirm Return"}
              </button>
            </div>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {step === STEPS.SUCCESS && borrower && book && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center text-4xl mx-auto mb-4">📗</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Book Returned!</h2>
            <p className="text-gray-500 text-sm mb-1">
              <span className="font-bold text-gray-700">{book.title}</span>
            </p>
            <p className="text-gray-400 text-sm mb-6">
              returned by <span className="font-bold text-gray-700">{borrower.name}</span>
            </p>
            <p className="text-gray-400 text-xs mb-8">Transaction updated · Book now available</p>
            <button onClick={reset}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-bold transition">
              Return Another Book
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}