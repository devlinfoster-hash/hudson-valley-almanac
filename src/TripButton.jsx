// "Add to trip" (src/utils/trips.js): sits beside the save heart on map result
// rows and listing pages (the map popup has a DOM twin in MapView.jsx). Adds
// to the current trip, creating "My trip" if there is none; with several trips
// it first asks which one. Once added it reads "In your trip", and tapping it
// removes the stop again.
//
// Trips are read through useSyncExternalStore with an empty server snapshot, so
// the prerender and the first client render agree; real trips fill in after.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  addStop, currentTrip, getServerTripsSnapshot, getTripsSnapshot, normId, removeStop, subscribeTrips, updateTrips,
} from "./utils/trips.js";

export function useTrips() {
  return useSyncExternalStore(subscribeTrips, getTripsSnapshot, getServerTripsSnapshot);
}

export function TripButton({ id, name, className = "" }) {
  const { state } = useTrips();
  const [picking, setPicking] = useState(false);
  const [message, setMessage] = useState("");
  const wrap = useRef(null);
  const key = normId(id);
  const trip = currentTrip(state);
  const inTrip = !!trip && trip.stops.includes(key);
  const label = name || "this listing";

  // Close the picker on outside tap or Escape.
  useEffect(() => {
    if (!picking) return;
    const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setPicking(false); };
    const onKey = (e) => { if (e.key === "Escape") setPicking(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [picking]);

  function report(result, done) {
    if (!result.ok) setMessage(result.error);
    else if (!result.persisted) setMessage(`${done} for this visit only: this browser isn't letting the site store data.`);
    else setMessage("");
  }

  function add(tripId) {
    setPicking(false);
    report(updateTrips((s) => addStop(s, key, tripId ? { tripId } : {})), "Added");
  }

  function onClick() {
    if (inTrip) return report(updateTrips((s) => removeStop(s, key)), "Removed");
    if (state.trips.length > 1) return setPicking((p) => !p);
    add();
  }

  return (
    <span className={"trip-btn-wrap" + (className ? " " + className : "")} ref={wrap}>
      <button
        type="button"
        className={"trip-btn" + (inTrip ? " in-trip" : "")}
        aria-pressed={inTrip}
        aria-expanded={state.trips.length > 1 && !inTrip ? picking : undefined}
        aria-label={inTrip ? `${label} is in your trip “${trip.name}”. Remove it` : `Add ${label} to a trip`}
        onClick={onClick}
      >
        {inTrip ? "✓ In your trip" : "+ Add to trip"}
      </button>
      {picking && (
        <span className="trip-picker" role="menu" aria-label="Add to which trip?">
          <span className="trip-picker-title">Add to which trip?</span>
          {[...state.trips].sort((a, b) => (a.id === state.current ? -1 : b.id === state.current ? 1 : 0)).map((t) => (
            <button key={t.id} type="button" role="menuitem" className="trip-picker-item" onClick={() => add(t.id)}>
              {t.name} <span className="trip-picker-count">{t.stops.length}</span>
            </button>
          ))}
        </span>
      )}
      {message && <span className="trip-btn-msg" role="status">{message}</span>}
    </span>
  );
}
