import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import SearchBar from "../../components/SearchBar";
import {
  listenToStudents, listenToStaff, getTransactionsByBorrower,
} from "../../firebase/firestore";
import { smartSearch } from "../../utils/searchUtils";
import { getStudentInfo } from "../../utils/studentUtils";

export default function NoDues() {
  const [students, setStudents] = useState([]);
  const [staffList, setStaff]   = useState([]);
  const [tab, setTab]           = useState("students");
  const [search, setSearch]     = useState("");
  const [selected, setSelected] = useState(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult]     = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const u1 = listenToStudents(setStudents);
    const u2 = listenToStaff(setStaff);
    return () => { u1(); u2(); };
  }, []);

  const list = tab === "students"
    ? smartSearch(
        [...students].sort((a, b) => (a.pin || "").localeCompare(b.pin || "")),
        search, ["name", "pin", "branch", "year"]
      )
    : smartSearch(
        [...staffList].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
        search, ["name", "staffId", "designation", "section"]
      );

  const handleSelect = async (person) => {
    setSelected(person);
    setResult(null);
    setChecking(true);
    try {
      const txns = await getTransactionsByBorrower(person.id);
      const dues = txns.filter((t) => t.status === "issued");
      setResult({ hasDues: dues.length > 0, dues });
    } catch (err) {
      alert("Error checking dues: " + err.message);
    }
    setChecking(false);
  };

  // Navigate to Issue with prefilled ID
  const goToIssue = () => {
    if (!selected) return;
    const isStaff = selected.borrowerType === "staff" || tab === "staff";
    navigate("/admin/issue", {
      state: isStaff
        ? { prefillId: selected.staffId, borrowerType: "staff" }
        : { prefillPin: selected.pin, borrowerType: "student" },
    });
  };

  // Navigate to Return with prefilled ID
  const goToReturn = () => {
    if (!selected) return;
    const isStaff = selected.borrowerType === "staff" || tab === "staff";
    navigate("/admin/return", {
      state: isStaff
        ? { prefillId: selected.staffId, borrowerType: "staff" }
        : { prefillPin: selected.pin, borrowerType: "student" },
    });
  };

  const handlePrintCert = () => {
    const w = window.open("", "_blank", "width=900,height=700");
    const today = new Date().toLocaleDateString("en-IN", {
      day: "numeric", month: "long", year: "numeric"
    });
    const isStudent = tab === "students";
    const { yearLabel, sem } = isStudent ? getStudentInfo(selected.pin) : {};

    w.document.write(`
      <!DOCTYPE html><html><head>
      <title>No Dues Certificate — ${selected.name}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; padding: 40px; color: #111; }
        .border-box { border: 3px solid #0D1F4E; border-radius: 12px; padding: 36px 40px; position: relative; }
        .border-inner { border: 1.5px solid #C9A227; border-radius: 8px; padding: 32px 36px; }
        .corner { position: absolute; width: 20px; height: 20px; }
        .tl { top: 6px; left: 6px; border-top: 4px solid #C9A227; border-left: 4px solid #C9A227; }
        .tr { top: 6px; right: 6px; border-top: 4px solid #C9A227; border-right: 4px solid #C9A227; }
        .bl { bottom: 6px; left: 6px; border-bottom: 4px solid #C9A227; border-left: 4px solid #C9A227; }
        .br { bottom: 6px; right: 6px; border-bottom: 4px solid #C9A227; border-right: 4px solid #C9A227; }
        .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #C9A227; padding-bottom: 20px; }
        .inst { font-size: 18px; font-weight: 900; color: #0D1F4E; letter-spacing: 1px; }
        .dept { font-size: 13px; color: #1B6B35; font-weight: 600; margin-top: 3px; }
        .cert-title { font-size: 22px; font-weight: 900; color: #0D1F4E; text-align: center;
          margin: 20px 0 24px; text-transform: uppercase; letter-spacing: 2px; }
        .cert-body { font-size: 14px; line-height: 2; color: #222; text-align: justify; }
        .highlight { font-weight: 800; color: #0D1F4E; }
        .details-table { width: 100%; border-collapse: collapse; margin: 24px 0; }
        .details-table td { padding: 8px 12px; font-size: 13px; border: 1px solid #e5e7eb; }
        .details-table td:first-child { font-weight: 700; background: #f0f4f8; color: #0D1F4E; width: 35%; }
        .stamp-area { display: flex; justify-content: space-between; margin-top: 40px; }
        .sign-box { text-align: center; }
        .sign-line { width: 180px; border-top: 1.5px solid #333; margin: 0 auto 6px; }
        .sign-label { font-size: 12px; font-weight: 700; color: #333; }
        .sign-sub { font-size: 11px; color: #666; }
        .cert-no { font-size: 11px; color: #999; text-align: right; margin-bottom: 12px; }
        .valid-note { font-size: 11px; color: #888; text-align: center; margin-top: 20px;
          font-style: italic; border-top: 1px solid #e5e7eb; padding-top: 12px; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      <div class="border-box">
        <div class="corner tl"></div><div class="corner tr"></div>
        <div class="corner bl"></div><div class="corner br"></div>
        <div class="border-inner">
          <div class="cert-no">Cert. No: ND/${isStudent ? "STU" : "STF"}/${new Date().getFullYear()}/${Math.floor(Math.random()*9000)+1000}</div>
          <div class="header">
            <div class="inst">GOVERNMENT POLYTECHNIC, ANAKAPALLI</div>
            <div class="dept">Department of Library · Established 2008</div>
          </div>
          <div class="cert-title">🏅 No Dues Certificate</div>
          <div class="cert-body">
            This is to certify that <span class="highlight">${selected.name}</span>,
            ${isStudent
              ? `a student of <span class="highlight">${selected.branch}</span> branch (${yearLabel || ""} · ${sem || ""}), bearing PIN <span class="highlight">${selected.pin}</span>,`
              : `<span class="highlight">${selected.designation}</span> of <span class="highlight">${selected.section}</span> Section, bearing CMS Staff ID <span class="highlight">${selected.staffId}</span>,`}
            has <span class="highlight">NO PENDING DUES</span> in the Library of
            Government Polytechnic, Anakapalli.
          </div>
          <table class="details-table">
            <tr><td>Name</td><td><strong>${selected.name}</strong></td></tr>
            ${isStudent
              ? `<tr><td>PIN Number</td><td>${selected.pin}</td></tr>
                 <tr><td>Branch</td><td>${selected.branch}</td></tr>
                 <tr><td>Year / Semester</td><td>${yearLabel || ""} · ${sem || ""}</td></tr>`
              : `<tr><td>CMS Staff ID</td><td>${selected.staffId}</td></tr>
                 <tr><td>Designation</td><td>${selected.designation}</td></tr>
                 <tr><td>Section</td><td>${selected.section}</td></tr>`}
            <tr><td>Certificate Date</td><td>${today}</td></tr>
          </table>
          <div class="stamp-area">
            <div class="sign-box">
              <div class="sign-line"></div>
              <div class="sign-label">Librarian</div>
              <div class="sign-sub">Govt. Polytechnic, Anakapalli</div>
            </div>
            <div style="text-align:center;padding-top:8px;">
              <div style="width:80px;height:80px;border:2px dashed #C9A227;border-radius:50%;
                display:flex;align-items:center;justify-content:center;color:#C9A227;
                font-size:11px;text-align:center;line-height:1.4;">Official<br>Stamp</div>
            </div>
            <div class="sign-box">
              <div class="sign-line"></div>
              <div class="sign-label">Head of Department</div>
              <div class="sign-sub">Computer Engineering</div>
            </div>
          </div>
          <div class="valid-note">
            This certificate is valid for official purposes only. Issued on ${today}.
          </div>
        </div>
      </div>
      </body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 600);
  };

  const isStaffTab = tab === "staff";

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">No Dues Certificate</h1>
        <p className="text-gray-500 text-sm mt-1">
          Check pending books, generate certificates, and navigate to Issue / Return directly.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Left: Person list ── */}
        <div>
          <div className="flex gap-2 mb-4">
            {[{ key: "students", label: "🎓 Students" }, { key: "staff", label: "👩‍🏫 Staff" }].map((t) => (
              <button key={t.key}
                onClick={() => { setTab(t.key); setSearch(""); setSelected(null); setResult(null); }}
                className="px-5 py-2 rounded-lg text-sm font-semibold transition"
                style={tab === t.key
                  ? { background: "linear-gradient(135deg, #0D1F4E, #1B4332)", color: "white" }
                  : { background: "white", color: "#6b7280", border: "1px solid #e5e7eb" }}>
                {t.label}
              </button>
            ))}
          </div>

          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder={tab === "students" ? "Search by name, PIN, or branch..." : "Search by name, ID, or section..."}
            resultCount={list.length}
            totalCount={tab === "students" ? students.length : staffList.length}
            className="mb-3"
          />

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {list.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-3xl mb-2">🔍</p>
                <p className="text-gray-400 text-sm">No records found</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 max-h-[500px] overflow-y-auto">
                {list.map((person) => (
                  <button key={person.id}
                    onClick={() => handleSelect(person)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition hover:bg-blue-50 ${
                      selected?.id === person.id ? "bg-blue-50 border-l-4 border-blue-600" : ""
                    }`}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0"
                      style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
                      {person.name?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{person.name}</p>
                      <p className="text-xs text-gray-400 font-mono">
                        {tab === "students"
                          ? `${person.pin} · ${person.branch} · ${person.year}`
                          : `${person.staffId} · ${person.designation} · ${person.section}`}
                      </p>
                    </div>
                    {selected?.id === person.id && (
                      <span className="text-blue-600 text-lg flex-shrink-0">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Result panel ── */}
        <div>
          {!selected && !checking && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm h-full flex flex-col items-center justify-center py-20 text-center px-6">
              <div className="text-6xl mb-4">📋</div>
              <p className="text-gray-600 font-semibold text-base">Select a person</p>
              <p className="text-gray-400 text-sm mt-1">
                Choose from the list to check dues status and access quick actions.
              </p>
            </div>
          )}

          {checking && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm h-full flex flex-col items-center justify-center py-20">
              <div className="text-4xl mb-3 animate-pulse">🔍</div>
              <p className="text-gray-500 text-sm">Checking dues for {selected?.name}…</p>
            </div>
          )}

          {selected && result && !checking && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Person header */}
              <div className="px-5 py-4 border-b border-gray-100"
                style={{ background: "linear-gradient(135deg, #0D1F4E08, #1B433208)" }}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-lg flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
                    {selected.name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800">{selected.name}</p>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">
                      {tab === "students"
                        ? `${selected.pin} · ${selected.branch}`
                        : `${selected.staffId} · ${selected.section}`}
                    </p>
                  </div>
                  <button onClick={() => handleSelect(selected)}
                    className="text-xs text-blue-600 hover:underline font-medium flex-shrink-0">
                    🔄 Re-check
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {/* ── NO DUES — green banner + Issue Book CTA ── */}
                {!result.hasDues && (
                  <>
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">✅</span>
                        <div>
                          <p className="font-bold text-green-700 text-base">No Pending Dues</p>
                          <p className="text-green-500 text-sm">
                            All books have been returned. Certificate can be issued.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Quick actions — no dues */}
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                      <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-3">
                        Quick Actions
                      </p>
                      <button onClick={goToIssue}
                        className="w-full py-3 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 transition mb-2"
                        style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
                        ➕ Issue a Book to {selected.name.split(" ")[0]}
                      </button>
                      <p className="text-xs text-blue-500 text-center">
                        Will navigate to Issue Book with this {tab === "students" ? "student's PIN" : "staff ID"} pre-filled
                      </p>
                    </div>

                    <button onClick={handlePrintCert}
                      className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition border-2 border-green-600 text-green-700 hover:bg-green-50">
                      🖨️ Generate & Print No Dues Certificate
                    </button>
                  </>
                )}

                {/* ── HAS DUES — red banner + pending books + both actions ── */}
                {result.hasDues && (
                  <>
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-3xl">⚠️</span>
                        <div>
                          <p className="font-bold text-red-700 text-base">Has Pending Dues</p>
                          <p className="text-red-500 text-sm">
                            {result.dues.length} book{result.dues.length > 1 ? "s" : ""} not yet returned
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-red-500 font-medium">
                        Cannot issue No Dues Certificate until all books are returned.
                      </p>
                    </div>

                    {/* Pending books */}
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                        Pending Books
                      </p>
                      <div className="space-y-2">
                        {result.dues.map((t) => {
                          const days = t.issueDate?.toDate
                            ? Math.floor((Date.now() - t.issueDate.toDate()) / 86400000) : null;
                          return (
                            <div key={t.id}
                              className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-800 truncate">{t.bookTitle}</p>
                                <p className="text-xs text-gray-400 font-mono mt-0.5">{t.barcode}</p>
                                {t.issueDate?.toDate && (
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    Issued: {t.issueDate.toDate().toLocaleDateString("en-IN")}
                                  </p>
                                )}
                              </div>
                              {days !== null && (
                                <span className={`text-xs font-bold flex-shrink-0 px-2 py-1 rounded-full ${
                                  days > 14 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                                }`}>
                                  {days}d {days > 14 ? "⚠️" : ""}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Quick actions — has dues */}
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                      <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-3">
                        Quick Actions
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={goToIssue}
                          className="py-2.5 rounded-xl font-bold text-white text-xs flex items-center justify-center gap-1.5 transition"
                          style={{ background: "linear-gradient(135deg, #0D1F4E, #1B4332)" }}>
                          ➕ Issue Book
                        </button>
                        <button onClick={goToReturn}
                          className="py-2.5 rounded-xl font-bold text-white text-xs flex items-center justify-center gap-1.5 transition"
                          style={{ background: "linear-gradient(135deg, #b45309, #d97706)" }}>
                          ↩️ Return Book
                        </button>
                      </div>
                      <p className="text-xs text-amber-600 text-center mt-2">
                        {tab === "students" ? "Student's PIN" : "Staff ID"} will be pre-filled automatically
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}