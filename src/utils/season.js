// Season-end helpers for listing hours. season_end is a Postgres `date`, which
// PostgREST returns as "YYYY-MM-DD". Comparisons are date-only in the visitor's
// local time, so a season that ends today still counts as open today.

// Today's date in local time as "YYYY-MM-DD".
export function localToday(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// True only when seasonEnd is a valid date strictly before `today`.
// Null, empty or malformed values are never treated as ended.
export function isSeasonEnded(seasonEnd, today = localToday()) {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(seasonEnd ?? ""));
  return Boolean(m && today && m[1] < today);
}
