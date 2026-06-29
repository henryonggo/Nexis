"use client";

import { MapContainer, TileLayer, Circle, CircleMarker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

function ClickPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/**
 * Click-to-pin map for the geofence form (P1-5). Clicking sets lat/lng on the
 * parent; the circle previews the radius. Uses OpenStreetMap tiles (no API key)
 * and a CircleMarker pin to avoid Leaflet's bundler icon-asset issues.
 */
export default function GeofenceMap({
  lat,
  lng,
  radius,
  onPick,
}: {
  lat: number | null;
  lng: number | null;
  radius: number;
  onPick: (lat: number, lng: number) => void;
}) {
  const hasPin = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  // Default view: central Jakarta (Monas) until the admin drops a pin.
  const center: [number, number] = hasPin ? [lat, lng] : [-6.1754, 106.8272];
  const blue = { color: "var(--brand)", fillColor: "var(--brand)" };

  return (
    <div className="overflow-hidden rounded-md border border-border" style={{ height: 240 }}>
      <MapContainer
        center={center}
        zoom={hasPin ? 16 : 12}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickPicker onPick={onPick} />
        {hasPin && (
          <>
            <CircleMarker center={[lat, lng]} radius={6} pathOptions={{ ...blue, fillOpacity: 1 }} />
            <Circle center={[lat, lng]} radius={radius} pathOptions={{ ...blue, fillOpacity: 0.12 }} />
          </>
        )}
      </MapContainer>
    </div>
  );
}
