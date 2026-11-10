
import { useEffect, useRef, useState } from "react";

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
  EllipsoidTerrainProvider,
  ImageryLayer,
  TileMapServiceImageryProvider,
  buildModuleUrl,
} from "cesium";

import "cesium/Build/Cesium/Widgets/widgets.css";

import { INITIAL_VIEW } from "../../utils/geoUtils";
import { readCesiumToken } from "../../utils/cesiumToken";

const TERRAIN_TIMEOUT_MS = 10000;
const TERRAIN_TILE_ERROR_LIMIT = 3;

// onViewerReady(viewer) hands the Cesium viewer to sibling layers
// (e.g. BoundaryLayer); it receives null when the globe unmounts.
function EarthGlobe({ onLocationSelect, onViewerReady }) {
  const globeRef = useRef(null);

  // Notes about anything that failed to load, shown on screen so a black
  // globe is never a mystery.
  const [issues, setIssues] = useState([]);

  // Keep the latest click callback in a ref so the viewer is created once
  // and never rebuilt just because a parent callback changed.
  const onSelectRef = useRef(onLocationSelect);
  useEffect(() => {
    onSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);

  useEffect(() => {
    if (!globeRef.current) return;

    // Configure Cesium's access token.
    const { token, problem, repaired } = readCesiumToken();

    if (problem) {
      console.error(`Cesium ion token is ${problem}.`);
      return;
    }
    if (repaired) {
      console.warn("Client/.env.local had extra text in VITE_CESIUM_ION_TOKEN; cleaned it. Please fix the file.");
    }

    Ion.defaultAccessToken = token;

    // Kept as a variable so we can listen for terrain failures.
    const terrain = Terrain.fromWorldTerrain();

    // Create the 3D Earth viewer.
    const viewer = new Viewer(globeRef.current, {
      terrain,

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

    const report = (msg) => {
      console.error("[EarthGlobe]", msg);
      setIssues((list) => (list.includes(msg) ? list : [...list, msg]));
    };

    // --- Resilience -------------------------------------------------------
    // While world terrain is loading, Cesium gives the globe NO terrain
    // provider, and a globe without one draws nothing at all. If terrain
    // never arrives (invalid token, token without terrain access, offline,
    // ion error) the planet would stay invisible, so fall back to a smooth
    // ellipsoid and explain why. If terrain does arrive later, Cesium swaps
    // it in automatically.
    let flat = false;
    const useFlatGlobe = (reason) => {
      if (viewer.isDestroyed() || flat) return;
      flat = true;
      viewer.scene.globe.terrainProvider = new EllipsoidTerrainProvider();
      report(reason);
    };

    let terrainReady = false;
    const timer = setTimeout(() => {
      if (!terrainReady) {
        useFlatGlobe(
          "World terrain did not load within 10 s — showing a smooth globe. Check your Cesium ion token and network."
        );
      }
    }, TERRAIN_TIMEOUT_MS);

    terrain.errorEvent.addEventListener((err) => {
      useFlatGlobe(
        `World terrain failed to load (${err?.message ?? "unknown error"}) — check that your Cesium ion token is valid and has terrain access.`
      );
    });

    terrain.readyEvent.addEventListener((provider) => {
      terrainReady = true;
      clearTimeout(timer);
      let tileErrors = 0;
      provider.errorEvent.addEventListener((err) => {
        tileErrors += 1;
        if (tileErrors >= TERRAIN_TILE_ERROR_LIMIT) {
          useFlatGlobe(
            `Terrain tiles keep failing (${err?.message ?? "request error"}) — showing a smooth globe.`
          );
        }
      });
    });

    // If the default imagery cannot load, fall back to the Natural Earth II
    // picture that ships with Cesium so the planet is never blank.
    let imageryFallbackAdded = false;
    const baseLayer = viewer.imageryLayers.get(0);
    baseLayer?.errorEvent?.addEventListener((err) => {
      if (imageryFallbackAdded || viewer.isDestroyed()) return;
      imageryFallbackAdded = true;
      report(
        `Satellite imagery failed to load (${err?.message ?? "request error"}) — using the built-in Natural Earth map.`
      );
      try {
        const provider = TileMapServiceImageryProvider.fromUrl(
          buildModuleUrl("Assets/Textures/NaturalEarthII")
        );
        viewer.imageryLayers.add(ImageryLayer.fromProviderAsync(provider), 0);
      } catch (e) {
        console.error("[EarthGlobe] fallback imagery failed", e);
      }
    });
    // ---------------------------------------------------------------------

    // Set the initial Earth camera position.
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(
        INITIAL_VIEW.lon,
        INITIAL_VIEW.lat,
        INITIAL_VIEW.height
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
      onSelectRef.current?.({
        latitude: Number(latitude.toFixed(5)),
        longitude: Number(longitude.toFixed(5)),
      });

    }, ScreenSpaceEventType.LEFT_CLICK);

    onViewerReady?.(viewer);

    // Clean up Cesium when the component unmounts.
    return () => {
      clearTimeout(timer);
      onViewerReady?.(null);
      handler.destroy();
      viewer.destroy();
    };

  }, [onViewerReady]);

  // A bad token used to leave a silent black screen; say so instead.
  const tokenProblem = readCesiumToken().problem;
  if (tokenProblem) {
    return (
      <div className="earth-globe globe-error">
        <p>
          {tokenProblem === "missing"
            ? "Cesium ion token missing."
            : "Cesium ion token looks malformed (a real token has three parts separated by dots and starts with “eyJ”)."}{" "}
          Put exactly one line in <code>Client/.env.local</code>:{" "}
          <code>VITE_CESIUM_ION_TOKEN=your_token</code> (no quotes, no spaces),
          then stop and restart <code>npm run dev</code>.
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        ref={globeRef}
        className="earth-globe"
      />
      {issues.length > 0 && (
        <div className="globe-issues" role="status">
          {issues.map((msg) => (
            <p key={msg}>{msg}</p>
          ))}
        </div>
      )}
    </>
  );
}

export default EarthGlobe;
