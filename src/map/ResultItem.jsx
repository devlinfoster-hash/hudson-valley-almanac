// The listing card used by the /map results list and the /saved page, plus the
// hook both use to load the map snapshot (a hashed JSON file fetched only when
// one of those pages is open).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import mapDataUrl from "../data/listings-map.json?url";
import { SavedButton } from "../SavedButton.jsx";
import { TripButton } from "../TripButton.jsx";
import {
  APPROXIMATE_LABEL,
  NOT_ON_MAP,
  categoryStyle,
  displayValue,
  isVerified,
  townCountyLine,
} from "../utils/map-listings.js";

export function useMapData() {
  const [state, setState] = useState({ status: "loading", listings: [] });
  useEffect(() => {
    let cancelled = false;
    fetch(mapDataUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        const listings = Array.isArray(json?.listings) ? json.listings : [];
        setState({ status: "ready", listings });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", listings: [] });
      });
    return () => { cancelled = true; };
  }, []);
  return state;
}

// `onFocus(row)` shows the listing on the map beside the list (/map); without
// it, "See on map" links to /map?listing=<slug> (/saved, /trip). `onRemove`
// adds a Remove button. /trip passes `number` (the stop's place in the trip),
// `showTripButton={false}` and extra rows as `children`.
export function ResultItem({ row, selected, onFocus, onRemove, number, showTripButton = true, readOnly = false, children }) {
  const { listing, placement, distance } = row;
  const style = categoryStyle(listing.category);
  const approximate = placement.kind === "circle";
  const name = displayValue(listing.name);
  return (
    <li className={"mp-result" + (selected ? " selected" : "")}>
      <div className="mp-result-main">
        {number !== undefined && <span className="mp-result-number" aria-label={`Stop ${number}`}>{number}</span>}
        <span className="mp-result-dot" style={{ background: style.color }} aria-hidden="true">{style.icon}</span>
        <div className="mp-result-text">
          {listing.slug ? (
            <Link to={`/listing/${encodeURIComponent(listing.slug)}`} className="mp-result-name">{name}</Link>
          ) : (
            <span className="mp-result-name">{name}</span>
          )}
          {isVerified(listing) && <span className="mp-badge">Verified</span>}
          <div className="mp-result-meta">{style.label} · {townCountyLine(listing)}</div>
          <div className="mp-result-loc">
            {placement.kind === "none" ? (
              <span className="mp-not-on-map">{NOT_ON_MAP}</span>
            ) : onFocus ? (
              <button type="button" className="mp-show-on-map" onClick={() => onFocus(row)}>
                {approximate ? `Show ${APPROXIMATE_LABEL} on map` : "Show on map"}
              </button>
            ) : listing.slug ? (
              <Link className="mp-show-on-map" to={`/map?listing=${encodeURIComponent(listing.slug)}`}>See on map</Link>
            ) : null}
            {distance !== null && distance !== undefined && (
              <span className="mp-distance">{approximate ? "about " : ""}{distance < 10 ? distance.toFixed(1) : Math.round(distance)} mi</span>
            )}
            {onRemove && (
              <button type="button" className="mp-remove" onClick={() => onRemove(row)}>Remove</button>
            )}
          </div>
          {children}
        </div>
        {!readOnly && (
          <div className="mp-result-actions">
            {showTripButton && <TripButton id={listing.id} name={listing.name} className="mp-result-trip" />}
            <SavedButton id={listing.id} name={listing.name} className="mp-result-save" />
          </div>
        )}
      </div>
    </li>
  );
}
