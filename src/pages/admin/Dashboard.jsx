import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { listenToBooks, listenToStudents, listenToTransactions } from "../../firebase/firestore";

const StatCard = ({ icon, label, value, color }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center gap-4">
    <div className={`text-3xl p-3 rounded-xl ${color}`}>{icon}</div>
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
    </div>
  </div>
);

export default function AdminDashboard() {
  const [books, setBooks] = useState([]);
  const [students, setStudents] = useState([]);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    const u1 = listenToBooks(setBooks);
    const u2 = listenToStudents(setStudents);
    const u3 = listenToTransactions(setTransactions);
    return () => { u1(); u2(); u3(); };
  }, []);

  const issuedCount = transactions.filter((t) => t.status === "issued").length;
  const availableBooks = books.filter((b) => b.available).length;

  const recentTransactions = [...transactions]
    .sort((a, b) => (b.issueDate?.seconds || 0) - (a.issueDate?.seconds || 0))
    .slice(0, 5);

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Welcome back! Here's what's happening.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon="📚" label="Total Books" value={books.length} color="bg-blue-50" />
        <StatCard icon="✅" label="Available" value={availableBooks} color="bg-green-50" />
        <StatCard icon="📤" label="Issued" value={issuedCount} color="bg-yellow-50" />
        <StatCard icon="🎓" label="Students" value={students.length} color="bg-purple-50" />
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Recent Transactions</h2>
        {recentTransactions.length === 0 ? (
          <p className="text-gray-400 text-sm">No transactions yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2">Book</th>
                <th className="pb-2">Student PIN</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentTransactions.map((t) => (
                <tr key={t.id}>
                  <td className="py-2 font-medium text-gray-700">{t.bookTitle || t.barcode}</td>
                  <td className="py-2 text-gray-500">{t.studentPin}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.status === "issued"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-green-100 text-green-700"
                    }`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="py-2 text-gray-400">
                    {t.issueDate?.toDate
                      ? t.issueDate.toDate().toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}