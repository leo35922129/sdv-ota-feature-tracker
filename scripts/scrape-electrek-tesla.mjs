#!/usr/bin/env node
/**
 * Scrapes Electrek's historical Tesla OTA feature list (2012-09-23 → 2016-12-22)
 * and merges into data/releases.json.
 *
 * Source: https://electrek.co/2017/03/20/tesla-list-features-software-updates/
 * Usage: node scripts/scrape-electrek-tesla.mjs
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeTeslaFeatureTags } from "./category-aliases.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data");
const OUT = join(DATA_DIR, "releases.json");
const CACHE = join(DATA_DIR, "electrek-tesla-features.json");
const ARTICLE =
  "https://electrek.co/2017/03/20/tesla-list-features-software-updates/";

const CATEGORIES = [
  "Vehicle OS",
  "Autopilot / Full Self-Driving",
  "Mobile App",
  "Profile",
  "Range / Charging / Energy",
  "Vehicle Control",
  "Comfort / Climate",
  "Interior Cabin",
  "Connectivity",
  "Media / Entertainment",
  "Audio",
  "Map / Navigation / Trip / Route",
  "Camera",
  "Lighting",
  "Display",
  "Performance",
  "Phone Call",
  "Security",
  "Voice & AI",
  "Trailering",
  "Gaming",
  "Productivity",
  "Safety / Emergency",
  "Service / Support",
  "UI / Visualization",
  "Onboarding / Tutorial",
  "Scenario / Mode",
];

const CATEGORY_RULES = [
  ["Autopilot / Full Self-Driving", /\b(fsd|full self[- ]driving|autopilot|autosteer|summon|autopark|tacc|aeb|blind spot|forward collision|auto emergency|auto high beam|parkview)\b/i],
  ["Trailering", /\b(tow mode|trailer|towing)\b/i],
  ["Phone Call", /\b(call phone|phone numbers|contact sorting)\b/i],
  ["Voice & AI", /\b(voice command|voice control|voice assistant)\b/i],
  ["Security", /\b(alarm|valet mode|pin)\b/i],
  ["Performance", /\b(launch mode|torque sleep)\b/i],
  ["Audio", /\b(media|radio|rdio|slacker|spotify|volume|usb|shuffle)\b/i],
  ["Display", /\b(clock widget|brightness|screen cleaning|display)\b/i],
  ["Camera", /\b(backup cam|parkview|camera)\b/i],
  ["Lighting", /\b(high beam|headlight|interior light)\b/i],
  ["Map / Navigation / Trip / Route", /\b(nav|map|trip|supercharger location|pin drop|traffic|route|waypoint|homelink)\b/i],
  ["Range / Charging / Energy", /\b(charg(e|ing)|supercharg|charge limit|battery charge|amp|range mode|rated range|projected range|energy)\b/i],
  ["Comfort / Climate", /\b(defrost|hvac|fan speed|cabin overheat|preconditioning|sunroof|air suspension)\b/i],
  ["Profile", /\b(driver profile|profiles|key fob|fob|custom car name)\b/i],
  ["Mobile App", /\b(mobile app|remote access)\b/i],
  ["Vehicle Control", /\b(creep|suspension|door handle|wiper|tpms|steering wheel|hill assist)\b/i],
  ["Service / Support", /\b(service mode|factory reset|wiper service)\b/i],
  ["Productivity", /\b(calendar|contact)\b/i],
  ["Scenario / Mode", /\b(range mode|tow mode|sleep mode|screen cleaning)\b/i],
  ["Safety / Emergency", /\b(collision|emergency|cabin overheat)\b/i],
  ["UI / Visualization", /\b(widget|font|ui|touch screen|app launcher|units)\b/i],
  ["Vehicle OS", /\b(wifi|os|power management|sleep|firmware)\b/i],
];

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripTags(html) {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|td)>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function categorize(title, description) {
  const text = `${title}\n${description}`;
  const matches = [];
  for (const [cat, re] of CATEGORY_RULES) {
    if (re.test(text)) matches.push(cat);
  }
  if (matches.length === 0) matches.push("Vehicle OS");
  const filtered =
    matches.length > 1 ? matches.filter((c) => c !== "Vehicle OS") : matches;
  return [...new Set(filtered)];
}

function formatElectrekDate(raw) {
  const m = String(raw || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return raw || null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2])));
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function featureTitleFromDescription(desc) {
  let t = String(desc || "")
    .replace(/^Added\s+/i, "")
    .replace(/\s*\(FINALLY!!!+\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (t) t = t.charAt(0).toUpperCase() + t.slice(1);
  return t;
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; CompetitiveSDVOTATracker/1.0; +local research)",
      Accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/**
 * Parse Electrek's rowspan table into { date, version, description } rows.
 */
export function parseElectrekFeatureTable(html) {
  const tableMatch = html.match(
    /<table[^>]*>[\s\S]*?Feature Description[\s\S]*?<\/table>/i
  );
  if (!tableMatch) throw new Error("Electrek feature table not found");

  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  let headerDone = false;
  let carryDate = null;
  let carryVersion = null;

  while ((tr = trRe.exec(tableMatch[0]))) {
    const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      (c) => ({
        html: c[1],
        text: stripTags(c[1]),
        colspan: Number((c[0].match(/colspan="(\d+)"/i) || [])[1] || 1),
        rowspan: Number((c[0].match(/rowspan="(\d+)"/i) || [])[1] || 1),
      })
    );
    if (!cells.length) continue;
    if (!headerDone) {
      if (/feature description/i.test(cells.map((c) => c.text).join(" "))) {
        headerDone = true;
      }
      continue;
    }

    if (cells.length >= 3) {
      carryDate = cells[0].text || carryDate;
      carryVersion = cells[1].text || carryVersion;
      const description = cells[2].text;
      if (description) {
        rows.push({
          date: carryDate,
          version: carryVersion,
          description,
        });
      }
    } else if (cells.length === 1 && carryDate && carryVersion) {
      // Continuation row: only feature description cell
      const description = cells[0].text;
      if (description) {
        rows.push({
          date: carryDate,
          version: carryVersion,
          description,
        });
      }
    } else if (cells.length === 2 && carryDate && carryVersion) {
      // Sometimes date/version omitted oddly — treat last cell as description
      const description = cells[cells.length - 1].text;
      if (description && !/^\d/.test(description)) {
        rows.push({ date: carryDate, version: carryVersion, description });
      }
    }
  }

  return rows;
}

export function rowsToFeatures(rows) {
  const features = [];
  const releasesMap = new Map();

  for (const [idx, row] of rows.entries()) {
    const version = String(row.version || "").trim();
    const releaseDate = formatElectrekDate(row.date);
    const description = row.description;
    const title = featureTitleFromDescription(description);
    if (!version || !title) continue;

    const categories = categorize(title, description);
    const id = `electrek-${version}-${slugify(title)}-${idx}`;
    // Model X deliveries began late 2015 — earlier OTAs are Model S only
    const year = Number(String(row.date || "").split("/").pop());
    const models = year && year < 2016 ? ["S"] : ["S", "X"];
    const feature = {
      id,
      title,
      type: "historical",
      description,
      image: null,
      imageDark: null,
      links: [],
      availability: null,
      models,
      categories,
      primaryCategory: categories[0],
      version,
      releaseDate,
      releaseUrl: ARTICLE,
      source: "electrek",
    };
    features.push(feature);

    if (!releasesMap.has(version)) {
      releasesMap.set(version, {
        version,
        url: ARTICLE,
        releaseDate,
        features: [],
        source: "electrek",
      });
    }
    const release = releasesMap.get(version);
    release.features.push({
      id: feature.id,
      title: feature.title,
      type: feature.type,
      description: feature.description,
      image: null,
      imageDark: null,
      links: [],
      availability: null,
      models: feature.models,
      categories: feature.categories,
      primaryCategory: feature.primaryCategory,
    });
  }

  return {
    source: ARTICLE,
    scrapedAt: new Date().toISOString(),
    featureCount: features.length,
    releaseCount: releasesMap.size,
    releases: [...releasesMap.values()],
    features,
  };
}

export async function scrapeElectrekTesla() {
  mkdirSync(DATA_DIR, { recursive: true });
  console.log("Fetching Electrek historical Tesla feature list…");
  const html = await fetchText(ARTICLE);
  const rows = parseElectrekFeatureTable(html);
  console.log(`Parsed ${rows.length} Electrek feature rows`);
  const payload = rowsToFeatures(rows);
  writeFileSync(CACHE, JSON.stringify(payload, null, 2));
  console.log(
    `Wrote ${CACHE} — ${payload.releaseCount} releases, ${payload.featureCount} features`
  );
  return payload;
}

function electrekCardFields(full, nested = {}) {
  const src = { ...nested, ...full };
  const tagged = normalizeTeslaFeatureTags({
    ...src,
    categories: src.categories || [],
    primaryCategory: src.primaryCategory,
  });
  return {
    id: src.id,
    title: src.title,
    type: src.type || "historical",
    description: src.description || src.title,
    image: src.image || null,
    imageDark: src.imageDark || null,
    links: Array.isArray(src.links) ? src.links : [],
    availability: src.availability || null,
    models: Array.isArray(src.models) && src.models.length ? src.models : ["S"],
    categories: tagged.categories,
    primaryCategory: tagged.primaryCategory,
    source: "electrek",
  };
}

/**
 * Merge Electrek historical features into the main Tesla releases.json.
 * Replaces any prior Electrek rows, then skips versions already present from NotaTeslaApp.
 * Historical 2012–2016 cards are additive: a NotaTeslaApp rebuild must re-merge them.
 */
export function mergeElectrekIntoReleases(electrekPayload, releasesData) {
  if (!releasesData || !electrekPayload?.features?.length) return releasesData;

  // Drop previous Electrek merge so re-runs stay idempotent
  const baseFeatures = (releasesData.features || []).filter(
    (f) => f.source !== "electrek"
  );
  const baseReleases = (releasesData.releases || []).filter(
    (r) => r.source !== "electrek"
  );

  const knownVersions = new Set(baseReleases.map((r) => String(r.version)));
  const knownKeys = new Set(
    baseFeatures.map((f) => `${f.version}\n${String(f.title).toLowerCase()}`)
  );

  const byId = new Map(
    (electrekPayload.features || []).map((f) => [f.id, f])
  );

  const newReleases = [];
  for (const rel of electrekPayload.releases || []) {
    if (knownVersions.has(String(rel.version))) continue;
    newReleases.push({
      ...rel,
      source: "electrek",
      url: rel.url || ARTICLE,
      features: (rel.features || []).map((f) =>
        electrekCardFields(byId.get(f.id) || {}, f)
      ),
    });
    knownVersions.add(String(rel.version));
  }

  const newFeatures = [];
  for (const f of electrekPayload.features) {
    const key = `${f.version}\n${String(f.title).toLowerCase()}`;
    if (knownKeys.has(key)) continue;
    knownKeys.add(key);
    newFeatures.push({
      ...electrekCardFields(f),
      version: f.version,
      releaseDate: f.releaseDate,
      releaseUrl: f.releaseUrl || ARTICLE,
      enriched: f.enriched,
      enrichmentSource: f.enrichmentSource,
    });
  }

  if (!newFeatures.length && !newReleases.length) {
    console.log("Electrek merge: nothing new to add");
    return {
      ...releasesData,
      features: baseFeatures,
      releases: baseReleases,
      featureCount: baseFeatures.length,
      releaseCount: baseReleases.length,
    };
  }

  const features = [...baseFeatures, ...newFeatures];
  const releases = [...baseReleases, ...newReleases];

  const categoryCounts = Object.fromEntries(
    (releasesData.categories || CATEGORIES).map((c) => [c, 0])
  );
  for (const f of features) {
    for (const c of f.categories || []) {
      if (categoryCounts[c] != null) categoryCounts[c]++;
    }
  }

  const sources = new Set([
    ...(releasesData.sources || [releasesData.source].filter(Boolean)),
    ARTICLE,
  ]);

  return {
    ...releasesData,
    sources: [...sources],
    categoryCounts,
    releaseCount: releases.length,
    featureCount: features.length,
    releases,
    features,
    electrek: {
      source: ARTICLE,
      addedFeatures: newFeatures.length,
      addedReleases: newReleases.length,
      scrapedAt: electrekPayload.scrapedAt,
    },
  };
}

export function loadElectrekCache() {
  if (!existsSync(CACHE)) return null;
  try {
    const payload = JSON.parse(readFileSync(CACHE, "utf8"));
    return payload?.features?.length ? payload : null;
  } catch {
    return null;
  }
}

/**
 * If a scrape dropped Electrek rows, put 2012–2016 cards back from cache or the
 * previous payload. Never used to skip cards — only to restore missing ones.
 */
export function retainElectrekFeatures(
  previous,
  next,
  electrekPayload = loadElectrekCache()
) {
  if (!next) return next;
  const nextHasElectrek = (next.features || []).some((f) => f.source === "electrek");
  if (nextHasElectrek) return next;
  if (electrekPayload?.features?.length) {
    return mergeElectrekIntoReleases(electrekPayload, next);
  }
  const prevFeat = (previous?.features || []).filter((f) => f.source === "electrek");
  const prevRel = (previous?.releases || []).filter((r) => r.source === "electrek");
  if (!prevFeat.length) return next;
  const features = [...(next.features || []), ...prevFeat];
  const seenRel = new Set((next.releases || []).map((r) => String(r.version)));
  const releases = [
    ...(next.releases || []),
    ...prevRel.filter((r) => !seenRel.has(String(r.version))),
  ];
  return {
    ...next,
    features,
    releases,
    featureCount: features.length,
    releaseCount: releases.length,
    electrek: {
      source: ARTICLE,
      addedFeatures: prevFeat.length,
      addedReleases: prevRel.length,
      retainedFromPrevious: true,
    },
  };
}

/** Merge + enrich Electrek 2012–2016 rows into a Tesla releases payload (no file write). */
export async function attachElectrekHistorical(
  releasesData,
  { refresh = false, allowFetch = process.env.SKIP_ELECTREK !== "1" } = {}
) {
  if (!releasesData) return releasesData;
  let electrek = refresh ? null : loadElectrekCache();
  const fromCache = Boolean(electrek);
  if (!electrek && (refresh || allowFetch)) {
    electrek = await scrapeElectrekTesla();
  } else if (electrek) {
    console.log(
      `Using Electrek cache — ${electrek.featureCount} historical features`
    );
  }
  if (!electrek?.features?.length) {
    console.warn(
      "Electrek historical cache missing; 2012–2016 feature cards were not merged"
    );
    return releasesData;
  }
  let merged = mergeElectrekIntoReleases(electrek, releasesData);
  try {
    const { enrichReleasesFile, enrichElectrekPayload } = await import(
      "./enrich-electrek-tesla.mjs"
    );
    merged = enrichReleasesFile(merged);
    if (!fromCache) {
      writeFileSync(
        CACHE,
        JSON.stringify(enrichElectrekPayload(electrek), null, 2)
      );
    }
  } catch (err) {
    console.warn(`Electrek enrichment skipped: ${err.message}`);
  }
  return merged;
}

export async function scrapeAndMergeElectrek({ refresh = false } = {}) {
  if (!existsSync(OUT)) {
    console.warn(`No ${OUT} yet — run Tesla scrape first`);
    const electrek = refresh ? await scrapeElectrekTesla() : loadElectrekCache();
    if (electrek) writeFileSync(CACHE, JSON.stringify(electrek, null, 2));
    return electrek;
  }
  const current = JSON.parse(readFileSync(OUT, "utf8"));
  const merged = await attachElectrekHistorical(current, { refresh });
  writeFileSync(OUT, JSON.stringify(merged, null, 2));
  console.log(
    `Merged Electrek into ${OUT} — now ${merged.releaseCount} releases, ${merged.featureCount} features (+${merged.electrek?.addedFeatures || 0} historical)`
  );
  return merged;
}

async function main() {
  await scrapeAndMergeElectrek({
    refresh: process.argv.includes("--refresh"),
  });
}

const isDirect =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
