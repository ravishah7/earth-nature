
import { useEffect, useRef } from "react";

import {
  Viewer,
  Ion,
  Terrain,
  Cartesian3,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartographic,
  Math as CesiumMath,
  Color,
} from "cesium";

import "cesium/Build/Cesium/Widgets/widgets.css";

function EarthGlobe({ onLocationSelect }) {
  const globeRef = useRef(null);

  useEffect(() => {
    if (!globeRef.current) return;

    // Configure Cesium's access token.
    const token = import.meta.env.VITE_CESIUM_ION_TOKEN;

    if (!token) {
      console.error("Cesium ion token is missing!");
      return;
    }

    Ion.defaultAccessToken = token;

    // Create the 3D Earth viewer.
    const viewer = new Viewer(globeRef.current, {
      terrain: Terrain.fromWorldTerrain(),

      // Hide Cesium's default controls.
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
    });

    // Enable realistic lighting.
    viewer.scene.globe.enableLighting = true;

    // Set the initial Earth camera position.
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(
        15,
        20,
        26000000
      ),
    });

    // Store the currently selected marker.
    let selectedMarker = null;

    // Listen for clicks on the globe.
    const handler = new ScreenSpaceEventHandler(
      viewer.scene.canvas
    );

    handler.setInputAction((event) => {

      // Convert the mouse position into Earth coordinates.
      const cartesian = viewer.camera.pickEllipsoid(
        event.position,
        viewer.scene.globe.ellipsoid
      );

      // Ignore clicks outside the visible globe.
      if (!cartesian) return;

      const cartographic = Cartographic.fromCartesian(
        cartesian
      );

      const latitude = CesiumMath.toDegrees(
        cartographic.latitude
      );

      const longitude = CesiumMath.toDegrees(
        cartographic.longitude
      );

      // Remove the previous marker.
      if (selectedMarker) {
        viewer.entities.remove(selectedMarker);
      }

      // Add a marker at the clicked location.
      selectedMarker = viewer.entities.add({
        position: Cartesian3.fromDegrees(
          longitude,
          latitude
        ),

        point: {
          pixelSize: 12,
          color: Color.CYAN,
          outlineColor: Color.WHITE,
          outlineWidth: 2,
        },
      });

      // Send coordinates to the React application.
      onLocationSelect?.({
        latitude: Number(latitude.toFixed(5)),
        longitude: Number(longitude.toFixed(5)),
      });

    }, ScreenSpaceEventType.LEFT_CLICK);

    // Clean up Cesium when the component unmounts.
    return () => {
      handler.destroy();
      viewer.destroy();
    };

  }, [onLocationSelect]);

  return (
    <div
      ref={globeRef}
      className="earth-globe"
    />
  );
}

export default EarthGlobe;
