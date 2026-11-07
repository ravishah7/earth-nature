
import { Globe2, Compass } from "lucide-react";

function Navbar() {
  return (
    <nav className="navbar">
      <div className="brand">
        <div className="brand-icon">
          <Globe2 size={23} />
        </div>

        <div>
          <h1>EARTH<span>EXPLORER</span></h1>
          <p>DISCOVER THE UNSEEN</p>
        </div>
      </div>

      <div className="nav-right">
        <div className="live-indicator">
          <span className="live-dot" />
          LIVE PLANET
        </div>

        <div className="nav-divider" />

        <Compass size={19} />
        <span className="explore-label">EXPLORE EARTH</span>
      </div>
    </nav>
  );
}

export default Navbar;
