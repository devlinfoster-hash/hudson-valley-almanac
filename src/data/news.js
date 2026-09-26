// Almanac news posts come from the news_posts table in Supabase. scripts/snapshot.mjs
// writes the published posts whose date has arrived to src/data/news.json at build
// time, so adding or scheduling a post is a database change plus a rebuild.
// Body paragraphs use light markup: "## Heading", "### Small heading",
// "- list item", [link text](url), and *italic*.
import raw from "./news.json";

function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

export const NEWS_POSTS = (raw || []).map((p) => ({
  slug: p.slug,
  iso: p.publish_date,
  date: formatDate(p.publish_date),
  title: p.title,
  summary: p.summary,
  body: Array.isArray(p.body) ? p.body : [],
}));
