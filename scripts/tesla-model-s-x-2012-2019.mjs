#!/usr/bin/env node
/**
 * Import Tesla Model S / Model X SOP and OTA features (2012–2019).
 *
 * Usage: node scripts/tesla-model-s-x-2012-2019.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeTeslaFeatureTags } from "./category-aliases.mjs";
import {
  parseCsv,
  formatReleaseDate,
  availabilityFromCaveat,
} from "./tesla-model-3-2017-2019.mjs";
import { combineElectrekSxDuplicates } from "./electrek-sx-dedupe.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const CSV = join(DATA, "tesla-model-s-x-2012-2019.csv");
const CACHE = join(DATA, "tesla-model-s-x-2012-2019-features.json");
const MANIFEST = join(DATA, "tesla-model-s-x-2012-2019-image-manifest.json");
const AUDIT = join(DATA, "tesla-model-s-x-2012-2019-import-audit.json");
const RELEASES = join(DATA, "releases.json");

export const SOURCE = "tesla-model-s-x-2012-2019";
export const SOURCE_LABEL =
  "Tesla Model S/X historical SOP/OTA feature list (2012–2019)";
export const MODEL3_SOURCE = "tesla-model-3-2017-2019";

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

/** Exact name → primary first. Only existing taxonomy names. */
const CATEGORY_BY_FEATURE = {
  "85-kWh battery and 265-mile EPA-rated range": ["Range / Charging / Energy"],
  "17-inch touchscreen and digital instrument cluster": [
    "Display",
    "UI / Visualization",
  ],
  "Adjustable steering, regenerative braking, and suspension settings": [
    "Vehicle Control",
  ],
  "App Launcher": ["UI / Visualization"],
  "Auto-presenting door handles": ["Vehicle Control"],
  "Calling from Maps": ["Phone Call", "Map / Navigation / Trip / Route"],
  "HomeLink location awareness": ["Vehicle Control"],
  "Improved throttle response": ["Performance"],
  "Release Notes on the touchscreen": ["Service / Support", "Onboarding / Tutorial"],
  "Steering-wheel controls for fan speed and sunroof": [
    "Comfort / Climate",
    "Vehicle Control",
  ],
  "Synchronized Door Handles": ["Vehicle Control"],
  "USB Media Browsing": ["Audio", "Media / Entertainment"],
  "Vehicle Sleep": ["Vehicle OS"],
  "Voice Commands": ["Voice & AI"],
  "Supercharger enablement": ["Range / Charging / Energy"],
  "Creep setting": ["Vehicle Control"],
  "Driver Profiles": ["Profile"],
  "Rated-range estimate": ["Range / Charging / Energy"],
  "17-inch touchscreen and connected infotainment": [
    "Display",
    "Media / Entertainment",
  ],
  "Battery and range choices": ["Range / Charging / Energy"],
  "Over-the-air software update capability": ["Vehicle OS"],
  "Charging-anomaly protection": ["Range / Charging / Energy", "Safety / Emergency"],
  "Heading-up map orientation": ["Map / Navigation / Trip / Route"],
  "Wi-Fi connectivity": ["Connectivity"],
  "Energy-saving mode while parked": ["Range / Charging / Energy", "Scenario / Mode"],
  "Radio presets on steering-wheel controls": ["Audio"],
  "Screen Cleaning Mode": ["Scenario / Mode", "Display"],
  "Tow Mode": ["Trailering", "Scenario / Mode"],
  "Automatic charge-current reduction": ["Range / Charging / Energy"],
  "Display energy-saving mode": ["Display", "Range / Charging / Energy"],
  "Driver-profile seat-heater settings": ["Profile", "Comfort / Climate"],
  "Improved map and navigation interaction": ["Map / Navigation / Trip / Route"],
  "Range-calculation refinement": ["Range / Charging / Energy"],
  "Screen Cleaning Mode and Tow Mode": ["Scenario / Mode", "Trailering"],
  "TPMS sensor reset after wheel changes": ["Vehicle Control"],
  "Wiper Service Mode": ["Service / Support", "Vehicle Control"],
  "Regen limitation warning": ["Vehicle Control", "Range / Charging / Energy"],
  "Sleep Mode removal": ["Vehicle OS"],
  "Contact sorting": ["Phone Call", "Productivity"],
  "Two-level front defrost": ["Comfort / Climate"],
  "Wall-power battery support and improved battery heating": [
    "Range / Charging / Energy",
    "Comfort / Climate",
  ],
  "Scheduled charging": ["Range / Charging / Energy"],
  "Charge-limit slider": ["Range / Charging / Energy"],
  "Supercharger locations on maps": [
    "Map / Navigation / Trip / Route",
    "Range / Charging / Energy",
  ],
  "Wi-Fi and tethering": ["Connectivity"],
  "Configurable sleep/energy-saving behavior": ["Vehicle OS", "Range / Charging / Energy"],
  "Owner's Manual on touchscreen": ["Onboarding / Tutorial", "Service / Support"],
  "Autopilot hardware package": ["Autopilot / Full Self-Driving"],
  "Initial Lane Departure Warning and Speed Assist capability": [
    "Safety / Emergency",
    "Autopilot / Full Self-Driving",
  ],
  "Cold-weather battery indication": ["Range / Charging / Energy"],
  "Expanded Smart Air Suspension controls": ["Vehicle Control"],
  "Hill Start Assist": ["Vehicle Control"],
  "Home, Work, and Favorite navigation locations": [
    "Map / Navigation / Trip / Route",
  ],
  "Improved range calculations": ["Range / Charging / Energy"],
  "Personalized Internet Music": ["Audio", "Media / Entertainment"],
  "Supercharger and Visited Charger map display": [
    "Map / Navigation / Trip / Route",
    "Range / Charging / Energy",
  ],
  "Calendar app (Beta)": ["Productivity"],
  "Location-Based Smart Air Suspension": ["Vehicle Control"],
  "Power Management Options": ["Vehicle OS"],
  "Remote Start from Tesla Mobile App": ["Mobile App"],
  "Traffic-Based Commute Advice": ["Map / Navigation / Trip / Route"],
  "Traffic-Based Navigation (Beta)": ["Map / Navigation / Trip / Route"],
  "Vehicle Name": ["Profile"],
  "Model S 70D dual-motor AWD and standard Supercharging": [
    "Performance",
    "Range / Charging / Energy",
  ],
  "Model S P90D 90-kWh battery and Ludicrous Mode": ["Performance"],
  "Falcon Wing rear doors": ["Vehicle Control", "Interior Cabin"],
  "HEPA cabin filtration and Bioweapon Defense Mode": [
    "Comfort / Climate",
    "Scenario / Mode",
  ],
  "Model X active-safety and Autopilot sensor suite": [
    "Autopilot / Full Self-Driving",
    "Safety / Emergency",
  ],
  "Panoramic windshield and three-row seating": ["Interior Cabin"],
  "Launch Mode": ["Performance"],
  "Forward Collision Warning and Auto High Beam": [
    "Safety / Emergency",
    "Lighting",
  ],
  "Traffic-Aware Cruise Control": ["Autopilot / Full Self-Driving"],
  "Trip Energy Prediction and energy-use chart": ["Range / Charging / Energy"],
  "Automatic Emergency Braking": ["Safety / Emergency"],
  "Blind Spot Warning": ["Safety / Emergency", "Autopilot / Full Self-Driving"],
  "Range Assurance": ["Range / Charging / Energy", "Map / Navigation / Trip / Route"],
  "Supercharger Trip Planner": [
    "Map / Navigation / Trip / Route",
    "Range / Charging / Energy",
  ],
  "Valet Mode": ["Security", "Scenario / Mode"],
  "Automatic Emergency Steering and Side Collision Warning": [
    "Safety / Emergency",
    "Autopilot / Full Self-Driving",
  ],
  "Automatic Lane Change": ["Autopilot / Full Self-Driving"],
  Autopark: ["Autopilot / Full Self-Driving"],
  Autosteer: ["Autopilot / Full Self-Driving"],
  "Autopilot, Autosteer and Autopark hardware/features": [
    "Autopilot / Full Self-Driving",
  ],
  "HEPA cabin air filtration": ["Comfort / Climate"],
  "Self-presenting driver door": ["Vehicle Control"],
  "2016 facelift front fascia and LED headlights": ["Lighting"],
  "HEPA filtration and Bioweapon Defense Mode availability": [
    "Comfort / Climate",
    "Scenario / Mode",
  ],
  "Higher-power onboard charger": ["Range / Charging / Energy"],
  "Autosteer restrictions and improvements": ["Autopilot / Full Self-Driving"],
  "Display Auto-Brightness": ["Display"],
  "Enhanced Autopilot visualization": [
    "UI / Visualization",
    "Autopilot / Full Self-Driving",
  ],
  "HomeLink auto-open/close": ["Vehicle Control"],
  "Perpendicular Autopark": ["Autopilot / Full Self-Driving"],
  "Summon Beta": ["Autopilot / Full Self-Driving"],
  "Traffic-Aware Cruise Control improvements": ["Autopilot / Full Self-Driving"],
  "Driver-profile-linked Creep setting": ["Profile", "Vehicle Control"],
  "Autopilot, Summon and Autopark improvements": ["Autopilot / Full Self-Driving"],
  "One-touch closure of doors and rear hatch": ["Vehicle Control"],
  "Second-row seat touchscreen controls": ["Interior Cabin", "Comfort / Climate"],
  "Falcon Wing obstacle-response improvement": ["Vehicle Control", "Safety / Emergency"],
  "Supercharger amenities": ["Range / Charging / Energy"],
  "Autopilot safety and traffic improvements": ["Autopilot / Full Self-Driving"],
  "Cabin Overheat Protection": ["Comfort / Climate", "Safety / Emergency"],
  "Faster Falcon Wing doors": ["Vehicle Control"],
  "Improved automatic front-door functionality": ["Vehicle Control"],
  "Improved regenerative braking on all-wheel-drive vehicles": ["Vehicle Control"],
  "Improved voice commands": ["Voice & AI"],
  "Major touchscreen user-interface redesign": ["UI / Visualization"],
  "Navigation and map improvements": ["Map / Navigation / Trip / Route"],
  "Revamped media player": ["Media / Entertainment", "Audio"],
  "Second-generation Autopilot sensor suite": ["Autopilot / Full Self-Driving"],
  "Chill and Easy Entry carried forward": ["Performance", "Profile"],
  "Chill acceleration mode": ["Performance", "Vehicle Control"],
  "Easy Entry": ["Profile", "Vehicle Control"],
  "Adjustable HomeLink activation distance": ["Vehicle Control"],
  "Automatic emergency braking for AP2.5": ["Safety / Emergency"],
  "Extended climate control while parked": ["Comfort / Climate", "Scenario / Mode"],
  "17-inch touchscreen, navigation, OTA software, and Autopilot suite": [
    "Display",
    "Autopilot / Full Self-Driving",
  ],
  "Remote frunk and trunk opening in Tesla mobile app": ["Mobile App"],
  "Improved MCU performance and navigation-map update path": [
    "Vehicle OS",
    "Map / Navigation / Trip / Route",
  ],
  "New navigation presentation and vector maps": [
    "Map / Navigation / Trip / Route",
    "UI / Visualization",
  ],
  "Application Launcher with Calendar, Energy, and Web Browser": [
    "UI / Visualization",
    "Productivity",
  ],
  Dashcam: ["Camera"],
  "Navigate on Autopilot (Beta)": [
    "Autopilot / Full Self-Driving",
    "Map / Navigation / Trip / Route",
  ],
  "Version 9 user interface": ["UI / Visualization"],
  "PIN to Drive": ["Security"],
  "Introducing new Navigation (Beta)": ["Map / Navigation / Trip / Route"],
  "Keep Climate On": ["Scenario / Mode", "Comfort / Climate"],
  "Raven adaptive suspension": ["Vehicle Control", "Performance"],
  "Raven powertrain, range, and charging improvements": [
    "Performance",
    "Range / Charging / Energy",
  ],
  "Adaptive Suspension Damping improvements": ["Vehicle Control"],
  "Camp Mode": ["Scenario / Mode", "Comfort / Climate"],
  "Smart Summon (Beta) regional expansion": [
    "Autopilot / Full Self-Driving",
    "Mobile App",
  ],
  "Dog Mode improvements": ["Comfort / Climate", "Scenario / Mode"],
  "Lock Confirmation Sound": ["Security", "Audio"],
  "Driving Visualization Improvements": [
    "UI / Visualization",
    "Autopilot / Full Self-Driving",
  ],
  "Ludicrous Mode Acceleration": ["Performance"],
  "Power Increase": ["Performance"],
  "Smart Summon (Beta)": ["Autopilot / Full Self-Driving", "Mobile App"],
  "Summon with Key Fob": ["Autopilot / Full Self-Driving"],
  "Conditional Speed Limits": ["Autopilot / Full Self-Driving"],
  "Emergency Lane Departure Avoidance": [
    "Safety / Emergency",
    "Autopilot / Full Self-Driving",
  ],
  "Lane Departure Avoidance": ["Safety / Emergency", "Autopilot / Full Self-Driving"],
  "Raven driving dynamics": ["Vehicle Control", "Performance"],
  "Web browser": ["Media / Entertainment"],
  "Wheel Configuration": ["Vehicle Control", "Range / Charging / Energy"],
};

export function normalizeFeatureTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/\bbeta\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeVersion(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function modelsFromRow(row) {
  const models = [];
  if (String(row.model_s).toLowerCase() === "true") models.push("S");
  if (String(row.model_x).toLowerCase() === "true") models.push("X");
  if (String(row.model_3).toLowerCase() === "true") models.push("3");
  return models;
}

export function displayVersion(type, version, date) {
  const v = String(version || "").trim();
  if (String(type).toUpperCase() === "SOP" && /^sop$/i.test(v)) {
    return `SOP / ${date}`;
  }
  return v;
}

export function categoriesForFeature(name) {
  const mapped = CATEGORY_BY_FEATURE[name];
  if (!mapped?.length) {
    throw new Error(`No category mapping for feature: ${name}`);
  }
  return normalizeTeslaFeatureTags({
    categories: mapped,
    primaryCategory: mapped[0],
  }).categories;
}

function csvRecords(csvText) {
  const rows = parseCsv(csvText);
  const header = rows[0].map((h) => String(h).trim());
  return rows.slice(1).map((r) =>
    Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""]))
  );
}

function nestedCard(f) {
  return {
    id: f.id,
    title: f.title,
    type: f.type,
    description: f.description,
    image: f.image ?? null,
    imageDark: f.imageDark ?? null,
    links: f.links || [],
    availability: f.availability || null,
    models: f.models,
    categories: f.categories,
    primaryCategory: f.primaryCategory,
    source: SOURCE,
    canonicalFeatureKey: f.canonicalFeatureKey,
  };
}

function recount(payload) {
  const features = payload.features || [];
  const categoryCounts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const f of features) {
    for (const c of f.categories || []) {
      if (categoryCounts[c] != null) categoryCounts[c]++;
    }
  }
  return {
    ...payload,
    categories: payload.categories || CATEGORIES,
    categoryCounts,
    featureCount: features.length,
    releaseCount: (payload.releases || []).length,
  };
}

function mergeLinks(target, incoming = []) {
  const seen = new Set(target.map((l) => l.url));
  for (const link of incoming) {
    if (!link?.url || seen.has(link.url)) continue;
    seen.add(link.url);
    target.push({ title: link.title || "Source", url: link.url });
  }
}

export function rowsToPayload(records) {
  const features = [];
  const releasesMap = new Map();
  const used = new Set();

  for (const row of records) {
    const kind = String(row.type || "").trim();
    const rawVersion = String(row.version_or_sop || "").trim();
    const title = String(row.feature_name || "").trim();
    const notes = String(row.detailed_release_notes || "").trim();
    const caveat = String(row.scope_eligibility_caveat || "").trim();
    const sourceUrl = String(row.source_url || "").trim();
    const releaseDate = formatReleaseDate(row.approx_release_date);
    const version = displayVersion(kind, rawVersion, releaseDate);
    const models = modelsFromRow(row);
    if (!kind || !version || !title || !notes || !models.length) {
      throw new Error(`Incomplete S/X source row ${row.source_row || "?"}: ${title}`);
    }
    const categories = categoriesForFeature(title);
    const description = caveat ? `${notes}\n\n${caveat}` : notes;
    let id = String(row.feature_id || "").trim();
    if (!id) {
      throw new Error(`Missing feature_id for ${title}`);
    }
    if (used.has(id)) {
      throw new Error(`Duplicate feature_id ${id}`);
    }
    used.add(id);
    const feature = {
      id,
      title,
      type: kind.toLowerCase() === "sop" ? "sop" : "ota",
      description,
      image: null,
      imageDark: null,
      links: sourceUrl ? [{ title: "Source", url: sourceUrl }] : [],
      availability: availabilityFromCaveat(caveat),
      models,
      categories,
      primaryCategory: categories[0],
      source: SOURCE,
      version,
      releaseDate,
      releaseUrl: sourceUrl || null,
      year: Number(row.year) || null,
      importKind: kind,
      canonicalFeatureKey: String(row.canonical_feature_key || "").trim(),
      modelCoverage: String(row.model_coverage || "").trim(),
      sharedWithModel3: /^yes$/i.test(row.shared_with_model_3),
      sourceRow: Number(row.source_row) || null,
    };
    features.push(feature);

    if (!releasesMap.has(version)) {
      releasesMap.set(version, {
        version,
        url: sourceUrl || "",
        releaseDate,
        features: [],
        source: SOURCE,
      });
    }
    releasesMap.get(version).features.push(nestedCard(feature));
  }

  return {
    source: SOURCE,
    sourceFile: "data/tesla-model-s-x-2012-2019.csv",
    scrapedAt: new Date().toISOString(),
    featureCount: features.length,
    releaseCount: releasesMap.size,
    releases: [...releasesMap.values()],
    features,
  };
}

export function findExactModel3Match(sxFeature, model3Features) {
  if (!sxFeature?.sharedWithModel3) return null;
  const title = normalizeFeatureTitle(sxFeature.title);
  const version = normalizeVersion(sxFeature.version);
  const matches = (model3Features || []).filter(
    (f) =>
      f.source === MODEL3_SOURCE &&
      normalizeFeatureTitle(f.title) === title &&
      normalizeVersion(f.version) === version
  );
  return matches[0] || null;
}

export function classifyAgainstModel3(sxFeatures, model3Features) {
  const enriched = [];
  const keptSeparate = [];
  const rejected = [];
  for (const f of sxFeatures) {
    if (!f.sharedWithModel3) continue;
    const exact = findExactModel3Match(f, model3Features);
    if (exact) {
      enriched.push({
        sxId: f.id,
        model3Id: exact.id,
        title: f.title,
        version: f.version,
      });
      continue;
    }
    const nameHits = (model3Features || []).filter(
      (m) =>
        m.source === MODEL3_SOURCE &&
        normalizeFeatureTitle(m.title) === normalizeFeatureTitle(f.title)
    );
    if (nameHits.length) {
      rejected.push({
        sxId: f.id,
        title: f.title,
        sxVersion: f.version,
        model3Ids: nameHits.map((m) => m.id),
        model3Versions: nameHits.map((m) => m.version),
        reason: "same feature name, different version or release semantics",
      });
    }
    keptSeparate.push({
      sxId: f.id,
      title: f.title,
      version: f.version,
      reason: nameHits.length
        ? "S/X/3 marked but not an exact version match"
        : "S/X/3 marked; no Model 3 record with the same feature identity",
    });
  }
  return { enriched, keptSeparate, rejected };
}

export function loadModelSXCache() {
  if (!existsSync(CACHE)) return null;
  try {
    return JSON.parse(readFileSync(CACHE, "utf8"));
  } catch {
    return null;
  }
}

function revertSx3Enrichment(feature) {
  if (!feature?.sx3Enriched) return feature;
  const links = (feature.links || []).filter(
    (l) => !(feature.sx3EnrichedUrls || []).includes(l.url)
  );
  const sourceRecords = (feature.sourceRecords || []).filter(
    (s) => s.source !== SOURCE
  );
  const restored = {
    ...feature,
    models: feature.modelsBeforeSx3 || ["3"],
    links,
    sourceRecords: sourceRecords.length ? sourceRecords : undefined,
  };
  delete restored.sx3Enriched;
  delete restored.modelsBeforeSx3;
  delete restored.sx3EnrichedUrls;
  if (!restored.sourceRecords) delete restored.sourceRecords;
  return restored;
}

export function stripModelSXHistorical(payload) {
  if (!payload) return payload;
  const features = (payload.features || [])
    .filter((f) => f.source !== SOURCE)
    .map(revertSx3Enrichment);
  const releases = (payload.releases || [])
    .map((rel) => {
      const feats = (rel.features || [])
        .filter((f) => f.source !== SOURCE)
        .map(revertSx3Enrichment);
      if (rel.source === SOURCE && !feats.length) return null;
      if (feats.length === (rel.features || []).length && rel.source !== SOURCE) {
        return { ...rel, features: feats };
      }
      return { ...rel, features: feats };
    })
    .filter(Boolean);
  return recount({ ...payload, features, releases });
}

function enrichModel3Feature(existing, incoming) {
  const modelsBeforeSx3 = existing.modelsBeforeSx3 || [
    ...(existing.models || ["3"]),
  ];
  const models = [...new Set([...modelsBeforeSx3, ...incoming.models])];
  const links = [...(existing.links || [])];
  const incomingUrls = (incoming.links || []).map((l) => l.url).filter(Boolean);
  mergeLinks(links, incoming.links);
  const sourceRecords = [
    ...((existing.sourceRecords || []).filter((s) => s.source !== SOURCE)),
    {
      id: incoming.id,
      source: SOURCE,
      version: incoming.version,
      releaseDate: incoming.releaseDate,
      url: incoming.releaseUrl,
      title: incoming.title,
      description: incoming.description,
      models: incoming.models,
      canonicalFeatureKey: incoming.canonicalFeatureKey,
    },
  ];
  return {
    ...existing,
    models,
    modelsBeforeSx3,
    sx3Enriched: true,
    sx3EnrichedUrls: incomingUrls,
    canonicalFeatureKey:
      existing.canonicalFeatureKey || incoming.canonicalFeatureKey,
    sourceRecords,
    links,
  };
}

function upsertNested(rel, feature) {
  const feats = [...(rel.features || [])];
  const idx = feats.findIndex((x) => x.id === feature.id);
  const card = feature.source === SOURCE ? nestedCard(feature) : {
    ...feats[idx],
    models: feature.models,
    links: feature.links,
    sourceRecords: feature.sourceRecords,
    sx3Enriched: feature.sx3Enriched,
    canonicalFeatureKey: feature.canonicalFeatureKey,
  };
  if (idx >= 0) feats[idx] = { ...feats[idx], ...card };
  else feats.push(card);
  rel.features = feats;
}

export function mergeModelSXHistorical(sxPayload, releasesData) {
  if (!releasesData || !sxPayload?.features?.length) return releasesData;
  const base = stripModelSXHistorical(releasesData);
  const features = [...(base.features || [])];
  const releases = [...(base.releases || [])];
  const byId = new Map(features.map((f, i) => [f.id, i]));
  const byVersion = new Map(releases.map((r) => [String(r.version), r]));
  const model3 = features.filter((f) => f.source === MODEL3_SOURCE);
  const audit = classifyAgainstModel3(sxPayload.features, model3);
  const enrichedIds = new Set(audit.enriched.map((e) => e.sxId));
  const newFeatures = [];

  for (const f of sxPayload.features) {
    if (enrichedIds.has(f.id)) {
      const match = findExactModel3Match(f, model3);
      const idx = byId.get(match.id);
      const updated = enrichModel3Feature(features[idx], f);
      features[idx] = updated;
      const rel = byVersion.get(String(updated.version));
      if (rel) upsertNested(rel, updated);
      continue;
    }
    if (byId.has(f.id)) continue;
    newFeatures.push({ ...f, source: SOURCE });
    byId.set(f.id, features.length);
    features.push({ ...f, source: SOURCE });
    let rel = byVersion.get(String(f.version));
    if (!rel) {
      rel = {
        version: f.version,
        url: f.releaseUrl || "",
        releaseDate: f.releaseDate,
        features: [],
        source: SOURCE,
      };
      releases.push(rel);
      byVersion.set(String(f.version), rel);
    }
    upsertNested(rel, f);
  }

  return recount({
    ...base,
    features,
    releases,
    sources: [
      ...new Set([
        ...(base.sources || [base.source].filter(Boolean)),
        SOURCE_LABEL,
      ]),
    ],
    modelSXHistorical: {
      source: SOURCE,
      sourceRows: sxPayload.features.length,
      addedFeatures: newFeatures.length,
      enrichedModel3: audit.enriched,
      keptSeparate: audit.keptSeparate,
      rejectedExactMerge: audit.rejected,
    },
  });
}

export function retainModelSXHistorical(
  previous,
  next,
  cache = loadModelSXCache()
) {
  if (!next) return next;
  const has = (next.features || []).some((f) => f.source === SOURCE);
  if (has) return next;
  if (cache?.features?.length) return mergeModelSXHistorical(cache, next);
  const prevFeat = (previous?.features || []).filter((f) => f.source === SOURCE);
  if (!prevFeat.length) return next;
  return mergeModelSXHistorical(
    {
      features: prevFeat,
      releases: (previous.releases || []).filter((r) => r.source === SOURCE),
    },
    next
  );
}

export function imageManifestFromPayload(payload, skipIds = new Set()) {
  return {
    generatedAt: new Date().toISOString(),
    reviewStatusDefault: "needs-review",
    rows: (payload.features || [])
      .filter((f) => !skipIds.has(f.id))
      .map((f) => ({
        featureId: f.id,
        title: f.title,
        imagePath: null,
        imageUrl: null,
        secondaryImagePath: null,
        secondaryImageUrl: null,
        altText: f.title,
        source: null,
        credit: null,
        license: null,
        confidence: "none",
        reviewStatus: "needs-review",
        notes: "No verified feature-specific image; using existing placeholder.",
      })),
  };
}

export function importFromCsv(csvText = readFileSync(CSV, "utf8")) {
  const records = csvRecords(csvText);
  if (records.length !== 150) {
    throw new Error(`Expected 150 Feature-Level List rows, got ${records.length}`);
  }
  const sop = records.filter((r) => r.type === "SOP").length;
  const ota = records.filter((r) => r.type === "OTA").length;
  if (sop !== 25 || ota !== 125) {
    throw new Error(`Expected 25 SOP / 125 OTA, got ${sop} SOP / ${ota} OTA`);
  }
  return rowsToPayload(records);
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return resolve(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  mkdirSync(DATA, { recursive: true });
  const payload = importFromCsv();
  writeFileSync(CACHE, JSON.stringify(payload, null, 2));
  const current = JSON.parse(readFileSync(RELEASES, "utf8"));
  const first = combineElectrekSxDuplicates(
    mergeModelSXHistorical(payload, current)
  );
  const second = combineElectrekSxDuplicates(
    mergeModelSXHistorical(payload, first)
  );
  const sxIds = (p) =>
    (p.features || [])
      .filter((f) => f.source === SOURCE)
      .map((f) => f.id)
      .sort();
  const audit = first.modelSXHistorical;
  if (audit.sourceRows !== 150) {
    throw new Error(`Expected 150 source rows, got ${audit.sourceRows}`);
  }
  if (sxIds(first).length + audit.enrichedModel3.length !== 150) {
    throw new Error(
      `Coverage mismatch: ${sxIds(first).length} added + ${audit.enrichedModel3.length} enriched`
    );
  }
  if (sxIds(first).join() !== sxIds(second).join()) {
    throw new Error("Import is not idempotent");
  }
  const skip = new Set(audit.enrichedModel3.map((e) => e.sxId));
  writeFileSync(MANIFEST, JSON.stringify(imageManifestFromPayload(payload, skip), null, 2));
  writeFileSync(AUDIT, JSON.stringify(audit, null, 2));
  writeFileSync(RELEASES, JSON.stringify(first, null, 2));
  console.log(
    `Imported ${audit.addedFeatures} Model S/X features; enriched ${audit.enrichedModel3.length} Model 3 records`
  );
}
