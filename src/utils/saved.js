// Saved places: listing ids kept on this device only (no accounts), in
// localStorage under one versioned key. Storage can be missing, blocked
// (private mode, disabled site data) or full, so every read and write is
// wrapped: a failed read means "nothing saved", and a failed write keeps the
// change in memory for this visit and reports false.
//
// The pure helpers take the storage object so they can be tested with a fake;
// the store at the bottom is what the UI uses (via useSaved in SavedButton.jsx).

export const SAVED_KEY = "hva:saved:v1";

// Ids are compared as strings (the map snapshot and the listings table agree on
// the value, but not always on number vs string).
const norm = (id) => (id === null || id === undefined || id === "" ? null : String(id));

export function readSaved(storage) {
  try {
    const raw = storage?.getItem(SAVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const ids = parsed && parsed.v === 1 && Array.isArray(parsed.ids) ? parsed.ids : [];
    return [...new Set(ids.map(norm).filter(Boolean))];
  } catch {
    return [];
  }
}

// True when the ids were stored, false when storage refused them.
export function writeSaved(storage, ids) {
  try {
    if (!storage) return false;
    storage.setItem(SAVED_KEY, JSON.stringify({ v: 1, ids }));
    return true;
  } catch {
    return false;
  }
}

// The new id list after toggling `id` (most recently saved first).
export function toggleId(ids, id) {
  const key = norm(id);
  if (!key) return ids;
  return ids.includes(key) ? ids.filter((x) => x !== key) : [key, ...ids];
}

// The saved listings that still exist, in saved order. Ids that are no longer
// published (or not in this snapshot) are skipped.
export function savedListings(ids, listings) {
  const byId = new Map();
  for (const l of listings || []) {
    const key = norm(l?.id);
    if (key) byId.set(key, l);
  }
  return (ids || []).map((id) => byId.get(norm(id))).filter(Boolean);
}

// Whether this storage accepts writes (false when blocked or full).
export function storageWorks(storage) {
  try {
    if (!storage) return false;
    const probe = `${SAVED_KEY}:probe`;
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

// --- Store ------------------------------------------------------------------

function browserStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null; // Some browsers throw on the localStorage getter itself.
  }
}

const EMPTY = [];
let current = null; // null until first read on the client
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn();
}

export function getSavedIds() {
  if (current === null) current = readSaved(browserStorage());
  return current;
}

// Server render (prerender) and the first client render see nothing saved, so
// hydration matches; the real list arrives right after.
export function getServerSavedIds() {
  return EMPTY;
}

// Another tab changed the list.
function onStorage(e) {
  if (e.key !== SAVED_KEY) return;
  current = readSaved(browserStorage());
  emit();
}

export function subscribeSaved(fn) {
  if (listeners.size === 0 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

// Returns whether the change was stored (false: it lasts only for this visit).
export function toggleSaved(id) {
  current = toggleId(getSavedIds(), id);
  const stored = writeSaved(browserStorage(), current);
  emit();
  return stored;
}

// Drops every saved id not in `keep` (used to clear ids that are no longer
// listed, at the person's request).
export function keepOnlySaved(keep) {
  const wanted = new Set((keep || []).map(norm));
  current = getSavedIds().filter((id) => wanted.has(id));
  const stored = writeSaved(browserStorage(), current);
  emit();
  return stored;
}

export function removeSaved(id) {
  if (getSavedIds().includes(norm(id))) return toggleSaved(id);
  return true;
}

export function canSaveOnThisDevice() {
  return storageWorks(browserStorage());
}

export function isSaved(id) {
  return getSavedIds().includes(norm(id));
}
