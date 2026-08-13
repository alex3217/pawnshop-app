import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { GOOGLE_MAPS_BROWSER_API_KEY } from "../config";
import { directionsUrl, hasCoordinates, type GeoPoint } from "../utils/geoDistance";

type GoogleMapsListener = { remove(): void };
type GoogleMap = { setCenter(point: { lat: number; lng: number }): void };
type GoogleMarker = {
  addListener(eventName: "click", listener: () => void): GoogleMapsListener;
  setMap(map: GoogleMap | null): void;
  setPosition(point: { lat: number; lng: number }): void;
  setTitle(title: string): void;
  setLabel(label: Record<string, string>): void;
};
type GoogleMapsApi = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
  Marker: new (options: Record<string, unknown>) => GoogleMarker;
};

declare global {
  interface Window {
    google?: { maps?: GoogleMapsApi };
    gm_authFailure?: () => void;
  }
}

type MapFailure = "missing-key" | "invalid-coordinates" | "script" | "api-auth" | "initialization";

class GoogleMapsLoadError extends Error {
  readonly reason: MapFailure;

  constructor(reason: MapFailure) {
    super("Google Maps is unavailable.");
    this.name = "GoogleMapsLoadError";
    this.reason = reason;
  }
}

let mapsPromise: Promise<GoogleMapsApi> | null = null;

function loadGoogleMaps(apiKey: string): Promise<GoogleMapsApi> {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (mapsPromise) return mapsPromise;

  mapsPromise = new Promise<GoogleMapsApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-pawnloop-google-maps]");
    const script = existing || document.createElement("script");
    const previousAuthFailure = window.gm_authFailure;
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleScriptError);
      if (script.dataset.pawnloopGoogleMaps === "true") script.remove();
      if (window.gm_authFailure === handleAuthFailure) window.gm_authFailure = previousAuthFailure;
    };
    const fail = (reason: MapFailure) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new GoogleMapsLoadError(reason));
    };
    const handleLoad = () => {
      if (settled) return;
      if (!window.google?.maps) { fail("initialization"); return; }
      settled = true;
      cleanup();
      resolve(window.google.maps);
    };
    const handleScriptError = () => fail("script");
    const handleAuthFailure = () => fail("api-auth");
    const timeoutId = window.setTimeout(() => fail("script"), 15_000);

    window.gm_authFailure = handleAuthFailure;
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleScriptError, { once: true });
    if (!existing) {
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
      script.async = true;
      script.defer = true;
      script.dataset.pawnloopGoogleMaps = "true";
      document.head.append(script);
    } else if (window.google?.maps) {
      handleLoad();
    }
  }).catch((error) => {
    mapsPromise = null;
    throw error;
  });

  return mapsPromise;
}

function failureMessage(reason: MapFailure | null) {
  switch (reason) {
    case "missing-key":
      return "The interactive map is unavailable because its browser configuration is missing.";
    case "invalid-coordinates":
      return "The interactive map is unavailable because this shop does not have verified coordinates.";
    case "api-auth":
      return "Google Maps rejected the browser configuration. The API key, website referrer, or Maps JavaScript API settings may need attention.";
    case "initialization":
      return "Google Maps loaded but could not initialize the interactive map.";
    default:
      return "Google Maps could not load. You can still review the shop and get directions below.";
  }
}

type ShopMapProps = {
  point: GeoPoint;
  shopName: string;
  address: string;
  distance: string | null;
  phone: string;
  hours: string;
  shopHref: string;
  messageHref?: string;
};

function ShopInformation({ shopName, address, distance, phone, hours, shopHref, directionsHref, messageHref }: ShopMapProps & { directionsHref: string | null }) {
  return (
    <div className="item-detail-map-information" role="dialog" aria-label={`${shopName} information`}>
      <strong>{shopName}</strong>
      <dl>
        <div><dt>Address</dt><dd>{address}</dd></div>
        {distance ? <div><dt>Distance</dt><dd>{distance}</dd></div> : null}
        <div><dt>Phone</dt><dd>{phone}</dd></div>
        <div><dt>Business hours</dt><dd>{hours}</dd></div>
      </dl>
      <div className="item-detail-map-information-actions">
        <Link to={shopHref}>View shop</Link>
        {directionsHref ? <a href={directionsHref} target="_blank" rel="noreferrer">Directions</a> : null}
        {messageHref ? <Link to={messageHref}>Message shop</Link> : null}
      </div>
    </div>
  );
}

export default function ShopMap(props: ShopMapProps) {
  const { point, shopName, address } = props;
  const labelId = useId();
  const elementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markerRef = useRef<GoogleMarker | null>(null);
  const markerListenerRef = useRef<GoogleMapsListener | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const [failure, setFailure] = useState<MapFailure | null>(null);
  const [informationOpen, setInformationOpen] = useState(false);
  const apiKey = GOOGLE_MAPS_BROWSER_API_KEY;
  const validPoint = hasCoordinates(point);
  const directionsHref = directionsUrl(point, address);

  useEffect(() => {
    let cancelled = false;
    if (!apiKey || !validPoint || !elementRef.current) {
      setFailure(!apiKey ? "missing-key" : "invalid-coordinates");
      setStatus("fallback");
      return;
    }
    setStatus("loading");
    setFailure(null);
    void loadGoogleMaps(apiKey).then((maps) => {
      if (cancelled || !elementRef.current) return;
      const position = { lat: Number(point.latitude), lng: Number(point.longitude) };
      if (!mapRef.current) {
        mapRef.current = new maps.Map(elementRef.current, {
          center: position,
          zoom: 15,
          mapTypeControl: true,
          streetViewControl: true,
          fullscreenControl: true,
          zoomControl: true,
          gestureHandling: "auto",
        });
      } else mapRef.current.setCenter(position);
      if (!markerRef.current) {
        markerRef.current = new maps.Marker({
          map: mapRef.current,
          position,
          title: `${shopName}. Open shop information`,
          label: { text: shopName.slice(0, 1).toUpperCase(), color: "#ffffff" },
          clickable: true,
          optimized: false,
        });
      } else {
        markerRef.current.setMap(mapRef.current);
        markerRef.current.setPosition(position);
        markerRef.current.setTitle(`${shopName}. Open shop information`);
        markerRef.current.setLabel({ text: shopName.slice(0, 1).toUpperCase(), color: "#ffffff" });
      }
      markerListenerRef.current?.remove();
      markerListenerRef.current = markerRef.current.addListener("click", () => setInformationOpen((open) => !open));
      setStatus("ready");
    }).catch((error: unknown) => {
      if (cancelled) return;
      setFailure(error instanceof GoogleMapsLoadError ? error.reason : "initialization");
      setStatus("fallback");
    });
    return () => { cancelled = true; markerListenerRef.current?.remove(); };
  }, [apiKey, validPoint, point.latitude, point.longitude, shopName]);

  return (
    <section className="item-detail-map-card" aria-labelledby={labelId} data-map-status={status}>
      <div ref={elementRef} className="item-detail-map-canvas" aria-hidden={status !== "ready"} />
      {status === "ready" ? (
        <>
          <span id={labelId} className="sr-only">Interactive map showing {shopName} at {address}</span>
          {informationOpen ? <ShopInformation {...props} directionsHref={directionsHref} /> : null}
        </>
      ) : (
        <div className="item-detail-map-fallback">
          <strong id={labelId}>{status === "loading" ? "Loading shop map…" : "Shop map unavailable"}</strong>
          {status === "fallback" ? <p role="alert">{failureMessage(failure)}</p> : null}
          <button type="button" className="item-detail-map-fallback-marker" onClick={() => setInformationOpen((open) => !open)} aria-expanded={informationOpen}>
            <span aria-hidden="true">●</span> Shop
          </button>
          {informationOpen ? <ShopInformation {...props} directionsHref={directionsHref} /> : null}
        </div>
      )}
    </section>
  );
}
