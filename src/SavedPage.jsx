// /saved: the places saved on this device (src/utils/saved.js), as the same
// cards as the /map results list, each with "See on map" and Remove. Saved ids
// that are no longer in the map snapshot (unpublished or removed listings) are
// skipped. Nothing is stored anywhere but this browser.
//
// Prerender-safe: the saved list is read through useSavedIds, whose server
// snapshot is empty, so the build emits the page shell and the browser fills
// in the list.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Head } from "vite-react-ssg";
import { SITE_ORIGIN } from "./catalog.js";
import { ResultItem, useMapData } from "./map/ResultItem.jsx";
import { useSavedIds } from "./SavedButton.jsx";
import { mapPlacement } from "./utils/map-listings.js";
import { canSaveOnThisDevice, keepOnlySaved, removeSaved, savedListings } from "./utils/saved.js";
import "./map/map.css";

const TITLE = "Saved places — Hudson Valley Almanac";

export default function SavedPage() {
  const ids = useSavedIds();
  const data = useMapData();
  // The saved list only exists in the browser; render it after mount.
  const [mounted, setMounted] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  useEffect(() => {
    setMounted(true);
    setStorageOk(canSaveOnThisDevice());
  }, []);

  const rows = useMemo(
    () => savedListings(ids, data.listings).map((listing) => ({ listing, placement: mapPlacement(listing), distance: null })),
    [ids, data.listings]
  );

  // Saved ids that aren't in the current listings (unpublished, removed, or
  // newer than this build) are hidden, not deleted, unless the person asks.
  const hidden = data.status === "ready" ? ids.length - rows.length : 0;

  let body;
  if (!mounted || data.status === "loading") {
    body = <p className="saved-note">Loading your saved places…</p>;
  } else if (data.status === "error") {
    body = <p className="saved-note">Listings couldn't be loaded. Please try again later.</p>;
  } else if (rows.length === 0) {
    body = (
      <p className="saved-note">
        Nothing saved yet. Tap the ♡ on a listing, on the <Link to="/map">map</Link>, or in the map's results list to keep it here.
      </p>
    );
  } else {
    body = (
      <ul className="mp-results saved-results">
        {rows.map((row) => (
          <ResultItem key={row.listing.id} row={row} onRemove={(r) => removeSaved(r.listing.id)} />
        ))}
      </ul>
    );
  }

  return (
    <div className="saved-page-wrap">
      <div className="saved-page">
        <Head>
          <title>{TITLE}</title>
          <meta name="robots" content="noindex" />
          <meta name="description" content="Places you've saved from the Hudson Valley Almanac, kept on this device." />
          <meta property="og:title" content={TITLE} />
          <meta property="og:url" content={`${SITE_ORIGIN}/saved`} />
        </Head>
        <h1 className="saved-title">Saved places</h1>
        <p className="saved-sub">
          Kept on this device only. No account needed, and nothing leaves your browser.
          {mounted && rows.length > 0 && ` ${rows.length} ${rows.length === 1 ? "place" : "places"}.`}
        </p>
        {mounted && !storageOk && (
          <p className="saved-note" role="note">
            This browser isn't letting the site store data (private browsing or blocked site data), so saved places only last until you leave the page.
          </p>
        )}
        {body}
        {mounted && hidden > 0 && (
          <p className="saved-note saved-hidden">
            {hidden === 1 ? "1 saved place is" : `${hidden} saved places are`} no longer listed, so {hidden === 1 ? "it's" : "they're"} hidden.{" "}
            <button type="button" className="mp-remove" onClick={() => keepOnlySaved(rows.map((r) => r.listing.id))}>
              Remove {hidden === 1 ? "it" : "them"}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
