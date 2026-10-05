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

// True when the build runs on Vercel or a CI runner (VERCEL or CI set). "0" and
// "false" count as unset, since `CI=false` is a common way to opt out.
function isSet(value) {
  const v = String(value ?? "").trim().toLowerCase();
  return v !== "" && v !== "0" && v !== "false";
}
export function isCiBuild(env) {
  return isSet(env?.VERCEL) || isSet(env?.CI);
}

// On Vercel/CI, a missing Supabase URL or key is a misconfiguration: throw
// rather than ship an empty map. Local builds and `npm run dev` may run without
// them (the snapshot then writes an empty map file), so nothing is thrown there.
export function assertSupabaseEnvForCi(env, { url, key }) {
  if (!isCiBuild(env) || (url && key)) return;
  const missing = [!url && "VITE_SUPABASE_URL (or SUPABASE_URL)", !key && "VITE_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)"].filter(Boolean);
  const plural = missing.length > 1;
  throw new Error(
    `${missing.join(" and ")} ${plural ? "are" : "is"} not set on this ${isSet(env.VERCEL) ? "Vercel" : "CI"} build, ` +
      `so the map snapshot can't be fetched. Set ${plural ? "them" : "it"} in the project's environment variables.`
  );
}
