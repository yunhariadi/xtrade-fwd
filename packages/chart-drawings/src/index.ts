/**
 * Interface for chart drawing plugins.
 * Chart drawing plugins will implement this interface in future phases.
 */
export interface ChartDrawingPlugin {
  id: string;
  type: string;
  render: () => void;
}
