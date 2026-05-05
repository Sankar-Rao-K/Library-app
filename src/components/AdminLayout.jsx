import Sidebar from "./Sidebar";

export default function AdminLayout({ children }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar — fixed height, never scrolls */}
      <div className="h-screen overflow-y-auto flex-shrink-0">
        <Sidebar />
      </div>

      {/* Main content — only this area scrolls */}
      <main className="flex-1 h-screen overflow-y-auto p-8">
        {children}
      </main>
    </div>
  );
}