import { Pause, Play, RotateCcw } from "lucide-react";

const SPEEDS = [
  { label: "0.5×", value: 0.5 },
  { label: "1×", value: 1 },
  { label: "2×", value: 2 },
  { label: "4×", value: 4 },
];

function TimelineControls({ timeline, disabled }) {
  const { year, min, max, playing, speed, setSpeed, seek, play, pause, reset } = timeline;

  return (
    <div className="timeline-controls">
      <div className="timeline-year" aria-live="polite">
        <small>SELECTED YEAR</small>
        <strong>{year}</strong>
      </div>

      <div className="timeline-buttons">
        <button type="button" disabled={disabled} onClick={playing ? pause : play} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" disabled={disabled} onClick={reset} aria-label="Reset to first year">
          <RotateCcw size={15} /> Reset
        </button>
        <label className="timeline-speed">
          <span>SPEED</span>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} disabled={disabled}>
            {SPEEDS.map((s) => <option key={s.value} value={s.value}>{s.label} ({s.value} yr/s)</option>)}
          </select>
        </label>
      </div>

      <div className="timeline-slider">
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={year}
          disabled={disabled}
          onChange={(e) => { pause(); seek(Number(e.target.value)); }}
          aria-label="Select year"
        />
        <div><span>{min}</span><span>{max}</span></div>
      </div>
    </div>
  );
}

export default TimelineControls;
