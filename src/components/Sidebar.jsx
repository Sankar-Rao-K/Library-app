import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const links = [
  { to: "/admin",          label: "Dashboard",   icon: "📊", end: true },
  { to: "/admin/books",    label: "Books",        icon: "📚" },
  { to: "/admin/students", label: "Students",     icon: "🎓" },
  { to: "/admin/staff",    label: "Staff",        icon: "👩‍🏫" },
  { to: "/admin/issue",    label: "Issue Book",   icon: "➕" },
  { to: "/admin/return",   label: "Return Book",  icon: "↩️" },
  { to: "/admin/nodues",   label: "No Dues",      icon: "🏅" },
  { to: "/admin/qrcodes",  label: "QR Codes",     icon: "🔲" },
  { to: "/admin/reports",  label: "Reports",      icon: "📈" },
  { to: "/admin/settings", label: "Settings",     icon: "⚙️" },
];

const NAV_GROUPS = [
  { label: "Library",    items: ["/admin", "/admin/books", "/admin/students", "/admin/staff"] },
  { label: "Operations", items: ["/admin/issue", "/admin/return", "/admin/nodues", "/admin/qrcodes"] },
  { label: "Admin",      items: ["/admin/reports", "/admin/settings"] },
];

export default function Sidebar({ onClose }) {
  const { logout } = useAuth();
  const navigate   = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <aside className="w-64 h-full flex flex-col"
      style={{ background: "linear-gradient(180deg, #0B1D3A 0%, #0D2137 60%, #0B2B1E 100%)" }}>

      {/* Logo */}
      <div className="flex-shrink-0 px-4 py-5 border-b"
        style={{ borderColor: "rgba(201,162,39,0.2)" }}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full overflow-hidden border-2 flex-shrink-0"
            style={{ borderColor: "#C9A227" }}>
            <img src="/logo.png" alt="GP Anakapalli" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs font-bold leading-tight truncate">Govt. Polytechnic</p>
            <p className="text-xs font-bold truncate" style={{ color: "#C9A227" }}>Anakapalli</p>
            <p className="text-white/40 text-xs">Library System</p>
          </div>
          {onClose && (
            <button onClick={onClose}
              className="lg:hidden ml-auto text-white/50 hover:text-white text-xl flex-shrink-0">✕</button>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5">
        {NAV_GROUPS.map((group) => {
          const groupLinks = links.filter((l) => group.items.includes(l.to));
          return (
            <div key={group.label}>
              <p className="text-xs font-bold uppercase tracking-widest px-3 mb-1.5"
                style={{ color: "rgba(201,162,39,0.6)" }}>
                {group.label}
              </p>
              <div className="space-y-0.5">
                {groupLinks.map((link) => (
                  <NavLink key={link.to} to={link.to} end={link.end} onClick={onClose}
                    className={({ isActive }) => `
                      flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                      transition-all duration-150
                      ${isActive ? "text-[#0D2137] font-bold shadow-md" : "text-white/60 hover:text-white hover:bg-white/8"}
                    `}
                    style={({ isActive }) => isActive
                      ? { background: "linear-gradient(135deg, #C9A227, #E8C547)", color: "#0D2137" }
                      : {}
                    }>
                    <span className="text-base w-5 text-center">{link.icon}</span>
                    <span>{link.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="flex-shrink-0 px-3 py-4 border-t" style={{ borderColor: "rgba(201,162,39,0.15)" }}>
        <button onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full transition-all text-white/50 hover:text-white hover:bg-red-900/40">
          <span>🚪</span> Sign Out
        </button>
        <p className="text-center text-white/20 text-xs mt-3">
          GP Anakapalli · {new Date().getFullYear()}
        </p>
      </div>
    </aside>
  );
}