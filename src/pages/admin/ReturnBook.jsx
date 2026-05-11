import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import QRScannerModal from "../../components/QRScannerModal";
import {
  getStudentByPin, getBookByBarcode,
  returnBook, updateBook, getActiveTransaction,
  getStaffByStaffId,
} from "../../firebase/firestore";

const STEPS = {
  PIN:         "pin",
  BOOK:        "book",
  NAME_VERIFY: "name_verify",
  CONFIRM:     "confirm",
  SUCCESS:     "success",
};

export default function ReturnBook() {
  const location   = useLocation();
  const prefillPin = location.state?.prefillPin || "";
  const prefillId  = location.state?.prefillId  || "";
  const bType      = location.state?.borrowerType || "student";

  const [step, setStep]               = useState(STEPS.PIN);
  const [pin, setPin]                 = useState(prefillPin || prefillId);
  const [accessCode, setAccessCode]   = useState("");
  const [verifyName, setVerifyName]   = useState("");
  const [student, setStudent]         = useState(null);
  const [book, setBook]               = useState(null);
  const [transaction, setTransaction] = useState(null);
  const [error, setError]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [scanner, setScanner]         = useState(null);
  const [notIssuedInfo, setNotIssuedInfo] = useState(null); // holds book info when not issued

  const accessRef = useRef(null);
  const nameRef   = useRef(null);

  useEffect(() => {
    const id = prefillPin || prefillId;
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        let found = null;
        if (bType === "staff") {
          found = await getStaffByStaffId(id.trim());
          if (found) found.borrowerType = "staff";
        } else {
          found = await getStudentByPin(id.trim());
          if (found) found.borrowerType = "student";
        }
        if (found) { setStudent(found); setStep(STEPS.BOOK); }
        else { setStep(STEPS.PIN); setPin(""); }
      } catch {}
      setLoading(false);
    })();
  }, [prefillPin, prefillId, bType]);

  useEffect(() => {
    if (step === STEPS.BOOK)        setTimeout(() => accessRef.current?.focus(), 150);
    if (step === STEPS.NAME_VERIFY) setTimeout(() => nameRef.current?.focus(), 150);
  }, [step]);

  const reset = () => {
    setStep(STEPS.PIN); setPin(""); setAccessCode(""); setVerifyName("");
    setStudent(null); setBook(null); setTransaction(null);
    setError(""); setScanner(null); setNotIssuedInfo(null);
  };

  const handlePinSubmit = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      // Try student first, then staff
      let found = await getStudentByPin(pin.trim());
      if (found) { found.borrowerType = "student"; }
      else {
        const { getStaffByStaffId } = await import("../../firebase/firestore");
        found = await getStaffByStaffId(pin.trim());
        if (found) found.borrowerType = "staff";
      }
      if (!found) {
        setError("No student or staff member found with this ID / PIN. Please check and try again.");
      } else {
        setStudent(found); setStep(STEPS.BOOK);
      }
    } catch (err) { setError("Error: " + err.message); }
    setLoading(false);
  };

  const processBookCode = async (code) => {
    setError(""); setNotIssuedInfo(null); setLoading(true);
    try {
      const foundBook = await getBookByBarcode(code.trim());
      if (!foundBook) {
        setError("❌ No book found with this barcode / access code. Please check and try again.");
        setAccessCode("");
      } else {
        // Check active transaction for THIS specific borrower
        const txn = await getActiveTransaction(student.id, foundBook.id);
        if (!txn) {
          // Book exists but NOT issued to this person — block and show details
          setNotIssuedInfo({
            title:  foundBook.title,
            author: foundBook.author,
            barcode: foundBook.barcode || foundBook.accessionNo,
            available: foundBook.available,
          });
          setAccessCode("");
          setError(""); // clear text error — we show the card instead
        } else {
          setBook(foundBook);
          setTransaction(txn);
          setStep(STEPS.NAME_VERIFY);
        }
      }
    } catch (err) { setError("Error: " + err.message); }
    setLoading(false);
  };

  const handleBookSubmit = (e) => { e.preventDefault(); processBookCode(accessCode); };
  const handleBookQRScan = (decoded) => {
    setScanner(null);
    setAccessCode(decoded);
    setTimeout(() => processBookCode(decoded), 100);
  };

  const processNameVerify = (name) => {
    const entered  = name.trim().toLowerCase();
    const expected = student.name.trim().toLowerCase();
    if (entered !== expected) {
      setError(`❌ Name does not match. Expected: "${student.name}". Please try again.`);
      setVerifyName("");
      return false;
    }
    setError("");
    setStep(STEPS.CONFIRM);
    return true;
  };

  const handleNameSubmit  = (e) => { e.preventDefault(); processNameVerify(verifyName); };
  const handleNameQRScan  = (decoded) => {
    setScanner(null);
    setVerifyName(decoded);
    setTimeout(() => processNameVerify(decoded), 100);
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

  const allSteps = [
    { key: STEPS.PIN,         label: "1. ID / PIN" },
    { key: STEPS.BOOK,        label: "2. Book Code" },
    { key: STEPS.NAME_VERIFY, label: "3. Verify Name" },
    { key: STEPS.CONFIRM,     label: "4. Confirm" },
  ];
  const currentIdx = allSteps.findIndex((s) => s.key === step);

  return (
    <AdminLayout>
      {scanner === "book" && (
        <QRScannerModal title="Scan Book QR Code" onScan={handleBookQRScan} onClose={() => setScanner(null)} />
      )}
      {scanner === "name" && (
        <QRScannerModal title="Scan Student Name QR" onScan={handleNameQRScan} onClose={() => setScanner(null)} />
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Return Book</h1>
        <p className="text-gray-500 text-sm mt-1">ID / PIN → Book QR/Code → Name Verify → Confirm</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-8 flex-wrap">
        {allSteps.map(({ key, label }, i) => (
          <div key={key} className="flex items-center gap-1">
            <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
              step === key ? "bg-orange-500 text-white"
              : step === STEPS.SUCCESS || currentIdx > i ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-400"
            }`}>{label}</span>
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

        {/* ── PIN ── */}
        {step === STEPS.PIN && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Enter Student PIN or Staff ID</h2>
            <p className="text-sm text-gray-400 mb-5">Ask for their PIN number or CMS Staff ID.</p>
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <input type="text" autoFocus required value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="e.g. 23173-CM-001 or 14023738"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-xl font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-orange-400" />
              <button type="submit" disabled={loading}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white py-3 rounded-lg font-semibold transition">
                {loading ? "Searching..." : "Find Borrower →"}
              </button>
            </form>
          </div>
        )}

        {/* ── BOOK QR / CODE ── */}
        {step === STEPS.BOOK && student && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            {/* Borrower confirmed */}
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-6">
              <span className="text-green-500 text-xl">✓</span>
              <div>
                <p className="text-sm font-semibold text-green-800">{student.name}</p>
                <p className="text-xs text-green-600">
                  {student.borrowerType === "staff"
                    ? `Staff ID: ${student.staffId} · ${student.section}`
                    : `PIN: ${student.pin} · ${student.branch}`}
                </p>
              </div>
            </div>

            {/* ── NOT ISSUED WARNING CARD ── */}
            {notIssuedInfo && (
              <div className="mb-5 bg-red-50 border-2 border-red-300 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center text-xl flex-shrink-0">🚫</div>
                  <div className="flex-1">
                    <p className="font-bold text-red-700 text-sm mb-0.5">Book Not Issued to This Borrower</p>
                    <p className="text-red-600 font-semibold text-sm">{notIssuedInfo.title}</p>
                    <p className="text-xs text-red-500 mt-0.5">{notIssuedInfo.author} · {notIssuedInfo.barcode}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        notIssuedInfo.available
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {notIssuedInfo.available
                          ? "✓ Currently Available (not issued to anyone)"
                          : "⚠️ Issued to a Different Borrower"}
                      </span>
                    </div>
                    <p className="text-xs text-red-500 mt-2 font-medium">
                      ↩️ Return can only be processed for books issued to <strong>{student.name}</strong>.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setNotIssuedInfo(null)}
                  className="mt-3 w-full text-xs text-red-600 border border-red-200 hover:bg-red-100 py-2 rounded-lg transition font-medium">
                  Try a Different Book
                </button>
              </div>
            )}

            <h2 className="text-lg font-semibold text-gray-800 mb-1">Scan Book QR or Enter Code</h2>
            <p className="text-sm text-gray-400 mb-5">Scan the QR on the book, or type the accession number manually.</p>

            <button type="button" onClick={() => { setError(""); setNotIssuedInfo(null); setScanner("book"); }}
              className="w-full mb-4 border-2 border-dashed border-orange-300 hover:border-orange-500 hover:bg-orange-50 text-orange-600 py-4 rounded-xl font-semibold transition flex items-center justify-center gap-2 text-sm">
              📷 Open Camera to Scan QR Code
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs text-gray-400">or enter manually</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <form onSubmit={handleBookSubmit} className="space-y-4">
              <input ref={accessRef} type="text" required value={accessCode}
                onChange={(e) => { setAccessCode(e.target.value); setNotIssuedInfo(null); }}
                placeholder="Accession no. / access code"
                className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-lg font-mono text-center focus:outline-none focus:ring-2 focus:ring-orange-400" />
              <div className="flex gap-3">
                <button type="button" onClick={reset}
                  className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-lg font-medium hover:bg-gray-50 transition">
                  ← Back
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white py-3 rounded-lg font-semibold transition">
                  {loading ? "Searching..." : "Find Book →"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── NAME VERIFY ── */}
        {step === STEPS.NAME_VERIFY && student && book && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 mb-6">
              <span className="text-orange-500 text-xl">📚</span>
              <div>
                <p className="text-sm font-semibold text-orange-800">{book.title}</p>
                <p className="text-xs text-orange-600">{book.author} · {book.barcode || book.accessionNo}</p>
                <p className="text-xs text-orange-500 mt-0.5">Issued on: {issuedDate}</p>
              </div>
            </div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Verify Borrower Identity</h2>
            <p className="text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 mb-5">
              ⚠️ Must match exactly: <strong>{student.name}</strong>
            </p>
            <button type="button" onClick={() => { setError(""); setScanner("name"); }}
              className="w-full mb-4 border-2 border-dashed border-purple-300 hover:border-purple-500 hover:bg-purple-50 text-purple-600 py-4 rounded-xl font-semibold transition flex items-center justify-center gap-2 text-sm">
              📷 Scan Name QR Card
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs text-gray-400">or type manually</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>
            <form onSubmit={handleNameSubmit} className="space-y-4">
              <input ref={nameRef} type="text" required value={verifyName}
                onChange={(e) => setVerifyName(e.target.value)}
                placeholder="Type borrower's full name"
                className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-base text-center focus:outline-none focus:ring-2 focus:ring-purple-500" />
              <div className="flex gap-3">
                <button type="button"
                  onClick={() => { setStep(STEPS.BOOK); setAccessCode(""); setBook(null); setTransaction(null); setError(""); setNotIssuedInfo(null); }}
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

        {/* ── CONFIRM ── */}
        {step === STEPS.CONFIRM && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-5">Confirm Return</h2>
            <div className="bg-gray-50 rounded-xl p-5 mb-6 space-y-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🎓</span>
                <div>
                  <p className="text-xs text-gray-400 uppercase font-semibold">Borrower (Verified)</p>
                  <p className="font-semibold text-gray-800">{student.name}</p>
                  <p className="text-sm text-gray-500">
                    {student.borrowerType === "staff"
                      ? `${student.designation} · ${student.section}`
                      : `PIN: ${student.pin}`}
                  </p>
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
              <p className="text-sm text-gray-500">
                📅 Issued on: <span className="font-medium text-gray-700">{issuedDate}</span>
              </p>
              <div className="flex items-center gap-2 text-sm text-green-600">
                <span>✅</span>
                <span className="font-medium">Identity verified</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setStep(STEPS.NAME_VERIFY); setVerifyName(""); setError(""); }}
                className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-lg font-medium hover:bg-gray-50 transition">
                ← Back
              </button>
              <button onClick={handleConfirm} disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-3 rounded-lg font-semibold transition">
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
              <span className="font-semibold">{book.title}</span> returned by{" "}
              <span className="font-semibold">{student.name}</span>
            </p>
            <p className="text-gray-400 text-xs mb-8">Transaction updated · Book now available</p>
            <button onClick={reset}
              className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-lg font-semibold transition">
              Return Another Book
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}