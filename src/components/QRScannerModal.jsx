import { useEffect, useRef, useState, useCallback } from "react";

export default function QRScannerModal({ onScan, onClose, title = "Scan QR Code" }) {
  const videoRef   = useRef(null);
  const mountedRef = useRef(true);
  const readerRef  = useRef(null);

  const [status, setStatus]     = useState("starting");
  const [errorMsg, setErrorMsg] = useState("");
  const [scanned, setScanned]   = useState(false);
  const [torchOn, setTorchOn]   = useState(false);
  const trackRef = useRef(null);

  // ── Clean stop ─────────────────────────────────────────────────────
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

  // ── Start scanner ──────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    const start = async () => {
      try {
        // Dynamic import to avoid SSR issues
        const { BrowserQRCodeReader, BrowserCodeReader } = await import("@zxing/browser");

        if (!mountedRef.current) return;

        const hints = new Map();
        // Try all possible formats
        const { DecodeHintType, BarcodeFormat } = await import("@zxing/library");
        hints.set(DecodeHintType.TRY_HARDER, true);
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);

        const reader = new BrowserQRCodeReader(hints, {
          delayBetweenScanAttempts: 100,
          delayBetweenScanSuccess: 500,
        });
        readerRef.current = reader;

        // Get available cameras
        const devices = await BrowserCodeReader.listVideoInputDevices();
        if (!mountedRef.current) return;

        if (!devices || devices.length === 0) {
          setErrorMsg("No camera found on this device.");
          setStatus("error");
          return;
        }

        // Prefer back camera on mobile
        const backCamera = devices.find((d) =>
          d.label.toLowerCase().includes("back") ||
          d.label.toLowerCase().includes("rear") ||
          d.label.toLowerCase().includes("environment")
        );
        const selectedDevice = backCamera || devices[devices.length - 1];

        if (!mountedRef.current) return;
        setStatus("scanning");

        await reader.decodeFromVideoDevice(
          selectedDevice.deviceId,
          videoRef.current,
          (result, err, controls) => {
            if (!mountedRef.current) { controls.stop(); return; }
            if (result) {
              setScanned(true);
              controls.stop();
              setTimeout(() => {
                if (mountedRef.current) onScan(result.getText().trim());
              }, 400);
            }
            // err is normal (no QR in frame), ignore it
          }
        );
      } catch (err) {
        if (!mountedRef.current) return;
        const msg = String(err?.message || err || "");
        if (msg.includes("NotAllowed") || msg.includes("Permission") || msg.includes("denied")) {
          setErrorMsg("Camera permission denied. Please tap Allow when your browser asks for camera access.");
        } else if (msg.includes("NotFound") || msg.includes("DevicesNotFound")) {
          setErrorMsg("No camera found. Make sure your device has a camera.");
        } else if (msg.includes("NotReadable") || msg.includes("Busy") || msg.includes("TrackStart")) {
          setErrorMsg("Camera is being used by another app. Close that app and try again.");
        } else if (msg.includes("OverconstrainedError") || msg.includes("Overconstrained")) {
          setErrorMsg("Camera not compatible. Try a different browser.");
        } else {
          setErrorMsg(msg || "Unable to start camera. Try entering the code manually.");
        }
        setStatus("error");
      }
    };

    start();

    return () => {
      mountedRef.current = false;
      stopAll();
    };
  }, [stopAll, onScan]);

  // ── Torch (flashlight) toggle ──────────────────────────────────────
  const toggleTorch = async () => {
    try {
      const stream = videoRef.current?.srcObject;
      if (!stream) return;
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      const newState = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: newState }] });
      setTorchOn(newState);
    } catch {
      // Torch not supported — silently ignore
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.85)" }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl overflow-hidden"
        style={{ width: "100%", maxWidth: "360px" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
            <span>📷</span> {title}
          </h3>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-800 text-xl leading-none transition"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* ── STARTING ── */}
          {status === "starting" && (
            <div className="text-center py-10">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
                <span className="text-3xl animate-pulse">📷</span>
              </div>
              <p className="text-gray-700 font-medium text-sm">Starting camera...</p>
              <p className="text-gray-400 text-xs mt-1">
                Allow camera access when prompted
              </p>
            </div>
          )}

          {/* ── ERROR ── */}
          {status === "error" && (
            <div className="text-center py-6 px-2">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
                <span className="text-3xl">📵</span>
              </div>
              <p className="text-red-600 font-semibold text-sm mb-2">Camera unavailable</p>
              <p className="text-gray-500 text-xs leading-relaxed px-2 mb-4">{errorMsg}</p>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700 text-left">
                <p className="font-semibold mb-1">💡 Tips:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Use Chrome or Safari on mobile</li>
                  <li>Make sure camera permission is allowed</li>
                  <li>Close other apps using the camera</li>
                  <li>Or type the code manually below</li>
                </ul>
              </div>
              <button
                onClick={handleClose}
                className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white text-sm px-6 py-2.5 rounded-xl font-medium transition"
              >
                Use Manual Entry
              </button>
            </div>
          )}

          {/* ── SCANNED ── */}
          {scanned && (
            <div className="text-center py-10">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-50 flex items-center justify-center">
                <span className="text-3xl">✅</span>
              </div>
              <p className="text-green-600 font-bold text-base">QR Code Detected!</p>
              <p className="text-gray-400 text-xs mt-1">Processing...</p>
            </div>
          )}

          {/* ── SCANNING ── */}
          {status === "scanning" && !scanned && (
            <>
              {/* Video container */}
              <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "4/3" }}>
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                  autoPlay
                />

                {/* Dark overlay with hole in center */}
                <div className="absolute inset-0 pointer-events-none">
                  {/* Top overlay */}
                  <div className="absolute top-0 left-0 right-0 bg-black/40" style={{ height: "calc(50% - 80px)" }} />
                  {/* Bottom overlay */}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/40" style={{ height: "calc(50% - 80px)" }} />
                  {/* Left overlay */}
                  <div className="absolute left-0 bg-black/40" style={{ top: "calc(50% - 80px)", bottom: "calc(50% - 80px)", width: "calc(50% - 80px)" }} />
                  {/* Right overlay */}
                  <div className="absolute right-0 bg-black/40" style={{ top: "calc(50% - 80px)", bottom: "calc(50% - 80px)", width: "calc(50% - 80px)" }} />

                  {/* Target box */}
                  <div
                    className="absolute"
                    style={{
                      top: "50%", left: "50%",
                      width: 160, height: 160,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    {/* Corners */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-blue-400 rounded-tl-lg" style={{ borderWidth: "3px 0 0 3px" }} />
                    <div className="absolute top-0 right-0 w-8 h-8 border-blue-400 rounded-tr-lg" style={{ borderWidth: "3px 3px 0 0" }} />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-blue-400 rounded-bl-lg" style={{ borderWidth: "0 0 3px 3px" }} />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-blue-400 rounded-br-lg" style={{ borderWidth: "0 3px 3px 0" }} />

                    {/* Animated scan line */}
                    <div
                      className="absolute left-1 right-1 bg-blue-400 rounded"
                      style={{
                        height: "2px",
                        animation: "scan 2s ease-in-out infinite",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  Hold QR code in the box
                </p>
                <button
                  onClick={toggleTorch}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                    torchOn
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {torchOn ? "🔦 Flash On" : "🔦 Flash"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes scan {
          0%   { top: 4px;  opacity: 1; }
          50%  { top: calc(100% - 6px); opacity: 0.7; }
          100% { top: 4px;  opacity: 1; }
        }
      `}</style>
    </div>
  );
}