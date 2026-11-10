import TimelineControls from "../temperature/TimelineControls";
import TemperatureChart from "../temperature/TemperatureChart";
import TemperatureComparison from "../temperature/TemperatureComparison";

// Bottom panel: timeline controls on the left, synchronised chart on the right.
function TemperatureDashboard({ temperature, timeline, regionTimeline }) {
  if (temperature.status === "loading") {
    return <section className="dash-bottom"><p className="dash-message">Loading NASA temperature grid…</p></section>;
  }
  if (temperature.status === "unavailable") {
    return (
      <section className="dash-bottom">
        <p className="dash-message">
          Temperature dataset not built yet. In the <code>Server</code> folder run{" "}
          <code>npm run data:temperature</code>, then restart the server.
        </p>
      </section>
    );
  }
  if (temperature.status === "error") {
    return <section className="dash-bottom"><p className="dash-message region-error" role="alert">{temperature.error}</p></section>;
  }

  const baselineLabel = `${temperature.data.meta.baseline}`;
  return (
    <section className="dash-bottom">
      <div className="dash-left">
        <TimelineControls timeline={timeline} />
        <TemperatureComparison timelineData={regionTimeline.data} />
      </div>
      <div className="dash-right">
        {regionTimeline.status === "ready" && regionTimeline.data ? (
          <TemperatureChart
            timelineData={regionTimeline.data}
            selectedYear={timeline.year}
            baselineLabel={baselineLabel.replace(" mean of each grid cell", "")}
          />
        ) : (
          <p className="dash-message">
            {regionTimeline.status === "error" ? regionTimeline.error : "Loading regional timeline…"}
          </p>
        )}
      </div>
    </section>
  );
}

export default TemperatureDashboard;
