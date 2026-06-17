"use client";

import { useEffect, useRef, useState } from "react";

interface PlaybackControlsProps {
  totalCandles: number;
  currentPosition: number;
  onPositionChange: (position: number) => void;
}

const SPEEDS = [1, 2, 5, 10] as const;

export function PlaybackControls({
  totalCandles,
  currentPosition,
  onPositionChange,
}: PlaybackControlsProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-advance when playing
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        onPositionChange(currentPosition + 1);
      }, 1000 / speed);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, speed, currentPosition, onPositionChange]);

  // Stop at end
  useEffect(() => {
    if (currentPosition >= totalCandles - 1 && isPlaying) {
      setIsPlaying(false);
    }
  }, [currentPosition, totalCandles, isPlaying]);

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);
  const handleStep = () => {
    if (currentPosition < totalCandles - 1) {
      onPositionChange(currentPosition + 1);
    }
  };

  const progress = totalCandles > 0 ? ((currentPosition + 1) / totalCandles) * 100 : 0;

  return (
    <div className="flex items-center gap-4 p-3 border border-gray-800 rounded-lg">
      {/* Play / Pause */}
      <div className="flex items-center gap-2">
        {isPlaying ? (
          <button
            onClick={handlePause}
            className="p-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
            title="Pause"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="2" width="4" height="12" />
              <rect x="9" y="2" width="4" height="12" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handlePlay}
            disabled={currentPosition >= totalCandles - 1}
            className="p-2 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-200 transition-colors"
            title="Play"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <polygon points="3,2 14,8 3,14" />
            </svg>
          </button>
        )}

        {/* Step Forward */}
        <button
          onClick={handleStep}
          disabled={currentPosition >= totalCandles - 1 || isPlaying}
          className="p-2 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-200 transition-colors"
          title="Step Forward"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <polygon points="2,2 10,8 2,14" />
            <rect x="11" y="2" width="3" height="12" />
          </svg>
        </button>
      </div>

      {/* Speed Selector */}
      <div className="flex items-center gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              speed === s
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-400 hover:text-gray-200"
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Progress Bar */}
      <div className="flex-1 flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap">
          {currentPosition + 1} / {totalCandles}
        </span>
      </div>
    </div>
  );
}
