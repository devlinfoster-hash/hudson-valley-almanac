// /trip: the trip planner (device-only; src/utils/trips.js).
//
// - Your current trip: editable name, numbered stops (the shared ResultItem
//   card) with Move up / Move down / Remove, a numbered map preview, whole-trip
//   and per-stop directions, Share and Print.
// - Trip manager: switch, new, delete (with confirmation).
// - /trip?ids=12,408&name=...: someone else's shared trip, read-only, with
//   "Save to my trips".
//
// Prerender-safe and hydration-safe: trips come from useTrips (empty server
// snapshot), and the query string, localStorage, navigator and the map are
// only read after mount, so the prerendered shell and the first client render
// match. Ids that are no longer listed are skipped, counted, and only removed
// when the person asks.
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Head } from "vite-react-ssg";
import { SITE_ORIGIN } from "./catalog.js";
import { ResultItem, useMapData } from "./map/ResultItem.jsx";
import { useTrips } from "./TripButton.jsx";
import { NOT_AVAILABLE, displayValue, mapPlacement, percentileBounds, telHref, websiteHref } from "./utils/map-listings.js";
import { storageWorks } from "./utils/saved.js";
import {
  MAX_STOPS, MAX_TRIPS, createTrip, currentTrip, deleteTrip, importTrip, moveStop, normId, removeStop, removeStops,
  renameTrip, resolveStops, setCurrentTrip, updateTrips,
} from "./utils/trips.js";
import { parseSharedTrip, prefersAppleMaps, shareTripUrl, stopDestination, stopDirections, tripDirections } from "./utils/trip-links.js";
import "./map/map.css";

const MapView = lazy(() => import("./map/MapView.jsx"));
const TITLE = "Trip planner — Hudson Valley Almanac";

function localStorageOrNull() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Phone, website and address lines for a stop; blanks say so.
function StopDetails({ listing, destination, apple, readOnly, onMove, canUp, canDown }) {
  const phone = displayValue(listing.phone);
  const tel = telHref(listing.phone);
  const site = displayValue(listing.website);
  const siteHref = websiteHref(listing.website);
  const directions = stopDirections(destination, { apple });
  return (
    <div className="trip-stop-details">
      {destination.approximate && <span className="trip-approx">approximate location</span>}
      <dl className="trip-stop-fields">
        <dt>Address</dt>
        <dd className={listing.address ? "" : "mp-na"}>{displayValue(listing.address)}</dd>
        <dt>Phone</dt>
        <dd className={phone === NOT_AVAILABLE ? "mp-na" : ""}>{tel ? <a href={tel}>{phone}</a> : phone}</dd>
        <dt>Website</dt>
        <dd className={site === NOT_AVAILABLE ? "mp-na" : ""}>
          {siteHref ? <a href={siteHref} target="_blank" rel="noopener noreferrer">{site}</a> : site}
        </dd>
      </dl>
      <div className="trip-stop-buttons">
        {!readOnly && (
          <>
            <button type="button" className="trip-small-btn" onClick={() => onMove(-1)} disabled={!canUp} aria-label={`Move ${listing.name || "this stop"} up`}>↑ Move up</button>
            <button type="button" className="trip-small-btn" onClick={() => onMove(+1)} disabled={!canDown} aria-label={`Move ${listing.name || "this stop"} down`}>↓ Move down</button>
          </>
        )}
        {directions && (
          <a className="trip-small-btn" href={directions} target="_blank" rel="noopener noreferrer">Directions to this stop</a>
        )}
      </div>
    </div>
  );
}

function TripName({ trip }) {
  const [draft, setDraft] = useState(trip.name);
  const [error, setError] = useState("");
  useEffect(() => { setDraft(trip.name); setError(""); }, [trip.id, trip.name]);
  function commit() {
    if (draft === trip.name) return;
    const r = updateTrips((s) => renameTrip(s, trip.id, draft));
    if (!r.ok) {
      setError(r.error);
      setDraft(trip.name);
    } else setError("");
  }
  return (
    <div className="trip-name-row">
      <label className="mp-sr" htmlFor="trip-name">Trip name</label>
      <input
        id="trip-name"
        className="trip-name-input"
        value={draft}
        maxLength={100}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setDraft(trip.name); } }}
      />
      {error && <p className="trip-error" role="alert">{error}</p>}
    </div>
  );
}

export default function TripPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { state, persisted } = useTrips();
  const data = useMapData();
  const [mounted, setMounted] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const [apple, setApple] = useState(false);
  const [notice, setNotice] = useState("");
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    setMounted(true);
    setStorageOk(storageWorks(localStorageOrNull()));
    setApple(prefersAppleMaps({ userAgent: navigator.userAgent, platform: navigator.platform }));
  }, []);

  // The query string is only read after mount (the prerender has none).
  const shared = useMemo(() => (mounted ? parseSharedTrip(searchParams) : null), [mounted, searchParams]);
  const own = currentTrip(state);
  const readOnly = !!shared;
  const view = shared ? { id: "shared", name: shared.name || "Shared trip", stops: shared.ids } : own;

  const { found, missing } = useMemo(() => resolveStops(view?.stops || [], data.listings), [view?.stops, data.listings]);
  const rows = useMemo(
    () => found.map((listing, i) => ({ listing, placement: mapPlacement(listing), distance: null, number: i + 1 })),
    [found]
  );
  const destinations = useMemo(() => found.map(stopDestination), [found]);
  const legs = useMemo(() => tripDirections(destinations, { apple }), [destinations, apple]);
  const onMap = rows.filter((r) => r.placement.kind !== "none");
  const mapBounds = useMemo(() => percentileBounds(onMap.map((r) => r.listing), [0, 1]), [onMap]);
  const ready = mounted && data.status === "ready";
  const savedOnDevice = storageOk && persisted;

  function act(op, doneMsg = "") {
    const r = updateTrips(op);
    setNotice(!r.ok ? r.error : r.persisted ? doneMsg : "Changes last only for this visit: this browser isn't letting the site store data.");
    return r;
  }

  function move(listing, dir) {
    // Swap with the neighbouring *listed* stop, so stale ids never block a move.
    const stops = own.stops;
    const idx = stops.indexOf(normId(listing.id));
    const visible = found.map((l) => stops.indexOf(normId(l.id)));
    const pos = visible.indexOf(idx);
    const target = visible[pos + dir];
    if (target === undefined) return;
    act((s) => moveStop(s, own.id, idx, target - idx));
  }

  function newTrip() {
    const r = act((s) => createTrip(s, "New trip"));
    if (r.ok) setTimeout(() => document.getElementById("trip-name")?.select(), 0);
  }

  function removeTrip() {
    if (!own) return;
    const n = own.stops.length;
    if (!window.confirm(`Delete “${own.name}”${n ? ` and its ${n} ${n === 1 ? "stop" : "stops"}` : ""} from this device? This can't be undone.`)) return;
    act((s) => deleteTrip(s, own.id), "Trip deleted.");
  }

  async function share() {
    const url = shareTripUrl(window.location.origin, found.map((l) => l.id), own?.name);
    setShareUrl("");
    if (navigator.share) {
      try {
        await navigator.share({ title: own?.name || "Trip", url });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Link copied. Paste it anywhere to share this trip.");
    } catch {
      setShareUrl(url);
      setNotice("Copy this link to share the trip:");
    }
  }

  function saveShared() {
    const r = act((s) => importTrip(s, shared), "Saved to your trips.");
    if (r.ok) navigate("/trip", { replace: true });
  }

  let content;
  if (!ready) {
    content = <p className="saved-note">{data.status === "error" && mounted ? "Listings couldn't be loaded. Please try again later." : "Loading your trip…"}</p>;
  } else if (!view) {
    content = (
      <p className="saved-note">
        No trip yet. Tap <strong>+ Add to trip</strong> on the <Link to="/map">map</Link>, in its results list or on any listing to start one.
      </p>
    );
  } else {
    content = (
      <>
        <p className="trip-reminder">Hours and details change - call or check ahead before you go.</p>

        {found.length > 0 && (
          <div className="trip-actions">
            {legs.map((leg) => (
              <a key={leg.url} className="trip-btn-primary" href={leg.url} target="_blank" rel="noopener noreferrer">
                Get directions{legs.length > 1 ? ` — ${leg.label}` : ""}
              </a>
            ))}
            {!readOnly && <button type="button" className="trip-btn-secondary" onClick={share}>Share trip</button>}
            <button type="button" className="trip-btn-secondary" onClick={() => window.print()}>Print</button>
          </div>
        )}
        {legs.length > 1 && (
          <p className="trip-hint">Map apps take up to 10 stops per route, so this trip opens in {legs.length} parts; each part starts where the last one ended.</p>
        )}
        {shareUrl && <input className="trip-share-url" readOnly value={shareUrl} onFocus={(e) => e.target.select()} aria-label="Trip link" />}

        {onMap.length > 0 && (
          <div className="trip-map" aria-label="Map of the trip's stops">
            <Suspense fallback={<div className="mp-map-loading">Loading map…</div>}>
              <MapView
                rows={rows}
                viewTarget={{ type: "results" }}
                viewKey={`trip|${rows.map((r) => r.listing.id).join(",")}`}
                initialBounds={mapBounds}
                numbered
                onSelect={() => {}}
                onNavigate={(path) => navigate(path)}
              />
            </Suspense>
          </div>
        )}

        {found.length === 0 && missing.length === 0 && (
          <p className="saved-note">
            This trip has no stops yet. Tap <strong>+ Add to trip</strong> on the <Link to="/map">map</Link> or any listing.
          </p>
        )}

        <ul className="mp-results saved-results trip-stops">
          {rows.map((row, i) => (
            <ResultItem
              key={row.listing.id}
              row={row}
              number={row.number}
              showTripButton={false}
              readOnly={readOnly}
              onRemove={readOnly ? undefined : (r) => act((s) => removeStop(s, r.listing.id, { tripId: own.id }))}
            >
              <StopDetails
                listing={row.listing}
                destination={destinations[i]}
                apple={apple}
                readOnly={readOnly}
                canUp={i > 0}
                canDown={i < rows.length - 1}
                onMove={(dir) => move(row.listing, dir)}
              />
            </ResultItem>
          ))}
        </ul>

        {missing.length > 0 && (
          <p className="saved-note saved-hidden">
            {missing.length === 1 ? "1 stop is" : `${missing.length} stops are`} no longer listed.{" "}
            {!readOnly && (
              <button type="button" className="mp-remove" onClick={() => act((s) => removeStops(s, missing, { tripId: own.id }))}>
                Remove {missing.length === 1 ? "it" : "them"}
              </button>
            )}
          </p>
        )}
      </>
    );
  }

  return (
    <div className="saved-page-wrap">
      <div className="saved-page trip-page">
        <Head>
          <title>{TITLE}</title>
          <meta name="robots" content="noindex" />
          <meta name="description" content="Plan a day out from the Hudson Valley Almanac: stops kept on this device." />
          <meta property="og:title" content={TITLE} />
          <meta property="og:url" content={`${SITE_ORIGIN}/trip`} />
        </Head>

        {readOnly ? (
          <div className="trip-shared-banner" role="note">
            <span className="trip-shared-label">Shared trip</span>
            <h1 className="saved-title">{view.name}</h1>
            <p className="saved-sub">Someone shared these stops with you. Nothing here is saved until you choose to.</p>
            <div className="trip-actions">
              <button type="button" className="trip-btn-primary" onClick={saveShared}>Save to my trips</button>
              <Link className="trip-btn-secondary" to="/trip">My trips</Link>
            </div>
          </div>
        ) : (
          <>
            <h1 className="saved-title">Trip planner</h1>
            {mounted && own && <TripName trip={own} />}
            <p className="saved-sub">
              Kept on this device only. No account needed.
              {mounted && own && ` ${own.stops.length} of ${MAX_STOPS} stops.`}
            </p>
            {mounted && state.trips.length > 0 && (
              <div className="trip-manager">
                <label className="trip-manager-label" htmlFor="trip-switch">Trip</label>
                <select id="trip-switch" className="mp-select" value={state.current || ""} onChange={(e) => act((s) => setCurrentTrip(s, e.target.value))}>
                  {state.trips.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.stops.length})</option>)}
                </select>
                <button type="button" className="trip-btn-secondary" onClick={newTrip} disabled={state.trips.length >= MAX_TRIPS}>New trip</button>
                <button type="button" className="trip-btn-secondary trip-btn-danger" onClick={removeTrip}>Delete trip</button>
              </div>
            )}
          </>
        )}

        {mounted && !savedOnDevice && (
          <p className="saved-note" role="note">
            This browser isn't letting the site store data (private browsing or blocked site data), so trips only last until you leave the page.
          </p>
        )}
        {notice && <p className="trip-notice" role="status">{notice}</p>}

        {content}
      </div>
    </div>
  );
}
