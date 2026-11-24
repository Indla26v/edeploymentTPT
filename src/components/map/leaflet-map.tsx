"use client";

import "leaflet/dist/leaflet.css";

import * as React from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";

export type MapPoint = { id: string; lat: number; lng: number; label: string; color?: "primary" | "success" | "warning" | "danger" | "neutral"; sub?: string };

const COLORS = { primary: "#2b4fc2", success: "#1f9d61", warning: "#d99a1a", danger: "#d9412f", neutral: "#64748b" };
const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  React.useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) map.setView([points[0]!.lat, points[0]!.lng], 15);
    else map.fitBounds(points.map((p) => [p.lat, p.lng] as [number, number]), { padding: [30, 30] });
  }, [map, points]);
  return null;
}

function ClickPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))) });
  return null;
}

/** Leaflet map (client-only). Points render as coloured circles; pass onPick to select a location by clicking. */
export default function LeafletMap({
  points,
  onPick,
  onSelect,
  center = [16.5062, 80.648],
  className = "h-80",
}: {
  points: MapPoint[];
  onPick?: (lat: number, lng: number) => void;
  onSelect?: (id: string) => void;
  center?: [number, number];
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-border/70 ${className}`}>
      <MapContainer center={center} zoom={13} scrollWheelZoom className="h-full w-full" attributionControl>
        <TileLayer url={TILE_URL} attribution="&copy; OpenStreetMap contributors" />
        <FitBounds points={points} />
        {onPick && <ClickPicker onPick={onPick} />}
        {points.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={8}
            pathOptions={{ color: "#fff", weight: 2, fillColor: COLORS[p.color ?? "primary"], fillOpacity: 0.95 }}
            eventHandlers={onSelect ? { click: () => onSelect(p.id) } : undefined}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              <span className="font-medium">{p.label}</span>
              {p.sub && <span className="block text-xs">{p.sub}</span>}
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
