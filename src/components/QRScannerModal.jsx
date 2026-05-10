import { useEffect, useRef, useState, useCallback } from "react";
import jsQR from "jsqr";

export default function QRScannerModal({ onScan, onClose, title = "Scan QR Code" }) {
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const streamRef   = useRef(null);
  const rafRef      = useRef(null);
  const mountedRef  = useRef(true);

  const [status, setStatus]     = useState("starting"); // starting | scanning | error
  const [errorMsg, setErrorMsg] = useState("");
  const [scanned, setScanned]   = useState(false);

  // ── Stop everything cleanly ────────────────────────────────────────
  const stopAll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // ── Scan loop — reads frames via jsQR ─────────────────────────────
  const scanLoop = useCallback(() => {
    if (!mountedRef.current) return;
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });

    if (code && code.data) {
      if (!mountedRef.current) return;
      setScanned(true);
      stopAll();
      // Small delay so the "✅ Scanned!" flash is visible
      setTimeout(() => {
        if (mountedRef.current) onScan(code.data.trim());
      }, 300);
      return;
    }

    rafRef.current = requestAnimationFrame(scanLoop);
  }, [onScan, stopAll]);

  // ── Start camera ──────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width:  { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!mountedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", true);
          await videoRef.current.play();
        }

        if (mountedRef.current) {
          setStatus("scanning");
          rafRef.current = requestAnimationFrame(scanLoop);
        }
      } catch (err) {
        if (!mountedRef.current) return;
        const msg = err?.name || err?.message || "";
        if (msg.includes("NotAllowed") || msg.includes("Permission")) {
          setErrorMsg("Camera permission denied. Please allow camera access in your browser settings.");
        } else if (msg.includes("NotFound") || msg.includes("Devices")) {
          setErrorMsg("No camera found on this device.");
        } else if (msg.includes("NotReadable") || msg.includes("Busy")) {
          setErrorMsg("Camera is in use by another app. Close it and try again.");
        } else {
          setErrorMsg("Could not access camera: " + (err?.message || msg));
        }
        setStatus("error");
      }
    };

    start();

    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
      stopAll();
    };
  }, [scanLoop, stopAll]);

  const handleClose = () => {
    mountedRef.current = false;
    stopAll();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.80)" }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
            <span>📷</span> {title}
          </h3>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-800 text-xl transition"
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          {/* Starting */}
          {status === "starting" && (
            <div className="text-center py-10">
              <div className="text-5xl mb-4 animate-pulse">📷</div>
              <p className="text-gray-600 font-medium text-sm">Starting camera...</p>
              <p className="text-gray-400 text-xs mt-1">Please allow camera access if prompted</p>
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="text-center py-8 px-2">
              <div className="text-5xl mb-4">📵</div>
              <p className="text-red-600 font-semibold text-sm mb-2">Camera unavailable</p>
              <p className="text-gray-500 text-xs leading-relaxed mb-5">{errorMsg}</p>
              <p className="text-gray-400 text-xs bg-gray-50 rounded-lg p-3">
                💡 Close this modal and enter the code manually using the text field below.
              </p>
              <button
                onClick={handleClose}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm px-6 py-2.5 rounded-lg font-medium transition w-full"
              >
                Use Manual Entry Instead
              </button>
            </div>
          )}

          {/* Scanned flash */}
          {scanned && (
            <div className="text-center py-10">
              <div className="text-5xl mb-3">✅</div>
              <p className="text-green-600 font-semibold text-sm">QR Code Detected!</p>
            </div>
          )}

          {/* Camera view */}
          {status === "scanning" && !scanned && (
            <div className="relative">
              {/* Video */}
              <video
                ref={videoRef}
                className="w-full rounded-xl object-cover"
                style={{ maxHeight: "300px" }}
                muted
                playsInline
              />

              {/* Overlay frame */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-48 h-48">
                  {/* Corner markers */}
                  {[
                    "top-0 left-0 border-t-4 border-l-4 rounded-tl-lg",
                    "top-0 right-0 border-t-4 border-r-4 rounded-tr-lg",
                    "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg",
                    "bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg",
                  ].map((cls, i) => (
                    <div key={i} className={`absolute w-8 h-8 border-blue-400 ${cls}`} />
                  ))}
                  {/* Scan line animation */}
                  <div
                    className="absolute left-2 right-2 h-0.5 bg-blue-400 opacity-80"
                    style={{
                      animation: "scanline 2s ease-in-out infinite",
                      top: "50%",
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Hint text */}
          {status === "scanning" && !scanned && (
            <p className="text-center text-xs text-gray-400 mt-3 leading-relaxed">
              Hold the QR code steady inside the frame. It scans automatically.
            </p>
          )}
        </div>
      </div>

      {/* Scan line animation keyframes */}
      <style>{`
        @keyframes scanline {
          0%   { top: 10%; opacity: 1; }
          50%  { top: 90%; opacity: 0.6; }
          100% { top: 10%; opacity: 1; }
        }
      `}</style>
    </div>
  );
}