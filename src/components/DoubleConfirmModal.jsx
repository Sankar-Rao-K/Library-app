import { useState } from "react";

/**
 * Universal double-confirm delete modal.
 * Props:
 *   title        – e.g. "Delete K. Sankar Rao?"
 *   description  – short warning text
 *   confirmWord  – user must type this to unlock delete button
 *   askReason    – if true, shows a reason dropdown (for students)
 *   onConfirm(reason) – called with reason string when confirmed
 *   onCancel     – called to dismiss
 *   loading      – disables button while deleting
 */
const DELETE_REASONS = [
  "Student passed out",
  "Transferred to another institution",
  "Duplicate record",
  "Data entry error",
  "Disciplinary action",
  "Other",
];

export default function DoubleConfirmModal({
  title,
  description,
  confirmWord,
  askReason = false,
  onConfirm,
  onCancel,
  loading = false,
}) {
  const [step, setStep]     = useState(1);
  const [typed, setTyped]   = useState("");
  const [reason, setReason] = useState("");
  const [otherReason, setOtherReason] = useState("");

  const matches = typed.trim().toLowerCase() === confirmWord.trim().toLowerCase();
  const finalReason = reason === "Other" ? otherReason.trim() : reason;
  const canDelete = matches && (!askReason || finalReason.length > 0);

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Step 1 */}
        {step === 1 && (
          <>
            <div className="bg-red-600 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl">🗑️</div>
                <div>
                  <h3 className="font-bold text-white text-base">{title}</h3>
                  <p className="text-red-200 text-xs mt-0.5">This action cannot be undone</p>
                </div>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-600 leading-relaxed mb-5">{description}</p>
              <div className="flex gap-3">
                <button onClick={onCancel}
                  className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition">
                  Cancel
                </button>
                <button onClick={() => setStep(2)}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl text-sm font-bold transition">
                  Yes, I want to delete
                </button>
              </div>
            </div>
          </>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <>
            <div className="bg-gray-900 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-xl">🚨</div>
                <div>
                  <h3 className="font-bold text-white text-base">Final Confirmation</h3>
                  <p className="text-gray-400 text-xs mt-0.5">Type the name to unlock delete</p>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {/* Reason (for students) */}
              {askReason && (
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                    Reason for deletion <span className="text-red-500">*</span>
                  </label>
                  <select value={reason} onChange={(e) => setReason(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400">
                    <option value="">— Select a reason —</option>
                    {DELETE_REASONS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                  {reason === "Other" && (
                    <input
                      type="text"
                      value={otherReason}
                      onChange={(e) => setOtherReason(e.target.value)}
                      placeholder="Describe the reason..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                  )}
                </div>
              )}

              {/* Confirm word */}
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                  Type <span className="font-mono bg-red-50 text-red-600 px-1.5 py-0.5 rounded">{confirmWord}</span> to confirm
                </label>
                <input
                  type="text"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={`Type "${confirmWord}" exactly`}
                  autoFocus
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition ${
                    typed && matches
                      ? "border-green-400 bg-green-50 focus:ring-green-300"
                      : typed
                        ? "border-red-300 bg-red-50 focus:ring-red-300"
                        : "border-gray-300 focus:ring-red-300"
                  }`}
                />
                {typed && !matches && (
                  <p className="text-xs text-red-500 mt-1">Does not match — type exactly as shown</p>
                )}
                {typed && matches && (
                  <p className="text-xs text-green-600 mt-1 font-medium">✓ Match confirmed</p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => { setStep(1); setTyped(""); setReason(""); setOtherReason(""); }}
                  className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition">
                  ← Back
                </button>
                <button
                  onClick={() => onConfirm(finalReason)}
                  disabled={!canDelete || loading}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:text-gray-400 text-white py-2.5 rounded-xl text-sm font-bold transition">
                  {loading ? "Deleting…" : "🗑️ Delete Permanently"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}