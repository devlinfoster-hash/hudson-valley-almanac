// Build-time guard for the /map snapshot (scripts/snapshot.mjs). Kept separate
// from the script so the threshold can be unit tested.
//
// public.listings_map holds ~2,800 rows. A result well below that means the
// view, its grants or the query broke, and shipping it would quietly empty the
// map, so the build fails instead.
export const MIN_MAP_LISTINGS = 2000;

// Throws with a clear message unless `rows` is an array of at least
// MIN_MAP_LISTINGS rows.
export function assertMapSnapshot(rows, min = MIN_MAP_LISTINGS) {
  if (!Array.isArray(rows)) {
    throw new Error("listings_map returned no rows array.");
  }
  if (rows.length < min) {
    throw new Error(
      `listings_map returned ${rows.length} rows, fewer than the ${min} required. ` +
        "Check the view, its anon grants, and the snapshot query before rebuilding."
    );
  }
}
