// The heart that saves a listing on this device (see src/utils/saved.js), and
// the hook the header badge and /saved page use. Saved state is read through
// useSyncExternalStore with an empty server snapshot, so prerendered HTML and
// the first client render agree; the real state fills in right after.
import { useState, useSyncExternalStore } from "react";
import { getSavedIds, getServerSavedIds, subscribeSaved, toggleSaved } from "./utils/saved.js";

export function useSavedIds() {
  return useSyncExternalStore(subscribeSaved, getSavedIds, getServerSavedIds);
}

export function SavedButton({ id, name, className = "", withText = false }) {
  const ids = useSavedIds();
  const [notStored, setNotStored] = useState(false);
  const saved = ids.includes(String(id));
  // One label; aria-pressed says whether it's saved.
  const label = `Save ${name || "this listing"}`;
  return (
    <button
      type="button"
      className={"save-btn" + (saved ? " saved" : "") + (className ? " " + className : "")}
      aria-pressed={saved}
      aria-label={label}
      title={notStored ? "Saved for this visit only: this browser isn't letting the site store data." : saved ? "Saved on this device" : label}
      onClick={() => setNotStored(!toggleSaved(id))}
    >
      <span aria-hidden="true">{saved ? "♥" : "♡"}</span>
      {withText && <span className="save-btn-text" aria-hidden="true">{saved ? "Saved" : "Save"}</span>}
    </button>
  );
}
