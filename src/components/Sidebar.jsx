import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const links = [
  { to: "/admin",          label: "Dashboard",   icon: "📊", end: true },
  { to: "/admin/books",    label: "Books",        icon: "📚" },
  { to: "/admin/students", label: "Students",     icon: "🎓" },
  { to: "/admin/issue",    label: "Issue Book",   icon: "➕" },
  { to: "/admin/return",   label: "Return Book",  icon: "↩️" },
  { to: "/admin/qrcodes",  label: "QR Codes",     icon: "🔲" },
  { to: "/admin/reports",  label: "Reports",      icon: "📈" },
  { to: "/admin/settings", label: "Settings",     icon: "⚙️" },
];

export default function Sidebar({ onClose }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <aside className="w-64 h-full bg-gray-900 text-white flex flex-col">
      <div className="px-6 py-5 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
        <div>
          <div className="text-xl font-bold flex items-center gap-2">
            <span>📚</span><span>LibraryOS</span>
          </div>
          <p className="text-gray-400 text-xs mt-0.5">Admin Panel</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-white text-xl">✕</button>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`
            }
          >
            <span>{link.icon}</span>
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-gray-700 flex-shrink-0">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-red-600 hover:text-white transition-all w-full"
        >
          <span>🚪</span> Logout
        </button>
      </div>
    </aside>
  );
}