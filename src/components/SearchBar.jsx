import { useState, useRef, useEffect, useCallback } from "react";

/**
 * Google-style SearchBar with dropdown results.
 *
 * Props:
 *   value / onChange   – controlled input
 *   placeholder
 *   resultCount / totalCount  – shows "15/120" counter
 *   className
 *
 *   // For dropdown mode (optional):
 *   results            – array of result objects to show in dropdown
 *   renderResult(item) – function returning JSX for each dropdown row
 *   onResultClick(item)– called when a dropdown row is clicked
 *   emptyMessage       – shown when results=[] and query is non-empty (default: "No records found")
 *   loading            – shows spinner in dropdown
 *   minChars           – minimum chars before dropdown shows (default: 1)
 */
export default function SearchBar({
  value,
  onChange,
  placeholder = "Search...",
  className = "",
  resultCount = null,
  totalCount = null,
  // Dropdown
  results = null,          // null = no dropdown mode; [] = show empty state
  renderResult = null,
  onResultClick = null,
  emptyMessage = "No records found",
  loading = false,
  minChars = 1,
  isIdSearch = false,      // when true, show "exact match only" hint
}) {
  const [open, setOpen]     = useState(false);
  const containerRef        = useRef(null);
  const inputRef            = useRef(null);

  const showDropdown = results !== null && value.trim().length >= minChars;

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (showDropdown) setOpen(true);
    else setOpen(false);
  }, [value, showDropdown]);

  const handleResultClick = (item) => {
    setOpen(false);
    onResultClick?.(item);
  };

  const handleClear = () => {
    onChange("");
    inputRef.current?.focus();
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* ── Input ── */}
      <div className="relative">
        {/* Search icon */}
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
          {loading ? (
            <div className="w-4 h-4 border-2 border-gray-300 border-t-green-600 rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => { if (showDropdown) setOpen(true); }}
          placeholder={placeholder}
          className={`w-full bg-white border rounded-xl pl-10 pr-24 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none transition shadow-sm ${
            open && showDropdown
              ? "rounded-b-none border-b-0 border-green-500 ring-2 ring-green-500/20"
              : "border-gray-200 hover:border-gray-300"
          }`}
          style={open && showDropdown ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : {}}
          onFocus={(e) => {
            if (!open) {
              e.target.style.boxShadow = "0 0 0 3px rgba(27,107,53,0.15)";
              e.target.style.borderColor = "#1B6B35";
            }
            if (showDropdown) setOpen(true);
          }}
          onBlur={(e) => {
            if (!open) {
              e.target.style.boxShadow = "";
              e.target.style.borderColor = "";
            }
          }}
        />

        {/* Right side */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {value && resultCount !== null && !open && (
            <span className="text-xs text-gray-400 font-medium">
              {resultCount}{totalCount !== null ? `/${totalCount}` : ""}
            </span>
          )}
          {value ? (
            <button
              onMouseDown={(e) => { e.preventDefault(); handleClear(); }}
              className="w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition text-gray-500 hover:text-gray-700 flex-shrink-0"
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

      {/* ── Dropdown ── */}
      {open && showDropdown && (
        <div
          className="absolute left-0 right-0 z-50 bg-white border border-green-500 border-t-0 rounded-b-xl shadow-xl overflow-hidden"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}
        >
          {/* Loading */}
          {loading && (
            <div className="flex items-center gap-3 px-4 py-4">
              <div className="w-4 h-4 border-2 border-gray-200 border-t-green-600 rounded-full animate-spin" />
              <span className="text-sm text-gray-400">Searching…</span>
            </div>
          )}

          {/* Results */}
          {!loading && results.length > 0 && (
            <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
              {/* Result count header */}
              <div className="px-4 py-2 bg-gray-50 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {results.length} result{results.length !== 1 ? "s" : ""}
                  {isIdSearch && (
                    <span className="ml-2 text-green-600 font-semibold">· Exact ID match</span>
                  )}
                </span>
                <button
                  onMouseDown={(e) => { e.preventDefault(); setOpen(false); }}
                  className="text-xs text-gray-400 hover:text-gray-600">
                  ✕ Close
                </button>
              </div>
              {results.map((item, i) => (
                <div
                  key={item.id || i}
                  onMouseDown={(e) => { e.preventDefault(); handleResultClick(item); }}
                  className="cursor-pointer hover:bg-blue-50 transition px-1"
                >
                  {renderResult ? renderResult(item) : (
                    <div className="px-3 py-2.5 text-sm text-gray-700">{String(item)}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && results.length === 0 && (
            <div className="px-4 py-6 text-center">
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-sm font-medium text-gray-600">{emptyMessage}</p>
              {isIdSearch && (
                <p className="text-xs text-gray-400 mt-1">
                  No exact match for ID "<span className="font-mono font-bold">{value}</span>"
                </p>
              )}
              {!isIdSearch && (
                <p className="text-xs text-gray-400 mt-1">
                  Try a different spelling or fewer words
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}