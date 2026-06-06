import { useCallback, useEffect, useRef, useState } from "react";
import { debounce } from "../utils/searchUtils";

/**
 * Universal Google-style SearchBar
 *
 * Simple mode  (no results prop)  – styled input with debounce, counter, clear
 * Dropdown mode (pass results)    – animated slide-down results panel
 *
 * Props
 *  value / onChange              controlled raw input
 *  onDebouncedChange             called 200ms after typing stops (optional – use instead of onChange+debounce)
 *  placeholder
 *  resultCount / totalCount      shows "12/120" counter
 *  className
 *  minChars                      min chars before dropdown shows (default 2)
 *  isIdSearch                    shows amber "ID" badge
 *  -- dropdown --
 *  results          array|null   null = no dropdown; [] = show empty state
 *  renderResult(item)            JSX for each row
 *  onResultClick(item)
 *  emptyMessage
 *  loading
 */
export default function SearchBar({
  value,
  onChange,
  onDebouncedChange,
  placeholder   = "Search...",
  className     = "",
  resultCount   = null,
  totalCount    = null,
  minChars      = 2,
  isIdSearch    = false,
  // dropdown
  results       = null,
  renderResult  = null,
  onResultClick = null,
  emptyMessage  = "No records found",
  loading       = false,
}) {
  const [open,  setOpen]  = useState(false);
  const [ready, setReady] = useState(false);
  const containerRef      = useRef(null);
  const inputRef          = useRef(null);

  // Internal debounced callback for onDebouncedChange
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedCb = useCallback(
    onDebouncedChange ? debounce(onDebouncedChange, 200) : null,
    [onDebouncedChange]
  );

  const hasDropdown  = results !== null;
  const shouldShow   = hasDropdown && value.trim().length >= minChars;

  // open/close with animation
  useEffect(() => {
    if (shouldShow) {
      setOpen(true);
      requestAnimationFrame(() => setReady(true));
    } else {
      setReady(false);
      const t = setTimeout(() => setOpen(false), 180);
      return () => clearTimeout(t);
    }
  }, [shouldShow]);

  // close on outside click
  useEffect(() => {
    const h = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setReady(false); setTimeout(() => setOpen(false), 180);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const handleChange = (e) => {
    onChange(e.target.value);
    debouncedCb?.(e.target.value);
  };

  const handleClear = () => {
    onChange("");
    debouncedCb?.("");
    inputRef.current?.focus();
  };

  const handleResultClick = (item) => {
    setReady(false); setTimeout(() => setOpen(false), 180);
    onResultClick?.(item);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>

      {/* ── Input ── */}
      <div className={`relative transition-all duration-200 ${open ? "z-50" : "z-10"}`}>
        {/* Search icon */}
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
          {loading ? (
            <div className="w-4 h-4 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          ) : (
            <svg className={`w-4 h-4 transition-colors duration-150 ${open ? "text-blue-500" : "text-gray-400"}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={() => { if (shouldShow) { setOpen(true); requestAnimationFrame(() => setReady(true)); } }}
          placeholder={placeholder}
          className={`w-full bg-white pl-10 pr-24 py-2.5 text-sm text-gray-800 placeholder-gray-400
            focus:outline-none transition-all duration-200 shadow-sm ${
            open && hasDropdown
              ? "rounded-t-xl rounded-b-none border border-b-0 border-blue-400 ring-2 ring-blue-100"
              : "border border-gray-200 rounded-xl hover:border-gray-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          }`}
        />

        {/* Right side */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {/* Result count */}
          {value && resultCount !== null && !open && (
            <span className="text-xs text-gray-400 font-medium tabular-nums">
              {resultCount}{totalCount !== null ? `/${totalCount}` : ""}
            </span>
          )}
          {/* Total in dropdown */}
          {value && open && results?.length > 0 && (
            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
              {results.length}
            </span>
          )}
          {/* ID badge */}
          {isIdSearch && value && (
            <span className="text-xs font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full hidden sm:block">
              ID
            </span>
          )}
          {/* Clear / hint */}
          {value ? (
            <button
              onMouseDown={(e) => { e.preventDefault(); handleClear(); }}
              className="w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition text-gray-500 flex-shrink-0"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : (
            <span className="text-xs text-gray-300 hidden sm:block select-none">Smart search</span>
          )}
        </div>
      </div>

      {/* Min-chars hint (no dropdown needed) */}
      {!hasDropdown && value.trim().length === 1 && (
        <p className="text-xs text-blue-500 mt-1.5 pl-1 font-medium">
          Type at least 2 characters to search…
        </p>
      )}

      {/* ── Dropdown ── */}
      {open && hasDropdown && (
        <div
          className="absolute left-0 right-0 z-50 border border-t-0 border-blue-400 rounded-b-xl overflow-hidden"
          style={{
            background:  "linear-gradient(180deg, #EFF6FF 0%, #EDF5FF 100%)",
            boxShadow:   "0 12px 40px rgba(59,130,246,0.15), 0 4px 12px rgba(0,0,0,0.08)",
            opacity:     ready ? 1 : 0,
            transform:   ready ? "translateY(0)" : "translateY(-8px)",
            transition:  "opacity 0.18s ease, transform 0.18s ease",
          }}
        >
          {/* Header bar */}
          {!loading && (
            <div className="flex items-center justify-between px-4 py-2 border-b border-blue-100"
              style={{ background: "rgba(219,234,254,0.55)" }}>
              <span className="text-xs font-semibold text-blue-700">
                {results.length > 0
                  ? `${results.length} result${results.length !== 1 ? "s" : ""}`
                  : "No results"}
                {isIdSearch && (
                  <span className="ml-2 text-amber-500 font-normal">· Exact ID match</span>
                )}
              </span>
              <button
                onMouseDown={(e) => { e.preventDefault(); setReady(false); setTimeout(() => setOpen(false), 180); }}
                className="text-blue-400 hover:text-blue-600 text-xs transition">
                Esc ✕
              </button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center gap-3 px-4 py-4">
              <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
              <span className="text-sm text-blue-400 font-medium">Searching…</span>
            </div>
          )}

          {/* Empty */}
          {!loading && results.length === 0 && (
            <div className="px-4 py-7 text-center">
              <p className="text-2xl mb-1.5">🔍</p>
              <p className="text-sm font-semibold text-gray-600">{emptyMessage}</p>
              {isIdSearch ? (
                <p className="text-xs text-gray-400 mt-1">
                  No exact match for <span className="font-mono font-bold">"{value}"</span>
                </p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">Try fewer words or different spelling</p>
              )}
            </div>
          )}

          {/* Results */}
          {!loading && results.length > 0 && (
            <div className="max-h-72 overflow-y-auto">
              {results.map((item, i) => (
                <div
                  key={item.id || i}
                  onMouseDown={(e) => { e.preventDefault(); handleResultClick(item); }}
                  className="cursor-pointer transition-colors duration-100 border-b border-blue-50 last:border-0"
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(191,219,254,0.45)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  {renderResult ? renderResult(item) : (
                    <div className="px-4 py-2.5 text-sm text-gray-700">{String(item)}</div>
                  )}
                </div>
              ))}
              <div className="px-4 py-2 text-center border-t border-blue-100"
                style={{ background: "rgba(219,234,254,0.3)" }}>
                <p className="text-xs text-blue-400">Click a result · Esc to close</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}