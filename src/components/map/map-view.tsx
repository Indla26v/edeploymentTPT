"use client";

import dynamic from "next/dynamic";
import { ExternalLink } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { MapPoint } from "./leaflet-map";

export type { MapPoint };

/** Client-only map (Leaflet touches `window`). */
export const MapView = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-80 rounded-2xl" />,
});

/** Street View needs no API key: it opens Google Maps' panorama at the coordinates. */
export function streetViewUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
}

export function StreetViewLink({ lat, lng }: { lat: number; lng: number }) {
  return (
    <a href={streetViewUrl(lat, lng)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
      Street View <ExternalLink className="size-3" />
    </a>
  );
}
