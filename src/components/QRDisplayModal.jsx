import QRCode from "react-qr-code";

export default function QRDisplayModal({ item, type, onClose }) {
  const value =
    type === "student"
      ? JSON.stringify({
          type: "student",
          pin: item.pin,
          name: item.name,
        })
      : JSON.stringify({
          type: "staff",
          staffId: item.staffId,
          name: item.name,
        });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm text-center relative">

        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 text-lg"
        >
          ✕
        </button>

        <h2 className="text-xl font-bold text-gray-800 mb-2">
          QR Generated
        </h2>

        <p className="text-sm text-gray-500 mb-5">
          Scan this QR for library access
        </p>

        <div className="bg-white p-4 rounded-xl border inline-block">
          <QRCode value={value} size={220} />
        </div>

        <div className="mt-5 text-sm text-gray-700">
          <p className="font-semibold">{item.name}</p>

          {type === "student" ? (
            <p>{item.pin}</p>
          ) : (
            <p>{item.staffId}</p>
          )}
        </div>
      </div>
    </div>
  );
}