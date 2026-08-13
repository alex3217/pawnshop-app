import { useEffect, useId, useRef, useState } from "react";
import { directionsUrl, hasCoordinates, type GeoPoint } from "../utils/geoDistance";

type GoogleMap = { setCenter(point: { lat: number; lng: number }): void };
type GoogleMarker = { setMap(map: GoogleMap | null): void; setPosition(point: { lat: number; lng: number }): void; setTitle(title: string): void };
type GoogleMapsApi = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
  Marker: new (options: Record<string, unknown>) => GoogleMarker;
};

declare global {
  interface Window { google?: { maps?: GoogleMapsApi }; }
}

let mapsPromise: Promise<GoogleMapsApi> | null = null;

function loadGoogleMaps(apiKey: string): Promise<GoogleMapsApi> {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (mapsPromise) return mapsPromise;

  const pending = new Promise<GoogleMapsApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-pawnloop-google-maps]');
    const script = existing || document.createElement("script");
    const finish = () => window.google?.maps ? resolve(window.google.maps) : reject(new Error("Google Maps did not initialize."));
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Google Maps could not load.")), { once: true });
    if (!existing) {
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
      script.async = true;
      script.defer = true;
      script.dataset.pawnloopGoogleMaps = "true";
      document.head.append(script);
    }
  }).catch((error) => { mapsPromise = null; throw error; });
  mapsPromise = pending;
  return pending;
}

export default function ShopMap({ point, shopName, address }: { point: GeoPoint; shopName: string; address: string }) {
  const labelId = useId();
  const elementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markerRef = useRef<GoogleMarker | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const apiKey = String(import.meta.env.VITE_GOOGLE_MAPS_BROWSER_API_KEY || "").trim();
  const validPoint = hasCoordinates(point);
  const directionsHref = directionsUrl(point);

  useEffect(() => {
    let cancelled = false;
    if (!apiKey || !validPoint || !elementRef.current) { setStatus("fallback"); return; }
    setStatus("loading");
    void loadGoogleMaps(apiKey).then((maps) => {
      if (cancelled || !elementRef.current) return;
      const position = { lat: Number(point.latitude), lng: Number(point.longitude) };
      if (!mapRef.current) mapRef.current = new maps.Map(elementRef.current, { center: position, zoom: 15, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
      else mapRef.current.setCenter(position);
      if (!markerRef.current) markerRef.current = new maps.Marker({ map: mapRef.current, position, title: shopName, label: { text: shopName.slice(0, 1).toUpperCase(), color: "#ffffff" } });
      else { markerRef.current.setMap(mapRef.current); markerRef.current.setPosition(position); markerRef.current.setTitle(shopName); }
      setStatus("ready");
    }).catch(() => { if (!cancelled) setStatus("fallback"); });
    return () => { cancelled = true; };
  }, [apiKey, validPoint, point.latitude, point.longitude, shopName]);

  return (
    <section className="item-detail-map-card" aria-labelledby={labelId} data-map-status={status}>
      <div ref={elementRef} className="item-detail-map-canvas" aria-hidden={status !== "ready"} />
      {status !== "ready" ? (
        <div className="item-detail-map-fallback" role="status">
          <strong id={labelId}>{status === "loading" ? "Loading shop map…" : "Shop map unavailable"}</strong>
          <span>{address}</span>
          {directionsHref ? <a href={directionsHref} target="_blank" rel="noreferrer">Open in Google Maps</a> : <span>Ask the shop for directions before visiting.</span>}
        </div>
      ) : <span id={labelId} className="sr-only">Interactive map showing {shopName} at {address}</span>}
    </section>
  );
}
