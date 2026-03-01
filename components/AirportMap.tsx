"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type AirportMapProps = {
  lat: number;
  lon: number;
  icao: string;
  name: string;
  className?: string;
};

const MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="32" height="42" fill="none" role="img">
  <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 26 16 26s16-14 16-26C32 7.16 24.84 0 16 0z" fill="url(#pin-grad)" stroke="white" stroke-width="2"/>
  <circle cx="16" cy="16" r="8" fill="white" opacity="0.95"/>
  <circle cx="16" cy="16" r="4" fill="#2563eb"/>
  <defs><linearGradient id="pin-grad" x1="0" y1="0" x2="0" y2="42" gradientUnits="userSpaceOnUse">
    <stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#1d4ed8"/>
  </linearGradient></defs>
</svg>`;

export default function AirportMap({ lat, lon, icao, name, className = "" }: AirportMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const flyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const center: L.LatLngExpression = [lat, lon];
    const targetZoom = 14;

    // Start from "space" (zoom 1 = whole world) centered on the airport
    const map = L.map(containerRef.current, {
      center,
      zoom: 1,
      zoomControl: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
    });

    // High-quality CARTO Voyager tiles (clean, detailed, free)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
      minZoom: 1,
    }).addTo(map);

    const icon = L.divIcon({
      className: "airport-map-marker",
      html: `<div class="airport-marker-inner">${MARKER_SVG}</div>`,
      iconSize: [32, 42],
      iconAnchor: [16, 42],
      popupAnchor: [0, -42],
    });

    const marker = L.marker([lat, lon], { icon }).addTo(map);
    marker.bindPopup(
      `<div class="airport-map-popup"><span class="airport-map-popup-icao">${escapeHtml(icao)}</span><span class="airport-map-popup-name">${escapeHtml(name)}</span></div>`,
      {
        className: "airport-map-popup-wrapper",
        maxWidth: 320,
        minWidth: 180,
      }
    );

    // Fly from "space" (zoom 1) down to the airport — flyTo supports large zoom deltas (setView would skip animation)
    map.whenReady(() => {
      flyTimeoutRef.current = window.setTimeout(() => {
        map.flyTo(center, targetZoom, {
          duration: 2.6,
          easeLinearity: 0.25,
        });
      }, 500);
    });

    mapRef.current = map;
    return () => {
      if (flyTimeoutRef.current) window.clearTimeout(flyTimeoutRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lon, icao, name]);

  return <div ref={containerRef} className={`airport-map-container ${className}`} style={{ height: "100%", minHeight: 240 }} />;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
