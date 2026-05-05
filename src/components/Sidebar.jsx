import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const links = [
  { to: "/admin",          label: "Dashboard",   icon: "📊", end: true },
  { to: "/admin/books",    label: "Books",        icon: "📚" },
  { to: "/admin/students", label: "Students",     icon: "🎓" },
  { to: "/admin/issue",    label: "Issue Book",   icon: "➕" },
  { to: "/admin/return",   label: "Return Book",  icon: "↩️" },
  { to: "/admin/settings", label: "Settings",     icon: "⚙️" },
];

export default function Sidebar() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <aside className="w-64 h-full bg-gray-900 text-white flex flex-col">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-gray-700 flex-shrink-0">
        <div className="text-2xl font-bold flex items-center gap-2">
          <span>📚</span>
          <span>LibraryOS</span>
        </div>
        <p className="text-gray-400 text-xs mt-1">Admin Panel</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
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

      {/* Logout */}
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