"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Row } from "../lib/dashboard";
import {
  areaBusinesses,
  DEFAULT_AREA,
  DEFAULT_CENTER,
  samplePosition,
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
  runs,
  area,
  onAreaChange,
  demo,
  selectedId,
  onSelect,
  onNewRun,
  children,
}: {
  businesses: Row[];
  runs: Row[];
  area: string;
  onAreaChange: (area: string) => void;
  demo: boolean;
  selectedId?: string;
  onSelect: (business: Row) => void;
  onNewRun: () => void;
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
  const areas = [
    ...new Set([DEFAULT_AREA, ...runs.map((r) => r.params.area), area]),
  ];
  const scoped = useMemo(
    () => areaBusinesses(businesses, runs, area),
    [businesses, runs, area],
  );
  const visible = scoped.filter(
    (b) => status === "ALL" || websiteStatus(b) === status,
  );
  // Polling must update results without re-geocoding or rebuilding every marker.
  const signature = JSON.stringify(
    visible.map((b) => [
      b.id,
      b.place_id,
      b.name,
      websiteStatus(b),
      demo ? samplePosition(b) : null,
    ]),
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
    setError("");
    const center =
      area === DEFAULT_AREA
        ? Promise.resolve(DEFAULT_CENTER)
        : new google.Geocoder()
            .geocode({ address: area })
            .then((r) => r.results[0]?.geometry.location.toJSON());
    void center
      .then((position) => {
        if (!disposed && position && !markers.current.length) {
          map.current?.setCenter(position);
          map.current?.setZoom(15);
        }
      })
      .catch(() => {
        if (!disposed)
          setError("This neighborhood could not be located. Try another area.");
      });
    return () => {
      disposed = true;
    };
  }, [google, area]);

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
        let position = demo ? samplePosition(business) : null;
        if (!demo && business.place_id) {
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
  }, [google, signature, demo]);

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
      <div className="map-toolbar">
        <div>
          <h2>Explore businesses</h2>
          <p>
            {demo
              ? "Sample businesses · illustrative locations"
              : "Discovered businesses · latest website audits"}
          </p>
        </div>
        <label className="map-area">
          <span className="sr-only">Map neighborhood</span>
          <select value={area} onChange={(e) => onAreaChange(e.target.value)}>
            {areas.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <button className="secondary" onClick={onNewRun}>
          Search this area ↗
        </button>
      </div>
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
            aria-label={`Google map of ${area}`}
          />
          {!browserKey && demo && (
            <SampleMap
              businesses={visible}
              selectedId={selectedId}
              onSelect={onSelect}
              area={area}
            />
          )}
          {(!browserKey || error) && (
            <div className="map-connection" role="status">
              <b>
                {error
                  ? "Map unavailable"
                  : demo
                    ? "Sample map"
                    : "Connect Google Maps"}
              </b>
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
                : "No businesses in this area yet. Search this area to start a run."}
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
            <span>
              {demo
                ? "Demo · not live research"
                : "Select a business to inspect"}
            </span>
          </div>
        </div>
        {children || (
          <div className="map-inspector-empty">
            <span aria-hidden="true">⌖</span>
            <h3>Select a business</h3>
            <p>
              Click a marker to see its website audit, contact details, and
              progress.
            </p>
            <div
              className="map-business-list"
              aria-label="Businesses in map area"
            >
              {visible.map((b) => (
                <button key={b.id} onClick={() => onSelect(b)}>
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
                  <span aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function SampleMap({
  businesses,
  selectedId,
  onSelect,
  area,
}: {
  businesses: Row[];
  selectedId?: string;
  onSelect: (b: Row) => void;
  area: string;
}) {
  const offset =
    area === "Greenpoint, Brooklyn"
      ? { lat: 0.015, lng: 0.004 }
      : { lat: 0, lng: 0 };
  return (
    <div
      className="sample-map"
      aria-label={`Illustrative sample map of ${area}`}
    >
      <svg
        viewBox="0 0 1000 600"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id="blocks"
            width="110"
            height="85"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-28 500 300)"
          >
            <rect width="110" height="85" fill="#f8f7f3" />
            <rect
              x="9"
              y="9"
              width="92"
              height="67"
              rx="3"
              fill="#eae9e3"
              stroke="#e0dfd7"
            />
          </pattern>
        </defs>
        <rect width="1000" height="600" fill="url(#blocks)" />
        <path d="M0 0H210L185 150 120 310 70 440 0 510Z" fill="#cfdee1" />
        <path
          d="M240 0 220 140 150 330 90 470"
          fill="none"
          stroke="#faf9f6"
          strokeWidth="20"
        />
        <path d="m695 0 120 135-140 86-117-135Z" fill="#dce4cf" />
        <g
          fill="#8b8e89"
          fontSize="13"
          fontFamily="Arial"
          transform="rotate(-28 500 300)"
        >
          <text x="170" y="180">
            WYTHE AVENUE
          </text>
          <text x="410" y="350">
            BEDFORD AVENUE
          </text>
          <text x="650" y="520">
            DRIGGS AVENUE
          </text>
          <text x="650" y="90">
            McCarren Park
          </text>
        </g>
        <text
          x="30"
          y="250"
          fill="#8ca5ac"
          fontSize="13"
          transform="rotate(-70 30 250)"
        >
          EAST RIVER
        </text>
        <text x="380" y="440" fill="#9c9b94" fontSize="20" letterSpacing="5">
          {area.split(",")[0].toUpperCase()}
        </text>
      </svg>
      {businesses.map((b) => {
        const p = samplePosition(b);
        if (!p) return null;
        const state = websiteStatuses[websiteStatus(b)];
        return (
          <button
            key={b.id}
            className={`sample-marker${selectedId === b.id ? " is-selected" : ""}`}
            style={
              {
                left: `${25 + ((p.lng - offset.lng + 73.966) / 0.022) * 60}%`,
                top: `${16 + ((40.727 - (p.lat - offset.lat)) / 0.023) * 61}%`,
                "--pin-color": state.color,
              } as React.CSSProperties
            }
            aria-label={`${b.name} · ${state.label}`}
            aria-pressed={selectedId === b.id}
            onClick={() => onSelect(b)}
          >
            <i />
            <span>{b.name}</span>
          </button>
        );
      })}
    </div>
  );
}
