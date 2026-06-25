// Farm Trails — day-trip guide series metadata.
//
// Plain JS (no JSX) on purpose: this module is imported by BOTH the app
// (src/App.jsx, for routes + the index/guide pages) and the Node sitemap
// generator (scripts/generate-sitemap.mjs, which can't parse JSX). The guide
// *bodies* — the long-form prose with inline listing links — live separately in
// src/data/farm-trails-bodies.jsx and are imported only by the app.
//
// To publish a new guide: add its prose to farm-trails-bodies.jsx keyed by the
// same slug, then flip `published: true` here. The route, the prerendered page,
// the sitemap entry, and the index card all follow automatically.

export const FARM_TRAILS = [
  {
    slug: "a-saturday-around-oak-hill",
    title: "A Saturday Around Oak Hill",
    area: "Northern Greene County · The Durham Valley",
    county: "Greene",
    blurb:
      "A best-preserved 19th-century hamlet, an eighth-generation Bicentennial farm, honor-system stands down every back road, and a sugarhouse that has been boiling sap since 1898.",
    metaDescription:
      "A day-trip guide to Oak Hill and the Durham Valley in northern Greene County — eighth-generation farms, honor-system stands, a sugarhouse since 1898, and good breweries to finish on.",
    published: true,
  },
  {
    slug: "a-saturday-on-the-mountaintop",
    title: "A Saturday on the Mountaintop",
    area: "Greene County · Windham to Hunter",
    county: "Greene",
    blurb:
      "The high Catskills resort towns — Windham, Hunter, Prattsville, Gilboa — with farms, cideries, and big-view detours.",
    metaDescription:
      "A day-trip guide to the Greene County mountaintop — Windham, Hunter, Prattsville, and Gilboa — with farms, cideries, and Catskill views.",
    published: true,
  },
  {
    slug: "a-saturday-around-coxsackie-and-new-baltimore",
    title: "A Saturday Around Coxsackie & New Baltimore",
    area: "Greene County · The River Towns",
    county: "Greene",
    blurb:
      "Coxsackie, New Baltimore, and Athens — Greene County's Hudson River villages, with an inland orchard arm through Climax and Earlton.",
    metaDescription:
      "A day-trip guide to Greene County's Hudson River towns — Coxsackie, New Baltimore, and Athens — with an inland arm of orchards and breweries.",
    published: true,
  },
  {
    slug: "a-saturday-in-the-helderbergs",
    title: "A Saturday in the Helderbergs",
    area: "Albany County",
    county: "Albany",
    blurb:
      "Thacher Park's escarpment, Altamont, the Indian Ladder orchards, and Albany's Warehouse District to finish.",
    metaDescription:
      "A day-trip guide to the Albany County Helderbergs — Thacher Park, Altamont, Indian Ladder orchards, and the Warehouse District.",
    published: true,
  },
  {
    slug: "a-saturday-on-the-helderberg-back-roads",
    title: "A Saturday on the Helderberg Back Roads",
    area: "Southwestern Albany County · The Hilltowns",
    county: "Albany",
    blurb:
      "Berne, Rensselaerville, and Westerlo — the quiet Albany hilltowns, rare-breed farms, and the Huyck Preserve.",
    metaDescription:
      "A day-trip guide to the southwestern Albany County hilltowns — Berne, Rensselaerville, and Westerlo — with rare-breed farms and the Huyck Preserve.",
    published: true,
  },
  {
    slug: "a-saturday-in-columbia-county",
    title: "A Saturday in Columbia County",
    area: "Columbia County",
    county: "Columbia",
    blurb:
      "Hudson's makers, the orchards and dairies of the hills, and some of the most farm-dense back roads in the region.",
    metaDescription:
      "A day-trip guide to Columbia County — Hudson's makers, hillside orchards and dairies, and farm-dense back roads.",
    published: true,
  },
  {
    slug: "a-saturday-in-the-western-catskills",
    title: "A Saturday in the Western Catskills",
    area: "Delaware County",
    county: "Delaware",
    blurb:
      "Deep-country dairy, riverside hamlets, and the East Branch — Delaware County at its most rural.",
    metaDescription:
      "A day-trip guide to the Western Catskills of Delaware County — deep-country dairy, riverside hamlets, and the East Branch.",
    published: true,
  },
  {
    slug: "a-saturday-in-the-shawangunks",
    title: "A Saturday in the Shawangunks",
    area: "Southern Ulster County",
    county: "Ulster",
    blurb:
      "New Paltz, Gardiner, and Accord beneath the Gunks — orchards, farm breweries, and the Wallkill Valley Rail Trail.",
    metaDescription:
      "A day-trip guide to the Shawangunks in southern Ulster County — New Paltz, Gardiner, and Accord, with orchards and farm breweries.",
    published: true,
  },
  {
    slug: "a-saturday-in-kingston-and-the-catskill-foothills",
    title: "A Saturday in Kingston & the Catskill Foothills",
    area: "Northern Ulster County",
    county: "Ulster",
    blurb:
      "Kingston's makers and markets, the Ashokan Reservoir, and the farms tucked into the Catskill foothills behind it.",
    metaDescription:
      "A day-trip guide to Kingston and the Catskill foothills in northern Ulster County — makers, markets, the Ashokan Reservoir, and foothill farms.",
    published: true,
  },
  {
    slug: "a-saturday-in-the-dutchess-river-towns",
    title: "A Saturday in the Dutchess River Towns",
    area: "Dutchess County",
    county: "Dutchess",
    blurb:
      "Rhinebeck, Red Hook, Tivoli, and Hyde Park — historic river towns thick with farms, cideries, and good food.",
    metaDescription:
      "A day-trip guide to the Dutchess County river towns — Rhinebeck, Red Hook, Tivoli, and Hyde Park — with farms, cideries, and good food.",
    published: true,
  },
  {
    slug: "a-saturday-in-the-harlem-valley",
    title: "A Saturday in the Harlem Valley",
    area: "Eastern Dutchess County",
    county: "Dutchess",
    blurb:
      "Millerton, Amenia, and the rolling farm country along the Connecticut line.",
    metaDescription:
      "A day-trip guide to the Harlem Valley in eastern Dutchess County — Millerton, Amenia, and the farm country along the Connecticut line.",
    published: true,
  },
  {
    slug: "a-saturday-in-the-warwick-valley",
    title: "A Saturday in the Warwick Valley",
    area: "Orange County",
    county: "Orange",
    blurb:
      "Black-dirt country and the Warwick orchards — apples, cideries, and one of the Valley's great farm towns.",
    metaDescription:
      "A day-trip guide to the Warwick Valley in Orange County — black-dirt farms, orchards, and cideries.",
    published: true,
  },
  {
    slug: "a-saturday-in-the-schoharie-valley",
    title: "A Saturday in the Schoharie Valley",
    area: "Schoharie County",
    county: "Schoharie",
    blurb:
      "Middleburgh, Cobleskill, and Sharon Springs — fertile valley farms and a foothill cluster of cideries.",
    metaDescription:
      "A day-trip guide to the Schoharie Valley — Middleburgh, Cobleskill, and Sharon Springs — with fertile valley farms and foothill cideries.",
    published: true,
  },
  {
    slug: "a-saturday-in-the-sullivan-catskills",
    title: "A Saturday in the Sullivan Catskills",
    area: "Sullivan County",
    county: "Sullivan",
    blurb:
      "Callicoon, the Delaware River, and a new generation of farms and makers in the western Catskills.",
    metaDescription:
      "A day-trip guide to the Sullivan Catskills — Callicoon, the Delaware River, and a new generation of farms and makers.",
    published: true,
  },
  {
    slug: "a-saturday-in-the-battenkill-valley",
    title: "A Saturday in the Battenkill Valley",
    area: "Washington County",
    county: "Washington",
    blurb:
      "Cambridge, Salem, and Greenwich — maybe the most farm-dense loop in the whole Almanac.",
    metaDescription:
      "A day-trip guide to the Battenkill Valley in Washington County — Cambridge, Salem, and Greenwich, the most farm-dense loop in the Almanac.",
    published: true,
  },
  {
    slug: "a-saturday-in-saratoga",
    title: "A Saturday in Saratoga",
    area: "Saratoga County",
    county: "Saratoga",
    blurb:
      "Spa-town energy, a famous farmers' market, and the farms and orchards ringing the city.",
    metaDescription:
      "A day-trip guide to Saratoga County — the spa town, its farmers' market, and the farms and orchards around the city.",
    published: true,
  },
  {
    slug: "a-saturday-in-troy-and-rensselaer-county",
    title: "A Saturday in Troy & Rensselaer County",
    area: "Rensselaer County",
    county: "Rensselaer",
    blurb:
      "Troy's collar-city markets and makers, plus the hilltown farms east of the river.",
    metaDescription:
      "A day-trip guide to Troy and Rensselaer County — the city's markets and makers, plus the hilltown farms east of the Hudson.",
    published: true,
  },
  {
    slug: "a-saturday-in-lake-george",
    title: "A Saturday in Lake George",
    area: "Warren County",
    county: "Warren",
    blurb:
      "The Queen of American Lakes — a lake-and-beverage day with the farms of the southern Adirondacks.",
    metaDescription:
      "A day-trip guide to Lake George in Warren County — a lake-and-beverage day with the farms of the southern Adirondacks.",
    published: true,
  },
  {
    slug: "a-saturday-in-the-hudson-highlands",
    title: "A Saturday in the Hudson Highlands",
    area: "Putnam County",
    county: "Putnam",
    blurb:
      "Cold Spring, Garrison, and Brewster — a Metro-North-friendly day in the Highlands.",
    metaDescription:
      "A day-trip guide to the Hudson Highlands in Putnam County — Cold Spring, Garrison, and Brewster, easy to reach by Metro-North.",
    published: true,
  },
  {
    slug: "a-saturday-in-northern-westchester",
    title: "A Saturday in Northern Westchester",
    area: "Westchester County",
    county: "Westchester",
    blurb:
      "North Salem, Bedford, and Yorktown — surprising farm country an hour from the city, with a river-brewery arm.",
    metaDescription:
      "A day-trip guide to northern Westchester County — North Salem, Bedford, and Yorktown — surprising farm country with a Hudson River brewery arm.",
    published: true,
  },
  {
    slug: "a-saturday-in-rockland-county",
    title: "A Saturday in Rockland County",
    area: "Rockland County",
    county: "Rockland",
    blurb:
      "Nyack and Piermont on the river, the Concklin and Davies farms, and the edge of Harriman.",
    metaDescription:
      "A day-trip guide to Rockland County — Nyack and Piermont on the river, the Concklin and Davies farms, and the edge of Harriman.",
    published: true,
  },
  {
    slug: "a-saturday-in-cooperstown-and-otsego-county",
    title: "A Saturday in Cooperstown & Otsego County",
    area: "Otsego County",
    county: "Otsego",
    blurb:
      "Cooperstown, Fly Creek, Ommegang, and the Amish dairy country around Richfield Springs.",
    metaDescription:
      "A day-trip guide to Cooperstown and Otsego County — Fly Creek, Ommegang, and the Amish dairy country near Richfield Springs.",
    published: true,
  },
];

export const PUBLISHED_FARM_TRAILS = FARM_TRAILS.filter((g) => g.published);

export function farmTrailBySlug(slug) {
  return FARM_TRAILS.find((g) => g.slug === slug) || null;
}

export function farmTrailSlugs() {
  return PUBLISHED_FARM_TRAILS.map((g) => g.slug);
}
