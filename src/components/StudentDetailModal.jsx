import { useEffect, useState } from "react";
import { listenToTransactions } from "../firebase/firestore";
import { getStudentInfo } from "../utils/studentUtils";

const SEM_ORDER = [1, 2, 3, 4, 5, 6];

function semLabel(n) {
  return n ? `Semester ${n}` : "Unknown Semester";
}

export default function StudentDetailModal({ student, onClose }) {
  const [transactions, setTransactions] = useState([]);
  const [activeTab, setActiveTab] = useState("issued");

  useEffect(() => {
    if (!student) return;
    const unsub = listenToTransactions((all) => {
      setTransactions(all.filter((t) => t.studentId === student.id));
    });
    return () => unsub();
  }, [student]);

  if (!student) return null;

  const { yearLabel, sem, isOld } = getStudentInfo(student.pin);

  const issued = transactions.filter((t) => t.status === "issued");
  const returned = transactions.filter((t) => t.status === "returned");
  const allTxns = [...transactions].sort(
    (a, b) => (b.issueDate?.seconds || 0) - (a.issueDate?.seconds || 0)
  );

  // Group history by semester number stored in transaction (or guess from issue date)
  const groupBySem = (txns) => {
    const groups = {};
    txns.forEach((t) => {
      const semKey = t.semNum || "—";
      if (!groups[semKey]) groups[semKey] = [];
      groups[semKey].push(t);
    });
    return groups;
  };

  const historyBySem = groupBySem(allTxns);
  const semKeys = Object.keys(historyBySem).sort((a, b) => Number(a) - Number(b));

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gray-900 text-white px-6 py-5 flex items-start justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-xl font-bold flex-shrink-0">
              {student.name?.charAt(0)}
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight">{student.name}</h2>
              <p className="text-gray-300 text-xs font-mono mt-0.5">{student.pin}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="bg-blue-500/30 text-blue-200 px-2 py-0.5 rounded-full text-xs">
                  {student.branch}
                </span>
                {isOld ? (
                  <span className="bg-gray-500/30 text-gray-300 px-2 py-0.5 rounded-full text-xs">
                    Passed Out
                  </span>
                ) : (
                  <span className="bg-green-500/30 text-green-200 px-2 py-0.5 rounded-full text-xs">
                    {yearLabel} · {sem}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none mt-1"
          >
            ✕
          </button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 border-b border-gray-100 flex-shrink-0">
          {[
            { label: "Total Issued", value: transactions.length, color: "text-blue-600" },
            { label: "Currently Out", value: issued.length, color: "text-yellow-600" },
            { label: "Returned", value: returned.length, color: "text-green-600" },
          ].map(({ label, value, color }) => (
            <div key={label} className="px-4 py-3 text-center border-r border-gray-100 last:border-0">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 flex-shrink-0 bg-gray-50">
          {[
            { key: "issued",  label: "📤 Currently Issued" },
            { key: "history", label: "📋 Full History" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 py-3 text-sm font-semibold transition ${
                activeTab === t.key
                  ? "bg-white border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* ── Currently Issued Tab ── */}
          {activeTab === "issued" && (
            <div>
              {issued.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-4xl mb-3">📭</div>
                  <p className="text-gray-500 font-medium text-sm">No books currently issued</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {issued.map((t) => (
                    <div
                      key={t.id}
                      className="bg-yellow-50 border border-yellow-100 rounded-xl p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-800 text-sm leading-tight">
                            {t.bookTitle}
                          </p>
                          <p className="text-xs text-gray-400 font-mono mt-1">{t.barcode}</p>
                        </div>
                        <span className="bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0">
                          Issued
                        </span>
                      </div>
                      <div className="mt-2 pt-2 border-t border-yellow-100 flex items-center gap-4 text-xs text-gray-500">
                        <span>
                          📅 Issued:{" "}
                          <span className="font-medium text-gray-700">
                            {t.issueDate?.toDate
                              ? t.issueDate.toDate().toLocaleDateString("en-IN")
                              : "—"}
                          </span>
                        </span>
                        {/* Days since issued */}
                        {t.issueDate?.toDate && (() => {
                          const days = Math.floor(
                            (Date.now() - t.issueDate.toDate()) / 86400000
                          );
                          return (
                            <span className={days > 14 ? "text-red-500 font-semibold" : ""}>
                              {days} day{days !== 1 ? "s" : ""} ago
                              {days > 14 ? " ⚠️" : ""}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Full History Tab ── */}
          {activeTab === "history" && (
            <div>
              {allTxns.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-4xl mb-3">📂</div>
                  <p className="text-gray-500 font-medium text-sm">No transaction history</p>
                </div>
              ) : semKeys.length > 0 ? (
                <div className="space-y-6">
                  {semKeys.map((semKey) => (
                    <div key={semKey}>
                      {/* Semester divider */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-px flex-1 bg-gray-200" />
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2">
                          {semKey !== "—" ? `Semester ${semKey}` : "Unclassified"}
                        </span>
                        <div className="h-px flex-1 bg-gray-200" />
                      </div>

                      <div className="space-y-2">
                        {historyBySem[semKey].map((t) => (
                          <div
                            key={t.id}
                            className={`rounded-xl p-3 border ${
                              t.status === "issued"
                                ? "bg-yellow-50 border-yellow-100"
                                : "bg-gray-50 border-gray-100"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium text-gray-800 truncate flex-1">
                                {t.bookTitle}
                              </p>
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                                  t.status === "issued"
                                    ? "bg-yellow-200 text-yellow-800"
                                    : "bg-green-100 text-green-700"
                                }`}
                              >
                                {t.status === "issued" ? "Issued" : "Returned"}
                              </span>
                            </div>
                            <div className="flex gap-4 mt-1.5 text-xs text-gray-400 flex-wrap">
                              <span>
                                📤{" "}
                                {t.issueDate?.toDate
                                  ? t.issueDate.toDate().toLocaleDateString("en-IN")
                                  : "—"}
                              </span>
                              {t.returnDate?.toDate && (
                                <span>
                                  📥{" "}
                                  {t.returnDate.toDate().toLocaleDateString("en-IN")}
                                </span>
                              )}
                              <span className="font-mono">{t.barcode}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                // Flat list if no semNum stored
                <div className="space-y-2">
                  {allTxns.map((t) => (
                    <div
                      key={t.id}
                      className={`rounded-xl p-3 border ${
                        t.status === "issued"
                          ? "bg-yellow-50 border-yellow-100"
                          : "bg-gray-50 border-gray-100"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-800 truncate flex-1">
                          {t.bookTitle}
                        </p>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                            t.status === "issued"
                              ? "bg-yellow-200 text-yellow-800"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {t.status === "issued" ? "Issued" : "Returned"}
                        </span>
                      </div>
                      <div className="flex gap-4 mt-1.5 text-xs text-gray-400 flex-wrap">
                        <span>
                          📤{" "}
                          {t.issueDate?.toDate
                            ? t.issueDate.toDate().toLocaleDateString("en-IN")
                            : "—"}
                        </span>
                        {t.returnDate?.toDate && (
                          <span>📥 {t.returnDate.toDate().toLocaleDateString("en-IN")}</span>
                        )}
                        <span className="font-mono">{t.barcode}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}