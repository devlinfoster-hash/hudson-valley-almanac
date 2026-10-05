// The Leaflet map for /map. Leaflet touches `window` as soon as it loads, so
// this module is only ever imported on the client, after mount (MapPage loads
// it with React.lazy and renders it only once mounted). Nothing here runs
// during the SSG prerender.
//
// Markers and circles are managed imperatively (one cached Leaflet layer per
// listing, re-added to a cluster group when the filtered rows change) rather
// than as thousands of React components, which keeps filtering responsive with
// the full ~3,000-row snapshot. Popup content is built with DOM APIs and
// textContent, so listing data is never parsed as HTML.
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, AttributionControl, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { TILE_URL, TILE_ATTRIBUTION, TILE_MAX_ZOOM } from "./tiles.js";
import {
  APPROXIMATE_LABEL,
  APPROXIMATE_RADIUS_MILES,
  METERS_PER_MILE,
  NOT_AVAILABLE,
  categoryStyle,
  displayValue,
  groupApproximate,
  isVerified,
  telHref,
  townCountyLine,
  websiteHref,
} from "../utils/map-listings.js";
import { isSaved, toggleSaved } from "../utils/saved.js";

// Roughly the Almanac's service area (Westchester/Rockland up to Warren/Hamilton).
const DEFAULT_BOUNDS = L.latLngBounds([40.9, -75.4], [43.9, -73.2]);
// Approximate-area labels only appear once circles are big enough to hold them.
const LABEL_MIN_ZOOM = 11;
// The opening view never zooms in tighter than this.
const INITIAL_MAX_ZOOM = 9;
// Breathing room around the opening view; the top clears "Search this area".
const INITIAL_PADDING = { top: 60, right: 30, bottom: 30, left: 30 };

const iconCache = new Map();
function pinIcon(dbCategory) {
  const style = categoryStyle(dbCategory);
  const key = style.id || "_";
  if (!iconCache.has(key)) {
    iconCache.set(
      key,
      L.divIcon({
        className: "mp-pin",
        // Catalog constants only (color + emoji), never listing data.
        html: `<span class="mp-pin-body" style="background:${style.color}"><span class="mp-pin-icon">${style.icon}</span></span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        popupAnchor: [0, -28],
      })
    );
  }
  return iconCache.get(key);
}

function clusterIcon(cluster) {
  const n = cluster.getChildCount();
  const size = n < 10 ? 34 : n < 100 ? 40 : 48;
  return L.divIcon({
    className: "mp-cluster",
    html: `<span>${n}</span>`,
    iconSize: [size, size],
  });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// A label + value row. `text` is already a display string (blank values have
// become "Information not available", which is never linked).
function field(label, text, href, external) {
  const row = el("div", "mp-popup-field");
  row.appendChild(el("span", "mp-popup-label", label));
  if (text === NOT_AVAILABLE) {
    row.appendChild(el("span", "mp-popup-value mp-na", text));
  } else if (href) {
    const a = el("a", "mp-popup-value", text);
    a.href = href;
    if (external) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    row.appendChild(a);
  } else {
    row.appendChild(el("span", "mp-popup-value", text));
  }
  return row;
}

// The save heart for a popup (DOM twin of SavedButton). Popups are rebuilt on
// each open, so it reads the saved state then and updates itself on click.
function saveButton(listing) {
  const button = el("button", "save-btn mp-popup-save");
  button.type = "button";
  const name = listing.name || "this listing";
  button.setAttribute("aria-label", `Save ${name}`);
  const sync = () => {
    const saved = isSaved(listing.id);
    button.classList.toggle("saved", saved);
    button.setAttribute("aria-pressed", String(saved));
    button.title = saved ? "Saved on this device" : `Save ${name}`;
    button.replaceChildren(el("span", "", saved ? "♥" : "♡"));
    button.firstChild.setAttribute("aria-hidden", "true");
  };
  sync();
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSaved(listing.id);
    sync();
  });
  return button;
}

// One listing's details. `approximate` adds the "approximate area" note.
function listingBlock(listing, { approximate, onNavigate }) {
  const box = el("div", "mp-popup-listing");
  const style = categoryStyle(listing.category);
  box.appendChild(el("div", "mp-popup-cat", `${style.icon} ${style.label}`));
  const head = el("div", "mp-popup-head");
  const title = el("div", "mp-popup-name", displayValue(listing.name));
  if (isVerified(listing)) title.appendChild(el("span", "mp-badge", "Verified"));
  head.appendChild(title);
  head.appendChild(saveButton(listing));
  box.appendChild(head);
  if (approximate) {
    box.appendChild(
      el("p", "mp-popup-approx", `Location shown is an ${APPROXIMATE_LABEL} (about ${APPROXIMATE_RADIUS_MILES} miles), not the exact spot.`)
    );
  }
  box.appendChild(field("Town / County", townCountyLine(listing)));
  box.appendChild(field("Address", displayValue(listing.address)));
  box.appendChild(field("Phone", displayValue(listing.phone), telHref(listing.phone)));
  box.appendChild(field("Website", displayValue(listing.website), websiteHref(listing.website), true));
  box.appendChild(field("Hours", displayValue(listing.hours)));
  if (listing.slug) {
    const path = `/listing/${encodeURIComponent(listing.slug)}`;
    const a = el("a", "mp-popup-link", "View full listing →");
    a.href = path;
    a.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      onNavigate(path);
    });
    box.appendChild(a);
  }
  return box;
}

function popupContent(listings, opts) {
  const root = el("div", "mp-popup");
  if (listings.length > 1) {
    root.appendChild(el("div", "mp-popup-group", `${listings.length} listings in this ${APPROXIMATE_LABEL}`));
  }
  for (const l of listings) root.appendChild(listingBlock(l, opts));
  return root;
}

// How much of the map container `cover` (the results panel / mobile drawer)
// sits on top of, per side. Measured rather than assumed so the framing stays
// right whether the panel sits beside the map (0) or overlaps it.
function coveredInsets(map, cover) {
  const none = { top: 0, right: 0, bottom: 0, left: 0 };
  if (!cover) return none;
  const m = map.getContainer().getBoundingClientRect();
  const c = cover.getBoundingClientRect();
  const left = Math.max(m.left, c.left);
  const right = Math.min(m.right, c.right);
  const top = Math.max(m.top, c.top);
  const bottom = Math.min(m.bottom, c.bottom);
  if (right <= left || bottom <= top) return none;
  // A panel along the bottom edge (mobile drawer) vs. one on the left (desktop).
  if (bottom >= m.bottom - 1 && right - left >= m.width - 1) return { ...none, bottom: m.bottom - top };
  if (left <= m.left + 1) return { ...none, left: right - m.left };
  if (right >= m.right - 1) return { ...none, right: m.right - left };
  return none;
}

// The opening view: the percentile bounds of the listings (or the service area
// before they load), inside whatever part of the map isn't under the panel.
function fitInitial(map, initialBounds, cover) {
  const b = initialBounds
    ? L.latLngBounds([initialBounds.south, initialBounds.west], [initialBounds.north, initialBounds.east])
    : DEFAULT_BOUNDS;
  const inset = coveredInsets(map, cover);
  const size = map.getSize();
  // Never pad away more than most of the map, whatever the layout does.
  const clamp = (n, total) => Math.min(n, total * 0.6);
  map.fitBounds(b, {
    paddingTopLeft: [clamp(INITIAL_PADDING.left + inset.left, size.x), clamp(INITIAL_PADDING.top + inset.top, size.y)],
    paddingBottomRight: [clamp(INITIAL_PADDING.right + inset.right, size.x), clamp(INITIAL_PADDING.bottom + inset.bottom, size.y)],
    maxZoom: INITIAL_MAX_ZOOM,
  });
}

// "Reset view", stacked under the zoom buttons: back to the opening view.
function ResetViewControl({ initialBounds, coverRef }) {
  const map = useMap();
  const latest = useRef(initialBounds);
  latest.current = initialBounds;
  useEffect(() => {
    const control = L.control({ position: "topleft" });
    control.onAdd = () => {
      const bar = L.DomUtil.create("div", "leaflet-bar mp-reset-control");
      const button = L.DomUtil.create("button", "mp-reset-btn", bar);
      button.type = "button";
      button.title = "Back to the full map of listings";
      button.textContent = "Reset view";
      L.DomEvent.disableClickPropagation(bar);
      L.DomEvent.on(button, "click", () => fitInitial(map, latest.current, coverRef?.current));
      return bar;
    };
    control.addTo(map);
    return () => control.remove();
  }, [map]);
  return null;
}

// Fits the view when the filters change (not while the user pans around).
// Opens a listing's popup once its pin has been clustered (markers are added in
// chunks, so a pin may not be ready the moment the view is set).
function openListingPopup(apiRef, id, tries = 20) {
  if (apiRef.current?.openPopup(id) || tries <= 1) return;
  setTimeout(() => openListingPopup(apiRef, id, tries - 1), 150);
}

function ViewController({ viewTarget, viewKey, drawnBounds, initialBounds, coverRef, apiRef }) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    const isFirst = first.current;
    first.current = false;
    // An area filter is the user's own current view: only fit to it on load.
    if (viewTarget.type === "bounds" && !isFirst) return;
    const t = setTimeout(() => {
      if (viewTarget.type === "listing") {
        const f = viewTarget.focus;
        if (f.kind === "point") map.setView([f.lat, f.lng], f.zoom, { animate: false });
        else map.fitBounds(L.latLng(f.lat, f.lng).toBounds(f.radiusMeters * 2), { padding: [30, 30], animate: false });
        openListingPopup(apiRef, f.id);
      } else if (viewTarget.type === "initial") {
        fitInitial(map, initialBounds, coverRef?.current);
      } else if (viewTarget.type === "bounds") {
        const b = viewTarget.bounds;
        map.fitBounds([[b.south, b.west], [b.north, b.east]]);
      } else if (viewTarget.type === "near") {
        map.fitBounds(L.latLng(viewTarget.center).toBounds(viewTarget.radiusMiles * METERS_PER_MILE * 2), { padding: [20, 20] });
      } else if (drawnBounds && drawnBounds.isValid()) {
        map.fitBounds(drawnBounds, { padding: [30, 30], maxZoom: 13 });
      } else if (isFirst) {
        map.fitBounds(DEFAULT_BOUNDS);
      }
    }, isFirst ? 0 : 350);
    return () => clearTimeout(t);
    // drawnBounds and initialBounds are derived from the data/filters in viewKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, map]);
  return null;
}

function Layers({ rows, near, onSelect, onNavigate, apiRef }) {
  const map = useMap();
  const state = useRef(null);

  if (!state.current) {
    state.current = {
      cluster: L.markerClusterGroup({
        chunkedLoading: true,
        showCoverageOnHover: false,
        maxClusterRadius: 50,
        iconCreateFunction: clusterIcon,
      }),
      circles: L.layerGroup(),
      nearLayer: L.layerGroup(),
      markers: new Map(), // listing id -> marker
      circleByListing: new Map(), // listing id -> circle for the current rows
    };
  }

  // Keep the latest callbacks without rebuilding layers.
  const cb = useRef({ onSelect, onNavigate });
  cb.current = { onSelect, onNavigate };

  useEffect(() => {
    const s = state.current;
    s.circles.addTo(map);
    s.cluster.addTo(map);
    s.nearLayer.addTo(map);
    const container = map.getContainer();
    const syncZoomClass = () => container.classList.toggle("mp-zoom-low", map.getZoom() < LABEL_MIN_ZOOM);
    syncZoomClass();
    map.on("zoomend", syncZoomClass);
    return () => {
      map.off("zoomend", syncZoomClass);
      s.circles.remove();
      s.cluster.remove();
      s.nearLayer.remove();
    };
  }, [map]);

  useEffect(() => {
    const s = state.current;
    const opts = {
      onNavigate: (path) => cb.current.onNavigate(path),
    };
    const points = [];
    for (const row of rows) {
      if (row.placement.kind !== "point") continue;
      let marker = s.markers.get(row.listing.id);
      if (!marker) {
        const listing = row.listing;
        marker = L.marker([row.placement.lat, row.placement.lng], {
          icon: pinIcon(listing.category),
          title: listing.name || "",
          alt: listing.name || "",
        });
        marker.bindPopup(() => popupContent([listing], { ...opts, approximate: false }), { maxWidth: 300, autoPanPadding: [20, 20] });
        marker.on("popupopen", () => cb.current.onSelect(listing.id));
        s.markers.set(listing.id, marker);
      }
      points.push(marker);
    }
    s.cluster.clearLayers();
    s.cluster.addLayers(points);

    s.circles.clearLayers();
    s.circleByListing.clear();
    for (const group of groupApproximate(rows)) {
      const style = categoryStyle(group.listings[0].category);
      const color = group.listings.every((l) => categoryStyle(l.category).id === style.id) ? style.color : "#4A6472";
      const circle = L.circle([group.lat, group.lng], {
        radius: group.radiusMeters,
        color,
        weight: 1.5,
        dashArray: "4 4",
        fillColor: color,
        fillOpacity: 0.15,
      });
      const label = group.listings.length > 1 ? `${APPROXIMATE_LABEL} · ${group.listings.length} listings` : APPROXIMATE_LABEL;
      circle.bindTooltip(label, { permanent: true, direction: "center", className: "mp-approx-label", interactive: false });
      circle.bindPopup(() => popupContent(group.listings, { ...opts, approximate: true }), { maxWidth: 300, maxHeight: 340, autoPanPadding: [20, 20] });
      circle.on("popupopen", () => cb.current.onSelect(group.listings[0].id));
      circle.addTo(s.circles);
      for (const l of group.listings) s.circleByListing.set(l.id, circle);
    }
  }, [rows, map]);

  useEffect(() => {
    const s = state.current;
    s.nearLayer.clearLayers();
    if (!near) return;
    L.circle([near.center.lat, near.center.lng], {
      radius: near.radiusMiles * METERS_PER_MILE,
      color: "#1C3A5E",
      weight: 2,
      fill: false,
      interactive: false,
    }).addTo(s.nearLayer);
    L.circleMarker([near.center.lat, near.center.lng], {
      radius: 7,
      color: "#fff",
      weight: 2,
      fillColor: "#1C3A5E",
      fillOpacity: 1,
      interactive: false,
    }).addTo(s.nearLayer);
  }, [near?.center.lat, near?.center.lng, near?.radiusMiles]);

  useImperativeHandle(apiRef, () => ({
    getBounds() {
      const b = map.getBounds();
      return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
    },
    focus(row) {
      const s = state.current;
      if (row.placement.kind === "point") {
        const marker = s.markers.get(row.listing.id);
        if (marker && s.cluster.hasLayer(marker)) s.cluster.zoomToShowLayer(marker, () => marker.openPopup());
      } else if (row.placement.kind === "circle") {
        const circle = s.circleByListing.get(row.listing.id);
        if (!circle) return;
        // A merged circle sits at the average of its members' centers.
        map.flyTo(circle.getLatLng(), Math.max(map.getZoom(), 12), { duration: 0.6 });
        map.once("moveend", () => circle.openPopup());
      }
    },
    // Opens the popup for a listing on the map. False while its pin is still
    // waiting to be clustered, so the caller can retry.
    openPopup(id) {
      const s = state.current;
      const marker = s.markers.get(id);
      if (marker && s.cluster.hasLayer(marker)) {
        if (!marker.__parent) return false;
        s.cluster.zoomToShowLayer(marker, () => marker.openPopup());
        return true;
      }
      const circle = s.circleByListing.get(id);
      if (!circle) return false;
      circle.openPopup();
      return true;
    },
    invalidateSize() {
      map.invalidateSize();
    },
  }), [map]);

  return null;
}

const MapView = forwardRef(function MapView({ rows, viewTarget, viewKey, initialBounds, coverRef, near, onSelect, onNavigate }, apiRef) {
  const drawnBounds = useMemo(() => {
    const pts = rows.filter((r) => r.placement.kind !== "none").map((r) => [r.placement.lat, r.placement.lng]);
    return pts.length ? L.latLngBounds(pts) : null;
  }, [rows]);
  const [ready, setReady] = useState(false);
  return (
    <MapContainer
      className="mp-map"
      bounds={DEFAULT_BOUNDS}
      maxZoom={TILE_MAX_ZOOM}
      minZoom={6}
      attributionControl={false}
      worldCopyJump
      whenReady={() => setReady(true)}
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={TILE_MAX_ZOOM} />
      {/* Tile/OSM attribution: bottom right, which stays clear of the mobile
          drawer (the map ends above the collapsed drawer bar). */}
      <AttributionControl position="bottomright" />
      <ResetViewControl initialBounds={initialBounds} coverRef={coverRef} />
      <Layers rows={rows} near={near} onSelect={onSelect} onNavigate={onNavigate} apiRef={apiRef} />
      {ready && (
        <ViewController viewTarget={viewTarget} viewKey={viewKey} drawnBounds={drawnBounds} initialBounds={initialBounds} coverRef={coverRef} apiRef={apiRef} />
      )}
    </MapContainer>
  );
});

export default MapView;
