import { useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { auth } from "../../firebase/config";
import {
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";

export default function Settings() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState(null); // { type: "success"|"error", msg }
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setStatus(null);

    if (newPassword.length < 6) {
      setStatus({ type: "error", msg: "New password must be at least 6 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus({ type: "error", msg: "New passwords do not match." });
      return;
    }

    setLoading(true);
    try {
      const user = auth.currentUser;
      // Re-authenticate first (required by Firebase before sensitive changes)
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setStatus({ type: "success", msg: "Password changed successfully!" });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err) {
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setStatus({ type: "error", msg: "Current password is incorrect." });
      } else {
        setStatus({ type: "error", msg: "Error: " + err.message });
      }
    }
    setLoading(false);
  };

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your admin account.</p>
      </div>

      <div className="max-w-lg">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Change Password</h2>
          <p className="text-sm text-gray-400 mb-6">
            You'll need to enter your current password to confirm.
          </p>

          {status && (
            <div className={`rounded-lg px-4 py-3 mb-5 text-sm border ${
              status.type === "success"
                ? "bg-green-50 border-green-200 text-green-700"
                : "bg-red-50 border-red-200 text-red-600"
            }`}>
              {status.type === "success" ? "✅ " : "❌ "}{status.msg}
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            {[
              { label: "Current Password", value: currentPassword, set: setCurrentPassword },
              { label: "New Password", value: newPassword, set: setNewPassword },
              { label: "Confirm New Password", value: confirmPassword, set: setConfirmPassword },
            ].map(({ label, value, set }) => (
              <div key={label}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input
                  type="password"
                  required
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-2.5 rounded-lg font-semibold text-sm transition mt-2"
            >
              {loading ? "Updating..." : "Update Password"}
            </button>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}