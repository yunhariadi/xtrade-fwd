"use client";

const SPEEDS = [1, 2, 5, 10] as const;
export type ReplaySpeed = (typeof SPEEDS)[number];

interface BarReplayControlsProps {
  /** Whether replay mode is active */
  replayMode: boolean;
  /** Whether the chart is waiting for the user to click a start bar */
  selectingBar: boolean;
  /** Whether playback is currently running */
  isPlaying: boolean;
  /** Current playback speed multiplier */
  speed: ReplaySpeed;
  /** Whether a start bar has been chosen (enables play/step) */
  hasStartBar: boolean;
  /** Whether the playback head is at the last candle */
  atEnd: boolean;
  /** Current 1-based position for the readout (0 when no start bar) */
  currentPosition: number;
  /** Total candle count */
  totalCandles: number;

  onToggleReplay: () => void;
  onSelectBar: () => void;
  onPlayPause: () => void;
  onStep: () => void;
  onSpeedChange: (speed: ReplaySpeed) => void;
}

export function BarReplayControls({
  replayMode,
  selectingBar,
  isPlaying,
  speed,
  hasStartBar,
  atEnd,
  currentPosition,
  totalCandles,
  onToggleReplay,
  onSelectBar,
  onPlayPause,
  onStep,
  onSpeedChange,
}: BarReplayControlsProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 bg-black/70 backdrop-blur rounded-lg border border-gray-800 shadow-lg">
      {/* Enter / exit bar replay (<<) */}
      <button
        onClick={onToggleReplay}
        className={`p-1.5 rounded text-gray-200 transition-colors ${
          replayMode ? "bg-blue-600 hover:bg-blue-500" : "bg-gray-700 hover:bg-gray-600"
        }`}
        title={replayMode ? "Exit bar replay" : "Bar replay"}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <polygon points="8,2 1,8 8,14" />
          <polygon points="15,2 8,8 15,14" />
        </svg>
      </button>

      {replayMode && (
        <>
          <div className="w-px h-5 bg-gray-700" />

          {/* Select start bar (|<) */}
          <button
            onClick={onSelectBar}
            className={`p-1.5 rounded text-gray-200 transition-colors ${
              selectingBar ? "bg-amber-600 hover:bg-amber-500" : "bg-gray-700 hover:bg-gray-600"
            }`}
            title="Select start bar — then click a candle on the chart"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="2" y="2" width="2.5" height="12" />
              <polygon points="14,2 6,8 14,14" />
            </svg>
          </button>

          {/* Play / Pause (>) */}
          <button
            onClick={onPlayPause}
            disabled={!hasStartBar || atEnd}
            className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 transition-colors"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="3" y="2" width="4" height="12" />
                <rect x="9" y="2" width="4" height="12" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <polygon points="3,2 14,8 3,14" />
              </svg>
            )}
          </button>

          {/* Step forward */}
          <button
            onClick={onStep}
            disabled={!hasStartBar || atEnd || isPlaying}
            className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 transition-colors"
            title="Step forward"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <polygon points="2,2 10,8 2,14" />
              <rect x="11" y="2" width="3" height="12" />
            </svg>
          </button>

          <div className="w-px h-5 bg-gray-700" />

          {/* Speed selector */}
          <div className="flex items-center gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => onSpeedChange(s)}
                className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  speed === s
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-400 hover:text-gray-200"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Position readout */}
          <span className="text-[11px] text-gray-400 whitespace-nowrap pl-1">
            {hasStartBar ? `${currentPosition} / ${totalCandles}` : "select bar"}
          </span>
        </>
      )}
    </div>
  );
}
