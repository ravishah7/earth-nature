
import { MapPin, Crosshair } from "lucide-react";

function LocationPanel({ location }) {
  return (
    <section className="location-panel">

      <div className="panel-heading">
        <div className="panel-icon">
          <MapPin size={19} />
        </div>

        <div>
          <p className="eyebrow">LOCATION DISCOVERY</p>
          <h2>
            {location ? "Selected Location" : "Explore the Earth"}
          </h2>
        </div>
      </div>

      {location ? (
        <div className="coordinates">

          <div className="coordinate-item">
            <span>LATITUDE</span>
            <strong>{location.latitude}°</strong>
          </div>

          <div className="coordinate-item">
            <span>LONGITUDE</span>
            <strong>{location.longitude}°</strong>
          </div>

          <div className="location-status">
            <Crosshair size={15} />
            Coordinates captured successfully
          </div>

        </div>
      ) : (
        <div className="empty-location">
          <p>
            Somewhere on this planet, there is a
            beautiful place waiting to be discovered.
          </p>

          <div className="instruction">
            <Crosshair size={15} />
            Click anywhere on the globe
          </div>
        </div>
      )}

    </section>
  );
}

export default LocationPanel;
