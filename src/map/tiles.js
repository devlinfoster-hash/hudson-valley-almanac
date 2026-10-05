// Basemap tiles for /map: Stadia Maps "Alidade Smooth" raster tiles.
//
// OpenStreetMap's own tile server (tile.openstreetmap.org) does not allow
// production app traffic, so tiles come from Stadia Maps, whose terms cover
// production use. Stadia authenticates web traffic by domain: register
// www.hudsonvalleyalmanac.com (and any preview domains) in the Stadia Maps
// client dashboard and no key is needed in the code. localhost works without
// any setup. For hosts that can't use domain auth, set VITE_STADIA_API_KEY at
// build time and it is appended to the tile URLs.
//
// The attribution below is required by Stadia, OpenMapTiles and OpenStreetMap
// and is always shown in the map's attribution control.
const STADIA_API_KEY = import.meta.env?.VITE_STADIA_API_KEY || "";

export const TILE_URL =
  "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png" +
  (STADIA_API_KEY ? `?api_key=${encodeURIComponent(STADIA_API_KEY)}` : "");

export const TILE_ATTRIBUTION =
  '&copy; <a href="https://stadiamaps.com/" target="_blank" rel="noopener noreferrer">Stadia Maps</a> ' +
  '&copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

export const TILE_MAX_ZOOM = 20;
