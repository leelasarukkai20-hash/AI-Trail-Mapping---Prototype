"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Route } from "../../route-library/types/route";

interface Props {
  route: Route;
  height?: string;
}

export default function RouteMap({ route, height = "260px" }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !token) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [-122.55, 37.9],
      zoom: 10,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-left");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const draw = () => {
      const SRC = "route-line";
      const LAYER = "route-line-layer";
      if (map.getLayer(LAYER)) map.removeLayer(LAYER);
      if (map.getSource(SRC)) map.removeSource(SRC);
      map.addSource(SRC, {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: route.geometry },
      });
      map.addLayer({
        id: LAYER,
        type: "line",
        source: SRC,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#ff5722", "line-width": 4 },
      });

      const coords = route.geometry.coordinates;
      const bounds = coords.reduce(
        (b, c) => b.extend([c[0], c[1]]),
        new mapboxgl.LngLatBounds([coords[0][0], coords[0][1]], [coords[0][0], coords[0][1]])
      );
      map.fitBounds(bounds, { padding: 40, duration: 400 });

      if (markerRef.current) markerRef.current.remove();
      markerRef.current = new mapboxgl.Marker({ color: "#ff5722" })
        .setLngLat([route.properties.trailhead.lon, route.properties.trailhead.lat])
        .setPopup(new mapboxgl.Popup().setText(route.properties.trailhead.name))
        .addTo(map);
    };

    if (map.isStyleLoaded()) draw();
    else map.once("load", draw);
  }, [route]);

  if (!token) {
    return (
      <div className="map-missing" style={{ height }}>
        <p><strong>Mapbox token missing.</strong></p>
        <p>Add <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> to <code>.env</code> and restart the dev server.</p>
      </div>
    );
  }

  return <div ref={containerRef} className="route-map" style={{ height, width: "100%" }} />;
}
