// Only the browser-restricted public key is used here. Never use the server key.
type Position = { lat: number; lng: number };
type Listener = { remove(): void };
type Bounds = { extend(position: Position): void };
export type GoogleMap = {
  panTo(position: Position): void;
  setCenter(position: Position): void;
  setZoom(zoom: number): void;
  fitBounds(bounds: Bounds, padding: number): void;
};
export type GoogleMarker = {
  map: GoogleMap | null;
  zIndex: number;
  addListener(event: string, callback: () => void): Listener;
};
export type GoogleMaps = {
  LatLngBounds: new () => Bounds;
  Map: new (
    element: HTMLElement,
    options: Record<string, unknown>,
  ) => GoogleMap;
  Geocoder: new () => {
    geocode(request: { placeId: string } | { address: string }): Promise<{
      results: { geometry: { location: { toJSON(): Position } } }[];
    }>;
  };
  marker: {
    AdvancedMarkerElement: new (
      options: Record<string, unknown>,
    ) => GoogleMarker;
  };
};
let loading: Promise<GoogleMaps> | undefined;
const errorListeners = new Set<(message: string) => void>();
export function onGoogleMapsError(listener: (message: string) => void) {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}
export function loadGoogleMaps(key: string): Promise<GoogleMaps> {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const host = window as typeof window & {
      google?: { maps: GoogleMaps };
      sidewalkMapReady?: () => void;
      gm_authFailure?: () => void;
    };
    if (host.google?.maps.marker) return resolve(host.google.maps);
    const script = document.createElement("script");
    const timer = setTimeout(
      () => fail("Google Maps timed out. Check your connection and reload."),
      20000,
    );
    function fail(message: string) {
      clearTimeout(timer);
      script.remove();
      loading = undefined;
      errorListeners.forEach((listener) => listener(message));
      reject(new Error(message));
    }
    host.sidewalkMapReady = () => {
      clearTimeout(timer);
      if (host.google?.maps.marker) resolve(host.google.maps);
      else fail("Google Maps could not initialize. Check your browser key.");
    };
    host.gm_authFailure = () =>
      fail(
        "Google Maps rejected the browser key. Check its API and website restrictions, then reload.",
      );
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key, v: "weekly", loading: "async", libraries: "marker", callback: "sidewalkMapReady" })}`;
    script.async = true;
    script.onerror = () =>
      fail("Google Maps could not load. Check your connection and reload.");
    document.head.append(script);
  });
  return loading;
}
