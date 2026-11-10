import { TEMPERATURE_CLASSES, legendGradientCss, SCALE_RANGE } from "../../utils/temperatureColor";

const fmt = (n) => (n > 0 ? `+${n}` : `${n}`);

function rangeLabel({ from, to }) {
  if (from === -Infinity) return `≤ ${fmt(to)}`;
  if (to === Infinity) return `≥ ${fmt(from)}`;
  return `${fmt(from)} to ${fmt(to)}`;
}

function TemperatureLegend({ baselineLabel }) {
  return (
    <aside className="temp-legend" aria-label="Temperature anomaly legend">
      <p className="eyebrow">TEMPERATURE ANOMALY (°C)</p>
      <div className="legend-bar" style={{ background: legendGradientCss() }} />
      <div className="legend-bar-labels">
        <span>{fmt(SCALE_RANGE[0])}</span><span>0</span><span>{fmt(SCALE_RANGE[1])}</span>
      </div>
      <ul>
        {[...TEMPERATURE_CLASSES].reverse().map((c) => (
          <li key={c.id}>
            <i style={{ background: c.color }} />
            <span>{c.label}</span>
            <small>{rangeLabel(c)}</small>
          </li>
        ))}
      </ul>
      <p className="legend-note">
        Difference from the {baselineLabel ?? "baseline"} — <b>not</b> absolute temperature.
        Empty areas have no valid data.
      </p>
    </aside>
  );
}

export default TemperatureLegend;
