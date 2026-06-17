"use client";

export interface IndicatorConfig {
  showFvg: boolean;
  showLiquidity: boolean;
  showOB: boolean;
  showKZ: boolean;
  showBOS: boolean;
  showVP: boolean;
}


interface IndicatorSettingsProps {
  config: IndicatorConfig;
  onChange: (config: IndicatorConfig) => void;
}

export function IndicatorSettings({ config, onChange }: IndicatorSettingsProps) {
  return (
    <div className="flex items-center gap-3">
      <ToggleButton
        label="FVG"
        active={config.showFvg}
        onToggle={() => onChange({ ...config, showFvg: !config.showFvg })}
      />
      <ToggleButton
        label="Liquidity"
        active={config.showLiquidity}
        onToggle={() => onChange({ ...config, showLiquidity: !config.showLiquidity })}
      />
      <ToggleButton
        label="OB"
        active={config.showOB}
        onToggle={() => onChange({ ...config, showOB: !config.showOB })}
      />
      <ToggleButton
        label="KZ"
        active={config.showKZ}
        onToggle={() => onChange({ ...config, showKZ: !config.showKZ })}
      />
      <ToggleButton
        label="BOS"
        active={config.showBOS}
        onToggle={() => onChange({ ...config, showBOS: !config.showBOS })}
      />
      <ToggleButton
        label="VP"
        active={config.showVP}
        onToggle={() => onChange({ ...config, showVP: !config.showVP })}
      />
    </div>

  );
}

function ToggleButton({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`px-2 py-0.5 rounded text-xs transition-colors ${
        active
          ? "bg-gray-700 text-gray-200 border border-gray-600"
          : "bg-transparent text-gray-500 border border-gray-800 hover:text-gray-400"
      }`}
    >
      {active ? "●" : "○"} {label}
    </button>
  );
}
