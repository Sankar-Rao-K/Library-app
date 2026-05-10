import { useEffect, useRef, useState, useCallback } from "react";

export default function QRScannerModal({ onScan, onClose, title = "Scan QR Code" }) {
  const videoRef   = useRef(null);
  const mountedRef = useRef(true);
  const readerRef  = useRef(null);
  const [status, setStatus]     = useState("starting");
  const [errorMsg, setErrorMsg] = useState("");
  const [scanned, setScanned]   = useState(false);
  const [torchOn, setTorchOn]   = useState(false);

  const stopAll = useCallback(async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.reset();
        readerRef.current = null;
      }
    } catch {}
  }, []);

  const handleClose = useCallback(async () => {
    mountedRef.current = false;
    await stopAll();
    onClose();
  }, [stopAll, onClose]);

  useEffect(() => {
    mountedRef.current = true;
    let started = false;

    const start = async () => {
      // Small delay to ensure the video element is mounted and visible in DOM
      await new Promise((r) => setTimeout(r, 200));
      if (!mountedRef.current) return;

      try {
        const { BrowserQRCodeReader, BrowserCodeReader } = await import("@zxing/browser");
        const { DecodeHintType, BarcodeFormat } = await import("@zxing/library");
        if (!mountedRef.current) return;

        const hints = new Map();
        hints.set(DecodeHintType.TRY_HARDER, true);
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);

        const reader = new BrowserQRCodeReader(hints, {
          delayBetweenScanAttempts: 150,
        });
        readerRef.current = reader;
        started = true;

        const devices = await BrowserCodeReader.listVideoInputDevices();
        if (!mountedRef.current) return;

        if (!devices || devices.length === 0) {
          setErrorMsg("No camera found on this device.");
          setStatus("error");
          return;
        }

        // Prefer back/environment camera
        const backCamera = devices.find((d) =>
          /back|rear|environment/i.test(d.label)
        ) || devices[devices.length - 1];

        // Ensure video element is ready
        if (!videoRef.current) {
          setErrorMsg("Video element not ready. Please try again.");
          setStatus("error");
          return;
        }

        setStatus("scanning");

        await reader.decodeFromVideoDevice(
          backCamera.deviceId,
          videoRef.current,
          (result, err, controls) => {
            if (!mountedRef.current) { controls.stop(); return; }
            if (result) {
              setScanned(true);
              controls.stop();
              setTimeout(() => {
                if (mountedRef.current) onScan(result.getText().trim());
              }, 500);
            }
          }
        );
      } catch (err) {
        if (!mountedRef.current) return;
        const msg = String(err?.message || err || "");
        if (/NotAllowed|Permission|denied/i.test(msg)) {
          setErrorMsg("Camera permission denied. Please allow camera access in browser settings.");
        } else if (/NotFound|DevicesNotFound/i.test(msg)) {
          setErrorMsg("No camera found on this device.");
        } else if (/NotReadable|Busy|TrackStart/i.test(msg)) {
          setErrorMsg("Camera is in use by another app. Please close it and try again.");
        } else {
          setErrorMsg(msg || "Unable to access camera. Please use manual entry.");
        }
        setStatus("error");
      }
    };

    start();

    return () => {
      mountedRef.current = false;
      stopAll();
    };
  }, []);

  const toggleTorch = async () => {
    try {
      const stream = videoRef.current?.srcObject;
      if (!stream) return;
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.88)" }}>
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden w-full" style={{ maxWidth: 360 }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ background: "linear-gradient(135deg, #0D1F4E, #1B6B35)" }}>
          <h3 className="font-semibold text-white text-sm flex items-center gap-2">
            <span>📷</span> {title}
          </h3>
          <button onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/20 text-xl transition">
            ✕
          </button>
        </div>

        <div className="p-4">
          {/* Starting */}
          {status === "starting" && (
            <div className="text-center py-10">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
                <span className="text-3xl animate-pulse">📷</span>
              </div>
              <p className="text-gray-700 font-medium text-sm">Starting camera...</p>
              <p className="text-gray-400 text-xs mt-1">Allow camera access if prompted</p>
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="text-center py-6 px-2">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-red-50 flex items-center justify-center text-2xl">📵</div>
              <p className="text-red-600 font-semibold text-sm mb-2">Camera Unavailable</p>
              <p className="text-gray-500 text-xs leading-relaxed px-2 mb-4">{errorMsg}</p>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700 text-left mb-4">
                <p className="font-semibold mb-1">💡 Try these:</p>
                <ul className="space-y-0.5 list-disc list-inside">
                  <li>Use Chrome or Safari on mobile</li>
                  <li>Allow camera permission in browser</li>
                  <li>Close other apps using camera</li>
                </ul>
              </div>
              <button onClick={handleClose}
                className="w-full text-white text-sm px-6 py-2.5 rounded-xl font-medium transition"
                style={{ background: "linear-gradient(135deg, #0D1F4E, #1B6B35)" }}>
                Use Manual Entry
              </button>
            </div>
          )}

          {/* Scanned */}
          {scanned && (
            <div className="text-center py-10">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-green-50 flex items-center justify-center text-3xl">✅</div>
              <p className="text-green-600 font-bold text-base">QR Code Detected!</p>
              <p className="text-gray-400 text-xs mt-1">Processing...</p>
            </div>
          )}

          {/* Camera — always in DOM, hidden when not scanning */}
          <div style={{ display: status === "scanning" && !scanned ? "block" : "none" }}>
            <div className="relative rounded-xl overflow-hidden bg-black"
              style={{ width: "100%", height: 280 }}>
              {/* 
                CRITICAL FIX: video must have explicit width/height styles.
                Do NOT use Tailwind w-full/h-full here — it can cause black screen.
                Use inline styles so the browser renders it correctly.
              */}
              <video
                ref={videoRef}
                style={{
                  display: "block",
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
                muted
                playsInline
                autoPlay
              />

              {/* Overlay frame */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                {/* Semi-transparent border */}
                <div style={{ position: "relative", width: 180, height: 180 }}>
                  {/* Dark overlays around the scan box */}
                  <div style={{ position: "absolute", inset: 0, boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }} />
                  {/* Corners */}
                  {[
                    { top: 0, left: 0, borderTop: "3px solid #C9A227", borderLeft: "3px solid #C9A227", borderRadius: "8px 0 0 0" },
                    { top: 0, right: 0, borderTop: "3px solid #C9A227", borderRight: "3px solid #C9A227", borderRadius: "0 8px 0 0" },
                    { bottom: 0, left: 0, borderBottom: "3px solid #C9A227", borderLeft: "3px solid #C9A227", borderRadius: "0 0 0 8px" },
                    { bottom: 0, right: 0, borderBottom: "3px solid #C9A227", borderRight: "3px solid #C9A227", borderRadius: "0 0 8px 0" },
                  ].map((style, i) => (
                    <div key={i} style={{ position: "absolute", width: 28, height: 28, ...style }} />
                  ))}
                  {/* Scan line */}
                  <div style={{
                    position: "absolute", left: 4, right: 4, height: 2,
                    background: "linear-gradient(90deg, transparent, #C9A227, transparent)",
                    animation: "scanline 2s ease-in-out infinite",
                  }} />
                </div>
              </div>
            </div>

            {/* Controls row */}
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-gray-400">Align QR code in the gold frame</p>
              <button onClick={toggleTorch}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                  torchOn ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}>
                {torchOn ? "🔦 On" : "🔦 Flash"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes scanline {
          0%   { top: 8px; opacity: 1; }
          50%  { top: calc(100% - 10px); opacity: 0.5; }
          100% { top: 8px; opacity: 1; }
        }
      `}</style>
    </div>
  );
}