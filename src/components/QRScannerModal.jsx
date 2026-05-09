import { useEffect, useRef, useState } from "react";

export default function QRScannerModal({ onScan, onClose, title = "Scan QR Code" }) {
  const [status, setStatus]   = useState("idle"); // idle | loading | ready | error
  const [errorMsg, setErrorMsg] = useState("");
  const scannerRef  = useRef(null);
  const mountedRef  = useRef(true);
  const elementId   = useRef(`qr-reader-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    mountedRef.current = true;
    let html5Qr = null;

    const start = async () => {
      if (!mountedRef.current) return;
      setStatus("loading");
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (!mountedRef.current) return;

        html5Qr = new Html5Qrcode(elementId.current);
        scannerRef.current = html5Qr;

        await html5Qr.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 200, height: 200 } },
          (decodedText) => {
            if (!mountedRef.current) return;
            // Stop scanner then call onScan
            html5Qr.stop()
              .catch(() => {})
              .finally(() => {
                if (mountedRef.current) onScan(decodedText.trim());
              });
          },
          () => {} // silence frame errors
        );

        if (mountedRef.current) setStatus("ready");
      } catch (err) {
        if (!mountedRef.current) return;
        const msg = err?.message || String(err);
        // Ignore "already started" type errors
        if (!msg.toLowerCase().includes("already")) {
          setErrorMsg(msg.includes("Permission") || msg.includes("NotAllowed")
            ? "Camera permission denied. Please allow camera access."
            : msg.includes("NotFound") || msg.includes("Requested")
              ? "No camera found on this device."
              : "Camera error: " + msg
          );
          setStatus("error");
        }
      }
    };

    start();

    return () => {
      mountedRef.current = false;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
          <button
            onClick={() => {
              mountedRef.current = false;
              if (scannerRef.current) {
                scannerRef.current.stop().catch(() => {}).finally(onClose);
                scannerRef.current = null;
              } else {
                onClose();
              }
            }}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          {/* Status messages */}
          {status === "loading" && (
            <div className="text-center py-6">
              <div className="text-4xl mb-3 animate-pulse">📷</div>
              <p className="text-gray-500 text-sm">Starting camera...</p>
            </div>
          )}

          {status === "error" && (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">📵</div>
              <p className="text-red-500 text-sm font-semibold mb-1">Camera unavailable</p>
              <p className="text-gray-400 text-xs px-2">{errorMsg}</p>
              <p className="text-gray-500 text-xs mt-3">
                Close this and use manual entry instead.
              </p>
              <button
                onClick={onClose}
                className="mt-4 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-5 py-2 rounded-lg"
              >
                Use Manual Entry
              </button>
            </div>
          )}

          {/* Scanner container — always in DOM once not error */}
          <div
            id={elementId.current}
            className={`w-full rounded-xl overflow-hidden ${
              status === "error" || status === "idle" ? "hidden" : "block"
            }`}
            style={{ minHeight: status === "ready" ? "240px" : "0px" }}
          />

          {status === "ready" && (
            <p className="text-center text-xs text-gray-400 mt-3">
              📷 Align QR code in the box — scans automatically
            </p>
          )}
        </div>
      </div>
    </div>
  );
}