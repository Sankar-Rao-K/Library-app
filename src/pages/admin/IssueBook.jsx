import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import QRScannerModal from "../../components/QRScannerModal";
import {
  getStudentByPin, getBookByBarcode,
  issueBook, updateBook,
} from "../../firebase/firestore";
import { getStudentInfo } from "../../utils/studentUtils";

const STEPS = {
  PIN: "pin",
  BOOK: "book",
  NAME_VERIFY: "name_verify",
  CONFIRM: "confirm",
  SUCCESS: "success",
};

export default function IssueBook() {
  const location = useLocation();
  const prefillPin = location.state?.prefillPin || "";

  const [step, setStep]           = useState(STEPS.PIN);
  const [pin, setPin]             = useState(prefillPin);
  const [accessCode, setAccessCode] = useState("");
  const [verifyName, setVerifyName] = useState("");
  const [student, setStudent]     = useState(null);
  const [book, setBook]           = useState(null);
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [scanner, setScanner]     = useState(null); // "book" | "name" | null

  const accessRef = useRef(null);
  const nameRef   = useRef(null);

  // Auto-fetch if prefillPin given
  useEffect(() => {
    if (!prefillPin) return;
    (async () => {
      setLoading(true);
      try {
        const found = await getStudentByPin(prefillPin.trim());
        if (found) { setStudent(found); setStep(STEPS.BOOK); }
        else { setStep(STEPS.PIN); setPin(""); }
      } catch {}
      setLoading(false);
    })();
  }, [prefillPin]);

  useEffect(() => {
    if (step === STEPS.BOOK) setTimeout(() => accessRef.current?.focus(), 150);
    if (step === STEPS.NAME_VERIFY) setTimeout(() => nameRef.current?.focus(), 150);
  }, [step]);

  const reset = () => {
    setStep(STEPS.PIN); setPin(""); setAccessCode(""); setVerifyName("");
    setStudent(null); setBook(null); setError(""); setScanner(null);
  };

  // Step 1 — PIN
  const handlePinSubmit = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const found = await getStudentByPin(pin.trim());
      if (!found) setError("No student found with this PIN. Please check and try again.");
      else { setStudent(found); setStep(STEPS.BOOK); }
    } catch (err) { setError("Error: " + err.message); }
    setLoading(false);
  };

  // Step 2 — Book access code / QR
  const handleBookSubmit = async (e) => {
    e?.preventDefault(); setError(""); setLoading(true);
    try {
      const found = await getBookByBarcode(accessCode.trim());
      if (!found) {
        setError("No book found with this access code. Please try again.");
        setAccessCode("");
      } else if (!found.available) {
        setError(`"${found.title}" is currently issued to another student.`);
        setAccessCode("");
      } else {
        setBook(found);
        setStep(STEPS.NAME_VERIFY);
      }
    } catch (err) { setError("Error: " + err.message); }
    setLoading(false);
  };

  const handleBookQRScan = (decoded) => {
    setScanner(null);
    setAccessCode(decoded);
    // Auto-submit after scan
    setTimeout(async () => {
      setError(""); setLoading(true);
      try {
        const found = await getBookByBarcode(decoded.trim());
        if (!found) {
          setError("No book found with this QR code.");
          setAccessCode("");
        } else if (!found.available) {
          setError(`"${found.title}" is currently issued to another student.`);
          setAccessCode("");
        } else {
          setBook(found);
          setStep(STEPS.NAME_VERIFY);
        }
      } catch (err) { setError("Error: " + err.message); }
      setLoading(false);
    }, 100);
  };

  // Step 3 — Student name verification
  const handleNameSubmit = async (e) => {
    e?.preventDefault(); setError("");
    const entered = verifyName.trim().toLowerCase();
    const expected = student.name.trim().toLowerCase();
    if (entered !== expected) {
      setError(
        `Name does not match. Expected: "${student.name}". Please try again.`
      );
      setVerifyName("");
      return;
    }
    setStep(STEPS.CONFIRM);
  };

  const handleNameQRScan = (decoded) => {
    setScanner(null);
    setVerifyName(decoded);
    // Auto-verify after scan
    const entered = decoded.trim().toLowerCase();
    const expected = student.name.trim().toLowerCase();
    if (entered !== expected) {
      setError(`Name on QR does not match student record. Expected: "${student.name}"`);
      setVerifyName("");
    } else {
      setError("");
      setStep(STEPS.CONFIRM);
    }
  };

  // Step 4 — Confirm
  const handleConfirm = async () => {
    setLoading(true);
    try {
      const { semNum } = getStudentInfo(student.pin);
      await issueBook({
        studentId:    student.id,
        studentName:  student.name,
        studentPin:   student.pin,
        studentBranch: student.branch,
        bookId:       book.id,
        bookTitle:    book.title,
        barcode:      book.barcode || book.accessionNo,
        semNum:       semNum || null,
      });
      await updateBook(book.id, { available: false });
      setStep(STEPS.SUCCESS);
    } catch (err) { setError("Error saving: " + err.message); }
    setLoading(false);
  };

  const allSteps = [
    { key: STEPS.PIN,         label: "1. Student PIN" },
    { key: STEPS.BOOK,        label: "2. Book QR / Code" },
    { key: STEPS.NAME_VERIFY, label: "3. Name Verify" },
    { key: STEPS.CONFIRM,     label: "4. Confirm" },
  ];

  const currentIdx = allSteps.findIndex((s) => s.key === step);

  return (
    <AdminLayout>
      {/* QR Scanner Modals */}
      {scanner === "book" && (
        <QRScannerModal
          title="Scan Book QR Code"
          onScan={handleBookQRScan}
          onClose={() => setScanner(null)}
        />
      )}
      {scanner === "name" && (
        <QRScannerModal
          title="Scan Student Name QR Code"
          onScan={handleNameQRScan}
          onClose={() => setScanner(null)}
        />
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Issue Book</h1>
        <p className="text-gray-500 text-sm mt-1">
          PIN → Book QR/Code → Name Verification → Confirm
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-1 mb-8 flex-wrap">
        {allSteps.map(({ key, label }, i) => (
          <div key={key} className="flex items-center gap-1">
            <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
              step === key
                ? "bg-blue-600 text-white"
                : step === STEPS.SUCCESS || currentIdx > i
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-400"
            }`}>
              {label}
            </span>
            {i < allSteps.length - 1 && <span className="text-gray-300 text-xs">→</span>}
          </div>
        ))}
      </div>

      <div className="max-w-lg space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
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
                type="text" autoFocus required
                value={pin} onChange={(e) => setPin(e.target.value)}
                placeholder="e.g. 23173-CM-001"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-xl font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3 rounded-lg font-semibold transition">
                {loading ? "Searching..." : "Find Student →"}
              </button>
            </form>
          </div>
        )}

        {/* ── STEP 2: BOOK QR / CODE ── */}
        {step === STEPS.BOOK && student && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            {/* Student confirmed */}
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-6">
              <span className="text-green-500 text-xl">✓</span>
              <div>
                <p className="text-sm font-semibold text-green-800">{student.name}</p>
                <p className="text-xs text-green-600">PIN: {student.pin} · {student.branch}</p>
              </div>
            </div>

            <h2 className="text-lg font-semibold text-gray-800 mb-1">Book QR Code / Access Code</h2>
            <p className="text-sm text-gray-400 mb-5">
              Scan the QR code on the book using camera, or enter the access code manually.
            </p>

            {/* Scan button */}
            <button
              type="button"
              onClick={() => { setError(""); setScanner("book"); }}
              className="w-full mb-4 border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 text-blue-600 py-4 rounded-xl font-semibold transition flex items-center justify-center gap-2 text-sm"
            >
              📷 Open Camera to Scan QR Code
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs text-gray-400">or enter manually</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <form onSubmit={handleBookSubmit} className="space-y-4">
              <input
                ref={accessRef}
                type="text" required
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="Accession no. / access code"
                className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-lg font-mono text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-3">
                <button type="button" onClick={reset}
                  className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-lg font-medium hover:bg-gray-50 transition">
                  ← Back
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3 rounded-lg font-semibold transition">
                  {loading ? "Searching..." : "Find Book →"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── STEP 3: NAME VERIFICATION ── */}
        {step === STEPS.NAME_VERIFY && student && book && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            {/* Book confirmed */}
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-6">
              <span className="text-blue-500 text-xl">📚</span>
              <div>
                <p className="text-sm font-semibold text-blue-800">{book.title}</p>
                <p className="text-xs text-blue-600">{book.author} · {book.barcode || book.accessionNo}</p>
              </div>
            </div>

            <h2 className="text-lg font-semibold text-gray-800 mb-1">Student Name Verification</h2>
            <p className="text-sm text-gray-400 mb-2">
              Scan the student's name QR card or type their full name to confirm identity.
            </p>
            <p className="text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 mb-5">
              ⚠️ Name must exactly match: <strong>{student.name}</strong>
            </p>

            {/* Scan button */}
            <button
              type="button"
              onClick={() => { setError(""); setScanner("name"); }}
              className="w-full mb-4 border-2 border-dashed border-purple-300 hover:border-purple-500 hover:bg-purple-50 text-purple-600 py-4 rounded-xl font-semibold transition flex items-center justify-center gap-2 text-sm"
            >
              📷 Scan Student Name QR Card
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs text-gray-400">or type manually</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <form onSubmit={handleNameSubmit} className="space-y-4">
              <input
                ref={nameRef}
                type="text" required
                value={verifyName}
                onChange={(e) => setVerifyName(e.target.value)}
                placeholder="Type student's full name"
                className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-base text-center focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setStep(STEPS.BOOK); setAccessCode(""); setBook(null); setError(""); }}
                  className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-lg font-medium hover:bg-gray-50 transition">
                  ← Back
                </button>
                <button type="submit"
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-semibold transition">
                  Verify & Continue →
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── STEP 4: CONFIRM ── */}
        {step === STEPS.CONFIRM && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-5">Confirm Issue</h2>
            <div className="bg-gray-50 rounded-xl p-5 mb-6 space-y-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🎓</span>
                <div>
                  <p className="text-xs text-gray-400 uppercase font-semibold">Student (Verified)</p>
                  <p className="font-semibold text-gray-800">{student.name}</p>
                  <p className="text-sm text-gray-500">PIN: {student.pin} · {student.branch}</p>
                </div>
              </div>
              <div className="border-t border-gray-200" />
              <div className="flex items-start gap-3">
                <span className="text-2xl">📚</span>
                <div>
                  <p className="text-xs text-gray-400 uppercase font-semibold">Book</p>
                  <p className="font-semibold text-gray-800">{book.title}</p>
                  <p className="text-sm text-gray-500">
                    {book.author} · {book.barcode || book.accessionNo}
                  </p>
                </div>
              </div>
              <div className="border-t border-gray-200" />
              <div className="flex items-center gap-2 text-sm text-green-600">
                <span>✅</span>
                <span className="font-medium">Identity verified via name QR / manual entry</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setStep(STEPS.NAME_VERIFY); setVerifyName(""); setError(""); }}
                className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-lg font-medium hover:bg-gray-50 transition">
                ← Back
              </button>
              <button onClick={handleConfirm} disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-3 rounded-lg font-semibold transition">
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
              <span className="font-semibold text-gray-700">{book.title}</span> → <span className="font-semibold text-gray-700">{student.name}</span>
            </p>
            <p className="text-gray-400 text-xs mb-8">Transaction saved · Book marked unavailable</p>
            <button onClick={reset}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold transition">
              Issue Another Book
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}