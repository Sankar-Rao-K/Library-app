import { useEffect, useRef, useState } from "react";

export default function QRScannerModal({ onScan, onClose, title = "Scan QR Code" }) {
  const [status, setStatus] = useState("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const scannerRef = useRef(null);
  const scannerId = useRef(`qr-${Date.now()}`);

  useEffect(() => {
    let scanner = null;
    const init = async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        scanner = new Html5Qrcode(scannerId.current);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decoded) => {
            scanner.stop().catch(() => {}).finally(() => onScan(decoded.trim()));
          },
          () => {}
        );
        setStatus("ready");
      } catch (err) {
        setErrorMsg(err?.message || "Camera not accessible.");
        setStatus("error");
      }
    };
    init();
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <div className="p-4">
          {status === "loading" && (
            <div className="text-center py-10">
              <div className="text-4xl mb-3 animate-pulse">📷</div>
              <p className="text-gray-500 text-sm">Starting camera...</p>
            </div>
          )}
          {status === "error" && (
            <div className="text-center py-10">
              <div className="text-4xl mb-3">❌</div>
              <p className="text-red-500 text-sm font-medium">Camera unavailable</p>
              <p className="text-gray-400 text-xs mt-1 px-4">{errorMsg}</p>
              <p className="text-gray-500 text-sm mt-4">Close and use manual entry instead.</p>
            </div>
          )}
          {/* Always in DOM so Html5Qrcode can find the element */}
          <div
            id={scannerId.current}
            className="w-full rounded-xl overflow-hidden"
            style={{ display: status === "error" ? "none" : "block" }}
          />
          {status === "ready" && (
            <p className="text-center text-xs text-gray-400 mt-3">
              📷 Align QR code within the frame — auto-detects
            </p>
          )}
        </div>
      </div>
    </div>
  );
}