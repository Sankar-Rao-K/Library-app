import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import {
  getStudentByPin, getBookByBarcode,
  issueBook, updateBook,
} from "../../firebase/firestore";
import { getStudentInfo } from "../../utils/studentUtils";

const STEPS = { PIN: "pin", BARCODE: "barcode", CONFIRM: "confirm", SUCCESS: "success" };

export default function IssueBook() {
  const location   = useLocation();
  const prefillPin = location.state?.prefillPin || "";

  const [step,    setStep]    = useState(STEPS.PIN);
  const [pin,     setPin]     = useState(prefillPin);
  const [barcode, setBarcode] = useState("");
  const [student, setStudent] = useState(null);
  const [book,    setBook]    = useState(null);
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const barcodeRef = useRef(null);

  // Auto-fetch student when navigated with prefillPin
  useEffect(() => {
    if (!prefillPin) return;
    const fetch = async () => {
      setLoading(true);
      try {
        const found = await getStudentByPin(prefillPin.trim());
        if (found) { setStudent(found); setStep(STEPS.BARCODE); }
        else { setStep(STEPS.PIN); setPin(""); }
      } catch {}
      setLoading(false);
    };
    fetch();
  }, [prefillPin]);

  // Auto-focus barcode field
  useEffect(() => {
    if (step === STEPS.BARCODE) setTimeout(() => barcodeRef.current?.focus(), 150);
  }, [step]);

  // ── Full reset — clears everything including student ─────────────────
  const resetAll = () => {
    setStep(STEPS.PIN); setPin(""); setBarcode("");
    setStudent(null);   setBook(null); setError("");
  };

  // ── Book-only reset — keeps student, issues another book ─────────────
  const resetBookOnly = () => {
    setBarcode(""); setBook(null); setError("");
    setStep(STEPS.BARCODE);
  };

  // ── Back from BARCODE step → go back to PIN but keep pin value ───────
  const goBackToPin = () => {
    setBarcode(""); setBook(null); setError("");
    setStep(STEPS.PIN);
    // Note: student state is NOT cleared so if user re-submits same PIN
    // it will just re-confirm the same student.
  };

  const handlePinSubmit = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const found = await getStudentByPin(pin.trim());
      if (!found) setError("No student found with this PIN. Please check and try again.");
      else { setStudent(found); setStep(STEPS.BARCODE); }
    } catch (err) { setError("Error: " + err.message); }
    setLoading(false);
  };

  const handleBarcodeSubmit = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const found = await getBookByBarcode(barcode.trim());
      if (!found) {
        setError("No book found with this accession/barcode. Please try again.");
        setBarcode(""); barcodeRef.current?.focus();
      } else if (!found.available) {
        setError(`"${found.title}" is already issued to another borrower.`);
        setBarcode(""); barcodeRef.current?.focus();
      } else { setBook(found); setStep(STEPS.CONFIRM); }
    } catch (err) { setError("Error: " + err.message); }
    setLoading(false);
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const { semNum } = getStudentInfo(student.pin);
      await issueBook({
        studentId:   student.id,
        studentName: student.name,
        studentPin:  student.pin,
        borrowerId:  student.id,
        borrowerType:"student",
        bookId:      book.id,
        bookTitle:   book.title,
        barcode:     book.barcode || book.accessionNo,
        semNum:      semNum || null,
      });
      await updateBook(book.id, { available: false });
      setStep(STEPS.SUCCESS);
    } catch (err) { setError("Error saving: " + err.message); }
    setLoading(false);
  };

  const ACTIVE = { background: "linear-gradient(135deg, #0D1F4E, #1B4332)" };

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Issue Book</h1>
        <p className="text-gray-500 text-sm mt-1">Enter student PIN, then scan or type the book accession number.</p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-8 flex-wrap">
        {[
          { key: STEPS.PIN,     label: "1. Student PIN"  },
          { key: STEPS.BARCODE, label: "2. Book Accession"},
          { key: STEPS.CONFIRM, label: "3. Confirm"       },
        ].map(({ key, label }, i, arr) => (
          <div key={key} className="flex items-center gap-2">
            <span className={`px-4 py-1.5 rounded-full text-xs font-semibold ${
              step === key
                ? "text-white"
                : step === STEPS.SUCCESS || arr.findIndex(a => a.key === step) > i
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-400"
            }`} style={step === key ? ACTIVE : {}}>
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
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-xl font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="submit" disabled={loading}
                className="w-full text-white py-3 rounded-lg font-semibold transition disabled:opacity-50"
                style={ACTIVE}>
                {loading ? "Searching..." : "Find Student →"}
              </button>
            </form>
          </div>
        )}

        {/* ── STEP 2: BARCODE ── */}
        {step === STEPS.BARCODE && student && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            {/* Student confirmed banner */}
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-6">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                style={ACTIVE}>{student.name?.charAt(0)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-green-800">{student.name}</p>
                <p className="text-xs text-green-600 font-mono">PIN: {student.pin} · {student.branch}</p>
              </div>
              {/* ← Change student */}
              <button
                onClick={goBackToPin}
                className="text-xs text-gray-400 hover:text-gray-600 underline flex-shrink-0"
                title="Change student">
                Change
              </button>
            </div>

            <h2 className="text-lg font-semibold text-gray-800 mb-1">Scan / Enter Book Accession</h2>
            <p className="text-sm text-gray-400 mb-5">
              Scan the book QR/barcode with your scanner, or type the accession number.
            </p>
            <form onSubmit={handleBarcodeSubmit} className="space-y-4">
              <div className="relative">
                <input
                  ref={barcodeRef} type="text" required value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Scan or type accession no."
                  className="w-full border-2 border-blue-400 rounded-lg px-4 py-3 text-lg font-mono text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="absolute right-4 top-3.5 text-gray-300 text-xl">📷</span>
              </div>
              <div className="flex gap-3">
                {/* Back — only goes back to PIN, does NOT clear student */}
                <button type="button" onClick={goBackToPin}
                  className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-lg font-medium hover:bg-gray-50 transition">
                  ← Back
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 text-white py-3 rounded-lg font-semibold transition disabled:opacity-50"
                  style={ACTIVE}>
                  {loading ? "Searching..." : "Find Book →"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── STEP 3: CONFIRM ── */}
        {step === STEPS.CONFIRM && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-5">Confirm Issue</h2>
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
                  <p className="text-xs text-gray-400 uppercase font-semibold">Book</p>
                  <p className="font-bold text-gray-800">{book.title}</p>
                  <p className="text-sm text-gray-500">{book.author} · {book.accessionNo || book.barcode}</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setStep(STEPS.BARCODE); setBarcode(""); setBook(null); setError(""); }}
                className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-lg font-medium hover:bg-gray-50 transition">
                ← Back
              </button>
              <button onClick={handleConfirm} disabled={loading}
                className="flex-1 text-white py-3 rounded-lg font-semibold transition disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #15803d, #166534)" }}>
                {loading ? "Saving..." : "✓ Confirm Issue"}
              </button>
            </div>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {step === STEPS.SUCCESS && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Book Issued!</h2>
            <p className="text-gray-500 text-sm mb-1">
              <span className="font-bold text-gray-700">{book.title}</span>
              {" "}→{" "}
              <span className="font-bold text-gray-700">{student.name}</span>
            </p>
            <p className="text-gray-400 text-xs mb-8">Transaction saved · Book marked unavailable</p>

            {/* ── Two action buttons ── */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Issue ANOTHER book to the SAME student — skip PIN re-entry */}
              <button
                onClick={resetBookOnly}
                className="flex-1 text-white py-3 rounded-xl font-bold text-sm transition"
                style={ACTIVE}>
                📚 Issue Another Book
                <span className="block text-xs opacity-70 font-normal mt-0.5">
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