#!/usr/bin/env node
/**
 * Scrapes NotaTeslaApp software update history + every release-notes page.
 * Usage: node scripts/scrape.mjs
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isExcludedTeslaFeature,
  withoutExcludedTeslaFeatures,
} from "./tesla-feature-exclusions.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data");
const OUT = join(DATA_DIR, "releases.json");
const CHECKPOINT = join(DATA_DIR, "checkpoint.json");
const BASE = "https://www.notateslaapp.com";
const HISTORY = `${BASE}/software-updates/history/`;
const CONCURRENCY = 4;
const DELAY_MS = 120;

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
  ["Trailering", /\b(trailer|trailering|tow hitch|towing|trailer mode|tow mode|tow limit)\b/i],
  ["Phone Call", /\b(phone call|make (?:a )?call|calling|call contacts|call phone|dial|bluetooth phone|contacts? (?:list|lookup|sorting)|from map screen)\b/i],
  ["Voice & AI", /\b(hey grok|\bgrok\b|voice commands?|voice control|voice assistant|\bxai\b|say \"hey)\b/i],
  ["Autopilot / Full Self-Driving", /\b(fsd|full self[- ]driving|autopilot|autosteer|smart summon|actually smart summon|\bsummon\b|autopark|park assist|tacc|traffic[- ]aware cruise|vision[- ]based attention|navigate on autopilot|stop sign control|robotaxi|self[- ]driving|end[- ]to[- ]end|blind spot|forward collision|auto(?:matic)? emergency braking|\baeb\b|auto high beam|speed profile|arrival options)\b/i],
  ["Security", /\b(sentry mode|vehicle alarm|\balarm\b|pin to drive|valet mode|dashcam clip encryption|cabin camera (?:privacy|attention)|theft|walk[- ]away lock|lock sounds?|custom lock sound|security improvements?|glovebox pin)\b/i],
  ["Performance", /\b(launch mode|track mode|0[- ]60|quarter mile|torque sleep|dyno|powertrain endurance|acceleration (?:boost|mode|improvement)|performance (?:and launch|mode)|traction control|slippery surface)\b/i],
  ["Audio", /\b(\bmusic\b|spotify|tidal|slacker|liveone|\brdio\b|\bradio\b|podcast|volume|equalizer|immersive sound|\baudio\b|shuffle|repeat|music app|usb (?:sorting|media)|media player|chimes?|warning sounds?|alert sounds?|notification sounds?)\b/i],
  ["Gaming", /\b(\barcade\b|\bgaming\b|\bsteam\b|caraoke|beach buggy|polytopia|cuphead|witcher|vampire survivors|boomerang fu|fart on sit)\b/i],
  ["Media / Entertainment", /\b(theater|netflix|youtube|\bbrowser\b|karaoke|streaming video|entertainment|boombox|light show|rave cave|chromium)\b/i],
  ["Display", /\b(rear display|display brightness|auto(?:matic)? brightness|screen cleaning(?: mode)?|wallpaper|light sync|touchscreen brightness|instrument cluster|clock widget|warmer display|font size|all apps'? (?:menu|icon)|dock icons?|larger speedometer)\b/i],
  ["Camera", /\b(dashcam|live camera|cabin camera|rearview|surround view|camera preview|camera wash|backup cam|parkview|\bcameras?\b)\b/i],
  ["Lighting", /\b(headlight|taillight|accent light|ambient light|dome light|puddle light|turn signal|chime when light|fog lamp|matrix light|interior light|adaptive headlight)\b/i],
  ["Map / Navigation / Trip / Route", /\b(navigation|navigate on|nav (?:destination|app)|\bmaps?\b|\btrips?\b|trip (?:planner|meter|energy)|waypoint|toll (?:fee|roads?)|traffic visualization|traffic lines|lane guidance|satellite view|weather (?:map|at destination|forecast)|bus lane|route planner|preferred routes|pin drop|homelink|supercharger (?:location|amenit|availability)|online routing|cancel button to nav|odometer|search along route|site info at arrival)\b/i],
  ["Range / Charging / Energy", /\b(charg(e|ing)|supercharg|wall connector|charge port|battery precondition|charge cable|dc fast|plug and charge|scheduled charging|charge limit|charging cable|energy app|estimated range|rated range|projected range|range (?:mode|assurance|display)|battery (?:charge|support|heat|display|health)|arrival energy|soc at arrival|charging display)\b/i],
  ["Comfort / Climate", /\b(climate|cabin overheat|seat heat|seat cool|steering wheel heat|air condition|\bhvac\b|seat vent|pet mode|camp mode|dog mode|bioweapon|defrost|cabin temperature|preconditioning|fan speed|sunroof|hot weather|cold weather|climate icon|seats? control)\b/i],
  ["Profile", /\b(driver profiles?|easy entry|seat profile|mirror profile|driver settings|profile settings|cloud profiles?|key fob|custom car name|name your (?:car|vehicle)|automatic driver profiles)\b/i],
  ["Mobile App", /\b(mobile app|phone app|tesla app|smartphone|phone key|apple watch|android auto|remote access)\b/i],
  ["Connectivity", /\b(bluetooth|blue[\s-]?tooth|wi-?fi|\bwifi\b|cellular|\blte\b|\b5g\b)\b/i],
  ["Vehicle Control", /\b(suspension|steering (weight|mode|feel)|brake|drive mode|off[- ]road|wiper|horn|\bwindows?\b|\bdoors?\b|door handle|frunk|trunk|glovebox|walk[- ]away|comfort braking|unlatch|creep|stopping mode|hill assist|tpms|parking brake|fold mirrors|scroll wheel|parking options|steer[- ]by[- ]wire|auto shift|mirror tilt|tire pressure)\b/i],
  ["Productivity", /\b(calendar|sketchpad|notepad|keyboard|productivity|zoom meeting|web conference|osk)\b/i],
  ["Onboarding / Tutorial", /\b(tutorial|onboarding|walkthrough|first drive|owner.?s manual)\b/i],
  ["Scenario / Mode", /\b(pet mode|camp mode|dog mode|joe mode|keep climate|chill mode|sport mode|energy saving|scenario|car wash|sleep mode)\b/i],
  ["Safety / Emergency", /\b(\bsafety\b|emergency|airbag|collision|lane departure|child left|parental control|sos|occupant detection|cabin overheat protection|blind[- ]?spot|chimes?|warning sounds?|alert sounds?|notification sounds?|audible (?:alerts?|warnings?)|cross[- ]traffic chime)\b/i],
  ["Service / Support", /\b(service mode|diagnostics|automatic software update|security fix|bug fix|minor fix|service panel|factory reset|wiper service|maintenance|service center)\b/i],
  ["UI / Visualization", /\b(visual updates?|visualization|animation|ui improvement|interface|appearance|paint shop|theme|iconography|units|app launcher|widget|welcome animation|animated badges?|curve assist|smoother visualizations)\b/i],
  ["Vehicle OS", /\b(operating system|firmware|\bmcu\b|infotainment|vehicle software|amd ryzen|intel atom|\bwifi\b|wi-?fi|power management|vampire|sleep|language added|hebrew|software version)\b/i],
];
function pendingWithRefresh(items, isCached, refreshLatest) {
  const pending = [];
  const seen = new Set();
  const push = (item, key) => {
    if (seen.has(key)) return;
    seen.add(key);
    pending.push(item);
  };
  for (const item of items) {
    const key = typeof item === "string" ? item : item.url;
    if (!isCached(item)) push(item, key);
  }
  for (const item of items.slice(0, refreshLatest)) {
    const key = typeof item === "string" ? item : item.url;
    push(item, key);
  }
  return pending;
}

function retainElectrekFromPrevious(previous, payload) {
  if (!previous || !payload) return payload;
  if ((payload.features || []).some((f) => f.source === "electrek")) return payload;
  const feats = (previous.features || []).filter((f) => f.source === "electrek");
  if (!feats.length) return payload;
  const seenRel = new Set((payload.releases || []).map((r) => String(r.version)));
  const rels = (previous.releases || []).filter(
    (r) => r.source === "electrek" && !seenRel.has(String(r.version))
  );
  const features = [...(payload.features || []), ...feats];
  const releases = [...(payload.releases || []), ...rels];
  return {
    ...payload,
    features,
    releases,
    featureCount: features.length,
    releaseCount: releases.length,
  };
}

function writePayloadIfChanged(path, payload) {
  let prev = null;
  if (existsSync(path)) {
    try {
      prev = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      prev = null;
    }
  }
  const prevFeats = prev?.features || [];
  const nextFeats = payload.features || [];
  const same =
    prev &&
    prev.releaseCount === payload.releaseCount &&
    prev.featureCount === payload.featureCount &&
    prevFeats.length === nextFeats.length &&
    prevFeats.every(
      (f, i) =>
        f.id === nextFeats[i]?.id &&
        f.title === nextFeats[i]?.title &&
        f.description === nextFeats[i]?.description &&
        f.image === nextFeats[i]?.image
    );
  if (same && prev.scrapedAt) {
    payload.scrapedAt = prev.scrapedAt;
    payload.contentUnchanged = true;
  }
  writeFileSync(path, JSON.stringify(payload, null, 2));
  return !same;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
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
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Map NotaTeslaApp model labels to short badges: S, 3, X, Y, CT */
function shortTeslaModel(label) {
  const t = String(label || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || /^(amd|ryzen|intel|n\/a|c\?|hw\d|ai\d)$/i.test(t)) return null;
  if (/\b(ct|cybertruck|cyber)\b/.test(t)) return "CT";
  if (/\b(model\s*)?3\b/.test(t) || /\bs3\b/.test(t) || /models?3/.test(t.replace(/\s/g, ""))) {
    return "3";
  }
  if (/\b(model\s*)?y\b/.test(t) || /modely/.test(t.replace(/\s/g, ""))) return "Y";
  if (/\b(model\s*)?x\b/.test(t) || /modelx/.test(t.replace(/\s/g, ""))) return "X";
  if (/\b(model\s*)?s\b/.test(t) || /models(?!\d)/.test(t.replace(/\s/g, ""))) return "S";
  return null;
}

/**
 * NotaTeslaApp encodes per-feature region rules in an inline JS map and
 * personalizes labels for the visitor's country. We resolve labels for US
 * to match what the site shows US visitors.
 */
const REGION_AVAIL_PREFIX = "4c0u3";
const REGION_AVAIL_SUFFIX = "6n8u1";
const REGION_NA_PREFIX = "1n4f9";
const REGION_NA_SUFFIX = "27b8o7";
const REGION_UNKNOWN_FLAG = "v94n3q";

function parseRegionMap(html) {
  const match = html.match(/const axdqkdagcueydbn\s*=\s*(\{[\s\S]*?\});/);
  if (!match) return {};
  try {
    return JSON.parse(match[1]);
  } catch {
    return {};
  }
}

function decodeRegionPayload(regionMap, noteId) {
  if (!noteId || !regionMap) return null;
  const key = Buffer.from(String(noteId), "utf8").toString("base64");
  const enc = regionMap[key];
  if (!enc) return null;
  const cut = enc.indexOf(key);
  if (cut <= 0) return null;
  try {
    return Buffer.from(enc.slice(0, cut), "base64").toString("utf8");
  } catch {
    return null;
  }
}

function resolveAvailability({ staticLabel, payload, unknownFlag, country = "us" }) {
  const staticText = String(staticLabel || "").trim();
  if (staticText) {
    // Preserve site-provided static labels (e.g. Available Worldwide)
    return staticText;
  }

  const cc = String(country).toLowerCase();
  const countryName = cc === "us" ? "the US" : cc.toUpperCase();

  if (!payload) {
    if (unknownFlag) return `Availability unknown in ${countryName}`;
    return null;
  }

  if (payload.includes(REGION_NA_PREFIX + cc + REGION_NA_SUFFIX)) {
    return `Not relevant in ${countryName}`;
  }
  if (payload.includes(REGION_AVAIL_PREFIX + cc + REGION_AVAIL_SUFFIX)) {
    return `Available in ${countryName}`;
  }
  if (
    payload.includes(REGION_AVAIL_PREFIX + REGION_AVAIL_SUFFIX) &&
    !payload.includes(REGION_NA_PREFIX + cc + REGION_NA_SUFFIX)
  ) {
    return `Available in ${countryName}`;
  }
  if (unknownFlag) return `Availability unknown in ${countryName}`;
  return `Not relevant in ${countryName}`;
}

function absUrl(src) {
  if (!src) return null;
  if (src.startsWith("//")) return `https:${src}`;
  if (src.startsWith("http")) return src;
  return `${BASE}${src.startsWith("/") ? "" : "/"}${src}`;
}

function categorize(title, description) {
  const text = `${title}\n${description}`;
  const matches = [];
  for (const [cat, re] of CATEGORY_RULES) {
    if (re.test(text)) matches.push(cat);
  }
  if (matches.length === 0) return ["Vehicle OS"];
  // Prefer more specific over Vehicle OS when others matched
  const filtered =
    matches.length > 1 ? matches.filter((c) => c !== "Vehicle OS") : matches;
  const unique = [...new Set(filtered)];
  // Grab-bag notes — primary only
  if (/^(minor updates|minor fixes|other updates|additional improvements)$/i.test(title)) {
    return unique.slice(0, 1);
  }
  // Default: one primary category. Allow a single secondary only for clear dual-domain cases.
  const primary = unique[0];
  const dualOk = {
    "Autopilot / Full Self-Driving": new Set([
      "Map / Navigation / Trip / Route",
      "Safety / Emergency",
      "Camera",
      "Display",
    ]),
    "Map / Navigation / Trip / Route": new Set(["Range / Charging / Energy"]),
    "Range / Charging / Energy": new Set(["Map / Navigation / Trip / Route"]),
    "Security": new Set(["Camera"]),
    "Audio": new Set(["Media / Entertainment"]),
  };
  const allowed = dualOk[primary];
  if (!allowed) return [primary];
  const secondary = unique.slice(1).find((c) => allowed.has(c));
  return secondary ? [primary, secondary] : [primary];
}

async function fetchText(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; TeslaOTAArchive/1.0; +local research)",
          Accept: "text/html",
        },
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(1000 * (i + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(800 * (i + 1));
    }
  }
  throw new Error(`Failed to fetch ${url}`);
}

function listVersionsFromHistory(html) {
  return listReleaseNoteVersions(html);
}

/** Every NotaTeslaApp release-notes version linked from history HTML or the sitemap. */
export function listReleaseNoteVersions(html) {
  const re = /\/software-updates\/version\/([^"'/<>\s]+)\/release-notes/g;
  const versions = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(String(html || "")))) {
    let v = m[1];
    try {
      v = decodeURIComponent(v);
    } catch {
      /* keep raw */
    }
    if (!v || seen.has(v)) continue;
    seen.add(v);
    versions.push(v);
  }
  return versions;
}

/** History order first, then release notes that only appear in the sitemap. */
export function mergeReleaseVersions(historyVersions, sitemapVersions) {
  return listReleaseNoteVersions(
    [
      ...(historyVersions || []).map(
        (v) => `/software-updates/version/${v}/release-notes`
      ),
      ...(sitemapVersions || []).map(
        (v) => `/software-updates/version/${v}/release-notes`
      ),
    ].join("\n")
  );
}

function parseReleaseNotes(version, html) {
  const releaseDateMatch = html.match(
    /Release Date<\/[^>]*>\s*<[^>]*>\s*([^<]+)/i
  ) || html.match(/Release Date[\s\S]{0,80}?>([A-Za-z]+ \d{1,2}, \d{4})</i);

  const releaseDate = releaseDateMatch
    ? stripTags(releaseDateMatch[1])
    : null;

  const regionMap = parseRegionMap(html);
  const features = [];
  const sectionRe = /<section class="mod-update-feature"([^>]*)>([\s\S]*?)<\/section>/gi;
  let sm;
  while ((sm = sectionRe.exec(html))) {
    const attrs = sm[1];
    const body = sm[2];
    const type = (attrs.match(/data-feature-type="([^"]*)"/i) || [])[1] || "official";
    const featureId =
      (attrs.match(/data-feature="([^"]*)"/i) || [])[1] ||
      (attrs.match(/data-note-id="([^"]*)"/i) || [])[1] ||
      null;
    const noteId = (attrs.match(/data-note-id="([^"]*)"/i) || [])[1] || null;
    const unknownFlag =
      (attrs.match(/data-34rhkdy="([^"]*)"/i) || [])[1] === REGION_UNKNOWN_FLAG;

    // Skip intro blurb sections without h2
    const titleMatch = body.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    if (!titleMatch) continue;
    const title = stripTags(titleMatch[1]);

    const imgMatch =
      body.match(
        /<div class="mod-update-feature-image"[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>/i
      ) || body.match(/<img[^>]+src="([^"]*tesla-car-updates[^"]*)"[^>]*>/i);
    const image = imgMatch ? absUrl(imgMatch[1]) : null;

    const darkMatch = body.match(
      /<source[^>]+srcset="([^"]+)"[^>]*prefers-color-scheme:\s*dark/i
    );
    const imageDark = darkMatch ? absUrl(darkMatch[1]) : null;

    const descMatch = body.match(
      /<div class="mod-update-feature-description">([\s\S]*?)(?:<\/div>\s*){1,3}\s*<\/div>\s*<\/section>|<div class="mod-update-feature-description">([\s\S]*?)<\/div>/i
    );
    let description = "";
    if (descMatch) {
      const raw = descMatch[1] || descMatch[2] || "";
      // Keep paragraph text; drop nested buttons
      const cleaned = raw.replace(/<div class="button-container[\s\S]*$/i, "");
      description = stripTags(cleaned);
    }

    if (isExcludedTeslaFeature({ id: featureId, title, description })) continue;

    const availabilityMatch = body.match(
      /requirement-name-region[^\s"]*"[^>]*>([\s\S]*?)<\/div>/i
    );
    const staticAvailability = availabilityMatch
      ? stripTags(availabilityMatch[1])
      : "";
    const payload = decodeRegionPayload(regionMap, noteId);
    const availability = resolveAvailability({
      staticLabel: staticAvailability,
      payload,
      unknownFlag,
      country: "us",
    });

    const models = [];
    const seenModels = new Set();
    const modelRe =
      /<(?:div|span)[^>]*requirement-name-model(?!-label)[^>]*>([\s\S]*?)<\/(?:div|span)>/gi;
    let mm;
    while ((mm = modelRe.exec(body))) {
      const short = shortTeslaModel(stripTags(mm[1]));
      if (!short || seenModels.has(short)) continue;
      seenModels.add(short);
      models.push(short);
    }
    // Fallback: data-models JSON on the Models label
    if (models.length === 0) {
      const dataModels = body.match(/data-models='(\{[^']+\})'/i);
      if (dataModels) {
        try {
          const parsed = JSON.parse(dataModels[1]);
          for (const raw of parsed.models || []) {
            const short = shortTeslaModel(String(raw).replace(/^model/i, ""));
            if (!short || seenModels.has(short)) continue;
            seenModels.add(short);
            models.push(short);
          }
        } catch {
          /* ignore */
        }
      }
    }

    // Detail / Video / Photo / related article buttons under each feature
    const links = [];
    const seenHref = new Set();
    const linkRe =
      /<a class="button[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let lm;
    while ((lm = linkRe.exec(body))) {
      const href = absUrl(lm[1]);
      const label = stripTags(lm[2]);
      if (!href || !label || seenHref.has(href)) continue;
      // Skip in-page nav chrome that sometimes appears in markup
      if (/^(release notes|statistics|all statistics|all car updates|more news)$/i.test(label)) {
        continue;
      }
      seenHref.add(href);
      links.push({ title: label, url: href });
    }

    // Also capture nested undocumented h3 subsections as separate notes? Keep in description.
    const categories = categorize(title, description);

    features.push({
      id: featureId || `${version}-${title.toLowerCase().replace(/\W+/g, "-")}`,
      title,
      type,
      description,
      image,
      imageDark,
      links,
      availability,
      models,
      categories,
      primaryCategory: categories[0],
    });
  }

  // Fallback: if page has no structured sections, try overview headings
  if (features.length === 0) {
    const overviewRe =
      /<h3 class="mod-update-overview-feature-heading">([\s\S]*?)<\/h3>\s*<div class="mod-update-overview-feature-description">([\s\S]*?)<\/div>/gi;
    let om;
    while ((om = overviewRe.exec(html))) {
      const title = stripTags(om[1]);
      const description = stripTags(om[2]);
      if (isExcludedTeslaFeature({ title, description })) continue;
      const categories = categorize(title, description);
      features.push({
        id: `${version}-${title.toLowerCase().replace(/\W+/g, "-")}`,
        title,
        type: "overview",
        description,
        image: null,
        imageDark: null,
        links: [],
        categories,
        primaryCategory: categories[0],
      });
    }
  }

  return {
    version,
    url: `${BASE}/software-updates/version/${version}/release-notes`,
    releaseDate,
    features,
  };
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  console.log("Fetching history…");
  const historyHtml = await fetchText(HISTORY);
  const historyVersions = listVersionsFromHistory(historyHtml);
  let sitemapVersions = [];
  try {
    const sitemapHtml = await fetchText(`${BASE}/sitemap.xml`);
    sitemapVersions = listReleaseNoteVersions(sitemapHtml);
  } catch (err) {
    console.warn(`Sitemap index skipped: ${err.message}`);
  }
  const versions = mergeReleaseVersions(historyVersions, sitemapVersions);
  console.log(
    `Found ${versions.length} OTA versions (${historyVersions.length} on history, ${sitemapVersions.length} in sitemap)`
  );

  let done = {};
  if (existsSync(CHECKPOINT)) {
    try {
      done = JSON.parse(readFileSync(CHECKPOINT, "utf8"));
      console.log(`Resuming with ${Object.keys(done).length} cached pages`);
    } catch {
      done = {};
    }
  }

  const refreshLatest = Math.max(
    0,
    Number.parseInt(process.env.REFRESH_LATEST || "0", 10) || 0
  );
  const pending = pendingWithRefresh(versions, (v) => Boolean(done[v]), refreshLatest);
  console.log(
    `Fetching ${pending.length} release-note pages${refreshLatest ? ` (refresh latest ${refreshLatest})` : ""}…`
  );

  let completed = 0;
  await mapPool(pending, CONCURRENCY, async (version) => {
    try {
      await sleep(DELAY_MS);
      const html = await fetchText(
        `${BASE}/software-updates/version/${version}/release-notes`
      );
      done[version] = parseReleaseNotes(version, html);
      completed++;
      if (completed % 10 === 0 || completed === pending.length) {
        writeFileSync(CHECKPOINT, JSON.stringify(done));
        console.log(`  ${completed}/${pending.length} scraped`);
      }
    } catch (err) {
      console.error(`  Failed ${version}: ${err.message}`);
      done[version] = {
        version,
        url: `${BASE}/software-updates/version/${version}/release-notes`,
        releaseDate: null,
        features: [],
        error: err.message,
      };
    }
  });

  const releases = versions
    .map((v) => done[v])
    .filter(Boolean)
    .map((r) => ({
      ...r,
      features: withoutExcludedTeslaFeatures(r.features),
    }));
  const allFeatures = releases.flatMap((r) =>
    r.features.map((f) => ({
      ...f,
      version: r.version,
      releaseDate: r.releaseDate,
      releaseUrl: r.url,
    }))
  );

  const categoryCounts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const f of allFeatures) {
    for (const c of f.categories) {
      if (categoryCounts[c] != null) categoryCounts[c]++;
    }
  }

  let payload = {
    source: HISTORY,
    scrapedAt: new Date().toISOString(),
    categories: CATEGORIES,
    categoryCounts,
    releaseCount: releases.length,
    featureCount: allFeatures.length,
    releases,
    features: allFeatures,
  };

  const previous = existsSync(OUT)
    ? (() => {
        try {
          return JSON.parse(readFileSync(OUT, "utf8"));
        } catch {
          return null;
        }
      })()
    : null;

  try {
    const { attachElectrekHistorical, retainElectrekFeatures } = await import(
      "./scrape-electrek-tesla.mjs"
    );
    // SKIP_ELECTREK skips a live Electrek fetch only — cache merge always runs
    // so 2012–2016 cards are not wiped by incremental NotaTeslaApp scrapes.
    payload = await attachElectrekHistorical(payload, {
      allowFetch: process.env.SKIP_ELECTREK !== "1",
    });
    payload = retainElectrekFeatures(previous, payload);
  } catch (err) {
    console.warn(`Electrek historical merge skipped: ${err.message}`);
    payload = retainElectrekFromPrevious(previous, payload);
  }

  try {
    const model3 = await import("./tesla-model-3-2017-2019.mjs");
    payload = model3.mergeModel3Historical(model3.loadModel3Cache(), payload);
    payload = model3.retainModel3Historical(previous, payload);
    const modelSX = await import("./tesla-model-s-x-2012-2019.mjs");
    payload = modelSX.mergeModelSXHistorical(modelSX.loadModelSXCache(), payload);
    payload = modelSX.retainModelSXHistorical(previous, payload);
    const { combineElectrekSxDuplicates } = await import("./electrek-sx-dedupe.mjs");
    payload = combineElectrekSxDuplicates(payload);
  } catch (err) {
    console.warn(`Tesla historical S/X/3 merge skipped: ${err.message}`);
  }

  writePayloadIfChanged(OUT, payload);
  writeFileSync(CHECKPOINT, JSON.stringify(done));
  console.log(
    `Wrote ${OUT} — ${payload.releaseCount} releases, ${payload.featureCount} features${
      payload.contentUnchanged ? " (unchanged)" : ""
    }${payload.electrek ? ` (+${payload.electrek.addedFeatures} historical)` : ""}`
  );
}

const isDirectRun =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
