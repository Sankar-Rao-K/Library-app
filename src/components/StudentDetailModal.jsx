import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listenToTransactions, deleteStudent } from "../firebase/firestore";
import { getStudentInfo } from "../utils/studentUtils";
import DoubleConfirmModal from "./DoubleConfirmModal";

function TxnCard({ t }) {
  return (
    <div className={`rounded-xl p-3 border ${
      t.status === "issued" ? "bg-yellow-50 border-yellow-100" : "bg-gray-50 border-gray-100"
    }`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-800 truncate flex-1">{t.bookTitle}</p>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
          t.status === "issued" ? "bg-yellow-200 text-yellow-800" : "bg-green-100 text-green-700"
        }`}>
          {t.status === "issued" ? "Issued" : "Returned"}
        </span>
      </div>
      <div className="flex gap-3 mt-1.5 text-xs text-gray-400 flex-wrap">
        <span>📤 {t.issueDate?.toDate ? t.issueDate.toDate().toLocaleDateString("en-IN") : "—"}</span>
        {t.returnDate?.toDate && <span>📥 {t.returnDate.toDate().toLocaleDateString("en-IN")}</span>}
        <span className="font-mono">{t.barcode}</span>
      </div>
    </div>
  );
}

export default function StudentDetailModal({ student, onClose, onDeleted }) {
  const [transactions, setTransactions] = useState([]);
  const [activeTab, setActiveTab]       = useState("issued");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!student) return;
    const unsub = listenToTransactions((all) =>
      setTransactions(all.filter(
        (t) => t.studentId === student.id || t.borrowerId === student.id
      ))
    );
    return () => unsub();
  }, [student]);

  if (!student) return null;

  const { yearLabel, sem, isOld } = getStudentInfo(student.pin);
  const issued   = transactions.filter((t) => t.status === "issued");
  const returned = transactions.filter((t) => t.status === "returned");
  const allTxns  = [...transactions].sort(
    (a, b) => (b.issueDate?.seconds || 0) - (a.issueDate?.seconds || 0)
  );

  const groupBySem = (txns) => {
    const groups = {};
    txns.forEach((t) => {
      const key = t.semNum ? `Semester ${t.semNum}` : "Unclassified";
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return groups;
  };
  const historyBySem = groupBySem(allTxns);
  const semKeys = Object.keys(historyBySem).sort();

  const handleDelete = async (reason) => {
    setDeleting(true);
    try {
      await deleteStudent(student.id);
      onDeleted?.();
      onClose();
    } catch (err) {
      alert("Error deleting: " + err.message);
    }
    setDeleting(false);
    setShowDeleteModal(false);
  };

  const handleIssue  = () => { onClose(); navigate("/admin/issue",  { state: { prefillPin: student.pin } }); };
  const handleReturn = () => { onClose(); navigate("/admin/return", { state: { prefillPin: student.pin } }); };

  return (
    <>
      {showDeleteModal && (
        <DoubleConfirmModal
          title={`Delete ${student.name}?`}
          description={`This will permanently remove the student record for ${student.name} (${student.pin}). Their transaction history will remain for records. This action cannot be undone.`}
          confirmWord={student.name}
          askReason={true}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
          loading={deleting}
        />
      )}

      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-gray-900 text-white px-5 py-4 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-full bg-blue-600 flex items-center justify-center text-lg font-bold flex-shrink-0">
                {student.name?.charAt(0)}
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold leading-tight truncate">{student.name}</h2>
                <p className="text-gray-400 text-xs font-mono mt-0.5">{student.pin}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="bg-blue-500/30 text-blue-200 px-2 py-0.5 rounded-full text-xs">{student.branch}</span>
                  {isOld ? (
                    <span className="bg-gray-500/30 text-gray-300 px-2 py-0.5 rounded-full text-xs">Passed Out</span>
                  ) : (
                    <span className="bg-green-500/30 text-green-200 px-2 py-0.5 rounded-full text-xs">{yearLabel} · {sem}</span>
                  )}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none flex-shrink-0">✕</button>
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={handleIssue}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-lg transition flex items-center justify-center gap-1.5">
              ➕ Issue Book
            </button>
            <button onClick={handleReturn}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold py-2 rounded-lg transition flex items-center justify-center gap-1.5">
              ↩️ Return Book
            </button>
            <button onClick={() => setShowDeleteModal(true)}
              className="bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold py-2 px-3 rounded-lg transition">
              🗑️
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 border-b border-gray-100 flex-shrink-0">
          {[
            { label: "Total",    value: transactions.length, color: "text-blue-600"   },
            { label: "Issued",   value: issued.length,       color: "text-yellow-600" },
            { label: "Returned", value: returned.length,     color: "text-green-600"  },
          ].map(({ label, value, color }) => (
            <div key={label} className="px-4 py-3 text-center border-r border-gray-100 last:border-0">
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 bg-gray-50 flex-shrink-0">
          {[{ key: "issued", label: "📤 Currently Issued" }, { key: "history", label: "📋 Full History" }].map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex-1 py-2.5 text-sm font-semibold transition ${
                activeTab === t.key ? "bg-white border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-700"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeTab === "issued" && (
            <div>
              {issued.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">📭</div>
                  <p className="text-gray-500 text-sm font-medium">No books currently issued</p>
                  <button onClick={handleIssue}
                    className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-xs px-5 py-2 rounded-lg font-medium transition">
                    ➕ Issue a Book Now
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {issued.map((t) => {
                    const days = t.issueDate?.toDate
                      ? Math.floor((Date.now() - t.issueDate.toDate()) / 86400000) : null;
                    return (
                      <div key={t.id} className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-800 text-sm leading-tight">{t.bookTitle}</p>
                            <p className="text-xs text-gray-400 font-mono mt-0.5">{t.barcode}</p>
                          </div>
                          <span className="bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0">Issued</span>
                        </div>
                        <div className="mt-2 pt-2 border-t border-yellow-100 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                          <span>📅 {t.issueDate?.toDate ? t.issueDate.toDate().toLocaleDateString("en-IN") : "—"}</span>
                          {days !== null && (
                            <span className={days > 14 ? "text-red-500 font-bold" : "text-gray-400"}>
                              {days}d ago {days > 14 ? "⚠️ Overdue" : ""}
                            </span>
                          )}
                        </div>
                        <button onClick={handleReturn}
                          className="mt-2 w-full text-xs text-orange-600 border border-orange-200 hover:bg-orange-50 py-1.5 rounded-lg transition font-medium">
                          ↩️ Process Return
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "history" && (
            <div>
              {allTxns.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">📂</div>
                  <p className="text-gray-500 text-sm">No transaction history yet.</p>
                </div>
              ) : semKeys.length > 0 ? (
                <div className="space-y-6">
                  {semKeys.map((semKey) => (
                    <div key={semKey}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-px flex-1 bg-gray-200" />
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">{semKey}</span>
                        <div className="h-px flex-1 bg-gray-200" />
                      </div>
                      <div className="space-y-2">
                        {historyBySem[semKey].map((t) => <TxnCard key={t.id} t={t} />)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {allTxns.map((t) => <TxnCard key={t.id} t={t} />)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}