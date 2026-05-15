export default function SearchBar({
  value,
  onChange,
  placeholder = "Search...",
  className = "",
  resultCount = null,
  totalCount = null,
}) {
  return (
    <div className={`relative ${className}`}>
      {/* Left icon */}
      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
      </div>

      {/* Input */}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-10 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition shadow-sm"
        style={{ focusRingColor: "#1B6B35" }}
        onFocus={(e) => {
          e.target.style.boxShadow = "0 0 0 3px rgba(27,107,53,0.15)";
          e.target.style.borderColor = "#1B6B35";
        }}
        onBlur={(e) => {
          e.target.style.boxShadow = "";
          e.target.style.borderColor = "";
        }}
      />

      {/* Right: result count or clear */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
        {value && resultCount !== null && (
          <span className="text-xs text-gray-400 font-medium">
            {resultCount}{totalCount !== null ? `/${totalCount}` : ""}
          </span>
        )}
        {value ? (
          <button
            onClick={() => onChange("")}
            className="w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition text-gray-500 hover:text-gray-700 flex-shrink-0"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : (
          <span className="text-xs text-gray-300 hidden sm:block select-none">
            Smart search
          </span>
        )}
      </div>
    </div>
  );
}