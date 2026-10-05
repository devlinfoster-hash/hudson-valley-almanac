// /map: map-first discovery. Results list + filters on the left, map on the
// right (desktop); full-screen map with a results drawer (mobile).
//
// Prerender-safe: this module imports no Leaflet. The map itself (MapView) is
// loaded with React.lazy and only rendered after mount, so vite-react-ssg's
// prerender emits the page shell (heading, filters, empty list) and the
// browser fills in the rest. Listing data comes from the build-time snapshot
// of public.listings_map (scripts/snapshot.mjs), fetched as a hashed JSON file
// only when this route loads.
//
// Every filter lives in the URL query string (see parseFilters/filtersToParams),
// so any view can be shared by copying the address.
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Head } from "vite-react-ssg";
import mapDataUrl from "../data/listings-map.json?url";
import { categories, NON_GEOGRAPHIC_COUNTIES, SITE_ORIGIN } from "../catalog.js";
import {
  APPROXIMATE_LABEL,
  NEAR_ME_RADII,
  NOT_ON_MAP,
  activeFilters,
  categoryStyle,
  countyNamesOf,
  filterListings,
  filtersToParams,
  isVerified,
  mostRestrictiveFilter,
  parseFilters,
  resolveSearch,
  townCountyLine,
} from "../utils/map-listings.js";
import "./map.css";

const MapView = lazy(() => import("./MapView.jsx"));

const PAGE_SIZE = 50;
const TITLE = "Map — Hudson Valley Almanac";
const DESCRIPTION =
  "Find farm stands, markets, makers and more on a map of the Hudson Valley, Catskills and Capital Region. Search, filter by category or county, or look near you.";

function useMapData() {
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

function ResultItem({ row, selected, onFocus }) {
  const { listing, placement, distance } = row;
  const style = categoryStyle(listing.category);
  const approximate = placement.kind === "circle";
  return (
    <li className={"mp-result" + (selected ? " selected" : "")}>
      <div className="mp-result-main">
        <span className="mp-result-dot" style={{ background: style.color }} aria-hidden="true">{style.icon}</span>
        <div className="mp-result-text">
          <Link to={`/listing/${encodeURIComponent(listing.slug)}`} className="mp-result-name">{listing.name}</Link>
          {isVerified(listing) && <span className="mp-badge">Verified</span>}
          <div className="mp-result-meta">{style.label} · {townCountyLine(listing)}</div>
          <div className="mp-result-loc">
            {placement.kind === "none" ? (
              <span className="mp-not-on-map">{NOT_ON_MAP}</span>
            ) : (
              <button type="button" className="mp-show-on-map" onClick={() => onFocus(row)}>
                {approximate ? `Show ${APPROXIMATE_LABEL} on map` : "Show on map"}
              </button>
            )}
            {distance !== null && (
              <span className="mp-distance">{approximate ? "about " : ""}{distance < 10 ? distance.toFixed(1) : Math.round(distance)} mi</span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

// Shown when no listings match: the active filters as removable chips, a
// one-click Clear all, and which single filter is holding the results back.
function EmptyState({ chips, best, radius, onRemove, onClearAll }) {
  let hint;
  if (best && best.count > 0) {
    hint = (
      <>Removing <strong>“{best.filter.label}”</strong> would show {best.count.toLocaleString("en-US")} {best.count === 1 ? "listing" : "listings"}.</>
    );
  } else if (chips.length > 1) {
    hint = "Removing any one of these filters still shows nothing. Try Clear all.";
  }
  return (
    <div className="mp-empty" role="status">
      <p className="mp-empty-title">No listings match these filters.</p>
      {hint && <p className="mp-empty-hint">{hint}</p>}
      <div className="mp-chips">
        {chips.map((f) => (
          <button
            key={f.key}
            type="button"
            className={"mp-chip" + (best && best.filter.key === f.key && best.count > 0 ? " mp-chip-key" : "")}
            onClick={() => onRemove(f.remove)}
            aria-label={`Remove filter: ${f.key === "near" ? `within ${radius} miles of your location` : f.label}`}
          >
            {f.key === "near" ? `${f.label} · Stop using my location` : f.label} ✕
          </button>
        ))}
        <button type="button" className="mp-chip mp-chip-clear" onClick={onClearAll}>Clear all</button>
      </div>
    </div>
  );
}

export default function MapPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);
  const data = useMapData();
  const countyNames = useMemo(() => countyNamesOf(data.listings), [data.listings]);
  // A query that is exactly a county name drives the county dropdown.
  const search = useMemo(() => resolveSearch(filters, countyNames), [filters, countyNames]);
  const rows = useMemo(() => filterListings(data.listings, filters, { countyNames }), [data.listings, filters, countyNames]);
  const onMapCount = useMemo(() => rows.filter((r) => r.placement.kind !== "none").length, [rows]);

  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [geo, setGeo] = useState({ status: "idle", message: "" });
  const mapApi = useRef(null);
  const pageRef = useRef(null);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(max-width: 860px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    // Size the page to the viewport below the site nav (whose height varies).
    const setTop = () => {
      if (pageRef.current) {
        const top = pageRef.current.getBoundingClientRect().top + window.scrollY;
        pageRef.current.style.setProperty("--mp-top", `${Math.max(0, Math.round(top))}px`);
      }
    };
    setTop();
    window.addEventListener("resize", setTop);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("resize", setTop);
    };
  }, []);

  // Reset paging when the result set changes.
  useEffect(() => { setVisible(PAGE_SIZE); }, [filters]);

  const update = useCallback(
    (patch) => setSearchParams(filtersToParams({ ...filters, ...patch }), { replace: true }),
    [filters, setSearchParams]
  );

  const counties = useMemo(() => {
    const present = new Set(countyNames);
    if (search.county) present.add(search.county);
    const geo = [...present].filter((c) => !NON_GEOGRAPHIC_COUNTIES.has(c)).sort();
    const other = [...present].filter((c) => NON_GEOGRAPHIC_COUNTIES.has(c)).sort();
    return [...geo, ...other];
  }, [countyNames, search.county]);

  const viewTarget = filters.bounds
    ? { type: "bounds", bounds: filters.bounds }
    : filters.near
    ? { type: "near", center: filters.near, radiusMiles: filters.radius }
    : { type: "results" };
  // What makes the map refit. With no area or near-me filter, a change in the
  // search (text, category, county) fits the map to the matching listings. With
  // either active, search changes leave the view alone.
  const viewKey = filters.bounds
    ? `bounds|${data.status}|${searchParams.get("bbox")}`
    : filters.near
    ? `near|${data.status}|${searchParams.get("near")}|${filters.radius}`
    : `results|${data.status}|${search.words.join(" ")}|${filters.category}|${search.county}`;
  const near = filters.near ? { center: filters.near, radiusMiles: filters.radius } : null;

  function searchThisArea() {
    const bounds = mapApi.current?.getBounds();
    if (bounds) update({ bounds, near: null });
  }

  function nearMe() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeo({ status: "error", message: "Your browser can't share its location." });
      return;
    }
    setGeo({ status: "locating", message: "" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ status: "idle", message: "" });
        update({ near: { lat: pos.coords.latitude, lng: pos.coords.longitude }, bounds: null });
      },
      (err) => {
        const message =
          err.code === 1 ? "Location permission was denied." : err.code === 3 ? "Finding your location timed out." : "Couldn't find your location.";
        setGeo({ status: "error", message });
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
    );
  }

  function focusRow(row) {
    setSelectedId(row.listing.id);
    if (isMobile) setDrawerOpen(false);
    mapApi.current?.focus(row);
  }

  const onNavigate = useCallback((path) => navigate(path), [navigate]);

  // The map needs to re-measure when the mobile drawer or layout changes.
  useEffect(() => { mapApi.current?.invalidateSize(); }, [isMobile]);

  const chips = useMemo(() => activeFilters(filters, countyNames), [filters, countyNames]);
  const hasActiveFilters = chips.length > 0;
  const isEmpty = data.status === "ready" && data.listings.length > 0 && rows.length === 0;
  const best = useMemo(
    () => (isEmpty ? mostRestrictiveFilter(data.listings, filters, { countyNames }) : null),
    [isEmpty, data.listings, filters, countyNames]
  );
  const clearAll = () => setSearchParams(new URLSearchParams(), { replace: true });
  const shown = rows.slice(0, visible);

  let statusLine;
  if (data.status === "loading") statusLine = "Loading listings…";
  else if (data.status === "error") statusLine = "Map listings couldn't be loaded. Please try again later.";
  else if (!data.listings.length) statusLine = "No map listings are available right now.";
  else statusLine = `${rows.length.toLocaleString("en-US")} ${rows.length === 1 ? "listing" : "listings"} · ${onMapCount.toLocaleString("en-US")} on the map`;

  return (
    <div className="mp-page" ref={pageRef}>
      <Head>
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <link rel="canonical" href={`${SITE_ORIGIN}/map`} />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:url" content={`${SITE_ORIGIN}/map`} />
        <meta property="og:type" content="website" />
      </Head>

      <aside className={"mp-panel" + (drawerOpen ? " open" : "")} aria-label="Search and results">
        <button
          type="button"
          className="mp-drawer-handle"
          aria-expanded={drawerOpen}
          aria-controls="mp-panel-body"
          onClick={() => setDrawerOpen((o) => !o)}
        >
          <span className="mp-drawer-grip" aria-hidden="true" />
          <span>{drawerOpen ? "Show map" : `List · ${data.status === "ready" ? rows.length.toLocaleString("en-US") : "…"} results`}</span>
        </button>

        <div className="mp-panel-body" id="mp-panel-body">
          <h1 className="mp-title">Map of the Almanac</h1>

          <div className="mp-filters" role="search">
            <label className="mp-sr" htmlFor="mp-q">Search</label>
            <input
              id="mp-q"
              type="search"
              className="mp-input"
              placeholder="Search name, town, county, tag, ZIP or street"
              value={filters.q}
              onChange={(e) => update({ q: e.target.value })}
            />
            <div className="mp-filter-row">
              <label className="mp-sr" htmlFor="mp-category">Category</label>
              <select id="mp-category" className="mp-select" value={filters.category} onChange={(e) => update({ category: e.target.value })}>
                <option value="">All categories</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
              </select>
              <label className="mp-sr" htmlFor="mp-county">County</label>
              <select
                id="mp-county"
                className="mp-select"
                value={search.county}
                // Picking a county (or All counties) replaces a county typed in the search box.
                onChange={(e) => update({ county: e.target.value, ...(search.countyFromQuery ? { q: "" } : {}) })}
              >
                <option value="">All counties</option>
                {counties.map((c) => <option key={c} value={c}>{NON_GEOGRAPHIC_COUNTIES.has(c) ? c : `${c} County`}</option>)}
              </select>
            </div>
            <div className="mp-filter-row">
              <button type="button" className="mp-btn" onClick={nearMe} disabled={geo.status === "locating"}>
                {geo.status === "locating" ? "Locating…" : "📍 Near me"}
              </button>
              <label className="mp-sr" htmlFor="mp-radius">Distance</label>
              <select id="mp-radius" className="mp-select mp-select-small" value={filters.radius} onChange={(e) => update({ radius: Number(e.target.value) })}>
                {NEAR_ME_RADII.map((r) => <option key={r} value={r}>within {r} mi</option>)}
              </select>
            </div>
            {geo.status === "error" && <p className="mp-geo-error" role="alert">{geo.message}</p>}
            {(filters.bounds || filters.near) && (
              <div className="mp-chips">
                {filters.bounds && (
                  <button type="button" className="mp-chip" onClick={() => update({ bounds: null })}>Map area only ✕</button>
                )}
                {filters.near && (
                  <button type="button" className="mp-chip mp-chip-location" onClick={() => update({ near: null })}>
                    📍 Within {filters.radius} mi · Stop using my location ✕
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mp-status" aria-live="polite">
            {statusLine}
            {hasActiveFilters && data.status === "ready" && (
              <button type="button" className="mp-clear" onClick={clearAll}>Clear all</button>
            )}
          </div>

          <div className="mp-legend">
            <span><span className="mp-legend-pin" aria-hidden="true" /> Exact location</span>
            <span><span className="mp-legend-circle" aria-hidden="true" /> Approximate area (~2 mi)</span>
          </div>

          <ul className="mp-results">
            {shown.map((row) => (
              <ResultItem key={row.listing.id} row={row} selected={row.listing.id === selectedId} onFocus={focusRow} />
            ))}
          </ul>
          {rows.length > visible && (
            <button type="button" className="mp-btn mp-more" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
              Show more ({(rows.length - visible).toLocaleString("en-US")} more)
            </button>
          )}
          {isEmpty && (
            <EmptyState chips={chips} best={best} radius={filters.radius} onRemove={update} onClearAll={clearAll} />
          )}
        </div>
      </aside>

      <section className="mp-map-wrap" aria-label="Map">
        {mounted && (
          <button type="button" className="mp-btn mp-area-btn" onClick={searchThisArea}>Search this area</button>
        )}
        {mounted ? (
          <Suspense fallback={<div className="mp-map-loading">Loading map…</div>}>
            <MapView
              ref={mapApi}
              rows={rows}
              viewTarget={viewTarget}
              viewKey={viewKey}
              near={near}
              onSelect={setSelectedId}
              onNavigate={onNavigate}
            />
          </Suspense>
        ) : (
          <div className="mp-map-loading">Loading map…</div>
        )}
      </section>
    </div>
  );
}
