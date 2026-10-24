"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Row } from "../lib/dashboard";
import {
  DEFAULT_AREA,
  DEFAULT_CENTER,
  websiteStatus,
  websiteStatuses,
  type WebsiteStatus,
} from "../lib/map";
import {
  loadGoogleMaps,
  onGoogleMapsError,
  type GoogleMap,
  type GoogleMaps,
  type GoogleMarker,
} from "../lib/google-maps";

const browserKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export function BusinessMap({
  businesses,
  selectedId,
  onSelect,
  children,
}: {
  businesses: Row[];
  selectedId?: string;
  onSelect: (business: Row) => void;
  children: ReactNode;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<GoogleMap | null>(null);
  const [google, setGoogle] = useState<GoogleMaps | null>(null);
  const [error, setError] = useState("");
  const [unlocated, setUnlocated] = useState(0);
  const [locating, setLocating] = useState(false);
  const [status, setStatus] = useState<WebsiteStatus | "ALL">("ALL");
  const select = useRef(onSelect);
  select.current = onSelect;
  const cache = useRef(
    new Map<string, Promise<{ lat: number; lng: number } | null>>(),
  );
  const markers = useRef<
    {
      marker: GoogleMarker;
      business: Row;
      position: { lat: number; lng: number };
      pin: HTMLElement;
    }[]
  >([]);
  const scoped = businesses;
  const visible = scoped.filter(
    (b) => status === "ALL" || websiteStatus(b) === status,
  );
  // Polling must update results without re-geocoding or rebuilding every marker.
  const signature = JSON.stringify(
    visible.map((b) => [b.id, b.place_id, b.name, websiteStatus(b)]),
  );
  const rows = useRef(visible);
  rows.current = visible;

  useEffect(() => {
    if (!browserKey || !element.current) return;
    let disposed = false;
    const unsubscribe = onGoogleMapsError(setError);
    void loadGoogleMaps(browserKey)
      .then((api) => {
        if (disposed || !element.current) return;
        map.current = new api.Map(element.current, {
          center: DEFAULT_CENTER,
          zoom: 15,
          mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
          gestureHandling: "cooperative",
        });
        setGoogle(api);
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
      unsubscribe();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!google || !map.current) return;
    let disposed = false;
    const listeners: { remove(): void }[] = [];
    markers.current.forEach(({ marker }) => {
      marker.map = null;
    });
    markers.current = [];
    setUnlocated(0);
    setLocating(true);
    const pending = [...rows.current];
    const mapsApi = google;
    const geocoder = new mapsApi.Geocoder();
    async function worker() {
      while (pending.length && !disposed) {
        const business = pending.shift()!;
        let position: { lat: number; lng: number } | null = null;
        if (business.place_id) {
          const id = business.place_id as string;
          if (!cache.current.has(id))
            cache.current.set(
              id,
              geocoder
                .geocode({ placeId: id })
                .then((r) => r.results[0]?.geometry.location.toJSON() ?? null)
                .catch(() => {
                  cache.current.delete(id);
                  return null;
                }),
            );
          position = await cache.current.get(id)!;
        }
        if (disposed) return;
        if (!position) {
          setUnlocated((n) => n + 1);
          continue;
        }
        const state = websiteStatuses[websiteStatus(business)];
        const pin = document.createElement("div");
        pin.className = "map-pin";
        pin.style.setProperty("--pin-color", state.color);
        pin.textContent = websiteStatus(business) === "NEEDS_REVIEW" ? "?" : "";
        const marker = new mapsApi.marker.AdvancedMarkerElement({
          map: map.current,
          position,
          content: pin,
          title: `${business.name} · ${state.label}`,
          gmpClickable: true,
        });
        listeners.push(
          marker.addListener("click", () => {
            const latest = rows.current.find((b) => b.id === business.id);
            if (latest) select.current(latest);
          }),
        );
        markers.current.push({ marker, business, position, pin });
      }
    }
    void Promise.all(Array.from({ length: 4 }, worker))
      .catch(() => {
        if (!disposed)
          setError(
            "Map markers could not be loaded. Check your Google Maps configuration and reload.",
          );
      })
      .finally(() => {
        if (!disposed) {
          const located = markers.current;
          if (located.length === 1) {
            map.current?.setCenter(located[0].position);
            map.current?.setZoom(16);
          } else if (located.length > 1) {
            const bounds = new mapsApi.LatLngBounds();
            located.forEach(({ position }) => bounds.extend(position));
            map.current?.fitBounds(bounds, 48);
          }
          setLocating(false);
        }
      });
    return () => {
      disposed = true;
      listeners.forEach((listener) => listener.remove());
      markers.current.forEach(({ marker }) => {
        marker.map = null;
      });
      markers.current = [];
    };
  }, [google, signature]);

  useEffect(() => {
    markers.current.forEach(({ marker, business, position, pin }) => {
      const selected = business.id === selectedId;
      pin.classList.toggle("is-selected", selected);
      marker.zIndex = selected ? 100 : 1;
      if (selected) map.current?.panTo(position);
    });
  }, [selectedId, signature, locating]);

  return (
    <section className="map-workspace" aria-label="Business discovery map">
      <div className="map-legend" aria-label="Filter map by website status">
        <button
          aria-pressed={status === "ALL"}
          onClick={() => setStatus("ALL")}
        >
          All <b>{scoped.length}</b>
        </button>
        {(
          Object.entries(websiteStatuses) as [
            WebsiteStatus,
            (typeof websiteStatuses)[WebsiteStatus],
          ][]
        ).map(([key, value]) => (
          <button
            key={key}
            aria-pressed={status === key}
            onClick={() => setStatus(status === key ? "ALL" : key)}
          >
            <i style={{ background: value.color }} />
            {value.label}
            <b>{scoped.filter((b) => websiteStatus(b) === key).length}</b>
          </button>
        ))}
      </div>
      <div className={`map-layout${children ? " has-selection" : ""}`}>
        <div className="map-main">
          <div
            className="map-canvas"
            ref={element}
            aria-label={`Google map of ${DEFAULT_AREA}`}
          />
          {(!browserKey || error) && (
            <div className="map-connection" role="status">
              <b>{error ? "Map unavailable" : "Connect Google Maps"}</b>
              <span>
                {error ||
                  "Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to .env.local and restart to load Google Maps."}
              </span>
            </div>
          )}
          {browserKey && !google && !error && (
            <div className="map-message" role="status">
              Loading Google Maps…
            </div>
          )}
          {!visible.length && (
            <div className="map-message">
              {scoped.length
                ? "No businesses match these filters."
                : "No businesses yet. Create a Williamsburg run to begin."}
            </div>
          )}
          <div className="map-footer">
            <span>
              {visible.length} businesses
              {locating
                ? " · locating…"
                : unlocated
                  ? ` · ${unlocated} could not be located`
                  : ""}
            </span>
            <span>Select a business to inspect</span>
          </div>
        </div>
        {children || (
          <div className="map-inspector-empty">
            <div
              className="map-business-list"
              aria-label="Businesses in map area"
            >
              {visible.map((b) => (
                <a key={b.id} href={`/businesses/${b.id}`}>
                  <i
                    style={{
                      background: websiteStatuses[websiteStatus(b)].color,
                    }}
                  />
                  <span>
                    {b.name}
                    <small>
                      {b.category} · {websiteStatuses[websiteStatus(b)].label}
                    </small>
                  </span>
                  <span>Show details ↗</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
