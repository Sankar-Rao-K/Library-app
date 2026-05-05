import { useState, useRef, useEffect } from "react";
import AdminLayout from "../../components/AdminLayout";
import {
  getStudentByPin,
  getBookByBarcode,
  returnBook,
  updateBook,
  getActiveTransaction,
} from "../../firebase/firestore";

const STEPS = { PIN: "pin", BARCODE: "barcode", CONFIRM: "confirm", SUCCESS: "success" };

export default function ReturnBook() {
  const [step, setStep] = useState(STEPS.PIN);
  const [pin, setPin] = useState("");
  const [barcode, setBarcode] = useState("");
  const [student, setStudent] = useState(null);
  const [book, setBook] = useState(null);
  const [transaction, setTransaction] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const barcodeRef = useRef(null);

  useEffect(() => {
    if (step === STEPS.BARCODE) {
      setTimeout(() => barcodeRef.current?.focus(), 100);
    }
  }, [step]);

  const reset = () => {
    setStep(STEPS.PIN);
    setPin(""); setBarcode("");
    setStudent(null); setBook(null);
    setTransaction(null); setError("");
  };

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const found = await getStudentByPin(pin.trim());
      if (!found) {
        setError("No student found with this PIN.");
      } else {
        setStudent(found);
        setStep(STEPS.BARCODE);
      }
    } catch (err) { setError("Error: " + err.message); }
    setLoading(false);
  };

  const handleBarcodeSubmit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const foundBook = await getBookByBarcode(barcode.trim());
      if (!foundBook) {
        setError("No book found with this barcode.");
        setBarcode(""); barcodeRef.current?.focus();
      } else {
        // Find the active transaction for this student + book
        const txn = await getActiveTransaction(student.id, foundBook.id);
        if (!txn) {
          setError(`This book is not currently issued to ${student.name}.`);
          setBarcode(""); barcodeRef.current?.focus();
        } else {
          setBook(foundBook);
          setTransaction(txn);
          setStep(STEPS.CONFIRM);
        }
      }
    } catch (err) { setError("Error: " + err.message); }
    setLoading(false);
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
    ? transaction.issueDate.toDate().toLocaleDateString()
    : "—";

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Return Book</h1>
        <p className="text-gray-500 text-sm mt-1">
          Enter student PIN, then scan the book being returned.
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[
          { key: STEPS.PIN, label: "1. Student PIN" },
          { key: STEPS.BARCODE, label: "2. Scan Barcode" },
          { key: STEPS.CONFIRM, label: "3. Confirm" },
        ].map(({ key, label }, i, arr) => (
          <div key={key} className="flex items-center gap-2">
            <span className={`px-4 py-1.5 rounded-full text-xs font-semibold ${
              step === key
                ? "bg-orange-500 text-white"
                : step === STEPS.SUCCESS || arr.findIndex(a => a.key === step) > i
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-400"
            }`}>
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
            <p className="text-sm text-gray-400 mb-5">Ask the student for their PIN.</p>
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <input
                type="text"
                autoFocus required
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="e.g. 1234"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-2xl font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <button
                type="submit" disabled={loading}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white py-3 rounded-lg font-semibold transition"
              >
                {loading ? "Searching..." : "Find Student →"}
              </button>
            </form>
          </div>
        )}

        {/* ── STEP 2: BARCODE ── */}
        {step === STEPS.BARCODE && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-6">
              <span className="text-green-500 text-xl">✓</span>
              <div>
                <p className="text-sm font-semibold text-green-800">{student.name}</p>
                <p className="text-xs text-green-600">PIN: {student.pin} · {student.class}</p>
              </div>
            </div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Scan Book Barcode</h2>
            <p className="text-sm text-gray-400 mb-5">
              Scan the barcode of the book being returned.
            </p>
            <form onSubmit={handleBarcodeSubmit} className="space-y-4">
              <div className="relative">
                <input
                  ref={barcodeRef}
                  type="text" required
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Scan barcode here..."
                  className="w-full border-2 border-orange-400 rounded-lg px-4 py-3 text-lg font-mono text-center focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
                <span className="absolute right-4 top-3.5 text-gray-300 text-xl">📷</span>
              </div>
              <div className="flex gap-3">
                <button
                  type="button" onClick={reset}
                  className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-lg font-medium hover:bg-gray-50 transition"
                >
                  ← Back
                </button>
                <button
                  type="submit" disabled={loading}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white py-3 rounded-lg font-semibold transition"
                >
                  {loading ? "Searching..." : "Find Book →"}
                </button>
              </div>
            </form>
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
                  <p className="font-semibold text-gray-800">{student.name}</p>
                  <p className="text-sm text-gray-500">PIN: {student.pin} · {student.class}</p>
                </div>
              </div>
              <div className="border-t border-gray-200" />
              <div className="flex items-start gap-3">
                <span className="text-2xl">📚</span>
                <div>
                  <p className="text-xs text-gray-400 uppercase font-semibold">Returning</p>
                  <p className="font-semibold text-gray-800">{book.title}</p>
                  <p className="text-sm text-gray-500">{book.author}</p>
                </div>
              </div>
              <div className="border-t border-gray-200" />
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>📅</span>
                <span>Issued on: <span className="font-medium text-gray-700">{issuedDate}</span></span>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setStep(STEPS.BARCODE); setBarcode(""); }}
                className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-lg font-medium hover:bg-gray-50 transition"
              >
                ← Back
              </button>
              <button
                onClick={handleConfirm} disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-3 rounded-lg font-semibold transition"
              >
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
            <p className="text-gray-500 text-sm mb-2">
              <span className="font-semibold text-gray-700">{book.title}</span> has been
              returned by <span className="font-semibold text-gray-700">{student.name}</span>.
            </p>
            <p className="text-gray-400 text-xs mb-8">
              Transaction updated · Book marked as available
            </p>
            <button
              onClick={reset}
              className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-lg font-semibold transition"
            >
              Return Another Book
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}