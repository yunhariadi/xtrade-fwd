"use client";

const TIMEFRAMES = ["5m", "15m", "1h", "4h"] as const;

interface TimeframeSelectorProps {
  active: string;
  onChange: (tf: string) => void;
}

export function TimeframeSelector({ active, onChange }: TimeframeSelectorProps) {
  return (
    <div className="flex gap-1">
      {TIMEFRAMES.map((tf) => (
        <button
          key={tf}
          onClick={() => onChange(tf)}
          className={`px-3 py-1 rounded text-xs font-medium uppercase transition-colors ${
            active === tf
              ? "bg-blue-600 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
          }`}
        >
          {tf}
        </button>
      ))}
    </div>
  );
}
