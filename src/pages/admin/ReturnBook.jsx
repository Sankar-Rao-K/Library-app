import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import {
  getStudentByPin, getBookByBarcode,
  returnBook, updateBook, getActiveTransaction,
  getTransactionsByBorrower,
} from "../../firebase/firestore";

const STEPS = { PIN: "pin", BARCODE: "barcode", CONFIRM: "confirm", SUCCESS: "success" };

export default function ReturnBook() {
  const location   = useLocation();
  const prefillPin = location.state?.prefillPin || "";

  const [step,         setStep]        = useState(STEPS.PIN);
  const [pin,          setPin]         = useState(prefillPin);
  const [barcode,      setBarcode]     = useState("");
  const [student,      setStudent]     = useState(null);
  const [book,         setBook]        = useState(null);
  const [transaction,  setTransaction] = useState(null);
  const [issuedBooks,  setIssuedBooks] = useState([]);  // currently issued for this student
  const [error,        setError]       = useState("");
  const [loading,      setLoading]     = useState(false);
  const barcodeRef = useRef(null);

  // Auto-fetch student when navigated with prefillPin
  useEffect(() => {
    if (!prefillPin) return;
    const fetch = async () => {
      setLoading(true);
      try {
        const found = await getStudentByPin(prefillPin.trim());
        if (found) {
          setStudent(found);
          await loadIssuedBooks(found.id);
          setStep(STEPS.BARCODE);
        } else { setStep(STEPS.PIN); setPin(""); }
      } catch {}
      setLoading(false);
    };
    fetch();
  }, [prefillPin]);

  useEffect(() => {
    if (step === STEPS.BARCODE) setTimeout(() => barcodeRef.current?.focus(), 150);
  }, [step]);

  // Load all currently issued books for this borrower
  const loadIssuedBooks = async (borrowerId) => {
    try {
      const txns = await getTransactionsByBorrower(borrowerId);
      setIssuedBooks(txns.filter(t => t.status === "issued"));
    } catch {
      setIssuedBooks([]);
    }
  };

  // ── Full reset — clears everything including student ─────────────────
  const resetAll = () => {
    setStep(STEPS.PIN); setPin(""); setBarcode("");
    setStudent(null);   setBook(null); setTransaction(null);
    setIssuedBooks([]);  setError("");
  };

  // ── Book-only reset — keeps student, return another book ─────────────
  const resetBookOnly = async () => {
    setBarcode(""); setBook(null); setTransaction(null); setError("");
    // Refresh the issued books list — one was just returned
    if (student) await loadIssuedBooks(student.id);
    setStep(STEPS.BARCODE);
  };

  // ── Back from BARCODE → PIN (keeps pin value, clears student) ────────
  const goBackToPin = () => {
    setBarcode(""); setBook(null); setTransaction(null);
    setIssuedBooks([]); setError("");
    setStep(STEPS.PIN);
  };

  const handlePinSubmit = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const found = await getStudentByPin(pin.trim());
      if (!found) {
        setError("No student found with this PIN. Please check and try again.");
      } else {
        setStudent(found);
        await loadIssuedBooks(found.id);
        setStep(STEPS.BARCODE);
      }
    } catch (err) { setError("Error: " + err.message); }
    setLoading(false);
  };

  const handleBarcodeSubmit = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const foundBook = await getBookByBarcode(barcode.trim());
      if (!foundBook) {
        setError("No book found with this accession/barcode. Please try again.");
        setBarcode(""); barcodeRef.current?.focus();
      } else {
        const txn = await getActiveTransaction(student.id, foundBook.id);
        if (!txn) {
          setError(`"${foundBook.title}" is not currently issued to ${student.name}.`);
          setBarcode(""); barcodeRef.current?.focus();
        } else {
          setBook(foundBook); setTransaction(txn); setStep(STEPS.CONFIRM);
        }
      }
    } catch (err) { setError("Error: " + err.message); }
    setLoading(false);
  };

  // Click a book from the issued list to auto-fill the barcode
  const handleIssuedBookClick = (txn) => {
    setBarcode(txn.barcode || ""); setError("");
    setTimeout(() => barcodeRef.current?.focus(), 100);
  };

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

  const daysHeld = transaction?.issueDate?.toDate
    ? Math.floor((Date.now() - transaction.issueDate.toDate()) / 86400000) : null;

  const ACTIVE       = { background: "linear-gradient(135deg, #0D1F4E, #1B4332)" };
  const ORANGE_GRAD  = { background: "linear-gradient(135deg, #c2410c, #ea580c)" };

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Return Book</h1>
        <p className="text-gray-500 text-sm mt-1">
          Enter student PIN, then scan or type the book accession number.
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-8 flex-wrap">
        {[
          { key: STEPS.PIN,     label: "1. Student PIN"  },
          { key: STEPS.BARCODE, label: "2. Book Accession"},
          { key: STEPS.CONFIRM, label: "3. Confirm"       },
        ].map(({ key, label }, i, arr) => (
          <div key={key} className="flex items-center gap-2">
            <span
              className={`px-4 py-1.5 rounded-full text-xs font-semibold ${
                step === key
                  ? "text-white"
                  : step === STEPS.SUCCESS || arr.findIndex(a => a.key === step) > i
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-400"
              }`}
              style={step === key ? ORANGE_GRAD : {}}>
              {label}
            </span>
            {i < arr.length - 1 && <span className="text-gray-300 text-sm">→</span>}
          </div>
        ))}
      </div>

      <div className="max-w-lg">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {/* ── STEP 1: PIN ── */}
        {step === STEPS.PIN && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Enter Student PIN</h2>
            <p className="text-sm text-gray-400 mb-5">Ask the student for their PIN number.</p>
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <input
                type="text" autoFocus required value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="e.g. 23173-CM-001"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-xl font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <button type="submit" disabled={loading}
                className="w-full text-white py-3 rounded-lg font-semibold transition disabled:opacity-50"
                style={ORANGE_GRAD}>
                {loading ? "Searching..." : "Find Student →"}
              </button>
            </form>
          </div>
        )}

        {/* ── STEP 2: BARCODE ── */}
        {step === STEPS.BARCODE && student && (
          <div className="space-y-4">
            {/* Student confirmed banner */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                  style={ORANGE_GRAD}>{student.name?.charAt(0)}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800">{student.name}</p>
                  <p className="text-xs text-gray-500 font-mono">PIN: {student.pin} · {student.branch}</p>
                </div>
                <button onClick={goBackToPin}
                  className="text-xs text-gray-400 hover:text-gray-600 underline flex-shrink-0">
                  Change
                </button>
              </div>

              {/* Currently issued books for this student */}
              {issuedBooks.length > 0 ? (
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                    Currently Issued ({issuedBooks.length}) — tap to auto-fill
                  </p>
                  <div className="space-y-2">
                    {issuedBooks.map((txn) => {
                      const days = txn.issueDate?.toDate
                        ? Math.floor((Date.now() - txn.issueDate.toDate()) / 86400000) : null;
                      return (
                        <button key={txn.id}
                          onClick={() => handleIssuedBookClick(txn)}
                          className="w-full text-left bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg px-3 py-2.5 transition">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-gray-800 truncate">{txn.bookTitle}</p>
                            {days !== null && (
                              <span className={`text-xs font-bold flex-shrink-0 ${days > 14 ? "text-red-500" : "text-gray-400"}`}>
                                {days}d {days > 14 ? "⚠️" : ""}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 font-mono mt-0.5">{txn.barcode}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg px-4 py-3 text-center">
                  <p className="text-sm text-gray-500">⚠️ No books currently issued to this student.</p>
                  <button onClick={goBackToPin}
                    className="mt-2 text-xs text-blue-600 hover:underline">Try a different student</button>
                </div>
              )}
            </div>

            {/* Barcode input */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-base font-semibold text-gray-800 mb-1">Scan / Enter Book Accession</h2>
              <p className="text-sm text-gray-400 mb-4">
                Scan the book QR/barcode, or tap a book above to auto-fill.
              </p>
              <form onSubmit={handleBarcodeSubmit} className="space-y-3">
                <div className="relative">
                  <input
                    ref={barcodeRef} type="text" required value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="Scan or type accession no."
                    className="w-full border-2 border-orange-400 rounded-lg px-4 py-3 text-lg font-mono text-center focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                  <span className="absolute right-4 top-3.5 text-gray-300 text-xl">📷</span>
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={goBackToPin}
                    className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-lg font-medium hover:bg-gray-50 transition">
                    ← Back
                  </button>
                  <button type="submit" disabled={loading || issuedBooks.length === 0}
                    className="flex-1 text-white py-3 rounded-lg font-semibold transition disabled:opacity-50"
                    style={ORANGE_GRAD}>
                    {loading ? "Searching..." : "Find Book →"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── STEP 3: CONFIRM ── */}
        {step === STEPS.CONFIRM && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-5">Confirm Return</h2>
            <div className="bg-gray-50 rounded-xl p-5 mb-6 space-y-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🎓</span>
                <div>
                  <p className="text-xs text-gray-400 uppercase font-semibold">Student</p>
                  <p className="font-bold text-gray-800">{student.name}</p>
                  <p className="text-sm text-gray-500">PIN: {student.pin} · {student.branch}</p>
                </div>
              </div>
              <div className="border-t border-gray-200" />
              <div className="flex items-start gap-3">
                <span className="text-2xl">📚</span>
                <div>
                  <p className="text-xs text-gray-400 uppercase font-semibold">Returning</p>
                  <p className="font-bold text-gray-800">{book.title}</p>
                  <p className="text-sm text-gray-500">{book.author}</p>
                </div>
              </div>
              <div className="border-t border-gray-200" />
              <div className="flex items-center gap-3 text-sm text-gray-500 flex-wrap">
                <span>📅 Issued: <span className="font-semibold text-gray-700">{issuedDate}</span></span>
                {daysHeld !== null && (
                  <span className={`font-semibold ${daysHeld > 14 ? "text-red-500" : "text-gray-500"}`}>
                    · {daysHeld} day{daysHeld !== 1 ? "s" : ""} held {daysHeld > 14 ? "⚠️" : ""}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setStep(STEPS.BARCODE); setBarcode(""); setBook(null); setTransaction(null); setError(""); }}
                className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-lg font-medium hover:bg-gray-50 transition">
                ← Back
              </button>
              <button onClick={handleConfirm} disabled={loading}
                className="flex-1 text-white py-3 rounded-lg font-semibold transition disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #15803d, #166534)" }}>
                {loading ? "Saving..." : "✓ Confirm Return"}
              </button>
            </div>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {step === STEPS.SUCCESS && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
            <div className="text-6xl mb-4">📗</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Book Returned!</h2>
            <p className="text-gray-500 text-sm mb-1">
              <span className="font-bold text-gray-700">{book.title}</span>
              {" "}returned by{" "}
              <span className="font-bold text-gray-700">{student.name}</span>
            </p>
            <p className="text-gray-400 text-xs mb-8">
              Transaction updated · Book marked available
            </p>

            {/* ── Two action buttons ── */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Return ANOTHER book for the SAME student — skip PIN re-entry */}
              <button
                onClick={resetBookOnly}
                className="flex-1 text-white py-3 rounded-xl font-bold text-sm transition"
                style={ORANGE_GRAD}>
                ↩️ Return Another Book
                <span className="block text-xs opacity-75 font-normal mt-0.5">
                  Same student · {student.name}
                </span>
              </button>

              {/* Full reset — go back to PIN step */}
              <button
                onClick={resetAll}
                className="flex-1 border-2 border-gray-300 text-gray-600 hover:bg-gray-50 py-3 rounded-xl font-bold text-sm transition">
                👤 New Student
                <span className="block text-xs text-gray-400 font-normal mt-0.5">
                  Start with a different PIN
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}